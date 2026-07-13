'use client';
// frontend/src/components/workspace/CodeEditorPanel.tsx
// Monaco code editor with paste-block badge, breadcrumb, and status bar.
// Used in both live mode and test/assignment mode.

import React from 'react';
import Editor from '@monaco-editor/react';
import { AlertTriangle } from 'lucide-react';

interface CodeEditorPanelProps {
  code: string;
  activeFilePath: string;
  lastSyncedTimestamp: string | null;
  /** Show the breadcrumb bar (test/assignment mode) */
  showBreadcrumb?: boolean;
  /** Show the status bar (test/assignment mode) */
  showStatusBar?: boolean;
  setCode: (val: string) => void;
}

function getLanguage(path: string): string {
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.jsx') || path.endsWith('.tsx')) return 'javascript';
  return 'javascript';
}

export default function CodeEditorPanel({
  code,
  activeFilePath,
  lastSyncedTimestamp,
  showBreadcrumb = false,
  showStatusBar = false,
  setCode,
}: CodeEditorPanelProps) {
  return (
    <div className="flex-grow flex flex-col bg-slate-950 h-full overflow-hidden min-w-0">
      {/* Breadcrumb (test/assignment mode) */}
      {showBreadcrumb && (
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 text-xs font-mono text-slate-400 flex items-center gap-2 shrink-0 select-none">
          <span className="text-slate-500">workspace</span>
          <span className="text-slate-600">/</span>
          {activeFilePath.split('/').map((part, i, arr) => (
            <React.Fragment key={part}>
              <span className={i === arr.length - 1 ? 'text-violet-400 font-semibold' : 'text-slate-400'}>
                {part}
              </span>
              {i < arr.length - 1 && <span className="text-slate-600">/</span>}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="flex-grow relative overflow-hidden w-full h-full min-w-0">
        <div className="absolute inset-0 overflow-hidden">
          {/* Paste Block Badge */}
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-full pointer-events-none">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Paste Block Enabled</span>
          </div>

          <Editor
            height="100%"
            width="100%"
            theme="vs-dark"
            defaultLanguage="javascript"
            language={getLanguage(activeFilePath)}
            value={code}
            onChange={(val) => setCode(val || '')}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              wordWrap: 'on',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              suggestOnTriggerCharacters: true,
              quickSuggestions: { other: true, comments: true, strings: true },
              formatOnPaste: true,
              formatOnType: true,
            }}
          />
        </div>
      </div>

      {/* Status Bar (test/assignment mode) */}
      {showStatusBar && (
        <div className="bg-slate-900 border-t border-slate-800 px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-400 select-none shrink-0 font-mono">
          <div className="flex items-center gap-4">
            <span className="text-violet-400 font-semibold">{activeFilePath}</span>
            <span>Spaces: 2</span>
            <span>UTF-8</span>
          </div>
          <div className="flex items-center gap-2">
            {lastSyncedTimestamp ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Saved at {new Date(lastSyncedTimestamp).toLocaleTimeString()}</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                <span>Unsaved changes (saving…)</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
