import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { BlobReader, BlobWriter, ZipReader, HttpRangeReader, TextWriter } from 'npm:@zip.js/zip.js@2.7.34';

// In-memory cache for central directory (by URL)
const centralDirCache = new Map();
const rangeProbeCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Range probe helper
async function probeRangeSupport(fileUrl) {
  const cached = rangeProbeCache.get(fileUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }
  
  try {
    // Step 1: HEAD request
    const headResp = await fetch(fileUrl, { method: 'HEAD' });
    const contentLength = headResp.headers.get('content-length');
    const acceptRanges = headResp.headers.get('accept-ranges');
    
    console.log(`[probeRangeSupport] HEAD status=${headResp.status} content-length=${contentLength} accept-ranges=${acceptRanges}`);
    
    // Step 2: GET with Range header
    const rangeResp = await fetch(fileUrl, {
      headers: { 'Range': 'bytes=0-1' }
    });
    
    const contentRange = rangeResp.headers.get('content-range');
    console.log(`[probeRangeSupport] RANGE status=${rangeResp.status} content-range=${contentRange} content-length=${rangeResp.headers.get('content-length')}`);
    
    const result = {
      ok: rangeResp.status === 206,
      headStatus: headResp.status,
      rangeStatus: rangeResp.status,
      contentLength,
      acceptRanges,
      contentRange,
      message: rangeResp.status === 206 ? 'Range requests supported' : `Range not supported (status ${rangeResp.status})`
    };
    
    rangeProbeCache.set(fileUrl, { result, timestamp: Date.now() });
    return result;
  } catch (err) {
    return {
      ok: false,
      message: `Range probe failed: ${err.message}`,
      error: err.message
    };
  }
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  let stage = 'init';
  
  try {
    stage = 'auth';
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ ok: false, stage, message: 'Unauthorized' }, { status: 401 });
    }

    stage = 'parse_body';
    const body = await req.json();
    const { zipUrl, entryPath, responseType = 'text' } = body;
    
    const fileUrlHost = new URL(zipUrl).hostname;
    console.log(`[getArchiveEntryRanged] ENTRY_FETCH_REQUEST entryPath=${entryPath} responseType=${responseType} fileUrlHost=${fileUrlHost}`);
    
    if (!zipUrl || !entryPath) {
      return Response.json({ 
        ok: false, 
        stage, 
        message: 'Missing zipUrl or entryPath',
        fileUrlHost,
        entryPath 
      }, { status: 400 });
    }
    
    // PHASE 0: Range probe
    stage = 'range_probe';
    const rangeProbe = await probeRangeSupport(zipUrl);
    
    if (!rangeProbe.ok) {
      console.error(`[getArchiveEntryRanged] Range not supported: ${rangeProbe.message}`);
      return Response.json({
        ok: false,
        stage,
        message: 'Range requests not supported by storage',
        fileUrlHost,
        entryPath,
        rangeProbe
      }, { status: 400 });
    }
    
    console.log(`[getArchiveEntryRanged] Range probe OK: ${rangeProbe.message}`);

    // Get or build central directory
    stage = 'get_central_dir';
    let centralDir = centralDirCache.get(zipUrl);
    
    if (!centralDir || Date.now() - centralDir.timestamp > CACHE_TTL_MS) {
      stage = 'build_central_dir';
      console.log(`[getArchiveEntryRanged] Building central directory for ${zipUrl}...`);
      
      const cdStartTime = Date.now();
      
      // Use HttpRangeReader for range-based access
      const httpReader = new HttpRangeReader(zipUrl);
      const zipReader = new ZipReader(httpReader);
      
      const entries = await zipReader.getEntries();
      
      // Build path -> entry map
      const entryMap = new Map();
      entries.forEach(entry => {
        entryMap.set(entry.filename, entry);
      });
      
      await zipReader.close();
      
      centralDir = {
        entryMap,
        timestamp: Date.now(),
        entryCount: entries.length
      };
      
      centralDirCache.set(zipUrl, centralDir);
      
      const cdElapsed = Date.now() - cdStartTime;
      console.log(`[getArchiveEntryRanged] Central directory built: ${entries.length} entries in ${cdElapsed}ms`);
    } else {
      console.log(`[getArchiveEntryRanged] Using cached central directory (${centralDir.entryMap.size} entries)`);
    }

    // Look up the entry
    stage = 'lookup_entry';
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
        ok: false,
        stage,
        message: errorMsg,
        fileUrlHost,
        entryPath,
        similarPaths: similarPaths.length > 0 ? similarPaths : allPaths.slice(0, 10)
      }, { status: 404 });
    }

    // Extract the entry using range requests
    stage = 'extract_entry';
    const uncompressedSize = entry.uncompressedSize || 0;
    const compressedSize = entry.compressedSize || 0;
    
    console.log(`[getArchiveEntryRanged] Extracting: compressed=${compressedSize} uncompressed=${uncompressedSize}`);
    
    if (responseType === 'text') {
      const writer = new TextWriter();
      const text = await entry.getData(writer);
      
      const elapsed = Date.now() - startTime;
      const responseBytes = text.length;
      
      console.log(`[getArchiveEntryRanged] ENTRY_FETCH_OK uncompressedBytes=${uncompressedSize} responseBytes=${responseBytes} ms=${elapsed}`);
      
      return Response.json({ 
        ok: true,
        type: 'text', 
        content: text,
        filename: entryPath.split('/').pop(),
        stats: { 
          compressedSize, 
          uncompressedSize,
          responseBytes,
          elapsed, 
          strategy: 'range',
          stages: { total: elapsed }
        }
      });
    }
      
    if (responseType === 'json') {
      const writer = new TextWriter();
      const text = await entry.getData(writer);
      const data = JSON.parse(text);
      
      const elapsed = Date.now() - startTime;
      console.log(`[getArchiveEntryRanged] ENTRY_FETCH_OK json ms=${elapsed}`);
      
      return Response.json({ 
        ok: true,
        type: 'json', 
        content: data,
        filename: entryPath.split('/').pop(),
        stats: { elapsed, strategy: 'range' }
      });
    }
    
    if (responseType === 'base64' || responseType === 'binary') {
      stage = 'extract_binary';
      const writer = new BlobWriter();
      const blob = await entry.getData(writer);
      
      const arrayBuffer = await blob.arrayBuffer();
      const elapsed = Date.now() - startTime;
      
      const ext = entryPath.split('.').pop().toLowerCase();
      const mimeTypes = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'gif': 'image/gif', 'webp': 'image/webp', 'mp4': 'video/mp4',
        'mov': 'video/quicktime', 'm4v': 'video/mp4', 'webm': 'video/webm'
      };
      const mime = mimeTypes[ext] || 'application/octet-stream';
      
      console.log(`[getArchiveEntryRanged] ENTRY_FETCH_OK binary uncompressed=${uncompressedSize} responseBytes=${arrayBuffer.byteLength} ms=${elapsed}`);
      
      // Return raw binary (no base64 encoding)
      return new Response(arrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': arrayBuffer.byteLength.toString(),
          'Content-Disposition': `inline; filename="${entryPath.split('/').pop()}"`,
          'X-Stats': JSON.stringify({ elapsed, strategy: 'range', compressedSize, uncompressedSize })
        }
      });
    }
    
    return Response.json({ 
      ok: false, 
      stage, 
      message: 'Invalid responseType', 
      fileUrlHost, 
      entryPath 
    }, { status: 400 });
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const fileUrlHost = error.zipUrl ? new URL(error.zipUrl).hostname : 'unknown';
    
    console.error(`[getArchiveEntryRanged] ENTRY_FETCH_ERROR stage=${stage} error=${error.message} ms=${elapsed}`);
    console.error(`[getArchiveEntryRanged] Stack:`, error.stack);
    
    return Response.json({ 
      ok: false,
      stage,
      message: error.message || 'Unknown error',
      stack: error.stack,
      fileUrlHost,
      elapsed
    }, { status: 500 });
  }
});