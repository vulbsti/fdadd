import 'server-only';

import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ConsolidationSourceSchema,
  CountercontextItemSchema,
  ExistingObjectContextSchema,
  ExistingRelationContextSchema,
  PersonVerifierReceiptSchema,
  type ConsolidationSnapshot,
  type ConsolidationSource,
  type CountercontextItem,
  type ExistingObjectContext,
  type ExistingRelationContext,
  type MaterializedConsolidationCandidate,
} from './consolidation';
import { TimeRangeSchema } from './contracts';

export interface PersonJobClaim {
  jobId: string;
  leaseToken: string;
  fence: number;
  profileId: string;
  userId: string;
  baseRevision: number;
  privacyEpoch: number;
  modeEpoch: number;
  sourceFromSeq: number;
  sourceToSeq: number;
}

export interface PersonConsolidationContext {
  claim: PersonJobClaim;
  sources: ConsolidationSource[];
  includedSources: ConsolidationSource[];
  countercontext: CountercontextItem[];
  snapshot: ConsolidationSnapshot;
}

type Row = Record<string, any>;

function row(value: unknown): Row {
  return value !== null && typeof value === 'object' ? value as Row : {};
}

function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new Error('database returned an invalid row list');
  return value.map(row);
}

function must<T>(result: { data: T | null; error: { code?: string; message?: string } | null }): T {
  if (result.error) {
    const error = new Error(`Person consolidation storage failed (${result.error.code ?? 'unknown'}).`);
    (error as Error & { databaseCode?: string }).databaseCode = result.error.code;
    throw error;
  }
  if (result.data === null) throw new Error('Person consolidation storage returned no data.');
  return result.data;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error('Person consolidation storage returned an invalid number.');
  return result;
}

function range(value: unknown) {
  const input = row(value);
  return TimeRangeSchema.parse({
    precision: input.precision ?? 'unknown',
    start: input.start ?? null,
    end: input.end ?? null,
    age: input.age ?? null,
    note: input.note ?? null,
  });
}

export class PersonConsolidationStore {
  private readonly admin = createAdminClient();

  async claimJob(jobId: string): Promise<PersonJobClaim | null> {
    const claimed = row(must(await this.admin.rpc('person_claim_job', {
      p_job_id: jobId,
      p_lease_seconds: 300,
    })));
    if (claimed.claimed !== true) return null;
    const claim: PersonJobClaim = {
      jobId: text(claimed.jobId),
      leaseToken: text(claimed.leaseToken),
      userId: '',
      fence: asNumber(claimed.fence),
      profileId: text(claimed.profileId),
      baseRevision: asNumber(claimed.baseRevision),
      privacyEpoch: asNumber(claimed.privacyEpoch),
      modeEpoch: asNumber(claimed.modeEpoch),
      sourceFromSeq: asNumber(claimed.sourceFromSeq),
      sourceToSeq: asNumber(claimed.sourceToSeq),
    };
    const job = row(must(await this.admin.from('person_jobs').select('user_id,profile_id,state,lease_token,fence')
      .eq('id', claim.jobId).eq('profile_id', claim.profileId).single()));
    if (job.state !== 'leased' || job.lease_token !== claim.leaseToken || asNumber(job.fence) !== claim.fence) {
      throw new Error('Person consolidation claim was superseded before context loading.');
    }
    claim.userId = text(job.user_id);
    if (!claim.userId || job.profile_id !== claim.profileId) throw new Error('Person consolidation owner scope is invalid.');
    return claim;
  }

  async renew(claim: PersonJobClaim): Promise<void> {
    must(await this.admin.rpc('person_renew_job_lease', {
      p_job_id: claim.jobId, p_lease_token: claim.leaseToken, p_fence: claim.fence, p_lease_seconds: 300,
    }));
  }

