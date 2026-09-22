-- P2 read surfaces must be revision coherent, and opening an object in chat
-- must persist that selection without inventing a user-authored message.

alter table public.person_revision_objects
  add constraint person_revision_objects_exact_version_key
  unique (profile_id, user_id, revision_no, object_id, object_version_id);

create table public.person_exploration_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  session_id uuid not null,
  person_revision bigint not null check (person_revision > 0),
  object_id uuid not null,
  object_version_id uuid not null,
  prompt_key text not null default 'explore_object'
    check (prompt_key in ('explore_object')),
  mode_epoch bigint not null check (mode_epoch >= 0),
  privacy_epoch bigint not null check (privacy_epoch >= 0),
  command_id uuid not null,
  status text not null default 'active' check (status in ('active','superseded','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_exploration_contexts_session_fk
    foreign key (session_id, user_id, profile_id)
    references public.astro_sessions (id, user_id, profile_id) on delete cascade,
  constraint person_exploration_contexts_revision_object_fk
    foreign key (profile_id, user_id, person_revision, object_id, object_version_id)
    references public.person_revision_objects
      (profile_id, user_id, revision_no, object_id, object_version_id) on delete restrict,
  constraint person_exploration_contexts_session_key unique (session_id),
  constraint person_exploration_contexts_command_key unique (user_id, command_id),
  constraint person_exploration_contexts_id_owner_key unique (id, user_id, profile_id)
);
create index person_exploration_contexts_profile_created_idx
  on public.person_exploration_contexts (profile_id, user_id, created_at desc);

alter table public.person_exploration_contexts enable row level security;
create policy person_exploration_contexts_owner_read
  on public.person_exploration_contexts for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.person_exploration_contexts from public, anon, authenticated;
grant select on table public.person_exploration_contexts to authenticated;
grant all privileges on table public.person_exploration_contexts to service_role;

create or replace function public.person_start_exploration(
  p_profile_id uuid,
  p_object_id uuid,
  p_expected_revision bigint,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_head public.person_model_heads%rowtype;
  v_version_id uuid;
  v_title text;
  v_session_id uuid;
  v_context_id uuid;
  v_body jsonb;
  v_replay jsonb;
  v_result jsonb;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = 'AFB01'; end if;
  v_body := jsonb_build_object(
    'profileId', p_profile_id,
    'objectId', p_object_id,
    'expectedRevision', p_expected_revision
  );
  v_replay := public.person_reserve_command(
    v_user, p_command_id, 'person.start_exploration', v_body
  );
  if v_replay is not null then return v_replay; end if;

  select * into v_head
  from public.person_model_heads h
  where h.profile_id = p_profile_id and h.user_id = v_user
  for update;
  if not found then raise exception 'person not found' using errcode = 'ANF01'; end if;
  if p_expected_revision is null or p_expected_revision <> v_head.current_revision then
    raise exception 'exploration was based on a stale person revision' using errcode = 'PST01';
  end if;

  select ro.object_version_id, coalesce(nullif(btrim(ov.typed_payload->>'title'), ''), 'Profile exploration')
    into v_version_id, v_title
  from public.person_revision_objects ro
  join public.person_object_versions ov
    on ov.id = ro.object_version_id and ov.object_id = ro.object_id
   and ov.user_id = ro.user_id and ov.profile_id = ro.profile_id
  where ro.profile_id = p_profile_id and ro.user_id = v_user
    and ro.revision_no = v_head.current_revision and ro.object_id = p_object_id
    and ov.lifecycle = 'active'
    and not exists (
      select 1 from public.person_change_impacts ci
      join public.person_changes c
        on c.id = ci.change_id and c.user_id = ci.user_id and c.profile_id = ci.profile_id
      where ci.user_id = v_user and ci.profile_id = p_profile_id
        and ci.entity_kind = 'object' and ci.entity_id = p_object_id
        and c.status = 'accepted'
    );
  if v_version_id is null then
    raise exception 'object is not available in the current revision' using errcode = 'ANF01';
  end if;

  insert into public.astro_sessions (user_id, profile_id, title, status)
  values (v_user, p_profile_id, left('Exploring ' || v_title, 240), 'complete')
  returning id into v_session_id;

  insert into public.person_exploration_contexts (
    user_id, profile_id, session_id, person_revision, object_id,
    object_version_id, mode_epoch, privacy_epoch, command_id
  ) values (
    v_user, p_profile_id, v_session_id, v_head.current_revision, p_object_id,
    v_version_id, v_head.mode_epoch, v_head.privacy_epoch, p_command_id
  ) returning id into v_context_id;

  v_result := jsonb_build_object(
    'sessionId', v_session_id,
    'profileId', p_profile_id,
    'contextId', v_context_id,
    'objectId', p_object_id,
    'objectVersionId', v_version_id,
    'personRevision', v_head.current_revision,
    'modeEpoch', v_head.mode_epoch,
    'privacyEpoch', v_head.privacy_epoch
  );
  perform public.person_complete_command(v_user, p_command_id, p_profile_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end;
$$;
revoke all on function public.person_start_exploration(uuid,uuid,bigint,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.person_start_exploration(uuid,uuid,bigint,uuid)
  to authenticated;

-- Owner-scoped, message-anchored search. Snippets are plain text and are never
-- returned as HTML. Search history remains distinct from model-source inclusion.
create or replace function public.person_search_conversations(
  p_profile_id uuid,
  p_query text,
  p_before_created_at timestamptz default null,
  p_before_message_id uuid default null,
  p_limit integer default 20
)
returns table (
  session_id uuid,
  session_title text,
  message_id uuid,
  message_role text,
  excerpt text,
  created_at timestamptz,
  source_seq bigint,
  inclusion_status text,
  rank real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_query text := btrim(coalesce(p_query, ''));
  v_tsq tsquery;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 30);
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = 'AFB01'; end if;
  if char_length(v_query) not between 2 and 200 then
    raise exception 'query must be 2-200 characters' using errcode = 'AIR01';
  end if;
  if not exists (
    select 1 from public.astro_profiles p
    where p.id = p_profile_id and p.user_id = v_user
  ) then raise exception 'person not found' using errcode = 'ANF01'; end if;
  v_tsq := pg_catalog.websearch_to_tsquery('simple', v_query);

  return query
  select s.id, s.title, m.id, m.role, left(m.content, 400), m.created_at,
         si.source_seq, si.inclusion_status,
         pg_catalog.ts_rank(m.search, v_tsq)
  from public.astro_messages m
  join public.astro_sessions s
    on s.id = m.session_id and s.user_id = m.user_id
  left join public.person_source_items si
    on si.source_message_id = m.id and si.user_id = m.user_id
   and si.profile_id = s.profile_id
  where m.user_id = v_user and s.profile_id = p_profile_id
    and m.role in ('user','assistant') and m.search @@ v_tsq
    and (
      p_before_created_at is null
      or m.created_at < p_before_created_at
      or (m.created_at = p_before_created_at and m.id < p_before_message_id)
    )
  order by rank desc, m.created_at desc, m.id desc
  limit v_limit;
end;
$$;
revoke all on function public.person_search_conversations(uuid,text,timestamptz,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.person_search_conversations(uuid,text,timestamptz,uuid,integer)
  to authenticated;

-- A single statement captures the head once and derives every member from the
-- same immutable revision. This prevents mixed revision metadata/object reads.
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
         p.astrology_enabled
  from public.person_model_heads h
  join public.person_preferences p
    on p.profile_id = h.profile_id and p.user_id = h.user_id
   and p.mode_epoch = h.mode_epoch
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
  where not exists (
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
  where exists (select 1 from eligible_objects a where a.object_id = r.from_object_id)
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
  'updateState', case when h.publication_state in ('current','empty') then 'current'
                      when h.publication_state = 'blocked' then 'failed' else 'updating' end,
  'objects', coalesce((select jsonb_agg(to_jsonb(o) order by o.object_id) from selected_objects o), '[]'::jsonb),
  'relations', coalesce((select jsonb_agg(to_jsonb(r) order by r.relation_id) from selected_relations r), '[]'::jsonb),
  'supportCount', coalesce((select support_count from support), 0)
)
from selected_head h;
$$;
revoke all on function public.person_read_projection(uuid,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.person_read_projection(uuid,text,uuid)
  to authenticated;
