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
    
    // Scan archive structure and collect file samples
    const filesByType = {
      posts: [],
      friends: [],
      conversations: [],
      likes: [],
      videos: [],
      comments: [],
      events: [],
      photos: [],
      groups: [],
      reviews: [],
      marketplace: [],
      other: []
    };
    
    const fileSamples = [];
    
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      const pathLower = path.toLowerCase();
      
      // Categorize by folder structure
      if (pathLower.includes('posts')) filesByType.posts.push(path);
      else if (pathLower.includes('friends')) filesByType.friends.push(path);
      else if (pathLower.includes('messages') || pathLower.includes('conversations')) filesByType.conversations.push(path);
      else if (pathLower.includes('likes')) filesByType.likes.push(path);
      else if (pathLower.includes('videos')) filesByType.videos.push(path);
      else if (pathLower.includes('comments')) filesByType.comments.push(path);
      else if (pathLower.includes('events')) filesByType.events.push(path);
      else if (pathLower.includes('photos') || pathLower.match(/\.(jpg|jpeg|png|gif)$/i)) filesByType.photos.push(path);
      else if (pathLower.includes('groups')) filesByType.groups.push(path);
      else if (pathLower.includes('reviews')) filesByType.reviews.push(path);
      else if (pathLower.includes('marketplace')) filesByType.marketplace.push(path);
      else filesByType.other.push(path);
      
      // Collect text file samples for LLM analysis
      if ((pathLower.endsWith('.html') || pathLower.endsWith('.json')) && fileSamples.length < 30) {
        try {
          const content = await file.async("text");
          fileSamples.push({
            path,
            content: content.slice(0, 2000),
            category: Object.keys(filesByType).find(key => filesByType[key].includes(path)) || 'unknown'
          });
        } catch {}
      }
    }
    
    // Now use LLM to extract actual data from the samples
    const extractionPrompt = `Analyze these Facebook archive files and extract REAL data only. Ignore metadata, labels, and headers.

${fileSamples.map(s => `FILE: ${s.path}
CATEGORY: ${s.category}
CONTENT:
${s.content}
---`).join('\n\n')}

Extract and return ONLY a JSON object with counts and samples:
{
  "posts_count": 0,
  "posts_samples": [],
  "friends_count": 0,
  "friends_names": [],
  "messages_count": 0,
  "message_participants": [],
  "likes_count": 0,
  "likes_samples": [],
  "videos_count": 0,
  "video_files": [],
  "comments_count": 0,
  "events_count": 0,
  "event_samples": [],
  "groups_count": 0,
  "group_names": [],
  "reviews_count": 0,
  "marketplace_count": 0
}

RULES:
- Count should be actual count of items, not file count
- Friends must be actual friend names (not "Your Friends", not metadata)
- Posts must be actual status updates you wrote
- Videos must be actual video files you uploaded
- Be conservative - only count what you can clearly identify
- Return ONLY valid JSON`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: extractionPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          posts_count: { type: "number" },
          friends_count: { type: "number" },
          messages_count: { type: "number" },
          likes_count: { type: "number" },
          videos_count: { type: "number" },
          comments_count: { type: "number" },
          events_count: { type: "number" },
          groups_count: { type: "number" },
          reviews_count: { type: "number" },
          marketplace_count: { type: "number" },
          posts_samples: { type: "array" },
          friends_names: { type: "array" },
          video_files: { type: "array" }
        }
      }
    });

    // Extract photos
    const photoFiles = {};
    let photoCount = 0;
    for (const photoPath of filesByType.photos) {
      if (photoCount >= 30) break;
      if (photoPath.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        try {
          const file = zip.file(photoPath);
          const imageData = await file.async("base64");
          const ext = photoPath.split('.').pop().toLowerCase();
          const mimeTypes = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'};
          photoFiles[photoPath] = `data:${mimeTypes[ext] || 'image/jpeg'};base64,${imageData}`;
          photoCount++;
        } catch {}
      }
    }

    return Response.json({
      posts: result.posts_count || 0,
      friends: result.friends_count || 0,
      conversations: result.messages_count || 0,
      photos: photoCount,
      videos: result.videos_count || 0,
      comments: result.comments_count || 0,
      events: result.events_count || 0,
      reviews: result.reviews_count || 0,
      groups: result.groups_count || 0,
      likes: result.likes_count || 0,
      marketplace: result.marketplace_count || 0,
      photoFiles,
      raw: result
    });
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});