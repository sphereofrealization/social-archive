import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip@3.10.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const fileUrl = body.fileUrl;
    
    if (!fileUrl) {
      return Response.json({ error: 'Missing fileUrl parameter' }, { status: 400 });
    }

    console.log("Downloading archive for file tree:", fileUrl);
    
    // Fetch the file from public S3 bucket
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      console.error(`Fetch failed with status ${response.status}`, response.statusText);
      const errorText = await response.text();
      console.error("Error response:", errorText);
      return Response.json({ error: `Failed to fetch file: ${response.status} ${response.statusText}` }, { status: 400 });
    }
    
    const blob = await response.blob();
    const zip = await JSZip.loadAsync(blob);
    
    // Build file tree
    const tree = {};
    
    for (const [path, file] of Object.entries(zip.files)) {
      const parts = path.split('/');
      let current = tree;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        
        if (i === parts.length - 1) {
          // File
          if (!file.dir) {
            current[part] = {
              type: 'file',
              size: file._data?.uncompressedSize || 0,
              path
            };
          }
        } else {
          // Directory
          if (!current[part]) {
            current[part] = { type: 'folder', children: {} };
          }
          current = current[part].children;
        }
      }
    }
    
    return Response.json({ tree });
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message || 'Failed to process file tree' }, { status: 500 });
  }
});