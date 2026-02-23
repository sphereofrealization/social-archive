import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();

    const body = await req.json();
    const { query, collections = ['archives_facebook'], limit = 10 } = body;

    if (!query) {
      return Response.json({ 
        ok: false, 
        error: 'Missing query' 
      }, { status: 400 });
    }

    const etoileApiKey = Deno.env.get('ETOILE_API_KEY_1');
    if (!etoileApiKey) {
      return Response.json({ 
        ok: false, 
        error: 'ETOILE_API_KEY_1 not configured' 
      }, { status: 500 });
    }

    const response = await fetch('https://etoile.dev/api/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${etoileApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        collections,
        limit
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json({ 
        ok: false, 
        error: data.error || 'Search failed',
        status: response.status
      }, { status: response.status });
    }

    return Response.json({
      ok: true,
      results: data.results || [],
      usage: data.usage
    });

  } catch (err) {
    console.error('[searchArchiveData] Error:', err);
    return Response.json({ 
      ok: false, 
      error: err.message 
    }, { status: 500 });
  }
});