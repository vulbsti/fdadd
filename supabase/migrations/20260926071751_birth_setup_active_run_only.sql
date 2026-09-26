-- A waiting_for_user run has already published its response and is parked;
-- only executing work can make a birth change unsafe. The profile row lock and
-- active-run insertion trigger still serialize birth edits against new runs.
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
       where r.profile_id = old.id and r.status = 'active'
     ) then
    raise exception 'birth data cannot change while a run is active' using errcode = 'ACF01';
  end if;

  if new.birth_revision > 0
     and new.initialization_status in ('ready', 'failed')
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
      'runId', v_existing.id, 'status', v_existing.status, 'replayed', true,
      'birthRevision', v_existing.birth_revision);
  end if;

  if exists (
    select 1 from public.astro_agent_runs r
     where r.profile_id = p_profile_id and r.status = 'active'
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

revoke all on function public.begin_person_birth_setup(uuid, jsonb, uuid) from public, anon;
grant execute on function public.begin_person_birth_setup(uuid, jsonb, uuid) to authenticated;
