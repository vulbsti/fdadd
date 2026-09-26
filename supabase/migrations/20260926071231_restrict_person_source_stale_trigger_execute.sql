-- This SECURITY DEFINER routine is an internal trigger helper. PostgreSQL
-- checks its EXECUTE privilege when the trigger is created; revoking direct
-- invocation does not change the already-installed trigger.
revoke all on function public.person_mark_model_stale_on_source()
  from public, anon, authenticated, service_role;
