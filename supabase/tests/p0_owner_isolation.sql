-- P0 disposable two-user ownership/RLS harness.
--
-- This test intentionally runs in one transaction. Fixtures are inserted with
-- the trusted role, assertions run as two authenticated JWT subjects, and the
-- final ROLLBACK removes every fixture. It must only be run with
-- `supabase test db --local`; see scripts/test-p0-db.sh.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(18);

-- Disposable IDs are deliberately outside the IDs used by the older memory
-- test. They never survive this transaction.
\set user_a a0000000-0000-4000-8000-000000000001
\set user_b b0000000-0000-4000-8000-000000000002
\set profile_a a0000000-0000-4000-8000-000000000011
\set session_a a0000000-0000-4000-8000-000000000012
\set run_a a0000000-0000-4000-8000-000000000013
\set message_a a0000000-0000-4000-8000-000000000014
\set evidence_a a0000000-0000-4000-8000-000000000015
\set fact_a a0000000-0000-4000-8000-000000000016

select diag('P0 local fixture: two authenticated users, one owned graph');

-- auth.users is only touched inside this transaction. The minimal fields are
-- sufficient for the local Auth schema and the profile trigger.
set local role postgres;
insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, role)
values
  (:'user_a'::uuid, 'p0-owner-a@example.invalid', 'p0-fixture', now(), now(), now(), 'authenticated'),
  (:'user_b'::uuid, 'p0-owner-b@example.invalid', 'p0-fixture', now(), now(), now(), 'authenticated');

set local role service_role;

insert into public.astro_profiles
  (id, user_id, name, birth_date, birth_time, lat, lng, tz, place_name,
   chart_json, sensitivity_json)
values
  (:'profile_a'::uuid, :'user_a'::uuid, 'P0 owner A', '1990-01-01', '06:30',
   12.9716, 77.5946, 'Asia/Kolkata', 'Bengaluru', '{}', '{}');

insert into public.astro_sessions (id, user_id, profile_id, title, summary_text)
values (:'session_a'::uuid, :'user_a'::uuid, :'profile_a'::uuid,
        'P0 private session', 'P0 private summary');

insert into public.astro_agent_runs
  (id, user_id, profile_id, session_id, kind, status, client_request_id)
values (:'run_a'::uuid, :'user_a'::uuid, :'profile_a'::uuid, :'session_a'::uuid,
        'question', 'complete', 'a0000000-0000-4000-8000-000000000021');

insert into public.astro_messages (id, user_id, session_id, role, content, run_id)
values (:'message_a'::uuid, :'user_a'::uuid, :'session_a'::uuid, 'user',
        'P0 private message', :'run_a'::uuid);

insert into public.person_theory_of_mind
  (profile_id, user_id, revision, content, session_id, privacy_epoch)
values (:'profile_a'::uuid, :'user_a'::uuid, 1, 'P0 private theory', :'session_a'::uuid, 0);

insert into public.astro_profile_calculations
  (profile_id, user_id, birth_revision, engine_version, chart, sensitivity, timeline, transits)
values (:'profile_a'::uuid, :'user_a'::uuid, 0, 'p0', '{}', '{}', '{"level":"pratyantar","rows":[]}', '[]');

-- Authenticated A can read every row in the owned graph.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.profiles where id = :'user_a'::uuid), 1::bigint, 'A reads own profile');
select is((select count(*) from public.astro_profiles where id = :'profile_a'::uuid), 1::bigint, 'A reads own astro profile');
select is((select count(*) from public.astro_sessions where id = :'session_a'::uuid), 1::bigint, 'A reads own session');
select is((select count(*) from public.astro_messages where id = :'message_a'::uuid), 1::bigint, 'A reads own message');
select is((select count(*) from public.astro_agent_runs where id = :'run_a'::uuid), 1::bigint, 'A reads own run');
select throws_ok($$select count(*) from public.person_theory_of_mind$$, '42501', null, 'Even A cannot read the raw theory of mind');
select throws_ok($$select count(*) from public.astro_profile_calculations$$, '42501', null, 'Even A cannot read raw calculations');

-- Authenticated B sees no A-owned rows, including the durable person model.
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*) from public.profiles where id = :'user_a'::uuid), 0::bigint, 'B cannot read A profile');
select is((select count(*) from public.astro_profiles where id = :'profile_a'::uuid), 0::bigint, 'B cannot read A astro profile');
select is((select count(*) from public.astro_sessions where id = :'session_a'::uuid), 0::bigint, 'B cannot read A session');
select is((select count(*) from public.astro_messages where id = :'message_a'::uuid), 0::bigint, 'B cannot read A message');
select is((select count(*) from public.astro_agent_runs where id = :'run_a'::uuid), 0::bigint, 'B cannot read A run');
select throws_ok($$select count(*) from public.person_theory_of_mind$$, '42501', null, 'B cannot read any theory of mind');

-- Writes are blocked both by owner checks on core tables and by SELECT-only
-- grants on the append-only memory ledgers.
select throws_ok($$insert into public.profiles (id, display_name) values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'hijack')$$,
  '42501', null, 'B cannot insert or overwrite A profile');
select throws_ok($$update public.astro_messages set content = 'hijack'
  where id = 'a0000000-0000-4000-8000-000000000014'::uuid$$,
  '42501', null, 'B cannot update A message');
select throws_ok($$insert into public.person_theory_of_mind
  (profile_id, user_id, revision, content, session_id, privacy_epoch)
  values ('a0000000-0000-4000-8000-000000000011'::uuid, 'b0000000-0000-4000-8000-000000000002'::uuid,
          2, 'hijack', 'a0000000-0000-4000-8000-000000000012'::uuid, 0)$$,
  '42501', null, 'B cannot write a theory of mind');
select throws_ok($$select public.finish_session_reflection(
  'a0000000-0000-4000-8000-000000000012'::uuid, now(), 1, 'hijack', 'x', 0)$$,
  '42501', null, 'B cannot execute the reflection RPC');
select throws_ok($$select public.create_astro_session(
  'a0000000-0000-4000-8000-000000000011'::uuid)$$,
  'ANF01', null, 'B cannot create a session on A profile');

select * from finish();
rollback;
