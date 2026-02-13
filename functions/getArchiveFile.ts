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

    console.log("📦 Downloading archive from:", fileUrl);
    
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      console.error(`Fetch failed with status ${response.status}`, response.statusText);
      return Response.json({ error: `Failed to fetch file: ${response.status}` }, { status: 400 });
    }
    
    const blob = await response.blob();
    console.log("📦 Archive downloaded, size:", blob.size, "bytes");

    const zip = await JSZip.loadAsync(blob);
    console.log("📦 ZIP loaded, scanning structure...");
    
    // Build file tree for analysis
    const fileTree = {};
    Object.keys(zip.files).forEach(path => {
      if (!zip.files[path].dir) {
        const parts = path.split('/');
        let current = fileTree;
        parts.forEach((part, i) => {
          if (i === parts.length - 1) {
            if (!current._files) current._files = [];
            current._files.push(path);
          } else {
            if (!current[part]) current[part] = {};
            current = current[part];
          }
        });
      }
    });
    
    console.log("📂 File tree structure:", JSON.stringify(fileTree, null, 2).substring(0, 500));
    
    const data = {
      profile: { name: "", email: "" },
      posts: [],
      friends: [],
      messages: [],
      photos: [],
      photoFiles: {},
      videoFiles: {},
      comments: [],
      reels: [],
      videos: [],
      checkins: [],
      likes: [],
      events: [],
      reviews: [],
      groups: [],
      marketplace: [],
      allData: {}
    };

    // Helper functions for parsing Facebook HTML
    const getBodyContent = (html) => {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      return bodyMatch ? bodyMatch[1] : html;
    };

    const parseHTML = (html) => {
      let cleaned = html
        .replace(/<head[\s\S]*?<\/head>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
      return cleaned;
    };

    const extractText = (html) => {
      return parseHTML(html);
    };

    const extractTimestamp = (html) => {
      const patterns = [
        /(\d{1,2}\s+\w+\s+\d{4}\s+at\s+\d{1,2}:\d{2})/i,
        /(\d{1,2}\s+\w+\s+\d{4})/i,
        /(\d{4}-\d{2}-\d{2})/
      ];
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) return match[1];
      }
      return "";
    };

    // PHASE 1: Extract all media files (photos and videos)
    console.log("📸 Phase 1: Extracting photos and videos...");
    let photoCount = 0, videoCount = 0;

    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;

      // Extract photos
      if (path.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i) && !path.includes('icon')) {
        try {
          const imageData = await file.async("base64");
          const ext = path.split('.').pop().toLowerCase();
          const mimeType = {
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'png': 'image/png', 'gif': 'image/gif',
            'webp': 'image/webp', 'bmp': 'image/bmp'
          }[ext] || 'image/jpeg';

          data.photoFiles[path] = `data:${mimeType};base64,${imageData}`;
          data.photos.push({ path, filename: path.split('/').pop(), timestamp: "" });
          photoCount++;
        } catch (err) {
          console.error(`❌ Failed to extract photo ${path}:`, err.message);
        }
      }

      // Extract videos
      if (path.match(/\.(mp4|mov|avi|mkv|webm|m4v)$/i)) {
        try {
          const videoData = await file.async("base64");
          const ext = path.split('.').pop().toLowerCase();
          const mimeType = {
            'mp4': 'video/mp4', 'webm': 'video/webm',
            'mov': 'video/quicktime', 'avi': 'video/x-msvideo'
          }[ext] || 'video/mp4';

          data.videoFiles[path] = `data:${mimeType};base64,${videoData}`;
          data.videos.push({ path, filename: path.split('/').pop(), timestamp: "" });
          videoCount++;
        } catch (err) {
          console.error(`❌ Failed to extract video ${path}:`, err.message);
        }
      }
    }

    console.log(`✅ Extracted ${photoCount} photos, ${videoCount} videos`);

    // PHASE 2: Process all HTML and JSON files
    console.log("📄 Phase 2: Processing HTML and JSON files...");

    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir || (!path.endsWith('.html') && !path.endsWith('.json'))) continue;

      try {
        const content = await file.async("text");

        // PROFILE
        if (!data.profile.name) {
          const generatedMatch = content.match(/Generated by ([^<\n]+) on/i);
          if (generatedMatch) {
            data.profile.name = generatedMatch[1].trim();
            console.log(`👤 Found profile name: ${data.profile.name}`);
          }
        }

        if (path.match(/personal_information|profile/i) && path.endsWith('.html')) {
          const bodyContent = getBodyContent(content);
          const emailMatch = bodyContent.match(/[\w\.-]+@[\w\.-]+\.\w+/);
          if (emailMatch && !data.profile.email) {
            data.profile.email = emailMatch[0];
          }
        }

        // POSTS
        if (path.match(/posts|your_posts|timeline/i) && path.endsWith('.html')) {
          const bodyContent = getBodyContent(content);
          const divs = bodyContent.match(/<div[^>]*>[\s\S]*?<\/div>/gi) || [];

          for (const div of divs) {
            const text = extractText(div);
            if (!text || text.length < 15 || text.match(/^(html|body|font-family|background)/i)) continue;

            const timestamp = extractTimestamp(div);
            const imgMatch = div.match(/<img[^>]*src=["']([^"']+)["']/i);
            let photo_url = null;

            if (imgMatch) {
              const imgSrc = imgMatch[1];
              const photoKey = Object.keys(data.photoFiles).find(k => 
                k.includes(imgSrc) || imgSrc.includes(k.split('/').pop())
              );
              if (photoKey) photo_url = data.photoFiles[photoKey];
            }

            if (text.length >= 15 && data.posts.length < 200) {
              data.posts.push({
                text: text.substring(0, 600),
                timestamp,
                photo_url,
                likes_count: 0,
                comments_count: 0,
                comments: []
              });
            }
          }
        }

        // FRIENDS
        if (path.match(/friends/i) && (path.endsWith('.html') || path.endsWith('.json'))) {
          if (path.endsWith('.json')) {
            try {
              const json = JSON.parse(content);
              const friendsList = json.friends_v2 || json.friends || (Array.isArray(json) ? json : []);
              friendsList.forEach(f => {
                const name = f.name || f.title || "";
                if (name.length > 2 && !data.friends.find(fr => fr.name === name)) {
                  data.friends.push({ 
                    name, 
                    date_added: f.timestamp ? new Date(f.timestamp * 1000).toLocaleDateString() : ""
                  });
                }
              });
            } catch (e) {}
          } else {
            const bodyContent = getBodyContent(content);
            const items = bodyContent.match(/<li[^>]*>([^<]+)<\/li>/gi) || [];
            items.forEach(item => {
              const name = extractText(item);
              if (name.length > 2 && name.length < 100 && 
                  !data.friends.find(f => f.name.toLowerCase() === name.toLowerCase())) {
                data.friends.push({ name, date_added: "" });
              }
            });
          }
        }

        // MESSAGES
        if (path.match(/messages|inbox/i) && path.endsWith('.json')) {
          try {
            const json = JSON.parse(content);
            if (json.messages && Array.isArray(json.messages)) {
              const convoName = json.title || path.split('/').pop().replace('.json', '').replace(/_/g, ' ');
              const msgs = json.messages.map(m => ({
                sender: m.sender_name || "Unknown",
                text: m.content || "",
                timestamp: m.timestamp_ms ? new Date(m.timestamp_ms).toLocaleString() : "",
                timestamp_ms: m.timestamp_ms || 0
              })).filter(m => m.text);

              if (msgs.length > 0) {
                data.messages.push({
                  conversation_with: convoName,
                  messages: msgs,
                  lastMessageTimestamp: msgs[0]?.timestamp_ms || 0,
                  totalMessages: msgs.length
                });
              }
            }
          } catch (e) {}
        }

        // COMMENTS
        if (path.match(/comment/i) && path.endsWith('.html')) {
          const bodyContent = getBodyContent(content);
          const divs = bodyContent.match(/<div[^>]*>[\s\S]{20,500}?<\/div>/gi) || [];
          divs.slice(0, 30).forEach(div => {
            const text = extractText(div);
            if (text.length > 15 && text.length < 400 && data.comments.length < 100) {
              data.comments.push({ 
                text: text.substring(0, 300), 
                timestamp: extractTimestamp(div) 
              });
            }
          });
        }

        // GROUPS
        if (path.match(/group/i) && path.endsWith('.html')) {
          const bodyContent = getBodyContent(content);
          const items = bodyContent.match(/<li[^>]*>([^<]+)<\/li>/gi) || 
                       bodyContent.match(/<a[^>]*>([^<]+)<\/a>/gi) || [];
          items.forEach(item => {
            const name = extractText(item);
            if (name.length > 3 && name.length < 150 && 
                !name.match(/^(Group|Privacy|Settings)$/i) &&
                !data.groups.find(g => g.name === name)) {
              data.groups.push({ name });
            }
          });
        }

      } catch (err) {
        console.error(`Error processing ${path}:`, err);
      }
    }

    // Deduplicate and clean up
    data.friends = [...new Map(data.friends.map(f => [f.name.toLowerCase(), f])).values()];
    data.groups = [...new Map(data.groups.map(g => [g.name.toLowerCase(), g])).values()];
    data.messages.sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));

    console.log("\n✅ EXTRACTION COMPLETE:");
    console.log(`  👤 Profile: ${data.profile.name || 'Unknown'}`);
    console.log(`  👥 Friends: ${data.friends.length}`);
    console.log(`  📝 Posts: ${data.posts.length}`);
    console.log(`  💬 Messages: ${data.messages.length} conversations`);
    console.log(`  📸 Photos: ${Object.keys(data.photoFiles).length} (${data.photos.length} metadata)`);
    console.log(`  🎥 Videos: ${Object.keys(data.videoFiles).length}`);
    console.log(`  💭 Comments: ${data.comments.length}`);
    console.log(`  👥 Groups: ${data.groups.length}`);

    return Response.json(data);
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message || 'Failed to extract archive' }, { status: 500 });
  }
});