import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AIDataSearch({ data }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setSearching(true);
    setError(null);
    setResults(null);
    
    try {
      // Prepare a summary of available data for the AI
      const dataSummary = {
        profile: data.profile,
        counts: {
          posts: data.posts?.length || 0,
          friends: data.friends?.length || 0,
          messages: data.messages?.length || 0,
          conversations: data.messages?.length || 0,
          photos: data.photos?.length || 0,
          videos: data.videos?.length || 0,
          comments: data.comments?.length || 0,
          events: data.events?.length || 0,
          reviews: data.reviews?.length || 0,
          groups: data.groups?.length || 0,
          likes: data.likes?.length || 0,
          checkins: data.checkins?.length || 0
        },
        friends_sample: data.friends?.slice(0, 100).map(f => f.name) || [],
        events: data.events || [],
        reviews: data.reviews || [],
        conversations: data.messages?.map(m => ({
          with: m.conversation_with,
          message_count: m.messages?.length || 0,
          last_message: m.messages?.[0]?.text?.substring(0, 100)
        })) || [],
        recent_posts: data.posts?.slice(0, 20).map(p => ({
          text: p.text?.substring(0, 200),
          timestamp: p.timestamp
        })) || []
      };
      
      const prompt = `You are helping a user search through their Facebook archive data. 
      
Available data summary:
${JSON.stringify(dataSummary, null, 2)}

User's question: "${query}"

Please provide a helpful answer based on the available data. If searching for specific items (friends, events, reviews, conversations), list the relevant matches. Be specific and cite actual data from the archive.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: prompt,
        response_json_schema: {
          type: "object",
          properties: {
            answer: { type: "string" },
            relevant_items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  name: { type: "string" },
                  details: { type: "string" }
                }
              }
            },
            suggestions: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      });
      
      setResults(response);
    } catch (err) {
      setError(err.message || "Search failed");
    }
    
    setSearching(false);
  };

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          AI Search
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Ask anything about your data... (e.g., 'Do I have a friend named Lucy?', 'What events did I create?')"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1"
          />
          <Button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>

        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {results && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-lg border">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{results.answer}</p>
            </div>

            {results.relevant_items && results.relevant_items.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Found Items:</h4>
                <div className="space-y-2">
                  {results.relevant_items.map((item, i) => (
                    <div key={i} className="bg-white p-3 rounded border text-sm">
                      <div className="font-medium text-purple-600">{item.type}: {item.name}</div>
                      {item.details && <p className="text-gray-600 mt-1">{item.details}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.suggestions && results.suggestions.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Try asking:</h4>
                <div className="flex flex-wrap gap-2">
                  {results.suggestions.map((suggestion, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      onClick={() => setQuery(suggestion)}
                      className="text-xs"
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}