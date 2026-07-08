# Live Coding Classroom — MVP Build Doc (Testing Stage)

**Stack:** Next.js (frontend) + Node/Express (backend) + Socket.io (real-time) + MongoDB Atlas (DB) + WebContainers (in-browser code execution)

**Stage:** Testing / v1. Ship working, iterate after real classroom use. Do NOT build production-grade auth, security hardening, or scaling logic yet — that's a deliberate v2 pass after this cohort.

---

## 0. What Each Piece Does (for learning — read this before building)

- **Next.js**: React framework with built-in routing, server-side rendering, and API routes. You'll use its API routes for simple backend needs (e.g. auth check) and a separate Node/Express server for Socket.io (Next.js API routes don't handle persistent WebSocket connections well — that's why Socket.io needs its own server process).
- **Node/Express**: Your Socket.io server lives here. Handles real-time events — code sync, notes push, question push, flags. This runs as a standalone process, separate from Next.js.
- **Socket.io**: Library for real-time, two-way communication between browser and server over WebSockets (with fallback). Used here for: live notes broadcast, question push, code snapshot relay, flag events (tab-switch, idle, error).
- **WebContainers**: Runs a real Node.js environment INSIDE the student's browser via WebAssembly. This is not a simulation — it's an actual npm install + dev server + terminal, just sandboxed client-side. This is why it can run React/JS code with zero backend compute cost to you.
- **MongoDB Atlas**: Cloud-hosted database, free tier. Stores: student submissions (code + reasoning + telemetry), question bank, session logs.

---

## 1. MVP Scope (what we're building right now — nothing more)

### In scope:
- [ ] Simple login (name/roll-number or basic email — NOT hardened auth, this is testing stage)
- [ ] Three-panel layout: Notes/PDF (left, toggleable) — WebContainers editor (center) — Question + reasoning panel (right)
- [ ] Notes rendered from MD stored in DB (author writes in Markdown, gets rendered to the panel)
- [ ] WebContainers JS/React environment: real editor, real terminal, run button, live output
- [ ] Paste-block on the code editor (block paste event only)
- [ ] Question display (text-based, e.g. scenario question) + reasoning answer box (typed or MCQ options) alongside the code task
- [ ] Submit button: sends code + reasoning answer + basic telemetry together in ONE payload to backend, stores in DB
- [ ] Tab-switch detection (Page Visibility API) — fires only when leaving the whole app (notes panel must be in-app, not a separate browser tab)
- [ ] Heading-reach tracking: as student scrolls notes, log which heading (by ID/number, not content) they've reached — stored as a simple ordered list, like a browser history stack
- [ ] Local-first caching: telemetry + in-progress code cached in browser localStorage, only sent to server on submit (or tab-close/disconnect as a safety flush)
- [ ] No timer, no test-case validation, no live scoring shown to student
- [ ] Basic instructor view: list of submissions with code, reasoning answer, time taken, flags (tab-switch count, notes explored) — manual review, no LLM grading yet

### Explicitly OUT of scope for this build (do not build, do not ask about — deferred to v2):
- LLM-based auto-grading (Tier 1/2/3 fallback system) — later
- Hardened auth (token expiry, httpOnly cookie security, email verification flow) — later
- Cross-device session resume — later
- IndexedDB / large payload handling — later
- C++ or any non-JS language support — later, separate execution backend entirely
- Live dashboard with real-time grid view of all students — later (start with post-hoc submission review instead)

---

## 2. Data Model (MongoDB — keep it simple)

```js
// Student
{
  _id, name, rollNumber, sessionToken (basic, no expiry logic yet)
}

// Question
{
  _id, topicNumber, codeTaskPrompt, reasoningPrompt,
  reasoningType: "typed" | "mcq",
  mcqOptions: [] // if applicable
}

// Submission
{
  _id, studentId, questionId,
  code: String,
  codeOutput: String,
  reasoningAnswer: String,
  timeTakenSeconds: Number,       // timestamp diff: question shown -> submit clicked
  tabSwitchCount: Number,
  headingsReached: [Number],      // ordered list of heading IDs, e.g. [1,2,4,5]
  wasEmpty: Boolean,              // true if code and/or reasoning left blank
  submittedAt: Date
}

// Notes
{
  _id, topicNumber, title, markdownContent
}
```

