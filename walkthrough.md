# Live Coding Classroom MVP — Walkthrough

We have successfully migrated the database to Supabase PostgreSQL, implemented the new v2 student flows, and verified all backend endpoints.

## Changes Made

### 1. Database Schema Setup (PostgreSQL Supabase)
- Formulated the DDL database schema matching v2 specifications in [schema.sql](file:///home/abhishek/Documents/C02/TeachingPTF/backend/schema.sql).
- Created a database client connection script in [db.js](file:///home/abhishek/Documents/C02/TeachingPTF/backend/db.js) utilizing a PostgreSQL Connection Pool pointing to Supabase.
- Created [setupDb.js](file:///home/abhishek/Documents/C02/TeachingPTF/backend/setupDb.js) to automate database table creations.
- Successfully ran migrations and seeded the Supabase database with classroom `REACT60` including notes and questions.

### 2. Next.js Host Dev Verification Config
- Modified [next.config.ts](file:///home/abhishek/Documents/C02/TeachingPTF/frontend/next.config.ts) to declare `allowedDevOrigins: ['10.168.184.121']` to prevent Next.js from blocking webpack-hmr hot module reload connections from test machines.

### 3. Student flow v2 Implementation
- **Registration & Verification**: Added a detailed tab-switching screen at [page.tsx](file:///home/abhishek/Documents/C02/TeachingPTF/frontend/src/app/page.tsx) that allows registration, password hashing, and console-logged OTP verification.
- **Home Dashboard**: Created [dashboard/page.tsx](file:///home/abhishek/Documents/C02/TeachingPTF/frontend/src/app/dashboard/page.tsx) supporting classroom join codes and linked classrooms lists.
- **Classroom Workspace**: Updated [Workspace.tsx](file:///home/abhishek/Documents/C02/TeachingPTF/frontend/src/components/Workspace.tsx) and [classroom/page.tsx](file:///home/abhishek/Documents/C02/TeachingPTF/frontend/src/app/classroom/page.tsx) to:
  - Fetch content by classroom UUID under a React Suspense boundary.
  - Implement state-change based socket events for inactivity timeouts (2 minutes threshold) and visibility tab-switches (eliminating 3-second heartbeat timers).
  - Enforce client-side copy-paste blocks on the editor and log paste attempts to the backend.
  - Restore file cache states from `localStorage` upon mounting.

### 4. Nodemailer OTP Verification Integration
- Integrated `nodemailer` inside the `backend` server.
- The registration endpoint attempts to send an email with the 6-digit OTP code using your Gmail account (`abhishekaj590@gmail.com`).
- Enforced a graceful fallback: if your Google App Password is not yet set in `backend/.env` (using `EMAIL_PASS`), it logs a warning and outputs the OTP code directly to the server console and API response to keep dev testing operational.

### 5. Two-Way Filesystem Watcher Sync & Explorer Sidebar (Feature 1)
- Implemented a recursive directory parsing algorithm to display files in a collapsible folder tree.
- Configured a filesystem watcher using WebContainer's native `fs.watch` API that watches the virtual disk recursively and performs a debounced `scanDirectory` scan (ignoring `node_modules`, `.next`, and `.git`) to update the explorer sidebar dynamically in real-time when terminal commands run.
- Refactored explorer actions (creation, renaming, and deletion) to run directly on the WebContainer virtual disk and let the watcher update React state.
- Bound editor keystrokes to write back to the WebContainer disk with a 300ms debounce.
- **Visual File Tree Explorer Upgrade**: Styled the tree nodes with collapsible directory guides, custom emojis (`📁`/`📂` for folders, `📄` for files), and distinct text coloring/indents.
- **Collapsible Sidebar Toggles**: Added support to collapse the Workspace Tree explorer panel and the Task Prompt panel to give the editor full-width space.

### 6. Dynamic Multiple Terminals (Feature 2)
- Replaced the single interactive terminal shell with a fully dynamic multiple terminal manager:
  - Added a `[+]` button to spawn new terminal tabs running independent `jsh` shell sessions.
  - Added `[x]` close buttons to safely close terminal tabs and terminate active shell processes.
  - Automatically routes "Run Workspace" triggers to a dedicated run terminal tab titled "Run Workspace", preserving the user's manual/custom shell sessions.

### 7. Split Layout & Manual Browser Viewport (Feature 3)
- Restructured the bottom workspace area into a split layout: Terminal console on the left, and a Manual Browser Viewport on the right.
- Enforced manual link-pasting of localhost/WebContainer URLs with strict path prefix pattern checks to teach the networking lifecycle explicitly.
- Supported toggling preview states to expand the terminal to full-width when hidden.
- **Auto-Fill Preview URL**: Updated the WebContainer `server-ready` event listener to automatically pre-fill the Address Bar input with the sandboxed `.local-corp.webcontainer-api.io` virtual URL upon compilation.
- **Preview Reload Control**: Integrated a dedicated **Reload Viewport** button next to **Connect** to refresh the preview iframe.
- **Fullscreen Viewport Mode**: Added a maximize button that opens the browser preview in a fullscreen overlay covering the entire central pane. Connected the Escape key to close the fullscreen view.

### 8. Textarea Code Editor Enhancements
- Disabled browser native spelling corrector highlights inside the editor textarea by adding `spellCheck={false}`, clearing all red squiggly underlines on variables and syntax tokens.

### 9. HMR-Resilient Boot Singleton (Hot Module Reload Protection)
- Attached the WebContainer boot instance and boot promise directly to the global `window` namespace (`window.__webcontainer_instance__`).
- This prevents chunk hot-reloads from trying to call `WebContainer.boot()` a second time, resolving the runtime exception `"Only a single WebContainer instance can be booted"` completely.

---

## Fixes Applied

1. **Dashboard-to-Classroom Isolation Header Fix**:
   - Switched Next.js client-side routing `router.push` to a hard redirect `window.location.href` on the student Home Dashboard page. This forces the browser to request the classroom document directly from the server, loading the COOP/COEP headers and enabling WebContainers without throwing `DataCloneError`.

2. **Top-Level require-corp COEP Alignment**:
   - Switched `Cross-Origin-Embedder-Policy` headers back to `require-corp` in `next.config.ts`.
   - This aligns the top-level document's COEP policy with Stackblitz's embedded iframe settings (`w-corp-staticblitz.com`), allowing WebAssembly memory serialization to execute securely.

## 6. Form Validation & Rate Limiting (Latest Update)

### Custom Rate Limiting
- **IP-Based In-Memory Limiter**: Implemented a lightweight rate-limiting store directly inside the backend. It uses request IP attributes (supporting Cloudflare headers like `cf-connecting-ip`) to block requests exceeding limits.
- **Enforcement**: Applied to registration, login, and OTP verification routes (`/api/register`, `/api/login`, `/api/verify-otp`). Limits request rates to 5 per minute per IP. Returns a standard `429 Too Many Requests` status code with warning logs printed as `[SECURITY]` in the server logs.

### Client and Server-side Input Validation
- **Registration Validations**:
  - Enforced format checks for emails using standard regular expressions on both the client (frontend) and server (backend).
  - Enforced password complexity requirements (minimum 6 characters) on both client and server sides.
  - Enforced non-empty check for student roll numbers.
- **Login Validations**:
  - Validated email format checks prior to POSTing to reduce invalid server queries.

---

## 7. Verification Results

* **Compilation**: Build successfully checked using `npm run build` which completed with zero compilation, typechecking, or linting errors.
* **Security & Resilience**: PM2 auto-restart and custom IP rate-limiting rules verified to work successfully.
* **Integrations**: All forms prevent submission and display errors when invalid input (e.g. invalid email format) is typed.
- Executed `verify_v2.js` validating full backend endpoint sequences:
```bash
--- STARTING v2 BACKEND ENDPOINT VERIFICATION ---
Seeding database...
Seed status: 200
Seed message: Supabase PostgreSQL successfully seeded with classroom REACT60
Registering student: test_student_3316@test.com | Roll: ROLL-56551...
Register status: 201
Register message: Registration successful. OTP generated (check console).
Generated OTP Code: 429634
Verifying OTP code...
Verify status: 200
Verify message: Email verified successfully.
Logging in...
Login status: 200
Login Student ID: 7b364451-3fb3-473f-885a-4f75d727e158
Session Token: token_f7135d54f0b44e089142826c22b14c37
Bootstrapping dashboard...
Bootstrap status: 200
User Name: Abhishek Kumar
Joined Classrooms count (should be 0): 0
Joining classroom REACT60...
Join status: 200
Joined classroom title: Advanced React & WebContainers
Fetching classroom content...
Content status: 200
Notes count: 2
Questions count: 2
Submitting solution...
Submit status: 201
Submit response message: Submission saved successfully

--- v2 BACKEND ENDPOINT VERIFICATION SUCCESSFUL ---
```

---

### 10. Two-Mode Architecture: Live Classroom vs Test (Part 1)
- **Live Classroom**: Sockets are inactive until "Go Live" is clicked. Support added for "Raise Hand / Doubt" button notifying the instructor and "Quick Questions" with 1.5-minute auto-submit countdown.
- **Test Mode**: Clean workspace on enter (clearing file/reasoning cache), questions rendered one at a time, each with its own timer (triggers auto-submit on timeout), storing results to `TestSubmissions` table.

### 11. Centralized Telemetry Rules (Part 2)
- Created [analyzerRules.ts](file:///home/abhishek/Documents/C02/TeachingPTF/frontend/src/utils/analyzerRules.ts) to define visibility switch detection (`registerTabSwitch`), copy-paste interception (`registerPasteBlock` on editor and reasoning fields), and inactivity tracking (`registerInactivity` firing once per idle period). Added window `blur` listener for Alt-tab switches and 500ms time debouncing to prevent concurrent double-counting.

### 12. Standalone Observation Debug Card (Part 3)
- Created [ObservationDebugCard.tsx](file:///home/abhishek/Documents/C02/TeachingPTF/frontend/src/components/ObservationDebugCard.tsx) to self-verify rule telemetry. Enabled via `&debug=true` in the workspace URL. Shows REST API ping status, Socket connection state, scrolled note headings, local storage cache sizes, and WebContainer status.

### 13. Sidebar Notes Explorer Layout
- Removed the top header Topic select dropdown.
- Refactored the Left Panel to house a collapsible **Notes Explorer** (`📂 reference_notes/`) directory. Clicking files (e.g. `1. Introduction to React.md`) dynamically swaps the active note text, handles file-level scroll tracking, and switches the editor cache namespaces.
- **Rich Scroll & Section Telemetry**: Integrated an intersection observer to track the actual header text title (e.g., `"Troubleshooting WebContainers"`) scrolled into view by the student, along with a scroll progress percentage indicator (e.g., `55% Read`) rendered live on the debug panel. Added **Section Dwell Time tracking** (measuring how many seconds the student active viewport spends reading each sub-heading before scrolling) and **Max Scroll Depth reached** (furthest scroll percentage depth achieved on the active document).

### 14. Redesigned Classroom Control Center
- **Classroom Selector Grid**: Instructors land on a grid listing their own classrooms. Selecting a classroom opens a scoped Control Center layout.
- **Roster & Online Status**: Renders all joined students with a real-time Online/Offline connection status ping using Socket.io and backend mappings.
- **Go Live Status Toggle**: Toggle Go Live and End Live session parameters in real-time.
- **Card-Based Observation Center**: Aggregates student mishap logs (tab switches, idle durations, paste blocks) into three clean, clickable summary cards. Clicking a card expands to reveal infraction timestamps.
- **Quick Question & History Review**: Send dynamic Javascript tasks with a 90s timer. View a list of past questions. Click any question to open a detailed comparative student answer reviewer (displaying code solutions, conceptual reasoning, dwell times, and scroll depth).
- **Targeted Notes Socket Updates**: Create and publish Markdown note updates which are pushed directly via Socket.io to active student screens without reloading their workspaces.
- **Rules Enforcement Toggles**: Toggle tab-switch telemetry and editor paste-block rules live.
- **Student Quick Question Modal Overlay**: Displays an isolated full-screen popup modal for pushed questions containing private answers inputs and countdown timers, returning the student back to their workspace when submitted.
- **Optimized Telemetry Batching**: Buffers student visibility events (tab switches), copy-paste violations, and inactivity logs locally in a client-side memory array, flushing them to the database in a single pooled insert event (`mishap:batch`) every 60 seconds (or immediately on solution submission) to prevent Supabase connection pool exhaustion.
- **Monaco Editor Autocomplete System**: Integrated `@monaco-editor/react` to provide students with VS Code-like IntelliSense suggestions, autocomplete code snippets, line numbering, and full JavaScript syntax highlighting in the workspace. Updated paste-blocking selector to capture Monaco `.inputarea` events.
- **Draggable & Resizable Live Layout**: Refactored the live classroom layout to place the Terminal panel vertically in the top-right, and the Browser Preview taking full width at the bottom-center. Added draggable vertical and horizontal dividing handles to dynamically resize both panels, and supported collapsing the Browser panel to the bottom.
- **Isolated Quick Question Sandbox Templates**: Instructors can select between Node.js, React, or static HTML templates when pushing a Quick Question. The student's workspace automatically backs up their active project files, mounts the selected sandbox template in WebContainer to run the code, and restores their exact main workspace files upon submission.
- **Draggable Diagnostic Card**: The Observation Diagnostics Card is now draggable anywhere on the screen using a dedicated drag handle header.

---

## Active Environment Status

1. **Next.js Dev Server**: Running on `http://localhost:3000` (Network: `http://10.168.184.121:3000`).
2. **Backend Express Server**: Running on `http://localhost:5000` connected to Supabase.
3. **Database (Supabase PostgreSQL)**: Fully initialized and seeded.
