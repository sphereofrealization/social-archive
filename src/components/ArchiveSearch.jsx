import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, MessageSquare, FileText } from "lucide-react";

export default function ArchiveSearch({ archiveId, platform = 'facebook' }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setError(null);

    try {
      const response = await base44.functions.invoke('searchArchiveData', {
        query: query.trim(),
        collections: [`archives_${platform}`],
        limit: 10
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

  const getIcon = (type) => {
    switch (type) {
      case 'post': return <FileText className="w-4 h-4" />;
      case 'comment': return <MessageSquare className="w-4 h-4" />;
      case 'message': return <MessageSquare className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Search className="w-5 h-5" />
          Search Your Archive
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts, comments, messages..."
            className="flex-1"
          />
          <Button type="submit" disabled={searching || !query.trim()}>
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </form>

        {error && (
          <div className="text-sm text-red-600 mb-4">{error}</div>
        )}

        {results && results.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-4">
            No results found for "{query}"
          </div>
        )}

        {results && results.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm text-gray-600 mb-2">
              Found {results.length} results
            </div>
            {results.map((result, i) => (
              <Card key={i} className="border-gray-200">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="text-gray-600 mt-1">
                      {getIcon(result.metadata?.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {result.metadata?.type || 'unknown'}
                        </Badge>
                        {result.metadata?.timestamp && (
                          <span className="text-xs text-gray-500">
                            {result.metadata.timestamp}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800">{result.content}</p>
                      <div className="text-xs text-gray-500 mt-1">
                        Score: {result.score?.toFixed(3)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}