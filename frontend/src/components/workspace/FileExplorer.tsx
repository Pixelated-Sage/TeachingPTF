'use client';
// frontend/src/components/workspace/FileExplorer.tsx
// Collapsible file tree sidebar with add/rename/delete actions.

import React from 'react';
import { ChevronLeft, FileCode, Plus } from 'lucide-react';
import { FileNode } from './types';

interface FileExplorerProps {
  explorerOpen: boolean;
  fileTree: FileNode[];
  setExplorerOpen: (open: boolean) => void;
  handleCreateFile: () => void;
  renderTreeNodes: (nodes: FileNode[], depth?: number) => React.ReactNode;
}

export default function FileExplorer({
  explorerOpen,
  fileTree,
  setExplorerOpen,
  handleCreateFile,
  renderTreeNodes,
}: FileExplorerProps) {
  if (explorerOpen) {
    return (
      <div className="w-52 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto h-full">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Workspace Tree</span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCreateFile}
              className="p-1 hover:bg-slate-850 hover:text-violet-400 text-slate-450 rounded transition-colors"
              title="New Root File"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setExplorerOpen(false)}
              className="p-1 hover:bg-slate-855 hover:text-violet-400 text-slate-455 rounded transition-colors"
              title="Collapse Tree"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="p-2 space-y-1">
          {renderTreeNodes(fileTree)}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setExplorerOpen(true)}
      className="flex-none bg-slate-900 border-r border-slate-800 w-10 hover:bg-slate-855/50 flex flex-col items-center pt-4 text-slate-450 hover:text-slate-200 cursor-pointer select-none transition-colors border-t border-slate-850/50"
      title="Open Explorer Tree"
    >
      <FileCode className="w-4 h-4 mb-2 text-violet-400/70" />
      <span className="text-[9px] uppercase font-bold tracking-widest [writing-mode:vertical-lr]">Files</span>
    </button>
  );
}
