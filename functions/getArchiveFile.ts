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
    
    // Extract ALL text content from archive
    let fullArchiveText = "";
    const photos = [];
    const videos = [];
    
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      const pathLower = path.toLowerCase();
      
      // Extract photos
      if (pathLower.match(/\.(jpg|jpeg|png|gif|webp)$/i) && !pathLower.includes('icon')) {
        photos.push(path);
      }
      
      // Extract videos
      if (pathLower.match(/\.(mp4|mov|avi|mkv|webm)$/i)) {
        videos.push(path);
      }
      
      // Extract text content
      if (pathLower.endsWith('.html') || pathLower.endsWith('.json') || pathLower.endsWith('.txt')) {
        try {
          const content = await file.async("text");
          fullArchiveText += `\n\n=== FILE: ${path} ===\n${content}`;
        } catch {}
      }
    }
    
    // Use LLM to analyze the complete archive content
    const analysisPrompt = `You are analyzing a complete Facebook archive export. Here is ALL the text content from the archive:

${fullArchiveText.slice(0, 100000)}

Based on this content, count and extract:
1. Posts - actual status updates/posts the user made
2. Friends - actual people in the user's friend list
3. Messages/Conversations - actual message threads
4. Comments - comments the user made on posts
5. Likes - things the user liked
6. Events - events the user was part of
7. Groups - groups the user was in
8. Reviews - reviews the user wrote
9. Marketplace - marketplace items
10. Videos - video files the user uploaded
11. Check-ins - places the user checked in to

Return ONLY a valid JSON object with this structure:
{
  "posts": 0,
  "friends": 0,
  "conversations": 0,
  "comments": 0,
  "likes": 0,
  "events": 0,
  "groups": 0,
  "reviews": 0,
  "marketplace": 0,
  "checkins": 0,
  "videos": 0,
  "reels": 0,
  "photos": 0,
  "notes": "Brief explanation of what was found"
}

Be accurate - only count items that are clearly identifiable as the data type. Return ONLY the JSON, no other text.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: analysisPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          posts: { type: "number" },
          friends: { type: "number" },
          conversations: { type: "number" },
          comments: { type: "number" },
          likes: { type: "number" },
          events: { type: "number" },
          groups: { type: "number" },
          reviews: { type: "number" },
          marketplace: { type: "number" },
          checkins: { type: "number" },
          videos: { type: "number" },
          reels: { type: "number" },
          photos: { type: "number" },
          notes: { type: "string" }
        }
      }
    });

    // Load first 30 photos as base64
    const photoFiles = {};
    for (let i = 0; i < Math.min(30, photos.length); i++) {
      try {
        const file = zip.file(photos[i]);
        const imageData = await file.async("base64");
        const ext = photos[i].split('.').pop().toLowerCase();
        const mimeTypes = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'};
        photoFiles[photos[i]] = `data:${mimeTypes[ext] || 'image/jpeg'};base64,${imageData}`;
      } catch {}
    }

    return Response.json({
      profile: { name: "", email: "" },
      posts: [],
      friends: [],
      messages: [],
      comments: [],
      events: [],
      groups: [],
      reviews: [],
      marketplace: [],
      reels: [],
      checkins: [],
      likes: [],
      photoFiles,
      videoFiles: {},
      notes: result.notes || ""
    });
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});