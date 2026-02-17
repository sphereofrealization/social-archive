import './_polyfills.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { inflateRaw } from 'npm:fflate';

const VERSION = '2026-02-17T01:00:00Z';

// Cache for range probe results (by URL)
const rangeProbeCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Range probe helper
async function probeRangeSupport(fileUrl) {
  const cached = rangeProbeCache.get(fileUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }
  
  try {
    // GET with Range header
    const rangeResp = await fetch(fileUrl, {
      headers: { 'Range': 'bytes=0-1' }
    });
    
    const contentRange = rangeResp.headers.get('content-range');
    console.log(`[probeRangeSupport] RANGE status=${rangeResp.status} content-range=${contentRange}`);
    
    const result = {
      ok: rangeResp.status === 206,
      status: rangeResp.status,
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
  
  // Runtime check
  const runtimeInfo = {
    bufferType: typeof Buffer,
    bufferDefined: typeof Buffer !== "undefined",
    hasTextDecoder: typeof TextDecoder !== "undefined",
    inflateRawDefined: typeof inflateRaw !== "undefined",
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
    const { zipUrl, entryPath, entriesByPath, responseType = 'text' } = body;
    
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
    
    if (!entriesByPath) {
      return Response.json({
        ok: false,
        stage,
        message: 'Missing entriesByPath metadata (frontend must provide from archive index)',
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
        message: 'Range requests not supported by storage; cannot do ranged ZIP access',
        fileUrlHost,
        entryPath,
        rangeProbe
      }, { status: 400 });
    }
    
    console.log(`[getArchiveEntryRanged] Range probe OK: ${rangeProbe.message}`);
    
    // PHASE 1: Lookup entry metadata
    stage = 'lookup_entry';
    const entryMeta = entriesByPath[entryPath];
    
    if (!entryMeta) {
      return Response.json({ 
        ok: false,
        stage,
        message: `Entry not found in manifest: ${entryPath}`,
        fileUrlHost,
        entryPath,
        hint: 'Entry metadata not in entriesByPath map'
      }, { status: 404 });
    }
    
    const { localHeaderOffset, compressedSize, uncompressedSize, compressionMethod } = entryMeta;
    
    console.log(`[getArchiveEntryRanged] Found entry: offset=${localHeaderOffset} compressed=${compressedSize} uncompressed=${uncompressedSize} method=${compressionMethod}`);
    
    // PHASE 2: Fetch local file header (first 30 bytes + variable lengths)
    stage = 'fetch_local_header';
    const localHeaderResp = await fetch(zipUrl, {
      headers: { 'Range': `bytes=${localHeaderOffset}-${localHeaderOffset + 29}` }
    });
    
    if (!localHeaderResp.ok || localHeaderResp.status !== 206) {
      return Response.json({
        ok: false,
        stage,
        message: `Failed to fetch local header: HTTP ${localHeaderResp.status}`,
        fileUrlHost,
        entryPath
      }, { status: 500 });
    }
    
    const localHeaderBuf = await localHeaderResp.arrayBuffer();
    const localHeaderView = new DataView(localHeaderBuf);
    
    // Verify local file header signature: 0x04034b50
    const localSig = localHeaderView.getUint32(0, true);
    if (localSig !== 0x04034b50) {
      return Response.json({
        ok: false,
        stage,
        message: `Invalid local file header signature: 0x${localSig.toString(16)}`,
        fileUrlHost,
        entryPath
      }, { status: 500 });
    }
    
    const fileNameLen = localHeaderView.getUint16(26, true);
    const extraFieldLen = localHeaderView.getUint16(28, true);
    
    const dataOffset = localHeaderOffset + 30 + fileNameLen + extraFieldLen;
    
    console.log(`[getArchiveEntryRanged] Local header parsed: fileNameLen=${fileNameLen} extraFieldLen=${extraFieldLen} dataOffset=${dataOffset}`);
    
    // PHASE 3: Fetch compressed data
    stage = 'fetch_compressed_data';
    const compressedDataResp = await fetch(zipUrl, {
      headers: { 'Range': `bytes=${dataOffset}-${dataOffset + compressedSize - 1}` }
    });
    
    if (!compressedDataResp.ok || compressedDataResp.status !== 206) {
      return Response.json({
        ok: false,
        stage,
        message: `Failed to fetch compressed data: HTTP ${compressedDataResp.status}`,
        fileUrlHost,
        entryPath
      }, { status: 500 });
    }
    
    const compressedData = await compressedDataResp.arrayBuffer();
    const actualCompressedSize = compressedData.byteLength;
    
    console.log(`[getArchiveEntryRanged] Fetched compressed data: expected=${compressedSize} actual=${actualCompressedSize}`);
    
    // PHASE 4: Decompress
    stage = 'decompress';
    let decompressedData;
    
    if (compressionMethod === 0) {
      // Stored (no compression)
      decompressedData = new Uint8Array(compressedData);
      console.log(`[getArchiveEntryRanged] No decompression needed (stored)`);
    } else if (compressionMethod === 8) {
      // Deflate using fflate (pure JS, no Buffer needed)
      const compressedU8 = new Uint8Array(compressedData);
      decompressedData = inflateRaw(compressedU8);
      console.log(`[getArchiveEntryRanged] Decompressed: ${decompressedData.byteLength} bytes`);
    } else {
      return Response.json({
        ok: false,
        stage,
        message: `Unsupported compression method: ${compressionMethod}`,
        fileUrlHost,
        entryPath
      }, { status: 500 });
    }
    
    const elapsed = Date.now() - startTime;
    
    // PHASE 5: Return response based on type
    stage = 'build_response';
    
    if (responseType === 'text') {
      const text = new TextDecoder('utf-8').decode(decompressedData);
      const responseBytes = text.length;
      
      console.log(`[getArchiveEntryRanged] ENTRY_FETCH_OK text uncompressed=${uncompressedSize} responseBytes=${responseBytes} bytesFetched=${actualCompressedSize} ms=${elapsed}`);
      
      return Response.json({ 
        ok: true,
        type: 'text', 
        content: text,
        filename: entryPath.split('/').pop(),
        stats: { 
          compressedSize: actualCompressedSize, 
          uncompressedSize: decompressedData.byteLength,
          responseBytes,
          elapsed, 
          strategy: 'range-manual',
          bytesFetched: actualCompressedSize
        },
        runtime: runtimeInfo
      });
    }
    
    if (responseType === 'json') {
      const text = new TextDecoder('utf-8').decode(decompressedData);
      const data = JSON.parse(text);
      
      console.log(`[getArchiveEntryRanged] ENTRY_FETCH_OK json ms=${elapsed}`);
      
      return Response.json({ 
        ok: true,
        type: 'json', 
        content: data,
        filename: entryPath.split('/').pop(),
        stats: { 
          elapsed, 
          strategy: 'range-manual',
          bytesFetched: actualCompressedSize
        }
      });
    }
    
    if (responseType === 'binary') {
      // Return raw binary (no base64)
      const ext = entryPath.split('.').pop().toLowerCase();
      const mimeTypes = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'gif': 'image/gif', 'webp': 'image/webp', 'mp4': 'video/mp4',
        'mov': 'video/quicktime', 'm4v': 'video/mp4', 'webm': 'video/webm'
      };
      const mime = mimeTypes[ext] || 'application/octet-stream';
      
      console.log(`[getArchiveEntryRanged] ENTRY_FETCH_OK binary uncompressed=${uncompressedSize} mime=${mime} bytesFetched=${actualCompressedSize} ms=${elapsed}`);
      
      return new Response(decompressedData, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': decompressedData.byteLength.toString(),
          'Content-Disposition': `inline; filename="${entryPath.split('/').pop()}"`,
          'X-Stats': JSON.stringify({ 
            elapsed, 
            strategy: 'range-manual', 
            compressedSize: actualCompressedSize,
            uncompressedSize: decompressedData.byteLength,
            bytesFetched: actualCompressedSize
          })
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
    const fileUrlHost = 'unknown';
    
    console.error(`[getArchiveEntryRanged] ENTRY_FETCH_ERROR stage=${stage} error=${error.message} ms=${elapsed}`);
    console.error(`[getArchiveEntryRanged] Stack:`, error.stack);
    
    return Response.json({ 
      ok: false,
      stage,
      message: error.message || 'Unknown error',
      stack: error.stack,
      fileUrlHost,
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