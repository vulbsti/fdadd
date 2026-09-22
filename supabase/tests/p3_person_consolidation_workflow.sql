-- P3 attempt fencing, source accounting and atomic publication contract.
-- Local disposable DB only; rollback leaves no fixture rows.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;
select no_plan();

\set owner 3a300000-0000-4000-8000-000000000001
\set other 3a300000-0000-4000-8000-000000000002
\set create_command 3a300000-0000-4000-8000-000000000010
\set failure_create_command 3a300000-0000-4000-8000-000000000015
\set first_client 3a300000-0000-4000-8000-000000000011
\set second_client 3a300000-0000-4000-8000-000000000012
\set failure_client 3a300000-0000-4000-8000-000000000016
\set job_command 3a300000-0000-4000-8000-000000000013
\set commit_id 3a300000-0000-4000-8000-000000000014
\set object_id 3a300000-0000-4000-8000-000000000020
\set version_id 3a300000-0000-4000-8000-000000000021
\set observation_id 3a300000-0000-4000-8000-000000000022

set local role postgres;
insert into auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,role)
values (:'owner'::uuid,'p3-fixture-owner@example.invalid','p3-fixture',now(),now(),now(),'authenticated'),
       (:'other'::uuid,'p3-fixture-other@example.invalid','p3-fixture',now(),now(),now(),'authenticated');
select has_table('public','person_job_stage_receipts','attempt-scoped stage receipts exist');
select has_table('public','person_job_source_outcomes','source outcome ledger exists');
select has_table('public','person_consolidation_candidates','durable candidate manifests exist');
select has_table('public','person_candidate_findings','typed verifier findings exist');
select has_table('public','person_job_failure_receipts','recoverable failure receipts exist');
select ok(not has_table_privilege('authenticated','public.person_job_stage_receipts','select'),
  'operational stage receipts are not exposed to authenticated table reads');
select ok(not has_function_privilege('authenticated','public.person_publish_staged_candidate(uuid,uuid,bigint,uuid,uuid)','execute'),
  'browser role cannot publish candidates');
select ok(has_function_privilege('authenticated','public.person_read_object_sources(uuid,uuid)','execute'),
  'authenticated owner can call the security-invoker source drawer');

set local role authenticated;
set local request.jwt.claims = '{"sub":"3a300000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.person_create('P3 disposable', :'create_command'::uuid);
select public.create_astro_session((select id from public.astro_profiles where user_id=:'owner'::uuid and name='P3 disposable'));
insert into public.astro_messages(user_id,session_id,role,content,client_message_id)
select :'owner'::uuid,s.id,'user','I imagined a hypothetical account for this fixture.', :'first_client'::uuid
from public.astro_sessions s join public.astro_profiles p on p.id=s.profile_id
where p.user_id=:'owner'::uuid and p.name='P3 disposable';
insert into public.astro_messages(user_id,session_id,role,content,client_message_id)
select :'owner'::uuid,s.id,'user','A second source completes the bounded range.', :'second_client'::uuid
from public.astro_sessions s join public.astro_profiles p on p.id=s.profile_id
where p.user_id=:'owner'::uuid and p.name='P3 disposable';
select is((select publication_state from public.person_model_heads h join public.astro_profiles p on p.id=h.profile_id
  where p.user_id=:'owner'::uuid and p.name='P3 disposable'),'stale',
  'accepting sources immediately marks the model as updating');

set local role service_role;
select public.person_enqueue_job((select id from public.astro_profiles where user_id=:'owner'::uuid and name='P3 disposable'),
  'rebuild',1,2) as enqueue_result \gset
select public.person_claim_job((:'enqueue_result'::jsonb->>'jobId')::uuid,300) as claim \gset
select is((:'claim'::jsonb->>'claimed')::boolean,true,'bounded job obtains a worker lease');
select public.person_record_stage_receipt((:'claim'::jsonb->>'jobId')::uuid,
  (:'claim'::jsonb->>'leaseToken')::uuid,(:'claim'::jsonb->>'fence')::bigint,
  'extract:0','extract','chunk-0','succeeded',null,null,'test-provider','test-model','g1','p1',
  '{"latencyMs":12,"inputTokens":5,"outputTokens":3}'::jsonb,'two source records extracted',null);
select is((select count(*) from public.person_job_stage_receipts r where r.job_id=(:'claim'::jsonb->>'jobId')::uuid
  and r.fence=(:'claim'::jsonb->>'fence')::bigint),1::bigint,'stage result and operational metrics persist by fence');
select throws_ok(format($$select public.person_record_stage_receipt(%L::uuid,%L::uuid,%s,'stale','extract','all','succeeded',null,null,null,null,null,null,'{}','',null)$$,
  (:'claim'::jsonb->>'jobId'),( :'claim'::jsonb->>'leaseToken'),((:'claim'::jsonb->>'fence')::bigint-1)),
  'PJF01',null,'a prior fencing token cannot append a new stage receipt');

