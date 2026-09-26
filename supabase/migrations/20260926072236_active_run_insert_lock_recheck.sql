-- Recheck active work after the profile lock. A caller may have completed its
-- pre-insert check before blocking here while birth setup was in flight.
create or replace function public.person_lock_profile_for_active_run()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'active' then
    perform 1 from public.astro_profiles p where p.id = new.profile_id for update;
    if not found then
      raise exception 'profile not found' using errcode = 'ANF01';
    end if;
    if exists (
      select 1 from public.astro_agent_runs r
      where r.profile_id = new.profile_id and r.status = 'active'
    ) then
      raise exception 'another run is active for this profile' using errcode = 'ACF01';
    end if;
  end if;
  return new;
end;
$$;
