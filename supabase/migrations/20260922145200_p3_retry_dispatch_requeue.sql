-- A workflow can safely return a fenced job to pending after a provider
-- failure or stale-base rebase. Re-arm the already-delivered input outbox row
-- so the scheduled dispatcher will start a later attempt. The accepted source
-- remains immutable and the job attempt budget remains authoritative.
create or replace function public.person_requeue_dispatch_for_pending_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_kind in ('source_consolidation','correction','exclusion','deletion','rebuild')
     and new.state = 'pending'
     and old.state in ('leased','running') then
    update public.person_outbox
    set state = 'pending',
        available_at = greatest(new.available_at, now()),
        lease_token = null,
        lease_expires_at = null,
        delivered_at = null
    where job_id = new.id
      and user_id = new.user_id
      and profile_id = new.profile_id
      and event_type = 'person.input.accepted';
  end if;
  return new;
end;
$$;

create trigger person_jobs_requeue_dispatch_after_retry
after update of state on public.person_jobs
for each row
when (new.state = 'pending' and old.state in ('leased','running'))
execute function public.person_requeue_dispatch_for_pending_job();

revoke all on function public.person_requeue_dispatch_for_pending_job()
  from public, anon, authenticated, service_role;
