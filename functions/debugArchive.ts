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
    const blob = await response.blob();
    const zip = await JSZip.loadAsync(blob);
    
    const results = {
      fileList: [],
      htmlSamples: {},
      jsonSamples: {}
    };
    
    // List all files
    for (const [path, file] of Object.entries(zip.files)) {
      if (!file.dir) {
        results.fileList.push(path);
        
        // Read sample HTML files (first 3 HTML files from different categories)
        if (path.endsWith('.html') && Object.keys(results.htmlSamples).length < 5) {
          const content = await file.async("text");
          results.htmlSamples[path] = content.substring(0, 10000); // First 10k chars
        }
        
        // Read sample JSON files
        if (path.endsWith('.json') && Object.keys(results.jsonSamples).length < 5) {
          const content = await file.async("text");
          results.jsonSamples[path] = content.substring(0, 5000); // First 5k chars
        }
      }
    }
    
    console.log(`Found ${results.fileList.length} files`);
    console.log(`HTML samples: ${Object.keys(results.htmlSamples).length}`);
    console.log(`JSON samples: ${Object.keys(results.jsonSamples).length}`);
    
    return Response.json(results);
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});