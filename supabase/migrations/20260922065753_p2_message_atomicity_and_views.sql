-- Close the message/source crash gap left by the legacy chat RPC, maintain a
-- stable mode epoch on the authoritative head, and persist immutable view
-- snapshots as part of the publication transaction.

alter table public.person_model_heads
  add column mode_epoch bigint not null default 0 check (mode_epoch >= 0);
update public.person_model_heads h set mode_epoch = p.mode_epoch
from public.person_preferences p where p.profile_id = h.profile_id and p.user_id = h.user_id;

create or replace function public.person_sync_head_mode_epoch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.person_model_heads set mode_epoch = new.mode_epoch, publication_state = 'stale', updated_at = now()
  where profile_id = new.profile_id and user_id = new.user_id;
  return new;
end;
$$;
create trigger person_preferences_sync_head_epoch
after update of mode_epoch on public.person_preferences
for each row when (old.mode_epoch is distinct from new.mode_epoch)
execute function public.person_sync_head_mode_epoch();
revoke all on function public.person_sync_head_mode_epoch() from public, anon, authenticated, service_role;

create or replace function public.person_validate_revision_mode_epoch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.person_preferences p
      where p.profile_id = new.profile_id and p.user_id = new.user_id and p.mode_epoch = new.mode_epoch) then
    raise exception 'candidate mode epoch is stale' using errcode = 'PSM01';
  end if;
  return new;
end;
$$;
create trigger person_revision_validate_mode_epoch
before insert on public.person_model_revisions
for each row execute function public.person_validate_revision_mode_epoch();
revoke all on function public.person_validate_revision_mode_epoch() from public, anon, authenticated, service_role;

create table public.person_view_snapshots (
  user_id uuid not null,
  profile_id uuid not null,
  person_revision bigint not null,
  view_key text not null check (view_key in
    ('life_map','chapters','patterns','people','paths','chapter_detail','object_detail')),
  snapshot_json jsonb not null check (jsonb_typeof(snapshot_json) = 'object'),
  source_watermark bigint not null check (source_watermark >= 0),
  mode_epoch bigint not null check (mode_epoch >= 0),
  privacy_epoch bigint not null check (privacy_epoch >= 0),
  created_at timestamptz not null default now(),
  primary key (profile_id, user_id, person_revision, view_key),
  constraint person_view_snapshots_revision_fk
    foreign key (profile_id, user_id, person_revision)
    references public.person_model_revisions (profile_id, user_id, revision_no) on delete cascade,
  constraint person_view_snapshots_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade
);
alter table public.person_view_snapshots enable row level security;
create policy person_view_snapshots_owner_read on public.person_view_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.person_view_snapshots from anon, authenticated;
grant select on table public.person_view_snapshots to authenticated;
grant select, insert on table public.person_view_snapshots to service_role;

-- `viewSnapshots` is optional during cutover, but when supplied it shares the
-- revision transaction. A candidate cannot publish views for another person.
create or replace function public.person_revision_store_views()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_key text; v_snapshot jsonb;
begin
  for v in select value from jsonb_array_elements(
    coalesce(new.commit_request->'candidate'->'viewSnapshots', '[]'::jsonb)) loop
    v_key := v->>'viewKey';
    v_snapshot := v->'snapshot';
    if v_key not in ('life_map','chapters','patterns','people','paths','chapter_detail','object_detail')
       or v_snapshot is null or jsonb_typeof(v_snapshot) <> 'object'
       or coalesce((v_snapshot->>'personRevision')::bigint, new.revision_no) <> new.revision_no then
      raise exception 'invalid view snapshot in revision candidate' using errcode = '23514';
    end if;
    insert into public.person_view_snapshots (
      user_id, profile_id, person_revision, view_key, snapshot_json,
      source_watermark, mode_epoch, privacy_epoch
    ) values (
      new.user_id, new.profile_id, new.revision_no, v_key, v_snapshot,
      new.processed_source_seq, new.mode_epoch, new.privacy_epoch
    );
  end loop;
  return new;
end;
$$;
create trigger person_revision_store_views_after_insert
after insert on public.person_model_revisions
for each row execute function public.person_revision_store_views();
revoke all on function public.person_revision_store_views() from public, anon, authenticated, service_role;

