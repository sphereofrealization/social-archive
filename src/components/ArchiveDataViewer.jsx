import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, FileText, Image as ImageIcon, MessageSquare, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ArchiveDataViewer({ archive }) {
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);

  const handleExtractData = async () => {
    if (!archive.file_url) return;
    
    setExtracting(true);
    setError(null);
    
    try {
      // Use LLM to analyze and extract insights from the archive
      const prompt = `Analyze this ${archive.platform} data archive and extract key insights. 
      Provide a comprehensive summary in JSON format with the following structure:
      {
        "summary": "Brief overview of the archive",
        "statistics": {
          "total_posts": number,
          "total_photos": number,
          "total_videos": number,
          "date_range": {"start": "date", "end": "date"},
          "top_themes": ["theme1", "theme2", "theme3"]
        },
        "highlights": [
          {"title": "highlight name", "description": "details", "date": "date if available"}
        ],
        "connections_count": number,
        "messages_count": number
      }`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: prompt,
        file_urls: [archive.file_url],
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
      setError("Failed to extract data. The archive might be too large or in an unsupported format.");
      console.error(err);
    }
    
    setExtracting(false);
  };

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
            <h3 className="font-semibold text-lg mb-2">AI-Powered Data Extraction</h3>
            <p className="text-sm text-gray-600 mb-4">
              Use AI to analyze your archive and extract key insights, statistics, and highlights
            </p>
            <Button 
              onClick={handleExtractData}
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

      <Button 
        onClick={handleExtractData}
        variant="outline"
        size="sm"
        className="w-full"
      >
        <Sparkles className="w-4 h-4 mr-2" />
        Re-analyze Archive
      </Button>
    </div>
  );
}