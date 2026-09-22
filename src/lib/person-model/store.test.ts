import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { PersonStore, PERSON_MODEL_RPC } from './store';

const profileId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';

function makeQuery(data: unknown, error: unknown = null) {
  const query = {
    filters: [] as Array<[string, unknown]>,
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => { query.filters.push([key, value]); return query; }),
    gt: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error })),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve, reject),
  };
  return query;
}

function makeUserClient(profile: unknown = {
  id: profileId,
  user_id: ownerId,
  name: 'Sam',
  birth_date: null,
  birth_time: null,
  chart_json: null,
  sensitivity_json: null,
  initialization_status: 'ready',
  created_at: '2026-09-22T10:00:00Z',
  updated_at: '2026-09-22T10:00:00Z',
}, tableRows: Record<string, unknown> = {}) {
  const queries = new Map<string, ReturnType<typeof makeQuery>>();
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: ownerId } }, error: null })) },
    from: vi.fn((table: string) => {
      const query = makeQuery(table === 'astro_profiles' ? profile : tableRows[table] ?? null);
      queries.set(table, query);
      return query;
    }),
    rpc: vi.fn(),
  };
  return { client: client as unknown as SupabaseClient, queries, raw: client };
}

describe('PersonStore', () => {
  beforeEach(() => vi.resetAllMocks());

  it('derives the owner from verified auth, filters profile reads by owner, and does not create admin for reads', async () => {
    const user = makeUserClient();
    mocks.createClient.mockResolvedValue(user.client);
    const store = await PersonStore.fromRequest();

    const person = await store.getPerson(profileId);

    expect(person.personId).toBe(profileId);
    expect(person.readiness.level).toBe('name_only');
    expect(user.raw.auth.getUser).toHaveBeenCalledOnce();
    expect(user.queries.get('astro_profiles')?.filters).toEqual([
      ['id', profileId], ['user_id', ownerId],
    ]);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('uses the exact person_create RPC and reads the returned astro_profiles identity', async () => {
    const user = makeUserClient();
    user.raw.rpc.mockResolvedValue({ data: { profileId }, error: null });
    mocks.createClient.mockResolvedValue(user.client);
    const store = await PersonStore.fromRequest();

    const person = await store.createNameOnlyPerson({
      name: 'Sam',
      idempotencyKey: '99999999-9999-4999-8999-999999999999',
    });

    expect(person.personId).toBe(profileId);
    expect(user.raw.rpc).toHaveBeenCalledWith(PERSON_MODEL_RPC.create, {
      p_name: 'Sam',
      p_command_id: '99999999-9999-4999-8999-999999999999',
    });
  });

  it('uses the exact transactional-message receipt RPC arguments', async () => {
    const user = makeUserClient();
    user.raw.rpc.mockResolvedValue({ data: {
      profileId,
      sourceId: '44444444-4444-4444-8444-444444444444',
      sourceSeq: 9,
      jobId,
      alreadyAccepted: false,
      replayed: false,
    }, error: null });
    mocks.createClient.mockResolvedValue(user.client);
    const store = await PersonStore.fromRequest();

    const accepted = await store.acceptUserMessage({
      personId: profileId,
      messageId: '55555555-5555-4555-8555-555555555555',
      commandId: '66666666-6666-4666-8666-666666666666',
    });

    expect(accepted).toMatchObject({ personId: profileId, sourceSeq: 9, jobId, alreadyAccepted: false });
    expect(user.raw.rpc).toHaveBeenCalledWith(PERSON_MODEL_RPC.acceptUserMessage, {
      p_profile_id: profileId,
      p_message_id: '55555555-5555-4555-8555-555555555555',
      p_command_id: '66666666-6666-4666-8666-666666666666',
    });
  });

  it('reads an owner-scoped persisted view and verifies its revision freshness tuple', async () => {
    const snapshot = {
      personRevision: 4,
      sourceWatermark: 17,
      mode: 'personal',
      modeEpoch: 3,
      privacyEpoch: 2,
      updateState: 'current',
      view: 'life_map',
      objectId: null,
      title: 'Life map',
      nodes: [],
      edges: [],
      explorationIds: [],
      generatedAt: '2026-09-22T10:00:00Z',
    };
    const user = makeUserClient(undefined, {
      person_view_snapshots: {
        profile_id: profileId,
        user_id: ownerId,
        person_revision: 4,
        view_key: 'life_map',
        snapshot_json: snapshot,
        source_watermark: 17,
        mode_epoch: 3,
        privacy_epoch: 2,
      },
    });
    mocks.createClient.mockResolvedValue(user.client);
    const store = await PersonStore.fromRequest();

    await expect(store.getViewSnapshot(profileId, 4, 'life_map')).resolves.toMatchObject(snapshot);
    expect(user.queries.get('person_view_snapshots')?.filters).toEqual([
      ['profile_id', profileId], ['user_id', ownerId], ['person_revision', 4], ['view_key', 'life_map'],
    ]);
  });

  it('maps the database head, preference epoch, and source rows without legacy column guesses', async () => {
    const user = makeUserClient(undefined, {
      person_model_heads: {
        profile_id: profileId,
        current_revision: 4,
        processed_source_seq: 17,
        privacy_epoch: 2,
        publication_state: 'stale',
        updated_at: '2026-09-22T10:00:00Z',
      },
      person_preferences: { mode_epoch: 3 },
      person_source_items: [{
        id: '44444444-4444-4444-8444-444444444444',
        profile_id: profileId,
        source_seq: 17,
        source_kind: 'native_message',
        source_message_id: '55555555-5555-4555-8555-555555555555',
        speaker_role: 'user',
        subject_kind: 'self',
        subject_label: null,
        source_time: '2026-09-21T10:00:00Z',
        ingested_at: '2026-09-22T10:00:00Z',
        original_order: 0,
        inclusion_status: 'included',
        dedup_key: null,
        lineage: {},
      }],
    });
    mocks.createClient.mockResolvedValue(user.client);
    const store = await PersonStore.fromRequest();

    const head = await store.getHead(profileId);
    const sources = await store.listSources(profileId);

    expect(head).toMatchObject({ currentRevision: 4, sourceWatermark: 17, privacyEpoch: 2, modeEpoch: 3, publicationState: 'stale' });
    expect(sources[0]).toMatchObject({
      personId: profileId,
      sourceSeq: 17,
      kind: 'native_message',
      sourceMessageId: '55555555-5555-4555-8555-555555555555',
      subjectKind: 'self',
      inclusion: 'included',
    });
  });

  it('maps revision and observation rows to versioned typed DTOs', async () => {
    const revision = {
      profile_id: profileId,
      revision_no: 2,
      parent_revision: 1,
      processed_source_seq: 7,
      privacy_epoch: 1,
      mode_epoch: 2,
      schema_version: 'person-v3-p2',
      guidance_version: null,
      model_policy_version: null,
      job_id: jobId,
      commit_id: '44444444-4444-4444-8444-444444444444',
      changed_ids: ['object:55555555-5555-4555-8555-555555555555'],
      decision_summary: 'One reported episode added.',
      brief: 'A sourced brief.',
      verifier_receipt: {},
      created_at: '2026-09-22T10:00:00Z',
    };
    const observation = {
      id: '55555555-5555-4555-8555-555555555555',
      profile_id: profileId,
      source_item_id: '66666666-6666-4666-8666-666666666666',
      span_start: 2,
      span_end: 15,
      exact_quote: 'I remember this clearly.',
      normalized_assertion: { event: 'a reported event' },
      subject_kind: 'self',
      subject_label: null,
      domain: 'work',
      assertion_type: 'direct',
      occurred_from: null,
      occurred_to: null,
      time_precision: 'unknown',
      extraction_version: 'extract-v1',
      verifier_version: null,
      status: 'verified',
      created_at: '2026-09-22T10:00:00Z',
    };
    const user = makeUserClient(undefined, {
      person_model_revisions: revision,
      person_observations: [observation],
    });
    mocks.createClient.mockResolvedValue(user.client);
    const store = await PersonStore.fromRequest();

    await expect(store.getRevision(profileId, 2)).resolves.toMatchObject({
      revision: 2,
      sourceWatermark: 7,
      changedIds: ['object:55555555-5555-4555-8555-555555555555'],
      decisionSummary: 'One reported episode added.',
    });
    await expect(store.listObservations(profileId)).resolves.toMatchObject([{
      sourceId: observation.source_item_id,
      normalizedAssertion: { event: 'a reported event' },
      eventTime: { precision: 'unknown', start: null, end: null },
      assertionType: 'direct',
      status: 'verified',
    }]);
  });

  it('uses the exact person_record_correction RPC and receipt fields', async () => {
    const user = makeUserClient();
    user.raw.rpc.mockResolvedValue({
      data: {
        profileId,
        sourceId: '44444444-4444-4444-8444-444444444444',
        sourceSeq: 8,
        changeId: '55555555-5555-4555-8555-555555555555',
        jobId,
        invalidatedObjectId: '66666666-6666-4666-8666-666666666666',
        privacyEpoch: 2,
        replayed: false,
      },
      error: null,
    });
    mocks.createClient.mockResolvedValue(user.client);
    const store = await PersonStore.fromRequest();

    const receipt = await store.recordCorrection({
      personId: profileId,
      messageId: '77777777-7777-4777-8777-777777777777',
      targetObjectId: '66666666-6666-4666-8666-666666666666',
      commandId: '88888888-8888-4888-8888-888888888888',
    });

    expect(receipt).toMatchObject({ sourceSeq: 8, replayed: false });
    expect(user.raw.rpc).toHaveBeenCalledWith(PERSON_MODEL_RPC.recordCorrection, {
      p_profile_id: profileId,
      p_message_id: '77777777-7777-4777-8777-777777777777',
      p_target_object_id: '66666666-6666-4666-8666-666666666666',
      p_command_id: '88888888-8888-4888-8888-888888888888',
    });
  });

  it('submits typed user intent with the exact RPC argument names and maps its receipt', async () => {
    const user = makeUserClient();
    user.raw.rpc.mockResolvedValue({ data: {
      change_id: '44444444-4444-4444-8444-444444444444',
      person_id: profileId,
      source_id: '55555555-5555-4555-8555-555555555555',
      source_seq: 8,
      command_id: '66666666-6666-4666-8666-666666666666',
      change_kind: 'inclusion',
      target_kind: 'person',
      target_id: profileId,
      prior_version_id: null,
      status: 'accepted',
      resolved_revision: null,
      request: { kind: 'add_event' },
      invalidated_ids: [],
      expected_revision: 1,
      job_id: jobId,
      created_at: '2026-09-22T10:00:00Z',
      replayed: false,
    }, error: null });
    mocks.createClient.mockResolvedValue(user.client);
    const store = await PersonStore.fromRequest();
    const change = {
      kind: 'add_event' as const,
      payload: {
        kind: 'episode' as const,
        title: 'A move',
        event: 'Moved to a new city.',
        setting: null,
        people: [],
        reportedExperience: null,
        reportedEffects: [],
        unresolvedInterpretation: null,
        occurred: { precision: 'unknown' as const, start: null, end: null, age: null, note: null },
      },
    };

    const receipt = await store.submitChange({
      personId: profileId,
      commandId: '66666666-6666-4666-8666-666666666666',
      expectedRevision: 1,
      change,
    });

    expect(receipt).toMatchObject({ personId: profileId, kind: 'inclusion', sourceSeq: 8, jobId, replayed: false });
    expect(user.raw.rpc).toHaveBeenCalledWith(PERSON_MODEL_RPC.submitChange, {
      p_person_id: profileId,
      p_command_id: '66666666-6666-4666-8666-666666666666',
      p_expected_revision: 1,
      p_change: change,
    });
  });

  it('records observations only through the exact fenced worker RPC and maps returned rows', async () => {
    const admin = {
      from: vi.fn(),
      rpc: vi.fn(async () => ({
        data: [{
          id: '44444444-4444-4444-8444-444444444444',
          profile_id: profileId,
          source_item_id: '55555555-5555-4555-8555-555555555555',
          span_start: 0,
          span_end: 10,
          exact_quote: 'I moved.',
          normalized_assertion: { text: 'Moved to a new city.' },
          subject_kind: 'self',
          subject_label: null,
          domain: 'place',
          assertion_type: 'direct',
          occurred_from: null,
          occurred_to: null,
          time_precision: 'unknown',
          event_time: { precision: 'unknown', start: null, end: null, age: null, note: null },
          extractor_version: 'extract-v1',
          verifier_version: null,
          status: 'proposed',
          created_at: '2026-09-22T10:00:00Z',
        }],
        error: null,
      })),
    };
    mocks.createAdminClient.mockReturnValue(admin);
    const store = PersonStore.forWorker();
    const observations = [{
      sourceId: '55555555-5555-4555-8555-555555555555',
      spanStart: 0,
      spanEnd: 10,
      exactQuote: 'I moved.',
      normalizedAssertion: 'Moved to a new city.',
      subjectKind: 'self' as const,
      subjectLabel: null,
      subjectPersonId: profileId,
      domain: 'place',
      assertionType: 'direct' as const,
      eventTime: { precision: 'unknown' as const, start: null, end: null, age: null, note: null },
      extractorVersion: 'extract-v1',
      verifierVersion: null,
    }];

    await expect(store.recordObservations({ jobId, leaseToken: '66666666-6666-4666-8666-666666666666', fence: 3, observations }))
      .resolves.toMatchObject([{ personId: profileId, sourceId: observations[0].sourceId, normalizedAssertion: { text: 'Moved to a new city.' } }]);
    expect(admin.rpc).toHaveBeenCalledWith(PERSON_MODEL_RPC.recordObservations, {
      p_job_id: jobId,
      p_lease_token: '66666666-6666-4666-8666-666666666666',
      p_fence: 3,
      p_observations: observations,
    });
  });

  it('rejects request-scoped observation writes before constructing an admin client', async () => {
    const user = makeUserClient();
    mocks.createClient.mockResolvedValue(user.client);
    const store = await PersonStore.fromRequest();
    await expect(store.recordObservations({} as never)).rejects.toMatchObject({ code: 'internal' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rebases stale worker jobs only through the fenced service RPC', async () => {
    const admin = { rpc: vi.fn(async () => ({ data: { status: 'pending', jobId, baseRevision: 4, sourceFromSeq: 8, sourceToSeq: 9, fence: 5, rebaseCount: 1 }, error: null })) };
    mocks.createAdminClient.mockReturnValue(admin);
    const store = PersonStore.forWorker();
    await expect(store.rebaseJob({ jobId, leaseToken: '66666666-6666-4666-8666-666666666666', fence: 4 }))
      .resolves.toMatchObject({ status: 'pending', baseRevision: 4, rebaseCount: 1 });
    expect(admin.rpc).toHaveBeenCalledWith(PERSON_MODEL_RPC.rebaseJob, {
      p_job_id: jobId,
      p_lease_token: '66666666-6666-4666-8666-666666666666',
      p_fence: 4,
    });
  });

  it('publishes only through the fenced admin RPC with the migration signature', async () => {
    const jobQuery = makeQuery({ id: jobId });
    const adminRpc = vi.fn(async () => ({
      data: { published: true, replayed: false, profileId, revision: 2, revisionId: '66666666-6666-4666-8666-666666666666' },
      error: null,
    }));
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => jobQuery),
      rpc: adminRpc,
    } as unknown as SupabaseClient);
    const store = PersonStore.forWorker();

    const publication = await store.publishRevision({
      personId: profileId,
      jobId,
      leaseToken: '77777777-7777-4777-8777-777777777777',
      fence: 3,
      expectedBaseRevision: 1,
      expectedPrivacyEpoch: 2,
      commitId: '88888888-8888-4888-8888-888888888888',
      candidate: {
        processedSourceSeq: 5,
        objectMembers: [],
        relationMembers: [],
        conflictIds: [],
        resolveChangeIds: [],
        brief: 'A sourced brief.',
        changedIds: [],
        decisionSummary: '',
        verifierReceipt: {},
      },
    });

    expect(publication.revision).toBe(2);
    expect(publication.replayed).toBe(false);
    expect(jobQuery.filters).toEqual([['id', jobId], ['profile_id', profileId]]);
    expect(adminRpc).toHaveBeenCalledOnce();
    expect(adminRpc).toHaveBeenCalledWith(PERSON_MODEL_RPC.publishRevision, {
      p_job_id: jobId,
      p_lease_token: '77777777-7777-4777-8777-777777777777',
      p_fence: 3,
      p_expected_base_revision: 1,
      p_expected_privacy_epoch: 2,
      p_commit_id: '88888888-8888-4888-8888-888888888888',
      p_candidate: expect.objectContaining({ processedSourceSeq: 5 }),
    });
  });

  it('does not construct a store without a verified authenticated user', async () => {
    const user = makeUserClient();
    user.raw.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'missing session' } } as never);
    mocks.createClient.mockResolvedValue(user.client);

    await expect(PersonStore.fromRequest()).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('does not allow a request-scoped store to call the trusted publisher', async () => {
    const user = makeUserClient();
    mocks.createClient.mockResolvedValue(user.client);
    const store = await PersonStore.fromRequest();
    await expect(store.publishRevision({} as never)).rejects.toMatchObject({ code: 'internal' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('does not publish when the job is not bound to the supplied person', async () => {
    const jobQuery = makeQuery(null);
    const adminRpc = vi.fn();
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => jobQuery),
      rpc: adminRpc,
    } as unknown as SupabaseClient);
    const store = PersonStore.forWorker();

    await expect(store.publishRevision({
      personId: profileId,
      jobId,
      leaseToken: '77777777-7777-4777-8777-777777777777',
      fence: 3,
      expectedBaseRevision: 1,
      expectedPrivacyEpoch: 2,
      commitId: '88888888-8888-4888-8888-888888888888',
      candidate: {
        processedSourceSeq: 5,
        objectMembers: [],
        relationMembers: [],
        conflictIds: [],
        resolveChangeIds: [],
        brief: '',
        changedIds: [],
        decisionSummary: '',
        verifierReceipt: {},
      },
    })).rejects.toMatchObject({ code: 'not_owned_or_missing' });
    expect(adminRpc).not.toHaveBeenCalled();
  });
});
