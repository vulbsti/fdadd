import { describe, expect, it } from 'vitest';
import { reportAllowed, ReplyReportSchema } from './reports';

const id = '0b6f3a52-6a55-4c5e-9d7e-1f7a9c3e2b10';
const now = new Date('2026-10-14T12:00:00Z');
const minutesAgo = (minutes: number, count: number) =>
  Array.from({ length: count }, () => new Date(now.getTime() - minutes * 60_000).toISOString());

describe('reply reports', () => {
  it('needs a reason and at least one reply id', () => {
    expect(ReplyReportSchema.safeParse({ messageId: id, reason: 'harmful', note: ' unsafe advice ' }).data)
      .toEqual({ messageId: id, reason: 'harmful', note: 'unsafe advice' });
    expect(ReplyReportSchema.safeParse({ reason: 'wrong' }).success).toBe(false);
    expect(ReplyReportSchema.safeParse({ runId: id, reason: 'rude' }).success).toBe(false);
    expect(ReplyReportSchema.safeParse({ runId: id, reason: 'other', note: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('limits bursts and daily volume', () => {
    expect(reportAllowed([], now)).toBe(true);
    expect(reportAllowed(minutesAgo(1, 9), now)).toBe(true);
    expect(reportAllowed(minutesAgo(1, 10), now)).toBe(false);
    expect(reportAllowed(minutesAgo(30, 10), now)).toBe(true);
    expect(reportAllowed(minutesAgo(120, 50), now)).toBe(false);
  });
});
