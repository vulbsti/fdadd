select result
from (
  select 'MIGRATION|' || version::text as result
  from supabase_migrations.schema_migrations

  union all
  select 'TABLE|public.person_model_revisions'
  where to_regclass('public.person_model_revisions') is not null

  union all
  select 'TABLE|public.person_objects'
  where to_regclass('public.person_objects') is not null

  union all
  select 'TABLE|public.person_observations'
  where to_regclass('public.person_observations') is not null

  union all
  select 'TABLE|public.person_jobs'
  where to_regclass('public.person_jobs') is not null

  union all
  select 'TABLE|public.person_birth_revisions'
  where to_regclass('public.person_birth_revisions') is not null

  union all
  select 'AUTH_FUNCTION|public.person_create(text,uuid)'
  where to_regprocedure('public.person_create(text,uuid)') is not null
    and has_function_privilege('authenticated', 'public.person_create(text,uuid)', 'EXECUTE')

  union all
  select 'AUTH_FUNCTION|public.person_accept_user_message(uuid,uuid,uuid)'
  where to_regprocedure('public.person_accept_user_message(uuid,uuid,uuid)') is not null
    and has_function_privilege('authenticated', 'public.person_accept_user_message(uuid,uuid,uuid)', 'EXECUTE')

  union all
  select 'AUTH_FUNCTION|public.person_record_correction(uuid,uuid,uuid,uuid)'
  where to_regprocedure('public.person_record_correction(uuid,uuid,uuid,uuid)') is not null
    and has_function_privilege('authenticated', 'public.person_record_correction(uuid,uuid,uuid,uuid)', 'EXECUTE')

  union all
  select 'WORKER_FUNCTION|public.person_claim_job(uuid,integer)'
  where to_regprocedure('public.person_claim_job(uuid,integer)') is not null
    and has_function_privilege('service_role', 'public.person_claim_job(uuid,integer)', 'EXECUTE')

  union all
  select 'WORKER_FUNCTION|public.person_claim_outbox(integer)'
  where to_regprocedure('public.person_claim_outbox(integer)') is not null
    and has_function_privilege('service_role', 'public.person_claim_outbox(integer)', 'EXECUTE')

  union all
  select 'WORKER_FUNCTION|public.person_publish_revision(uuid,uuid,bigint,bigint,bigint,uuid,jsonb)'
  where to_regprocedure('public.person_publish_revision(uuid,uuid,bigint,bigint,bigint,uuid,jsonb)') is not null
    and has_function_privilege('service_role', 'public.person_publish_revision(uuid,uuid,bigint,bigint,bigint,uuid,jsonb)', 'EXECUTE')

  union all
  select 'AUTH_FUNCTION|public.begin_person_birth_setup(uuid,jsonb,uuid)'
  where to_regprocedure('public.begin_person_birth_setup(uuid,jsonb,uuid)') is not null
    and has_function_privilege('authenticated', 'public.begin_person_birth_setup(uuid,jsonb,uuid)', 'EXECUTE')
) as schema_contract
order by result;
