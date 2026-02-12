import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip@3.10.1';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.500.0';

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
    
    // Extract bucket and key from S3 URL
    const urlMatch = fileUrl.match(/https:\/\/s3\..+?\.dream\.io\/([^\/]+)\/(.+)/);
    if (!urlMatch) {
      return Response.json({ error: 'Invalid S3 URL format' }, { status: 400 });
    }
    
    const bucket = urlMatch[1];
    const key = urlMatch[2];
    
    // Create S3 client with DreamHost credentials
    const s3Client = new S3Client({
      region: 'us-east-005',
      endpoint: Deno.env.get('DREAMHOST_ENDPOINT'),
      credentials: {
        accessKeyId: Deno.env.get('DREAMHOST_ACCESS_KEY'),
        secretAccessKey: Deno.env.get('DREAMHOST_SECRET_KEY'),
      },
      forcePathStyle: true,
    });
    
    // Download file from S3
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    
    const response = await s3Client.send(command);
    
    // Convert response body to blob
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const blob = new Blob(chunks, { type: 'application/zip' });
    console.log("Archive downloaded, size:", blob.size);

    // Load and parse the ZIP
    const zip = await JSZip.loadAsync(blob);
    
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
      allData: {}
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

    // Process files - extract text content only (no images/videos in backend)
    console.log("Extracting data from archive...");
    
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;

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

        // PROFILE
        if (path.endsWith(".html")) {
          const generatedByMatch = content.match(/Generated by ([^<\n]+) on/i);
          if (generatedByMatch && !data.profile.name) {
            data.profile.name = generatedByMatch[1].trim();
          }

          const emailMatch = content.match(/[\w\.-]+@[\w\.-]+\.\w+/);
          if (emailMatch && !data.profile.email) {
            data.profile.email = emailMatch[0];
          }

          const tables = content.match(/<table[^>]*>[\s\S]*?<\/table>/gi) || [];
          const rows = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

          tables.concat(rows).forEach((tableStr) => {
            const cells = tableStr.match(/<td[^>]*>([^<]*)<\/td>/gi) || [];

            if (cells.length > 0) {
              const rowData = cells.map(cell => 
                cell.replace(/<[^>]+>/g, '').trim().substring(0, 200)
              ).filter(text => text.length > 0);

              if (path.includes('friends') && rowData.length > 0) {
                if (!data.friendsData) data.friendsData = [];
                rowData.forEach(name => {
                  if (name.length > 2 && !name.match(/^(false|true|disabled)$/i)) {
                    data.friends.push({ name, date_added: "" });
                  }
                });
              }
            }
          });

          const links = content.match(/<a[^>]*href="[^"]*"[^>]*>([^<]+)<\/a>/gi) || [];
          links.forEach(link => {
            const text = link.replace(/<[^>]+>/g, '').trim();
            if (text.length > 3 && text.length < 150 && path.includes('friends')) {
              data.friends.push({ name: text, date_added: "" });
            }
          });
        }

        // POSTS
        if (path.includes('post') && path.endsWith(".html")) {
          const postSections = content.split(/<div[^>]*class="[^"]*pam[^"]*"[^>]*>/gi);

          postSections.forEach((section, idx) => {
            if (section.length < 100) return;

            const text = parseHTML(section.substring(0, 2000));
            if (text.length < 10) return;

            const timestamp = extractTimestamp(section);
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

            data.posts.push({
              text: text.substring(0, 500),
              timestamp,
              reactions,
              likes_count: totalReactions,
              comments_count: comments.length,
              comments
            });
          });
        }

        // FRIENDS
        if (path.match(/\bfriends?\b/i) && !path.match(/\b(message|comment|post|inbox)\b/i) && (path.endsWith('.html') || path.endsWith('.json'))) {
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
              // Ignore JSON parse errors
            }
          } else {
            const tableRows = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
            tableRows.forEach(row => {
              const cells = row.match(/<td[^>]*>([^<]+)<\/td>/gi) || [];
              cells.forEach(cell => {
                const name = cell.replace(/<[^>]+>/g, '').trim();
                const nameLower = name.toLowerCase();

                const excludedTerms = ['name', 'friend', 'date', 'privacy', 'settings', 'disabled', 
                                      'false', 'true', 'following', 'followers', 'list', 'add', 'remove'];

                if (name.length >= 3 && 
                    name.length < 100 &&
                    name.match(/[a-z]/i) &&
                    name.match(/\s/) &&
                    !excludedTerms.includes(nameLower) &&
                    !name.match(/^\d+$/) &&
                    !data.friends.find(f => f.name.toLowerCase() === name.toLowerCase())) {
                  data.friends.push({ name, date_added: "", source: path });
                }
              });
            });
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