select public.person_record_source_outcomes((:'claim'::jsonb->>'jobId')::uuid,
  (:'claim'::jsonb->>'leaseToken')::uuid,(:'claim'::jsonb->>'fence')::bigint,
  jsonb_build_array(jsonb_build_object('sourceId',(select id from public.person_source_items where profile_id=(select id from public.astro_profiles where user_id=:'owner'::uuid and name='P3 disposable') and source_seq=1),'outcome','handled')));
select public.person_stage_consolidation_candidate((:'claim'::jsonb->>'jobId')::uuid,
  (:'claim'::jsonb->>'leaseToken')::uuid,(:'claim'::jsonb->>'fence')::bigint,
  jsonb_build_object('processedSourceSeq',2,'modeEpoch',0,'privacyEpoch',0,'schemaVersion','p3-test-v1',
    'guidanceVersion','test-guidance','modelPolicyVersion','test-policy','provider','test-provider','model','test-model',
    'observations',jsonb_build_array(jsonb_build_object('sourceId',(select id from public.person_source_items where profile_id=(select id from public.astro_profiles where user_id=:'owner'::uuid and name='P3 disposable') and source_seq=1),
      'observationId',:'observation_id'::uuid,'spanStart',0,'spanEnd',24,'exactQuote','I imagined a hypothetical','normalizedAssertion','A hypothetical example was discussed',
      'subjectKind','hypothetical','assertionType','direct','domain','life','timePrecision','unknown')),
    'objects',jsonb_build_array(jsonb_build_object('objectId',:'object_id'::uuid,'kind','episode','versionId',:'version_id'::uuid,
      'versionNo',1,'epistemicClass','reported','lifecycle','active','typedPayload',jsonb_build_object('title','Hypothetical fixture'))),
    'objectSupport',jsonb_build_array(jsonb_build_object('versionId',:'version_id'::uuid,
      'observationId',:'observation_id'::uuid,
      'relation','supports','note','Directly attributed source')),
    'publication',jsonb_build_object('brief','A bounded P3 test profile.','objectMembers',jsonb_build_array(jsonb_build_object(
      'objectId',:'object_id'::uuid,'versionId',:'version_id'::uuid))))
  ,jsonb_build_array(jsonb_build_object('fieldPath','object/'||:'object_id','code','source_semantics','severity','info',
    'decision','accept','sourceRefs',jsonb_build_array((select id from public.person_source_items where profile_id=(select id from public.astro_profiles where user_id=:'owner'::uuid and name='P3 disposable') and source_seq=1)),
    'rationale','The source supports the reported fact that a hypothetical was discussed, not that its content happened to the owner.'))) as candidate \gset
select throws_ok(format($$select public.person_publish_staged_candidate(%L::uuid,%L::uuid,%s,%L::uuid,'3a300000-0000-4000-8000-000000000014'::uuid)$$,
  (:'claim'::jsonb->>'jobId'),(:'claim'::jsonb->>'leaseToken'),(:'claim'::jsonb->>'fence'),(:'candidate'::uuid)),
  'PSQ01',null,'watermark cannot jump over source sequence two without a terminal outcome');
select public.person_record_source_outcomes((:'claim'::jsonb->>'jobId')::uuid,
  (:'claim'::jsonb->>'leaseToken')::uuid,(:'claim'::jsonb->>'fence')::bigint,
  jsonb_build_array(jsonb_build_object('sourceId',(select id from public.person_source_items where profile_id=(select id from public.astro_profiles where user_id=:'owner'::uuid and name='P3 disposable') and source_seq=2),'outcome','partial','outcomeCode','independent_part_published')));
set local role postgres;
update public.person_jobs set last_error_code='previous_retry_failure'
where id=(:'claim'::jsonb->>'jobId')::uuid;
set local role service_role;
select is((public.person_publish_staged_candidate((:'claim'::jsonb->>'jobId')::uuid,
  (:'claim'::jsonb->>'leaseToken')::uuid,(:'claim'::jsonb->>'fence')::bigint,(:'candidate'::uuid),:'commit_id'::uuid)->>'published')::boolean,
  true,'verified candidate atomically materializes typed rows and publishes membership');
select is((select last_error_code from public.person_jobs where id=(:'claim'::jsonb->>'jobId')::uuid),
  null::text,'successful publication clears any stale retry error metadata');
select is((select count(*) from public.person_revision_objects ro join public.astro_profiles p on p.id=ro.profile_id
  where p.user_id=:'owner'::uuid and ro.revision_no=2),1::bigint,'published object membership is committed with the revision');
set local role authenticated;
set local request.jwt.claims = '{"sub":"3a300000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select subject_kind from public.person_observations where id=:'observation_id'::uuid),
  'hypothetical','typed subject attribution is persisted without coercing it to self or other');
