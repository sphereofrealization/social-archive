import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip@3.10.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const fileUrl = body.fileUrl;
    
    if (!fileUrl) {
      return Response.json({ error: 'Missing fileUrl parameter' }, { status: 400 });
    }

    console.log("📦 Downloading archive...");
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return Response.json({ error: `Failed to fetch: ${response.status}` }, { status: 400 });
    }
    
    const blob = await response.blob();
    const zip = await JSZip.loadAsync(blob);
    console.log("✅ ZIP loaded, extracting data...");
    
    const data = {
      profile: { name: "", email: "" },
      posts: [],
      friends: [],
      messages: [],
      photos: [],
      videos: [],
      photoFiles: {},
      videoFiles: {},
      comments: [],
      groups: [],
      marketplace: [],
      events: [],
      reviews: [],
      likes: []
    };

    const decode = (text) => {
      if (!text) return "";
      return String(text).replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
    };

    // Extract photos and videos first
    let photoCount = 0, videoCount = 0;
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      if (photoCount < 30 && path.match(/\.(jpg|jpeg|png|gif|webp)$/i) && !path.includes('icon')) {
        try {
          const imageData = await file.async("base64");
          const ext = path.split('.').pop().toLowerCase();
          const mimeType = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'}[ext] || 'image/jpeg';
          data.photoFiles[path] = `data:${mimeType};base64,${imageData}`;
          data.photos.push({ path, filename: path.split('/').pop(), timestamp: "" });
          photoCount++;
        } catch {}
      }
      
      if (path.match(/\.(mp4|mov|avi|webm|mkv|flv)$/i)) {
        const sizeInMB = (file._data?.uncompressedSize || 0) / (1024 * 1024);
        data.videos.push({ 
          path, 
          filename: path.split('/').pop(), 
          size: file._data?.uncompressedSize || 0,
          sizeFormatted: `${sizeInMB.toFixed(2)} MB`
        });
        videoCount++;
      }
    }
    
    console.log(`📸 Extracted ${photoCount} photos, ${videoCount} videos`);
    
    // Process all JSON files - check EVERY file for data
    console.log("📋 Processing JSON files...");
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir || !path.endsWith('.json')) continue;
      
      try {
        const content = await file.async("text");
        const json = JSON.parse(content);
        
        // MESSAGES
        if (json.messages && Array.isArray(json.messages) && json.messages.length > 0) {
          const msgs = json.messages.map(m => ({
            sender: decode(m.sender_name || ""),
            text: decode(m.content || ""),
            timestamp: m.timestamp_ms ? new Date(m.timestamp_ms).toLocaleString() : "",
            timestamp_ms: m.timestamp_ms || 0
          })).filter(m => m.text || m.sender);
          
          if (msgs.length > 0) {
            const participants = json.participants?.map(p => decode(p.name)).filter(n => n) || [];
            data.messages.push({
              conversation_with: decode(json.title || participants.join(", ") || "Unknown"),
              participants: participants,
              messages: msgs,
              lastMessageTimestamp: msgs[0]?.timestamp_ms || 0,
              totalMessages: msgs.length
            });
          }
        }
        
        // FRIENDS - check ALL possible keys
        const friendKeys = ['friends_v2', 'friends', 'followers_v2', 'followers', 'following_v2', 'following'];
        for (const key of friendKeys) {
          if (json[key] && Array.isArray(json[key])) {
            json[key].forEach(item => {
              if (item && item.name) {
                const name = decode(item.name);
                const timestamp = item.timestamp ? new Date(item.timestamp * 1000).toLocaleDateString() : "";
                if (name.length > 1 && !data.friends.find(f => f.name.toLowerCase() === name.toLowerCase())) {
                  data.friends.push({ name, date_added: timestamp });
                }
              }
            });
          }
        }
        
        // POSTS
        const postsArray = json.posts || (Array.isArray(json) ? json : []);
        postsArray.forEach(post => {
          if (post) {
            const text = decode(post.data?.[0]?.post || post.post || post.title || post.text || "");
            const timestamp = post.timestamp ? new Date(post.timestamp * 1000).toLocaleString() : "";
            if (text && text.length > 3) {
              data.posts.push({ text, timestamp, photo_url: null, likes_count: 0, comments_count: 0, comments: [] });
            }
          }
        });
        
        // COMMENTS
        const commentsArray = json.comments || (Array.isArray(json) && path.includes('comment') ? json : []);
        commentsArray.forEach(c => {
          if (c) {
            const text = decode(c.data?.[0]?.comment?.comment || c.comment || c.title || c.text || "");
            const timestamp = c.timestamp ? new Date(c.timestamp * 1000).toLocaleString() : "";
            const author = decode(c.author || c.data?.[0]?.comment?.author || "");
            if (text && text.length > 1) {
              data.comments.push({ text, timestamp, author });
            }
          }
        });
        
        // LIKES - check ALL possible keys
        const likeKeys = ['reactions_v2', 'reactions', 'likes_v2', 'likes', 'page_likes_v2', 'page_likes', 'pages_followed'];
        for (const key of likeKeys) {
          if (json[key] && Array.isArray(json[key])) {
            json[key].forEach(item => {
              if (item) {
                const title = decode(item.title || item.name || item.data?.[0]?.title || "");
                const timestamp = item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : "";
                if (title && title.length > 1) {
                  data.likes.push({ title, timestamp });
                }
              }
            });
          }
        }
        
        // GROUPS
        const groupKeys = ['groups_v2', 'groups', 'your_groups_v2', 'your_groups'];
        for (const key of groupKeys) {
          if (json[key]) {
            const groupsArray = Array.isArray(json[key]) ? json[key] : (json[key].groups_joined || []);
            groupsArray.forEach(g => {
              if (g) {
                const name = decode(g.name || g.title || "");
                const timestamp = g.timestamp ? new Date(g.timestamp * 1000).toLocaleString() : "";
                if (name && name.length > 1 && !data.groups.find(gr => gr.name.toLowerCase() === name.toLowerCase())) {
                  data.groups.push({ name, timestamp });
                }
              }
            });
          }
        }
        
        // REVIEWS
        const reviewKeys = ['reviews_written_v2', 'reviews_written', 'reviews'];
        for (const key of reviewKeys) {
          if (json[key] && Array.isArray(json[key])) {
            json[key].forEach(r => {
              if (r) {
                const text = decode(r.review_text || r.text || r.title || "");
                const timestamp = r.timestamp ? new Date(r.timestamp * 1000).toLocaleString() : "";
                if (text && text.length > 1) {
                  data.reviews.push({ text, timestamp });
                }
              }
            });
          }
        }
        
        // EVENTS
        if (path.includes('event')) {
          const eventsArray = json.events_joined || json.event_invitations || (Array.isArray(json) ? json : []);
          eventsArray.forEach(e => {
            if (e) {
              const name = decode(e.name || e.title || "");
              const timestamp = e.start_timestamp ? new Date(e.start_timestamp * 1000).toLocaleString() : 
                              e.timestamp ? new Date(e.timestamp * 1000).toLocaleString() : "";
              if (name && name.length > 1) {
                data.events.push({ text: name, timestamp });
              }
            }
          });
        }
        
        // MARKETPLACE
        if (path.includes('marketplace')) {
          const items = json.marketplace_items || (Array.isArray(json) ? json : [json]);
          items.forEach(item => {
            if (item) {
              const text = decode(item.name || item.title || "");
              const timestamp = item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : "";
              if (text && text.length > 1) {
                data.marketplace.push({ text, timestamp });
              }
            }
          });
        }
        
      } catch (err) {
        // Skip invalid JSON
      }
    }
    
    // Deduplicate
    data.friends = [...new Map(data.friends.map(f => [f.name.toLowerCase(), f])).values()];
    data.posts = [...new Map(data.posts.map(p => [p.text, p])).values()];
    data.comments = [...new Map(data.comments.map(c => [c.text, c])).values()];
    data.groups = [...new Map(data.groups.map(g => [g.name.toLowerCase(), g])).values()];
    data.messages.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
    
    console.log(`✅ EXTRACTION COMPLETE:`);
    console.log(`   Posts: ${data.posts.length}`);
    console.log(`   Friends: ${data.friends.length}`);
    console.log(`   Conversations: ${data.messages.length}`);
    console.log(`   Comments: ${data.comments.length}`);
    console.log(`   Likes: ${data.likes.length}`);
    console.log(`   Groups: ${data.groups.length}`);
    console.log(`   Events: ${data.events.length}`);
    console.log(`   Reviews: ${data.reviews.length}`);
    console.log(`   Marketplace: ${data.marketplace.length}`);

    return Response.json(data);
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});