-- This API is the durable user-intent boundary for person changes. Kept in a
-- follow-up migration so it can evolve independently from storage bootstrapping.
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
  where profile_id=p_person_id and user_id=v_user returning * into v_head;
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
    values(v_user,p_person_id,v_job_id,'person.input.accepted',
      jsonb_build_object('sourceId',v_source_id,'sourceSeq',v_source_seq,'changeId',v_change_id));
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
