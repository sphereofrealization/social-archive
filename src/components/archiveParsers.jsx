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
    
    // TASK 1: Determine root correctly with fallback
    let root = doc.querySelector('.contents');
    const rootSelectorUsed = root ? '.contents' : 'body';
    if (!root) {
      root = doc.querySelector('body');
    }
    
    // Count structure in chosen root
    const rootCounts = {
      tablesInRoot: root.querySelectorAll('table').length,
      tableRowsInRoot: root.querySelectorAll('tr').length,
      imagesInRoot: root.querySelectorAll('img').length,
      anchorsInRoot: root.querySelectorAll('a').length
    };
    
    let strategyUsed = 'none';
    let items = [];
    let itemsBeforeFilter = 0;
    
    // TASK 2: Deterministic extraction strategy
    if (rootCounts.tablesInRoot > 0 && rootCounts.tableRowsInRoot > 1) {
      // Strategy A: Extract from table rows
      strategyUsed = 'table';
      const tableRows = root.querySelectorAll('tr');
      
      tableRows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        const rowText = cells.map(cell => getText(cell).trim()).filter(t => t.length > 0).join(' ');

        // Extract media refs from this row
        const mediaRefs = extractMediaRefsFromHtml(row.outerHTML, sourceFile);

        // Keep item if it has text OR media
        if (rowText.length > 0 || mediaRefs.length > 0) {
          const item = {
            text: rowText.slice(0, 500) || '(media post)',
            mediaRefs: mediaRefs.length > 0 ? mediaRefs : undefined,
            sourceFile
          };

          // Add debug fields if this has media refs
          if (mediaRefs.length > 0) {
            item._mediaRefsRaw = mediaRefs.slice(0, 5);
            item._mediaRefsNormalized = mediaRefs.slice(0, 5).map(ref => normalizeZipPath('', ref));
          }

          items.push(item);
        }
      });
      itemsBeforeFilter = items.length;
      
      // TASK 3: Remove only aggressive boilerplate, preserve content
      const boilerplatePatterns = [
        /^contains data you requested/i,
        /^you can find this content in/i,
        /^this content is no longer available/i,
        /^only you can see this/i,
        /^generated by/i
      ];
      
      items = items.filter(item => {
        const text = item.text || '';
        return !boilerplatePatterns.some(pattern => pattern.test(text));
      });
      
    } else if (rootCounts.imagesInRoot > 0) {
      // Strategy B: Extract "media posts" from images
      strategyUsed = 'images';
      const images = root.querySelectorAll('img[src]');
      const seenSrc = new Set();
      
      images.forEach(img => {
         const src = img.src;
         if (!seenSrc.has(src)) {
           const caption = getText(img.parentElement) || '';
           const item = {
             text: caption.slice(0, 300) || '(media)',
             mediaRefs: [src],
             sourceFile
           };

           // Add debug fields
           item._mediaRefsRaw = [src];
           item._mediaRefsNormalized = [normalizeZipPath('', src)];

           items.push(item);
           seenSrc.add(src);
         }
       });
      itemsBeforeFilter = items.length;
      
    } else {
      // Strategy C: Fallback text extraction
      strategyUsed = 'text';
      const textBlocks = root.querySelectorAll('div, p, li, span');
      const seenText = new Set();
      
      textBlocks.forEach(block => {
        const text = getText(block).trim();
        if (text.length > 10 && !seenText.has(text)) {
          items.push({
            text: text.slice(0, 500),
            sourceFile
          });
          seenText.add(text);
        }
      });
      itemsBeforeFilter = items.length;
    }
    
    // Return with comprehensive debug info
    const debug = {
      sourceFile,
      rootSelectorUsed,
      rootCounts,
      strategyUsed,
      itemsBeforeFilter,
      itemsAfterFilter: items.length
    };
    
    console.log(`[parsePostsFromHtml] ${sourceFile}:`, debug);
    return { items, sourceFile, debug };
  } catch (err) {
    console.error(`[parsePostsFromHtml] Error:`, err);
    return { 
      items: [], 
      sourceFile, 
      error: err.message, 
      debug: {
        sourceFile,
        error: err.message,
        rootSelectorUsed: 'unknown',
        rootCounts: {},
        strategyUsed: 'error',
        itemsBeforeFilter: 0,
        itemsAfterFilter: 0
      }
    };
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
    
    const probe = probeFacebookExportHtml(htmlString, sourceFile);
    const items = [];
    
    // Likes are usually simple lists or table rows
    let elements = doc.querySelectorAll('li, div[data-like]');
    if (elements.length === 0) {
      elements = doc.querySelectorAll('tr');
    }
    if (elements.length === 0) {
      elements = doc.querySelectorAll('.contents > div, .contents > section');
    }
    
    elements.forEach(el => {
      const text = getText(el);
      if (text && text.length > 0) {
        items.push({
          text: text.slice(0, 300),
          sourceFile
        });
      }
    });
    
    console.log(`[parseLikesFromHtml] Extracted ${items.length} likes from ${sourceFile}`);
    return { items, sourceFile, probe: items.length === 0 ? probe : undefined };
  } catch (err) {
    console.error(`[parseLikesFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message, probe: probeFacebookExportHtml(htmlString, sourceFile) };
  }
}

export async function parseGroupsFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const probe = probeFacebookExportHtml(htmlString, sourceFile);
    const items = [];
    
    // Groups usually have specific names
    let elements = doc.querySelectorAll('li, div[data-group]');
    if (elements.length === 0) {
      elements = doc.querySelectorAll('tr');
    }
    if (elements.length === 0) {
      elements = doc.querySelectorAll('a');
    }
    
    elements.forEach(el => {
      const a = el.querySelector('a');
      const text = a ? getText(a) : getText(el);
      if (text && text.length > 0 && text.length < 200) {
        items.push({
          groupName: text,
          sourceFile
        });
      }
    });
    
    console.log(`[parseGroupsFromHtml] Extracted ${items.length} groups from ${sourceFile}`);
    return { items, sourceFile, probe: items.length === 0 ? probe : undefined };
  } catch (err) {
    console.error(`[parseGroupsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message, probe: probeFacebookExportHtml(htmlString, sourceFile) };
  }
}

