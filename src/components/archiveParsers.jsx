// Archive content parsers - HTML-first, JSON fallback
// All functions return { items: [], sourceFile: string, error?: string }

// Comments Presence Audit - forensic search for all comment sources in ZIP
export async function auditCommentsPresence(zipIndex, archiveUrl, invokeFunction) {
  try {
    // Try multiple sources for entry list
    let allEntries = [];
    let entriesSource = 'unknown';
    
    // Source 1: zipIndex.all (streaming index format)
    if (zipIndex.all && Array.isArray(zipIndex.all) && zipIndex.all.length > 0) {
      allEntries = zipIndex.all;
      entriesSource = 'zipIndex.all';
    }
    // Source 2: zipIndex.mediaEntriesAll (alternative format)
    else if (zipIndex.mediaEntriesAll && Array.isArray(zipIndex.mediaEntriesAll) && zipIndex.mediaEntriesAll.length > 0) {
      allEntries = zipIndex.mediaEntriesAll;
      entriesSource = 'zipIndex.mediaEntriesAll';
    }
    // Source 3: Collect from all known file arrays
    else {
      const collected = [];
      
      // Collect from various categorized arrays
      ['photos', 'videos', 'posts', 'messages', 'friends', 'comments', 'likes', 
       'groups', 'reviews', 'marketplace', 'events', 'reels', 'checkins'].forEach(category => {
        const categoryFiles = zipIndex[category] || [];
        if (Array.isArray(categoryFiles)) {
          categoryFiles.forEach(f => {
            if (typeof f === 'string') {
              collected.push({ path: f });
            } else if (f && f.path) {
              collected.push(f);
            }
          });
        }
      });
      
      if (collected.length > 0) {
        allEntries = collected;
        entriesSource = 'collected_from_categories';
      }
    }
    
    console.log(`[auditCommentsPresence] SCAN: totalZipEntries=${allEntries.length} source=${entriesSource}`);
    console.log(`[auditCommentsPresence] SCAN_DEBUG: zipIndex keys=${Object.keys(zipIndex).join(', ')}`);
    
    if (allEntries.length > 0) {
      const sample = allEntries.slice(0, 10).map(e => e.path || e);
      console.log(`[auditCommentsPresence] SCAN_SAMPLE: first10=`, sample);
    } else {
      console.error(`[auditCommentsPresence] SCAN_FAILED: No entries found. zipIndex=`, zipIndex);
      return {
        commentsDetected: false,
        validCandidates: [],
        candidatesSummary: [],
        error: 'Cannot enumerate ZIP entries (file index not loaded)',
        entriesScanned: 0
      };
    }
    
    // Find all comment-related files using simple substring matching
    const commentCandidates = allEntries.filter(entry => {
      const path = (entry.path || entry).toLowerCase();
      const ext = path.split('.').pop();
      if (!['html', 'json'].includes(ext)) return false;
      
      // Simple substring match (no word boundaries)
      return path.includes('comment') || 
             path.includes('comments') || 
             path.includes('reaction') || 
             path.includes('reactions') || 
             path.includes('reply');
    });
    
    console.log(`[auditCommentsPresence] CANDIDATES: ${commentCandidates.length} files matched comment keywords:`, commentCandidates.map(c => c.path || c));
    
    // Score candidates by path quality
    const scorePath = (path) => {
      const lower = path.toLowerCase();
      if (lower.includes('comments.html') || lower.includes('comments.json')) return 100;
      if (lower.includes('/comments/') && !lower.includes('_in_groups')) return 90;
      if (lower.includes('your_comments')) return 80;
      if (lower.includes('comment')) return 50;
      return 0;
    };
    
    const rankedCandidates = commentCandidates
      .map(entry => ({ ...entry, score: scorePath(entry.path) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);
    
    const candidatesSummary = [];
    const validCandidates = [];
    
    for (const candidate of rankedCandidates) {
      try {
        const response = await invokeFunction('getArchiveEntry', {
          zipUrl: archiveUrl,
          entryPath: candidate.path,
          responseType: 'text'
        });
        
        if (!response.data?.content) continue;
        
        const content = response.data.content;
        const isJson = candidate.path.endsWith('.json');
        
        let metrics = {
          textLen: content.length,
          timestampCount: 0,
          commentPhraseCount: 0,
          repeatedDivCount: 0,
          hasNoCommentsMessage: false
        };
        
        if (isJson) {
          try {
            const jsonData = JSON.parse(content);
            const hasComments = jsonData.comments || jsonData.comment_list || Array.isArray(jsonData);
            if (hasComments) {
              const commentList = Array.isArray(jsonData) ? jsonData : (jsonData.comments || jsonData.comment_list || []);
              metrics.commentPhraseCount = Array.isArray(commentList) ? commentList.length : 0;
            }
          } catch {}
        } else {
          // HTML analysis
          const lowerContent = content.toLowerCase();
          
          // Check for "no comments" message
          metrics.hasNoCommentsMessage = /no comments|you haven't commented|no data available/i.test(content);
          
          // Count timestamps (Month DD, YYYY patterns)
          const timestampMatches = content.match(/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}/gi);
          metrics.timestampCount = timestampMatches ? timestampMatches.length : 0;
          
          // Count comment-related phrases
          const commentPhrases = ['commented', 'replied', 'comment:', 'your comment'];
          metrics.commentPhraseCount = commentPhrases.reduce((count, phrase) => {
            const matches = lowerContent.match(new RegExp(phrase, 'gi'));
            return count + (matches ? matches.length : 0);
          }, 0);
          
          // Count repeated div structures (common in exports)
          const divPamMatches = content.match(/<div class="pam">/gi);
          metrics.repeatedDivCount = divPamMatches ? divPamMatches.length : 0;
        }
        
        // Calculate quality score
        const qualityScore = 
          (metrics.commentPhraseCount * 10) + 
          (metrics.timestampCount * 5) + 
          (metrics.repeatedDivCount * 3) +
          (metrics.textLen > 1000 ? 20 : 0) +
          candidate.score;
        
        candidatesSummary.push({
          path: candidate.path,
          metrics,
          qualityScore
        });
        
        // Accept if has meaningful content and no "empty" message
        if (!metrics.hasNoCommentsMessage && (metrics.commentPhraseCount > 0 || metrics.timestampCount > 1 || qualityScore > 50)) {
          validCandidates.push({
            path: candidate.path,
            metrics,
            qualityScore
          });
        }
      } catch (err) {
        console.error(`[auditCommentsPresence] Failed to audit ${candidate.path}:`, err);
      }
    }
    
    return {
      commentsDetected: validCandidates.length > 0,
      validCandidates: validCandidates.sort((a, b) => b.qualityScore - a.qualityScore),
      candidatesSummary: candidatesSummary.sort((a, b) => b.qualityScore - a.qualityScore),
      entriesScanned: allEntries.length,
      entriesSource
    };
  } catch (err) {
    console.error('[auditCommentsPresence] Audit failed:', err);
    return {
      commentsDetected: false,
      validCandidates: [],
      candidatesSummary: [],
      error: err.message,
      entriesScanned: 0
    };
  }
}

// Friends Presence Audit - forensic search for actual friends list in ZIP
export async function auditFriendsPresence(zipIndex, archiveUrl, invokeFunction) {
  try {
    const allEntries = zipIndex.all || [];
    
    // Find all friend-related files
    const friendCandidates = allEntries.filter(entry => {
      const path = entry.path.toLowerCase();
      const ext = path.split('.').pop();
      if (!['html', 'json'].includes(ext)) return false;
      if (!path.includes('friend')) return false;
      
      // Exclude non-friends
      const excludePatterns = [
        'suggested', 'people_you_may_know', 'audiences', 'rejected', 
        'request', 'followers', 'followed', 'following'
      ];
      return !excludePatterns.some(pattern => path.includes(pattern));
    });
    
    // Score candidates by path quality
    const scorePath = (path) => {
      const lower = path.toLowerCase();
      if (lower.includes('your_friends') || lower.includes('friends_list')) return 100;
      if (lower.includes('/friends/') && !lower.includes('suggested')) return 80;
      if (lower.includes('friend')) return 50;
      return 0;
    };
    
    const rankedCandidates = friendCandidates
      .map(entry => ({ ...entry, score: scorePath(entry.path) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);
    
    const candidatesSummary = [];
    let bestCandidate = null;
    let bestScore = -1;
    
    for (const candidate of rankedCandidates) {
      try {
        const response = await invokeFunction('getArchiveEntry', {
          zipUrl: archiveUrl,
          entryPath: candidate.path,
          responseType: 'text'
        });
        
        if (!response.data?.content) continue;
        
        const content = response.data.content;
        const isJson = candidate.path.endsWith('.json');
        
        let metrics = {
          title: null,
          textLen: 0,
          fbLinks: 0,
          nameLikeLineCount: 0,
          sampleNameLikeLinesRedacted: []
        };
        
        if (isJson) {
          // JSON parsing
          try {
            const jsonData = JSON.parse(content);
            const hasNameField = JSON.stringify(jsonData).includes('"name"');
            const hasFriendsKey = jsonData.friends || jsonData.friend_list || jsonData.connections;
            
            if (hasFriendsKey || hasNameField) {
              const friendsList = hasFriendsKey || (Array.isArray(jsonData) ? jsonData : Object.values(jsonData));
              if (Array.isArray(friendsList)) {
                metrics.nameLikeLineCount = friendsList.filter(item => 
                  item && (item.name || item.full_name || typeof item === 'string')
                ).length;
              }
            }
            metrics.textLen = content.length;
          } catch {}
        } else {
          // HTML parsing
          const doc = parseHtml(content);
          if (doc) {
            metrics.title = doc.querySelector('title')?.textContent?.slice(0, 100) || null;
            
            // Count FB profile links (exclude groups)
            const anchors = doc.querySelectorAll('a[href]');
            anchors.forEach(a => {
              const href = a.getAttribute('href')?.toLowerCase() || '';
              if ((href.includes('facebook.com') || href.includes('profile.php')) && !href.includes('/groups/')) {
                metrics.fbLinks++;
              }
            });
            
            // Extract visible text and count name-like lines
            const root = doc.querySelector('.contents') || doc.querySelector('body');
            const text = getText(root);
            metrics.textLen = text.length;
            
            const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
            const nameLikeLines = lines.filter(line => {
              if (line.length < 2 || line.length > 60) return false;
              const lower = line.toLowerCase();
              if (lower.includes('contains data you requested')) return false;
              if (lower.includes('creation time') || lower.includes('last modified')) return false;
              if (lower.includes('audience') || lower.includes('badge')) return false;
              if (lower.endsWith('?')) return false;
              if (/^(true|false|yes|no)$/i.test(line)) return false;
              // Must have some letters
              const letters = line.match(/[a-zA-Z]/g);
              if (!letters || letters.length < line.length * 0.3) return false;
              return true;
            });
            
            metrics.nameLikeLineCount = nameLikeLines.length;
            metrics.sampleNameLikeLinesRedacted = nameLikeLines
              .slice(0, 10)
              .map(line => line.replace(/[a-zA-Z]/g, 'X'));
          }
        }
        
        // Calculate quality score
        const qualityScore = 
          (metrics.nameLikeLineCount * 10) + 
          (metrics.fbLinks * 5) + 
          (metrics.textLen > 500 ? 10 : 0) +
          candidate.score;
        
        candidatesSummary.push({
          path: candidate.path,
          metrics,
          qualityScore
        });
        
        // ALWAYS accept your_friends.html if title contains "Your friends" (even with no anchors/tables)
        const isYourFriendsFile = candidate.path.toLowerCase().includes('your_friends.html');
        const hasYourFriendsTitle = metrics.title && /your friends/i.test(metrics.title);
        const meetsThreshold = metrics.nameLikeLineCount >= 2 || metrics.fbLinks >= 2;
        
        if ((meetsThreshold || (isYourFriendsFile && hasYourFriendsTitle)) && qualityScore > bestScore) {
          bestScore = qualityScore;
          bestCandidate = {
            path: candidate.path,
            metrics,
            qualityScore
          };
        }
      } catch (err) {
        console.error(`[auditFriendsPresence] Failed to audit ${candidate.path}:`, err);
      }
    }
    
    return {
      friendsListDetected: bestCandidate !== null,
      bestCandidatePath: bestCandidate?.path || null,
      bestCandidateMetrics: bestCandidate?.metrics || null,
      candidatesSummary: candidatesSummary.sort((a, b) => b.qualityScore - a.qualityScore)
    };
  } catch (err) {
    console.error('[auditFriendsPresence] Audit failed:', err);
    return {
      friendsListDetected: false,
      bestCandidatePath: null,
      bestCandidateMetrics: null,
      candidatesSummary: [],
      error: err.message
    };
  }
}

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
    
    // Count Facebook profile links and group links
    const allAnchors = doc.querySelectorAll('a[href]');
    let fbLinks = 0;
    let groupLinks = 0;
    allAnchors.forEach(a => {
      const href = getAttr(a, 'href').toLowerCase();
      if (href.includes('facebook.com') || href.includes('profile.php')) {
        fbLinks++;
      }
      if (href.includes('/groups/')) {
        groupLinks++;
      }
    });
    
    // Count DIV-based structures (for DIV-heavy layouts like your_friends.html)
    let root = contentsDiv || doc.querySelector('body');
    const allDivs = root.querySelectorAll('div');
    const allSpans = root.querySelectorAll('span');
    const allPs = root.querySelectorAll('p');
    const scriptTags = doc.querySelectorAll('script');
    
    let divLeafTextCount = 0;
    let spanLeafTextCount = 0;
    let pLeafTextCount = 0;
    const sampleLeafTexts = [];
    let longestLeafTextLen = 0;
    
    allDivs.forEach(div => {
      const hasChildStructure = div.querySelector('div, table, ul, ol');
      const text = getText(div).trim();
      if (!hasChildStructure && text.length > 0) {
        divLeafTextCount++;
        if (sampleLeafTexts.length < 10) {
          sampleLeafTexts.push(text);
        }
        longestLeafTextLen = Math.max(longestLeafTextLen, text.length);
      }
    });
    
    allSpans.forEach(span => {
      const hasChildStructure = span.querySelector('div, table, ul, ol');
      const text = getText(span).trim();
      if (!hasChildStructure && text.length > 0) {
        spanLeafTextCount++;
        if (sampleLeafTexts.length < 10) {
          sampleLeafTexts.push(text);
        }
        longestLeafTextLen = Math.max(longestLeafTextLen, text.length);
      }
    });
    
    allPs.forEach(p => {
      const hasChildStructure = p.querySelector('div, table, ul, ol');
      const text = getText(p).trim();
      if (!hasChildStructure && text.length > 0) {
        pLeafTextCount++;
        if (sampleLeafTexts.length < 10) {
          sampleLeafTexts.push(text);
        }
        longestLeafTextLen = Math.max(longestLeafTextLen, text.length);
      }
    });
    
    const textLength = getText(root).length;
    
    // Check for "no data" messages
    const bodyText = getText(root).toLowerCase();
    const hasNoDataMessage = /no data available|no messages|you have no|this section is empty|no friends to display|no results found/i.test(bodyText);
    
    // Redact sample texts (letters -> X, keep digits/spaces/punctuation)
    const sampleLeafTextsRedacted = sampleLeafTexts.map(text => 
      text.replace(/[a-zA-Z]/g, 'X')
    );
    
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
        'tables': doc.querySelectorAll('table').length,
        'tableRows': doc.querySelectorAll('tr').length,
        'li': doc.querySelectorAll('li').length,
        'anchors': allAnchors.length,
        'fbLinks': fbLinks,
        'groupLinks': groupLinks,
        'divCount': allDivs.length,
        'divLeafTextCount': divLeafTextCount,
        'spanLeafTextCount': spanLeafTextCount,
        'pLeafTextCount': pLeafTextCount,
        'scriptTags': scriptTags.length,
        'textLength': textLength,
        'longestLeafTextLen': longestLeafTextLen
      },
      hasNoDataMessage,
      sampleLeafTextsRedacted,
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
    
    const probe = probeFacebookHtmlStructure(htmlString, sourceFile);
    const seenFriends = new Set();
    const items = [];
    
    // Header label blacklist (these are NOT friend names)
    const headerLabels = [
      'creation time', 'name', 'last modified time', 'suggestion sent time',
      'your friends', 'friends', 'date added', 'timestamp', 'status',
      'contains data you requested', 'generated by', 'no messages',
      'badge', 'enabled', 'disabled', 'people you are currently connected to'
    ];
    
    // Metadata filter patterns (reject these)
    const metadataPatterns = [
      /^contains data you requested/i,
      /^generated by/i,
      /^no messages/i,
      /^is the .* (enabled|disabled)\??$/i,
      /^this content is no longer available/i,
      /^only you can see this/i,
      /^(true|false|yes|no)$/i,
      /badge/i,
      /\?$/  // Ends with question mark
    ];
    
    const isValidName = (name) => {
      if (!name || name.length < 2 || name.length > 80) return false;
      
      // Check blacklist
      const lowerName = name.toLowerCase().trim();
      if (headerLabels.includes(lowerName)) return false;
      
      // Check patterns
      if (metadataPatterns.some(pattern => pattern.test(name))) return false;
      
      // Must not be mostly digits/punctuation
      const letters = name.match(/[a-zA-Z]/g);
      if (!letters || letters.length < name.length * 0.3) return false;
      
      return true;
    };
    
    const addFriend = (name, profileUrl = null, timestamp = null) => {
      name = name.trim();
      if (!isValidName(name)) return;
      
      const key = `${name}|${profileUrl || ''}`;
      if (seenFriends.has(key)) return;
      
      seenFriends.add(key);
      items.push({ name, profileUrl, timestamp, sourceFile });
    };
    
    // Choose root
    let root = doc.querySelector('.contents');
    if (!root) root = doc.querySelector('body');
    
    const tableRows = root.querySelectorAll('tr');
    const listItems = root.querySelectorAll('li');
    
    // Strategy A: Table strategy (FIXED: only process TD rows, not TH-only)
    if (tableRows.length > 1) {
      // Find header row (all TH cells)
      let headerRow = null;
      let nameColumnIndex = -1;
      
      tableRows.forEach(tr => {
        const ths = tr.querySelectorAll('th');
        if (ths.length > 0) {
          headerRow = tr;
          ths.forEach((th, idx) => {
            const text = getText(th).toLowerCase();
            if (text.includes('name')) {
              nameColumnIndex = idx;
            }
          });
        }
      });
      
      // Process data rows (rows with TD cells)
      tableRows.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length === 0) return; // Skip TH-only rows
        
        const anchor = tr.querySelector('a');
        
        if (anchor) {
          const anchorText = getText(anchor);
          const profileUrl = getAttr(anchor, 'href');
          if (anchorText) {
            addFriend(anchorText, profileUrl);
            return;
          }
        }
        
        // Use name column if identified
        if (nameColumnIndex >= 0 && tds[nameColumnIndex]) {
          const cellText = getText(tds[nameColumnIndex]);
          if (cellText) {
            addFriend(cellText);
            return;
          }
        }
        
        // Fallback: first non-empty cell
        for (const cell of tds) {
          const cellText = getText(cell);
          if (cellText) {
            addFriend(cellText);
            return;
          }
        }
      });
    }
    
    // Strategy B: List strategy (if li elements exist)
    if (items.length === 0 && listItems.length > 0) {
      listItems.forEach(li => {
        const anchor = li.querySelector('a');
        
        if (anchor) {
          const anchorText = getText(anchor);
          const profileUrl = getAttr(anchor, 'href');
          addFriend(anchorText, profileUrl);
        } else {
          const liText = getText(li);
          addFriend(liText);
        }
      });
    }
    
    // Strategy C: Anchor strategy (extract all Facebook profile links)
    if (items.length === 0) {
      const anchors = root.querySelectorAll('a[href]');
      anchors.forEach(a => {
        const href = getAttr(a, 'href').toLowerCase();
        if (href.includes('facebook.com') || href.includes('profile.php')) {
          const anchorText = getText(a);
          addFriend(anchorText, getAttr(a, 'href'));
        }
      });
    }
    
    // Strategy D: Flat text extractor (for files with no structure - split by date patterns)
    if (items.length === 0) {
      console.log(`[parseFriendsFromHtml] FALLBACK: Trying flat text extraction for ${sourceFile}`);
      
      // Convert HTML to text properly
      let textContent = htmlString;
      textContent = textContent.replace(/<br\s*\/?>/gi, '\n');
      textContent = textContent.replace(/<\/div>/gi, '\n');
      textContent = textContent.replace(/<\/p>/gi, '\n');
      textContent = textContent.replace(/<\/tr>/gi, '\n');
      textContent = textContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      textContent = textContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      textContent = textContent.replace(/<[^>]+>/g, ' ');
      textContent = textContent.replace(/&nbsp;/g, ' ');
      textContent = textContent.replace(/&amp;/g, '&');
      textContent = textContent.replace(/&lt;/g, '<');
      textContent = textContent.replace(/&gt;/g, '>');
      textContent = textContent.replace(/&quot;/g, '"');
      
      // Split into lines and filter
      const lines = textContent.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
      
      console.log(`[parseFriendsFromHtml] FALLBACK: Extracted ${lines.length} non-empty lines from flat text`);
      
      // Date pattern: Month DD, YYYY (optionally with time)
      const datePattern = /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}(?:\s+at\s+\d{1,2}:\d{2}\s*[AP]M)?/i;
      
      const extractedFriends = [];
      
      // Strategy 1: Look for "Name on Date" pattern on same line
      for (const line of lines) {
        const dateMatch = datePattern.exec(line);
        if (dateMatch) {
          const beforeDate = line.substring(0, dateMatch.index).trim();
          const timestamp = dateMatch[0];
          
          if (beforeDate && isValidName(beforeDate)) {
            extractedFriends.push({ name: beforeDate, timestamp });
          }
        }
      }
      
      // Strategy 2: Look for "Name\nDate" pattern (name on previous line)
      for (let i = 1; i < lines.length; i++) {
        if (datePattern.test(lines[i])) {
          const candidateName = lines[i - 1];
          const timestamp = lines[i];
          
          if (isValidName(candidateName)) {
            // Check if we already have this name
            const alreadyExists = extractedFriends.some(f => f.name === candidateName);
            if (!alreadyExists) {
              extractedFriends.push({ name: candidateName, timestamp });
            }
          }
        }
      }
      
      console.log(`[parseFriendsFromHtml] FALLBACK: Extracted ${extractedFriends.length} friends using date patterns:`, extractedFriends);
      
      // Add to items
      extractedFriends.forEach(friend => {
        addFriend(friend.name, null, friend.timestamp);
      });
    }
    
    console.log(`[parseFriendsFromHtml] Extracted ${items.length} friends from ${sourceFile}`);
    return { items, sourceFile, probe: items.length === 0 ? probe : undefined };
  } catch (err) {
    console.error(`[parseFriendsFromHtml] Error:`, err);
    return { items: [], sourceFile, error: err.message, probe: probeFacebookHtmlStructure(htmlString, sourceFile) };
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
    
    // Check for "no comments" message first
    const bodyText = getText(doc.querySelector('body')).toLowerCase();
    if (/no comments|you haven't commented|no data available/i.test(bodyText)) {
      console.log(`[parseCommentsFromHtml] "${sourceFile}" contains "no comments" message, skipping`);
      return { items: [], sourceFile, skipped: true };
    }
    
    // Look for comment-like containers
    let commentContainers = doc.querySelectorAll('[data-testid*="comment"], .comment, [role="comment"]');
    
    if (commentContainers.length === 0) {
      commentContainers = doc.querySelectorAll('tr');
    }
    
    if (commentContainers.length === 0) {
      commentContainers = doc.querySelectorAll('li');
    }
    
    if (commentContainers.length === 0) {
      commentContainers = doc.querySelectorAll('.pam, .contents > div, .contents > section');
    }
    
    commentContainers.forEach(container => {
      const text = getText(container);
      if (text && text.length > 10) {
        items.push({
          text: text.slice(0, 500),
          timestamp: null,
          sourceFile
        });
      }
    });
    
    // Fallback: Flat text extraction (similar to friends)
    if (items.length === 0) {
      console.log(`[parseCommentsFromHtml] FALLBACK: Trying flat text extraction for ${sourceFile}`);
      
      let textContent = htmlString;
      textContent = textContent.replace(/<br\s*\/?>/gi, '\n');
      textContent = textContent.replace(/<\/div>/gi, '\n');
      textContent = textContent.replace(/<\/p>/gi, '\n');
      textContent = textContent.replace(/<\/tr>/gi, '\n');
      textContent = textContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      textContent = textContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      textContent = textContent.replace(/<[^>]+>/g, ' ');
      textContent = textContent.replace(/&nbsp;/g, ' ');
      textContent = textContent.replace(/&amp;/g, '&');
      
      const lines = textContent.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
      
      // Date pattern for timestamps
      const datePattern = /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}(?:\s+at\s+\d{1,2}:\d{2}\s*[AP]M)?/i;
      
      let currentComment = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const dateMatch = datePattern.exec(line);
        
        if (dateMatch) {
          // Found a timestamp - previous lines might be comment context/text
          const timestamp = dateMatch[0];
          const beforeDate = line.substring(0, dateMatch.index).trim();
          
          if (currentComment) {
            items.push(currentComment);
          }
          
          currentComment = {
            text: beforeDate || (i > 0 ? lines[i - 1] : ''),
            timestamp,
            sourceFile
          };
        } else if (currentComment && line.length > 10 && !line.toLowerCase().includes('commented')) {
          // Accumulate comment text
          if (currentComment.text) {
            currentComment.text += ' ' + line;
          } else {
            currentComment.text = line;
          }
        }
      }
      
      if (currentComment) {
        items.push(currentComment);
      }
      
      console.log(`[parseCommentsFromHtml] FALLBACK: Extracted ${items.length} comments using flat text`);
    }
    
    console.log(`[parseCommentsFromHtml] Extracted ${items.length} comments from ${sourceFile}`);
    if (items.length > 0) {
      console.log(`[parseCommentsFromHtml] Sample comments:`, items.slice(0, 3));
    }
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

