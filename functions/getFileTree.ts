// Edge-safe ZIP parser with range-based central directory reading
// No SDK dependencies, no Buffer usage

const MAX_TAIL_SCAN = 65536 + 22; // Maximum EOCD + comment size
const MAX_CD_SIZE = 50 * 1024 * 1024; // 50MB max for central directory

// Simple bearer token auth
async function authenticateUser(req) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return { email: 'user@app.local' };
}

Deno.serve(async (req) => {
  try {
    // Auth check
    const user = await authenticateUser(req);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { fileUrl, manifestUrl } = body;
    
    if (!fileUrl) {
      return Response.json({ error: 'Missing fileUrl parameter' }, { status: 400 });
    }

    console.log('[getFileTree] Building tree from manifest or range-based ZIP parse...');
    
    let allPaths = [];
    
    // Try manifest first (for materialized archives)
    if (manifestUrl) {
      try {
        console.log('[getFileTree] Loading from manifest:', manifestUrl);
        const manifestResp = await fetch(manifestUrl);
        const manifest = await manifestResp.json();
        allPaths = manifest.entries?.map(e => e.entryPath) || [];
        console.log(`[getFileTree] Loaded ${allPaths.length} paths from manifest`);
      } catch (err) {
        console.warn('[getFileTree] Manifest load failed, falling back to range parse:', err.message);
      }
    }
    
    // Range-based ZIP parsing fallback
    if (allPaths.length === 0) {
      console.log('[getFileTree] Starting range-based ZIP central directory parse...');
      
      // Step 1: HEAD request for file size
      const headResp = await fetch(fileUrl, { method: 'HEAD' });
      const fileSize = parseInt(headResp.headers.get('content-length') || '0');
      
      if (fileSize === 0) {
        return Response.json({ error: 'Cannot determine file size' }, { status: 500 });
      }
      
      console.log(`[getFileTree] File size: ${fileSize} bytes`);
      
      // Step 2: Range probe (must support 206)
      const probeResp = await fetch(fileUrl, { headers: { Range: 'bytes=0-0' } });
      if (probeResp.status !== 206) {
        return Response.json({ error: 'Server does not support range requests' }, { status: 500 });
      }
      
      console.log('[getFileTree] Range requests supported');
      
      // Step 3: Read tail to find EOCD signature
      const tailSize = Math.min(MAX_TAIL_SCAN, fileSize);
      const tailStart = fileSize - tailSize;
      
      const tailResp = await fetch(fileUrl, {
        headers: { Range: `bytes=${tailStart}-${fileSize - 1}` }
      });
      
      if (tailResp.status !== 206) {
        return Response.json({ error: 'Failed to fetch ZIP tail' }, { status: 500 });
      }
      
      const tailBuf = await tailResp.arrayBuffer();
      const tailView = new DataView(tailBuf);
      
      // Search for EOCD signature (0x06054b50) from end
      let eocdOffset = -1;
      for (let i = tailBuf.byteLength - 22; i >= 0; i--) {
        if (tailView.getUint32(i, true) === 0x06054b50) {
          eocdOffset = i;
          break;
        }
      }
      
      if (eocdOffset === -1) {
        return Response.json({ error: 'EOCD signature not found (may be ZIP64)' }, { status: 500 });
      }
      
      console.log(`[getFileTree] EOCD found at tail offset ${eocdOffset}`);
      
      // Parse EOCD
      const cdEntryCount = tailView.getUint16(eocdOffset + 10, true);
      const cdSize = tailView.getUint32(eocdOffset + 12, true);
      const cdOffset = tailView.getUint32(eocdOffset + 16, true);
      
      console.log(`[getFileTree] CD: ${cdEntryCount} entries, size=${cdSize}, offset=${cdOffset}`);
      
      // ZIP64 guard
      if (cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF || cdEntryCount === 0xFFFF) {
        return Response.json({ error: 'ZIP64 archives not supported in edge-safe mode' }, { status: 500 });
      }
      
      // Bounds check
      if (cdSize > MAX_CD_SIZE) {
        return Response.json({ error: `Central directory too large: ${cdSize} bytes` }, { status: 500 });
      }
      
      // Step 4: Fetch central directory by range
      const cdResp = await fetch(fileUrl, {
        headers: { Range: `bytes=${cdOffset}-${cdOffset + cdSize - 1}` }
      });
      
      if (cdResp.status !== 206) {
        return Response.json({ error: 'Failed to fetch central directory' }, { status: 500 });
      }
      
      const cdBuf = await cdResp.arrayBuffer();
      const cdView = new DataView(cdBuf);
      
      // Step 5: Parse central directory entries
      let offset = 0;
      const decoder = new TextDecoder('utf-8');
      
      while (offset < cdBuf.byteLength - 46) {
        const sig = cdView.getUint32(offset, true);
        if (sig !== 0x02014b50) break; // CD file header signature
        
        const fileNameLen = cdView.getUint16(offset + 28, true);
        const extraFieldLen = cdView.getUint16(offset + 30, true);
        const commentLen = cdView.getUint16(offset + 32, true);
        
        const fileNameBytes = new Uint8Array(cdBuf, offset + 46, fileNameLen);
        const fileName = decoder.decode(fileNameBytes);
        
        allPaths.push(fileName);
        
        offset += 46 + fileNameLen + extraFieldLen + commentLen;
      }
      
      console.log(`[getFileTree] Parsed ${allPaths.length} entries from central directory`);
    }
    
    if (allPaths.length === 0) {
      return Response.json({ error: 'No paths found in manifest or ZIP' }, { status: 500 });
    }
    
    // Build tree from paths
    const tree = {};
    
    for (const path of allPaths) {
      const parts = path.split('/').filter(Boolean);
      let current = tree;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        if (i === parts.length - 1 && !path.endsWith('/')) {
          // File
          current[part] = {
            type: 'file',
            path
          };
        } else {
          // Directory
          if (!current[part]) {
            current[part] = { type: 'folder', children: {} };
          }
          current = current[part].children;
        }
      }
    }
    
    console.log('[getFileTree] Tree built successfully');
    return Response.json({ tree });
    
  } catch (error) {
    console.error('[getFileTree] Error:', error);
    return Response.json({ error: error.message || 'Failed to process file tree' }, { status: 500 });
  }
});