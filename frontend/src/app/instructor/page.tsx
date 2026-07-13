'use client';

// frontend/src/app/instructor/page.tsx
// Complete Administrative Panel for Classroom Control Center (v2 Redesign Pass).

import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import StudentProfile from '../../components/StudentProfile';
import { 
  ShieldAlert, 
  Clock, 
  Code, 
  HelpCircle, 
  Map, 
  RefreshCw, 
  User, 
  CheckCircle, 
  XCircle,
  Activity,
  Layers,
  FileText,
  Radio,
  FileCode,
  BookOpen,
  LogOut,
  Plus,
  Play,
  Square,
  Send,
  Eye,
  Check,
  ChevronLeft,
  Users,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Upload,
  Trash2
} from 'lucide-react';

interface Classroom {
  id: string;
  classroom_id: string;
  title: string;
  status: 'active' | 'pending_test' | 'locked';
  live_session_active: boolean;
  active_test: any;
}

interface Student {
  id: string;
  name: string;
  rollNumber: string;
  email: string;
  phone: string | null;
  connected?: boolean;
}

interface Mishap {
  id: string;
  type: 'tab_switch' | 'inactivity' | 'paste_attempt';
  timestamp: string;
  meta: {
    isTest?: boolean;
  } | null;
  studentName: string;
  studentRollNumber: string;
}

interface GroupedMishap {
  studentName: string;
  studentRollNumber: string;
  count: number;
  timestamps: string[];
}

interface QuickQuestion {
  id: string;
  timestampSec: number;
  questionText: string;
}

interface QQSubmission {
  id: string;
  code: string;
  codeOutput: string;
  reasoningAnswer: string;
  timeTakenSeconds: number;
  tabSwitchCount: number;
  headingsReached: number[];
  wasEmpty: boolean;
  dwellSeconds: Record<string, number> | null;
  maxScrollDepth: number;
  submittedAt: string;
  studentName: string;
  studentRollNumber: string;
}

