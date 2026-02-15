import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Step 1: Check file accessibility and size
    const headResponse = await fetch(fileUrl, { method: 'HEAD' });
    if (!headResponse.ok) {
      return Response.json({ error: `Archive not accessible: ${headResponse.status}` }, { status: 400 });
    }

    const contentLength = parseInt(headResponse.headers.get('content-length') || '0');
    const acceptRangesHeader = headResponse.headers.get('accept-ranges');
    
    console.log('[extractArchiveDataStreaming] File size:', contentLength, 'Accept-Ranges header:', acceptRangesHeader);

    // Step 2: Actively verify range support with a tiny GET request
    const rangeTestResponse = await fetch(fileUrl, {
      headers: { 'Range': 'bytes=0-0' }
    });
    
    if (rangeTestResponse.status !== 206) {
      return Response.json({ 
        error: 'Remote storage does not support HTTP Range requests (required for large files).',
        details: `Server returned status ${rangeTestResponse.status} instead of 206 Partial Content. Please ensure CORS is configured with Accept-Ranges support.`
      }, { status: 400 });
    }
    
    console.log('[extractArchiveDataStreaming] Range requests verified (HTTP 206)');

    // Step 3: Read ZIP end-of-central-directory (last 22 bytes minimum)
    // For large files with comments, we read the last 128KB to ensure we find EOCD
    const tailSize = Math.min(131072, contentLength);  // 128KB
    const tailStart = contentLength - tailSize;
    
    const tailResponse = await fetch(fileUrl, {
      headers: { 'Range': `bytes=${tailStart}-${contentLength - 1}` }
    });
    
    if (!tailResponse.ok || tailResponse.status !== 206) {
      return Response.json({ 
        error: 'Failed to read ZIP metadata via range request',
        status: tailResponse.status 
      }, { status: 400 });
    }

    const tailBuffer = await tailResponse.arrayBuffer();
    const tailBytes = new Uint8Array(tailBuffer);

    // Parse ZIP end-of-central-directory record
    // Signature: 0x06054b50
    let eocdOffset = -1;
    for (let i = tailBytes.length - 22; i >= 0; i--) {
      if (tailBytes[i] === 0x50 && tailBytes[i+1] === 0x4b && 
          tailBytes[i+2] === 0x05 && tailBytes[i+3] === 0x06) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      return Response.json({ error: 'Invalid ZIP file: End-of-central-directory not found' }, { status: 400 });
    }

    // Read central directory metadata
    const readU16LE = (offset) => tailBytes[offset] | (tailBytes[offset + 1] << 8);
    const readU32LE = (offset) => tailBytes[offset] | (tailBytes[offset + 1] << 8) | 
                                   (tailBytes[offset + 2] << 16) | (tailBytes[offset + 3] << 24);

    let totalEntries = readU16LE(eocdOffset + 10);
    let cdSize = readU32LE(eocdOffset + 12);
    let cdOffset = readU32LE(eocdOffset + 16);

    // Check for ZIP64 format (fields are 0xFFFF or 0xFFFFFFFF)
    if (totalEntries === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) {
      console.log('[extractArchiveDataStreaming] ZIP64 detected, attempting to parse ZIP64 EOCD');
      
      // ZIP64 end-of-central-directory locator is 20 bytes before EOCD
      const zip64LocatorOffset = eocdOffset - 20;
      if (zip64LocatorOffset >= 0) {
        // Verify ZIP64 locator signature: 0x07064b50
        if (tailBytes[zip64LocatorOffset] === 0x50 && tailBytes[zip64LocatorOffset+1] === 0x4b &&
            tailBytes[zip64LocatorOffset+2] === 0x06 && tailBytes[zip64LocatorOffset+3] === 0x07) {
          
          // Read ZIP64 EOCD offset (64-bit, but we'll use lower 32 bits for now)
          const zip64EOCDOffset = readU32LE(zip64LocatorOffset + 8);
          
          // Would need to fetch and parse ZIP64 EOCD here
          // For now, return error asking user to use smaller archive or different method
          return Response.json({ 
            error: 'ZIP64 format detected. Large archives over 4GB require additional support.',
            details: 'Please contact support or try a different extraction method.'
          }, { status: 400 });
        }
      }
    }

    console.log('[extractArchiveDataStreaming] ZIP metadata:', { totalEntries, cdSize, cdOffset });

    // Step 4: Read central directory (single range request when possible)
    // For very large central directories (>10MB), we might need chunking, but typically CD is small
    if (cdSize > 10 * 1024 * 1024) {
      console.log('[extractArchiveDataStreaming] Warning: Large central directory:', cdSize, 'bytes');
    }
    
    const cdResponse = await fetch(fileUrl, {
      headers: { 'Range': `bytes=${cdOffset}-${cdOffset + cdSize - 1}` }
    });

    if (!cdResponse.ok || cdResponse.status !== 206) {
      return Response.json({ 
        error: 'Failed to read ZIP central directory',
        details: `Range request failed with status ${cdResponse.status}`
      }, { status: 400 });
    }

    const cdBuffer = await cdResponse.arrayBuffer();
    const cdBytes = new Uint8Array(cdBuffer);

    // Step 4: Parse file entries with robust categorization
    const fileIndex = {
      postsHtml: [], postsJson: [],
      friendsHtml: [], friendsJson: [], 
      messageThreads: [],  // { threadPath, messageFiles: [{path, type}] }
      commentsHtml: [], commentsJson: [],
      likesHtml: [], likesJson: [],
      photos: [], videos: [],
      otherHtml: []
    };

    let offset = 0;
    let entriesProcessed = 0;
    const messagesByThread = {};  // Group messages by thread

    while (offset < cdBytes.length && entriesProcessed < totalEntries) {
      // Central directory file header signature: 0x02014b50
      if (cdBytes[offset] !== 0x50 || cdBytes[offset+1] !== 0x4b || 
          cdBytes[offset+2] !== 0x01 || cdBytes[offset+3] !== 0x02) {
        break;
      }

      const compressedSize = readU32LE(offset + 20);
      const uncompressedSize = readU32LE(offset + 24);
      const fileNameLength = readU16LE(offset + 28);
      const extraFieldLength = readU16LE(offset + 30);
      const fileCommentLength = readU16LE(offset + 32);
      const localHeaderOffset = readU32LE(offset + 42);

      const fileNameBytes = cdBytes.slice(offset + 46, offset + 46 + fileNameLength);
      const fileName = new TextDecoder().decode(fileNameBytes);
      const pathLower = fileName.toLowerCase();
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const entry = { path: fileName, size: uncompressedSize, name: fileName.split('/').pop(), ext };

      // Categorize by robust patterns
      // Posts: your_posts_1.json, posts.html, your_activity_across_facebook/posts/
      if (/posts.*\.(html|json)$/i.test(pathLower) || /your_activity.*posts.*\.(html|json)$/i.test(pathLower)) {
        if (ext === 'json') fileIndex.postsJson.push(entry);
        else if (ext === 'html') fileIndex.postsHtml.push(entry);
      }
      // Friends: friends.json, connections.json
      else if (/friend|connection/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
        if (ext === 'json') fileIndex.friendsJson.push(entry);
        else fileIndex.friendsHtml.push(entry);
      }
      // Messages: messages/inbox/threadname/message_1.json
      else if (/messages\/inbox\/[^/]+\/message_\d+\.(json|html)$/i.test(pathLower)) {
        const threadMatch = fileName.match(/messages\/inbox\/([^/]+)\//i);
        const threadName = threadMatch ? threadMatch[1] : 'unknown';
        if (!messagesByThread[threadName]) {
          messagesByThread[threadName] = { threadPath: threadName, messageFiles: [] };
        }
        messagesByThread[threadName].messageFiles.push({ path: fileName, type: ext });
      }
      // Comments
      else if (/comment/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
        if (ext === 'json') fileIndex.commentsJson.push(entry);
        else fileIndex.commentsHtml.push(entry);
      }
      // Likes
      else if (/like/i.test(pathLower) && (ext === 'json' || ext === 'html')) {
        if (ext === 'json') fileIndex.likesJson.push(entry);
        else fileIndex.likesHtml.push(entry);
      }
      // Media
      else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        fileIndex.photos.push(entry);
      }
      else if (['mp4', 'mov', 'm4v', 'webm'].includes(ext)) {
        fileIndex.videos.push(entry);
      }
      // Catch-all HTML for potential parsing later
      else if (ext === 'html') {
        fileIndex.otherHtml.push(entry);
      }

      offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
      entriesProcessed++;
    }

    // Convert messagesByThread to array
    fileIndex.messageThreads = Object.values(messagesByThread);

    console.log('[extractArchiveDataStreaming] Indexed files:', {
      postsJson: fileIndex.postsJson.length,
      postsHtml: fileIndex.postsHtml.length,
      friendsJson: fileIndex.friendsJson.length,
      friendsHtml: fileIndex.friendsHtml.length,
      messageThreads: fileIndex.messageThreads.length,
      photos: fileIndex.photos.length,
      videos: fileIndex.videos.length
    });

    // Step 5: Return index structure for lazy loading
    const result = {
      ok: true,
      isStreaming: true,  // Flag to identify this is index-only response
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
        otherHtml: fileIndex.otherHtml.map(f => f.path)
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
        likesJsonFiles: fileIndex.likesJson.length
      },
      warnings: [`Large archive (${(contentLength/1024/1024).toFixed(0)}MB) - showing index only. Click "Load" buttons to view content.`],
      debug: {
        totalEntries,
        entriesProcessed,
        executionTimeMs: Date.now() - startTime
      }
    };

    return Response.json(result);
    
  } catch (error) {
    console.error('[extractArchiveDataStreaming] Error:', error);
    return Response.json({ 
      error: error.message || 'Failed to extract archive',
      stack: error.stack 
    }, { status: 500 });
  }
});