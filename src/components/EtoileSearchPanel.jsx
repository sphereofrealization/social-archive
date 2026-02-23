import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Sparkles } from "lucide-react";

export default function EtoileSearchPanel({ archiveId, platform = 'facebook' }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setSearching(true);
    setError(null);

    try {
      const response = await base44.functions.invoke('searchEtoile', {
        query: query.trim(),
        collections: [`archives_${platform}`],
        limit: 20
      });

      if (response.data?.ok) {
        setResults(response.data.results || []);
      } else {
        setError(response.data?.error || 'Search failed');
      }
    } catch (err) {
      setError(err.message);
    }

    setSearching(false);
  };

  return (
    <Card className="mb-6 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="w-5 h-5 text-blue-600" />
          AI Search Your Archive
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search your posts, comments, messages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1"
          />
          <Button 
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {searching ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Search
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        {results && results.length === 0 && (
          <div className="p-4 text-center text-gray-500 text-sm">
            No results found for "{query}"
          </div>
        )}

        {results && results.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm text-gray-600">
              Found {results.length} results
            </div>
            {results.map((result, i) => (
              <Card key={i} className="bg-white border-gray-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="font-medium text-sm">{result.title}</div>
                    <Badge variant="outline" className="text-xs">
                      {result.metadata?.type || 'unknown'}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700 mb-2 line-clamp-3">
                    {result.content}
                  </p>
                  {result.metadata?.timestamp && (
                    <div className="text-xs text-gray-500">
                      {result.metadata.timestamp}
                    </div>
                  )}
                  {result.score && (
                    <div className="text-xs text-gray-400 mt-1">
                      Relevance: {(result.score * 100).toFixed(0)}%
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}