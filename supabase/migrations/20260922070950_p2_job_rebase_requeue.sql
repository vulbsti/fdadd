-- Rebase stale-but-still-useful jobs after a competing revision advances the
-- head. The head is always locked before the job, matching publication.
alter table public.person_jobs
  add column rebase_count integer not null default 0 check (rebase_count >= 0);

create function public.person_rebase_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_fence bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_profile uuid;
  v_head public.person_model_heads%rowtype;
  v_job public.person_jobs%rowtype;
  v_preference_epoch bigint;
  v_new_from bigint;
  v_remaining bigint;
  v_ordinal integer;
  v_old_from bigint;
  v_old_base bigint;
begin
  -- This unlocked lookup only discovers which head to lock first.
  select j.user_id, j.profile_id into v_user, v_profile
  from public.person_jobs j where j.id = p_job_id;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;

  select h.* into v_head from public.person_model_heads h
  where h.profile_id = v_profile and h.user_id = v_user for update;
  if not found then raise exception 'person head not found' using errcode = 'ANF01'; end if;

  select j.* into v_job from public.person_jobs j
  where j.id = p_job_id and j.profile_id = v_profile and j.user_id = v_user
  for update;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  if v_job.state not in ('leased', 'running')
     or v_job.lease_token is distinct from p_lease_token
     or v_job.fence is distinct from p_fence
     or v_job.lease_expires_at is null
     or v_job.lease_expires_at <= now() then
    raise exception 'job lease is no longer current' using errcode = 'PJF01';
  end if;

  select p.mode_epoch into v_preference_epoch from public.person_preferences p
  where p.profile_id = v_profile and p.user_id = v_user;

  -- A privacy or mode transition is never safe to rebase across. Cancel it so
  -- the worker cannot accidentally publish stale/suppressed data later.
  if v_job.privacy_epoch <> v_head.privacy_epoch
     or v_job.mode_epoch <> v_head.mode_epoch
     or v_job.mode_epoch is distinct from v_preference_epoch then
    update public.person_jobs
    set state = 'cancelled', lease_token = null, lease_expires_at = null,
        fence = fence + 1, last_error_code = 'rebase_epoch_changed',
        completed_at = now(), updated_at = now()
    where id = p_job_id;
    return jsonb_build_object('status', 'cancelled', 'reason', 'epoch_changed',
      'jobId', p_job_id, 'currentRevision', v_head.current_revision);
  end if;

  -- Another worker has already incorporated this entire range. Complete this
  -- duplicate safely without manufacturing a revision.
  if v_job.source_to_seq <= v_head.processed_source_seq then
    update public.person_jobs
    set state = 'completed', result_revision = v_head.current_revision,
        lease_token = null, lease_expires_at = null, fence = fence + 1,
        last_error_code = 'superseded_already_processed', completed_at = now(), updated_at = now()
    where id = p_job_id;
    return jsonb_build_object('status', 'completed', 'superseded', true,
      'jobId', p_job_id, 'resultRevision', v_head.current_revision);
  end if;

  v_new_from := greatest(v_job.source_from_seq, v_head.processed_source_seq + 1);
  select count(*) into v_remaining from public.person_source_items s
  where s.profile_id = v_profile and s.user_id = v_user
    and s.source_seq between v_new_from and v_job.source_to_seq
    and s.inclusion_status = 'included';

  if v_remaining <> v_job.source_to_seq - v_new_from + 1 then
    update public.person_jobs
    set state = 'cancelled', lease_token = null, lease_expires_at = null,
        fence = fence + 1, last_error_code = 'rebase_source_range_ineligible',
        completed_at = now(), updated_at = now()
    where id = p_job_id;
    return jsonb_build_object('status', 'cancelled', 'reason', 'source_range_ineligible',
      'jobId', p_job_id, 'sourceFromSeq', v_new_from, 'sourceToSeq', v_job.source_to_seq);
  end if;

  v_old_from := v_job.source_from_seq;
  v_old_base := v_job.base_revision;
  update public.person_jobs
  set state = 'pending', source_from_seq = v_new_from,
      base_revision = v_head.current_revision,
      lease_token = null, lease_expires_at = null, fence = fence + 1,
      rebase_count = rebase_count + 1, result_revision = null,
      last_error_code = null, completed_at = null,
      available_at = now(), updated_at = now()
  where id = p_job_id
  returning * into v_job;

  select coalesce(max(s.ordinal), -1) + 1 into v_ordinal
  from public.person_job_steps s where s.job_id = p_job_id;
  insert into public.person_job_steps
    (user_id, profile_id, job_id, ordinal, step_key, stage, state, refs, completed_at)
  values
    (v_user, v_profile, p_job_id, v_ordinal,
     'rebase:' || p_fence::text || ':' || v_job.fence::text,
     'repair', 'succeeded',
     jsonb_build_object('fromRevision', v_old_base, 'toRevision', v_job.base_revision,
       'trimmedFromSeq', v_old_from, 'sourceFromSeq', v_job.source_from_seq,
       'sourceToSeq', v_job.source_to_seq), now());

  return jsonb_build_object('status', 'pending', 'jobId', p_job_id,
    'baseRevision', v_job.base_revision, 'sourceFromSeq', v_job.source_from_seq,
    'sourceToSeq', v_job.source_to_seq, 'fence', v_job.fence,
    'rebaseCount', v_job.rebase_count);
end;
$$;

revoke all on function public.person_rebase_job(uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.person_rebase_job(uuid, uuid, bigint)
  to service_role;
