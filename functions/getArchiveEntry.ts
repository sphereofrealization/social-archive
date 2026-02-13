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
    const { zipUrl, entryPath, responseType = 'base64' } = body;
    
    console.log(`[getArchiveEntry] Fetching ${entryPath} from ZIP, responseType=${responseType}`);
    
    if (!zipUrl || !entryPath) {
      return Response.json({ error: 'Missing zipUrl or entryPath' }, { status: 400 });
    }

    // Fetch ZIP - JSZip will handle Range requests automatically for random access
    let zipRes;
    try {
      zipRes = await fetch(zipUrl);
      if (!zipRes.ok) {
        const errorMsg = `Failed to fetch ZIP: ${zipRes.status}`;
        console.error(`[getArchiveEntry] ${errorMsg}`);
        return Response.json({ 
          error: errorMsg,
          status: zipRes.status
        }, { status: 400 });
      }
    } catch (fetchErr) {
      const errorMsg = `Network error fetching ZIP: ${fetchErr.message}`;
      console.error(`[getArchiveEntry] ${errorMsg}`);
      return Response.json({ error: errorMsg }, { status: 500 });
    }

    let zip;
    try {
      const blob = await zipRes.blob();
      console.log(`[getArchiveEntry] ZIP blob size: ${blob.size} bytes`);
      zip = await JSZip.loadAsync(blob);
    } catch (zipErr) {
      const errorMsg = `Failed to parse ZIP: ${zipErr.message}`;
      console.error(`[getArchiveEntry] ${errorMsg}`);
      return Response.json({ error: errorMsg }, { status: 400 });
    }

    // Look up the entry
    const file = zip.file(entryPath);
    if (!file) {
      const errorMsg = `Entry not found: ${entryPath}`;
      console.error(`[getArchiveEntry] ${errorMsg}`);
      // List first 10 files for debugging
      const fileList = zip.file(/.*/).slice(0, 10).map(f => f.name);
      return Response.json({ 
        error: errorMsg,
        availableFiles: fileList
      }, { status: 404 });
    }

    // Extract based on responseType
    if (responseType === 'text') {
      try {
        const content = await file.async('text');
        console.log(`[getArchiveEntry] Extracted text, size: ${content.length} chars`);
        return Response.json({ 
          type: 'text', 
          content,
          filename: entryPath.split('/').pop()
        });
      } catch (err) {
        return Response.json({ error: `Failed to extract text: ${err.message}` }, { status: 500 });
      }
    }

    if (responseType === 'json') {
      try {
        const text = await file.async('text');
        const data = JSON.parse(text);
        console.log(`[getArchiveEntry] Extracted JSON, keys: ${Object.keys(data).length}`);
        return Response.json({ 
          type: 'json', 
          content: data,
          filename: entryPath.split('/').pop()
        });
      } catch (err) {
        return Response.json({ error: `Failed to extract JSON: ${err.message}` }, { status: 500 });
      }
    }

    if (responseType === 'base64') {
      try {
        const data = await file.async('arraybuffer');
        
        // Validate magic bytes
        const view = new Uint8Array(data.slice(0, 4));
        const magicBytes = Array.from(view).map(b => b.toString(16).padStart(2, '0')).join('');
        
        const ext = entryPath.split('.').pop().toLowerCase();
        const mimeTypes = {
          'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
          'gif': 'image/gif', 'webp': 'image/webp', 'mp4': 'video/mp4',
          'mov': 'video/quicktime', 'm4v': 'video/mp4', 'webm': 'video/webm',
          'html': 'text/html', 'htm': 'text/html'
        };
        const mime = mimeTypes[ext] || 'application/octet-stream';
        
        // Convert to base64 - handle large files
        const uint8Array = new Uint8Array(data);
        const chunkSize = 8192;
        let base64 = '';
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(i, i + chunkSize);
          base64 += String.fromCharCode(...chunk);
        }
        base64 = btoa(base64);
        
        console.log(`[getArchiveEntry] Extracted ${ext} (${data.byteLength} bytes, magic: ${magicBytes}), mime: ${mime}`);
        
        return Response.json({
          type: 'base64',
          mime,
          content: base64,
          size: data.byteLength,
          filename: entryPath.split('/').pop(),
          magic: magicBytes
        });
      } catch (err) {
        const errorMsg = `Failed to extract binary: ${err.message}`;
        console.error(`[getArchiveEntry] ${errorMsg}`);
        return Response.json({ error: errorMsg }, { status: 500 });
      }
    }

    return Response.json({ error: 'Invalid responseType' }, { status: 400 });
    
  } catch (error) {
    console.error('[getArchiveEntry] Unexpected error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});