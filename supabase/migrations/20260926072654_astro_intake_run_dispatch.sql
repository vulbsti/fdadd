-- Existing-person birth setup creates an active intake run transactionally.
-- Reuse the same durable outbox and worker protocol as question workflows.
create trigger astro_agent_runs_enqueue_intake_dispatch
  after insert on public.astro_agent_runs
  for each row
  when (new.kind = 'intake' and new.status = 'active')
  execute function public.enqueue_astro_question_run_dispatch();

-- Recover active intake runs created before this trigger existed. Inserting
-- the trigger first makes concurrent inserts race-safe through the outbox PK.
insert into public.astro_run_dispatches (run_id, user_id, profile_id)
select r.id, r.user_id, r.profile_id
from public.astro_agent_runs r
where r.kind = 'intake'
  and r.status = 'active'
  and r.workflow_run_id is null
on conflict (run_id) do nothing;
