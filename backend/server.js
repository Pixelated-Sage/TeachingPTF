// backend/server.js
// Standalone Express and Socket.io server (v2 Spec).
// Handles authentication, OTP requests, event-driven telemetry, and Supabase integration.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Override console methods to include timestamps globally
['log', 'warn', 'error'].forEach(method => {
  const original = console[method];
  console[method] = function (...args) {
    const timestamp = new Date().toISOString();
    original.apply(console, [`[${timestamp}]`, ...args]);
  };
});

const { query } = require('./db');
const nodemailer = require('nodemailer');

const emailUser = process.env.EMAIL_USER || 'abhishekaj590@gmail.com';
const emailPass = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailUser,
    pass: emailPass
  }
});

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));app.use(express.json());

// HTTP Request Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const clientIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown IP';
    console.log(`[HTTP] ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | IP: ${clientIp} | ${duration}ms`);
  });
  next();
});

// Custom In-Memory Rate Limiter Middleware
const rateLimitStore = {};
const createRateLimiter = (options) => {
  return (req, res, next) => {
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    if (!rateLimitStore[ip]) {
      rateLimitStore[ip] = [];
    }
    
    // Clean old requests outside windowMs
    rateLimitStore[ip] = rateLimitStore[ip].filter(timestamp => now - timestamp < options.windowMs);
    
    if (rateLimitStore[ip].length >= options.max) {
      console.warn(`[SECURITY] Rate limit exceeded for IP: ${ip} on route: ${req.originalUrl}`);
      return res.status(429).json({ error: options.message || 'Too many requests. Please try again later.' });
    }
    
    rateLimitStore[ip].push(now);
    next();
  };
};

const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  max: 5, // max 5 attempts per minute
  message: 'Too many authentication attempts. Please try again after 60 seconds.'
});


// In-memory session validation caches (plain Map)
// Session tokens are cached mapping token -> { user/admin object, expiresAt }
// Prevents high-frequency DB queries on every REST request.
const sessionCache = new Map();
const adminSessionCache = new Map();

// Helper: Validate session token and check expiry (24-hour window)
const validateSession = async (sessionToken) => {
  if (!sessionToken) return { authenticated: false, error: 'Authorization header token required.' };
  
  // 1. Check in-memory cache first
  const cached = sessionCache.get(sessionToken);
  if (cached) {
    if (new Date() > new Date(cached.expiresAt)) {
      sessionCache.delete(sessionToken);
      return { authenticated: false, error: 'Session token has expired. Please log in again.' };
    }
    return { authenticated: true, user: cached.user };
  }

  try {
    const userQuery = await query('SELECT * FROM Users WHERE session_token = $1', [sessionToken]);
    if (userQuery.rows.length === 0) return { authenticated: false, error: 'Invalid or expired session token.' };
    const user = userQuery.rows[0];
    if (user.token_expires_at && new Date() > new Date(user.token_expires_at)) {
      return { authenticated: false, error: 'Session token has expired. Please log in again.' };
    }
    
    // Populate session cache
    if (user.token_expires_at) {
      sessionCache.set(sessionToken, { user, expiresAt: user.token_expires_at });
    }
    
    return { authenticated: true, user };
  } catch (err) {
    return { authenticated: false, error: 'Internal session authentication check error.' };
  }
};

// Helper: Validate instructor session token and check expiry (24-hour window)
const validateAdminSession = async (sessionToken) => {
  if (!sessionToken) return { authenticated: false, error: 'Admin authorization header token required.' };

  // 1. Check in-memory cache first
  const cached = adminSessionCache.get(sessionToken);
  if (cached) {
    if (new Date() > new Date(cached.expiresAt)) {
      adminSessionCache.delete(sessionToken);
      return { authenticated: false, error: 'Admin session token has expired. Please log in again.' };
    }
    return { authenticated: true, admin: cached.admin };
  }

  try {
    const adminQuery = await query('SELECT * FROM Instructors WHERE session_token = $1', [sessionToken]);
    if (adminQuery.rows.length === 0) return { authenticated: false, error: 'Invalid or expired admin session token.' };
    const admin = adminQuery.rows[0];
    if (admin.token_expires_at && new Date() > new Date(admin.token_expires_at)) {
      return { authenticated: false, error: 'Admin session token has expired. Please log in again.' };
    }

    // Populate admin cache
    if (admin.token_expires_at) {
      adminSessionCache.set(sessionToken, { admin, expiresAt: admin.token_expires_at });
    }

    return { authenticated: true, admin };
  } catch (err) {
    return { authenticated: false, error: 'Internal admin session check error.' };
  }
};

// Helper: Hashing password using bcrypt (async to avoid blocking event loop)
const hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

// Socket.io initialization with CORS
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.some(o => origin.startsWith(o))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Global socket mappings: socket.id -> { studentId, classroomId }
const activeSocketMappings = {};

// Global In-memory mishap aggregate tracking (real-time observation updates)
// Structure: { classroomId: { studentId: { tab_switch, inactivity, paste_attempt, lastEventAt } } }
const mishapAggregates = new Map();

// Global Write buffer for mishap inserts to DB
let mishapWriteBuffer = [];

