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
    console.log("📦 ZIP loaded, using AI to extract and categorize data...");
    
    // Collect ALL content from archive
    const allContent = [];
    const photoFiles = {};
    const videoFiles = [];
    let photoCount = 0, videoCount = 0;
    
    console.log("📂 Extracting all files...");
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      try {
        // Photos (limited to 30)
        if (photoCount < 30 && path.match(/\.(jpg|jpeg|png|gif|webp)$/i) && !path.includes('icon')) {
          const imageData = await file.async("base64");
          const ext = path.split('.').pop().toLowerCase();
          const mimeType = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'}[ext] || 'image/jpeg';
          photoFiles[path] = `data:${mimeType};base64,${imageData}`;
          photoCount++;
        }
        
        // Videos (metadata only)
        if (path.match(/\.(mp4|mov|avi|webm|mkv|flv)$/i)) {
          const sizeInMB = (file._data?.uncompressedSize || 0) / (1024 * 1024);
          videoFiles.push({ 
            path, 
            filename: path.split('/').pop(), 
            size: file._data?.uncompressedSize || 0,
            sizeFormatted: `${sizeInMB.toFixed(2)} MB`
          });
          videoCount++;
        }
        
        // HTML and JSON content for AI processing
        if (path.endsWith('.html') || path.endsWith('.json')) {
          const content = await file.async("text");
          allContent.push({
            path: path,
            type: path.endsWith('.html') ? 'html' : 'json',
            content: content.substring(0, 50000) // Limit to prevent timeout
          });
        }
      } catch (err) {
        console.error(`Error processing ${path}:`, err.message);
      }
    }
    
    console.log(`✅ Collected ${allContent.length} files for AI processing`);
    console.log(`✅ Extracted ${photoCount} photos, ${videoCount} videos`);
    
    // Use AI to intelligently categorize the data
    console.log("🤖 Sending to AI for intelligent categorization...");
    const aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are analyzing a Facebook data archive. Extract and categorize ALL data into these categories:
      
- friends: List of friend names
- conversations: Message conversations (with participants and message count)
- posts: User's posts/status updates
- comments: Comments made by user
- likes: Pages/posts liked
- groups: Groups joined
- events: Events user attended/was invited to
- reviews: Reviews written
- marketplace: Marketplace listings

The archive contains HTML and JSON files. Extract EVERY piece of data you can find. Be thorough.

Return a JSON object with these exact keys: friends (array of {name, date_added}), conversations (array of {conversation_with, totalMessages}), posts (array of {text, timestamp}), comments (array of {text, timestamp}), likes (array of {title, timestamp}), groups (array of {name, timestamp}), events (array of {text, timestamp}), reviews (array of {text, timestamp}), marketplace (array of {text, timestamp}).

Archive files:
${JSON.stringify(allContent, null, 2)}`,
      response_json_schema: {
        type: "object",
        properties: {
          friends: { type: "array", items: { type: "object", properties: { name: {type: "string"}, date_added: {type: "string"} } } },
          conversations: { type: "array", items: { type: "object", properties: { conversation_with: {type: "string"}, totalMessages: {type: "number"} } } },
          posts: { type: "array", items: { type: "object", properties: { text: {type: "string"}, timestamp: {type: "string"} } } },
          comments: { type: "array", items: { type: "object", properties: { text: {type: "string"}, timestamp: {type: "string"} } } },
          likes: { type: "array", items: { type: "object", properties: { title: {type: "string"}, timestamp: {type: "string"} } } },
          groups: { type: "array", items: { type: "object", properties: { name: {type: "string"}, timestamp: {type: "string"} } } },
          events: { type: "array", items: { type: "object", properties: { text: {type: "string"}, timestamp: {type: "string"} } } },
          reviews: { type: "array", items: { type: "object", properties: { text: {type: "string"}, timestamp: {type: "string"} } } },
          marketplace: { type: "array", items: { type: "object", properties: { text: {type: "string"}, timestamp: {type: "string"} } } }
        }
      }
    });
    
    const categorizedData = aiResult;
    console.log("✅ AI categorization complete");
    
    // Build final response
    const data = {
      profile: { name: "", email: "" },
      posts: categorizedData.posts || [],
      friends: categorizedData.friends || [],
      messages: (categorizedData.conversations || []).map(c => ({
        conversation_with: c.conversation_with,
        participants: [c.conversation_with],
        messages: [],
        lastMessageTimestamp: 0,
        totalMessages: c.totalMessages || 0
      })),
      photos: Object.keys(photoFiles).map((path, idx) => ({ path, filename: path.split('/').pop(), timestamp: "" })),
      videos: videoFiles,
      photoFiles: photoFiles,
      videoFiles: {},
      comments: categorizedData.comments || [],
      groups: categorizedData.groups || [],
      marketplace: categorizedData.marketplace || [],
      events: categorizedData.events || [],
      reviews: categorizedData.reviews || [],
      likes: categorizedData.likes || []
    };
    
    console.log(`📊 FINAL RESULTS:`);
    console.log(`   Posts: ${data.posts.length}`);
    console.log(`   Friends: ${data.friends.length}`);
    console.log(`   Conversations: ${data.messages.length}`);
    console.log(`   Photos: ${photoCount}`);
    console.log(`   Videos: ${videoCount}`);
    console.log(`   Comments: ${data.comments.length}`);
    console.log(`   Likes: ${data.likes.length}`);
    console.log(`   Groups: ${data.groups.length}`);
    console.log(`   Events: ${data.events.length}`);
    console.log(`   Reviews: ${data.reviews.length}`);
    console.log(`   Marketplace: ${data.marketplace.length}`);

    return Response.json(data);
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});