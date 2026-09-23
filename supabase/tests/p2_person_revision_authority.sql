-- P2 person identity, revision authority, and owner isolation.
-- Run only against disposable local Supabase. Entire fixture rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(43);

\set user_a a2000000-0000-4000-8000-000000000001
\set user_b b2000000-0000-4000-8000-000000000002
\set create_command a2000000-0000-4000-8000-000000000010
\set accept_command a2000000-0000-4000-8000-000000000011
\set change_command a2000000-0000-4000-8000-000000000014
\set exploration_command a2000000-0000-4000-8000-000000000015
\set commit_id a2000000-0000-4000-8000-000000000012
\set object_id a2000000-0000-4000-8000-000000000020
\set version_id a2000000-0000-4000-8000-000000000021

set local role postgres;
insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, role)
values
  (:'user_a'::uuid, 'p2-owner-a@example.invalid', 'p2-fixture', now(), now(), now(), 'authenticated'),
  (:'user_b'::uuid, 'p2-owner-b@example.invalid', 'p2-fixture', now(), now(), now(), 'authenticated');
select has_column('public', 'person_outbox', 'max_attempts',
  'person outbox has an explicit bounded retry limit');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((public.person_create('P2 A', :'create_command'::uuid)->>'replayed')::boolean,
  false, 'name-only create succeeds for first command');
select is((select astro_status from public.astro_profiles where user_id = :'user_a'::uuid and name='P2 A'),
  'not_configured', 'person identity is ready without chart configuration');
select is((select brief from public.person_model_revisions r join public.astro_profiles p on p.id=r.profile_id
  where p.user_id=:'user_a'::uuid and r.revision_no=1), '', 'baseline does not promote old assistant summaries');
select is((public.person_create('P2 A', :'create_command'::uuid)->>'replayed')::boolean,
  true, 'same command body returns same creation receipt');
select throws_ok($$select public.person_create('P2 changed', 'a2000000-0000-4000-8000-000000000010'::uuid)$$,
  'PDC01', null, 'reusing a command ID with a different body is rejected');

-- Insert through the same authenticated path the existing chat RPC uses.
select public.create_astro_session((select id from public.astro_profiles
  where user_id=:'user_a'::uuid and name='P2 A'));
insert into public.astro_messages (user_id, session_id, role, content, client_message_id)
select :'user_a'::uuid, s.id, 'user', 'P2 source message',
  'a2000000-0000-4000-8000-000000000013'::uuid
from public.astro_sessions s join public.astro_profiles p on p.id=s.profile_id
where p.user_id=:'user_a'::uuid and p.name='P2 A';
select public.person_accept_user_message(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  (select id from public.astro_messages where user_id=:'user_a'::uuid and content='P2 source message'),
  :'accept_command'::uuid);
select is((select source_seq from public.person_source_items where user_id=:'user_a'::uuid
  and source_kind='native_message'), 1::bigint, 'user message is atomically registered as source sequence one');
set local request.jwt.claims = '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*) from public.astro_profiles where user_id=:'user_a'::uuid),
  0::bigint, 'second user cannot read first user profile');
select is((select count(*) from public.person_source_items where user_id=:'user_a'::uuid),
  0::bigint, 'second user cannot read first user source');
select throws_ok($$insert into public.person_objects(user_id,profile_id,kind)
  values ('b2000000-0000-4000-8000-000000000002'::uuid,
    (select id from public.astro_profiles where user_id='a2000000-0000-4000-8000-000000000001'::uuid limit 1), 'episode')$$,
  '42501', null, 'authenticated role cannot directly write model objects');
select throws_ok($$update public.astro_profiles set chart_json='{"forged":true}'
  where user_id='a2000000-0000-4000-8000-000000000001'::uuid$$,
  '42501', null, 'authenticated role cannot directly write chart/profile state');

-- Simulate worker claim/fence and publish under the trusted local role.
set local role service_role;
select public.person_enqueue_job((select id from public.astro_profiles where user_id=:'user_a'::uuid
  and name='P2 A'),'rebuild',1,1) as queued_job \gset
