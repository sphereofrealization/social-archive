import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ChevronDown, ChevronRight, FileText, Folder, X } from "lucide-react";

export default function ArchiveFileTree() {
  const [searchParams] = useSearchParams();
  const archiveId = searchParams.get("archiveId");
  const archiveUrl = searchParams.get("archiveUrl");
  const archiveName = searchParams.get("archiveName");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileTree, setFileTree] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set(["root"]));
  const [openHtmlFiles, setOpenHtmlFiles] = useState([]);
  const [loadingFile, setLoadingFile] = useState(null);

  useEffect(() => {
    loadFileTree();
  }, [archiveUrl]);

  const loadFileTree = async () => {
    try {
      setLoading(true);
      // Request file tree from backend instead of processing on frontend
      const response = await base44.functions.invoke('getFileTree', { fileUrl: archiveUrl });
      setFileTree(response.data.tree);
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

  const openHtmlFile = async (filePath) => {
    if (openHtmlFiles.find(f => f.path === filePath)) return;
    
    setLoadingFile(filePath);
    try {
      const response = await base44.functions.invoke('getHtmlFile', { 
        fileUrl: archiveUrl,
        filePath 
      });
      
      setOpenHtmlFiles(prev => [...prev, { 
        path: filePath, 
        content: response.data.content,
        name: filePath.split('/').pop()
      }]);
    } catch (err) {
      alert(`Failed to load file: ${err.message}`);
    } finally {
      setLoadingFile(null);
    }
  };

  const closeHtmlFile = (filePath) => {
    setOpenHtmlFiles(prev => prev.filter(f => f.path !== filePath));
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
                    {key.endsWith('.html') ? (
                      <button
                        onClick={() => openHtmlFile(fullPath)}
                        disabled={loadingFile === fullPath}
                        className="text-sm font-mono text-blue-600 hover:underline disabled:opacity-50"
                      >
                        {loadingFile === fullPath ? "Loading..." : key}
                      </button>
                    ) : (
                      <span className="text-sm font-mono">{key}</span>
                    )}
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

{openHtmlFiles.map((file) => (
          <div 
            key={file.path}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => closeHtmlFile(file.path)}
          >
            <div 
              className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-mono text-sm font-semibold">{file.name}</h3>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => closeHtmlFile(file.path)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="overflow-auto flex-1 p-6">
                <iframe
                  srcDoc={file.content}
                  className="w-full h-full min-h-[600px] border-0"
                  sandbox="allow-same-origin"
                  title={file.name}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}