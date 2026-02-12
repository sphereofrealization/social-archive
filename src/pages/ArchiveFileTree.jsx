import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";

export default function ArchiveFileTree() {
  const [searchParams] = useSearchParams();
  const archiveId = searchParams.get("archiveId");
  const archiveUrl = searchParams.get("archiveUrl");
  const archiveName = searchParams.get("archiveName");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileTree, setFileTree] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set(["root"]));

  useEffect(() => {
    loadFileTree();
  }, [archiveUrl]);

  const loadFileTree = async () => {
    try {
      setLoading(true);
      const response = await fetch(archiveUrl);
      const blob = await response.blob();
      
      // Import JSZip dynamically to avoid bundling issues
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(blob);

      const tree = buildFileTree(zip.files);
      setFileTree(tree);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const buildFileTree = (files) => {
    const root = {};

    Object.keys(files).forEach((path) => {
      const parts = path.split("/").filter(Boolean);
      let current = root;

      parts.forEach((part, idx) => {
        if (!current[part]) {
          const isFile = idx === parts.length - 1 && path.endsWith(part);
          current[part] = isFile ? { _isFile: true } : {};
        }
        current = current[part];
      });
    });

    return root;
  };

  const toggleFolder = (path) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const renderTree = (obj, path = "") => {
    const items = Object.keys(obj).sort();

    return (
      <ul className="list-none pl-4">
        {items.map((key) => {
          const isFile = obj[key]._isFile;
          const fullPath = path ? `${path}/${key}` : key;
          const isExpanded = expandedFolders.has(fullPath);

          return (
            <li key={fullPath} className="mb-1">
              <div className="flex items-center gap-2 py-1">
                {!isFile && (
                  <button
                    onClick={() => toggleFolder(fullPath)}
                    className="p-0 hover:bg-gray-100 rounded"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                )}
                {isFile ? (
                  <>
                    <FileText className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-mono">{key}</span>
                  </>
                ) : (
                  <>
                    <Folder className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-semibold text-gray-700">{key}/</span>
                  </>
                )}
              </div>
              {!isFile && isExpanded && renderTree(obj[key], fullPath)}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Button
          onClick={() => window.history.back()}
          className="mb-6"
          variant="outline"
        >
          ← Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>File Tree: {archiveName}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading file structure...
              </div>
            ) : error ? (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-800">
                  {error}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="bg-white border rounded p-4 font-mono text-sm overflow-auto max-h-96">
                {fileTree && renderTree(fileTree)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}