// Flush mishap logs from memory buffer to PostgreSQL every 4 seconds
setInterval(async () => {
  if (mishapWriteBuffer.length === 0) return;
  
  const currentBuffer = mishapWriteBuffer;
  mishapWriteBuffer = [];
  
  console.log(`[BATCH-WRITE] Flushing ${currentBuffer.length} mishap logs to PostgreSQL...`);
  
  try {
    const values = [];
    const placeholders = [];
    let idx = 1;
    currentBuffer.forEach(m => {
      placeholders.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4})`);
      values.push(m.studentId, m.classroomId, m.type, new Date(m.timestamp), JSON.stringify(m.meta));
      idx += 5;
    });

    await query(
      `INSERT INTO MishapLogs (student_id, classroom_id, type, timestamp, meta) 
       VALUES ${placeholders.join(', ')}`,
      values
    );
  } catch (err) {
    console.error('[BATCH-WRITE] Error writing buffered mishap logs:', err.message);
  }
}, 4000);

// Helper function to dynamically update mishap aggregates in-memory
const updateMishapAggregate = (classroomId, studentId, type, timestamp) => {
  if (!classroomId || !studentId) return;
  if (!mishapAggregates.has(classroomId)) {
    mishapAggregates.set(classroomId, new Map());
  }
  const classroomMap = mishapAggregates.get(classroomId);
  if (!classroomMap.has(studentId)) {
    classroomMap.set(studentId, { tab_switch: 0, inactivity: 0, paste_attempt: 0, lastEventAt: timestamp });
  }
  const aggregate = classroomMap.get(studentId);
  if (type === 'tab_switch') aggregate.tab_switch++;
  if (type === 'inactivity') aggregate.inactivity++;
  if (type === 'paste_attempt') aggregate.paste_attempt++;
  aggregate.lastEventAt = timestamp;
};

  // Event-driven real-time socket listeners
io.on('connection', (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);

  // Join room
  socket.on('room:join', (data) => {
    const { classroomId, studentId } = data;
    socket.join(classroomId);
    if (studentId) {
      activeSocketMappings[socket.id] = { studentId, classroomId };
      io.to(classroomId).emit('classroom:roster_update', { studentId, connected: true });
    }
    console.log(`Socket ${socket.id} joined room ${classroomId}`);
  });

  // Doubt raise
  socket.on('classroom:doubt', (data) => {
    const { studentId, studentName, classroomId } = data;
    io.to(classroomId).emit('instructor:doubt_raised', { studentId, studentName, timestamp: Date.now() });
  });

  // Mishap event: Tab switch Visibility API hook
  socket.on('mishap:tab_switch', (data) => {
    try {
      const { studentId, classroomId, timestamp, isTest } = data;
      console.log(`Mishap [tab_switch] buffered for Student: ${studentId} (Test: ${!!isTest})`);
      
      // 1. Update in-memory real-time aggregate for instant admin checks
      updateMishapAggregate(classroomId, studentId, 'tab_switch', timestamp);

      // 2. Queue in the write buffer for delayed DB logging
      mishapWriteBuffer.push({
        studentId,
        classroomId,
        type: 'tab_switch',
        timestamp,
        meta: { isTest }
      });
    } catch (err) {
      console.error('Error buffering tab switch mishap:', err.message);
    }
  });

  // Mishap event: Inactivity timeout hook
  socket.on('mishap:inactivity', (data) => {
    try {
      const { studentId, classroomId, timestamp, isTest } = data;
      console.log(`Mishap [inactivity] buffered for Student: ${studentId} (Test: ${!!isTest})`);
      
      // 1. Update in-memory real-time aggregate for instant admin checks
      updateMishapAggregate(classroomId, studentId, 'inactivity', timestamp);

      // 2. Queue in the write buffer for delayed DB logging
      mishapWriteBuffer.push({
        studentId,
        classroomId,
        type: 'inactivity',
        timestamp,
        meta: { isTest }
      });
    } catch (err) {
      console.error('Error buffering inactivity mishap:', err.message);
    }
  });

  // Mishap event: Copy-paste attempt blocked hook
  socket.on('mishap:paste_attempt', (data) => {
    try {
      const { studentId, classroomId, timestamp, isTest } = data;
      console.log(`Mishap [paste_attempt] buffered for Student: ${studentId} (Test: ${!!isTest})`);
      
      // 1. Update in-memory real-time aggregate for instant admin checks
      updateMishapAggregate(classroomId, studentId, 'paste_attempt', timestamp);

      // 2. Queue in the write buffer for delayed DB logging
      mishapWriteBuffer.push({
        studentId,
        classroomId,
        type: 'paste_attempt',
        timestamp,
        meta: { isTest }
      });
    } catch (err) {
      console.error('Error buffering paste mishap:', err.message);
    }
  });

  // Telemetry batch event handler to avoid database connection spikes
  socket.on('mishap:batch', (data) => {
    try {
      const { studentId, classroomId, mishaps } = data;
      if (!mishaps || mishaps.length === 0) return;

      console.log(`Mishap [batch] buffered: ${mishaps.length} logs for Student: ${studentId}`);

      mishaps.forEach(m => {
        // 1. Update in-memory real-time aggregate
        updateMishapAggregate(classroomId, studentId, m.type, m.timestamp);

        // 2. Queue in the write buffer
        mishapWriteBuffer.push({
          studentId,
          classroomId,
          type: m.type,
          timestamp: m.timestamp,
          meta: { isTest: m.isTest }
        });
      });
    } catch (err) {
      console.error('Error buffering batch mishaps:', err.message);
    }
  });

  // Assignment Tracking Socket Events
  socket.on('assignment:start', (data) => {
    const { assignmentId, studentId, studentName, studentRollNumber, classroomId } = data;
    io.to(classroomId).emit('instructor:assignment_started', {
      assignmentId,
      studentId,
      studentName,
      studentRollNumber,
      timestamp: Date.now()
    });
  });

  socket.on('assignment:progress', (data) => {
    const { assignmentId, studentId, studentName, studentRollNumber, questionIndex, isCompleted, classroomId } = data;
    io.to(classroomId).emit('instructor:assignment_progress', {
      assignmentId,
      studentId,
      studentName,
      studentRollNumber,
      questionIndex,
      isCompleted,
      timestamp: Date.now()
    });
  });

  // Append-only telemetry event: Scroll observation heading index reached
  socket.on('telemetry:heading_reached', (data) => {
    const { studentId, headingIndex } = data;
    console.log(`Telemetry [heading_reached] for Student: ${studentId} -> Heading Index: ${headingIndex}`);
  });

  socket.on('disconnect', () => {
    const mapping = activeSocketMappings[socket.id];
    if (mapping) {
      delete activeSocketMappings[socket.id];
      io.to(mapping.classroomId).emit('classroom:roster_update', { studentId: mapping.studentId, connected: false });
    }
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
  });
});

// REST API Endpoints

// Health Check Endpoints
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend is active and running on port 5000!' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend is active and running on port 5000!' });
});

// 1. Student Registration & OTP generation
app.post('/api/register', authRateLimiter, async (req, res) => {
  try {
    const { name, rollNumber, email, phone, password, branch } = req.body;
    if (!name || !rollNumber || !email || !password) {
      return res.status(400).json({ error: 'Name, Roll Number, Email, and Password are required.' });
    }

    // Server-side Form Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    if (!rollNumber.trim()) {
      return res.status(400).json({ error: 'Roll number cannot be empty.' });
    }

    // Check if user already exists
    const existing = await query('SELECT id FROM Users WHERE email = $1 OR roll_number = $2', [email, rollNumber]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email or roll number already registered.' });
    }

    const passwordHash = await hashPassword(password);
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Save temporary User record (unverified)
    const userRes = await query(
      `INSERT INTO Users (name, roll_number, email, phone, password_hash, email_verified, branch) 
       VALUES ($1, $2, $3, $4, $5, false, $6) RETURNING id`,
      [name, rollNumber, email, phone, passwordHash, branch || null]
    );

    // Save OTP Request
    await query(
      `INSERT INTO OTPRequests (email, otp_code, expires_at, attempt_count) 
       VALUES ($1, $2, $3, 0)`,
      [email, otpCode, expiresAt]
    );

    // Log the generated OTP for local testing/verification purposes
    console.log(`=========================================`);
    console.log(`[OTP DISPATCH MOCK] To: ${email} | Code: ${otpCode}`);
    console.log(`=========================================`);

    // Send email via Nodemailer if credentials are set
    let emailSent = false;
    if (emailPass) {
      try {
        console.log(`Attempting to send OTP email to ${email} using ${emailUser}...`);
        await transporter.sendMail({
          from: emailUser,
          to: email,
          subject: 'Live Classroom OTP Verification Code',
          text: `Hello ${name},\n\nYour 6-digit verification code is: ${otpCode}.\n\nIt will expire in 10 minutes.\n\nBest regards,\nLive Classroom Team`
        });
        emailSent = true;
        console.log(`OTP email sent successfully to ${email}`);
      } catch (mailErr) {
        console.error('Nodemailer failed to send email:', mailErr.message);
      }
    } else {
      console.warn('EMAIL_PASS environment variable is not configured. Falling back to console-only OTP logging.');
    }

    res.status(201).json({
      message: emailSent 
        ? 'Registration successful. OTP sent to your email.' 
        : 'Registration successful. OTP generated (check console).',
      email,
      testOtpCode: emailSent ? null : otpCode // Exposing OTP in response only if email dispatch was skipped/failed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Verify OTP & Mark email verified
app.post('/api/verify-otp', authRateLimiter, async (req, res) => {
  try {
    const { email, otpCode } = req.body;
    if (!email || !otpCode) {
      return res.status(400).json({ error: 'Email and OTP Code are required.' });
    }

    // Retrieve active request
    const request = await query(
      `SELECT * FROM OTPRequests WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
      [email]
    );

    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'No OTP requests found for this email address.' });
    }

    const otpReq = request.rows[0];

    // Check expiry
    if (new Date() > new Date(otpReq.expires_at)) {
      return res.status(400).json({ error: 'OTP code has expired.' });
    }

    // Check attempts cap (max 5 tries)
    if (otpReq.attempt_count >= 5) {
      return res.status(400).json({ error: 'Too many failed verification attempts. Please register again.' });
    }

    if (otpReq.otp_code !== otpCode) {
      // Increment attempt counter
      await query(
        `UPDATE OTPRequests SET attempt_count = attempt_count + 1 WHERE id = $1`,
        [otpReq.id]
      );
      return res.status(400).json({ error: 'Incorrect OTP code.' });
    }

    // Success: Mark verified
    await query(`UPDATE Users SET email_verified = true WHERE email = $1`, [email]);
    res.json({ message: 'Email verified successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. User Login
app.post('/api/login', authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const userQuery = await query('SELECT * FROM Users WHERE email = $1', [email]);
    if (userQuery.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const user = userQuery.rows[0];

    if (!user.email_verified) {
      return res.status(403).json({ error: 'Please verify your email address before logging in.' });
    }

    // SHA-256 to bcrypt auto-migration block (async to not block event loop)
    const shaHash = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password_hash === shaHash) {
      const upgradedHash = await bcrypt.hash(password, 10);
      await query('UPDATE Users SET password_hash = $1 WHERE id = $2', [upgradedHash, user.id]);
      user.password_hash = upgradedHash;
    }

    // Compare bcrypt hash (async)
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Generate session token (expires in 24 hours)
    const sessionToken = 'token_' + crypto.randomBytes(16).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await query('UPDATE Users SET session_token = $1, token_expires_at = $2 WHERE id = $3', [sessionToken, tokenExpiresAt, user.id]);

    // Cache session in memory
    user.session_token = sessionToken;
    user.token_expires_at = tokenExpiresAt;
    sessionCache.set(sessionToken, { user, expiresAt: tokenExpiresAt });

    res.json({
      id: user.id,
      name: user.name,
      rollNumber: user.roll_number,
      email: user.email,
      sessionToken
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Bootstrap: returns user profile + classroom states
app.get('/api/bootstrap', async (req, res) => {
  try {
    const sessionToken = req.headers['authorization'];
    const auth = await validateSession(sessionToken);
    if (!auth.authenticated) {
      return res.status(401).json({ error: auth.error });
    }

    const user = auth.user;

    // Find classrooms joined by user along with active test if any
    const joinedQuery = await query(
      `SELECT c.id, c.classroom_id, c.title, c.status, c.live_session_active,
              (SELECT json_build_object('id', t.id, 'title', t.title, 'duration_minutes', t.duration_minutes) 
               FROM Tests t 
               WHERE t.classroom_id = c.id AND t.status = 'active' 
               LIMIT 1) as active_test
       FROM Classrooms c
       INNER JOIN UserClassrooms uc ON uc.classroom_id = c.id
       WHERE uc.user_id = $1`,
      [user.id]
    );

    res.json({
      user: {
        id: user.id,
        name: user.name,
        rollNumber: user.roll_number,
        email: user.email
      },
      classrooms: joinedQuery.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Join a Classroom
app.post('/api/classroom/join', async (req, res) => {
  try {
    const sessionToken = req.headers['authorization'];
    const { classroomId } = req.body; // e.g. "REACT60"

    if (!sessionToken || !classroomId) {
      return res.status(400).json({ error: 'Authorization header and Classroom ID code are required.' });
    }

    const auth = await validateSession(sessionToken);
    if (!auth.authenticated) {
      return res.status(401).json({ error: auth.error });
    }

    const userId = auth.user.id;

    // Validate classroom exists and is active/pending
    const classQuery = await query('SELECT * FROM Classrooms WHERE classroom_id = $1', [classroomId]);
    if (classQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Classroom not found.' });
    }

    const classroom = classQuery.rows[0];
    if (classroom.status === 'locked') {
      return res.status(403).json({ error: 'Classroom is currently locked.' });
    }

    // Check if user has already joined
    const checkRelation = await query(
      'SELECT 1 FROM UserClassrooms WHERE user_id = $1 AND classroom_id = $2',
      [userId, classroom.id]
    );

    if (checkRelation.rows.length === 0) {
      // Add relationship
      await query(
        'INSERT INTO UserClassrooms (user_id, classroom_id) VALUES ($1, $2)',
        [userId, classroom.id]
      );
    }

    res.json({
      message: 'Successfully joined classroom.',
      classroom: {
        id: classroom.id,
        classroom_id: classroom.classroom_id,
        title: classroom.title,
        status: classroom.status
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// In-memory caches for classroom content, live status, and assignments definitions
const notesCache = new Map();
const statusCache = new Map();
const assignmentsCache = new Map();

// 6. Get Classroom Content (Notes + Questions together in ONE call)
app.get('/api/classroom/:id/content', async (req, res) => {
  try {
    const sessionToken = req.headers['authorization'];
    const classroomId = req.params.id; // UUID of Classroom

    const auth = await validateSession(sessionToken);
    if (!auth.authenticated) {
      return res.status(401).json({ error: auth.error });
    }

    // Check memory cache first
    const cached = notesCache.get(classroomId);
    if (cached) {
      return res.json(cached);
    }

    const notesQuery = await query(
      'SELECT id, topic_number as "topicNumber", title, markdown_content as "markdownContent", headings_manifest as "headingsManifest" FROM Notes WHERE classroom_id = $1 ORDER BY topic_number ASC',
      [classroomId]
    );

    const questionsQuery = await query(
      'SELECT id, topic_number as "topicNumber", code_task_prompt as "codeTaskPrompt", reasoning_prompt as "reasoningPrompt", reasoning_type as "reasoningType", options FROM Questions WHERE classroom_id = $1',
      [classroomId]
    );

    const payload = {
      notes: notesQuery.rows,
      questions: questionsQuery.rows
    };

    notesCache.set(classroomId, payload);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Workspace Autosave persistence routes
app.get('/api/workspace/:classroomId', async (req, res) => {
  try {
    const sessionToken = req.headers['authorization'];
    const { classroomId } = req.params;

    const auth = await validateSession(sessionToken);
    if (!auth.authenticated) {
      return res.status(401).json({ error: auth.error });
    }

    const studentId = auth.user.id;
    const workspaceQuery = await query(
      'SELECT files FROM StudentWorkspaces WHERE student_id = $1 AND classroom_id = $2',
      [studentId, classroomId]
    );

    if (workspaceQuery.rows.length === 0) {
      return res.json({ files: null });
    }
    
    const files = workspaceQuery.rows[0].files;
    
    // Seed initial cache hash state on load to ensure subsequent identical writes skip DB queries
    const cacheKey = `${studentId}_${classroomId}`;
    const initialHash = crypto.createHash('md5').update(JSON.stringify(files)).digest('hex');
    lastWorkspaceState.set(cacheKey, initialHash);

    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Global in-memory cache mapping studentId_classroomId to a hash of the files object
// Skip PostgreSQL updates entirely if the files object has not changed.
const lastWorkspaceState = new Map();

app.post('/api/workspace/:classroomId', async (req, res) => {
  try {
    const sessionToken = req.headers['authorization'];
    const { classroomId } = req.params;
    const { files } = req.body;

    const auth = await validateSession(sessionToken);
    if (!auth.authenticated) {
      return res.status(401).json({ error: auth.error });
    }

    if (!files || typeof files !== 'object') {
      return res.status(400).json({ error: 'Workspace files object required.' });
    }

    const studentId = auth.user.id;
    const stringifiedFiles = JSON.stringify(files);
    
    // Hash-based diffing to decide if workspace files actually changed
    const currentHash = crypto.createHash('md5').update(stringifiedFiles).digest('hex');
    const cacheKey = `${studentId}_${classroomId}`;
    
    if (lastWorkspaceState.get(cacheKey) === currentHash) {
      // Skip the DB update since content is identical
      console.log(`[AUTOSAVE] Write skipped for ${cacheKey} (content unchanged).`);
      return res.json({ success: true, message: 'Workspace autosaved successfully (skipped write - identical).' });
    }

    await query(
      `INSERT INTO StudentWorkspaces (student_id, classroom_id, files, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (student_id, classroom_id)
       DO UPDATE SET files = EXCLUDED.files, updated_at = CURRENT_TIMESTAMP`,
      [studentId, classroomId, stringifiedFiles]
    );

    // Save the new hash to memory state
    lastWorkspaceState.set(cacheKey, currentHash);

    res.json({ success: true, message: 'Workspace autosaved successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Submit Solution (combined payload code + reasoning + telemetry)
// Uses PostgreSQL ON CONFLICT DO UPDATE (upsert) for idempotency.
// The unique constraint on (student_id, question_id) is enforced at the DB level:
// - First submission: INSERT → creates a new row
// - Re-submission (typo fix / intentional resubmit): UPDATE → overwrites previous answer
// - Concurrent duplicate clicks: DB serializes them; only one write wins, others get 200 with same ID
// No application-layer time window needed — the database guarantees correctness.
app.post('/api/submit', async (req, res) => {
  try {
    const sessionToken = req.headers['authorization'];
    const {
      classroomId,
      questionId,
      testId,
      code,
      codeOutput,
      reasoningAnswer,
      timeTakenSeconds,
      tabSwitchCount,
      headingsReached,
      dwellSeconds,
      maxScrollDepth,
      notesTelemetry
    } = req.body;

    const auth = await validateSession(sessionToken);
    if (!auth.authenticated) {
      return res.status(401).json({ error: auth.error });
    }

    const studentId = auth.user.id;

    if (!classroomId || !questionId) {
      return res.status(400).json({ error: 'Classroom ID and Question ID are required.' });
    }

    // Branch logic: TestSubmission vs standard Submission
    if (testId) {
      // ON CONFLICT DO UPDATE: if the student already submitted this question in this test,
      // overwrite with the latest answer. The unique constraint is on (student_id, question_id, test_id).
      const upsertQuery = await query(
        `INSERT INTO TestSubmissions 
         (test_id, student_id, question_id, code, code_output, reasoning_answer, time_taken_seconds, tab_switch_count, headings_reached, dwell_seconds, max_scroll_depth_percent, notes_telemetry) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (student_id, question_id, test_id)
         DO UPDATE SET
           code                    = EXCLUDED.code,
           code_output             = EXCLUDED.code_output,
           reasoning_answer        = EXCLUDED.reasoning_answer,
           time_taken_seconds      = EXCLUDED.time_taken_seconds,
           tab_switch_count        = EXCLUDED.tab_switch_count,
           headings_reached        = EXCLUDED.headings_reached,
           dwell_seconds           = EXCLUDED.dwell_seconds,
           max_scroll_depth_percent = EXCLUDED.max_scroll_depth_percent,
           notes_telemetry         = EXCLUDED.notes_telemetry,
           submitted_at            = NOW()
         RETURNING id`,
        [
          testId,
          studentId,
          questionId,
          code,
          codeOutput,
          reasoningAnswer,
          timeTakenSeconds,
          tabSwitchCount,
          JSON.stringify(headingsReached),
          JSON.stringify(dwellSeconds),
          maxScrollDepth,
          notesTelemetry ? JSON.stringify(notesTelemetry) : null
        ]
      );
      return res.status(200).json({
        message: 'Test submission saved successfully.',
        submissionId: upsertQuery.rows[0].id
      });
    }

    const wasEmpty = !code.trim() || !reasoningAnswer.trim();

    // ON CONFLICT DO UPDATE: if the student already submitted this question in this classroom,
    // overwrite with the latest answer. The unique constraint is on (student_id, question_id).
    const upsertQuery = await query(
      `INSERT INTO Submissions 
       (student_id, classroom_id, question_id, code, code_output, reasoning_answer, time_taken_seconds, tab_switch_count, headings_reached, was_empty, dwell_seconds, max_scroll_depth_percent, notes_telemetry) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (student_id, question_id)
       DO UPDATE SET
         code                    = EXCLUDED.code,
         code_output             = EXCLUDED.code_output,
         reasoning_answer        = EXCLUDED.reasoning_answer,
         time_taken_seconds      = EXCLUDED.time_taken_seconds,
         tab_switch_count        = EXCLUDED.tab_switch_count,
         headings_reached        = EXCLUDED.headings_reached,
         was_empty               = EXCLUDED.was_empty,
         dwell_seconds           = EXCLUDED.dwell_seconds,
         max_scroll_depth_percent = EXCLUDED.max_scroll_depth_percent,
         notes_telemetry         = EXCLUDED.notes_telemetry,
         submitted_at            = NOW()
       RETURNING id`,
      [
        studentId,
        classroomId,
        questionId,
        code,
        codeOutput,
        reasoningAnswer,
        timeTakenSeconds,
        tabSwitchCount,
        JSON.stringify(headingsReached),
        wasEmpty,
        JSON.stringify(dwellSeconds),
        maxScrollDepth,
        notesTelemetry ? JSON.stringify(notesTelemetry) : null
      ]
    );

    res.status(200).json({
      message: 'Submission saved successfully.',
      submissionId: upsertQuery.rows[0].id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Classroom mode & Test Administration endpoints (Instructor Protected)
app.post('/api/classroom/:id/go-live', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;
    await query('UPDATE Classrooms SET live_session_active = true WHERE id = $1', [id]);
    
    // Invalidate status cache
    statusCache.delete(id);
    
    io.to(id).emit('classroom:live_status', { live: true });
    res.json({ success: true, message: 'Classroom live session started.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/classroom/:id/end-live', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;
    await query('UPDATE Classrooms SET live_session_active = false WHERE id = $1', [id]);
    
    // Clear caches to prevent memory build-up over long uptimes
    statusCache.delete(id);
    notesCache.delete(id);
    mishapAggregates.delete(id);
    
    io.to(id).emit('classroom:live_status', { live: false });
    res.json({ success: true, message: 'Classroom live session ended.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/classroom/:id/test', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;
    const { title, durationMinutes } = req.body;
    
    await query("UPDATE Tests SET status = 'ended' WHERE classroom_id = $1 AND status = 'active'", [id]);
    
    const insertQuery = await query(
      `INSERT INTO Tests (classroom_id, title, status, duration_minutes) 
       VALUES ($1, $2, 'active', $3) RETURNING *`,
      [id, title, durationMinutes]
    );
    const newTest = insertQuery.rows[0];
    
    // Invalidate status cache
    statusCache.delete(id);
    
    io.to(id).emit('classroom:test_status', { active: true, test: newTest });
    res.json({ success: true, test: newTest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/classroom/:id/test', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;
    await query("UPDATE Tests SET status = 'ended' WHERE classroom_id = $1 AND status = 'active'", [id]);
    
    // Invalidate status cache
    statusCache.delete(id);
    
    io.to(id).emit('classroom:test_status', { active: false });
    res.json({ success: true, message: 'Test instance ended.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/classroom/:id/quick-question', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;
    const { questionText, template } = req.body;
    const activeTemplate = template || 'node';
    
    // Create in Questions table to log/persist it
    const topicNumber = Math.floor(Date.now() / 1000);
    const insertRes = await query(`
      INSERT INTO Questions (classroom_id, topic_number, code_task_prompt, reasoning_prompt, reasoning_type)
      VALUES ($1, $2, $3, $4, 'typed') RETURNING *
    `, [id, topicNumber, activeTemplate, questionText]);
    const newQuestion = insertRes.rows[0];

    io.to(id).emit('classroom:quick_question', { 
      questionId: newQuestion.id, 
      questionText, 
      template: activeTemplate,
      durationSeconds: 90 
    });
    
    res.json({ success: true, message: 'Quick question pushed and saved successfully.', question: newQuestion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/classroom/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check status memory cache first
    const cached = statusCache.get(id);
    if (cached) {
      return res.json(cached);
    }

    const classroomQuery = await query('SELECT live_session_active FROM Classrooms WHERE id = $1', [id]);
    const activeTestQuery = await query("SELECT * FROM Tests WHERE classroom_id = $1 AND status = 'active'", [id]);
    
    const payload = {
      liveSessionActive: classroomQuery.rows[0]?.live_session_active || false,
      activeTest: activeTestQuery.rows[0] || null
    };

    statusCache.set(id, payload);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Panel specific APIs
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const adminQuery = await query('SELECT * FROM Instructors WHERE email = $1', [email]);
    if (adminQuery.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const admin = adminQuery.rows[0];
    const adminPasswordMatch = await bcrypt.compare(password, admin.password_hash);
    if (!adminPasswordMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const sessionToken = 'admin_token_' + crypto.randomBytes(16).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await query('UPDATE Instructors SET session_token = $1, token_expires_at = $2 WHERE id = $3', [sessionToken, tokenExpiresAt, admin.id]);

    // Cache admin session in memory
    admin.session_token = sessionToken;
    admin.token_expires_at = tokenExpiresAt;
    adminSessionCache.set(sessionToken, { admin, expiresAt: tokenExpiresAt });

    res.json({
      email: admin.email,
      sessionToken
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/bootstrap', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });
    res.json({ email: auth.admin.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/classrooms', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const classesQuery = await query(`
      SELECT c.id, c.classroom_id, c.title, c.status, c.live_session_active,
             (SELECT json_build_object('id', t.id, 'title', t.title, 'duration_minutes', t.duration_minutes, 'status', t.status)
              FROM Tests t 
              WHERE t.classroom_id = c.id AND t.status = 'active'
              LIMIT 1) as active_test
      FROM Classrooms c
      ORDER BY c.created_at DESC
    `);
    res.json({ classrooms: classesQuery.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/classroom/:id/roster', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;
    const rosterQuery = await query(`
      SELECT u.id, u.name, u.roll_number as "rollNumber", u.email, u.phone
      FROM Users u
      INNER JOIN UserClassrooms uc ON uc.user_id = u.id
      WHERE uc.classroom_id = $1
      ORDER BY u.name ASC
    `, [id]);
    res.json({ roster: rosterQuery.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/classroom/:id/active-student-ids', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;
    const activeStudentIds = [];
    for (const mapping of Object.values(activeSocketMappings)) {
      if (mapping.classroomId === id && !activeStudentIds.includes(mapping.studentId)) {
        activeStudentIds.push(mapping.studentId);
      }
    }
    res.json({ activeStudentIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/classroom/:id/quick-questions', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;
    const qqQuery = await query(`
      SELECT id, topic_number as "timestampSec", reasoning_prompt as "questionText"
      FROM Questions
      WHERE classroom_id = $1 AND topic_number >= 1000000
      ORDER BY topic_number DESC
    `, [id]);
    res.json({ quickQuestions: qqQuery.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch endpoint: returns all classroom details in one call using a single SQL query.
// Uses PostgreSQL JSON aggregation (json_build_object / json_agg / COALESCE) to fetch
// roster, mishaps, quick-questions, assignments, and notes in ONE database round-trip instead of
// 5 parallel queries. This uses exactly 1 connection from the pool, preventing connection exhaustion.
app.get('/api/admin/classroom/:id/details', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;

    // Single SQL query that aggregates data sets into one response object.
    const result = await query(`
      SELECT
        -- 1. Roster: all enrolled students
        COALESCE((
          SELECT json_agg(json_build_object(
            'id',         u.id,
            'name',       u.name,
            'rollNumber', u.roll_number,
            'email',      u.email,
            'phone',      u.phone
          ) ORDER BY u.name ASC)
          FROM Users u
          INNER JOIN UserClassrooms uc ON uc.user_id = u.id
          WHERE uc.classroom_id = $1
        ), '[]'::json) AS roster,

        -- 2. Mishaps: fall back to DB only if cache is completely cold/empty
        COALESCE((
          SELECT json_agg(json_build_object(
            'id',                  ml.id,
            'type',                ml.type,
            'timestamp',           ml.timestamp,
            'meta',                ml.meta,
            'studentName',         u.name,
            'studentRollNumber',   u.roll_number
          ) ORDER BY ml.timestamp DESC)
          FROM MishapLogs ml
          INNER JOIN Users u ON u.id = ml.student_id
          WHERE ml.classroom_id = $1
        ), '[]'::json) AS db_mishaps,

        -- 3. Quick Questions: topic-number-gated questions (QQ epoch >= 1000000)
        COALESCE((
          SELECT json_agg(json_build_object(
            'id',           q.id,
            'timestampSec', q.topic_number,
            'questionText', q.reasoning_prompt
          ) ORDER BY q.topic_number DESC)
          FROM Questions q
          WHERE q.classroom_id = $1 AND q.topic_number >= 1000000
        ), '[]'::json) AS "quickQuestions",

        -- 4. Assignments: with nested questions and submitted question IDs
        COALESCE((
          SELECT json_agg(json_build_object(
            'id',                a.id,
            'title',             a.title,
            'status',            a.status,
            'targetStudentIds',  a.target_student_ids,
            'createdAt',         a.created_at,
            'questions', COALESCE((
              SELECT json_agg(json_build_object(
                'id',             aq.id,
                'codeTaskPrompt', aq.code_task_prompt,
                'reasoningPrompt', aq.reasoning_prompt,
                'reasoningType',  aq.reasoning_type,
                'options',        aq.options,
                'timerSeconds',   aq.timer_seconds
              ) ORDER BY aq.question_order)
              FROM AssignmentQuestions aq WHERE aq.assignment_id = a.id
            ), '[]'::json),
            'submittedQuestionIds', COALESCE((
              SELECT json_agg(DISTINCT asub.question_id)
              FROM AssignmentSubmissions asub WHERE asub.assignment_id = a.id
            ), '[]'::json)
          ) ORDER BY a.created_at DESC)
          FROM Assignments a
          WHERE a.classroom_id = $1
        ), '[]'::json) AS assignments,

        -- 5. Notes: previously published targeted note updates
        COALESCE((
          SELECT json_agg(json_build_object(
            'id',              n.id,
            'topicNumber',     n.topic_number,
            'title',           n.title,
            'markdownContent', n.markdown_content
          ) ORDER BY n.topic_number ASC)
          FROM Notes n
          WHERE n.classroom_id = $1
        ), '[]'::json) AS notes
    `, [id]);

    // Active student IDs from in-memory socket mappings — zero DB cost, O(sockets) lookup
    const activeStudentIds = [];
    for (const mapping of Object.values(activeSocketMappings)) {
      if (mapping.classroomId === id && !activeStudentIds.includes(mapping.studentId)) {
        activeStudentIds.push(mapping.studentId);
      }
    }

    const row = result.rows[0];
    const roster = row.roster || [];
    let classroomMishaps = [];

    // Seed mishapAggregates if cold/empty
    if (!mishapAggregates.has(id)) {
      mishapAggregates.set(id, new Map());
      const dbMishaps = row.db_mishaps || [];
      // Populate memory cache from DB rows (re-seed)
      dbMishaps.forEach(m => {
        // Find user matching roll number to get studentId
        const student = roster.find(r => r.rollNumber === m.studentRollNumber);
        if (student) {
          updateMishapAggregate(id, student.id, m.type, m.timestamp);
        }
      });
    }

    // Read real-time mishaps from in-memory aggregate map instead of querying DB
    const classroomMap = mishapAggregates.get(id);
    if (classroomMap) {
      for (const [studentId, agg] of classroomMap.entries()) {
        const student = roster.find(r => r.id === studentId);
        if (student) {
          // Re-serialize into response payload shapes expected by Observation Cards UI
          if (agg.tab_switch > 0) {
            classroomMishaps.push({
              type: 'tab_switch',
              timestamp: agg.lastEventAt,
              studentName: student.name,
              studentRollNumber: student.rollNumber,
              meta: { count: agg.tab_switch }
            });
          }
          if (agg.inactivity > 0) {
            classroomMishaps.push({
              type: 'inactivity',
              timestamp: agg.lastEventAt,
              studentName: student.name,
              studentRollNumber: student.rollNumber,
              meta: { count: agg.inactivity }
            });
          }
          if (agg.paste_attempt > 0) {
            classroomMishaps.push({
              type: 'paste_attempt',
              timestamp: agg.lastEventAt,
              studentName: student.name,
              studentRollNumber: student.rollNumber,
              meta: { count: agg.paste_attempt }
            });
          }
        }
      }
    }

    res.json({
      roster,
      activeStudentIds,
      mishaps:        classroomMishaps,
      quickQuestions: row.quickQuestions || [],
      assignments:    row.assignments    || [],
      notes:          row.notes          || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/question/:questionId/submissions', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { questionId } = req.params;
    const subsQuery = await query(`
      SELECT s.id, s.code, s.code_output as "codeOutput", s.reasoning_answer as "reasoningAnswer",
             s.time_taken_seconds as "timeTakenSeconds", s.tab_switch_count as "tabSwitchCount",
             s.headings_reached as "headingsReached", s.was_empty as "wasEmpty",
             s.dwell_seconds as "dwellSeconds", s.max_scroll_depth_percent as "maxScrollDepth",
             s.submitted_at as "submittedAt",
             u.name as "studentName", u.roll_number as "studentRollNumber"
      FROM Submissions s
      INNER JOIN Users u ON u.id = s.student_id
      WHERE s.question_id = $1
      ORDER BY s.submitted_at DESC
    `, [questionId]);
    res.json({ submissions: subsQuery.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/classroom/:id/rules', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;
    const { tabSwitchBlocked, pasteBlocked } = req.body;
    
    // Emit rules update live to connected clients in room
    io.to(id).emit('classroom:rules_updated', { tabSwitchBlocked, pasteBlocked });
    
    res.json({ success: true, message: 'Classroom rules updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/classroom/:id/submissions', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;

    const subsQuery = await query(`
      SELECT s.id, s.code, s.code_output as "codeOutput", s.reasoning_answer as "reasoningAnswer",
             s.time_taken_seconds as "timeTakenSeconds", s.tab_switch_count as "tabSwitchCount",
             s.headings_reached as "headingsReached", s.was_empty as "wasEmpty",
             s.dwell_seconds as "dwellSeconds", s.max_scroll_depth_percent as "maxScrollDepth",
             s.submitted_at as "submittedAt",
             u.name as "studentName", u.roll_number as "studentRollNumber",
             q.topic_number as "topicNumber", q.code_task_prompt as "codeTaskPrompt", q.reasoning_prompt as "reasoningPrompt"
      FROM Submissions s
      INNER JOIN Users u ON u.id = s.student_id
      INNER JOIN Questions q ON q.id = s.question_id
      WHERE s.classroom_id = $1
      ORDER BY s.submitted_at DESC
    `, [id]);

    const testSubsQuery = await query(`
      SELECT ts.id, ts.code, ts.code_output as "codeOutput", ts.reasoning_answer as "reasoningAnswer",
             ts.time_taken_seconds as "timeTakenSeconds", ts.tab_switch_count as "tabSwitchCount",
             ts.headings_reached as "headingsReached", ts.dwell_seconds as "dwellSeconds",
             ts.max_scroll_depth_percent as "maxScrollDepth", ts.submitted_at as "submittedAt",
             u.name as "studentName", u.roll_number as "studentRollNumber",
             q.topic_number as "topicNumber", q.code_task_prompt as "codeTaskPrompt", q.reasoning_prompt as "reasoningPrompt",
             t.title as "testTitle"
      FROM TestSubmissions ts
      INNER JOIN Users u ON u.id = ts.student_id
      INNER JOIN Questions q ON q.id = ts.question_id
      INNER JOIN Tests t ON t.id = ts.test_id
      WHERE t.classroom_id = $1
      ORDER BY ts.submitted_at DESC
    `, [id]);

    res.json({
      submissions: subsQuery.rows,
      testSubmissions: testSubsQuery.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/classroom/:id/mishaps', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;
    const mishapsQuery = await query(`
      SELECT m.id, m.type, m.timestamp, m.meta,
             u.name as "studentName", u.roll_number as "studentRollNumber"
      FROM MishapLogs m
      INNER JOIN Users u ON u.id = m.student_id
      WHERE m.classroom_id = $1
      ORDER BY m.timestamp DESC
    `, [id]);
    res.json({ mishaps: mishapsQuery.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all assignments in a classroom
app.get('/api/admin/classroom/:classroomId/assignments', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { classroomId } = req.params;
    const assignmentsQuery = await query(
      'SELECT * FROM Assignments WHERE classroom_id = $1 ORDER BY created_at DESC',
      [classroomId]
    );

    const assignments = assignmentsQuery.rows;
    for (const a of assignments) {
      const questions = await query(
        'SELECT * FROM AssignmentQuestions WHERE assignment_id = $1 ORDER BY question_index ASC',
        [a.id]
      );
      a.questions = questions.rows;
    }

    res.json({ assignments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Create/Update assignment
app.post('/api/admin/classroom/:classroomId/assignments', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { classroomId } = req.params;
    const { id, title, assignedTo, status, openAt, closeAt, questions } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Assignment title is required.' });
    }

    let assignment;
    if (id) {
      const updateRes = await query(
        `UPDATE Assignments 
         SET title = $1, assigned_to = $2, status = $3, open_at = $4, close_at = $5
         WHERE id = $6 AND classroom_id = $7 RETURNING *`,
        [title, assignedTo ? JSON.stringify(assignedTo) : null, status, openAt, closeAt, id, classroomId]
      );
      assignment = updateRes.rows[0];
      await query('DELETE FROM AssignmentQuestions WHERE assignment_id = $1', [id]);
    } else {
      const insertRes = await query(
        `INSERT INTO Assignments (classroom_id, title, assigned_to, status, open_at, close_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [classroomId, title, assignedTo ? JSON.stringify(assignedTo) : null, status || 'draft', openAt, closeAt]
      );
      assignment = insertRes.rows[0];
    }

    if (Array.isArray(questions)) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await query(
          `INSERT INTO AssignmentQuestions (assignment_id, question_index, code_task_prompt, reasoning_prompt, reasoning_type, options, timer_seconds)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            assignment.id,
            i,
            q.codeTaskPrompt || '',
            q.reasoningPrompt || '',
            q.reasoningType || 'typed',
            q.options ? JSON.stringify(q.options) : null,
            q.timerSeconds || null
          ]
        );
      }
    }

    const updatedQs = await query(
      'SELECT * FROM AssignmentQuestions WHERE assignment_id = $1 ORDER BY question_index ASC',
      [assignment.id]
    );
    assignment.questions = updatedQs.rows;

    // Invalidate assignments definitions cache
    assignmentsCache.delete(assignment.id);

    io.to(classroomId).emit('classroom:assignments_updated');
    res.json({ success: true, assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get submissions for review mode
app.get('/api/admin/assignments/:id/submissions', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;
    const subsQuery = await query(
      `SELECT s.*, u.name as "studentName", u.roll_number as "studentRollNumber", q.question_index as "questionIndex"
       FROM AssignmentSubmissions s
       JOIN Users u ON s.student_id = u.id
       JOIN AssignmentQuestions q ON s.question_id = q.id
       WHERE s.assignment_id = $1
       ORDER BY s.submitted_at DESC, q.question_index ASC`,
      [id]
    );

    res.json({ submissions: subsQuery.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student: Get assignments active for them
app.get('/api/assignments', async (req, res) => {
  try {
    const sessionToken = req.headers['authorization'];
    const auth = await validateSession(sessionToken);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const studentId = auth.user.id;
    const classQuery = await query('SELECT classroom_id FROM UserClassrooms WHERE user_id = $1', [studentId]);
    const classroomIds = classQuery.rows.map(r => r.classroom_id);

    if (classroomIds.length === 0) {
      return res.json({ assignments: [] });
    }

    const assignmentsQuery = await query(
      `SELECT * FROM Assignments 
       WHERE classroom_id = ANY($1) AND status = 'active'
       ORDER BY created_at DESC`,
      [classroomIds]
    );

    const targeted = assignmentsQuery.rows.filter(a => {
      if (!a.assigned_to) return true;
      const list = Array.isArray(a.assigned_to) ? a.assigned_to : JSON.parse(a.assigned_to || '[]');
      return list.includes(studentId);
    });

    for (const a of targeted) {
      // Check assignments memory cache first for the questions list
      let questions = assignmentsCache.get(a.id);
      if (!questions) {
        const qQuery = await query(
          'SELECT * FROM AssignmentQuestions WHERE assignment_id = $1 ORDER BY question_index ASC',
          [a.id]
        );
        questions = qQuery.rows;
        assignmentsCache.set(a.id, questions);
      }
      a.questions = questions;

      const subsQuery = await query(
        'SELECT question_id FROM AssignmentSubmissions WHERE assignment_id = $1 AND student_id = $2',
        [a.id, studentId]
      );
      a.submittedQuestionIds = subsQuery.rows.map(r => r.question_id);
    }

    res.json({ assignments: targeted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student: Submit assignment question solution
app.post('/api/assignments/:id/submit-question', async (req, res) => {
  try {
    const sessionToken = req.headers['authorization'];
    const auth = await validateSession(sessionToken);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { id } = req.params;
    const { questionId, code, codeOutput, reasoningAnswer, timeTakenSeconds, tabSwitchCount, dwellSeconds, maxScrollDepth, notesTelemetry } = req.body;
    const studentId = auth.user.id;

    if (!questionId) {
      return res.status(400).json({ error: 'Question ID is required.' });
    }

    await query(
      `INSERT INTO AssignmentSubmissions 
       (assignment_id, question_id, student_id, code, code_output, reasoning_answer, time_taken_seconds, tab_switch_count, dwell_seconds, max_scroll_depth, notes_telemetry)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (student_id, question_id)
       DO UPDATE SET 
         code = EXCLUDED.code, 
         code_output = EXCLUDED.code_output, 
         reasoning_answer = EXCLUDED.reasoning_answer, 
         time_taken_seconds = EXCLUDED.time_taken_seconds, 
         tab_switch_count = EXCLUDED.tab_switch_count, 
         dwell_seconds = EXCLUDED.dwell_seconds, 
         max_scroll_depth = EXCLUDED.max_scroll_depth, 
         notes_telemetry = EXCLUDED.notes_telemetry,
         submitted_at = CURRENT_TIMESTAMP`,
      [id, questionId, studentId, code, codeOutput, reasoningAnswer, timeTakenSeconds, tabSwitchCount, dwellSeconds ? JSON.stringify(dwellSeconds) : null, maxScrollDepth, notesTelemetry ? JSON.stringify(notesTelemetry) : null]
    );

    res.json({ success: true, message: 'Question answer submitted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function parseHeadingsManifest(md) {
  if (!md) return [];
  const lines = md.split('\n');
  const manifest = [];
  let id = 1;
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      manifest.push({
        id: id++,
        title: match[2].trim(),
        level: match[1].length
      });
    }
  }
  return manifest;
}

app.post('/api/admin/notes', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { classroomId, topicNumber, title, markdownContent } = req.body;
    if (!classroomId || !topicNumber || !title || !markdownContent) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const headingsManifest = parseHeadingsManifest(markdownContent);

    await query(`
      INSERT INTO Notes (classroom_id, topic_number, title, markdown_content, headings_manifest)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (classroom_id, topic_number) DO UPDATE
      SET title = EXCLUDED.title,
          markdown_content = EXCLUDED.markdown_content,
          headings_manifest = EXCLUDED.headings_manifest
    `, [classroomId, topicNumber, title, markdownContent, JSON.stringify(headingsManifest)]);

    // Invalidate notes cache
    notesCache.delete(classroomId);

    io.to(classroomId).emit('classroom:notes_updated', {
      topicNumber,
      title,
      markdownContent,
      headingsManifest
    });

    res.json({ success: true, message: 'Note saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/student/:studentId/profile', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { studentId } = req.params;

    // 1. Fetch Student/User Info + Classrooms they are in
    const userQuery = await query(
      `SELECT u.id, u.name, u.roll_number as "rollNumber", u.email, u.phone,
              COALESCE(json_agg(json_build_object('id', c.id, 'title', c.title, 'classId', c.classroom_id)) FILTER (WHERE c.id IS NOT NULL), '[]') as classrooms
       FROM Users u
       LEFT JOIN UserClassrooms uc ON uc.user_id = u.id
       LEFT JOIN Classrooms c ON uc.classroom_id = c.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [studentId]
    );

    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    const student = userQuery.rows[0];

    // 2. Fetch Mishap Logs
    const mishapQuery = await query(
      `SELECT id, type, timestamp, meta FROM MishapLogs WHERE student_id = $1 ORDER BY timestamp DESC`,
      [studentId]
    );

    // 3. Fetch Standard/Live Submissions
    const submissionsQuery = await query(
      `SELECT s.id, s.code, s.code_output as "codeOutput", s.reasoning_answer as "reasoningAnswer",
              s.time_taken_seconds as "timeTakenSeconds", s.tab_switch_count as "tabSwitchCount",
              s.submitted_at as "submittedAt", s.notes_telemetry as "notesTelemetry",
              q.topic_number as "topicNumber", q.code_task_prompt as "questionText", 'Live' as type
       FROM Submissions s
       JOIN Questions q ON s.question_id = q.id
       WHERE s.student_id = $1
       ORDER BY s.submitted_at DESC`,
      [studentId]
    );

    // 4. Fetch Test Submissions
    const testSubmissionsQuery = await query(
      `SELECT ts.id, ts.code, ts.code_output as "codeOutput", ts.reasoning_answer as "reasoningAnswer",
              ts.time_taken_seconds as "timeTakenSeconds", ts.tab_switch_count as "tabSwitchCount",
              ts.submitted_at as "submittedAt", ts.notes_telemetry as "notesTelemetry",
              q.topic_number as "topicNumber", q.code_task_prompt as "questionText", 'Test' as type,
              t.title as "testTitle"
       FROM TestSubmissions ts
       JOIN Questions q ON ts.question_id = q.id
       JOIN Tests t ON ts.test_id = t.id
       WHERE ts.student_id = $1
       ORDER BY ts.submitted_at DESC`,
      [studentId]
    );

    // 5. Fetch Assignment Submissions
    const assignmentSubmissionsQuery = await query(
      `SELECT asub.id, asub.code, asub.code_output as "codeOutput", asub.reasoning_answer as "reasoningAnswer",
              asub.time_taken_seconds as "timeTakenSeconds", asub.tab_switch_count as "tabSwitchCount",
              asub.submitted_at as "submittedAt", asub.notes_telemetry as "notesTelemetry",
              aq.code_task_prompt as "questionText", 'Assignment' as type,
              a.title as "assignmentTitle", aq.question_index as "questionIndex"
       FROM AssignmentSubmissions asub
       JOIN AssignmentQuestions aq ON asub.question_id = aq.id
       JOIN Assignments a ON asub.assignment_id = a.id
       WHERE asub.student_id = $1
       ORDER BY asub.submitted_at DESC`,
      [studentId]
    );

    // 6. Fetch Assignment Completion Statuses
    const assignmentsQuery = await query(
      `SELECT a.id, a.title, a.status, a.assigned_to as "assignedTo",
              (SELECT count(*)::int FROM AssignmentQuestions aq WHERE aq.assignment_id = a.id) as "totalQuestions",
              (SELECT count(*)::int FROM AssignmentSubmissions asub WHERE asub.assignment_id = a.id AND asub.student_id = $1) as "submittedQuestions"
       FROM Assignments a
       JOIN UserClassrooms uc ON a.classroom_id = uc.classroom_id
       WHERE uc.user_id = $1
       ORDER BY a.created_at DESC`,
      [studentId]
    );

    // 7. Get Notes Exploration Telemetry
    const notesQuery = await query(
      `SELECT n.id, n.topic_number as "topicNumber", n.title, n.headings_manifest as "headingsManifest", n.classroom_id as "classroomId"
       FROM Notes n
       JOIN UserClassrooms uc ON n.classroom_id = uc.classroom_id
       WHERE uc.user_id = $1
       ORDER BY n.topic_number ASC`,
      [studentId]
    );

    res.json({
      student,
      mishaps: mishapQuery.rows,
      liveSubmissions: submissionsQuery.rows,
      testSubmissions: testSubmissionsQuery.rows,
      assignmentSubmissions: assignmentSubmissionsQuery.rows,
      assignments: assignmentsQuery.rows,
      notes: notesQuery.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/questions', async (req, res) => {
  try {
    const auth = await validateAdminSession(req.headers['authorization']);
    if (!auth.authenticated) return res.status(401).json({ error: auth.error });

    const { classroomId, topicNumber, codeTaskPrompt, reasoningPrompt, reasoningType, options } = req.body;
    if (!classroomId || !topicNumber || !codeTaskPrompt || !reasoningPrompt || !reasoningType) {
      return res.status(400).json({ error: 'All fields except options are required.' });
    }

    await query(`
      INSERT INTO Questions (classroom_id, topic_number, code_task_prompt, reasoning_prompt, reasoning_type, options)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (classroom_id, topic_number) DO UPDATE
      SET code_task_prompt = EXCLUDED.code_task_prompt,
          reasoning_prompt = EXCLUDED.reasoning_prompt,
          reasoning_type = EXCLUDED.reasoning_type,
          options = EXCLUDED.options
    `, [classroomId, topicNumber, codeTaskPrompt, reasoningPrompt, reasoningType, options ? JSON.stringify(options) : null]);

    res.json({ success: true, message: 'Question saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// 8. Seeding endpoint for testing purposes
app.post('/api/seed', async (req, res) => {
  try {
    // Clear existing
    await query('DELETE FROM UserClassrooms');
    await query('DELETE FROM Notes');
    await query('DELETE FROM Questions');
    await query('DELETE FROM Classrooms');

    // Create Classroom
    const classRes = await query(
      `INSERT INTO Classrooms (classroom_id, title, status) 
       VALUES ($1, $2, $3) RETURNING id`,
      ['REACT60', 'Advanced React & WebContainers', 'active']
    );

    const classroomId = classRes.rows[0].id;

    // Seed Notes
    const notesData = [
      [
        classroomId,
        1,
        '1. Introduction to WebContainers',
        `# WebContainers Overview

WebContainers are a WebAssembly-based micro-operating system that runs inside your browser. They allow developers to run Node.js, install packages, and boot dev servers client-side.

## Heading 1: Why isolate cross-origins?
Because WebContainers boot a complete node environment using SharedArrayBuffer for memory sharing between processes. This buffer can expose side-channel attacks (like Spectre) without COEP and COOP headers configured on the serving page.

## Heading 2: Capabilities
- Node.js execution
- Local npm installs
- Microservice running client-side`
      ],
      [
        classroomId,
        2,
        '2. React State Fundamentals',
        `# React State

State allows React components to remember information and re-render when it changes.

## Heading 1: Hook Rules
Only call hooks at the top level of React functions. Never call them inside loops or conditions.

## Heading 2: Async State Updates
React state updates are batched. Read state updates using functional updaters when needed.`
      ]
    ];

    for (const note of notesData) {
      const headingsManifest = parseHeadingsManifest(note[3]);
      await query(
        'INSERT INTO Notes (classroom_id, topic_number, title, markdown_content, headings_manifest) VALUES ($1, $2, $3, $4, $5)',
        [...note, JSON.stringify(headingsManifest)]
      );
    }

    // Seed Questions
    const questionsData = [
      [
        classroomId,
        1,
        "Write a node script that uses the 'fs' module to write a file named 'output.txt' containing 'Hello WebContainers!', and console.log the content read from it.",
        'Why does the browser require SharedArrayBuffer for WebContainers to function, and how do COOP/COEP headers enforce security?',
        'typed',
        JSON.stringify([])
      ],
      [
        classroomId,
        2,
        'Create a standard counter state in React. When the button is clicked, increment count by 1.',
        'Which React hook is used to handle side-effects like fetching data or subscribing to events?',
        'mcq',
        JSON.stringify(['useState', 'useEffect', 'useContext', 'useRef'])
      ]
    ];

    for (const q of questionsData) {
      await query(
        'INSERT INTO Questions (classroom_id, topic_number, code_task_prompt, reasoning_prompt, reasoning_type, options) VALUES ($1, $2, $3, $4, $5, $6)',
        q
      );
    }

    res.json({ message: 'Supabase PostgreSQL successfully seeded with classroom REACT60' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`[SYSTEM] Backend Server running on port ${PORT}`);
});
