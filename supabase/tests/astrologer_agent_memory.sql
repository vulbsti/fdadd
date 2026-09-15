-- pgTAP/Supabase DB tests for the durable astrologer agent memory migration.
-- Covers: same-owner composite FKs, RLS visibility, RPC grants, intake/run
-- idempotency, one-active-run-per-profile, optimistic version conflicts,
-- atomic quota claims, immutable ledgers, map revisions, hybrid fact policy.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;
select plan(33);
-- ===========================================================================
-- Fixtures: two authenticated users, one profile each
-- ===========================================================================

do $$
begin
  if not exists (select 1 from auth.users where id = '11111111-1111-4111-8111-111111111111') then
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role)
    values ('11111111-1111-4111-8111-111111111111', 'astro-a@test.local', 'x', now(), now(), now(), 'authenticated');
  end if;
  if not exists (select 1 from auth.users where id = '22222222-2222-4222-8222-222222222222') then
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role)
    values ('22222222-2222-4222-8222-222222222222', 'astro-b@test.local', 'x', now(), now(), now(), 'authenticated');
  end if;
end $$;

-- ===========================================================================
-- Same-owner composite foreign keys
-- ===========================================================================

select diag('same-owner composite foreign keys reject cross-user links');

select has_table('astro_evidence');
select has_table('astro_person_facts');
select has_table('astro_map_revisions');
select has_table('astro_agent_runs');
select has_table('astro_agent_run_steps');
select has_table('astro_run_context_items');
select has_table('astro_calculation_cache');

-- ===========================================================================

select diag('user-entry RPCs granted to authenticated, worker RPCs not');

select has_function('public', 'begin_astro_profile_intake', array['jsonb','uuid']);
select has_function('public', 'begin_astro_agent_run', array['uuid','text','uuid','uuid']);
select has_function('public', 'resume_astro_agent_run', array['uuid','uuid']);
select has_function('public', 'attach_astro_workflow_run', array['uuid','text']);
select has_function('public', 'worker_astro_relevant_context', array['uuid','text','text[]','date','date','integer']);
select has_function('public', 'worker_checkpoint_astro_run', array['uuid','bigint','jsonb','jsonb','jsonb','jsonb']);
select has_function('public', 'worker_apply_astro_memory_change', array['uuid','jsonb']);
select has_function('public', 'worker_claim_astro_tool_call', array['uuid','text','text','date','integer']);
select has_function('public', 'worker_finish_astro_intake', array['uuid','jsonb','jsonb','text']);

-- ===========================================================================
-- Intake idempotency + one active run per profile (as authenticated user A)
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select diag('intake idempotency');

select is(
  (public.begin_astro_profile_intake(
    '{"name":"Ravi","date":"1990-01-01","time":"06:30","latitude":12.97,"longitude":77.59,"timezone":"Asia/Kolkata"}'::jsonb,
    '33333333-3333-4333-8333-333333333333'::uuid
  ) ->> 'replayed')::boolean,
  false,
  'first intake creates rows'
);

select is(
  (public.begin_astro_profile_intake(
    '{"name":"Ravi","date":"1990-01-01","time":"06:30","latitude":12.97,"longitude":77.59,"timezone":"Asia/Kolkata"}'::jsonb,
    '33333333-3333-4333-8333-333333333333'::uuid
  ) ->> 'replayed')::boolean,
  true,
  'same client request id replays'
);

select throws_ok(
  $$ select public.begin_astro_profile_intake(
       '{"name":"Bad","date":"not-a-date","time":"06:30","latitude":12.97,"longitude":77.59,"timezone":"UTC"}'::jsonb,
       '34444444-4444-4444-8444-444444444444'::uuid) $$,
  'AIR01', null, 'invalid birth data rejected'
);

-- ===========================================================================
-- Cross-user isolation: user B cannot touch A's profile
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select throws_ok(
  $$ select public.create_astro_session(
       (select id from public.astro_profiles
         where user_id = '11111111-1111-4111-8111-111111111111' limit 1)) $$,
  'ANF01', null, 'user B cannot create a session on user A profile'
);

select is(
  count(*) = 0,
  true,
  'user B sees none of user A profiles'
) from public.astro_profiles
  where user_id = '11111111-1111-4111-8111-111111111111';

-- ===========================================================================
-- Worker RPCs are not executable by authenticated callers
-- ===========================================================================

select throws_ok(
  $$ select public.worker_apply_astro_memory_change('00000000-0000-0000-0000-000000000000'::uuid, '{}'::jsonb) $$,
  '42501', null, 'authenticated cannot execute worker RPC'
);

