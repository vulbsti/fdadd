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
select ok(not has_function_privilege('authenticated','public.worker_finish_pi_run(uuid,bigint,bigint,bigint,bigint,text,jsonb)','execute'),'browser cannot publish answers');
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
select version as version from public.astro_agent_runs where id=:'run'::uuid \gset
select throws_ok(format('select public.worker_finish_pi_run(%L,%s,%s,%s,%s,%L,%L)',:'run',:version,:mode,:privacy+1,:birth,'answer','{}'),'ASV01','workspace authority changed','stale publication is rejected');
select public.worker_finish_pi_run(:'run',:version,:mode,:privacy,:birth,repeat('x',9000)||'FULL-END','{}');
select is((select length(content) from public.astro_messages where run_id=:'run'::uuid and role='assistant'),9008,'complete answer survives beyond old 6000-character limit');
select is((select status from public.astro_agent_runs where id=:'run'::uuid),'complete','run completes atomically with answer');
select * from finish();
rollback;