select is((select normalized_assertion #>> '{text}' from public.person_observations where id=:'observation_id'::uuid),
  'A hypothetical example was discussed','string assertion payload is normalized into the stable object shape');
select is((public.person_read_object_sources((select id from public.astro_profiles where user_id=:'owner'::uuid and name='P3 disposable'),:'object_id'::uuid)
  #>> '{sources,0,quote}'),'I imagined a hypothetical','current source drawer returns the verified direct user span');
select is((public.person_read_object_sources((select id from public.astro_profiles where user_id=:'owner'::uuid and name='P3 disposable'),:'object_id'::uuid)
  #>> '{sources,0,subjectKind}'),'hypothetical','source drawer preserves epistemic subject attribution');

-- Wrong mode/base metadata is rejected before a candidate can be accepted.
set local role service_role;
select public.person_enqueue_job((select id from public.astro_profiles where user_id=:'owner'::uuid and name='P3 disposable'),
  'correction',1,2) as enqueue2 \gset
select public.person_claim_job((:'enqueue2'::jsonb->>'jobId')::uuid,300) as claim2 \gset
select throws_ok(format($$select public.person_stage_consolidation_candidate(%L::uuid,%L::uuid,%s,
  '{"processedSourceSeq":2,"privacyEpoch":0,"modeEpoch":99}', '[]'::jsonb)$$,
  (:'claim2'::jsonb->>'jobId'),(:'claim2'::jsonb->>'leaseToken'),(:'claim2'::jsonb->>'fence')),
  'PST01',null,'candidate with stale mode epoch cannot be staged');
select throws_ok(format($$select public.person_record_stage_receipt(%L::uuid,%L::uuid,%s,'bad','extract','all','succeeded',null,null,null,null,null,null,'{}','',null)$$,
  (:'claim2'::jsonb->>'jobId'),(:'claim2'::jsonb->>'leaseToken'),((:'claim2'::jsonb->>'fence')::bigint-1)),
  'PJF01',null,'old lease cannot mutate the new job attempt');

-- Retry is bounded and records why; terminal failure is a user-visible blocked state.
select public.person_fail_or_retry_job((:'claim2'::jsonb->>'jobId')::uuid,
  (:'claim2'::jsonb->>'leaseToken')::uuid,(:'claim2'::jsonb->>'fence')::bigint,
  'extract','provider',true,false,'provider_unavailable','Learning is paused and can be retried.', '{"retryAfter":"bounded"}'::jsonb) as retry_receipt \gset
select is((:'retry_receipt'::jsonb->>'state'),'pending','retryable provider failure returns work to pending');
select is((select state from public.person_outbox o where o.job_id=(:'claim2'::jsonb->>'jobId')::uuid
  and o.event_type='person.input.accepted'),'pending','retryable job failure re-arms its durable dispatch outbox');
select is((select count(*) from public.person_job_failure_receipts r where r.job_id=(:'claim2'::jsonb->>'jobId')::uuid),
  1::bigint,'failure receipt persists separately from operational logs');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"3a300000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.person_job_failure_receipts r where r.user_id=:'owner'::uuid),
  0::bigint,'another authenticated user cannot read failure receipts');

-- A non-retryable terminal failure with no other active job makes the
-- projection visibly blocked, while the previous retryable case stayed pending.
set local role authenticated;
set local request.jwt.claims = '{"sub":"3a300000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.person_create('P3 failure', :'failure_create_command'::uuid);
select public.create_astro_session((select id from public.astro_profiles where user_id=:'owner'::uuid and name='P3 failure'));
insert into public.astro_messages(user_id,session_id,role,content,client_message_id)
select :'owner'::uuid,s.id,'user','Disposable terminal failure source.',:'failure_client'::uuid
from public.astro_sessions s join public.astro_profiles p on p.id=s.profile_id
where p.user_id=:'owner'::uuid and p.name='P3 failure';
set local role service_role;
select public.person_claim_job((select id from public.person_jobs where profile_id=(select id from public.astro_profiles
  where user_id=:'owner'::uuid and name='P3 failure') and job_kind='source_consolidation'),300) as failure_claim \gset
select public.person_fail_or_retry_job((:'failure_claim'::jsonb->>'jobId')::uuid,
  (:'failure_claim'::jsonb->>'leaseToken')::uuid,(:'failure_claim'::jsonb->>'fence')::bigint,
  'verify','verification_exhausted',false,false,'verification_rejected','Learning needs review before it can continue.', '{}'::jsonb) as terminal_receipt \gset
select is((:'terminal_receipt'::jsonb->>'terminal')::boolean,true,'non-retryable verification failure is terminal');
select is((select publication_state from public.person_model_heads h join public.astro_profiles p on p.id=h.profile_id
  where p.user_id=:'owner'::uuid and p.name='P3 failure'),'blocked',
  'terminal failure blocks only when no other pending or leased job remains');

select * from finish();
rollback;
