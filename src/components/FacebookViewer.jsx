import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Calendar
} from "lucide-react";
import { format } from "date-fns";

export default function FacebookViewer({ data, photoFiles = {} }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [activeTab, setActiveTab] = useState("posts");

  const profile = data?.profile || {};
  const posts = data?.posts || [];
  const friends = data?.friends || [];
  const messages = data?.messages || [];
  const comments = data?.comments || [];
  const reels = data?.reels || [];
  const checkins = data?.checkins || [];
  const likes = data?.likes || [];
  const events = data?.events || [];
  const reviews = data?.reviews || [];
  const groups = data?.groups || [];
  
  // Get actual media files from photoFiles and videoFiles objects
  const photoFilesObj = data?.photoFiles || photoFiles || {};
  const videoFilesObj = data?.videoFiles || {};
  
  const actualPhotos = Object.entries(photoFilesObj).filter(([path]) => 
    path.match(/\.(jpg|jpeg|png|gif|webp)$/i) && !path.includes('icon')
  );
  
  const actualVideos = Object.entries(videoFilesObj);

  console.log("FacebookViewer received data:", {
    hasPhotoFiles: !!data?.photoFiles,
    hasVideoFiles: !!data?.videoFiles,
    photoFilesCount: Object.keys(photoFilesObj).length,
    videoFilesCount: Object.keys(videoFilesObj).length,
    actualPhotosCount: actualPhotos.length,
    actualVideosCount: actualVideos.length,
    posts: posts.length,
    friends: friends.length,
    messages: messages.length
  });

  const filteredPosts = posts.filter(post => 
    post.text?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFriends = friends.filter(friend =>
    friend.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMessages = messages.filter(msg =>
    msg.conversation_with?.toLowerCase().includes(searchTerm.toLowerCase())
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
          <TabsTrigger value="videos" className="bg-teal-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-teal-600">Videos ({actualVideos.length})</TabsTrigger>
          <TabsTrigger value="comments" className="bg-blue-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-blue-600">Comments ({comments.length})</TabsTrigger>
          <TabsTrigger value="reels" className="bg-indigo-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-indigo-600">Reels ({reels.length})</TabsTrigger>
          <TabsTrigger value="checkins" className="bg-purple-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-purple-600">Check-ins ({checkins.length})</TabsTrigger>
          <TabsTrigger value="likes" className="bg-pink-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-pink-600">Likes ({likes.length})</TabsTrigger>
          <TabsTrigger value="events" className="bg-rose-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-rose-600">Events ({events.length})</TabsTrigger>
          <TabsTrigger value="reviews" className="bg-fuchsia-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-fuchsia-600">Reviews ({reviews.length})</TabsTrigger>
          <TabsTrigger value="groups" className="bg-violet-500 text-black font-semibold px-6 py-2 rounded data-[state=active]:bg-violet-600">Groups ({groups.length})</TabsTrigger>
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
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <div className="grid md:grid-cols-3 gap-4">
            {/* Conversations List */}
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm">Conversations</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-96 overflow-y-auto">
                  {filteredMessages.length === 0 ? (
                    <p className="p-4 text-center text-gray-500 text-sm">No messages found</p>
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
                              {conv.conversation_with?.[0] || 'M'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{conv.conversation_with}</p>
                            <p className="text-xs text-gray-500">{conv.messages?.length || 0} messages</p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Message Thread */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">
                  {selectedConversation ? `Chat with ${selectedConversation.conversation_with}` : 'Select a conversation'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedConversation ? (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {selectedConversation.messages?.map((msg, i) => {
                      const isYou = msg.sender === profile.name || msg.sender === 'You';
                      return (
                        <div key={i} className={`flex ${isYou ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-xs p-3 rounded-lg ${
                            isYou ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-900'
                          }`}>
                            <p className="text-sm font-medium mb-1">{msg.sender}</p>
                            <p className="text-sm">{msg.text}</p>
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
                  <p className="text-center text-gray-500 py-8">Select a conversation to view messages</p>
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
          {actualVideos.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No videos found
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {actualVideos.map(([path, blobUrl], i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <video 
                      src={blobUrl} 
                      controls 
                      className="w-full rounded-lg"
                      style={{ maxHeight: '400px' }}
                    />
                    <p className="text-sm text-gray-500 mt-2">{path.split('/').pop()}</p>
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
                    <p className="text-sm text-gray-700">{like.item}</p>
                    {like.timestamp && <p className="text-xs text-gray-500 mt-1">{like.timestamp}</p>}
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
                  <p className="font-medium text-gray-900">{event.name}</p>
                  {event.timestamp && <p className="text-xs text-gray-500 mt-1">{event.timestamp}</p>}
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
                  <p className="text-gray-700">{review.text}</p>
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
      </Tabs>
    </div>
  );
}