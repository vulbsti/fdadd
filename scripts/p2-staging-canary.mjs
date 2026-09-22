import { createClient } from '@supabase/supabase-js';
import { lookup as systemLookup } from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

const url = process.env.P2_STAGING_SUPABASE_URL;
const publishableKey = process.env.P2_STAGING_PUBLISHABLE_KEY;
const secretKey = process.env.P2_STAGING_SECRET_KEY;
const expectedRef = process.env.P2_STAGING_PROJECT_REF;
const resolvedProjectIp = process.env.P2_STAGING_SUPABASE_IP;

if (!url || !publishableKey || !secretKey || !expectedRef) {
  throw new Error('P2 staging canary requires explicit staging URL, ref, publishable key, and secret key.');
}
const host = new URL(url).hostname;
if (!host.startsWith(`${expectedRef}.`) || expectedRef === 'ezanfqbewuqttatrkvhf') {
  throw new Error('P2 staging canary refuses an unexpected or production Supabase target.');
}

// Some local networks rewrite wildcard supabase.co DNS responses. The canary may
// be given a DNS-over-HTTPS result without weakening TLS hostname verification.
if (resolvedProjectIp) {
  setGlobalDispatcher(new Agent({
    connect: {
      lookup(hostname, options, callback) {
        if (hostname === host) {
          callback(null, [{ address: resolvedProjectIp, family: 4 }]);
          return;
        }
        systemLookup(hostname, options, callback);
      },
    },
  }));
}

const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const password = `P2-${crypto.randomUUID()}-Aa1!`;
const createdUsers = [];

