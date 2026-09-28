-- Local transaction-only synthetic fixture; never a remote smoke test.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;
select no_plan();
\set owner 4a300000-0000-4000-8000-000000000001
\set run 4a300000-0000-4000-8000-000000000002
set local role postgres;
insert into auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,role)
values (:'owner'::uuid,'pi-fixture@example.invalid','fixture',now(),now(),now(),'authenticated');
set local role authenticated;
set local request.jwt.claims = '{"sub":"4a300000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.person_create('Pi transaction fixture','4a300000-0000-4000-8000-000000000003');
select id as person from public.astro_profiles where user_id=:'owner'::uuid \gset
select public.create_astro_session(:'person');
select id as session from public.astro_sessions where profile_id=:'person'::uuid \gset
select ok(not has_table_privilege('authenticated','public.pi_workspace_checkpoints','select'),'checkpoint index is not browser-readable');
select ok(not has_function_privilege('authenticated','public.worker_save_pi_checkpoint(uuid,bigint,bigint,bigint,bigint,text,text,boolean)','execute'),'browser cannot write checkpoint receipts');
select ok(not has_function_privilege('authenticated','public.worker_finish_pi_run(uuid,bigint,bigint,bigint,bigint,text,jsonb,jsonb)','execute'),'browser cannot publish answers');
select ok(not has_table_privilege('authenticated','public.astro_profile_calculations','select'),'calculations are server-only');
select ok(not has_table_privilege('authenticated','public.person_theory_of_mind','select'),'theory of mind is server-only');
select ok(not has_function_privilege('authenticated','public.finish_session_reflection(uuid,timestamptz,integer,text,text,bigint)','execute'),'browser cannot write the theory of mind');
set local role service_role;
insert into public.astro_agent_runs(id,user_id,profile_id,session_id,kind,status,client_request_id)
values(:'run',:'owner',:'person',:'session','question','active','4a300000-0000-4000-8000-000000000004');
select mode_epoch as mode,privacy_epoch as privacy,p.birth_revision as birth from public.person_model_heads h join public.astro_profiles p on p.id=h.profile_id where h.profile_id=:'person'::uuid \gset
select :'owner'||'/'||:'person'||'/'||:'run'||'/'||repeat('a',64)||'.json' as artifact \gset
select lives_ok(format('select public.worker_save_pi_checkpoint(%L,1,%s,%s,%s,%L,%L,false)',:'run',:mode,:privacy,:birth,:'artifact',repeat('a',64)),'first checkpoint commits');
select lives_ok(format('select public.worker_save_pi_checkpoint(%L,1,%s,%s,%s,%L,%L,false)',:'run',:mode,:privacy,:birth,:'artifact',repeat('a',64)),'same receipt replay is idempotent');
select throws_ok(format('select public.worker_save_pi_checkpoint(%L,1,%s,%s,%s,%L,%L,false)',:'run',:mode,:privacy,:birth,replace(:'artifact',repeat('a',64),repeat('b',64)),repeat('b',64)), 'P0001','stale checkpoint','same sequence cannot replace bytes');
select throws_ok(format('select public.worker_save_pi_checkpoint(%L,2,%s,%s,%s,%L,%L,false)',:'run',:mode+1,:privacy,:birth,:'artifact',repeat('a',64)), 'P0001','workspace authority changed','stale mode cannot checkpoint');
select throws_ok(format('select public.worker_save_pi_checkpoint(%L,2,%s,%s,%s,%L,%L,false)',:'run',:mode,:privacy,:birth,'another-owner/file.json',repeat('a',64)), 'P0001','invalid artifact address','artifact path must belong to the run');
select lives_ok(format('select public.worker_save_pi_checkpoint(%L,2,%s,%s,%s,%L,%L,true)',:'run',:mode,:privacy,:birth,:'artifact',repeat('a',64)),'final checkpoint commits');
select throws_ok(format('select public.worker_save_pi_checkpoint(%L,3,%s,%s,%s,%L,%L,false)',:'run',:mode,:privacy,:birth,:'artifact',repeat('a',64)), 'P0001','stale checkpoint','a final checkpoint cannot regress');
select ok(not has_table_privilege('authenticated','public.pi_run_events','select'),'live run events are not browser-readable');
select ok(not has_table_privilege('authenticated','public.pi_memory_proposals','insert'),'browser cannot write memory proposals');
select lives_ok(format('insert into public.pi_run_events(run_id,seq,user_id,profile_id,kind,text) values (%L,1,%L,%L,%L,%L)',:'run',:'owner',:'person','text_delta','Hello'),'worker records a live text delta');
select throws_ok(format('insert into public.pi_run_events(run_id,seq,user_id,profile_id,kind) values (%L,1,%L,%L,%L)',:'run',:'owner',:'person','tool_start'),'23505',null,'live event sequence cannot be rewritten');
select throws_ok(format('insert into public.pi_run_events(run_id,seq,user_id,profile_id,kind) values (%L,2,%L,%L,%L)',:'run',:'owner',:'person','reasoning'),'23514',null,'only public event kinds are stored');
select lives_ok(format('insert into public.pi_memory_proposals(run_id,user_id,profile_id,path,digest,content) values (%L,%L,%L,%L,%L,%L)',:'run',:'owner',:'person','proposals/help.md',repeat('c',64),'candidate'),'worker queues a memory proposal');
set local role authenticated;
set local request.jwt.claims = '{"sub":"4a300000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.pi_memory_proposals),1,'owner can read their pending proposals');
set local request.jwt.claims = '{"sub":"4a300000-0000-4000-8000-0000000000ff","role":"authenticated"}';
select is((select count(*)::int from public.pi_memory_proposals),0,'another user cannot read proposals');
set local role service_role;
select version as version from public.astro_agent_runs where id=:'run'::uuid \gset
select throws_ok(format('select public.worker_finish_pi_run(%L,%s,%s,%s,%s,%L,%L)',:'run',:version,:mode,:privacy+1,:birth,'answer','{}'),'ASV01','workspace authority changed','stale publication is rejected');
select public.worker_finish_pi_run(:'run',:version,:mode,:privacy,:birth,repeat('x',9000)||'FULL-END','{}');
select is((select length(content) from public.astro_messages where run_id=:'run'::uuid and role='assistant'),9008,'complete answer survives beyond old 6000-character limit');
select is((select status from public.astro_agent_runs where id=:'run'::uuid),'complete','run completes atomically with answer');
-- A second run that ends with a focused question waits for the person.
insert into public.astro_agent_runs(id,user_id,profile_id,session_id,kind,status,client_request_id)
values('4a300000-0000-4000-8000-000000000005',:'owner',:'person',:'session','question','active','4a300000-0000-4000-8000-000000000006');
select public.worker_finish_pi_run('4a300000-0000-4000-8000-000000000005',1,:mode,:privacy,:birth,'Why I ask.','{}',
  '{"prompt":"Did March feel different?","responseKind":"single_choice","allowFreeText":true,"options":[{"id":"a","label":"Yes","kind":"answer"},{"id":"b","label":"No","kind":"control"}]}');
