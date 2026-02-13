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
  MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import AIDataSearch from "./AIDataSearch";

export default function FacebookViewer({ data, photoFiles = {}, archiveUrl = "" }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [activeTab, setActiveTab] = useState("posts");
  const [loadingMedia, setLoadingMedia] = useState({});

  const profile = data?.profile || {};
  const posts = Array.isArray(data?.posts) ? data.posts : [];
  const friends = Array.isArray(data?.friends) ? data.friends : [];
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  const comments = Array.isArray(data?.comments) ? data.comments : [];
  const reels = Array.isArray(data?.reels) ? data.reels : [];
  const checkins = Array.isArray(data?.checkins) ? data.checkins : [];
  const likes = Array.isArray(data?.likes) ? data.likes : [];
  const events = Array.isArray(data?.events) ? data.events : [];
  const reviews = Array.isArray(data?.reviews) ? data.reviews : [];
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const marketplace = Array.isArray(data?.marketplace) ? data.marketplace : [];
  
  // Map friends to their conversations with flexible matching
  const friendConversations = {};
  messages.forEach(conv => {
    const normalized = conv.conversation_with.toLowerCase().trim();
    friendConversations[normalized] = conv;
    // Also try to match by first and last name parts
    const parts = conv.conversation_with.split(/\s+/);
    if (parts.length > 1) {
      friendConversations[parts[parts.length - 1].toLowerCase()] = conv;
    }
  });
  
  // Get actual media files from photoFiles and videoFiles objects
  const photoFilesObj = data?.photoFiles || photoFiles || {};
  const videoFilesObj = data?.videoFiles || {};
  const videosList = Array.isArray(data?.videos) ? data.videos : [];
  
  const actualPhotos = Object.entries(photoFilesObj).filter(([path]) => 
    path.match(/\.(jpg|jpeg|png|gif|webp)$/i) && !path.includes('icon')
  );
  
  // Load media on demand using blob URLs
  const loadMedia = async (mediaPath, type) => {
    if (loadingMedia[mediaPath] || photoFilesObj[mediaPath]) return;
    setLoadingMedia(prev => ({ ...prev, [mediaPath]: true }));
    try {
      const response = await base44.functions.invoke('getArchiveEntry', {
        fileUrl: archiveUrl,
        entryPath: mediaPath,
        responseType: 'base64'
      });
      if (response.data?.content) {
        photoFilesObj[mediaPath] = response.data.content;
      }
    } catch (err) {
      console.error(`Failed to load media ${mediaPath}:`, err);
    } finally {
      setLoadingMedia(prev => ({ ...prev, [mediaPath]: false }));
    }
  };

  console.log("FacebookViewer received data:", {
    hasPhotoFiles: !!data?.photoFiles,
    hasVideoFiles: !!data?.videoFiles,
    photoFilesCount: Object.keys(photoFilesObj).length,
    videoFilesCount: Object.keys(videoFilesObj).length,
    actualPhotosCount: actualPhotos.length,
    videosList: videosList.length,
    posts: posts.length,
    friends: friends.length,
    messages: messages.length,
    comments: comments.length,
    commentsRaw: data?.comments,
    groups: groups.length,
    reviews: reviews.length,
    likes: likes.length
  });

  const filteredPosts = posts.filter(post => 
    post.text?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFriends = friends.filter(friend =>
    friend.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMessages = messages.filter(conv =>
    conv.conversation_with?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.messages?.some(msg => msg.text?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Search */}
      <AIDataSearch data={data} />

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
          <TabsTrigger value="posts" className="bg-red-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-red-600">Posts ({posts.length})</TabsTrigger>
          <TabsTrigger value="friends" className="bg-orange-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-orange-600">Friends ({friends.length})</TabsTrigger>
          <TabsTrigger value="messages" className="bg-yellow-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-yellow-600">Conversations ({messages.length})</TabsTrigger>
          <TabsTrigger value="photos" className="bg-green-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-green-600">Photos ({actualPhotos.length})</TabsTrigger>
          <TabsTrigger value="videos" className="bg-teal-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-teal-600">Videos ({videosList.length})</TabsTrigger>
          <TabsTrigger value="comments" className="bg-blue-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-blue-600">Comments ({comments.length})</TabsTrigger>
          <TabsTrigger value="reels" className="bg-indigo-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-indigo-600">Reels ({reels.length})</TabsTrigger>
          <TabsTrigger value="checkins" className="bg-purple-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-purple-600">Check-ins ({checkins.length})</TabsTrigger>
          <TabsTrigger value="likes" className="bg-pink-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-pink-600">Likes ({likes.length})</TabsTrigger>
          <TabsTrigger value="events" className="bg-rose-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-rose-600">Events ({events.length})</TabsTrigger>
          <TabsTrigger value="reviews" className="bg-fuchsia-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-fuchsia-600">Reviews ({reviews.length})</TabsTrigger>
          <TabsTrigger value="groups" className="bg-violet-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-violet-600">Groups ({groups.length})</TabsTrigger>
          <TabsTrigger value="marketplace" className="bg-cyan-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-cyan-600">Marketplace ({marketplace.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4 mt-4">
          {filteredPosts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No posts found
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
                          <span className="text-xs text-gray-500">
                            {post.timestamp}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-700 whitespace-pre-wrap">{post.text}</p>
                      {post.photo_url && (
                        <img 
                          src={post.photo_url} 
                          alt="Post photo" 
                          className="mt-3 rounded-lg w-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={(e) => {
                            const img = e.target;
                            if (img.style.maxHeight === 'none') {
                              img.style.maxHeight = '24rem';
                            } else {
                              img.style.maxHeight = 'none';
                            }
                          }}
                          style={{ maxHeight: '24rem' }}
                        />
                      )}
                      <div className="flex gap-4 mt-3 text-sm text-gray-500">
                        {post.likes_count > 0 && (
                          <span className="flex items-center gap-1">
                            <ThumbsUp className="w-4 h-4" />
                            {post.likes_count}
                          </span>
                        )}
                        {post.comments_count > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-4 h-4" />
                            {post.comments_count}
                          </span>
                        )}
                      </div>
                      {post.comments && post.comments.length > 0 && (
                        <div className="mt-4 pt-4 border-t space-y-3">
                          {post.comments.map((comment, ci) => (
                            <div key={ci} className="flex gap-2">
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className="bg-gray-400 text-white text-xs">
                                  {comment.author?.[0] || 'C'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 bg-gray-100 rounded-lg p-3">
                                <p className="font-semibold text-sm">{comment.author}</p>
                                <p className="text-sm text-gray-700 mt-1">{comment.text}</p>
                                {comment.timestamp && (
                                  <p className="text-xs text-gray-500 mt-1">{comment.timestamp}</p>
                                )}
                              </div>
                            </div>
                          ))}
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
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredFriends.length === 0 ? (
                  <p className="col-span-2 text-center text-gray-500 py-4">No friends found</p>
                ) : (
                  filteredFriends.map((friend, i) => {
                    const normalized = friend.name.toLowerCase().trim();
                    const conversation = friendConversations[normalized];
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          if (conversation) {
                            setSelectedConversation(conversation);
                            setActiveTab("messages");
                          }
                        }}
                        className="w-full text-left flex items-center justify-between gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!conversation}
                      >
                        <div className="flex items-center gap-3">
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
                            {conversation && (
                              <p className="text-xs text-blue-600 mt-1">
                                {conversation.totalMessages} messages
                              </p>
                            )}
                            {!conversation && (
                              <p className="text-xs text-gray-400 mt-1">No messages</p>
                            )}
                          </div>
                        </div>
                        {conversation && (
                          <MessageSquare className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <div className="flex gap-4" style={{ height: 'calc(100vh - 22rem)' }}>
            {/* Conversations List */}
            <Card className="w-1/3 flex flex-col">
              <CardHeader>
                <CardTitle className="text-sm">Conversations</CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-grow overflow-y-auto">
                <div className="divide-y">
                  {filteredMessages.length === 0 ? (
                    <p className="p-4 text-center text-gray-500 text-sm">No conversations found</p>
                  ) : (
                    filteredMessages.map((conv, i) => {
                      const lastMsg = conv.messages?.[0];
                      const lastMsgPreview = lastMsg?.text?.substring(0, 50) || '';

                      return (
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
                              <p className="text-xs text-gray-500 truncate">{lastMsgPreview}{lastMsgPreview.length >= 50 ? '...' : ''}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {conv.messages?.length || 0} messages
                                </Badge>
                                {lastMsg?.timestamp && (
                                  <span className="text-xs text-gray-400">{lastMsg.timestamp}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Message Thread */}
            <Card className="w-2/3 flex flex-col">
              <CardHeader>
                <CardTitle className="text-sm">
                  {selectedConversation ? `Chat with ${selectedConversation.conversation_with}` : 'Select a conversation'}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-grow overflow-y-auto">
                {selectedConversation ? (
                  <div className="space-y-3 p-4">
                    {selectedConversation.messages?.map((msg, i) => {
                      const isYou = msg.sender === profile.name || msg.sender.toLowerCase() === 'you';
                      return (
                        <div key={i} className={`flex ${isYou ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-md p-3 rounded-lg ${
                            isYou ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-900'
                          }`}>
                            <p className="text-sm font-medium mb-1">{msg.sender}</p>
                            <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                            {msg.timestamp && (
                              <p className={`text-xs mt-1 ${isYou ? 'text-blue-100' : 'text-gray-500'}`}>
                                {msg.timestamp}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                      <p className="text-center text-gray-500 py-8">Select a conversation to view messages</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          {actualPhotos.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No photos found
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {actualPhotos.map(([path, dataUrl], i) => (
                <Dialog key={i}>
                  <DialogTrigger asChild>
                    <div className="aspect-square cursor-pointer hover:opacity-90 transition-opacity">
                      <img 
                        src={dataUrl} 
                        alt={path.split('/').pop()} 
                        className="w-full h-full object-cover rounded-lg shadow"
                      />
                    </div>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl">
                    <img src={dataUrl} alt={path} className="w-full h-auto" />
                    <p className="text-sm text-gray-500 mt-2">{path}</p>
                  </DialogContent>
                </Dialog>
              ))}
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
              {videosList.map((video, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <video 
                      controls 
                      className="w-full rounded-lg"
                      style={{ maxHeight: '400px' }}
                      onPlay={() => {
                        if (!videoFilesObj[video.path] && archiveUrl) {
                          loadMedia(video.path, 'video');
                        }
                      }}
                    >
                      {videoFilesObj[video.path] && (
                        <source src={videoFilesObj[video.path]} type="video/mp4" />
                      )}
                      Your browser does not support the video tag.
                    </video>
                    <p className="text-sm text-gray-500 mt-2">{video.filename}</p>
                    <p className="text-xs text-gray-400">{(video.size / 1024 / 1024).toFixed(2)} MB</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="comments" className="space-y-4 mt-4">
          {comments.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No comments found
              </CardContent>
            </Card>
          ) : (
            comments.map((comment, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar>
                      <AvatarFallback className="bg-orange-500 text-white">
                        {profile.name?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-semibold">{profile.name || 'You'}</p>
                        {comment.on_post_by && (
                          <span className="text-xs text-gray-500">
                            commented on {comment.on_post_by}'s post
                          </span>
                        )}
                      </div>
                      <p className="text-gray-700">{comment.text}</p>
                      {comment.timestamp && (
                        <p className="text-xs text-gray-500 mt-2">{comment.timestamp}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="reels" className="space-y-4 mt-4">
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
                  <p className="text-gray-700">{reel.text}</p>
                  {reel.timestamp && <p className="text-xs text-gray-500 mt-2">{reel.timestamp}</p>}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="checkins" className="space-y-4 mt-4">
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
                  <p className="text-gray-700">{checkin.location}</p>
                  {checkin.timestamp && <p className="text-xs text-gray-500 mt-2">{checkin.timestamp}</p>}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="likes" className="space-y-4 mt-4">
          <Alert className="bg-blue-50 border-blue-200">
            <AlertDescription className="text-sm text-blue-800">
              This shows pages, posts, photos, and other content you've liked on Facebook.
            </AlertDescription>
          </Alert>
          {likes.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No likes found
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {likes.map((like, i) => (
                <Card key={i}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{like.item}</p>
                        {like.details && <p className="text-xs text-gray-600 mt-1">{like.details}</p>}
                      </div>
                      {like.type && (
                        <Badge variant="outline" className="text-xs">{like.type}</Badge>
                      )}
                    </div>
                    {like.timestamp && <p className="text-xs text-gray-500 mt-2">{like.timestamp}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="space-y-4 mt-4">
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
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-gray-900 flex-1">{event.name}</p>
                    {event.rsvp && (
                      <Badge className={
                        event.rsvp.toLowerCase() === 'going' ? 'bg-green-500' :
                        event.rsvp.toLowerCase() === 'interested' ? 'bg-blue-500' :
                        event.rsvp.toLowerCase().includes('host') ? 'bg-purple-500' :
                        'bg-gray-500'
                      }>
                        {event.rsvp}
                      </Badge>
                    )}
                  </div>
                  {event.location && (
                    <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {event.location}
                    </p>
                  )}
                  {event.details && event.details.length > 0 && (
                    <p className="text-sm text-gray-700 mt-2">{event.details.substring(0, 200)}</p>
                  )}
                  {event.timestamp && <p className="text-xs text-gray-500 mt-2">{event.timestamp}</p>}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4 mt-4">
          {reviews.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No reviews found
              </CardContent>
            </Card>
          ) : (
            reviews.map((review, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  {review.place && (
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-gray-900">{review.place}</p>
                      {review.rating && (
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-500">★</span>
                          <span className="font-semibold">{review.rating}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-gray-700 text-sm">{review.text}</p>
                  {review.timestamp && <p className="text-xs text-gray-500 mt-2">{review.timestamp}</p>}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="groups" className="space-y-4 mt-4">
          {groups.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No groups found
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {groups.map((group, i) => (
                <Card key={i}>
                  <CardContent className="p-3">
                    <p className="font-medium text-gray-900">{group.name}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="marketplace" className="space-y-4 mt-4">
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
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      {item.title && <p className="font-medium text-gray-900">{item.title}</p>}
                      {item.price && <p className="text-lg font-bold text-green-600 mt-1">{item.price}</p>}
                    </div>
                    {item.status && (
                      <Badge className={item.status === 'sold' ? 'bg-gray-500' : 'bg-green-500'}>
                        {item.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-gray-700 text-sm">{item.text}</p>
                  {item.timestamp && <p className="text-xs text-gray-500 mt-2">{item.timestamp}</p>}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}