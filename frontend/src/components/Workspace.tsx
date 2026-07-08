'use client';

// frontend/src/components/Workspace.tsx
// Core Interactive Workspace component with collapsible folder tree, dynamic multiple interactive jsh shells,
// and manual browser preview viewport. Includes two-way filesystem synchronization, two-mode architecture
// (Live Classroom vs Test), centralized telemetry rules, and a standalone Observation Debug Card.

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import Editor from '@monaco-editor/react';
import { WebContainer } from '@webcontainer/api';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import JSZip from 'jszip';
import { 
  Play, 
  Terminal as TerminalIcon, 
  BookOpen, 
  FileCode, 
  HelpCircle, 
  Send, 
  ChevronLeft, 
  ChevronRight,
  LogOut,
  RefreshCw,
  Eye,
  AlertTriangle,
  Plus,
  Trash2,
  Edit,
  Globe,
  Maximize2,
  Clock,
  CheckCircle,
  Download
} from 'lucide-react';
import 'xterm/css/xterm.css';

import { registerTabSwitch, registerPasteBlock, registerInactivity } from '../utils/analyzerRules';
import ObservationDebugCard from './ObservationDebugCard';

interface HeadingManifestItem {
  id: number;
  title: string;
  level: number;
}

// Type definitions matching the schema
interface NotesData {
  id: string;
  topicNumber: number;
  title: string;
  markdownContent: string;
  headingsManifest?: HeadingManifestItem[];
}

interface QuestionData {
  id: string;
  topicNumber: number;
  codeTaskPrompt: string;
  reasoningPrompt: string;
  reasoningType: 'typed' | 'mcq' | 'multi_select';
  options?: string[];
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

// Module-level singletons are now stored on the global window object to persist across Next.js HMR reloads.
declare global {
  interface Window {
    __webcontainer_instance__?: WebContainer;
    __webcontainer_promise__?: Promise<WebContainer>;
  }
}

const buildWebContainerFiles = (flat: Record<string, string>) => {
  const root: any = {};
  for (const [path, contents] of Object.entries(flat)) {
    const parts = path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        current[part] = { file: { contents } };
      } else {
        if (!current[part]) {
          current[part] = { directory: {} };
        }
        current = current[part].directory;
      }
    }
  }
  return root;
};

const QQ_TEMPLATES: Record<string, Record<string, string>> = {
  node: {
    'index.js': '// Write your Node.js code here...\nconsole.log("Hello Node!");\n',
    'package.json': '{\n  "name": "node-qq",\n  "version": "1.0.0",\n  "main": "index.js",\n  "scripts": {\n    "start": "node index.js"\n  }\n}'
  },
  react: {
    'src/App.jsx': 'import React from "react";\nexport default function App() {\n  return (\n    <div style={{ padding: 20, textAlign: "center", fontFamily: "sans-serif" }}>\n      <h1 style={{ color: "#8b5cf6" }}>React Sandbox Pop-Quiz</h1>\n      <p>Edit src/App.jsx to see live browser updates below!</p>\n    </div>\n  );\n}\n',
    'src/main.jsx': 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App.jsx";\nimport "./index.css";\nReactDOM.createRoot(document.getElementById("root")).render(<App />);\n',
    'src/index.css': 'body { margin: 0; background: #0f172a; color: white; }\n',
    'index.html': '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite React QQ</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n',
    'package.json': '{\n  "name": "vite-react-qq",\n  "version": "0.0.0",\n  "type": "module",\n  "scripts": {\n    "dev": "vite --host 0.0.0.0 --port 3000"\n  },\n  "dependencies": {\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  },\n  "devDependencies": {\n    "vite": "^4.4.5"\n  }\n}'
  },
  html: {
    'index.html': '<!DOCTYPE html>\n<html>\n<head>\n  <style>body { font-family: sans-serif; background: #111; color: #eee; padding: 20px; }</style>\n</head>\n<body>\n  <h1>Static HTML Quick Question Sandbox</h1>\n  <p>Modify index.html directly!</p>\n</body>\n</html>\n',
    'package.json': '{\n  "name": "static-html-qq",\n  "version": "1.0.0",\n  "scripts": {\n    "start": "serve -p 3000"\n  },\n  "dependencies": {\n    "serve": "^14.2.1"\n  }\n}'
  }
};

const buildFileTree = (files: Record<string, string>): FileNode[] => {
  const root: FileNode[] = [];

  for (const filePath of Object.keys(files)) {
    const parts = filePath.split('/');
    let currentLevel = root;
    let accumulatedPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      let existing = currentLevel.find(node => node.name === part);
      if (!existing) {
        existing = {
          name: part,
          path: accumulatedPath,
          type: isFile ? 'file' : 'folder',
          children: isFile ? undefined : []
        };
        currentLevel.push(existing);
      }
      if (!isFile) {
        currentLevel = existing.children!;
      }
    }
  }

  const sortTree = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(node => {
      if (node.children) sortTree(node.children);
    });
  };

  sortTree(root);
  return root;
};

// Scan WebContainer directory to fetch files from disk recursively
const scanDirectory = async (wc: WebContainer, dir = ''): Promise<Record<string, string>> => {
  const entries = await wc.fs.readdir(dir, { withFileTypes: true });
  const files: Record<string, string> = {};
  
  for (const entry of entries) {
    const relativePath = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'package-lock.json' || entry.name === '.git') {
      continue;
    }
    
    if (entry.isDirectory()) {
      const subFiles = await scanDirectory(wc, relativePath);
      Object.assign(files, subFiles);
    } else {
      try {
        const contents = await wc.fs.readFile(relativePath, 'utf-8');
        files[relativePath] = contents;
      } catch (e) {
        // file could be binary or unreadable
      }
    }
  }
  return files;
};