export default function InstructorDashboard() {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string>('');
  
  // Auth Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Dashboard Data State
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  const [roster, setRoster] = useState<Student[]>([]);
  const [mishaps, setMishaps] = useState<Mishap[]>([]);
  const [activeStudentIds, setActiveStudentIds] = useState<string[]>([]);
  const [quickQuestions, setQuickQuestions] = useState<QuickQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Prevents double-clicks on the Go Live / End Live button from firing multiple API calls
  const [isTogglingLive, setIsTogglingLive] = useState(false);

  // Scoped QQ Submissions Review State
  const [selectedQQ, setSelectedQQ] = useState<QuickQuestion | null>(null);
  const [qqSubmissions, setQqSubmissions] = useState<QQSubmission[]>([]);
  const [selectedSub, setSelectedSub] = useState<QQSubmission | null>(null);
  const [loadingQQSubs, setLoadingQQSubs] = useState(false);

  // Assignment System States
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [assTitle, setAssTitle] = useState('');
  const [assQuestions, setAssQuestions] = useState<any[]>([
    { codeTaskPrompt: '', reasoningPrompt: '', reasoningType: 'typed', options: [], optionsText: '', timerSeconds: '' }
  ]);
  const [assTargets, setAssTargets] = useState<string[]>([]);
  const [assStatus, setAssStatus] = useState<'draft' | 'active' | 'closed'>('draft');
  const [assProgress, setAssProgress] = useState<Record<string, { currentIdx: number, isCompleted: boolean, name: string, roll: string }>>({});
  const [assSubmissions, setAssSubmissions] = useState<any[]>([]);
  const [selectedAssSub, setSelectedAssSub] = useState<any>(null);
  const [loadingAssSubs, setLoadingAssSubs] = useState(false);

  // Top-level Dashboard states
  const [topLevelTab, setTopLevelTab] = useState<'classrooms' | 'assignments' | 'profile'>('classrooms');
  const [activeProfileStudentId, setActiveProfileStudentId] = useState<string | null>(null);
  const [previousTab, setPreviousTab] = useState<'classrooms' | 'assignments'>('classrooms');

  // Global search & filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClassroom, setFilterClassroom] = useState('all');
  const [filterFlagStatus, setFilterFlagStatus] = useState('all');
  const [filterRecency, setFilterRecency] = useState('all');

  // Control Center View Sections Tabs (reorganized)
  const [activeSection, setActiveSection] = useState<'roster' | 'observations' | 'control-center' | 'notes'>('roster');

  // Expanded Accordion State for Observations Card
  const [expandedStudentKey, setExpandedStudentKey] = useState<string | null>(null);

  // Form Inputs
  const [quickQuestionText, setQuickQuestionText] = useState('');
  const [quickQuestionTemplate, setQuickQuestionTemplate] = useState('node');
  const [noteTopic, setNoteTopic] = useState('1');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteStatusMsg, setNoteStatusMsg] = useState('');
  const [classroomNotes, setClassroomNotes] = useState<any[]>([]);

  // Rules Flags State
  const [tabSwitchBlocked, setTabSwitchBlocked] = useState(true);
  const [pasteBlocked, setPasteBlocked] = useState(true);
  const [rulesStatusMsg, setRulesStatusMsg] = useState('');

  const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');

  // Load auth session on mount
  useEffect(() => {
    const token = localStorage.getItem('admin_session_token');
    const email = localStorage.getItem('admin_email');
    if (token && email) {
      setAdminToken(token);
      setAdminEmail(email);
    }
    
    // Auto-login with saved credentials if they exist
    const savedEmail = localStorage.getItem('admin_save_email');
    const savedPassword = localStorage.getItem('admin_save_password');
    if (savedEmail && savedPassword) {
      performLogin(savedEmail, savedPassword).catch(() => {
        // Ignore silent background auto-login errors on load
      });
    }
  }, []);

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('admin_session_token');
    localStorage.removeItem('admin_email');
    localStorage.removeItem('admin_save_email');
    localStorage.removeItem('admin_save_password');
    setAdminToken(null);
    setAdminEmail('');
    setClassrooms([]);
    setSelectedClassroom(null);
  };

  // Fetch Classrooms List
  const fetchClassrooms = async (tokenOverride?: string) => {
    const token = tokenOverride || adminToken;
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/admin/classrooms`, {
        headers: { 'Authorization': token }
      });
      if (res.status === 401) {
        handleLogout();
        throw new Error('Session expired. Please sign in again.');
      }
      if (!res.ok) throw new Error('Failed to retrieve classrooms');
      const data = await res.json();
      setClassrooms(data.classrooms);
    } catch (err: any) {
      setError(err.message || 'Error loading classrooms.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminToken) {
      fetchClassrooms();
    }
  }, [adminToken]);

  // Fetch Classroom Scoped Data — uses the single batch endpoint to get all data in ONE request
  const fetchClassroomDetails = async () => {
    if (!adminToken || !selectedClassroom) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/admin/classroom/${selectedClassroom.id}/details`, {
        headers: { 'Authorization': adminToken }
      });
      if (res.status === 401) {
        handleLogout();
        throw new Error('Session expired. Please sign in again.');
      }
      if (!res.ok) throw new Error('Failed to load classroom details');
      const data = await res.json();

      setActiveStudentIds(data.activeStudentIds);

      // Map connection status to roster
      const updatedRoster = data.roster.map((s: Student) => ({
        ...s,
        connected: data.activeStudentIds.includes(s.id)
      }));
      setRoster(updatedRoster);
      setMishaps(data.mishaps);
      setQuickQuestions(data.quickQuestions);
      setAssignments(data.assignments || []);
      setClassroomNotes(data.notes || []);
    } catch (err: any) {
      setError(err.message || 'Error loading control center data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedClassroom) {
      fetchClassroomDetails();
    }
  }, [selectedClassroom]);

  // Connect to socket to receive real-time roster connection updates
  useEffect(() => {
    if (!selectedClassroom || !adminToken) return;

    const socket = io(backendUrl);

    socket.on('connect', () => {
      socket.emit('room:join', { classroomId: selectedClassroom.id });
    });

    socket.on('classroom:roster_update', (data: { studentId: string; connected: boolean }) => {
      setRoster(prev => 
        prev.map(student => 
          student.id === data.studentId 
            ? { ...student, connected: data.connected } 
            : student
        )
      );
    });

    socket.on('instructor:assignment_started', (data: { assignmentId: string; studentId: string; studentName: string; studentRollNumber: string }) => {
      setAssProgress(prev => ({
        ...prev,
        [data.studentId]: {
          currentIdx: 0,
          isCompleted: false,
          name: data.studentName,
          roll: data.studentRollNumber
        }
      }));
    });

    socket.on('instructor:assignment_progress', (data: { assignmentId: string; studentId: string; studentName: string; studentRollNumber: string; questionIndex: number; isCompleted: boolean }) => {
      setAssProgress(prev => ({
        ...prev,
        [data.studentId]: {
          currentIdx: data.questionIndex,
          isCompleted: data.isCompleted,
          name: data.studentName,
          roll: data.studentRollNumber
        }
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedClassroom, adminToken]);

  // Load submissions for selected past Quick Question
  const loadQQSubmissions = async (question: QuickQuestion) => {
    if (!adminToken) return;
    setLoadingQQSubs(true);
    setSelectedQQ(question);
    setSelectedSub(null);
    try {
      const res = await fetch(`${backendUrl}/api/admin/question/${question.id}/submissions`, {
        headers: { 'Authorization': adminToken }
      });
      if (!res.ok) throw new Error('Failed to retrieve question submissions');
      const data = await res.json();
      setQqSubmissions(data.submissions);
      if (data.submissions.length > 0) {
        setSelectedSub(data.submissions[0]);
      }
    } catch (err: any) {
      alert(`Error loading submissions: ${err.message}`);
    } finally {
      setLoadingQQSubs(false);
    }
  };

  async function performLogin(emailVal: string, passwordVal: string) {
    const res = await fetch(`${backendUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailVal, password: passwordVal })
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Authentication failed');
    }
    const data = await res.json();
    localStorage.setItem('admin_session_token', data.sessionToken);
    localStorage.setItem('admin_email', data.email);
    localStorage.setItem('admin_save_email', emailVal);
    localStorage.setItem('admin_save_password', passwordVal);
    setAdminToken(data.sessionToken);
    setAdminEmail(data.email);
    fetchClassrooms(data.sessionToken);
  }

  // Handle Login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      await performLogin(loginEmail, loginPassword);
    } catch (err: any) {
      setAuthError(err.message || 'Login error occurred.');
    }
  };

  // Classroom Live toggler (Go Live / End Live)
  const handleToggleLive = async (goLive: boolean) => {
    if (!selectedClassroom || !adminToken) return;
    // Prevent double-click: ignore if a toggle is already in flight
    if (isTogglingLive) return;
    setIsTogglingLive(true);
    const endpoint = goLive ? 'go-live' : 'end-live';
    try {
      const res = await fetch(`${backendUrl}/api/classroom/${selectedClassroom.id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': adminToken }
      });
      if (!res.ok) throw new Error('Failed to toggle live session status');
      
      // Update selected classroom state in place (no need to refetch entire classrooms list)
      setSelectedClassroom(prev => prev ? { ...prev, live_session_active: goLive } : null);
      setClassrooms(prev => prev.map(c => c.id === selectedClassroom.id ? { ...c, live_session_active: goLive } : c));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsTogglingLive(false);
    }
  };

  // Push new Quick Question
  const handlePushQQ = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassroom || !adminToken || !quickQuestionText) return;
    try {
      const res = await fetch(`${backendUrl}/api/classroom/${selectedClassroom.id}/quick-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': adminToken
        },
        body: JSON.stringify({ 
          questionText: quickQuestionText,
          template: quickQuestionTemplate
        })
      });
      if (!res.ok) throw new Error('Failed to push quick question');
      alert('Quick question pushed live!');
      setQuickQuestionText('');
      fetchClassroomDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Save MD Note (targeted update event sent client-side)
  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassroom || !adminToken) return;
    setNoteStatusMsg('');
    try {
      const res = await fetch(`${backendUrl}/api/admin/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': adminToken
        },
        body: JSON.stringify({
          classroomId: selectedClassroom.id,
          topicNumber: parseInt(noteTopic, 10),
          title: noteTitle,
          markdownContent: noteContent
        })
      });
      if (!res.ok) throw new Error('Failed to save notes');
      setNoteStatusMsg('Note published successfully!');
      fetchClassroomDetails();
      
      // Trigger targeted socket push to connected clients
      // Note: backend endpoint emits 'classroom:notes_updated' directly.
      setNoteTitle('');
      setNoteContent('');
    } catch (err: any) {
      setNoteStatusMsg(`Error: ${err.message}`);
    }
  };

  const handleDeleteNote = async (topicNumber: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedClassroom || !adminToken) return;

    if (!confirm(`Are you sure you want to delete Note Topic ${topicNumber}?`)) {
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/admin/notes/${selectedClassroom.id}/${topicNumber}`, {
        method: 'DELETE',
        headers: {
          'Authorization': adminToken
        }
      });

      if (!res.ok) {
        throw new Error('Failed to delete note');
      }

      setNoteStatusMsg('Note deleted successfully.');
      setTimeout(() => setNoteStatusMsg(''), 3000);

      // Refresh list
      setClassroomNotes(prev => prev.filter(n => n.topicNumber !== topicNumber));

      // Reset fields if currently editing
      if (noteTopic === topicNumber.toString()) {
        setNoteTopic('');
        setNoteTitle('');
        setNoteContent('');
      }
    } catch (err: any) {
      setNoteStatusMsg(`Error: ${err.message}`);
    }
  };

  const handleDeleteStudent = async (studentId: string, studentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedClassroom || !adminToken) return;

    const confirmMsg = `Are you sure you want to remove "${studentName}" from this classroom? All workspace code, test submissions, and mishap logs for this student in this classroom will be permanently deleted.`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`${backendUrl}/api/admin/classroom/${selectedClassroom.id}/student/${studentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': adminToken
        }
      });

      if (!res.ok) {
        throw new Error('Failed to remove student');
      }

      alert('Student removed successfully.');
      fetchClassroomDetails();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setNoteContent(text);
      
      const nameWithoutExt = file.name.replace(/\.md$/i, '');
      setNoteTitle(nameWithoutExt);
    };
    reader.readAsText(file);
  };

  // Save Rules toggles
  const handleSaveRules = async () => {
    if (!selectedClassroom || !adminToken) return;
    setRulesStatusMsg('');
    try {
      const res = await fetch(`${backendUrl}/api/admin/classroom/${selectedClassroom.id}/rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': adminToken
        },
        body: JSON.stringify({ tabSwitchBlocked, pasteBlocked })
      });
      if (!res.ok) throw new Error('Failed to update rules');
      setRulesStatusMsg('Enforcement rules updated successfully!');
    } catch (err: any) {
      setRulesStatusMsg(`Error: ${err.message}`);
    }
  };

  const getGroupedMishaps = (type: 'tab_switch' | 'inactivity' | 'paste_attempt'): GroupedMishap[] => {
    let records = mishaps.filter(m => m.type === type);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      records = records.filter(r => r.studentName.toLowerCase().includes(q) || r.studentRollNumber.toLowerCase().includes(q));
    }

    const map: Record<string, GroupedMishap> = {};

    records.forEach(r => {
      const key = r.studentRollNumber;
      if (!map[key]) {
        map[key] = {
          studentName: r.studentName,
          studentRollNumber: r.studentRollNumber,
          count: 0,
          timestamps: []
        };
      }
      map[key].count++;
      map[key].timestamps.push(r.timestamp);
    });

    return Object.values(map).sort((a, b) => b.count - a.count);
  };

  const getFilteredRoster = () => {
    return roster.filter(student => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSearch = student.name.toLowerCase().includes(q) ||
                              student.rollNumber.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (filterClassroom !== 'all' && selectedClassroom && selectedClassroom.classroom_id !== filterClassroom) {
        return false;
      }
      if (filterRecency === 'active-now' && !student.connected) {
        return false;
      }
      if (filterFlagStatus === 'flagged') {
        const studentMishaps = mishaps.filter(m => m.studentRollNumber === student.rollNumber);
        if (studentMishaps.length === 0) return false;
      }
      return true;
    });
  };

  // Render Login page if not authorized
  if (!adminToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 font-sans relative p-6">
        <div className="absolute top-0 right-0 w-[40vw] h-[40vw] rounded-full bg-violet-900/10 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] rounded-full bg-indigo-900/10 blur-[100px] pointer-events-none" />

        <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 p-8 rounded-2xl shadow-2xl backdrop-blur-md relative z-10">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-extrabold bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent">
              Instructor Administration
            </h1>
            <p className="text-slate-400 text-xs mt-1.5">Sign in to manage classes and view student telemetry logs.</p>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Email Address</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="instructor@classroom.com"
                required
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg font-bold text-sm transition-all shadow-lg shadow-violet-600/15 text-white"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (activeProfileStudentId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 relative">
        <div className="absolute top-0 right-0 w-[30vw] h-[30vw] rounded-full bg-violet-900/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[30vw] h-[30vw] rounded-full bg-indigo-900/5 blur-[120px] pointer-events-none" />
        <StudentProfile
          studentId={activeProfileStudentId}
          adminToken={adminToken}
          backendUrl={backendUrl}
          onBack={() => {
            setActiveProfileStudentId(null);
            setTopLevelTab(previousTab);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 relative">
      <div className="absolute top-0 right-0 w-[30vw] h-[30vw] rounded-full bg-violet-900/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[30vw] h-[30vw] rounded-full bg-indigo-900/5 blur-[120px] pointer-events-none" />

      {/* Global Header & Tab Navigation */}
      <div className="relative z-10 max-w-6xl mx-auto space-y-4 mb-6">
        <header className="flex justify-between items-center pb-4 border-b border-slate-900">
          <div className="flex items-center gap-6">
            <div>
              <span className="bg-violet-500/10 border border-violet-500/30 text-violet-400 font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded">
                Admin Console
              </span>
              <h1 className="text-xl font-extrabold bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent mt-1">
                Instructor Administration
              </h1>
            </div>

            <div className="flex bg-slate-900 p-0.5 border border-slate-850 rounded-lg text-xs font-mono ml-4">
              <button
                onClick={() => setTopLevelTab('classrooms')}
                className={`px-4 py-1.5 rounded-md font-bold transition-all ${
                  topLevelTab === 'classrooms' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Classrooms
              </button>
              <button
                onClick={() => setTopLevelTab('assignments')}
                className={`px-4 py-1.5 rounded-md font-bold transition-all ${
                  topLevelTab === 'assignments' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Assignments
              </button>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 rounded-lg text-xs text-rose-300 font-bold transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </header>

        {/* Global Search & Filter Bar */}
        <div className="p-3.5 bg-slate-900 border border-slate-850 rounded-2xl flex flex-wrap items-center gap-3.5 text-xs">
          <div className="flex-1 min-w-[240px] relative">
            <input
              type="text"
              placeholder="Search student by name or roll number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3.5 pr-8 py-2 bg-slate-950 border border-slate-805 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-violet-500/50"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm font-bold"
              >
                ×
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterFlagStatus}
              onChange={(e) => setFilterFlagStatus(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-350 text-xs focus:outline-none cursor-pointer"
            >
              <option value="all">All Flag Statuses</option>
              <option value="flagged">Has Flags / Mishaps</option>
            </select>

            <select
              value={filterRecency}
              onChange={(e) => setFilterRecency(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-350 text-xs focus:outline-none cursor-pointer"
            >
              <option value="all">All Activity Statuses</option>
              <option value="active-now">Online / Connected Now</option>
            </select>
          </div>
        </div>
      </div>

      {topLevelTab === 'classrooms' ? (
        <div className="relative z-10 max-w-6xl mx-auto space-y-6">
          {!selectedClassroom ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                <h2 className="text-lg font-extrabold text-slate-100">Select a Classroom</h2>
              </div>
              {loading && classrooms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <RefreshCw className="w-6 h-6 text-violet-500 animate-spin" />
                  <span className="text-slate-500 text-xs">Loading classrooms...</span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                    {classrooms.map((cls) => (
                      <div
                        key={cls.id}
                        onClick={() => setSelectedClassroom(cls)}
                        className="bg-slate-900/50 border border-slate-850 hover:border-slate-700/80 p-5 rounded-2xl cursor-pointer hover:translate-y-[-2px] transition-all duration-200 relative group overflow-hidden"
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-violet-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        
                        <div className="flex justify-between items-start mb-4">
                          <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded font-mono text-[10px] text-slate-400 uppercase">
                            {cls.classroom_id}
                          </span>
                          <span className={`w-2 h-2 rounded-full ${cls.live_session_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} />
                        </div>

                        <h3 className="font-extrabold text-base text-slate-200 group-hover:text-slate-100 transition-colors">
                          {cls.title}
                        </h3>

                        <div className="mt-4 flex justify-between items-center text-xs border-t border-slate-855/80 pt-3">
                          <span className="text-slate-500">Live Status:</span>
                          <span className={`font-mono font-bold ${cls.live_session_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {cls.live_session_active ? 'LIVE ACTIVE' : 'OFFLINE'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Danger Zone */}
                  <div className="border border-rose-950 bg-rose-955/5 rounded-2xl p-5 max-w-md mx-auto space-y-3 mt-12">
                    <div className="text-xs font-bold text-rose-400 uppercase tracking-wider">Danger Zone & Admin Utilities</div>
                    <p className="text-[10px] text-slate-400">Destructive actions intended for development environment seeding and testing database resets only.</p>
                    <button
                      onClick={async () => {
                        if (confirm("Are you sure you want to reset and seed the database? This deletes all submissions, student profiles, and mishaps!")) {
                          try {
                            const res = await fetch(`${backendUrl}/api/seed`, { method: 'POST' });
                            if (res.ok) alert('Database reset and seeded successfully!');
                            else alert('Failed to seed database.');
                          } catch (e) {
                            alert('Network error seeding database.');
                          }
                        }
                      }}
                      className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 shadow-lg shadow-rose-600/15"
                    >
                      Reset & Seed Database (/api/seed)
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <header className="flex flex-col md:flex-row justify-between items-start md:items-center pb-5 border-b border-slate-900 gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedClassroom(null)}
                    className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-855 rounded-xl text-slate-400 hover:text-slate-100 transition-all"
                    title="Back to Classrooms"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="bg-violet-500/10 border border-violet-500/30 text-violet-400 font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded">
                        Classroom Scoped
                      </span>
                      <span className="text-slate-400 text-xs font-mono">{selectedClassroom.classroom_id}</span>
                    </div>
                    <h2 className="text-lg font-extrabold text-slate-150 mt-1">
                      {selectedClassroom.title}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={fetchClassroomDetails}
                    className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-850 rounded-xl text-slate-400 hover:text-slate-100 transition-colors"
                    title="Refresh Details"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </header>

              <div className="flex bg-slate-900 p-1 border border-slate-855 rounded-xl text-xs max-w-lg">
                <button
                  onClick={() => setActiveSection('roster')}
                  className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeSection === 'roster' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Roster ({getFilteredRoster().length})</span>
                </button>
                <button
                  onClick={() => setActiveSection('observations')}
                  className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeSection === 'observations' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Observations</span>
                </button>
                <button
                  onClick={() => setActiveSection('control-center')}
                  className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeSection === 'control-center' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Control Center</span>
                </button>
                <button
                  onClick={() => setActiveSection('notes')}
                  className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeSection === 'notes' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Notes</span>
                </button>
              </div>

          {/* Scoped Content Block */}
          <div className="bg-slate-900/40 border border-slate-855 p-6 rounded-2xl backdrop-blur-xl">
            
            {/* TAB: ROSTER */}
            {activeSection === 'roster' && (
              <div className="space-y-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Student Roster Directory</div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {getFilteredRoster().map((student) => (
                    <div
                      key={student.id}
                      onClick={() => {
                        setPreviousTab('classrooms');
                        setActiveProfileStudentId(student.id);
                      }}
                      className="p-4 bg-slate-900/60 hover:bg-slate-900/90 border border-slate-850 hover:border-violet-500/40 rounded-xl flex items-center justify-between cursor-pointer transition-all duration-150"
                    >
                      <div>
                        <div className="font-extrabold text-xs text-violet-400 hover:text-violet-300 underline">{student.name}</div>
                        <div className="text-[10px] text-slate-450 font-mono mt-0.5">Roll: {student.rollNumber}</div>
                        <div className="text-[9px] text-slate-500 font-mono mt-0.5">{student.email}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-slate-950/40 border border-slate-855 px-2 py-1 rounded-lg">
                          <span className={`w-2 h-2 rounded-full ${student.connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-650'}`} />
                          <span className="text-[9px] font-mono text-slate-400 uppercase">
                            {student.connected ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        <button
                          onClick={(e) => handleDeleteStudent(student.id, student.name, e)}
                          className="p-1 text-slate-500 hover:text-rose-500 hover:bg-slate-800 rounded transition-colors"
                          title="Remove Student from Classroom"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {getFilteredRoster().length === 0 && (
                    <div className="col-span-full text-center py-10 text-slate-600 text-xs">
                      No students match the active search/filters.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: OBSERVATION CARDS (Tab switches, Inactivity, Paste attempts) */}
            {activeSection === 'observations' && (
              <div className="space-y-6">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mishaps & Telemetry Observations</div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Card 1: Tab Switches */}
                  <div className="bg-slate-900/70 border border-slate-850 rounded-2xl p-5 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-rose-500" />
                        <span>Tab Switches</span>
                      </span>
                      <span className="bg-rose-500/10 text-rose-400 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-500/20">
                        {mishaps.filter(m => m.type === 'tab_switch').length} Alerts
                      </span>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto custom-notes-scrollbar pr-1">
                      {getGroupedMishaps('tab_switch').map((g) => {
                        const key = `tab_switch_${g.studentRollNumber}`;
                        const isExpanded = expandedStudentKey === key;
                        return (
                          <div key={key} className="bg-slate-950 border border-slate-850/60 rounded-xl p-3">
                            <div 
                              onClick={() => setExpandedStudentKey(isExpanded ? null : key)}
                              className="flex justify-between items-center cursor-pointer select-none"
                            >
                              <div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const match = roster.find(s => s.rollNumber === g.studentRollNumber);
                                    if (match) {
                                      setPreviousTab('classrooms');
                                      setActiveProfileStudentId(match.id);
                                    }
                                  }}
                                  className="text-xs font-bold text-violet-400 hover:text-violet-300 underline text-left"
                                >
                                  {g.studentName}
                                </button>
                                <div className="text-[9px] text-slate-550 font-mono mt-0.5">Roll: {g.studentRollNumber}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="bg-rose-500/15 text-rose-400 font-mono font-bold text-[10px] px-2 py-0.5 rounded">
                                  {g.count}x
                                </span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-slate-900 space-y-1.5">
                                <div className="text-[9px] uppercase font-bold text-slate-550">Infraction Timestamps</div>
                                {g.timestamps.map((t, idx) => (
                                  <div key={idx} className="text-[10px] font-mono text-slate-400 flex justify-between bg-slate-900/50 p-1.5 rounded">
                                    <span>#{idx + 1}</span>
                                    <span>{new Date(t).toLocaleTimeString()}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {getGroupedMishaps('tab_switch').length === 0 && (
                        <div className="text-center py-6 text-slate-600 text-xs italic">No tab switches logged.</div>
                      )}
                    </div>
                  </div>

                  {/* Card 2: Inactivity tracker */}
                  <div className="bg-slate-900/70 border border-slate-855 rounded-2xl p-5 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-500" />
                        <span>Inactivity Tracker</span>
                      </span>
                      <span className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/20">
                        {mishaps.filter(m => m.type === 'inactivity').length} Idle markers
                      </span>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto custom-notes-scrollbar pr-1">
                      {getGroupedMishaps('inactivity').map((g) => {
                        const key = `inactivity_${g.studentRollNumber}`;
                        const isExpanded = expandedStudentKey === key;
                        return (
                          <div key={key} className="bg-slate-950 border border-slate-850/60 rounded-xl p-3">
                            <div 
                              onClick={() => setExpandedStudentKey(isExpanded ? null : key)}
                              className="flex justify-between items-center cursor-pointer select-none"
                            >
                              <div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const match = roster.find(s => s.rollNumber === g.studentRollNumber);
                                    if (match) {
                                      setPreviousTab('classrooms');
                                      setActiveProfileStudentId(match.id);
                                    }
                                  }}
                                  className="text-xs font-bold text-violet-400 hover:text-violet-300 underline text-left"
                                >
                                  {g.studentName}
                                </button>
                                <div className="text-[9px] text-slate-500 font-mono mt-0.5">Roll: {g.studentRollNumber}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="bg-amber-500/15 text-amber-400 font-mono font-bold text-[10px] px-2 py-0.5 rounded">
                                  {g.count}x
                                </span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-slate-900 space-y-1.5">
                                <div className="text-[9px] uppercase font-bold text-slate-550">Inactivity Trigger Timestamps</div>
                                {g.timestamps.map((t, idx) => (
                                  <div key={idx} className="text-[10px] font-mono text-slate-400 flex justify-between bg-slate-900/50 p-1.5 rounded">
                                    <span>#{idx + 1}</span>
                                    <span>{new Date(t).toLocaleTimeString()}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {getGroupedMishaps('inactivity').length === 0 && (
                        <div className="text-center py-6 text-slate-600 text-xs italic">No inactivity events logged.</div>
                      )}
                    </div>
                  </div>

                  {/* Card 3: Copy paste attempt tracker */}
                  <div className="bg-slate-900/70 border border-slate-855 rounded-2xl p-5 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-violet-500" />
                        <span>Paste Blocks</span>
                      </span>
                      <span className="bg-violet-500/10 text-violet-400 text-[10px] font-bold px-2 py-0.5 rounded border border-violet-500/20">
                        {mishaps.filter(m => m.type === 'paste_attempt').length} Blocks
                      </span>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto custom-notes-scrollbar pr-1">
                      {getGroupedMishaps('paste_attempt').map((g) => {
                        const key = `paste_attempt_${g.studentRollNumber}`;
                        const isExpanded = expandedStudentKey === key;
                        return (
                          <div key={key} className="bg-slate-950 border border-slate-850/60 rounded-xl p-3">
                            <div 
                              onClick={() => setExpandedStudentKey(isExpanded ? null : key)}
                              className="flex justify-between items-center cursor-pointer select-none"
                            >
                              <div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const match = roster.find(s => s.rollNumber === g.studentRollNumber);
                                    if (match) {
                                      setPreviousTab('classrooms');
                                      setActiveProfileStudentId(match.id);
                                    }
                                  }}
                                  className="text-xs font-bold text-violet-400 hover:text-violet-300 underline text-left"
                                >
                                  {g.studentName}
                                </button>
                                <div className="text-[9px] text-slate-500 font-mono mt-0.5">Roll: {g.studentRollNumber}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="bg-violet-500/15 text-violet-400 font-mono font-bold text-[10px] px-2 py-0.5 rounded">
                                  {g.count}x
                                </span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-slate-900 space-y-1.5">
                                <div className="text-[9px] uppercase font-bold text-slate-555">Paste Attempt Timestamps</div>
                                {g.timestamps.map((t, idx) => (
                                  <div key={idx} className="text-[10px] font-mono text-slate-400 flex justify-between bg-slate-900/50 p-1.5 rounded">
                                    <span>#{idx + 1}</span>
                                    <span>{new Date(t).toLocaleTimeString()}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {getGroupedMishaps('paste_attempt').length === 0 && (
                        <div className="text-center py-6 text-slate-600 text-xs italic">No copy-paste blocks triggered.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: CONTROL CENTER */}
            {activeSection === 'control-center' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Rules & live toggles */}
                  <div className="space-y-5">
                    <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl space-y-4">
                      <div className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Live Lectures Broadcast</div>
                      <div className="p-3 bg-slate-900/60 border border-slate-850 rounded-xl space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-350">Lecture Status:</span>
                          <span className={`font-bold ${selectedClassroom.live_session_active ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`}>
                            {selectedClassroom.live_session_active ? 'ACTIVE LIVE' : 'OFFLINE'}
                          </span>
                        </div>
                        {selectedClassroom.live_session_active ? (
                          <button
                            onClick={() => handleToggleLive(false)}
                            className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Square className="w-3.5 h-3.5 fill-white" />
                            <span>End Live Session</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleLive(true)}
                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Play className="w-3.5 h-3.5 fill-white" />
                            <span>Start Live Session</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl space-y-4">
                      <div className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Enforcement Policies</div>
                      {rulesStatusMsg && (
                        <div className={`p-2.5 rounded text-xs font-semibold ${rulesStatusMsg.startsWith('Error') ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'}`}>
                          {rulesStatusMsg}
                        </div>
                      )}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="text-xs font-bold text-slate-200">Tab-Switch Monitor</div>
                            <div className="text-[9px] text-slate-500 mt-0.5">Logs students switching browser tabs.</div>
                          </div>
                          <button
                            onClick={() => setTabSwitchBlocked(!tabSwitchBlocked)}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                              tabSwitchBlocked ? 'bg-rose-500/25 text-rose-400 border border-rose-500/35' : 'bg-slate-900 text-slate-500 border border-slate-800'
                            }`}
                          >
                            {tabSwitchBlocked ? 'ENABLED' : 'DISABLED'}
                          </button>
                        </div>
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="text-xs font-bold text-slate-200">Clipboard Guard (Paste Block)</div>
                            <div className="text-[9px] text-slate-500 mt-0.5">Disables pasting external code templates.</div>
                          </div>
                          <button
                            onClick={() => setPasteBlocked(!pasteBlocked)}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                              pasteBlocked ? 'bg-rose-500/25 text-rose-400 border border-rose-500/35' : 'bg-slate-900 text-slate-500 border border-slate-800'
                            }`}
                          >
                            {pasteBlocked ? 'ENABLED' : 'DISABLED'}
                          </button>
                        </div>
                        <button
                          onClick={handleSaveRules}
                          className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-lg transition-colors"
                        >
                          Save Policy Rules
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Center Column: Push Quick Question */}
                  <div className="space-y-5">
                    <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl space-y-4">
                      <div className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Push Quick Question</div>
                      <form onSubmit={handlePushQQ} className="space-y-4">
                        <textarea
                          placeholder="Write Javascript coding prompt instructions..."
                          value={quickQuestionText}
                          onChange={(e) => setQuickQuestionText(e.target.value)}
                          rows={4}
                          required
                          className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none resize-none"
                        />
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Sandbox Template</label>
                          <select
                            value={quickQuestionTemplate}
                            onChange={(e) => setQuickQuestionTemplate(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none"
                          >
                            <option value="node">Default Node.js (Console logs)</option>
                            <option value="react">Vite React App (Fast Dev Server)</option>
                            <option value="html">Static HTML Website (HTTP Server)</option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 shadow-md"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Push Live (90s Timer)</span>
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Right Column: QQ History & Inspector */}
                  <div className="space-y-5">
                    <div className="bg-slate-950 border border-slate-855 p-5 rounded-2xl space-y-4">
                      <div className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Quick Question History</div>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-notes-scrollbar border-b border-slate-900 pb-3">
                        {quickQuestions.map((qq) => (
                          <div
                            key={qq.id}
                            onClick={() => loadQQSubmissions(qq)}
                            className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                              selectedQQ?.id === qq.id 
                                ? 'bg-slate-900 border-violet-500/60 text-violet-300' 
                                : 'bg-slate-955 border-slate-850 hover:border-slate-800 text-slate-350'
                            }`}
                          >
                            <p className="text-[11px] line-clamp-2">{qq.questionText}</p>
                            <span className="text-[8px] text-slate-500 font-mono block mt-1">
                              {new Date(qq.timestampSec * 1000).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                        {quickQuestions.length === 0 && (
                          <div className="text-center py-6 text-slate-650 text-xs italic">No quick questions pushed.</div>
                        )}
                      </div>

                      {selectedQQ && (
                        <div className="space-y-3">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Submissions ({qqSubmissions.length})</div>
                          {loadingQQSubs ? (
                            <div className="flex justify-center py-4 gap-2 items-center text-xs text-slate-600">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-500" />
                              <span>Loading...</span>
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-notes-scrollbar">
                              {qqSubmissions.map((sub) => (
                                <div
                                  key={sub.id}
                                  onClick={() => setSelectedSub(sub)}
                                  className={`p-2 rounded border cursor-pointer text-left text-xs transition-all flex justify-between items-center ${
                                    selectedSub?.id === sub.id
                                      ? 'bg-slate-900 border-violet-500/50 text-violet-300 font-bold'
                                      : 'bg-slate-955 border-slate-850 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <span className="truncate">{sub.studentName}</span>
                                  <span className="text-[9px] font-mono text-slate-550 shrink-0">{sub.studentRollNumber}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {selectedSub && (
                            <div className="mt-3 p-3 bg-slate-900 border border-slate-850 rounded-xl space-y-2.5 text-xs text-slate-250">
                              <div className="flex justify-between items-center border-b border-slate-850 pb-1.5">
                                <span className="font-bold text-slate-200">Solution Detail</span>
                                <button
                                  onClick={() => {
                                    const match = roster.find(s => s.rollNumber === selectedSub.studentRollNumber);
                                    if (match) {
                                      setPreviousTab('classrooms');
                                      setActiveProfileStudentId(match.id);
                                    }
                                  }}
                                  className="text-[9px] text-violet-400 hover:text-violet-300 underline"
                                >
                                  Go to profile
                                </button>
                              </div>
                              <div>
                                <span className="text-[9px] font-bold text-slate-500 uppercase block">Conceptual Answer:</span>
                                <p className="mt-0.5 italic">"{selectedSub.reasoningAnswer || 'No explanation.'}"</p>
                              </div>
                              <div>
                                <span className="text-[9px] font-bold text-slate-555 uppercase block">Workspace Code:</span>
                                <pre className="p-2 bg-slate-950 border border-slate-850 rounded font-mono text-[9px] text-emerald-400 overflow-x-auto max-h-24 mt-0.5">
                                  {selectedSub.code || '// Empty code.'}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* TAB: NOTES PUBLISHER */}
            {activeSection === 'notes' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Published Notes Directory */}
                <div className="space-y-4 lg:col-span-1 bg-slate-950 border border-slate-850 p-5 rounded-2xl">
                  <div className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-2">Classroom Notes Directory</div>
                  <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1 custom-notes-scrollbar">
                    {classroomNotes.map((note) => (
                      <div
                        key={note.id}
                        onClick={() => {
                          setNoteTopic(note.topicNumber.toString());
                          setNoteTitle(note.title);
                          setNoteContent(note.markdownContent);
                        }}
                        className="p-3 bg-slate-900 hover:bg-slate-850 border border-slate-850 hover:border-violet-500/40 rounded-xl cursor-pointer transition-all duration-150"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-[11px] font-extrabold text-slate-250 truncate block flex-1">{note.title}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] font-mono bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded border border-violet-500/20">
                              Topic {note.topicNumber}
                            </span>
                            <button
                              onClick={(e) => handleDeleteNote(note.topicNumber, e)}
                              className="p-1 text-slate-500 hover:text-rose-500 hover:bg-slate-800 rounded transition-colors"
                              title="Delete Note"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[9px] text-slate-500 line-clamp-2 mt-1.5 font-mono">
                          {note.markdownContent.slice(0, 100)}...
                        </p>
                      </div>
                    ))}
                    {classroomNotes.length === 0 && (
                      <div className="text-center py-10 text-slate-650 text-xs italic">
                        No notes published yet for this classroom.
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Editor Form */}
                <div className="lg:col-span-2 space-y-4 bg-slate-950/40 border border-slate-850 p-6 rounded-2xl">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Publish Targeted Notes Update</div>

                  {noteStatusMsg && (
                    <div className={`p-2.5 rounded text-xs font-semibold ${noteStatusMsg.startsWith('Error') ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'}`}>
                      {noteStatusMsg}
                    </div>
                  )}

                  <form onSubmit={handleSaveNote} className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-24">
                        <label className="block text-[10px] uppercase font-bold text-slate-550 mb-1">Topic No.</label>
                        <input
                          type="number"
                          value={noteTopic}
                          onChange={(e) => setNoteTopic(e.target.value)}
                          required
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-855 rounded-lg text-slate-205 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="flex-1">
                        <label className="block text-[10px] uppercase font-bold text-slate-555 mb-1">Note Title</label>
                        <input
                          type="text"
                          placeholder="e.g. Introduction to React State"
                          value={noteTitle}
                          onChange={(e) => setNoteTitle(e.target.value)}
                          required
                          className="w-full px-3 py-2 bg-slate-955 border border-slate-855 rounded-lg text-slate-200 text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
                      <label className="block text-[10px] uppercase font-bold text-slate-450">Import Markdown Note File</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="file"
                          accept=".md"
                          id="note-file-upload"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <label
                          htmlFor="note-file-upload"
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 border border-slate-700 hover:border-slate-600 flex items-center gap-2"
                        >
                          <Upload className="w-4 h-4 text-violet-400" />
                          Choose Markdown File (.md)
                        </label>
                        <span className="text-[11px] text-slate-400 italic">
                          Accepts LibreOffice exported or native Markdown documents.
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Markdown Content</label>
                      <textarea
                        placeholder="# Heading Title&#10;&#10;Use ## Heading 1 for scroll tracking anchors."
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        rows={8}
                        required
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-855 rounded-lg text-slate-200 text-xs font-mono focus:outline-none resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 bg-violet-650 hover:bg-violet-600 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Publish Note & Push Update via Sockets</span>
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    ) : (
      /* ASSIGNMENTS TAB VIEW ROUTE */
        <div className="bg-slate-900/50 border border-slate-850 p-6 rounded-2xl space-y-4">
          <div className="flex justify-between items-center pb-4 border-b border-slate-800">
            <h2 className="text-lg font-extrabold text-slate-100">Assignments Manager</h2>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-455">Active Classroom Context:</span>
              <select
                value={selectedClassroom?.id || ''}
                onChange={(e) => {
                  const cls = classrooms.find(c => c.id === e.target.value);
                  setSelectedClassroom(cls || null);
                }}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-205 font-bold focus:outline-none cursor-pointer"
              >
                <option value="" disabled>Select Classroom...</option>
                {classrooms.map(c => (
                  <option key={c.id} value={c.id}>{c.title} ({c.classroom_id})</option>
                ))}
              </select>
            </div>
          </div>

          {selectedClassroom ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
              {/* Left Panel: Assignments Builder and List */}
              <div className="col-span-1 space-y-6">
                {/* Create New Assignment Block */}
                <div className="bg-slate-955 border border-slate-855 p-5 rounded-2xl space-y-4">
                  <div className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Compose New Assignment</div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Assignment Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Final React Challenge"
                        value={assTitle}
                        onChange={(e) => setAssTitle(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none"
                      />
                    </div>

                    {/* Targeting */}
                    <div>
                      <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Target Roster Audience</label>
                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg max-h-32 overflow-y-auto space-y-2 custom-notes-scrollbar">
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={assTargets.length === 0}
                            onChange={(e) => {
                              if (e.target.checked) setAssTargets([]);
                            }}
                            className="text-violet-605 rounded focus:ring-0 focus:ring-offset-0 bg-slate-955 border-slate-800"
                          />
                          <span>All Students (Whole Class)</span>
                        </label>
                        {roster.map(student => (
                          <label key={student.id} className="flex items-center gap-2 text-xs text-slate-445 cursor-pointer hover:text-slate-200">
                            <input
                              type="checkbox"
                              checked={assTargets.includes(student.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAssTargets(prev => [...prev, student.id]);
                                } else {
                                  setAssTargets(prev => prev.filter(id => id !== student.id));
                                }
                              }}
                              className="text-violet-605 rounded focus:ring-0 focus:ring-offset-0 bg-slate-955 border-slate-800"
                            />
                            <span>{student.name} ({student.rollNumber})</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Questions Composer */}
                    <div className="space-y-3 pt-2 border-t border-slate-900">
                      <div className="flex justify-between items-center">
                        <label className="block text-[9px] uppercase font-bold text-slate-500">Question Queue ({assQuestions.length})</label>
                        <button
                          onClick={() => setAssQuestions(prev => [...prev, { codeTaskPrompt: '', reasoningPrompt: '', reasoningType: 'typed', options: [], optionsText: '', timerSeconds: '' }])}
                          className="text-[10px] text-violet-400 font-bold hover:text-violet-300"
                        >
                          + Add Question
                        </button>
                      </div>

                      <div className="space-y-4 max-h-60 overflow-y-auto pr-1 custom-notes-scrollbar">
                        {assQuestions.map((q, idx) => (
                          <div key={idx} className="p-3 bg-slate-905 border border-slate-850 rounded-xl space-y-2 relative">
                            <div className="flex justify-between items-center text-[10px] text-slate-550 font-mono">
                              <span>Question #{idx + 1}</span>
                              {assQuestions.length > 1 && (
                                <button
                                  onClick={() => setAssQuestions(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-rose-455 hover:text-rose-405"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <textarea
                              placeholder="Coding Challenge instruction prompt..."
                              value={q.codeTaskPrompt}
                              onChange={(e) => {
                                const updated = [...assQuestions];
                                updated[idx].codeTaskPrompt = e.target.value;
                                setAssQuestions(updated);
                              }}
                              rows={2}
                              className="w-full px-2 py-1 bg-slate-955 border border-slate-800 rounded text-slate-202 text-xs focus:outline-none resize-none"
                            />
                            <textarea
                              placeholder="Conceptual/Reasoning question prompt..."
                              value={q.reasoningPrompt}
                              onChange={(e) => {
                                const updated = [...assQuestions];
                                updated[idx].reasoningPrompt = e.target.value;
                                setAssQuestions(updated);
                              }}
                              rows={2}
                              className="w-full px-2 py-1 bg-slate-955 border border-slate-800 rounded text-slate-202 text-xs focus:outline-none resize-none"
                            />
                            <div className="flex gap-2">
                              <select
                                value={q.reasoningType}
                                onChange={(e) => {
                                  const updated = [...assQuestions];
                                  updated[idx].reasoningType = e.target.value;
                                  setAssQuestions(updated);
                                }}
                                className="w-1/2 px-2 py-1 bg-slate-955 border border-slate-800 rounded text-slate-350 text-[10px] focus:outline-none"
                              >
                                <option value="typed">Short Answer</option>
                                <option value="mcq">MCQ Choice</option>
                                <option value="multi_select">Multi-Select Checkboxes</option>
                              </select>
                              <input
                                type="number"
                                placeholder="Timer (s) - leave blank if untimed"
                                value={q.timerSeconds || ''}
                                onChange={(e) => {
                                  const updated = [...assQuestions];
                                  updated[idx].timerSeconds = e.target.value ? parseInt(e.target.value) : null;
                                  setAssQuestions(updated);
                                }}
                                className="w-1/2 px-2 py-1 bg-slate-955 border border-slate-800 rounded text-slate-202 text-[10px] focus:outline-none"
                              />
                            </div>
                            {(q.reasoningType === 'mcq' || q.reasoningType === 'multi_select') && (
                              <input
                                type="text"
                                placeholder="Options (comma separated, e.g. A, B, C, D)"
                                value={q.optionsText !== undefined ? q.optionsText : (q.options ? q.options.join(', ') : '')}
                                onChange={(e) => {
                                  const updated = [...assQuestions];
                                  updated[idx].optionsText = e.target.value;
                                  updated[idx].options = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                  setAssQuestions(updated);
                                }}
                                className="w-full px-2 py-1 bg-slate-955 border border-slate-800 rounded text-slate-202 text-[10px] focus:outline-none"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-slate-900">
                      <select
                        value={assStatus}
                        onChange={(e) => setAssStatus(e.target.value as any)}
                        className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none"
                      >
                        <option value="draft">Save as Draft</option>
                        <option value="active">Active (Visible to targets)</option>
                        <option value="closed">Closed (Manual Close)</option>
                      </select>
                      <button
                        onClick={async () => {
                          if (!assTitle.trim()) {
                            alert('Please write an assignment title first.');
                            return;
                          }
                          try {
                            const body = {
                              id: selectedAssignment?.id || null,
                              title: assTitle,
                              assignedTo: assTargets.length > 0 ? assTargets : null,
                              status: assStatus,
                              openAt: assStatus === 'active' ? new Date().toISOString() : null,
                              closeAt: assStatus === 'closed' ? new Date().toISOString() : null,
                              questions: assQuestions.map((q: any) => ({
                                codeTaskPrompt: q.codeTaskPrompt,
                                reasoningPrompt: q.reasoningPrompt,
                                reasoningType: q.reasoningType,
                                options: q.options || [],
                                timerSeconds: q.timerSeconds
                              }))
                            };

                            const res = await fetch(`${backendUrl}/api/admin/classroom/${selectedClassroom.id}/assignments`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': adminToken
                              },
                              body: JSON.stringify(body)
                            });

                            if (!res.ok) throw new Error('Failed to save assignment');
                            alert('Assignment saved successfully!');
                            setAssTitle('');
                            setAssTargets([]);
                            setAssQuestions([{ codeTaskPrompt: '', reasoningPrompt: '', reasoningType: 'typed', options: [], optionsText: '', timerSeconds: '' }]);
                            setAssStatus('draft');
                            setSelectedAssignment(null);
                            fetchClassroomDetails();
                          } catch (e: any) {
                            alert(`Error composing assignment: ${e.message}`);
                          }
                        }}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-lg shadow-md transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>

                {/* Assignments History List */}
                <div className="space-y-2 text-xs">
                  <div className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">Classroom Assignments Queue</div>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-notes-scrollbar">
                    {assignments.map(ass => (
                      <div
                        key={ass.id}
                        onClick={async () => {
                          setSelectedAssignment(ass);
                          setAssTitle(ass.title);
                          setAssTargets(ass.assigned_to || []);
                          setAssStatus(ass.status);
                          setAssQuestions(ass.questions.map((q: any) => ({
                             codeTaskPrompt: q.code_task_prompt,
                             reasoningPrompt: q.reasoning_prompt,
                             reasoningType: q.reasoning_type,
                             options: q.options || [],
                             optionsText: (q.options || []).join(', '),
                             timerSeconds: q.timer_seconds
                           })));

                          setLoadingAssSubs(true);
                          setSelectedAssSub(null);
                          try {
                            const res = await fetch(`${backendUrl}/api/admin/assignments/${ass.id}/submissions`, {
                              headers: { 'Authorization': adminToken }
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setAssSubmissions(data.submissions);
                            }
                          } catch (e) {}
                          setLoadingAssSubs(false);
                        }}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedAssignment?.id === ass.id
                            ? 'bg-slate-900 border-violet-500/60'
                            : 'bg-slate-950 border-slate-855 hover:border-slate-800'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold text-slate-205 truncate max-w-[70%]">{ass.title}</h4>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                            ass.status === 'active' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30' : ass.status === 'closed' ? 'bg-rose-955/40 text-rose-400 border border-rose-900/30' : 'bg-slate-955 text-slate-550 border border-slate-800'
                          }`}>{ass.status.toUpperCase()}</span>
                        </div>
                        <span className="text-[9px] text-slate-500 block mt-1">
                          Queue: {ass.questions.length} questions • Targets: {ass.assigned_to ? `${ass.assigned_to.length} targeted` : 'Whole Classroom'}
                        </span>
                      </div>
                    ))}
                    {assignments.length === 0 && (
                      <div className="text-center py-6 text-slate-650 text-xs italic">No assignments composed yet.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Panels: Live Completion Tracker and review */}
              <div className="col-span-2 space-y-6">
                {selectedAssignment ? (
                  <>
                    {/* 1. Real-time Live Completion Tracker */}
                    {selectedAssignment.status === 'active' && (
                      <div className="bg-slate-955 border border-slate-850 rounded-2xl p-5 space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                          <div>
                            <div className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Live Completion Tracker</div>
                            <p className="text-[10px] text-slate-500 mt-0.5">Real-time status updates broadcast via active sockets</p>
                          </div>
                          <span className="animate-pulse w-2 h-2 rounded-full bg-emerald-500" />
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {roster.filter(s => {
                            if (!selectedAssignment.assigned_to) return true;
                            return selectedAssignment.assigned_to.includes(s.id);
                          }).map(student => {
                            const prog = assProgress[student.id];
                            const isStarted = !!prog;
                            const isCompleted = prog?.isCompleted;
                            const currentQ = prog ? prog.currentIdx + 1 : 0;
                            const totalQ = selectedAssignment.questions.length;

                            return (
                              <div 
                                key={student.id} 
                                onClick={() => {
                                  setPreviousTab('assignments');
                                  setActiveProfileStudentId(student.id);
                                }}
                                className="p-3 bg-slate-900 hover:bg-slate-905 border border-slate-850 hover:border-violet-500/40 rounded-xl flex items-center justify-between gap-3 text-xs cursor-pointer transition-all duration-150"
                              >
                                <div className="truncate max-w-[65%]">
                                  <div className="font-bold text-violet-400 hover:text-violet-300 underline truncate">{student.name}</div>
                                  <div className="text-[9px] text-slate-500 font-mono truncate">{student.rollNumber}</div>
                                </div>
                                <div className="text-right shrink-0">
                                  {isCompleted ? (
                                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 px-2 py-0.5 rounded">
                                      Done
                                    </span>
                                  ) : isStarted ? (
                                    <span className="text-[9px] font-bold text-violet-400 bg-violet-950/20 border border-violet-900/30 px-2 py-0.5 rounded">
                                      Q {currentQ}/{totalQ}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-slate-500 font-medium">
                                      Offline
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 2. Review Submissions Block */}
                    <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 space-y-4">
                      <div className="pb-3 border-b border-slate-900 flex justify-between items-center">
                        <div>
                          <div className="text-[9px] font-bold text-violet-400 uppercase tracking-widest">Submissions Inspector</div>
                          <h4 className="text-sm font-semibold text-slate-200 mt-1 italic">
                            "{selectedAssignment.title}"
                          </h4>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Total Submissions: {assSubmissions.length}
                        </span>
                      </div>

                      {loadingAssSubs ? (
                        <div className="flex justify-center py-10 gap-2 items-center text-xs text-slate-550">
                          <RefreshCw className="w-4 h-4 animate-spin text-violet-500" />
                          <span>Loading student answers...</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-4">
                          {/* Student list */}
                          <div className="col-span-1 space-y-2 max-h-80 overflow-y-auto custom-notes-scrollbar pr-1 border-r border-slate-900/60">
                            {assSubmissions.map((sub) => (
                              <div
                                key={sub.id}
                                onClick={() => setSelectedAssSub(sub)}
                                className={`p-2.5 rounded border cursor-pointer text-left transition-all ${
                                  selectedAssSub?.id === sub.id
                                    ? 'bg-slate-900 border-violet-500/50 text-violet-300'
                                    : 'bg-slate-955 border-slate-850/60 text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const match = roster.find(s => s.name === sub.studentName || s.rollNumber === sub.studentRollNumber);
                                    if (match) {
                                      setPreviousTab('assignments');
                                      setActiveProfileStudentId(match.id);
                                    }
                                  }}
                                  className="text-xs font-bold text-violet-400 hover:text-violet-300 underline truncate block text-left w-full"
                                >
                                  {sub.studentName} (Q{sub.questionIndex !== undefined ? sub.questionIndex + 1 : '?'})
                                </button>
                                <div className="text-[9px] font-mono mt-0.5">{sub.studentRollNumber}</div>
                              </div>
                            ))}
                            {assSubmissions.length === 0 && (
                              <div className="text-center py-10 text-slate-650 text-xs italic">No submissions.</div>
                            )}
                          </div>

                          {/* Student detail view */}
                          <div className="col-span-2 space-y-3">
                            {selectedAssSub ? (
                              <div className="space-y-3 text-xs">
                                <div>
                                  <div className="text-slate-550 uppercase text-[9px] font-bold">Concept Answer:</div>
                                  <div className="p-2.5 bg-slate-900 border border-slate-850 rounded italic text-slate-200 mt-1">
                                    "{selectedAssSub.reasoning_answer || 'No answer submitted.'}"
                                  </div>
                                </div>

                                <div>
                                  <div className="text-slate-555 uppercase text-[9px] font-bold">Code Solution:</div>
                                  <pre className="p-2.5 bg-slate-900 border border-slate-855 rounded font-mono text-[10px] text-emerald-400 overflow-x-auto max-h-32 mt-1">
                                    {selectedAssSub.code || '// Empty code submitted'}
                                  </pre>
                                </div>

                                <div className="flex gap-4 border-t border-slate-900 pt-2.5 text-[10px] font-mono text-slate-455">
                                  <span>Time: {selectedAssSub.time_taken_seconds || 0}s</span>
                                  <span className={selectedAssSub.tab_switch_count > 0 ? 'text-rose-400 font-bold' : ''}>
                                    Switches: {selectedAssSub.tab_switch_count}
                                  </span>
                                  <span>Depth: {selectedAssSub.max_scroll_depth || 0}%</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-16 text-slate-650 text-xs italic">
                                Select a student record to inspect.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-20 bg-slate-950/40 border border-slate-855 rounded-2xl text-slate-550 text-xs">
                    Select or compose an assignment from the manager panel to begin configuration.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-slate-550 text-xs italic">
              Please select a classroom context above to manage assignments.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
