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
    const { fileUrl, entryPath, responseType = 'text' } = body;
    
    console.log(`[getArchiveEntry] Loading ${entryPath} from ${fileUrl}`);
    
    if (!fileUrl || !entryPath) {
      return Response.json({ error: 'Missing fileUrl or entryPath' }, { status: 400 });
    }

    // Fetch with Range support for large files
    const zipRes = await fetch(fileUrl, {
      headers: { 'Range': 'bytes=0-' }
    });
    
    console.log(`[getArchiveEntry] Fetch status: ${zipRes.status}, headers:`, {
      'content-length': zipRes.headers.get('content-length'),
      'accept-ranges': zipRes.headers.get('accept-ranges'),
      'content-range': zipRes.headers.get('content-range')
    });
    
    if (!zipRes.ok && zipRes.status !== 206) {
      return Response.json({ 
        error: `Failed to fetch ZIP: ${zipRes.status}`,
        headers: Object.fromEntries(zipRes.headers)
      }, { status: 400 });
    }

    const blob = await zipRes.blob();
    console.log(`[getArchiveEntry] ZIP blob size: ${blob.size} bytes`);
    const zip = await JSZip.loadAsync(blob);
    const file = zip.file(entryPath);

    if (!file) {
      return Response.json({ error: 'Entry not found in archive' }, { status: 404 });
    }

    if (responseType === 'text') {
      const content = await file.async('text');
      return Response.json({ 
        type: 'text', 
        content,
        filename: entryPath.split('/').pop()
      });
    }

    if (responseType === 'json') {
      const text = await file.async('text');
      const data = JSON.parse(text);
      return Response.json({ 
        type: 'json', 
        content: data,
        filename: entryPath.split('/').pop()
      });
    }

    if (responseType === 'base64') {
      const base64 = await file.async('base64');
      const ext = entryPath.split('.').pop().toLowerCase();
      const mimeTypes = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'gif': 'image/gif', 'webp': 'image/webp', 'mp4': 'video/mp4',
        'mov': 'video/quicktime', 'm4v': 'video/mp4', 'webm': 'video/webm'
      };
      const mime = mimeTypes[ext] || 'application/octet-stream';
      
      return Response.json({
        type: 'base64',
        mime,
        content: `data:${mime};base64,${base64}`,
        filename: entryPath.split('/').pop()
      });
    }

    return Response.json({ error: 'Invalid responseType' }, { status: 400 });
    
  } catch (error) {
    console.error('Archive entry fetch error:', error);
    return Response.json({ error: error.message || 'Failed to fetch entry' }, { status: 500 });
  }
});