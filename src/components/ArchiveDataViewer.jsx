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
        marketplace: [],
        photoFiles: {}, // ALL image files as data URLs
        videoFiles: {}, // ALL video files as blob URLs
        // NEW: Store ALL extracted content organized by category
        allData: {}  // Structure: { category: { subcategory: [items] } }
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

      const extractPrice = (html) => {
        const priceMatch = html.match(/\$[\d,]+(?:\.\d{2})?|€[\d,]+(?:\.\d{2})?|£[\d,]+(?:\.\d{2})?/);
        return priceMatch ? priceMatch[0] : null;
      };

      const extractRating = (html) => {
        const ratingMatch = html.match(/(\d+(?:\.\d+)?)\s*(?:stars?|★|⭐)/i);
        return ratingMatch ? parseFloat(ratingMatch[1]) : null;
      };

      // Advanced HTML parser - extracts ALL structured content from Facebook archive HTML
      const extractStructuredData = (html, path) => {
        const results = [];
        
        // Extract all article elements (Facebook uses <article> for content blocks)
        const articles = html.match(/<article[^>]*>[\s\S]*?<\/article>/gi) || [];
        articles.forEach(article => {
          const header = article.match(/<h3[^>]*id="[^"]*"[^>]*>([^<]+)<\/h3>/);
          const paragraphs = article.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
          const links = article.match(/<a[^>]*href="[^"]*"[^>]*>([^<]+)<\/a>/gi) || [];
          const divText = article.match(/<div[^>]*>([^<]+)<\/div>/gi) || [];
          
          const content = {
            title: header ? header[1] : '',
            text: paragraphs.map(p => p.replace(/<[^>]+>/g, '').trim()).filter(t => t.length > 0),
            links: links.map(l => l.replace(/<[^>]+>/g, '').trim()).filter(t => t.length > 0),
            divs: divText.map(d => d.replace(/<[^>]+>/g, '').trim()).filter(t => t.length > 0),
          };
          
          if (content.title || content.text.length > 0 || content.links.length > 0) {
            results.push(content);
          }
        });
        
        // Extract from tables
        const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) || [];
        tables.forEach(table => {
          const rows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
          rows.forEach(row => {
            const cells = row.match(/<t[dh][^>]*>([^<]*(?:<[^>]+>[^<]*)*)<\/t[dh]>/gi) || [];
            const rowData = cells.map(cell => {
              return cell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            }).filter(text => text.length > 0);
            
            if (rowData.length > 0) {
              results.push({ table_row: rowData });
            }
          });
        });
        
        // Extract from divs with content
        const contentDivs = html.match(/<div[^>]*class="[^"]*_a6[^"]*"[^>]*>[\s\S]*?<\/div>/gi) || [];
        contentDivs.forEach(div => {
          const text = parseHTML(div);
          if (text.length > 10 && text.length < 1000) {
            results.push({ div_content: text });
          }
        });
        
        return results;
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
          
          // Determine category from path
          const pathParts = path.split('/');
          const category = pathParts[0];
          const subcategory = pathParts.length > 1 ? pathParts[1] : '';
          
          // Initialize category storage
          if (!data.allData[category]) {
            data.allData[category] = {};
          }
          if (subcategory && !data.allData[category][subcategory]) {
            data.allData[category][subcategory] = [];
          }

          // ============ EXTRACT FROM ALL HTML FILES ============
          if (path.endsWith(".html")) {
            // Extract profile info from any HTML (usually start_here.html)
            const generatedByMatch = content.match(/Generated by ([^<\n]+) on/i);
            if (generatedByMatch && !data.profile.name) {
              data.profile.name = generatedByMatch[1].trim();
              console.log(`✅ Found profile name: ${data.profile.name}`);
            }

            // Extract email
            const emailMatch = content.match(/[\w\.-]+@[\w\.-]+\.\w+/);
            if (emailMatch && !data.profile.email) {
              data.profile.email = emailMatch[0];
              console.log(`✅ Found email: ${data.profile.email}`);
            }

            // Parse all HTML tables and content
            const tables = content.match(/<table[^>]*>[\s\S]*?<\/table>/gi) || [];
            const rows = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

            // Extract structured data from tables
            tables.concat(rows).forEach((tableStr) => {
              const cells = tableStr.match(/<td[^>]*>([^<]*)<\/td>/gi) || [];

              if (cells.length > 0) {
                const rowData = cells.map(cell => 
                  cell.replace(/<[^>]+>/g, '').trim().substring(0, 200)
                ).filter(text => text.length > 0);

                // Categorize data by folder structure
                if (path.includes('profile_information') && rowData.length > 0) {
                  if (!data.profileInfo) data.profileInfo = [];
                  data.profileInfo.push({ fields: rowData, path });
                } else if (path.includes('friends') && rowData.length > 0) {
                  if (!data.friendsData) data.friendsData = [];
                  rowData.forEach(name => {
                    if (name.length > 2 && !name.match(/^(false|true|disabled)$/i)) {
                      data.friends.push({ name, date_added: "" });
                    }
                  });
                } else if (path.includes('security') && rowData.length > 0) {
                  if (!data.securityInfo) data.securityInfo = [];
                  data.securityInfo.push({ fields: rowData, path });
                } else if (path.includes('preferences') && rowData.length > 0) {
                  if (!data.preferencesData) data.preferencesData = [];
                  data.preferencesData.push({ fields: rowData, path });
                } else if (path.includes('ads_information') && rowData.length > 0) {
                  if (!data.adsData) data.adsData = [];
                  data.adsData.push({ fields: rowData, path });
                }
              }
            });

            // Also extract all anchor text as potential data points
            const links = content.match(/<a[^>]*href="[^"]*"[^>]*>([^<]+)<\/a>/gi) || [];
            links.forEach(link => {
              const text = link.replace(/<[^>]+>/g, '').trim();
              if (text.length > 3 && text.length < 150) {
                if (path.includes('friends')) {
                  data.friends.push({ name: text, date_added: "" });
                }
              }
            });
          }

          // ============ POSTS ============
          if (path.includes('post') && path.endsWith(".html")) {
            console.log("📝 POSTS FILE:", path);
            const postsPhotos = Object.keys(data.photoFiles)
              .filter(p => p.includes('posts') || p.includes('media'))
              .map(path => data.photoFiles[path]);

            // Try to parse structured post data
            const postSections = content.split(/<div[^>]*class="[^"]*pam[^"]*"[^>]*>/gi);

            postSections.forEach((section, idx) => {
              if (section.length < 100) return;

              const text = parseHTML(section.substring(0, 2000));
              if (text.length < 10) return;

              const timestamp = extractTimestamp(section);

              // Extract reactions (likes, loves, etc)
              const reactions = [];
              const reactionMatch = section.match(/(\d+)\s*(like|love|haha|wow|sad|angry)/gi);
              let totalReactions = 0;
              if (reactionMatch) {
                reactionMatch.forEach(r => {
                  const count = parseInt(r.match(/\d+/)?.[0] || 0);
                  totalReactions += count;
                  reactions.push(r);
                });
              }

              // Extract comments from the same section
              const comments = [];
              const commentMatches = section.match(/<div[^>]*comment[^>]*>[\s\S]{20,800}?<\/div>/gi) || [];
              commentMatches.forEach(commentHtml => {
                const commentText = parseHTML(commentHtml);
                if (commentText.length > 10 && commentText.length < 500) {
                  const commenter = commentHtml.match(/<a[^>]*>([^<]{3,50})<\/a>/)?.[1] || "Someone";
                  comments.push({
                    author: commenter,
                    text: commentText,
                    timestamp: extractTimestamp(commentHtml)
                  });
                }
              });

              const photoUrl = postsPhotos[data.posts.length] || null;

              data.posts.push({
                text: text.substring(0, 500),
                timestamp,
                reactions,
                likes_count: totalReactions,
                comments_count: comments.length,
                comments,
                photo_url: photoUrl
              });
            });

            console.log(`   ✅ Added ${data.posts.length} posts with comments and reactions`);
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
                  console.log(`   ✅ Added ${friendsList.length} friends from JSON`);
                }
              } catch (e) {
                console.error("   ❌ Failed to parse friends JSON:", e.message);
              }
            } else {
              // Parse HTML for friends - Extract from table structures
              let count = 0;

              // Common UI labels to exclude
              const excludedLabels = new Set([
                'name', 'friend', 'friends', 'restricted', 'close friends', 'close', 
                'acquaintances', 'acquaintance', 'date', 'privacy', 'settings', 
                'notification', 'disabled', 'false', 'true', 'following', 'followers',
                'list', 'remove', 'unfriend', 'block', 'add', 'hidden', 'hidden from timeline',
                'r', 'c', 'a', 'd', 'f', 'n', 'e', // single letters
              ]);

              // Extract from <a> tags with href (profile links)
              const linkMatches = content.match(/<a[^>]*href="[^"]*"[^>]*>([^<]+)<\/a>/gi) || [];
              const foundNames = new Set();

              linkMatches.forEach(link => {
                const name = link.replace(/<[^>]+>/g, '').trim();
                const nameLower = name.toLowerCase();

                // Real names have multiple words (first + last name) and aren't UI labels
                const hasMultipleWords = name.split(/\s+/).length >= 2;
                const isNotLabel = !excludedLabels.has(nameLower) && 
                                  !nameLower.match(/^(name|friend|restricted|close|acquaintance|date|privacy|terms|cookies|settings|help|disabled|false|true|following|followers|remove|unfriend|block|add|hidden)/i);

                if (name.length >= 5 && name.length < 100 && hasMultipleWords && isNotLabel && !foundNames.has(nameLower)) {
                  data.friends.push({ name, date_added: "", source: path });
                  foundNames.add(nameLower);
                  count++;
                }
              });

              // Also extract from table cells that contain names
              const tableRows = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
              tableRows.forEach(row => {
                const cells = row.match(/<t[dh][^>]*>([^<]*)<\/t[dh]>/gi) || [];
                cells.forEach((cell, idx) => {
                  const cellText = cell.replace(/<[^>]+>/g, '').trim();
                  const cellLower = cellText.toLowerCase();

                  // Look for cells with multiple words that aren't labels
                  if (cellText.length >= 5 && 
                      cellText.length < 100 &&
                      cellText.split(/\s+/).length >= 2 &&
                      !excludedLabels.has(cellLower) &&
                      !cellLower.match(/^(name|friend|restricted|close|acquaintance|date|privacy|disabled|false|true|remove|unfriend)/i) &&
                      !foundNames.has(cellLower)) {
                    data.friends.push({ name: cellText, date_added: "", source: path });
                    foundNames.add(cellLower);
                    count++;
                  }
                });
              });

              console.log(`   ✅ Added ${count} friends from HTML (${path})`);
            }
          }

          // ============ MESSAGES - READ ALL JSON FILES IN MESSAGES/INBOX FOLDERS ============
          if ((path.includes('message') || path.includes('inbox')) && path.endsWith('.json')) {
            console.log("📨 FOUND MESSAGE JSON:", path);
            try {
              const jsonData = JSON.parse(content);
              console.log("   JSON keys:", Object.keys(jsonData));
              console.log("   Has messages array?", Array.isArray(jsonData.messages));
              console.log("   Messages count:", jsonData.messages?.length || 0);

              if (jsonData.messages && Array.isArray(jsonData.messages)) {
                // Get conversation name from JSON title or folder path
                const pathMatch = path.match(/inbox\/([^\/]+)\//);
                const conversationName = jsonData.title || (pathMatch ? decodeURIComponent(pathMatch[1]).replace(/_/g, ' ') : "Unknown");

                // Extract ALL messages (no limit)
                const messages = jsonData.messages.map(msg => ({
                  sender: msg.sender_name || "Unknown",
                  text: msg.content || "",
                  timestamp: msg.timestamp_ms ? new Date(msg.timestamp_ms).toLocaleString() : "",
                  timestamp_ms: msg.timestamp_ms || 0
                })).filter(msg => msg.text && msg.text.length > 0);

                if (messages.length > 0) {
                  // Get the most recent message timestamp (Facebook stores newest first)
                  const lastMessageTimestamp = messages[0].timestamp_ms;

                  data.messages.push({ 
                    conversation_with: conversationName, 
                    messages,
                    lastMessageTimestamp,
                    totalMessages: messages.length
                  });
                  console.log(`   ✅ Added conversation: ${conversationName} (${messages.length} messages, last: ${new Date(lastMessageTimestamp).toLocaleString()})`);
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

          // ============ LIKES (Things you liked - pages, posts, videos, etc.) ============
          if (path.includes('like') && path.endsWith('.html')) {
            console.log("👍 LIKES FILE:", path);
            const structuredData = extractStructuredData(content, path);
            let count = 0;

            structuredData.forEach(item => {
              if (item.title) {
                const type = item.title.match(/\b(page|post|video|photo|comment)\b/i)?.[1] || 'item';
                data.likes.push({
                  item: item.title,
                  type,
                  details: item.text.join(' ').substring(0, 200),
                  timestamp: extractTimestamp(content)
                });
                count++;
              }

              if (item.links) {
                item.links.forEach(linkText => {
                  if (linkText.length > 2 && linkText.length < 200) {
                    data.likes.push({
                      item: linkText,
                      type: 'page',
                      timestamp: extractTimestamp(content)
                    });
                    count++;
                  }
                });
              }
            });

            console.log(`   ✅ Added ${count} liked items (pages, posts, etc.)`);
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
            console.log("📅 EVENTS FILE:", path);
            const structuredData = extractStructuredData(content, path);
            let count = 0;

            structuredData.forEach(item => {
              if (item.title) {
                const details = item.text.join(' ');
                const rsvp = details.match(/\b(going|interested|maybe|not going|hosted?|invited)\b/i)?.[1] || null;
                const location = details.match(/(?:at|@)\s+([^,\n]{5,100})/i)?.[1] || null;

                const eventData = {
                  name: item.title,
                  details,
                  rsvp,
                  location,
                  timestamp: extractTimestamp(content),
                  source: path
                };
                data.events.push(eventData);
                count++;
              }

              if (item.table_row) {
                const rowText = item.table_row.join(' ');
                if (rowText.length > 10 && rowText.length < 500) {
                  const rsvp = rowText.match(/\b(going|interested|maybe|not going|hosted?|invited)\b/i)?.[1] || null;

                  data.events.push({
                    name: item.table_row[0] || 'Event',
                    details: rowText,
                    rsvp,
                    timestamp: extractTimestamp(rowText),
                    source: path
                  });
                  count++;
                }
              }
            });

            console.log(`   ✅ Added ${count} events with RSVP status`);
          }

          // ============ REVIEWS ============
          if (path.includes('review') && path.endsWith('.html')) {
            console.log("⭐ REVIEWS FILE:", path);
            const structuredData = extractStructuredData(content, path);
            let count = 0;

            structuredData.forEach(item => {
              if (item.title || (item.text && item.text.length > 0)) {
                const reviewText = item.text.join(' ');
                if (reviewText.length > 10) {
                  const rating = extractRating(reviewText) || extractRating(content);
                  const place = item.title || item.links?.[0] || '';

                  data.reviews.push({
                    place,
                    text: reviewText.substring(0, 500),
                    rating,
                    timestamp: extractTimestamp(content),
                    source: path
                  });
                  count++;
                }
              }

              if (item.table_row) {
                const rowText = item.table_row.join(' ');
                if (rowText.length > 10) {
                  const rating = extractRating(rowText);

                  data.reviews.push({
                    text: rowText.substring(0, 500),
                    rating,
                    timestamp: extractTimestamp(rowText),
                    source: path
                  });
                  count++;
                }
              }
            });

            console.log(`   ✅ Added ${count} reviews with ratings`);
          }

          // ============ GROUPS ============
          if (path.includes('group') && path.endsWith('.html')) {
            console.log("👥 GROUPS FILE:", path);
            const structuredData = extractStructuredData(content, path);
            let count = 0;

            structuredData.forEach(item => {
              if (item.title) {
                const groupName = item.title.trim();
                if (groupName.length > 2 && groupName.length < 200) {
                  data.groups.push({ 
                    name: groupName,
                    details: item.text.join(' ').substring(0, 200),
                    source: path
                  });
                  count++;
                }
              }

              if (item.table_row) {
                item.table_row.forEach(cellText => {
                  const groupName = cellText.trim();
                  if (groupName.length > 3 && groupName.length < 200 &&
                      !groupName.match(/^(Group|Name|Date|Privacy|Type|Notification|Settings)$/i)) {
                    data.groups.push({ 
                      name: groupName,
                      source: path
                    });
                    count++;
                  }
                });
              }

              if (item.links) {
                item.links.forEach(linkText => {
                  const groupName = linkText.trim();
                  if (groupName.length > 3 && groupName.length < 200 &&
                      !groupName.match(/^(Group|Name|Date|Privacy|Terms|Cookies)$/i)) {
                    data.groups.push({ 
                      name: groupName,
                      source: path
                    });
                    count++;
                  }
                });
              }
            });

            // Fallback: also try basic link extraction
            const linkMatches = content.match(/<a[^>]*>([^<]+)<\/a>/gi) || [];
            linkMatches.forEach(link => {
              const groupName = link.replace(/<[^>]+>/g, '').trim();
              if (groupName.length > 3 && groupName.length < 200 &&
                  !groupName.match(/^(Group|Name|Date|Privacy|Terms|Cookies|disabled|false|true)$/i)) {
                data.groups.push({ 
                  name: groupName,
                  source: path
                });
                count++;
              }
            });

            console.log(`   ✅ Added ${count} groups from ${path}`);
          }

          // ============ MARKETPLACE ============
          if (path.includes('marketplace') && path.endsWith('.html')) {
            console.log("🛒 MARKETPLACE FILE:", path);
            const structuredData = extractStructuredData(content, path);
            let count = 0;

            structuredData.forEach(item => {
              if (item.title || (item.text && item.text.length > 0)) {
                const itemText = item.text.join(' ');
                if (itemText.length > 5) {
                  const price = extractPrice(itemText) || extractPrice(content);
                  const status = itemText.match(/\b(sold|available|pending|deleted)\b/i)?.[1] || "unknown";

                  data.marketplace.push({
                    title: item.title || '',
                    text: itemText.substring(0, 500),
                    price,
                    status,
                    links: item.links,
                    timestamp: extractTimestamp(content),
                    source: path
                  });
                  count++;
                }
              }

              if (item.table_row) {
                const rowText = item.table_row.join(' ');
                if (rowText.length > 5) {
                  const price = extractPrice(rowText);
                  const status = rowText.match(/\b(sold|available|pending|deleted)\b/i)?.[1] || "unknown";

                  data.marketplace.push({
                    text: rowText.substring(0, 500),
                    price,
                    status,
                    timestamp: extractTimestamp(rowText),
                    source: path
                  });
                  count++;
                }
              }
            });

            console.log(`   ✅ Added ${count} marketplace items with prices`);
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

      // Deduplicate data
      data.friends = [...new Map(data.friends.map(f => [f.name.toLowerCase(), f])).values()];
      data.events = [...new Map(data.events.map(e => [e.name.toLowerCase(), e])).values()];
      data.reviews = [...new Map(data.reviews.map((r, i) => [r.text.substring(0, 50), r])).values()];
      
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
      console.log("Marketplace:", data.marketplace.length);
      console.log("All Categories:", Object.keys(data.allData));
      console.log("========================================\n");
      
      // Sort conversations by the most recent message
      data.messages.sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));

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

  return <FacebookViewer data={extractedData} />;
}