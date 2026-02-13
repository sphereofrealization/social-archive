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

    const response = await fetch(fileUrl);
    if (!response.ok) {
      return Response.json({ error: `Failed to fetch: ${response.status}` }, { status: 400 });
    }
    
    const blob = await response.blob();
    const zip = await JSZip.loadAsync(blob);
    
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

    // Extract media
    let photoCount = 0;
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      // Photos
      if (photoCount < 30 && path.match(/\.(jpg|jpeg|png|gif|webp)$/i) && !path.includes('icon')) {
        try {
          const imageData = await file.async("base64");
          const ext = path.split('.').pop().toLowerCase();
          const mimeTypes = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'};
          data.photoFiles[path] = `data:${mimeTypes[ext] || 'image/jpeg'};base64,${imageData}`;
          data.photos.push({ path, filename: path.split('/').pop(), timestamp: "" });
          photoCount++;
        } catch {}
      }
      
      // Videos
      if (path.match(/\.(mp4|mov|avi|webm|mkv|flv|m4v)$/i)) {
        const size = file._data?.uncompressedSize || 0;
        data.videos.push({ 
          path, 
          filename: path.split('/').pop(), 
          size: size,
          sizeFormatted: `${(size / (1024 * 1024)).toFixed(2)} MB`
        });
      }
    }
    
    // Process JSON files
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir || !path.endsWith('.json')) continue;
      
      try {
        const content = await file.async("text");
        const json = JSON.parse(content);
        
        // Messages
        if (json.messages && Array.isArray(json.messages)) {
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
        
        // Friends
        ['friends_v2', 'friends', 'followers_v2', 'followers', 'following_v2', 'following'].forEach(key => {
          if (json[key] && Array.isArray(json[key])) {
            json[key].forEach(item => {
              if (item?.name) {
                const name = decode(item.name);
                if (name.length > 1 && !data.friends.find(f => f.name.toLowerCase() === name.toLowerCase())) {
                  data.friends.push({ name, date_added: item.timestamp ? new Date(item.timestamp * 1000).toLocaleDateString() : "" });
                }
              }
            });
          }
        });
        
        // Posts
        (json.posts || (Array.isArray(json) ? json : [])).forEach(post => {
          if (post) {
            const text = decode(post.data?.[0]?.post || post.post || post.title || post.text || "");
            if (text.length > 3) {
              data.posts.push({ text, timestamp: post.timestamp ? new Date(post.timestamp * 1000).toLocaleString() : "", photo_url: null, likes_count: 0, comments_count: 0, comments: [] });
            }
          }
        });
        
        // Comments
        (json.comments || (Array.isArray(json) && path.includes('comment') ? json : [])).forEach(c => {
          if (c) {
            const text = decode(c.data?.[0]?.comment?.comment || c.comment || c.title || c.text || "");
            if (text.length > 1) {
              data.comments.push({ text, timestamp: c.timestamp ? new Date(c.timestamp * 1000).toLocaleString() : "", author: decode(c.author || "") });
            }
          }
        });
        
        // Likes
        ['reactions_v2', 'reactions', 'likes_v2', 'likes', 'page_likes_v2', 'page_likes', 'pages_followed'].forEach(key => {
          if (json[key] && Array.isArray(json[key])) {
            json[key].forEach(item => {
              if (item) {
                const title = decode(item.title || item.name || item.data?.[0]?.title || "");
                if (title.length > 1) {
                  data.likes.push({ title, timestamp: item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : "" });
                }
              }
            });
          }
        });
        
        // Groups
        ['groups_v2', 'groups', 'your_groups_v2', 'your_groups'].forEach(key => {
          if (json[key]) {
            const groupsArray = Array.isArray(json[key]) ? json[key] : (json[key].groups_joined || []);
            groupsArray.forEach(g => {
              if (g?.name) {
                const name = decode(g.name);
                if (name.length > 1 && !data.groups.find(gr => gr.name.toLowerCase() === name.toLowerCase())) {
                  data.groups.push({ name, timestamp: g.timestamp ? new Date(g.timestamp * 1000).toLocaleString() : "" });
                }
              }
            });
          }
        });
        
        // Reviews
        ['reviews_written_v2', 'reviews_written', 'reviews'].forEach(key => {
          if (json[key] && Array.isArray(json[key])) {
            json[key].forEach(r => {
              if (r) {
                const text = decode(r.review_text || r.text || r.title || "");
                if (text.length > 1) {
                  data.reviews.push({ text, timestamp: r.timestamp ? new Date(r.timestamp * 1000).toLocaleString() : "" });
                }
              }
            });
          }
        });
        
        // Events
        if (path.includes('event')) {
          (json.events_joined || json.event_invitations || (Array.isArray(json) ? json : [])).forEach(e => {
            if (e?.name) {
              data.events.push({ text: decode(e.name), timestamp: e.start_timestamp ? new Date(e.start_timestamp * 1000).toLocaleString() : "" });
            }
          });
        }
        
        // Marketplace
        if (path.includes('marketplace')) {
          (json.marketplace_items || (Array.isArray(json) ? json : [json])).forEach(item => {
            if (item?.name || item?.title) {
              data.marketplace.push({ text: decode(item.name || item.title || ""), timestamp: item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : "" });
            }
          });
        }
        
      } catch {}
    }
    
    // Deduplicate
    data.friends = [...new Map(data.friends.map(f => [f.name.toLowerCase(), f])).values()];
    data.posts = [...new Map(data.posts.map(p => [p.text, p])).values()];
    data.comments = [...new Map(data.comments.map(c => [c.text, c])).values()];
    data.groups = [...new Map(data.groups.map(g => [g.name.toLowerCase(), g])).values()];
    data.messages.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);

    return Response.json(data);
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});