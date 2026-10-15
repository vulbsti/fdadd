import { z } from 'zod';

/** A report of one AI reply. At least one of the ids must be given. */
export const ReplyReportSchema = z.object({
  sessionId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  reason: z.enum(['wrong', 'harmful', 'offensive', 'other']),
  note: z.string().trim().max(1000).optional(),
}).strict().refine((report) => Boolean(report.sessionId || report.messageId || report.runId), { message: 'Say which reply this is about.' });
export type ReplyReport = z.infer<typeof ReplyReportSchema>;

/** Generous for a person, tight enough that a script cannot flood the table. */
export const REPORT_LIMITS = [
  { windowMs: 10 * 60 * 1000, max: 10 },
  { windowMs: 24 * 60 * 60 * 1000, max: 50 },
] as const;

/** Whether one more report fits, given the times of this person's reports in the last day. */
export function reportAllowed(recent: string[], now = new Date()): boolean {
  return REPORT_LIMITS.every(({ windowMs, max }) =>
    recent.filter((at) => now.getTime() - Date.parse(at) < windowMs).length < max);
}
