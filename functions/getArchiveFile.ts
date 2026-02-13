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
    console.log(`✅ Extracted ${photoCount} photos, ${videoCount} videos`);

    // PHASE 2: Process all data files
    console.log("📋 Processing all files in archive...");
    const allPaths = Object.keys(zip.files).filter(p => !zip.files[p].dir);
    console.log(`Total files to scan: ${allPaths.length}`);
    console.log("All JSON files in archive:");
    allPaths.filter(p => p.endsWith('.json')).forEach(p => console.log(`  - ${p}`));
    
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      try {
        // === JSON FILES (Primary data source) ===
        if (path.endsWith('.json')) {
          const content = await file.async("text");
          let json;
          try {
            json = JSON.parse(content);
          } catch (e) {
            console.log(`   ⚠️ Failed to parse ${path}`);
            continue;
          }
          
          // AGGRESSIVE DEBUGGING - Log structure of EVERY JSON file
          console.log(`\n📄 ${path}`);
          console.log(`   Keys: [${Object.keys(json).join(', ')}]`);
          if (Array.isArray(json)) {
            console.log(`   Array length: ${json.length}`);
            if (json.length > 0 && typeof json[0] === 'object') {
              console.log(`   First item keys: [${Object.keys(json[0]).join(', ')}]`);
            }
          }
          
          // SCAN FOR ANY POSSIBLE DATA - Check every JSON regardless of path
          
          // MESSAGES / CONVERSATIONS - More aggressive detection
          if (json.messages && Array.isArray(json.messages)) {
            console.log(`   💬 Found messages array with ${json.messages.length} messages`);
          }
          
          if ((path.includes('messages') || json.messages) && json.messages && Array.isArray(json.messages)) {
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
          
          // FRIENDS - Scan for any key that might contain friends
          let friendsList = [];
          const possibleFriendsKeys = ['friends_v2', 'friends', 'followers_v2', 'followers', 'following_v2', 'following', 'connections_v2', 'connections', 'contacts_v2', 'contacts'];
          
          for (const key of possibleFriendsKeys) {
            if (json[key] && Array.isArray(json[key])) {
              friendsList = json[key];
              console.log(`   👥 Found friends data in key '${key}': ${friendsList.length} items`);
              break;
            }
          }
          
          // If path suggests friends but no key found, try array
          if (friendsList.length === 0 && path.toLowerCase().includes('friend') && Array.isArray(json)) {
            friendsList = json;
            console.log(`   👥 Using root array as friends: ${friendsList.length} items`);
          }
          
          if (friendsList.length > 0) {
            let addedCount = 0;
            friendsList.forEach(f => {
              if (!f || typeof f !== 'object') return;
              const name = decode(f.name || f.title || "");
              const timestamp = f.timestamp ? new Date(f.timestamp * 1000).toLocaleDateString() : "";
              if (name && name.length > 1 && !data.friends.find(fr => fr.name.toLowerCase() === name.toLowerCase())) {
                data.friends.push({ name, date_added: timestamp });
                addedCount++;
              }
            });
            if (addedCount > 0) {
              console.log(`   ✅ Added ${addedCount} friends`);
            }
          }
          
          // POSTS (various locations)
          if (path.includes('posts') && !path.includes('other_people')) {
            const posts = Array.isArray(json) ? json : (json.posts || []);
            posts.forEach(post => {
              // Multiple text field possibilities
              const text = decode(
                post.data?.[0]?.post || 
                post.post || 
                post.title || 
                post.data?.[0]?.update_timestamp ||
                ""
              );
              const timestamp = post.timestamp ? new Date(post.timestamp * 1000).toLocaleString() : "";
              
              // Extract attachments/media if present
              const attachments = post.attachments || post.data?.[0]?.attachments || [];
              const hasMedia = attachments.length > 0;
              
              if (text && text.length > 1) {
                data.posts.push({ 
                  text, 
                  timestamp, 
                  photo_url: null, 
                  likes_count: 0, 
                  comments_count: 0, 
                  comments: [],
                  hasMedia
                });
              }
            });
          }
          
          // COMMENTS (multiple formats)
          if (path.includes('comments')) {
            const comments = json.comments || (Array.isArray(json) ? json : []);
            comments.forEach(c => {
              const text = decode(
                c.data?.[0]?.comment?.comment || 
                c.comment || 
                c.title ||
                c.data?.[0]?.comment ||
                ""
              );
              const timestamp = c.timestamp ? new Date(c.timestamp * 1000).toLocaleString() : "";
              const author = decode(c.author || c.data?.[0]?.comment?.author || "");
              
              if (text && text.length > 1) {
                data.comments.push({ text, timestamp, author });
              }
            });
          }
          
          // LIKES - Scan for any like/reaction keys
          let likesList = [];
          const possibleLikesKeys = ['reactions_v2', 'reactions', 'likes_v2', 'likes', 'page_likes_v2', 'page_likes', 'pages_followed_v2', 'pages_followed', 'pages_and_profiles_you_follow'];
          
          for (const key of possibleLikesKeys) {
            if (json[key] && Array.isArray(json[key])) {
              likesList = json[key];
              console.log(`   ❤️ Found likes in key '${key}': ${likesList.length} items`);
              break;
            }
          }
          
          if (likesList.length === 0 && path.toLowerCase().includes('like') && Array.isArray(json)) {
            likesList = json;
            console.log(`   ❤️ Using root array as likes: ${likesList.length} items`);
          }
          
          if (likesList.length > 0) {
            likesList.forEach(item => {
              if (!item || typeof item !== 'object') return;
              const title = decode(item.title || item.name || item.data?.[0]?.title || item.data?.[0]?.name || "");
              const timestamp = item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : "";
              if (title && title.length > 1) {
                data.likes.push({ title, timestamp });
              }
            });
            console.log(`   ✅ Added ${likesList.length} likes`);
          }
          
          // GROUPS - Scan for any group keys
          let groupsList = [];
          const possibleGroupsKeys = ['groups_v2', 'groups', 'your_groups_v2', 'your_groups', 'groups_joined'];
          
          for (const key of possibleGroupsKeys) {
            if (json[key]) {
              if (Array.isArray(json[key])) {
                groupsList = json[key];
              } else if (json[key].groups_joined) {
                groupsList = json[key].groups_joined;
              }
              if (groupsList.length > 0) {
                console.log(`   👥 Found groups in key '${key}': ${groupsList.length} items`);
                break;
              }
            }
          }
          
          if (groupsList.length === 0 && path.toLowerCase().includes('group') && Array.isArray(json)) {
            groupsList = json;
            console.log(`   👥 Using root array as groups: ${groupsList.length} items`);
          }
          
          if (groupsList.length > 0) {
            groupsList.forEach(g => {
              if (!g || typeof g !== 'object') return;
              const name = decode(g.name || g.title || "");
              const timestamp = g.timestamp ? new Date(g.timestamp * 1000).toLocaleString() : "";
              if (name && name.length > 1 && !data.groups.find(gr => gr.name.toLowerCase() === name.toLowerCase())) {
                data.groups.push({ name, timestamp });
              }
            });
            console.log(`   ✅ Added ${groupsList.length} groups`);
          }
          
          // MARKETPLACE
          if (path.toLowerCase().includes('marketplace')) {
            console.log(`  → Found marketplace file: ${path}`);
            let items = [];
            
            if (json.marketplace_items) items = json.marketplace_items;
            else if (Array.isArray(json)) items = json;
            else items = [json];
            
            items.forEach(item => {
              const text = decode(item.name || item.title || item.data?.[0]?.title || "");
              const timestamp = item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : 
                              item.creation_timestamp ? new Date(item.creation_timestamp * 1000).toLocaleString() : "";
              if (text && text.length > 1) {
                data.marketplace.push({ text, timestamp });
              }
            });
            
            if (items.length > 0) {
              console.log(`  ✓ Extracted ${items.length} marketplace items from this file`);
            }
          }
          
          // REVIEWS - Scan for any review keys
          let reviewsList = [];
          const possibleReviewsKeys = ['reviews_written_v2', 'reviews_written', 'reviews_v2', 'reviews'];
          
          for (const key of possibleReviewsKeys) {
            if (json[key] && Array.isArray(json[key])) {
              reviewsList = json[key];
              console.log(`   ⭐ Found reviews in key '${key}': ${reviewsList.length} items`);
              break;
            }
          }
          
          if (reviewsList.length === 0 && path.toLowerCase().includes('review') && Array.isArray(json)) {
            reviewsList = json;
            console.log(`   ⭐ Using root array as reviews: ${reviewsList.length} items`);
          }
          
          if (reviewsList.length > 0) {
            reviewsList.forEach(r => {
              if (!r || typeof r !== 'object') return;
              const text = decode(r.review_text || r.text || r.title || r.data?.[0]?.review?.text || "");
              const timestamp = r.timestamp ? new Date(r.timestamp * 1000).toLocaleString() : "";
              if (text && text.length > 1) {
                data.reviews.push({ text, timestamp });
              }
            });
            console.log(`   ✅ Added ${reviewsList.length} reviews`);
          }
          
          // EVENTS (multiple formats)
          if (path.includes('events')) {
            let events = [];
            if (json.events_joined) events = json.events_joined;
            else if (json.event_invitations) events = json.event_invitations;
            else if (Array.isArray(json)) events = json;
            
            events.forEach(e => {
              const name = decode(e.name || e.title || "");
              const timestamp = e.start_timestamp ? new Date(e.start_timestamp * 1000).toLocaleString() : 
                              e.timestamp ? new Date(e.timestamp * 1000).toLocaleString() : "";
              if (name && name.length > 1) {
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
          
          // FRIENDS FROM HTML
          if (path.includes('friends')) {
            const friendMatches = content.matchAll(/<div class="_2lek">([^<]+)<\/div>/g);
            for (const match of friendMatches) {
              const name = decode(match[1]);
              if (name && name.length > 1 && !data.friends.find(fr => fr.name.toLowerCase() === name.toLowerCase())) {
                data.friends.push({ name, date_added: "" });
              }
            }
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

    console.log(`✅ FINAL EXTRACTION RESULTS:`);
    console.log(`   Posts: ${data.posts.length}`);
    console.log(`   Comments: ${data.comments.length}`);
    console.log(`   Friends: ${data.friends.length}`);
    console.log(`   Messages: ${data.messages.length}`);
    console.log(`   Photos: ${photoCount}`);
    console.log(`   Videos: ${videoCount}`);
    console.log(`   Likes: ${data.likes.length}`);
    console.log(`   Groups: ${data.groups.length}`);
    console.log(`   Marketplace: ${data.marketplace.length}`);
    console.log(`   Events: ${data.events.length}`);
    console.log(`   Reviews: ${data.reviews.length}`);

    return Response.json(data);
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});