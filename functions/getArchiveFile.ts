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

    // Extract by folder location
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      const pathLower = path.toLowerCase();
      
      // VIDEOS - by location
      if (pathLower.includes('/video') || pathLower.includes('/videos/')) {
        const size = file._data?.uncompressedSize || 0;
        data.videos.push({ 
          path, 
          filename: path.split('/').pop(), 
          size: size,
          sizeFormatted: `${(size / (1024 * 1024)).toFixed(2)} MB`
        });
      }
      
      // PHOTOS - by location
      if (pathLower.includes('/photo') || pathLower.includes('/photos/')) {
        if (path.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          try {
            const imageData = await file.async("base64");
            const ext = path.split('.').pop().toLowerCase();
            const mimeTypes = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'};
            data.photoFiles[path] = `data:${mimeTypes[ext] || 'image/jpeg'};base64,${imageData}`;
            data.photos.push({ path, filename: path.split('/').pop(), timestamp: "" });
          } catch {}
        }
      }
      
      // Process HTML files in specific folders
      if (path.endsWith('.html')) {
        try {
          const content = decode(await file.async("text"));
          
          // POSTS
          if (pathLower.includes('/post')) {
            const divMatches = content.match(/<div[^>]*>(.+?)<\/div>/gs) || [];
            divMatches.forEach(match => {
              const text = match.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
              if (text.length > 30 && text.length < 5000 && !data.posts.find(p => p.text === text)) {
                data.posts.push({ text, timestamp: "", photo_url: null, likes_count: 0, comments_count: 0, comments: [] });
              }
            });
          }
          
          // FRIENDS - skip headers/labels, only get actual names
          if (pathLower.includes('/friend')) {
            const skipLabels = ['Received', 'Your', 'People', 'Suggested', 'Contains', 'Information', 'Creation', 'Last', 'Suggestion', 'Name', 'Friend', 'Post', 'Connection', 'Time', 'Sent', 'Modified', 'May', 'Know'];
            const textContent = content.replace(/<[^>]*>/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
            textContent.forEach(line => {
              const isLabel = skipLabels.some(label => line === label || line.startsWith(label));
              if (!isLabel && line.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/) && line.length > 4 && line.length < 100) {
                if (!data.friends.find(f => f.name === line)) {
                  data.friends.push({ name: line, date_added: "" });
                }
              }
            });
          }
          
          // COMMENTS
          if (pathLower.includes('/comment')) {
            const divMatches = content.match(/<div[^>]*>(.+?)<\/div>/gs) || [];
            divMatches.forEach(match => {
              const text = match.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
              if (text.length > 5 && text.length < 1000 && !data.comments.find(c => c.text === text)) {
                data.comments.push({ text, timestamp: "", author: "" });
              }
            });
          }
          
          // GROUPS
          if (pathLower.includes('/group')) {
            const textContent = content.replace(/<[^>]*>/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
            textContent.forEach(line => {
              if (line.length > 3 && line.length < 200 && !data.groups.find(g => g.name === line)) {
                data.groups.push({ name: line, timestamp: "" });
              }
            });
          }
          
          // LIKES
          if (pathLower.includes('/like')) {
            const textContent = content.replace(/<[^>]*>/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
            textContent.forEach(line => {
              if (line.length > 2 && line.length < 300 && !data.likes.find(l => l.title === line)) {
                data.likes.push({ title: line, timestamp: "" });
              }
            });
          }
        } catch {}
      }
      
      // Process JSON files
      if (path.endsWith('.json')) {
        try {
          const content = await file.async("text");
          const json = JSON.parse(content);
          
          // MESSAGES
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
        } catch {}
      }
    }

    return Response.json(data);
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});