/**
 * Durations of the named phases of one operation, in milliseconds. Phases can
 * overlap: `measure` times a promise on its own clock, `mark` closes a phase
 * that began when the previous mark (or the timer) did.
 */
export function createPhaseTimer(now: () => number = Date.now) {
  const startedAt = now();
  let last = startedAt;
  const phases: Record<string, number> = {};
  return {
    mark(name: string) {
      const at = now();
      phases[name] = (phases[name] ?? 0) + (at - last);
      last = at;
    },
    async measure<T>(name: string, work: Promise<T> | (() => Promise<T>)): Promise<T> {
      const began = now();
      try {
        return await (typeof work === 'function' ? work() : work);
      } finally {
        phases[name] = (phases[name] ?? 0) + (now() - began);
      }
    },
    /** Restart the `mark` clock after measured work, without recording a phase. */
    resume() { last = now(); },
    result(): Record<string, number> {
      return { ...phases, totalMs: now() - startedAt };
    },
  };
}
export type PhaseTimer = ReturnType<typeof createPhaseTimer>;
