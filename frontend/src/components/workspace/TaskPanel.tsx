'use client';
// frontend/src/components/workspace/TaskPanel.tsx
// Right sidebar: handles Quick Question, Live Doubt Support, and Test/Assignment task + reasoning.
// Also renders the collapsed (icon-only) tab strip when taskOpen=false.

import React, { MutableRefObject } from 'react';
import {
  HelpCircle,
  ChevronRight,
  CheckCircle,
  Send,
  Clock,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { FitAddon } from 'xterm-addon-fit';
import { WorkspaceMode, RunStatus } from './types';

interface TerminalTab { id: string; label: string; }

interface TaskPanelProps {
  taskOpen: boolean;
  mode: WorkspaceMode;
  quickQuestion: string | null;
  quickQuestionTimeLeft: number;
  qqReasoning: string;
  activeQuestion: any;
  currentQuestionIndex: number;
  questionsList: any[];
  activeAssignment: any;
  testTimeLeft: number;
  reasoningAnswer: string;
  isSubmittingRef: MutableRefObject<boolean>;
  previewOpen: boolean;
  // Terminal props (live mode top-half terminal)
  terminalTabs: TerminalTab[];
  activeTabId: string;
  runStatus: RunStatus;
  fitAddonsRef: MutableRefObject<Record<string, FitAddon>>;
  // Setters
  setTaskOpen: (open: boolean) => void;
  setQqReasoning: (val: string) => void;
  setReasoningAnswer: (val: string) => void;
  setActiveTabId: (id: string) => void;
  setPreviewOpen: (open: boolean) => void;
  // Handlers
  handleSubmitQuickQuestion: () => void;
  handleRaiseHand: () => void;
  handleSubmitSolution: () => void;
  handleAddTerminalTab: (label?: string, command?: string) => void;
  handleCloseTerminalTab: (id: string, e: React.MouseEvent) => void;
  initializeTerminalTab: (id: string, el: HTMLDivElement) => void;
}

export default function TaskPanel({
  taskOpen,
  mode,
  quickQuestion,
  quickQuestionTimeLeft,
  qqReasoning,
  activeQuestion,
  currentQuestionIndex,
  questionsList,
  activeAssignment,
  testTimeLeft,
  reasoningAnswer,
  isSubmittingRef,
  previewOpen,
  terminalTabs,
  activeTabId,
  runStatus,
  fitAddonsRef,
  setTaskOpen,
  setQqReasoning,
  setReasoningAnswer,
  setActiveTabId,
  setPreviewOpen,
  handleSubmitQuickQuestion,
  handleRaiseHand,
  handleSubmitSolution,
  handleAddTerminalTab,
  handleCloseTerminalTab,
  initializeTerminalTab,
}: TaskPanelProps) {
  // Collapsed tab strip
  if (!taskOpen) {
    return (
      <button
        onClick={() => setTaskOpen(true)}
        className="flex-none bg-slate-900 border-l border-slate-800 w-10 hover:bg-slate-855/50 flex flex-col items-center pt-4 text-slate-455 hover:text-slate-200 cursor-pointer select-none transition-colors"
        title="Open Task Sidebar"
      >
        <HelpCircle className="w-4 h-4 mb-2 text-violet-400/70" />
        <span className="text-[9px] uppercase font-bold tracking-widest [writing-mode:vertical-lr]">Task Prompt</span>
      </button>
    );
  }

  return (
    <div className="w-80 flex-none bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">

      {/* ── Quick Question mode ── */}
      {quickQuestion ? (
        <>
          <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-violet-400 font-semibold shrink-0">
            <div className="flex items-center gap-2">
              <span className="animate-pulse w-2 h-2 rounded-full bg-violet-500" />
              <span className="text-xs uppercase tracking-wider font-extrabold text-slate-200">Quick Pop-Quiz</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800 font-mono text-[10px] text-violet-400">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>Time: {quickQuestionTimeLeft}s</span>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto p-5 flex flex-col gap-5">
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Question Prompt</h3>
              <p className="text-sm text-slate-200 leading-relaxed bg-slate-950 p-4 border border-slate-800 rounded-lg italic">
                "{quickQuestion}"
              </p>
            </div>
            <div className="flex-grow flex flex-col gap-2 min-h-[220px]">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Your Written Answer</h3>
              <textarea
                placeholder="Explain your conceptual logic or reasoning here..."
                value={qqReasoning}
                onChange={(e) => setQqReasoning(e.target.value)}
                className="flex-grow w-full p-4 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none resize-none leading-relaxed"
              />
            </div>
          </div>

          <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
            <button
              onClick={handleSubmitQuickQuestion}
              className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98]"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Submit Answer</span>
            </button>
          </div>
        </>

      /* ── Live mode: Terminal top + Doubt Support bottom ── */
      ) : mode === 'live' ? (
        <>
          {/* Top Half: Terminal */}
          <div className="h-1/2 flex flex-col border-b border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800 shrink-0 px-2 py-1">
              <div className="flex items-center gap-1 overflow-x-auto max-w-[70%]">
                {terminalTabs.map(tab => (
                  <div
                    key={tab.id}
                    onClick={() => {
                      setActiveTabId(tab.id);
                      setTimeout(() => { try { fitAddonsRef.current[tab.id]?.fit(); } catch (e) {} }, 50);
                    }}
                    className={`flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                      activeTabId === tab.id
                        ? 'bg-slate-800 text-slate-200 border border-slate-700'
                        : 'text-slate-500 hover:text-slate-350 hover:bg-slate-850/50'
                    }`}
                  >
                    <span className="truncate max-w-[60px]">{tab.label}</span>
                    {terminalTabs.length > 1 && (
                      <span
                        onClick={(e) => handleCloseTerminalTab(tab.id, e)}
                        className="text-[10px] text-slate-500 hover:text-rose-405 hover:bg-slate-700 px-1 rounded ml-1"
                        title="Close Tab"
                      >✕</span>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => handleAddTerminalTab()}
                  className="p-0.5 hover:bg-slate-800 text-slate-450 hover:text-violet-400 rounded transition-colors"
                  title="New Terminal"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <button
                onClick={() => setPreviewOpen(!previewOpen)}
                className="flex items-center gap-0.5 px-2 py-0.5 hover:bg-slate-800 border border-slate-800 rounded text-[9px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span>{previewOpen ? 'Hide Browser' : 'Show Browser'}</span>
              </button>
            </div>

            <div className="flex-grow relative bg-slate-955 overflow-hidden">
              {terminalTabs.map(tab => (
                <div
                  key={tab.id}
                  ref={(el) => { if (el) initializeTerminalTab(tab.id, el as HTMLDivElement); }}
                  className={`absolute inset-0 p-2 ${activeTabId === tab.id ? 'block' : 'hidden'}`}
                />
              ))}
            </div>
          </div>

          {/* Bottom Half: Live Doubt Support */}
          <div className="h-1/2 flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-violet-400 font-semibold shrink-0">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4" />
                <span>Live Doubt Support</span>
              </div>
              <button
                onClick={() => setTaskOpen(false)}
                className="p-1 hover:bg-slate-850 hover:text-violet-400 text-slate-455 rounded transition-colors"
                title="Collapse Sidebar"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="bg-slate-950 border border-slate-850 p-5 rounded-xl flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-violet-950/40 border border-violet-900/30 flex items-center justify-center text-violet-400">
                  <HelpCircle className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">Need Assistance?</h4>
                  <p className="text-slate-455 text-[11px] mt-1 leading-relaxed">
                    Click the button below to notify your live instructor that you have a doubt or need explanation.
                  </p>
                </div>
                <button
                  onClick={handleRaiseHand}
                  className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg text-xs shadow-md transition-colors"
                >
                  Raise Hand / Doubt
                </button>
              </div>
            </div>

            {activeQuestion && (
              <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
                <button
                  onClick={handleSubmitSolution}
                  disabled={isSubmittingRef.current}
                  className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  <span>Submit Solution Code</span>
                </button>
              </div>
            )}
          </div>
        </>

      /* ── Test / Assignment mode ── */
      ) : (
        <>
          <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-violet-400 font-semibold shrink-0">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              <span>{mode === 'test' ? 'Test Task Info' : mode === 'assignment' ? 'Assignment Task Info' : 'Live Doubt Support'}</span>
            </div>
            <button
              onClick={() => setTaskOpen(false)}
              className="p-1 hover:bg-slate-850 hover:text-violet-400 text-slate-455 rounded transition-colors"
              title="Collapse Sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-grow overflow-y-auto p-5">
            {mode === 'test' || mode === 'assignment' ? (
              <div className="space-y-6">
                {activeQuestion ? (
                  <>
                    <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 font-mono">
                        Question {currentQuestionIndex + 1} of {mode === 'test' ? questionsList.length : activeAssignment?.questions?.length || 0}
                      </span>
                      {testTimeLeft < 999999 ? (
                        <span className="text-xs font-bold text-amber-400 bg-amber-955/20 border border-amber-900/30 px-2.5 py-0.5 rounded font-mono">
                          Time Left: {testTimeLeft}s
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-slate-450 bg-slate-950/20 border border-slate-850 px-2.5 py-0.5 rounded font-mono">
                          Untimed
                        </span>
                      )}
                    </div>

                    {activeQuestion.codeTaskPrompt && (
                      <div>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Coding Challenge</h3>
                        <p className="text-sm text-slate-200 leading-relaxed bg-slate-950 p-4 border border-slate-800 rounded-lg">
                          {activeQuestion.codeTaskPrompt}
                        </p>
                      </div>
                    )}

                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reasoning Prompt</h3>
                      <p className="text-sm text-slate-200 leading-relaxed bg-slate-950 p-4 border border-slate-800 rounded-lg mb-4">
                        {activeQuestion.reasoningPrompt}
                      </p>

                      {activeQuestion.reasoningType === 'mcq' ? (
                        <div className="space-y-2.5">
                          {activeQuestion.options?.map((opt: string, i: number) => (
                            <label
                              key={i}
                              className={`flex items-center gap-3 p-3 bg-slate-950 border rounded-lg cursor-pointer transition-all duration-200 text-sm ${
                                reasoningAnswer === opt
                                  ? 'border-violet-500 text-slate-100 bg-violet-950/20'
                                  : 'border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <input
                                type="radio"
                                name="mcq"
                                value={opt}
                                checked={reasoningAnswer === opt}
                                onChange={(e) => setReasoningAnswer(e.target.value)}
                                className="text-violet-600 focus:ring-0 focus:ring-offset-0 bg-slate-955 border-slate-800"
                              />
                              <span>{opt}</span>
                            </label>
                          ))}
                        </div>
                      ) : activeQuestion.reasoningType === 'multi_select' ? (
                        <div className="space-y-2.5">
                          {activeQuestion.options?.map((opt: string, i: number) => {
                            const answers = reasoningAnswer ? reasoningAnswer.split(', ') : [];
                            const checked = answers.includes(opt);
                            return (
                              <label
                                key={i}
                                className={`flex items-center gap-3 p-3 bg-slate-955 border rounded-lg cursor-pointer transition-all duration-200 text-sm ${
                                  checked
                                    ? 'border-violet-500 text-slate-100 bg-violet-955/20'
                                    : 'border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  value={opt}
                                  checked={checked}
                                  onChange={(e) => {
                                    const nextAnswers = e.target.checked
                                      ? [...answers, opt]
                                      : answers.filter(a => a !== opt);
                                    setReasoningAnswer(nextAnswers.join(', '));
                                  }}
                                  className="text-violet-605 rounded focus:ring-0 focus:ring-offset-0 bg-slate-950 border-slate-800"
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <textarea
                          placeholder="Write your reasoning or answer logic explanation here..."
                          value={reasoningAnswer}
                          onChange={(e) => setReasoningAnswer(e.target.value)}
                          className="w-full min-h-[120px] p-4 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none resize-none"
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-slate-400 py-10 text-sm flex flex-col items-center gap-4 bg-slate-950/40 p-6 border border-slate-850 rounded-xl">
                    <CheckCircle className="w-10 h-10 text-emerald-500 animate-pulse" />
                    <div>
                      <h4 className="font-bold text-slate-200 text-sm">Assignment Completed!</h4>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        You have successfully submitted answers for all questions. You can review your workspace code or return to the dashboard.
                      </p>
                    </div>
                    <button
                      onClick={() => window.location.href = '/dashboard'}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-colors"
                    >
                      Return to Dashboard
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Live mode without active question */
              <div className="h-full flex flex-col justify-center items-center gap-4 text-center p-4">
                <div className="w-12 h-12 rounded-full bg-violet-955/40 border border-violet-900/30 flex items-center justify-center text-violet-400">
                  <HelpCircle className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">Need Assistance?</h4>
                  <p className="text-slate-455 text-[11px] mt-1 leading-relaxed">
                    Click the button below to notify your live instructor that you have a doubt or need explanation.
                  </p>
                </div>
                <button
                  onClick={handleRaiseHand}
                  className="w-full py-3 bg-violet-605 hover:bg-violet-600 text-white font-medium rounded-lg text-xs shadow-md transition-colors"
                >
                  Raise Hand / Doubt
                </button>
              </div>
            )}
          </div>

          {activeQuestion && (
            <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
              <button
                onClick={handleSubmitSolution}
                disabled={isSubmittingRef.current}
                className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                <span>{mode === 'test' ? 'Submit Question Answer' : mode === 'assignment' ? 'Submit Assignment Question' : 'Submit Solution Code'}</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