select is((select status from public.astro_agent_runs where id='4a300000-0000-4000-8000-000000000005'),'waiting_for_user','a focused question leaves the run waiting');
select is((select current_question->>'prompt' from public.astro_sessions where id=:'session'::uuid),'Did March feel different?','the session shows the question');
-- Session reflection: claimed once, fenced by revision and privacy epoch.
select is((public.claim_session_reflection(:'session', interval '30 minutes')),null,'a conversation that is still active is not reflected');
update public.astro_messages set created_at = now() - interval '2 hours' where session_id=:'session'::uuid;
select is((select count(*)::int from public.sessions_needing_reflection(interval '30 minutes', 10, :'person'::uuid, null)),1,'a quiet unreflected conversation needs reflection');
select isnt((public.claim_session_reflection(:'session', interval '30 minutes')),null,'a quiet conversation can be claimed');
select is((public.claim_session_reflection(:'session', interval '30 minutes')),null,'a claimed conversation is not claimed twice');
select throws_ok(format('select public.finish_session_reflection(%L,now(),%s,%L,%L,%s)',:'session',1,'theory','why',:privacy),'ASV01','theory of mind changed','a stale revision is rejected');
select throws_ok(format('select public.finish_session_reflection(%L,now(),%s,%L,%L,%s)',:'session',0,'theory','why',:privacy+1),'ASV01','privacy changed','a stale privacy epoch is rejected');
select is((public.finish_session_reflection(:'session',now(),0,'# Theory','first',:privacy)->>'revision')::int,1,'a revision is recorded');
select is((public.finish_session_reflection(:'session',now(),1,null,null,:privacy)->>'revision')::int,1,'an unchanged reflection adds no revision');
select is((select count(*)::int from public.sessions_needing_reflection(interval '0 minutes', 10, :'person'::uuid, null)),0,'a reflected conversation is done');
select * from finish();
rollback;
