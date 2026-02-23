import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    // Best-effort Base44 auth: do not hard-fail for password-only sessions
    try {
      const base44 = createClientFromRequest(req);
      await base44.auth.me();
    } catch (authErr) {
      console.warn('[auth] Proceeding without Base44 user context:', authErr?.message);
    }

    const body = await req.json();
    const { archiveId, archiveData, platform = 'facebook' } = body;

    if (!archiveId || !archiveData) {
      return Response.json({ 
        ok: false, 
        error: 'Missing archiveId or archiveData' 
      }, { status: 400 });
    }

    const etoileApiKey = Deno.env.get('ETOILE_API_KEY_1');
    if (!etoileApiKey) {
      return Response.json({ 
        ok: false, 
        error: 'ETOILE_API_KEY_1 not configured' 
      }, { status: 500 });
    }

    const collectionName = `archives_${platform}`;
    const indexedItems = [];
    const errors = [];

    // Index posts
    if (archiveData.posts && Array.isArray(archiveData.posts)) {
      for (const post of archiveData.posts.slice(0, 100)) {
        try {
          const response = await fetch('https://etoile.dev/api/v1/index', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${etoileApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              id: `${archiveId}_post_${post.timestamp || Date.now()}`,
              collection: collectionName,
              title: `Post from ${post.timestamp || 'unknown date'}`,
              content: post.text || post.content || 'No content',
              metadata: {
                archiveId,
                type: 'post',
                timestamp: post.timestamp,
                platform
              }
            })
          });

          if (response.ok) {
            indexedItems.push({ type: 'post', id: post.timestamp });
          } else {
            errors.push({ type: 'post', error: await response.text() });
          }
        } catch (err) {
          errors.push({ type: 'post', error: err.message });
        }
      }
    }

    // Index comments
    if (archiveData.comments && Array.isArray(archiveData.comments)) {
      for (const comment of archiveData.comments.slice(0, 100)) {
        try {
          const response = await fetch('https://etoile.dev/api/v1/index', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${etoileApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              id: `${archiveId}_comment_${comment.timestamp || Date.now()}`,
              collection: collectionName,
              title: `Comment from ${comment.timestamp || 'unknown date'}`,
              content: comment.text || comment.comment || 'No content',
              metadata: {
                archiveId,
                type: 'comment',
                timestamp: comment.timestamp,
                platform
              }
            })
          });

          if (response.ok) {
            indexedItems.push({ type: 'comment', id: comment.timestamp });
          } else {
            errors.push({ type: 'comment', error: await response.text() });
          }
        } catch (err) {
          errors.push({ type: 'comment', error: err.message });
        }
      }
    }

    // Index messages
    if (archiveData.messages && Array.isArray(archiveData.messages)) {
      for (const conv of archiveData.messages.slice(0, 50)) {
        if (conv.messages && Array.isArray(conv.messages)) {
          for (const msg of conv.messages.slice(0, 10)) {
            try {
              const response = await fetch('https://etoile.dev/api/v1/index', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${etoileApiKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  id: `${archiveId}_message_${msg.timestamp || Date.now()}`,
                  collection: collectionName,
                  title: `Message with ${conv.conversation_with || 'unknown'}`,
                  content: msg.text || msg.content || 'No content',
                  metadata: {
                    archiveId,
                    type: 'message',
                    conversation: conv.conversation_with,
                    timestamp: msg.timestamp,
                    platform
                  }
                })
              });

              if (response.ok) {
                indexedItems.push({ type: 'message', conversation: conv.conversation_with });
              } else {
                errors.push({ type: 'message', error: await response.text() });
              }
            } catch (err) {
              errors.push({ type: 'message', error: err.message });
            }
          }
        }
      }
    }

    return Response.json({
      ok: true,
      indexed: indexedItems.length,
      errors: errors.length,
      details: {
        indexedItems: indexedItems.slice(0, 10),
        errors: errors.slice(0, 10)
      }
    });

  } catch (err) {
    console.error('[indexArchiveToEtoile] Error:', err);
    return Response.json({ 
      ok: false, 
      error: err.message,
      stack: err.stack 
    }, { status: 500 });
  }
});