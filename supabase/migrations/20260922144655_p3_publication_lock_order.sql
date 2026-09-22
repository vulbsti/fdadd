-- Preserve the established head -> job -> candidate lock hierarchy for the
-- staged publisher. The implementation is renamed behind an owner-only
-- boundary; this public worker RPC locks the authoritative head before the
-- implementation obtains the job and candidate locks.
alter function public.person_publish_staged_candidate(uuid,uuid,bigint,uuid,uuid)
  rename to person_publish_staged_candidate_locked_impl;

revoke all on function public.person_publish_staged_candidate_locked_impl(uuid,uuid,bigint,uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.person_publish_staged_candidate(
  p_job_id uuid,p_lease_token uuid,p_fence bigint,p_candidate_id uuid,p_commit_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid; v_user_id uuid; v_result jsonb;
begin
  -- This unlocked lookup is only for resolving the lock target. The internal
  -- implementation revalidates the current job row and lease after the head
  -- lock is held.
  select j.profile_id,j.user_id into v_profile_id,v_user_id
    from public.person_jobs j where j.id=p_job_id;
  if not found then raise exception 'job does not exist' using errcode='PJF01'; end if;

  perform 1 from public.person_model_heads h
    where h.profile_id=v_profile_id and h.user_id=v_user_id
    for update;
  if not found then raise exception 'model head does not exist' using errcode='PST01'; end if;

  v_result:=public.person_publish_staged_candidate_locked_impl(
    p_job_id,p_lease_token,p_fence,p_candidate_id,p_commit_id);
  return v_result;
end;
$$;

revoke all on function public.person_publish_staged_candidate(uuid,uuid,bigint,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.person_publish_staged_candidate(uuid,uuid,bigint,uuid,uuid)
  to service_role;

-- The worker payload contract allows normalizedAssertion as a string. Preserve
-- it as an object at the storage boundary regardless of which trusted RPC
-- materializes an observation.
create or replace function public.person_normalize_observation_assertion()
returns trigger language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(new.normalized_assertion)='string' then
    new.normalized_assertion:=jsonb_build_object('text',new.normalized_assertion #>> '{}');
  end if;
  return new;
end;
$$;

create trigger person_normalize_observation_assertion_before_insert
before insert on public.person_observations
for each row execute function public.person_normalize_observation_assertion();

revoke all on function public.person_normalize_observation_assertion() from public,anon,authenticated,service_role;
