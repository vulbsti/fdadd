/** Test seam for the private UTC-midnight helper in agent-tools. */

export function nextUtcMidnightForTest(now: Date): string {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return next.toISOString();
}
