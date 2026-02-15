import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip@3.10.1';

const TIME_LIMIT_MS = 25000;
const MAX_FILES_TO_SAMPLE = 5; // Sample fewer files for large archives

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { fileUrl } = body;
    
    if (!fileUrl) {
      return Response.json({ error: 'Missing fileUrl' }, { status: 400 });
    }

    console.log('[extractArchiveDataStreaming] Starting extraction for:', fileUrl);

    const debug = {
      url: fileUrl,
      headStatus: null,
      fileSize: null,
      rangeProbeStatus: null,
      rangeProbeContentRange: null,
      tailStatus: null,
      tailBytesRead: null,
      eocdFound: false,
      zip64Detected: false,
      cdOffset: null,
      cdSize: null,
      entriesParsed: 0,
      redirected: false,
      finalUrl: null,
      samplePaths: []
    };

    // Step 1: Check file accessibility and size
    let headResponse;
    try {
      headResponse = await fetch(fileUrl, { method: 'HEAD', redirect: 'follow' });
      debug.headStatus = headResponse.status;
      debug.finalUrl = headResponse.url;
      debug.redirected = headResponse.url !== fileUrl;
      
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

    const contentLength = parseInt(headResponse.headers.get('content-length') || '0');
    const acceptRangesHeader = headResponse.headers.get('accept-ranges');
    debug.fileSize = contentLength;
    
    if (contentLength === 0) {
      return Response.json({
        ok: false,
        error: 'Archive has zero size or Content-Length header missing',
        debug
      }, { status: 400 });
    }
    
    console.log('[extractArchiveDataStreaming] File size:', contentLength, 'Accept-Ranges:', acceptRangesHeader);

    // Step 2: Actively verify range support with probe (CRITICAL: use finalUrl if redirected)
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
        details: 'Server must support HTTP Range requests for large file extraction. Configure CORS properly.',
        debug
      }, { status: 400 });
    }
    
    console.log('[extractArchiveDataStreaming] Range requests verified (HTTP 206)');

    // Step 3: Read ZIP end-of-central-directory (last 128KB to find EOCD)
    const tailSize = Math.min(131072, contentLength);  // 128KB
    const tailStart = contentLength - tailSize;
    
    let tailResponse;
    try {
      tailResponse = await fetch(targetUrl, {
        headers: { 'Range': `bytes=${tailStart}-${contentLength - 1}` }
      });
      debug.tailStatus = tailResponse.status;
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

    // Parse ZIP end-of-central-directory record (signature: 0x06054b50)
    let eocdOffset = -1;
    for (let i = tailBytes.length - 22; i >= 0; i--) {
      if (tailBytes[i] === 0x50 && tailBytes[i+1] === 0x4b && 
          tailBytes[i+2] === 0x05 && tailBytes[i+3] === 0x06) {
        eocdOffset = i;
        debug.eocdFound = true;
        break;
      }
    }

    if (eocdOffset === -1) {
      // Include tail hex snippet for debugging
      const lastBytes = Array.from(tailBytes.slice(-50)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      return Response.json({ 
        ok: false,
        error: 'Invalid ZIP file: End-of-central-directory signature not found',
        debug: { ...debug, lastBytesHex: lastBytes }
      }, { status: 400 });
    }

    // Read central directory metadata
    const readU16LE = (offset) => tailBytes[offset] | (tailBytes[offset + 1] << 8);
    const readU32LE = (offset) => tailBytes[offset] | (tailBytes[offset + 1] << 8) | 
                                   (tailBytes[offset + 2] << 16) | (tailBytes[offset + 3] << 24);

    let totalEntries = readU16LE(eocdOffset + 10);
    let cdSize = readU32LE(eocdOffset + 12);
    let cdOffset = readU32LE(eocdOffset + 16);

    debug.cdOffset = cdOffset;
    debug.cdSize = cdSize;

    // Check for ZIP64 format (fields are 0xFFFF or 0xFFFFFFFF)
    if (totalEntries === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) {
      debug.zip64Detected = true;
      console.log('[extractArchiveDataStreaming] ZIP64 detected, attempting to parse ZIP64 EOCD');
      
      // ZIP64 end-of-central-directory locator is 20 bytes before EOCD
      const zip64LocatorOffset = eocdOffset - 20;
      if (zip64LocatorOffset >= 0) {
        // Verify ZIP64 locator signature: 0x07064b50
        if (tailBytes[zip64LocatorOffset] === 0x50 && tailBytes[zip64LocatorOffset+1] === 0x4b &&
            tailBytes[zip64LocatorOffset+2] === 0x06 && tailBytes[zip64LocatorOffset+3] === 0x07) {
          
          // Read ZIP64 EOCD offset (use lower 32 bits)
          const zip64EOCDOffset = readU32LE(zip64LocatorOffset + 8);
          
          // Fetch ZIP64 EOCD record
          try {
            const zip64Response = await fetch(targetUrl, {
              headers: { 'Range': `bytes=${zip64EOCDOffset}-${zip64EOCDOffset + 56 - 1}` }
            });
            
            if (zip64Response.ok && zip64Response.status === 206) {
              const zip64Buffer = await zip64Response.arrayBuffer();
              const zip64Bytes = new Uint8Array(zip64Buffer);
              
              // Verify ZIP64 EOCD signature: 0x06064b50
              if (zip64Bytes[0] === 0x50 && zip64Bytes[1] === 0x4b && 
                  zip64Bytes[2] === 0x06 && zip64Bytes[3] === 0x06) {
                
                // Read 64-bit values (use lower 32 bits for JS safety)
                totalEntries = readU32LE.call({ tailBytes: zip64Bytes }, 32);
                cdSize = readU32LE.call({ tailBytes: zip64Bytes }, 40);
                cdOffset = readU32LE.call({ tailBytes: zip64Bytes }, 48);
                
                debug.cdOffset = cdOffset;
                debug.cdSize = cdSize;
                
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

    // Step 4: Read central directory
    if (cdSize > 10 * 1024 * 1024) {
      console.log('[extractArchiveDataStreaming] Warning: Large central directory:', cdSize, 'bytes');
    }
    
    let cdResponse;
    try {
      cdResponse = await fetch(targetUrl, {
        headers: { 'Range': `bytes=${cdOffset}-${cdOffset + cdSize - 1}` }
      });
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
    
    // Use JSZip to parse the central directory properly
    console.log('[extractArchiveDataStreaming] Using JSZip to parse central directory');
    
    // Fetch entire ZIP file for JSZip (we'll optimize later)
    const fullZipResponse = await fetch(targetUrl);
    const fullZipBuffer = await fullZipResponse.arrayBuffer();
    const zip = await JSZip.loadAsync(fullZipBuffer);
    
    console.log('[extractArchiveDataStreaming] JSZip loaded, file count:', Object.keys(zip.files).length);

    // Step 5: Parse file entries with robust categorization
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
      otherHtml: [],
      allPaths: []
    };

    let entriesProcessed = 0;
    const messagesByThread = {};
    const pathSegments = new Map();

    // Iterate through all files using JSZip
    for (const [fileName, zipEntry] of Object.entries(zip.files)) {
      // Skip directories
      if (zipEntry.dir) continue;
      
      if (!fileName.endsWith('/')) {
        const pathLower = fileName.toLowerCase();
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const entry = { path: fileName, size: zipEntry._data?.uncompressedSize || 0, name: fileName.split('/').pop(), ext };
        
        fileIndex.allPaths.push(fileName);
        
        // Track root prefix
        const firstSegment = fileName.split('/')[0];
        pathSegments.set(firstSegment, (pathSegments.get(firstSegment) || 0) + 1);

        // Categorize with flexible patterns (work anywhere in path)
        // Posts: /(^|\/)posts\/.*\.(json|html)$/i or your_activity
        if (/(^|\/)posts\/.*\.(json|html)$/i.test(pathLower) || 
            /(^|\/)your_posts.*\.(json|html)$/i.test(pathLower) ||
            /your_activity.*posts.*\.(json|html)$/i.test(pathLower)) {
          if (ext === 'json') fileIndex.postsJson.push(entry);
          else if (ext === 'html') fileIndex.postsHtml.push(entry);
        }
        // Friends
        else if (/(^|\/)(friend|connection).*\.(json|html)$/i.test(pathLower)) {
          if (ext === 'json') fileIndex.friendsJson.push(entry);
          else if (ext === 'html') fileIndex.friendsHtml.push(entry);
        }
        // Messages: /messages/inbox/threadname/message_N.json
        else if (/(^|\/)messages\/inbox\/[^/]+\/message_\d+\.(json|html)$/i.test(pathLower)) {
          const threadMatch = fileName.match(/messages\/inbox\/([^/]+)\//i);
          const threadName = threadMatch ? threadMatch[1] : 'unknown';
          if (!messagesByThread[threadName]) {
            messagesByThread[threadName] = { threadPath: threadName, messageFiles: [] };
          }
          messagesByThread[threadName].messageFiles.push({ path: fileName, type: ext });
        }
        // Comments
        else if (/(comment|reaction)/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
          if (ext === 'json') fileIndex.commentsJson.push(entry);
          else if (ext === 'html') fileIndex.commentsHtml.push(entry);
        }
        // Likes
        else if (/(like|reaction)/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
          if (ext === 'json') fileIndex.likesJson.push(entry);
          else if (ext === 'html') fileIndex.likesHtml.push(entry);
        }
        // Groups
        else if (/group/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
          if (ext === 'json') fileIndex.groupsJson.push(entry);
          else if (ext === 'html') fileIndex.groupsHtml.push(entry);
        }
        // Reviews
        else if (/review/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
          if (ext === 'json') fileIndex.reviewsJson.push(entry);
          else if (ext === 'html') fileIndex.reviewsHtml.push(entry);
        }
        // Marketplace
        else if (/(marketplace|market)/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
          if (ext === 'json') fileIndex.marketplaceJson.push(entry);
          else if (ext === 'html') fileIndex.marketplaceHtml.push(entry);
        }
        // Events
        else if (/event/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
          if (ext === 'json') fileIndex.eventsJson.push(entry);
          else if (ext === 'html') fileIndex.eventsHtml.push(entry);
        }
        // Reels
        else if (/reel/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
          if (ext === 'json') fileIndex.reelsJson.push(entry);
          else if (ext === 'html') fileIndex.reelsHtml.push(entry);
        }
        // Check-ins
        else if /(checkin|check.in)/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
          if (ext === 'json') fileIndex.checkinsJson.push(entry);
          else if (ext === 'html') fileIndex.checkinsHtml.push(entry);
        }
        // Photos (all images anywhere)
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) {
          fileIndex.photos.push(entry);
        }
        // Videos (all videos anywhere)
        else if (['mp4', 'mov', 'm4v', 'webm', 'avi', '3gp'].includes(ext)) {
          fileIndex.videos.push(entry);
        }
        // Other HTML
        else if (ext === 'html') {
          fileIndex.otherHtml.push(entry);
        }
      }

      const entrySize = 46 + fileNameLength + extraFieldLength + fileCommentLength;
      offset += entrySize;
      entriesProcessed++;
      
      if (entriesProcessed <= 3 || entriesProcessed >= totalEntries - 3) {
        console.log(`[extractArchiveDataStreaming] Entry ${entriesProcessed}: ${fileName} (offset: ${offset}, entrySize: ${entrySize})`);
      }
    }

    console.log('[extractArchiveDataStreaming] Finished parsing:', {
      entriesProcessed,
      totalEntries,
      finalOffset: offset,
      cdBytesLength: cdBytes.length
    });

    debug.entriesParsed = entriesProcessed;
    fileIndex.messageThreads = Object.values(messagesByThread);
    
    // Detect root prefix (most common first segment)
    let rootPrefix = '';
    let maxCount = 0;
    for (const [segment, count] of pathSegments.entries()) {
      if (count > maxCount) {
        maxCount = count;
        rootPrefix = segment;
      }
    }
    debug.rootPrefix = rootPrefix;

    // Sample first 50 paths for debugging
    debug.samplePaths = fileIndex.allPaths.slice(0, 50);

    console.log('[extractArchiveDataStreaming] Indexed files:', {
      entriesParsed,
      postsJson: fileIndex.postsJson.length,
      postsHtml: fileIndex.postsHtml.length,
      friendsJson: fileIndex.friendsJson.length,
      friendsHtml: fileIndex.friendsHtml.length,
      messageThreads: fileIndex.messageThreads.length,
      photos: fileIndex.photos.length,
      videos: fileIndex.videos.length,
      rootPrefix
    });

    // Step 6: Return index structure
    const result = {
      ok: true,
      isStreaming: true,
      archive: {
        fileSize: contentLength,
        entryCount: totalEntries
      },
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
      warnings: [`Large archive (${(contentLength/1024/1024).toFixed(0)}MB) - showing index only. Click "Load" buttons to view content.`],
      debug
    };

    return Response.json(result);
    
  } catch (error) {
    console.error('[extractArchiveDataStreaming] Unexpected error:', error);
    return Response.json({ 
      ok: false,
      error: error.message || 'Unexpected error during extraction',
      stack: error.stack,
      debug: {
        error: error.toString()
      }
    }, { status: 500 });
  }
});