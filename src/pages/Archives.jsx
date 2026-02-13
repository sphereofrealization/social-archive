import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Upload, 
  FileArchive, 
  Trash2, 
  Download,
  CheckCircle2,
  Clock,
  FolderOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  FileJson,
  Copy,
  Check
} from "lucide-react";
import { format } from "date-fns";
import ArchiveDataViewer from "../components/ArchiveDataViewer";
import { createPageUrl } from "@/utils";


const statusColors = {
  not_started: "bg-gray-100 text-gray-800",
  requested: "bg-blue-100 text-blue-800",
  downloaded: "bg-purple-100 text-purple-800",
  organized: "bg-green-100 text-green-800",
  deleted: "bg-red-100 text-red-800"
};

const statusIcons = {
  not_started: Clock,
  requested: Clock,
  downloaded: Download,
  organized: CheckCircle2,
  deleted: Trash2
};

export default function Archives() {
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadData, setUploadData] = useState({
    platform: "",
    file: null,
    download_date: "",
    notes: ""
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [expandedArchive, setExpandedArchive] = useState(null);
  const [user, setUser] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);

  const queryClient = useQueryClient();

  React.useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const { data: archives = [], isLoading } = useQuery({
    queryKey: ['archives'],
    queryFn: async () => {
      const sessionToken = localStorage.getItem('session_token');
      if (!sessionToken) return [];
      return base44.entities.Archive.filter({ account_id: sessionToken }, '-updated_date');
    },
    initialData: [],
  });

  const updateArchiveMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Archive.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archives'] });
    },
  });

  const deleteArchiveMutation = useMutation({
    mutationFn: (id) => base44.entities.Archive.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archives'] });
    },
  });

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!uploadData.platform || !uploadData.file) return;

    setUploading(true);
    setUploadProgress(0);
    
    try {
        const file = uploadData.file;
        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for better progress feedback

        // Start multipart upload (with auth token)
        const sessionToken = localStorage.getItem('session_token');
        const originalInvoke = base44.functions.invoke;
        base44.functions.invoke = (fnName, payload) => {
          return originalInvoke.call(base44.functions, fnName, payload, {
            headers: { 'Authorization': `Bearer ${sessionToken}` }
          });
        };
        
        const { data: startData } = await base44.functions.invoke('uploadToS3', {
          action: 'start',
          fileName: file.name
        });
        const { uploadId, fileKey } = startData;

        // Upload chunks
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const uploadedParts = [];

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          // Convert chunk to base64
          const reader = new FileReader();
          const chunkBase64 = await new Promise((resolve) => {
            reader.onload = () => {
              const base64 = reader.result.split(',')[1];
              resolve(base64);
            };
            reader.readAsDataURL(chunk);
          });

          const { data: partData } = await base44.functions.invoke('uploadToS3', {
            action: 'upload',
            uploadId,
            fileKey,
            partNumber: i + 1,
            chunkBase64
          });
          uploadedParts.push(partData);

          setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
        }

        // Complete multipart upload
        const { data: completeData } = await base44.functions.invoke('uploadToS3', {
          action: 'complete',
          uploadId,
          fileKey,
          parts: uploadedParts
        });
        await base44.entities.Archive.create({
          account_id: sessionToken,
          platform: uploadData.platform,
          status: "downloaded",
          file_url: completeData.fileUrl,
          file_name: file.name,
          file_size: file.size,
          download_date: uploadData.download_date || new Date().toISOString().split('T')[0],
          notes: uploadData.notes
        });

      queryClient.invalidateQueries({ queryKey: ['archives'] });
      setShowUploadForm(false);
      setUploadData({ platform: "", file: null, download_date: "", notes: "" });
      setUploadProgress(0);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed: " + error.message);
    }
    setUploading(false);
  };

  const handleStatusChange = (id, newStatus) => {
    updateArchiveMutation.mutate({ id, data: { status: newStatus } });
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "Unknown";
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const toggleArchiveExpansion = (archiveId) => {
    setExpandedArchive(expandedArchive === archiveId ? null : archiveId);
  };

  const copyUrlToClipboard = (url, archiveId) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(archiveId);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-start md:items-center mb-8 flex-col md:flex-row gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Archives</h1>
            <p className="text-gray-600">Manage and organize your downloaded social media archives</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => setShowUploadForm(!showUploadForm)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Archive
            </Button>
          </div>
        </div>

        

        {showUploadForm && (
          <Card className="mb-8 border-none shadow-lg">
            <CardHeader>
              <CardTitle>Upload Downloaded Archive</CardTitle>
              <CardDescription>Add an archive file you've downloaded from a social media platform</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFileUpload} className="space-y-4">
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={uploadData.platform} onValueChange={(value) => setUploadData({...uploadData, platform: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="twitter">Twitter</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="snapchat">Snapchat</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Archive File (ZIP)</Label>
                  <Input 
                    type="file" 
                    accept=".zip,.tar,.gz"
                    onChange={(e) => setUploadData({...uploadData, file: e.target.files[0]})}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Download Date</Label>
                  <Input 
                    type="date" 
                    value={uploadData.download_date}
                    onChange={(e) => setUploadData({...uploadData, download_date: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes (Optional)</Label>
                  <Textarea 
                    placeholder="Add any notes about this archive..."
                    value={uploadData.notes}
                    onChange={(e) => setUploadData({...uploadData, notes: e.target.value})}
                    rows={3}
                  />
                </div>

                {uploading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowUploadForm(false)}
                    disabled={uploading}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={!uploadData.platform || !uploadData.file || uploading}
                  >
                    {uploading ? `Uploading... ${uploadProgress}%` : "Upload Archive"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {archives.length === 0 ? (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Archives Yet</h3>
              <p className="text-gray-600 mb-6">
                Start by downloading your data from social media platforms, then upload the archives here
              </p>
              <Button onClick={() => setShowUploadForm(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Your First Archive
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {archives.map((archive) => {
              const StatusIcon = statusIcons[archive.status];
              const isExpanded = expandedArchive === archive.id;
              
              return (
                <Card key={archive.id} className="border-none shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-50 rounded-xl">
                          <FileArchive className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <CardTitle className="capitalize">{archive.platform}</CardTitle>
                          {archive.file_name && (
                            <p className="text-sm text-gray-500 mt-1">{archive.file_name}</p>
                          )}
                        </div>
                      </div>
                      <Badge className={statusColors[archive.status]}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {archive.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-4">
                      {archive.file_size && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <FileArchive className="w-4 h-4" />
                          <span>Size: {formatFileSize(archive.file_size)}</span>
                        </div>
                      )}
                      
                      {archive.download_date && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>Downloaded: {format(new Date(archive.download_date), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                    </div>

                    {archive.notes && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700">{archive.notes}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-xs">Update Status</Label>
                      <Select 
                        value={archive.status} 
                        onValueChange={(value) => handleStatusChange(archive.id, value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_started">Not Started</SelectItem>
                          <SelectItem value="requested">Requested</SelectItem>
                          <SelectItem value="downloaded">Downloaded</SelectItem>
                          <SelectItem value="organized">Organized</SelectItem>
                          <SelectItem value="deleted">Account Deleted</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2 pt-2">
                      {archive.file_url && (
                        <>
                          <Button 
                            variant="outline" 
                            size="icon"
                            onClick={() => copyUrlToClipboard(archive.file_url, archive.id)}
                            title="Copy download link"
                            className="flex-shrink-0"
                          >
                            {copiedUrl === archive.id ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                           <Button 
                             variant="outline" 
                             className="flex-1"
                             onClick={() => window.open(archive.file_url, '_blank')}
                           >
                             <Download className="w-4 h-4 mr-2" />
                             Download
                           </Button>
                          <Button 
                            variant="outline" 
                            className="flex-1"
                            onClick={() => window.location.href = createPageUrl("ArchiveFileTree") + `?archiveId=${archive.id}&archiveUrl=${encodeURIComponent(archive.file_url)}&archiveName=${encodeURIComponent(archive.file_name)}`}
                          >
                            <FileJson className="w-4 h-4 mr-2" />
                            View File Tree
                          </Button>
                          <Button 
                            variant="outline" 
                            className="flex-1"
                            onClick={() => toggleArchiveExpansion(archive.id)}
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="w-4 h-4 mr-2" />
                                Hide Analysis
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-4 h-4 mr-2" />
                                View Analysis
                              </>
                            )}
                          </Button>
                          </>
                          )}
                          <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => deleteArchiveMutation.mutate(archive.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                          <Trash2 className="w-4 h-4" />
                          </Button>
                    </div>

                    {isExpanded && archive.file_url && (
                      <div className="pt-4 border-t">
                        <ArchiveDataViewer 
                          archive={archive} 
                          onExtractionComplete={() => {
                            if (archive.status !== 'organized') {
                              handleStatusChange(archive.id, 'organized');
                            }
                          }}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}