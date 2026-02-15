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
    
    const probe = probeFacebookExportHtml(htmlString, sourceFile);
    const items = [];
    
    // Try <li> elements (common in friend lists)
    doc.querySelectorAll('li').forEach(li => {
      const text = getText(li);
      if (text && text.length > 0) {
        const a = li.querySelector('a');
        const name = a ? getText(a) : text;
        if (name && name.length > 0 && name.length < 200) {
          items.push({
            name,
            profileUrl: a ? getAttr(a, 'href') : null,
            sourceFile
          });
        }
      }
    });
    
    // If no <li> found, try table rows
    if (items.length === 0) {
      doc.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td, th'));
        if (cells.length >= 1) {
          const name = getText(cells[0]);
          if (name && name.length > 0 && name.length < 200) {
            items.push({
              name,
              sourceFile
            });
          }
        }
      });
    }
    
    // If still nothing, try divs/divs with aria-label or data attributes
    if (items.length === 0) {
      doc.querySelectorAll('div[aria-label], div[data-name]').forEach(div => {
        const name = getAttr(div, 'aria-label') || getAttr(div, 'data-name');
        if (name && name.length < 200) {
          items.push({ name, sourceFile });
        }
      });
    }
    
    console.log(`[parseFriendsFromHtml] Extracted ${items.length} friends from ${sourceFile}`);
    return { items, sourceFile, probe: items.length === 0 ? probe : undefined };
  } catch (err) {
    console.error(`[parseFriendsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message, probe: probeFacebookExportHtml(htmlString, sourceFile) };
  }
}

export async function parsePostsFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const items = [];
    let blocksFoundCount = 0;
    let postsWithTextCount = 0;
    let postsWithMediaCount = 0;
    
    // PHASE 2a: Restrict to real content container
    const root = doc.querySelector('.contents') || doc.body;
    if (!root) throw new Error('No content root found');
    
    // PHASE 2c: Adaptive selector strategy
    let postBlocks = [];
    
    // Try .pam (common post class)
    postBlocks = Array.from(root.querySelectorAll(':scope > .pam'));
    if (postBlocks.length === 0) {
      // Fallback: direct children divs (filter out obvious non-posts)
      postBlocks = Array.from(root.querySelectorAll(':scope > div'))
        .filter(div => {
          const text = getText(div);
          return text.length > 0 && !text.includes('Generated by');
        });
    }
    if (postBlocks.length === 0) {
      // Fallback: section elements
      postBlocks = Array.from(root.querySelectorAll(':scope > section'));
    }
    if (postBlocks.length === 0) {
      // Last resort: any div within root that has timestamp-like content
      postBlocks = Array.from(root.querySelectorAll('div')).filter(div => {
        return div.querySelector('div.timestamp, abbr') !== null;
      });
    }
    
    blocksFoundCount = postBlocks.length;
    
    // PHASE 2d: Extract content from blocks
    postBlocks.forEach(block => {
      // Skip header blocks
      const blockText = getText(block);
      if (blockText.includes('Contains data you requested from') || 
          blockText.includes('Generated by') ||
          blockText.includes('Facebook')) {
        return;
      }
      
      // Extract timestamp
      let timestamp = null;
      const timestampEl = block.querySelector('div.timestamp, abbr');
      if (timestampEl) {
        timestamp = getText(timestampEl);
      }
      
      // Extract media paths
      const mediaPaths = [];
      block.querySelectorAll('img[src], video[src], source[src], a[href]').forEach(el => {
        let src = getAttr(el, 'src') || getAttr(el, 'href');
        if (src && /\.(jpg|jpeg|png|gif|mp4|mov|webm)$/i.test(src)) {
          mediaPaths.push(src);
        }
      });
      
      // Extract body text (clone and clean)
      const clone = block.cloneNode(true);
      clone.querySelectorAll('div.timestamp, .meta, nav, script, style').forEach(el => el.remove());
      let bodyText = getText(clone)
        .split('\n')
        .map(line => line.trim())
        .filter(line => {
          // Filter boilerplate
          if (!line) return false;
          if (line.includes('Contains data you requested from')) return false;
          if (line.includes('Generated by')) return false;
          if (line === 'U' || line === 'You') return false; // avatar-only lines
          if (line.length < 2) return false;
          return true;
        })
        .join('\n')
        .trim();
      
      // Allow empty text if media exists
      if (bodyText || mediaPaths.length > 0) {
        items.push({
          author: 'You',
          timestamp: timestamp || null,
          text: bodyText || null,
          mediaPaths: mediaPaths.length > 0 ? mediaPaths : null,
          sourceFile
        });
        if (bodyText) postsWithTextCount++;
        if (mediaPaths.length > 0) postsWithMediaCount++;
      }
    });
    
    console.log(`[parsePostsFromHtml] blocks=${blocksFoundCount} posts=${items.length} withText=${postsWithTextCount} withMedia=${postsWithMediaCount}`);
    return {
      items,
      sourceFile,
      debug: { blocksFoundCount, postsExtractedCount: items.length, postsWithTextCount, postsWithMediaCount }
    };
  } catch (err) {
    console.error(`[parsePostsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message, debug: { blocksFoundCount: 0, postsExtractedCount: 0 } };
  }
}

export async function parseCommentsFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const probe = probeFacebookExportHtml(htmlString, sourceFile);
    const items = [];
    
    // Look for comment-like containers
    let commentContainers = doc.querySelectorAll('[data-testid*="comment"], .comment, [role="comment"]');
    
    if (commentContainers.length === 0) {
      // Fallback: table rows (comments often stored in tables)
      commentContainers = doc.querySelectorAll('tr');
    }
    
    if (commentContainers.length === 0) {
      // Fallback: list items
      commentContainers = doc.querySelectorAll('li');
    }
    
    if (commentContainers.length === 0) {
      // Fallback: divs with text
      commentContainers = doc.querySelectorAll('.contents > div, .contents > section');
    }
    
    commentContainers.forEach(container => {
      const text = getText(container);
      if (text && text.length > 10) { // Minimum meaningful comment length
        items.push({
          text: text.slice(0, 500),
          timestamp: null,
          sourceFile
        });
      }
    });
    
    console.log(`[parseCommentsFromHtml] Extracted ${items.length} comments from ${sourceFile}`);
    return { items, sourceFile, probe: items.length === 0 ? probe : undefined };
  } catch (err) {
    console.error(`[parseCommentsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message, probe: probeFacebookExportHtml(htmlString, sourceFile) };
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