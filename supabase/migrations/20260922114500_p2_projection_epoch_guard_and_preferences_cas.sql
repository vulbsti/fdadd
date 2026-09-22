-- Fail closed when the head, preference epoch, and published revision do not
-- describe the same mode/privacy snapshot. Also make mode changes a real CAS.

create or replace function public.person_read_projection(
  p_profile_id uuid,
  p_view text,
  p_object_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with selected_head as materialized (
  select h.profile_id, h.user_id, h.current_revision, h.processed_source_seq,
         h.privacy_epoch, h.mode_epoch, h.publication_state, h.updated_at,
         p.astrology_enabled, p.mode_epoch as preference_mode_epoch,
         r.mode_epoch as revision_mode_epoch, r.privacy_epoch as revision_privacy_epoch,
         coalesce(p.mode_epoch = h.mode_epoch
           and r.mode_epoch = h.mode_epoch
           and r.privacy_epoch = h.privacy_epoch, false) as epochs_match
  from public.person_model_heads h
  left join public.person_preferences p
    on p.profile_id = h.profile_id and p.user_id = h.user_id
  left join public.person_model_revisions r
    on r.profile_id = h.profile_id and r.user_id = h.user_id
   and r.revision_no = h.current_revision
  where h.profile_id = p_profile_id and h.user_id = (select auth.uid())
    and p_view in ('life-map','patterns','people','paths','object')
), eligible_objects as materialized (
  select o.id as object_id, o.kind, ov.id as version_id, ov.version_no,
         ov.epistemic_class, ov.lifecycle, ov.typed_payload,
         ov.effective_from, ov.effective_to
  from selected_head h
  join public.person_revision_objects ro
    on ro.profile_id = h.profile_id and ro.user_id = h.user_id
   and ro.revision_no = h.current_revision
  join public.person_objects o
    on o.id = ro.object_id and o.user_id = ro.user_id and o.profile_id = ro.profile_id
  join public.person_object_versions ov
    on ov.id = ro.object_version_id and ov.object_id = ro.object_id
   and ov.user_id = ro.user_id and ov.profile_id = ro.profile_id
  where h.epochs_match
    and not exists (
      select 1 from public.person_change_impacts ci
      join public.person_changes c
        on c.id = ci.change_id and c.user_id = ci.user_id and c.profile_id = ci.profile_id
      where ci.user_id = h.user_id and ci.profile_id = h.profile_id
        and ci.entity_kind = 'object' and ci.entity_id = o.id and c.status = 'accepted'
    )
), eligible_relations as materialized (
  select r.id as relation_id, r.relation_kind, r.from_object_id, r.to_object_id,
         rv.id as version_id, rv.version_no, rv.epistemic_class, rv.lifecycle,
         rv.typed_payload
  from selected_head h
  join public.person_revision_relations rr
    on rr.profile_id = h.profile_id and rr.user_id = h.user_id
   and rr.revision_no = h.current_revision
  join public.person_relations r
    on r.id = rr.relation_id and r.user_id = rr.user_id and r.profile_id = rr.profile_id
  join public.person_relation_versions rv
    on rv.id = rr.relation_version_id and rv.relation_id = rr.relation_id
   and rv.user_id = rr.user_id and rv.profile_id = rr.profile_id
  where h.epochs_match
    and exists (select 1 from eligible_objects a where a.object_id = r.from_object_id)
    and exists (select 1 from eligible_objects b where b.object_id = r.to_object_id)
    and not exists (
      select 1 from public.person_change_impacts ci
      join public.person_changes c
        on c.id = ci.change_id and c.user_id = ci.user_id and c.profile_id = ci.profile_id
      where ci.user_id = h.user_id and ci.profile_id = h.profile_id
        and ci.entity_kind = 'relation' and ci.entity_id = r.id and c.status = 'accepted'
    )
), selected_objects as (
  select o.* from eligible_objects o
  where case p_view
    when 'life-map' then o.kind = any(array['episode','meaning_change','chapter','goal','current_state','scenario','gap','pattern','issue'])
    when 'patterns' then o.kind = 'pattern'
    when 'people' then o.kind = 'influence'
    when 'paths' then o.kind = any(array['scenario','goal'])
    when 'object' then o.object_id = p_object_id or exists (
      select 1 from eligible_relations r
      where (r.from_object_id = p_object_id and r.to_object_id = o.object_id)
         or (r.to_object_id = p_object_id and r.from_object_id = o.object_id)
    )
    else false end
), selected_relations as (
  select r.* from eligible_relations r
  where p_view <> 'object'
     or r.from_object_id = p_object_id or r.to_object_id = p_object_id
), support as (
  select count(*)::bigint as support_count
  from public.person_object_version_support s
  join eligible_objects o on o.version_id = s.object_version_id
  where p_view = 'object' and o.object_id = p_object_id
)
select jsonb_build_object(
  'personId', h.profile_id,
  'personRevision', h.current_revision,
  'sourceWatermark', h.processed_source_seq,
  'mode', case when h.astrology_enabled then 'astrology' else 'personal' end,
  'modeEpoch', h.mode_epoch,
  'privacyEpoch', h.privacy_epoch,
  'generatedAt', h.updated_at,
  'updateState', case when not h.epochs_match then 'updating'
                      when h.publication_state in ('current','empty') then 'current'
                      when h.publication_state = 'blocked' then 'failed' else 'updating' end,
  'objects', coalesce((select jsonb_agg(to_jsonb(o) order by o.object_id) from selected_objects o), '[]'::jsonb),
  'relations', coalesce((select jsonb_agg(to_jsonb(r) order by r.relation_id) from selected_relations r), '[]'::jsonb),
  'supportCount', coalesce((select support_count from support), 0)
)
from selected_head h;
$$;
revoke all on function public.person_read_projection(uuid,text,uuid)
  from public, anon, service_role;
grant execute on function public.person_read_projection(uuid,text,uuid)
  to authenticated;

-- The previous five-argument entry point could not require an expected mode
-- epoch. Remove it so callers cannot bypass compare-and-set.
drop function public.person_set_preferences(uuid, boolean, jsonb, text, uuid);

create function public.person_set_preferences(
  p_profile_id uuid,
  p_astrology_enabled boolean,
  p_domains jsonb,
  p_locale text,
  p_expected_mode_epoch bigint,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_head public.person_model_heads%rowtype;
  v_preferences public.person_preferences%rowtype;
  v_body jsonb;
  v_replay jsonb;
  v_mode_epoch bigint;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = 'AFB01'; end if;
  if p_astrology_enabled is null or p_expected_mode_epoch is null or p_expected_mode_epoch < 0
     or p_domains is null or jsonb_typeof(p_domains) <> 'object'
     or pg_catalog.pg_column_size(p_domains) > 8192
     or char_length(coalesce(p_locale, '')) > 32 then
    raise exception 'invalid preference payload' using errcode = 'AIR01';
  end if;
  v_body := jsonb_build_object('profileId', p_profile_id,
    'astrologyEnabled', p_astrology_enabled, 'domains', p_domains, 'locale', p_locale,
    'expectedModeEpoch', p_expected_mode_epoch);
  v_replay := public.person_reserve_command(
    v_user_id, p_command_id, 'person.preferences.set', v_body);
  if v_replay is not null then return v_replay; end if;

  -- Mode writes use the same head-before-preferences ordering as publication.
  select * into v_head from public.person_model_heads h
  where h.profile_id = p_profile_id and h.user_id = v_user_id for update;
  if not found then raise exception 'person not found' using errcode = 'ANF01'; end if;
  select * into v_preferences from public.person_preferences p
  where p.profile_id = p_profile_id and p.user_id = v_user_id for update;
  if not found then raise exception 'person preferences not found' using errcode = 'ANF01'; end if;
  if v_preferences.mode_epoch <> p_expected_mode_epoch
     or v_head.mode_epoch <> p_expected_mode_epoch then
    raise exception 'preferences changed since they were read' using errcode = 'PST01';
  end if;

  update public.person_preferences
  set astrology_enabled = p_astrology_enabled, domains = p_domains,
      locale = nullif(p_locale, ''), mode_epoch = mode_epoch + 1, updated_at = now()
  where profile_id = p_profile_id and user_id = v_user_id
  returning mode_epoch into v_mode_epoch;
  -- The existing AFTER trigger advances head.mode_epoch under this transaction.
  update public.person_model_heads set publication_state = 'stale', updated_at = now()
  where profile_id = p_profile_id and user_id = v_user_id;

  v_result := jsonb_build_object('status', 'updated', 'profileId', p_profile_id,
    'astrologyEnabled', p_astrology_enabled,
    'expectedModeEpoch', p_expected_mode_epoch, 'modeEpoch', v_mode_epoch);
  perform public.person_complete_command(v_user_id, p_command_id, p_profile_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end;
$$;
revoke all on function public.person_set_preferences(uuid, boolean, jsonb, text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.person_set_preferences(uuid, boolean, jsonb, text, bigint, uuid)
  to authenticated;
