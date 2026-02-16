import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TIME_LIMIT_MS = 25000;
const LARGE_ZIP_THRESHOLD = 50 * 1024 * 1024; // 50MB - only use index-only mode above this

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { fileUrl, debugMode } = body;
    
    if (!fileUrl) {
      return Response.json({ error: 'Missing fileUrl' }, { status: 400 });
    }

    console.log('[extractArchiveDataStreaming] Starting extraction for:', fileUrl);

    const debug = {
      url: fileUrl,
      headStatus: null,
      contentLength: null,
      contentType: null,
      acceptRanges: null,
      etag: null,
      rangeProbeStatus: null,
      rangeProbeContentRange: null,
      firstBytesHex: null,
      tailStatus: null,
      tailContentRange: null,
      tailBytesRead: null,
      tailLast128Hex: null,
      eocdFound: false,
      eocdOffsetInTail: -1,
      zip64Detected: false,
      cdOffset: null,
      cdSize: null,
      cdEntriesExpected: null,
      cdStatus: null,
      cdContentRange: null,
      cdBytesRead: null,
      entriesParsed: 0,
      samplePaths: [],
      redirected: false,
      finalUrl: null,
      parsingError: null
    };

    // Step 1: HEAD request - file accessibility and metadata
    let headResponse;
    try {
      headResponse = await fetch(fileUrl, { method: 'HEAD', redirect: 'follow' });
      debug.headStatus = headResponse.status;
      debug.finalUrl = headResponse.url;
      debug.redirected = headResponse.url !== fileUrl;
      debug.contentLength = parseInt(headResponse.headers.get('content-length') || '0');
      debug.contentType = headResponse.headers.get('content-type');
      debug.acceptRanges = headResponse.headers.get('accept-ranges');
      debug.etag = headResponse.headers.get('etag');
      
      if (!headResponse.ok) {
        return Response.json({ 
          ok: false,
          error: `Archive not accessible: HTTP ${headResponse.status}`,
          debug
        }, { status: 400 });
      }
    } catch (err) {
      return Response.json({
        ok: false,
        error: `Network error: ${err.message}`,
        debug
      }, { status: 500 });
    }

    const contentLength = debug.contentLength;
    if (contentLength === 0) {
      return Response.json({
        ok: false,
        error: 'Archive has zero size or Content-Length header missing',
        debug
      }, { status: 400 });
    }
    
    console.log('[extractArchiveDataStreaming] File size:', contentLength, 'Accept-Ranges:', debug.acceptRanges);

    // Step 2: Range probe - verify HTTP 206 support
    const targetUrl = debug.finalUrl || fileUrl;
    let rangeTestResponse;
    try {
      rangeTestResponse = await fetch(targetUrl, {
        headers: { 'Range': 'bytes=0-0' }
      });
      debug.rangeProbeStatus = rangeTestResponse.status;
      debug.rangeProbeContentRange = rangeTestResponse.headers.get('content-range');
    } catch (err) {
      return Response.json({
        ok: false,
        error: `Range probe failed: ${err.message}`,
        debug
      }, { status: 500 });
    }
    
    if (rangeTestResponse.status !== 206) {
      return Response.json({ 
        ok: false,
        error: `Range requests not supported (got HTTP ${rangeTestResponse.status}, expected 206)`,
        details: 'Server must support HTTP Range requests for streaming extraction.',
        debug
      }, { status: 400 });
    }
    
    console.log('[extractArchiveDataStreaming] Range requests verified (HTTP 206)');

    // Step 3: Read first 64 bytes - verify ZIP signature
    let firstBytesResponse;
    try {
      firstBytesResponse = await fetch(targetUrl, {
        headers: { 'Range': 'bytes=0-63' }
      });
      const firstBuffer = await firstBytesResponse.arrayBuffer();
      const firstBytes = new Uint8Array(firstBuffer);
      debug.firstBytesHex = Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
      
      // ZIP must start with local file header: 0x504b0304
      if (firstBytes[0] !== 0x50 || firstBytes[1] !== 0x4b || 
          firstBytes[2] !== 0x03 || firstBytes[3] !== 0x04) {
        return Response.json({
          ok: false,
          error: 'Not a valid ZIP file (missing local file header signature)',
          debug
        }, { status: 400 });
      }
    } catch (err) {
      return Response.json({
        ok: false,
        error: `Failed to read ZIP header: ${err.message}`,
        debug
      }, { status: 500 });
    }

    // Step 4: Read tail (last 128KB) - locate EOCD
    const tailSize = Math.min(131072, contentLength);  // 128KB
    const tailStart = contentLength - tailSize;
    
    let tailResponse;
    try {
      tailResponse = await fetch(targetUrl, {
        headers: { 'Range': `bytes=${tailStart}-${contentLength - 1}` }
      });
      debug.tailStatus = tailResponse.status;
      debug.tailContentRange = tailResponse.headers.get('content-range');
      debug.tailBytesRead = tailSize;
    } catch (err) {
      return Response.json({
        ok: false,
        error: `Failed to read ZIP tail: ${err.message}`,
        debug
      }, { status: 500 });
    }
    
    if (!tailResponse.ok || tailResponse.status !== 206) {
      return Response.json({ 
        ok: false,
        error: `Failed to read ZIP metadata (HTTP ${tailResponse.status})`,
        debug
      }, { status: 400 });
    }

    const tailBuffer = await tailResponse.arrayBuffer();
    const tailBytes = new Uint8Array(tailBuffer);
    debug.tailLast128Hex = Array.from(tailBytes.slice(-128)).map(b => b.toString(16).padStart(2, '0')).join(' ');

    // Search for EOCD signature: 0x06054b50 (little-endian: 50 4b 05 06)
    let eocdOffset = -1;
    for (let i = tailBytes.length - 22; i >= 0; i--) {
      if (tailBytes[i] === 0x50 && tailBytes[i+1] === 0x4b && 
          tailBytes[i+2] === 0x05 && tailBytes[i+3] === 0x06) {
        eocdOffset = i;
        debug.eocdFound = true;
        debug.eocdOffsetInTail = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      return Response.json({ 
        ok: false,
        error: 'Invalid ZIP file: End-of-central-directory signature not found',
        debug
      }, { status: 400 });
    }

    // Step 5: Parse EOCD using DataView for proper little-endian
    const eocdView = new DataView(tailBuffer, eocdOffset);
    let totalEntries = eocdView.getUint16(10, true); // entry count (little-endian)
    let cdSize = eocdView.getUint32(12, true);      // central directory size
    let cdOffset = eocdView.getUint32(16, true);    // central directory offset

    debug.cdOffset = cdOffset;
    debug.cdSize = cdSize;
    debug.cdEntriesExpected = totalEntries;

    // Check for ZIP64 format
    if (totalEntries === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) {
      debug.zip64Detected = true;
      console.log('[extractArchiveDataStreaming] ZIP64 detected');
      
      // ZIP64 end-of-central-directory locator is 20 bytes before EOCD
      const zip64LocatorOffset = eocdOffset - 20;
      if (zip64LocatorOffset >= 0) {
        const locatorView = new DataView(tailBuffer, zip64LocatorOffset);
        // Verify ZIP64 locator signature: 0x07064b50
        if (locatorView.getUint32(0, true) === 0x07064b50) {
          const zip64EOCDOffset = locatorView.getUint32(8, true); // Use lower 32 bits
          
          // Fetch ZIP64 EOCD record (56 bytes minimum)
          try {
            const zip64Response = await fetch(targetUrl, {
              headers: { 'Range': `bytes=${zip64EOCDOffset}-${zip64EOCDOffset + 55}` }
            });
            
            if (zip64Response.ok && zip64Response.status === 206) {
              const zip64Buffer = await zip64Response.arrayBuffer();
              const zip64View = new DataView(zip64Buffer);
              
              // Verify ZIP64 EOCD signature: 0x06064b50
              if (zip64View.getUint32(0, true) === 0x06064b50) {
                totalEntries = zip64View.getUint32(32, true); // Use lower 32 bits
                cdSize = zip64View.getUint32(40, true);
                cdOffset = zip64View.getUint32(48, true);
                
                debug.cdOffset = cdOffset;
                debug.cdSize = cdSize;
                debug.cdEntriesExpected = totalEntries;
                
                console.log('[extractArchiveDataStreaming] ZIP64 parsed:', { totalEntries, cdSize, cdOffset });
              }
            }
          } catch (err) {
            return Response.json({
              ok: false,
              error: `ZIP64 format detected but failed to parse: ${err.message}`,
              debug
            }, { status: 400 });
          }
        }
      }
    }

    if (totalEntries === 0 || cdSize === 0) {
      return Response.json({
        ok: false,
        error: 'ZIP central directory is empty or corrupted',
        debug
      }, { status: 400 });
    }

    console.log('[extractArchiveDataStreaming] ZIP metadata:', { totalEntries, cdSize, cdOffset });

    // Step 6: Fetch central directory
    if (cdSize > 10 * 1024 * 1024) {
      console.log('[extractArchiveDataStreaming] Warning: Large central directory:', cdSize, 'bytes');
    }
    
    let cdResponse;
    try {
      cdResponse = await fetch(targetUrl, {
        headers: { 'Range': `bytes=${cdOffset}-${cdOffset + cdSize - 1}` }
      });
      debug.cdStatus = cdResponse.status;
      debug.cdContentRange = cdResponse.headers.get('content-range');
    } catch (err) {
      return Response.json({
        ok: false,
        error: `Failed to fetch central directory: ${err.message}`,
        debug
      }, { status: 500 });
    }

    if (!cdResponse.ok || cdResponse.status !== 206) {
      return Response.json({ 
        ok: false,
        error: `Failed to read ZIP central directory (HTTP ${cdResponse.status})`,
        debug
      }, { status: 400 });
    }

    const cdBuffer = await cdResponse.arrayBuffer();
    debug.cdBytesRead = cdBuffer.byteLength;
    
    console.log('[extractArchiveDataStreaming] Central directory fetched:', cdBuffer.byteLength, 'bytes');

    // Step 7: Parse central directory with robust error handling
    const fileIndex = {
      postsHtml: [], postsJson: [],
      friendsHtml: [], friendsJson: [], 
      messageThreads: [],
      commentsHtml: [], commentsJson: [],
      likesHtml: [], likesJson: [],
      groupsHtml: [], groupsJson: [],
      reviewsHtml: [], reviewsJson: [],
      marketplaceHtml: [], marketplaceJson: [],
      eventsHtml: [], eventsJson: [],
      reelsHtml: [], reelsJson: [],
      checkinsHtml: [], checkinsJson: [],
      photos: [], videos: [],
      mediaAll: [], // ALL media entries (images/videos anywhere in ZIP, including *_files folders)
      otherHtml: [],
      allPaths: []
    };

    let offset = 0;
    let entriesProcessed = 0;
    const messagesByThread = {};
    const pathSegments = new Map();

    try {
      while (offset < cdBuffer.byteLength - 46 && entriesProcessed < totalEntries) {
        const entryView = new DataView(cdBuffer, offset);
        
        // Central directory file header signature: 0x02014b50 (stored little-endian as 0x504b0102)
        const signature = entryView.getUint32(0, true);
        if (signature !== 0x02014b50) {
          console.log(`[extractArchiveDataStreaming] Bad signature at offset ${offset}: 0x${signature.toString(16)}`);
          debug.parsingError = {
            badOffset: offset,
            signatureHex: signature.toString(16).padStart(8, '0'),
            entriesParsedSoFar: entriesProcessed,
            next64BytesHex: Array.from(new Uint8Array(cdBuffer, offset, Math.min(64, cdBuffer.byteLength - offset)))
              .map(b => b.toString(16).padStart(2, '0')).join(' ')
          };
          break;
        }

        const fileNameLength = entryView.getUint16(28, true);
        const extraFieldLength = entryView.getUint16(30, true);
        const fileCommentLength = entryView.getUint16(32, true);
        const uncompressedSize = entryView.getUint32(24, true);

        // Validate lengths to prevent buffer overflow
        const headerSize = 46;
        const totalEntrySize = headerSize + fileNameLength + extraFieldLength + fileCommentLength;
        
        if (offset + totalEntrySize > cdBuffer.byteLength) {
          console.log(`[extractArchiveDataStreaming] Entry extends beyond buffer at offset ${offset}`);
          debug.parsingError = {
            badOffset: offset,
            reason: 'Entry extends beyond buffer',
            entriesParsedSoFar: entriesProcessed,
            fileNameLength,
            extraFieldLength,
            fileCommentLength,
            computedNextOffset: offset + totalEntrySize,
            bufferSize: cdBuffer.byteLength
          };
          break;
        }

        // Extract filename from ONLY the filename section
        const fileNameBytes = new Uint8Array(cdBuffer, offset + headerSize, fileNameLength);
        let fileName;
        try {
          fileName = new TextDecoder('utf-8', { fatal: false }).decode(fileNameBytes);
        } catch (err) {
          console.error(`[extractArchiveDataStreaming] Failed to decode filename at offset ${offset}:`, err);
          offset += totalEntrySize;
          entriesProcessed++;
          continue;
        }
        
        // Skip directories
        if (!fileName.endsWith('/')) {
          const pathLower = fileName.toLowerCase();
          const ext = fileName.split('.').pop()?.toLowerCase() || '';
          const entry = { path: fileName, size: uncompressedSize, name: fileName.split('/').pop(), ext };
          
          fileIndex.allPaths.push(fileName);
          
          // Track root prefix
          const firstSegment = fileName.split('/')[0];
          pathSegments.set(firstSegment, (pathSegments.get(firstSegment) || 0) + 1);

          // Categorize files (flexible patterns - work anywhere in path)
          if (/(^|\/)posts\/.*\.(json|html)$/i.test(pathLower) || 
              /(^|\/)your_posts.*\.(json|html)$/i.test(pathLower) ||
              /your_activity.*posts.*\.(json|html)$/i.test(pathLower)) {
            if (ext === 'json') fileIndex.postsJson.push(entry);
            else if (ext === 'html') fileIndex.postsHtml.push(entry);
          }
          else if (/(^|\/)(friend|connection).*\.(json|html)$/i.test(pathLower)) {
            if (ext === 'json') fileIndex.friendsJson.push(entry);
            else if (ext === 'html') fileIndex.friendsHtml.push(entry);
          }
          else if (/(^|\/)messages\/inbox\/[^/]+\/message_\d+\.(json|html)$/i.test(pathLower)) {
            const threadMatch = fileName.match(/messages\/inbox\/([^/]+)\//i);
            const threadName = threadMatch ? threadMatch[1] : 'unknown';
            if (!messagesByThread[threadName]) {
              messagesByThread[threadName] = { threadPath: threadName, messageFiles: [] };
            }
            messagesByThread[threadName].messageFiles.push({ path: fileName, type: ext });
          }
          else if (/(comment|reaction)/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
            if (ext === 'json') fileIndex.commentsJson.push(entry);
            else if (ext === 'html') fileIndex.commentsHtml.push(entry);
          }
          else if (/(like|reaction)/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
            if (ext === 'json') fileIndex.likesJson.push(entry);
            else if (ext === 'html') fileIndex.likesHtml.push(entry);
          }
          else if (/group/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
            if (ext === 'json') fileIndex.groupsJson.push(entry);
            else if (ext === 'html') fileIndex.groupsHtml.push(entry);
          }
          else if (/review/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
            if (ext === 'json') fileIndex.reviewsJson.push(entry);
            else if (ext === 'html') fileIndex.reviewsHtml.push(entry);
          }
          else if (/(marketplace|market)/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
            if (ext === 'json') fileIndex.marketplaceJson.push(entry);
            else if (ext === 'html') fileIndex.marketplaceHtml.push(entry);
          }
          else if (/event/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
            if (ext === 'json') fileIndex.eventsJson.push(entry);
            else if (ext === 'html') fileIndex.eventsHtml.push(entry);
          }
          else if (/reel/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
            if (ext === 'json') fileIndex.reelsJson.push(entry);
            else if (ext === 'html') fileIndex.reelsHtml.push(entry);
          }
          else if (/(checkin|check.in)/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
            if (ext === 'json') fileIndex.checkinsJson.push(entry);
            else if (ext === 'html') fileIndex.checkinsHtml.push(entry);
          }
          else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) {
            fileIndex.photos.push(entry);
            fileIndex.mediaEntriesAll.push(entry); // PHASE 4: Include in mediaEntriesAll
          }
          else if (['mp4', 'mov', 'm4v', 'webm', 'avi', '3gp'].includes(ext)) {
            fileIndex.videos.push(entry);
            fileIndex.mediaEntriesAll.push(entry); // PHASE 4: Include in mediaEntriesAll
          }
          else if (ext === 'html') {
            fileIndex.otherHtml.push(entry);
          }

          // PHASE 4: ALSO add ANY image/video found anywhere in zip to mediaEntriesAll (even outside gallery)
          if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'mp4', 'mov', 'm4v', 'webm', 'avi', '3gp'].includes(ext)) {
            // Already added above for photos/videos, but this ensures duplicates don't hurt
          }
        }

        // Advance offset by EXACT entry size
        offset += totalEntrySize;
        entriesProcessed++;
      }
    } catch (err) {
      console.error('[extractArchiveDataStreaming] Parsing error:', err);
      debug.parsingError = {
        error: err.message,
        stack: err.stack,
        entriesParsedSoFar: entriesProcessed,
        lastOffset: offset
      };
    }

    debug.entriesParsed = entriesProcessed;
    fileIndex.messageThreads = Object.values(messagesByThread);
    
    // Detect root prefix
    let rootPrefix = '';
    let maxCount = 0;
    for (const [segment, count] of pathSegments.entries()) {
      if (count > maxCount) {
        maxCount = count;
        rootPrefix = segment;
      }
    }
    debug.rootPrefix = rootPrefix;
    debug.samplePaths = fileIndex.allPaths.slice(0, 200);

    console.log('[extractArchiveDataStreaming] Indexed files:', {
      entriesParsed: entriesProcessed,
      postsJson: fileIndex.postsJson.length,
      postsHtml: fileIndex.postsHtml.length,
      friendsJson: fileIndex.friendsJson.length,
      friendsHtml: fileIndex.friendsHtml.length,
      messageThreads: fileIndex.messageThreads.length,
      photos: fileIndex.photos.length,
      videos: fileIndex.videos.length
    });

    // CRITICAL: If entriesParsed is 0, return error
    if (entriesProcessed === 0) {
      return Response.json({
        ok: false,
        error: 'Failed to parse any ZIP entries from central directory',
        debug
      }, { status: 400 });
    }

    // Return full index with all categories
    const lengths = {
      photos: fileIndex.photos.length,
      videos: fileIndex.videos.length,
      postsHtml: fileIndex.postsHtml.length,
      postsJson: fileIndex.postsJson.length,
      friendsHtml: fileIndex.friendsHtml.length,
      friendsJson: fileIndex.friendsJson.length,
      messageThreads: fileIndex.messageThreads.length,
      commentsHtml: fileIndex.commentsHtml.length,
      commentsJson: fileIndex.commentsJson.length,
      likesHtml: fileIndex.likesHtml.length,
      likesJson: fileIndex.likesJson.length,
      groupsHtml: fileIndex.groupsHtml.length,
      groupsJson: fileIndex.groupsJson.length,
      reviewsHtml: fileIndex.reviewsHtml.length,
      reviewsJson: fileIndex.reviewsJson.length,
      marketplaceHtml: fileIndex.marketplaceHtml.length,
      marketplaceJson: fileIndex.marketplaceJson.length,
      eventsHtml: fileIndex.eventsHtml.length,
      eventsJson: fileIndex.eventsJson.length,
      reelsHtml: fileIndex.reelsHtml.length,
      reelsJson: fileIndex.reelsJson.length,
      checkinsHtml: fileIndex.checkinsHtml.length,
      checkinsJson: fileIndex.checkinsJson.length
    };

    const result = {
      buildId: "streaming-2026-02-15-ui-contract-a",
      ok: true,
      mode: "streaming",
      isStreaming: contentLength > LARGE_ZIP_THRESHOLD,
      archive: {
        fileSize: contentLength,
        entryCount: totalEntries
      },
      entriesParsed: entriesProcessed,
      eocdFound: debug.eocdFound,
      rootPrefix: rootPrefix,
      indexKeys: Object.keys(fileIndex).filter(k => !k.startsWith('_') && k !== 'allPaths' && k !== 'messageThreads'),
      countsKeys: Object.keys({
        photos: fileIndex.photos.length,
        videos: fileIndex.videos.length,
        postsHtmlFiles: fileIndex.postsHtml.length,
        postsJsonFiles: fileIndex.postsJson.length,
        friendsHtmlFiles: fileIndex.friendsHtml.length,
        friendsJsonFiles: fileIndex.friendsJson.length,
        messageThreads: fileIndex.messageThreads.length,
        commentsHtmlFiles: fileIndex.commentsHtml.length,
        commentsJsonFiles: fileIndex.commentsJson.length,
        likesHtmlFiles: fileIndex.likesHtml.length,
        likesJsonFiles: fileIndex.likesJson.length,
        groupsHtmlFiles: fileIndex.groupsHtml.length,
        groupsJsonFiles: fileIndex.groupsJson.length,
        reviewsHtmlFiles: fileIndex.reviewsHtml.length,
        reviewsJsonFiles: fileIndex.reviewsJson.length,
        marketplaceHtmlFiles: fileIndex.marketplaceHtml.length,
        marketplaceJsonFiles: fileIndex.marketplaceJson.length,
        eventsHtmlFiles: fileIndex.eventsHtml.length,
        eventsJsonFiles: fileIndex.eventsJson.length,
        reelsHtmlFiles: fileIndex.reelsHtml.length,
        reelsJsonFiles: fileIndex.reelsJson.length,
        checkinsHtmlFiles: fileIndex.checkinsHtml.length,
        checkinsJsonFiles: fileIndex.checkinsJson.length
      }),
      lengths,
      index: {
        photos: fileIndex.photos.map(p => ({ path: p.path, name: p.name, size: p.size, ext: p.ext })),
        videos: fileIndex.videos.map(v => ({ path: v.path, name: v.name, size: v.size, ext: v.ext })),
        posts: {
          html: fileIndex.postsHtml.map(f => f.path),
          json: fileIndex.postsJson.map(f => f.path)
        },
        friends: {
          html: fileIndex.friendsHtml.map(f => f.path),
          json: fileIndex.friendsJson.map(f => f.path)
        },
        messages: {
          threads: fileIndex.messageThreads
        },
        comments: {
          html: fileIndex.commentsHtml.map(f => f.path),
          json: fileIndex.commentsJson.map(f => f.path)
        },
        likes: {
          html: fileIndex.likesHtml.map(f => f.path),
          json: fileIndex.likesJson.map(f => f.path)
        },
        groups: {
          html: fileIndex.groupsHtml.map(f => f.path),
          json: fileIndex.groupsJson.map(f => f.path)
        },
        reviews: {
          html: fileIndex.reviewsHtml.map(f => f.path),
          json: fileIndex.reviewsJson.map(f => f.path)
        },
        marketplace: {
          html: fileIndex.marketplaceHtml.map(f => f.path),
          json: fileIndex.marketplaceJson.map(f => f.path)
        },
        events: {
          html: fileIndex.eventsHtml.map(f => f.path),
          json: fileIndex.eventsJson.map(f => f.path)
        },
        reels: {
          html: fileIndex.reelsHtml.map(f => f.path),
          json: fileIndex.reelsJson.map(f => f.path)
        },
        checkins: {
          html: fileIndex.checkinsHtml.map(f => f.path),
          json: fileIndex.checkinsJson.map(f => f.path)
        },
        otherHtml: fileIndex.otherHtml.slice(0, 20).map(f => f.path)
      },
      counts: {
        photos: fileIndex.photos.length,
        videos: fileIndex.videos.length,
        postsHtmlFiles: fileIndex.postsHtml.length,
        postsJsonFiles: fileIndex.postsJson.length,
        friendsHtmlFiles: fileIndex.friendsHtml.length,
        friendsJsonFiles: fileIndex.friendsJson.length,
        messageThreads: fileIndex.messageThreads.length,
        commentsHtmlFiles: fileIndex.commentsHtml.length,
        commentsJsonFiles: fileIndex.commentsJson.length,
        likesHtmlFiles: fileIndex.likesHtml.length,
        likesJsonFiles: fileIndex.likesJson.length,
        groupsHtmlFiles: fileIndex.groupsHtml.length,
        groupsJsonFiles: fileIndex.groupsJson.length,
        reviewsHtmlFiles: fileIndex.reviewsHtml.length,
        reviewsJsonFiles: fileIndex.reviewsJson.length,
        marketplaceHtmlFiles: fileIndex.marketplaceHtml.length,
        marketplaceJsonFiles: fileIndex.marketplaceJson.length,
        eventsHtmlFiles: fileIndex.eventsHtml.length,
        eventsJsonFiles: fileIndex.eventsJson.length,
        reelsHtmlFiles: fileIndex.reelsHtml.length,
        reelsJsonFiles: fileIndex.reelsJson.length,
        checkinsHtmlFiles: fileIndex.checkinsHtml.length,
        checkinsJsonFiles: fileIndex.checkinsJson.length
      },
      warnings: contentLength > LARGE_ZIP_THRESHOLD 
        ? [`Large archive (${(contentLength/1024/1024).toFixed(0)}MB) - showing index only. Click "Load" buttons to view content.`]
        : [],
      debug
    };

    return Response.json(result);
    
  } catch (error) {
    console.error('[extractArchiveDataStreaming] Unexpected error:', error);
    return Response.json({ 
      ok: false,
      error: error.message || 'Unexpected error during extraction',
      stack: error.stack
    }, { status: 500 });
  }
});