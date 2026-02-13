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
    const { fileUrl, mediaPath } = body;
    
    if (!fileUrl || !mediaPath) {
      return Response.json({ error: 'Missing fileUrl or mediaPath' }, { status: 400 });
    }

    const zipResponse = await fetch(fileUrl);
    if (!zipResponse.ok) {
      return Response.json({ error: `Failed to fetch archive: ${zipResponse.status}` }, { status: 400 });
    }
    
    const blob = await zipResponse.blob();
    const zip = await JSZip.loadAsync(blob);
    
    const file = zip.file(mediaPath);
    if (!file) {
      return Response.json({ error: 'Media file not found in archive' }, { status: 404 });
    }

    const ext = mediaPath.split('.').pop().toLowerCase();
    
    // Images: return base64 data URL
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
      const base64 = await file.async('base64');
      const mimeTypes = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp'
      };
      return Response.json({ 
        type: 'image',
        content: `data:${mimeTypes[ext]};base64,${base64}`
      });
    }
    
    // Videos: return as binary blob (browser will handle streaming)
    if (['mp4', 'mov', 'm4v', 'webm', 'avi'].includes(ext)) {
      const bytes = await file.async('arraybuffer');
      const mimeTypes = {
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'm4v': 'video/mp4',
        'webm': 'video/webm',
        'avi': 'video/x-msvideo'
      };
      return new Response(bytes, {
        headers: {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Content-Length': bytes.byteLength.toString()
        }
      });
    }

    // Other files: text response
    if (['html', 'htm', 'json', 'txt', 'csv'].includes(ext)) {
      const content = await file.async('text');
      return Response.json({ 
        type: 'text',
        content
      });
    }

    return Response.json({ 
      type: 'unknown',
      message: 'This file type is not supported for preview'
    });
    
  } catch (error) {
    console.error('Error fetching media:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});