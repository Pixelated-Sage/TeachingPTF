Prioritized test readiness, deferred advanced features, simplified communication approachPrioritized test readiness, deferred advanced features, simplified communication approachGot it — simpler wording from here.
First: what tomorrow actually needs
You said it clearly — don't want extra work now, only what's needed for tomorrow's test. Here's the real short list:
Must work tomorrow:

OTP must actually reach real email. Right now it only shows in console, not sent. This blocks everyone from registering. This has to be fixed today.
Multiple students logging in at the same time should not break or clash. We haven't tested this yet with more than one person.
Classroom join, coding, submit — already working, keep as is.

Not needed for tomorrow, can wait:

Password hashing method (SHA-256 is fine to leave for now, fix later)
Session token never expiring (fine for now)
Admin panel (you're right — finish student side first)

So really: fix OTP email sending today, and test with a few people at once before class. That's it. Everything else can wait.

Second: your terminal + browser preview idea
This is a good idea and yes, it can be built. Let me explain simply what's possible.
Multiple terminals — yes, possible. WebContainer can run more than one terminal at once. One for frontend, one for backend, later when you teach Node. Not needed for tomorrow (React-only test), but good to plan for later.
Terminal at the bottom, output only for now — yes, easy. Later you can allow typing commands directly (like npm install) instead of it running automatically.
Browser preview on the right side, bigger space with a toggle arrow — yes, this works well. Same idea as your notes toggle on the left.
Only localhost links allowed in that preview — yes, we can check the link before loading it, and only allow it if it looks like a real localhost/webcontainer preview link. This stops someone pasting a random website there.
Auto-opening the preview vs. manually pasting the link — your instinct is right. Auto-opening feels like magic and hides how things really work. Manually copying the link (like a real developer does) is better for learning. Keep it manual.
This whole terminal + preview upgrade is a good next feature, not something needed for tomorrow. I'd say: ship tomorrow's test with what you have now (once OTP is fixed), then build this terminal/preview upgrade after, calmly, with time to test it properly.
One question for you: for tomorrow, is it just you and maybe a few students testing, or all 60 real students logging in together for the first time?This is a good idea and yes, it can be built. Let me explain simply what's possible.
Multiple terminals — yes, possible. WebContainer can run more than one terminal at once. One for frontend, one for backend, later when you teach Node. Not needed for tomorrow (React-only test), but good to plan for later.
Terminal at the bottom, output only for now — yes, easy. Later you can allow typing commands directly (like npm install) instead of it running automatically.
Browser preview on the right side, bigger space with a toggle arrow — yes, this works well. Same idea as your notes toggle on the left.
Only localhost links allowed in that preview — yes, we can check the link before loading it, and only allow it if it looks like a real localhost/webcontainer preview link. This stops someone pasting a random website there.
Auto-opening the preview vs. manually pasting the link — your instinct is right. Auto-opening feels like magic and hides how things really work. Manually copying the link (like a real developer does) is better for learning. Keep it manual.
This whole terminal + preview upgrade is a good next feature, not something needed for tomorrow. I'd say: ship tomorrow's test with what you have now (once OTP is fixed), then build this terminal/preview upgrade after, calmly, with time to test it properly.otp is fixed also the whole file management system i want toooShow moreOTP fixed is good news, but "whole file management system" for tomorrow needs a clear line — this can mean two very different things, and only one is realistic before a live test.
Small version (doable, safe for tomorrow): what you already have — save code to localStorage so it survives a reload, restore it when they come back. This is basically done already.
Big version (real file system): students create multiple files/folders themselves, like a real project — App.jsx, components/, utils.js, etc., with a file tree they build themselves. This is a bigger feature. WebContainer can support it technically, but building a proper file-tree UI (create file, delete file, rename, nested folders) is real new work, not a small addition.
Which one do you actually mean for tomorrow — just "don't lose my code on reload" (already handled), or "let students make their own files and folders" (new, bigger build)?do all the features mention make the agent prompt to do itOrchestrated comprehensive feature integration into agent handoff promptOrchestrated comprehensive feature integration into agent handoff promptDefaulting to the big version (real file tree — create/delete/rename files and folders) since you said "whole file management system," not just "don't lose my code" — flagging that assumption clearly in the prompt so the agent doesn't undersize it, and so you can correct me if you actually meant the small version.Created a file, read a fileCreated a file, read a file❓ One thing to confirm before you hand this off: I put the concurrency test as Priority 0, ahead of the file system and terminal features — because if login/join breaks under 60 real students tomorrow, none of the other features matter that day. If you'd rather your agent build the new features first and test concurrency separately/later, say so now — otherwise it'll do the test first per this doc.Agent prompt features batch2Document · MD WebContainers run a virtual Node.js operating system entirely in the browser's temporary memory (RAM), which is completely wiped every time the browser reloads.
[Certain] Because the WebContainer filesystem is ephemeral, refreshing the page destroys the WebAssembly context and boots a clean instance from scratch.
You must re-run npm install on every reload because:
5MB LocalStorage Limit: We persist your source files (which are small text files) to localStorage to recover them on reload. However, node_modules is hundreds of megabytes in size and contains tens of thousands of files, which exceeds browser storage limits by a factor of 100.
Browser NPM Caching: While the virtual directory is wiped, the @webcontainer/api internally caches the downloaded npm package tarballs in the browser's Cache Storage. This is why subsequent npm install runs are extremely fast (taking only a few seconds) compared to the first run.how we gonna handle this bro 
if i am having a folder structure then how i gonna handle thisShow moreValidated localStorage strategy for persisting folder structures recursivelyValidated localStorage strategy for persisting folder structures recursivelyThis actually doesn't change your plan — it confirms it. Your source files, even in a full folder structure, are still just text (a few KB total even with dozens of files). The 5MB localStorage limit is a non-issue for that. What's expensive is node_modules, and you were never planning to save that — WebContainer already caches those package downloads separately in the browser's Cache Storage, automatically, no work needed from you. That's why the second npm install is fast (~seconds) even though it still technically "runs" every reload.
So the real handling is exactly what Feature 1 already describes, just make sure the save/restore logic works on the whole tree, not one file:
On save (every file change, or on a debounce):

Walk the whole file tree (folders + files), save it as one structured object in localStorage — e.g. { "App.jsx": "...", "components/Button.jsx": "...", "utils/helpers.js": "..." } — keyed by classroomId+topic. This whole thing is still tiny, easily under localStorage limits even for a real multi-file project.

On reload/boot:

WebContainer boots fresh (expected, unavoidable — RAM-based, always wipes)
Read the saved file-tree object from localStorage
Recreate the folder structure and write each file back into the fresh WebContainer instance (webcontainer.mount() can take a nested object matching your folder structure directly — this is actually built for exactly this use case)
Run npm install — this is fast because the package tarballs are already cached in Cache Storage from before, even though the virtual filesystem itself is new

What to tell students, so this isn't confusing to them: every reload is a fresh environment booting, same as if you restarted your laptop — but your code is safe because it's saved separately and reloaded in. The "wait for npm install" they see each time is normal, not a bug, and it gets faster after the first run because the packages are cached.
One thing to add to your agent's task: mount() accepts a nested file/folder tree object natively, so reconstructing your saved localStorage object into that same nested shape and passing it directly to mount() is the correct, low-effort way to do this — no need to manually recreate folders one by one via API calls.can we use system storage or anything else which can work faster instead of stow npm i every time 
??Thought for 5sThought for 5sWorth checking if WebContainers has a snapshot/export feature that goes further than what's already automatic — let me verify rather than guess.Weighed caching solutions and deemed npm's native approach most practicalWeighed caching solutions and deemed npm's native approach most practicalFound it — there is a real option beyond what's automatic, but it's meaningfully more work, not a quick swap.
What already happens automatically (no work needed): [Certain] WebContainer's package downloads are cached in browser Cache Storage — this is why the second npm install takes seconds instead of the first-time full download. You already get this for free.
What's actually possible beyond that: [Certain] The WebContainer API has an export() method (format: 'binary' | 'zip' | 'json') that can snapshot the full current state of the container — including node_modules, not just your source files. Paired with mount() accepting that same binary snapshot back in, this could theoretically let you save the entire installed environment after first install, store it in IndexedDB (not localStorage — IndexedDB's storage ceiling is far higher, typically hundreds of MB+, enough for a real node_modules folder), and restore it on reload — potentially skipping npm install entirely on subsequent boots, not just speeding it up.
Why I wouldn't build this for tomorrow's test: [Likely] This is real added engineering — binary snapshot export/import, IndexedDB read/write for large blobs, and handling what happens when the snapshot goes stale (e.g., a student changes package.json and adds a new dependency — the old snapshot no longer matches). It's a genuine option for later, once the platform is stable and you're optimizing speed for a recurring cohort, not something to add under time pressure now.