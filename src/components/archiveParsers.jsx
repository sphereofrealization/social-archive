// Archive content parsers - HTML-first, JSON fallback
// All functions return { items: [], sourceFile: string, error?: string }

const parseHtml = (htmlString) => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    
    // Remove script/style/noscript to avoid pollution
    doc.querySelectorAll('script, style, noscript').forEach(el => el.remove());
    
    return doc;
  } catch (err) {
    console.error('[parseHtml] DOMParser error:', err);
    return null;
  }
};

const getText = (el) => el?.textContent?.trim() || '';
const getAttr = (el, attr) => el?.getAttribute(attr)?.trim() || '';

// PHASE 1: Structure probe — inspect HTML layout without exposing content
export function probeFacebookHtmlStructure(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const contentsDiv = doc.querySelector('.contents');
    const topChildClassCounts = {};
    
    // Count top-level children and their classes
    if (contentsDiv) {
      contentsDiv.children && Array.from(contentsDiv.children).forEach(child => {
        const classes = child.className || '(no-class)';
        topChildClassCounts[classes] = (topChildClassCounts[classes] || 0) + 1;
      });
    }
    
    // Convert to sorted array
    const topChildClasses = Object.entries(topChildClassCounts)
      .map(([className, count]) => ({ className, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10
    
    return {
      sourceFile,
      title: doc.querySelector('title')?.textContent?.slice(0, 100) || 'N/A',
      hasContentsDiv: !!contentsDiv,
      selectorCounts: {
        '.contents': contentsDiv ? 1 : 0,
        '.contents .pam': contentsDiv ? contentsDiv.querySelectorAll('.pam').length : 0,
        '.contents > div': contentsDiv ? contentsDiv.querySelectorAll('> div').length : 0,
        '.contents section': contentsDiv ? contentsDiv.querySelectorAll('section').length : 0,
        'div.timestamp': doc.querySelectorAll('div.timestamp').length,
        'abbr': doc.querySelectorAll('abbr').length,
        'img': doc.querySelectorAll('img').length,
        'video': doc.querySelectorAll('video').length,
      },
      topChildClassCounts: topChildClasses
    };
  } catch (err) {
    console.error('[probeFacebookHtmlStructure] Error:', err);
    return { sourceFile, error: err.message };
  }
}

export async function parseFriendsFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const items = [];
    
    // Try <li> elements (common in friend lists)
    doc.querySelectorAll('li').forEach(li => {
      const text = getText(li);
      if (text && text.length > 0) {
        const a = li.querySelector('a');
        const name = a ? getText(a) : text;
        if (name && name.length > 0) {
          items.push({
            name,
            profileUrl: a ? getAttr(a, 'href') : null,
            sourceFile
          });
        }
      }
    });
    
    // If no <li> found, try divs/divs with aria-label or data attributes
    if (items.length === 0) {
      doc.querySelectorAll('div[aria-label], div[data-name]').forEach(div => {
        const name = getAttr(div, 'aria-label') || getAttr(div, 'data-name');
        if (name) {
          items.push({ name, sourceFile });
        }
      });
    }
    
    console.log(`[parseFriendsFromHtml] Extracted ${items.length} friends from ${sourceFile}`);
    return { items, sourceFile };
  } catch (err) {
    console.error(`[parseFriendsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message };
  }
}

export async function parsePostsFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const items = [];
    
    // Look for divs or articles that contain post content
    // Common patterns: data-testid="post", role="article", or divs with long text
    const postContainers = doc.querySelectorAll('[data-testid*="post"], article, .post, [role="article"]');
    
    if (postContainers.length === 0) {
      // Fallback: look for divs with substantial text content
      doc.querySelectorAll('div').forEach(div => {
        const text = getText(div);
        // Only consider divs with meaningful text (>20 chars, <2000 chars)
        if (text.length > 20 && text.length < 2000 && !div.querySelector('div')) {
          items.push({
            text,
            timestamp: null,
            sourceFile
          });
        }
      });
    } else {
      postContainers.forEach(container => {
        const text = getText(container);
        const timeEl = container.querySelector('[data-utime], [data-timestamp], time');
        const timestamp = timeEl ? getAttr(timeEl, 'data-utime') || getText(timeEl) : null;
        
        if (text && text.length > 0) {
          items.push({
            text,
            timestamp,
            sourceFile
          });
        }
      });
    }
    
    console.log(`[parsePostsFromHtml] Extracted ${items.length} posts from ${sourceFile}`);
    return { items, sourceFile };
  } catch (err) {
    console.error(`[parsePostsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message };
  }
}

export async function parseCommentsFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const items = [];
    
    // Look for comment-like containers
    const commentContainers = doc.querySelectorAll('[data-testid*="comment"], .comment, [role="comment"]');
    
    commentContainers.forEach(container => {
      const text = getText(container);
      if (text && text.length > 0) {
        items.push({
          text,
          timestamp: null,
          sourceFile
        });
      }
    });
    
    console.log(`[parseCommentsFromHtml] Extracted ${items.length} comments from ${sourceFile}`);
    return { items, sourceFile };
  } catch (err) {
    console.error(`[parseCommentsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message };
  }
}

export async function parseLikesFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const items = [];
    
    // Likes are usually simple lists
    doc.querySelectorAll('li, div[data-like]').forEach(el => {
      const text = getText(el);
      if (text && text.length > 0) {
        items.push({
          text,
          sourceFile
        });
      }
    });
    
    console.log(`[parseLikesFromHtml] Extracted ${items.length} likes from ${sourceFile}`);
    return { items, sourceFile };
  } catch (err) {
    console.error(`[parseLikesFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message };
  }
}

