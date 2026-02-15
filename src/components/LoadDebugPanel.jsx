import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";

export default function LoadDebugPanel({ logs, isLoading }) {
  if (!logs || logs.length === 0) return null;

  const latestLog = logs[logs.length - 1];

  return (
    <Card className="bg-blue-50 border-blue-300 mb-4">
      <CardContent className="p-3 text-xs font-mono space-y-2">
        <div className="font-bold text-blue-900">📋 Load Debug Log:</div>
        
        <div className="space-y-1 max-h-60 overflow-y-auto bg-white p-2 rounded border border-blue-200">
          {logs.map((log, i) => (
            <div key={i} className={`text-xs ${log.level === 'error' ? 'text-red-600' : log.level === 'success' ? 'text-green-600' : 'text-gray-700'}`}>
              <span className="font-semibold">[{log.category}]</span> {log.message}
            </div>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-blue-700 font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        )}

        {latestLog && !isLoading && (
          <div className="flex items-center gap-2">
            {latestLog.level === 'error' ? (
              <>
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-red-600 font-semibold">Error: {latestLog.message}</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-green-600 font-semibold">Success: {latestLog.itemsCount} items</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}