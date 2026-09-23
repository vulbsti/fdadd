-- Prove a stale job can rebase over a competing publication without losing
-- the newly published model membership or its own still-unprocessed input.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;
select plan(8);

\set user_a c2000000-0000-4000-8000-000000000001
\set profile_command c2000000-0000-4000-8000-000000000010
\set first_commit c2000000-0000-4000-8000-000000000011
\set second_commit c2000000-0000-4000-8000-000000000012
\set source_one c2000000-0000-4000-8000-000000000013
\set source_two c2000000-0000-4000-8000-000000000014
\set object_one c2000000-0000-4000-8000-000000000020
\set version_one c2000000-0000-4000-8000-000000000021
\set object_two c2000000-0000-4000-8000-000000000022
\set version_two c2000000-0000-4000-8000-000000000023

set local role postgres;
insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, role)
values (:'user_a'::uuid, 'p2-rebase@example.invalid', 'p2-fixture', now(), now(), now(), 'authenticated');
select ok(not has_function_privilege('authenticated',
  'public.person_rebase_job(uuid,uuid,bigint)', 'EXECUTE')
  and has_function_privilege('service_role',
  'public.person_rebase_job(uuid,uuid,bigint)', 'EXECUTE'),
  'rebase RPC is granted only to the trusted service role');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.person_create('P2 rebase', :'profile_command'::uuid);
select public.create_astro_session((select id from public.astro_profiles
  where user_id=:'user_a'::uuid and name='P2 rebase'));
insert into public.astro_messages (user_id, session_id, role, content, client_message_id)
select :'user_a'::uuid, s.id, 'user', 'first source', :'source_one'::uuid
from public.astro_sessions s join public.astro_profiles p on p.id=s.profile_id
where p.user_id=:'user_a'::uuid and p.name='P2 rebase';
insert into public.astro_messages (user_id, session_id, role, content, client_message_id)
select :'user_a'::uuid, s.id, 'user', 'second source', :'source_two'::uuid
from public.astro_sessions s join public.astro_profiles p on p.id=s.profile_id
where p.user_id=:'user_a'::uuid and p.name='P2 rebase';

set local role service_role;
select public.person_enqueue_job(
  (select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 rebase'),
  'rebuild', 1, 2) as rebuild_enqueue \gset
select public.person_claim_job((select id from public.person_jobs where profile_id=(
  select id from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 rebase')
  and job_kind='source_consolidation' and source_from_seq=1), 300) as first_claim \gset
select public.person_claim_job((:'rebuild_enqueue'::jsonb->>'jobId')::uuid, 300) as stale_claim \gset
select is((:'stale_claim'::jsonb->>'baseRevision')::bigint, 1::bigint,
  'overlapping job starts from the same base as the winning job');

set local role postgres;
insert into public.person_objects(id,user_id,profile_id,kind)
select :'object_one'::uuid, :'user_a'::uuid, id, 'episode' from public.astro_profiles
where user_id=:'user_a'::uuid and name='P2 rebase';
insert into public.person_object_versions(id,user_id,profile_id,object_id,version_no,
  epistemic_class,lifecycle,typed_payload)
select :'version_one'::uuid, :'user_a'::uuid, id, :'object_one'::uuid, 1,
  'reported','active','{"title":"first source item"}'::jsonb
from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 rebase';
set local role service_role;
select public.person_publish_revision(
  (:'first_claim'::jsonb->>'jobId')::uuid,
  (:'first_claim'::jsonb->>'leaseToken')::uuid,
  (:'first_claim'::jsonb->>'fence')::bigint, 1, 0, :'first_commit'::uuid,
  jsonb_build_object('processedSourceSeq',1,'brief','First candidate',
    'objectMembers',jsonb_build_array(jsonb_build_object(
      'objectId',:'object_one'::uuid,'versionId',:'version_one'::uuid))));
select throws_ok(format($$select public.person_publish_revision(
  %L::uuid,%L::uuid,%s,1,0,'c2000000-0000-4000-8000-000000000030'::uuid,
  '{"processedSourceSeq":2,"objectMembers":[]}'::jsonb)$$,
  (:'stale_claim'::jsonb->>'jobId'), (:'stale_claim'::jsonb->>'leaseToken'),
  (:'stale_claim'::jsonb->>'fence')::bigint),
  'PST01', null, 'competing publication makes the old-base candidate stale');

select public.person_rebase_job((:'stale_claim'::jsonb->>'jobId')::uuid,
  (:'stale_claim'::jsonb->>'leaseToken')::uuid,
  (:'stale_claim'::jsonb->>'fence')::bigint) as rebased \gset
select is((:'rebased'::jsonb->>'status'), 'pending', 'valid stale job is safely requeued');
select is((:'rebased'::jsonb->>'baseRevision')::bigint, 2::bigint,
  'requeued job is based on the new authoritative head');
select is((:'rebased'::jsonb->>'sourceFromSeq')::bigint, 2::bigint,
  'already processed prefix is trimmed while unprocessed source remains');
select throws_ok(format($$select public.person_rebase_job(%L::uuid,%L::uuid,%s)$$,
  (:'stale_claim'::jsonb->>'jobId'), (:'stale_claim'::jsonb->>'leaseToken'),
  (:'stale_claim'::jsonb->>'fence')::bigint),
  'PJF01', null, 'pre-rebase worker token/fence cannot requeue the new pending attempt');

select public.person_claim_job((:'stale_claim'::jsonb->>'jobId')::uuid, 300) as reclaimed \gset
set local role postgres;
insert into public.person_objects(id,user_id,profile_id,kind)
select :'object_two'::uuid, :'user_a'::uuid, id, 'episode' from public.astro_profiles
where user_id=:'user_a'::uuid and name='P2 rebase';
insert into public.person_object_versions(id,user_id,profile_id,object_id,version_no,
  epistemic_class,lifecycle,typed_payload)
select :'version_two'::uuid, :'user_a'::uuid, id, :'object_two'::uuid, 1,
  'reported','active','{"title":"second source item"}'::jsonb
from public.astro_profiles where user_id=:'user_a'::uuid and name='P2 rebase';
set local role service_role;
select public.person_publish_revision(
  (:'reclaimed'::jsonb->>'jobId')::uuid,
  (:'reclaimed'::jsonb->>'leaseToken')::uuid,
  (:'reclaimed'::jsonb->>'fence')::bigint, 2, 0, :'second_commit'::uuid,
  jsonb_build_object('processedSourceSeq',2,'brief','Merged candidate',
    'objectMembers',jsonb_build_array(
      jsonb_build_object('objectId',:'object_one'::uuid,'versionId',:'version_one'::uuid),
      jsonb_build_object('objectId',:'object_two'::uuid,'versionId',:'version_two'::uuid))));

set local role authenticated;
set local request.jwt.claims = '{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.person_current_objects where user_id=:'user_a'::uuid),
  2::bigint, 'rebased candidate includes prior revision membership plus its new change');
select * from finish();
rollback;