export async function parseMarketplaceFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const probe = probeFacebookExportHtml(htmlString, sourceFile);
    const items = [];
    
    // Marketplace items have titles and sometimes prices
    let elements = doc.querySelectorAll('[data-testid*="listing"], .listing, div[data-listing]');
    if (elements.length === 0) {
      elements = doc.querySelectorAll('tr');
    }
    if (elements.length === 0) {
      elements = doc.querySelectorAll('.contents > div, .contents > section');
    }
    
    elements.forEach(el => {
      const titleEl = el.querySelector('h1, h2, h3, [data-title]');
      const priceEl = el.querySelector('[data-price], .price');
      const title = titleEl ? getText(titleEl) : getText(el);
      
      if (title && title.length > 0) {
        items.push({
          title: title.slice(0, 300),
          price: priceEl ? getText(priceEl) : null,
          sourceFile
        });
      }
    });
    
    console.log(`[parseMarketplaceFromHtml] Extracted ${items.length} items from ${sourceFile}`);
    return { items, sourceFile, probe: items.length === 0 ? probe : undefined };
  } catch (err) {
    console.error(`[parseMarketplaceFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message, probe: probeFacebookExportHtml(htmlString, sourceFile) };
  }
}

export async function parseEventsFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const probe = probeFacebookExportHtml(htmlString, sourceFile);
    const items = [];
    
    // Events have names and dates
    let elements = doc.querySelectorAll('[data-testid*="event"], .event, li');
    if (elements.length === 0) {
      elements = doc.querySelectorAll('tr');
    }
    if (elements.length === 0) {
      elements = doc.querySelectorAll('.contents > div, .contents > section');
    }
    
    elements.forEach(el => {
      const nameEl = el.querySelector('a, h2, h3');
      const dateEl = el.querySelector('[data-date], time');
      const name = nameEl ? getText(nameEl) : getText(el);
      
      if (name && name.length > 0) {
        items.push({
          name: name.slice(0, 300),
          date: dateEl ? getText(dateEl) : null,
          sourceFile
        });
      }
    });
    
    console.log(`[parseEventsFromHtml] Extracted ${items.length} events from ${sourceFile}`);
    return { items, sourceFile, probe: items.length === 0 ? probe : undefined };
  } catch (err) {
    console.error(`[parseEventsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message, probe: probeFacebookExportHtml(htmlString, sourceFile) };
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

// PHASE 2: Media reference extraction + path resolution
export function extractMediaRefsFromHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) return [];
    
    const refs = [];
    const mediaExtensions = /\.(jpg|jpeg|png|gif|webp|heic|mp4|mov|m4v|webm)$/i;
    
    // Extract img[src], img[data-src]
    doc.querySelectorAll('img[src], img[data-src]').forEach(img => {
      const src = img.src || img.getAttribute('data-src');
      if (src && isLocalMediaRef(src, mediaExtensions)) {
        refs.push(src);
      }
    });
    
    // Extract video[src], source[src]
    doc.querySelectorAll('video[src], source[src]').forEach(el => {
      const src = el.src;
      if (src && isLocalMediaRef(src, mediaExtensions)) {
        refs.push(src);
      }
    });
    
    // Extract a[href] (only media-like links)
    doc.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      if (href && (mediaExtensions.test(href) || href.includes('/media/'))) {
        if (isLocalMediaRef(href, mediaExtensions)) {
          refs.push(href);
        }
      }
    });
    
    return refs;
  } catch (err) {
    console.error(`[extractMediaRefsFromHtml] Error:`, err);
    return [];
  }
}

