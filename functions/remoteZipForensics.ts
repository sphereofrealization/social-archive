import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { zipUrl } = body;
    
    if (!zipUrl) {
      return Response.json({ error: 'Missing zipUrl' }, { status: 400 });
    }

    console.log('[remoteZipForensics] Starting forensic analysis for:', zipUrl);

    const report = {
      url: zipUrl,
      timestamp: new Date().toISOString(),
      
      // A) Connectivity + headers
      connectivity: {
        head: {},
        rangeProbe: {}
      },
      
      // B) First bytes check
      firstBytes: {},
      
      // C) EOCD tail scan
      eocdScan: {},
      
      // D) Central directory parsing
      centralDirectory: {},
      
      // E) Crash data if parsing fails
      parsingError: null,
      
      // TASK 2 - File tree cross-check
      fileTreeCheck: {},
      
      // TASK 3 - Media extraction test
      mediaExtractionTest: {}
    };

    // ========== A) CONNECTIVITY + HEADERS ==========
    console.log('[remoteZipForensics] A) Testing connectivity...');
    
    let headResponse;
    try {
      headResponse = await fetch(zipUrl, { method: 'HEAD', redirect: 'follow' });
      report.connectivity.head = {
        headStatus: headResponse.status,
        finalUrl: headResponse.url,
        contentLength: parseInt(headResponse.headers.get('content-length') || '0'),
        contentType: headResponse.headers.get('content-type'),
        acceptRanges: headResponse.headers.get('accept-ranges'),
        etag: headResponse.headers.get('etag'),
        redirected: headResponse.url !== zipUrl
      };
    } catch (err) {
      report.connectivity.head.error = err.message;
      return Response.json({ ok: false, report });
    }

    if (!headResponse.ok) {
      return Response.json({ ok: false, error: 'HEAD request failed', report });
    }

    const contentLength = report.connectivity.head.contentLength;
    const targetUrl = report.connectivity.head.finalUrl;

    // Range probe
    try {
      const rangeProbeResponse = await fetch(targetUrl, {
        headers: { 'Range': 'bytes=0-0' }
      });
      report.connectivity.rangeProbe = {
        rangeProbeStatus: rangeProbeResponse.status,
        rangeProbeContentRange: rangeProbeResponse.headers.get('content-range'),
        rangeProbeAcceptRanges: rangeProbeResponse.headers.get('accept-ranges')
      };
    } catch (err) {
      report.connectivity.rangeProbe.error = err.message;
      return Response.json({ ok: false, report });
    }

    if (report.connectivity.rangeProbe.rangeProbeStatus !== 206) {
      return Response.json({ 
        ok: false, 
        error: `Range requests not supported (got ${report.connectivity.rangeProbe.rangeProbeStatus})`,
        report 
      });
    }

    // ========== B) FIRST BYTES CHECK ==========
    console.log('[remoteZipForensics] B) Checking first bytes...');
    
    try {
      const firstBytesResponse = await fetch(targetUrl, {
        headers: { 'Range': 'bytes=0-63' }
      });
      const firstBuffer = await firstBytesResponse.arrayBuffer();
      const firstBytes = new Uint8Array(firstBuffer);
      
      report.firstBytes = {
        status: firstBytesResponse.status,
        bytesRead: firstBytes.length,
        firstBytesHex: Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' '),
        isValidZip: firstBytes[0] === 0x50 && firstBytes[1] === 0x4b && 
                    firstBytes[2] === 0x03 && firstBytes[3] === 0x04,
        startsWithHtml: firstBytes[0] === 0x3c && firstBytes[1] === 0x68
      };
    } catch (err) {
      report.firstBytes.error = err.message;
      return Response.json({ ok: false, report });
    }

    if (!report.firstBytes.isValidZip) {
      return Response.json({ 
        ok: false, 
        error: 'Not a valid ZIP file (missing PK signature)',
        report 
      });
    }

    // ========== C) EOCD TAIL SCAN ==========
    console.log('[remoteZipForensics] C) Scanning for EOCD...');
    
    const tailSize = Math.min(262144, contentLength); // 256KB
    const tailStart = contentLength - tailSize;
    
    try {
      const tailResponse = await fetch(targetUrl, {
        headers: { 'Range': `bytes=${tailStart}-${contentLength - 1}` }
      });
      const tailBuffer = await tailResponse.arrayBuffer();
      const tailBytes = new Uint8Array(tailBuffer);
      
      report.eocdScan = {
        tailStatus: tailResponse.status,
        tailContentRange: tailResponse.headers.get('content-range'),
        tailBytesRead: tailBytes.length,
        tailLast128Hex: Array.from(tailBytes.slice(-128)).map(b => b.toString(16).padStart(2, '0')).join(' ')
      };

      // Search for EOCD signature: 50 4b 05 06
      let eocdOffset = -1;
      for (let i = tailBytes.length - 22; i >= 0; i--) {
        if (tailBytes[i] === 0x50 && tailBytes[i+1] === 0x4b && 
            tailBytes[i+2] === 0x05 && tailBytes[i+3] === 0x06) {
          eocdOffset = i;
          break;
        }
      }

      report.eocdScan.eocdFound = eocdOffset !== -1;
      report.eocdScan.eocdOffsetInTail = eocdOffset;
      report.eocdScan.eocdAbsoluteOffset = eocdOffset !== -1 ? tailStart + eocdOffset : -1;

      if (eocdOffset === -1) {
        return Response.json({ ok: false, error: 'EOCD signature not found', report });
      }

      // ========== D) PARSE EOCD & CENTRAL DIRECTORY ==========
      console.log('[remoteZipForensics] D) Parsing EOCD...');
      
      const eocdView = new DataView(tailBuffer, eocdOffset);
      const cdOffset = eocdView.getUint32(16, true);
      const cdSize = eocdView.getUint32(12, true);
      const cdEntriesExpected = eocdView.getUint16(10, true);
      const zipCommentLength = eocdView.getUint16(20, true);

      report.eocdScan.eocdParsed = {
        cdOffset,
        cdSize,
        cdEntriesExpected,
        zipCommentLength
      };

      console.log('[remoteZipForensics] EOCD parsed:', { cdOffset, cdSize, cdEntriesExpected });

      // Check for ZIP64
      if (cdEntriesExpected === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) {
        report.eocdScan.zip64Detected = true;
        console.log('[remoteZipForensics] ZIP64 detected - skipping for now');
        return Response.json({ ok: false, error: 'ZIP64 format detected (not yet supported in forensics)', report });
      }

      // Fetch central directory
      console.log('[remoteZipForensics] Fetching central directory...');
      
      const cdResponse = await fetch(targetUrl, {
        headers: { 'Range': `bytes=${cdOffset}-${cdOffset + cdSize - 1}` }
      });
      
      const cdBuffer = await cdResponse.arrayBuffer();
      
      report.centralDirectory = {
        cdFetchStatus: cdResponse.status,
        cdFetchContentRange: cdResponse.headers.get('content-range'),
        cdBytesRead: cdBuffer.byteLength,
        first64BytesHex: Array.from(new Uint8Array(cdBuffer, 0, Math.min(64, cdBuffer.byteLength)))
          .map(b => b.toString(16).padStart(2, '0')).join(' ')
      };

      // Parse central directory entries
      console.log('[remoteZipForensics] Parsing central directory entries...');
      
      let offset = 0;
      let entriesProcessed = 0;
      const first10Entries = [];
      const samplePaths = [];

      try {
        while (offset < cdBuffer.byteLength - 46 && entriesProcessed < cdEntriesExpected) {
          const entryView = new DataView(cdBuffer, offset);
          
          // Check signature: 0x02014b50
          const signature = entryView.getUint32(0, true);
          if (signature !== 0x02014b50) {
            report.parsingError = {
              entriesParsedSoFar: entriesProcessed,
              badOffset: offset,
              signatureAtBadOffsetHex: signature.toString(16).padStart(8, '0'),
              next64BytesHex: Array.from(new Uint8Array(cdBuffer, offset, Math.min(64, cdBuffer.byteLength - offset)))
                .map(b => b.toString(16).padStart(2, '0')).join(' '),
              expected: '02014b50'
            };
            break;
          }

          const fileNameLength = entryView.getUint16(28, true);
          const extraFieldLength = entryView.getUint16(30, true);
          const fileCommentLength = entryView.getUint16(32, true);
          const compressionMethod = entryView.getUint16(10, true);
          const localHeaderOffset = entryView.getUint32(42, true);

          const totalEntrySize = 46 + fileNameLength + extraFieldLength + fileCommentLength;
          
          if (offset + totalEntrySize > cdBuffer.byteLength) {
            report.parsingError = {
              entriesParsedSoFar: entriesProcessed,
              badOffset: offset,
              reason: 'Entry extends beyond buffer',
              fileNameLength,
              extraFieldLength,
              fileCommentLength,
              computedNextOffset: offset + totalEntrySize,
              bufferSize: cdBuffer.byteLength
            };
            break;
          }

          // Extract filename
          const fileNameBytes = new Uint8Array(cdBuffer, offset + 46, fileNameLength);
          const fileName = new TextDecoder('utf-8', { fatal: false }).decode(fileNameBytes);
          
          if (entriesProcessed < 10) {
            first10Entries.push({
              path: fileName,
              nameLen: fileNameLength,
              extraLen: extraFieldLength,
              commentLen: fileCommentLength,
              localHeaderOffset,
              compression: compressionMethod
            });
          }

          if (entriesProcessed < 200) {
            samplePaths.push(fileName);
          }

          offset += totalEntrySize;
          entriesProcessed++;
        }
      } catch (err) {
        report.parsingError = {
          error: err.message,
          stack: err.stack,
          entriesParsedSoFar: entriesProcessed,
          lastOffset: offset
        };
      }

      report.centralDirectory.entriesParsed = entriesProcessed;
      report.centralDirectory.first10Entries = first10Entries;
      report.centralDirectory.samplePaths = samplePaths;

    } catch (err) {
      report.eocdScan.error = err.message;
      return Response.json({ ok: false, report });
    }

    // ========== TASK 2: FILE TREE CROSS-CHECK ==========
    console.log('[remoteZipForensics] TASK 2: Checking file tree...');
    
    try {
      const fileTreeResponse = await base44.functions.invoke('getFileTree', { archiveUrl: zipUrl });
      if (fileTreeResponse.data && fileTreeResponse.data.ok) {
        const fileTree = fileTreeResponse.data.fileTree || [];
        report.fileTreeCheck = {
          fileTreeCount: fileTree.length,
          fileTreeSamplePaths: fileTree.slice(0, 50).map(f => f.path)
        };
      } else {
        report.fileTreeCheck.error = fileTreeResponse.data?.error || 'File tree extraction failed';
      }
    } catch (err) {
      report.fileTreeCheck.error = err.message;
    }

    // ========== TASK 3: MEDIA EXTRACTION TEST ==========
    console.log('[remoteZipForensics] TASK 3: Testing media extraction...');
    
    const samplePaths = report.centralDirectory.samplePaths || [];
    const jpgPath = samplePaths.find(p => /\.(jpg|jpeg)$/i.test(p));
    const mp4Path = samplePaths.find(p => /\.mp4$/i.test(p));
    
    report.mediaExtractionTest.tests = [];

    if (jpgPath) {
      try {
        const jpgResponse = await base44.functions.invoke('getArchiveEntry', { 
          archiveUrl: zipUrl, 
          entryPath: jpgPath 
        });
        
        if (jpgResponse.data) {
          const base64Data = jpgResponse.data.data || jpgResponse.data.content;
          let magicBytesHex = 'N/A';
          
          if (base64Data) {
            try {
              const binaryString = atob(base64Data.substring(0, 100));
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < Math.min(16, binaryString.length); i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              magicBytesHex = Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
            } catch (e) {
              magicBytesHex = `decode error: ${e.message}`;
            }
          }
          
          report.mediaExtractionTest.tests.push({
            entryPath: jpgPath,
            status: jpgResponse.status || 200,
            mimeType: jpgResponse.data.mimeType,
            base64Length: base64Data ? base64Data.length : 0,
            magicBytesHex
          });
        }
      } catch (err) {
        report.mediaExtractionTest.tests.push({
          entryPath: jpgPath,
          error: err.message
        });
      }
    }

    if (mp4Path) {
      try {
        const mp4Response = await base44.functions.invoke('getArchiveEntry', { 
          archiveUrl: zipUrl, 
          entryPath: mp4Path 
        });
        
        if (mp4Response.data) {
          const base64Data = mp4Response.data.data || mp4Response.data.content;
          let magicBytesHex = 'N/A';
          
          if (base64Data) {
            try {
              const binaryString = atob(base64Data.substring(0, 100));
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < Math.min(16, binaryString.length); i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              magicBytesHex = Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
            } catch (e) {
              magicBytesHex = `decode error: ${e.message}`;
            }
          }
          
          report.mediaExtractionTest.tests.push({
            entryPath: mp4Path,
            status: mp4Response.status || 200,
            mimeType: mp4Response.data.mimeType,
            base64Length: base64Data ? base64Data.length : 0,
            magicBytesHex
          });
        }
      } catch (err) {
        report.mediaExtractionTest.tests.push({
          entryPath: mp4Path,
          error: err.message
        });
      }
    }

    console.log('[remoteZipForensics] Forensic analysis complete');

    return Response.json({ 
      ok: true, 
      report,
      summary: {
        zipValid: report.firstBytes.isValidZip,
        eocdFound: report.eocdScan.eocdFound,
        entriesParsed: report.centralDirectory.entriesParsed || 0,
        expectedEntries: report.eocdScan.eocdParsed?.cdEntriesExpected || 0,
        fileTreeCount: report.fileTreeCheck.fileTreeCount || 0,
        parsingSuccessful: !report.parsingError
      }
    });
    
  } catch (error) {
    console.error('[remoteZipForensics] Unexpected error:', error);
    return Response.json({ 
      ok: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});