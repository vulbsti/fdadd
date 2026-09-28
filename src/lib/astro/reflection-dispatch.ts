/**
 * Start session reflections. A conversation has ended when the person starts
 * or writes in another conversation for the same profile (it reflects at
 * once), or when it has been quiet for 30 minutes (the scheduled sweep).
 */
import { start } from 'workflow/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { theoryOfMindReflectionWorkflow } from '@/workflows/theory-of-mind-reflection';

export const IDLE_MINUTES = 30;

async function pending(options: { idleMinutes: number; limit: number; profileId?: string; exceptSessionId?: string }) {
  const result = await createAdminClient().rpc('sessions_needing_reflection', {
    p_idle: `${options.idleMinutes} minutes`, p_limit: options.limit,
    p_profile_id: options.profileId ?? null, p_except_session_id: options.exceptSessionId ?? null,
  });
  if (result.error) throw new Error(`Reflection lookup failed (${result.error.code ?? 'database'}).`);
  return ((result.data ?? []) as Array<{ session_id: string }>).map((row) => row.session_id);
}

/** Reflect the profile's other conversations: the person has moved on from them. */
export async function reflectOtherSessionsBestEffort(scope: { profileId: string; currentSessionId?: string }) {
  try {
    const sessions = await pending({ idleMinutes: 0, limit: 10, profileId: scope.profileId, exceptSessionId: scope.currentSessionId });
    for (const sessionId of sessions) await start(theoryOfMindReflectionWorkflow, [sessionId, 0]);
    return sessions.length;
  } catch (error) {
    console.error('[reflection-dispatch] start failed', { message: error instanceof Error ? error.message : 'unknown' });
    return 0;
  }
}

/** Scheduled sweep: conversations quiet for the idle period. */
export async function sweepIdleReflections(limit = 25) {
  const sessions = await pending({ idleMinutes: IDLE_MINUTES, limit });
  for (const sessionId of sessions) await start(theoryOfMindReflectionWorkflow, [sessionId, IDLE_MINUTES]);
  return { started: sessions.length };
}
