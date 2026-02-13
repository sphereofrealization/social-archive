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
      return String(text)
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .trim();
    };

    // First pass: Extract media files
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
      
      // Videos - check for all video file extensions
      if (path.match(/\.(mp4|mov|avi|webm|mkv|flv|m4v|3gp|wmv)$/i)) {
        const size = file._data?.uncompressedSize || 0;
        data.videos.push({ 
          path, 
          filename: path.split('/').pop(), 
          size: size,
          sizeFormatted: `${(size / (1024 * 1024)).toFixed(2)} MB`
        });
      }
    }
    
    // Second pass: Process HTML and JSON files
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      try {
        // Process HTML files (Facebook's primary format)
        if (path.endsWith('.html')) {
          const content = decode(await file.async("text"));
          
          // Extract posts
          if (path.includes('post') || path.includes('timeline')) {
            const postMatches = content.match(/<div[^>]*>(.*?)<\/div>/gs) || [];
            postMatches.forEach(match => {
              const text = match.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
              if (text.length > 20 && text.length < 5000) {
                data.posts.push({ text, timestamp: "", photo_url: null, likes_count: 0, comments_count: 0, comments: [] });
              }
            });
          }
          
          // Extract friends
          if (path.includes('friend')) {
            const nameMatches = content.match(/>[A-Z][a-z]+\s+[A-Z][a-z]+</g) || [];
            nameMatches.forEach(match => {
              const name = match.slice(1, -1).trim();
              if (name.length > 3 && !data.friends.find(f => f.name === name)) {
                data.friends.push({ name, date_added: "" });
              }
            });
          }
          
          // Extract comments
          if (path.includes('comment')) {
            const commentMatches = content.match(/<div[^>]*>(.*?)<\/div>/gs) || [];
            commentMatches.forEach(match => {
              const text = match.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
              if (text.length > 10 && text.length < 2000) {
                data.comments.push({ text, timestamp: "", author: "" });
              }
            });
          }
          
          // Extract likes/reactions
          if (path.includes('like') || path.includes('reaction')) {
            const likeMatches = content.match(/>[^<]{3,100}</g) || [];
            likeMatches.forEach(match => {
              const title = match.slice(1, -1).trim();
              if (title.length > 3 && title.length < 200) {
                data.likes.push({ title, timestamp: "" });
              }
            });
          }
          
          // Extract groups
          if (path.includes('group')) {
            const groupMatches = content.match(/>[A-Z][^<]{3,100}</g) || [];
            groupMatches.forEach(match => {
              const name = match.slice(1, -1).trim();
              if (name.length > 3 && name.length < 150 && !data.groups.find(g => g.name === name)) {
                data.groups.push({ name, timestamp: "" });
              }
            });
          }
        }
        
        // Process JSON files (some data is in JSON)
        if (path.endsWith('.json')) {
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
        }
      } catch {}
    }
    
    // Deduplicate
    data.friends = [...new Map(data.friends.map(f => [f.name.toLowerCase(), f])).values()];
    data.posts = [...new Map(data.posts.map(p => [p.text, p])).values()].slice(0, 100);
    data.comments = [...new Map(data.comments.map(c => [c.text, c])).values()].slice(0, 100);
    data.likes = [...new Map(data.likes.map(l => [l.title.toLowerCase(), l])).values()].slice(0, 100);
    data.groups = [...new Map(data.groups.map(g => [g.name.toLowerCase(), g])).values()];
    data.messages.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);

    console.log(`Extracted: ${data.videos.length} videos, ${data.photos.length} photos, ${data.posts.length} posts, ${data.friends.length} friends, ${data.messages.length} conversations`);

    return Response.json(data);
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});