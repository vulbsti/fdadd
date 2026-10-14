import { NextResponse } from 'next/server';
import { appError, appFailure, appJson, requireAppUser } from '@/lib/app/http';
import { reportAllowed, ReplyReportSchema } from '@/lib/app/reports';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * Report an AI reply as wrong, harmful or offensive. Works from the app
 * (Bearer) and the website (cookie). The ids must be the person's own; the
 * report is written with their own client, which can add but never read.
 */
export async function POST(request: Request) {
  const context = await requireAppUser(request);
  if (context instanceof NextResponse) return context;
  const parsed = ReplyReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return appError(400, 'invalid_request', 'Choose a reason and the reply you are reporting.');
  const { client, userId } = context;
  const report = parsed.data;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = await createAdminClient().from('ai_reply_reports').select('created_at')
      .eq('user_id', userId).gte('created_at', since).order('created_at', { ascending: false }).limit(60);
    if (recent.error) throw recent.error;
    if (!reportAllowed((recent.data ?? []).map((row) => String(row.created_at)))) {
      return appError(429, 'rate_limited', 'Thanks, we have your reports. Please wait a little before sending more.');
    }
    // Row level security only shows the person's own conversations, messages and runs.
    const checks = await Promise.all([
      report.sessionId ? client.from('astro_sessions').select('id').eq('id', report.sessionId).maybeSingle() : null,
      report.messageId ? client.from('astro_messages').select('id').eq('id', report.messageId).maybeSingle() : null,
      report.runId ? client.from('astro_agent_runs').select('id').eq('id', report.runId).maybeSingle() : null,
    ]);
    for (const check of checks) {
      if (check?.error) throw check.error;
      if (check && !check.data) return appError(404, 'not_found', 'That reply was not found.');
    }
    const saved = await client.from('ai_reply_reports').insert({
      user_id: userId, session_id: report.sessionId ?? null, message_id: report.messageId ?? null,
      run_id: report.runId ?? null, reason: report.reason, note: report.note || null,
    });
    if (saved.error) throw saved.error;
    return appJson({ ok: true });
  } catch (error) {
    return appFailure('reply report', error, 'Your report could not be sent. Please try again.');
  }
}
