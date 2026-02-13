import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip@3.10.1';
import * as cheerio from 'npm:cheerio@1.0.0-rc.12';

const TIME_LIMIT_MS = 25000;
const MAX_FILES_PER_CATEGORY = 15;
const CONCURRENCY_LIMIT = 4;

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

    // Verify CORS / Range support
    const headRes = await fetch(fileUrl, { method: 'HEAD' });
    if (!headRes.ok) {
      return Response.json({ error: `Cannot access ZIP: ${headRes.status}` }, { status: 400 });
    }

    const contentLength = parseInt(headRes.headers.get('content-length') || '0', 10);
    if (contentLength === 0) {
      return Response.json({ error: 'ZIP file is empty' }, { status: 400 });
    }

    // Load ZIP
    const zipRes = await fetch(fileUrl);
    const blob = await zipRes.blob();
    const zip = await JSZip.loadAsync(blob);

    // === PASS 1: Index all files ===
    const index = buildIndex(zip);
    
    // === PASS 2: Budgeted extraction ===
    const result = {
      counts: {
        posts: 0,
        friends: 0,
        conversations: 0,
        photos: 0,
        videos: 0,
        comments: 0,
        reels: 0,
        checkins: 0,
        likes: 0,
        events: 0,
        reviews: 0,
        groups: 0,
        marketplace: 0
      },
      posts: [],
      friends: [],
      conversations: [],
      comments: [],
      likes: [],
      groups: [],
      reviews: [],
      events: [],
      marketplace: [],
      reels: [],
      checkins: [],
      photos: [],
      videos: [],
      sourceFilesUsed: {},
      warnings: [],
      truncated: false,
      debug: {
        candidatesFound: index.candidatesFound,
        filesRead: {},
        parseErrors: []
      }
    };

    const checkBudget = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > TIME_LIMIT_MS) {
        result.truncated = true;
        return false;
      }
      return true;
    };

    // Extract each category
    if (checkBudget()) {
      await extractPosts(zip, index, result, checkBudget);
    }
    if (checkBudget()) {
      await extractFriends(zip, index, result, checkBudget);
    }
    if (checkBudget()) {
      await extractConversations(zip, index, result, checkBudget);
    }
    if (checkBudget()) {
      await extractComments(zip, index, result, checkBudget);
    }
    if (checkBudget()) {
      await extractLikes(zip, index, result, checkBudget);
    }
    if (checkBudget()) {
      await extractGroups(zip, index, result, checkBudget);
    }
    if (checkBudget()) {
      await extractReviews(zip, index, result, checkBudget);
    }
    if (checkBudget()) {
      await extractMarketplace(zip, index, result, checkBudget);
    }
    if (checkBudget()) {
      await extractPhotosAndVideos(zip, index, result, checkBudget);
    }

    if (result.truncated) {
      result.warnings.push('Extraction budget exceeded; some categories may be incomplete');
    }

    return Response.json(result);
    
  } catch (error) {
    console.error('Extraction error:', error);
    return Response.json({ error: error.message || 'Extraction failed' }, { status: 500 });
  }
});

function buildIndex(zip) {
  const index = {
    candidatesFound: {},
    friendsHtml: [],
    conversationsHtml: [],
    commentsHtml: [],
    likesHtml: [],
    groupsHtml: [],
    reviewsHtml: [],
    marketplaceHtml: [],
    postsHtml: [],
    photos: [],
    videos: []
  };

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    
    const pathLower = path.toLowerCase();
    const ext = path.split('.').pop().toLowerCase();
    
    if (pathLower.includes('friend')) {
      if (ext === 'html') index.friendsHtml.push(path);
    } else if (pathLower.includes('message') || pathLower.includes('inbox') || pathLower.includes('conversation')) {
      if (ext === 'html') index.conversationsHtml.push(path);
    } else if (pathLower.includes('comment')) {
      if (ext === 'html') index.commentsHtml.push(path);
    } else if (pathLower.includes('like') || pathLower.includes('reaction')) {
      if (ext === 'html') index.likesHtml.push(path);
    } else if (pathLower.includes('group')) {
      if (ext === 'html') index.groupsHtml.push(path);
    } else if (pathLower.includes('review')) {
      if (ext === 'html') index.reviewsHtml.push(path);
    } else if (pathLower.includes('marketplace') || pathLower.includes('market')) {
      if (ext === 'html') index.marketplaceHtml.push(path);
    } else if (pathLower.includes('post') || pathLower.includes('wall') || pathLower.includes('your_posts') || pathLower.includes('album')) {
      if (ext === 'html') index.postsHtml.push(path);
    }
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) && !pathLower.includes('icon')) {
      index.photos.push(path);
    } else if (['mp4', 'mov', 'm4v', 'webm', 'avi'].includes(ext)) {
      index.videos.push(path);
    }
  }

  Object.keys(index).forEach(k => {
    if (k !== 'candidatesFound' && Array.isArray(index[k])) {
      index.candidatesFound[k] = index[k].length;
    }
  });

  return index;
}

