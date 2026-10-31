'use client';

import { useEffect } from 'react';

/** Sends a just-added tester on to Play's opt-in page after a short pause. */
export function AutoForward({ href, delayMs = 2500 }: { href: string; delayMs?: number }) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.location.assign(href), delayMs);
    return () => window.clearTimeout(timer);
  }, [href, delayMs]);
  return null;
}