-- Every user-authored message becomes an ordered source and durable work item
-- in the same transaction as the message insert. The message UUID is the
-- idempotency identity; retries hit the existing row/unique source reference.
create or replace function public.person_register_user_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_seq bigint;
  v_source_id uuid;
  v_revision bigint;
  v_privacy bigint;
  v_mode bigint;
  v_job_id uuid;
begin
  if new.role <> 'user' or new.profile_id is null then return new; end if;
  if exists (select 1 from public.person_source_items
      where profile_id = new.profile_id and user_id = new.user_id and source_message_id = new.id) then
    return new;
  end if;
  update public.person_source_sequences set last_accepted_seq = last_accepted_seq + 1, updated_at = now()
  where profile_id = new.profile_id and user_id = new.user_id returning last_accepted_seq into v_seq;
  if not found then raise exception 'person source sequence is missing' using errcode = 'ANF01'; end if;
  insert into public.person_source_items (
    user_id, profile_id, source_seq, source_kind, source_message_id, speaker_role,
    subject_kind, source_time, original_order, content_fingerprint, lineage
  ) values (
    new.user_id, new.profile_id, v_seq, 'native_message', new.id, 'user',
    'self', new.created_at, extract(epoch from new.created_at)::bigint,
    md5(new.content), jsonb_build_object('messageId', new.id, 'sessionId', new.session_id)
  ) returning id into v_source_id;
  select h.current_revision, h.privacy_epoch, h.mode_epoch
    into v_revision, v_privacy, v_mode
  from public.person_model_heads h where h.profile_id = new.profile_id and h.user_id = new.user_id;
  insert into public.person_jobs (
    user_id, profile_id, job_kind, source_from_seq, source_to_seq,
    base_revision, privacy_epoch, mode_epoch
  ) values (
    new.user_id, new.profile_id, 'source_consolidation', v_seq, v_seq,
    v_revision, v_privacy, v_mode
  ) returning id into v_job_id;
  insert into public.person_outbox (user_id, profile_id, job_id, event_type, event_payload)
  values (new.user_id, new.profile_id, v_job_id, 'person.input.accepted',
    jsonb_build_object('sourceId', v_source_id, 'sourceSeq', v_seq, 'messageId', new.id));
  return new;
end;
$$;
create trigger astro_messages_register_person_source
after insert on public.astro_messages
for each row when (new.role = 'user') execute function public.person_register_user_message();
revoke all on function public.person_register_user_message() from public, anon, authenticated, service_role;

