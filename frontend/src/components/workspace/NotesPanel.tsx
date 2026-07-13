'use client';
// frontend/src/components/workspace/NotesPanel.tsx
// Left sidebar: reference notes list directory + markdown reader view.

import React from 'react';
import { BookOpen } from 'lucide-react';
import { NotesData } from './types';

interface NotesPanelProps {
  notesList: NotesData[];
  activeNote: NotesData | null;
  activeNotesView: 'list' | 'reader';
  notesLoading: boolean;
  parseMarkdown: (content: string) => React.ReactNode;
  onSelectNote: (topicNumber: number) => void;
  onBackToList: () => void;
}

export default function NotesPanel({
  notesList,
  activeNote,
  activeNotesView,
  notesLoading,
  parseMarkdown,
  onSelectNote,
  onBackToList,
}: NotesPanelProps) {
  return (
    <div className="flex flex-col h-full w-80 relative overflow-hidden">

      {/* View A: Notes List Directory */}
      <div
        className={`absolute inset-0 flex flex-col bg-slate-900 transition-transform duration-300 ${
          activeNotesView === 'list' ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-violet-400 font-semibold shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            <span>Reference Notes</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 select-none">
          <div className="flex items-center gap-1.5 text-xs text-amber-500 font-mono pl-1 mb-2">
            <span>📂</span>
            <span className="font-bold">reference_notes/</span>
          </div>
          {notesList.map((note) => (
            <div
              key={note.id}
              onClick={() => onSelectNote(note.topicNumber)}
              className="flex items-center gap-3 p-3 bg-slate-950/40 hover:bg-slate-950/80 border border-slate-850 hover:border-violet-500/30 rounded-xl cursor-pointer transition-all duration-200"
            >
              <span className="text-violet-400 text-lg">📄</span>
              <div className="flex-1 min-w-0">
                <span className="text-slate-200 text-xs font-semibold block truncate">
                  {note.title.replace(/^\d+\.\s*/, '')}.md
                </span>
                <span className="text-[10px] text-slate-500 block font-mono">
                  Topic {note.topicNumber}
                </span>
              </div>
              <span className="text-slate-500 text-xs font-bold font-mono">→</span>
            </div>
          ))}
        </div>
      </div>

      {/* View B: Active Note Reader */}
      <div
        className={`absolute inset-0 flex flex-col bg-slate-950 transition-transform duration-300 ${
          activeNotesView === 'reader' ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <button
            onClick={onBackToList}
            className="flex items-center gap-1.5 text-xs text-violet-450 hover:text-violet-350 font-bold transition-colors"
          >
            <span>←</span>
            <span>Notes Directory</span>
          </button>
          <span className="text-[10px] text-slate-500 font-mono">
            Topic {activeNote?.topicNumber}
          </span>
        </div>
        <div
          id="notes-scroll-container"
          className="flex-1 overflow-y-auto p-5 scroll-smooth bg-slate-950/40"
        >
          {notesLoading ? (
            <div className="space-y-4 animate-pulse py-4">
              <div className="h-7 bg-slate-800 rounded-md w-3/4 mb-4"></div>
              <div className="h-4 bg-slate-850 rounded-md w-full"></div>
              <div className="h-4 bg-slate-850 rounded-md w-5/6"></div>
              <div className="h-4 bg-slate-850 rounded-md w-4/5 mb-6"></div>
              <div className="h-6 bg-slate-800 rounded-md w-1/2 mb-3"></div>
              <div className="h-4 bg-slate-850 rounded-md w-full"></div>
              <div className="h-4 bg-slate-850 rounded-md w-11/12"></div>
            </div>
          ) : activeNote ? (
            parseMarkdown(activeNote.markdownContent)
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 py-10">
              <BookOpen className="w-8 h-8 mb-2 text-slate-600 animate-bounce" />
              <p className="text-sm">Select a note to read.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
