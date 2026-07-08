// frontend/src/utils/analyzerRules.ts
// Centralized Analyzer Rules Module used consistently across Live and Test environments.

import { Socket } from 'socket.io-client';

export interface AnalyzerContext {
  socket: Socket | null;
  studentId: string;
  classroomId: string;
  isTest: boolean;
}

/**
 * Monitors tab switches using the Page Visibility API.
 * Emits telemetry events to the backend whenever the page becomes hidden.
 */
export function registerTabSwitch(
  ctx: AnalyzerContext,
  onTabSwitch: () => void
) {
  let lastTriggerTime = 0;

  const triggerTabSwitch = () => {
    const now = Date.now();
    if (now - lastTriggerTime < 500) return; // Prevent double-counting concurrent visibility + blur triggers
    lastTriggerTime = now;

    onTabSwitch();
    if (ctx.socket?.connected && ctx.studentId && ctx.classroomId) {
      ctx.socket.emit('mishap:tab_switch', {
        studentId: ctx.studentId,
        classroomId: ctx.classroomId,
        isTest: ctx.isTest,
        timestamp: now
      });
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      triggerTabSwitch();
    }
  };

  const handleWindowBlur = () => {
    triggerTabSwitch();
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('blur', handleWindowBlur);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);
  };
}

/**
 * Intercepts and blocks paste attempts on specific inputs (e.g. editor textareas, reasoning textareas, options inputs).
 * Triggers a warning message and registers a paste mishap log on the backend.
 */
export function registerPasteBlock(
  selector: string,
  ctx: AnalyzerContext,
  onPasteAttempt: () => boolean | void
) {
  const handlePaste = (e: Event) => {
    const target = e.target as HTMLElement;
    // Only intercept if the target matches our specified selector
    if (target && typeof target.matches === 'function' && !target.matches(selector)) {
      return;
    }

    // Call the application callback to check if paste is currently blocked
    const shouldBlock = onPasteAttempt();
    if (shouldBlock === false) return; // Paste is currently allowed

    e.preventDefault();
    e.stopPropagation(); // Immediately stop propagation so Monaco editor cannot bypass it
    
    alert('Pasting content is explicitly disabled during this session.');
    
    if (ctx.socket?.connected && ctx.studentId && ctx.classroomId) {
      ctx.socket.emit('mishap:paste_attempt', {
        studentId: ctx.studentId,
        classroomId: ctx.classroomId,
        isTest: ctx.isTest,
        timestamp: Date.now()
      });
    }
  };

  // Use 'true' for capture phase to intercept the event as it travels DOWN the DOM tree,
  // before the Monaco Editor's internal listeners (which use stopPropagation) can hide it.
  window.addEventListener('paste', handlePaste, true);

  return () => {
    window.removeEventListener('paste', handlePaste, true);
  };
}

/**
 * Tracks student keystrokes to detect inactivity.
 * Emits an inactivity event exactly once per idle period when the threshold is crossed.
 */
export function registerInactivity(
  ctx: AnalyzerContext,
  thresholdMs: number,
  onIdleStateChange: (isIdle: boolean) => void
) {
  let idleTimeout: NodeJS.Timeout | null = null;
  let hasTriggeredIdle = false;

  const resetTimer = () => {
    if (idleTimeout) clearTimeout(idleTimeout);
    
    if (hasTriggeredIdle) {
      hasTriggeredIdle = false;
      onIdleStateChange(false);
    }

    idleTimeout = setTimeout(() => {
      if (!hasTriggeredIdle) {
        hasTriggeredIdle = true;
        onIdleStateChange(true);
        
        if (ctx.socket?.connected && ctx.studentId && ctx.classroomId) {
          ctx.socket.emit('mishap:inactivity', {
            studentId: ctx.studentId,
            classroomId: ctx.classroomId,
            isTest: ctx.isTest,
            timestamp: Date.now()
          });
        }
      }
    }, thresholdMs);
  };

  const handleInteraction = () => {
    resetTimer();
  };

  window.addEventListener('keydown', handleInteraction);
  window.addEventListener('mousemove', handleInteraction);
  resetTimer();

  return () => {
    window.removeEventListener('keydown', handleInteraction);
    window.removeEventListener('mousemove', handleInteraction);
    if (idleTimeout) clearTimeout(idleTimeout);
  };
}
