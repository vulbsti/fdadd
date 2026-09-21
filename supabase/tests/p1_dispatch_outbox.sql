-- P1 transactional dispatch, ownership, retry, and duplicate-execution fence.
-- Every fixture is rolled back; this file is local-Supabase-only via the
-- guarded scripts/test-p0-db.sh harness.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(26);

\set dispatch_user c0000000-0000-4000-8000-000000000001
\set dispatch_profile c0000000-0000-4000-8000-000000000011
\set dispatch_session c0000000-0000-4000-8000-000000000012
\set dispatch_run c0000000-0000-4000-8000-000000000013
\set terminal_run c0000000-0000-4000-8000-000000000023

select has_table('public', 'astro_run_dispatches', 'dispatch outbox exists');

set local role postgres;
insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, role)
values (:'dispatch_user'::uuid, 'p1-dispatch@example.invalid', 'fixture', now(), now(), now(), 'authenticated');

set local role service_role;
insert into public.astro_profiles
  (id, user_id, name, birth_date, birth_time, lat, lng, tz, place_name,
   chart_json, sensitivity_json)
values
  (:'dispatch_profile'::uuid, :'dispatch_user'::uuid, 'P1 dispatch', '1990-01-01', '06:30',
   12.9716, 77.5946, 'Asia/Kolkata', 'Bengaluru', '{}', '{}');

insert into public.astro_sessions (id, user_id, profile_id, title)
values (:'dispatch_session'::uuid, :'dispatch_user'::uuid, :'dispatch_profile'::uuid, 'P1 dispatch');

insert into public.astro_agent_runs
  (id, user_id, profile_id, session_id, kind, status, client_request_id)
values (:'dispatch_run'::uuid, :'dispatch_user'::uuid, :'dispatch_profile'::uuid,
        :'dispatch_session'::uuid, 'question', 'active',
        'c0000000-0000-4000-8000-000000000014'::uuid);

select is(
  (select count(*) from public.astro_run_dispatches where run_id = :'dispatch_run'::uuid),
  1::bigint,
  'active question run transactionally enqueues dispatch'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select count(*) from public.astro_run_dispatches$$,
  '42501', null, 'authenticated caller cannot read service outbox'
);
select throws_ok(
  $$select public.worker_claim_astro_run_dispatch(null, 60)$$,
  '42501', null, 'authenticated caller cannot claim dispatch work'
);

set local role service_role;
create temporary table p1_dispatch_claims (label text primary key, payload jsonb);
insert into p1_dispatch_claims values
  ('first', public.worker_claim_astro_run_dispatch(:'dispatch_run'::uuid, 60));

select isnt((select payload from p1_dispatch_claims where label = 'first'), null::jsonb,
  'service worker claims pending dispatch');
select is((select (payload ->> 'attempt')::integer from p1_dispatch_claims where label = 'first'),
  1, 'first claim records attempt one');
select is(public.worker_claim_astro_run_dispatch(:'dispatch_run'::uuid, 60), null::jsonb,
  'active lease cannot be claimed twice');

update public.astro_run_dispatches
  set lease_expires_at = now() - interval '1 second'
  where run_id = :'dispatch_run'::uuid;
insert into p1_dispatch_claims values
  ('expired', public.worker_claim_astro_run_dispatch(:'dispatch_run'::uuid, 60));
select is((select (payload ->> 'attempt')::integer from p1_dispatch_claims where label = 'expired'),
  2, 'expired lease is reclaimed as the next attempt');
select isnt(
  (select payload ->> 'leaseToken' from p1_dispatch_claims where label = 'expired'),
  (select payload ->> 'leaseToken' from p1_dispatch_claims where label = 'first'),
  'expired lease reclaim receives a new fencing token'
);
select is(
  (public.worker_release_astro_run_dispatch(
    :'dispatch_run'::uuid,
    (select (payload ->> 'leaseToken')::uuid from p1_dispatch_claims where label = 'first'),
    'stale owner', 1
  ) ->> 'released')::boolean,
  false,
  'expired lease owner cannot release newer work'
);