function isLocalMediaRef(ref, mediaExtensions) {
  // Ignore absolute URLs
  if (ref.startsWith('http://') || ref.startsWith('https://')) return false;
  if (ref.startsWith('data:') || ref.startsWith('blob:') || ref.startsWith('mailto:')) return false;
  if (ref.startsWith('#')) return false;
  
  // Must look like local media
  return mediaExtensions.test(ref) || ref.includes('/media/');
}

export function resolveZipEntryPath(sourceFile, ref, rootPrefix, knownMediaPathSet, allMediaEntries = null) {
  if (!ref || !knownMediaPathSet || knownMediaPathSet.size === 0) {
    return { resolved: null, reason: 'NO_REFS_FOUND', candidates: [] };
  }
  
  try {
    const baseDir = sourceFile.substring(0, sourceFile.lastIndexOf('/'));
    const candidates = [];
    let bestMatch = null;
    let bestReason = null;
    
    // Normalize the ref
    const refNormalized = normalizeZipPath('', ref);
    if (!refNormalized) {
      return { resolved: null, reason: 'INVALID_REF', candidates: [] };
    }
    
    // Check if ref points to HTML
    if (refNormalized.endsWith('.html')) {
      return { resolved: null, reason: 'REF_POINTS_TO_HTML', refTarget: refNormalized, candidates: [] };
    }
    
    // STEP A: Relative resolution (resolve against baseDir)
    const candidate1 = normalizeZipPath(baseDir, ref);
    candidates.push(candidate1);
    if (knownMediaPathSet.has(candidate1)) {
      return { resolved: candidate1, reason: 'MATCH_BY_RELATIVE', candidates: [candidate1] };
    }
    
    // STEP B: Prefix variants
    if (rootPrefix && !candidate1.startsWith(rootPrefix + '/')) {
      const candidate2 = normalizeZipPath('', rootPrefix + '/' + candidate1);
      candidates.push(candidate2);
      if (knownMediaPathSet.has(candidate2)) {
        return { resolved: candidate2, reason: 'MATCH_BY_PREFIX', candidates: candidates.slice(0, 10) };
      }
    }
    
    // Also try stripping rootPrefix if present
    if (rootPrefix && candidate1.startsWith(rootPrefix + '/')) {
      const candidate3 = candidate1.substring((rootPrefix + '/').length);
      candidates.push(candidate3);
      if (knownMediaPathSet.has(candidate3)) {
        return { resolved: candidate3, reason: 'MATCH_STRIPPED_PREFIX', candidates: candidates.slice(0, 10) };
      }
    }
    
    // STEP C: Basename fallback (search knownMediaPathSet for matching basename)
    const basename = ref.split('/').pop();
    const matchesByBasename = Array.from(knownMediaPathSet).filter(p => p.endsWith('/' + basename) || p === basename);
    
    if (matchesByBasename.length === 1) {
      return { resolved: matchesByBasename[0], reason: 'MATCH_BY_BASENAME', candidates: candidates.slice(0, 10) };
    } else if (matchesByBasename.length > 1) {
      // Find longest common prefix with baseDir
      let bestMatch = matchesByBasename[0];
      let bestScore = 0;
      for (const match of matchesByBasename) {
        const score = match.split('/').slice(0, -1).join('/').length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = match;
        }
      }
      return { resolved: bestMatch, reason: 'MATCH_BY_BASENAME_LONGEST', candidates: candidates.slice(0, 10) };
    }
    
    return { resolved: null, reason: 'NO_MATCH_IN_KNOWN_SET', candidates: candidates.slice(0, 10) };
  } catch (err) {
    console.error(`[resolveZipEntryPath] Error resolving ${ref}:`, err);
    return { resolved: null, reason: 'ERROR', error: err.message, candidates: [] };
  }
}