select is((:'queued_job'::jsonb->>'created')::boolean,true,'trusted enqueue captures the current revision as job base');
select public.person_claim_job((select id from public.person_jobs where profile_id=(select id from public.astro_profiles
  where user_id=:'user_a'::uuid and name='P2 A') and source_from_seq=1
  and job_kind='source_consolidation'),300) as first_claim \gset
select is((:'first_claim'::jsonb->>'claimed')::boolean,true,'worker receives first fenced source job');
select public.person_claim_job((:'queued_job'::jsonb->>'jobId')::uuid,300) as concurrent_claim \gset
select is((:'concurrent_claim'::jsonb->>'claimed')::boolean,true,'concurrent rebuild receives an independent lease fence');
set local role postgres;
insert into public.person_objects(id,user_id,profile_id,kind)
select :'object_id'::uuid, :'user_a'::uuid, id, 'episode' from public.astro_profiles
where user_id=:'user_a'::uuid and name='P2 A';
insert into public.person_object_versions(id,user_id,profile_id,object_id,version_no,
  epistemic_class,lifecycle,typed_payload)
select :'version_id'::uuid, :'user_a'::uuid, id, :'object_id'::uuid, 1,
  'reported','active','{"title":"Source-backed event"}'::jsonb
from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A';
set local role service_role;
select public.person_publish_revision(
  (select id from public.person_jobs where profile_id=(select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A')
    and job_kind='source_consolidation'),
  (:'first_claim'::jsonb->>'leaseToken')::uuid,
  (:'first_claim'::jsonb->>'fence')::bigint, 1, 0, :'commit_id'::uuid,
  jsonb_build_object('processedSourceSeq',1,'brief','A provisional brief',
    'objectMembers',jsonb_build_array(jsonb_build_object('objectId',:'object_id'::uuid,'versionId',:'version_id'::uuid)),
    'viewSnapshots',jsonb_build_array(jsonb_build_object('viewKey','life_map','snapshot',
      jsonb_build_object('personRevision',2,'sourceWatermark',1,'mode','personal','modeEpoch',0,
        'privacyEpoch',0,'updateState','current','view','life_map','objectId',null,
        'title','Life map','nodes',jsonb_build_array(),'edges',jsonb_build_array(),
        'explorationIds',jsonb_build_array(),'generatedAt',now())))));
select is((public.person_publish_revision(
  (select job_id from public.person_model_revisions where commit_id=:'commit_id'::uuid),
  (:'first_claim'::jsonb->>'leaseToken')::uuid,
  (:'first_claim'::jsonb->>'fence')::bigint,1,0,:'commit_id'::uuid,
  (select commit_request->'candidate' from public.person_model_revisions where commit_id=:'commit_id'::uuid)
)->>'replayed')::boolean,true,'exact publication retry returns the committed revision');
select throws_ok(format($$select public.person_publish_revision(
  %L::uuid,%L::uuid,%s,1,0,'a2000000-0000-4000-8000-000000000035'::uuid,
  '{"processedSourceSeq":1,"objectMembers":[]}'::jsonb)$$,
  (:'first_claim'::jsonb->>'jobId'),
  (:'first_claim'::jsonb->>'leaseToken'),
  ((:'first_claim'::jsonb->>'fence')::bigint + 1)),
  'PJF01',null,'stale worker fence cannot publish after lease ownership changes or completion');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select current_revision from public.person_model_heads where user_id=:'user_a'::uuid),
  2::bigint, 'successful publication advances the authoritative head');
select is((select count(*) from public.person_current_objects where user_id=:'user_a'::uuid),
  1::bigint, 'current projection exposes the published typed object');
select is((select count(*) from public.person_view_snapshots where user_id=:'user_a'::uuid
  and person_revision=2 and view_key='life_map'), 1::bigint,
  'view snapshot is persisted atomically with its published revision');
select is((public.person_read_projection(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  'life-map', null)->>'personRevision')::bigint, 2::bigint,
  'projection metadata is captured from the authoritative revision');
select is(jsonb_array_length(public.person_read_projection(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  'life-map', null)->'objects'), 1,
  'projection members are derived from the same immutable revision');
