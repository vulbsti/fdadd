import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  CreateNameOnlyPersonInputSchema,
  PersonIdentitySchema,
  PersonChangeSchema,
  PersonChangeReceiptSchema,
  PersonModelHeadSchema,
  PersonObservationSchema,
  PersonViewSchema,
  PersonCorrectionReceiptSchema,
  AcceptedUserMessageSchema,
  AcceptUserMessageInputSchema,
  RecordPersonObservationsInputSchema,
  PersonRevisionPublicationResultSchema,
  PersonRevisionSchema,
  PersonSourceSchema,
  SubmitPersonChangeInputSchema,
  RecordPersonCorrectionInputSchema,
  PublishPersonRevisionInputSchema,
  PersonViewKeySchema,
  RebasePersonJobInputSchema,
  RebasePersonJobResultSchema,
  type CreateNameOnlyPersonInput,
  type PersonIdentity,
  type PersonChange,
  type PersonChangeReceipt,
  type PersonModelHead,
  type PersonObservation,
  type PersonView,
  type PersonViewKey,
  type PersonCorrectionReceipt,
  type AcceptedUserMessage,
  type AcceptUserMessageInput,
  type RecordPersonObservationsInput,
  type SubmitPersonChangeInput,
  type PersonRevision,
  type PersonRevisionPublicationResult,
  type PersonSource,
  type RecordPersonCorrectionInput,
  type PersonStoreErrorCode,
  type PublishPersonRevisionInput,
  type RebasePersonJobInput,
  type RebasePersonJobResult,
} from './contracts';

/**
 * RPC names/signatures mirror the person revision-authority migration.
 */
export const PERSON_MODEL_RPC = {
  create: 'person_create',
  acceptUserMessage: 'person_accept_user_message',
  submitChange: 'person_submit_change',
  recordCorrection: 'person_record_correction',
  recordObservations: 'person_record_observations',
  publishRevision: 'person_publish_revision',
  rebaseJob: 'person_rebase_job',
} as const;

export class PersonStoreError extends Error {
  readonly code: PersonStoreErrorCode;
  readonly databaseCode?: string;

  constructor(code: PersonStoreErrorCode, message: string, databaseCode?: string) {
    super(message);
    this.name = 'PersonStoreError';
    this.code = code;
    this.databaseCode = databaseCode;
  }
}

type DatabaseError = { code?: string; message?: string };
type DatabaseResult<T> = { data: T | null; error: DatabaseError | null };

function normalizeDatabaseError(error: DatabaseError): PersonStoreError {
  const code = error.code ?? '';
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(code)) {
    return new PersonStoreError(
      'unconfigured',
      'Person-model persistence is not deployed yet. Apply the person-model migration before using this operation.',
      code,
    );
  }
  if (['PERS01', 'P0002', 'ANF01'].includes(code)) {
    return new PersonStoreError('not_owned_or_missing', 'Person was not found.', code);
  }
  if (['PDC01', 'PDC02', 'PJF01', 'PSQ01', 'ACF01', '23505', '40001'].includes(code)) {
    return new PersonStoreError('conflict', 'The request conflicts with the current person-model state.', code);
  }
  if (['PST01'].includes(code)) {
    return new PersonStoreError('stale_revision', 'The person model changed. Refresh and retry against the latest revision.', code);
  }
  if (code === 'PSR01') return new PersonStoreError('source_excluded', 'One or more supporting sources are no longer eligible.', code);
  if (code === 'AFB01') return new PersonStoreError('unauthenticated', 'Sign in before accessing a person model.', code);
  if (['AIR01', '22023', '23514'].includes(code)) {
    return new PersonStoreError('invalid_record', error.message ?? 'Person-model request failed validation.', code);
  }
  return new PersonStoreError('internal', error.message ?? 'Person-model storage failed.', code || undefined);
}

function unwrap<T>(result: DatabaseResult<T>): T {
  if (result.error) throw normalizeDatabaseError(result.error);
  if (result.data === null) throw new PersonStoreError('internal', 'Person-model storage returned no data.');
  return result.data;
}

function parseRow<T>(schema: { parse: (input: unknown) => T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid row';
    throw new PersonStoreError('invalid_record', `Person-model database row failed validation: ${detail}`);
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === 'object' ? input as Record<string, unknown> : {};
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new PersonStoreError('invalid_record', `Person profile is missing ${key}.`);
  }
  return value;
}

