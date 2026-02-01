import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Video, FileText, Download, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function VideoMessageExtractor() {
  const [videoFile, setVideoFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedMessages, setExtractedMessages] = useState(null);
  const [error, setError] = useState(null);

  const handleExtractMessages = async () => {
    if (!videoFile) return;

    setExtracting(true);
    setError(null);

    try {
      // Upload video first
      const { file_url } = await base44.integrations.Core.UploadFile({ file: videoFile });

      // Use AI to extract messages from video
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this screen recording of a messaging conversation (Facebook Messenger, Instagram DMs, or similar).
        Extract all visible messages in chronological order.
        
        For each message, identify:
        - The sender's name (or "You" if it's the user)
        - The message text
        - The timestamp (if visible)
        
        Output a structured conversation with all messages you can read from the video.`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            conversation_title: { type: "string" },
            platform: { type: "string" },
            total_messages_extracted: { type: "number" },
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
      });

      setExtractedMessages(result);
    } catch (err) {
      setError("Failed to extract messages from video. Make sure the video is clear and messages are readable.");
      console.error(err);
    }

    setExtracting(false);
  };

  const downloadAsText = () => {
    if (!extractedMessages) return;

    let content = `${extractedMessages.conversation_title || 'Conversation'}\n`;
    content += `Platform: ${extractedMessages.platform || 'Unknown'}\n`;
    content += `Total Messages: ${extractedMessages.total_messages_extracted}\n`;
    content += `\n${'='.repeat(60)}\n\n`;

    extractedMessages.messages.forEach(msg => {
      content += `[${msg.timestamp || 'No timestamp'}] ${msg.sender}:\n`;
      content += `${msg.text}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracted_messages_${Date.now()}.txt`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="w-5 h-5 text-blue-600" />
            Video Message Extractor
          </CardTitle>
          <CardDescription>
            Upload a screen recording of your messages and AI will extract the conversation text
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Upload Screen Recording</Label>
            <Input
              type="file"
              accept="video/*"
              onChange={(e) => setVideoFile(e.target.files[0])}
            />
            <p className="text-xs text-gray-500">
              Tip: Record at a steady pace, ensure text is readable, split long conversations into multiple videos
            </p>
          </div>

          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleExtractMessages}
            disabled={!videoFile || extracting}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {extracting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Extracting Messages... (This may take a minute)
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Extract Messages with AI
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {extractedMessages && (
        <Card className="border-none shadow-lg">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{extractedMessages.conversation_title || 'Extracted Conversation'}</CardTitle>
                <CardDescription className="mt-2 space-y-1">
                  <div className="flex gap-2">
                    <Badge variant="outline">{extractedMessages.platform || 'Unknown Platform'}</Badge>
                    <Badge variant="outline">
                      <MessageSquare className="w-3 h-3 mr-1" />
                      {extractedMessages.total_messages_extracted} messages
                    </Badge>
                  </div>
                </CardDescription>
              </div>
              <Button onClick={downloadAsText} size="sm" variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Download as Text
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {extractedMessages.messages.map((msg, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg ${
                    msg.sender.toLowerCase() === 'you'
                      ? 'bg-blue-100 ml-12'
                      : 'bg-gray-100 mr-12'
                  }`}
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="font-semibold text-sm text-gray-900">{msg.sender}</span>
                    {msg.timestamp && (
                      <span className="text-xs text-gray-500">{msg.timestamp}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{msg.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}