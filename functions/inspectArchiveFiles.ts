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
    const { fileUrl } = body;
    
    if (!fileUrl) {
      return Response.json({ error: 'Missing fileUrl' }, { status: 400 });
    }

    // Fetch the ZIP from Dreamhost
    console.log('Fetching from:', fileUrl);
    const zipResponse = await fetch(fileUrl);
    
    if (!zipResponse.ok) {
      return Response.json({ 
        error: `Failed to fetch: ${zipResponse.status} ${zipResponse.statusText}`,
        url: fileUrl 
      }, { status: 400 });
    }
    
    const blob = await zipResponse.blob();
    const zip = await JSZip.loadAsync(blob);
    
    // Get all file paths
    const allFiles = [];
    for (const [path, file] of Object.entries(zip.files)) {
      if (!file.dir) {
        allFiles.push(path);
      }
    }

    // Find sample files for each category
    const samples = {
      friendsFiles: [],
      messagesFiles: [],
      postsFiles: [],
      groupsFiles: [],
      othersFiles: []
    };

    for (const path of allFiles) {
      const lower = path.toLowerCase();
      if (lower.includes('friend')) samples.friendsFiles.push(path);
      else if (lower.includes('message') || lower.includes('inbox')) samples.messagesFiles.push(path);
      else if (lower.includes('post') || lower.includes('wall') || lower.includes('your_posts')) samples.postsFiles.push(path);
      else if (lower.includes('group')) samples.groupsFiles.push(path);
      else if (!path.includes('__MACOSX') && !lower.includes('.png') && !lower.includes('.jpg')) samples.othersFiles.push(path);
    }

    // Extract and show content of first file in each category
    const fileContents = {};
    const categoriesToCheck = ['friendsFiles', 'messagesFiles', 'postsFiles', 'groupsFiles'];
    
    for (const category of categoriesToCheck) {
      const files = samples[category].slice(0, 2); // First 2 files
      fileContents[category] = {};
      
      for (const filePath of files) {
        try {
          const content = await zip.file(filePath).async('text');
          // Show first 1000 chars
          fileContents[category][filePath] = {
            size: content.length,
            preview: content.substring(0, 2000)
          };
        } catch (e) {
          fileContents[category][filePath] = { error: e.message };
        }
      }
    }

    return Response.json({
      totalFiles: allFiles.length,
      allFilesList: allFiles.slice(0, 50), // First 50 paths
      samples,
      fileContents,
      blobSize: blob.size
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});