function toPersonIdentity(input: unknown): PersonIdentity {
  const row = asRecord(input);
  const name = requiredString(row, 'name');
  const astroReady = row.chart_json !== null && row.chart_json !== undefined
    && row.sensitivity_json !== null && row.sensitivity_json !== undefined;
  const astroStatus = ['not_configured', 'pending', 'ready', 'failed', 'disabled'].includes(String(row.astro_status))
    ? row.astro_status as PersonIdentity['astroStatus']
    : astroReady
      ? 'ready'
      : row.initialization_status === 'failed' && row.birth_date
        ? 'failed'
        : row.initialization_status === 'pending'
          ? 'pending'
          : 'not_configured';
  const personStatus = ['active', 'archived', 'deleting', 'deleted'].includes(String(row.person_status))
    ? row.person_status as PersonIdentity['personStatus']
    : 'active';
  const readinessLevel = astroStatus === 'ready' ? 'astrology_ready' : 'name_only';

  return parseRow(PersonIdentitySchema, {
    personId: requiredString(row, 'id'),
    ownerId: requiredString(row, 'user_id'),
    name,
    personStatus,
    astroStatus,
    readiness: {
      person: personStatus === 'active' ? 'ready' : personStatus === 'archived' ? 'pending' : 'unavailable',
      astrology: astroStatus,
      level: readinessLevel,
      explanation: readinessLevel === 'name_only'
        ? 'The person identity is ready independently of birth data and astrology setup.'
        : 'Birth inputs and the astrology calculation are ready.',
    },
    createdAt: requiredString(row, 'created_at'),
    updatedAt: requiredString(row, 'updated_at'),
  });
}

function toHead(input: unknown, modeEpoch: number): PersonModelHead {
  const row = asRecord(input);
  return parseRow(PersonModelHeadSchema, {
    personId: row.profile_id,
    currentRevision: Number(row.current_revision),
    sourceWatermark: Number(row.processed_source_seq ?? 0),
    privacyEpoch: Number(row.privacy_epoch ?? 0),
    modeEpoch,
    publicationState: row.publication_state,
    updatedAt: row.updated_at,
  });
}

function toSource(input: unknown): PersonSource {
  const row = asRecord(input);
  return parseRow(PersonSourceSchema, {
    id: row.id,
    personId: row.profile_id,
    sourceSeq: Number(row.source_seq),
    kind: row.source_kind,
    speaker: row.speaker_role,
    subjectKind: row.subject_kind,
    subjectLabel: row.subject_label ?? null,
    sourceTime: row.source_time ?? null,
    ingestedAt: row.ingested_at,
    originalOrder: row.original_order === null || row.original_order === undefined ? null : Number(row.original_order),
    inclusion: row.inclusion_status,
    sourceMessageId: row.source_message_id ?? null,
    dedupKey: row.dedup_key ?? null,
    lineage: row.lineage ?? {},
  });
}

function toObservation(input: unknown): PersonObservation {
  const row = asRecord(input);
  return parseRow(PersonObservationSchema, {
    id: row.id,
    personId: row.profile_id,
    sourceId: row.source_item_id,
    spanStart: row.span_start === null || row.span_start === undefined ? null : Number(row.span_start),
    spanEnd: row.span_end === null || row.span_end === undefined ? null : Number(row.span_end),
    exactQuote: row.exact_quote ?? null,
    normalizedAssertion: row.normalized_assertion,
    subjectKind: row.subject_kind,
    subjectLabel: row.subject_label ?? null,
    domain: row.domain,
    eventTime: row.event_time ?? {
      precision: row.time_precision,
      start: row.occurred_from ?? null,
      end: row.occurred_to ?? null,
      age: null,
      note: null,
    },
    assertionType: row.assertion_type,
    status: row.status,
    extractorVersion: row.extractor_version ?? row.extraction_version ?? null,
    verifierVersion: row.verifier_version ?? null,
    createdAt: row.created_at,
  });
}

export class PersonStore {
  private constructor(
    private readonly userClient: SupabaseClient | null,
    private readonly ownerId: string | null,
    private readonly getAdminClient: () => SupabaseClient,
    private readonly authority: 'request' | 'worker',
  ) {}

