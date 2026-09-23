import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ObjectProjection, PersonProjection, ProjectionMeta, SourceEvidence, ViewEdge, ViewNode } from '@/components/astrologer-v2/types';
import { parsePersonReadProjection, type PersonReadProjection } from '@/lib/person-model/projection-contract';

type Row = Record<string, unknown>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const candidate = text(value);
  return candidate && allowed.includes(candidate as T) ? candidate as T : fallback;
}

function summaryFor(kind: string, payload: Record<string, unknown>): string | null {
  const keys: Record<string, string[]> = {
    episode: ['event', 'reportedExperience', 'unresolvedInterpretation'],
    meaning_change: ['laterMeaning', 'challengingExperience', 'priorMeaning'],
    pattern: ['reportedConsequence', 'response', 'triggerOrContext'],
    influence: ['experiencedInfluence', 'entityAsDescribed'],
    goal: ['statedOutcome', 'underlyingValue'],
    issue: ['presentRelevance'],
    current_state: ['summary'],
    gap: ['candidateQuestion', 'distinction', 'whyItMatters'],
    scenario: ['possibleDevelopment', 'uncertainty'],
    chapter: ['theme'],
  };
  for (const key of keys[kind] ?? []) {
    const candidate = text(payload[key]);
    if (candidate) return candidate;
  }
  return null;
}

function dateLabel(row: Row, payload: Record<string, unknown>): string | null {
  const occurred = record(payload.occurred ?? payload.effectivePeriod ?? payload.timeframe ?? payload.horizon);
  if (typeof occurred.age === 'number') return `Age ${occurred.age}`;
  const note = text(occurred.note);
  if (note) return note;
  const start = text(occurred.start) ?? text(row.effective_from);
  if (start) return /^\d{4}/.test(start) ? start.slice(0, 4) : start;
  return null;
}

function nodeFromRow(row: Row): ViewNode {
  const payload = record(row.typed_payload);
  const kind = String(row.kind ?? 'unknown');
  return {
    id: String(row.object_id),
    kind,
    title: text(payload.title) ?? 'Untitled account',
    summary: summaryFor(kind, payload),
    dateLabel: dateLabel(row, payload),
    payload,
    lifecycle: text(row.lifecycle) ?? 'active',
    epistemicClass: text(row.epistemic_class) as ViewNode['epistemicClass'],
  };
}

function sourceEvidenceFromRow(input: unknown): SourceEvidence | null {
  const row = record(input);
  const sourceId = text(row.source_id) ?? text(row.sourceId);
  if (!sourceId) return null;
  return {
    supportId: text(row.support_id) ?? text(row.supportId),
    observationId: text(row.observation_id) ?? text(row.observationId),
    sourceId,
    sourceSeq: Number(row.source_seq ?? row.sourceSeq ?? 0),
    sourceTime: text(row.source_time) ?? text(row.sourceTime),
    speaker: oneOf(row.speaker_role ?? row.speakerRole, ['user', 'assistant', 'tool', 'system', 'unknown'] as const, 'unknown'),
    subjectKind: oneOf(row.subject_kind ?? row.subjectKind, ['self', 'other', 'hypothetical', 'unknown'] as const, 'unknown'),
    relation: oneOf(row.relation ?? row.supportRelation, ['supports', 'contradicts', 'qualifies', 'unclassified'] as const, 'unclassified'),
    assertionType: oneOf(row.assertion_type ?? row.assertionType, ['direct', 'derived', 'reported_interpretation', 'assistant_hypothesis', 'unknown'] as const, 'unknown'),
    exactQuote: text(row.exact_quote) ?? text(row.quote),
  };
}

function edgeFromRow(row: Row): ViewEdge {
  const payload = record(row.typed_payload);
  return {
    id: String(row.relation_id),
    kind: String(row.relation_kind),
    fromId: String(row.from_object_id),
    toId: String(row.to_object_id),
    label: text(payload.label) ?? text(payload.rationale),
  };
}

interface RawProjection extends ProjectionMeta, Omit<PersonReadProjection, keyof ProjectionMeta> {}

async function exactProjection(
  client: SupabaseClient,
  personId: string,
  view: PersonProjection['view'] | 'object',
  objectId?: string,
): Promise<RawProjection> {
  const { data, error } = await client.rpc('person_read_projection', {
    p_profile_id: personId,
    p_view: view,
    p_object_id: objectId ?? null,
  });
  if (error) throw error;
  return parsePersonReadProjection(data);
}

export async function readPersonProjection(
  client: SupabaseClient,
  personId: string,
  view: PersonProjection['view'],
): Promise<PersonProjection> {
  const projection = await exactProjection(client, personId, view);
  const copy = {
    'life-map': ['The life behind your choices', 'Follow the moments that changed what mattered to you.'],
    patterns: ['How you think', 'Working patterns, conditions, and exceptions.'],
    people: ['People & influences', 'Relationships shown through experiences you reported.'],
    paths: ['Paths ahead', 'Possible directions, not predictions.'],
  } as const;
  return {
    personId: projection.personId,
    personRevision: projection.personRevision,
    sourceWatermark: projection.sourceWatermark,
    mode: projection.mode,
    modeEpoch: projection.modeEpoch,
    privacyEpoch: projection.privacyEpoch,
    generatedAt: projection.generatedAt,
    updateState: projection.updateState,
    view,
    title: copy[view][0],
    subtitle: copy[view][1],
    nodes: projection.objects.map(nodeFromRow),
    edges: projection.relations.map(edgeFromRow),
  };
}

export async function readObjectProjection(
  client: SupabaseClient,
  personId: string,
  objectId: string,
): Promise<ObjectProjection | null> {
  const [projection, sourceResult] = await Promise.all([
    exactProjection(client, personId, 'object', objectId),
    client.rpc('person_read_object_sources', {
      p_profile_id: personId,
      p_object_id: objectId,
    }),
  ]);
  if (sourceResult.error) throw sourceResult.error;
  const object = projection.objects.find((item) => String(item.object_id) === objectId);
  if (!object) return null;
  const edges = projection.relations.map(edgeFromRow);
  return {
    personId: projection.personId,
    personRevision: projection.personRevision,
    sourceWatermark: projection.sourceWatermark,
    mode: projection.mode,
    modeEpoch: projection.modeEpoch,
    privacyEpoch: projection.privacyEpoch,
    generatedAt: projection.generatedAt,
    updateState: projection.updateState,
    view: 'object',
    object: nodeFromRow(object),
    related: projection.objects.filter((item) => String(item.object_id) !== objectId).map(nodeFromRow),
    edges,
    supportCount: projection.supportCount,
    sources: (Array.isArray(sourceResult.data)
      ? sourceResult.data
      : Array.isArray(record(sourceResult.data).sources)
        ? record(sourceResult.data).sources as unknown[]
        : [])
      .map(sourceEvidenceFromRow)
      .filter((item): item is SourceEvidence => item !== null),
  };
}