  async assertFresh(claim: PersonJobClaim): Promise<void> {
    const [headResult, preferenceResult, jobResult] = await Promise.all([
      this.admin.from('person_model_heads').select('current_revision,privacy_epoch').eq('user_id', claim.userId).eq('profile_id', claim.profileId).single(),
      this.admin.from('person_preferences').select('mode_epoch').eq('user_id', claim.userId).eq('profile_id', claim.profileId).single(),
      this.admin.from('person_jobs').select('state,lease_token,fence').eq('id', claim.jobId).eq('user_id', claim.userId).eq('profile_id', claim.profileId).single(),
    ]);
    const head = row(must(headResult));
    const preferences = row(must(preferenceResult));
    const job = row(must(jobResult));
    if (asNumber(head.current_revision) !== claim.baseRevision || asNumber(head.privacy_epoch) !== claim.privacyEpoch
      || asNumber(preferences.mode_epoch) !== claim.modeEpoch || job.state !== 'running'
      || job.lease_token !== claim.leaseToken || asNumber(job.fence) !== claim.fence) {
      throw new Error('Person consolidation freshness or lease fence changed.');
    }
  }

  async recordStage(claim: PersonJobClaim, input: {
    stageKey: string; stage: string; state: string; provider?: string | null; model?: string | null;
    metrics?: Record<string, number>; safeSummary?: string; errorCode?: string | null; outputPayloadId?: string | null;
  }): Promise<string> {
    return text(must(await this.admin.rpc('person_record_stage_receipt', {
      p_job_id: claim.jobId,
      p_lease_token: claim.leaseToken,
      p_fence: claim.fence,
      p_stage_key: input.stageKey,
      p_stage: input.stage,
      p_chunk_key: 'job',
      p_state: input.state,
      p_input_payload_id: null,
      p_output_payload_id: input.outputPayloadId ?? null,
      p_provider: input.provider ?? null,
      p_model: input.model ?? null,
      p_guidance_version: 'person-consolidation-2026-09-22.v1',
      p_model_policy_version: 'person-consolidation-bounded.v1',
      p_metrics: input.metrics ?? {},
      p_safe_summary: (input.safeSummary ?? '').slice(0, 1000),
      p_error_code: input.errorCode ?? null,
    })));
  }

  stageCheckpointKey(claim: PersonJobClaim, stageKey: string): string {
    return `p3:${claim.baseRevision}:${claim.privacyEpoch}:${claim.modeEpoch}:${stageKey}`;
  }

  async loadStageCheckpoint(claim: PersonJobClaim, payloadKey: string): Promise<{
    id: string;
    value: unknown;
    metadata: { provider: string | null; model: string | null };
  } | null> {
    const result = await this.admin.from('person_run_payloads')
      .select('id,payload')
      .eq('job_id', claim.jobId).eq('user_id', claim.userId).eq('profile_id', claim.profileId)
      .eq('payload_key', payloadKey).maybeSingle();
    if (result.error) must(result);
    const data = result.data;
    if (!data) return null;
    const payload = row(row(data).payload);
    return {
      id: text(row(data).id),
      value: payload.value,
      metadata: {
        provider: typeof payload.provider === 'string' ? payload.provider : null,
        model: typeof payload.model === 'string' ? payload.model : null,
      },
    };
  }

  async saveStageCheckpoint(
    claim: PersonJobClaim,
    payloadKey: string,
    value: unknown,
    metadata: { provider: string | null; model: string | null },
  ): Promise<string> {
    const existing = await this.loadStageCheckpoint(claim, payloadKey);
    if (existing) return existing.id;
    const result = await this.admin.from('person_run_payloads').insert({
      user_id: claim.userId,
      profile_id: claim.profileId,
      job_id: claim.jobId,
      astro_run_id: null,
      payload_key: payloadKey,
      payload_kind: 'checkpoint',
      schema_version: 'p3-stage-output.v1',
      payload: { value, provider: metadata.provider, model: metadata.model },
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
    }).select('id').single();
    if (!result.error && result.data) return text(row(result.data).id);
    if (result.error?.code === '23505') {
      const raced = await this.loadStageCheckpoint(claim, payloadKey);
      if (raced) return raced.id;
    }
    must(result);
    throw new Error('Person consolidation stage checkpoint was not saved.');
  }

