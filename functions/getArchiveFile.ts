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

    // PHASE 2: INTELLIGENT CONTENT-BASED EXTRACTION
    console.log("📋 Scanning ALL files intelligently...");
    const allPaths = Object.keys(zip.files).filter(p => !zip.files[p].dir);
    console.log(`Total files: ${allPaths.length}`);
    
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      try {
        if (path.endsWith('.json')) {
          const content = await file.async("text");
          let json;
          try {
            json = JSON.parse(content);
          } catch (e) {
            continue;
          }
          
          console.log(`\n📄 ${path}`);
          
          // SMART EXTRACTION - Scan for data patterns in ANY JSON file
          
          // Pattern 1: MESSAGES/CONVERSATIONS - Look for message arrays
          if (json.messages && Array.isArray(json.messages) && json.messages.length > 0) {
            console.log(`   💬 Found ${json.messages.length} messages`);
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
          
          // Pattern 2: FRIENDS - Look for arrays with name fields
          const checkForFriends = (arr, source) => {
            if (!Array.isArray(arr) || arr.length === 0) return 0;
            let count = 0;
            arr.forEach(item => {
              if (item && item.name && typeof item.name === 'string') {
                const name = decode(item.name);
                const timestamp = item.timestamp ? new Date(item.timestamp * 1000).toLocaleDateString() : "";
                if (name.length > 1 && !data.friends.find(fr => fr.name.toLowerCase() === name.toLowerCase())) {
                  data.friends.push({ name, date_added: timestamp });
                  count++;
                }
              }
            });
            if (count > 0) console.log(`   👥 Found ${count} friends from ${source}`);
            return count;
          };
          
          // Check all possible friend keys
          checkForFriends(json.friends_v2, 'friends_v2');
          checkForFriends(json.friends, 'friends');
          checkForFriends(json.followers_v2, 'followers_v2');
          checkForFriends(json.followers, 'followers');
          checkForFriends(json.following_v2, 'following_v2');
          checkForFriends(json.following, 'following');
          if (path.toLowerCase().includes('friend') && Array.isArray(json)) {
            checkForFriends(json, 'root array');
          }
          
          // Pattern 3: POSTS - Look for post/text content
          const checkForPosts = (arr, source) => {
            if (!Array.isArray(arr) || arr.length === 0) return 0;
            let count = 0;
            arr.forEach(post => {
              if (!post) return;
              const text = decode(post.data?.[0]?.post || post.post || post.title || post.text || "");
              const timestamp = post.timestamp ? new Date(post.timestamp * 1000).toLocaleString() : "";
              if (text && text.length > 3) {
                data.posts.push({ text, timestamp, photo_url: null, likes_count: 0, comments_count: 0, comments: [] });
                count++;
              }
            });
            if (count > 0) console.log(`   📝 Found ${count} posts from ${source}`);
            return count;
          };
          
          if (path.includes('post') || json.posts) {
            checkForPosts(json, 'posts');
            checkForPosts(Array.isArray(json) ? json : [], 'root array');
          }
          
          // Pattern 4: LIKES - Look for reactions/likes
          const checkForLikes = (arr, source) => {
            if (!Array.isArray(arr) || arr.length === 0) return 0;
            let count = 0;
            arr.forEach(item => {
              if (!item) return;
              const title = decode(item.title || item.name || item.data?.[0]?.title || "");
              const timestamp = item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : "";
              if (title && title.length > 1) {
                data.likes.push({ title, timestamp });
                count++;
              }
            });
            if (count > 0) console.log(`   ❤️ Found ${count} likes from ${source}`);
            return count;
          };
          
          checkForLikes(json.reactions_v2, 'reactions_v2');
          checkForLikes(json.reactions, 'reactions');
          checkForLikes(json.likes_v2, 'likes_v2');
          checkForLikes(json.likes, 'likes');
          checkForLikes(json.page_likes, 'page_likes');
          if (path.toLowerCase().includes('like') && Array.isArray(json)) {
            checkForLikes(json, 'root array');
          }
          
          // Pattern 5: GROUPS
          const checkForGroups = (arr, source) => {
            if (!Array.isArray(arr) || arr.length === 0) return 0;
            let count = 0;
            arr.forEach(g => {
              if (!g) return;
              const name = decode(g.name || g.title || "");
              const timestamp = g.timestamp ? new Date(g.timestamp * 1000).toLocaleString() : "";
              if (name && name.length > 1 && !data.groups.find(gr => gr.name.toLowerCase() === name.toLowerCase())) {
                data.groups.push({ name, timestamp });
                count++;
              }
            });
            if (count > 0) console.log(`   👥 Found ${count} groups from ${source}`);
            return count;
          };
          
          checkForGroups(json.groups_v2, 'groups_v2');
          checkForGroups(json.groups, 'groups');
          checkForGroups(json.groups_joined?.groups_joined, 'groups_joined');
          if (path.toLowerCase().includes('group') && Array.isArray(json)) {
            checkForGroups(json, 'root array');
          }
          
          // Pattern 6: REVIEWS
          const checkForReviews = (arr, source) => {
            if (!Array.isArray(arr) || arr.length === 0) return 0;
            let count = 0;
            arr.forEach(r => {
              if (!r) return;
              const text = decode(r.review_text || r.text || r.title || r.data?.[0]?.review?.text || "");
              const timestamp = r.timestamp ? new Date(r.timestamp * 1000).toLocaleString() : "";
              if (text && text.length > 1) {
                data.reviews.push({ text, timestamp });
                count++;
              }
            });
            if (count > 0) console.log(`   ⭐ Found ${count} reviews from ${source}`);
            return count;
          };
          
          checkForReviews(json.reviews_written_v2, 'reviews_written_v2');
          checkForReviews(json.reviews_written, 'reviews_written');
          checkForReviews(json.reviews, 'reviews');
          if (path.toLowerCase().includes('review') && Array.isArray(json)) {
            checkForReviews(json, 'root array');
          }
          
          // Pattern 7: COMMENTS
          const checkForComments = (arr, source) => {
            if (!Array.isArray(arr) || arr.length === 0) return 0;
            let count = 0;
            arr.forEach(c => {
              if (!c) return;
              const text = decode(c.data?.[0]?.comment?.comment || c.comment || c.title || c.text || "");
              const timestamp = c.timestamp ? new Date(c.timestamp * 1000).toLocaleString() : "";
              const author = decode(c.author || c.data?.[0]?.comment?.author || "");
              if (text && text.length > 1) {
                data.comments.push({ text, timestamp, author });
                count++;
              }
            });
            if (count > 0) console.log(`   💬 Found ${count} comments from ${source}`);
            return count;
          };
          
          checkForComments(json.comments, 'comments');
          if (path.toLowerCase().includes('comment') && Array.isArray(json)) {
            checkForComments(json, 'root array');
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