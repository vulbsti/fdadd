-- A chat message's job covers every source after the published watermark, so
-- a job that failed for good cannot block later messages from publishing.
begin;
set search_path = public;
\pset tuples_only on
\pset format unaligned
select '1..5';

set local role postgres;
insert into auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,role)
values ('3c300000-0000-4000-8000-000000000001','p3-gap@example.invalid','fixture',now(),now(),now(),'authenticated');

set local role authenticated;
set local request.jwt.claims = '{"sub":"3c300000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.person_create('P3 gap', '3c300000-0000-4000-8000-000000000010'::uuid);
select public.create_astro_session((select id from public.astro_profiles
  where user_id='3c300000-0000-4000-8000-000000000001'::uuid and name='P3 gap'));
insert into public.astro_messages(user_id,session_id,role,content,client_message_id)
select '3c300000-0000-4000-8000-000000000001'::uuid,s.id,'user',m.content,m.client_id
from public.astro_sessions s join public.astro_profiles p on p.id=s.profile_id
cross join (values ('A message whose update fails for good.','3c300000-0000-4000-8000-000000000011'::uuid),
  ('A later message.','3c300000-0000-4000-8000-000000000012'::uuid)) as m(content,client_id)
where p.user_id='3c300000-0000-4000-8000-000000000001'::uuid and p.name='P3 gap';

set local role postgres;
select id as profile_id from public.astro_profiles
  where user_id='3c300000-0000-4000-8000-000000000001'::uuid and name='P3 gap' \gset
select id as first_job from public.person_jobs where profile_id=:'profile_id' and source_to_seq=1 \gset
select id as second_job from public.person_jobs where profile_id=:'profile_id' and source_to_seq=2 \gset

select case when (select source_from_seq from public.person_jobs where id=:'second_job') = 1
  then 'ok 1 - a later message job starts at the first unpublished source'
  else 'not ok 1 - a later message job starts at the first unpublished source' end;

-- The first job fails for good.
update public.person_jobs set state='failed', attempt_count=max_attempts, completed_at=now() where id=:'first_job';

-- The second job covers both sources. Even when it, too, can only skip them
-- (as the worker does after repeated content failures), it publishes past them.
select public.person_claim_job(:'second_job'::uuid, 600) as claim \gset
select public.person_record_stage_receipt(:'second_job'::uuid, (:'claim'::jsonb->>'leaseToken')::uuid,
  (:'claim'::jsonb->>'fence')::bigint, 'skip:verify', 'publish', 'job', 'skipped', null, null, null, null,
  'fixture-guidance', 'fixture-policy', '{"attempt":5}'::jsonb, 'Skipped after 5 failed attempts.', 'malformed_stage_output') \gset
select public.person_record_source_outcomes(:'second_job'::uuid, (:'claim'::jsonb->>'leaseToken')::uuid,
  (:'claim'::jsonb->>'fence')::bigint,
  (select jsonb_agg(jsonb_build_object('sourceId',s.id,'outcome','partial','outcomeCode','skipped_after_failures','findingRefs','[]'::jsonb))
    from public.person_source_items s where s.profile_id=:'profile_id')) as outcomes \gset
select case when :outcomes = 2
  then 'ok 2 - both sources in the widened range accept outcomes'
  else 'not ok 2 - both sources in the widened range accept outcomes' end;

select public.person_stage_consolidation_candidate(:'second_job'::uuid, (:'claim'::jsonb->>'leaseToken')::uuid,
  (:'claim'::jsonb->>'fence')::bigint, jsonb_build_object(
    'baseRevision',(:'claim'::jsonb->>'baseRevision')::bigint,'privacyEpoch',(:'claim'::jsonb->>'privacyEpoch')::bigint,
    'modeEpoch',(:'claim'::jsonb->>'modeEpoch')::bigint,'processedSourceSeq',2,'schemaVersion','person-consolidation.v1',
    'observations','[]'::jsonb,'objects','[]'::jsonb,'objectSupport','[]'::jsonb,'relations','[]'::jsonb,'relationSupport','[]'::jsonb,
    'publication',jsonb_build_object('processedSourceSeq',2,'objectMembers','[]'::jsonb,'relationMembers','[]'::jsonb,
      'conflictIds','[]'::jsonb,'resolveChangeIds','[]'::jsonb,'brief','','changedIds','[]'::jsonb,
      'decisionSummary','Fixture skip.','verifierReceipt','{}'::jsonb)),
  '[]'::jsonb) as candidate_id \gset
select public.person_publish_staged_candidate(:'second_job'::uuid, (:'claim'::jsonb->>'leaseToken')::uuid,
  (:'claim'::jsonb->>'fence')::bigint, :'candidate_id'::uuid, gen_random_uuid()) as published \gset

select case when (select processed_source_seq from public.person_model_heads where profile_id=:'profile_id') = 2
  then 'ok 3 - the head moves past the source whose own job failed'
  else 'not ok 3 - the head moves past the source whose own job failed' end;
select case when (select state from public.person_jobs where id=:'second_job') = 'completed'
  then 'ok 4 - the widened job completes'
  else 'not ok 4 - the widened job completes' end;

-- A message after publication starts right after the new watermark.
set local role authenticated;
insert into public.astro_messages(user_id,session_id,role,content,client_message_id)
select '3c300000-0000-4000-8000-000000000001'::uuid,s.id,'user','A third message.','3c300000-0000-4000-8000-000000000013'::uuid
from public.astro_sessions s where s.profile_id=:'profile_id';
set local role postgres;
select case when (select source_from_seq from public.person_jobs where profile_id=:'profile_id' and source_to_seq=3) = 3
  then 'ok 5 - a message after publication covers only its own source'
  else 'not ok 5 - a message after publication covers only its own source' end;

rollback;
