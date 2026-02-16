import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { BlobReader, BlobWriter, ZipReader, HttpReader, TextWriter } from 'npm:@zip.js/zip.js@2.7.34';

// Shared cache with getArchiveEntryRanged
const centralDirCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { zipUrl, paths, responseType = 'text' } = body;
    
    console.log(`[getArchiveEntriesBatch] BATCH_FETCH_REQUEST paths=${paths?.length} responseType=${responseType}`);
    
    if (!zipUrl || !paths || !Array.isArray(paths) || paths.length === 0) {
      return Response.json({ error: 'Missing zipUrl or paths array' }, { status: 400 });
    }
    
    if (paths.length > 50) {
      return Response.json({ error: 'Maximum 50 paths per batch' }, { status: 400 });
    }

    // Get or build central directory
    let centralDir = centralDirCache.get(zipUrl);
    
    if (!centralDir || Date.now() - centralDir.timestamp > CACHE_TTL_MS) {
      console.log(`[getArchiveEntriesBatch] Building central directory for ${zipUrl}...`);
      
      try {
        const httpReader = new HttpReader(zipUrl);
        const zipReader = new ZipReader(httpReader);
        
        const entries = await zipReader.getEntries();
        
        const entryMap = new Map();
        entries.forEach(entry => {
          entryMap.set(entry.filename, entry);
        });
        
        centralDir = {
          entryMap,
          timestamp: Date.now()
        };
        
        centralDirCache.set(zipUrl, centralDir);
        
        console.log(`[getArchiveEntriesBatch] Central directory built: ${entries.length} entries`);
      } catch (err) {
        console.error(`[getArchiveEntriesBatch] Failed to build central directory: ${err.message}`);
        return Response.json({ 
          error: `Failed to access ZIP: ${err.message}`
        }, { status: 500 });
      }
    }

    // Extract all requested entries
    const results = {};
    const errors = {};
    let successCount = 0;
    let errorCount = 0;
    
    for (const entryPath of paths) {
      try {
        const entry = centralDir.entryMap.get(entryPath);
        
        if (!entry) {
          errors[entryPath] = 'Entry not found';
          errorCount++;
          continue;
        }
        
        if (responseType === 'text') {
          const writer = new TextWriter();
          const text = await entry.getData(writer);
          results[entryPath] = text;
          successCount++;
        } else if (responseType === 'json') {
          const writer = new TextWriter();
          const text = await entry.getData(writer);
          results[entryPath] = JSON.parse(text);
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
    
    const elapsed = Date.now() - startTime;
    console.log(`[getArchiveEntriesBatch] BATCH_FETCH_OK success=${successCount} errors=${errorCount} ms=${elapsed}`);
    
    return Response.json({
      results,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      stats: {
        requested: paths.length,
        success: successCount,
        errors: errorCount,
        elapsed,
        strategy: 'range-batch'
      }
    });
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[getArchiveEntriesBatch] BATCH_FETCH_ERROR: ${error.message} ms=${elapsed}`);
    return Response.json({ 
      error: error.message || 'Unknown error',
      stack: error.stack
    }, { status: 500 });
  }
});