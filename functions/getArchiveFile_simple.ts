import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip@3.10.1';

Deno.serve(async (req) => {
  try {
    // Best-effort Base44 auth: do not hard-fail extraction/viewing for password-only sessions.
    // Some deployments rely on app-level session_token rather than Base44 user auth.
    try {
      const base44 = createClientFromRequest(req);
      await base44.auth.me();
    } catch (authErr) {
      console.warn('[auth] Proceeding without Base44 user context:', authErr?.message);
    }

    const body = await req.json();
    const { fileUrl, filePath } = body;
    
    if (!fileUrl || !filePath) {
      return Response.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const response = await fetch(fileUrl);
    if (!response.ok) {
      return Response.json({ error: `Failed to fetch: ${response.status}` }, { status: 400 });
    }
    
    const blob = await response.blob();
    const zip = await JSZip.loadAsync(blob);
    
    const file = zip.file(filePath);
    if (!file) {
      return Response.json({ error: 'File not found' }, { status: 404 });
    }

    const ext = filePath.split('.').pop().toLowerCase();
    
    // Handle images
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
      const base64 = await file.async("base64");
      const mimeTypes = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp'
      };
      return Response.json({ 
        type: 'image',
        content: `data:${mimeTypes[ext]};base64,${base64}`
      });
    }
    
    // Handle text-based files
    if (['html', 'htm', 'json', 'txt', 'js', 'css', 'xml', 'csv', 'md'].includes(ext)) {
      const content = await file.async("text");
      return Response.json({ 
        type: ext === 'json' ? 'json' : (ext === 'html' || ext === 'htm') ? 'html' : 'text',
        content
      });
    }
    
    // Handle videos (return metadata only)
    if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) {
      return Response.json({ 
        type: 'video',
        message: 'Video files cannot be previewed directly. Download the archive to view.',
        size: file._data?.uncompressedSize || 0
      });
    }
    
    // Unknown type
    return Response.json({ 
      type: 'unknown',
      message: 'This file type cannot be previewed.',
      size: file._data?.uncompressedSize || 0
    });
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});