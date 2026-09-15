'use client';

import { useEffect, useState } from 'react';

/**
 * IntroVeil — a brief "charting course" overlay that lifts once the hero
 * scene reports its first rendered frame (or after a hard timeout, so a
 * WebGL failure can never trap the page behind the veil).
 */
export default function IntroVeil({ lifted }: { lifted: boolean }) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), 2600);
    return () => window.clearTimeout(t);
  }, []);

  // Keep mounted through the fade so the CSS animation owns the exit.
  const isLifted = lifted || timedOut;
  return (
    <div
      aria-hidden="true"
      className={`intro-veil fixed inset-0 z-[100] flex flex-col items-center justify-center bg-voyage ${
        isLifted ? 'is-lifted pointer-events-none' : ''
      }`}
    >
      <p className="rise-in text-xs font-semibold uppercase tracking-[0.5em] text-gold-bright">
        Aidoraa
      </p>
      <p className="rise-in rise-in-d2 mt-4 text-[10px] uppercase tracking-[0.3em] text-voyage-foreground/60">
        Charting your course
      </p>
      <div className="rise-in rise-in-d2 mt-6 h-px w-24 overflow-hidden bg-white/10">
        <div className="h-full w-full origin-left animate-pulse bg-gold-bright/70" />
      </div>
    </div>
  );
}
