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

    console.log('[indexArchiveToEtoile] Starting indexing...', {
      archiveId,
      platform,
      dataKeys: Object.keys(archiveData),
      indexKeys: archiveData.index ? Object.keys(archiveData.index) : null
    });

    // Helper to index item
    const indexItem = async (id, title, content, metadata) => {
      if (!content || content === 'No content') return null;
      
      try {
        const response = await fetch('https://etoile.dev/api/v1/index', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${etoileApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: `${archiveId}_${id}`,
            collection: collectionName,
            title,
            content,
            metadata: { ...metadata, archiveId, platform }
          })
        });

        if (response.ok) {
          return { success: true, id };
        } else {
          const errorText = await response.text();
          console.error('[indexItem] Failed:', errorText);
          return { success: false, error: errorText };
        }
      } catch (err) {
        console.error('[indexItem] Error:', err);
        return { success: false, error: err.message };
      }
    };

    // Index posts (from index structure or direct array)
    const posts = archiveData.index?.posts || archiveData.posts || [];
    if (Array.isArray(posts) && posts.length > 0) {
      console.log(`[indexArchiveToEtoile] Indexing ${posts.length} posts...`);
      for (const post of posts.slice(0, 200)) {
      for (const post of posts.slice(0, 200)) {
        const content = post.text || post.content;
        if (content) {
          const result = await indexItem(
            `post_${post.timestamp || Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            `Post from ${post.timestamp || 'unknown'}`,
            content,
            { type: 'post', timestamp: post.timestamp }
          );
          
          if (result) {
            result.success ? indexedItems.push({ type: 'post' }) : errors.push({ type: 'post', ...result });
          }
        }
      }
    }

    // Index comments
    const comments = archiveData.index?.comments || archiveData.comments || [];
    if (Array.isArray(comments) && comments.length > 0) {
      console.log(`[indexArchiveToEtoile] Indexing ${comments.length} comments...`);
      for (const comment of comments.slice(0, 200)) {
        const content = comment.text || comment.comment;
        if (content) {
          const result = await indexItem(
            `comment_${comment.timestamp || Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            `Comment from ${comment.timestamp || 'unknown'}`,
            content,
            { type: 'comment', timestamp: comment.timestamp }
          );
          
          if (result) {
            result.success ? indexedItems.push({ type: 'comment' }) : errors.push({ type: 'comment', ...result });
          }
        }
      }
    }

    // Index friends
    const friends = archiveData.index?.friends || archiveData.friends || [];
    if (Array.isArray(friends) && friends.length > 0) {
      console.log(`[indexArchiveToEtoile] Indexing ${friends.length} friends...`);
      for (const friend of friends.slice(0, 500)) {
        const name = friend.name || friend;
        if (name && typeof name === 'string') {
          const result = await indexItem(
            `friend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            `Friend: ${name}`,
            `Friend connection: ${name}`,
            { type: 'friend', name }
          );
          
          if (result) {
            result.success ? indexedItems.push({ type: 'friend' }) : errors.push({ type: 'friend', ...result });
          }
        }
      }
    }

    console.log('[indexArchiveToEtoile] Indexing complete:', {
      indexed: indexedItems.length,
      errors: errors.length
    });

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