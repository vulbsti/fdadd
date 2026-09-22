-- A resume is a new execution attempt for the same user request. Preserve the
-- original triggering message as well as the checkpoint: provider failures can
-- happen before planning writes currentGoal, and falling back to a generic
-- "Continue the reading" would otherwise change the requested work.
create or replace function public.resume_astro_agent_run(
  p_failed_run_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_failed record;
  v_new_run_id uuid;
  v_existing_run_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = 'AFB01';
  end if;

  select r.* into v_failed
    from public.astro_agent_runs r
    where r.id = p_failed_run_id and r.user_id = v_user_id
    for update of r;
  if not found then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;
  if v_failed.status <> 'failed' or not v_failed.resumable then
    raise exception 'run is not resumable' using errcode = 'AIT01';
  end if;
  if v_failed.kind <> 'question' then
    raise exception 'only question runs can use this resume path' using errcode = 'AIT01';
  end if;

  select id into v_existing_run_id
    from public.astro_agent_runs
    where user_id = v_user_id
      and client_request_id = p_client_request_id
      and resume_from_run_id = p_failed_run_id
    limit 1;
  if v_existing_run_id is not null then
    return jsonb_build_object(
      'runId', v_existing_run_id, 'messageId', null, 'replayed', true,
      'status', (select status from public.astro_agent_runs where id = v_existing_run_id));
  end if;

  if exists (
    select 1 from public.astro_agent_runs r
    where r.profile_id = v_failed.profile_id and r.status = 'active'
  ) then
    raise exception 'another run is active for this profile' using errcode = 'ACF01';
  end if;

  insert into public.astro_agent_runs (
    user_id, profile_id, session_id, kind, status, phase,
    client_request_id, triggering_message_id, resume_from_run_id,
    checkpoint_json, context_version, last_completed_step
  ) values (
    v_user_id, v_failed.profile_id, v_failed.session_id, v_failed.kind, 'active', 'planning',
    p_client_request_id, v_failed.triggering_message_id, p_failed_run_id,
    v_failed.checkpoint_json, v_failed.context_version, v_failed.last_completed_step
  ) returning id into v_new_run_id;

  update public.astro_sessions
    set status = 'active', last_run_id = v_new_run_id, next_action = null,
        state_version = state_version + 1
    where id = v_failed.session_id;

  return jsonb_build_object(
    'runId', v_new_run_id, 'messageId', null, 'replayed', false, 'status', 'active');
end;
$$;
