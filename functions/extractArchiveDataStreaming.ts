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
    const supportsRanges = headResponse.headers.get('accept-ranges') === 'bytes';
    
    console.log('[extractArchiveDataStreaming] File size:', contentLength, 'Range support:', supportsRanges);

    if (!supportsRanges) {
      return Response.json({ 
        error: 'Remote storage does not support range requests. Please contact support to configure CORS properly.',
        details: 'Range requests are required for large files'
      }, { status: 400 });
    }

    // Step 2: Read ZIP end-of-central-directory (last 22 bytes minimum)
    // For large files, we read the last 64KB to capture the central directory
    const tailSize = Math.min(65536, contentLength);
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

    const totalEntries = readU16LE(eocdOffset + 10);
    const cdSize = readU32LE(eocdOffset + 12);
    const cdOffset = readU32LE(eocdOffset + 16);

    console.log('[extractArchiveDataStreaming] ZIP metadata:', { totalEntries, cdSize, cdOffset });

    // Step 3: Read central directory
    const cdResponse = await fetch(fileUrl, {
      headers: { 'Range': `bytes=${cdOffset}-${cdOffset + cdSize - 1}` }
    });

    if (!cdResponse.ok || cdResponse.status !== 206) {
      return Response.json({ error: 'Failed to read ZIP central directory' }, { status: 400 });
    }

    const cdBuffer = await cdResponse.arrayBuffer();
    const cdBytes = new Uint8Array(cdBuffer);

    // Step 4: Parse file entries
    const fileIndex = {
      friendsHtml: [], messagesHtml: [], postsHtml: [], 
      commentsHtml: [], likesHtml: [], photos: [], videos: []
    };

    let offset = 0;
    let entriesProcessed = 0;

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

      // Categorize files
      const entry = { path: fileName, size: uncompressedSize, offset: localHeaderOffset };
      
      if (pathLower.includes('friend') && ext === 'html') fileIndex.friendsHtml.push(entry);
      else if ((pathLower.includes('message') || pathLower.includes('inbox')) && ext === 'html') fileIndex.messagesHtml.push(entry);
      else if ((pathLower.includes('post') || pathLower.includes('wall')) && ext === 'html') fileIndex.postsHtml.push(entry);
      else if (pathLower.includes('comment') && ext === 'html') fileIndex.commentsHtml.push(entry);
      else if (pathLower.includes('like') && ext === 'html') fileIndex.likesHtml.push(entry);
      else if (['jpg', 'jpeg', 'png'].includes(ext)) fileIndex.photos.push(entry);
      else if (['mp4', 'mov'].includes(ext)) fileIndex.videos.push(entry);

      offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
      entriesProcessed++;
    }

    console.log('[extractArchiveDataStreaming] Indexed files:', {
      friendsHtml: fileIndex.friendsHtml.length,
      messagesHtml: fileIndex.messagesHtml.length,
      postsHtml: fileIndex.postsHtml.length,
      photos: fileIndex.photos.length,
      videos: fileIndex.videos.length
    });

    // Step 5: Sample a few files for metadata extraction
    const result = {
      profile: { name: '', email: '' },
      posts: [],
      friends: [],
      messages: [],
      comments: [],
      likes: [],
      photos: fileIndex.photos.map(p => ({ path: p.path, size: p.size })),
      videos: fileIndex.videos.map(v => ({ path: v.path, size: v.size })),
      warnings: [`Large archive (${(contentLength/1024/1024).toFixed(0)}MB) - showing metadata only. Click individual items to load content.`],
      debug: {
        totalEntries,
        sampledFiles: 0,
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