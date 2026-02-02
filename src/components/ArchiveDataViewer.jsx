import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, FileText, Image as ImageIcon, MessageSquare, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import FacebookViewer from "./FacebookViewer";

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
      // Define schema based on platform
      const facebookSchema = {
        type: "object",
        properties: {
          profile: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" }
            }
          },
          posts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                timestamp: { type: "string" },
                likes_count: { type: "number" },
                comments_count: { type: "number" }
              }
            }
          },
          friends: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                date_added: { type: "string" }
              }
            }
          },
          messages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                conversation_with: { type: "string" },
                messages: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      sender: { type: "string" },
                      text: { type: "string" },
                      timestamp: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          photos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                timestamp: { type: "string" }
              }
            }
          },
          comments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                timestamp: { type: "string" },
                on_post_by: { type: "string" }
              }
            }
          }
        }
      };

      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: fileUrl,
        json_schema: facebookSchema
      });

      if (result.status === "error") {
        throw new Error(result.details || "Failed to extract data");
      }

      setExtractedData(result.output);
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