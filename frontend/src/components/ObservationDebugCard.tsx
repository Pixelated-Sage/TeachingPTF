// frontend/src/components/ObservationDebugCard.tsx
// Standalone Observation Debug Card for the instructor to self-verify rule telemetry.
// Renders as a fixed-position panel in the top-right corner.

import React from 'react';

interface ObservationDebugCardProps {
  classroomId: string;
  mode: 'live' | 'test' | 'assignment';
  tabSwitches: number;
  pasteAttempts: number;
  idleState: 'active' | 'idle';
  idleDurationSeconds: number;
  lastSyncedTimestamp: string | null;
  backendConnected: boolean;
  socketConnected: boolean;
  headingsReached: number[];
  cacheSizeBytes: number;
  webcontainerStatus: 'idle' | 'booting' | 'booted' | 'error';
  activeSectionTitle: string;
  notesScrollPercent: number;
  maxScrollDepth: number;
  dwellTimesMap: Record<string, number>;
}

export default function ObservationDebugCard({
  classroomId,
  mode,
  tabSwitches,
  pasteAttempts,
  idleState,
  idleDurationSeconds,
  lastSyncedTimestamp,
  backendConnected,
  socketConnected,
  headingsReached,
  cacheSizeBytes,
  webcontainerStatus,
  activeSectionTitle,
  notesScrollPercent,
  maxScrollDepth,
  dwellTimesMap
}: ObservationDebugCardProps) {
  const [position, setPosition] = React.useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStart = React.useRef({ x: 0, y: 0 });
  const positionStart = React.useRef({ x: 16, y: 16 });

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.drag-handle') || target.tagName === 'SPAN') {
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      positionStart.current = { ...position };
      e.preventDefault();
    }
  };

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPosition({
        x: Math.max(10, positionStart.current.x - dx),
        y: Math.max(10, positionStart.current.y + dy)
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div 
      style={{ top: `${position.y}px`, right: `${position.x}px`, left: 'auto' }}
      className="fixed z-[9999] w-80 bg-slate-900/95 border border-violet-500/30 rounded-xl p-4 shadow-xl shadow-slate-950/50 backdrop-blur-md select-none font-sans text-slate-100 max-h-[85vh] overflow-y-auto custom-notes-scrollbar"
    >
      <div 
        onMouseDown={handleMouseDown}
        className="drag-handle flex items-center justify-between pb-2.5 border-b border-slate-800 cursor-grab active:cursor-grabbing"
      >
        <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest pointer-events-none">Observation Diagnostics</span>
        <div className="flex items-center gap-1.5 pointer-events-none">
          <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="text-[9px] text-slate-400 uppercase font-mono">
            {socketConnected ? 'Sockets Active' : 'Sockets Offline'}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-2.5 text-xs">
        {/* Connection States */}
        <div className="grid grid-cols-2 gap-2 pb-2 border-b border-slate-800/40">
          <div className="flex flex-col gap-0.5 bg-slate-950/40 p-2 rounded border border-slate-850">
            <span className="text-[9px] text-slate-550 uppercase tracking-wider">REST API Connection</span>
            <span className={`font-bold ${backendConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
              {backendConnected ? 'Connected' : 'Offline'}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 bg-slate-950/40 p-2 rounded border border-slate-850">
            <span className="text-[9px] text-slate-550 uppercase tracking-wider">WebContainer Boot</span>
            <span className={`font-bold capitalize ${
              webcontainerStatus === 'booted' 
                ? 'text-emerald-400' 
                : webcontainerStatus === 'booting' 
                ? 'text-amber-400 animate-pulse' 
                : 'text-slate-500'
            }`}>
              {webcontainerStatus}
            </span>
          </div>
        </div>

        {/* Scroll Progress & Max Depth */}
        <div className="bg-slate-950/50 border border-slate-850 rounded p-2.5 space-y-1.5">
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-slate-500 uppercase tracking-wider">Note Scroll Progress</span>
            <span className="font-bold text-violet-400">{notesScrollPercent}% Read</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-violet-500 to-indigo-500 h-1.5 rounded-full transition-all duration-300" 
              style={{ width: `${notesScrollPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[9px] text-slate-400 font-mono pt-1">
            <span>Furthest Scrolled:</span>
            <span className="font-bold text-slate-200">{maxScrollDepth}% Depth</span>
          </div>
        </div>

        {/* Workspace Info */}
        <div className="flex justify-between">
          <span className="text-slate-500">Classroom ID:</span>
          <span className="text-slate-350 font-mono font-bold">{classroomId}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-500">Workspace Mode:</span>
          <span className={`font-mono font-bold uppercase ${mode === 'test' ? 'text-amber-400' : 'text-violet-400'}`}>
            {mode}
          </span>
        </div>

        {/* Active notes sub-topic heading */}
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Active Section:</span>
          <span className="text-violet-400 font-bold truncate max-w-[150px]" title={activeSectionTitle || 'Introduction'}>
            {activeSectionTitle || 'Introduction'}
          </span>
        </div>

        {/* Telemetry Mishap Counts */}
        <div className="flex justify-between">
          <span className="text-slate-500">Tab Switch Count:</span>
          <span className="text-slate-200 font-mono font-bold">{tabSwitches}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-500">Paste Block Count:</span>
          <span className="text-slate-200 font-mono font-bold">{pasteAttempts}</span>
        </div>

        {/* Keystroke Idle state */}
        <div className="flex justify-between">
          <span className="text-slate-500">Keystroke Idle State:</span>
          <span className={`font-mono font-bold capitalize ${idleState === 'idle' ? 'text-amber-500 animate-pulse' : 'text-emerald-500'}`}>
            {idleState}
          </span>
        </div>

        {idleState === 'idle' && (
          <div className="flex justify-between">
            <span className="text-slate-500">Idle Duration:</span>
            <span className="text-amber-500 font-mono font-bold">{idleDurationSeconds}s</span>
          </div>
        )}

        {/* Local Storage Cache */}
        <div className="flex justify-between">
          <span className="text-slate-500">Local Cache Size:</span>
          <span className="text-slate-300 font-mono">
            {cacheSizeBytes > 0 ? `${(cacheSizeBytes / 1024).toFixed(2)} KB` : 'Empty'}
          </span>
        </div>

        {/* Section Dwell Times */}
        <div className="pt-2 border-t border-slate-800/40 flex flex-col gap-1.5">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">Heading Dwell Durations</span>
          {Object.keys(dwellTimesMap).length === 0 ? (
            <span className="text-[10px] text-slate-600 font-mono italic">No dwell metrics yet</span>
          ) : (
            <div className="bg-slate-950/40 border border-slate-850/60 rounded p-2 max-h-32 overflow-y-auto space-y-1.5 custom-notes-scrollbar">
              {Object.entries(dwellTimesMap).map(([title, seconds]) => (
                <div key={title} className="flex justify-between text-[10px] font-mono">
                  <span className="text-slate-400 truncate max-w-[170px]" title={title}>{title}</span>
                  <span className="text-violet-400 font-bold shrink-0">{seconds}s</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scrolled note sections */}
        <div className="flex flex-col gap-1 pt-2 border-t border-slate-800/40">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">Explored Note Headings</span>
          <span className="font-mono text-slate-300 truncate max-w-full text-[10px]">
            {headingsReached.length > 0 ? headingsReached.join(' → ') : 'None'}
          </span>
        </div>

        {/* Last synced timestamp */}
        <div className="pt-2 border-t border-slate-850 flex flex-col gap-0.5">
          <span className="text-[9px] text-slate-550 uppercase tracking-wider">Database Sync Status</span>
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <span>Last Saved:</span>
            <span>{lastSyncedTimestamp ? new Date(lastSyncedTimestamp).toLocaleTimeString() : 'Pending'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
