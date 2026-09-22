-- The publisher emits a separate completion event after the input-accepted
-- event. It remains one unique event per job and uses the existing outbox.
alter table public.person_outbox drop constraint person_outbox_event_type_check;
alter table public.person_outbox add constraint person_outbox_event_type_check
  check (event_type in ('person.input.accepted', 'person.updated', 'person.revision_published', 'person.job.failed'));

-- Existing correction RPC had a UUID current_version_id selected into a bigint
-- revision variable. Preserve the same API while keeping version and revision
-- identities correctly typed.
create or replace function public.person_record_correction(
  p_profile_id uuid, p_message_id uuid, p_target_object_id uuid, p_command_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_body jsonb;
  v_replay jsonb;
  v_message public.astro_messages%rowtype;
  v_source_id uuid;
  v_source_seq bigint;
  v_change_id uuid;
  v_job_id uuid;
  v_prior_version uuid;
  v_revision bigint;
  v_privacy_epoch bigint;
  v_mode_epoch bigint;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = 'AFB01'; end if;
  v_body := jsonb_build_object('profileId', p_profile_id, 'messageId', p_message_id,
    'targetObjectId', p_target_object_id);
  v_replay := public.person_reserve_command(v_user_id, p_command_id, 'person.correction', v_body);
  if v_replay is not null then return v_replay; end if;
  select m.* into v_message from public.astro_messages m
  where m.id=p_message_id and m.user_id=v_user_id and m.profile_id=p_profile_id and m.role='user';
  if not found then raise exception 'correction message not found for person' using errcode = 'ANF01'; end if;
  if not exists (
    select 1 from public.person_model_heads h join public.person_revision_objects ro
      on ro.profile_id=h.profile_id and ro.user_id=h.user_id and ro.revision_no=h.current_revision
    where h.profile_id=p_profile_id and h.user_id=v_user_id and ro.object_id=p_target_object_id
  ) then raise exception 'correction target is not in current person revision' using errcode = 'ANF01'; end if;
  select id, source_seq into v_source_id, v_source_seq from public.person_source_items
  where user_id=v_user_id and profile_id=p_profile_id and source_message_id=p_message_id;
  if v_source_id is null then
    update public.person_source_sequences set last_accepted_seq=last_accepted_seq+1, updated_at=now()
    where profile_id=p_profile_id and user_id=v_user_id returning last_accepted_seq into v_source_seq;
    if not found then raise exception 'person source sequence missing' using errcode = 'ANF01'; end if;
    insert into public.person_source_items (
      user_id, profile_id, source_seq, source_kind, source_message_id, speaker_role,
      subject_kind, source_time, original_order, content_fingerprint, command_id, lineage
    ) values (
      v_user_id, p_profile_id, v_source_seq, 'explicit_correction', p_message_id, 'user',
      'self', v_message.created_at, extract(epoch from v_message.created_at)::bigint,
      md5(v_message.content), p_command_id, jsonb_build_object('targetObjectId',p_target_object_id)
    ) returning id into v_source_id;
  else
    update public.person_source_items set source_kind='explicit_correction', command_id=p_command_id,
      lineage=lineage || jsonb_build_object('targetObjectId',p_target_object_id)
    where id=v_source_id and user_id=v_user_id and profile_id=p_profile_id;
    update public.person_jobs set state='cancelled',lease_token=null,lease_expires_at=null,
      updated_at=now(),last_error_code='superseded_by_correction'
    where user_id=v_user_id and profile_id=p_profile_id and job_kind='source_consolidation'
      and source_from_seq=v_source_seq and source_to_seq=v_source_seq and state='pending';
  end if;
  select current_version_id into v_prior_version from public.person_objects
  where id=p_target_object_id and user_id=v_user_id and profile_id=p_profile_id;
  insert into public.person_changes (
    user_id, profile_id, source_item_id, source_seq, change_kind, target_kind,
    target_id, prior_version_id, request
  ) values (
    v_user_id, p_profile_id, v_source_id, v_source_seq, 'correction', 'object',
    p_target_object_id, v_prior_version,
    jsonb_build_object('commandId',p_command_id,'sourceMessageId',p_message_id)
  ) returning id into v_change_id;
  insert into public.person_change_impacts (change_id,user_id,profile_id,entity_kind,entity_id)
    values (v_change_id,v_user_id,p_profile_id,'object',p_target_object_id);
  update public.person_model_heads set privacy_epoch=privacy_epoch+1, publication_state='stale', updated_at=now()
  where profile_id=p_profile_id and user_id=v_user_id
  returning current_revision, privacy_epoch into v_revision, v_privacy_epoch;
  select mode_epoch into v_mode_epoch from public.person_preferences
  where profile_id=p_profile_id and user_id=v_user_id;
  insert into public.person_jobs (
    user_id,profile_id,job_kind,source_from_seq,source_to_seq,base_revision,privacy_epoch,mode_epoch,command_id
  ) values (
    v_user_id,p_profile_id,'correction',v_source_seq,v_source_seq,v_revision,v_privacy_epoch,v_mode_epoch,p_command_id
  ) returning id into v_job_id;
  insert into public.person_outbox (user_id,profile_id,job_id,event_type,event_payload)
  values (v_user_id,p_profile_id,v_job_id,'person.input.accepted',
    jsonb_build_object('sourceSeq',v_source_seq,'changeId',v_change_id));
  v_result := jsonb_build_object('profileId',p_profile_id,'sourceId',v_source_id,
    'sourceSeq',v_source_seq,'changeId',v_change_id,'jobId',v_job_id,
    'invalidatedObjectId',p_target_object_id,'privacyEpoch',v_privacy_epoch);
  perform public.person_complete_command(v_user_id,p_command_id,p_profile_id,v_result);
  return v_result || jsonb_build_object('replayed',false);
end;
$$;
revoke all on function public.person_record_correction(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.person_record_correction(uuid,uuid,uuid,uuid) to authenticated;

-- Canonical authenticated change command. It records user intent as an
-- immutable source/change, immediately invalidates affected projections, and
-- queues reconciliation without requiring a synthetic chat message.
create or replace function public.person_submit_change(
  p_person_id uuid, p_command_id uuid, p_expected_revision bigint, p_change jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_kind text;
  v_change_kind text;
  v_target_kind text;
  v_target uuid;
  v_source_kind text;
  v_source_id uuid;
  v_source_seq bigint;
  v_head public.person_model_heads%rowtype;
  v_change_id uuid;
  v_prior_version uuid;
  v_job_id uuid;
  v_replay jsonb;
  v_body jsonb;
  v_invalidated jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode='AFB01'; end if;
  if p_change is null or jsonb_typeof(p_change)<>'object' then
    raise exception 'change must be an object' using errcode='AIR01';
  end if;
  v_kind := p_change->>'kind';
  if v_kind not in ('add_event','correct_account','reject_interpretation','add_meaning','exclude_source') then
    raise exception 'unsupported person change kind' using errcode='AIR01';
  end if;
  if (v_kind in ('add_event','add_meaning') and jsonb_typeof(p_change->'payload')<>'object')
    or (v_kind='correct_account' and (nullif(p_change->>'targetObjectId','') is null or jsonb_typeof(p_change->'payload')<>'object'))
    or (v_kind='reject_interpretation' and (nullif(p_change->>'targetObjectId','') is null or char_length(coalesce(p_change->>'explanation','')) not between 1 and 1000))
    or (v_kind='exclude_source' and nullif(p_change->>'sourceId','') is null)
    or pg_catalog.pg_column_size(p_change)>16384 then
    raise exception 'invalid typed change body' using errcode='AIR01';
  end if;
  v_body := jsonb_build_object('personId',p_person_id,'expectedRevision',p_expected_revision,'change',p_change);
  v_replay := public.person_reserve_command(v_user,p_command_id,'person.submit_change',v_body);
  if v_replay is not null then return v_replay; end if;

  select * into v_head from public.person_model_heads h
  where h.profile_id=p_person_id and h.user_id=v_user for update;
  if not found then raise exception 'person not found' using errcode='ANF01'; end if;
  if p_expected_revision is not null and p_expected_revision <> v_head.current_revision then
    raise exception 'change was based on a stale person revision' using errcode='PST01';
  end if;
  if v_kind in ('correct_account','reject_interpretation') then
    v_target := (p_change->>'targetObjectId')::uuid;
    if not exists(select 1 from public.person_revision_objects ro
      where ro.profile_id=p_person_id and ro.user_id=v_user and ro.revision_no=v_head.current_revision
        and ro.object_id=v_target) then
      raise exception 'change target is not in the current revision' using errcode='ANF01';
    end if;
    select current_version_id into v_prior_version from public.person_objects
      where id=v_target and user_id=v_user and profile_id=p_person_id;
    v_target_kind := 'object';
    v_change_kind := case when v_kind='correct_account' then 'correction' else 'rejection' end;
    v_source_kind := 'explicit_correction';
  elsif v_kind='exclude_source' then
    v_target := (p_change->>'sourceId')::uuid;
    if not exists(select 1 from public.person_source_items si where si.id=v_target
      and si.profile_id=p_person_id and si.user_id=v_user and si.inclusion_status='included') then
      raise exception 'source is not eligible for exclusion' using errcode='ANF01';
    end if;
    v_target_kind := 'source'; v_change_kind := 'exclusion'; v_source_kind := 'explicit_exclusion';
  else
    v_target := p_person_id; v_target_kind := 'person'; v_change_kind := 'inclusion'; v_source_kind := 'other';
  end if;

  update public.person_source_sequences set last_accepted_seq=last_accepted_seq+1,updated_at=now()
  where profile_id=p_person_id and user_id=v_user returning last_accepted_seq into v_source_seq;
  if not found then raise exception 'person source sequence is missing' using errcode='ANF01'; end if;
  insert into public.person_source_items (
    user_id,profile_id,source_seq,source_kind,speaker_role,subject_kind,original_order,
    content_fingerprint,command_id,lineage
  ) values (
    v_user,p_person_id,v_source_seq,v_source_kind,'user','self',v_source_seq,
    md5(p_change::text),p_command_id,jsonb_build_object('commandId',p_command_id,'changeKind',v_kind)
  ) returning id into v_source_id;
  insert into public.person_changes (
    user_id,profile_id,source_item_id,source_seq,change_kind,target_kind,target_id,
    prior_version_id,request
  ) values (
    v_user,p_person_id,v_source_id,v_source_seq,v_change_kind,v_target_kind,v_target,
    v_prior_version,p_change
  ) returning id into v_change_id;

  if v_target_kind='object' then
    insert into public.person_change_impacts(change_id,user_id,profile_id,entity_kind,entity_id)
    values(v_change_id,v_user,p_person_id,'object',v_target);
    v_invalidated := jsonb_build_array(v_target);
  elsif v_target_kind='source' then
    update public.person_source_items set inclusion_status='excluded'
      where id=v_target and profile_id=p_person_id and user_id=v_user;
    insert into public.person_change_impacts(change_id,user_id,profile_id,entity_kind,entity_id)
    select distinct v_change_id,v_user,p_person_id,'object',ov.object_id
    from public.person_object_version_support s
    join public.person_object_versions ov on ov.id=s.object_version_id and ov.user_id=s.user_id and ov.profile_id=s.profile_id
    where s.source_item_id=v_target and s.user_id=v_user and s.profile_id=p_person_id
    on conflict do nothing;
    select coalesce(jsonb_agg(distinct entity_id),'[]'::jsonb) into v_invalidated
      from public.person_change_impacts where change_id=v_change_id and entity_kind='object';
  end if;

  update public.person_model_heads set
    privacy_epoch=privacy_epoch+case when v_kind in ('correct_account','reject_interpretation','exclude_source') then 1 else 0 end,
    publication_state='stale',updated_at=now()
  where profile_id=p_person_id and user_id=v_user
  returning * into v_head;
  if v_kind in ('correct_account','reject_interpretation','exclude_source') then
    update public.person_jobs set state='cancelled',lease_token=null,lease_expires_at=null,
      last_error_code='superseded_by_explicit_change',updated_at=now()
    where profile_id=p_person_id and user_id=v_user and state='pending';
  end if;
  insert into public.person_jobs (
    user_id,profile_id,job_kind,source_from_seq,source_to_seq,base_revision,privacy_epoch,mode_epoch,command_id
  ) values (
    v_user,p_person_id,
    case when v_kind='exclude_source' then 'exclusion' when v_kind in ('correct_account','reject_interpretation') then 'correction' else 'source_consolidation' end,
    v_source_seq,v_source_seq,v_head.current_revision,v_head.privacy_epoch,v_head.mode_epoch,p_command_id
  ) returning id into v_job_id;
  insert into public.person_outbox(user_id,profile_id,job_id,event_type,event_payload)
  values(v_user,p_person_id,v_job_id,'person.input.accepted',jsonb_build_object('sourceId',v_source_id,'sourceSeq',v_source_seq,'changeId',v_change_id));

  v_result := jsonb_build_object(
    'change_id',v_change_id,'person_id',p_person_id,'source_id',v_source_id,'source_seq',v_source_seq,
    'command_id',p_command_id,'change_kind',v_change_kind,'target_kind',v_target_kind,'target_id',v_target,
    'prior_version_id',v_prior_version,'status','accepted','resolved_revision',null,'request',p_change,
    'invalidated_ids',v_invalidated,'expected_revision',p_expected_revision,'created_at',now(),'job_id',v_job_id
  );
  perform public.person_complete_command(v_user,p_command_id,p_person_id,v_result);
  return v_result || jsonb_build_object('replayed',false);
end;
$$;
revoke all on function public.person_submit_change(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.person_submit_change(uuid,uuid,bigint,jsonb) to authenticated;
