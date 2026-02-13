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
      return Response.json({ error: `Failed to fetch file: ${response.status}` }, { status: 400 });
    }
    
    const blob = await response.blob();
    console.log("📦 Archive size:", blob.size, "bytes");

    const zip = await JSZip.loadAsync(blob);
    console.log("📦 ZIP loaded successfully");
    
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

    // Helper to decode Facebook's encoded text
    const decodeFacebookText = (text) => {
      if (!text) return "";
      return text
        .replace(/\\u00([0-9a-fA-F]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .trim();
    };

    // Helper to extract text from HTML - strips all tags
    const stripHtmlTags = (html) => {
      if (!html) return "";
      return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Helper to extract all text content from specific HTML elements
    const extractFromElements = (html, selector) => {
      const results = [];
      const regex = new RegExp(`<${selector}[^>]*>(.*?)<\/${selector}>`, 'gis');
      let match;
      while ((match = regex.exec(html)) !== null) {
        const text = decodeFacebookText(stripHtmlTags(match[1]));
        if (text && text.length > 0) {
          results.push(text);
        }
      }
      return results;
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

    // PHASE 2: Comprehensively parse ALL HTML and JSON files
    console.log("📄 Phase 2: Scanning ALL archive files...");

    let filesProcessed = 0;

    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;

      filesProcessed++;

      try {
        const content = await file.async("text");

        // Extract profile name from start_here.html or profile_information.html
        if (!data.profile.name && path.match(/profile_information\.html|start_here\.html/i)) {
          const nameMatch = content.match(/Generated by ([^<\n]+) on/i) || 
                           content.match(/<div[^>]*>([A-Z][a-z]+ [A-Z][a-z]+)<\/div>/);
          if (nameMatch) {
            data.profile.name = decodeFacebookText(nameMatch[1].trim());
            console.log(`👤 Profile: ${data.profile.name}`);
          }
        }

        // === POSTS - Parse ALL post HTML files ===
        if (path.endsWith('.html') && (
          path.includes('your_posts') || 
          path.includes('posts/album') ||
          path.match(/your_posts.*\.html/) ||
          path.match(/your_facebook_activity\/posts\//))
        ) {
          console.log(`  📝 Parsing posts from: ${path}`);

          // Extract all divs that might contain posts
          const allDivs = extractFromElements(content, 'div');

          allDivs.forEach(text => {
            // Skip CSS, metadata, navigation text
            if (text.match(/font-family|background:|margin:|padding:|Generated by|Facebook|Download|Privacy/i)) return;
            if (text.length < 15 || text.length > 5000) return;

            // Try to find timestamp in surrounding content
            const fullHtml = content;
            const textIndex = fullHtml.indexOf(text.substring(0, 50));
            const contextRange = fullHtml.substring(Math.max(0, textIndex - 200), textIndex + 200);
            const dateMatch = contextRange.match(/(\w+ \d{1,2}, \d{4}(?:\s+at\s+\d{1,2}:\d{2})?)/i);

            data.posts.push({
              text,
              timestamp: dateMatch ? dateMatch[1] : "",
              photo_url: null,
              likes_count: 0,
              comments_count: 0,
              comments: []
            });
          });
        }

        // === COMMENTS ===
        if (path.match(/comments.*\.html/i)) {
          console.log(`  💬 Parsing comments from: ${path}`);

          const commentDivs = extractFromElements(content, 'div');
          commentDivs.forEach(text => {
            if (text.match(/font-family|background:|Comments/i)) return;
            if (text.length < 10 || text.length > 3000) return;

            const contextRange = content.substring(content.indexOf(text.substring(0, 30)) - 150, content.indexOf(text.substring(0, 30)) + 150);
            const dateMatch = contextRange.match(/(\w+ \d{1,2}, \d{4})/);

            data.comments.push({
              text,
              timestamp: dateMatch ? dateMatch[1] : ""
            });
          });
        }

        // === FRIENDS ===
        if (path.match(/friends.*\.html/i) || path.includes('your_friends.html')) {
          console.log(`  👥 Parsing friends from: ${path}`);

          // Extract from list items
          const listItems = extractFromElements(content, 'li');
          listItems.forEach(name => {
            if (name.length > 2 && name.length < 100 && !name.match(/Friends|Facebook|Privacy/i)) {
              if (!data.friends.find(f => f.name === name)) {
                data.friends.push({ name, date_added: "" });
              }
            }
          });

          // Also check divs in case they're not in lists
          const divs = extractFromElements(content, 'div');
          divs.forEach(name => {
            if (name.length > 3 && name.length < 80 && 
                name.match(/^[A-Z][a-z]+ [A-Z]/i) &&
                !data.friends.find(f => f.name === name)) {
              data.friends.push({ name, date_added: "" });
            }
          });
        }

        // === GROUPS ===
        if (path.match(/groups.*\.html/i)) {
          const listItems = extractFromElements(content, 'li');
          const divs = extractFromElements(content, 'div');

          [...listItems, ...divs].forEach(name => {
            if (name.length > 3 && name.length < 150 && 
                !name.match(/Groups|Facebook|Privacy|font-family/i) &&
                !data.groups.find(g => g.name === name)) {
              data.groups.push({ name });
            }
          });
        }

        // === MESSAGES (JSON format) ===
        if (path.endsWith('.json') && path.includes('message')) {
          try {
            const json = JSON.parse(content);
            if (json.messages && Array.isArray(json.messages)) {
              const convoName = decodeFacebookText(json.title || path.split('/').pop().replace('.json', '').replace(/_/g, ' '));
              const msgs = json.messages.map(m => ({
                sender: decodeFacebookText(m.sender_name || "Unknown"),
                text: decodeFacebookText(m.content || ""),
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

        // === FRIENDS (JSON format) ===
        if (path.endsWith('.json') && path.includes('friends')) {
          try {
            const json = JSON.parse(content);
            const friendsList = json.friends_v2 || json.friends || (Array.isArray(json) ? json : []);

            friendsList.forEach(f => {
              const name = decodeFacebookText(f.name || f.title || "");
              if (name.length > 2 && !data.friends.find(fr => fr.name === name)) {
                data.friends.push({ 
                  name, 
                  date_added: f.timestamp ? new Date(f.timestamp * 1000).toLocaleDateString() : ""
                });
              }
            });
          } catch (e) {}
        }

      } catch (err) {
        console.error(`❌ Error processing ${path}:`, err.message);
      }
    }

    console.log(`📊 Processed ${filesProcessed} files total`);

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