select public.person_start_exploration(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  :'object_id'::uuid, 2, :'exploration_command'::uuid) as exploration_result \gset
select is((:'exploration_result'::jsonb->>'personRevision')::bigint, 2::bigint,
  'exploration is bound to the exact selected person revision');
select is((select count(*) from public.astro_messages
  where session_id = (:'exploration_result'::jsonb->>'sessionId')::uuid), 0::bigint,
  'opening an exploration does not fabricate a user message');
select is((select object_version_id from public.person_exploration_contexts
  where id = (:'exploration_result'::jsonb->>'contextId')::uuid), :'version_id'::uuid,
  'exploration context points to the exact revision object version');
select is((public.person_start_exploration(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  :'object_id'::uuid, 2, :'exploration_command'::uuid)->>'replayed')::boolean, true,
  'identical exploration command replays its durable receipt');
select throws_ok($$select public.person_start_exploration(
  (select id from public.astro_profiles where user_id='a2000000-0000-4000-8000-000000000001'::uuid and name='P2 A'),
  'a2000000-0000-4000-8000-000000000099'::uuid, 2,
  'a2000000-0000-4000-8000-000000000015'::uuid)$$,
  'PDC01', null, 'exploration command ID cannot be replayed with a changed object');
select is((select message_id from public.person_search_conversations(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  'source message', null, null, 20) limit 1),
  (select id from public.astro_messages where user_id=:'user_a'::uuid and content='P2 source message'),
  'conversation search returns the precise matching message anchor');
select throws_ok($$insert into public.person_exploration_contexts
  (user_id,profile_id,session_id,person_revision,object_id,object_version_id,
   mode_epoch,privacy_epoch,command_id)
  select user_id,profile_id,id,2,'a2000000-0000-4000-8000-000000000020'::uuid,
    'a2000000-0000-4000-8000-000000000021'::uuid,0,0,
    'a2000000-0000-4000-8000-000000000016'::uuid
  from public.astro_sessions where id=(
    select id from public.astro_sessions order by created_at desc limit 1)$$,
  '42501', null, 'authenticated role cannot directly forge exploration context');
select id as owner_profile from public.astro_profiles
  where user_id=:'user_a'::uuid and name='P2 A' \gset
set local request.jwt.claims = '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(format($$select public.person_search_conversations(%L::uuid,'source message',null,null,20)$$,
  :'owner_profile'),
  'ANF01', null, 'another user cannot search the owner conversation archive');
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((public.person_set_preferences(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  true, '{}'::jsonb, '', 0,
  'a2000000-0000-4000-8000-000000000040'::uuid)->>'status'),
  'updated', 'preference change accepts the expected mode epoch and returns a typed receipt');
select throws_ok($$select public.person_set_preferences(
  (select id from public.astro_profiles where user_id='a2000000-0000-4000-8000-000000000001'::uuid and name='P2 A'),
  false, '{}'::jsonb, '', 0,
  'a2000000-0000-4000-8000-000000000041'::uuid)$$,
  'PST01', null, 'concurrent stale preference update loses the compare-and-set');
select is((select mode_epoch from public.person_preferences where user_id=:'user_a'::uuid),
  1::bigint, 'stale preference attempt leaves winning mode epoch unchanged');
select is((public.person_read_projection(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  'life-map', null)->>'updateState'), 'updating',
  'projection marks old-mode revision as updating after a mode toggle');
select is(jsonb_array_length(public.person_read_projection(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  'life-map', null)->'objects'), 0,
  'projection withholds all objects from the old-mode revision');

