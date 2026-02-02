import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, FileText, Image as ImageIcon, MessageSquare, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import FacebookViewer from "./FacebookViewer";
import JSZip from "jszip";

export default function ArchiveDataViewer({ archive }) {
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);
  const [individualFile, setIndividualFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const handleFileUploadForAnalysis = async () => {
    if (!individualFile) return;
    
    setUploadingFile(true);
    setError(null);
    
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: individualFile });
      await analyzeFile(file_url);
    } catch (err) {
      const errorMessage = err?.message || err?.toString() || "Unknown error";
      setError(`Failed to analyze file: ${errorMessage}`);
      console.error("Full error:", err);
    }
    
    setUploadingFile(false);
  };

  const analyzeFile = async (fileUrl) => {
    setExtracting(true);
    setError(null);

    try {
      console.log("Downloading archive...");
      const response = await fetch(fileUrl);
      const blob = await response.blob();

      console.log("Unzipping archive...");
      const zip = await JSZip.loadAsync(blob);

      console.log("Extracting data...");
      const data = {
        profile: { name: "", email: "" },
        posts: [],
        friends: [],
        messages: [],
        photos: [],
        comments: [],
        reels: [],
        checkins: [],
        likes: [],
        events: [],
        reviews: [],
        groups: [],
        photoFiles: {} // Store photo file paths and their data URLs
      };

      const parseHTML = (html) => {
        return html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      };

      const extractTimestamp = (html) => {
        const dateMatch = html.match(/(\d{1,2}\s+\w+\s+\d{4}|\d{4}-\d{2}-\d{2})/);
        return dateMatch ? dateMatch[0] : "";
      };

      // First pass - extract all image files as data URLs
      for (const [path, file] of Object.entries(zip.files)) {
        if (file.dir) continue;

        if (path.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          try {
            const blob = await file.async("blob");
            const dataUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            data.photoFiles[path] = dataUrl;
          } catch (err) {
            console.error(`Error loading image ${path}:`, err);
          }
        }
      }

      console.log(`Loaded ${Object.keys(data.photoFiles).length} photo files`);

      // Second pass - extract text content and link to photos
      for (const [path, file] of Object.entries(zip.files)) {
        if (file.dir) continue;

        try {
          const content = await file.async("text");

          console.log("Processing file:", path);

          if (path.includes("profile_information") || path.includes("about_you")) {
            const nameMatch = content.match(/name["\s:]+([^<\n"]+)/i);
            const emailMatch = content.match(/[\w\.-]+@[\w\.-]+\.\w+/);
            if (nameMatch) data.profile.name = nameMatch[1].trim();
            if (emailMatch) data.profile.email = emailMatch[0];
          }

          if ((path.includes("posts") || path.includes("your_posts")) && path.endsWith(".html")) {
            // Try multiple splitting patterns for posts
            let postMatches = content.split(/<div[^>]*class="[^"]*post[^"]*"[^>]*>/gi);
            if (postMatches.length < 2) {
              postMatches = content.split(/data-ft=\{[^}]*"mf_story_key"/gi);
            }
            if (postMatches.length < 2) {
              // Try splitting by common Facebook post markers
              postMatches = content.split(/<div[^>]*>/gi).filter(chunk => 
                chunk.includes('timestamp') || chunk.length > 100
              );
            }

            console.log(`Found ${postMatches.length} potential posts in ${path}`);

            // Get all available post photos ONCE before processing posts
            const postsPhotos = Object.keys(data.photoFiles)
              .filter(p => p.includes('posts') || p.includes('media'))
              .map(path => data.photoFiles[path]);
            
            console.log(`Found ${postsPhotos.length} photos in posts/media folders`);

            for (let i = 1; i < Math.min(postMatches.length, 101); i++) {
              const postHtml = postMatches[i];
              const text = parseHTML(postHtml.substring(0, 2000));
              const timestamp = extractTimestamp(postHtml);
              const likesMatch = postHtml.match(/(\d+)\s*(like|reaction)/i);
              const commentsMatch = postHtml.match(/(\d+)\s*comment/i);

              if (text.length > 10) {
                // Assign photos sequentially - one photo per post
                const photoUrl = postsPhotos[data.posts.length] || null;

                data.posts.push({
                  text: text.substring(0, 500),
                  timestamp,
                  likes_count: likesMatch ? parseInt(likesMatch[1]) : 0,
                  comments_count: commentsMatch ? parseInt(commentsMatch[1]) : 0,
                  photo_url: photoUrl
                });
              }
            }
          }

          if (path.includes("friends") && path.endsWith(".html")) {
            const friendMatches = content.match(/>([^<]+)<\/a>/g) || [];
            for (let i = 0; i < Math.min(friendMatches.length, 500); i++) {
              const nameMatch = friendMatches[i].match(/>([^<]+)</);
              if (nameMatch) {
                const name = nameMatch[1].trim();
                if (name.length > 2 && name.length < 100) {
                  const timestamp = extractTimestamp(content.substring(Math.max(0, content.indexOf(name) - 200), content.indexOf(name) + 200));
                  data.friends.push({ name, date_added: timestamp });
                }
              }
            }
          }

          if (path.includes("messages") && path.endsWith(".html")) {
            const conversationMatch = path.match(/messages\/inbox\/([^\/]+)\//);
            const conversationWith = conversationMatch ? decodeURIComponent(conversationMatch[1]).replace(/_/g, ' ') : "Unknown";

            const messageBlocks = content.split(/<div[^>]*class="[^"]*message[^"]*"[^>]*>/gi);
            const messages = [];

            for (let i = 1; i < Math.min(messageBlocks.length, 101); i++) {
              const msgHtml = messageBlocks[i];
              const senderMatch = msgHtml.match(/class="[^"]*user[^"]*">([^<]+)</i);
              const text = parseHTML(msgHtml.substring(0, 1000));
              const timestamp = extractTimestamp(msgHtml);

              if (text.length > 5) {
                messages.push({
                  sender: senderMatch ? senderMatch[1].trim() : conversationWith,
                  text: text.substring(0, 300),
                  timestamp
                });
              }
            }

            if (messages.length > 0) {
              data.messages.push({
                conversation_with: conversationWith,
                messages: messages.slice(0, 100)
              });
            }
          }

          if ((path.includes("photos") || path.includes("album")) && (path.endsWith(".html") || path.endsWith(".json"))) {
            if (path.endsWith(".json")) {
              try {
                const jsonData = JSON.parse(content);
                if (jsonData.photos) {
                  jsonData.photos.forEach(photo => {
                    data.photos.push({
                      description: photo.title || photo.description || "",
                      timestamp: new Date(photo.creation_timestamp * 1000).toLocaleDateString()
                    });
                  });
                }
              } catch (e) {
                console.log("Failed to parse photo JSON:", e);
              }
            } else {
              const photoMatches = content.split(/<div[^>]*class="[^"]*photo[^"]*"[^>]*>/gi);
              if (photoMatches.length < 2) {
                // Try alternative patterns
                const imgMatches = content.match(/<img[^>]+>/gi) || [];
                imgMatches.forEach(img => {
                  const altMatch = img.match(/alt="([^"]+)"/);
                  if (altMatch) {
                    data.photos.push({
                      description: altMatch[1],
                      timestamp: ""
                    });
                  }
                });
              }
              for (let i = 1; i < Math.min(photoMatches.length, 201); i++) {
                const photoHtml = photoMatches[i];
                const description = parseHTML(photoHtml.substring(0, 500));
                const timestamp = extractTimestamp(photoHtml);
                data.photos.push({ description: description.substring(0, 200), timestamp });
              }
            }
            console.log(`Found ${data.photos.length} total photos so far`);
          }

          if (path.includes("comments") && path.endsWith(".html")) {
            const commentMatches = content.split(/<div[^>]*class="[^"]*comment[^"]*"[^>]*>/gi);
            for (let i = 1; i < Math.min(commentMatches.length, 201); i++) {
              const commentHtml = commentMatches[i];
              const text = parseHTML(commentHtml.substring(0, 1000));
              const timestamp = extractTimestamp(commentHtml);
              const onPostMatch = commentHtml.match(/on\s+([^']+)'s\s+post/i);

              if (text.length > 5) {
                data.comments.push({
                  text: text.substring(0, 300),
                  timestamp,
                  on_post_by: onPostMatch ? onPostMatch[1].trim() : ""
                });
              }
            }
          }

          if (path.includes("likes_and_reactions") || path.includes("likes")) {
            const likeMatches = content.match(/>([^<]+)<\/a>/g) || [];
            for (let i = 0; i < Math.min(likeMatches.length, 200); i++) {
              const match = likeMatches[i].match(/>([^<]+)</);
              if (match) {
                const text = parseHTML(content.substring(content.indexOf(match[0]) - 100, content.indexOf(match[0]) + 200));
                const timestamp = extractTimestamp(text);
                data.likes.push({ item: match[1].trim(), timestamp });
              }
            }
          }

          if (path.includes("check-ins") || path.includes("checkins") || path.includes("places")) {
            const checkinMatches = content.split(/<div[^>]*>/gi).filter(chunk => chunk.length > 50);
            for (let i = 0; i < Math.min(checkinMatches.length, 100); i++) {
              const text = parseHTML(checkinMatches[i].substring(0, 500));
              const timestamp = extractTimestamp(checkinMatches[i]);
              if (text.length > 10) {
                data.checkins.push({ location: text.substring(0, 200), timestamp });
              }
            }
          }

          if (path.includes("events") && path.endsWith(".html") && !path.includes("no-data")) {
            const eventMatches = content.match(/>([^<]+)<\/a>/g) || [];
            for (let i = 0; i < Math.min(eventMatches.length, 200); i++) {
              const match = eventMatches[i].match(/>([^<]+)</);
              if (match && match[1].length > 3) {
                const text = parseHTML(content.substring(content.indexOf(match[0]) - 100, content.indexOf(match[0]) + 200));
                const timestamp = extractTimestamp(text);
                data.events.push({ name: match[1].trim(), timestamp });
              }
            }
          }

          if (path.includes("reviews") && path.endsWith(".html")) {
            const reviewMatches = content.split(/<div[^>]*>/gi).filter(chunk => chunk.length > 50);
            for (let i = 0; i < Math.min(reviewMatches.length, 100); i++) {
              const text = parseHTML(reviewMatches[i].substring(0, 1000));
              const timestamp = extractTimestamp(reviewMatches[i]);
              if (text.length > 20) {
                data.reviews.push({ text: text.substring(0, 300), timestamp });
              }
            }
          }

          if (path.includes("groups") && path.endsWith(".html") && !path.includes("no-data")) {
            const groupMatches = content.match(/>([^<]+)<\/a>/g) || [];
            for (let i = 0; i < Math.min(groupMatches.length, 200); i++) {
              const match = groupMatches[i].match(/>([^<]+)</);
              if (match && match[1].length > 3) {
                data.groups.push({ name: match[1].trim() });
              }
            }
          }

          if (path.includes("reels") && path.endsWith(".html") && !path.includes("no-data")) {
            const reelMatches = content.split(/<div[^>]*>/gi).filter(chunk => chunk.length > 50);
            for (let i = 0; i < Math.min(reelMatches.length, 100); i++) {
              const text = parseHTML(reelMatches[i].substring(0, 500));
              const timestamp = extractTimestamp(reelMatches[i]);
              if (text.length > 10) {
                data.reels.push({ text: text.substring(0, 300), timestamp });
              }
            }
          }

        } catch (err) {
          console.error(`Error processing ${path}:`, err);
        }
      }

      console.log("Extraction complete!", {
        profile: data.profile,
        posts: data.posts.length,
        friends: data.friends.length,
        messages: data.messages.length,
        photos: data.photos.length,
        comments: data.comments.length,
        samplePost: data.posts[0],
        samplePhoto: data.photos[0]
      });
      setExtractedData(data);

    } catch (err) {
      const errorMessage = err?.message || err?.toString() || "Unknown error";
      setError(`Failed to extract data: ${errorMessage}`);
      console.error("Full error:", err);
    }

    setExtracting(false);
  };

  const isZipFile = archive.file_name?.toLowerCase().endsWith('.zip');

  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertDescription className="text-red-800">{error}</AlertDescription>
      </Alert>
    );
  }

  if (!extractedData) {
    return (
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
        <CardContent className="p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-purple-600" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Extract Archive Data</h3>
            <p className="text-sm text-gray-600 mb-4">
              Automatically parse your {archive.platform} archive and view it in a familiar interface
            </p>
            <Button 
              onClick={() => analyzeFile(archive.file_url)}
              disabled={extracting}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extracting Data...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Extract & View Data
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <FacebookViewer data={extractedData} />;
}