'use client';

import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  ShieldAlert, 
  Clock, 
  ClipboardList, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  Activity, 
  FileText, 
  CheckCircle, 
  XCircle, 
  RefreshCw 
} from 'lucide-react';

interface StudentProfileProps {
  studentId: string;
  adminToken: string;
  backendUrl: string;
  onBack: () => void;
}

export default function StudentProfile({ studentId, adminToken, backendUrl, onBack }: StudentProfileProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);
  
  // Expanded timeline item IDs
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [submissionsFilter, setSubmissionsFilter] = useState<'All' | 'Live' | 'QuickQuestion' | 'Assignment' | 'Test'>('All');

  const fetchProfileData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/admin/student/${studentId}/profile`, {
        headers: { 'Authorization': adminToken }
      });
      if (!res.ok) throw new Error('Failed to load student profile data');
      const profileData = await res.json();
      setData(profileData);
    } catch (err: any) {
      setError(err.message || 'Error loading profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (studentId && adminToken) {
      fetchProfileData();
    }
  }, [studentId, adminToken]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <RefreshCw className="w-6 h-6 text-violet-500 animate-spin" />
        <span className="text-slate-500 text-xs">Loading student profile...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-4">
        <div className="text-rose-400 text-sm font-semibold">{error || 'Failed to load profile.'}</div>
        <button 
          onClick={onBack}
          className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-200 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      </div>
    );
  }

  const { student, mishaps, liveSubmissions, testSubmissions, assignmentSubmissions, assignments, notes } = data;

  // Aggregate mishaps counts
  const mishapCounts = mishaps.reduce((acc: Record<string, number>, curr: any) => {
    acc[curr.type] = (acc[curr.type] || 0) + 1;
    return acc;
  }, { tab_switch: 0, inactivity: 0, paste_attempt: 0 });

  // Compile unified submissions list
  const allSubmissions = [
    ...liveSubmissions.map((s: any) => ({ ...s, category: 'Live' })),
    ...testSubmissions.map((s: any) => ({ ...s, category: 'Test' })),
    ...assignmentSubmissions.map((s: any) => ({ ...s, category: 'Assignment' }))
  ].sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  // Aggregate notes telemetry exploration stats
  let totalHeadingsRead = 0;
  let totalHeadingsAvailable = 0;
  let totalDwellSeconds = 0;
  let totalDwellPoints = 0;
  let maxScrollDepth = 0;
  let notesExploredCount = 0;

  notes.forEach((note: any) => {
    // Look for telemetry records for this note's topic
    const topicSubmissions = allSubmissions.filter((sub: any) => sub.topicNumber === note.topicNumber);
    const manifests = note.headingsManifest || [];
    totalHeadingsAvailable += manifests.length;

    let noteExplored = false;
    topicSubmissions.forEach((sub: any) => {
      const telemetry = sub.notesTelemetry;
      if (telemetry) {
        noteExplored = true;
        maxScrollDepth = Math.max(maxScrollDepth, telemetry.maxScrollDepthPercent || 0);
        
        const exploration = telemetry.notesExploration || [];
        exploration.forEach((exp: any) => {
          if (exp.dwellSeconds > 0) {
            totalHeadingsRead++;
            totalDwellSeconds += exp.dwellSeconds;
            totalDwellPoints++;
          }
        });
      }
    });
    if (noteExplored) {
      notesExploredCount++;
    }
  });

  const avgDwellTime = totalDwellPoints > 0 ? Math.round(totalDwellSeconds / totalDwellPoints) : 0;

  // Compile unified activity timeline feed
  const timelineFeed = [
    ...mishaps.map((m: any) => ({
      id: `mishap-${m.id}`,
      type: 'mishap',
      event: m.type,
      timestamp: m.timestamp,
      title: m.type === 'tab_switch' ? 'Tab Switch Flagged' : m.type === 'inactivity' ? 'Inactivity Flagged' : 'Paste Attempt Blocked',
      description: `Student triggered a ${m.type.replace('_', ' ')} incident.`,
      meta: m.meta,
      severity: 'high'
    })),
    ...allSubmissions.map((s: any) => ({
      id: `sub-${s.id}`,
      type: 'submission',
      event: s.category,
      timestamp: s.submittedAt,
      title: `${s.category} Submission`,
      description: `Submitted solution for Topic ${s.topicNumber}.`,
      meta: s,
      severity: 'low'
    }))
  ].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const toggleExpandItem = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredSubmissions = allSubmissions.filter((sub: any) => {
    if (submissionsFilter === 'All') return true;
    return sub.category === submissionsFilter;
  });

  const hasFlags = mishapCounts.tab_switch > 0 || mishapCounts.paste_attempt > 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back to admin button */}
      <div className="flex justify-between items-center pb-4 border-b border-slate-900">
        <button 
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 rounded-xl text-xs text-slate-300 font-bold transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Console</span>
        </button>
        <span className="bg-violet-500/10 border border-violet-500/30 text-violet-400 font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded">
          Student Profile View
        </span>
      </div>

      {/* SECTION 1: HEADER SUMMARY CARD */}
      <div className="p-6 bg-slate-900 border border-slate-850 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-violet-500 to-indigo-500" />
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-extrabold text-slate-100">{student.name}</h2>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
              hasFlags ? 'bg-rose-500/10 text-rose-400 border border-rose-900/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-900/30'
            }`}>
              {hasFlags ? 'FLAGGED / VIOLATIONS' : 'CLEAR / SECURE'}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-slate-450 font-mono">
            <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-slate-500" /> Roll: {student.rollNumber}</span>
            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-slate-500" /> {student.email}</span>
            {student.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-500" /> {student.phone}</span>}
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-1 shrink-0">
          <span className="text-[9px] font-bold text-slate-550 uppercase tracking-wider">Classrooms enrolled</span>
          <div className="flex flex-wrap gap-1.5">
            {student.classrooms.map((c: any) => (
              <span key={c.id} className="px-2 py-0.5 bg-slate-950 border border-slate-850 rounded text-[10px] text-slate-350 font-mono font-bold">
                {c.classId}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: TELEMETRY, MISHAPS, ASSIGNMENTS SUMMARY */}
        <div className="col-span-1 space-y-6">
          {/* SECTION 4: MISHAP SUMMARY */}
          <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4">
            <div className="text-[10px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-violet-500" />
              <span>Mishap Aggregates</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-slate-950/40 border border-slate-850/60 rounded-xl text-center">
                <span className="text-xs text-slate-500 block font-semibold leading-none">Tab Switches</span>
                <span className={`text-lg font-mono font-bold block mt-1.5 ${mishapCounts.tab_switch > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {mishapCounts.tab_switch}
                </span>
              </div>
              <div className="p-3 bg-slate-950/40 border border-slate-850/60 rounded-xl text-center">
                <span className="text-xs text-slate-500 block font-semibold leading-none">Inactivity</span>
                <span className={`text-lg font-mono font-bold block mt-1.5 ${mishapCounts.inactivity > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                  {mishapCounts.inactivity}
                </span>
              </div>
              <div className="p-3 bg-slate-950/40 border border-slate-850/60 rounded-xl text-center">
                <span className="text-xs text-slate-500 block font-semibold leading-none">Paste Blocks</span>
                <span className={`text-lg font-mono font-bold block mt-1.5 ${mishapCounts.paste_attempt > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {mishapCounts.paste_attempt}
                </span>
              </div>
            </div>

            {mishaps.length > 0 ? (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-notes-scrollbar border-t border-slate-850 pt-3">
                <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Mishap Incidents</span>
                {mishaps.map((m: any) => (
                  <div key={m.id} className="flex justify-between items-center text-[10px] font-mono py-1 border-b border-slate-850/40">
                    <span className="text-slate-400 capitalize">{m.type.replace('_', ' ')}</span>
                    <span className="text-slate-500">{new Date(m.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic text-center pt-2">No mishap incidents logged.</p>
            )}
          </div>

          {/* SECTION 5: NOTES EXPLORATION SUMMARY */}
          <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4">
            <div className="text-[10px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-violet-500" />
              <span>Notes exploration summary</span>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between items-center border-b border-slate-850/50 pb-2">
                <span className="text-slate-450">Notes Explored:</span>
                <span className="font-mono font-bold text-slate-200">{notesExploredCount} / {notes.length} notes</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-850/50 pb-2">
                <span className="text-slate-450">Headings Visited:</span>
                <span className="font-mono font-bold text-slate-200">{totalHeadingsRead} / {totalHeadingsAvailable}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-850/50 pb-2">
                <span className="text-slate-450">Average Dwell Time:</span>
                <span className="font-mono font-bold text-slate-200">{avgDwellTime}s per section</span>
              </div>
              <div className="flex justify-between items-center pb-1">
                <span className="text-slate-450">Max Scroll Depth:</span>
                <span className="font-mono font-bold text-slate-200">{maxScrollDepth}% reached</span>
              </div>
            </div>
          </div>

          {/* SECTION 6: ASSIGNMENT COMPLETION HISTORY */}
          <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4">
            <div className="text-[10px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-violet-500" />
              <span>Assignment completion history</span>
            </div>

            <div className="space-y-3">
              {assignments.map((ass: any) => {
                const isCompleted = ass.submittedQuestions >= ass.totalQuestions && ass.totalQuestions > 0;
                const inProgress = ass.submittedQuestions > 0 && ass.submittedQuestions < ass.totalQuestions;
                
                return (
                  <div key={ass.id} className="p-3 bg-slate-950/40 border border-slate-855 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <span className="font-extrabold text-slate-200 truncate block">{ass.title}</span>
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5">Submitted: {ass.submittedQuestions} / {ass.totalQuestions} questions</span>
                    </div>

                    <div className="shrink-0 text-right">
                      {isCompleted ? (
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 px-2 py-0.5 rounded">
                          Completed
                        </span>
                      ) : inProgress ? (
                        <span className="text-[9px] font-bold text-violet-400 bg-violet-950/20 border border-violet-900/30 px-2 py-0.5 rounded animate-pulse">
                          In Progress
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-550 bg-slate-955 border border-slate-800 px-2 py-0.5 rounded">
                          Not Started
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {assignments.length === 0 && (
                <div className="text-center py-6 text-slate-550 text-xs italic">No targeted assignments found.</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIVITY TIMELINE AND SUBMISSIONS HISTORY */}
        <div className="col-span-2 space-y-6">
          
          {/* SECTION 2: ACTIVITY TIMELINE */}
          <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4">
            <div className="text-[10px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-violet-500" />
              <span>Activity Timeline</span>
            </div>

            <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1 custom-notes-scrollbar">
              {timelineFeed.map((item) => {
                const isOpen = !!expandedItems[item.id];
                return (
                  <div key={item.id} className="relative pl-6 border-l-2 border-slate-850 pb-2 last:pb-0">
                    {/* Circle icon */}
                    <div className={`absolute left-0 top-1.5 transform -translate-x-[55%] w-3.5 h-3.5 rounded-full border-4 ${
                      item.type === 'mishap' 
                        ? 'bg-rose-500 border-slate-900' 
                        : 'bg-violet-500 border-slate-900'
                    }`} />
                    
                    <div className="space-y-1">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-slate-200">{item.title}</span>
                        <span className="text-[9px] text-slate-500 font-mono">{new Date(item.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">{item.description}</p>
                      
                      {/* Expandable trigger */}
                      {item.type === 'submission' && (
                        <button
                          onClick={() => toggleExpandItem(item.id)}
                          className="text-[10px] text-violet-400 font-bold hover:text-violet-300 flex items-center gap-0.5 mt-1.5"
                        >
                          {isOpen ? 'Collapse solution' : 'Expand solution details'}
                          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}

                      {/* Expandable content details */}
                      {isOpen && item.type === 'submission' && (
                        <div className="mt-2.5 p-3.5 bg-slate-950/60 border border-slate-850 rounded-xl space-y-3 text-xs">
                          {item.meta.testTitle && (
                            <div className="text-[10px] font-mono text-violet-400 font-bold">Test: "{item.meta.testTitle}"</div>
                          )}
                          {item.meta.assignmentTitle && (
                            <div className="text-[10px] font-mono text-violet-400 font-bold">Assignment: "{item.meta.assignmentTitle}" (Q#{item.meta.questionIndex + 1})</div>
                          )}
                          
                          <div>
                            <div className="text-[9px] uppercase font-bold text-slate-500">Question Task Prompt:</div>
                            <div className="text-[11px] text-slate-300 mt-0.5">{item.meta.questionText}</div>
                          </div>

                          {item.meta.reasoningAnswer && (
                            <div>
                              <div className="text-[9px] uppercase font-bold text-slate-500">Written Explanation:</div>
                              <div className="text-[11px] text-slate-200 mt-0.5 italic">"{item.meta.reasoningAnswer}"</div>
                            </div>
                          )}

                          {item.meta.code && (
                            <div>
                              <div className="text-[9px] uppercase font-bold text-slate-500">Submitted Workspace Code:</div>
                              <pre className="p-2.5 bg-slate-900 border border-slate-850 rounded font-mono text-[10px] text-emerald-400 overflow-x-auto max-h-32 mt-1">
                                {item.meta.code}
                              </pre>
                            </div>
                          )}

                          {item.meta.codeOutput && (
                            <div>
                              <div className="text-[9px] uppercase font-bold text-slate-500">Code Output logs:</div>
                              <pre className="p-2 bg-slate-900 border border-slate-850 rounded font-mono text-[9px] text-slate-400 overflow-x-auto mt-1">
                                {item.meta.codeOutput}
                              </pre>
                            </div>
                          )}

                          <div className="flex gap-4 border-t border-slate-900 pt-2 text-[9px] font-mono text-slate-500">
                            <span>Time taken: {item.meta.timeTakenSeconds}s</span>
                            <span>Tab switches: {item.meta.tabSwitchCount}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {timelineFeed.length === 0 && (
                <div className="text-center py-20 text-slate-550 text-xs italic">No activity logged for this student.</div>
              )}
            </div>
          </div>

          {/* SECTION 3: SUBMISSIONS HISTORY */}
          <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-900">
              <div className="text-[10px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-violet-500" />
                <span>Submissions History</span>
              </div>
              
              {/* Submission type tabs */}
              <div className="flex bg-slate-950 p-0.5 border border-slate-850 rounded-lg text-[10px] font-mono">
                {['All', 'Live', 'Assignment', 'Test'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setSubmissionsFilter(t as any)}
                    className={`px-2 py-1 rounded-md font-bold transition-all ${
                      submissionsFilter === t ? 'bg-slate-850 text-slate-200' : 'text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 custom-notes-scrollbar">
              {filteredSubmissions.map((sub: any) => {
                const isOpen = !!expandedItems[`history-${sub.id}`];
                return (
                  <div key={sub.id} className="p-3 bg-slate-950/40 border border-slate-855 rounded-xl space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                          sub.category === 'Live' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30' : sub.category === 'Test' ? 'bg-rose-955/40 text-rose-400 border border-rose-900/30' : 'bg-violet-955/40 text-violet-400 border border-violet-900/30'
                        }`}>
                          {sub.category}
                        </span>
                        <span className="text-[11px] font-bold text-slate-300">Topic {sub.topicNumber}</span>
                      </div>
                      <span className="text-[9px] text-slate-550 font-mono">{new Date(sub.submittedAt).toLocaleDateString()}</span>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-1">{sub.questionText}</p>

                    <button
                      onClick={() => toggleExpandItem(`history-${sub.id}`)}
                      className="text-[10px] text-slate-450 hover:text-slate-350 font-bold block"
                    >
                      {isOpen ? 'Hide code details' : 'Show code details'}
                    </button>

                    {isOpen && (
                      <div className="mt-2.5 space-y-3 text-xs border-t border-slate-900 pt-2.5">
                        {sub.reasoningAnswer && (
                          <div>
                            <div className="text-[9px] uppercase font-bold text-slate-500">Written Explanation:</div>
                            <p className="text-[11px] text-slate-200 mt-0.5 italic">"{sub.reasoningAnswer}"</p>
                          </div>
                        )}
                        <div>
                          <div className="text-[9px] uppercase font-bold text-slate-500">Code Workspace:</div>
                          <pre className="p-2.5 bg-slate-900 border border-slate-855 rounded font-mono text-[10px] text-emerald-400 overflow-x-auto max-h-32 mt-1">
                            {sub.code}
                          </pre>
                        </div>
                        <div className="flex gap-4 text-[9px] font-mono text-slate-550">
                          <span>Time taken: {sub.timeTakenSeconds}s</span>
                          <span>Tab switches: {sub.tabSwitchCount}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredSubmissions.length === 0 && (
                <div className="text-center py-10 text-slate-650 text-xs italic">No matching submissions found.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
