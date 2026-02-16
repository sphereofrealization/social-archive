// Unified media loading helper for all tabs (Photos, Videos, Posts)
import { base44 } from "@/api/base44Client";

export async function loadZipMediaAsObjectUrl({ zipUrl, entryPath, onProgress }) {
  const debugLog = [];
  
  try {
    debugLog.push({
      step: 'MEDIA_CLICK',
      entryPath,
      timestamp: new Date().toISOString()
    });
    
    if (onProgress) onProgress(debugLog);
    
    // Call backend to get media
    const response = await base44.functions.invoke('getArchiveEntry', {
      zipUrl,
      entryPath,
      responseType: 'base64'
    });
    
    debugLog.push({
      step: 'MEDIA_RESPONSE',
      ok: response.status === 200,
      status: response.status,
      mimeType: response.data?.mime,
      base64Len: response.data?.content?.length || 0,
      error: response.data?.error
    });
    
    if (onProgress) onProgress(debugLog);
    
    if (response.status !== 200 || !response.data?.content) {
      throw new Error(`HTTP ${response.status}: ${response.data?.error || 'No content'}`);
    }
    
    // Decode base64 to bytes
    const base64 = response.data.content;
    const mimeType = response.data.mime || 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    // Log magic bytes (first 16 bytes in hex)
    const first16Hex = Array.from(bytes.slice(0, 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    debugLog.push({
      step: 'MEDIA_MAGIC',
      first16Hex,
      isJpeg: first16Hex.startsWith('ffd8ff'),
      isPng: first16Hex.startsWith('89504e47'),
      isMp4: first16Hex.includes('66747970') // 'ftyp' signature
    });
    
    if (onProgress) onProgress(debugLog);
    
    // Create blob and object URL
    const blob = new Blob([bytes], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    
    debugLog.push({
      step: 'MEDIA_OBJECT_URL',
      created: objectUrl,
      byteLength: bytes.length,
      mimeType
    });
    
    if (onProgress) onProgress(debugLog);
    
    return {
      objectUrl,
      mimeType,
      byteLength: bytes.length,
      debugLog
    };
  } catch (err) {
    debugLog.push({
      step: 'MEDIA_ERROR',
      error: err.message,
      stack: err.stack
    });
    
    if (onProgress) onProgress(debugLog);
    
    throw err;
  }
}