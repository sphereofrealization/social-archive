import { inflateRaw } from 'npm:fflate@0.8.2';
import { createHmac } from 'node:crypto';

const VERSION = '2026-02-17T08:00:00Z';
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

// AWS Signature V4
function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(regionName).digest();
  const kService = createHmac('sha256', kRegion).update(serviceName).digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  return kSigning;
}

function sha256(data) {
  const hash = createHmac('sha256', '').update(data).digest('hex');
  return hash;
}

async function uploadToS3(key, data, contentType) {
  const region = 'us-east-1';
  const service = 's3';
  const host = DREAMHOST_ENDPOINT;
  const endpoint = `https://${host}/${DREAMHOST_BUCKET}/${key}`;
  
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);
  
  const payloadHash = sha256(typeof data === 'string' ? data : new TextDecoder().decode(data));
  
  const canonicalUri = `/${DREAMHOST_BUCKET}/${key}`;
  const canonicalQueryString = '';
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  
  const canonicalRequest = `PUT\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${sha256(canonicalRequest)}`;
  
  const signingKey = getSignatureKey(DREAMHOST_SECRET_KEY, dateStamp, region, service);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  
  const authorizationHeader = `${algorithm} Credential=${DREAMHOST_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      'Host': host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Authorization': authorizationHeader,
      'Content-Type': contentType
    },
    body: data
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`S3 upload failed: ${response.status} ${errorText}`);
  }
  
  return endpoint;
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
    const { archiveId, fileUrl } = body;
    
    if (!archiveId || !fileUrl) {
      return Response.json({ 
        ok: false, 
        stage, 
        message: 'Missing archiveId or fileUrl',
        version: VERSION
      }, { status: 400 });
    }
    
    const fileUrlHost = new URL(fileUrl).hostname;
    console.log(`[PREP_START] archiveId=${archiveId} fileUrlHost=${fileUrlHost} version=${VERSION}`);
    
    // Step 1: Get ZIP metadata via HTTP request to extractArchiveDataStreaming
    stage = 'get_index';
    console.log(`[PREP_INDEX] Fetching archive index from extractArchiveDataStreaming...`);
    
    // Build the full URL to the extraction endpoint
    // Try to construct URL from environment or request context
    let extractUrl;
    const baseUrl = new URL(req.url);
    
    // Check if we're on a function subdomain (e.g., https://functions-user-app.base44.workers.dev/)
    if (baseUrl.hostname.includes('base44')) {
      // Use same origin
      extractUrl = `${baseUrl.origin}/extractArchiveDataStreaming`;
    } else {
      // Fallback: try to determine from Deno.env or use relative path
      const appUrl = Deno.env.get('BASE44_APP_URL');
      if (appUrl) {
        extractUrl = `${appUrl}/extractArchiveDataStreaming`;
      } else {
        // Last resort: use relative to current function URL
        extractUrl = baseUrl.origin.replace(/\/[^/]+$/, '/extractArchiveDataStreaming');
      }
    }
    
    console.log(`[PREP_INDEX] Calling ${extractUrl}...`);
    
    const indexResp = await fetch(extractUrl, {
      method: 'POST',
      headers: {
        'Authorization': req.headers.get('authorization'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileUrl })
    });
    
    if (!indexResp.ok) {
      const errorText = await indexResp.text();
      throw new Error(`Failed to fetch index: HTTP ${indexResp.status} - ${errorText}`);
    }
    
    const indexData = await indexResp.json();
    
    if (!indexData.index?.entriesByPath) {
      throw new Error('Index missing entriesByPath');
    }
    
    const entriesByPath = indexData.index.entriesByPath;
    const allPaths = indexData.index.all || Object.keys(entriesByPath);
    
    console.log(`[PREP_INDEX_OK] totalEntries=${allPaths.length} entriesByPathCount=${Object.keys(entriesByPath).length}`);
    
    // Step 2: Filter to text entries only
    stage = 'filter_entries';
    const TEXT_EXTENSIONS = ['.html', '.json', '.txt', '.csv'];
    const textEntries = Object.entries(entriesByPath).filter(([path]) => 
      TEXT_EXTENSIONS.some(ext => path.toLowerCase().endsWith(ext))
    );
    
    console.log(`[PREP_FILTER] totalEntries=${Object.keys(entriesByPath).length} textEntries=${textEntries.length}`);
    
    const manifest = {
      archiveId,
      status: 'running',
      startedAt: new Date().toISOString(),
      totals: {
        totalZipEntries: allPaths.length,
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
            console.log(`[PREP_SKIP] ${entryPath} size=${uncompressedSize} reason=too_large`);
            return;
          }
          
          // Fetch local header to get filename and extra field lengths
          const localHeaderResp = await fetch(fileUrl, {
            headers: { 'Range': `bytes=${localHeaderOffset}-${localHeaderOffset + 29}` }
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
          
          const compressedData = new Uint8Array(await compressedDataResp.arrayBuffer());
          
          // Decompress
          let decompressedData;
          if (compressionMethod === 0) {
            decompressedData = compressedData;
          } else if (compressionMethod === 8) {
            decompressedData = inflateRaw(compressedData);
          } else {
            throw new Error(`Unsupported compression method: ${compressionMethod}`);
          }
          
          console.log(`[PREP_EXTRACT_OK] ${entryPath} bytes=${decompressedData.byteLength}`);
          
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
          
          console.log(`[PREP_UPLOAD_OK] ${entryPath} urlLen=${url.length}`);
          
          manifest.entries.push({
            entryPath,
            url,
            mimeType: contentType,
            uncompressedSize: decompressedData.byteLength,
            compressedSize: compressedSize,
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
          console.error(`[PREP_ERROR_ENTRY] ${entryPath} error=${err.message}`);
        }
      }));
      
      // Progress log every batch
      if ((i + MAX_CONCURRENCY) % 10 === 0 || i + MAX_CONCURRENCY >= textEntries.length) {
        console.log(`[PREP_PROGRESS] processed=${Math.min(i + MAX_CONCURRENCY, textEntries.length)}/${textEntries.length} materialized=${manifest.totals.materializedCount} skipped=${manifest.totals.skippedCount} errors=${manifest.totals.errorCount}`);
      }
    }
    
    manifest.status = 'done';
    manifest.finishedAt = new Date().toISOString();
    
    // Upload manifest
    stage = 'upload_manifest';
    const manifestKey = `archives/${archiveId}/manifest.json`;
    const manifestUrl = await uploadToS3(
      manifestKey,
      JSON.stringify(manifest, null, 2),
      'application/json'
    );
    
    const elapsed = Date.now() - startTime;
    console.log(`[PREP_DONE] materializedCount=${manifest.totals.materializedCount} skippedCount=${manifest.totals.skippedCount} errorCount=${manifest.totals.errorCount} msTotal=${elapsed} version=${VERSION}`);
    
    return Response.json({
      ok: true,
      manifestUrl,
      counts: {
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
    console.error(`[PREP_FATAL] stage=${stage} error=${error.message} elapsed=${elapsed}`);
    console.error(`[PREP_STACK]`, error.stack);
    
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