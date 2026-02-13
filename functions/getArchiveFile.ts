import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip@3.10.1';
import * as cheerio from 'npm:cheerio@1.0.0-rc.12';

const TIME_LIMIT_MS = 25000; // 25 second time budget
const MAX_HTML_FILES_PER_CATEGORY = 5;
const MAX_TOTAL_BYTES = 5_000_000; // 5MB max parse size
const THUMBNAIL_SIZE = 30; // First 30 photos as base64

Deno.serve(async (req) => {
  const startTime = Date.now();
  
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

    // Fetch ZIP
    const zipResponse = await fetch(fileUrl);
    if (!zipResponse.ok) {
      return Response.json({ error: `Failed to fetch: ${zipResponse.status}` }, { status: 400 });
    }
    
    const blob = await zipResponse.blob();
    const zip = await JSZip.loadAsync(blob);
    
    // === PASS 1: Index all files ===
    const index = {
      friends: [],
      messages: [],
      comments: [],
      posts: [],
      likes: [],
      groups: [],
      reviews: [],
      marketplace: [],
      photos: [],
      videos: [],
      other: []
    };

    const debug = { candidatesFound: {}, timeoutWarnings: [] };
    let totalBytesRead = 0;

    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      const pathLower = path.toLowerCase();
      const ext = path.split('.').pop().toLowerCase();
      const filename = path.split('/').pop().toLowerCase();
      const size = file._data?.uncompressedSize || 0;

      // Classify by path patterns
      if (pathLower.includes('friend')) {
        index.friends.push({ path, filename, ext, size });
      } else if (pathLower.includes('message') || pathLower.includes('inbox')) {
        index.messages.push({ path, filename, ext, size });
      } else if (pathLower.includes('comment')) {
        index.comments.push({ path, filename, ext, size });
      } else if (pathLower.includes('like') || pathLower.includes('reaction')) {
        index.likes.push({ path, filename, ext, size });
      } else if (pathLower.includes('group')) {
        index.groups.push({ path, filename, ext, size });
      } else if (pathLower.includes('review')) {
        index.reviews.push({ path, filename, ext, size });
      } else if (pathLower.includes('marketplace') || pathLower.includes('market')) {
        index.marketplace.push({ path, filename, ext, size });
      } else if (pathLower.includes('post') || pathLower.includes('wall') || pathLower.includes('album')) {
        index.posts.push({ path, filename, ext, size });
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) && !filename.includes('icon')) {
        index.photos.push({ path, filename, ext, size });
      } else if (['mp4', 'mov', 'm4v', 'webm', 'avi'].includes(ext)) {
        index.videos.push({ path, filename, ext, size });
      }
    }

    Object.keys(index).forEach(cat => {
      debug.candidatesFound[cat] = index[cat].length;
    });

    // === PASS 2: Parse candidate files ===
    const result = {
      profile: { name: '', email: '' },
      posts: [],
      friends: [],
      messages: [],
      comments: [],
      likes: [],
      groups: [],
      reviews: [],
      marketplace: [],
      reels: [],
      checkins: [],
      photos: [],
      photoFiles: {},
      videos: [],
      videoFiles: {},
      warnings: [],
      sourceFilesUsed: {},
      debug
    };

    // Helper to check time/budget
    const checkBudget = () => {
      if (Date.now() - startTime > TIME_LIMIT_MS) {
        result.warnings.push('Extraction stopped early to prevent timeout (time budget exceeded).');
        return false;
      }
      if (totalBytesRead > MAX_TOTAL_BYTES) {
        result.warnings.push('Extraction stopped early (max bytes exceeded).');
        return false;
      }
      return true;
    };

    // === Parse Friends ===
    if (checkBudget()) {
      const friendFiles = index.friends.filter(f => ['html', 'json'].includes(f.ext)).slice(0, MAX_HTML_FILES_PER_CATEGORY);
      result.sourceFilesUsed.friends = [];
      
      for (const f of friendFiles) {
        if (!checkBudget()) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.friends.push(f.path);
          
          if (f.ext === 'html') {
            const $ = cheerio.load(content);
            // Remove style/script
            $('style, script, noscript').remove();
            
            // Extract friend names from various possible structures
            const names = new Set();
            
            // Pattern 1: List items with names
            $('li').each((_, el) => {
              const text = $(el).text().trim();
              if (text.length > 1 && text.length < 100 && !text.includes('\n')) {
                names.add(text);
              }
            });
            
            // Pattern 2: Anchor links (common FB pattern)
            $('a').each((_, el) => {
              const text = $(el).text().trim();
              const href = $(el).attr('href');
              if (text && text.length > 1 && text.length < 100 && !text.includes('\n') && !text.match(/^\d+$/)) {
                names.add(text);
              }
            });
            
            // Pattern 3: Divs with data attributes
            $('div[data-name], div[title]').each((_, el) => {
              const text = $(el).attr('data-name') || $(el).attr('title');
              if (text && text.length > 1 && text.length < 100) {
                names.add(text);
              }
            });

            names.forEach(name => {
              if (!result.friends.find(f => f.name === name)) {
                result.friends.push({ name, sourceFile: f.path });
              }
            });
          }
        } catch (e) {
          console.error(`Failed to parse ${f.path}:`, e.message);
        }
      }
    }

    // === Parse Messages/Conversations ===
    if (checkBudget()) {
      const msgFiles = index.messages.filter(f => ['html', 'json'].includes(f.ext)).slice(0, MAX_HTML_FILES_PER_CATEGORY);
      result.sourceFilesUsed.messages = [];
      
      for (const f of msgFiles) {
        if (!checkBudget()) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.messages.push(f.path);
          
          if (f.ext === 'html') {
            const $ = cheerio.load(content);
            $('style, script, noscript').remove();
            
            // Extract conversation metadata and message samples
            const threadName = $('title').text().trim() || f.filename;
            const messageTexts = [];
            
            // Extract message containers
            $('[data-message], .message, .msg, p').each((_, el) => {
              const text = $(el).text().trim();
              if (text.length > 0 && text.length < 500 && messageTexts.length < 50) {
                messageTexts.push(text);
              }
            });

            if (messageTexts.length > 0) {
              result.messages.push({
                conversation_with: threadName,
                messages: messageTexts.map(text => ({ text, timestamp: '', sender: '' })),
                sourceFile: f.path,
                totalMessages: messageTexts.length
              });
            }
          }
        } catch (e) {
          console.error(`Failed to parse ${f.path}:`, e.message);
        }
      }
    }

    // === Parse Comments ===
    if (checkBudget()) {
      const commentFiles = index.comments.filter(f => ['html', 'json'].includes(f.ext)).slice(0, MAX_HTML_FILES_PER_CATEGORY);
      result.sourceFilesUsed.comments = [];
      
      for (const f of commentFiles) {
        if (!checkBudget()) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.comments.push(f.path);
          
          if (f.ext === 'html') {
            const $ = cheerio.load(content);
            $('style, script, noscript').remove();
            
            $('div, p, span').each((_, el) => {
              const text = $(el).text().trim();
              if (text.length > 5 && text.length < 500 && result.comments.length < 100) {
                if (!result.comments.find(c => c.text === text)) {
                  result.comments.push({ text, timestamp: '', sourceFile: f.path });
                }
              }
            });
          }
        } catch (e) {
          console.error(`Failed to parse ${f.path}:`, e.message);
        }
      }
    }

    // === Parse Likes/Reactions ===
    if (checkBudget()) {
      const likeFiles = index.likes.filter(f => ['html', 'json'].includes(f.ext)).slice(0, MAX_HTML_FILES_PER_CATEGORY);
      result.sourceFilesUsed.likes = [];
      
      for (const f of likeFiles) {
        if (!checkBudget()) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.likes.push(f.path);
          
          if (f.ext === 'html') {
            const $ = cheerio.load(content);
            $('style, script, noscript').remove();
            
            $('a, div, span').each((_, el) => {
              const text = $(el).text().trim();
              if (text.length > 2 && text.length < 100 && result.likes.length < 200) {
                if (!result.likes.find(l => l.item === text)) {
                  result.likes.push({ item: text, type: 'like', sourceFile: f.path });
                }
              }
            });
          }
        } catch (e) {
          console.error(`Failed to parse ${f.path}:`, e.message);
        }
      }
    }

    // === Parse Groups ===
    if (checkBudget()) {
      const groupFiles = index.groups.filter(f => ['html', 'json'].includes(f.ext)).slice(0, MAX_HTML_FILES_PER_CATEGORY);
      result.sourceFilesUsed.groups = [];
      
      for (const f of groupFiles) {
        if (!checkBudget()) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.groups.push(f.path);
          
          if (f.ext === 'html') {
            const $ = cheerio.load(content);
            $('style, script, noscript').remove();
            
            const title = $('title').text().trim() || f.filename.replace('.html', '');
            if (title && !result.groups.find(g => g.name === title)) {
              result.groups.push({ name: title, sourceFile: f.path });
            }
            
            $('h1, h2, h3, a').each((_, el) => {
              const text = $(el).text().trim();
              if (text.length > 2 && text.length < 100 && !result.groups.find(g => g.name === text)) {
                result.groups.push({ name: text, sourceFile: f.path });
              }
            });
          }
        } catch (e) {
          console.error(`Failed to parse ${f.path}:`, e.message);
        }
      }
    }

    // === Parse Reviews ===
    if (checkBudget()) {
      const reviewFiles = index.reviews.filter(f => ['html', 'json'].includes(f.ext)).slice(0, MAX_HTML_FILES_PER_CATEGORY);
      result.sourceFilesUsed.reviews = [];
      
      for (const f of reviewFiles) {
        if (!checkBudget()) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.reviews.push(f.path);
          
          if (f.ext === 'html') {
            const $ = cheerio.load(content);
            $('style, script, noscript').remove();
            
            $('div, p').each((_, el) => {
              const text = $(el).text().trim();
              if (text.length > 5 && text.length < 500 && result.reviews.length < 100) {
                if (!result.reviews.find(r => r.text === text)) {
                  result.reviews.push({ text, place: '', rating: 0, sourceFile: f.path });
                }
              }
            });
          }
        } catch (e) {
          console.error(`Failed to parse ${f.path}:`, e.message);
        }
      }
    }

    // === Parse Marketplace ===
    if (checkBudget()) {
      const mktFiles = index.marketplace.filter(f => ['html', 'json'].includes(f.ext)).slice(0, MAX_HTML_FILES_PER_CATEGORY);
      result.sourceFilesUsed.marketplace = [];
      
      for (const f of mktFiles) {
        if (!checkBudget()) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.marketplace.push(f.path);
          
          if (f.ext === 'html') {
            const $ = cheerio.load(content);
            $('style, script, noscript').remove();
            
            $('a, div, span').each((_, el) => {
              const text = $(el).text().trim();
              if (text.length > 2 && text.length < 200 && result.marketplace.length < 100) {
                if (!result.marketplace.find(m => m.title === text)) {
                  result.marketplace.push({ title: text, text: '', sourceFile: f.path });
                }
              }
            });
          }
        } catch (e) {
          console.error(`Failed to parse ${f.path}:`, e.message);
        }
      }
    }

    // === Parse Posts ===
    if (checkBudget()) {
      const postFiles = index.posts.filter(f => ['html', 'json'].includes(f.ext)).slice(0, MAX_HTML_FILES_PER_CATEGORY);
      result.sourceFilesUsed.posts = [];
      
      for (const f of postFiles) {
        if (!checkBudget()) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.posts.push(f.path);
          
          if (f.ext === 'html') {
            const $ = cheerio.load(content);
            $('style, script, noscript').remove();
            
            // Extract structured posts
            $('div[data-post], article, .post').each((_, el) => {
              const text = $(el).text().trim();
              if (text.length > 5 && text.length < 5000 && result.posts.length < 100) {
                if (!result.posts.find(p => p.text === text)) {
                  result.posts.push({
                    text: text.substring(0, 500),
                    timestamp: '',
                    likes_count: 0,
                    comments_count: 0,
                    sourceFile: f.path
                  });
                }
              }
            });
          }
        } catch (e) {
          console.error(`Failed to parse ${f.path}:`, e.message);
        }
      }
    }

    // === Process Photos ===
    result.sourceFilesUsed.photos = index.photos.map(p => p.path);
    for (let i = 0; i < Math.min(THUMBNAIL_SIZE, index.photos.length); i++) {
      if (!checkBudget()) break;
      try {
        const photo = index.photos[i];
        const content = await zip.file(photo.path).async('base64');
        const mimeTypes = {
          'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
          'gif': 'image/gif', 'webp': 'image/webp'
        };
        const mime = mimeTypes[photo.ext] || 'image/jpeg';
        result.photoFiles[photo.path] = `data:${mime};base64,${content}`;
        totalBytesRead += content.length;
      } catch (e) {
        console.error(`Failed to load photo ${index.photos[i].path}:`, e.message);
      }
    }
    
    // Add remaining photos as metadata only (no base64)
    for (let i = THUMBNAIL_SIZE; i < index.photos.length; i++) {
      result.photos.push({
        path: index.photos[i].path,
        filename: index.photos[i].filename,
        size: index.photos[i].size
      });
    }

    // === Process Videos ===
    result.sourceFilesUsed.videos = index.videos.map(v => v.path);
    for (const video of index.videos) {
      result.videos.push({
        path: video.path,
        filename: video.filename,
        size: video.size
      });
    }

    return Response.json(result);
    
  } catch (error) {
    console.error('Archive extraction error:', error);
    return Response.json({ error: error.message || 'Failed to extract archive' }, { status: 500 });
  }
});