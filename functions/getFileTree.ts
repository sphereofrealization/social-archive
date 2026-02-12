import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip@3.10.1';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.500.0';

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
    
    // Parse S3 URL to extract bucket and key
    const urlMatch = fileUrl.match(/https:\/\/s3\.[^.]+\.dream\.io\/([^\/]+)\/(.+)/);
    if (!urlMatch) {
      return Response.json({ error: 'Invalid S3 URL format' }, { status: 400 });
    }
    
    const bucket = urlMatch[1];
    const key = decodeURIComponent(urlMatch[2]);
    
    // Create S3 client with DreamHost credentials
    const s3Client = new S3Client({
      region: 'us-east-005',
      endpoint: Deno.env.get('DREAMHOST_ENDPOINT'),
      credentials: {
        accessKeyId: Deno.env.get('DREAMHOST_ACCESS_KEY'),
        secretAccessKey: Deno.env.get('DREAMHOST_SECRET_KEY'),
      },
      forcePathStyle: true,
    });
    
    // Download from S3 using authenticated request
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    
    const response = await s3Client.send(command);
    
    // Convert response body stream to blob
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const blob = new Blob(chunks, { type: 'application/zip' });
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