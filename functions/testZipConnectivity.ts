import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { zipUrl } = body;
    
    if (!zipUrl) {
      return Response.json({ error: 'Missing zipUrl' }, { status: 400 });
    }

    console.log(`[testZipConnectivity] Testing ${zipUrl}`);
    
    // Test 1: HEAD request
    let headOk = false;
    let headHeaders = {};
    let headError = '';
    try {
      const headRes = await fetch(zipUrl, { method: 'HEAD' });
      headOk = headRes.ok;
      headHeaders = {
        'content-length': headRes.headers.get('content-length'),
        'accept-ranges': headRes.headers.get('accept-ranges'),
        'content-type': headRes.headers.get('content-type'),
        'etag': headRes.headers.get('etag'),
      };
      console.log(`[testZipConnectivity] HEAD ${headRes.status}:`, headHeaders);
    } catch (e) {
      headError = e.message;
      console.error(`[testZipConnectivity] HEAD failed:`, headError);
    }

    // Test 2: Range request
    let rangeOk = false;
    let rangeHeaders = {};
    let rangeError = '';
    let rangeStatus = 0;
    try {
      const rangeRes = await fetch(zipUrl, {
        headers: { 'Range': 'bytes=0-1023' }
      });
      rangeStatus = rangeRes.status;
      rangeHeaders = {
        'content-range': rangeRes.headers.get('content-range'),
        'content-length': rangeRes.headers.get('content-length'),
        'accept-ranges': rangeRes.headers.get('accept-ranges'),
        'access-control-allow-origin': rangeRes.headers.get('access-control-allow-origin'),
        'access-control-expose-headers': rangeRes.headers.get('access-control-expose-headers'),
      };
      rangeOk = rangeStatus === 206;
      console.log(`[testZipConnectivity] Range request ${rangeStatus}:`, rangeHeaders);
      
      if (!rangeOk && rangeStatus === 200) {
        rangeError = 'Server returned 200 instead of 206 Partial Content. Range requests may not work properly.';
      }
    } catch (e) {
      rangeError = e.message;
      console.error(`[testZipConnectivity] Range test failed:`, rangeError);
    }

    // Test 3: Check if Accept-Ranges header exists
    const acceptRanges = headHeaders['accept-ranges'] === 'bytes';
    
    return Response.json({
      zipUrl,
      headOk,
      rangeOk,
      rangeStatus,
      acceptRanges,
      headHeaders,
      rangeHeaders,
      headError,
      rangeError,
      summary: {
        canRandomAccess: acceptRanges && rangeOk,
        issues: [
          !acceptRanges && 'Server does not advertise Accept-Ranges: bytes',
          !rangeOk && rangeError,
          headHeaders['access-control-allow-origin'] && !headHeaders['access-control-allow-origin'].includes('*') && 'CORS may be restrictive',
        ].filter(Boolean)
      }
    });
  } catch (error) {
    console.error('[testZipConnectivity] Unexpected error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});