export function resolveZipEntryPath(sourceFile, ref, rootPrefix, knownMediaPathSet) {
  if (!ref || !knownMediaPathSet || knownMediaPathSet.size === 0) {
    return { resolved: null, reason: 'NO_REFS_FOUND', candidates: [] };
  }
  
  try {
    const baseDir = sourceFile.substring(0, sourceFile.lastIndexOf('/'));
    const candidates = [];
    
    // Normalize the ref
    const refNormalized = normalizeZipPath('', ref);
    if (!refNormalized) {
      return { resolved: null, reason: 'INVALID_REF', candidates: [] };
    }
    
    // Check if ref points to HTML (store separately for page-based media)
    if (refNormalized.endsWith('.html')) {
      return { resolved: null, reason: 'REF_POINTS_TO_HTML', htmlPath: refNormalized, candidates: [] };
    }
    
    // STEP A: Relative resolution (resolve against baseDir)
    const candidate1 = normalizeZipPath(baseDir, ref);
    candidates.push(candidate1);
    if (knownMediaPathSet.has(candidate1)) {
      return { resolved: candidate1, reason: 'MATCH_BY_RELATIVE', candidates: [candidate1] };
    }
    
    // STEP B: With rootPrefix prepended
    if (rootPrefix) {
      const candidate2 = normalizeZipPath('', rootPrefix + '/' + candidate1);
      candidates.push(candidate2);
      if (knownMediaPathSet.has(candidate2)) {
        return { resolved: candidate2, reason: 'MATCH_BY_PREFIX_PREPEND', candidates: candidates.slice(0, 10) };
      }
    }
    
    // STEP C: Strip rootPrefix if present
    if (rootPrefix && candidate1.startsWith(rootPrefix + '/')) {
      const candidate3 = candidate1.substring((rootPrefix + '/').length);
      candidates.push(candidate3);
      if (knownMediaPathSet.has(candidate3)) {
        return { resolved: candidate3, reason: 'MATCH_STRIPPED_PREFIX', candidates: candidates.slice(0, 10) };
      }
    }
    
    // STEP D: Try just the normalized ref without baseDir
    const candidate4 = normalizeZipPath('', ref);
    if (candidate4 !== candidate1) {
      candidates.push(candidate4);
      if (knownMediaPathSet.has(candidate4)) {
        return { resolved: candidate4, reason: 'MATCH_BY_NORMALIZED_REF', candidates: candidates.slice(0, 10) };
      }
    }
    
    // STEP E: Basename fallback (search knownMediaPathSet for matching basename)
    const basename = ref.split('/').pop();
    if (basename) {
      const matchesByBasename = Array.from(knownMediaPathSet).filter(p => p.endsWith('/' + basename) || p === basename);
      
      if (matchesByBasename.length === 1) {
        return { resolved: matchesByBasename[0], reason: 'MATCH_BY_BASENAME_UNIQUE', candidates: candidates.slice(0, 10) };
      } else if (matchesByBasename.length > 1) {
        // Find best match by longest common prefix with baseDir
        let bestMatch = matchesByBasename[0];
        let bestScore = 0;
        const baseDirParts = baseDir.split('/');
        
        for (const match of matchesByBasename) {
          const matchParts = match.split('/').slice(0, -1);
          let score = 0;
          for (let i = 0; i < Math.min(baseDirParts.length, matchParts.length); i++) {
            if (baseDirParts[i] === matchParts[i]) {
              score++;
            } else {
              break;
            }
          }
          if (score > bestScore) {
            bestScore = score;
            bestMatch = match;
          }
        }
        return { resolved: bestMatch, reason: 'MATCH_BY_BASENAME_BEST', candidates: candidates.slice(0, 10) };
      }
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