import { inflateRaw } from 'npm:fflate';

const VERSION = '2026-02-17T06:30:00Z';
const MAX_UNCOMPRESSED_BYTES_PER_ENTRY = 50 * 1024 * 1024; // 50MB
const MAX_CONCURRENCY = 2;
const DREAMHOST_ENDPOINT = Deno.env.get('DREAMHOST_ENDPOINT');
const DREAMHOST_BUCKET = Deno.env.get('DREAMHOST_BUCKET');
const DREAMHOST_ACCESS_KEY = Deno.env.get('DREAMHOST_ACCESS_KEY');
const DREAMHOST_SECRET_KEY = Deno.env.get('DREAMHOST_SECRET_KEY');

// Simple auth shim
async function authenticateUser(req) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  return token ? { email: 'user@app.local' } : null;
}

// S3 signature helper
async function signS3Request(method, path, body = null) {
  const encoder = new TextEncoder();
  const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = date.slice(0, 8);
  
  const canonicalUri = path;
  const canonicalQueryString = '';
  const canonicalHeaders = `host:${DREAMHOST_ENDPOINT}\nx-amz-date:${date}\n`;
  const signedHeaders = 'host;x-amz-date';
  
  const payloadHash = body ? 
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(body))))
      .map(b => b.toString(16).padStart(2, '0')).join('') : 
    'UNSIGNED-PAYLOAD';
  
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  const canonicalRequestHash = Array.from(new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest))
  )).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${credentialScope}\n${canonicalRequestHash}`;
  
  // Signing key derivation
  const kDate = await crypto.subtle.importKey(
    'raw', encoder.encode(`AWS4${DREAMHOST_SECRET_KEY}`), 
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const kDateSig = await crypto.subtle.sign('HMAC', kDate, encoder.encode(dateStamp));
  
  const kRegion = await crypto.subtle.importKey('raw', kDateSig, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kRegionSig = await crypto.subtle.sign('HMAC', kRegion, encoder.encode('us-east-1'));
  
  const kService = await crypto.subtle.importKey('raw', kRegionSig, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kServiceSig = await crypto.subtle.sign('HMAC', kService, encoder.encode('s3'));
  
  const kSigning = await crypto.subtle.importKey('raw', kServiceSig, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Array.from(new Uint8Array(
    await crypto.subtle.sign('HMAC', kSigning, encoder.encode(stringToSign))
  )).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const authHeader = `AWS4-HMAC-SHA256 Credential=${DREAMHOST_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return {
    headers: {
      'Authorization': authHeader,
      'x-amz-date': date,
      'Host': DREAMHOST_ENDPOINT
    }
  };
}

