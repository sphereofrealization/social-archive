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
    
    // Collect all HTML and JSON content
    const contentSamples = {};
    let totalFiles = 0;
    
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      totalFiles++;
      
      // Limit to first 50 relevant files to avoid token limits
      if (Object.keys(contentSamples).length < 50) {
        if (path.endsWith('.html') || path.endsWith('.json')) {
          try {
            const content = await file.async("text");
            contentSamples[path] = content.slice(0, 3000); // First 3000 chars per file
          } catch {}
        }
      }
    }
    
    // Use LLM to extract and categorize data
    const extractionPrompt = `You are analyzing a Facebook archive. Here are sample files from the archive:

${Object.entries(contentSamples).map(([path, content]) => `
FILE: ${path}
${content}
---`).join('\n')}

Extract and categorize all the data you find. Return ONLY a valid JSON object with these exact fields (use empty arrays/objects if not found):

{
  "posts": [{"text": "...", "timestamp": "...", "likes_count": 0, "comments_count": 0}],
  "friends": [{"name": "..."}],
  "comments": [{"text": "...", "author": "...", "timestamp": "..."}],
  "messages": [{"conversation_with": "...", "participants": ["..."], "totalMessages": 0, "messages": [{"sender": "...", "text": "...", "timestamp": "..."}]}],
  "groups": [{"name": "...", "timestamp": "..."}],
  "likes": [{"title": "..."}],
  "events": [{"text": "...", "timestamp": "..."}],
  "reviews": [{"text": "...", "timestamp": "..."}],
  "marketplace": [{"text": "...", "timestamp": "..."}],
  "photos": [{"path": "...", "filename": "..."}],
  "videos": [{"path": "...", "filename": "..."}]
}

IMPORTANT:
- Friends should be ACTUAL people you friended, not system labels or metadata
- Posts should be actual status updates you made, not just any text
- Comments should be actual comments you made
- Videos should be actual video files in the archive
- Do NOT duplicate entries
- Do NOT include system labels like "Your friends", "Received friend requests", etc.
- Return ONLY the JSON, no other text`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: extractionPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          posts: { type: "array", items: { type: "object" } },
          friends: { type: "array", items: { type: "object" } },
          comments: { type: "array", items: { type: "object" } },
          messages: { type: "array", items: { type: "object" } },
          groups: { type: "array", items: { type: "object" } },
          likes: { type: "array", items: { type: "object" } },
          events: { type: "array", items: { type: "object" } },
          reviews: { type: "array", items: { type: "object" } },
          marketplace: { type: "array", items: { type: "object" } },
          photos: { type: "array", items: { type: "object" } },
          videos: { type: "array", items: { type: "object" } }
        }
      }
    });

    // Extract media files
    const photoFiles = {};
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

    let photoCount = 0;
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      if (photoCount < 30 && path.match(/\.(jpg|jpeg|png|gif|webp)$/i) && !path.includes('icon')) {
        try {
          const imageData = await file.async("base64");
          const ext = path.split('.').pop().toLowerCase();
          const mimeTypes = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'};
          photoFiles[path] = `data:${mimeTypes[ext] || 'image/jpeg'};base64,${imageData}`;
          photoCount++;
        } catch {}
      }
    }

    return Response.json({
      profile: { name: "", email: "" },
      posts: result.posts || [],
      friends: result.friends || [],
      messages: result.messages || [],
      photos: result.photos || [],
      videos: result.videos || [],
      photoFiles,
      videoFiles: {},
      comments: result.comments || [],
      groups: result.groups || [],
      marketplace: result.marketplace || [],
      events: result.events || [],
      reviews: result.reviews || [],
      likes: result.likes || []
    });
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});