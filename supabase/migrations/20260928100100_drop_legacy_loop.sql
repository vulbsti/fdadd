-- Remove the storage and functions only the retired planner loop used. The Pi
-- workspace answers from chat history, the person model and precomputed
-- calculations; none of these objects is read or written by kept code.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'worker_record_astro_evidence', 'worker_apply_astro_memory_change',
      'worker_claim_astro_tool_call', 'worker_astro_relevant_context')
  loop
    execute format('drop function %s', f.signature);
  end loop;
end;
$$;

drop table if exists public.astro_run_context_items;
drop table if exists public.astro_calculation_cache;
drop table if exists public.astro_fact_evidence;
drop table if exists public.astro_hypothesis_evidence;
drop table if exists public.astro_map_revisions;
drop table if exists public.astro_person_facts;
drop table if exists public.astro_evidence;
drop table if exists public.astro_quotas;
drop table if exists public.astro_events;
drop table if exists public.astro_hypotheses;

drop index if exists public.astro_sessions_search_idx;
alter table public.astro_sessions drop column if exists search;
alter table public.astro_agent_runs drop column if exists plan_json;
