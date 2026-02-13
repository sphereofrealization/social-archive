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
    console.log("📦 ZIP loaded, extracting data...");
    
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

    // UTF-8 decode for Facebook's encoding
    const decode = (text) => {
      if (!text) return "";
      try {
        // Facebook uses latin1 encoding, need to convert
        const bytes = new TextEncoder().encode(text);
        const decoded = new TextDecoder('utf-8').decode(bytes);
        return decoded
          .replace(/&#039;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ')
          .trim();
      } catch {
        return text.trim();
      }
    };

    // PHASE 1: Extract limited photos (30) and videos (10)
    console.log("📸 Extracting media...");
    let photoCount = 0, videoCount = 0;
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      // Photos
      if (photoCount < 30 && path.match(/\.(jpg|jpeg|png|gif|webp)$/i) && !path.includes('icon')) {
        try {
          const imageData = await file.async("base64");
          const ext = path.split('.').pop().toLowerCase();
          const mimeType = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'}[ext] || 'image/jpeg';
          data.photoFiles[path] = `data:${mimeType};base64,${imageData}`;
          data.photos.push({ path, filename: path.split('/').pop(), timestamp: "" });
          photoCount++;
        } catch (err) {}
      }
      
      // Videos (metadata only, no base64 to avoid timeout)
      if (path.match(/\.(mp4|mov|avi|webm)$/i)) {
        data.videos.push({ path, filename: path.split('/').pop(), size: file._data?.uncompressedSize || 0 });
        videoCount++;
      }
    }
    console.log(`✅ Extracted ${photoCount} photos, ${videoCount} videos`);

    // PHASE 2: Process all data files
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      try {
        // === JSON FILES (Primary data source) ===
        if (path.endsWith('.json')) {
          const content = await file.async("text");
          const json = JSON.parse(content);
          
          // MESSAGES / CONVERSATIONS
          if (path.includes('messages/inbox') && json.messages && Array.isArray(json.messages)) {
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
          
          // FRIENDS
          if (path.includes('friends') && (json.friends_v2 || json.friends)) {
            const friendsList = json.friends_v2 || json.friends || [];
            friendsList.forEach(f => {
              const name = decode(f.name || "");
              const timestamp = f.timestamp ? new Date(f.timestamp * 1000).toLocaleDateString() : "";
              if (name && !data.friends.find(fr => fr.name === name)) {
                data.friends.push({ name, date_added: timestamp });
              }
            });
          }
          
          // POSTS
          if (path.includes('posts/your_posts') && Array.isArray(json)) {
            json.forEach(post => {
              const text = decode(post.data?.[0]?.post || post.post || post.title || "");
              const timestamp = post.timestamp ? new Date(post.timestamp * 1000).toLocaleString() : "";
              if (text) {
                data.posts.push({ 
                  text, 
                  timestamp, 
                  photo_url: null, 
                  likes_count: 0, 
                  comments_count: 0, 
                  comments: [] 
                });
              }
            });
          }
          
          // COMMENTS
          if (path.includes('comments') && json.comments) {
            json.comments.forEach(c => {
              const text = decode(c.data?.[0]?.comment?.comment || c.comment || c.title || "");
              const timestamp = c.timestamp ? new Date(c.timestamp * 1000).toLocaleString() : "";
              if (text) {
                data.comments.push({ text, timestamp, author: decode(c.author || "") });
              }
            });
          }
          
          // LIKES AND REACTIONS
          if (path.includes('likes_and_reactions')) {
            const items = json.reactions_v2 || json.reactions || json.likes || [];
            items.forEach(item => {
              const title = decode(item.title || item.data?.[0]?.title || "");
              const timestamp = item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : "";
              if (title) {
                data.likes.push({ title, timestamp });
              }
            });
          }
          
          // GROUPS
          if (path.includes('groups') && (json.groups_joined || json.groups)) {
            const groups = json.groups_joined?.groups_joined || json.groups || [];
            groups.forEach(g => {
              const name = decode(g.name || g.title || "");
              const timestamp = g.timestamp ? new Date(g.timestamp * 1000).toLocaleString() : "";
              if (name && !data.groups.find(gr => gr.name === name)) {
                data.groups.push({ name, timestamp });
              }
            });
          }
          
          // MARKETPLACE
          if (path.includes('marketplace')) {
            const items = Array.isArray(json) ? json : [json];
            items.forEach(item => {
              const text = decode(item.name || item.title || item.data?.[0]?.title || "");
              const timestamp = item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : 
                              item.creation_timestamp ? new Date(item.creation_timestamp * 1000).toLocaleString() : "";
              if (text) {
                data.marketplace.push({ text, timestamp });
              }
            });
          }
          
          // EVENTS
          if (path.includes('events') && json.events_joined) {
            json.events_joined.forEach(e => {
              const name = decode(e.name || "");
              const timestamp = e.start_timestamp ? new Date(e.start_timestamp * 1000).toLocaleString() : "";
              if (name) {
                data.events.push({ text: name, timestamp });
              }
            });
          }
        }
        
        // === HTML FILES (Secondary data source) ===
        if (path.endsWith('.html')) {
          const content = await file.async("text");
          
          // Get profile name
          if (!data.profile.name) {
            const nameMatch = content.match(/Generated by ([^<\n]+) on/i);
            if (nameMatch) data.profile.name = decode(nameMatch[1]);
          }
          
          // Extract sections
          const sections = content.matchAll(/<section[^>]*>(.*?)<\/section>/gs);
          for (const section of sections) {
            const html = section[1];
            const h2 = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
            const title = h2 ? decode(h2[1]) : "";
            
            const contentDivs = html.matchAll(/<div class="_2pin"><div>([^<]+)<\/div>/g);
            const texts = [];
            for (const m of contentDivs) texts.push(decode(m[1]));
            
            const time = html.match(/<div class="_a72d">([^<]+)<\/div>/);
            const timestamp = time ? decode(time[1]) : "";
            
            const img = html.match(/href="([^"]+\.(jpg|jpeg|png|gif))"/i);
            const photo_url = img ? (data.photoFiles[img[1]] || null) : null;
            
            const fullText = [title, ...texts].filter(t => t).join(' - ');
            if (fullText.length < 5) continue;
            
            // Categorize
            if (path.includes('posts') && !path.includes('other')) {
              data.posts.push({ text: fullText, timestamp, photo_url, likes_count: 0, comments_count: 0, comments: [] });
            } else if (path.includes('comments')) {
              data.comments.push({ text: fullText, timestamp, author: "" });
            } else if (path.includes('marketplace')) {
              data.marketplace.push({ text: fullText, timestamp });
            } else if (path.includes('events')) {
              data.events.push({ text: fullText, timestamp });
            }
          }
        }
        
      } catch (err) {
        console.error(`Error processing ${path}:`, err.message);
      }
    }

    // Deduplicate and sort
    data.friends = [...new Map(data.friends.map(f => [f.name.toLowerCase(), f])).values()];
    data.messages.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
    data.posts = [...new Map(data.posts.map(p => [p.text, p])).values()];
    data.comments = [...new Map(data.comments.map(c => [c.text, c])).values()];
    data.groups = [...new Map(data.groups.map(g => [g.name.toLowerCase(), g])).values()];

    console.log(`✅ Extracted - Posts: ${data.posts.length}, Comments: ${data.comments.length}, Friends: ${data.friends.length}, Messages: ${data.messages.length}, Photos: ${photoCount}, Videos: ${videoCount}, Likes: ${data.likes.length}, Groups: ${data.groups.length}, Marketplace: ${data.marketplace.length}`);

    return Response.json(data);
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});