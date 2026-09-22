-- A recovered retry must not remain operationally marked as failed after its
-- revision commits. Keep this invariant at the job table boundary so every
-- publisher path gets the same behavior.
create or replace function public.person_clear_error_on_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state = 'completed' then
    new.last_error_code := null;
  end if;
  return new;
end;
$$;

drop trigger if exists person_jobs_clear_error_on_completion on public.person_jobs;
create trigger person_jobs_clear_error_on_completion
before insert or update of state on public.person_jobs
for each row execute function public.person_clear_error_on_completion();

revoke all on function public.person_clear_error_on_completion() from public, anon, authenticated, service_role;