-- Compatibility adapter: manual source acceptance now returns the same source
-- and job already committed by the message trigger; it does not allocate a
-- second sequence or create duplicate work.
create or replace function public.person_accept_user_message(
  p_profile_id uuid, p_message_id uuid, p_command_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_body jsonb;
  v_replay jsonb;
  v_source public.person_source_items%rowtype;
  v_job_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = 'AFB01'; end if;
  v_body := jsonb_build_object('profileId', p_profile_id, 'messageId', p_message_id);
  v_replay := public.person_reserve_command(v_user_id, p_command_id, 'source.accept_user_message', v_body);
  if v_replay is not null then return v_replay; end if;
  select si.* into v_source from public.person_source_items si
  join public.astro_messages m on m.id = si.source_message_id and m.user_id = si.user_id
    and m.profile_id = si.profile_id
  where si.profile_id = p_profile_id and si.user_id = v_user_id and m.id = p_message_id and m.role = 'user';
  if not found then raise exception 'user message not found for person' using errcode = 'ANF01'; end if;
  select id into v_job_id from public.person_jobs
  where user_id = v_user_id and profile_id = p_profile_id
    and source_from_seq = v_source.source_seq and source_to_seq = v_source.source_seq
    and job_kind = 'source_consolidation';
  v_result := jsonb_build_object('profileId', p_profile_id, 'sourceId', v_source.id,
    'sourceSeq', v_source.source_seq, 'jobId', v_job_id, 'alreadyAccepted', false);
  perform public.person_complete_command(v_user_id, p_command_id, p_profile_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end;
$$;

-- Worker-produced observations are job-scoped, source-range-scoped, and fenced.
alter table public.person_observations
  add column job_id uuid,
  add column idempotency_key text,
  add column subject_profile_id uuid,
  add column event_time jsonb not null default '{"precision":"unknown","start":null,"end":null,"age":null,"note":null}'::jsonb,
  add column extractor_version text;
alter table public.person_observations
  add constraint person_observations_job_fk foreign key (job_id, user_id, profile_id)
    references public.person_jobs (id, user_id, profile_id) on delete cascade,
  add constraint person_observations_subject_fk foreign key (subject_profile_id, user_id)
    references public.astro_profiles (id, user_id) on delete set null (subject_profile_id);
create unique index person_observations_job_idempotency
  on public.person_observations (job_id, idempotency_key) where job_id is not null;
revoke insert, update, delete on table public.person_observations from service_role;
grant select on table public.person_observations to service_role;

create or replace function public.person_record_observations(
  p_job_id uuid, p_lease_token uuid, p_fence bigint, p_observations jsonb
)
returns setof public.person_observations
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.person_jobs%rowtype;
  v_item jsonb;
  v_source public.person_source_items%rowtype;
  v_result public.person_observations%rowtype;
  v_key text;
  v_precision text;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_observations is null or jsonb_typeof(p_observations) <> 'array'
     or jsonb_array_length(p_observations) < 1 or jsonb_array_length(p_observations) > 500 then
    raise exception 'observations must be a bounded non-empty array' using errcode = '22023';
  end if;
  select * into v_job from public.person_jobs where id = p_job_id for update;
  if not found or v_job.state not in ('leased', 'running')
    or v_job.lease_token is distinct from p_lease_token or v_job.fence is distinct from p_fence
    or v_job.lease_expires_at <= now() then
    raise exception 'job lease fence is stale' using errcode = 'PJF01';
  end if;
  for v_item in select value from jsonb_array_elements(p_observations) loop
    select * into v_source from public.person_source_items
    where id = (v_item->>'sourceId')::uuid and user_id = v_job.user_id and profile_id = v_job.profile_id
      and source_seq between v_job.source_from_seq and v_job.source_to_seq;
    if not found or v_source.inclusion_status <> 'included' then
      raise exception 'observation source is outside the eligible job range' using errcode = 'PSQ01';
    end if;
    v_key := md5(v_item::text);
    v_precision := coalesce(v_item->'eventTime'->>'precision', 'unknown');
    v_start := nullif(v_item->'eventTime'->>'start', '')::timestamptz;
    v_end := nullif(v_item->'eventTime'->>'end', '')::timestamptz;
    insert into public.person_observations (
      user_id, profile_id, source_item_id, source_seq, span_start, span_end, exact_quote,
      normalized_assertion, subject_kind, subject_label, domain, assertion_type,
      occurred_from, occurred_to, time_precision, extraction_version, verifier_version,
      status, job_id, idempotency_key, subject_profile_id, event_time, extractor_version
    ) values (
      v_job.user_id, v_job.profile_id, v_source.id, v_source.source_seq,
      nullif(v_item->>'spanStart','')::integer, nullif(v_item->>'spanEnd','')::integer,
      nullif(v_item->>'exactQuote',''), jsonb_build_object('text', v_item->>'normalizedAssertion'),
      case when nullif(v_item->>'subjectPersonId','') is null or (v_item->>'subjectPersonId')::uuid = v_job.profile_id then 'self' else 'other' end,
      null, coalesce(v_item->>'domain',''),
      case v_item->>'assertionType' when 'question' then 'unknown' when 'correction' then 'direct' else v_item->>'assertionType' end,
      v_start, v_end, v_precision, v_item->>'extractorVersion', v_item->>'verifierVersion',
      'proposed', p_job_id, v_key, nullif(v_item->>'subjectPersonId','')::uuid,
      coalesce(v_item->'eventTime','{}'::jsonb), v_item->>'extractorVersion'
    ) on conflict (job_id, idempotency_key) where job_id is not null do nothing;
    select * into v_result from public.person_observations where job_id=p_job_id and idempotency_key=v_key;
    return next v_result;
  end loop;
  return;
end;
$$;
revoke all on function public.person_record_observations(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.person_record_observations(uuid, uuid, bigint, jsonb) to service_role;

-- Keep the client-supplied memory_version as a compatibility mirror only;
-- publisher still locks the head and checks expected base/privacy/mode epochs.
create or replace function public.person_reject_direct_memory_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.memory_version is distinct from old.memory_version
    and current_user not in ('postgres','service_role') then
    raise exception 'memory_version is server-managed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger astro_profiles_memory_version_guard
before update of memory_version on public.astro_profiles
for each row execute function public.person_reject_direct_memory_version();
revoke all on function public.person_reject_direct_memory_version() from public, anon, authenticated, service_role;
