import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip@3.10.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const fileUrl = body.fileUrl;
    
    if (!fileUrl) {
      return Response.json({ error: 'Missing fileUrl parameter' }, { status: 400 });
    }

    console.log("Downloading archive from:", fileUrl);
    
    // Fetch the file from public S3 bucket
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      console.error(`Fetch failed with status ${response.status}`, response.statusText);
      const errorText = await response.text();
      console.error("Error response:", errorText);
      return Response.json({ error: `Failed to fetch file: ${response.status} ${response.statusText}` }, { status: 400 });
    }
    
    const blob = await response.blob();
    console.log("Archive downloaded, size:", blob.size);

    // Load and parse the ZIP
    const zip = await JSZip.loadAsync(blob);
    
    const data = {
      profile: { name: "", email: "" },
      posts: [],
      friends: [],
      messages: [],
      photos: [],
      photoFiles: {},
      videoFiles: {},
      comments: [],
      reels: [],
      videos: [],
      checkins: [],
      likes: [],
      events: [],
      reviews: [],
      groups: [],
      marketplace: [],
      allData: {}
    };

    const parseHTML = (html) => {
      // Remove style, script, and head tags completely
      let cleaned = html
        .replace(/<head>[\s\S]*?<\/head>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

      // Strip all HTML tags but keep the text content
      cleaned = cleaned.replace(/<[^>]+>/g, ' ');

      // Clean up whitespace
      cleaned = cleaned.replace(/\s+/g, ' ').trim();

      return cleaned;
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

    const extractStructuredData = (html, path) => {
      const results = [];
      
      const articles = html.match(/<article[^>]*>[\s\S]*?<\/article>/gi) || [];
      articles.forEach(article => {
        const header = article.match(/<h3[^>]*id="[^"]*"[^>]*>([^<]+)<\/h3>/);
        const paragraphs = article.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
        const links = article.match(/<a[^>]*href="[^"]*"[^>]*>([^<]+)<\/a>/gi) || [];
        
        const content = {
          title: header ? header[1] : '',
          text: paragraphs.map(p => p.replace(/<[^>]+>/g, '').trim()).filter(t => t.length > 0),
          links: links.map(l => l.replace(/<[^>]+>/g, '').trim()).filter(t => t.length > 0),
        };
        
        if (content.title || content.text.length > 0 || content.links.length > 0) {
          results.push(content);
        }
      });
      
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
      
      return results;
    };

    // Process files based on Facebook's actual archive structure
    console.log("Extracting data from archive...");

    const files = Object.entries(zip.files).filter(([path, file]) => !file.dir);

    // First pass: Extract all images and videos from files/ directory
    for (const [path, file] of files) {
      if (path.match(/^[^\/]*\/?files\//i) && path.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
        try {
          const imageData = await file.async("base64");
          const ext = path.split('.').pop().toLowerCase();
          const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                         ext === 'png' ? 'image/png' : 
                         ext === 'gif' ? 'image/gif' : 
                         ext === 'webp' ? 'image/webp' : 'image/jpeg';
          data.photoFiles[path] = `data:${mimeType};base64,${imageData}`;
          data.photos.push({ 
            path, 
            filename: path.split('/').pop(),
            timestamp: ""
          });
        } catch (err) {
          console.error(`Failed to extract photo ${path}:`, err);
        }
      }

      if (path.match(/^[^\/]*\/?files\//i) && path.match(/\.(mp4|mov|avi|mkv|webm|m4v)$/i)) {
        try {
          const videoData = await file.async("base64");
          const ext = path.split('.').pop().toLowerCase();
          const mimeType = ext === 'mp4' ? 'video/mp4' : 
                         ext === 'webm' ? 'video/webm' : 
                         ext === 'mov' ? 'video/quicktime' : 'video/mp4';
          data.videoFiles[path] = `data:${mimeType};base64,${videoData}`;
          data.videos.push({ 
            path, 
            filename: path.split('/').pop(),
            timestamp: ""
          });
        } catch (err) {
          console.error(`Failed to extract video ${path}:`, err);
        }
      }
    }

    // Second pass: Process HTML and JSON files
    for (const [path, file] of files) {
      if (!path.endsWith('.html') && !path.endsWith('.json')) continue;

      try {
        const content = await file.async("text");

        const pathParts = path.split('/');
        const category = pathParts[0];
        const subcategory = pathParts.length > 1 ? pathParts[1] : '';

        if (!data.allData[category]) {
          data.allData[category] = {};
        }
        if (subcategory && !data.allData[category][subcategory]) {
          data.allData[category][subcategory] = [];
        }

        // PROFILE - extract from profile_information or personal_information
        if ((path.match(/personal_information|profile_information/i)) && path.endsWith(".html")) {
          const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          if (bodyMatch) {
            const bodyContent = bodyMatch[1];

            // Extract name from h1 or title
            const h1Match = bodyContent.match(/<h1[^>]*>([^<]+)<\/h1>/i);
            if (h1Match && !data.profile.name) {
              data.profile.name = h1Match[1].trim();
            }

            // Extract email
            const emailMatch = bodyContent.match(/[\w\.-]+@[\w\.-]+\.\w+/);
            if (emailMatch && !data.profile.email) {
              data.profile.email = emailMatch[0];
            }
          }
        }

        // Extract profile name from "Generated by X on Y" pattern in any HTML
        if (!data.profile.name && path.endsWith(".html")) {
          const generatedByMatch = content.match(/Generated by ([^<\n]+) on/i);
          if (generatedByMatch) {
            data.profile.name = generatedByMatch[1].trim();
          }
        }

        // POSTS - look in your_facebook_activity or posts directories
        if (path.match(/your_facebook_activity|\/posts\//i) && path.endsWith(".html") && data.posts.length < 100) {
          // Extract body content only
          const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          if (!bodyMatch) continue;

          const bodyContent = bodyMatch[1];

          // Look for div elements with content
          const divMatches = bodyContent.match(/<div[^>]*>[\s\S]*?<\/div>/gi) || [];

          for (const div of divMatches) {
            // Skip if it contains style or script
            if (div.match(/<style|<script/i)) continue;

            const text = parseHTML(div);

            // Skip CSS, empty, or very short content
            if (!text || text.length < 20 || 
                text.match(/^(html\{|body\{|font-family|background:#|color:#)/i)) {
              continue;
            }

            // Look for timestamp
            const timestamp = extractTimestamp(div);

            // Look for reactions/likes
            const reactions = [];
            const reactionMatch = div.match(/(\d+)\s*(like|love|haha|wow|sad|angry)/gi);
            let totalReactions = 0;
            if (reactionMatch) {
              reactionMatch.forEach(r => {
                const count = parseInt(r.match(/\d+/)?.[0] || 0);
                totalReactions += count;
                reactions.push(r);
              });
            }

            // Look for images in the post
            const imgMatch = div.match(/<img[^>]*src="([^"]+)"/i);
            let photo_url = null;
            if (imgMatch) {
              const imgPath = imgMatch[1];
              // Try to find this image in our photoFiles
              const matchingPhoto = Object.keys(data.photoFiles).find(p => p.includes(imgPath) || imgPath.includes(p.split('/').pop()));
              if (matchingPhoto) {
                photo_url = data.photoFiles[matchingPhoto];
              }
            }

            if (text.length >= 20) {
              data.posts.push({
                text: text.substring(0, 500),
                timestamp,
                reactions,
                likes_count: totalReactions,
                comments_count: 0,
                comments: [],
                photo_url
              });
            }
          }
        }

        // FRIENDS - specifically look for your_friends.html and friends.json
        if (path.match(/your_friends\.html|friends\.json/i)) {
          if (path.endsWith('.json')) {
            try {
              const jsonData = JSON.parse(content);
              let friendsList = [];

              if (jsonData.friends_v2) {
                friendsList = jsonData.friends_v2;
              } else if (jsonData.friends) {
                friendsList = jsonData.friends;
              } else if (Array.isArray(jsonData)) {
                friendsList = jsonData;
              }

              if (Array.isArray(friendsList) && friendsList.length > 0) {
                friendsList.forEach(friend => {
                  const name = friend.name || friend.title || "";
                  if (name.length > 2) {
                    data.friends.push({ 
                      name, 
                      date_added: friend.timestamp ? new Date(friend.timestamp * 1000).toLocaleDateString() : "",
                      source: path
                    });
                  }
                });
              }
            } catch (e) {
              console.error("Failed to parse friends JSON:", e);
            }
          } else {
            // Parse HTML friends list
            const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            if (bodyMatch) {
              const bodyContent = bodyMatch[1];

              // Look for list items or table rows with friend names
              const listItems = bodyContent.match(/<li[^>]*>([^<]+)<\/li>/gi) || [];
              listItems.forEach(item => {
                const name = item.replace(/<[^>]+>/g, '').trim();
                if (name.length >= 3 && name.length < 100 && name.match(/[a-z]/i) && 
                    !data.friends.find(f => f.name.toLowerCase() === name.toLowerCase())) {
                  data.friends.push({ name, date_added: "", source: path });
                }
              });

              // Also check table cells
              const tableCells = bodyContent.match(/<td[^>]*>([^<]+)<\/td>/gi) || [];
              tableCells.forEach(cell => {
                const name = cell.replace(/<[^>]+>/g, '').trim();
                const excludedTerms = ['name', 'friend', 'date', 'privacy', 'settings'];

                if (name.length >= 3 && name.length < 100 && 
                    name.match(/[a-z]/i) && name.match(/\s/) &&
                    !excludedTerms.includes(name.toLowerCase()) &&
                    !data.friends.find(f => f.name.toLowerCase() === name.toLowerCase())) {
                  data.friends.push({ name, date_added: "", source: path });
                }
              });
            }
          }
        }

        // MESSAGES
        if ((path.includes('message') || path.includes('inbox')) && path.endsWith('.json')) {
          try {
            const jsonData = JSON.parse(content);

            if (jsonData.messages && Array.isArray(jsonData.messages)) {
              const pathMatch = path.match(/inbox\/([^\/]+)\//);
              const conversationName = jsonData.title || (pathMatch ? decodeURIComponent(pathMatch[1]).replace(/_/g, ' ') : "Unknown");

              const messages = jsonData.messages.map(msg => ({
                sender: msg.sender_name || "Unknown",
                text: msg.content || "",
                timestamp: msg.timestamp_ms ? new Date(msg.timestamp_ms).toLocaleString() : "",
                timestamp_ms: msg.timestamp_ms || 0
              })).filter(msg => msg.text && msg.text.length > 0);

              if (messages.length > 0) {
                const lastMessageTimestamp = messages[0].timestamp_ms;

                data.messages.push({ 
                  conversation_with: conversationName, 
                  messages,
                  lastMessageTimestamp,
                  totalMessages: messages.length
                });
              }
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }

        // COMMENTS
        if (path.includes('comment') && path.endsWith('.html') && data.comments.length < 50) {
          const sections = content.split(/<div/gi);
          sections.slice(0, 30).forEach(section => {
            const text = parseHTML(section);
            if (text.length > 20 && text.length < 500) {
              const timestamp = extractTimestamp(section);
              data.comments.push({ text: text.substring(0, 300), timestamp, on_post_by: "" });
            }
          });
        }

        // LIKES
        if (path.includes('like') && path.endsWith('.html')) {
          const structuredData = extractStructuredData(content, path);

          structuredData.forEach(item => {
            if (item.title) {
              const type = item.title.match(/\b(page|post|video|photo|comment)\b/i)?.[1] || 'item';
              data.likes.push({
                item: item.title,
                type,
                details: item.text.join(' ').substring(0, 200),
                timestamp: extractTimestamp(content)
              });
            }

            if (item.links) {
              item.links.forEach(linkText => {
                if (linkText.length > 2 && linkText.length < 200) {
                  data.likes.push({
                    item: linkText,
                    type: 'page',
                    timestamp: extractTimestamp(content)
                  });
                }
              });
            }
          });
        }

        // CHECK-INS
        if ((path.includes('check') || path.includes('place') || path.includes('location')) && path.endsWith('.html') && data.checkins.length < 50) {
          const locationMatches = content.split(/<div[^>]*>/gi);
          for (const chunk of locationMatches.slice(0, 30)) {
            if (chunk.length > 30 && chunk.length < 2000) {
              const text = parseHTML(chunk);
              const timestamp = extractTimestamp(chunk);
              if (text.length > 15 && text.length < 500 && (chunk.includes("checked in") || chunk.includes("location") || path.includes("places"))) {
                data.checkins.push({ location: text.substring(0, 200), timestamp });
              }
            }
          }
        }

        // EVENTS
        if (path.includes('event') && path.endsWith('.html')) {
          const structuredData = extractStructuredData(content, path);

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
              }
            }
          });
        }

        // REVIEWS
        if (path.includes('review') && path.endsWith('.html')) {
          const structuredData = extractStructuredData(content, path);

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
              }
            }
          });
        }

        // GROUPS
        if (path.includes('group') && path.endsWith('.html')) {
          const structuredData = extractStructuredData(content, path);

          structuredData.forEach(item => {
            if (item.title) {
              const groupName = item.title.trim();
              if (groupName.length > 2 && groupName.length < 200) {
                data.groups.push({ 
                  name: groupName,
                  details: item.text.join(' ').substring(0, 200),
                  source: path
                });
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
                }
              });
            }
          });

          const linkMatches = content.match(/<a[^>]*>([^<]+)<\/a>/gi) || [];
          linkMatches.forEach(link => {
            const groupName = link.replace(/<[^>]+>/g, '').trim();
            if (groupName.length > 3 && groupName.length < 200 &&
                !groupName.match(/^(Group|Name|Date|Privacy|Terms|Cookies|disabled|false|true)$/i)) {
              data.groups.push({ 
                name: groupName,
                source: path
              });
            }
          });
        }

        // MARKETPLACE
        if (path.includes('marketplace') && path.endsWith('.html')) {
          const structuredData = extractStructuredData(content, path);

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
              }
            }
          });
        }

        // REELS
        if (path.includes('reel') && path.endsWith('.html') && data.reels.length < 50) {
          const sections = content.split(/<div/gi);
          sections.slice(0, 20).forEach(section => {
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

    // Deduplicate
    data.friends = [...new Map(data.friends.map(f => [f.name.toLowerCase(), f])).values()];
    data.events = [...new Map(data.events.map(e => [e.name.toLowerCase(), e])).values()];
    data.reviews = [...new Map(data.reviews.map((r, i) => [r.text.substring(0, 50), r])).values()];
    data.groups = [...new Map(data.groups.map(g => [g.name.toLowerCase(), g])).values()];
    
    data.messages.sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));

    console.log("Extraction complete:", {
      friends: data.friends.length,
      posts: data.posts.length,
      messages: data.messages.length,
      photos: data.photos.length,
      videos: data.videos.length,
      photoFilesCount: Object.keys(data.photoFiles).length,
      videoFilesCount: Object.keys(data.videoFiles).length,
      groups: data.groups.length,
      events: data.events.length,
      reviews: data.reviews.length
    });

    return Response.json(data);
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message || 'Failed to extract archive' }, { status: 500 });
  }
});