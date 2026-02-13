import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip@3.10.1';
import * as cheerio from 'npm:cheerio@1.0.0-rc.12';

const TIME_LIMIT_MS = 22000; // 22 second time budget (leave margin for network)
const MAX_HTML_FILES_PER_CATEGORY = 10;
const MAX_TOTAL_BYTES = 8_000_000; // 8MB max parse size
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
    
    // === PASS 1: Index all files (fast, no parsing) ===
    const index = {
      friendsHtml: [],
      friendsJson: [],
      messagesHtml: [],
      messagesJson: [],
      commentsHtml: [],
      commentsJson: [],
      postsHtml: [],
      postsJson: [],
      likesHtml: [],
      likesJson: [],
      groupsHtml: [],
      groupsJson: [],
      reviewsHtml: [],
      reviewsJson: [],
      marketplaceHtml: [],
      marketplaceJson: [],
      photos: [],
      videos: []
    };

    const debug = { candidatesFound: {}, filesRead: {}, parseErrors: [] };
    let totalBytesRead = 0;

    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      
      const pathLower = path.toLowerCase();
      const ext = path.split('.').pop().toLowerCase();
      const filename = path.split('/').pop().toLowerCase();
      const size = file._data?.uncompressedSize || 0;

      // Categorize by path + extension
      const entry = { path, filename, ext, size };

      if (pathLower.includes('friend')) {
        if (ext === 'html') index.friendsHtml.push(entry);
        else if (ext === 'json') index.friendsJson.push(entry);
      } else if (pathLower.includes('message') || pathLower.includes('inbox')) {
        if (ext === 'html') index.messagesHtml.push(entry);
        else if (ext === 'json') index.messagesJson.push(entry);
      } else if (pathLower.includes('comment')) {
        if (ext === 'html') index.commentsHtml.push(entry);
        else if (ext === 'json') index.commentsJson.push(entry);
      } else if (pathLower.includes('like') || pathLower.includes('reaction')) {
        if (ext === 'html') index.likesHtml.push(entry);
        else if (ext === 'json') index.likesJson.push(entry);
      } else if (pathLower.includes('group')) {
        if (ext === 'html') index.groupsHtml.push(entry);
        else if (ext === 'json') index.groupsJson.push(entry);
      } else if (pathLower.includes('review')) {
        if (ext === 'html') index.reviewsHtml.push(entry);
        else if (ext === 'json') index.reviewsJson.push(entry);
      } else if (pathLower.includes('marketplace') || pathLower.includes('market')) {
        if (ext === 'html') index.marketplaceHtml.push(entry);
        else if (ext === 'json') index.marketplaceJson.push(entry);
      } else if (pathLower.includes('post') || pathLower.includes('wall') || pathLower.includes('album') || pathLower.includes('your_posts')) {
        if (ext === 'html') index.postsHtml.push(entry);
        else if (ext === 'json') index.postsJson.push(entry);
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) && !filename.includes('icon')) {
        index.photos.push(entry);
      } else if (['mp4', 'mov', 'm4v', 'webm', 'avi'].includes(ext)) {
        index.videos.push(entry);
      }
    }

    // Populate debug counts
    Object.keys(index).forEach(cat => {
      debug.candidatesFound[cat] = index[cat].length;
    });

    // === PASS 2: Parse candidate files with time/budget limits ===
    const result = {
      profile: { name: '', email: '' },
      posts: [],
      friends: [],
      messages: [],
      comments: [],
      likes: [],
      groups: [],
      reviews: [],
      events: [],
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
    const checkBudget = (category = '') => {
      const elapsed = Date.now() - startTime;
      if (elapsed > TIME_LIMIT_MS) {
        if (category) {
          result.warnings.push(`Stopped parsing ${category} (time budget ${TIME_LIMIT_MS}ms exceeded, used ${elapsed}ms)`);
        }
        return false;
      }
      if (totalBytesRead > MAX_TOTAL_BYTES) {
        if (category) {
          result.warnings.push(`Stopped parsing ${category} (byte budget exceeded, used ${totalBytesRead}b)`);
        }
        return false;
      }
      return true;
    };

    // Helper: Parse HTML with proper DOM cleaning
    const parseHtmlText = (html, selectors = ['div', 'p', 'span', 'li', 'a']) => {
      const $ = cheerio.load(html);
      // Remove noise
      $('style, script, noscript, meta, link, head').remove();
      
      const texts = new Set();
      selectors.forEach(sel => {
        $(sel).each((_, el) => {
          const text = $(el).text().trim();
          if (text && text.length > 2 && text.length < 2000 && !text.match(/^[\d\s]+$/)) {
            texts.add(text);
          }
        });
      });
      return Array.from(texts);
    };

    // === Parse Friends ===
    if (checkBudget('friends')) {
      result.sourceFilesUsed.friends = [];
      const filesToRead = [...index.friendsHtml, ...index.friendsJson].slice(0, MAX_HTML_FILES_PER_CATEGORY);
      
      for (const f of filesToRead) {
        if (!checkBudget('friends')) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.friends.push(f.path);
          debug.filesRead[f.path] = true;
          
          if (f.ext === 'html') {
            const texts = parseHtmlText(content, ['li', 'a', 'div', 'p']);
            texts.forEach(text => {
              if (text.length < 100 && !result.friends.find(f => f.name === text)) {
                result.friends.push({ name: text, sourceFile: f.path });
              }
            });
          } else if (f.ext === 'json') {
            try {
              const data = JSON.parse(content);
              const friendsArray = data.friends || data.data || [];
              if (Array.isArray(friendsArray)) {
                friendsArray.forEach(item => {
                  const name = item.name || item.title || '';
                  if (name && !result.friends.find(f => f.name === name)) {
                    result.friends.push({ name, sourceFile: f.path });
                  }
                });
              }
            } catch (e) {
              debug.parseErrors.push(`JSON parse error in ${f.path}: ${e.message}`);
            }
          }
        } catch (e) {
          debug.parseErrors.push(`Failed to read ${f.path}: ${e.message}`);
        }
      }
    }

    // === Parse Messages/Conversations ===
    if (checkBudget('messages')) {
      result.sourceFilesUsed.messages = [];
      const filesToRead = [...index.messagesHtml, ...index.messagesJson].slice(0, MAX_HTML_FILES_PER_CATEGORY);
      
      for (const f of filesToRead) {
        if (!checkBudget('messages')) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.messages.push(f.path);
          debug.filesRead[f.path] = true;
          
          if (f.ext === 'html') {
            const $ = cheerio.load(content);
            $('style, script, noscript, head, meta').remove();
            
            const threadTitle = $('title').text().trim() || f.filename.replace('.html', '');
            const messages = [];
            
            // Extract message text from common FB structures
            $('div[data-message], .message, p, span').each((_, el) => {
              const text = $(el).text().trim();
              if (text && text.length > 1 && text.length < 1000 && messages.length < 50) {
                messages.push({ text, sender: '', timestamp: '' });
              }
            });

            if (messages.length > 0) {
              result.messages.push({
                conversation_with: threadTitle,
                messages,
                sourceFile: f.path,
                totalMessages: messages.length
              });
            }
          } else if (f.ext === 'json') {
            try {
              const data = JSON.parse(content);
              const convs = data.conversations || data.messages || [];
              if (Array.isArray(convs)) {
                convs.slice(0, MAX_HTML_FILES_PER_CATEGORY).forEach(conv => {
                  const msgs = conv.messages || [];
                  if (Array.isArray(msgs) && msgs.length > 0) {
                    result.messages.push({
                      conversation_with: conv.title || conv.name || 'Conversation',
                      messages: msgs.slice(0, 50).map(m => ({
                        text: m.content || m.text || '',
                        sender: m.sender || m.from || '',
                        timestamp: m.timestamp || ''
                      })),
                      sourceFile: f.path,
                      totalMessages: msgs.length
                    });
                  }
                });
              }
            } catch (e) {
              debug.parseErrors.push(`JSON parse error in ${f.path}: ${e.message}`);
            }
          }
        } catch (e) {
          debug.parseErrors.push(`Failed to read ${f.path}: ${e.message}`);
        }
      }
    }

    // === Parse Comments ===
    if (checkBudget('comments')) {
      result.sourceFilesUsed.comments = [];
      const filesToRead = [...index.commentsHtml, ...index.commentsJson].slice(0, MAX_HTML_FILES_PER_CATEGORY);
      
      for (const f of filesToRead) {
        if (!checkBudget('comments')) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.comments.push(f.path);
          debug.filesRead[f.path] = true;
          
          if (f.ext === 'html') {
            const texts = parseHtmlText(content, ['div', 'p', 'span']);
            texts.forEach(text => {
              if (text.length > 5 && text.length < 500 && result.comments.length < 100) {
                if (!result.comments.find(c => c.text === text)) {
                  result.comments.push({ text, timestamp: '', sourceFile: f.path });
                }
              }
            });
          } else if (f.ext === 'json') {
            try {
              const data = JSON.parse(content);
              const comments = data.comments || data.data || [];
              if (Array.isArray(comments)) {
                comments.slice(0, 100).forEach(comment => {
                  const text = comment.text || comment.content || '';
                  if (text && !result.comments.find(c => c.text === text)) {
                    result.comments.push({
                      text,
                      timestamp: comment.timestamp || '',
                      sourceFile: f.path
                    });
                  }
                });
              }
            } catch (e) {
              debug.parseErrors.push(`JSON parse error in ${f.path}: ${e.message}`);
            }
          }
        } catch (e) {
          debug.parseErrors.push(`Failed to read ${f.path}: ${e.message}`);
        }
      }
    }

    // === Parse Likes/Reactions ===
    if (checkBudget('likes')) {
      result.sourceFilesUsed.likes = [];
      const filesToRead = [...index.likesHtml, ...index.likesJson].slice(0, MAX_HTML_FILES_PER_CATEGORY);
      
      for (const f of filesToRead) {
        if (!checkBudget('likes')) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.likes.push(f.path);
          debug.filesRead[f.path] = true;
          
          if (f.ext === 'html') {
            const texts = parseHtmlText(content, ['a', 'div', 'p']);
            texts.forEach(text => {
              if (text.length > 2 && text.length < 200 && result.likes.length < 200) {
                if (!result.likes.find(l => l.item === text)) {
                  result.likes.push({ item: text, type: 'like', sourceFile: f.path });
                }
              }
            });
          } else if (f.ext === 'json') {
            try {
              const data = JSON.parse(content);
              const likes = data.reactions || data.likes || data.data || [];
              if (Array.isArray(likes)) {
                likes.slice(0, 200).forEach(like => {
                  const item = like.title || like.name || like.text || '';
                  if (item && !result.likes.find(l => l.item === item)) {
                    result.likes.push({
                      item,
                      type: like.reaction || 'like',
                      sourceFile: f.path
                    });
                  }
                });
              }
            } catch (e) {
              debug.parseErrors.push(`JSON parse error in ${f.path}: ${e.message}`);
            }
          }
        } catch (e) {
          debug.parseErrors.push(`Failed to read ${f.path}: ${e.message}`);
        }
      }
    }

    // === Parse Groups ===
    if (checkBudget('groups')) {
      result.sourceFilesUsed.groups = [];
      const filesToRead = [...index.groupsHtml, ...index.groupsJson].slice(0, MAX_HTML_FILES_PER_CATEGORY);
      
      for (const f of filesToRead) {
        if (!checkBudget('groups')) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.groups.push(f.path);
          debug.filesRead[f.path] = true;
          
          if (f.ext === 'html') {
            const $ = cheerio.load(content);
            $('style, script, noscript, head, meta').remove();
            
            const title = $('title').text().trim() || f.filename.replace('.html', '').replace(/_/g, ' ');
            if (title && title.length > 1 && title.length < 200 && !result.groups.find(g => g.name === title)) {
              result.groups.push({ name: title, sourceFile: f.path });
            }
            
            const texts = parseHtmlText(content, ['h1', 'h2', 'h3', 'a']);
            texts.forEach(text => {
              if (text.length > 2 && text.length < 200 && !result.groups.find(g => g.name === text)) {
                result.groups.push({ name: text, sourceFile: f.path });
              }
            });
          } else if (f.ext === 'json') {
            try {
              const data = JSON.parse(content);
              const groups = data.groups || data.data || [];
              if (Array.isArray(groups)) {
                groups.forEach(group => {
                  const name = group.name || group.title || '';
                  if (name && !result.groups.find(g => g.name === name)) {
                    result.groups.push({ name, sourceFile: f.path });
                  }
                });
              }
            } catch (e) {
              debug.parseErrors.push(`JSON parse error in ${f.path}: ${e.message}`);
            }
          }
        } catch (e) {
          debug.parseErrors.push(`Failed to read ${f.path}: ${e.message}`);
        }
      }
    }

    // === Parse Reviews ===
    if (checkBudget('reviews')) {
      result.sourceFilesUsed.reviews = [];
      const filesToRead = [...index.reviewsHtml, ...index.reviewsJson].slice(0, MAX_HTML_FILES_PER_CATEGORY);
      
      for (const f of filesToRead) {
        if (!checkBudget('reviews')) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.reviews.push(f.path);
          debug.filesRead[f.path] = true;
          
          if (f.ext === 'html') {
            const texts = parseHtmlText(content, ['div', 'p']);
            texts.forEach(text => {
              if (text.length > 5 && text.length < 1000 && result.reviews.length < 100) {
                if (!result.reviews.find(r => r.text === text)) {
                  result.reviews.push({ text, place: '', rating: 0, sourceFile: f.path });
                }
              }
            });
          } else if (f.ext === 'json') {
            try {
              const data = JSON.parse(content);
              const reviews = data.reviews || data.data || [];
              if (Array.isArray(reviews)) {
                reviews.slice(0, 100).forEach(review => {
                  const text = review.text || review.content || '';
                  if (text && !result.reviews.find(r => r.text === text)) {
                    result.reviews.push({
                      text,
                      place: review.place || review.location || '',
                      rating: review.rating || 0,
                      sourceFile: f.path
                    });
                  }
                });
              }
            } catch (e) {
              debug.parseErrors.push(`JSON parse error in ${f.path}: ${e.message}`);
            }
          }
        } catch (e) {
          debug.parseErrors.push(`Failed to read ${f.path}: ${e.message}`);
        }
      }
    }

    // === Parse Marketplace ===
    if (checkBudget('marketplace')) {
      result.sourceFilesUsed.marketplace = [];
      const filesToRead = [...index.marketplaceHtml, ...index.marketplaceJson].slice(0, MAX_HTML_FILES_PER_CATEGORY);
      
      for (const f of filesToRead) {
        if (!checkBudget('marketplace')) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.marketplace.push(f.path);
          debug.filesRead[f.path] = true;
          
          if (f.ext === 'html') {
            const texts = parseHtmlText(content, ['div', 'a', 'p']);
            texts.forEach(text => {
              if (text.length > 2 && text.length < 300 && result.marketplace.length < 100) {
                if (!result.marketplace.find(m => m.title === text)) {
                  result.marketplace.push({ title: text, text: '', sourceFile: f.path });
                }
              }
            });
          } else if (f.ext === 'json') {
            try {
              const data = JSON.parse(content);
              const items = data.marketplace || data.items || data.data || [];
              if (Array.isArray(items)) {
                items.slice(0, 100).forEach(item => {
                  const title = item.title || item.name || '';
                  if (title && !result.marketplace.find(m => m.title === title)) {
                    result.marketplace.push({
                      title,
                      text: item.description || item.text || '',
                      sourceFile: f.path
                    });
                  }
                });
              }
            } catch (e) {
              debug.parseErrors.push(`JSON parse error in ${f.path}: ${e.message}`);
            }
          }
        } catch (e) {
          debug.parseErrors.push(`Failed to read ${f.path}: ${e.message}`);
        }
      }
    }

    // === Parse Posts ===
    if (checkBudget('posts')) {
      result.sourceFilesUsed.posts = [];
      const filesToRead = [...index.postsHtml, ...index.postsJson].slice(0, MAX_HTML_FILES_PER_CATEGORY);
      
      for (const f of filesToRead) {
        if (!checkBudget('posts')) break;
        try {
          const content = await zip.file(f.path).async('text');
          totalBytesRead += content.length;
          result.sourceFilesUsed.posts.push(f.path);
          debug.filesRead[f.path] = true;
          
          if (f.ext === 'html') {
            const texts = parseHtmlText(content, ['div', 'p']);
            texts.forEach(text => {
              if (text.length > 5 && text.length < 2000 && result.posts.length < 100) {
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
          } else if (f.ext === 'json') {
            try {
              const data = JSON.parse(content);
              const posts = data.posts || data.data || [];
              if (Array.isArray(posts)) {
                posts.slice(0, 100).forEach(post => {
                  const text = post.content || post.text || '';
                  if (text && !result.posts.find(p => p.text === text)) {
                    result.posts.push({
                      text: text.substring(0, 500),
                      timestamp: post.timestamp || post.date || '',
                      likes_count: post.likes || 0,
                      comments_count: post.comments || 0,
                      sourceFile: f.path
                    });
                  }
                });
              }
            } catch (e) {
              debug.parseErrors.push(`JSON parse error in ${f.path}: ${e.message}`);
            }
          }
        } catch (e) {
          debug.parseErrors.push(`Failed to read ${f.path}: ${e.message}`);
        }
      }
    }

    // === Process Photos (with base64 thumbnails) ===
    result.sourceFilesUsed.photos = index.photos.map(p => p.path);
    for (let i = 0; i < Math.min(THUMBNAIL_SIZE, index.photos.length); i++) {
      if (!checkBudget('photos')) break;
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
        debug.filesRead[photo.path] = true;
      } catch (e) {
        debug.parseErrors.push(`Failed to load photo ${index.photos[i].path}: ${e.message}`);
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

    // === Process Videos (metadata only, no base64) ===
    result.sourceFilesUsed.videos = index.videos.map(v => v.path);
    for (const video of index.videos) {
      result.videos.push({
        path: video.path,
        filename: video.filename,
        size: video.size
      });
    }

    const elapsed = Date.now() - startTime;
    result.debug.executionTimeMs = elapsed;
    result.debug.totalBytesRead = totalBytesRead;

    return Response.json(result);
    
  } catch (error) {
    console.error('Archive extraction error:', error);
    return Response.json({ error: error.message || 'Failed to extract archive' }, { status: 500 });
  }
});