import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, AlertCircle, Download } from "lucide-react";

export default function ArchiveMaterializationPanel({ archive, onMaterializationComplete }) {
  const [status, setStatus] = useState(archive?.materialization_status || 'not_started');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [manifest, setManifest] = useState(null);
  
  const isLargeArchive = archive?.file_size > 50 * 1024 * 1024;
  
  useEffect(() => {
    setStatus(archive?.materialization_status || 'not_started');
    
    // Load manifest if done
    if (archive?.materialization_status === 'done' && archive?.manifest_url) {
      loadManifest();
    }
  }, [archive]);
  
  const loadManifest = async () => {
    try {
      const response = await fetch(archive.manifest_url);
      const data = await response.json();
      setManifest(data);
      console.log('[MANIFEST_STATUS]', {
        status: data.status,
        materializedCount: data.totals?.materializedCount,
        skippedCount: data.totals?.skippedCount,
        errorCount: data.totals?.errorCount
      });
    } catch (err) {
      console.error('[MANIFEST_LOAD_ERROR]', err);
    }
  };
  
  const startMaterialization = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const fileUrlHost = new URL(archive.file_url).hostname;
      console.log('[PREP_REQUEST]', {
        endpoint: 'prepareArchiveTextManifest',
        archiveId: archive.id,
        fileUrlHost
      });
      
      const response = await base44.functions.invoke('prepareArchiveTextManifest', {
        archiveId: archive.id,
        fileUrl: archive.file_url
      });
      
      console.log('[PREP_RESPONSE]', {
        status: response.status,
        ok: response.data?.ok,
        version: response.data?.version,
        counts: response.data?.counts
      });
      
      if (response.data?.ok) {
        // Update archive record
        await base44.entities.Archive.update(archive.id, {
          materialization_status: 'done',
          materialization_finished_at: new Date().toISOString(),
          materialized_count: response.data.counts?.materializedCount,
          manifest_url: response.data.manifestUrl
        });
        
        setStatus('done');
        setProgress(response.data.counts);
        
        if (onMaterializationComplete) {
          onMaterializationComplete(response.data);
        }
      } else {
        throw new Error(response.data?.message || 'Materialization failed');
      }
      
    } catch (err) {
      const errorDetails = {
        message: err.message,
        status: err.response?.status,
        responseUrl: err.config?.url,
        responseData: err.response?.data
      };
      console.error('[PREP_ERROR]', errorDetails);
      setError(`${err.message} (HTTP ${err.response?.status || 'unknown'})`);
      setStatus('failed');
      
      // Update archive record
      await base44.entities.Archive.update(archive.id, {
        materialization_status: 'failed'
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!isLargeArchive) {
    return null; // Don't show panel for small archives
  }
  
  return (
    <Card className="mb-6 border-2 border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          {status === 'done' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : status === 'failed' ? (
            <AlertCircle className="w-5 h-5 text-red-600" />
          ) : status === 'running' ? (
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          ) : (
            <Download className="w-5 h-5 text-blue-600" />
          )}
          Archive Preparation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'not_started' && (
          <>
            <Alert className="bg-blue-100 border-blue-300">
              <AlertDescription className="text-blue-900">
                <p className="font-semibold mb-2">Large archive detected ({(archive.file_size / 1024 / 1024).toFixed(0)} MB)</p>
                <p className="text-sm">
                  To view your data quickly, we'll extract text files (HTML/JSON) from the ZIP and store them separately. 
                  This one-time preparation takes a few minutes but makes viewing instant.
                </p>
              </AlertDescription>
            </Alert>
            
            <Button 
              onClick={startMaterialization}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Preparing Archive...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Prepare Archive for Viewing
                </>
              )}
            </Button>
          </>
        )}
        
        {status === 'running' && (
          <Alert className="bg-yellow-100 border-yellow-300">
            <AlertDescription className="text-yellow-900">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Extracting files from archive... This may take a few minutes.</span>
              </div>
            </AlertDescription>
          </Alert>
        )}
        
        {status === 'done' && progress && (
          <Alert className="bg-green-100 border-green-300">
            <AlertDescription className="text-green-900">
              <p className="font-semibold mb-2">✓ Archive prepared successfully</p>
              <div className="text-sm space-y-1">
                <p>• Extracted: {progress.materializedCount} text files</p>
                {progress.skippedCount > 0 && <p>• Skipped: {progress.skippedCount} files (too large or binary)</p>}
                {progress.errorCount > 0 && <p>• Errors: {progress.errorCount} files</p>}
              </div>
              {progress.sampleUrlsFirst5 && progress.sampleUrlsFirst5.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs hover:text-green-700">
                    Sample extracted files ({progress.sampleUrlsFirst5.length})
                  </summary>
                  <div className="mt-2 space-y-1 text-xs font-mono">
                    {progress.sampleUrlsFirst5.map((item, i) => (
                      <div key={i} className="truncate">• {item.path}</div>
                    ))}
                  </div>
                </details>
              )}
            </AlertDescription>
          </Alert>
        )}
        
        {status === 'failed' && (
          <Alert className="bg-red-100 border-red-300">
            <AlertDescription className="text-red-900">
              <p className="font-semibold mb-2">✗ Preparation failed</p>
              <p className="text-sm">{error || 'Unknown error occurred'}</p>
              <Button 
                onClick={startMaterialization}
                disabled={isLoading}
                variant="outline"
                className="mt-3"
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}
        
        {manifest && (
          <div className="text-xs text-gray-600 border-t pt-3">
            <p>Debug: Manifest loaded with {manifest.entries?.length || 0} entries</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}