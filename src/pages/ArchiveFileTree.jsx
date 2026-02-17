import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ChevronDown, ChevronRight, FileText, Folder, X } from "lucide-react";
import { HttpReader, ZipReader } from "@zip.js/zip.js";

export default function ArchiveFileTree() {
  const [searchParams] = useSearchParams();
  const archiveId = searchParams.get("archiveId");
  const archiveUrl = searchParams.get("archiveUrl");
  const archiveName = searchParams.get("archiveName");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [archive, setArchive] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [fileTree, setFileTree] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set(["root"]));
  const [openHtmlFiles, setOpenHtmlFiles] = useState([]);
  const [loadingFile, setLoadingFile] = useState(null);

  useEffect(() => {
    loadArchiveAndTree();
  }, [archiveId, archiveUrl]);

  // Build file tree from remote ZIP using client-side @zip.js/zip.js
  const buildFileTreeFromRemoteZip = async (url) => {
    console.log('[ArchiveFileTree] Strategy 3: Client-side zip.js over HTTP Range');
    
    const httpReader = new HttpReader(url);
    const zipReader = new ZipReader(httpReader);
    const entries = await zipReader.getEntries();
    
    const tree = {};
    
    for (const entry of entries) {
      const path = entry.filename;
      const parts = path.split('/').filter(Boolean);
      let current = tree;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        if (i === parts.length - 1 && !entry.directory) {
          // File
          current[part] = {
            type: 'file',
            path,
            size: entry.uncompressedSize
          };
        } else {
          // Directory
          if (!current[part]) {
            current[part] = { type: 'folder', children: {} };
          }
          current = current[part].children;
        }
      }
    }
    
    await zipReader.close();
    return tree;
  };

  const loadArchiveAndTree = async () => {
    try {
      setLoading(true);
      
      // Load archive metadata if archiveId provided
      let archiveData = null;
      let manifestData = null;
      
      if (archiveId) {
        const archives = await base44.entities.Archive.filter({ id: archiveId });
        if (archives.length > 0) {
          archiveData = archives[0];
          setArchive(archiveData);
          
          // Load manifest if available
          if (archiveData.manifest_url) {
            try {
              const manifestResp = await fetch(archiveData.manifest_url);
              manifestData = await manifestResp.json();
              setManifest(manifestData);
            } catch (err) {
              console.warn('Failed to load manifest:', err);
            }
          }
        }
      }
      
      // Strategy 1: Try getFileTree backend (manifest-first or index-based)
      try {
        console.log('[ArchiveFileTree] Strategy 1: getFileTree backend');
        const response = await base44.functions.invoke('getFileTree', { 
          fileUrl: archiveUrl,
          manifestUrl: manifestData ? archiveData.manifest_url : null
        });
        setFileTree(response.data.tree);
        console.log('[ArchiveFileTree] Strategy 1: SUCCESS');
        return;
      } catch (err) {
        console.warn('[ArchiveFileTree] Strategy 1 failed:', err.message);
      }
      
      // Strategy 2: Try extractArchiveDataStreaming to get index, then derive tree
      try {
        console.log('[ArchiveFileTree] Strategy 2: extractArchiveDataStreaming');
        const indexResp = await base44.functions.invoke('extractArchiveDataStreaming', { 
          fileUrl: archiveUrl 
        });
        
        if (indexResp.data?.index) {
          const index = indexResp.data.index;
          const pathSet = new Set();
          
          // Derive all paths from index
          if (index.all && Array.isArray(index.all)) {
            index.all.forEach(p => pathSet.add(p));
          }
          
          if (index.entriesByPath) {
            Object.keys(index.entriesByPath).forEach(p => pathSet.add(p));
          }
          
          Object.values(index).forEach(value => {
            if (Array.isArray(value)) {
              value.forEach(item => {
                if (typeof item === 'string') pathSet.add(item);
                else if (item?.path) pathSet.add(item.path);
              });
            } else if (value && typeof value === 'object') {
              Object.values(value).forEach(subValue => {
                if (Array.isArray(subValue)) {
                  subValue.forEach(item => {
                    if (typeof item === 'string') pathSet.add(item);
                    else if (item?.path) pathSet.add(item.path);
                  });
                }
              });
            }
          });
          
          const allPaths = Array.from(pathSet);
          console.log(`[ArchiveFileTree] Strategy 2: Derived ${allPaths.length} paths from index`);
          
          // Build tree from paths
          const tree = {};
          for (const path of allPaths) {
            const parts = path.split('/').filter(Boolean);
            let current = tree;
            
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              
              if (i === parts.length - 1) {
                current[part] = { type: 'file', path };
              } else {
                if (!current[part]) {
                  current[part] = { type: 'folder', children: {} };
                }
                current = current[part].children;
              }
            }
          }
          
          setFileTree(tree);
          console.log('[ArchiveFileTree] Strategy 2: SUCCESS');
          return;
        }
      } catch (err) {
        console.warn('[ArchiveFileTree] Strategy 2 failed:', err.message);
      }
      
      // Strategy 3: Client-side zip.js fallback
      try {
        const tree = await buildFileTreeFromRemoteZip(archiveUrl);
        setFileTree(tree);
        console.log('[ArchiveFileTree] Strategy 3: SUCCESS');
      } catch (err) {
        console.error('[ArchiveFileTree] All strategies failed');
        throw new Error(`Failed to load file tree: ${err.message}`);
      }
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

  const openFile = async (filePath) => {
    if (openHtmlFiles.find(f => f.path === filePath)) return;
    
    setLoadingFile(filePath);
    try {
      // Try manifest first for materialized files
      if (manifest?.entries) {
        const entry = manifest.entries.find(e => e.entryPath === filePath);
        if (entry?.url) {
          const response = await fetch(entry.url);
          const content = await response.text();
          
          setOpenHtmlFiles(prev => [...prev, { 
            path: filePath, 
            content,
            type: entry.mimeType?.includes('html') ? 'html' : 
                  entry.mimeType?.includes('json') ? 'json' : 'text',
            name: filePath.split('/').pop()
          }]);
          setLoadingFile(null);
          return;
        }
      }
      
      // Fallback to ZIP extraction
      const response = await base44.functions.invoke('getArchiveFile_simple', { 
        fileUrl: archiveUrl,
        filePath 
      });
      
      setOpenHtmlFiles(prev => [...prev, { 
        path: filePath, 
        content: response.data.content,
        type: response.data.type,
        message: response.data.message,
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
    const items = Object.keys(obj).filter(k => k !== 'type' && k !== 'size' && k !== 'path').sort();

    return (
      <ul className="list-none pl-4">
        {items.map((key) => {
          const item = obj[key];
          const isFile = item.type === 'file';
          const fullPath = item.path || (path ? `${path}/${key}` : key);
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
                    <button
                      onClick={() => openFile(fullPath)}
                      disabled={loadingFile === fullPath}
                      className="text-sm font-mono text-blue-600 hover:underline disabled:opacity-50"
                    >
                      {loadingFile === fullPath ? "Loading..." : key}
                    </button>
                  </>
                ) : (
                  <>
                    <Folder className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-semibold text-gray-700">{key}/</span>
                  </>
                )}
              </div>
              {!isFile && isExpanded && item.children && renderTree(item.children, fullPath)}
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
                {file.type === 'image' && (
                  <img src={file.content} alt={file.name} className="max-w-full h-auto" />
                )}
                {file.type === 'html' && (
                  <iframe
                    srcDoc={file.content}
                    className="w-full h-full min-h-[600px] border-0"
                    sandbox="allow-same-origin"
                    title={file.name}
                  />
                )}
                {file.type === 'json' && (
                  <pre className="bg-gray-50 p-4 rounded overflow-auto text-xs">
                    {JSON.stringify(JSON.parse(file.content), null, 2)}
                  </pre>
                )}
                {file.type === 'text' && (
                  <pre className="bg-gray-50 p-4 rounded overflow-auto text-xs whitespace-pre-wrap">
                    {file.content}
                  </pre>
                )}
                {(file.type === 'video' || file.type === 'unknown') && (
                  <div className="text-center py-12 text-gray-600">
                    <p>{file.message}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}