-- Harden a clean-project bootstrap for the current Supabase Data API defaults.
-- User-entry RPCs remain authenticated and owner-scoped. Trigger helpers and
-- workflow attachment are server orchestration and must not be client-callable.

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.attach_astro_workflow_run(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_astro_workflow_run(uuid, text) to service_role;

-- New projects no longer auto-expose newly-created public objects. Make the
-- trusted server boundary explicit instead of depending on legacy defaults.
grant all privileges on table
  public.profiles,
  public.payment_orders,
  public.astro_profiles,
  public.astro_events,
  public.astro_hypotheses,
  public.astro_sessions,
  public.astro_messages,
  public.astro_quotas,
  public.astro_evidence,
  public.astro_person_facts,
  public.astro_fact_evidence,
  public.astro_map_revisions,
  public.astro_hypothesis_evidence,
  public.astro_agent_runs,
  public.astro_agent_run_steps,
  public.astro_run_context_items,
  public.astro_calculation_cache,
  public.astro_run_dispatches
to service_role;
