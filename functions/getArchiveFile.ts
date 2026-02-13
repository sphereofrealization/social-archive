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
      
      // Videos - check for all video file extensions and "video" in path
      if (path.match(/\.(mp4|mov|avi|webm|mkv|flv|m4v|3gp|wmv)$/i) || path.toLowerCase().includes('video')) {
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
        // Process HTML files
        if (path.endsWith('.html')) {
          const content = decode(await file.async("text"));
          
          // Extract all text content between tags
          const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          const lines = textContent.split(/[,;|]/).map(l => l.trim()).filter(l => l.length > 0);
          
          // Friends
          if (path.includes('friend')) {
            lines.forEach(line => {
              // Look for capitalized names (First Last format)
              if (line.match(/^[A-Z][a-z]+\s+[A-Z][a-z]+$/) && line.length > 3 && line.length < 100) {
                if (!data.friends.find(f => f.name === line)) {
                  data.friends.push({ name: line, date_added: "" });
                }
              }
            });
          }
          
          // Posts
          if (path.includes('post') || path.includes('timeline')) {
            lines.forEach(line => {
              if (line.length > 20 && line.length < 5000 && !line.includes('http') && !line.match(/^[0-9]/)) {
                if (!data.posts.find(p => p.text === line)) {
                  data.posts.push({ text: line, timestamp: "", photo_url: null, likes_count: 0, comments_count: 0, comments: [] });
                }
              }
            });
          }
          
          // Comments
          if (path.includes('comment')) {
            lines.forEach(line => {
              if (line.length > 10 && line.length < 2000 && !line.includes('http')) {
                if (!data.comments.find(c => c.text === line)) {
                  data.comments.push({ text: line, timestamp: "", author: "" });
                }
              }
            });
          }
          
          // Likes/Reactions
          if (path.includes('like') || path.includes('reaction')) {
            lines.forEach(line => {
              if (line.length > 3 && line.length < 300 && !line.includes('http')) {
                if (!data.likes.find(l => l.title === line)) {
                  data.likes.push({ title: line, timestamp: "" });
                }
              }
            });
          }
          
          // Groups
          if (path.includes('group')) {
            lines.forEach(line => {
              if (line.length > 3 && line.length < 200 && !line.includes('http')) {
                if (!data.groups.find(g => g.name === line)) {
                  data.groups.push({ name: line, timestamp: "" });
                }
              }
            });
          }
        }
        
        // Process JSON files
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

    return Response.json(data);
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});