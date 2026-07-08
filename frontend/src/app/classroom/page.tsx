'use client';

// frontend/src/app/classroom/page.tsx
// Classroom route page.
//
// WHY WE DYNAMICALLY IMPORT THE WORKSPACE:
// WebContainer APIs and terminal modules (xterm) access 'window' and 'navigator' directly.
// Next.js performs Server-Side Rendering (SSR) by default. Dynamic imports with ssr: false
// prevent Next.js from executing these modules on the server, avoiding hydration/compilation crashes.
//
// WHY WE NEED SUSPENSE:
// useSearchParams() requires a Suspense boundary when pre-rendering pages in Next.js App Router.

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw } from 'lucide-react';

const Workspace = dynamic(() => import('@/components/Workspace'), {
  ssr: false,
});

export default function ClassroomPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 gap-4">
          <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
          <span className="text-slate-400 font-medium">Loading Workspace Parameters...</span>
        </div>
      }>
        <Workspace />
      </Suspense>
    </main>
  );
}