  async recordOutcomes(claim: PersonJobClaim, outcomes: Array<{ sourceId: string; outcome: string; code?: string | null }>): Promise<void> {
    must(await this.admin.rpc('person_record_source_outcomes', {
      p_job_id: claim.jobId,
      p_lease_token: claim.leaseToken,
      p_fence: claim.fence,
      p_outcomes: outcomes.map((outcome) => ({
        sourceId: outcome.sourceId,
        outcome: outcome.outcome,
        outcomeCode: outcome.code ?? null,
        findingRefs: [],
      })),
    }));
  }

  async stageCandidate(claim: PersonJobClaim, candidate: MaterializedConsolidationCandidate): Promise<string> {
    const priorResult = await this.admin.from('person_consolidation_candidates')
      .select('id,payload').eq('job_id', claim.jobId).eq('user_id', claim.userId)
      .eq('profile_id', claim.profileId).eq('fence', claim.fence).order('created_at', { ascending: false }).limit(20);
    const priorRows = rows(must(priorResult));
    const canonical = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
      if (value && typeof value === 'object') {
        return `{${Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
      }
      return JSON.stringify(value);
    };
    const existing = priorRows.find((item) => canonical(item.payload) === canonical(candidate));
    if (existing) return text(existing.id);
    const verifierReceipt = PersonVerifierReceiptSchema.parse(candidate.publication.verifierReceipt);
    return text(must(await this.admin.rpc('person_stage_consolidation_candidate', {
      p_job_id: claim.jobId,
      p_lease_token: claim.leaseToken,
      p_fence: claim.fence,
      p_candidate: candidate,
      p_findings: verifierReceipt.findings
        .filter((finding) => finding.severity !== 'blocking'
          || verifierReceipt.acceptedItemKeys.includes(finding.itemKey))
        .map((finding) => ({
        fieldPath: finding.fieldPath,
        code: finding.code,
        severity: finding.severity === 'blocking' ? 'blocking' : 'warning',
        decision: finding.severity === 'blocking' ? 'reject' : finding.severity === 'qualify' ? 'qualify' : 'accept',
        sourceRefs: finding.sourceIds,
        rationale: finding.explanation,
      })),
    })));
  }

  async publish(claim: PersonJobClaim, candidateId: string, commitId: string): Promise<unknown> {
    return must(await this.admin.rpc('person_publish_staged_candidate', {
      p_job_id: claim.jobId,
      p_lease_token: claim.leaseToken,
      p_fence: claim.fence,
      p_candidate_id: candidateId,
      p_commit_id: commitId,
    }));
  }

  async rebase(claim: PersonJobClaim): Promise<unknown> {
    return must(await this.admin.rpc('person_rebase_job', {
      p_job_id: claim.jobId, p_lease_token: claim.leaseToken, p_fence: claim.fence,
    }));
  }

  async fail(claim: PersonJobClaim, stage: string, error: unknown): Promise<void> {
    const rawCode = error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code : 'consolidation_failed';
    const code = /^[a-z0-9_.-]{1,80}$/i.test(rawCode) ? rawCode : 'consolidation_failed';
    const dbCode = error instanceof Error && 'databaseCode' in error && typeof error.databaseCode === 'string'
      ? error.databaseCode.slice(0, 20) : null;
    const status = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : null;
    const failureKind = code === 'malformed_stage_output' ? 'malformed_output'
      : code === 'verification_exhausted' ? 'verification_exhausted'
        : status === 429 ? 'quota'
          : status === 408 || status === 504 ? 'timeout'
            : status !== null ? 'provider'
              : dbCode ? 'database' : 'unknown';
    must(await this.admin.rpc('person_fail_or_retry_job', {
      p_job_id: claim.jobId,
      p_lease_token: claim.leaseToken,
      p_fence: claim.fence,
      p_stage: stage,
      p_failure_kind: failureKind,
      p_retryable: true,
      p_needs_clarification: false,
      p_error_code: code,
      p_safe_message: 'Your shared information could not be consolidated yet. It is still saved; retry later.',
      p_diagnostic: { databaseCode: dbCode, providerStatus: status },
    }));
  }

  async claimOutbox(): Promise<Row | null> {
    const item = row(must(await this.admin.rpc('person_claim_outbox', { p_lease_seconds: 90 })));
    return item.claimed === true ? item : null;
  }

  async listPendingJobIds(limit = 10): Promise<string[]> {
    const now = new Date().toISOString();
    // Outbox-started workflows are asynchronous. Give the normal dispatcher a
    // minute to claim before treating a pending job as orphaned; otherwise the
    // same sweep would start every fresh job twice.
    const orphanCutoff = new Date(Date.now() - 60_000).toISOString();
    const bounded = Math.min(Math.max(limit, 1), 25);
    const [pendingResult, expiredResult] = await Promise.all([
      this.admin.from('person_jobs').select('id,attempt_count,max_attempts')
        .eq('state', 'pending').lte('available_at', now).lte('updated_at', orphanCutoff)
        .order('available_at', { ascending: true }).limit(bounded),
      this.admin.from('person_jobs').select('id,attempt_count,max_attempts')
        .eq('state', 'leased').lte('lease_expires_at', now).order('lease_expires_at', { ascending: true }).limit(bounded),
    ]);
    return [...rows(must(pendingResult)), ...rows(must(expiredResult))]
      .filter((item) => asNumber(item.attempt_count) < asNumber(item.max_attempts))
      .slice(0, bounded)
      .map((item) => text(item.id)).filter(Boolean);
  }

  async finishOutbox(item: Row, succeeded: boolean): Promise<void> {
    must(await this.admin.rpc('person_finish_outbox', {
      p_outbox_id: item.outboxId,
      p_lease_token: item.leaseToken,
      p_fence: item.fence,
      p_succeeded: succeeded,
    }));
  }

  async loadContext(claim: PersonJobClaim): Promise<PersonConsolidationContext> {
    const admin = this.admin;
    const [headResult, prefResult, sourceResult] = await Promise.all([
      admin.from('person_model_heads').select('current_revision,processed_source_seq,privacy_epoch').eq('user_id', claim.userId).eq('profile_id', claim.profileId).single(),
      admin.from('person_preferences').select('astrology_enabled,mode_epoch').eq('user_id', claim.userId).eq('profile_id', claim.profileId).single(),
      admin.from('person_source_items').select('id,source_seq,source_kind,source_message_id,speaker_role,subject_kind,subject_label,source_time,ingested_at,inclusion_status')
        .eq('user_id', claim.userId).eq('profile_id', claim.profileId).gte('source_seq', claim.sourceFromSeq).lte('source_seq', claim.sourceToSeq).order('source_seq'),
    ]);
    const head = row(must(headResult));
    const preferences = row(must(prefResult));
    const sourceRows = rows(must(sourceResult));
    if (asNumber(head.current_revision) !== claim.baseRevision || asNumber(head.privacy_epoch) !== claim.privacyEpoch
      || asNumber(preferences.mode_epoch) !== claim.modeEpoch) throw new Error('Person consolidation freshness tuple changed.');
    const messageIds = sourceRows.map((source) => source.source_message_id).filter((id) => typeof id === 'string');
    const messageRows = messageIds.length ? rows(must(await admin.from('astro_messages')
      .select('id,user_id,profile_id,role,content,created_at').eq('user_id', claim.userId).eq('profile_id', claim.profileId).in('id', messageIds))) : [];
    const messages = new Map(messageRows.map((message) => [String(message.id), message]));
    const sources = sourceRows.map((source) => {
      const message = typeof source.source_message_id === 'string' ? messages.get(source.source_message_id) : undefined;
      if (source.inclusion_status === 'included' && !message) throw new Error('Included person source has no owner-scoped message.');
      return ConsolidationSourceSchema.parse({
        sourceId: source.id,
        sourceSeq: asNumber(source.source_seq),
        sourceTime: source.source_time,
        ingestedAt: source.ingested_at,
        sourceKind: source.source_kind === 'explicit_correction' ? 'explicit_correction'
          : source.source_kind === 'import_item' ? 'import_item'
            : source.source_kind === 'native_message' ? 'native_message' : 'other',
        speaker: source.speaker_role,
        subjectKind: source.subject_kind,
        subjectLabel: source.subject_label ?? null,
        inclusion: source.inclusion_status,
        body: text(message?.content, source.inclusion_status === 'included' ? '' : '[excluded source]'),
      });
    });
    if (sources.some((source) => source.inclusion === 'pending')) {
      throw new Error('Pending person sources cannot be published as handled.');
    }
    const includedSources = sources.filter((source) => source.inclusion === 'included');
    const counterRows = rows(must(await admin.from('person_observations')
      .select('id,source_item_id,subject_kind,assertion_type,status,normalized_assertion,event_time,occurred_from,occurred_to,time_precision')
      .eq('user_id', claim.userId).eq('profile_id', claim.profileId).lt('source_seq', claim.sourceFromSeq)
      .in('status', ['proposed', 'verified', 'rejected', 'superseded']).order('source_seq', { ascending: false }).limit(200)));
    const countercontext = counterRows.map((item) => CountercontextItemSchema.parse({
      observationId: item.id,
      sourceId: item.source_item_id,
      subjectKind: item.subject_kind,
      assertionType: item.assertion_type,
      status: item.status,
      assertion: typeof item.normalized_assertion?.text === 'string' ? item.normalized_assertion.text : JSON.stringify(item.normalized_assertion),
      eventTime: item.event_time ?? {
        precision: item.time_precision ?? 'unknown', start: item.occurred_from ?? null,
        end: item.occurred_to ?? null, age: null, note: null,
      },
    }));
    const snapshot = await this.loadSnapshot(claim, asNumber(head.current_revision), asNumber(head.processed_source_seq));
    return { claim, sources, includedSources, countercontext, snapshot };
  }

  private async loadSnapshot(claim: PersonJobClaim, revision: number, priorWatermark: number): Promise<ConsolidationSnapshot> {
    const admin = this.admin;
    const objectMemberships = rows(must(await admin.from('person_revision_objects')
      .select('object_id,object_version_id').eq('user_id', claim.userId).eq('profile_id', claim.profileId).eq('revision_no', revision)));
    const relationMemberships = rows(must(await admin.from('person_revision_relations')
      .select('relation_id,relation_version_id').eq('user_id', claim.userId).eq('profile_id', claim.profileId).eq('revision_no', revision)));
    const objectIds = objectMemberships.map((entry) => String(entry.object_id));
    const objectVersionIds = objectMemberships.map((entry) => String(entry.object_version_id));
    const relationIds = relationMemberships.map((entry) => String(entry.relation_id));
    const relationVersionIds = relationMemberships.map((entry) => String(entry.relation_version_id));
    const [objects, objectVersions, relations, relationVersions] = await Promise.all([
      objectIds.length ? admin.from('person_objects').select('id,kind').eq('user_id', claim.userId).eq('profile_id', claim.profileId).in('id', objectIds) : Promise.resolve({ data: [], error: null }),
      objectVersionIds.length ? admin.from('person_object_versions').select('id,object_id,version_no,epistemic_class,lifecycle,typed_payload,effective_from,effective_to,time_precision').eq('user_id', claim.userId).eq('profile_id', claim.profileId).in('id', objectVersionIds) : Promise.resolve({ data: [], error: null }),
      relationIds.length ? admin.from('person_relations').select('id,from_object_id,to_object_id,relation_kind').eq('user_id', claim.userId).eq('profile_id', claim.profileId).in('id', relationIds) : Promise.resolve({ data: [], error: null }),
      relationVersionIds.length ? admin.from('person_relation_versions').select('id,relation_id,version_no,epistemic_class,lifecycle,typed_payload').eq('user_id', claim.userId).eq('profile_id', claim.profileId).in('id', relationVersionIds) : Promise.resolve({ data: [], error: null }),
    ]);
    const objectRows = rows(must(objects));
    const objectVersionRows = rows(must(objectVersions));
    const relationRows = rows(must(relations));
    const relationVersionRows = rows(must(relationVersions));
    const objectKind = new Map(objectRows.map((item) => [String(item.id), item.kind]));
    const objectSupport = objectVersionIds.length ? rows(must(await admin.from('person_object_version_support')
      .select('object_version_id,source_item_id,observation_id').eq('user_id', claim.userId).eq('profile_id', claim.profileId).in('object_version_id', objectVersionIds))) : [];
    const relationSupport = relationVersionIds.length ? rows(must(await admin.from('person_relation_version_support')
      .select('relation_version_id,source_item_id,observation_id').eq('user_id', claim.userId).eq('profile_id', claim.profileId).in('relation_version_id', relationVersionIds))) : [];
    const objectsById = new Map(objectVersionRows.map((version) => [String(version.object_id), version]));
    const objectMembers: ExistingObjectContext[] = objectMemberships.map((membership) => {
      const version = objectsById.get(String(membership.object_id));
      if (!version) throw new Error('Current person revision references a missing object version.');
      const support = objectSupport.filter((item) => item.object_version_id === version.id);
      return ExistingObjectContextSchema.parse({
        objectId: membership.object_id, versionId: membership.object_version_id,
        versionNo: version.version_no, kind: objectKind.get(String(membership.object_id)),
        epistemicClass: version.epistemic_class, lifecycle: version.lifecycle,
        payload: version.typed_payload,
        effectiveTime: { precision: version.time_precision, start: version.effective_from, end: version.effective_to, age: null, note: null },
        sourceIds: support.map((item) => item.source_item_id).filter(Boolean),
        observationIds: support.map((item) => item.observation_id).filter(Boolean),
      });
    });
    const relationsById = new Map(relationRows.map((item) => [String(item.id), item]));
    const relationVersionById = new Map(relationVersionRows.map((item) => [String(item.id), item]));
    const relationMembers: ExistingRelationContext[] = relationMemberships.map((membership) => {
      const relation = relationsById.get(String(membership.relation_id));
      const version = relationVersionById.get(String(membership.relation_version_id));
      if (!relation || !version) throw new Error('Current person revision references a missing relation version.');
      const support = relationSupport.filter((item) => item.relation_version_id === version.id);
      return ExistingRelationContextSchema.parse({
        relationId: relation.id, versionId: version.id, versionNo: version.version_no,
        kind: relation.relation_kind, fromObjectId: relation.from_object_id, toObjectId: relation.to_object_id,
        epistemicClass: version.epistemic_class, lifecycle: version.lifecycle,
        rationale: version.typed_payload?.rationale ?? null,
        sourceIds: support.map((item) => item.source_item_id).filter(Boolean),
        observationIds: support.map((item) => item.observation_id).filter(Boolean),
      });
    });
    const conflictRows = rows(must(await admin.from('person_conflicts').select('id').eq('user_id', claim.userId)
      .eq('profile_id', claim.profileId).eq('status', 'open').limit(200)));
    return {
      baseRevision: revision,
      privacyEpoch: claim.privacyEpoch,
      modeEpoch: claim.modeEpoch,
      // Every source in a claimed ordinary-chat job is processed in this one chunk;
      // SQL publication separately enforces that all source outcomes are terminal.
      processedSourceSeq: claim.sourceToSeq,
      objectMembers,
      relationMembers,
      conflictIds: conflictRows.map((item) => String(item.id)),
    };
  }

  newCommitId(): string { return randomUUID(); }
}
