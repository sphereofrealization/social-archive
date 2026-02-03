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

export default function ArchiveDataViewer({ archive, onExtractionComplete }) {
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

      // Log ALL files in the archive first - COMPLETE SITE MAP
      console.log("========================================");
      console.log("📁 COMPLETE FACEBOOK ARCHIVE SITE MAP:");
      console.log("========================================");
      const allFiles = Object.keys(zip.files).filter(path => !zip.files[path].dir);

      // Group files by top-level folder
      const filesByFolder = {};
      allFiles.forEach(path => {
        const topFolder = path.split('/')[0];
        if (!filesByFolder[topFolder]) {
          filesByFolder[topFolder] = [];
        }
        filesByFolder[topFolder].push(path);
      });

      // Log organized structure
      Object.keys(filesByFolder).sort().forEach(folder => {
        console.log(`\n📂 ${folder}/ (${filesByFolder[folder].length} files)`);
        filesByFolder[folder].slice(0, 20).forEach(file => {
          console.log(`   ${file}`);
        });
        if (filesByFolder[folder].length > 20) {
          console.log(`   ... and ${filesByFolder[folder].length - 20} more files`);
        }
      });

      console.log("\n========================================");
      console.log(`TOTAL FILES: ${allFiles.length}`);
      console.log("========================================\n");

      // Look specifically for inbox conversations
      const inboxFiles = allFiles.filter(f => f.includes('/inbox/') && f.endsWith('.json'));
      console.log(`📨 Found ${inboxFiles.length} inbox conversation files:`, inboxFiles);

      // Look specifically for friends files
      const friendsFiles = allFiles.filter(f => f.toLowerCase().includes('friend'));
      console.log(`👥 Found ${friendsFiles.length} friends files:`);
      friendsFiles.forEach(f => console.log("     ", f));

      // Look for photo files
      const photoFiles = allFiles.filter(f => f.toLowerCase().includes('photo') && !f.toLowerCase().includes('review'));
      console.log(`📸 Found ${photoFiles.length} photo files:`);
      photoFiles.forEach(f => console.log("     ", f));

      // Look for video/movie files
      const videoFiles = allFiles.filter(f => f.match(/\.(mp4|mov|avi|mkv)$/i) || f.toLowerCase().includes('video') || f.toLowerCase().includes('reel'));
      console.log(`🎬 Found ${videoFiles.length} video files:`);
      videoFiles.forEach(f => console.log("     ", f));

      // Look for review files
      const reviewFiles = allFiles.filter(f => f.toLowerCase().includes('review'));
      console.log(`⭐ Found ${reviewFiles.length} review files:`);
      reviewFiles.forEach(f => console.log("     ", f));
      
      const data = {
        profile: { name: "", email: "" },
        posts: [],
        friends: [],
        messages: [],
        photos: [],
        comments: [],
        reels: [],
        videos: [],
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
          
          // Log first 200 chars of key files
          if (path.includes("friends") || path.includes("message") || path.includes("comment") || path.includes("photo")) {
            console.log(`📄 ${path} (${content.length} chars)`);
            console.log("   Preview:", content.substring(0, 200).replace(/\s+/g, ' '));
          }

          // Profile - extract from "Generated by NAME" pattern in any HTML file
          if (path.endsWith(".html") && !data.profile.name) {
            const generatedByMatch = content.match(/Generated by ([^<\n]+) on/i);
            if (generatedByMatch) {
              data.profile.name = generatedByMatch[1].trim();
              console.log(`✅ Extracted name: "${data.profile.name}" from: ${path}`);
            }
          }

          // Email extraction from any HTML file
          if (path.endsWith(".html") && !data.profile.email) {
            const emailMatch = content.match(/[\w\.-]+@[\w\.-]+\.\w+/);
            if (emailMatch) {
              data.profile.email = emailMatch[0];
              console.log(`✅ Extracted email: ${data.profile.email}`);
            }
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

          // Friends - ANY file with "friend" in path
          if (path.toLowerCase().includes("friend") && (path.endsWith(".html") || path.endsWith(".json"))) {
            console.log("🔍 FRIENDS FILE:", path);
            console.log("   FULL CONTENT LENGTH:", content.length);
            console.log("   FIRST 2000 CHARS:", content.substring(0, 2000));

            if (path.endsWith(".json")) {
              try {
                const jsonData = JSON.parse(content);
                console.log("   FULL JSON:", JSON.stringify(jsonData, null, 2));

                let friendsList = jsonData.friends_v2 || jsonData.friends || [];
                if (Array.isArray(friendsList)) {
                  console.log(`   Processing ${friendsList.length} friends from array`);
                  friendsList.forEach((friend, idx) => {
                    console.log(`   Friend ${idx}:`, friend);
                    const name = friend.name || friend.title || "";
                    if (name.length > 2) {
                      data.friends.push({ 
                        name, 
                        date_added: friend.timestamp ? new Date(friend.timestamp * 1000).toLocaleDateString() : ""
                      });
                    }
                  });
                  console.log(`   ✅ Extracted ${friendsList.length} friends from JSON`);
                }
              } catch (e) {
                console.log("   ⚠️ Failed to parse JSON:", e.message);
              }
            } else {
              // HTML - try MULTIPLE extraction methods
              console.log("   Trying extraction method 1: <a> tags");
              const linkMatches = content.match(/<a[^>]*>([^<]+)<\/a>/gi) || [];
              console.log(`   Found ${linkMatches.length} links`);

              linkMatches.forEach((link, idx) => {
                const nameMatch = link.match(/>([^<]+)</);
                if (nameMatch) {
                  const name = nameMatch[1].trim();
                  console.log(`   Link ${idx}: "${name}"`);

                  // Accept anything that looks like a real name (has space or mixed case)
                  if ((name.includes(" ") || (name.match(/[A-Z]/) && name.match(/[a-z]/))) && 
                      name.length >= 3 && name.length < 50 &&
                      !name.match(/^(disabled|false|true|name|restricted|close|acquaintances|following)$/i)) {
                    data.friends.push({ name, date_added: "" });
                    console.log(`   ✅ Added friend: ${name}`);
                  }
                }
              });

              console.log(`   Total friends after <a> extraction: ${data.friends.length}`);
            }
          }

          // Messages - look in messages/inbox/ for conversation JSON files
          if (path.match(/messages\/inbox\/[^\/]+\/message_\d+\.json$/i)) {
            console.log("🔍 CONVERSATION FILE:", path);
            console.log("   First 800 chars:", content.substring(0, 800));

            try {
              const jsonData = JSON.parse(content);
              console.log("   JSON keys:", Object.keys(jsonData));

              if (jsonData.messages && Array.isArray(jsonData.messages)) {
                const pathMatch = path.match(/inbox\/([^\/]+)\//);
                const conversationName = jsonData.title || (pathMatch ? decodeURIComponent(pathMatch[1]).replace(/_/g, ' ') : "Unknown");

                const messages = jsonData.messages.slice(0, 100).map(msg => ({
                  sender: msg.sender_name || "Unknown",
                  text: msg.content || "",
                  timestamp: msg.timestamp_ms ? new Date(msg.timestamp_ms).toLocaleString() : ""
                })).filter(msg => msg.text.length > 0);

                if (messages.length > 0) {
                  data.messages.push({ conversation_with: conversationName, messages });
                  console.log(`   ✅ Extracted ${messages.length} messages for: ${conversationName}`);
                }
              }
            } catch (e) {
              console.log("   ⚠️ Failed to parse:", e.message);
            }
          }

          // Photos - look for your_photos.html or any photo-related files
          if (path.toLowerCase().includes("photo") && !path.toLowerCase().includes("review") && (path.endsWith(".html") || path.endsWith(".json"))) {
            console.log("🔍 PHOTOS FILE:", path);
            console.log("   FULL CONTENT:", content);

            if (path.endsWith(".json")) {
              try {
                const jsonData = JSON.parse(content);
                console.log("   JSON structure:", JSON.stringify(jsonData, null, 2).substring(0, 1000));

                const photosList = jsonData.photos || jsonData.photo_album || [];
                if (Array.isArray(photosList)) {
                  photosList.forEach(photo => {
                    data.photos.push({
                      description: photo.title || photo.description || photo.uri || "Photo",
                      timestamp: photo.creation_timestamp ? new Date(photo.creation_timestamp * 1000).toLocaleDateString() : ""
                    });
                  });
                  console.log(`   ✅ Extracted ${photosList.length} photos from JSON`);
                }
              } catch (e) {
                console.log("   ⚠️ Failed to parse:", e.message);
              }
            } else {
              // HTML - extract ALL links and text
              const allLinks = content.match(/<a[^>]*>([^<]+)<\/a>/gi) || [];
              console.log(`   Found ${allLinks.length} links in HTML`);

              allLinks.forEach((link, idx) => {
                const text = parseHTML(link);
                console.log(`   Photo ${idx}: "${text}"`);
                if (text.length > 3 && text.length < 200) {
                  data.photos.push({ description: text, timestamp: "" });
                }
              });

              console.log(`   ✅ Extracted ${data.photos.length} total photos`);
            }
          }

          // Videos/Movies - look for video files or video metadata
          if ((path.match(/\.(mp4|mov|avi)$/i) || path.toLowerCase().includes("video")) && (path.endsWith(".html") || path.endsWith(".json"))) {
            console.log("🎬 VIDEO FILE:", path);
            console.log("   First 1000 chars:", content.substring(0, 1000));

            if (path.endsWith(".json")) {
              try {
                const jsonData = JSON.parse(content);
                const videosList = jsonData.videos || jsonData.videos_v2 || [];
                if (Array.isArray(videosList)) {
                  videosList.forEach(video => {
                    data.videos.push({
                      description: video.title || video.description || "Video",
                      timestamp: video.creation_timestamp ? new Date(video.creation_timestamp * 1000).toLocaleDateString() : ""
                    });
                  });
                }
              } catch (e) {
                console.log("   Failed to parse video JSON");
              }
            }
          }

          // Comments - try both JSON and HTML formats
          if (path.includes("comments") && (path.endsWith(".html") || path.endsWith(".json"))) {
            console.log("🔍 COMMENTS FILE:", path);
            console.log("   Content preview:", content.substring(0, 500));
            
            if (path.endsWith(".json")) {
              try {
                const jsonData = JSON.parse(content);
                console.log("   JSON structure:", JSON.stringify(jsonData).substring(0, 300));
                
                const commentsList = jsonData.comments || jsonData.comments_v2 || [];
                if (Array.isArray(commentsList)) {
                  commentsList.forEach(comment => {
                    const text = comment.comment || comment.data?.[0]?.comment?.comment || "";
                    if (text.length > 0) {
                      data.comments.push({
                        text: text.substring(0, 300),
                        timestamp: comment.timestamp ? new Date(comment.timestamp * 1000).toLocaleDateString() : "",
                        on_post_by: ""
                      });
                    }
                  });
                  console.log(`   ✅ Extracted ${commentsList.length} comments from JSON`);
                } else {
                  console.log("   ❌ No comments array found in JSON");
                }
              } catch (e) {
                console.log("   ⚠️ Failed to parse comments JSON:", e.message);
              }
            } else {
              // HTML format - extract any text content
              let extracted = 0;
              const allText = parseHTML(content);
              const chunks = allText.split(/\n/).filter(c => c.trim().length > 10);
              
              chunks.slice(0, 100).forEach(chunk => {
                data.comments.push({
                  text: chunk.trim().substring(0, 300),
                  timestamp: "",
                  on_post_by: ""
                });
                extracted++;
              });
              
              console.log(`   ✅ Extracted ${extracted} comments from HTML`);
            }
          }

          // Likes and reactions - check your_facebook_activity/likes_and_reactions/
          if ((path.includes("likes_and_reactions") || path.includes("reactions_and_likes")) && path.endsWith(".html") && !path.includes("no-data")) {
            const likeMatches = content.split(/<div[^>]*>/gi);
            for (const chunk of likeMatches) {
              const linkMatch = chunk.match(/>([^<]+)<\/a>/);
              if (linkMatch && chunk.length > 20 && chunk.length < 1000) {
                const text = parseHTML(chunk);
                const timestamp = extractTimestamp(chunk);
                if (linkMatch[1].trim().length > 2) {
                  data.likes.push({ item: linkMatch[1].trim(), timestamp });
                }
              }
            }
          }

          // Check-ins - check your_facebook_activity/your_places/ or location_history/
          if ((path.includes("your_places") || path.includes("check") || path.includes("location")) && path.endsWith(".html") && !path.includes("no-data")) {
            const locationMatches = content.split(/<div[^>]*>/gi);
            for (const chunk of locationMatches) {
              if (chunk.length > 30 && chunk.length < 2000) {
                const text = parseHTML(chunk);
                const timestamp = extractTimestamp(chunk);
                if (text.length > 15 && text.length < 500 && (chunk.includes("checked in") || chunk.includes("location") || path.includes("places"))) {
                  data.checkins.push({ location: text.substring(0, 200), timestamp });
                }
              }
            }
          }

          // Events - check your_facebook_activity/events/
          if (path.includes("events") && path.endsWith(".html") && !path.includes("no-data")) {
            const eventSections = content.split(/<div[^>]*>/gi);
            for (const section of eventSections) {
              const linkMatch = section.match(/>([^<]+)<\/a>/);
              if (linkMatch && section.length > 20 && section.length < 1500) {
                const eventName = linkMatch[1].trim();
                const timestamp = extractTimestamp(section);
                if (eventName.length > 2 && eventName.length < 200 && !eventName.includes("@") && !eventName.includes("http")) {
                  data.events.push({ name: eventName, timestamp });
                }
              }
            }
          }

          // Reviews - extract from reviews HTML/JSON files
          if (path.includes("review") && (path.endsWith(".html") || path.endsWith(".json"))) {
            console.log("🔍 REVIEWS FILE:", path);
            console.log("   First 1200 chars:", content.substring(0, 1200));

            if (path.endsWith(".json")) {
              try {
                const jsonData = JSON.parse(content);
                const reviewsList = jsonData.reviews || jsonData.ratings_and_reviews || [];
                reviewsList.forEach(review => {
                  const text = review.text || review.review || review.title || "";
                  if (text.length > 5) {
                    data.reviews.push({
                      text: text,
                      timestamp: review.timestamp ? new Date(review.timestamp * 1000).toLocaleDateString() : ""
                    });
                  }
                });
                console.log(`   ✅ Extracted ${reviewsList.length} reviews from JSON`);
              } catch (e) {
                console.log("   ⚠️ Failed to parse:", e.message);
              }
            } else {
              // HTML - look for actual review text in divs/paragraphs
              const reviewMatches = content.match(/<div[^>]*class="[^"]*review[^"]*"[^>]*>[\s\S]{50,2000}?<\/div>/gi) || 
                                   content.match(/<p[^>]*>[\s\S]{30,1000}?<\/p>/gi) || [];
              let extracted = 0;

              reviewMatches.forEach(match => {
                const text = parseHTML(match);
                // Look for actual review content (longer text, not metadata)
                if (text.length > 30 && text.length < 1000 && !text.match(/^(disabled|false|true|name|rating)$/i)) {
                  data.reviews.push({ text: text.substring(0, 400), timestamp: extractTimestamp(match) });
                  extracted++;
                }
              });

              console.log(`   ✅ Extracted ${extracted} reviews from HTML`);
            }
          }

          // Groups - check your_facebook_activity/groups/ or connections/groups/
          if (path.includes("groups") && path.endsWith(".html") && !path.includes("no-data")) {
            const groupMatches = content.split(/<div[^>]*>/gi);
            for (const chunk of groupMatches) {
              const linkMatch = chunk.match(/>([^<]+)<\/a>/);
              if (linkMatch && chunk.length > 15 && chunk.length < 800) {
                const groupName = linkMatch[1].trim();
                if (groupName.length > 2 && groupName.length < 150 && !groupName.includes("@") && !groupName.includes("http")) {
                  data.groups.push({ name: groupName });
                }
              }
            }
          }

          // Reels - check your_facebook_activity/reels/
          if (path.includes("reels") && (path.endsWith(".html") || path.endsWith(".json")) && !path.includes("no-data")) {
            console.log("🔍 REELS FILE:", path);
            console.log("   Content preview:", content.substring(0, 500));
            
            if (path.endsWith(".json")) {
              try {
                const jsonData = JSON.parse(content);
                console.log("   JSON structure:", JSON.stringify(jsonData).substring(0, 300));
                
                const reelsList = jsonData.videos_v2 || jsonData.videos || jsonData.reels || [];
                if (Array.isArray(reelsList)) {
                  reelsList.forEach(reel => {
                    const description = reel.title || reel.description || reel.uri || "Reel video";
                    data.reels.push({
                      text: description,
                      timestamp: reel.creation_timestamp ? new Date(reel.creation_timestamp * 1000).toLocaleDateString() : ""
                    });
                  });
                  console.log(`   ✅ Extracted ${reelsList.length} reels from JSON`);
                } else {
                  console.log("   ❌ No reels array found in JSON");
                }
              } catch (e) {
                console.log("   ⚠️ Failed to parse reels JSON:", e.message);
              }
            } else {
              // HTML format
              const reelSections = content.split(/<div[^>]*>/gi);
              let extracted = 0;
              for (const section of reelSections) {
                if (section.length > 40 && section.length < 2000) {
                  const text = parseHTML(section);
                  const timestamp = extractTimestamp(section);
                  if (text.length > 20 && text.length < 600) {
                    data.reels.push({ text: text.substring(0, 400), timestamp });
                    extracted++;
                  }
                }
              }
              console.log(`   ✅ Extracted ${extracted} reels from HTML`);
            }
          }

        } catch (err) {
          console.error(`Error processing ${path}:`, err);
        }
      }

      console.log("========================================");
      console.log("EXTRACTION COMPLETE!");
      console.log("========================================");
      console.log("Profile:", data.profile);
      console.log("Posts:", data.posts.length);
      console.log("Friends:", data.friends.length);
      console.log("CONVERSATIONS:", data.messages.length);
      console.log("Photos:", data.photos.length);
      console.log("Videos:", data.videos.length);
      console.log("Comments:", data.comments.length);
      console.log("Reels:", data.reels.length);
      console.log("Check-ins:", data.checkins.length);
      console.log("Likes:", data.likes.length);
      console.log("Events:", data.events.length);
      console.log("Reviews:", data.reviews.length);
      console.log("Groups:", data.groups.length);
      console.log("========================================");

      if (data.messages.length > 0) {
        console.log("First conversation:", data.messages[0]);
      }
      setExtractedData(data);
      
      // Mark archive as organized after successful extraction
      if (onExtractionComplete) {
        onExtractionComplete();
      }

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