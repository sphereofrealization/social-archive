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

      // Second pass - extract text content
      for (const [path, file] of Object.entries(zip.files)) {
        if (file.dir) continue;

        try {
          const content = await file.async("text");

          // ============ PROFILE DATA ============
          if (path.endsWith(".html") && !data.profile.name) {
            const generatedByMatch = content.match(/Generated by ([^<\n]+) on/i);
            if (generatedByMatch) {
              data.profile.name = generatedByMatch[1].trim();
            }
          }
          if (path.endsWith(".html") && !data.profile.email) {
            const emailMatch = content.match(/[\w\.-]+@[\w\.-]+\.\w+/);
            if (emailMatch) {
              data.profile.email = emailMatch[0];
            }
          }

          // ============ POSTS ============
          if (path.match(/your_facebook_activity\/posts/i) && path.endsWith(".html")) {
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

          // ============ FRIENDS ============
          if (path.match(/friends_and_followers\/friends\.html$/i) || path.match(/connections\/friends/i)) {
            const linkMatches = content.match(/<a[^>]*>([^<]+)<\/a>/gi) || [];
            linkMatches.forEach(link => {
              const nameMatch = link.match(/>([^<]+)</);
              if (nameMatch) {
                const name = nameMatch[1].trim();
                if ((name.includes(" ") || (name.match(/[A-Z]/) && name.match(/[a-z]/))) && 
                    name.length >= 3 && name.length < 50 &&
                    !name.match(/^(disabled|false|true|name|restricted|close|acquaintances|following|friends)$/i)) {
                  data.friends.push({ name, date_added: "" });
                }
              }
            });
          }

          // ============ MESSAGES ============
          if (path.match(/messages\/inbox\/[^\/]+\/message_\d+\.json$/i)) {
            try {
              const jsonData = JSON.parse(content);
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
                }
              }
            } catch (e) {}
          }

          // ============ PHOTOS ============
          if (path.match(/photos_and_videos\/.*\.html$/i) || path.match(/your_facebook_activity\/photos/i)) {
            const sections = content.split(/<div/gi);
            sections.forEach(section => {
              const text = parseHTML(section);
              if (text.length > 10 && text.length < 300 && !text.match(/^(disabled|false|photo|album)$/i)) {
                const timestamp = extractTimestamp(section);
                data.photos.push({ description: text.substring(0, 200), timestamp });
              }
            });
          }

          // ============ VIDEOS ============
          if (path.match(/your_facebook_activity\/videos/i) || path.match(/photos_and_videos.*videos/i)) {
            if (path.endsWith(".html")) {
              const sections = content.split(/<div/gi);
              sections.forEach(section => {
                const text = parseHTML(section);
                if (text.length > 15 && text.length < 400) {
                  const timestamp = extractTimestamp(section);
                  data.videos.push({ description: text.substring(0, 300), timestamp });
                }
              });
            }
          }

          // ============ COMMENTS ============
          if (path.match(/comments_and_reactions\/comments\.html$/i) || path.match(/your_facebook_activity\/comments/i)) {
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
          if (path.match(/comments_and_reactions\/.*likes.*\.html$/i) || path.match(/your_facebook_activity\/likes/i)) {
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
          if (path.match(/your_places\/check_ins\.html$/i) || path.match(/location_history/i)) {
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
          if (path.match(/your_facebook_activity\/events/i) || path.match(/events\/.*\.html$/i)) {
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
          if (path.match(/reviews\/.*\.html$/i) || path.match(/your_facebook_activity\/reviews/i)) {
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
          if (path.match(/your_facebook_activity\/groups/i) || path.match(/connections\/groups/i)) {
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
          if (path.match(/your_facebook_activity\/reels/i) || path.match(/reels.*\.html$/i)) {
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
      console.log("Messages:", data.messages.length);
      console.log("Photos:", data.photos.length);
      console.log("Videos:", data.videos.length);
      console.log("Comments:", data.comments.length);
      console.log("Reels:", data.reels.length);
      console.log("Check-ins:", data.checkins.length);
      console.log("Likes:", data.likes.length);
      console.log("Events:", data.events.length);
      console.log("Reviews:", data.reviews.length);
      console.log("Groups:", data.groups.length);
      console.log("========================================\n");
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