-- Isolate the privacy check while keeping preference and revision mode epochs
-- equal. The fixture restores both values before the remaining cases run.
set local role postgres;
update public.person_model_revisions set mode_epoch=1
where profile_id=(select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A')
  and user_id=:'user_a'::uuid and revision_no=2;
update public.person_model_heads set privacy_epoch=1
where profile_id=(select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A')
  and user_id=:'user_a'::uuid;
set local role authenticated;
select is((public.person_read_projection(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  'life-map', null)->>'updateState'), 'updating',
  'projection marks privacy-epoch mismatch as updating');
select is(jsonb_array_length(public.person_read_projection(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  'life-map', null)->'objects'), 0,
  'projection withholds all objects from the old-privacy revision');
set local role postgres;
update public.person_model_revisions set mode_epoch=0
where profile_id=(select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A')
  and user_id=:'user_a'::uuid and revision_no=2;
update public.person_model_heads set privacy_epoch=0
where profile_id=(select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A')
  and user_id=:'user_a'::uuid;
set local role authenticated;

select is((public.person_submit_change(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  :'change_command'::uuid, 2,
  jsonb_build_object('kind','correct_account','targetObjectId',:'object_id'::uuid,
    'payload',jsonb_build_object('kind','episode','title','Corrected source-backed event'))
)->>'status'), 'accepted', 'typed correction is recorded as an accepted owner command');
select is((select count(*) from public.person_current_objects where user_id=:'user_a'::uuid),
  0::bigint, 'accepted correction invalidates the published object immediately');
select is((public.person_submit_change(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A'),
  :'change_command'::uuid, 2,
  jsonb_build_object('kind','correct_account','targetObjectId',:'object_id'::uuid,
    'payload',jsonb_build_object('kind','episode','title','Corrected source-backed event'))
)->>'replayed')::boolean, true, 'identical typed command replays its original receipt');
select throws_ok($$select public.person_submit_change(
  (select id from public.astro_profiles where user_id='a2000000-0000-4000-8000-000000000001'::uuid and name='P2 A'),
  'a2000000-0000-4000-8000-000000000014'::uuid, 2,
  '{"kind":"correct_account","targetObjectId":"a2000000-0000-4000-8000-000000000020","payload":{"kind":"episode","title":"Changed body"}}'::jsonb)$$,
  'PDC01', null, 'same command key with changed typed body is rejected');

set local role service_role;
select public.person_claim_job((select (result->>'job_id')::uuid from public.person_command_ledger
  where command_id=:'change_command'::uuid),300) as correction_claim \gset
set local role postgres;
insert into public.person_object_versions(id,user_id,profile_id,object_id,version_no,
  epistemic_class,lifecycle,typed_payload)
select 'a2000000-0000-4000-8000-000000000022'::uuid,:'user_a'::uuid,id,:'object_id'::uuid,2,
  'reported','active','{"title":"Corrected event"}'::jsonb
from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 A';
set local role service_role;
select public.person_publish_revision(
  (select (result->>'job_id')::uuid from public.person_command_ledger where command_id=:'change_command'::uuid),
  (:'correction_claim'::jsonb->>'leaseToken')::uuid,
  (:'correction_claim'::jsonb->>'fence')::bigint,2,1,'a2000000-0000-4000-8000-000000000032'::uuid,
  jsonb_build_object('processedSourceSeq',2,'brief','Corrected brief',
    'objectMembers',jsonb_build_array(jsonb_build_object('objectId',:'object_id'::uuid,'versionId','a2000000-0000-4000-8000-000000000022'::uuid)),
    'resolveChangeIds',jsonb_build_array((select (result->>'change_id')::uuid
      from public.person_command_ledger where command_id=:'change_command'::uuid))));

select throws_ok(format($$select public.person_publish_revision(
  %L::uuid,%L::uuid,%s,1,0,
  'a2000000-0000-4000-8000-000000000034'::uuid,
  '{"processedSourceSeq":2,"brief":"stale base","objectMembers":[]}'::jsonb)$$,
  (:'concurrent_claim'::jsonb->>'jobId'),
  (:'concurrent_claim'::jsonb->>'leaseToken'),
  (:'concurrent_claim'::jsonb->>'fence')::bigint),
  'PST01', null, 'stale-base publication is rejected after another revision wins');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select current_revision from public.person_model_heads where user_id=:'user_a'::uuid),
  3::bigint, 'correction resolution atomically publishes the next revision');
select is((select count(*) from public.person_current_objects where user_id=:'user_a'::uuid),
  1::bigint, 'resolved correction restores the newly published version to current view');
select * from finish();
rollback;
