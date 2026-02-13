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

    // PHASE 2: Use AI to intelligently extract data from HTML files
    console.log("📄 Phase 2: Using AI to parse HTML content...");

    const htmlFiles = {};
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir || !path.endsWith('.html')) continue;
      const content = await file.async("text");
      htmlFiles[path] = content.substring(0, 50000); // Limit size for AI processing
    }

    // Extract profile name first
    for (const content of Object.values(htmlFiles)) {
      if (!data.profile.name) {
        const generatedMatch = content.match(/Generated by ([^<\n]+) on/i);
        if (generatedMatch) {
          data.profile.name = generatedMatch[1].trim();
          console.log(`👤 Found profile name: ${data.profile.name}`);
          break;
        }
      }
    }

    // Use AI to extract structured data from HTML files
    const htmlSample = Object.entries(htmlFiles).slice(0, 20).map(([path, content]) => ({
      path,
      content: content.substring(0, 5000)
    }));

    console.log("🤖 Calling AI to parse HTML content...");
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `You are parsing a Facebook archive. Extract ALL posts, comments, friends, and messages from these HTML files.

    For each HTML file, extract:
    - Posts: Look for user-generated content, timestamps, and any associated photos
    - Comments: Look for comments on posts
    - Friends: Look for friend names
    - Messages/Conversations: Look for message threads

    Return a JSON object with this structure:
    {
    "posts": [{"text": "...", "timestamp": "...", "has_photo": true/false}],
    "comments": [{"text": "...", "timestamp": "..."}],
    "friends": [{"name": "..."}],
    "messages": [{"conversation_with": "...", "message_count": 0}]
    }

    HTML files to parse:
    ${JSON.stringify(htmlSample, null, 2)}

    Extract ALL data you can find. Be thorough.`,
      response_json_schema: {
        type: "object",
        properties: {
          posts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                timestamp: { type: "string" },
                has_photo: { type: "boolean" }
              }
            }
          },
          comments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                timestamp: { type: "string" }
              }
            }
          },
          friends: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" }
              }
            }
          },
          messages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                conversation_with: { type: "string" },
                message_count: { type: "number" }
              }
            }
          }
        }
      }
    });

    console.log("✅ AI extraction complete");

    // Merge AI-extracted data
    if (aiResponse.posts) {
      aiResponse.posts.forEach(post => {
        data.posts.push({
          text: post.text,
          timestamp: post.timestamp,
          photo_url: null,
          likes_count: 0,
          comments_count: 0,
          comments: []
        });
      });
    }

    if (aiResponse.comments) {
      aiResponse.comments.forEach(comment => {
        data.comments.push({
          text: comment.text,
          timestamp: comment.timestamp
        });
      });
    }

    if (aiResponse.friends) {
      aiResponse.friends.forEach(friend => {
        if (!data.friends.find(f => f.name === friend.name)) {
          data.friends.push({ name: friend.name, date_added: "" });
        }
      });
    }

    if (aiResponse.messages) {
      aiResponse.messages.forEach(msg => {
        data.messages.push({
          conversation_with: msg.conversation_with,
          messages: [],
          totalMessages: msg.message_count || 0
        });
      });
    }

    // Process JSON files for messages
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir || !path.endsWith('.json')) continue;

      try {
        const content = await file.async("text");
        const json = JSON.parse(content);

        // Messages
        if (json.messages && Array.isArray(json.messages)) {
          const convoName = json.title || json.thread_path || path.split('/').pop().replace('.json', '').replace(/_/g, ' ');
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

        // Friends
        if (json.friends_v2 || json.friends) {
          const friendsList = json.friends_v2 || json.friends;
          friendsList.forEach(f => {
            const name = f.name || f.title || "";
            if (name.length > 2 && !data.friends.find(fr => fr.name === name)) {
              data.friends.push({ 
                name, 
                date_added: f.timestamp ? new Date(f.timestamp * 1000).toLocaleDateString() : ""
              });
            }
          });
        }
      } catch (e) {}
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