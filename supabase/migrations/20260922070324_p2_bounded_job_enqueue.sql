-- Controlled enqueue for maintenance/rebuild work. The worker may request a
-- fresh job, but cannot choose an obsolete base or arbitrary out-of-range seq.
create or replace function public.person_enqueue_job(
  p_profile_id uuid, p_job_kind text, p_source_from_seq bigint, p_source_to_seq bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_head public.person_model_heads%rowtype;
  v_mode bigint;
  v_last_seq bigint;
  v_job uuid;
  v_created boolean;
begin
  if p_job_kind not in ('source_consolidation','correction','exclusion','deletion','rebuild')
    or p_source_from_seq < 1 or p_source_to_seq < p_source_from_seq then
    raise exception 'invalid job request' using errcode='AIR01';
  end if;
  select user_id into v_user from public.astro_profiles
    where id=p_profile_id and person_status not in ('deleting','deleted');
  if not found then raise exception 'person not found or unavailable' using errcode='ANF01'; end if;
  select * into v_head from public.person_model_heads
    where profile_id=p_profile_id and user_id=v_user for update;
  select last_accepted_seq into v_last_seq from public.person_source_sequences
    where profile_id=p_profile_id and user_id=v_user;
  select mode_epoch into v_mode from public.person_preferences
    where profile_id=p_profile_id and user_id=v_user;
  if p_source_to_seq > coalesce(v_last_seq,0) then
    raise exception 'job source range exceeds accepted input' using errcode='PSQ01';
  end if;
  if exists(select 1 from public.person_source_items s where s.user_id=v_user and s.profile_id=p_profile_id
      and s.source_seq between p_source_from_seq and p_source_to_seq
      and s.inclusion_status not in ('included','pending')) then
    raise exception 'job source range includes excluded or retracted input' using errcode='PSQ01';
  end if;
  insert into public.person_jobs(user_id,profile_id,job_kind,source_from_seq,source_to_seq,
    base_revision,privacy_epoch,mode_epoch)
  values(v_user,p_profile_id,p_job_kind,p_source_from_seq,p_source_to_seq,
    v_head.current_revision,v_head.privacy_epoch,v_mode)
  on conflict (profile_id,user_id,job_kind,source_from_seq,source_to_seq) do nothing
  returning id into v_job;
  v_created := found;
  if v_job is null then
    select id into v_job from public.person_jobs where profile_id=p_profile_id and user_id=v_user
      and job_kind=p_job_kind and source_from_seq=p_source_from_seq and source_to_seq=p_source_to_seq;
  else
    insert into public.person_outbox(user_id,profile_id,job_id,event_type,event_payload)
    values(v_user,p_profile_id,v_job,'person.input.accepted',
      jsonb_build_object('sourceFromSeq',p_source_from_seq,'sourceToSeq',p_source_to_seq,'jobKind',p_job_kind));
  end if;
  return jsonb_build_object('jobId',v_job,'created',v_created,'baseRevision',v_head.current_revision,
    'privacyEpoch',v_head.privacy_epoch,'modeEpoch',v_mode);
end;
$$;
revoke all on function public.person_enqueue_job(uuid,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.person_enqueue_job(uuid,text,bigint,bigint) to service_role;

-- A service key is a transport credential, not authority to forge the legacy
-- compatibility mirror. SECURITY DEFINER publication executes as postgres.
create or replace function public.person_reject_direct_memory_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.memory_version is distinct from old.memory_version and current_user <> 'postgres' then
    raise exception 'memory_version is server-managed' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.person_reject_direct_memory_version() from public,anon,authenticated,service_role;