export default function Workspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classroomId = searchParams.get('id');
  const mode = (searchParams.get('mode') || 'live') as 'live' | 'test' | 'assignment';
  const testId = searchParams.get('testId') || null;
  const assignmentId = searchParams.get('assignmentId') || null;

  const [student, setStudent] = useState<any>(null);
  
  // Data loading states
  const [notesList, setNotesList] = useState<NotesData[]>([]);
  const [questionsList, setQuestionsList] = useState<QuestionData[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<number>(1);
  const [activeNote, setActiveNote] = useState<NotesData | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeNotesView, setActiveNotesView] = useState<'list' | 'reader'>('list');
  const [downloadingZip, setDownloadingZip] = useState(false);

  // Classroom Live / Test configurations state
  const [liveSessionActive, setLiveSessionActive] = useState(false);
  const [activeTest, setActiveTest] = useState<any>(null);
  const [activeAssignment, setActiveAssignment] = useState<any>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [testTimeLeft, setTestTimeLeft] = useState(300); // 5 minutes default per test question
  
  const [quickQuestion, setQuickQuestion] = useState<string | null>(null);
  const [quickQuestionTimeLeft, setQuickQuestionTimeLeft] = useState(90); // 1.5 minutes default
  const [quickQuestionId, setQuickQuestionId] = useState<string | null>(null);
  const [qqCode, setQqCode] = useState('// Write your JavaScript solution here...');
  const [mainFilesBackup, setMainFilesBackup] = useState<Record<string, string> | null>(null);
  const [qqReasoning, setQqReasoning] = useState('');
  const [tabSwitchBlocked, setTabSwitchBlocked] = useState(true);
  const [pasteBlocked, setPasteBlocked] = useState(true);
  const pendingMishapsRef = useRef<{ type: string; timestamp: number; isTest: boolean }[]>([]);

  // Layout states
  const [notesOpen, setNotesOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [taskOpen, setTaskOpen] = useState(true);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [terminalWidth, setTerminalWidth] = useState(320);
  const [previewHeight, setPreviewHeight] = useState(250);
  const [isResizingTerminal, setIsResizingTerminal] = useState(false);
  const [isResizingPreview, setIsResizingPreview] = useState(false);

  // File Tree Explorer State
  const [flatFiles, setFlatFiles] = useState<Record<string, string>>({});
  const [activeFilePath, setActiveFilePath] = useState<string>('index.js');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  
  const [code, setCode] = useState('// Write your javascript solution here\n\n');
  const [reasoningAnswer, setReasoningAnswer] = useState('');

  // WebContainer state
  const [webcontainer, setWebcontainer] = useState<WebContainer | null>(null);
  const [webcontainerBooting, setWebcontainerBooting] = useState(false);
  const [runStatus, setRunStatus] = useState<'idle' | 'installing' | 'running' | 'done' | 'error'>('idle');
  
  // Manual Preview URL input
  const [previewUrlInput, setPreviewUrlInput] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Telemetry diagnostic state
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [pasteAttemptCount, setPasteAttemptCount] = useState(0);
  const [idleState, setIdleState] = useState<'active' | 'idle'>('active');
  const [idleStartTime, setIdleStartTime] = useState<number | null>(null);
  const [idleDuration, setIdleDuration] = useState(0);
  const [lastSyncedTimestamp, setLastSyncedTimestamp] = useState<string | null>(null);
  const [headingsReached, setHeadingsReached] = useState<number[]>([]);
  const [startTime, setStartTime] = useState<number>(0);

  // Expanded observation card connection and cache states
  const [backendConnected, setBackendConnected] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const [cacheSizeBytes, setCacheSizeBytes] = useState(0);
  const [activeSectionTitle, setActiveSectionTitle] = useState<string>('Introduction');
  const [notesScrollPercent, setNotesScrollPercent] = useState<number>(0);
  const [headingsReachedTitles, setHeadingsReachedTitles] = useState<string[]>([]);
  const [maxScrollDepth, setMaxScrollDepth] = useState<number>(0);
  const [dwellTimesMap, setDwellTimesMap] = useState<Record<string, number>>({});
  const [notesTelemetryMap, setNotesTelemetryMap] = useState<Record<number, { headingId: number; title: string; dwellSeconds: number; revisitCount: number; firstReachedAt: string }>>({});
  const [notesLoading, setNotesLoading] = useState<boolean>(false);
  const contentFetchedRef = useRef<boolean>(false);
  const activeHeadingRef = useRef<{ title: string; index: number; enteredAt: number } | null>(null);

  // Dynamic Multiple Terminals State
  const [terminalTabs, setTerminalTabs] = useState<{ id: string; label: string }[]>([
    { id: 'default', label: 'Terminal 1' }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('default');

  // Terminal collection refs
  const terminalsRef = useRef<Record<string, Terminal>>({});
  const fitAddonsRef = useRef<Record<string, FitAddon>>({});
  const writersRef = useRef<Record<string, any>>({});
  const shellsRef = useRef<Record<string, any>>({});
  
  const socketInstance = useRef<Socket | null>(null);
  const webcontainerRef = useRef<WebContainer | null>(null);
  const headingObserverRef = useRef<IntersectionObserver | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

  // 1. Verify Authentication & Load Student details
  useEffect(() => {
    const studentData = localStorage.getItem('student');
    if (!studentData || !classroomId) {
      router.push('/dashboard');
      return;
    }
    const parsed = JSON.parse(studentData);
    setStudent(parsed);
    setStartTime(Date.now());
  }, [router, classroomId]);

  // 2. Fetch classroom Live/Test active status & bootstrap configuration
  useEffect(() => {
    if (!student || !classroomId) return;

    const getStatus = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/classroom/${classroomId}/status`);
        if (res.ok) {
          const data = await res.json();
          setLiveSessionActive(data.liveSessionActive);
          setActiveTest(data.activeTest);
          setBackendConnected(true);
        } else {
          setBackendConnected(false);
        }
      } catch (err) {
        setBackendConnected(false);
        console.error('Failed to retrieve classroom mode status:', err);
      }
    };

    getStatus();
    const interval = setInterval(getStatus, 5000); // 5-second interval pings to check REST API connection
    return () => clearInterval(interval);
  }, [student, classroomId]);

  // 3. Connect Socket.io client conditionally based on mode and session activation status
  useEffect(() => {
    if (!student || !classroomId) return;
    
    const isTestMode = mode === 'test';
    const isAssignmentMode = mode === 'assignment';
    const shouldConnect = isTestMode || isAssignmentMode || liveSessionActive;

    if (!shouldConnect) {
      if (socketInstance.current) {
        socketInstance.current.disconnect();
        socketInstance.current = null;
        setSocketConnected(false);
      }
      return;
    }

    if (socketInstance.current) return;

    const socket = io(backendUrl);
    socketInstance.current = socket;

    socket.on('connect', () => {
      console.log('Socket.io connected:', socket.id);
      setSocketConnected(true);
      socket.emit('room:join', { classroomId, studentId: student.id });
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('classroom:live_status', (data: { live: boolean }) => {
      setLiveSessionActive(data.live);
    });

    socket.on('classroom:test_status', (data: { active: boolean; test?: any }) => {
      if (data.active) {
        setActiveTest(data.test);
        alert(`Test session started: ${data.test?.title || ''}`);
      } else {
        setActiveTest(null);
        alert('Test session ended.');
      }
    });

    socket.on('classroom:quick_question', async (data: { questionId: string; questionText: string; template: string; durationSeconds: number }) => {
      setQuickQuestionId(data.questionId);
      setQuickQuestion(data.questionText);
      setQuickQuestionTimeLeft(data.durationSeconds);
      
      // Backup main files directly from WebContainer disk to avoid stale state
      let backupFiles = flatFiles;
      if (webcontainerRef.current) {
        try {
          const currentFiles = await scanDirectory(webcontainerRef.current);
          if (Object.keys(currentFiles).length > 0) {
            backupFiles = currentFiles;
          }
        } catch (e) {
          console.error('Filesystem backup scan failed:', e);
        }
      }
      setMainFilesBackup(backupFiles);
      resetAllTerminals();
      
      // Load selected sandbox template
      const templateName = data.template || 'node';
      const templateFiles = QQ_TEMPLATES[templateName] || QQ_TEMPLATES.node;
      setFlatFiles(templateFiles);
      
      const initialActiveFile = templateName === 'react' ? 'src/App.jsx' : templateName === 'html' ? 'index.html' : 'index.js';
      setActiveFilePath(initialActiveFile);
      setCode(templateFiles[initialActiveFile]);
      
      // Mount inside WebContainer
      if (webcontainerRef.current) {
        try {
          const nested = buildWebContainerFiles(templateFiles);
          await webcontainerRef.current.mount(nested);
          console.log(`Successfully booted isolated Quick Question sandbox: ${templateName}`);
        } catch (e) {
          console.error('Failed to mount quick question sandbox:', e);
        }
      }
      
      alert(`Instructor pushed a Quick Question (${templateName} environment)! You have ${data.durationSeconds}s.`);
    });

    socket.on('classroom:notes_updated', (data: { topicNumber: number; title: string; markdownContent: string; headingsManifest?: HeadingManifestItem[] }) => {
      setNotesList(prev => {
        const index = prev.findIndex(n => n.topicNumber === data.topicNumber);
        const updated = [...prev];
        const newNote = {
          id: data.topicNumber.toString(),
          topicNumber: data.topicNumber,
          title: data.title,
          markdownContent: data.markdownContent,
          headingsManifest: data.headingsManifest
        };
        if (index >= 0) {
          updated[index] = newNote;
        } else {
          updated.push(newNote);
        }
        
        setActiveNote(current => {
          if (current && current.topicNumber === data.topicNumber) {
            return newNote;
          }
          return current;
        });

        return updated;
      });
    });

    socket.on('classroom:rules_updated', (data: { tabSwitchBlocked: boolean; pasteBlocked: boolean }) => {
      setTabSwitchBlocked(data.tabSwitchBlocked);
      setPasteBlocked(data.pasteBlocked);
    });

    return () => {
      socket.disconnect();
      socketInstance.current = null;
      setSocketConnected(false);
    };
  }, [student, classroomId, liveSessionActive, mode]);

  // 4. Centralized telemetry rules registration
  useEffect(() => {
    if (!student || !classroomId) return;

    const ctx = {
      socket: null, // Pass null to prevent immediate socket emits from analyzerRules.ts
      studentId: student.id,
      classroomId,
      isTest: mode === 'test'
    };

    // 1. Monitor tab switches
    const cleanupTabSwitch = registerTabSwitch(ctx, () => {
      if (!tabSwitchBlocked) return;
      setTabSwitchCount(prev => prev + 1);
      pendingMishapsRef.current.push({
        type: 'tab_switch',
        timestamp: Date.now(),
        isTest: mode === 'test'
      });
    });

    // 2. Intercept copy-paste events on editor and all typed reasoning questions inputs
    const cleanupPasteBlock = registerPasteBlock('textarea, input[type="text"], .inputarea', ctx, () => {
      if (!pasteBlocked) return false; // Let the paste through!

      setPasteAttemptCount(prev => prev + 1);
      pendingMishapsRef.current.push({
        type: 'paste_attempt',
        timestamp: Date.now(),
        isTest: mode === 'test'
      });
      return true; // Block the paste!
    });

    // 3. Monitor student inactivity timeouts (2 minutes threshold)
    const cleanupInactivity = registerInactivity(ctx, 2 * 60 * 1000, (isIdle) => {
      setIdleState(isIdle ? 'idle' : 'active');
      if (isIdle) {
        setIdleStartTime(Date.now());
        pendingMishapsRef.current.push({
          type: 'inactivity',
          timestamp: Date.now(),
          isTest: mode === 'test'
        });
      } else {
        setIdleStartTime(null);
      }
    });

    return () => {
      cleanupTabSwitch();
      cleanupPasteBlock();
      cleanupInactivity();
    };
  }, [student, classroomId, liveSessionActive, mode, tabSwitchBlocked, pasteBlocked]);

  // 4.1 Batch telemetry transmitter (runs every 60 seconds)
  useEffect(() => {
    const socket = socketInstance.current;
    if (!socket || !student || !classroomId) return;

    const interval = setInterval(() => {
      if (pendingMishapsRef.current.length > 0) {
        const batch = [...pendingMishapsRef.current];
        pendingMishapsRef.current = [];
        socket.emit('mishap:batch', {
          studentId: student.id,
          classroomId,
          mishaps: batch
        });
      }
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [student, classroomId, socketConnected]);

  // Track idle duration seconds
  useEffect(() => {
    if (idleState !== 'idle' || !idleStartTime) {
      setIdleDuration(0);
      return;
    }
    const interval = setInterval(() => {
      setIdleDuration(Math.round((Date.now() - idleStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [idleState, idleStartTime]);

  // 4.2 Resizable Panels Mouse Handlers
  useEffect(() => {
    if (!isResizingTerminal && !isResizingPreview) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingTerminal) {
        const newWidth = window.innerWidth - e.clientX;
        setTerminalWidth(Math.max(150, Math.min(newWidth, window.innerWidth - 300)));
      } else if (isResizingPreview) {
        const newHeight = window.innerHeight - e.clientY;
        setPreviewHeight(Math.max(100, Math.min(newHeight, window.innerHeight - 200)));
      }
    };

    const handleMouseUp = () => {
      setIsResizingTerminal(false);
      setIsResizingPreview(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingTerminal, isResizingPreview]);

  // Calculate local storage file cache size
  useEffect(() => {
    if (!classroomId) return;
    const key = `autosave_files_v2_${classroomId}_${selectedTopic}`;
    const data = localStorage.getItem(key);
    setCacheSizeBytes(data ? data.length : 0);
  }, [code, flatFiles, classroomId, selectedTopic]);

  // 5. Fetch Classroom Content
  const fetchClassroomContent = async () => {
    if (!student || !classroomId) return;
    setActiveNote(null); // Clear previous note immediately to avoid displaying stale data
    setNotesLoading(true);
    try {
      let notes = notesList;
      let questions = questionsList;

      if (!contentFetchedRef.current || notesList.length === 0) {
        const res = await fetch(`${backendUrl}/api/classroom/${classroomId}/content`, {
          headers: {
            'Authorization': student.sessionToken
          }
        });
        if (!res.ok) throw new Error('Failed to fetch classroom content');
        const data = await res.json();
        notes = data.notes;
        questions = data.questions;
        setNotesList(notes);
        setQuestionsList(questions);
        contentFetchedRef.current = true;
      }

      // Fetch persisted workspace from database
      let dbFiles = null;
      try {
        const wsRes = await fetch(`${backendUrl}/api/workspace/${classroomId}`, {
          headers: { 'Authorization': student.sessionToken }
        });
        if (wsRes.ok) {
          const wsData = await wsRes.json();
          dbFiles = wsData.files;
        }
      } catch (err) {
        console.error('Failed to restore workspace from database:', err);
      }

      const topicNotes = notes.find((n: NotesData) => n.topicNumber === selectedTopic);
      const topicQuestion = questions.find((q: QuestionData) => q.topicNumber === selectedTopic);
      setActiveNote(topicNotes || null);
      
      if (mode === 'assignment') {
        try {
          const assRes = await fetch(`${backendUrl}/api/assignments`, {
            headers: { 'Authorization': student.sessionToken }
          });
          if (assRes.ok) {
            const assData = await assRes.json();
            const ass = assData.assignments.find((a: any) => a.id === assignmentId);
            if (ass) {
              ass.questions = (ass.questions || []).map((q: any) => ({
                id: q.id,
                codeTaskPrompt: q.code_task_prompt !== undefined ? q.code_task_prompt : q.codeTaskPrompt,
                reasoningPrompt: q.reasoning_prompt !== undefined ? q.reasoning_prompt : q.reasoningPrompt,
                reasoningType: q.reasoning_type !== undefined ? q.reasoning_type : q.reasoningType,
                options: Array.isArray(q.options) ? q.options : (typeof q.options === 'string' ? JSON.parse(q.options || '[]') : q.options || []),
                timerSeconds: q.timer_seconds !== undefined ? q.timer_seconds : q.timerSeconds
              }));

              setActiveAssignment(ass);
              const startIdx = ass.submittedQuestionIds.length;
              setCurrentQuestionIndex(startIdx);
              const activeQ = ass.questions[startIdx];
              if (activeQ) {
                setActiveQuestion(activeQ);
                if (activeQ.timerSeconds) {
                  setTestTimeLeft(activeQ.timerSeconds);
                } else {
                  setTestTimeLeft(999999); // Untimed sentinel
                }

                // Emit socket event to notify instructor of active status
                socketInstance.current?.emit('assignment:start', {
                  assignmentId: ass.id,
                  studentId: student.id,
                  studentName: student.name,
                  studentRollNumber: student.rollNumber || student.roll_number,
                  classroomId
                });
              }
            }
          }
        } catch (e) {
          console.error('Failed to load assignment detail:', e);
        }

        const cleanTree = {
          'package.json': JSON.stringify({
            name: 'assignment-sandbox',
            type: 'module',
            dependencies: {
              'express': '^4.19.2'
            },
            scripts: {
              'start': 'node index.js'
            }
          }, null, 2),
          'index.js': '// Start assignment question solution here\n\n'
        };
        setFlatFiles(cleanTree);
        setActiveFilePath('index.js');
        setCode(cleanTree['index.js']);
      } else if (mode === 'test') {
        // Test Mode: isolated, fresh environment. Questions loaded sequentially.
        setActiveQuestion(questions[currentQuestionIndex] || null);
        localStorage.removeItem(`autosave_files_v2_${classroomId}_${selectedTopic}`);
        localStorage.removeItem(`autosave_reasoning_${classroomId}_${selectedTopic}`);
        
        const cleanTree = {
          'package.json': JSON.stringify({
            name: 'test-sandbox',
            type: 'module',
            dependencies: {
              'express': '^4.19.2'
            },
            scripts: {
              'start': 'node index.js'
            }
          }, null, 2),
          'index.js': '// Start fresh test question solution here\n\n'
        };
        setFlatFiles(cleanTree);
        setActiveFilePath('index.js');
        setCode(cleanTree['index.js']);
      } else {
        // Live Mode: restore code states from cache (DB first, then localStorage)
        setActiveQuestion(topicQuestion || null);
        const cachedTree = localStorage.getItem(`autosave_files_v2_${classroomId}_${selectedTopic}`);
        const cachedReasoning = localStorage.getItem(`autosave_reasoning_${classroomId}_${selectedTopic}`);
        
        let filesToLoad = null;
        if (dbFiles && typeof dbFiles === 'object') {
          filesToLoad = dbFiles;
          console.log('Restoring workspace files from database.');
        } else if (cachedTree !== null) {
          filesToLoad = JSON.parse(cachedTree);
          console.log('Restoring workspace files from local browser cache.');
        }

        if (filesToLoad !== null) {
          setFlatFiles(filesToLoad);
          const paths = Object.keys(filesToLoad);
          const nextActive = paths.includes('index.js') ? 'index.js' : paths[0] || 'index.js';
          setActiveFilePath(nextActive);
          setCode(filesToLoad[nextActive] || '');
        } else {
          const defaultTree = {
            'package.json': JSON.stringify({
              name: 'classroom-sandbox',
              type: 'module',
              dependencies: {
                'express': '^4.19.2'
              },
              scripts: {
                'start': 'node index.js'
              }
            }, null, 2),
            'index.js': '// Write your javascript solution here\n\n'
          };
          setFlatFiles(defaultTree);
          setActiveFilePath('index.js');
          setCode(defaultTree['index.js']);
        }

        if (cachedReasoning !== null) {
          setReasoningAnswer(cachedReasoning);
        } else {
          setReasoningAnswer('');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setNotesLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (student && classroomId) {
      fetchClassroomContent();
    }
  }, [student, selectedTopic, classroomId, currentQuestionIndex]);

  // 6. Test/Assignment countdown timers & auto-submit handling
  useEffect(() => {
    if ((mode !== 'test' && mode !== 'assignment') || !activeQuestion) return;
    if (mode === 'assignment' && testTimeLeft >= 999999) return;

    const interval = setInterval(() => {
      setTestTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleAutoSubmitTestQuestion();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeQuestion, currentQuestionIndex, mode, testTimeLeft]);

  const handleAutoSubmitTestQuestion = async () => {
    await handleSubmitSolution();
    if (mode === 'test') {
      if (currentQuestionIndex < questionsList.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setTestTimeLeft(300); // 5 minutes for next question
      } else {
        alert('Test finished. All answers auto-submitted.');
      }
    }
  };

  // Quick Question timer countdown
  useEffect(() => {
    if (!quickQuestion) return;
    const interval = setInterval(() => {
      setQuickQuestionTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmitQuickQuestion();
          alert('Quick Question time expired. Code auto-submitted.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [quickQuestion, qqCode, qqReasoning, quickQuestionId]);

  // 7. Heading-reach tracking
  useEffect(() => {
    if (!activeNote) return;

    if (headingObserverRef.current) {
      headingObserverRef.current.disconnect();
    }

    // Flush last heading's dwell time on unmount / change
    return () => {
      if (activeHeadingRef.current) {
        const elapsed = Math.round((Date.now() - activeHeadingRef.current.enteredAt) / 1000);
        if (elapsed > 0) {
          const finalHeading = activeHeadingRef.current;
          setDwellTimesMap(prev => ({
            ...prev,
            [finalHeading.title]: (prev[finalHeading.title] || 0) + elapsed
          }));
          setNotesTelemetryMap(prev => {
            const existing = prev[finalHeading.index];
            if (existing) {
              return {
                ...prev,
                [finalHeading.index]: {
                  ...existing,
                  dwellSeconds: existing.dwellSeconds + elapsed
                }
              };
            }
            return prev;
          });
          if (socketInstance.current?.connected && student) {
            socketInstance.current.emit('telemetry:heading_reached', {
              studentId: student.id,
              headingIndex: finalHeading.index,
              headingTitle: finalHeading.title,
              dwellSeconds: elapsed
            });
          }
        }
      }
      activeHeadingRef.current = null;
      setNotesTelemetryMap({});
      setHeadingsReached([]);
      setHeadingsReachedTitles([]);
      setMaxScrollDepth(0);
    };
  }, [activeNote]);

  useEffect(() => {
    if (!activeNote) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idAttr = entry.target.getAttribute('data-heading-id');
            const titleAttr = entry.target.getAttribute('data-heading-title');
            if (idAttr) {
              const headingId = parseInt(idAttr, 10);
              const headingTitle = titleAttr || `Heading ${headingId}`;
              
              setActiveSectionTitle(headingTitle);

              // 1. Calculate dwell time for previous active section
              if (activeHeadingRef.current && activeHeadingRef.current.index !== headingId) {
                const elapsed = Math.round((Date.now() - activeHeadingRef.current.enteredAt) / 1000);
                if (elapsed > 0) {
                  const prevHeading = activeHeadingRef.current;
                  setDwellTimesMap(prev => ({
                    ...prev,
                    [prevHeading.title]: (prev[prevHeading.title] || 0) + elapsed
                  }));
                  setNotesTelemetryMap(prev => {
                    const existing = prev[prevHeading.index];
                    if (existing) {
                      return {
                        ...prev,
                        [prevHeading.index]: {
                          ...existing,
                          dwellSeconds: existing.dwellSeconds + elapsed
                        }
                      };
                    }
                    return prev;
                  });
                  if (socketInstance.current?.connected && student) {
                    socketInstance.current.emit('telemetry:heading_reached', {
                      studentId: student.id,
                      headingIndex: prevHeading.index,
                      headingTitle: prevHeading.title,
                      dwellSeconds: elapsed
                    });
                  }
                }
              }

              // 2. Set new active section timestamps and revisit counts
              const isRevisit = activeHeadingRef.current && activeHeadingRef.current.index !== headingId;

              setNotesTelemetryMap(prev => {
                const existing = prev[headingId];
                if (existing) {
                  return {
                    ...prev,
                    [headingId]: {
                      ...existing,
                      revisitCount: isRevisit ? existing.revisitCount + 1 : existing.revisitCount
                    }
                  };
                }
                return {
                  ...prev,
                  [headingId]: {
                    headingId,
                    title: headingTitle,
                    dwellSeconds: 0,
                    revisitCount: 0,
                    firstReachedAt: new Date().toISOString()
                  }
                };
              });

              activeHeadingRef.current = {
                title: headingTitle,
                index: headingId,
                enteredAt: Date.now()
              };

              setHeadingsReached((prev) => {
                if (prev.length > 0 && prev[prev.length - 1] === headingId) {
                  return prev;
                }
                const next = [...prev, headingId];
                setHeadingsReachedTitles((prevTitles) => [...prevTitles, headingTitle]);
                return next;
              });
            }
          }
        });
      },
      {
        root: document.getElementById('notes-scroll-container'),
        rootMargin: '0px 0px -60% 0px',
        threshold: 0.1
      }
    );

    headingObserverRef.current = observer;

    setTimeout(() => {
      const headings = document.querySelectorAll('[data-heading-id]');
      headings.forEach((heading) => observer.observe(heading));
    }, 100);

    return () => {
      observer.disconnect();
    };
  }, [activeNote, student]);

  // 7.1 Scroll percentage tracking
  useEffect(() => {
    const scrollContainer = document.getElementById('notes-scroll-container');
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const totalScrollable = scrollHeight - clientHeight;
      if (totalScrollable <= 0) {
        setNotesScrollPercent(100);
        setMaxScrollDepth(prev => Math.max(prev, 100));
        return;
      }
      const percent = Math.round((scrollTop / totalScrollable) * 100);
      setNotesScrollPercent(percent);
      setMaxScrollDepth(prev => Math.max(prev, percent));
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [activeNote, activeNotesView]);

  // 8. Initialize Terminal Tab dynamically on element mount
  const initializeTerminalTab = async (tabId: string, el: HTMLDivElement) => {
    if (terminalsRef.current[tabId]) return;

    const term = new Terminal({
      convertEol: true,
      theme: {
        background: '#020617', // slate-950
        foreground: '#f8fafc', // slate-50
        cursor: '#6366f1' // indigo-500
      },
      fontSize: 12,
      fontFamily: 'Courier New, monospace'
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    fitAddon.fit();

    terminalsRef.current[tabId] = term;
    fitAddonsRef.current[tabId] = fitAddon;

    term.writeln(`\x1b[1;35m[Terminal: ${tabId.startsWith('term-') ? 'Tab' : 'Default'}] Initializing...\x1b[0m`);

    if (webcontainerRef.current) {
      await startShellForTab(tabId, term);
    }
  };

  const startShellForTab = async (tabId: string, term: Terminal) => {
    if (shellsRef.current[tabId]) return;
    const wc = webcontainerRef.current;
    if (!wc) return;

    try {
      const shell = await wc.spawn('jsh', {
        terminal: {
          cols: 80,
          rows: 24
        }
      });
      shellsRef.current[tabId] = shell;

      shell.output.pipeTo(
        new WritableStream({
          write(data) {
            term.write(data);
          }
        })
      );

      const writer = shell.input.getWriter();
      writersRef.current[tabId] = writer;

      term.onData((data) => {
        writer.write(data);
      });

      term.writeln('\x1b[1;32mInteractive shell session active.\x1b[0m\r\n');
    } catch (err: any) {
      term.writeln(`\x1b[1;31mFailed to spawn shell: ${err.message}\x1b[0m`);
    }
  };

  // 9. Boot WebContainer & Start Interactive jsh shells
  const bootWebContainerInstance = async () => {
    if (typeof window === 'undefined') return;

    if (window.__webcontainer_instance__) {
      webcontainerRef.current = window.__webcontainer_instance__;
      setWebcontainer(window.__webcontainer_instance__);
      await triggerShellsOnBoot(window.__webcontainer_instance__);
      return;
    }

    if (window.__webcontainer_promise__) {
      setWebcontainerBooting(true);
      try {
        const instance = await window.__webcontainer_promise__;
        window.__webcontainer_instance__ = instance;
        webcontainerRef.current = instance;
        setWebcontainer(instance);
        await triggerShellsOnBoot(instance);
      } catch (err: any) {
        console.error(err);
      } finally {
        setWebcontainerBooting(false);
      }
      return;
    }

    setWebcontainerBooting(true);
    try {
      window.__webcontainer_promise__ = WebContainer.boot();
      const instance = await window.__webcontainer_promise__;
      window.__webcontainer_instance__ = instance;
      webcontainerRef.current = instance;
      setWebcontainer(instance);
      
      await triggerShellsOnBoot(instance);
    } catch (err: any) {
      console.error(err);
      window.__webcontainer_promise__ = undefined;
    } finally {
      setWebcontainerBooting(false);
    }
  };

  const triggerShellsOnBoot = async (wc: WebContainer) => {
    const nestedFiles = buildWebContainerFiles(flatFiles);
    await wc.mount(nestedFiles);

    for (const [tabId, term] of Object.entries(terminalsRef.current)) {
      await startShellForTab(tabId, term);
    }

    wc.on('server-ready', (port, url) => {
      const activeTerm = terminalsRef.current[activeTabId];
      if (activeTerm) {
        activeTerm.writeln(`\r\n\x1b[1;32m[SERVER READY] Live Port: ${port} | Link: ${url}\x1b[0m`);
      }
      setPreviewUrlInput(url);
    });
  };

  const handleReloadPreview = () => {
    if (previewUrlInput.trim()) {
      let url = previewUrlInput.trim();
      if (!/^https?:\/\//i.test(url)) {
        url = 'http://' + url;
      }
      try {
        const parsed = new URL(url);
        parsed.searchParams.set('t', Date.now().toString());
        setPreviewUrl(parsed.toString());
      } catch (e) {}
    }
  };

  useEffect(() => {
    if (!loading) {
      bootWebContainerInstance();
    }
  }, [loading]);

  // Two-way FS Watcher integration
  useEffect(() => {
    if (!webcontainer) return;

    let scanTimeout: NodeJS.Timeout;

    const triggerScan = () => {
      clearTimeout(scanTimeout);
      scanTimeout = setTimeout(async () => {
        try {
          const diskFiles = await scanDirectory(webcontainer);
          
          setFlatFiles(prev => {
            const hasChanged = JSON.stringify(prev) !== JSON.stringify(diskFiles);
            if (hasChanged) {
              const isEditorFocused = document.activeElement?.className?.includes('inputarea') || document.activeElement?.id === 'main-code-editor';
              if (diskFiles[activeFilePath] !== undefined && 
                  diskFiles[activeFilePath] !== prev[activeFilePath] && 
                  !isEditorFocused) {
                setCode(diskFiles[activeFilePath]);
              }
              return diskFiles;
            }
            return prev;
          });
        } catch (err) {
          console.error('Directory sync failed:', err);
        }
      }, 500);
    };

    let watcher: any;
    try {
      watcher = webcontainer.fs.watch('/', { recursive: true }, (event: any, filename: any) => {
        if (!filename) return;
        const fileStr = String(filename);
        if (fileStr.includes('node_modules') || fileStr.includes('.next') || fileStr.includes('package-lock.json') || fileStr.includes('.git')) {
          return;
        }
        triggerScan();
      });
      triggerScan();
    } catch (e) {
      console.error('Failed to register fs watcher:', e);
    }

    return () => {
      if (watcher) {
        try {
          watcher.close();
        } catch (e) {}
      }
      clearTimeout(scanTimeout);
    };
  }, [webcontainer, activeFilePath]);

  // Sync editor modifications back to WebContainer disk
  useEffect(() => {
    if (!webcontainer || loading || !activeFilePath) return;
    const writeTimeout = setTimeout(async () => {
      try {
        await webcontainer.fs.writeFile(activeFilePath, code);
      } catch (e) {
        console.error('Sync to disk failed:', e);
      }
    }, 300);
    return () => clearTimeout(writeTimeout);
  }, [code, activeFilePath, webcontainer, loading]);

  // Helper: autosave active workspace to database
  const autosaveWorkspaceToDB = async () => {
    if (!student || !classroomId || !webcontainerRef.current || mode === 'test') return;
    try {
      const diskFiles = await scanDirectory(webcontainerRef.current);
      if (Object.keys(diskFiles).length === 0) return;

      await fetch(`${backendUrl}/api/workspace/${classroomId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': student.sessionToken
        },
        body: JSON.stringify({ files: diskFiles })
      });
      console.log('Workspace durably autosaved to database.');
    } catch (e) {
      console.error('Workspace durable autosave failed:', e);
    }
  };

  const downloadWorkspaceZip = async () => {
    if (!student || !classroomId) return;
    setDownloadingZip(true);
    try {
      // 1. Force autosave to make sure DB has the latest code
      if (mode !== 'test') {
        await autosaveWorkspaceToDB();
      }

      // 2. Fetch the persisted workspace from DB
      let dbFiles: Record<string, string> = {};
      try {
        const wsRes = await fetch(`${backendUrl}/api/workspace/${classroomId}`, {
          headers: { 'Authorization': student.sessionToken }
        });
        if (wsRes.ok) {
          const wsData = await wsRes.json();
          dbFiles = wsData.files || {};
        }
      } catch (err) {
        console.error('Failed to fetch persisted workspace:', err);
      }

      // Fallback to WebContainer files if database is empty/unreachable or in test mode
      let filesToZip = dbFiles;
      if (Object.keys(filesToZip).length === 0 && webcontainerRef.current) {
        filesToZip = await scanDirectory(webcontainerRef.current);
      }

      if (Object.keys(filesToZip).length === 0) {
        alert('No workspace files found to download.');
        return;
      }

      // 3. Bundle with JSZip
      const zip = new JSZip();
      for (const [path, content] of Object.entries(filesToZip)) {
        zip.file(path, content);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${student.name.replace(/\s+/g, '_')}_workspace.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('Failed to download code zip:', e);
      alert(`Error downloading code zip: ${e.message}`);
    } finally {
      setDownloadingZip(false);
    }
  };

  // Periodic autosave to database (every 30 seconds)
  useEffect(() => {
    if (mode === 'test' || !student || !classroomId || !webcontainer) return;
    const timer = setInterval(() => {
      autosaveWorkspaceToDB();
    }, 30000); // 30s
    return () => clearInterval(timer);
  }, [student, classroomId, webcontainer, mode]);

  // Autosave to database on tab blur, visibility hide, and beforeunload
  useEffect(() => {
    if (mode === 'test' || !student || !classroomId || !webcontainer) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        autosaveWorkspaceToDB();
      }
    };
    const handleBlur = () => {
      autosaveWorkspaceToDB();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBlur);
    };
  }, [student, classroomId, webcontainer, mode]);

  // Dynamic Terminal Actions
  const handleAddTerminalTab = (customLabel?: string, initCmd?: string) => {
    const nextId = `term-${Date.now()}`;
    const nextLabel = customLabel || `Terminal ${terminalTabs.length + 1}`;
    
    setTerminalTabs(prev => [...prev, { id: nextId, label: nextLabel }]);
    setActiveTabId(nextId);

    if (initCmd) {
      setTimeout(async () => {
        const writer = writersRef.current[nextId];
        if (writer) {
          await writer.write(initCmd);
        }
      }, 1000);
    }
  };

  const handleCloseTerminalTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (terminalTabs.length === 1) {
      alert('Cannot close the last terminal tab.');
      return;
    }

    terminalsRef.current[tabId]?.dispose();
    delete terminalsRef.current[tabId];
    delete fitAddonsRef.current[tabId];
    try {
      shellsRef.current[tabId]?.kill();
    } catch (err) {}
    delete shellsRef.current[tabId];
    delete writersRef.current[tabId];

    const remaining = terminalTabs.filter(t => t.id !== tabId);
    setTerminalTabs(remaining);

    if (activeTabId === tabId) {
      setActiveTabId(remaining[remaining.length - 1].id);
    }
  };

  const handleRunWorkspace = () => {
    handleAddTerminalTab('Run Workspace', 'npm install && npm run start\n');
  };

  const resetAllTerminals = () => {
    Object.keys(terminalsRef.current).forEach(tabId => {
      try {
        terminalsRef.current[tabId]?.dispose();
      } catch (e) {}
      try {
        shellsRef.current[tabId]?.kill();
      } catch (e) {}
    });
    terminalsRef.current = {};
    fitAddonsRef.current = {};
    shellsRef.current = {};
    writersRef.current = {};

    const nextId = `term-${Date.now()}`;
    setTerminalTabs([{ id: nextId, label: 'Terminal 1' }]);
    setActiveTabId(nextId);
  };

  const handleTopicChange = (topic: number) => {
    setSelectedTopic(topic);
    setHeadingsReached([]);
  };



  // Submit Solution (Live / Test branch handled on backend)
  const handleSubmitSolution = async () => {
    if (!student || !activeQuestion || !classroomId) return;

    // Flush any pending batch mishaps before submitting solution
    if (socketInstance.current?.connected && pendingMishapsRef.current.length > 0) {
      const batch = [...pendingMishapsRef.current];
      pendingMishapsRef.current = [];
      socketInstance.current.emit('mishap:batch', {
        studentId: student.id,
        classroomId,
        mishaps: batch
      });
    }

    const timeTakenSeconds = Math.round((Date.now() - startTime) / 1000);
    const notesTelemetry = {
      notesExploration: Object.values(notesTelemetryMap),
      maxScrollDepthPercent: maxScrollDepth
    };
    const payload = {
      classroomId,
      questionId: activeQuestion.id,
      testId, // passes test context if running Test Mode
      code: JSON.stringify(flatFiles),
      codeOutput: previewUrl ? `Server running at: ${previewUrl}` : 'No running preview instance.',
      reasoningAnswer,
      timeTakenSeconds,
      tabSwitchCount,
      headingsReached,
      dwellSeconds: dwellTimesMap,
      maxScrollDepth,
      notesTelemetry
    };

    try {
      if (mode === 'assignment') {
        const res = await fetch(`${backendUrl}/api/assignments/${activeAssignment.id}/submit-question`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': student.sessionToken
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Assignment question submission failed.');
        
        const nextIdx = currentQuestionIndex + 1;
        const isCompleted = nextIdx >= activeAssignment.questions.length;
        
        socketInstance.current?.emit('assignment:progress', {
          assignmentId: activeAssignment.id,
          studentId: student.id,
          studentName: student.name,
          studentRollNumber: student.rollNumber || student.roll_number,
          questionIndex: currentQuestionIndex,
          isCompleted,
          classroomId
        });

        alert('Question submitted successfully!');
        setCurrentQuestionIndex(nextIdx);
        
        if (!isCompleted) {
          const nextQ = activeAssignment.questions[nextIdx];
          setActiveQuestion(nextQ);
          if (nextQ.timerSeconds) {
            setTestTimeLeft(nextQ.timerSeconds);
          } else {
            setTestTimeLeft(999999);
          }
          setCode('// Start fresh assignment question solution here\n\n');
        } else {
          setActiveQuestion(null);
          alert('Congratulations! You have completed the entire assignment.');
          window.location.href = '/dashboard';
        }
        return;
      }

      const res = await fetch(`${backendUrl}/api/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': student.sessionToken
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Submission request failed');

      setLastSyncedTimestamp(new Date().toISOString());
      alert('Solution submitted successfully!');
      
      if (mode !== 'test') {
        localStorage.removeItem(`autosave_files_v2_${classroomId}_${selectedTopic}`);
        localStorage.removeItem(`autosave_reasoning_${classroomId}_${selectedTopic}`);
      }
    } catch (err: any) {
      alert(`Error submitting solution: ${err.message}`);
    }
  };

  // Submit Quick Question pop-quiz answers specifically
  const handleSubmitQuickQuestion = async () => {
    if (!student || !quickQuestionId || !classroomId) return;

    // Flush any pending batch mishaps before submitting solution
    if (socketInstance.current?.connected && pendingMishapsRef.current.length > 0) {
      const batch = [...pendingMishapsRef.current];
      pendingMishapsRef.current = [];
      socketInstance.current.emit('mishap:batch', {
        studentId: student.id,
        classroomId,
        mishaps: batch
      });
    }

    const notesTelemetry = {
      notesExploration: Object.values(notesTelemetryMap),
      maxScrollDepthPercent: maxScrollDepth
    };

    const payload = {
      classroomId,
      questionId: quickQuestionId,
      code: qqCode,
      codeOutput: 'Submitted via Quick Question pop-quiz.',
      reasoningAnswer: qqReasoning,
      timeTakenSeconds: 90 - quickQuestionTimeLeft,
      tabSwitchCount,
      headingsReached,
      dwellSeconds: {},
      maxScrollDepth,
      notesTelemetry
    };

    try {
      const res = await fetch(`${backendUrl}/api/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': student.sessionToken
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Submission request failed');

      setLastSyncedTimestamp(new Date().toISOString());
      alert('Quick Question solution submitted successfully!');
    } catch (err: any) {
      alert(`Error submitting quick question: ${err.message}`);
    } finally {
      if (mainFilesBackup && webcontainer) {
        setFlatFiles(mainFilesBackup);
        const backupNested = buildWebContainerFiles(mainFilesBackup);
        try {
          await webcontainer.mount(backupNested);
          resetAllTerminals();
        } catch (e) {
          console.error('Failed to restore main files:', e);
        }
        const filesList = Object.keys(mainFilesBackup);
        const nextActive = filesList.includes('index.js') ? 'index.js' : filesList[0] || '';
        setActiveFilePath(nextActive);
        setCode(mainFilesBackup[nextActive] || '');
        setMainFilesBackup(null);
      }
      setQuickQuestionId(null);
      setQuickQuestion(null);
      setQqCode('// Write your JavaScript solution here...');
      setQqReasoning('');
    }
  };

  // Live Doubt Raise
  const handleRaiseHand = () => {
    if (socketInstance.current?.connected && student) {
      socketInstance.current.emit('classroom:doubt', {
        studentId: student.id,
        studentName: student.name,
        classroomId
      });
      alert('Doubt notified to your instructor.');
    } else {
      alert('Doubt notification is disabled. Instructor is not Live.');
    }
  };

  // File explorer functions
  const handleFileSwitch = (path: string) => {
    setFlatFiles(prev => {
      const updated = { ...prev, [activeFilePath]: code };
      return updated;
    });
    setCode(flatFiles[path] || '');
    setActiveFilePath(path);
  };

  const handleCreateFile = async () => {
    const path = prompt('Enter file path (e.g. components/Header.jsx or utils.js):');
    if (!path) return;
    if (flatFiles[path] !== undefined) {
      alert('File already exists.');
      return;
    }
    
    if (webcontainerRef.current) {
      try {
        const parts = path.split('/');
        if (parts.length > 1) {
          const parentFolder = parts.slice(0, -1).join('/');
          await webcontainerRef.current.fs.mkdir(parentFolder, { recursive: true });
        }
        await webcontainerRef.current.fs.writeFile(path, `// File: ${path}\n`);
        setActiveFilePath(path);
        setCode(`// File: ${path}\n`);
      } catch (err: any) {
        console.error('Create file failed:', err.message);
      }
    }
  };

  const handleAddFileInFolder = async (folderPath: string) => {
    const filename = prompt(`Create file inside ${folderPath}/:`);
    if (!filename) return;
    const fullPath = `${folderPath}/${filename}`;
    if (flatFiles[fullPath] !== undefined) {
      alert('File already exists.');
      return;
    }
    
    if (webcontainerRef.current) {
      try {
        await webcontainerRef.current.fs.mkdir(folderPath, { recursive: true });
        await webcontainerRef.current.fs.writeFile(fullPath, `// File: ${fullPath}\n`);
        setActiveFilePath(fullPath);
        setCode(`// File: ${fullPath}\n`);
      } catch (err: any) {
        console.error('Create file in folder failed:', err.message);
      }
    }
  };

  const handleDeleteFileOrFolder = async (path: string, isFolder: boolean) => {
    if (path === 'index.js' || path === 'package.json') {
      alert('Cannot delete index.js or package.json');
      return;
    }
    if (!confirm(`Are you sure you want to delete ${isFolder ? 'folder' : 'file'} "${path}"?`)) return;
    
    if (webcontainerRef.current) {
      try {
        if (isFolder) {
          await webcontainerRef.current.fs.rm(path, { recursive: true });
        } else {
          await webcontainerRef.current.fs.rm(path);
        }
      } catch (err: any) {
        console.error('Delete failed:', err.message);
      }
    }
  };

  const handleRenameFileOrFolder = async (oldPath: string, isFolder: boolean) => {
    if (oldPath === 'index.js' || oldPath === 'package.json') {
      alert('Cannot rename index.js or package.json');
      return;
    }
    const newPath = prompt(`Rename ${isFolder ? 'folder' : 'file'} "${oldPath}" to:`, oldPath);
    if (!newPath || newPath === oldPath) return;

    if (webcontainerRef.current) {
      try {
        await webcontainerRef.current.fs.rename(oldPath, newPath);
      } catch (err: any) {
        console.error('Rename failed:', err.message);
      }
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  // Manual Browser Preview connect handler
  const handleConnectPreview = () => {
    let url = previewUrlInput.trim();
    if (!url) return;
    
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }

    try {
      const parsed = new URL(url);
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      const isWebContainer = parsed.hostname.endsWith('.webcontainer-api.io') || 
                             parsed.hostname.endsWith('.staticblitz.com') ||
                             parsed.hostname.endsWith('.local-corp.staticblitz.com') ||
                             parsed.hostname.endsWith('.w-corp-staticblitz.com');

      if (!isLocalhost && !isWebContainer) {
        alert('Invalid Preview URL. Only localhost or WebContainer application links are allowed.');
        return;
      }

      setPreviewUrl(url);
    } catch (e) {
      alert('Please enter a valid URL.');
    }
  };

  const parseInline = (text: string): React.ReactNode[] => {
    const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
    const splitParts = text.split(regex);
    return splitParts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-bold text-slate-100">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={index} className="italic text-slate-200">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={index} className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-xs text-violet-350">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const parseMarkdown = (md: string) => {
    if (!md) return null;
    const lines = md.split('\n');
    let headingIndex = 0;
    const manifest = activeNote?.headingsManifest || [];
    
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      
      // Code block detection
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre key={`code-${idx}`} className="p-3 bg-slate-950 border border-slate-850 rounded-lg font-mono text-xs text-slate-200 overflow-x-auto my-3">
              <code>{codeBlockLines.join('\n')}</code>
            </pre>
          );
          codeBlockLines = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        continue;
      }
      
      if (inCodeBlock) {
        codeBlockLines.push(line);
        continue;
      }
      
      // Table detection
      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line.slice(1, -1).split('|').map(c => c.trim());
        if (cells.every(c => /^-+$/.test(c) || c === '')) {
          elements.push(<div key={`div-${idx}`} className="border-t border-slate-800 my-1" />);
        } else {
          elements.push(
            <div key={`tab-${idx}`} className="flex gap-4 px-3 py-1.5 bg-slate-900/50 font-mono text-xs text-slate-350 border-l border-r border-slate-800">
              {cells.map((cell, cIdx) => (
                <span key={cIdx} className="flex-1">{parseInline(cell)}</span>
              ))}
            </div>
          );
        }
        continue;
      }
      
      const match = line.match(/^(#{1,6})\s+(.+)/);
      if (match) {
        const level = match[1].length;
        const rawTitle = match[2].trim();
        
        // Strip markdown bold/italics from title in manifest matching
        const cleanRawTitle = rawTitle.replace(/[\*\`]/g, '');
        
        // Find corresponding manifest item
        const manifestItem = manifest[headingIndex];
        headingIndex++;
        
        const headingId = manifestItem ? manifestItem.id : headingIndex;
        const headingTitle = manifestItem ? manifestItem.title : cleanRawTitle;

        if (level === 1) {
          elements.push(
            <h1 
              key={`h1-${idx}`} 
              data-heading-id={headingId}
              data-heading-title={headingTitle}
              className="text-2xl font-bold text-slate-100 border-b border-slate-800 pb-2 mt-4 mb-3"
            >
              {parseInline(rawTitle)}
            </h1>
          );
        } else if (level === 2) {
          elements.push(
            <h2 
              key={`h2-${idx}`} 
              data-heading-id={headingId} 
              data-heading-title={headingTitle}
              className="text-lg font-semibold text-violet-400 mt-6 mb-2 flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4 text-violet-500" />
              {parseInline(rawTitle)}
            </h2>
          );
        } else if (level === 3) {
          elements.push(
            <h3
              key={`h3-${idx}`}
              data-heading-id={headingId}
              data-heading-title={headingTitle}
              className="text-md font-semibold text-slate-350 mt-4 mb-2"
            >
              {parseInline(rawTitle)}
            </h3>
          );
        } else if (level === 4) {
          elements.push(
            <h4
              key={`h4-${idx}`}
              data-heading-id={headingId}
              data-heading-title={headingTitle}
              className="text-sm font-semibold text-slate-350 mt-4 mb-2"
            >
              {parseInline(rawTitle)}
            </h4>
          );
        } else {
          elements.push(
            <h5
              key={`h5-${idx}`}
              data-heading-id={headingId}
              data-heading-title={headingTitle}
              className="text-xs font-semibold text-slate-350 mt-4 mb-2"
            >
              {parseInline(rawTitle)}
            </h5>
          );
        }
        continue;
      }
      
      if (line.startsWith('- ')) {
        elements.push(
          <li key={`li-${idx}`} className="text-slate-300 text-sm ml-4 list-disc mb-1.5">
            {parseInline(line.substring(2))}
          </li>
        );
        continue;
      }
      
      if (line.trim() === '') {
        elements.push(<div key={`empty-${idx}`} className="h-2" />);
        continue;
      }
      
      elements.push(
        <p key={`p-${idx}`} className="text-slate-300 text-sm leading-relaxed mb-3">
          {parseInline(line)}
        </p>
      );
    }
    
    return elements;
  };

  const renderTreeNodes = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => {
      const isFolder = node.type === 'folder';
      const isExpanded = expandedFolders[node.path] ?? false;
      const isActive = activeFilePath === node.path;

      return (
        <div key={node.path} className="select-none">
          <div 
            style={{ paddingLeft: `${depth * 14 + 6}px` }}
            className={`flex items-center justify-between py-2 hover:bg-slate-850/60 rounded-lg cursor-pointer group text-xs font-mono transition-all duration-150 ${
              isActive 
                ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20 font-bold' 
                : 'text-slate-350 hover:text-slate-100'
            }`}
            onClick={() => {
              if (isFolder) {
                toggleFolder(node.path);
              } else {
                handleFileSwitch(node.path);
              }
            }}
          >
            <div className="flex items-center gap-2 truncate">
              {isFolder ? (
                <>
                  <span className="text-[10px] text-slate-500 font-bold shrink-0">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  <span className="text-amber-400 text-sm shrink-0">
                    {isExpanded ? '📂' : '📁'}
                  </span>
                </>
              ) : (
                <span className="text-violet-400 text-sm shrink-0">📄</span>
              )}
              <span className="truncate">{node.name}</span>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-2 shrink-0">
              {isFolder && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleAddFileInFolder(node.path); }} 
                  className="p-0.5 hover:bg-slate-850 hover:text-violet-400 rounded text-slate-400"
                  title="Add File"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
              {node.path !== 'index.js' && node.path !== 'package.json' && (
                <>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleRenameFileOrFolder(node.path, isFolder); }} 
                    className="p-0.5 hover:bg-slate-850 hover:text-indigo-400 rounded text-slate-400"
                    title="Rename"
                  >
                    <Edit className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteFileOrFolder(node.path, isFolder); }} 
                    className="p-0.5 hover:bg-slate-850 hover:text-rose-400 rounded text-slate-400"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          </div>

          {isFolder && isExpanded && node.children && (
            <div className="border-l border-slate-800/80 ml-2 mt-0.5">{renderTreeNodes(node.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  const fileTree = buildFileTree(flatFiles);

  if (loading || !student) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 gap-4">
        <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
        <span className="text-slate-400 font-medium">Bootstrapping Workspace Content...</span>
      </div>
    );
  }

  const showDebugCard = searchParams.get('debug') === 'true';
  const webcontainerStatus = webcontainer ? 'booted' : webcontainerBooting ? 'booting' : 'idle';

  return (
    <div className="flex flex-col h-screen overflow-hidden relative">
      
      {/* Standalone Observation Debug Card */}
      {showDebugCard && (
        <ObservationDebugCard
          classroomId={classroomId || ''}
          mode={mode}
          tabSwitches={tabSwitchCount}
          pasteAttempts={pasteAttemptCount}
          idleState={idleState}
          idleDurationSeconds={idleDuration}
          lastSyncedTimestamp={lastSyncedTimestamp}
          backendConnected={backendConnected}
          socketConnected={socketConnected}
          headingsReached={headingsReached}
          cacheSizeBytes={cacheSizeBytes}
          webcontainerStatus={webcontainerStatus}
          activeSectionTitle={activeSectionTitle}
          notesScrollPercent={notesScrollPercent}
          maxScrollDepth={maxScrollDepth}
          dwellTimesMap={dwellTimesMap}
        />
      )}

      {/* Platform Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-500/10">
            <span className="text-white font-extrabold text-sm">L</span>
          </div>
          <span className="font-bold text-slate-100 hidden sm:inline-block">
            {mode === 'test' ? 'Classroom Exam Space' : 'Live Classroom Workspace'}
          </span>
          
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <div className="text-sm font-semibold text-slate-200">{student.name}</div>
            <div className="text-xs text-slate-400">Roll: {student.rollNumber}</div>
          </div>
          <button
            onClick={downloadWorkspaceZip}
            disabled={downloadingZip}
            className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs transition-all shadow-md disabled:opacity-50"
          >
            {downloadingZip ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Download My Code</span>
          </button>
          <button 
            onClick={() => {
              router.push('/dashboard');
            }}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>
        </div>
      </header>

      {/* Quick Question Notification Alert banner */}
      {quickQuestion && (
        <div className="bg-gradient-to-r from-violet-900 to-indigo-900 text-slate-100 px-6 py-3.5 flex items-center justify-between border-b border-violet-750 shrink-0">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-5 h-5 text-amber-400 animate-bounce" />
            <div className="text-sm">
              <span className="font-bold text-amber-400">Quick Question:</span> {quickQuestion}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono bg-slate-950/60 px-3 py-1 rounded border border-violet-850">
              Auto-submitting in: <b className="text-amber-400">{quickQuestionTimeLeft}s</b>
            </span>
          </div>
        </div>
      )}

      {/* Main Panel Area */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Toggle Button for Left Notes Panel */}
        <button
          onClick={() => setNotesOpen(!notesOpen)}
          className="absolute left-0 top-1/2 transform -translate-y-1/2 z-30 w-5 h-12 bg-slate-800 border-y border-r border-slate-700 hover:bg-violet-600 rounded-r-md flex items-center justify-center shadow-lg transition-colors text-slate-400 hover:text-white"
        >
          {notesOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* 1. Left Notes Panel */}
        <div 
          className={`flex-none bg-slate-900/60 border-r border-slate-800 backdrop-blur-md transition-all duration-300 overflow-hidden relative z-20 ${
            notesOpen ? 'w-80' : 'w-0'
          }`}
        >
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
                {notesList.map((note) => {
                  return (
                    <div
                      key={note.id}
                      onClick={() => {
                        handleTopicChange(note.topicNumber);
                        setActiveNotesView('reader');
                      }}
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
                  );
                })}
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
                  onClick={() => setActiveNotesView('list')}
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
        </div>

        {/* 2. Center WebContainer Editor + Execution Panel */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative h-full">
          {previewFullscreen ? (
            <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col">
              {/* Fullscreen header */}
              <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800 p-3 shrink-0">
                <div className="flex items-center gap-2 text-slate-350 text-xs font-bold uppercase tracking-wider">
                  <Globe className="w-4 h-4 text-violet-400 animate-pulse" />
                  <span>Live App Viewport (Fullscreen Mode)</span>
                </div>
                <button
                  onClick={() => setPreviewFullscreen(false)}
                  className="px-4 py-1.5 bg-slate-855 hover:bg-slate-800 text-slate-200 text-xs rounded-lg border border-slate-700 transition-colors shadow-md"
                >
                  Exit Fullscreen (Esc)
                </button>
              </div>
              
              {/* Fullscreen address bar */}
              <div className="flex items-center gap-2 bg-slate-900 border-b border-slate-800 p-2 shrink-0">
                <div className="flex-grow flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 gap-2">
                  <Globe className="w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={previewUrlInput}
                    onChange={(e) => setPreviewUrlInput(e.target.value)}
                    placeholder="Paste live server URL (e.g. localhost:3000)"
                    className="bg-transparent border-none focus:outline-none text-xs text-slate-200 flex-grow"
                  />
                </div>
                <button
                  onClick={handleConnectPreview}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg text-xs shadow-md transition-colors"
                >
                  Connect
                </button>
                <button
                  onClick={handleReloadPreview}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-700"
                  title="Reload Viewport"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-grow relative bg-slate-950">
                {previewUrl ? (
                  <iframe 
                    src={previewUrl} 
                    className="w-full h-full bg-white"
                    title="WebContainer live preview fullscreen"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
                    <Globe className="w-8 h-8 text-slate-700" />
                    <span>No active application loaded. Connect a URL above.</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* File Tab bar */}
              <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2 text-slate-300 font-mono text-xs">
                  <FileCode className="w-4 h-4 text-violet-500" />
                  <span className="text-slate-200 font-bold">{activeFilePath}</span>
                </div>
                
                <button
                  onClick={handleRunWorkspace}
                  disabled={runStatus === 'installing' || runStatus === 'running' || webcontainerBooting}
                  className="flex items-center gap-2 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-md shadow-md text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  <span>Run Workspace</span>
                </button>
              </div>

              {/* Editor Workspace (File Explorer Sidebar + Code Editor) */}
              {mode === 'live' && !quickQuestion ? (
                <div className="flex-grow flex flex-col overflow-hidden bg-slate-950">
                  {/* Top Area: Editor (left) + Terminal (right) */}
                  <div className="flex-grow flex overflow-hidden relative" style={{ minHeight: '100px' }}>
                    {/* Explorer + Editor */}
                    <div className="flex-grow flex overflow-hidden relative h-full">
                      {/* Explorer Sidebar */}
                      {explorerOpen ? (
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
                      ) : (
                        <button
                          onClick={() => setExplorerOpen(true)}
                          className="flex-none bg-slate-900 border-r border-slate-800 w-10 hover:bg-slate-855/50 flex flex-col items-center pt-4 text-slate-450 hover:text-slate-200 cursor-pointer select-none transition-colors border-t border-slate-850/50"
                          title="Open Explorer Tree"
                        >
                          <FileCode className="w-4 h-4 mb-2 text-violet-400/70" />
                          <span className="text-[9px] uppercase font-bold tracking-widest [writing-mode:vertical-lr]">Files</span>
                        </button>
                      )}

                      {/* Code Editor */}
                      <div className="flex-grow relative bg-slate-950 h-full">
                        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-full pointer-events-none">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Paste Block Enabled</span>
                        </div>
                        <Editor
                          height="100%"
                          theme="vs-dark"
                          defaultLanguage="javascript"
                          language="javascript"
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
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Horizontal resize handle between Top Area & Bottom Browser Preview */}
                  {previewOpen && (
                    <div 
                      onMouseDown={() => setIsResizingPreview(true)}
                      className="h-1 bg-slate-800 hover:bg-violet-550 cursor-row-resize transition-colors w-full shrink-0 z-10"
                    />
                  )}

                  {/* Center-Bottom Full Width Browser Preview Panel */}
                  <div 
                    style={{ height: `${previewOpen ? previewHeight : 0}px` }}
                    className={`flex flex-col bg-slate-950 overflow-hidden shrink-0 transition-[height] duration-200 ease-out`}
                  >
                    {previewOpen && (
                      <div className="flex-grow flex flex-col overflow-hidden h-full">
                        {/* Address Bar */}
                        <div className="flex items-center gap-2 bg-slate-900 border-b border-slate-800 p-2 shrink-0">
                          <div className="flex-grow flex items-center bg-slate-955 border border-slate-800 rounded-lg px-2 py-1 gap-2">
                            <Globe className="w-3.5 h-3.5 text-slate-550" />
                            <input
                              type="text"
                              value={previewUrlInput}
                              onChange={(e) => setPreviewUrlInput(e.target.value)}
                              placeholder="Paste live server URL (e.g. localhost:3000)"
                              className="bg-transparent border-none focus:outline-none text-xs text-slate-200 flex-grow placeholder-slate-600"
                            />
                          </div>
                          <button
                            onClick={handleConnectPreview}
                            className="px-3 py-1 bg-violet-650 hover:bg-violet-600 text-white font-medium rounded-lg text-xs shadow-md transition-colors"
                          >
                            Connect
                          </button>
                          <button
                            onClick={handleReloadPreview}
                            className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-700"
                            title="Reload Viewport"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setPreviewFullscreen(true)}
                            className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg transition-colors border border-slate-700"
                            title="Maximize Viewport"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Viewport View */}
                        <div className="flex-grow relative bg-slate-950">
                          {previewUrl ? (
                            <iframe 
                              src={previewUrl} 
                              className="w-full h-full bg-white"
                              title="WebContainer live preview"
                            />
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-500 text-sm p-4 text-center">
                              <Globe className="w-7 h-7 text-slate-700 animate-pulse" />
                              <span className="font-semibold text-slate-400">Live Browser Preview</span>
                              <span className="text-[10px] text-slate-600 max-w-sm leading-relaxed">
                                Enter local URL (e.g. localhost:3000) or check terminal printout and click <b>Connect</b>.
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-grow grid grid-rows-2 overflow-hidden">
                  
                  {/* Top Editor Area divided into Explorer Sidebar + Textarea */}
                  <div className="flex border-b border-slate-800 overflow-hidden">
                    
                    {/* Collapsible/Folder Tree Explorer Sidebar */}
                    {explorerOpen ? (
                      <div className="w-52 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto">
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
                    ) : (
                      <button
                        onClick={() => setExplorerOpen(true)}
                        className="flex-none bg-slate-900 border-r border-slate-800 w-10 hover:bg-slate-855/50 flex flex-col items-center pt-4 text-slate-455 hover:text-slate-200 cursor-pointer select-none transition-colors border-t border-slate-850/50"
                        title="Open Explorer Tree"
                      >
                        <FileCode className="w-4 h-4 mb-2 text-violet-400/70" />
                        <span className="text-[9px] uppercase font-bold tracking-widest [writing-mode:vertical-lr]">Files</span>
                      </button>
                    )}

                    {/* Editor Textarea */}
                    <div className="flex-grow relative bg-slate-950 h-full">
                      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-full pointer-events-none">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Paste Block Enabled</span>
                      </div>
                      <Editor
                        height="100%"
                        theme="vs-dark"
                        defaultLanguage="javascript"
                        language="javascript"
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
                        }}
                      />
                    </div>

                  </div>

                  {/* Split Terminals + Manual Preview Panel */}
                  <div className="grid grid-cols-1 md:grid-cols-2 overflow-hidden bg-slate-900 relative">
                    
                    {/* Left Side: Terminals Panel */}
                    <div className={`flex flex-col border-r border-slate-800 overflow-hidden h-full ${previewOpen ? '' : 'col-span-2'}`}>
                      {/* Terminals Header containing Tab lists */}
                      <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800 shrink-0 px-2 py-1">
                        <div className="flex items-center gap-1 overflow-x-auto max-w-[70%]">
                          {terminalTabs.map(tab => (
                            <div
                              key={tab.id}
                              onClick={() => {
                                setActiveTabId(tab.id);
                                setTimeout(() => {
                                  try {
                                    fitAddonsRef.current[tab.id]?.fit();
                                  } catch (e) {}
                                }, 50);
                              }}
                              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                                activeTabId === tab.id 
                                  ? 'bg-slate-800 text-slate-200 border border-slate-700' 
                                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-855/50'
                              }`}
                            >
                              <span className="truncate max-w-[80px]">{tab.label}</span>
                              {terminalTabs.length > 1 && (
                                <span 
                                  onClick={(e) => handleCloseTerminalTab(tab.id, e)}
                                  className="text-[10px] text-slate-500 hover:text-rose-450 hover:bg-slate-700 p-0.5 rounded"
                                  title="Close Tab"
                                >
                                  ✕
                                </span>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => handleAddTerminalTab()}
                            className="p-1 hover:bg-slate-800 text-slate-450 hover:text-violet-455 rounded transition-colors"
                            title="New Terminal"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        
                        {/* Preview Toggle Button */}
                        <button
                          onClick={() => setPreviewOpen(!previewOpen)}
                          className="flex items-center gap-1 px-2.5 py-1 hover:bg-slate-800 border border-slate-855 hover:border-slate-800 rounded text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          <span>{previewOpen ? 'Hide Browser Preview' : 'Show Browser Preview'}</span>
                        </button>
                      </div>

                      {/* Terminals Container */}
                      <div className="flex-grow relative bg-slate-950 overflow-hidden">
                        {terminalTabs.map(tab => (
                          <div 
                            key={tab.id}
                            ref={(el) => {
                              if (el) initializeTerminalTab(tab.id, el);
                            }}
                            className={`absolute inset-0 p-2 ${activeTabId === tab.id ? 'block' : 'hidden'}`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Right Side: Manual Preview Frame */}
                    <div className={`flex flex-col overflow-hidden bg-slate-950 h-full ${previewOpen ? 'block' : 'hidden'}`}>
                      
                      {/* Address Bar */}
                      <div className="flex items-center gap-2 bg-slate-900 border-b border-slate-800 p-2 shrink-0">
                        <div className="flex-grow flex items-center bg-slate-955 border border-slate-800 rounded-lg px-2 py-1.5 gap-2">
                          <Globe className="w-3.5 h-3.5 text-slate-500" />
                          <input
                            type="text"
                            value={previewUrlInput}
                            onChange={(e) => setPreviewUrlInput(e.target.value)}
                            placeholder="Paste live server URL (e.g. localhost:3000)"
                            className="bg-transparent border-none focus:outline-none text-xs text-slate-200 flex-grow placeholder-slate-600"
                          />
                        </div>
                        <button
                          onClick={handleConnectPreview}
                          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg text-xs shadow-md transition-colors"
                        >
                          Connect
                        </button>
                        <button
                          onClick={handleReloadPreview}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-700"
                          title="Reload Viewport"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setPreviewFullscreen(true)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg transition-colors border border-slate-700"
                          title="Maximize Viewport"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Viewport View */}
                      <div className="flex-grow relative bg-slate-955">
                        {previewUrl ? (
                          <iframe 
                            src={previewUrl} 
                            className="w-full h-full bg-white"
                            title="WebContainer live preview"
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm p-6 text-center">
                            <Globe className="w-8 h-8 text-slate-700 animate-pulse" />
                            <span className="font-semibold text-slate-400">Manual Preview Viewport</span>
                            <span className="text-[11px] text-slate-600 max-w-xs leading-relaxed">
                              Copy the local URL printed in the terminal (e.g. localhost:3000), paste it in the address bar above, and click <b>Connect</b> to view your running server.
                            </span>
                          </div>
                        )}
                      </div>

                    </div>

                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 3. Right Question + Reasoning Panel */}
        {taskOpen ? (
          <div className="w-80 flex-none bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
            {quickQuestion ? (
              <>
                {/* Quick Question Header */}
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

                {/* Question Details and Answer Input */}
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

                {/* Submit Action Block */}
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
            ) : mode === 'live' ? (
              <>
                {/* Top Half: Terminal Panel */}
                <div className="h-1/2 flex flex-col border-b border-slate-800 overflow-hidden">
                  {/* Terminals Header */}
                  <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800 shrink-0 px-2 py-1">
                    <div className="flex items-center gap-1 overflow-x-auto max-w-[70%]">
                      {terminalTabs.map(tab => (
                        <div
                          key={tab.id}
                          onClick={() => {
                            setActiveTabId(tab.id);
                            setTimeout(() => {
                              try {
                                fitAddonsRef.current[tab.id]?.fit();
                              } catch (e) {}
                            }, 50);
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
                            >
                              ✕
                            </span>
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

                  {/* Terminals Container */}
                  <div className="flex-grow relative bg-slate-955 overflow-hidden">
                    {terminalTabs.map(tab => (
                      <div 
                        key={tab.id}
                        ref={(el) => {
                          if (el) initializeTerminalTab(tab.id, el);
                        }}
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

                  {/* Live doubt support details */}
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

                  {/* Submit Action Block */}
                  <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
                    <button
                      onClick={handleSubmitSolution}
                      className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98]"
                    >
                      <Send className="w-4 h-4" />
                      <span>Submit Solution Code</span>
                    </button>
                  </div>
                </div>
              </>
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
                    /* Test / Assignment mode questions and task timers content */
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

                          {activeQuestion!.codeTaskPrompt && (
                            <div>
                              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Coding Challenge</h3>
                              <p className="text-sm text-slate-200 leading-relaxed bg-slate-950 p-4 border border-slate-800 rounded-lg">
                                {activeQuestion!.codeTaskPrompt}
                              </p>
                            </div>
                          )}

                          <div>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reasoning Prompt</h3>
                            <p className="text-sm text-slate-200 leading-relaxed bg-slate-950 p-4 border border-slate-800 rounded-lg mb-4">
                              {activeQuestion!.reasoningPrompt}
                            </p>

                            {/* Reasoning choices input */}
                            {activeQuestion!.reasoningType === 'mcq' ? (
                              <div className="space-y-2.5">
                                {activeQuestion!.options?.map((opt: string, i: number) => (
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
                            ) : activeQuestion!.reasoningType === 'multi_select' ? (
                              <div className="space-y-2.5">
                                {activeQuestion!.options?.map((opt: string, i: number) => {
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
                    /* Live mode: Doubt Raise support controls */
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

                {/* Submit Action Block */}
                {activeQuestion && (
                  <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
                    <button
                      onClick={handleSubmitSolution}
                      className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98]"
                    >
                      <Send className="w-4 h-4" />
                      <span>{mode === 'test' ? 'Submit Question Answer' : mode === 'assignment' ? 'Submit Assignment Question' : 'Submit Solution Code'}</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <button
            onClick={() => setTaskOpen(true)}
            className="flex-none bg-slate-900 border-l border-slate-800 w-10 hover:bg-slate-855/50 flex flex-col items-center pt-4 text-slate-455 hover:text-slate-200 cursor-pointer select-none transition-colors"
            title="Open Task Sidebar"
          >
            <HelpCircle className="w-4 h-4 mb-2 text-violet-400/70" />
            <span className="text-[9px] uppercase font-bold tracking-widest [writing-mode:vertical-lr]">Task Prompt</span>
          </button>
        )}

      </div>
    </div>
  );
}
