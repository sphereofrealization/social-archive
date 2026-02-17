import './_polyfills.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { inflateRaw, gzipSync } from 'npm:fflate';

const VERSION = '2026-02-17T02:00:00Z';

const MAX_TOTAL_UNCOMPRESSED_BYTES = 5 * 1024 * 1024; // 5MB safety limit
const DEFAULT_BATCH_SIZE = 1; // Start conservatively

Deno.serve(async (req) => {
  const startTime = Date.now();
  let stage = 'init';
  
  // Runtime check
  const runtimeInfo = {
    bufferType: typeof Buffer,
    bufferDefined: typeof Buffer !== "undefined",
    hasTextDecoder: typeof TextDecoder !== "undefined",
    inflateRawDefined: typeof inflateRaw !== "undefined",
    gzipSyncDefined: typeof gzipSync !== "undefined",
    version: VERSION
  };
  console.log(`[RANGE_RUNTIME]`, runtimeInfo);
  
  try {
    stage = 'auth';
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ ok: false, stage, message: 'Unauthorized' }, { status: 401 });
    }

    stage = 'parse_body';
    const body = await req.json();
    const { zipUrl, paths, entriesByPath, responseType = 'text' } = body;
    
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
    
    if (!entriesByPath) {
      return Response.json({
        ok: false,
        stage,
        message: 'Missing entriesByPath metadata',
        fileUrlHost,
        batchCount
      }, { status: 400 });
    }
    
    if (paths.length > 10) {
      return Response.json({ 
        ok: false, 
        stage, 
        message: 'Maximum 10 paths per batch (safety limit)',
        fileUrlHost,
        batchCount: paths.length 
      }, { status: 400 });
    }

    // Extract all requested entries sequentially
    stage = 'extract_entries';
    const results = {};
    const errors = {};
    let successCount = 0;
    let errorCount = 0;
    let totalUncompressedBytes = 0;
    let totalCompressedBytesFetched = 0;
    
    for (const entryPath of paths) {
      try {
        const entryMeta = entriesByPath[entryPath];
        
        if (!entryMeta) {
          errors[entryPath] = 'Entry not found in manifest';
          errorCount++;
          continue;
        }
        
        const { localHeaderOffset, compressedSize, uncompressedSize, compressionMethod } = entryMeta;
        
        // Safety check: abort if we exceed total uncompressed bytes limit
        if (totalUncompressedBytes + uncompressedSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
          errors[entryPath] = `Skipped: would exceed safety limit (${MAX_TOTAL_UNCOMPRESSED_BYTES} bytes)`;
          errorCount++;
          console.log(`[getArchiveEntriesBatch] Safety limit reached at ${totalUncompressedBytes} bytes`);
          break;
        }
        
        // Fetch local header
        const localHeaderResp = await fetch(zipUrl, {
          headers: { 'Range': `bytes=${localHeaderOffset}-${localHeaderOffset + 29}` }
        });
        
        if (!localHeaderResp.ok || localHeaderResp.status !== 206) {
          errors[entryPath] = `Failed to fetch local header: HTTP ${localHeaderResp.status}`;
          errorCount++;
          continue;
        }
        
        const localHeaderBuf = await localHeaderResp.arrayBuffer();
        const localHeaderView = new DataView(localHeaderBuf);
        
        const fileNameLen = localHeaderView.getUint16(26, true);
        const extraFieldLen = localHeaderView.getUint16(28, true);
        const dataOffset = localHeaderOffset + 30 + fileNameLen + extraFieldLen;
        
        // Fetch compressed data
        const compressedDataResp = await fetch(zipUrl, {
          headers: { 'Range': `bytes=${dataOffset}-${dataOffset + compressedSize - 1}` }
        });
        
        if (!compressedDataResp.ok || compressedDataResp.status !== 206) {
          errors[entryPath] = `Failed to fetch data: HTTP ${compressedDataResp.status}`;
          errorCount++;
          continue;
        }
        
        const compressedData = await compressedDataResp.arrayBuffer();
        totalCompressedBytesFetched += compressedData.byteLength;
        
        // Decompress
        let decompressedData;
        
        if (compressionMethod === 0) {
          decompressedData = new Uint8Array(compressedData);
        } else if (compressionMethod === 8) {
          const compressedU8 = new Uint8Array(compressedData);
          decompressedData = inflateRaw(compressedU8);
        } else {
          errors[entryPath] = `Unsupported compression method: ${compressionMethod}`;
          errorCount++;
          continue;
        }
        
        totalUncompressedBytes += decompressedData.byteLength;
        
        if (responseType === 'text') {
          const text = new TextDecoder('utf-8').decode(decompressedData);
          results[entryPath] = text;
          successCount++;
          
          console.log(`[getArchiveEntriesBatch] Extracted ${entryPath}: compressed=${compressedData.byteLength} uncompressed=${decompressedData.byteLength} textLen=${text.length}`);
        } else if (responseType === 'json') {
          const text = new TextDecoder('utf-8').decode(decompressedData);
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
    const responsePayload = {
      ok: true,
      results,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      stats: {
        requested: paths.length,
        success: successCount,
        errors: errorCount,
        totalUncompressedBytes,
        totalCompressedBytesFetched,
        elapsed,
        strategy: 'range-manual-batch'
      },
      runtime: runtimeInfo
    };
    
    // Gzip response if large
    const responseJson = JSON.stringify(responsePayload);
    const shouldGzip = responseJson.length > 50000;
    
    console.log(`[getArchiveEntriesBatch] BATCH_FETCH_OK success=${successCount} errors=${errorCount} totalUncompressedBytes=${totalUncompressedBytes} totalCompressedBytesFetched=${totalCompressedBytesFetched} responseBytes=${responseJson.length} gzipped=${shouldGzip} ms=${elapsed}`);
    
    if (shouldGzip) {
      const encoder = new TextEncoder();
      const gzipped = gzipSync(encoder.encode(responseJson));
      return new Response(gzipped, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Content-Length': gzipped.byteLength.toString()
        }
      });
    }
    
    return Response.json(responsePayload);
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const fileUrlHost = 'unknown';
    
    console.error(`[getArchiveEntriesBatch] BATCH_FETCH_ERROR stage=${stage} error=${error.message} ms=${elapsed}`);
    console.error(`[getArchiveEntriesBatch] Stack:`, error.stack);
    
    return Response.json({ 
      ok: false,
      stage,
      message: error.message || 'Unknown error',
      stack: error.stack,
      fileUrlHost,
      batchCount: 0,
      elapsed,
      runtime: {
        bufferType: typeof Buffer,
        bufferDefined: typeof Buffer !== 'undefined',
        bufferConstructor: typeof Buffer !== 'undefined' ? Buffer.constructor.name : 'N/A',
        hasTextDecoder: typeof TextDecoder !== 'undefined',
        deno: typeof Deno !== 'undefined',
        version: VERSION
      }
    }, { status: 500 });
  }
});