  private requireRequestScope(): { userClient: SupabaseClient; ownerId: string } {
    if (this.authority !== 'request' || !this.userClient || !this.ownerId) {
      throw new PersonStoreError('unauthenticated', 'This operation requires a verified user request.');
    }
    return { userClient: this.userClient, ownerId: this.ownerId };
  }

  /** Create only inside a request/server execution and derive owner from verified auth. */
  static async fromRequest(): Promise<PersonStore> {
    const userClient = await createClient();
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) {
      throw new PersonStoreError('unauthenticated', 'Sign in before accessing a person model.');
    }
    return new PersonStore(userClient, data.user.id, createAdminClient, 'request');
  }

  /** Internal workflow entry point: it exposes only fenced worker publication. */
  static forWorker(): PersonStore {
    return new PersonStore(null, null, createAdminClient, 'worker');
  }

  /**
   * Create a birth-independent person. The SQL RPC is expected to apply the
   * name-only compatibility defaults and idempotency rules in one transaction.
   */
  async createNameOnlyPerson(rawInput: CreateNameOnlyPersonInput): Promise<PersonIdentity> {
    const { userClient } = this.requireRequestScope();
    const input = CreateNameOnlyPersonInputSchema.parse(rawInput);
    const result = unwrap(await userClient.rpc(PERSON_MODEL_RPC.create, {
      p_name: input.name,
      p_command_id: input.idempotencyKey,
    }));
    const row = asRecord(Array.isArray(result) ? result[0] : result);
    const personId = row.profileId;
    if (typeof personId !== 'string') throw new PersonStoreError('invalid_record', 'Create-person RPC returned no profileId.');
    return this.getPerson(personId);
  }

  /** Confirm the DB-transactional message trigger registered this owned message. */
  async acceptUserMessage(rawInput: AcceptUserMessageInput): Promise<AcceptedUserMessage> {
    const { userClient } = this.requireRequestScope();
    const input = AcceptUserMessageInputSchema.parse(rawInput);
    await this.getPerson(input.personId);
    const result = unwrap(await userClient.rpc(PERSON_MODEL_RPC.acceptUserMessage, {
      p_profile_id: input.personId,
      p_message_id: input.messageId,
      p_command_id: input.commandId,
    }));
    const row = asRecord(Array.isArray(result) ? result[0] : result);
    return parseRow(AcceptedUserMessageSchema, {
      personId: row.profileId,
      sourceId: row.sourceId,
      sourceSeq: Number(row.sourceSeq),
      jobId: row.jobId,
      alreadyAccepted: row.alreadyAccepted,
      replayed: row.replayed,
    });
  }

  /** RLS plus the explicit owner predicate prevents cross-person reads. */
  async getPerson(personId: string): Promise<PersonIdentity> {
    const { userClient, ownerId } = this.requireRequestScope();
    const result = await userClient
      .from('astro_profiles')
      .select('id,user_id,name,birth_date,birth_time,chart_json,sensitivity_json,initialization_status,person_status,astro_status,created_at,updated_at')
      .eq('id', personId)
      .eq('user_id', ownerId)
      .maybeSingle();
    if (result.error) throw normalizeDatabaseError(result.error);
    if (!result.data) throw new PersonStoreError('not_owned_or_missing', 'Person was not found.');
    return toPersonIdentity(result.data);
  }

  async getHead(personId: string): Promise<PersonModelHead | null> {
    const { userClient, ownerId } = this.requireRequestScope();
    await this.getPerson(personId);
    const [headResult, preferenceResult] = await Promise.all([
      userClient
      .from('person_model_heads')
      .select('profile_id,current_revision,processed_source_seq,privacy_epoch,publication_state,updated_at')
      .eq('profile_id', personId)
      .eq('user_id', ownerId)
      .maybeSingle(),
      userClient
        .from('person_preferences')
        .select('mode_epoch')
        .eq('profile_id', personId)
        .eq('user_id', ownerId)
        .maybeSingle(),
    ]);
    if (headResult.error) throw normalizeDatabaseError(headResult.error);
    if (preferenceResult.error) throw normalizeDatabaseError(preferenceResult.error);
    if (!headResult.data) return null;
    return toHead(headResult.data, Number(asRecord(preferenceResult.data).mode_epoch ?? 0));
  }

  async getRevision(personId: string, revision: number): Promise<PersonRevision> {
    const { userClient, ownerId } = this.requireRequestScope();
    await this.getPerson(personId);
    const result = await userClient
      .from('person_model_revisions')
      .select('profile_id,revision_no,parent_revision,processed_source_seq,privacy_epoch,mode_epoch,schema_version,guidance_version,model_policy_version,job_id,commit_id,changed_ids,decision_summary,brief,verifier_receipt,created_at')
      .eq('profile_id', personId)
      .eq('user_id', ownerId)
      .eq('revision_no', revision)
      .maybeSingle();
    if (result.error) throw normalizeDatabaseError(result.error);
    if (!result.data) throw new PersonStoreError('not_owned_or_missing', 'Person revision was not found.');
    const row = asRecord(result.data);
    return parseRow(PersonRevisionSchema, {
      personId: row.profile_id,
      revision: Number(row.revision_no),
      parentRevision: row.parent_revision === null ? null : Number(row.parent_revision),
      sourceWatermark: Number(row.processed_source_seq),
      privacyEpoch: Number(row.privacy_epoch),
      modeEpoch: Number(row.mode_epoch),
      schemaVersion: row.schema_version,
      guidanceVersion: row.guidance_version ?? null,
      modelPolicyVersion: row.model_policy_version ?? null,
      jobId: row.job_id ?? null,
      commitId: row.commit_id,
      changedIds: row.changed_ids ?? [],
      decisionSummary: row.decision_summary ?? '',
      brief: row.brief,
      verifierReceipt: row.verifier_receipt ?? {},
      createdAt: row.created_at,
    });
  }

  async listObservations(personId: string, sourceId?: string, limit = 100): Promise<PersonObservation[]> {
    const { userClient, ownerId } = this.requireRequestScope();
    await this.getPerson(personId);
    const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 250));
    let query = userClient
      .from('person_observations')
      .select('id,profile_id,source_item_id,span_start,span_end,exact_quote,normalized_assertion,subject_kind,subject_label,domain,assertion_type,occurred_from,occurred_to,time_precision,extraction_version,verifier_version,status,created_at')
      .eq('profile_id', personId)
      .eq('user_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(boundedLimit);
    if (sourceId) query = query.eq('source_item_id', sourceId);
    const result = await query;
    if (result.error) throw normalizeDatabaseError(result.error);
    return (result.data ?? []).map(toObservation);
  }

  /** Read a persisted, revision-consistent snapshot; never trigger a rebuild here. */
  async getViewSnapshot(personId: string, revision: number, viewKey: PersonViewKey): Promise<PersonView | null> {
    const { userClient, ownerId } = this.requireRequestScope();
    await this.getPerson(personId);
    const parsedViewKey = PersonViewKeySchema.parse(viewKey);
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new PersonStoreError('invalid_record', 'View revision must be a positive safe integer.');
    }
    const result = await userClient.from('person_view_snapshots')
      .select('profile_id,user_id,person_revision,view_key,snapshot_json,source_watermark,mode_epoch,privacy_epoch')
      .eq('profile_id', personId)
      .eq('user_id', ownerId)
      .eq('person_revision', revision)
      .eq('view_key', parsedViewKey)
      .maybeSingle();
    if (result.error) throw normalizeDatabaseError(result.error);
    if (!result.data) return null;
    const row = asRecord(result.data);
    const view = parseRow(PersonViewSchema, row.snapshot_json);
    if (Number(row.person_revision) !== view.personRevision
      || parsedViewKey !== view.view
      || Number(row.source_watermark) !== view.sourceWatermark
      || Number(row.mode_epoch) !== view.modeEpoch
      || Number(row.privacy_epoch) !== view.privacyEpoch) {
      throw new PersonStoreError('invalid_record', 'Person view snapshot does not match its persisted revision freshness tuple.');
    }
    return view;
  }

  /** Record the concrete correction command supported by the P2 SQL contract. */
  async recordCorrection(rawInput: RecordPersonCorrectionInput): Promise<PersonCorrectionReceipt> {
    const { userClient } = this.requireRequestScope();
    const input = RecordPersonCorrectionInputSchema.parse(rawInput);
    await this.getPerson(input.personId);
    const result = unwrap(await userClient.rpc(PERSON_MODEL_RPC.recordCorrection, {
      p_profile_id: input.personId,
      p_message_id: input.messageId,
      p_target_object_id: input.targetObjectId,
      p_command_id: input.commandId,
    }));
    const row = asRecord(Array.isArray(result) ? result[0] : result);
    return parseRow(PersonCorrectionReceiptSchema, {
      personId: row.profileId,
      sourceId: row.sourceId,
      sourceSeq: Number(row.sourceSeq),
      changeId: row.changeId,
      jobId: row.jobId,
      invalidatedObjectId: row.invalidatedObjectId,
      privacyEpoch: Number(row.privacyEpoch),
      replayed: row.replayed,
    });
  }

  /** User intent API; SQL transaction handles source, change, invalidation, and outbox. */
  async submitChange(rawInput: SubmitPersonChangeInput): Promise<PersonChangeReceipt> {
    const { userClient } = this.requireRequestScope();
    const input = SubmitPersonChangeInputSchema.parse(rawInput);
    await this.getPerson(input.personId);
    const result = unwrap(await userClient.rpc(PERSON_MODEL_RPC.submitChange, {
      p_person_id: input.personId,
      p_command_id: input.commandId,
      p_expected_revision: input.expectedRevision,
      p_change: input.change,
    }));
    const row = asRecord(Array.isArray(result) ? result[0] : result);
    return parseRow(PersonChangeReceiptSchema, {
      changeId: row.change_id,
      personId: row.person_id,
      sourceId: row.source_id,
      sourceSeq: Number(row.source_seq),
      commandId: row.command_id,
      kind: row.change_kind,
      targetKind: row.target_kind,
      targetId: row.target_id,
      priorVersionId: row.prior_version_id ?? null,
      status: row.status,
      resolvedRevision: row.resolved_revision === null || row.resolved_revision === undefined ? null : Number(row.resolved_revision),
      request: row.request ?? {},
      invalidatedIds: row.invalidated_ids ?? [],
      expectedRevision: row.expected_revision === null || row.expected_revision === undefined ? null : Number(row.expected_revision),
      jobId: row.job_id,
      createdAt: row.created_at,
      replayed: row.replayed,
    });
  }

  async listSources(personId: string, afterSeq = 0, limit = 100): Promise<PersonSource[]> {
    const { userClient, ownerId } = this.requireRequestScope();
    await this.getPerson(personId);
    const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 250));
    const result = await userClient
      .from('person_source_items')
      .select('id,profile_id,source_seq,source_kind,source_message_id,speaker_role,subject_kind,subject_label,source_time,ingested_at,original_order,inclusion_status,dedup_key,lineage')
      .eq('profile_id', personId)
      .eq('user_id', ownerId)
      .gt('source_seq', Math.max(0, Math.trunc(afterSeq)))
      .order('source_seq', { ascending: true })
      .limit(boundedLimit);
    if (result.error) throw normalizeDatabaseError(result.error);
    return (result.data ?? []).map(toSource);
  }

  async listChanges(personId: string, limit = 100): Promise<PersonChange[]> {
    const { userClient, ownerId } = this.requireRequestScope();
    await this.getPerson(personId);
    const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 250));
    const result = await userClient
      .from('person_changes')
      .select('id,profile_id,source_item_id,source_seq,change_kind,target_kind,target_id,prior_version_id,status,resolved_revision,request,created_at')
      .eq('profile_id', personId)
      .eq('user_id', ownerId)
      .order('source_seq', { ascending: false })
      .limit(boundedLimit);
    if (result.error) throw normalizeDatabaseError(result.error);
    const rows = (result.data ?? []).map(asRecord);
    if (rows.length === 0) return [];

    const sourceIds = [...new Set(rows.map((row) => row.source_item_id).filter((id): id is string => typeof id === 'string'))];
    const changeIds = rows.map((row) => row.id).filter((id): id is string => typeof id === 'string');
    const [sourceResult, impactResult] = await Promise.all([
      sourceIds.length > 0
        ? userClient.from('person_source_items').select('id,command_id').eq('profile_id', personId).eq('user_id', ownerId).in('id', sourceIds)
        : Promise.resolve({ data: [], error: null }),
      changeIds.length > 0
        ? userClient.from('person_change_impacts').select('change_id,entity_id').eq('profile_id', personId).eq('user_id', ownerId).in('change_id', changeIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (sourceResult.error) throw normalizeDatabaseError(sourceResult.error);
    if (impactResult.error) throw normalizeDatabaseError(impactResult.error);

    const commandIds = new Map((sourceResult.data ?? []).map((raw) => {
      const source = asRecord(raw);
      return [String(source.id), typeof source.command_id === 'string' ? source.command_id : null] as const;
    }));
    const impacted = new Map<string, string[]>();
    for (const raw of impactResult.data ?? []) {
      const impact = asRecord(raw);
      if (typeof impact.change_id !== 'string' || typeof impact.entity_id !== 'string') continue;
      const ids = impacted.get(impact.change_id) ?? [];
      ids.push(impact.entity_id);
      impacted.set(impact.change_id, ids);
    }

    return rows.map((row) => parseRow(PersonChangeSchema, {
      id: row.id,
      personId: row.profile_id,
      sourceId: row.source_item_id,
      sourceSeq: Number(row.source_seq),
      commandId: commandIds.get(String(row.source_item_id)) ?? null,
      kind: row.change_kind,
      targetKind: row.target_kind,
      targetId: row.target_id,
      priorVersionId: row.prior_version_id ?? null,
      status: row.status,
      resolvedRevision: row.resolved_revision === null || row.resolved_revision === undefined ? null : Number(row.resolved_revision),
      request: row.request ?? {},
      invalidatedIds: impacted.get(String(row.id)) ?? [],
      createdAt: row.created_at,
    }));
  }

  /** Persist worker observations only through the exact lease/fence-checked RPC. */
  async recordObservations(rawInput: RecordPersonObservationsInput): Promise<PersonObservation[]> {
    if (this.authority !== 'worker') {
      throw new PersonStoreError('internal', 'Only a workflow-scoped PersonStore can record observations.');
    }
    const input = RecordPersonObservationsInputSchema.parse(rawInput);
    const result = unwrap(await this.getAdminClient().rpc(PERSON_MODEL_RPC.recordObservations, {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_fence: input.fence,
      p_observations: input.observations,
    }));
    if (!Array.isArray(result)) {
      throw new PersonStoreError('invalid_record', 'Observation RPC returned an unexpected row shape.');
    }
    return result.map(toObservation);
  }

  /** Requeue stale work against the new head; the worker must recompute before publishing. */
  async rebaseJob(rawInput: RebasePersonJobInput): Promise<RebasePersonJobResult> {
    if (this.authority !== 'worker') {
      throw new PersonStoreError('internal', 'Only a workflow-scoped PersonStore can rebase jobs.');
    }
    const input = RebasePersonJobInputSchema.parse(rawInput);
    const result = unwrap(await this.getAdminClient().rpc(PERSON_MODEL_RPC.rebaseJob, {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_fence: input.fence,
    }));
    return parseRow(RebasePersonJobResultSchema, asRecord(Array.isArray(result) ? result[0] : result));
  }

  /** Trusted workflow-only publication guarded by the current job lease/fence. */
  async publishRevision(rawInput: PublishPersonRevisionInput): Promise<PersonRevisionPublicationResult> {
    if (this.authority !== 'worker') {
      throw new PersonStoreError('internal', 'Only a workflow-scoped PersonStore can publish revisions.');
    }
    const input = PublishPersonRevisionInputSchema.parse(rawInput);
    const admin = this.getAdminClient();
    const jobCheck = await admin
      .from('person_jobs')
      .select('id')
      .eq('id', input.jobId)
      .eq('profile_id', input.personId)
      .maybeSingle();
    if (jobCheck.error) throw normalizeDatabaseError(jobCheck.error);
    if (!jobCheck.data) throw new PersonStoreError('not_owned_or_missing', 'Person job was not found.');

    const result = unwrap(await admin.rpc(PERSON_MODEL_RPC.publishRevision, {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_fence: input.fence,
      p_expected_base_revision: input.expectedBaseRevision,
      p_expected_privacy_epoch: input.expectedPrivacyEpoch,
      p_commit_id: input.commitId,
      p_candidate: input.candidate,
    }));
    const row = Array.isArray(result) ? result[0] : result;
    const output = asRecord(row);
    return parseRow(PersonRevisionPublicationResultSchema, {
      personId: output.profileId,
      revision: Number(output.revision),
      revisionId: output.revisionId,
      published: output.published,
      replayed: output.replayed,
    });
  }
}
