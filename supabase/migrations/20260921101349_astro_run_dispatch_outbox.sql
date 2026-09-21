-- P1: transactional question-run dispatch with a lease-token fence.
--
-- The user-entry RPC commits the run and this outbox row together. Starting
-- Vercel Workflow remains external, so request retries and a sweeper claim the
-- durable row. The Workflow then self-registers its own run ID; only the first
-- Workflow ID attached to the product run may execute it.

create table public.astro_run_dispatches (
  run_id uuid primary key,
  user_id uuid not null,
  profile_id uuid not null,
  state text not null default 'pending'
    check (state in ('pending', 'leased', 'dispatched', 'dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  workflow_run_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dispatched_at timestamptz,
  constraint astro_run_dispatches_run_owner_fk
    foreign key (run_id, user_id)
    references public.astro_agent_runs (id, user_id) on delete cascade,
  constraint astro_run_dispatches_profile_owner_fk
    foreign key (profile_id, user_id)
    references public.astro_profiles (id, user_id) on delete cascade,
  constraint astro_run_dispatches_lease_shape check (
    (state = 'leased' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'leased')
  )
);

create index astro_run_dispatches_ready_idx
  on public.astro_run_dispatches (available_at, created_at)
  where state in ('pending', 'leased');

create unique index astro_run_dispatches_workflow_key
  on public.astro_run_dispatches (workflow_run_id)
  where workflow_run_id is not null;

create trigger astro_run_dispatches_set_updated_at
  before update on public.astro_run_dispatches
  for each row execute procedure public.set_updated_at();

create or replace function public.enqueue_astro_question_run_dispatch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.astro_run_dispatches (run_id, user_id, profile_id)
  values (new.id, new.user_id, new.profile_id)
  on conflict (run_id) do nothing;
  return new;
end;
$$;

create trigger astro_agent_runs_enqueue_question_dispatch
  after insert on public.astro_agent_runs
  for each row
  when (new.kind = 'question' and new.status = 'active')
  execute function public.enqueue_astro_question_run_dispatch();

-- A phase describes active work, never a terminal run. The original terminal
-- checkpoint kept the last `responding` value, which made a reloaded browser
-- claim that completed/waiting runs were still executing.
create or replace function public.clear_terminal_astro_run_phase()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('waiting_for_user', 'complete', 'failed') then
    new.phase := null;
  end if;
  return new;
end;
$$;

create trigger astro_agent_runs_clear_terminal_phase
  before insert or update on public.astro_agent_runs
  for each row execute function public.clear_terminal_astro_run_phase();

create or replace function public.worker_claim_astro_run_dispatch(
  p_run_id uuid default null,
  p_lease_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch record;
  v_token uuid := gen_random_uuid();
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 60), 15), 300);
begin
  select d.* into v_dispatch
  from public.astro_run_dispatches d
  join public.astro_agent_runs r on r.id = d.run_id
  where (p_run_id is null or d.run_id = p_run_id)
    and r.status = 'active'
    and r.workflow_run_id is null
    and d.attempt_count < d.max_attempts
    and (
      (d.state = 'pending' and d.available_at <= now())
      or (d.state = 'leased' and d.lease_expires_at <= now())
    )
  order by d.available_at, d.created_at
  for update of d skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.astro_run_dispatches
  set state = 'leased',
      attempt_count = attempt_count + 1,
      lease_token = v_token,
      lease_expires_at = now() + pg_catalog.make_interval(secs => v_lease_seconds),
      last_error = null
  where run_id = v_dispatch.run_id;

  return jsonb_build_object(
    'runId', v_dispatch.run_id,
    'leaseToken', v_token,
    'attempt', v_dispatch.attempt_count + 1,
    'maxAttempts', v_dispatch.max_attempts);
end;
$$;