// Upload to S3
async function uploadToS3(key, data, contentType) {
  const path = `/${DREAMHOST_BUCKET}/${key}`;
  const { headers } = await signS3Request('PUT', path, data);
  
  const response = await fetch(`https://${DREAMHOST_ENDPOINT}${path}`, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': contentType,
      'Content-Length': data.byteLength.toString()
    },
    body: data
  });
  
  if (!response.ok) {
    throw new Error(`S3 upload failed: ${response.status} ${await response.text()}`);
  }
  
  return `https://${DREAMHOST_ENDPOINT}${path}`;
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  let stage = 'init';
  
  try {
    stage = 'auth';
    const user = await authenticateUser(req);
    if (!user) {
      return Response.json({ ok: false, stage, message: 'Unauthorized', version: VERSION }, { status: 401 });
    }

    stage = 'parse_body';
    const body = await req.json();
    const { archiveId, fileUrl, entriesByPath } = body;
    
    if (!archiveId || !fileUrl || !entriesByPath) {
      return Response.json({ 
        ok: false, 
        stage, 
        message: 'Missing archiveId, fileUrl, or entriesByPath',
        version: VERSION
      }, { status: 400 });
    }
    
    console.log(`[MATERIALIZE_START] archiveId=${archiveId} fileUrlHost=${new URL(fileUrl).hostname} candidates=${Object.keys(entriesByPath).length}`);
    
    // Filter to text entries only
    const TEXT_EXTENSIONS = ['.html', '.json', '.txt', '.csv'];
    const textEntries = Object.entries(entriesByPath).filter(([path]) => 
      TEXT_EXTENSIONS.some(ext => path.toLowerCase().endsWith(ext))
    );
    
    console.log(`[MATERIALIZE_FILTER] totalEntries=${Object.keys(entriesByPath).length} textEntries=${textEntries.length}`);
    
    const manifest = {
      archiveId,
      status: 'running',
      startedAt: new Date().toISOString(),
      totals: {
        totalZipEntries: Object.keys(entriesByPath).length,
        totalTextEntries: textEntries.length,
        materializedCount: 0,
        skippedCount: 0,
        errorCount: 0
      },
      entries: [],
      errors: []
    };
    
    stage = 'materialize_entries';
    
    // Process entries with limited concurrency
    for (let i = 0; i < textEntries.length; i += MAX_CONCURRENCY) {
      const batch = textEntries.slice(i, i + MAX_CONCURRENCY);
      
      await Promise.all(batch.map(async ([entryPath, meta]) => {
        try {
          const { localHeaderOffset, compressedSize, uncompressedSize, compressionMethod } = meta;
          
          if (uncompressedSize > MAX_UNCOMPRESSED_BYTES_PER_ENTRY) {
            manifest.totals.skippedCount++;
            manifest.errors.push({
              entryPath,
              reason: 'too_large',
              message: `Uncompressed size ${uncompressedSize} exceeds 50MB limit`
            });
            console.log(`[MATERIALIZE_SKIP] ${entryPath} size=${uncompressedSize} reason=too_large`);
            return;
          }
          
          // Fetch local header
          const localHeaderResp = await fetch(fileUrl, {
            headers: { 'Range': `bytes=${localHeaderOffset}-${localHeaderOffset + 64}` }
          });
          
          if (localHeaderResp.status !== 206) {
            throw new Error(`Failed to fetch local header: HTTP ${localHeaderResp.status}`);
          }
          
          const localHeaderBuf = await localHeaderResp.arrayBuffer();
          const localHeaderView = new DataView(localHeaderBuf);
          
          const fileNameLen = localHeaderView.getUint16(26, true);
          const extraFieldLen = localHeaderView.getUint16(28, true);
          const dataOffset = localHeaderOffset + 30 + fileNameLen + extraFieldLen;
          
          // Fetch compressed data
          const compressedDataResp = await fetch(fileUrl, {
            headers: { 'Range': `bytes=${dataOffset}-${dataOffset + compressedSize - 1}` }
          });
          
          if (compressedDataResp.status !== 206) {
            throw new Error(`Failed to fetch data: HTTP ${compressedDataResp.status}`);
          }
          
          const compressedData = await compressedDataResp.arrayBuffer();
          
          // Decompress
          let decompressedData;
          if (compressionMethod === 0) {
            decompressedData = new Uint8Array(compressedData);
          } else if (compressionMethod === 8) {
            decompressedData = inflateRaw(new Uint8Array(compressedData));
          } else {
            throw new Error(`Unsupported compression method: ${compressionMethod}`);
          }
          
          console.log(`[MATERIALIZE_ENTRY] ${entryPath} size=${uncompressedSize} method=${compressionMethod} compressed=${compressedSize}`);
          
          // Determine content type
          const ext = entryPath.toLowerCase().split('.').pop();
          const contentTypes = {
            'html': 'text/html; charset=utf-8',
            'json': 'application/json; charset=utf-8',
            'txt': 'text/plain; charset=utf-8',
            'csv': 'text/csv; charset=utf-8'
          };
          const contentType = contentTypes[ext] || 'application/octet-stream';
          
          // Upload to S3
          const storageKey = `archives/${archiveId}/entries/${entryPath}`;
          const url = await uploadToS3(storageKey, decompressedData, contentType);
          
          console.log(`[MATERIALIZE_UPLOAD_OK] ${entryPath} storageKey=${storageKey} urlLen=${url.length}`);
          
          manifest.entries.push({
            entryPath,
            size: uncompressedSize,
            mimeType: contentType,
            storageKey,
            url,
            materializedAt: new Date().toISOString()
          });
          
          manifest.totals.materializedCount++;
          
        } catch (err) {
          manifest.totals.errorCount++;
          manifest.errors.push({
            entryPath,
            reason: 'extraction_failed',
            message: err.message
          });
          console.error(`[MATERIALIZE_ERROR] ${entryPath} error=${err.message}`);
        }
      }));
      
      // Progress log every batch
      if ((i + MAX_CONCURRENCY) % 10 === 0 || i + MAX_CONCURRENCY >= textEntries.length) {
        console.log(`[MATERIALIZE_PROGRESS] processed=${Math.min(i + MAX_CONCURRENCY, textEntries.length)}/${textEntries.length} materialized=${manifest.totals.materializedCount} skipped=${manifest.totals.skippedCount} errors=${manifest.totals.errorCount}`);
      }
    }
    
    manifest.status = 'done';
    manifest.finishedAt = new Date().toISOString();
    
    // Upload manifest
    const manifestKey = `archives/${archiveId}/manifest.json`;
    const manifestUrl = await uploadToS3(
      manifestKey,
      new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
      'application/json'
    );
    
    const elapsed = Date.now() - startTime;
    console.log(`[MATERIALIZE_DONE] materializedCount=${manifest.totals.materializedCount} skippedCount=${manifest.totals.skippedCount} errorCount=${manifest.totals.errorCount} msTotal=${elapsed}`);
    
    return Response.json({
      ok: true,
      status: 'done',
      manifestUrl,
      manifestSummary: {
        materializedCount: manifest.totals.materializedCount,
        skippedCount: manifest.totals.skippedCount,
        errorCount: manifest.totals.errorCount,
        sampleUrlsFirst5: manifest.entries.slice(0, 5).map(e => ({ path: e.entryPath, url: e.url }))
      },
      version: VERSION,
      elapsed
    });
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[MATERIALIZE_FATAL] stage=${stage} error=${error.message} elapsed=${elapsed}`);
    console.error(`[MATERIALIZE_STACK]`, error.stack);
    
    return Response.json({
      ok: false,
      stage,
      message: error.message,
      stack: error.stack,
      version: VERSION,
      elapsed
    }, { status: 500 });
  }
});