-- Existing-person birth setup. Birth inputs are versioned separately from the
-- mutable profile projection so a retry or correction never erases history.

alter table public.astro_profiles
  add column birth_revision bigint not null default 0 check (birth_revision >= 0);

alter table public.astro_agent_runs
  add column birth_revision bigint;

create table public.person_birth_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  revision_no bigint not null check (revision_no >= 1),
  birth_date date not null,
  birth_time text not null check (birth_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  timezone text not null check (char_length(timezone) between 1 and 100),
  place_name text,
  time_source text not null default 'unknown',
  time_confidence text not null default 'unknown',
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  chart_json jsonb,
  sensitivity_json jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint person_birth_revisions_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint person_birth_revisions_profile_revision_key unique (profile_id, user_id, revision_no),
  constraint person_birth_revisions_id_owner_key unique (id, profile_id, user_id)
);

create index person_birth_revisions_profile_created_idx
  on public.person_birth_revisions (profile_id, revision_no desc);

alter table public.person_birth_revisions enable row level security;
revoke all on table public.person_birth_revisions from anon, authenticated;
grant select on table public.person_birth_revisions to authenticated;
grant all on table public.person_birth_revisions to service_role;
create policy person_birth_revisions_owner_read
  on public.person_birth_revisions for select to authenticated
  using ((select auth.uid()) = user_id);

-- The submitted birth fields are immutable. Only lifecycle/result columns may
-- change as the durable chart workflow completes or fails.
create or replace function public.person_birth_revision_immutable_inputs()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.user_id, new.profile_id, new.revision_no, new.birth_date, new.birth_time,
      new.latitude, new.longitude, new.timezone, new.place_name, new.time_source,
      new.time_confidence, new.created_at)
     is distinct from
     (old.user_id, old.profile_id, old.revision_no, old.birth_date, old.birth_time,
      old.latitude, old.longitude, old.timezone, old.place_name, old.time_source,
      old.time_confidence, old.created_at) then
    raise exception 'birth revision inputs are immutable' using errcode = 'PST02';
  end if;
  return new;
end;
$$;
create trigger person_birth_revisions_inputs_immutable
before update on public.person_birth_revisions
for each row execute function public.person_birth_revision_immutable_inputs();

-- Serialize every newly active run with a birth change. If a chat request wins
-- the lock first, birth setup sees it and refuses; if setup wins, the chat
-- starts after the new personal-only state is committed.
create or replace function public.person_lock_profile_for_active_run()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'active' then
    perform 1 from public.astro_profiles p where p.id = new.profile_id for update;
    if not found then
      raise exception 'profile not found' using errcode = 'ANF01';
    end if;
  end if;
  return new;
end;
$$;
create trigger astro_agent_runs_lock_profile
before insert on public.astro_agent_runs
for each row execute function public.person_lock_profile_for_active_run();

-- Direct table writes must not replace birth data during a run, and a chart
-- result for a revision may only publish from that revision's active intake.
create or replace function public.person_guard_birth_profile_writes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.birth_date, new.birth_time, new.lat, new.lng, new.tz, new.place_name,
      new.time_source, new.time_confidence)
     is distinct from
     (old.birth_date, old.birth_time, old.lat, old.lng, old.tz, old.place_name,
      old.time_source, old.time_confidence)
     and exists (
       select 1 from public.astro_agent_runs r
       where r.profile_id = old.id and r.status in ('active', 'waiting_for_user')
     ) then
    raise exception 'birth data cannot change while a run is active' using errcode = 'ACF01';
  end if;

  if new.birth_revision > 0
     and (new.initialization_status in ('ready', 'failed'))
     and (new.initialization_status is distinct from old.initialization_status
          or new.chart_json is distinct from old.chart_json
          or new.sensitivity_json is distinct from old.sensitivity_json)
     and not exists (
       select 1 from public.astro_agent_runs r
       where r.profile_id = new.id and r.kind = 'intake'
         and r.birth_revision = new.birth_revision and r.status = 'active'
     ) then
    raise exception 'birth calculation belongs to a stale revision' using errcode = 'ASV01';
  end if;
  return new;
end;
$$;
create trigger astro_profiles_birth_write_guard
before update on public.astro_profiles
for each row execute function public.person_guard_birth_profile_writes();

-- Reflect durable calculation completion on the immutable revision record.
create or replace function public.person_sync_birth_revision_result()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.birth_revision > 0 and new.initialization_status in ('ready', 'failed')
     and (new.initialization_status is distinct from old.initialization_status
          or new.chart_json is distinct from old.chart_json
          or new.sensitivity_json is distinct from old.sensitivity_json
          or new.initialization_error is distinct from old.initialization_error) then
    update public.person_birth_revisions
      set status = new.initialization_status,
          chart_json = case when new.initialization_status = 'ready' then new.chart_json else null end,
          sensitivity_json = case when new.initialization_status = 'ready' then new.sensitivity_json else null end,
          error_message = case when new.initialization_status = 'failed' then new.initialization_error else null end,
          completed_at = now()
      where profile_id = new.id and user_id = new.user_id and revision_no = new.birth_revision;
  end if;
  return new;
