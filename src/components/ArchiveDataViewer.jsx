import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, FileText, Image as ImageIcon, MessageSquare, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import FacebookViewer from "./FacebookViewer";

export default function ArchiveDataViewer({ archive, onExtractionComplete }) {
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);
  const [individualFile, setIndividualFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [connectivityTest, setConnectivityTest] = useState(null);
  const [testingConnectivity, setTestingConnectivity] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

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

  const testRemoteZipConnectivity = async (zipUrl) => {
    setTestingConnectivity(true);
    setConnectivityTest(null);
    
    try {
      const response = await base44.functions.invoke('testZipConnectivity', { zipUrl });
      console.log('[ArchiveDataViewer] Connectivity test result:', response.data);
      setConnectivityTest(response.data);
      
      if (response.data?.summary?.canRandomAccess === false) {
        setError(`Remote ZIP connectivity issue: ${response.data.summary.issues?.join('; ') || 'Unknown issue'}`);
      }
    } catch (err) {
      console.error('[ArchiveDataViewer] Connectivity test failed:', err);
      setConnectivityTest({ error: err.message });
    }
    
    setTestingConnectivity(false);
  };

  const analyzeFile = async (fileUrl) => {
    setExtracting(true);
    setError(null);

    try {
        console.log("Invoking backend extraction for:", fileUrl);
        
        // Try streaming first for large files
        const response = await base44.functions.invoke('extractArchiveDataStreaming', { fileUrl });

        console.log('[ArchiveDataViewer] Extraction response:', response.data);

        if (!response.data) {
            throw new Error('No data returned from server');
        }

        // Check if extraction failed
        if (response.data.ok === false) {
          const debug = response.data.debug || {};
          let errorDetail = `${response.data.error || 'Extraction failed'}`;
          
          // Show comprehensive debug information
          if (debug.headStatus) {
            errorDetail += `\n\n📊 DIAGNOSTICS:\n`;
            errorDetail += `HEAD Status: ${debug.headStatus} | Content-Length: ${debug.contentLength} bytes\n`;
            errorDetail += `Content-Type: ${debug.contentType} | Accept-Ranges: ${debug.acceptRanges}\n`;
            errorDetail += `Range Probe: HTTP ${debug.rangeProbeStatus} (${debug.rangeProbeContentRange || 'N/A'})\n`;
            errorDetail += `EOCD Found: ${debug.eocdFound ? '✓ Yes' : '✗ No'} (offset in tail: ${debug.eocdOffsetInTail})\n`;
            
            if (debug.eocdFound) {
              errorDetail += `ZIP64: ${debug.zip64Detected ? 'Yes' : 'No'}\n`;
              errorDetail += `Central Directory: Offset=${debug.cdOffset}, Size=${debug.cdSize}, Expected=${debug.cdEntriesExpected} entries\n`;
              errorDetail += `CD Fetch: HTTP ${debug.cdStatus} (${debug.cdContentRange || 'N/A'}), Read=${debug.cdBytesRead} bytes\n`;
              errorDetail += `Entries Parsed: ${debug.entriesParsed}/${debug.cdEntriesExpected}\n`;
            }
            
            if (debug.parsingError) {
              errorDetail += `\n⚠️ PARSING ERROR:\n`;
              errorDetail += `Bad Offset: ${debug.parsingError.badOffset}\n`;
              if (debug.parsingError.signatureHex) {
                errorDetail += `Signature: 0x${debug.parsingError.signatureHex} (expected: 02014b50)\n`;
              }
              if (debug.parsingError.reason) {
                errorDetail += `Reason: ${debug.parsingError.reason}\n`;
              }
              errorDetail += `Entries Parsed Before Error: ${debug.parsingError.entriesParsedSoFar}\n`;
            }
          }
          
          if (debug.samplePaths && debug.samplePaths.length > 0) {
            errorDetail += `\n📁 Sample Paths (first 15):\n${debug.samplePaths.slice(0, 15).join('\n')}`;
          }
          
          setError(errorDetail);
          return;
        }

        // Check if streaming worked but all counts are zero
        if (response.data.ok === true && response.data.debug?.entriesParsed > 0) {
          const counts = response.data.counts || {};
          const totalCategorized = Object.values(counts).reduce((sum, val) => sum + (val || 0), 0);
          
          if (totalCategorized === 0) {
            const debug = response.data.debug;
            let warningMsg = `Indexed ${debug.entriesParsed} files but did not recognize Facebook structure.\n\n`;
            
            if (debug.samplePaths && debug.samplePaths.length > 0) {
              warningMsg += `Sample paths:\n${debug.samplePaths.slice(0, 15).join('\n')}\n\n`;
            }
            
            if (debug.rootPrefix) {
              warningMsg += `Root folder: ${debug.rootPrefix}\n\n`;
            }
            
            warningMsg += 'The archive may be in an unexpected format. Please contact support with this debug info.';
            setError(warningMsg);
            return;
          }
        }

        // Log analysis data for debugging
        console.log("[ArchiveDataViewer] ANALYSIS RAW:", response.data);
        
        setExtractedData(response.data);

        // Mark archive as organized after successful extraction
        if (onExtractionComplete) {
          onExtractionComplete();
        }

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
      <div className="space-y-4">
        {connectivityTest && (
          <Alert className={connectivityTest.error || !connectivityTest.summary?.canRandomAccess ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}>
            <AlertDescription className={connectivityTest.error || !connectivityTest.summary?.canRandomAccess ? 'text-red-800' : 'text-green-800'}>
              {connectivityTest.error ? (
                `Connectivity test error: ${connectivityTest.error}`
              ) : (
                <>
                  <strong>{connectivityTest.summary?.canRandomAccess ? '✓ ZIP accessible' : '✗ ZIP not accessible'}</strong>
                  {connectivityTest.summary?.issues?.length > 0 && (
                    <div className="mt-2 text-sm">
                      {connectivityTest.summary.issues.map((issue, i) => (
                        <div key={i}>• {issue}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
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
              <div className="flex gap-3 justify-center">
                <Button 
                  onClick={() => testRemoteZipConnectivity(archive.file_url)}
                  disabled={testingConnectivity || extracting}
                  variant="outline"
                >
                  {testingConnectivity ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
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
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <FacebookViewer data={extractedData} archiveUrl={archive.file_url} />;
}