export async function parseGroupsFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const items = [];
    
    // Groups usually have specific names
    doc.querySelectorAll('li, div[data-group]').forEach(el => {
      const a = el.querySelector('a');
      const text = a ? getText(a) : getText(el);
      if (text && text.length > 0) {
        items.push({
          groupName: text,
          sourceFile
        });
      }
    });
    
    console.log(`[parseGroupsFromHtml] Extracted ${items.length} groups from ${sourceFile}`);
    return { items, sourceFile };
  } catch (err) {
    console.error(`[parseGroupsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message };
  }
}

export async function parseMarketplaceFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const items = [];
    
    // Marketplace items have titles and sometimes prices
    doc.querySelectorAll('[data-testid*="listing"], .listing, div[data-listing]').forEach(el => {
      const titleEl = el.querySelector('h1, h2, h3, [data-title]');
      const priceEl = el.querySelector('[data-price], .price');
      const title = titleEl ? getText(titleEl) : getText(el);
      
      if (title && title.length > 0) {
        items.push({
          title,
          price: priceEl ? getText(priceEl) : null,
          sourceFile
        });
      }
    });
    
    console.log(`[parseMarketplaceFromHtml] Extracted ${items.length} items from ${sourceFile}`);
    return { items, sourceFile };
  } catch (err) {
    console.error(`[parseMarketplaceFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message };
  }
}

export async function parseEventsFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const items = [];
    
    // Events have names and dates
    doc.querySelectorAll('[data-testid*="event"], .event, li').forEach(el => {
      const nameEl = el.querySelector('a, h2, h3');
      const dateEl = el.querySelector('[data-date], time');
      const name = nameEl ? getText(nameEl) : getText(el);
      
      if (name && name.length > 0) {
        items.push({
          name,
          date: dateEl ? getText(dateEl) : null,
          sourceFile
        });
      }
    });
    
    console.log(`[parseEventsFromHtml] Extracted ${items.length} events from ${sourceFile}`);
    return { items, sourceFile };
  } catch (err) {
    console.error(`[parseEventsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message };
  }
}

export async function parseReelsFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const items = [];
    
    // Reels are usually video references
    doc.querySelectorAll('[data-testid*="reel"], .reel, a[href*="reel"]').forEach(el => {
      const text = getText(el);
      if (text && text.length > 0) {
        items.push({
          title: text,
          sourceFile
        });
      }
    });
    
    console.log(`[parseReelsFromHtml] Extracted ${items.length} reels from ${sourceFile}`);
    return { items, sourceFile };
  } catch (err) {
    console.error(`[parseReelsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message };
  }
}

export async function parseCheckinsFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const items = [];
    
    // Check-ins have location names
    doc.querySelectorAll('[data-testid*="checkin"], .checkin, li').forEach(el => {
      const text = getText(el);
      if (text && text.length > 0) {
        items.push({
          location: text,
          sourceFile
        });
      }
    });
    
    console.log(`[parseCheckinsFromHtml] Extracted ${items.length} check-ins from ${sourceFile}`);
    return { items, sourceFile };
  } catch (err) {
    console.error(`[parseCheckinsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message };
  }
}

// Generic JSON parser (fallback for all categories)
export function parseJsonGeneric(jsonObj, sourceFile) {
  try {
    if (!jsonObj) throw new Error('Empty JSON');
    
    let items = [];
    
    // If it's an array, use as-is
    if (Array.isArray(jsonObj)) {
      items = jsonObj.map((item, idx) => ({
        ...item,
        sourceFile,
        _index: idx
      }));
    } else if (typeof jsonObj === 'object') {
      // If it has a "data" or "records" key, use that
      if (jsonObj.data && Array.isArray(jsonObj.data)) {
        items = jsonObj.data.map((item, idx) => ({
          ...item,
          sourceFile,
          _index: idx
        }));
      } else {
        // Otherwise treat object values as items
        items = Object.entries(jsonObj).map(([key, val]) => ({
          key,
          value: typeof val === 'object' ? JSON.stringify(val).slice(0, 200) : val,
          sourceFile
        }));
      }
    }
    
    console.log(`[parseJsonGeneric] Extracted ${items.length} items from ${sourceFile}`);
    return { items, sourceFile };
  } catch (err) {
    console.error(`[parseJsonGeneric] Error:`, err);
    return { items: [], sourceFile, error: err.message };
  }
}