---

## 3. Build Order (do these in sequence, test each before moving to next)

1. **Next.js shell + basic login** — no real security, just identify the student for this session
2. **Notes panel** — fetch MD from DB, render in a toggleable left panel
3. **WebContainers editor** — center panel, confirm real npm install + run + terminal output works standalone before integrating anything else
4. **Question + reasoning panel** — right panel, static display + input box, no submit logic yet
5. **Submit flow** — wire up the combined payload (code + reasoning + telemetry) → Node/Express endpoint → MongoDB write
6. **Tab-switch + heading-tracking** — add these telemetry hooks, confirm they don't fire falsely when using the in-app notes panel
7. **localStorage caching** — cache state client-side, only flush to server on submit or disconnect/tab-close event
8. **Instructor review page** — simple table/list view of all submissions for manual review

**Test after step 3 and after step 5 with a small number of test users (not the full class) before wiring up telemetry and going live.**

---

## 3.5. WebContainers Setup Requirements (Next.js specific — read before starting step 3)

WebContainers requires the page to be **cross-origin isolated**. This is not optional — without it, `WebContainer.boot()` will fail. Two things are required:

1. **Headers** — the page serving the WebContainers editor must send:
   - `Cross-Origin-Embedder-Policy: require-corp`
   - `Cross-Origin-Opener-Policy: same-origin`

   In Next.js on Vercel, configure this in `vercel.json`, scoped to the specific route (e.g. `/classroom` or wherever the editor lives) — **do NOT apply these headers globally/site-wide**, since COOP/COEP can silently break the login flow, third-party embeds, or any cross-origin resource loading elsewhere in the app. Example:

   ```json
   {
     "headers": [
       {
         "source": "/classroom",
         "headers": [
           { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
           { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
         ]
       }
     ]
   }
   ```

   Alternatively, set these in `next.config.js` under the `headers()` function, scoped to the same specific path.

2. **HTTPS in production** — required once deployed. Localhost is exempt during local dev, but the moment this goes on Vercel, HTTPS is non-negotiable for WebContainers to function. Vercel provides this by default, so this should be a non-issue, just don't test assuming HTTP will work anywhere but localhost.

**Testing checklist for this step:**
- [ ] Confirm `WebContainer.boot()` succeeds only on the scoped route, not causing errors elsewhere
- [ ] Confirm login/auth flow still works after headers are added (test this explicitly — COOP has broken login flows in other projects when applied too broadly)
- [ ] Confirm notes/PDF panel (if it loads any external resource) still renders correctly under COEP — if it breaks, that resource needs proper CORS/CORP headers or needs to be self-hosted instead of cross-origin

**Package:** `@webcontainer/api` (npm) — basic usage pattern: `WebContainer.boot()` → `webcontainer.mount(files)` → run install → run dev server, with output piped to an iframe for preview and a terminal-like output stream from the process.

---

## 4. Known Risks (carry forward, don't rebuild from scratch — just be aware)

- No production auth — acceptable for testing stage, must be revisited before any permanent/recurring use (e.g. letmecode coaching center)
- localStorage used for caching — fine for small JS-only payloads now; revisit if Node phase or multi-file projects increase payload size
- Single backend process (your machine, if not yet moved to hosting) — accept for this test round, plan migration to a small VPS before recurring/permanent use
- Reasoning-panel answers are NOT auto-graded in this build — instructor reviews manually for now

---

## 5. Questions the agent should ask you (not us — pre-answered here so the agent doesn't stall)

- Silence threshold: not built in this version — deferred, not tracked yet
- Cross-device resume: not built — single device per session assumed
- Grading: none automated — instructor reviews raw submissions