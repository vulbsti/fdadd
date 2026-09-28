/**
 * Durable session reflection. One run per ended conversation: claim it, ask
 * the model whether the conversation refines or breaks the theory of mind,
 * and record a new revision only if it does. Duplicate starts are harmless:
 * the claim and the expected-revision fence make the effect happen once.
 */
import { FatalError } from 'workflow';
import { ZodError } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { decideReflection, loadReflectionInput, type ReflectionClaim, type ReflectionDecision } from '@/lib/astro/theory-of-mind';

async function claimReflection(sessionId: string, idleMinutes: number): Promise<ReflectionClaim | null> {
  'use step';
  const result = await createAdminClient().rpc('claim_session_reflection', { p_session_id: sessionId, p_idle: `${idleMinutes} minutes` });
  if (result.error) throw new Error(`Reflection claim failed (${result.error.code ?? 'database'}).`);
  return (result.data ?? null) as ReflectionClaim | null;
}

async function reflect(claim: ReflectionClaim) {
  'use step';
  const input = await loadReflectionInput(createAdminClient(), claim);
  let decision: ReflectionDecision;
  try {
    decision = await decideReflection(input);
  } catch (error) {
    // A malformed decision will not improve on retry of the same prompt.
    if (error instanceof ZodError || error instanceof SyntaxError) throw new FatalError('Reflection returned an invalid decision.');
    throw error;
  }
  return { decision, expectedRevision: input.expectedRevision, privacyEpoch: input.privacyEpoch };
}

async function finish(claim: ReflectionClaim, outcome: Awaited<ReturnType<typeof reflect>>) {
  'use step';
  const revised = outcome.decision.decision === 'revise' ? outcome.decision : null;
  const result = await createAdminClient().rpc('finish_session_reflection', {
    p_session_id: claim.sessionId, p_through: claim.through, p_expected_revision: outcome.expectedRevision,
    p_content: revised?.theory ?? null, p_change_summary: revised?.changes ?? null, p_privacy_epoch: outcome.privacyEpoch,
  });
  // Another conversation's reflection revised the theory first: reflect again on the new one.
  if (result.error?.code === 'ASV01') return { conflict: true as const };
  if (result.error) throw new Error(`Reflection could not be recorded (${result.error.code ?? 'database'}).`);
  return { conflict: false as const, revised: Boolean(revised), revision: (result.data as { revision: number }).revision };
}

export async function theoryOfMindReflectionWorkflow(sessionId: string, idleMinutes: number) {
  'use workflow';
  const claim = await claimReflection(sessionId, idleMinutes);
  if (!claim) return { status: 'skipped' as const };
  for (let attempt = 0; attempt < 3; attempt++) {
    const recorded = await finish(claim, await reflect(claim));
    if (!recorded.conflict) return { status: 'complete' as const, revised: recorded.revised, revision: recorded.revision };
  }
  throw new FatalError('The theory of mind kept changing during reflection; the session stays unreflected for the next sweep.');
}