function requireOk(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

try {
  for (const suffix of ['owner', 'other']) {
    const created = requireOk(await admin.auth.admin.createUser({
      email: `p2-staging-${suffix}-${crypto.randomUUID()}@example.invalid`,
      password,
      email_confirm: true,
    }), `create ${suffix} user`);
    createdUsers.push(created.user);
  }
  const [ownerUser, otherUser] = createdUsers;
  const owner = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const other = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  requireOk(await owner.auth.signInWithPassword({ email: ownerUser.email, password }), 'owner sign in');
  requireOk(await other.auth.signInWithPassword({ email: otherUser.email, password }), 'other sign in');

  const person = requireOk(await owner.rpc('person_create', {
    p_name: 'P2 staging canary',
    p_command_id: crypto.randomUUID(),
  }), 'create name-only person');
  const personId = person.profileId;
  const session = requireOk(await owner.rpc('create_astro_session', { p_profile_id: personId }), 'create session');
  const messageId = crypto.randomUUID();
  requireOk(await owner.from('astro_messages').insert({
    id: messageId,
    user_id: ownerUser.id,
    session_id: session.sessionId,
    role: 'user',
    content: 'A staging canary turning point made the next step clearer.',
    client_message_id: crypto.randomUUID(),
  }), 'insert owned message');

  const source = requireOk(await admin.from('person_source_items')
    .select('id,source_seq')
    .eq('profile_id', personId)
    .eq('source_message_id', messageId)
    .single(), 'read atomically registered source');
  const job = requireOk(await admin.from('person_jobs')
    .select('id')
    .eq('profile_id', personId)
    .eq('job_kind', 'source_consolidation')
    .single(), 'read source job');
  const claim = requireOk(await admin.rpc('person_claim_job', { p_job_id: job.id, p_lease_seconds: 180 }), 'claim source job');

  const objectId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  requireOk(await admin.from('person_objects').insert({
    id: objectId, user_id: ownerUser.id, profile_id: personId, kind: 'episode',
  }), 'insert worker object');
  requireOk(await admin.from('person_object_versions').insert({
    id: versionId,
    user_id: ownerUser.id,
    profile_id: personId,
    object_id: objectId,
    version_no: 1,
    epistemic_class: 'reported',
    lifecycle: 'active',
    typed_payload: {
      kind: 'episode',
      title: 'A staging canary turning point',
      event: 'A staging canary turning point made the next step clearer.',
      setting: null,
      people: [],
      reportedExperience: null,
      reportedEffects: ['The next step became clearer.'],
      unresolvedInterpretation: null,
      occurred: { precision: 'unknown', start: null, end: null, age: null, note: null },
    },
  }), 'insert worker object version');
  requireOk(await admin.from('person_object_version_support').insert({
    user_id: ownerUser.id,
    profile_id: personId,
    object_version_id: versionId,
    source_item_id: source.id,
    relation: 'supports',
  }), 'insert version support');
  const publication = requireOk(await admin.rpc('person_publish_revision', {
    p_job_id: job.id,
    p_lease_token: claim.leaseToken,
    p_fence: claim.fence,
    p_expected_base_revision: 1,
    p_expected_privacy_epoch: 0,
    p_commit_id: crypto.randomUUID(),
    p_candidate: {
      processedSourceSeq: source.source_seq,
      brief: 'A staging canary account.',
      objectMembers: [{ objectId, versionId }],
      relationMembers: [],
    },
  }), 'publish revision');

  const projection = requireOk(await owner.rpc('person_read_projection', {
    p_profile_id: personId,
    p_view: 'life-map',
    p_object_id: null,
  }), 'read coherent projection');
  const exploration = requireOk(await owner.rpc('person_start_exploration', {
    p_profile_id: personId,
    p_object_id: objectId,
    p_expected_revision: publication.revision,
    p_command_id: crypto.randomUUID(),
  }), 'start revision-bound exploration');
  const explorationMessages = await admin.from('astro_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', exploration.sessionId);
  if (explorationMessages.error) throw new Error(`count exploration messages: ${explorationMessages.error.message}`);
  const explorationMessageCount = explorationMessages.count;
  const search = requireOk(await owner.rpc('person_search_conversations', {
    p_profile_id: personId,
    p_query: 'turning point',
    p_before_created_at: null,
    p_before_message_id: null,
    p_limit: 20,
  }), 'search exact message anchor');

  const forbiddenInsert = await owner.from('person_objects').insert({
    user_id: ownerUser.id, profile_id: personId, kind: 'episode',
  });
  const crossUserRead = requireOk(await other.from('person_current_objects')
    .select('object_id')
    .eq('profile_id', personId), 'cross-user read');
  const crossUserSearch = await other.rpc('person_search_conversations', {
    p_profile_id: personId,
    p_query: 'turning point',
    p_before_created_at: null,
    p_before_message_id: null,
    p_limit: 20,
  });
  const preferenceUpdate = requireOk(await owner.rpc('person_set_preferences', {
    p_profile_id: personId,
    p_astrology_enabled: true,
    p_domains: {},
    p_locale: '',
    p_expected_mode_epoch: 0,
    p_command_id: crypto.randomUUID(),
  }), 'compare-and-set preference update');
  const stalePreferenceUpdate = await owner.rpc('person_set_preferences', {
    p_profile_id: personId,
    p_astrology_enabled: false,
    p_domains: {},
    p_locale: '',
    p_expected_mode_epoch: 0,
    p_command_id: crypto.randomUUID(),
  });
  const staleModeProjection = requireOk(await owner.rpc('person_read_projection', {
    p_profile_id: personId,
    p_view: 'life-map',
    p_object_id: null,
  }), 'read projection after mode change');

  if (projection.personRevision !== publication.revision || projection.objects?.length !== 1) {
    throw new Error('coherent projection did not expose the published revision member');
  }
  if (explorationMessageCount !== 0) throw new Error('exploration fabricated a transcript message');
  if (search.length !== 1 || search[0].message_id !== messageId) throw new Error('message search did not return its exact anchor');
  if (!forbiddenInsert.error) throw new Error('authenticated direct trusted-table write was accepted');
  if (crossUserRead.length !== 0 || !crossUserSearch.error) throw new Error('cross-user boundary failed');
  if (preferenceUpdate.modeEpoch !== 1 || stalePreferenceUpdate.error?.code !== 'PST01') {
    throw new Error('preference compare-and-set boundary failed');
  }
  if (staleModeProjection.updateState !== 'updating' || staleModeProjection.objects?.length !== 0) {
    throw new Error('stale-mode projection exposed prior revision content');
  }

  console.log(JSON.stringify({
    projectRef: expectedRef,
    personCreated: true,
    sourceRegistered: true,
    revisionPublished: publication.revision,
    coherentObjectCount: projection.objects.length,
    explorationPersisted: true,
    fabricatedExplorationMessages: explorationMessageCount,
    searchAnchors: search.length,
    directTrustedWriteRejected: true,
    crossUserReadCount: crossUserRead.length,
    crossUserSearchRejected: true,
    preferenceCompareAndSet: true,
    staleModeProjectionWithheld: true,
  }));
} finally {
  for (const user of createdUsers) {
    const removed = await admin.auth.admin.deleteUser(user.id);
    if (removed.error) throw new Error(`cleanup failed: ${removed.error.message}`);
  }
}