function normalizeZipPath(baseDir, ref) {
  if (!ref) return baseDir ? baseDir : '';
  
  // 1. Trim whitespace
  ref = ref.trim();
  
  // 2. Replace backslashes with forward slashes
  ref = ref.replace(/\\/g, '/');
  
  // 3. Strip query string and hash
  ref = ref.split('?')[0].split('#')[0];
  
  // 4. Decode URL safely
  try {
    ref = decodeURIComponent(ref);
  } catch {
    // If decode fails, keep the original
  }
  
  // 5. Remove leading "./" and "/"
  ref = ref.replace(/^\.\//, '').replace(/^\/+/, '');
  
  let parts = [];
  
  if (baseDir) {
    parts = baseDir.split('/').filter(p => p);
  }
  
  const refParts = ref.split('/').filter(p => p);
  
  // Resolve relative paths with ".."
  for (const part of refParts) {
    if (part === '..') {
      if (parts.length > 0) {
        parts.pop();
      }
    } else if (part !== '.') {
      parts.push(part);
    }
  }
  
  // 6. Collapse repeated slashes and remove leading/trailing slashes
  const result = parts.join('/').replace(/\/+/g, '/');
  return result;
}

// PHASE 1: Detailed HTML structure probe
export function probeFacebookExportHtml(htmlString, sourceFile) {
  try {
    const doc = parseHtml(htmlString);
    if (!doc) throw new Error('Failed to parse HTML');
    
    const contentsDiv = doc.querySelector('.contents');
    const tables = doc.querySelectorAll('table');
    const tableRows = Array.from(tables).reduce((sum, t) => sum + t.querySelectorAll('tr').length, 0);
    
    return {
      sourceFile,
      htmlLength: htmlString.length,
      htmlStartsWith: htmlString.slice(0, 60),
      title: doc.querySelector('title')?.textContent?.slice(0, 100) || 'N/A',
      hasContentsClass: !!contentsDiv,
      counts: {
        contentsPam: contentsDiv ? contentsDiv.querySelectorAll('.pam').length : 0,
        contentsSections: contentsDiv ? contentsDiv.querySelectorAll('section').length : 0,
        contentsDivChildren: contentsDiv ? contentsDiv.querySelectorAll('> div').length : 0,
        tables: tables.length,
        tableRows: tableRows,
        listItems: doc.querySelectorAll('li').length,
        anchors: doc.querySelectorAll('a').length,
        images: doc.querySelectorAll('img').length,
        scripts: doc.querySelectorAll('script').length
      }
    };
  } catch (err) {
    return { sourceFile, error: err.message };
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