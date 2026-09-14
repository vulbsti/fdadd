/**
 * Durable run-context assembly for the astrologer agent.
 *
 * `loadContextManifest` loads the profile identity, frozen-calculation
 * availability, session checkpoint, a compact non-retired fact index, open
 * hypotheses, up to ten prior-session summaries, and the six most recent
 * user/assistant messages of the CURRENT session (local linguistic
 * continuity only — never memory). Full facts/evidence/prior excerpts are
 * retrieved selectively through `worker_astro_relevant_context`, and every
 * selected/reviewed item is recorded in `astro_run_context_items`.
 */

import type { AgentStore } from './agent-store';
import type { ContextManifest, RelevantContextItem } from './contracts';

export { parseCheckpoint, parsePlan, parseVerification } from './agent-store';

export async function loadContextManifest(
  store: AgentStore,
  runId: string,
): Promise<ContextManifest> {
  return store.loadContextManifest(runId);
}

export interface SelectedContext {
  items: RelevantContextItem[];
  /** Stable selection reason recorded on each context item row. */
  reason: string;
}

/**
 * Selective retrieval through the worker RPC. Blank queries return bounded
 * confirmed/proposed facts plus recent evidence — never all rows.
 */
export async function selectRelevantContext(
  store: AgentStore,
  runId: string,
  query: string,
  options?: {
    kinds?: string[];
    fromDate?: string | null;
    toDate?: string | null;
    limit?: number;
    reason?: string;
  },
): Promise<SelectedContext> {
  const rows = await store.workerRelevantContext({
    runId,
    query,
    kinds: options?.kinds ?? null,
    fromDate: options?.fromDate ?? null,
    toDate: options?.toDate ?? null,
    limit: options?.limit ?? 20,
  });
  const items: RelevantContextItem[] = rows.map((row) => ({
    kind: row.kind as RelevantContextItem['kind'],
    id: row.id,
    rank: Number(row.rank ?? 0),
    title: row.title ?? '',
    excerpt: row.excerpt ?? '',
    confidence: row.confidence == null ? null : Number(row.confidence),
    status: row.status ?? null,
    createdAt: row.created_at,
  }));
  return { items, reason: options?.reason ?? 'worker_astro_relevant_context' };
}

/** Persist every selected/reviewed item so "already reviewed" is queryable. */
export async function recordSelectedContext(
  store: AgentStore,
  runId: string,
  userId: string,
  profileId: string,
  selection: SelectedContext,
  stepKey: string,
): Promise<void> {
  // Session summaries are already in the manifest; the context-items table
  // has no session FK, so coercing their kind would write a session UUID
  // into fact_id and corrupt lineage. Filter them out.
  await store.recordContextItems(
    runId,
    userId,
    profileId,
    selection.items
      .filter((item) => item.kind !== 'session')
      .map((item, index) => ({
        kind: item.kind as 'fact' | 'evidence' | 'hypothesis' | 'event' | 'message',
        id: item.id,
        purpose: 'selected' as const,
        rank: index + 1,
        reason: selection.reason,
        stepKey,
      })),
  );
}
