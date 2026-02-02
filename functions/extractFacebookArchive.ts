import { unzipSync } from "https://deno.land/x/zipjs@v2.7.34/index.js";

Deno.serve(async (req) => {
  try {
    const { fileUrl } = await req.json();
    
    if (!fileUrl) {
      return Response.json({ error: "fileUrl is required" }, { status: 400 });
    }

    console.log("Downloading archive from:", fileUrl);
    
    // Download the ZIP file
    const zipResponse = await fetch(fileUrl);
    if (!zipResponse.ok) {
      return Response.json({ error: "Failed to download archive" }, { status: 400 });
    }
    
    const zipBytes = new Uint8Array(await zipResponse.arrayBuffer());
    
    console.log("Archive downloaded, size:", zipBytes.length);
    
    // Use fflate for decompression
    const fflate = await import("https://esm.sh/fflate@0.8.1");
    const unzipped = fflate.unzipSync(zipBytes);
    
    console.log("Archive unzipped, files:", Object.keys(unzipped).length);
    
    // Initialize data structure
    const data = {
      profile: { name: "", email: "" },
      posts: [],
      friends: [],
      messages: [],
      photos: [],
      comments: []
    };
    
    // Helper to parse HTML content
    const parseHTML = (html) => {
      const textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return textContent;
    };
    
    // Helper to extract timestamps
    const extractTimestamp = (html) => {
      const dateMatch = html.match(/(\d{1,2}\s+\w+\s+\d{4}|\d{4}-\d{2}-\d{2})/);
      return dateMatch ? dateMatch[0] : "";
    };
    
    // Process each file
    for (const [path, fileData] of Object.entries(unzipped)) {
      if (path.endsWith('/')) continue;
      
      try {
        const content = new TextDecoder().decode(fileData);
        
        // Profile data
        if (path.includes("profile_information") || path.includes("about_you")) {
          const nameMatch = content.match(/name["\s:]+([^<\n"]+)/i);
          const emailMatch = content.match(/[\w\.-]+@[\w\.-]+\.\w+/);
          if (nameMatch) data.profile.name = nameMatch[1].trim();
          if (emailMatch) data.profile.email = emailMatch[0];
        }
        
        // Posts
        if (path.includes("posts") && path.endsWith(".html")) {
          const postMatches = content.split(/<div[^>]*class="[^"]*post[^"]*"[^>]*>/gi);
          for (let i = 1; i < Math.min(postMatches.length, 101); i++) {
            const postHtml = postMatches[i];
            const text = parseHTML(postHtml.substring(0, 2000));
            const timestamp = extractTimestamp(postHtml);
            const likesMatch = postHtml.match(/(\d+)\s*like/i);
            const commentsMatch = postHtml.match(/(\d+)\s*comment/i);
            
            if (text.length > 10) {
              data.posts.push({
                text: text.substring(0, 500),
                timestamp,
                likes_count: likesMatch ? parseInt(likesMatch[1]) : 0,
                comments_count: commentsMatch ? parseInt(commentsMatch[1]) : 0
              });
            }
          }
        }
        
        // Friends
        if (path.includes("friends") && path.endsWith(".html")) {
          const friendMatches = content.match(/>([^<]+)<\/a>/g) || [];
          for (let i = 0; i < Math.min(friendMatches.length, 500); i++) {
            const nameMatch = friendMatches[i].match(/>([^<]+)</);
            if (nameMatch) {
              const name = nameMatch[1].trim();
              if (name.length > 2 && name.length < 100) {
                const timestamp = extractTimestamp(content.substring(Math.max(0, content.indexOf(name) - 200), content.indexOf(name) + 200));
                data.friends.push({ name, date_added: timestamp });
              }
            }
          }
        }
        
        // Messages
        if (path.includes("messages") && path.endsWith(".html")) {
          const conversationMatch = path.match(/messages\/inbox\/([^\/]+)\//);
          const conversationWith = conversationMatch ? decodeURIComponent(conversationMatch[1]).replace(/_/g, ' ') : "Unknown";
          
          const messageBlocks = content.split(/<div[^>]*class="[^"]*message[^"]*"[^>]*>/gi);
          const messages = [];
          
          for (let i = 1; i < Math.min(messageBlocks.length, 101); i++) {
            const msgHtml = messageBlocks[i];
            const senderMatch = msgHtml.match(/class="[^"]*user[^"]*">([^<]+)</i);
            const text = parseHTML(msgHtml.substring(0, 1000));
            const timestamp = extractTimestamp(msgHtml);
            
            if (text.length > 5) {
              messages.push({
                sender: senderMatch ? senderMatch[1].trim() : conversationWith,
                text: text.substring(0, 300),
                timestamp
              });
            }
          }
          
          if (messages.length > 0) {
            data.messages.push({
              conversation_with: conversationWith,
              messages: messages.slice(0, 100)
            });
          }
        }
        
        // Photos
        if (path.includes("photos") && path.endsWith(".html")) {
          const photoMatches = content.split(/<div[^>]*class="[^"]*photo[^"]*"[^>]*>/gi);
          for (let i = 1; i < Math.min(photoMatches.length, 201); i++) {
            const photoHtml = photoMatches[i];
            const description = parseHTML(photoHtml.substring(0, 500));
            const timestamp = extractTimestamp(photoHtml);
            data.photos.push({ description: description.substring(0, 200), timestamp });
          }
        }
        
        // Comments
        if (path.includes("comments") && path.endsWith(".html")) {
          const commentMatches = content.split(/<div[^>]*class="[^"]*comment[^"]*"[^>]*>/gi);
          for (let i = 1; i < Math.min(commentMatches.length, 201); i++) {
            const commentHtml = commentMatches[i];
            const text = parseHTML(commentHtml.substring(0, 1000));
            const timestamp = extractTimestamp(commentHtml);
            const onPostMatch = commentHtml.match(/on\s+([^']+)'s\s+post/i);
            
            if (text.length > 5) {
              data.comments.push({
                text: text.substring(0, 300),
                timestamp,
                on_post_by: onPostMatch ? onPostMatch[1].trim() : ""
              });
            }
          }
        }
        
      } catch (err) {
        console.error(`Error processing ${path}:`, err.message);
      }
    }
    
    console.log("Extraction complete:", {
      posts: data.posts.length,
      friends: data.friends.length,
      messages: data.messages.length
    });
    
    return Response.json({ success: true, data });
    
  } catch (error) {
    console.error("EXTRACTION ERROR:", error.message);
    console.error("Stack:", error.stack);
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});