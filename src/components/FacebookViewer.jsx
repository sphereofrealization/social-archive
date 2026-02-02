import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
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

export default function FacebookViewer({ data }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConversation, setSelectedConversation] = useState(null);

  const profile = data?.profile || {};
  const posts = data?.posts || [];
  const friends = data?.friends || [];
  const messages = data?.messages || [];
  const photos = data?.photos || [];
  const comments = data?.comments || [];

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
                {profile.name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-2xl font-bold">{profile.name || 'User'}</h2>
              {profile.email && <p className="text-blue-100">{profile.email}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="w-6 h-6 text-blue-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{posts.length}</p>
            <p className="text-sm text-gray-600">Posts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-6 h-6 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{friends.length}</p>
            <p className="text-sm text-gray-600">Friends</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="w-6 h-6 text-purple-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{messages.length}</p>
            <p className="text-sm text-gray-600">Conversations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ImageIcon className="w-6 h-6 text-pink-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{photos.length}</p>
            <p className="text-sm text-gray-600">Photos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ThumbsUp className="w-6 h-6 text-orange-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{comments.length}</p>
            <p className="text-sm text-gray-600">Comments</p>
          </CardContent>
        </Card>
      </div>

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
      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="friends">Friends</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
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

        <TabsContent value="photos" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {photos.length === 0 ? (
                  <p className="col-span-full text-center text-gray-500 py-4">No photos found</p>
                ) : (
                  photos.map((photo, i) => (
                    <div key={i} className="bg-gray-100 rounded-lg p-4 text-center">
                      <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      {photo.description && (
                        <p className="text-xs text-gray-600 mb-1">{photo.description}</p>
                      )}
                      {photo.timestamp && (
                        <p className="text-xs text-gray-500">{photo.timestamp}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
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
      </Tabs>
    </div>
  );
}