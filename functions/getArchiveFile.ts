import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const fileUrl = url.searchParams.get('fileUrl');
    
    if (!fileUrl) {
      return Response.json({ error: 'Missing fileUrl parameter' }, { status: 400 });
    }

    // Fetch file from DreamHost
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      return Response.json({ 
        error: `Failed to fetch file: HTTP ${response.status} ${response.statusText}` 
      }, { status: 500 });
    }

    const blob = await response.blob();
    
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': blob.size.toString(),
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    return Response.json({ 
      error: `Failed to get archive: ${error.message}` 
    }, { status: 500 });
  }
});