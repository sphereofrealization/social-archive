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
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AIDataSearch from "./AIDataSearch";

export default function FacebookViewer({ data, photoFiles = {}, archiveUrl = "" }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [activeTab, setActiveTab] = useState("posts");
  const [loadedMedia, setLoadedMedia] = useState({});
  const [loadedSections, setLoadedSections] = useState({});
  const [loadingSection, setLoadingSection] = useState(null);

  // Check if this is streaming index data
  const isStreamingIndex = data?.isStreaming === true;
  const index = data?.index || {};
  const counts = data?.counts || {};

  console.log('[FacebookViewer] Data received:', {
    isStreamingIndex,
    hasIndex: !!index,
    counts,
    indexKeys: Object.keys(index)
  });

  // Legacy parsed data (for non-streaming extractions)
  const profile = data?.profile || {};
  const posts = isStreamingIndex ? (loadedSections.posts || []) : (Array.isArray(data?.posts) ? data.posts : []);
  const friends = isStreamingIndex ? (loadedSections.friends || []) : (Array.isArray(data?.friends) ? data.friends : []);
  const messages = isStreamingIndex ? (loadedSections.messages || []) : (Array.isArray(data?.conversations) ? data.conversations : Array.isArray(data?.messages) ? data.messages : []);
  const comments = Array.isArray(data?.comments) ? data.comments : [];
  const reels = Array.isArray(data?.reels) ? data.reels : [];
  const checkins = Array.isArray(data?.checkins) ? data.checkins : [];
  const likes = Array.isArray(data?.likes) ? data.likes : [];
  const events = Array.isArray(data?.events) ? data.events : [];
  const reviews = Array.isArray(data?.reviews) ? data.reviews : [];
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const marketplace = Array.isArray(data?.marketplace) ? data.marketplace : [];
  
  const photosList = isStreamingIndex ? (index.photos || []) : (Array.isArray(data?.photos) ? data.photos : []);
  const videosList = isStreamingIndex ? (index.videos || []) : (Array.isArray(data?.videos) ? data.videos : []);

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

  // Load section data on demand
  const loadSection = async (sectionName) => {
    if (loadedSections[sectionName]) return;
    setLoadingSection(sectionName);

    try {
      console.log(`[FacebookViewer] Loading ${sectionName} section`);
      
      let parsedData = [];

      if (sectionName === 'posts') {
        // Prefer JSON, fallback to HTML
        const files = index.posts?.json?.length > 0 ? index.posts.json : index.posts?.html || [];
        if (files.length === 0) {
          throw new Error('No posts files found in index');
        }

        // Load first file only for now
        const filePath = files[0];
        const responseType = filePath.endsWith('.json') ? 'json' : 'text';
        
        const response = await base44.functions.invoke('getArchiveEntry', {
          zipUrl: archiveUrl,
          entryPath: filePath,
          responseType
        });

        if (responseType === 'json' && response.data?.content) {
          // Parse Facebook posts JSON structure
          const jsonData = response.data.content;
          if (Array.isArray(jsonData)) {
            parsedData = jsonData.slice(0, 50).map(item => ({
              text: item.post || item.data?.[0]?.post || item.title || 'No text',
              timestamp: item.timestamp ? new Date(item.timestamp * 1000).toLocaleDateString() : null,
              likes_count: 0,
              comments_count: 0
            }));
          }
        } else if (responseType === 'text' && response.data?.content) {
          // Basic HTML parsing fallback
          parsedData = [{ text: `HTML file loaded: ${files.length} post files found`, timestamp: null }];
        }
      } else if (sectionName === 'friends') {
        const files = index.friends?.json?.length > 0 ? index.friends.json : index.friends?.html || [];
        if (files.length === 0) {
          throw new Error('No friends files found in index');
        }

        const filePath = files[0];
        const responseType = filePath.endsWith('.json') ? 'json' : 'text';
        
        const response = await base44.functions.invoke('getArchiveEntry', {
          zipUrl: archiveUrl,
          entryPath: filePath,
          responseType
        });

        if (responseType === 'json' && response.data?.content) {
          const jsonData = response.data.content;
          if (jsonData.friends && Array.isArray(jsonData.friends)) {
            parsedData = jsonData.friends.slice(0, 100).map(friend => ({
              name: friend.name || 'Unknown',
              date_added: friend.timestamp ? new Date(friend.timestamp * 1000).toLocaleDateString() : null
            }));
          } else if (Array.isArray(jsonData)) {
            parsedData = jsonData.slice(0, 100).map(friend => ({
              name: friend.name || 'Unknown',
              date_added: friend.timestamp ? new Date(friend.timestamp * 1000).toLocaleDateString() : null
            }));
          }
        }
      } else if (sectionName === 'messages') {
        const threads = index.messages?.threads || [];
        if (threads.length === 0) {
          throw new Error('No message threads found in index');
        }

        // Load first 10 threads
        parsedData = threads.slice(0, 10).map(thread => ({
          conversation_with: thread.threadPath.replace(/_/g, ' '),
          messages: [],
          totalMessages: thread.messageFiles.length
        }));
      }

      setLoadedSections(prev => ({ ...prev, [sectionName]: parsedData }));
      console.log(`[FacebookViewer] Loaded ${parsedData.length} ${sectionName}`);
    } catch (err) {
      console.error(`[FacebookViewer] Failed to load ${sectionName}:`, err);
      setLoadedSections(prev => ({ ...prev, [sectionName]: { error: err.message } }));
    } finally {
      setLoadingSection(null);
    }
  };

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
            Posts ({isStreamingIndex ? (counts.postsJsonFiles + counts.postsHtmlFiles) : posts.length})
          </TabsTrigger>
          <TabsTrigger value="friends" className="bg-orange-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-orange-600 text-sm">
            Friends ({isStreamingIndex ? (counts.friendsJsonFiles + counts.friendsHtmlFiles) : friends.length})
          </TabsTrigger>
          <TabsTrigger value="messages" className="bg-yellow-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-yellow-600 text-sm">
            Chats ({isStreamingIndex ? counts.messageThreads : messages.length})
          </TabsTrigger>
          <TabsTrigger value="photos" className="bg-green-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-green-600 text-sm">
            Photos ({counts.photos || photosList.length})
          </TabsTrigger>
          <TabsTrigger value="videos" className="bg-teal-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-teal-600 text-sm">
            Videos ({counts.videos || videosList.length})
          </TabsTrigger>
          <TabsTrigger value="comments" className="bg-blue-500 text-white font-semibold px-4 py-2 rounded data-[state=active]:bg-blue-600 text-sm">
            Comments ({comments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4 mt-4">
          {isStreamingIndex && !loadedSections.posts ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Found {counts.postsJsonFiles + counts.postsHtmlFiles} post files ({counts.postsJsonFiles} JSON, {counts.postsHtmlFiles} HTML)
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
                  Found {counts.friendsJsonFiles + counts.friendsHtmlFiles} friend files
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
                  Found {counts.messageThreads} message threads
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
          {photosList.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No photos found
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photosList.map((photo, i) => {
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
          {videosList.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No videos found
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {videosList.map((video, i) => {
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
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              {isStreamingIndex ? (
                `Found ${counts.commentsJsonFiles + counts.commentsHtmlFiles} comment files - Loading not yet implemented`
              ) : (
                comments.length === 0 ? 'No comments found' : `${comments.length} comments`
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}