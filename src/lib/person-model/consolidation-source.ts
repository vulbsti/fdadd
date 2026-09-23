import {
  ConsolidationSourceSchema,
  type ConsolidationSource,
} from './consolidation';

type Row = Record<string, any>;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requestFallback(request: Record<string, unknown>): string | null {
  const encoded = JSON.stringify(request);
  return encoded && encoded !== '{}' ? encoded : null;
}

/**
 * Recover the exact user-authored text carried by a typed change request.
 * The full request remains attached as metadata; this body exists so the
 * existing exact-span verifier can ground observations without inventing a
 * synthetic chat message.
 */
export function personChangeSourceBody(value: unknown): string | null {
  const request = record(value);
  const payload = record(request.payload);
  switch (request.kind) {
    case 'correct_account':
      return nonEmpty(payload.correction) ?? requestFallback(request);
    case 'reject_interpretation':
      return nonEmpty(request.explanation) ?? requestFallback(request);
    case 'add_event': {
      const parts = [nonEmpty(payload.what), nonEmpty(payload.when), nonEmpty(payload.whatChanged)].filter(Boolean);
      return parts.length ? parts.join('\n') : requestFallback(request);
    }
    case 'add_meaning': {
      const parts = [nonEmpty(payload.meaning), nonEmpty(payload.context)].filter(Boolean);
      return parts.length ? parts.join('\n') : requestFallback(request);
    }
    case 'exclude_source':
      return requestFallback(request);
    default:
      return requestFallback(request);
  }
}

export function assembleConsolidationSources(input: {
  sourceRows: Row[];
  messageRows: Row[];
  changeRows: Row[];
  impactRows: Row[];
}): ConsolidationSource[] {
  const messages = new Map(input.messageRows.map((message) => [String(message.id), message]));
  const changes = new Map(input.changeRows.map((change) => [String(change.source_item_id), change]));
  const impacts = new Map<string, string[]>();
  for (const impact of input.impactRows) {
    if (impact.entity_kind !== 'object' || typeof impact.entity_id !== 'string') continue;
    const changeId = String(impact.change_id);
    impacts.set(changeId, [...(impacts.get(changeId) ?? []), impact.entity_id]);
  }

  return input.sourceRows.map((source) => {
    const message = typeof source.source_message_id === 'string'
      ? messages.get(source.source_message_id)
      : undefined;
    const change = changes.get(String(source.id));
    const request = record(change?.request);
    const body = nonEmpty(message?.content) ?? personChangeSourceBody(request)
      ?? (source.inclusion_status === 'included' ? null : '[excluded source]');
    if (!body) throw new Error('Included person source has no owner-scoped message or typed change request.');

    return ConsolidationSourceSchema.parse({
      sourceId: source.id,
      sourceSeq: Number(source.source_seq),
      sourceTime: source.source_time,
      ingestedAt: source.ingested_at,
      sourceKind: ['native_message', 'explicit_correction', 'explicit_exclusion', 'import_item'].includes(source.source_kind)
        ? source.source_kind
        : 'other',
      speaker: source.speaker_role,
      subjectKind: source.subject_kind,
      subjectLabel: source.subject_label ?? null,
      inclusion: source.inclusion_status,
      body,
      change: change ? {
        changeId: change.id,
        changeKind: change.change_kind,
        targetKind: change.target_kind,
        targetId: change.target_id,
        priorVersionId: change.prior_version_id ?? null,
        request,
        invalidatedObjectIds: [...new Set(impacts.get(String(change.id)) ?? [])],
      } : null,
    });
  });
}

export function explicitExclusionObjectIds(sources: ConsolidationSource[]): Set<string> {
  return new Set(sources.flatMap((source) =>
    source.change?.changeKind === 'exclusion' ? source.change.invalidatedObjectIds : []));
}
