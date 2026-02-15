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
  parseJsonGeneric
} from "./archiveParsers";

export default function FacebookViewer({ data, photoFiles = {}, archiveUrl = "", debugMode = false }) {
  // Normalize data on mount
  const normalized = normalizeArchiveAnalysis(data);
  
  // Log what we received and normalized
  React.useEffect(() => {
    console.log("[FacebookViewer] received data:", {
      buildId: data?.buildId,
      mode: data?.mode,
      rawPhotosLength: data?.index?.photos?.length,
      rawVideoLength: data?.index?.videos?.length,
      normalizedPhotosLength: normalized.photos.length,
      normalizedVideosLength: normalized.videos.length,
      normalizedCounts: normalized.counts,
      fullNormalized: normalized
    });
  }, [data, normalized]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [activeTab, setActiveTab] = useState("posts");
  const [loadedMedia, setLoadedMedia] = useState({});
  const [loadedSections, setLoadedSections] = useState({});
  const [loadingSection, setLoadingSection] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState({});
  const [viewRawContent, setViewRawContent] = useState({});

   const isStreamingIndex = normalized.isStreaming;

  // Load media on demand
  const loadMedia = async (mediaPath, type) => {
    if (loadedMedia[mediaPath] !== undefined) return;
    setLoadedMedia(prev => ({ ...prev, [mediaPath]: 'loading' }));
    
    try {
      console.log(`[FacebookViewer] Loading ${type} from ${mediaPath}`);
      const response = await base44.functions.invoke('getArchiveEntry', {
        zipUrl: archiveUrl,
        entryPath: mediaPath,
        responseType: 'base64'
      });
      
      if (response.data?.content && response.data?.mime) {
        const blobUrl = base64ToBlobUrl(response.data.content, response.data.mime);
        if (blobUrl) {
          console.log(`[FacebookViewer] Successfully created blob URL for ${mediaPath}`);
          setLoadedMedia(prev => ({ ...prev, [mediaPath]: blobUrl }));
        } else {
          throw new Error('Failed to create blob URL');
        }
      } else {
        throw new Error(`Invalid response: ${JSON.stringify(response.data)}`);
      }
    } catch (err) {
      console.error(`[FacebookViewer] Failed to load ${type}:`, err);
      setLoadedMedia(prev => ({ ...prev, [mediaPath]: { error: err.message } }));
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
      return URL.createObjectURL(blob);
    } catch (err) {
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

        const filePath = selectedFiles[0];
        const responseType = filePath.endsWith('.json') ? 'json' : 'text';

        addLog(sectionName, 'FETCH', `Fetching: ${filePath} (${responseType})`);

        const response = await base44.functions.invoke('getArchiveEntry', {
          zipUrl: archiveUrl,
          entryPath: filePath,
          responseType
        });

        addLog(sectionName, 'RESPONSE', `Status: ${response.status}, Size: ${response.data?.content?.length || 0} bytes`);

        if (responseType === 'json' && response.data?.content) {
          const jsonData = response.data.content;
          const result = parseJsonGeneric(jsonData, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from JSON`, 'success', parsedData.length);
        } else if (responseType === 'text' && response.data?.content) {
          const result = await parsePostsFromHtml(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from HTML`, result.error ? 'error' : 'success', parsedData.length);
          if (result.error) addLog(sectionName, 'PARSE_ERROR', result.error, 'error');
        }
      } else if (sectionName === 'friends') {
        selectedFiles = normalized.friendFiles.json.length > 0 ? normalized.friendFiles.json : normalized.friendFiles.html;
        if (selectedFiles.length === 0) {
          throw new Error('No friends files found in index');
        }

        const filePath = selectedFiles[0];
        const responseType = filePath.endsWith('.json') ? 'json' : 'text';

        addLog(sectionName, 'FETCH', `Fetching: ${filePath} (${responseType})`);

        const response = await base44.functions.invoke('getArchiveEntry', {
          zipUrl: archiveUrl,
          entryPath: filePath,
          responseType
        });

        addLog(sectionName, 'RESPONSE', `Status: ${response.status}, Size: ${response.data?.content?.length || 0} bytes`);

        if (responseType === 'json' && response.data?.content) {
          const jsonData = response.data.content;
          const result = parseJsonGeneric(jsonData, filePath);
          parsedData = result.items.slice(0, 100);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from JSON`, 'success', parsedData.length);
        } else if (responseType === 'text' && response.data?.content) {
          const result = await parseFriendsFromHtml(response.data.content, filePath);
          parsedData = result.items.slice(0, 100);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from HTML`, result.error ? 'error' : 'success', parsedData.length);
          if (result.error) addLog(sectionName, 'PARSE_ERROR', result.error, 'error');
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
        selectedFiles = normalized.commentFiles.json.length > 0 ? normalized.commentFiles.json : normalized.commentFiles.html;
        if (selectedFiles.length === 0) {
          throw new Error('No comments files found');
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
          const result = await parseCommentsFromHtml(response.data.content, filePath);
          parsedData = result.items.slice(0, 50);
          addLog(sectionName, 'PARSE', `Parsed ${parsedData.length} items from HTML`, result.error ? 'error' : 'success', parsedData.length);
        }
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap gap-2 mb-6 bg-transparent h-auto p-0">
            <TabsTrigger value="posts" className="bg-red-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-red-600 text-sm">
              Posts ({normalized.counts.posts})
            </TabsTrigger>
            <TabsTrigger value="friends" className="bg-orange-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-orange-600 text-sm">
              Friends ({normalized.counts.friends})
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
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Found {normalized.postFiles.html.length + normalized.postFiles.json.length} post files ({normalized.postFiles.json.length} JSON, {normalized.postFiles.html.length} HTML)
                </p>
                <Button 
                  onClick={() => loadSection('posts')}
                  disabled={loadingSection === 'posts'}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {loadingSection === 'posts' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading Posts...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Load Posts
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
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
                      <p className="text-gray-700 whitespace-pre-wrap">{post.text}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="friends" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.friends ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Found {normalized.friendFiles.html.length + normalized.friendFiles.json.length} friend files
                </p>
                <Button 
                  onClick={() => loadSection('friends')}
                  disabled={loadingSection === 'friends'}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {loadingSection === 'friends' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading Friends...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Load Friends
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
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
                const isLoaded = typeof mediaState === 'string' && mediaState.startsWith('blob:');
                const isLoading = mediaState === 'loading';
                const hasError = mediaState && typeof mediaState === 'object' && mediaState.error;

                return (
                  <Dialog key={i}>
                    <DialogTrigger asChild>
                      <div 
                        className="aspect-square cursor-pointer hover:opacity-90 transition-opacity bg-gray-100 flex items-center justify-center rounded-lg"
                        onClick={() => {
                          if (!isLoaded && !isLoading) loadMedia(path, 'image');
                        }}
                      >
                        {isLoaded && typeof mediaState === 'string' ? (
                          <img 
                            src={mediaState} 
                            alt={photo.name} 
                            className="w-full h-full object-cover rounded-lg"
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
                    {isLoaded && typeof mediaState === 'string' && (
                      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                        <img src={mediaState} alt={path} className="w-full h-auto max-h-[75vh] object-contain mx-auto" />
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
                const isLoaded = typeof mediaState === 'string' && mediaState.startsWith('blob:');
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
                            if (!isLoading && !hasError) loadMedia(video.path, 'video');
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
                        >
                          <source src={mediaState} type="video/mp4" />
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
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Found {normalized.commentFiles.html.length + normalized.commentFiles.json.length} comment files
                </p>
                <Button 
                  onClick={() => loadSection('comments')}
                  disabled={loadingSection === 'comments'}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {loadingSection === 'comments' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading Comments...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Load Comments
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {comments.length === 0 ? 'No comments found' : `${comments.length} comments`}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="likes" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.likes ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Found {normalized.likeFiles.html.length + normalized.likeFiles.json.length} like/reaction files
                </p>
                <Button 
                  onClick={() => loadSection('likes')}
                  disabled={loadingSection === 'likes'}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {loadingSection === 'likes' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading Likes...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Load Likes
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {likes.length === 0 ? 'No likes found' : `${likes.length} likes`}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="groups" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.groups ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Found {normalized.groupFiles.html.length + normalized.groupFiles.json.length} group files
                </p>
                <Button 
                  onClick={() => loadSection('groups')}
                  disabled={loadingSection === 'groups'}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {loadingSection === 'groups' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading Groups...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Load Groups
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {groups.length === 0 ? 'No groups found' : `${groups.length} groups`}
              </CardContent>
            </Card>
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
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Found {normalized.marketplaceFiles.html.length + normalized.marketplaceFiles.json.length} marketplace files
                </p>
                <Button 
                  onClick={() => loadSection('marketplace')}
                  disabled={loadingSection === 'marketplace'}
                  className="bg-rose-600 hover:bg-rose-700"
                >
                  {loadingSection === 'marketplace' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading Marketplace...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Load Marketplace
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {marketplace.length === 0 ? 'No marketplace items found' : `${marketplace.length} items`}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="events" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.events ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Found {normalized.eventFiles.html.length + normalized.eventFiles.json.length} event files
                </p>
                <Button 
                  onClick={() => loadSection('events')}
                  disabled={loadingSection === 'events'}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {loadingSection === 'events' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading Events...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Load Events
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {events.length === 0 ? 'No events found' : `${events.length} events`}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="reels" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.reels ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Found {normalized.reelFiles.html.length + normalized.reelFiles.json.length} reel files
                </p>
                <Button 
                  onClick={() => loadSection('reels')}
                  disabled={loadingSection === 'reels'}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  {loadingSection === 'reels' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading Reels...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Load Reels
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {reels.length === 0 ? 'No reels found' : `${reels.length} reels`}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="checkins" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.checkins ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Found {normalized.checkinFiles.html.length + normalized.checkinFiles.json.length} check-in files
                </p>
                <Button 
                  onClick={() => loadSection('checkins')}
                  disabled={loadingSection === 'checkins'}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {loadingSection === 'checkins' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading Check-ins...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Load Check-ins
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {checkins.length === 0 ? 'No check-ins found' : `${checkins.length} check-ins`}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}