select is(
  (public.worker_release_astro_run_dispatch(
    :'dispatch_run'::uuid,
    (select (payload ->> 'leaseToken')::uuid from p1_dispatch_claims where label = 'expired'),
    'synthetic queue outage', 1
  ) ->> 'released')::boolean,
  true,
  'failed start releases its lease'
);
select is((select state from public.astro_run_dispatches where run_id = :'dispatch_run'::uuid),
  'pending', 'released dispatch returns to pending');

update public.astro_run_dispatches set available_at = now() where run_id = :'dispatch_run'::uuid;
insert into p1_dispatch_claims values
  ('second', public.worker_claim_astro_run_dispatch(:'dispatch_run'::uuid, 60));
select is((select (payload ->> 'attempt')::integer from p1_dispatch_claims where label = 'second'),
  3, 'retry increments attempt count');

select is(
  (public.worker_claim_astro_run_execution(:'dispatch_run'::uuid, 'wrun_winner') ->> 'won')::boolean,
  true,
  'first Workflow self-registration wins execution fence'
);
select is(
  (public.worker_claim_astro_run_execution(:'dispatch_run'::uuid, 'wrun_loser') ->> 'won')::boolean,
  false,
  'duplicate Workflow loses execution fence'
);
select is((select state from public.astro_run_dispatches where run_id = :'dispatch_run'::uuid),
  'dispatched', 'self-registration completes outbox row');
select is((select workflow_run_id from public.astro_agent_runs where id = :'dispatch_run'::uuid),
  'wrun_winner', 'winning Workflow ID is attached to product run');

-- Even though self-registration cleared the lease, dispatcher completion for
-- that same Workflow remains a winner and must not cancel it.
select is(
  (public.worker_complete_astro_run_dispatch(
    :'dispatch_run'::uuid,
    (select (payload ->> 'leaseToken')::uuid from p1_dispatch_claims where label = 'second'),
    'wrun_winner'
  ) ->> 'won')::boolean,
  true,
  'stale completion recognizes the already-recorded winner'
);

-- Exercise the bounded terminal retry boundary on a fresh run.
update public.astro_agent_runs set status = 'complete', completed_at = now()
  where id = :'dispatch_run'::uuid;
insert into public.astro_agent_runs
  (id, user_id, profile_id, session_id, kind, status, client_request_id)
values (:'terminal_run'::uuid, :'dispatch_user'::uuid, :'dispatch_profile'::uuid,
        :'dispatch_session'::uuid, 'question', 'active',
        'c0000000-0000-4000-8000-000000000024'::uuid);
update public.astro_run_dispatches set max_attempts = 1 where run_id = :'terminal_run'::uuid;
insert into p1_dispatch_claims values
  ('terminal', public.worker_claim_astro_run_dispatch(:'terminal_run'::uuid, 60));

select isnt((select payload from p1_dispatch_claims where label = 'terminal'), null::jsonb,
  'terminal-bound dispatch is claimed');
select is(
  (public.worker_release_astro_run_dispatch(
    :'terminal_run'::uuid,
    (select (payload ->> 'leaseToken')::uuid from p1_dispatch_claims where label = 'terminal'),
    'synthetic terminal outage', 1
  ) ->> 'dead')::boolean,
  true,
  'last failed attempt marks dispatch dead'
);
select is((select state from public.astro_run_dispatches where run_id = :'terminal_run'::uuid),
  'dead', 'outbox persists terminal dispatch state');
select is((select status from public.astro_agent_runs where id = :'terminal_run'::uuid),
  'failed', 'terminal dispatch failure fails the product run');
select is((select resumable from public.astro_agent_runs where id = :'terminal_run'::uuid),
  true, 'terminal dispatch failure remains resumable');
select is((select error_code from public.astro_agent_runs where id = :'terminal_run'::uuid),
  'dispatch_failed', 'terminal run records a diagnostic dispatch code');
select is((select phase from public.astro_agent_runs where id = :'terminal_run'::uuid),
  null::text, 'failed run does not retain an active phase');

update public.astro_agent_runs set status = 'waiting_for_user', phase = 'responding'
  where id = :'dispatch_run'::uuid;
select is((select phase from public.astro_agent_runs where id = :'dispatch_run'::uuid),
  null::text, 'waiting run does not retain the responding phase');

select * from finish();
rollback;