function cleanHtml(html) {
  const $ = cheerio.load(html);
  $('style, script, noscript, meta, link, head').remove();
  return $;
}

function extractText(text) {
  if (!text) return '';
  return text.trim()
    .replace(/\s+/g, ' ')
    .substring(0, 2000);
}

async function extractPosts(zip, index, result, checkBudget) {
  result.sourceFilesUsed.posts = [];
  const files = index.postsHtml.slice(0, MAX_FILES_PER_CATEGORY);
  
  for (const filePath of files) {
    if (!checkBudget()) break;
    try {
      const content = await zip.file(filePath).async('text');
      const $ = cleanHtml(content);
      
      $('div').each((_, el) => {
        const text = extractText($(el).text());
        if (text.length > 20 && text.length < 2000 && !text.includes('Generated by') && !text.includes('Contains data')) {
          if (!result.posts.find(p => p.text === text)) {
            result.posts.push({ text, timestamp: '', sourceFile: filePath });
            result.counts.posts++;
          }
        }
      });
      
      result.sourceFilesUsed.posts.push(filePath);
    } catch (e) {
      result.debug.parseErrors.push(`Posts parse error in ${filePath}: ${e.message}`);
    }
  }
}

async function extractFriends(zip, index, result, checkBudget) {
  result.sourceFilesUsed.friends = [];
  const files = index.friendsHtml.slice(0, MAX_FILES_PER_CATEGORY);
  
  for (const filePath of files) {
    if (!checkBudget()) break;
    try {
      const content = await zip.file(filePath).async('text');
      const $ = cleanHtml(content);
      
      const friends = new Set();
      
      // Try extracting from links
      $('a').each((_, el) => {
        const text = extractText($(el).text());
        if (text.length > 2 && text.length < 100 && !text.includes('Generated')) {
          friends.add(text);
        }
      });
      
      // Try list items
      $('li').each((_, el) => {
        const text = extractText($(el).text());
        if (text.length > 2 && text.length < 100 && !text.includes('Generated')) {
          friends.add(text);
        }
      });
      
      friends.forEach(name => {
        if (!result.friends.find(f => f.name === name)) {
          result.friends.push({ name, sourceFile: filePath });
          result.counts.friends++;
        }
      });
      
      result.sourceFilesUsed.friends.push(filePath);
    } catch (e) {
      result.debug.parseErrors.push(`Friends parse error in ${filePath}: ${e.message}`);
    }
  }
}

async function extractConversations(zip, index, result, checkBudget) {
  result.sourceFilesUsed.conversations = [];
  const files = index.conversationsHtml.slice(0, MAX_FILES_PER_CATEGORY);
  
  for (const filePath of files) {
    if (!checkBudget()) break;
    try {
      const content = await zip.file(filePath).async('text');
      const $ = cleanHtml(content);
      
      // Extract thread title from filename or first header
      const title = $('title').text().trim() || filePath.split('/').pop().replace('.html', '').replace(/_/g, ' ');
      
      const messages = [];
      $('div').each((_, el) => {
        const text = extractText($(el).text());
        if (text.length > 3 && text.length < 1000 && messages.length < 100) {
          if (!text.includes('Generated') && !text.includes('Contains data')) {
            messages.push({ text, sender: '', timestamp: '' });
          }
        }
      });
      
      if (messages.length > 0 && !result.conversations.find(c => c.conversation_with === title)) {
        result.conversations.push({
          conversation_with: title,
          messages,
          sourceFile: filePath,
          totalMessages: messages.length
        });
        result.counts.conversations++;
      }
      
      result.sourceFilesUsed.conversations.push(filePath);
    } catch (e) {
      result.debug.parseErrors.push(`Conversations parse error in ${filePath}: ${e.message}`);
    }
  }
}

async function extractComments(zip, index, result, checkBudget) {
  result.sourceFilesUsed.comments = [];
  const files = index.commentsHtml.slice(0, MAX_FILES_PER_CATEGORY);
  
  for (const filePath of files) {
    if (!checkBudget()) break;
    try {
      const content = await zip.file(filePath).async('text');
      const $ = cleanHtml(content);
      
      const comments = new Set();
      $('p, div').each((_, el) => {
        const text = extractText($(el).text());
        if (text.length > 10 && text.length < 1000 && !text.includes('Generated by') && !text.includes('Contains data')) {
          comments.add(text);
        }
      });
      
      comments.forEach(text => {
        if (result.comments.length < 500) {
          result.comments.push({ text, timestamp: '', sourceFile: filePath });
          result.counts.comments++;
        }
      });
      
      result.sourceFilesUsed.comments.push(filePath);
    } catch (e) {
      result.debug.parseErrors.push(`Comments parse error in ${filePath}: ${e.message}`);
    }
  }
}