create or replace function public.worker_complete_astro_run_dispatch(
  p_run_id uuid,
  p_lease_token uuid,
  p_workflow_run_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch record;
  v_run record;
  v_winner text;
  v_won boolean := false;
begin
  if coalesce(p_workflow_run_id, '') = '' then
    raise exception 'invalid workflow run id' using errcode = 'AIR01';
  end if;

  select * into v_dispatch from public.astro_run_dispatches
    where run_id = p_run_id for update;
  if not found then
    raise exception 'dispatch not found' using errcode = 'ANF01';
  end if;

  select * into v_run from public.astro_agent_runs
    where id = p_run_id for update;
  if not found then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;

  -- Self-registration may win before the dispatcher reports completion. A
  -- stale lease must not make that dispatcher cancel the recorded winner.
  if v_dispatch.state <> 'leased' or v_dispatch.lease_token <> p_lease_token then
    return jsonb_build_object(
      'won', v_run.workflow_run_id = p_workflow_run_id,
      'workflowRunId', v_run.workflow_run_id,
      'fenced', true);
  end if;

  if v_run.status = 'active' and v_run.workflow_run_id is null then
    update public.astro_agent_runs
      set workflow_run_id = p_workflow_run_id
      where id = p_run_id;
    v_winner := p_workflow_run_id;
    v_won := true;
  else
    v_winner := v_run.workflow_run_id;
    v_won := v_winner = p_workflow_run_id;
  end if;

  update public.astro_run_dispatches
  set state = case when v_winner is null then 'dead' else 'dispatched' end,
      workflow_run_id = v_winner,
      lease_token = null,
      lease_expires_at = null,
      dispatched_at = case when v_winner is null then dispatched_at else now() end
  where run_id = p_run_id;

  return jsonb_build_object(
    'won', v_won,
    'workflowRunId', v_winner,
    'fenced', false);
end;
$$;

create or replace function public.worker_release_astro_run_dispatch(
  p_run_id uuid,
  p_lease_token uuid,
  p_error_message text,
  p_retry_seconds integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch record;
  v_run record;
  v_dead boolean;
  v_retry_seconds integer := least(greatest(coalesce(p_retry_seconds, 15), 1), 900);
begin
  select * into v_dispatch from public.astro_run_dispatches
    where run_id = p_run_id for update;
  if not found then
    raise exception 'dispatch not found' using errcode = 'ANF01';
  end if;

  if v_dispatch.state <> 'leased' or v_dispatch.lease_token <> p_lease_token then
    return jsonb_build_object('released', false, 'fenced', true, 'dead', v_dispatch.state = 'dead');
  end if;

  v_dead := v_dispatch.attempt_count >= v_dispatch.max_attempts;
  update public.astro_run_dispatches
  set state = case when v_dead then 'dead' else 'pending' end,
      available_at = case when v_dead then available_at
        else now() + pg_catalog.make_interval(secs => v_retry_seconds) end,
      lease_token = null,
      lease_expires_at = null,
      last_error = left(coalesce(p_error_message, 'dispatch failed'), 500)
  where run_id = p_run_id;

  if v_dead then
    select * into v_run from public.astro_agent_runs where id = p_run_id for update;
    if found and v_run.status = 'active' and v_run.workflow_run_id is null then
      update public.astro_agent_runs
      set status = 'failed',
          error_code = 'dispatch_failed',
          error_message = 'The run could not be started after bounded retries.',
          resumable = true,
          next_action = 'Resume the run to create a fresh dispatch.',
          completed_at = now(),
          version = version + 1
      where id = p_run_id;

      update public.astro_sessions
      set status = 'failed',
          next_action = 'Resume the run to create a fresh dispatch.',
          state_version = state_version + 1
      where id = v_run.session_id;
    end if;
  end if;

  return jsonb_build_object('released', true, 'fenced', false, 'dead', v_dead);
end;
$$;

-- Called by the first Workflow step with its actual Workflow run ID. This
-- closes the crash-after-start/before-attach gap: an orphaned start can attach
-- itself, and a duplicate start sees the winning ID and exits before tools.
create or replace function public.worker_claim_astro_run_execution(
  p_run_id uuid,
  p_workflow_run_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
  v_winner text;
  v_won boolean := false;
begin
  if coalesce(p_workflow_run_id, '') = '' then
    raise exception 'invalid workflow run id' using errcode = 'AIR01';
  end if;

  select * into v_run from public.astro_agent_runs
    where id = p_run_id for update;
  if not found then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;

  if v_run.status = 'active' and v_run.workflow_run_id is null then
    update public.astro_agent_runs
      set workflow_run_id = p_workflow_run_id
      where id = p_run_id;
    v_winner := p_workflow_run_id;
    v_won := true;
  else
    v_winner := v_run.workflow_run_id;
    v_won := v_winner = p_workflow_run_id;
  end if;

  update public.astro_run_dispatches
  set state = case when v_winner is null then state else 'dispatched' end,
      workflow_run_id = coalesce(v_winner, workflow_run_id),
      lease_token = case when v_winner is null then lease_token else null end,
      lease_expires_at = case when v_winner is null then lease_expires_at else null end,
      dispatched_at = case when v_winner is null then dispatched_at else coalesce(dispatched_at, now()) end
  where run_id = p_run_id;

  return jsonb_build_object('won', v_won, 'workflowRunId', v_winner);
end;
$$;

alter table public.astro_run_dispatches enable row level security;

revoke all on table public.astro_run_dispatches from anon, authenticated;
revoke all on function public.enqueue_astro_question_run_dispatch() from public, anon, authenticated;
revoke all on function public.clear_terminal_astro_run_phase() from public, anon, authenticated;
revoke all on function public.worker_claim_astro_run_dispatch(uuid, integer) from public, anon, authenticated;
revoke all on function public.worker_complete_astro_run_dispatch(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.worker_release_astro_run_dispatch(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.worker_claim_astro_run_execution(uuid, text) from public, anon, authenticated;

grant all on table public.astro_run_dispatches to service_role;
grant execute on function public.worker_claim_astro_run_dispatch(uuid, integer) to service_role;
grant execute on function public.worker_complete_astro_run_dispatch(uuid, uuid, text) to service_role;
grant execute on function public.worker_release_astro_run_dispatch(uuid, uuid, text, integer) to service_role;
grant execute on function public.worker_claim_astro_run_execution(uuid, text) to service_role;
