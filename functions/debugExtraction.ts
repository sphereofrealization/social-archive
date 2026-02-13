import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { archiveId } = body;
    
    if (!archiveId) {
      return Response.json({ error: 'Missing archiveId' }, { status: 400 });
    }

    // Fetch the archive record
    const archive = await base44.entities.Archive.filter({ id: archiveId });
    if (!archive || archive.length === 0) {
      return Response.json({ error: 'Archive not found' }, { status: 404 });
    }

    const archiveRecord = archive[0];
    const fileUrl = archiveRecord.file_url;

    console.log('=== DEBUG EXTRACTION ===');
    console.log('Archive:', archiveRecord.file_name);
    console.log('File URL:', fileUrl);

    // Step 1: Get file tree
    console.log('\n--- CALLING getFileTree ---');
    const treeResponse = await base44.functions.invoke('getFileTree', { fileUrl });
    const { tree } = treeResponse.data;

    // Flatten tree to show structure
    const flattenTree = (node, prefix = '') => {
      const items = [];
      Object.keys(node).forEach(key => {
        const item = node[key];
        if (item.type === 'file') {
          items.push(prefix + key + ' (' + (item.size / 1024).toFixed(1) + 'KB)');
        } else if (item.type === 'folder') {
          items.push(prefix + key + '/');
          items.push(...flattenTree(item.children, prefix + '  '));
        }
      });
      return items;
    };

    const treeItems = flattenTree(tree);
    console.log('Files in archive:');
    treeItems.slice(0, 100).forEach(item => console.log('  ' + item));
    if (treeItems.length > 100) {
      console.log(`  ... and ${treeItems.length - 100} more files`);
    }

    // Step 2: Run extraction
    console.log('\n--- CALLING getArchiveFile ---');
    const extractResponse = await base44.functions.invoke('getArchiveFile', { fileUrl });
    const extractedData = extractResponse.data;

    const summary = {
      posts: extractedData.posts?.length || 0,
      friends: extractedData.friends?.length || 0,
      messages: extractedData.messages?.length || 0,
      comments: extractedData.comments?.length || 0,
      likes: extractedData.likes?.length || 0,
      groups: extractedData.groups?.length || 0,
      reviews: extractedData.reviews?.length || 0,
      marketplace: extractedData.marketplace?.length || 0,
      photos: (extractedData.photos?.length || 0) + Object.keys(extractedData.photoFiles || {}).length,
      videos: extractedData.videos?.length || 0,
      candidatesFound: extractedData.debug?.candidatesFound || {},
      filesRead: Object.keys(extractedData.debug?.filesRead || {}).length,
      parseErrors: extractedData.debug?.parseErrors || [],
      warnings: extractedData.warnings || [],
      sourceFilesUsed: extractedData.sourceFilesUsed || {},
      executionTime: extractedData.debug?.executionTimeMs || 0
    };

    console.log('\n--- EXTRACTION RESULTS ---');
    console.log('Counts:', summary);
    console.log('\nCandidates found:', summary.candidatesFound);
    console.log('\nSource files used:', summary.sourceFilesUsed);
    console.log('\nParse errors:', summary.parseErrors.slice(0, 5));
    console.log('\nExecution time:', summary.executionTime + 'ms');

    return Response.json(summary);
    
  } catch (error) {
    console.error('Debug error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});