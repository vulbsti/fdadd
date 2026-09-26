-- Active birth-intake runs use the shared durable workflow dispatch protocol.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(8);

\set intake_user c1000000-0000-4000-8000-000000000001
\set intake_profile c1000000-0000-4000-8000-000000000011
\set intake_session c1000000-0000-4000-8000-000000000012
\set intake_run c1000000-0000-4000-8000-000000000013

select has_trigger('public', 'astro_agent_runs', 'astro_agent_runs_enqueue_intake_dispatch',
  'active intake runs have a dispatch trigger');

set local role postgres;
insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, role)
values (:'intake_user'::uuid, 'p1-intake-dispatch@example.invalid', 'fixture', now(), now(), now(), 'authenticated');

set local role service_role;
insert into public.astro_profiles
  (id, user_id, name, birth_date, birth_time, lat, lng, tz, place_name, chart_json, sensitivity_json)
values
  (:'intake_profile'::uuid, :'intake_user'::uuid, 'P1 intake', '1990-01-01', '06:30',
   12.9716, 77.5946, 'Asia/Kolkata', 'Bengaluru', '{}', '{}');
insert into public.astro_sessions (id, user_id, profile_id, title)
values (:'intake_session'::uuid, :'intake_user'::uuid, :'intake_profile'::uuid, 'P1 intake');
insert into public.astro_agent_runs
  (id, user_id, profile_id, session_id, kind, status, client_request_id, birth_revision)
values (:'intake_run'::uuid, :'intake_user'::uuid, :'intake_profile'::uuid,
        :'intake_session'::uuid, 'intake', 'active',
        'c1000000-0000-4000-8000-000000000014'::uuid, 1);

select is((select count(*) from public.astro_run_dispatches where run_id=:'intake_run'::uuid),
  1::bigint, 'active intake run transactionally creates one dispatch row');
select is((select user_id from public.astro_run_dispatches where run_id=:'intake_run'::uuid),
  :'intake_user'::uuid, 'dispatch preserves its run owner');
select is((select profile_id from public.astro_run_dispatches where run_id=:'intake_run'::uuid),
  :'intake_profile'::uuid, 'dispatch preserves its person scope');
select isnt(public.worker_claim_astro_run_dispatch(:'intake_run'::uuid, 60), null::jsonb,
  'the common dispatcher can claim an intake run');
select is((public.worker_claim_astro_run_execution(:'intake_run'::uuid, 'intake-workflow-winner')->>'won')::boolean,
  true, 'the common execution fence accepts intake self-registration');
select is((select state from public.astro_run_dispatches where run_id=:'intake_run'::uuid),
  'dispatched', 'intake self-registration completes the durable outbox row');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select count(*) from public.astro_run_dispatches$$,
  '42501', null, 'authenticated person owner cannot read the service dispatch outbox');

select * from finish();
rollback;
