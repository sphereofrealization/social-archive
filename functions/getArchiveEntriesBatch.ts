import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { BlobReader, BlobWriter, ZipReader, HttpRangeReader, TextWriter } from 'npm:@zip.js/zip.js@2.7.34';

// Shared cache with getArchiveEntryRanged
const centralDirCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

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
    const { zipUrl, paths, responseType = 'text' } = body;
    
    const fileUrlHost = new URL(zipUrl).hostname;
    const batchCount = paths?.length || 0;
    
    console.log(`[getArchiveEntriesBatch] BATCH_FETCH_REQUEST batchCount=${batchCount} responseType=${responseType} fileUrlHost=${fileUrlHost}`);
    
    if (!zipUrl || !paths || !Array.isArray(paths) || paths.length === 0) {
      return Response.json({ 
        ok: false, 
        stage, 
        message: 'Missing zipUrl or paths array',
        fileUrlHost,
        batchCount 
      }, { status: 400 });
    }
    
    if (paths.length > 50) {
      return Response.json({ 
        ok: false, 
        stage, 
        message: 'Maximum 50 paths per batch',
        fileUrlHost,
        batchCount: paths.length 
      }, { status: 400 });
    }

    // Get or build central directory (ONCE per request)
    stage = 'get_central_dir';
    let centralDir = centralDirCache.get(zipUrl);
    let zipReader = null;
    
    if (!centralDir || Date.now() - centralDir.timestamp > CACHE_TTL_MS) {
      stage = 'build_central_dir';
      console.log(`[getArchiveEntriesBatch] Building central directory for ${zipUrl}...`);
      
      const cdStartTime = Date.now();
      
      // Use HttpRangeReader for range-based access
      const httpReader = new HttpRangeReader(zipUrl);
      zipReader = new ZipReader(httpReader);
      
      const entries = await zipReader.getEntries();
      
      const entryMap = new Map();
      entries.forEach(entry => {
        entryMap.set(entry.filename, entry);
      });
      
      centralDir = {
        entryMap,
        timestamp: Date.now(),
        entryCount: entries.length
      };
      
      centralDirCache.set(zipUrl, centralDir);
      
      const cdElapsed = Date.now() - cdStartTime;
      console.log(`[getArchiveEntriesBatch] Central directory built: ${entries.length} entries in ${cdElapsed}ms`);
    } else {
      console.log(`[getArchiveEntriesBatch] Using cached central directory (${centralDir.entryMap.size} entries)`);
    }

    // Extract all requested entries (sequentially, no internal concurrency)
    stage = 'extract_entries';
    const results = {};
    const errors = {};
    let successCount = 0;
    let errorCount = 0;
    let totalUncompressedBytes = 0;
    let totalResponseBytes = 0;
    
    for (const entryPath of paths) {
      try {
        const entry = centralDir.entryMap.get(entryPath);
        
        if (!entry) {
          errors[entryPath] = 'Entry not found';
          errorCount++;
          continue;
        }
        
        const uncompressedSize = entry.uncompressedSize || 0;
        totalUncompressedBytes += uncompressedSize;
        
        if (responseType === 'text') {
          const writer = new TextWriter();
          const text = await entry.getData(writer);
          results[entryPath] = text;
          totalResponseBytes += text.length;
          successCount++;
          
          console.log(`[getArchiveEntriesBatch] Extracted ${entryPath}: uncompressed=${uncompressedSize} textLen=${text.length}`);
        } else if (responseType === 'json') {
          const writer = new TextWriter();
          const text = await entry.getData(writer);
          results[entryPath] = JSON.parse(text);
          totalResponseBytes += text.length;
          successCount++;
        } else {
          errors[entryPath] = 'Unsupported responseType for batch (use text or json)';
          errorCount++;
        }
        
      } catch (err) {
        console.error(`[getArchiveEntriesBatch] Failed to extract ${entryPath}: ${err.message}`);
        errors[entryPath] = err.message;
        errorCount++;
      }
    }
    
    // Close ZipReader if we opened it
    if (zipReader) {
      await zipReader.close();
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[getArchiveEntriesBatch] BATCH_FETCH_OK success=${successCount} errors=${errorCount} totalUncompressedBytes=${totalUncompressedBytes} totalResponseBytes=${totalResponseBytes} ms=${elapsed}`);
    
    return Response.json({
      ok: true,
      results,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      stats: {
        requested: paths.length,
        success: successCount,
        errors: errorCount,
        totalUncompressedBytes,
        totalResponseBytes,
        elapsed,
        strategy: 'range-batch'
      }
    });
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const fileUrlHost = error.zipUrl ? new URL(error.zipUrl).hostname : 'unknown';
    
    console.error(`[getArchiveEntriesBatch] BATCH_FETCH_ERROR stage=${stage} error=${error.message} ms=${elapsed}`);
    console.error(`[getArchiveEntriesBatch] Stack:`, error.stack);
    
    return Response.json({ 
      ok: false,
      stage,
      message: error.message || 'Unknown error',
      stack: error.stack,
      fileUrlHost,
      batchCount: 0,
      elapsed
    }, { status: 500 });
  }
});