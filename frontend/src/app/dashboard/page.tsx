'use client';

// frontend/src/app/dashboard/page.tsx
// Student Home Dashboard view.
//
// DESIGN AESTHETICS:
// Premium dark-slate theme with card grid layouts, glassmorphic join-code inputs,
// active status dots, and subtle micro-animations.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  BookOpen, 
  LogOut, 
  Plus, 
  RefreshCw, 
  ArrowRight, 
  User, 
  School,
  Lock,
  ChevronRight,
  CheckCircle
} from 'lucide-react';

interface ClassroomInfo {
  id: string;
  classroom_id: string;
  title: string;
  status: 'active' | 'pending_test' | 'locked';
  live_session_active: boolean;
  active_test: any | null;
}

interface StudentProfile {
  id: string;
  name: string;
  rollNumber: string;
  email: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [classrooms, setClassrooms] = useState<ClassroomInfo[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Join code input
  const [joinCode, setJoinCode] = useState('');
  
  // Status handlers
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');

  const fetchDashboardData = async () => {
    const studentData = localStorage.getItem('student');
    if (!studentData) {
      router.push('/');
      return;
    }

    const { sessionToken } = JSON.parse(studentData);

    // Check caching validity (jittered threshold between 5 and 8 minutes)
    try {
      const cachedData = localStorage.getItem('dashboard_cache');
      const cacheExpires = localStorage.getItem('dashboard_cache_expires');
      if (cachedData && cacheExpires && Date.now() < Number(cacheExpires)) {
        const { user, classrooms, assignments } = JSON.parse(cachedData);
        setProfile(user);
        setClassrooms(classrooms);
        setAssignments(assignments);
        setLoading(false);
        return;
      }
    } catch (e) {
      console.warn('Failed to load dashboard cache:', e);
    }

    try {
      const res = await fetch(`${backendUrl}/api/bootstrap`, {
        headers: {
          'Authorization': sessionToken
        }
      });

      if (!res.ok) {
        throw new Error('Failed to retrieve bootstrap dashboard state.');
      }

      const data = await res.json();
      setProfile(data.user);
      setClassrooms(data.classrooms);

      let fetchedAssignments = [];
      const assRes = await fetch(`${backendUrl}/api/assignments`, {
        headers: { 'Authorization': sessionToken }
      });
      if (assRes.ok) {
        const assData = await assRes.json();
        fetchedAssignments = assData.assignments || [];
        setAssignments(fetchedAssignments);
      }

      // Save to cache with randomized 5 to 8 minutes TTL to prevent thundering herd requests
      const jitterMs = Math.floor(300000 + Math.random() * 180000); 
      localStorage.setItem('dashboard_cache', JSON.stringify({
        user: data.user,
        classrooms: data.classrooms,
        assignments: fetchedAssignments
      }));
      localStorage.setItem('dashboard_cache_expires', String(Date.now() + jitterMs));
    } catch (err: any) {
      setError(err.message || 'Error connecting to servers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [router, backendUrl]);

  const handleJoinClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) {
      setError('Please enter a valid join code.');
      return;
    }

    const studentData = localStorage.getItem('student');
    if (!studentData) return;
    const { sessionToken } = JSON.parse(studentData);

    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${backendUrl}/api/classroom/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': sessionToken
        },
        body: JSON.stringify({ classroomId: joinCode.trim() })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join classroom.');

      setSuccess(`Joined classroom "${data.classroom.title}" successfully!`);
      setJoinCode('');
      
      // Invalidate the cache to ensure we load fresh joined classrooms list
      localStorage.removeItem('dashboard_cache');
      localStorage.removeItem('dashboard_cache_expires');
      
      // Refresh classroom logs
      fetchDashboardData();
    } catch (err: any) {
      setError(err.message || 'Error joining classroom.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('student');
    localStorage.removeItem('dashboard_cache');
    localStorage.removeItem('dashboard_cache_expires');
    router.push('/');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 gap-4">
        <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
        <span className="text-slate-400 font-medium">Retrieving Student Dashboard...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 right-0 w-[40vw] h-[40vw] rounded-full bg-violet-900/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] rounded-full bg-indigo-900/10 blur-[100px] pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header Block */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-8 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <School className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent">
                Student Workspace Portal
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">Welcome back, {profile?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-slate-400 font-mono">Roll: {profile?.rollNumber}</div>
              <div className="text-xs text-slate-500">{profile?.email}</div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-850 rounded-lg text-xs text-slate-300 font-medium transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Joined Classrooms Column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Active Assignments Queue */}
            {assignments.filter(ass => (ass.submittedQuestionIds?.length || 0) < ass.questions.length).length > 0 && (
              <div className="space-y-3 mb-8">
                <h2 className="text-sm font-bold text-violet-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="animate-pulse w-2 h-2 rounded-full bg-violet-500" />
                  <span>Your Active Assignments ({assignments.filter(ass => (ass.submittedQuestionIds?.length || 0) < ass.questions.length).length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {assignments.filter(ass => (ass.submittedQuestionIds?.length || 0) < ass.questions.length).map(ass => (
                    <div
                      key={ass.id}
                      onClick={() => {
                        window.location.href = `/classroom?id=${ass.classroom_id}&mode=assignment&assignmentId=${ass.id}`;
                      }}
                      className="p-5 rounded-2xl border border-violet-900/40 bg-slate-900/50 hover:bg-slate-950/50 cursor-pointer hover:border-violet-500/50 transition-all duration-200 flex flex-col justify-between group min-h-[130px] shadow-lg shadow-violet-950/10"
                    >
                      <div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase font-extrabold tracking-widest text-violet-400">Assignment Challenge</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {ass.questions.length} Question{ass.questions.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-200 mt-2 line-clamp-1">{ass.title}</h4>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Progress: {ass.submittedQuestionIds?.length || 0} / {ass.questions.length} completed
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-violet-400 mt-4 font-bold group-hover:text-violet-300">
                        <span>Start Assignment</span>
                        <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-violet-400" />
              <span>Joined Classrooms ({classrooms.length})</span>
            </h2>

            {classrooms.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/30 border border-slate-800 rounded-2xl">
                <School className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">You haven't joined any classrooms yet.</p>
                <p className="text-slate-500 text-xs mt-1">Enter a join code in the panel to get started.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {classrooms.map((cls) => {
                  const isLocked = cls.status === 'locked';
                  return (
                    <div
                      key={cls.id}
                      className="p-6 rounded-2xl border bg-slate-900/60 border-slate-800 shadow-md flex flex-col gap-4"
                    >
                      {/* Classroom Header */}
                      <div className="flex justify-between items-center pb-3 border-b border-slate-85/50">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-semibold text-violet-400 bg-violet-950/30 border border-violet-900/30 px-2.5 py-1 rounded">
                            {cls.classroom_id}
                          </span>
                          <h3 className="font-bold text-slate-200 text-base">{cls.title}</h3>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            cls.status === 'active' ? 'bg-emerald-500' : cls.status === 'pending_test' ? 'bg-amber-500' : 'bg-rose-500'
                          }`} />
                          <span className="text-[10px] text-slate-400 font-medium capitalize">{cls.status.replace('_', ' ')}</span>
                        </div>
                      </div>

                      {/* Mode Options Cards */}
                      {isLocked ? (
                        <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-850 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                          <Lock className="w-4 h-4" />
                          <span>This classroom is locked by the instructor.</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          
                          {/* 1. Live Classroom Card */}
                          <div 
                            onClick={() => {
                              window.location.href = `/classroom?id=${cls.id}&mode=live`;
                            }}
                            className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-violet-500/30 hover:bg-slate-950/80 cursor-pointer transition-all duration-200 flex flex-col justify-between group min-h-[120px]"
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <h4 className="font-bold text-slate-300 text-xs uppercase tracking-wider">Live Classroom</h4>
                                <span className={`w-1.5 h-1.5 rounded-full ${cls.live_session_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                                Enter reference workspace to access study materials, notes, and raise doubts.
                              </p>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-violet-400 mt-4 font-bold group-hover:text-violet-300">
                              <span>Enter Live Session</span>
                              <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </div>

                          {/* 2. Test Card (only renders if active_test exists) */}
                          {cls.active_test ? (
                            <div 
                              onClick={() => {
                                window.location.href = `/classroom?id=${cls.id}&mode=test&testId=${cls.active_test?.id}`;
                              }}
                              className="p-4 rounded-xl bg-violet-950/10 border border-violet-900/30 hover:border-violet-500/50 hover:bg-violet-950/20 cursor-pointer transition-all duration-200 flex flex-col justify-between group min-h-[120px]"
                            >
                              <div>
                                <div className="flex items-center justify-between">
                                  <h4 className="font-bold text-violet-400 text-xs uppercase tracking-wider">Active Test Session</h4>
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                                </div>
                                <h5 className="text-slate-200 font-bold text-xs mt-1.5 truncate">{cls.active_test.title}</h5>
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">Duration: {cls.active_test.duration_minutes} mins</p>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-amber-400 mt-4 font-bold group-hover:text-amber-300">
                                <span>Start Test Environment</span>
                                <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 rounded-xl bg-slate-950/20 border border-slate-900 flex flex-col justify-center items-center text-center text-[11px] text-slate-600 min-h-[120px]">
                              <span>No active test session currently.</span>
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Completed Assignments Queue */}
            {assignments.filter(ass => (ass.submittedQuestionIds?.length || 0) === ass.questions.length).length > 0 && (
              <div className="space-y-3 mt-8">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>Completed Assignments ({assignments.filter(ass => (ass.submittedQuestionIds?.length || 0) === ass.questions.length).length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {assignments.filter(ass => (ass.submittedQuestionIds?.length || 0) === ass.questions.length).map(ass => (
                    <div
                      key={ass.id}
                      onClick={() => {
                        window.location.href = `/classroom?id=${ass.classroom_id}&mode=assignment&assignmentId=${ass.id}`;
                      }}
                      className="p-5 rounded-2xl border border-slate-800 bg-slate-950/20 hover:bg-slate-900/30 cursor-pointer hover:border-slate-700 transition-all duration-200 flex flex-col justify-between group min-h-[130px]"
                    >
                      <div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500">Completed Challenge</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {ass.questions.length} / {ass.questions.length} Completed
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-400 mt-2 line-clamp-1">{ass.title}</h4>
                        <p className="text-[11px] text-emerald-500/80 mt-1">
                          ✓ Submitted successfully
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-4 font-bold group-hover:text-slate-350">
                        <span>Review Code & Answers</span>
                        <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Join Classroom Action Card */}
          <div className="lg:col-span-1">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-xl">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                <span>Join Classroom</span>
              </h3>
              
              <p className="text-slate-400 text-xs leading-relaxed mb-6">
                Enter the short join code provided by your instructor (e.g. <span className="font-mono text-violet-400 bg-violet-950/30 px-1 py-0.5 rounded">REACT60</span>) to join a classroom permanently.
              </p>

              <form onSubmit={handleJoinClassroom} className="space-y-4">
                <div>
                  <input
                    type="text"
                    required
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="Enter Join Code"
                    className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-center font-mono font-bold tracking-widest text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium rounded-xl shadow-lg shadow-violet-500/10 flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
                >
                  {actionLoading ? 'Joining...' : (
                    <>
                      <span>Join Classroom</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
