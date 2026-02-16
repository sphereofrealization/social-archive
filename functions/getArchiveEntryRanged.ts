import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { BlobReader, BlobWriter, ZipReader, HttpReader, TextWriter } from 'npm:@zip.js/zip.js@2.7.34';

// In-memory cache for central directory (by URL)
const centralDirCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { zipUrl, entryPath, responseType = 'text' } = body;
    
    console.log(`[getArchiveEntryRanged] ENTRY_FETCH_REQUEST entryPath=${entryPath} responseType=${responseType} strategy=range`);
    
    if (!zipUrl || !entryPath) {
      return Response.json({ error: 'Missing zipUrl or entryPath' }, { status: 400 });
    }

    // Get or build central directory
    let centralDir = centralDirCache.get(zipUrl);
    
    if (!centralDir || Date.now() - centralDir.timestamp > CACHE_TTL_MS) {
      console.log(`[getArchiveEntryRanged] Building central directory for ${zipUrl}...`);
      
      try {
        // Use HttpReader for range-based access
        const httpReader = new HttpReader(zipUrl);
        const zipReader = new ZipReader(httpReader);
        
        const entries = await zipReader.getEntries();
        
        // Build path -> entry map
        const entryMap = new Map();
        entries.forEach(entry => {
          entryMap.set(entry.filename, entry);
        });
        
        centralDir = {
          entryMap,
          timestamp: Date.now()
        };
        
        centralDirCache.set(zipUrl, centralDir);
        
        console.log(`[getArchiveEntryRanged] Central directory built: ${entries.length} entries`);
      } catch (err) {
        console.error(`[getArchiveEntryRanged] Failed to build central directory: ${err.message}`);
        return Response.json({ 
          error: `Failed to access ZIP: ${err.message}`,
          hint: 'Check that the ZIP URL is accessible and supports HTTP Range requests'
        }, { status: 500 });
      }
    } else {
      console.log(`[getArchiveEntryRanged] Using cached central directory (${centralDir.entryMap.size} entries)`);
    }

    // Look up the entry
    const entry = centralDir.entryMap.get(entryPath);
    
    if (!entry) {
      const errorMsg = `Entry not found: ${entryPath}`;
      console.error(`[getArchiveEntryRanged] ENTRY_FETCH_ERROR status=404 ${errorMsg}`);
      
      // Find similar paths for debugging
      const allPaths = Array.from(centralDir.entryMap.keys());
      const similarPaths = allPaths
        .filter(p => p.toLowerCase().includes(entryPath.toLowerCase().split('/').pop()))
        .slice(0, 5);
      
      return Response.json({ 
        error: errorMsg,
        similarPaths: similarPaths.length > 0 ? similarPaths : allPaths.slice(0, 10)
      }, { status: 404 });
    }

    // Extract the entry using range requests
    try {
      if (responseType === 'text') {
        const writer = new TextWriter();
        const text = await entry.getData(writer);
        
        const elapsed = Date.now() - startTime;
        const bytesFetched = entry.compressedSize || 0;
        
        console.log(`[getArchiveEntryRanged] ENTRY_FETCH_OK bytesFetched=${bytesFetched} textLen=${text.length} ms=${elapsed}`);
        
        return Response.json({ 
          type: 'text', 
          content: text,
          filename: entryPath.split('/').pop(),
          stats: { bytesFetched, elapsed, strategy: 'range' }
        });
      }
      
      if (responseType === 'json') {
        const writer = new TextWriter();
        const text = await entry.getData(writer);
        const data = JSON.parse(text);
        
        const elapsed = Date.now() - startTime;
        console.log(`[getArchiveEntryRanged] ENTRY_FETCH_OK json ms=${elapsed}`);
        
        return Response.json({ 
          type: 'json', 
          content: data,
          filename: entryPath.split('/').pop(),
          stats: { elapsed, strategy: 'range' }
        });
      }
      
      if (responseType === 'base64') {
        const writer = new BlobWriter();
        const blob = await entry.getData(writer);
        
        // Convert blob to arraybuffer
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Convert to base64 in chunks
        const chunkSize = 8192;
        let base64 = '';
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(i, i + chunkSize);
          base64 += String.fromCharCode(...chunk);
        }
        base64 = btoa(base64);
        
        const ext = entryPath.split('.').pop().toLowerCase();
        const mimeTypes = {
          'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
          'gif': 'image/gif', 'webp': 'image/webp', 'mp4': 'video/mp4',
          'mov': 'video/quicktime', 'm4v': 'video/mp4', 'webm': 'video/webm'
        };
        const mime = mimeTypes[ext] || 'application/octet-stream';
        
        const elapsed = Date.now() - startTime;
        console.log(`[getArchiveEntryRanged] ENTRY_FETCH_OK base64 size=${arrayBuffer.byteLength} ms=${elapsed}`);
        
        return Response.json({
          type: 'base64',
          mime,
          content: base64,
          size: arrayBuffer.byteLength,
          filename: entryPath.split('/').pop(),
          stats: { elapsed, strategy: 'range' }
        });
      }
      
      return Response.json({ error: 'Invalid responseType' }, { status: 400 });
      
    } catch (extractErr) {
      const elapsed = Date.now() - startTime;
      console.error(`[getArchiveEntryRanged] ENTRY_FETCH_ERROR extraction failed: ${extractErr.message} ms=${elapsed}`);
      return Response.json({ 
        error: `Failed to extract entry: ${extractErr.message}` 
      }, { status: 500 });
    }
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[getArchiveEntryRanged] ENTRY_FETCH_ERROR unexpected: ${error.message} ms=${elapsed}`);
    return Response.json({ 
      error: error.message || 'Unknown error',
      stack: error.stack
    }, { status: 500 });
  }
});