end;
$$;
create trigger astro_profiles_sync_birth_revision_result
after update of initialization_status, chart_json, sensitivity_json, initialization_error
on public.astro_profiles
for each row execute function public.person_sync_birth_revision_result();

create or replace function public.begin_person_birth_setup(
  p_profile_id uuid,
  p_birth jsonb,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.astro_profiles%rowtype;
  v_existing public.astro_agent_runs%rowtype;
  v_revision bigint;
  v_session_id uuid;
  v_run_id uuid;
  v_date date;
  v_time text;
  v_lat double precision;
  v_lng double precision;
  v_tz text;
  v_place text;
  v_source text;
  v_confidence text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = 'AFB01';
  end if;

  v_time := p_birth ->> 'time';
  v_tz := p_birth ->> 'timezone';
  v_place := nullif(p_birth ->> 'place_name', '');
  v_source := coalesce(nullif(p_birth ->> 'time_source', ''), 'unknown');
  v_confidence := coalesce(nullif(p_birth ->> 'time_confidence', ''), 'unknown');
  begin
    v_date := (p_birth ->> 'date')::date;
    v_lat := (p_birth ->> 'latitude')::double precision;
    v_lng := (p_birth ->> 'longitude')::double precision;
  exception when others then
    raise exception 'invalid birth data' using errcode = 'AIR01';
  end;
  if v_date is null or coalesce(v_time, '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
     or v_lat is null or v_lat < -90 or v_lat > 90
     or v_lng is null or v_lng < -180 or v_lng > 180
     or coalesce(v_tz, '') = '' or char_length(v_tz) > 100
     or char_length(coalesce(v_place, '')) > 300
     or char_length(v_source) > 50 or char_length(v_confidence) > 50 then
    raise exception 'invalid birth data' using errcode = 'AIR01';
  end if;

  select * into v_profile from public.astro_profiles p
   where p.id = p_profile_id and p.user_id = v_user_id and p.person_status = 'active'
   for update;
  if not found then
    raise exception 'profile not found' using errcode = 'ANF01';
  end if;

  select * into v_existing from public.astro_agent_runs r
   where r.user_id = v_user_id and r.client_request_id = p_client_request_id
   limit 1;
  if found then
    if v_existing.profile_id <> p_profile_id or v_existing.kind <> 'intake' then
      raise exception 'request id already belongs to another operation' using errcode = 'ACF01';
    end if;
    return jsonb_build_object(
      'profileId', v_existing.profile_id, 'sessionId', v_existing.session_id,
      'runId', v_existing.id, 'status', v_existing.status, 'replayed', true);
  end if;

  if exists (
    select 1 from public.astro_agent_runs r
     where r.profile_id = p_profile_id and r.status in ('active', 'waiting_for_user')
  ) then
    raise exception 'finish the current reading before changing birth details' using errcode = 'ACF01';
  end if;

  v_revision := v_profile.birth_revision + 1;
  insert into public.person_birth_revisions (
    user_id, profile_id, revision_no, birth_date, birth_time, latitude, longitude,
    timezone, place_name, time_source, time_confidence
  ) values (
    v_user_id, p_profile_id, v_revision, v_date, v_time, v_lat, v_lng,
    v_tz, v_place, v_source, v_confidence
  );

  update public.astro_profiles
    set birth_date = v_date, birth_time = v_time, lat = v_lat, lng = v_lng,
        tz = v_tz, place_name = v_place, time_source = v_source,
        time_confidence = v_confidence, birth_revision = v_revision,
        chart_json = null, sensitivity_json = null,
        initialization_status = 'pending', initialization_error = null,
        updated_at = now()
    where id = p_profile_id;

  update public.person_preferences
    set astrology_enabled = false, mode_epoch = mode_epoch + 1, updated_at = now()
    where profile_id = p_profile_id and user_id = v_user_id and astrology_enabled;

  insert into public.astro_sessions (user_id, profile_id, title, status)
    values (v_user_id, p_profile_id, v_profile.name, 'active')
    returning id into v_session_id;

  insert into public.astro_agent_runs (
    user_id, profile_id, session_id, kind, status, phase, client_request_id, birth_revision
  ) values (
    v_user_id, p_profile_id, v_session_id, 'intake', 'active', 'planning',
    p_client_request_id, v_revision
  ) returning id into v_run_id;

  update public.astro_sessions
    set last_run_id = v_run_id, status = 'active'
    where id = v_session_id;

  return jsonb_build_object(
    'profileId', p_profile_id, 'sessionId', v_session_id,
    'runId', v_run_id, 'status', 'active', 'replayed', false,
    'birthRevision', v_revision);
end;
$$;

revoke all on function public.person_birth_revision_immutable_inputs() from public, anon, authenticated, service_role;
revoke all on function public.person_lock_profile_for_active_run() from public, anon, authenticated, service_role;
revoke all on function public.person_guard_birth_profile_writes() from public, anon, authenticated, service_role;
revoke all on function public.person_sync_birth_revision_result() from public, anon, authenticated, service_role;
revoke all on function public.begin_person_birth_setup(uuid, jsonb, uuid) from public, anon;
grant execute on function public.begin_person_birth_setup(uuid, jsonb, uuid) to authenticated;
