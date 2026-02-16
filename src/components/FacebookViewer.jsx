import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { 
  MessageSquare, 
  Users, 
  FileText, 
  Image as ImageIcon,
  ThumbsUp,
  Search,
  Calendar,
  MapPin,
  Loader2,
  Download,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AIDataSearch from "./AIDataSearch";
import { normalizeArchiveAnalysis } from "./normalizeArchiveData";
import LoadDebugPanel from "./LoadDebugPanel";
import {
  parseFriendsFromHtml,
  parsePostsFromHtml,
  parseCommentsFromHtml,
  parseLikesFromHtml,
  parseGroupsFromHtml,
  parseMarketplaceFromHtml,
  parseEventsFromHtml,
  parseReelsFromHtml,
  parseCheckinsFromHtml,
  parseJsonGeneric,
  probeFacebookHtmlStructure,
  resolveZipEntryPath,
  auditFriendsPresence,
  auditCommentsPresence
} from "./archiveParsers";

// Helper to extract entry path from media item (string or object)
function getEntryPath(mediaItem) {
  if (typeof mediaItem === "string") return mediaItem;
  if (mediaItem && typeof mediaItem === "object" && typeof mediaItem.path === "string") return mediaItem.path;
  return null;
}

export default function FacebookViewer({ data, photoFiles = {}, archiveUrl = "", debugMode = false }) {
  // Normalize data on mount
  const normalized = normalizeArchiveAnalysis(data);
  
  // Build knownMediaPathSet from ALL media entries (not just gallery)
  const knownMediaPathSet = React.useMemo(() => {
    const set = new Set();
    // Use mediaAll if available (contains ALL image/video files in ZIP, including *_files folders)
    if (data?.index?.mediaAll && Array.isArray(data.index.mediaAll)) {
      data.index.mediaAll.forEach(m => set.add(m.path));
    } else {
      // Fallback to photos + videos
      normalized.photos.forEach(p => set.add(p.path));
      normalized.videos.forEach(v => set.add(v.path));
    }
    return set;
  }, [data?.index?.mediaAll, normalized.photos, normalized.videos]);
  
  // Log what we received and normalized
  React.useEffect(() => {
    console.log("[FacebookViewer] received data:", {
      buildId: data?.buildId,
      mode: data?.mode,
      rawPhotosLength: data?.index?.photos?.length,
      rawVideoLength: data?.index?.videos?.length,
      mediaEntriesAllLength: data?.index?.mediaEntriesAll?.length,
      normalizedPhotosLength: normalized.photos.length,
      normalizedVideosLength: normalized.videos.length,
      knownMediaPathCount: knownMediaPathSet.size,
      normalizedCounts: normalized.counts,
      fullNormalized: normalized
    });
  }, [data, normalized, knownMediaPathSet]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [activeTab, setActiveTab] = useState("posts");
  const [loadedMedia, setLoadedMedia] = useState({});
  const [loadedSections, setLoadedSections] = useState({});
  const [loadingSection, setLoadingSection] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState({});
  const [viewRawContent, setViewRawContent] = useState({});
  const [mediaDebugLogs, setMediaDebugLogs] = useState([]);

   const isStreamingIndex = normalized.isStreaming;

  // Add media debug log
  const addMediaLog = (message) => {
    setMediaDebugLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    console.log('[MEDIA_DEBUG]', message);
  };

  // Load media on demand with comprehensive debugging
  const loadMedia = async (mediaItem, type, postSourceFile = null, originalRef = null) => {
    const entryPath = getEntryPath(mediaItem);
    
    if (!entryPath) {
      addMediaLog(`[MEDIA_CLICK_ERROR] Invalid media item - no path found. type=${typeof mediaItem} value=${JSON.stringify(mediaItem).slice(0, 100)}`);
      return;
    }
    
    if (loadedMedia[entryPath] !== undefined) return;
    
    addMediaLog(`[MEDIA_CLICK] entryPath=${entryPath} postSourceFile=${postSourceFile || 'N/A'} type=${type} resolvedFromRef=${originalRef || 'N/A'}`);
    setLoadedMedia(prev => ({ ...prev, [entryPath]: 'loading' }));
    
    try {
      const response = await base44.functions.invoke('getArchiveEntry', {
        zipUrl: archiveUrl,
        entryPath: entryPath,
        responseType: 'base64'
      });
      
      addMediaLog(`[MEDIA_RESPONSE] ok=${response.status === 200} status=${response.status} mimeType=${response.data?.mime || 'N/A'} base64Len=${response.data?.content?.length || 0} error=${response.data?.error || 'none'}`);
      
      if (response.data?.content && response.data?.mime) {
        // Decode base64 to check magic bytes
        const binary = atob(response.data.content.substring(0, 100)); // First ~75 bytes
        const magicHex = Array.from(binary.slice(0, 16)).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
        addMediaLog(`[MEDIA_MAGIC] first16Hex=${magicHex}`);
        
        const blobUrl = base64ToBlobUrl(response.data.content, response.data.mime);
        if (blobUrl) {
          addMediaLog(`[MEDIA_OBJECT_URL] created=${blobUrl} byteLength=${response.data.content.length}`);
          setLoadedMedia(prev => ({ ...prev, [entryPath]: { url: blobUrl, mime: response.data.mime } }));
        } else {
          throw new Error('Failed to create blob URL');
        }
      } else {
        throw new Error(`Invalid response: status=${response.status} hasContent=${!!response.data?.content} hasMime=${!!response.data?.mime}`);
      }
    } catch (err) {
      const errorMsg = `${err.message || err}`;
      addMediaLog(`[MEDIA_ERROR] ${errorMsg}`);
      console.error(`[FacebookViewer] Failed to load ${type}:`, err);
      setLoadedMedia(prev => ({ ...prev, [entryPath]: { error: errorMsg } }));
    }
  };

  // Convert base64 to blob URL
  const base64ToBlobUrl = (base64, mimeType) => {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      return url;
    } catch (err) {
      addMediaLog(`[MEDIA_BLOB_ERROR] ${err.message}`);
      console.error('[FacebookViewer] base64ToBlobUrl error:', err);
      return null;
    }
  };

  // Add log entry
  const addLog = (sectionName, category, message, level = 'info', itemsCount = 0) => {
    setDebugLogs(prev => ({
      ...prev,
      [sectionName]: [
        ...(prev[sectionName] || []),
        { category, message, level, itemsCount, timestamp: new Date().toLocaleTimeString() }
      ]
    }));
  };

  // Load section data on demand
  const loadSection = async (sectionName) => {
    if (loadedSections[sectionName]) return;
    setLoadingSection(sectionName);
    addLog(sectionName, 'INIT', `Starting load for ${sectionName}`);

    try {
      console.log(`[FacebookViewer] Loading ${sectionName} section`);

      let parsedData = [];
      let selectedFiles = [];

      if (sectionName === 'posts') {
        selectedFiles = normalized.postFiles.json.length > 0 ? normalized.postFiles.json : normalized.postFiles.html;
        if (selectedFiles.length === 0) {
          throw new Error('No posts files found in index');
        }

        // Load all HTML files with concurrency=2 + collect probes
        const htmlFiles = selectedFiles.filter(f => f.endsWith('.html'));
        const jsonFiles = selectedFiles.filter(f => f.endsWith('.json'));
        const debugRawFiles = [];

        if (jsonFiles.length > 0) {
          const filePath = jsonFiles[0];
          const response = await base44.functions.invoke('getArchiveEntry', {
            zipUrl: archiveUrl,
            entryPath: filePath,
            responseType: 'json'
          });
          const result = parseJsonGeneric(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from JSON`, 'success', parsedData.length);
        } else if (htmlFiles.length > 0) {
          addLog(sectionName, 'LOAD_HTML', `Loading ${htmlFiles.length} HTML files with concurrency=2...`);
          const allPosts = [];
          const concurrency = 2;

          for (let i = 0; i < htmlFiles.length; i += concurrency) {
            const batch = htmlFiles.slice(i, i + concurrency);
            const batchResults = await Promise.all(
              batch.map(async (filePath) => {
                try {
                  const resp = await base44.functions.invoke('getArchiveEntry', {
                    zipUrl: archiveUrl,
                    entryPath: filePath,
                    responseType: 'text'
                  });
                  const result = await parsePostsFromHtml(resp.data.content, filePath);

                  // Resolve mediaRefs to actual ZIP entry paths
                  const resolvedItems = (result.items || []).map(item => {
                    if (item.mediaRefs && item.mediaRefs.length > 0) {
                      const resolvedPaths = [];
                      const unresolvedRefs = [];
                      const htmlPagePaths = [];
                      
                      item.mediaRefs.forEach(ref => {
                        const resolution = resolveZipEntryPath(filePath, ref, data?.rootPrefix || '', knownMediaPathSet);
                        
                        if (resolution.resolved) {
                          resolvedPaths.push(resolution.resolved);
                        } else if (resolution.reason === 'REF_POINTS_TO_HTML' && resolution.htmlPath) {
                          htmlPagePaths.push(resolution.htmlPath);
                        } else {
                          unresolvedRefs.push(ref);
                        }
                      });

                      return {
                        ...item,
                        mediaRefs: undefined,
                        mediaPaths: resolvedPaths.length > 0 ? resolvedPaths : undefined,
                        mediaUnresolvedRefs: unresolvedRefs.length > 0 ? unresolvedRefs : undefined,
                        mediaPagePaths: htmlPagePaths.length > 0 ? htmlPagePaths : undefined,
                        _mediaRefsRaw: item.mediaRefs // Keep for debug
                      };
                    }
                    return item;
                  });

                  // Capture debug info (ALWAYS collect it)
                  if (result.debug) {
                    debugRawFiles.push({
                      filePath,
                      debug: result.debug
                    });

                    // Log structured debug info
                    const dbg = result.debug;
                    addLog(
                      sectionName, 
                      'FILE_DEBUG', 
                      `${filePath} | root=${dbg.rootSelectorUsed} strategy=${dbg.strategyUsed} tables=${dbg.rootCounts.tablesInRoot} images=${dbg.rootCounts.imagesInRoot} extracted=${dbg.itemsAfterFilter}`,
                      dbg.itemsAfterFilter > 0 ? 'success' : 'warn'
                    );
                  }

                  return resolvedItems;
                } catch (err) {
                  console.error(`Failed to load ${filePath}:`, err);
                  addLog(sectionName, 'FILE_ERROR', `${filePath} → ${err.message}`, 'error');
                  return [];
                }
              })
            );
            allPosts.push(...batchResults.flat());
            addLog(sectionName, 'PROGRESS', `Loaded ${i + batch.length}/${htmlFiles.length} files → ${allPosts.length} total posts extracted`);
          }

          parsedData = allPosts.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from ${htmlFiles.length} HTML files`, 'success', parsedData.length);

          // Store raw files for fallback rendering
          if (parsedData.length === 0 && htmlFiles.length > 0) {
            setLoadedSections(prev => ({ 
              ...prev, 
              [sectionName]: { 
                items: [],
                rawFiles: htmlFiles,
                debugRawFiles
              }
            }));
          }
        }
      } else if (sectionName === 'friends') {
        // PHASE 1: Run Friends Presence Audit
        addLog(sectionName, 'AUDIT_START', 'Running Friends Presence Audit on entire ZIP...');
        
        const audit = await auditFriendsPresence(
          data?.index || {}, 
          archiveUrl,
          (funcName, params) => base44.functions.invoke(funcName, params)
        );
        
        addLog(
          sectionName,
          'AUDIT_RESULT',
          `Friends list detected: ${audit.friendsListDetected ? 'YES' : 'NO'} | Best: ${audit.bestCandidatePath || 'none'} | Candidates: ${audit.candidatesSummary.length}`,
          audit.friendsListDetected ? 'success' : 'warn'
        );
        
        if (audit.bestCandidateMetrics) {
          const m = audit.bestCandidateMetrics;
          addLog(
            sectionName,
            'AUDIT_BEST',
            `${audit.bestCandidatePath} | nameLikeLines=${m.nameLikeLineCount} fbLinks=${m.fbLinks} textLen=${m.textLen}`,
            'info'
          );
        }
        
        // PHASE 2: Load categorized friends data
        // Use audit result to determine best actual_friends candidate
        let actualFriendsCandidates = [];
        
        if (audit.friendsListDetected && audit.bestCandidatePath) {
          actualFriendsCandidates.push({
            path: audit.bestCandidatePath,
            type: audit.bestCandidatePath.endsWith('.json') ? 'json' : 'html'
          });
        } else {
          // Fallback: use normalized index
          const yourFriends = normalized.friendFiles.html.filter(f => 
            f.toLowerCase().includes('your_friends') || f.toLowerCase().includes('friends_list')
          );
          if (yourFriends.length > 0) {
            actualFriendsCandidates.push({ path: yourFriends[0], type: 'html' });
          }
        }
        
        // Combine all candidates for other categories
        const allCandidates = [
          ...actualFriendsCandidates,
          ...normalized.friendFiles.json.map(f => ({ path: f, type: 'json' })),
          ...normalized.friendFiles.html.map(f => ({ path: f, type: 'html' }))
        ];
        
        // Remove duplicates
        const uniqueCandidates = Array.from(
          new Map(allCandidates.map(c => [c.path, c])).values()
        );

        // Log all candidates
        addLog(sectionName, 'FRIENDS_CANDIDATES', `${uniqueCandidates.length} files:\n${uniqueCandidates.map(f => `- ${f.path}`).join('\n')}`);
        
        // Categorize files
        const categorize = (path) => {
          const lower = path.toLowerCase();
          if (lower.includes('your_friends') || lower.includes('friends_list')) return 'actual_friends';
          if (lower.includes('people_you_may_know')) return 'people_you_may_know';
          if (lower.includes('suggested_friends')) return 'suggestions';
          if (lower.includes('friend_request') || lower.includes('rejected_friend')) return 'requests';
          if (lower.includes('following') || lower.includes('followers') || lower.includes('who_you') || lower.includes('followed')) return 'following';
          if (lower.includes('audiences') || lower.includes('post_audience')) return 'other';
          return 'other';
        };
        
        const categorized = {
          actual_friends: [],
          people_you_may_know: [],
          suggestions: [],
          requests: [],
          following: [],
          other: []
        };
        
        uniqueCandidates.forEach(c => {
          const cat = categorize(c.path);
          if (categorized[cat]) {
            categorized[cat].push(c);
          } else {
            categorized.other.push(c);
          }
        });
        
        // Always try actual_friends FIRST
        const tryOrder = [
          ...categorized.actual_friends,
          ...categorized.people_you_may_know,
          ...categorized.suggestions,
          ...categorized.requests,
          ...categorized.following,
          ...categorized.other
        ];
        
        // Probe each file
        const probeResults = [];
        for (const candidate of tryOrder) {
          try {
            const response = await base44.functions.invoke('getArchiveEntry', {
              zipUrl: archiveUrl,
              entryPath: candidate.path,
              responseType: 'text'
            });
            
            if (response.data?.content) {
              const probe = probeFacebookHtmlStructure(response.data.content, candidate.path);
              probeResults.push({ candidate, probe, content: response.data.content, category: categorize(candidate.path) });
              
              const counts = probe.selectorCounts || {};
              addLog(
                sectionName, 
                'FRIENDS_PROBE', 
                `${candidate.path} | title="${probe.title || 'N/A'}" | tables=${counts.tables || 0} rows=${counts.tableRows || 0} li=${counts.li || 0} anchors=${counts.anchors || 0} fbLinks=${counts.fbLinks || 0} divLeaf=${counts.divLeafTextCount || 0} spanLeaf=${counts.spanLeafTextCount || 0} pLeaf=${counts.pLeafTextCount || 0} scripts=${counts.scriptTags || 0} textLen=${counts.textLength || 0} longestLeaf=${counts.longestLeafTextLen || 0}`,
                'info'
              );
              
              // Add detailed probe for actual_friends files
              if (categorize(candidate.path) === 'actual_friends' && probe.sampleLeafTextsRedacted) {
                addLog(
                  sectionName,
                  'FRIENDS_PROBE_DETAILS',
                  `${candidate.path} | sampleLeafTextsRedacted=[${probe.sampleLeafTextsRedacted.slice(0, 5).join(', ')}] | hasNoDataMessage=${probe.hasNoDataMessage || false}`,
                  'info'
                );
              }
            }
          } catch (err) {
            addLog(sectionName, 'FRIENDS_PROBE', `${candidate.path} | ERROR: ${err.message}`, 'error');
          }
        }
        
        // Parse friends by category with minimum threshold
        const resultsByCategory = {
          actual_friends: [],
          people_you_may_know: [],
          suggestions: [],
          requests: [],
          following: []
        };
        
        for (const { candidate, content, probe, category } of probeResults) {
          let items = [];
          
          if (candidate.type === 'json') {
            try {
              const jsonData = JSON.parse(content);
              
              // Try to extract friends from JSON
              const friendsList = jsonData.friends || jsonData.friend_list || jsonData.connections || 
                                  (Array.isArray(jsonData) ? jsonData : null);
              
              if (friendsList && Array.isArray(friendsList)) {
                items = friendsList
                  .filter(item => item && (item.name || item.full_name || typeof item === 'string'))
                  .map(item => ({
                    name: typeof item === 'string' ? item : (item.name || item.full_name),
                    sourceFile: candidate.path
                  }));
              } else {
                const result = parseJsonGeneric(jsonData, candidate.path);
                items = result.items;
              }
            } catch (err) {
              addLog(sectionName, 'PARSE_ERROR', `JSON parse failed for ${candidate.path}: ${err.message}`, 'error');
            }
          } else {
            const result = await parseFriendsFromHtml(content, candidate.path);
            items = result.items;
          }
          
          // Apply minimum threshold for actual_friends
          const counts = probe.selectorCounts || {};
          const nameLikeLineCount = items.length;
          const fbLinks = counts.fbLinks || 0;
          const meetsThreshold = nameLikeLineCount >= 2 || fbLinks >= 2;
          
          if (items.length > 0) {
            addLog(sectionName, 'PARSE', `Parsed ${items.length} items from ${candidate.path} (category: ${category}, threshold: ${meetsThreshold})`, 'success', items.length);
            
            if (category === 'actual_friends' && meetsThreshold) {
              resultsByCategory.actual_friends.push(...items);
            } else if (category === 'people_you_may_know') {
              resultsByCategory.people_you_may_know.push(...items);
            } else if (resultsByCategory[category]) {
              resultsByCategory[category].push(...items);
            }
          } else {
            addLog(sectionName, 'PARSE', `0 items from ${candidate.path} | divLeaf=${counts.divLeafTextCount || 0} nameLike=${counts.divLeafTextCount || 0} textLen=${counts.textLength || 0}`, 'warn');
          }
        }
        
        // Use actual_friends as primary data
        parsedData = resultsByCategory.actual_friends.slice(0, 100);
        
        // Store all results for UI (no error if actual_friends is empty)
        setLoadedSections(prev => ({ 
          ...prev, 
          [sectionName]: { 
            items: parsedData,
            byCategory: resultsByCategory,
            probeResults: probeResults.map(r => ({ 
              path: r.candidate.path, 
              probe: r.probe,
              content: r.content,
              category: r.category
            })),
            audit,
            counts: {
              yourFriends: resultsByCategory.actual_friends.length,
              peopleYouMayKnow: resultsByCategory.people_you_may_know.length,
              suggestions: resultsByCategory.suggestions.length,
              requests: resultsByCategory.requests.length,
              following: resultsByCategory.following.length
            }
          }
        }));
        
        if (parsedData.length === 0) {
          addLog(sectionName, 'RESULT', `Facebook did not include friends list in export. Showing ${resultsByCategory.people_you_may_know.length} suggestions.`, 'warn');
        } else {
          addLog(sectionName, 'RESULT', `Found ${parsedData.length} friends + ${resultsByCategory.people_you_may_know.length} suggestions.`, 'success');
        }
      } else if (sectionName === 'messages') {
        const threads = normalized.messageThreads;
        if (threads.length === 0) {
          throw new Error('No message threads found in index');
        }

        parsedData = threads.slice(0, 10).map(thread => ({
          conversation_with: thread.threadPath.replace(/_/g, ' '),
          messages: [],
          totalMessages: thread.messageFiles.length
        }));
        addLog(sectionName, 'PARSE', `Found ${parsedData.length} message threads`, 'success', parsedData.length);
      } else if (sectionName === 'comments') {
        // PHASE 1: Run Comments Presence Audit
        addLog(sectionName, 'COMMENTS_AUDIT_START', 'Running Comments Presence Audit on entire ZIP...');
        
        const audit = await auditCommentsPresence(
          data?.index || {}, 
          archiveUrl,
          (funcName, params) => base44.functions.invoke(funcName, params)
        );
        
        addLog(
          sectionName,
          'COMMENTS_AUDIT_SCAN',
          `Scanned ${data?.index?.all?.length || 0} ZIP entries`,
          'info'
        );
        
        addLog(
          sectionName,
          'COMMENTS_AUDIT_RESULT',
          `Comments detected: ${audit.commentsDetected ? 'YES' : 'NO'} | Valid sources: ${audit.validCandidates.length} | Total candidates: ${audit.candidatesSummary.length}`,
          audit.commentsDetected ? 'success' : 'warn'
        );
        
        if (audit.candidatesSummary.length > 0) {
          addLog(
            sectionName,
            'COMMENTS_CANDIDATES',
            `${audit.candidatesSummary.length} files:\n${audit.candidatesSummary.map(c => `- ${c.path}`).join('\n')}`,
            'info'
          );
        }
        
        if (audit.validCandidates.length > 0) {
          const topCandidates = audit.validCandidates.slice(0, 5);
          addLog(
            sectionName, 
            'COMMENTS_CANDIDATES', 
            `Top ${topCandidates.length} sources:\n${topCandidates.map(c => `- ${c.path} (score=${c.qualityScore}, phrases=${c.metrics.commentPhraseCount}, timestamps=${c.metrics.timestampCount})`).join('\n')}`
          );
        }
        
        // PHASE 2: Parse all valid candidates and merge
        const allComments = [];
        
        for (const candidate of audit.validCandidates.slice(0, 10)) {
          try {
            addLog(sectionName, 'COMMENTS_FETCH', `Fetching: ${candidate.path}...`);
            
            const response = await base44.functions.invoke('getArchiveEntry', {
              zipUrl: archiveUrl,
              entryPath: candidate.path,
              responseType: 'text'
            });
            
            if (!response.data?.content) continue;
            
            let result;
            if (candidate.path.endsWith('.json')) {
              try {
                const jsonData = JSON.parse(response.data.content);
                result = parseJsonGeneric(jsonData, candidate.path);
              } catch (err) {
                addLog(sectionName, 'COMMENTS_PARSE_ERROR', `JSON parse failed for ${candidate.path}: ${err.message}`, 'error');
                continue;
              }
            } else {
              result = await parseCommentsFromHtml(response.data.content, candidate.path);
            }
            
            if (result.skipped) {
              addLog(sectionName, 'COMMENTS_PARSE', `Skipped ${candidate.path} (no comments message)`, 'info');
            } else if (result.items.length > 0) {
              allComments.push(...result.items);
              addLog(sectionName, 'COMMENTS_PARSE', `Parsed ${result.items.length} comments from ${candidate.path}`, 'success', result.items.length);
            } else {
              addLog(sectionName, 'COMMENTS_PARSE', `0 comments from ${candidate.path}`, 'warn');
            }
          } catch (err) {
            addLog(sectionName, 'COMMENTS_ERROR', `Failed to parse ${candidate.path}: ${err.message}`, 'error');
          }
        }
        
        // Dedupe by text+timestamp
        const seen = new Set();
        parsedData = allComments.filter(comment => {
          const key = `${comment.text?.slice(0, 100)}|${comment.timestamp || ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 50);
        
        addLog(sectionName, 'COMMENTS_RESULT', `Total: ${parsedData.length} unique comments from ${audit.validCandidates.length} sources`, 'success', parsedData.length);
        
        if (parsedData.length > 0) {
          addLog(sectionName, 'COMMENTS_SAMPLE', `Sample (first 3): ${JSON.stringify(parsedData.slice(0, 3).map(c => ({ text: c.text?.slice(0, 50), timestamp: c.timestamp })))}`, 'info');
        }
        
        // Store with metadata for UI
        setLoadedSections(prev => ({
          ...prev,
          [sectionName]: {
            items: parsedData,
            audit,
            noFilesInExport: audit.candidatesSummary.length === 0
          }
        }));
      } else if (sectionName === 'likes') {
        selectedFiles = normalized.likeFiles.json.length > 0 ? normalized.likeFiles.json : normalized.likeFiles.html;
        if (selectedFiles.length === 0) {
          throw new Error('No likes files found');
        }
        const filePath = selectedFiles[0];
        const responseType = filePath.endsWith('.json') ? 'json' : 'text';

        addLog(sectionName, 'FETCH', `Fetching: ${filePath} (${responseType})`);

        const response = await base44.functions.invoke('getArchiveEntry', {
          zipUrl: archiveUrl,
          entryPath: filePath,
          responseType
        });

        if (responseType === 'json' && response.data?.content) {
          const result = parseJsonGeneric(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from JSON`, 'success', parsedData.length);
        } else if (responseType === 'text' && response.data?.content) {
          const result = await parseLikesFromHtml(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from HTML`, result.error ? 'error' : 'success', parsedData.length);
        }
      } else if (sectionName === 'groups') {
        selectedFiles = normalized.groupFiles.json.length > 0 ? normalized.groupFiles.json : normalized.groupFiles.html;
        if (selectedFiles.length === 0) {
          throw new Error('No group files found');
        }
        const filePath = selectedFiles[0];
        const responseType = filePath.endsWith('.json') ? 'json' : 'text';

        addLog(sectionName, 'FETCH', `Fetching: ${filePath} (${responseType})`);

        const response = await base44.functions.invoke('getArchiveEntry', {
          zipUrl: archiveUrl,
          entryPath: filePath,
          responseType
        });

        if (responseType === 'json' && response.data?.content) {
          const result = parseJsonGeneric(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from JSON`, 'success', parsedData.length);
        } else if (responseType === 'text' && response.data?.content) {
          const result = await parseGroupsFromHtml(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from HTML`, result.error ? 'error' : 'success', parsedData.length);
        }
      } else if (sectionName === 'reviews') {
        selectedFiles = normalized.reviewFiles.json.length > 0 ? normalized.reviewFiles.json : normalized.reviewFiles.html;
        if (selectedFiles.length === 0) {
          throw new Error('No review files found');
        }
        parsedData = [{ text: `Found ${selectedFiles.length} review files` }];
        addLog(sectionName, 'PARSE', `Found ${selectedFiles.length} review files`, 'info', selectedFiles.length);
      } else if (sectionName === 'marketplace') {
        selectedFiles = normalized.marketplaceFiles.json.length > 0 ? normalized.marketplaceFiles.json : normalized.marketplaceFiles.html;
        if (selectedFiles.length === 0) {
          throw new Error('No marketplace files found');
        }
        const filePath = selectedFiles[0];
        const responseType = filePath.endsWith('.json') ? 'json' : 'text';

        addLog(sectionName, 'FETCH', `Fetching: ${filePath} (${responseType})`);

        const response = await base44.functions.invoke('getArchiveEntry', {
          zipUrl: archiveUrl,
          entryPath: filePath,
          responseType
        });

        if (responseType === 'json' && response.data?.content) {
          const result = parseJsonGeneric(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from JSON`, 'success', parsedData.length);
        } else if (responseType === 'text' && response.data?.content) {
          const result = await parseMarketplaceFromHtml(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from HTML`, result.error ? 'error' : 'success', parsedData.length);
        }
      } else if (sectionName === 'events') {
        selectedFiles = normalized.eventFiles.json.length > 0 ? normalized.eventFiles.json : normalized.eventFiles.html;
        if (selectedFiles.length === 0) {
          throw new Error('No event files found');
        }
        const filePath = selectedFiles[0];
        const responseType = filePath.endsWith('.json') ? 'json' : 'text';

        addLog(sectionName, 'FETCH', `Fetching: ${filePath} (${responseType})`);

        const response = await base44.functions.invoke('getArchiveEntry', {
          zipUrl: archiveUrl,
          entryPath: filePath,
          responseType
        });

        if (responseType === 'json' && response.data?.content) {
          const result = parseJsonGeneric(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from JSON`, 'success', parsedData.length);
        } else if (responseType === 'text' && response.data?.content) {
          const result = await parseEventsFromHtml(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from HTML`, result.error ? 'error' : 'success', parsedData.length);
        }
      } else if (sectionName === 'reels') {
        selectedFiles = normalized.reelFiles.json.length > 0 ? normalized.reelFiles.json : normalized.reelFiles.html;
        if (selectedFiles.length === 0) {
          throw new Error('No reel files found');
        }
        const filePath = selectedFiles[0];
        const responseType = filePath.endsWith('.json') ? 'json' : 'text';

        addLog(sectionName, 'FETCH', `Fetching: ${filePath} (${responseType})`);

        const response = await base44.functions.invoke('getArchiveEntry', {
          zipUrl: archiveUrl,
          entryPath: filePath,
          responseType
        });

        if (responseType === 'json' && response.data?.content) {
          const result = parseJsonGeneric(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from JSON`, 'success', parsedData.length);
        } else if (responseType === 'text' && response.data?.content) {
          const result = await parseReelsFromHtml(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from HTML`, result.error ? 'error' : 'success', parsedData.length);
        }
      } else if (sectionName === 'checkins') {
        selectedFiles = normalized.checkinFiles.json.length > 0 ? normalized.checkinFiles.json : normalized.checkinFiles.html;
        if (selectedFiles.length === 0) {
          throw new Error('No check-in files found');
        }
        const filePath = selectedFiles[0];
        const responseType = filePath.endsWith('.json') ? 'json' : 'text';

        addLog(sectionName, 'FETCH', `Fetching: ${filePath} (${responseType})`);

        const response = await base44.functions.invoke('getArchiveEntry', {
          zipUrl: archiveUrl,
          entryPath: filePath,
          responseType
        });

        if (responseType === 'json' && response.data?.content) {
          const result = parseJsonGeneric(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from JSON`, 'success', parsedData.length);
        } else if (responseType === 'text' && response.data?.content) {
          const result = await parseCheckinsFromHtml(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from HTML`, result.error ? 'error' : 'success', parsedData.length);
        }
      }

      setLoadedSections(prev => ({ ...prev, [sectionName]: parsedData }));
      console.log(`[FacebookViewer] Loaded ${parsedData.length} ${sectionName}`);
      } catch (err) {
      console.error(`[FacebookViewer] Failed to load ${sectionName}:`, err);
      addLog(sectionName, 'ERROR', err.message, 'error');
      setLoadedSections(prev => ({ ...prev, [sectionName]: { error: err.message } }));
      } finally {
      setLoadingSection(null);
      }
      };

  // Legacy parsed data (fallback for old format)
  const profile = data?.profile || {};
  const posts = isStreamingIndex ? (Array.isArray(loadedSections.posts) ? loadedSections.posts : []) : (Array.isArray(data?.posts) ? data.posts : []);
  const friends = isStreamingIndex ? (Array.isArray(loadedSections.friends) ? loadedSections.friends : []) : (Array.isArray(data?.friends) ? data.friends : []);
  const messages = isStreamingIndex ? (Array.isArray(loadedSections.messages) ? loadedSections.messages : []) : (Array.isArray(data?.conversations) ? data.conversations : Array.isArray(data?.messages) ? data.messages : []);
  const comments = isStreamingIndex ? (Array.isArray(loadedSections.comments) ? loadedSections.comments : []) : (Array.isArray(data?.comments) ? data.comments : []);
  const likes = isStreamingIndex ? (Array.isArray(loadedSections.likes) ? loadedSections.likes : []) : (Array.isArray(data?.likes) ? data.likes : []);
  const groups = isStreamingIndex ? (Array.isArray(loadedSections.groups) ? loadedSections.groups : []) : (Array.isArray(data?.groups) ? data.groups : []);
  const reviews = isStreamingIndex ? (Array.isArray(loadedSections.reviews) ? loadedSections.reviews : []) : (Array.isArray(data?.reviews) ? data.reviews : []);
  const marketplace = isStreamingIndex ? (Array.isArray(loadedSections.marketplace) ? loadedSections.marketplace : []) : (Array.isArray(data?.marketplace) ? data.marketplace : []);
  const events = isStreamingIndex ? (Array.isArray(loadedSections.events) ? loadedSections.events : []) : (Array.isArray(data?.events) ? data.events : []);
  const reels = isStreamingIndex ? (Array.isArray(loadedSections.reels) ? loadedSections.reels : []) : (Array.isArray(data?.reels) ? data.reels : []);
  const checkins = isStreamingIndex ? (Array.isArray(loadedSections.checkins) ? loadedSections.checkins : []) : (Array.isArray(data?.checkins) ? data.checkins : []);

  const filteredPosts = posts.filter(post => 
    post?.text?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFriends = friends.filter(friend =>
    friend?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMessages = messages.filter(conv =>
    conv?.conversation_with?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {data?.warnings && data.warnings.length > 0 && (
        <Alert className="bg-yellow-50 border-yellow-200">
          <AlertDescription className="text-yellow-800 text-sm">
            {data.warnings.join('; ')}
          </AlertDescription>
        </Alert>
      )}

      {/* Debug Info Display */}
      <div className="mb-4 flex justify-between items-center">
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="text-xs text-gray-600 hover:text-gray-900 underline"
        >
          {showDebug ? 'Hide' : 'Show'} Debug
        </button>
        {mediaDebugLogs.length > 0 && (
          <button
            onClick={() => setMediaDebugLogs([])}
            className="text-xs text-red-600 hover:text-red-900 underline ml-4"
          >
            Clear Media Logs ({mediaDebugLogs.length})
          </button>
        )}
      </div>
      {showDebug && (
        <Alert className="bg-gray-50 border-gray-300">
          <AlertDescription className="text-gray-700 text-xs font-mono">
            <div className="space-y-1">
              <div><strong>Debug Info (buildId: {data?.buildId || 'N/A'}):</strong></div>
              <div>• Mode: {normalized.mode || 'unknown'}</div>
              <div>• Entries Parsed: {data?.entriesParsed || data?.debug?.entriesParsed || 0}</div>
              <div>• EOCD Found: {data?.eocdFound || data?.debug?.eocdFound ? 'Yes' : 'No'}</div>
              <div>• Root Prefix: {data?.rootPrefix || data?.debug?.rootPrefix || 'none'}</div>
              <div className="mt-2"><strong>Data Sources:</strong></div>
              <div>• Photos Source: {normalized.photos.length > 0 ? 'index.photos' : 'data.photos'} → {normalized.photos.length} items</div>
              <div>• Videos Source: {normalized.videos.length > 0 ? 'index.videos' : 'data.videos'} → {normalized.videos.length} items</div>
              <div>• Media All: {data?.index?.mediaAll?.length || 0} (ALL images/videos in ZIP for resolving post media)</div>
              <div>• Known Media Path Set Size: {knownMediaPathSet.size}</div>
              <div>• Posts Files: {normalized.postFiles.html.length + normalized.postFiles.json.length} files</div>
              <div>• Friends Files: {normalized.friendFiles.html.length + normalized.friendFiles.json.length} files</div>
              <div>• Comments Files: {normalized.commentFiles.html.length + normalized.commentFiles.json.length} files</div>
              <div>• Likes Files: {normalized.likeFiles.html.length + normalized.likeFiles.json.length} files</div>
              <div className="mt-2"><strong>Normalized Counts:</strong></div>
              <div>• photos: {normalized.counts.photos}, videos: {normalized.counts.videos}, posts: {normalized.counts.posts}, friends: {normalized.counts.friends}</div>
              {data?.debug?.samplePaths && data.debug.samplePaths.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer hover:text-blue-600">Sample Paths ({data.debug.samplePaths.length})</summary>
                  <div className="mt-2 pl-4 max-h-48 overflow-y-auto">
                    {data.debug.samplePaths.slice(0, 30).map((path, i) => (
                      <div key={i} className="text-xs">{path}</div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Media Debug Logs */}
      {mediaDebugLogs.length > 0 && (
        <Alert className="bg-blue-50 border-blue-300 mb-4">
          <AlertDescription>
            <div className="text-xs font-mono space-y-1 max-h-64 overflow-y-auto">
              <div className="font-bold text-blue-900 mb-2">Media Load Debug Log:</div>
              {mediaDebugLogs.map((log, i) => (
                <div key={i} className={`${log.includes('ERROR') ? 'text-red-700' : log.includes('RENDER_OK') ? 'text-green-700' : 'text-gray-700'}`}>
                  {log}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Profile Header */}
      <Card className="border-none shadow-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20 border-4 border-white">
              <AvatarFallback className="bg-blue-700 text-white text-2xl">
                {profile.name?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-2xl font-bold">{profile.name || 'Facebook User'}</h2>
              {profile.email && <p className="text-blue-100">{profile.email}</p>}
              {isStreamingIndex && (
                <p className="text-blue-100 text-sm mt-1">
                  Archive: {(data.archive?.fileSize / 1024 / 1024).toFixed(0)} MB • {data.archive?.entryCount || 0} files
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Search */}
      {!isStreamingIndex && <AIDataSearch data={data} />}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
        <Input
          placeholder="Search posts, friends, messages..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Content Tabs */}
      <LoadDebugPanel logs={debugLogs[activeTab]} isLoading={loadingSection === activeTab} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap gap-2 mb-6 bg-transparent h-auto p-0">
            <TabsTrigger value="posts" className="bg-red-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-red-600 text-sm">
              Posts ({normalized.counts.posts})
            </TabsTrigger>
            <TabsTrigger value="friends" className="bg-orange-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-orange-600 text-sm">
              Friends ({loadedSections.friends?.counts?.yourFriends || normalized.counts.friends})
            </TabsTrigger>
            <TabsTrigger value="messages" className="bg-yellow-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-yellow-600 text-sm">
              Chats ({normalized.counts.chats})
            </TabsTrigger>
            <TabsTrigger value="photos" className="bg-green-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-green-600 text-sm">
              Photos ({normalized.counts.photos})
            </TabsTrigger>
            <TabsTrigger value="videos" className="bg-teal-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-teal-600 text-sm">
              Videos ({normalized.counts.videos})
            </TabsTrigger>
            <TabsTrigger value="comments" className="bg-blue-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-blue-600 text-sm">
              Comments ({normalized.counts.comments})
            </TabsTrigger>
            <TabsTrigger value="likes" className="bg-indigo-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-indigo-600 text-sm">
              Likes ({normalized.counts.likes})
            </TabsTrigger>
            <TabsTrigger value="groups" className="bg-purple-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-purple-600 text-sm">
              Groups ({normalized.counts.groups})
            </TabsTrigger>
            <TabsTrigger value="reviews" className="bg-pink-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-pink-600 text-sm">
              Reviews ({normalized.counts.reviews})
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="bg-rose-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-rose-600 text-sm">
              Marketplace ({normalized.counts.marketplace})
            </TabsTrigger>
            <TabsTrigger value="events" className="bg-amber-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-amber-600 text-sm">
              Events ({normalized.counts.events})
            </TabsTrigger>
            <TabsTrigger value="reels" className="bg-cyan-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-cyan-600 text-sm">
              Reels ({normalized.counts.reels})
            </TabsTrigger>
            <TabsTrigger value="checkins" className="bg-emerald-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-emerald-600 text-sm">
              Check-ins ({normalized.counts.checkins})
            </TabsTrigger>
          </TabsList>

        <TabsContent value="posts" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.posts ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Files Detected ({normalized.postFiles.html.length + normalized.postFiles.json.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {normalized.postFiles.json.map((file, i) => (
                    <div key={`json-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                  {normalized.postFiles.html.map((file, i) => (
                    <div key={`html-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Button 
                onClick={() => loadSection('posts')}
                disabled={loadingSection === 'posts'}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                {loadingSection === 'posts' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading Posts...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Load & Parse Posts
                  </>
                )}
              </Button>
            </div>
          ) : filteredPosts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {loadedSections.posts?.error ? `Error: ${loadedSections.posts.error}` : 'No posts found'}
              </CardContent>
            </Card>
          ) : (
            filteredPosts.map((post, i) => (
              <Card key={i} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar>
                      <AvatarFallback className="bg-blue-500 text-white">
                        {profile.name?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-semibold">{profile.name || 'You'}</p>
                        {post.timestamp && (
                          <span className="text-xs text-gray-500">{post.timestamp}</span>
                        )}
                      </div>
                      {post.text && (
                        <p className="text-gray-700 whitespace-pre-wrap mb-3">{post.text}</p>
                      )}

                      {/* Debug output for first 3 posts with media (only in debug mode) */}
                      {showDebug && post.mediaPaths && post.mediaPaths.length > 0 && i < 3 && (
                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs font-mono">
                          <div className="font-bold mb-1">Post Media Debug (post #{i}):</div>
                          <div>• resolvedCount: {post.mediaPaths.length}</div>
                          {post.mediaPaths.slice(0, 3).map((item, idx) => {
                            const entryPath = getEntryPath(item);
                            return (
                              <div key={idx} className="mt-1">
                                media[{idx}] type={typeof item} entryPath="{entryPath || 'NULL'}" 
                                {typeof item === 'object' && ` raw=${JSON.stringify(item).slice(0, 200)}`}
                              </div>
                            );
                          })}
                          {post.mediaUnresolvedRefs && post.mediaUnresolvedRefs.length > 0 && (
                            <div className="mt-2">
                              <div className="font-bold">• unresolvedRefs: {post.mediaUnresolvedRefs.length}</div>
                              {post.mediaUnresolvedRefs.slice(0, 3).map((ref, idx) => (
                                <div key={idx} className="ml-2 text-xs text-red-700">
                                  [{idx}] {ref}
                                </div>
                              ))}
                            </div>
                          )}
                          {post.mediaPagePaths && post.mediaPagePaths.length > 0 && (
                            <div className="mt-2">
                              <div className="font-bold">• htmlPagePaths: {post.mediaPagePaths.length}</div>
                              {post.mediaPagePaths.slice(0, 3).map((ref, idx) => (
                                <div key={idx} className="ml-2 text-xs text-blue-700">
                                  [{idx}] {ref}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {post.mediaPaths && post.mediaPaths.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs text-gray-500 mb-2 font-semibold">Media ({post.mediaPaths.length})</div>
                          <div className="grid grid-cols-3 gap-2">
                            {post.mediaPaths.slice(0, 6).map((mediaItem, j) => {
                              const entryPath = getEntryPath(mediaItem);

                              if (!entryPath) {
                                return (
                                  <div key={j} className="aspect-square rounded flex flex-col items-center justify-center bg-red-100 border-2 border-red-400 text-xs p-1">
                                    <p className="text-red-700 text-center font-bold mb-1">Invalid media item</p>
                                    {showDebug && (
                                      <div className="text-xs text-red-600 break-all">
                                        type={typeof mediaItem} {typeof mediaItem === 'object' && `raw=${JSON.stringify(mediaItem).slice(0, 100)}`}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              const mediaState = loadedMedia[entryPath];
                              const isLoaded = mediaState && typeof mediaState === 'object' && mediaState.url;
                              const isLoading = mediaState === 'loading';
                              const hasError = mediaState && typeof mediaState === 'object' && mediaState.error;

                              return (
                                <div key={j} className="relative">
                                  <div
                                    className={`aspect-square rounded flex items-center justify-center text-xs cursor-pointer transition-colors ${
                                      hasError ? 'bg-red-100 border-2 border-red-400' : 'bg-gray-200 hover:bg-gray-300'
                                    }`}
                                    onClick={() => {
                                      if (!isLoaded && !isLoading) {
                                        const type = entryPath.match(/\.(mp4|mov|m4v|webm)$/i) ? 'video' : 'image';
                                        loadMedia(mediaItem, type, post.sourceFile, post._mediaRefsRaw?.[j] || 'N/A');
                                      }
                                    }}
                                  >
                                    {isLoaded ? (
                                      entryPath.match(/\.(mp4|mov|m4v|webm)$/i) ? (
                                        <video 
                                          className="w-full h-full object-cover rounded" 
                                          muted
                                          onLoadedData={() => addMediaLog(`[MEDIA_RENDER_OK] video ${entryPath}`)}
                                          onError={(e) => addMediaLog(`[MEDIA_RENDER_ERROR] video ${entryPath}: ${e.target.error?.message || 'unknown'}`)}
                                        >
                                          <source src={mediaState.url} type={mediaState.mime || 'video/mp4'} />
                                        </video>
                                      ) : (
                                        <img 
                                          src={mediaState.url} 
                                          alt="media" 
                                          className="w-full h-full object-cover rounded"
                                          onLoad={() => addMediaLog(`[MEDIA_RENDER_OK] image ${entryPath}`)}
                                          onError={(e) => addMediaLog(`[MEDIA_RENDER_ERROR] image ${entryPath}: ${e.target.error || 'failed to load'}`)}
                                        />
                                      )
                                    ) : (
                                      <div className="text-center p-1">
                                        {isLoading && <p className="text-gray-600 text-lg">⟳</p>}
                                        {hasError && (
                                          <div className="text-red-700">
                                            <p className="font-bold text-lg">✕</p>
                                            <p className="text-xs mt-1 break-all">{mediaState.error}</p>
                                          </div>
                                        )}
                                        {!isLoading && !hasError && (
                                          <div>
                                            <p className="text-gray-600 text-2xl">📷</p>
                                            <p className="text-xs text-gray-500 mt-1">Click to load</p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  {/* Debug path tooltip */}
                                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-1 rounded-b opacity-0 hover:opacity-100 transition-opacity pointer-events-none overflow-hidden">
                                    <div className="truncate" title={entryPath}>{entryPath.split('/').pop()}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {post.mediaUnresolvedRefs && post.mediaUnresolvedRefs.length > 0 && (
                        <div className="mt-3">
                          <details className="text-xs">
                            <summary className="cursor-pointer text-amber-700 font-semibold hover:text-amber-900">
                              ⚠ Unresolved media refs: {post.mediaUnresolvedRefs.length} (click to show)
                            </summary>
                            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded font-mono text-xs space-y-1">
                              {post.mediaUnresolvedRefs.slice(0, 10).map((ref, idx) => (
                                <div key={idx} className="text-amber-900 break-all">• {ref}</div>
                              ))}
                              {post.mediaUnresolvedRefs.length > 10 && (
                                <div className="text-amber-700">... and {post.mediaUnresolvedRefs.length - 10} more</div>
                              )}
                            </div>
                          </details>
                        </div>
                      )}
                      
                      {post.mediaPagePaths && post.mediaPagePaths.length > 0 && (
                        <div className="mt-3">
                          <button className="text-xs text-blue-700 font-semibold hover:text-blue-900 flex items-center gap-1">
                            🔗 Open media page ({post.mediaPagePaths.length} {post.mediaPagePaths.length === 1 ? 'link' : 'links'})
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="friends" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.friends ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Files Detected ({normalized.friendFiles.html.length + normalized.friendFiles.json.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {normalized.friendFiles.json.map((file, i) => (
                    <div key={`json-${i}`} className="p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs truncate block">{file}</code>
                    </div>
                  ))}
                  {normalized.friendFiles.html.map((file, i) => (
                    <div key={`html-${i}`} className="p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs truncate block">{file}</code>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Button 
                onClick={() => loadSection('friends')}
                disabled={loadingSection === 'friends'}
                className="w-full bg-orange-600 hover:bg-orange-700"
              >
                {loadingSection === 'friends' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading Friends...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Load & Parse Friends
                  </>
                )}
              </Button>
            </div>
          ) : loadedSections.friends && loadedSections.friends.probeResults ? (
            <div className="space-y-4">
              {/* Your Friends Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>Your Friends ({loadedSections.friends.counts?.yourFriends || 0})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadedSections.friends.items?.length === 0 ? (
                    <div className="text-sm text-gray-600 space-y-2">
                      <p>This export does not include your friends list (your_friends.html contains no friend entries).</p>
                      {loadedSections.friends.probeResults
                        .filter(p => p.category === 'actual_friends')
                        .map((probeResult, i) => (
                          <div key={i} className="mt-2">
                            <details>
                              <summary className="cursor-pointer text-xs text-blue-700 hover:text-blue-900 font-semibold">
                                View Raw: {probeResult.path.split('/').pop()}
                              </summary>
                              <div className="mt-2 text-xs text-gray-500 space-y-1">
                                <div>divLeaf={probeResult.probe.selectorCounts?.divLeafTextCount || 0}, textLength={probeResult.probe.selectorCounts?.textLength || 0}, hasNoDataMessage={probeResult.probe.hasNoDataMessage ? 'yes' : 'no'}</div>
                                {probeResult.probe.sampleLeafTextsRedacted?.length > 0 && (
                                  <div>Samples: [{probeResult.probe.sampleLeafTextsRedacted.slice(0, 3).join(', ')}]</div>
                                )}
                              </div>
                              <div className="mt-2 border rounded overflow-hidden" style={{ maxHeight: '300px' }}>
                                <iframe 
                                  srcDoc={probeResult.content} 
                                  className="w-full h-72 border-0"
                                  sandbox="allow-same-origin"
                                />
                              </div>
                            </details>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {loadedSections.friends.items.map((friend, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <Avatar>
                            <AvatarFallback className="bg-green-500 text-white">
                              {friend.name?.[0] || 'F'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{friend.name}</p>
                            {friend.profileUrl && (
                              <p className="text-xs text-gray-500 truncate max-w-xs">{friend.profileUrl}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* People You May Know */}
              {loadedSections.friends.byCategory?.people_you_may_know?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">People You May Know ({loadedSections.friends.byCategory.people_you_may_know.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {loadedSections.friends.byCategory.people_you_may_know.slice(0, 10).map((person, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-purple-500 text-white text-xs">
                              {person.name?.[0] || 'P'}
                            </AvatarFallback>
                          </Avatar>
                          <p className="font-medium text-xs">{person.name}</p>
                        </div>
                      ))}
                      {loadedSections.friends.byCategory.people_you_may_know.length > 10 && (
                        <div className="text-xs text-gray-500 p-2">
                          ... and {loadedSections.friends.byCategory.people_you_may_know.length - 10} more
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Suggested Friends */}
              {loadedSections.friends.byCategory?.suggestions?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Suggested Friends ({loadedSections.friends.byCategory.suggestions.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-gray-600">
                      {loadedSections.friends.byCategory.suggestions.length} suggested connections
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Friend Requests */}
              {loadedSections.friends.byCategory?.requests?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Friend Requests ({loadedSections.friends.byCategory.requests.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-gray-600">
                      {loadedSections.friends.byCategory.requests.length} rejected/pending requests
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Following/Followers */}
              {loadedSections.friends.byCategory?.following?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Following/Followers ({loadedSections.friends.byCategory.following.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-gray-600">
                      {loadedSections.friends.byCategory.following.length} accounts you follow/followed you
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredFriends.length === 0 ? (
                    <p className="col-span-2 text-center text-gray-500 py-4">
                      {loadedSections.friends?.error ? `Error: ${loadedSections.friends.error}` : 'No friends found'}
                    </p>
                  ) : (
                    filteredFriends.map((friend, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <Avatar>
                          <AvatarFallback className="bg-green-500 text-white">
                            {friend.name?.[0] || 'F'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{friend.name}</p>
                          {friend.profileUrl && (
                            <p className="text-xs text-gray-500 truncate max-w-xs">{friend.profileUrl}</p>
                          )}
                          {friend.date_added && (
                            <p className="text-xs text-gray-500">Friends since {friend.date_added}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          {isStreamingIndex && !loadedSections.messages ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Found {normalized.messageThreads.length} message threads
                </p>
                <Button 
                  onClick={() => loadSection('messages')}
                  disabled={loadingSection === 'messages'}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  {loadingSection === 'messages' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading Messages...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Load Message Threads
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex gap-4" style={{ height: 'calc(100vh - 22rem)' }}>
              <Card className="w-1/3 flex flex-col">
                <CardHeader>
                  <CardTitle className="text-sm">Conversations</CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-grow overflow-y-auto">
                  <div className="divide-y">
                    {filteredMessages.length === 0 ? (
                      <p className="p-4 text-center text-gray-500 text-sm">
                        {loadedSections.messages?.error ? `Error: ${loadedSections.messages.error}` : 'No conversations found'}
                      </p>
                    ) : (
                      filteredMessages.map((conv, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedConversation(conv)}
                          className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                            selectedConversation?.conversation_with === conv.conversation_with ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10">
                              <AvatarFallback className="bg-purple-500 text-white">
                                {conv.conversation_with?.[0]?.toUpperCase() || 'M'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate text-sm">{conv.conversation_with}</p>
                              <Badge variant="outline" className="text-xs mt-1">
                                {conv.totalMessages || conv.messages?.length || 0} messages
                              </Badge>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="w-2/3 flex flex-col">
                <CardHeader>
                  <CardTitle className="text-sm">
                    {selectedConversation ? `Chat with ${selectedConversation.conversation_with}` : 'Select a conversation'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow overflow-y-auto">
                  {selectedConversation ? (
                    <p className="text-center text-gray-500 py-8">Message loading coming soon</p>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-center text-gray-500 py-8">Select a conversation to view messages</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          {normalized.photos.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No photos found
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {normalized.photos.map((photo, i) => {
                const path = photo.path;
                const mediaState = loadedMedia[path];
                const isLoaded = mediaState && typeof mediaState === 'object' && mediaState.url;
                const isLoading = mediaState === 'loading';
                const hasError = mediaState && typeof mediaState === 'object' && mediaState.error;

                return (
                  <Dialog key={i}>
                    <DialogTrigger asChild>
                      <div 
                        className="aspect-square cursor-pointer hover:opacity-90 transition-opacity bg-gray-100 flex items-center justify-center rounded-lg"
                        onClick={() => {
                          if (!isLoaded && !isLoading) loadMedia(path, 'image', 'photos_tab', path);
                        }}
                      >
                        {isLoaded ? (
                          <img 
                            src={mediaState.url} 
                            alt={photo.name} 
                            className="w-full h-full object-cover rounded-lg"
                            onLoad={() => addMediaLog(`[MEDIA_RENDER_OK] photo ${path}`)}
                            onError={(e) => addMediaLog(`[MEDIA_RENDER_ERROR] photo ${path}`)}
                          />
                        ) : (
                          <div className={`text-xs text-center p-2 ${hasError ? 'text-red-600' : 'text-gray-400'}`}>
                            {isLoading && <p className="mb-1">Loading...</p>}
                            {hasError && (
                              <>
                                <p className="mb-1 font-semibold">⚠ Error</p>
                                <p className="text-xs">{hasError}</p>
                              </>
                            )}
                            {!isLoading && !hasError && (
                              <>
                                <p className="mb-1">Click to load</p>
                                <p className="text-xs">{photo.name}</p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </DialogTrigger>
                    {isLoaded && (
                      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                        <img src={mediaState.url} alt={path} className="w-full h-auto max-h-[75vh] object-contain mx-auto" />
                        <p className="text-sm text-gray-500 mt-2">{path}</p>
                      </DialogContent>
                    )}
                  </Dialog>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="videos" className="mt-4">
          {normalized.videos.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No videos found
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {normalized.videos.map((video, i) => {
                const mediaState = loadedMedia[video.path];
                const isLoaded = mediaState && typeof mediaState === 'object' && mediaState.url;
                const isLoading = mediaState === 'loading';
                const hasError = mediaState && typeof mediaState === 'object' && mediaState.error;

                return (
                  <Card key={i}>
                    <CardContent className="p-4">
                      {!isLoaded ? (
                        <div 
                          className={`w-full rounded-lg flex items-center justify-center cursor-pointer transition-colors ${hasError ? 'bg-red-100' : 'bg-gray-200 hover:bg-gray-300'}`}
                          style={{ height: '200px' }}
                          onClick={() => {
                            if (!isLoading && !hasError) loadMedia(video.path, 'video', 'videos_tab', video.path);
                          }}
                        >
                          <div className="text-center">
                            {isLoading && <p className="text-gray-600 font-medium">Loading video...</p>}
                            {hasError ? (
                              <>
                                <p className="text-red-700 font-medium mb-2">⚠ Failed to load</p>
                                <p className="text-xs text-red-600">{hasError}</p>
                              </>
                            ) : !isLoading && (
                              <>
                                <p className="text-gray-600 font-medium mb-2">Click to load video</p>
                                <p className="text-xs text-gray-500">{video.name}</p>
                                <p className="text-xs text-gray-400">{(video.size / 1024 / 1024).toFixed(2)} MB</p>
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        <video 
                          controls 
                          className="w-full rounded-lg"
                          style={{ maxHeight: '400px' }}
                          onLoadedData={() => addMediaLog(`[MEDIA_RENDER_OK] video ${video.path}`)}
                          onError={(e) => addMediaLog(`[MEDIA_RENDER_ERROR] video ${video.path}`)}
                        >
                          <source src={mediaState.url} type={mediaState.mime || 'video/mp4'} />
                          Your browser does not support the video tag.
                        </video>
                      )}
                      <p className="text-sm text-gray-500 mt-2">{video.name}</p>
                      <p className="text-xs text-gray-400">{(video.size / 1024 / 1024).toFixed(2)} MB</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="comments" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.comments ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Files Detected ({normalized.commentFiles.html.length + normalized.commentFiles.json.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {normalized.commentFiles.json.map((file, i) => (
                    <div key={`json-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                  {normalized.commentFiles.html.map((file, i) => (
                    <div key={`html-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Button 
                onClick={() => loadSection('comments')}
                disabled={loadingSection === 'comments'}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {loadingSection === 'comments' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading Comments...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Load & Parse Comments
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {loadedSections.comments?.noFilesInExport ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-gray-600 mb-2">No comment files exist in this Facebook export.</p>
                    <p className="text-sm text-gray-500">Re-download from Facebook including 'Comments and reactions' or 'Your Facebook Activity → Comments' categories.</p>
                  </CardContent>
                </Card>
              ) : comments.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-gray-500">
                    No comments found
                  </CardContent>
                </Card>
              ) : (
                comments.map((comment, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <p className="text-sm whitespace-pre-wrap">{comment.text || comment.comment || JSON.stringify(comment).slice(0, 200)}</p>
                      {comment.timestamp && (
                        <p className="text-xs text-gray-500 mt-2">{comment.timestamp}</p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="likes" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.likes ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Files Detected ({normalized.likeFiles.html.length + normalized.likeFiles.json.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {normalized.likeFiles.json.map((file, i) => (
                    <div key={`json-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                  {normalized.likeFiles.html.map((file, i) => (
                    <div key={`html-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Button 
                onClick={() => loadSection('likes')}
                disabled={loadingSection === 'likes'}
                className="w-full bg-indigo-600 hover:bg-indigo-700"
              >
                {loadingSection === 'likes' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading Likes...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Load & Parse Likes
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {likes.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-gray-500">
                    No likes found
                  </CardContent>
                </Card>
              ) : (
                likes.map((like, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <p className="text-sm">{like.text || like.name || JSON.stringify(like).slice(0, 200)}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="groups" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.groups ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Files Detected ({normalized.groupFiles.html.length + normalized.groupFiles.json.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {normalized.groupFiles.json.map((file, i) => (
                    <div key={`json-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                  {normalized.groupFiles.html.map((file, i) => (
                    <div key={`html-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Button 
                onClick={() => loadSection('groups')}
                disabled={loadingSection === 'groups'}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {loadingSection === 'groups' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading Groups...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Load & Parse Groups
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-gray-500">
                    No groups found
                  </CardContent>
                </Card>
              ) : (
                groups.map((group, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium">{group.groupName || group.name || JSON.stringify(group).slice(0, 200)}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.reviews ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Found {normalized.reviewFiles.html.length + normalized.reviewFiles.json.length} review files
                </p>
                <Button 
                  onClick={() => loadSection('reviews')}
                  disabled={loadingSection === 'reviews'}
                  className="bg-pink-600 hover:bg-pink-700"
                >
                  {loadingSection === 'reviews' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading Reviews...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Load Reviews
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {reviews.length === 0 ? 'No reviews found' : `${reviews.length} reviews`}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="marketplace" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.marketplace ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Files Detected ({normalized.marketplaceFiles.html.length + normalized.marketplaceFiles.json.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {normalized.marketplaceFiles.json.map((file, i) => (
                    <div key={`json-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                  {normalized.marketplaceFiles.html.map((file, i) => (
                    <div key={`html-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Button 
                onClick={() => loadSection('marketplace')}
                disabled={loadingSection === 'marketplace'}
                className="w-full bg-rose-600 hover:bg-rose-700"
              >
                {loadingSection === 'marketplace' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading Marketplace...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Load & Parse Marketplace
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {marketplace.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-gray-500">
                    No marketplace items found
                  </CardContent>
                </Card>
              ) : (
                marketplace.map((item, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium">{item.title || item.name || JSON.stringify(item).slice(0, 200)}</p>
                      {item.price && <p className="text-xs text-gray-600">{item.price}</p>}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.events ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Files Detected ({normalized.eventFiles.html.length + normalized.eventFiles.json.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {normalized.eventFiles.json.map((file, i) => (
                    <div key={`json-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                  {normalized.eventFiles.html.map((file, i) => (
                    <div key={`html-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Button 
                onClick={() => loadSection('events')}
                disabled={loadingSection === 'events'}
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                {loadingSection === 'events' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading Events...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Load & Parse Events
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {events.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-gray-500">
                    No events found
                  </CardContent>
                </Card>
              ) : (
                events.map((event, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium">{event.name || event.title || JSON.stringify(event).slice(0, 200)}</p>
                      {event.date && <p className="text-xs text-gray-600">{event.date}</p>}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reels" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.reels ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Files Detected ({normalized.reelFiles.html.length + normalized.reelFiles.json.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {normalized.reelFiles.json.map((file, i) => (
                    <div key={`json-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                  {normalized.reelFiles.html.map((file, i) => (
                    <div key={`html-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Button 
                onClick={() => loadSection('reels')}
                disabled={loadingSection === 'reels'}
                className="w-full bg-cyan-600 hover:bg-cyan-700"
              >
                {loadingSection === 'reels' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading Reels...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Load & Parse Reels
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {reels.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-gray-500">
                    No reels found
                  </CardContent>
                </Card>
              ) : (
                reels.map((reel, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <p className="text-sm">{reel.title || reel.name || JSON.stringify(reel).slice(0, 200)}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="checkins" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.checkins ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Files Detected ({normalized.checkinFiles.html.length + normalized.checkinFiles.json.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {normalized.checkinFiles.json.map((file, i) => (
                    <div key={`json-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                  {normalized.checkinFiles.html.map((file, i) => (
                    <div key={`html-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <code className="text-xs flex-1 truncate">{file}</code>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Button 
                onClick={() => loadSection('checkins')}
                disabled={loadingSection === 'checkins'}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {loadingSection === 'checkins' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading Check-ins...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Load & Parse Check-ins
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {checkins.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-gray-500">
                    No check-ins found
                  </CardContent>
                </Card>
              ) : (
                checkins.map((checkin, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <p className="text-sm">{checkin.location || checkin.name || JSON.stringify(checkin).slice(0, 200)}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}