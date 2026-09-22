-- Keep a consistent lock order across commands that change publication state:
-- person head first, then job. The locked body still performs all validation
-- and writes in one transaction; this wrapper only acquires its head lock first.
alter function public.person_publish_revision(uuid,uuid,bigint,bigint,bigint,uuid,jsonb)
  rename to person_publish_revision_job_locked;
revoke all on function public.person_publish_revision_job_locked(uuid,uuid,bigint,bigint,bigint,uuid,jsonb)
  from public, anon, authenticated, service_role;

create function public.person_publish_revision(
  p_job_id uuid, p_lease_token uuid, p_fence bigint,
  p_expected_base_revision bigint, p_expected_privacy_epoch bigint,
  p_commit_id uuid, p_candidate jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_profile uuid;
begin
  select user_id, profile_id into v_user, v_profile
  from public.person_jobs where id=p_job_id;
  if not found then raise exception 'job not found' using errcode='P0002'; end if;
  perform 1 from public.person_model_heads where profile_id=v_profile and user_id=v_user for update;
  if not found then raise exception 'person head not found' using errcode='ANF01'; end if;
  return public.person_publish_revision_job_locked(
    p_job_id,p_lease_token,p_fence,p_expected_base_revision,p_expected_privacy_epoch,p_commit_id,p_candidate
  );
end;
$$;
revoke all on function public.person_publish_revision(uuid,uuid,bigint,bigint,bigint,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.person_publish_revision(uuid,uuid,bigint,bigint,bigint,uuid,jsonb)
  to service_role;
