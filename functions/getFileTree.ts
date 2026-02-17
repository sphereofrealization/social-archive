import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { fileUrl, manifestUrl } = body;
    
    if (!fileUrl) {
      return Response.json({ error: 'Missing fileUrl parameter' }, { status: 400 });
    }

    console.log('[getFileTree] Building tree from manifest or index...');
    
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
        console.warn('[getFileTree] Manifest load failed, falling back to index:', err.message);
      }
    }
    
    // Fallback: fetch archive index
    if (allPaths.length === 0) {
      console.log('[getFileTree] Fetching archive index via extractArchiveDataStreaming...');
      const indexResp = await base44.functions.invoke('extractArchiveDataStreaming', { fileUrl });
      
      if (indexResp.data?.index) {
        const index = indexResp.data.index;
        
        // Derive all paths from index
        const pathSet = new Set();
        
        if (index.all && Array.isArray(index.all)) {
          index.all.forEach(p => pathSet.add(p));
        }
        
        if (index.entriesByPath) {
          Object.keys(index.entriesByPath).forEach(p => pathSet.add(p));
        }
        
        // Flatten category arrays
        Object.values(index).forEach(value => {
          if (Array.isArray(value)) {
            value.forEach(item => {
              if (typeof item === 'string') pathSet.add(item);
              else if (item?.path) pathSet.add(item.path);
            });
          } else if (value && typeof value === 'object') {
            Object.values(value).forEach(subValue => {
              if (Array.isArray(subValue)) {
                subValue.forEach(item => {
                  if (typeof item === 'string') pathSet.add(item);
                  else if (item?.path) pathSet.add(item.path);
                });
              }
            });
          }
        });
        
        allPaths = Array.from(pathSet);
        console.log(`[getFileTree] Derived ${allPaths.length} paths from index`);
      }
    }
    
    if (allPaths.length === 0) {
      return Response.json({ error: 'No paths found in manifest or index' }, { status: 500 });
    }
    
    // Build tree from paths
    const tree = {};
    
    for (const path of allPaths) {
      const parts = path.split('/').filter(Boolean);
      let current = tree;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        if (i === parts.length - 1) {
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