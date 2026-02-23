import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    // Best-effort auth
    try {
      const base44 = createClientFromRequest(req);
      await base44.auth.me();
    } catch (authErr) {
      console.warn('[auth] Proceeding without Base44 user context');
    }

    const body = await req.json();
    const { query, collections = ['archives_facebook'], limit = 20 } = body;

    if (!query) {
      return Response.json({ 
        ok: false, 
        error: 'Missing query parameter' 
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

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({ 
        ok: false, 
        error: `Etoile API error: ${response.status} - ${errorText}` 
      }, { status: response.status });
    }

    const data = await response.json();
    
    return Response.json({
      ok: true,
      results: data.results || [],
      usage: data.usage
    });

  } catch (err) {
    console.error('[searchEtoile] Error:', err);
    return Response.json({ 
      ok: false, 
      error: err.message 
    }, { status: 500 });
  }
});