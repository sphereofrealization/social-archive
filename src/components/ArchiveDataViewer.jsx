import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, FileText, Image as ImageIcon, MessageSquare, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
      // Use LLM to analyze and extract insights from the archive
      const platformSpecificPrompts = {
        facebook: `Analyze this Facebook data archive ZIP file. Facebook archives contain HTML files and folders with your data.
        Look for: posts.html, friends.html, messages folder, photos_and_videos folder, comments, likes, and your_activity.
        Extract comprehensive insights about this person's Facebook history.`,
        instagram: `Analyze this Instagram data archive ZIP file. Instagram archives contain JSON files with your posts, stories, messages, followers, and media.
        Look for: posts_1.json, followers.json, messages.json, media folder, stories.json.
        Extract insights about their Instagram activity and content.`,
        twitter: `Analyze this Twitter/X data archive ZIP file. It contains 'Your archive.html' and a data folder with JSON files.
        Look for: tweets.js, direct-messages.js, followers.js, following.js in the data folder.
        Extract insights about their Twitter history.`,
        linkedin: `Analyze this LinkedIn data archive ZIP file. LinkedIn provides CSV files for different data categories.
        Look for: Profile.csv, Connections.csv, Messages.csv, Positions.csv, Recommendations.csv.
        Extract professional insights from their LinkedIn data.`,
        tiktok: `Analyze this TikTok data archive. TikTok provides JSON files with video data, comments, likes, and user info.
        Look for: user_data.json, video.json, comment.json, like_list.json.
        Extract insights about their TikTok content and engagement.`
      };

      const basePrompt = platformSpecificPrompts[archive.platform] || 
        `Analyze this ${archive.platform} social media archive and extract key insights.`;

      const prompt = `${basePrompt}
      
      Provide a comprehensive summary in JSON format with the following structure:
      {
        "summary": "Brief overview of what this archive contains and the person's activity on the platform",
        "statistics": {
          "total_posts": number (0 if not found),
          "total_photos": number (0 if not found),
          "total_videos": number (0 if not found),
          "date_range": {"start": "YYYY-MM-DD or earliest date found", "end": "YYYY-MM-DD or latest date found"},
          "top_themes": ["theme1", "theme2", "theme3"] (topics/interests based on content)
        },
        "highlights": [
          {"title": "Most memorable moment or significant post", "description": "what happened", "date": "date if available"}
        ],
        "connections_count": number (friends/followers/connections - 0 if not found),
        "messages_count": number (total DMs/messages - 0 if not found)
      }
      
      Important: Extract real numbers from the archive files. Be thorough in analyzing the structure.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: prompt,
        file_urls: [fileUrl],
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            statistics: {
              type: "object",
              properties: {
                total_posts: { type: "number" },
                total_photos: { type: "number" },
                total_videos: { type: "number" },
                date_range: {
                  type: "object",
                  properties: {
                    start: { type: "string" },
                    end: { type: "string" }
                  }
                },
                top_themes: { type: "array", items: { type: "string" } }
              }
            },
            highlights: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  date: { type: "string" }
                }
              }
            },
            connections_count: { type: "number" },
            messages_count: { type: "number" }
          }
        }
      });

      setExtractedData(result);
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
    if (isZipFile) {
      return (
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="p-6 space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Extract Your Archive First</h3>
              <p className="text-sm text-gray-600 mb-4">
                ZIP files need to be extracted. Upload an individual file from your archive for AI analysis.
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 text-left space-y-3">
              <p className="font-medium text-sm text-gray-900">For Facebook archives, look for:</p>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li><code className="bg-gray-100 px-1 rounded">index.html</code> - Main overview</li>
                <li><code className="bg-gray-100 px-1 rounded">posts/your_posts_1.html</code> - Your posts</li>
                <li><code className="bg-gray-100 px-1 rounded">friends/friends.html</code> - Friends list</li>
                <li><code className="bg-gray-100 px-1 rounded">messages/inbox/</code> - Message threads (HTML files)</li>
                <li><code className="bg-gray-100 px-1 rounded">comments/comments.html</code> - Your comments</li>
              </ul>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Upload a file from your extracted archive</label>
              <Input
                type="file"
                accept=".html,.json,.csv,.txt"
                onChange={(e) => setIndividualFile(e.target.files[0])}
              />
            </div>

            <Button 
              onClick={handleFileUploadForAnalysis}
              disabled={!individualFile || uploadingFile || extracting}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {uploadingFile || extracting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Analyze with AI
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
        <CardContent className="p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-purple-600" />
            </div>
            <h3 className="font-semibold text-lg mb-2">AI-Powered Data Extraction</h3>
            <p className="text-sm text-gray-600 mb-4">
              Use AI to analyze your archive and extract key insights, statistics, and highlights
            </p>
            <Button 
              onClick={() => analyzeFile(archive.file_url)}
              disabled={extracting}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Archive...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Extract Data with AI
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-none shadow-lg bg-gradient-to-br from-purple-50 to-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            Archive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700">{extractedData.summary}</p>
        </CardContent>
      </Card>

      {extractedData.statistics && (
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {extractedData.statistics.total_posts > 0 && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{extractedData.statistics.total_posts}</p>
                  <p className="text-sm text-gray-600">Posts</p>
                </div>
              )}
              {extractedData.statistics.total_photos > 0 && (
                <div className="p-4 bg-green-50 rounded-lg">
                  <ImageIcon className="w-5 h-5 text-green-600 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{extractedData.statistics.total_photos}</p>
                  <p className="text-sm text-gray-600">Photos</p>
                </div>
              )}
              {extractedData.connections_count > 0 && (
                <div className="p-4 bg-purple-50 rounded-lg">
                  <Users className="w-5 h-5 text-purple-600 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{extractedData.connections_count}</p>
                  <p className="text-sm text-gray-600">Connections</p>
                </div>
              )}
              {extractedData.messages_count > 0 && (
                <div className="p-4 bg-orange-50 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-orange-600 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{extractedData.messages_count}</p>
                  <p className="text-sm text-gray-600">Messages</p>
                </div>
              )}
            </div>

            {extractedData.statistics.date_range && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Date Range:</strong> {extractedData.statistics.date_range.start} to {extractedData.statistics.date_range.end}
                </p>
              </div>
            )}

            {extractedData.statistics.top_themes && extractedData.statistics.top_themes.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Top Themes:</p>
                <div className="flex flex-wrap gap-2">
                  {extractedData.statistics.top_themes.map((theme, i) => (
                    <Badge key={i} variant="outline" className="bg-purple-50">
                      {theme}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {extractedData.highlights && extractedData.highlights.length > 0 && (
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Highlights</CardTitle>
            <CardDescription>Memorable moments from your archive</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {extractedData.highlights.map((highlight, i) => (
                <div key={i} className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-orange-100">
                  <div className="flex items-start justify-between">
                    <h4 className="font-semibold text-gray-900">{highlight.title}</h4>
                    {highlight.date && (
                      <Badge variant="outline" className="bg-white text-xs">
                        {highlight.date}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-2">{highlight.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Analyze another file from your archive</label>
        <Input
          type="file"
          accept=".html,.json,.csv,.txt"
          onChange={(e) => setIndividualFile(e.target.files[0])}
        />
        <Button 
          onClick={handleFileUploadForAnalysis}
          disabled={!individualFile || uploadingFile || extracting}
          variant="outline"
          size="sm"
          className="w-full"
        >
          {uploadingFile || extracting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Analyze Another File
            </>
          )}
        </Button>
      </div>
    </div>
  );
}