'use client';
// frontend/src/components/workspace/WorkspaceHeader.tsx
// Platform header bar: logo, title, live badge, student info, action buttons.

import React from 'react';
import { CheckCircle, ChevronLeft, Download, RefreshCw } from 'lucide-react';
import { WorkspaceMode } from './types';

interface WorkspaceHeaderProps {
  mode: WorkspaceMode;
  student: { name: string; rollNumber: string };
  liveSessionActive: boolean;
  lastSyncedTimestamp: string | null;
  downloadingZip: boolean;
  onSaveCode: () => void;
  onDownloadCode: () => void;
  onDashboard: () => void;
}

export default function WorkspaceHeader({
  mode,
  student,
  liveSessionActive,
  lastSyncedTimestamp,
  downloadingZip,
  onSaveCode,
  onDownloadCode,
  onDashboard,
}: WorkspaceHeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-500/10">
          <span className="text-white font-extrabold text-sm">L</span>
        </div>
        <span className="font-bold text-slate-100 hidden sm:inline-block">
          {mode === 'test' ? 'Classroom Exam Space' : 'Live Classroom Workspace'}
        </span>

        {/* Live Status Badge */}
        {mode === 'live' && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${
            liveSessionActive
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-800 border-slate-700 text-slate-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${liveSessionActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            <span>{liveSessionActive ? 'Live' : 'Offline'}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right hidden md:block">
          <div className="text-sm font-semibold text-slate-200">{student.name}</div>
          <div className="text-xs text-slate-400 font-mono">
            Roll: {student.rollNumber}
            {lastSyncedTimestamp && (
              <span className="text-[10px] text-emerald-400 block font-normal">
                Saved: {new Date(lastSyncedTimestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {mode !== 'test' && (
          <button
            onClick={onSaveCode}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Save Code</span>
          </button>
        )}

        <button
          onClick={onDownloadCode}
          disabled={downloadingZip}
          className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs transition-all shadow-md disabled:opacity-50"
        >
          {downloadingZip ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          <span>Download Code</span>
        </button>

        <button
          onClick={onDashboard}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </button>
      </div>
    </header>
  );
}
