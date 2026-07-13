'use client';
// frontend/src/components/workspace/BrowserPreviewPanel.tsx
// Address bar, iframe viewport, fullscreen mode, and empty placeholder state.

import React from 'react';
import { Globe, Maximize2, RefreshCw } from 'lucide-react';

interface BrowserPreviewPanelProps {
  previewUrl: string | null;
  previewUrlInput: string;
  /** Show the panel in fullscreen overlay mode */
  fullscreen?: boolean;
  setPreviewUrlInput: (val: string) => void;
  onConnect: () => void;
  onReload: () => void;
  onExitFullscreen?: () => void;
  onEnterFullscreen?: () => void;
}

export default function BrowserPreviewPanel({
  previewUrl,
  previewUrlInput,
  fullscreen = false,
  setPreviewUrlInput,
  onConnect,
  onReload,
  onExitFullscreen,
  onEnterFullscreen,
}: BrowserPreviewPanelProps) {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Fullscreen top bar */}
      {fullscreen && (
        <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800 p-3 shrink-0">
          <div className="flex items-center gap-2 text-slate-350 text-xs font-bold uppercase tracking-wider">
            <Globe className="w-4 h-4 text-violet-400 animate-pulse" />
            <span>Live App Viewport (Fullscreen Mode)</span>
          </div>
          <button
            onClick={onExitFullscreen}
            className="px-4 py-1.5 bg-slate-855 hover:bg-slate-800 text-slate-200 text-xs rounded-lg border border-slate-700 transition-colors shadow-md"
          >
            Exit Fullscreen (Esc)
          </button>
        </div>
      )}

      {/* Address Bar */}
      <div className="flex items-center gap-2 bg-slate-900 border-b border-slate-800 p-2 shrink-0">
        <div className="flex-grow flex items-center bg-slate-955 border border-slate-800 rounded-lg px-2 py-1.5 gap-2">
          <Globe className="w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={previewUrlInput}
            onChange={(e) => setPreviewUrlInput(e.target.value)}
            placeholder="Paste live server URL (e.g. localhost:3000)"
            className="bg-transparent border-none focus:outline-none text-xs text-slate-200 flex-grow placeholder-slate-600"
          />
        </div>
        <button
          onClick={onConnect}
          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg text-xs shadow-md transition-colors"
        >
          Connect
        </button>
        <button
          onClick={onReload}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-700"
          title="Reload Viewport"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        {!fullscreen && onEnterFullscreen && (
          <button
            onClick={onEnterFullscreen}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg transition-colors border border-slate-700"
            title="Maximize Viewport"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Viewport */}
      <div className="flex-grow relative bg-slate-955">
        {previewUrl ? (
          <>
            <iframe
              src={previewUrl}
              className="w-full h-full bg-white"
              title="WebContainer live preview"
            />
            {fullscreen && (
              <div className="bg-slate-900 border-t border-slate-800 px-3 py-1.5 text-[10px] text-slate-400 font-mono flex items-center justify-between select-none shrink-0">
                <span>💡 Use the terminal shell tab to view server console outputs.</span>
                <span className="text-violet-400">Preview sandboxed</span>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm p-6 text-center">
            <Globe className="w-8 h-8 text-slate-700 animate-pulse" />
            <span className="font-semibold text-slate-400">
              {fullscreen ? 'No active application loaded. Connect a URL above.' : 'Manual Preview Viewport'}
            </span>
            {!fullscreen && (
              <span className="text-[11px] text-slate-600 max-w-xs leading-relaxed">
                Copy the local URL printed in the terminal (e.g. localhost:3000), paste it in the address bar above, and click <b>Connect</b> to view your running server.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
