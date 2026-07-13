'use client';
// frontend/src/components/workspace/TerminalPanel.tsx
// xterm terminal tabs with add/close, npm install overlay, and browser preview toggle.
// Used in both live mode (compact, h-1/2) and test/assignment mode (full-height left half).

import React, { MutableRefObject } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { FitAddon } from 'xterm-addon-fit';
import { RunStatus } from './types';

interface TerminalTab {
  id: string;
  label: string;
}

interface TerminalPanelProps {
  terminalTabs: TerminalTab[];
  activeTabId: string;
  runStatus: RunStatus;
  previewOpen: boolean;
  /** Compact mode = live mode right panel (smaller tabs, no preview toggle label) */
  compact?: boolean;
  fitAddonsRef: MutableRefObject<Record<string, FitAddon>>;
  setActiveTabId: (id: string) => void;
  setPreviewOpen: (open: boolean) => void;
  handleAddTerminalTab: (label?: string, command?: string) => void;
  handleCloseTerminalTab: (id: string, e: React.MouseEvent) => void;
  initializeTerminalTab: (id: string, el: HTMLDivElement) => void;
}

export default function TerminalPanel({
  terminalTabs,
  activeTabId,
  runStatus,
  previewOpen,
  compact = false,
  fitAddonsRef,
  setActiveTabId,
  setPreviewOpen,
  handleAddTerminalTab,
  handleCloseTerminalTab,
  initializeTerminalTab,
}: TerminalPanelProps) {
  return (
    <div className="flex flex-col overflow-hidden h-full">
      {/* Terminals Header */}
      <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800 shrink-0 px-2 py-1">
        <div className={`flex items-center gap-1 overflow-x-auto ${compact ? 'max-w-[70%]' : 'max-w-[70%]'}`}>
          {terminalTabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => {
                setActiveTabId(tab.id);
                setTimeout(() => {
                  try { fitAddonsRef.current[tab.id]?.fit(); } catch (e) {}
                }, 50);
              }}
              className={`flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                activeTabId === tab.id
                  ? 'bg-slate-800 text-slate-200 border border-slate-700'
                  : 'text-slate-500 hover:text-slate-350 hover:bg-slate-850/50'
              }`}
            >
              <span className={`truncate ${compact ? 'max-w-[60px]' : 'max-w-[80px]'}`}>{tab.label}</span>
              {terminalTabs.length > 1 && (
                <span
                  onClick={(e) => handleCloseTerminalTab(tab.id, e)}
                  className="text-[10px] text-slate-500 hover:text-rose-405 hover:bg-slate-700 px-1 rounded ml-0.5"
                  title="Close Tab"
                >
                  ✕
                </span>
              )}
            </div>
          ))}
          <button
            onClick={() => handleAddTerminalTab()}
            className={`${compact ? 'p-0.5' : 'p-1'} hover:bg-slate-800 text-slate-450 hover:text-violet-400 rounded transition-colors`}
            title="New Terminal"
          >
            <Plus className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          </button>
        </div>

        {/* Browser Preview Toggle */}
        <button
          onClick={() => setPreviewOpen(!previewOpen)}
          className={`flex items-center gap-1 hover:bg-slate-800 border border-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors ${
            compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'
          }`}
        >
          <span>{previewOpen ? (compact ? 'Hide Browser' : 'Hide Browser Preview') : (compact ? 'Show Browser' : 'Show Browser Preview')}</span>
        </button>
      </div>

      {/* Terminal Container */}
      <div className="flex-grow relative bg-slate-955 overflow-hidden">
        {terminalTabs.map(tab => (
          <div
            key={tab.id}
            ref={(el) => { if (el) initializeTerminalTab(tab.id, el as HTMLDivElement); }}
            className={`absolute inset-0 p-2 ${activeTabId === tab.id ? 'block' : 'hidden'}`}
          />
        ))}

        {/* npm install overlay */}
        {runStatus === 'installing' && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 select-none z-10">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
              <RefreshCw className="w-4 h-4 text-violet-400 animate-spin" />
              <span className="text-xs text-slate-200 font-semibold font-mono">📦 Installing packages… (please wait)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