-- Cross-user composite FK: B's user_id on A's profile must violate 23503.
-- service_role bypasses RLS so the profile subquery resolves; the composite
-- FK still rejects the mismatched owner.
set local role service_role;

select throws_ok(
  $$ insert into public.astro_events (user_id, profile_id, on_date, title)
     values (
       '22222222-2222-4222-8222-222222222222'::uuid,
       (select id from public.astro_profiles
         where user_id = '11111111-1111-4111-8111-111111111111' limit 1),
       '2026-01-01', 'x') $$,
  '23503', null, 'cross-owner event link violates composite FK'
);

-- Complete the pending intake run so a question run may start.
select is(
  (public.worker_finish_astro_intake(
    (select id from public.astro_agent_runs
      where user_id = '11111111-1111-4111-8111-111111111111'
        and kind = 'intake' limit 1),
    '{"ascendant":"Aries"}'::jsonb,
    '{"score":0.9}'::jsonb,
    'Welcome.'
  ) ->> 'status'),
  'complete',
  'intake completes and freezes chart/sensitivity'
);

-- ===========================================================================
-- Run lifecycle: begin, one-active conflict, idempotent retry (as user A)
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select diag('run lifecycle');

select is(
  (public.begin_astro_agent_run(
    (select id from public.astro_sessions
      where user_id = '11111111-1111-4111-8111-111111111111' limit 1),
    'When will my career change?',
    '44444444-4444-4444-8444-444444444444'::uuid,
    null
  ) ->> 'replayed')::boolean,
  false,
  'first message starts a run'
);

select throws_ok(
  $$ select public.begin_astro_agent_run(
       (select id from public.astro_sessions
         where user_id = '11111111-1111-4111-8111-111111111111' limit 1),
       'Second concurrent question',
       '45555555-5555-4555-8555-555555555555'::uuid,
       null) $$,
  'ACF01', null, 'second concurrent run for the same profile is rejected'
);

select is(
  (public.begin_astro_agent_run(
    (select id from public.astro_sessions
      where user_id = '11111111-1111-4111-8111-111111111111' limit 1),
    'When will my career change?',
    '44444444-4444-4444-8444-444444444444'::uuid,
    null
  ) ->> 'replayed')::boolean,
  true,
  'same client message id replays the same run'
);

-- ===========================================================================
-- Optimistic version conflict on worker checkpoint (as service role)
-- ===========================================================================

set local role service_role;

select diag('optimistic version conflict');

select throws_ok(
  $$ select public.worker_checkpoint_astro_run(
       (select id from public.astro_agent_runs
         where user_id = '11111111-1111-4111-8111-111111111111' limit 1),
       999999, '{}'::jsonb, null, null, null) $$,
  'ASV01', null, 'stale run version rejected'
);

-- ===========================================================================
-- Atomic quota claim + replay
-- ===========================================================================

select diag('quota claim');

select is(
  (public.worker_claim_astro_tool_call(
    (select id from public.astro_agent_runs
      where user_id = '11111111-1111-4111-8111-111111111111' limit 1),
    '0:0:0:atros_timeline', 'atros_timeline', current_date
  ) ->> 'replayed')::boolean,
  false,
  'first claim charges quota'
);

select is(
  (public.worker_claim_astro_tool_call(
    (select id from public.astro_agent_runs
      where user_id = '11111111-1111-4111-8111-111111111111' limit 1),
    '0:0:0:atros_timeline', 'atros_timeline', current_date
  ) ->> 'replayed')::boolean,
  true,
  'repeat claim for the same step replays without incrementing'
);

select is(
  (select tool_calls from public.astro_quotas
    where user_id = '11111111-1111-4111-8111-111111111111' and day = current_date),
  1,
  'quota incremented exactly once across both claims'
);

-- ===========================================================================
-- Hybrid fact policy: direct confirmed via verified quote; derived needs two
-- ===========================================================================

select diag('hybrid fact policy');

do $$
declare
  v_run_id uuid;
  v_session_id uuid;
  v_message_id uuid;
  v_profile_id uuid;
