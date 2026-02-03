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
        photoFiles: {}, // ALL image files as data URLs
        videoFiles: {}  // ALL video files as blob URLs
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

      // First pass - extract ALL media files (images and videos)
      console.log("\n🎬 LOADING MEDIA FILES...");
      for (const [path, file] of Object.entries(zip.files)) {
        if (file.dir) continue;

        // Load image files
        if (path.match(/\.(jpg|jpeg|png|gif|webp)$/i) && !path.includes('icon')) {
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

        // Load video files
        if (path.match(/\.(mp4|mov|avi|webm|mkv)$/i)) {
          try {
            const blob = await file.async("blob");
            const blobUrl = URL.createObjectURL(blob);
            data.videoFiles[path] = blobUrl;
            console.log(`📹 Loaded video: ${path}`);
          } catch (err) {
            console.error(`Error loading video ${path}:`, err);
          }
        }
      }

      console.log(`✅ Loaded ${Object.keys(data.photoFiles).length} photos and ${Object.keys(data.videoFiles).length} videos`);

      // Second pass - extract text content and metadata
      console.log("\n📝 EXTRACTING TEXT CONTENT...\n");
      
      for (const [path, file] of Object.entries(zip.files)) {
        if (file.dir) continue;

        try {
          const content = await file.async("text");

          // ============ PROFILE DATA ============
          if (path.endsWith(".html") && !data.profile.name) {
            const generatedByMatch = content.match(/Generated by ([^<\n]+) on/i);
            if (generatedByMatch) {
              data.profile.name = generatedByMatch[1].trim();
              console.log(`✅ Found profile name: ${data.profile.name}`);
            }
          }
          if (path.endsWith(".html") && !data.profile.email) {
            const emailMatch = content.match(/[\w\.-]+@[\w\.-]+\.\w+/);
            if (emailMatch) {
              data.profile.email = emailMatch[0];
              console.log(`✅ Found email: ${data.profile.email}`);
            }
          }

          // ============ POSTS ============
          if (path.includes('post') && path.endsWith(".html")) {
            let postMatches = content.split(/<div[^>]*>/gi).filter(chunk => chunk.length > 100);
            const postsPhotos = Object.keys(data.photoFiles)
              .filter(p => p.includes('posts') || p.includes('media'))
              .map(path => data.photoFiles[path]);

            for (let i = 0; i < Math.min(postMatches.length, 100); i++) {
              const postHtml = postMatches[i];
              const text = parseHTML(postHtml.substring(0, 2000));
              const timestamp = extractTimestamp(postHtml);

              if (text.length > 10) {
                const photoUrl = postsPhotos[data.posts.length] || null;
                data.posts.push({
                  text: text.substring(0, 500),
                  timestamp,
                  likes_count: 0,
                  comments_count: 0,
                  photo_url: photoUrl
                });
              }
            }
          }

          // ============ FRIENDS ============
          if (path.includes('friend') && (path.endsWith('.html') || path.endsWith('.json'))) {
            console.log("👥 FRIENDS FILE:", path);
            
            if (path.endsWith('.json')) {
              try {
                const jsonData = JSON.parse(content);
                const friendsList = jsonData.friends_v2 || jsonData.friends || [];
                if (Array.isArray(friendsList)) {
                  friendsList.forEach(friend => {
                    const name = friend.name || friend.title || "";
                    if (name.length > 2) {
                      data.friends.push({ 
                        name, 
                        date_added: friend.timestamp ? new Date(friend.timestamp * 1000).toLocaleDateString() : ""
                      });
                    }
                  });
                  console.log(`   ✅ Added ${friendsList.length} friends`);
                }
              } catch (e) {}
            } else {
              const linkMatches = content.match(/<a[^>]*>([^<]+)<\/a>/gi) || [];
              let count = 0;
              linkMatches.forEach(link => {
                const nameMatch = link.match(/>([^<]+)</);
                if (nameMatch) {
                  const name = nameMatch[1].trim();
                  if (name.length >= 3 && name.length < 50 &&
                      !name.match(/^(disabled|false|true|name|restricted|close|friend)$/i)) {
                    data.friends.push({ name, date_added: "" });
                    count++;
                  }
                }
              });
              console.log(`   ✅ Added ${count} friends from HTML`);
            }
          }

          // ============ MESSAGES ============
          // Look for ANY json file in inbox folders
          if (path.includes('inbox') && path.endsWith('.json')) {
            console.log("📨 FOUND POTENTIAL CONVERSATION:", path);
            try {
              const jsonData = JSON.parse(content);
              console.log("   JSON keys:", Object.keys(jsonData));
              console.log("   Has messages array?", Array.isArray(jsonData.messages));
              console.log("   Messages count:", jsonData.messages?.length || 0);
              
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
                  console.log(`   ✅ Added conversation: ${conversationName} (${messages.length} messages)`);
                } else {
                  console.log(`   ⚠️ No valid messages in conversation`);
                }
              } else {
                console.log(`   ❌ No messages array in JSON`);
              }
            } catch (e) {
              console.log("   ❌ Failed to parse JSON:", e.message);
            }
          }

          // ============ PHOTOS - Just use the actual image files ============
          // Photos are handled in first pass - we load all image files as data URLs

          // ============ VIDEOS - Just use actual video files ============
          // Videos are handled in first pass - we load all video files as blob URLs

          // ============ COMMENTS ============
          if (path.includes('comment') && path.endsWith('.html')) {
            const sections = content.split(/<div/gi);
            sections.slice(0, 100).forEach(section => {
              const text = parseHTML(section);
              if (text.length > 20 && text.length < 500) {
                const timestamp = extractTimestamp(section);
                data.comments.push({ text: text.substring(0, 300), timestamp, on_post_by: "" });
              }
            });
          }

          // ============ LIKES ============
          if (path.includes('like') && path.endsWith('.html')) {
            const linkMatches = content.match(/<a[^>]*>([^<]+)<\/a>/gi) || [];
            linkMatches.slice(0, 200).forEach(link => {
              const nameMatch = link.match(/>([^<]+)</);
              if (nameMatch) {
                const item = nameMatch[1].trim();
                if (item.length > 2 && item.length < 200) {
                  const timestamp = extractTimestamp(link);
                  data.likes.push({ item, timestamp });
                }
              }
            });
          }

          // ============ CHECK-INS ============
          if ((path.includes('check') || path.includes('place') || path.includes('location')) && path.endsWith('.html')) {
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

          // ============ EVENTS ============
          if (path.includes('event') && path.endsWith('.html')) {
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

          // ============ REVIEWS ============
          if (path.includes('review') && path.endsWith('.html')) {
            const sections = content.split(/<div/gi);
            sections.slice(0, 100).forEach(section => {
              const text = parseHTML(section);
              if (text.length > 30 && text.length < 800) {
                const timestamp = extractTimestamp(section);
                data.reviews.push({ text: text.substring(0, 400), timestamp });
              }
            });
          }

          // ============ GROUPS ============
          if (path.includes('group') && path.endsWith('.html')) {
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

          // ============ REELS ============
          if (path.includes('reel') && path.endsWith('.html')) {
            const sections = content.split(/<div/gi);
            sections.forEach(section => {
              const text = parseHTML(section);
              if (text.length > 20 && text.length < 500) {
                const timestamp = extractTimestamp(section);
                data.reels.push({ text: text.substring(0, 400), timestamp });
              }
            });
          }

        } catch (err) {
          console.error(`Error processing ${path}:`, err);
        }
      }

      console.log("\n========================================");
      console.log("✅ EXTRACTION COMPLETE!");
      console.log("========================================");
      console.log("Profile:", data.profile);
      console.log("Posts:", data.posts.length);
      console.log("Friends:", data.friends.length);
      console.log("Conversations:", data.messages.length);
      console.log("Photo Files:", Object.keys(data.photoFiles).length);
      console.log("Video Files:", Object.keys(data.videoFiles).length);
      console.log("Comments:", data.comments.length);
      console.log("Reels:", data.reels.length);
      console.log("Check-ins:", data.checkins.length);
      console.log("Likes:", data.likes.length);
      console.log("Events:", data.events.length);
      console.log("Reviews:", data.reviews.length);
      console.log("Groups:", data.groups.length);
      console.log("========================================\n");
      
      // Store photo and video files directly in data for viewer
      data.photos = Object.keys(data.photoFiles);
      data.videos = Object.keys(data.videoFiles);
      
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

  return <FacebookViewer data={extractedData} photoFiles={extractedData.photoFiles} />;
}