async function extractLikes(zip, index, result, checkBudget) {
  result.sourceFilesUsed.likes = [];
  const files = index.likesHtml.slice(0, MAX_FILES_PER_CATEGORY);
  
  for (const filePath of files) {
    if (!checkBudget()) break;
    try {
      const content = await zip.file(filePath).async('text');
      const $ = cleanHtml(content);
      
      const likes = new Set();
      $('a').each((_, el) => {
        const text = extractText($(el).text());
        if (text.length > 2 && text.length < 300) {
          likes.add(text);
        }
      });
      
      likes.forEach(item => {
        if (result.likes.length < 500) {
          result.likes.push({ item, type: 'like', sourceFile: filePath });
          result.counts.likes++;
        }
      });
      
      result.sourceFilesUsed.likes.push(filePath);
    } catch (e) {
      result.debug.parseErrors.push(`Likes parse error in ${filePath}: ${e.message}`);
    }
  }
}

async function extractGroups(zip, index, result, checkBudget) {
  result.sourceFilesUsed.groups = [];
  const files = index.groupsHtml.slice(0, MAX_FILES_PER_CATEGORY);
  
  for (const filePath of files) {
    if (!checkBudget()) break;
    try {
      const content = await zip.file(filePath).async('text');
      const $ = cleanHtml(content);
      
      const groups = new Set();
      $('h1, h2, h3, a').each((_, el) => {
        const text = extractText($(el).text());
        if (text.length > 2 && text.length < 200) {
          groups.add(text);
        }
      });
      
      groups.forEach(name => {
        if (result.groups.length < 500) {
          result.groups.push({ name, sourceFile: filePath });
          result.counts.groups++;
        }
      });
      
      result.sourceFilesUsed.groups.push(filePath);
    } catch (e) {
      result.debug.parseErrors.push(`Groups parse error in ${filePath}: ${e.message}`);
    }
  }
}

async function extractReviews(zip, index, result, checkBudget) {
  result.sourceFilesUsed.reviews = [];
  const files = index.reviewsHtml.slice(0, MAX_FILES_PER_CATEGORY);
  
  for (const filePath of files) {
    if (!checkBudget()) break;
    try {
      const content = await zip.file(filePath).async('text');
      const $ = cleanHtml(content);
      
      const reviews = new Set();
      $('p, div').each((_, el) => {
        const text = extractText($(el).text());
        if (text.length > 10 && text.length < 1000) {
          reviews.add(text);
        }
      });
      
      reviews.forEach(text => {
        if (result.reviews.length < 500) {
          result.reviews.push({ text, place: '', rating: 0, sourceFile: filePath });
          result.counts.reviews++;
        }
      });
      
      result.sourceFilesUsed.reviews.push(filePath);
    } catch (e) {
      result.debug.parseErrors.push(`Reviews parse error in ${filePath}: ${e.message}`);
    }
  }
}

async function extractMarketplace(zip, index, result, checkBudget) {
  result.sourceFilesUsed.marketplace = [];
  const files = index.marketplaceHtml.slice(0, MAX_FILES_PER_CATEGORY);
  
  for (const filePath of files) {
    if (!checkBudget()) break;
    try {
      const content = await zip.file(filePath).async('text');
      const $ = cleanHtml(content);
      
      const items = new Set();
      $('a, div, p').each((_, el) => {
        const text = extractText($(el).text());
        if (text.length > 2 && text.length < 300) {
          items.add(text);
        }
      });
      
      items.forEach(title => {
        if (result.marketplace.length < 500) {
          result.marketplace.push({ title, text: '', sourceFile: filePath });
          result.counts.marketplace++;
        }
      });
      
      result.sourceFilesUsed.marketplace.push(filePath);
    } catch (e) {
      result.debug.parseErrors.push(`Marketplace parse error in ${filePath}: ${e.message}`);
    }
  }
}

async function extractPhotosAndVideos(zip, index, result, checkBudget) {
  result.sourceFilesUsed.photos = [];
  result.sourceFilesUsed.videos = [];
  
  index.photos.slice(0, 500).forEach(path => {
    const file = zip.file(path);
    if (file) {
      result.photos.push({
        path,
        filename: path.split('/').pop(),
        size: file._data?.uncompressedSize || 0
      });
      result.counts.photos++;
    }
    result.sourceFilesUsed.photos.push(path);
  });
  
  index.videos.slice(0, 500).forEach(path => {
    const file = zip.file(path);
    if (file) {
      result.videos.push({
        path,
        filename: path.split('/').pop(),
        size: file._data?.uncompressedSize || 0
      });
      result.counts.videos++;
    }
    result.sourceFilesUsed.videos.push(path);
  });
}