begin
  select id, profile_id into v_run_id, v_profile_id
    from public.astro_agent_runs
    where user_id = '11111111-1111-4111-8111-111111111111'
    order by started_at limit 1;
  select session_id into v_session_id from public.astro_agent_runs where id = v_run_id;

  -- Canonical user message with a quotable statement.
  insert into public.astro_messages (user_id, session_id, role, content)
    values ('11111111-1111-4111-8111-111111111111', v_session_id, 'user',
            'I was born in Mysore and I work as a teacher.')
    returning id into v_message_id;

  -- Direct evidence with an exact verified quote.
  perform public.worker_record_astro_evidence(v_run_id, jsonb_build_object(
    'sourceMessageId', v_message_id,
    'sourceKind', 'user_statement',
    'assertionMode', 'direct',
    'evidenceType', 'birthplace',
    'exactQuote', 'I was born in Mysore',
    'summary', 'Born in Mysore',
    'idempotencyKey', 'test-direct-1'));

  -- Direct fact with the verified quote enters confirmed.
  perform public.worker_apply_astro_memory_change(v_run_id, jsonb_build_object(
    'action', 'propose',
    'factKey', 'birthplace',
    'value', '{"city":"Mysore"}',
    'summary', 'Born in Mysore',
    'origin', 'direct',
    'evidenceIds', (select jsonb_agg(id) from public.astro_evidence
                      where idempotency_key = 'test-direct-1'),
    'reason', 'verbatim user statement'));

  if (select status from public.astro_person_facts
       where profile_id = v_profile_id and fact_key = 'birthplace') <> 'confirmed' then
    raise exception 'direct fact with verified quote should be confirmed';
  end if;

  -- Derived fact with ONE source must stay proposed; confirming must fail.
  perform public.worker_record_astro_evidence(v_run_id, jsonb_build_object(
    'sourceMessageId', v_message_id,
    'sourceKind', 'user_statement',
    'assertionMode', 'derived',
    'evidenceType', 'interpretation',
    'exactQuote', 'work as a teacher',
    'summary', 'Likely values routine and service',
    'idempotencyKey', 'test-derived-1'));

  perform public.worker_apply_astro_memory_change(v_run_id, jsonb_build_object(
    'action', 'propose',
    'factKey', 'temperament',
    'value', '{"trait":"service-oriented"}',
    'summary', 'Service-oriented temperament',
    'origin', 'derived',
    'evidenceIds', (select jsonb_agg(id) from public.astro_evidence
                      where idempotency_key = 'test-derived-1'),
    'reason', 'one interpretation'));

  if (select status from public.astro_person_facts
       where profile_id = v_profile_id and fact_key = 'temperament') <> 'proposed' then
    raise exception 'derived fact must start proposed';
  end if;

  begin
    perform public.worker_apply_astro_memory_change(v_run_id, jsonb_build_object(
      'action', 'confirm',
      'factKey', 'temperament',
      'expectedRevision', 1,
      'reason', 'premature confirmation'));
    raise exception 'derived fact confirmed from one source';
  exception when others then
    if sqlerrm not like '%two independent sources%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;

  -- Add a second independent supporting source: confirmation succeeds.
  insert into public.astro_events (user_id, profile_id, on_date, title, detail)
    values ('11111111-1111-4111-8111-111111111111', v_profile_id, '2020-06-01',
            'Career event', 'career event');

  perform public.worker_record_astro_evidence(v_run_id, jsonb_build_object(
    'sourceEventId', (select id from public.astro_events
                       where profile_id = v_profile_id limit 1),
    'sourceKind', 'life_event',
    'assertionMode', 'direct',
    'evidenceType', 'career_event',
    'exactQuote', 'career event',
    'summary', 'Career choice corroborates service orientation',
    'idempotencyKey', 'test-derived-2'));

  perform public.worker_apply_astro_memory_change(v_run_id, jsonb_build_object(
    'action', 'confirm',
    'factKey', 'temperament',
    'expectedRevision', 1,
    'evidenceIds', (select jsonb_agg(id) from public.astro_evidence
                      where idempotency_key in ('test-derived-1','test-derived-2')),
    'reason', 'two independent sources'));

  if (select status from public.astro_person_facts
       where profile_id = v_profile_id and fact_key = 'temperament') <> 'confirmed' then
    raise exception 'derived fact should confirm with two sources';
  end if;

  -- Immutable ledger: revisions exist for both facts, evidence unchanged.
  if (select count(*) from public.astro_map_revisions
       where fact_id in (select id from public.astro_person_facts
                          where profile_id = v_profile_id)) < 3 then
    raise exception 'expected at least three map revisions';
  end if;
end $$;

-- ===========================================================================
-- Immutable ledgers reject mutation via RLS (authenticated has SELECT only)
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ update public.astro_evidence set summary = 'tampered' $$,
  '42501', null, 'authenticated cannot mutate append-only evidence'
);

select throws_ok(
  $$ delete from public.astro_map_revisions $$,
  '42501', null, 'authenticated cannot delete the revision ledger'
);

select * from finish();
rollback;
