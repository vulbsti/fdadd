-- Durable astrologer agent memory, state, retrieval, and cache.
-- Additive forward migration over 202609090001_astrologer.sql:
--   * tenant-safe composite ownership keys on existing tables
--   * person map (facts + immutable revisions), append-only evidence
--   * durable run/checkpoint/step/context tables
--   * deterministic calculation cache + lexical retrieval
--   * atomic user-entry RPCs and service-role worker RPCs
-- Every definer function pins search_path='' and derives ownership from
-- auth.uid() (user entry) or the stored run row (workers).

-- ===========================================================================
-- 1. Preflight: refuse to migrate corrupted ownership data
-- ===========================================================================

do $$
declare
  bad integer;
begin
  select count(*) into bad from public.astro_events e
    join public.astro_profiles p on p.id = e.profile_id
    where e.user_id <> p.user_id;
  if bad > 0 then raise exception
    'astro_events rows with user_id differing from profile owner: %', bad; end if;

  select count(*) into bad from public.astro_hypotheses h
    join public.astro_profiles p on p.id = h.profile_id
    where h.user_id <> p.user_id;
  if bad > 0 then raise exception
    'astro_hypotheses rows with user_id differing from profile owner: %', bad; end if;

  select count(*) into bad from public.astro_sessions s
    join public.astro_profiles p on p.id = s.profile_id
    where s.user_id <> p.user_id;
  if bad > 0 then raise exception
    'astro_sessions rows with user_id differing from profile owner: %', bad; end if;

  select count(*) into bad from public.astro_messages m
    join public.astro_sessions s on s.id = m.session_id
    where m.user_id <> s.user_id;
  if bad > 0 then raise exception
    'astro_messages rows with user_id differing from session owner: %', bad; end if;
end
$$;


-- ===========================================================================
-- 2. Existing-table hardening: same-owner composite keys
-- ===========================================================================

alter table public.astro_profiles
  add constraint astro_profiles_id_user_id_key unique (id, user_id);
alter table public.astro_sessions
  add constraint astro_sessions_id_user_id_key unique (id, user_id);
alter table public.astro_messages
  add constraint astro_messages_id_user_id_key unique (id, user_id);

alter table public.astro_events
  add constraint astro_events_id_user_id_key unique (id, user_id);
alter table public.astro_hypotheses
  add constraint astro_hypotheses_id_user_id_key unique (id, user_id);

create index if not exists astro_events_profile_date_idx
  on public.astro_events (profile_id, on_date);

alter table public.astro_events
  add constraint astro_events_profile_owner_fk
  foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade;
alter table public.astro_hypotheses
  add constraint astro_hypotheses_profile_owner_fk
  foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade;
alter table public.astro_sessions
  add constraint astro_sessions_profile_owner_fk
  foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete set null;
alter table public.astro_messages
  add constraint astro_messages_session_owner_fk
  foreign key (session_id, user_id) references public.astro_sessions (id, user_id) on delete cascade;

-- Profile UUID, not a person's name, is identity: two people on one account
-- may share a name.
alter table public.astro_profiles drop constraint astro_profiles_user_id_name_key;
create index if not exists astro_profiles_user_name_idx
  on public.astro_profiles (user_id, name);

-- ===========================================================================
-- 3. astro_profiles: intake lifecycle + memory version
-- ===========================================================================

alter table public.astro_profiles
  add column initialization_status text not null default 'ready'
    check (initialization_status in ('pending', 'ready', 'failed')),
  add column initialization_error text,
  add column memory_version bigint not null default 0 check (memory_version >= 0),
  add column intake_request_id uuid;

create unique index if not exists astro_profiles_user_intake_request_key
  on public.astro_profiles (user_id, intake_request_id)
  where intake_request_id is not null;

-- Backfill: rows with both frozen calculations are ready; the rest failed.
update public.astro_profiles
  set initialization_status = 'ready'
  where chart_json is not null and sensitivity_json is not null;
update public.astro_profiles
  set initialization_status = 'failed',
      initialization_error = 'migration_backfill: frozen chart/sensitivity missing'
  where chart_json is null or sensitivity_json is null;

-- ===========================================================================
-- 4. astro_sessions: durable session state mirror
-- ===========================================================================

alter table public.astro_sessions
  add column title text not null default 'New reading',
  add column status text not null default 'complete'
    check (status in ('active', 'waiting_for_user', 'complete', 'failed')),
  add column current_goal text,
  add column current_question jsonb,
  add column last_context_version bigint not null default 0,
  add column last_completed_step text,
  add column next_action text,
  add column checkpoint_json jsonb not null default '{}',
  add column summary_text text not null default '',
  add column summary_json jsonb not null default '{}',
  add column last_message_preview text,
  add column state_version bigint not null default 0,
  add column last_run_id uuid;  -- FK added after astro_agent_runs exists

create index if not exists astro_sessions_user_updated_idx
  on public.astro_sessions (user_id, updated_at desc, id desc);
create index if not exists astro_sessions_profile_updated_idx
  on public.astro_sessions (profile_id, updated_at desc, id desc);

-- Backfill session titles from the owning profile name.
update public.astro_sessions s
  set title = coalesce(p.name, 'New reading')
  from public.astro_profiles p
  where s.profile_id = p.id and s.title = 'New reading';

-- ===========================================================================
-- 5. astro_messages: idempotency + run provenance columns
-- ===========================================================================

alter table public.astro_messages
  add column client_message_id uuid,
  add column step_key text;
  -- run_id FK added after astro_agent_runs exists.

create unique index if not exists astro_messages_session_client_message_key
  on public.astro_messages (session_id, client_message_id)
  where client_message_id is not null;
create index if not exists astro_messages_session_display_idx
  on public.astro_messages (session_id, created_at desc, id desc);

-- ===========================================================================
-- 6. astro_evidence: append-only provenance ledger
-- ===========================================================================

create table if not exists public.astro_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  session_id uuid,
  source_message_id uuid,
  source_event_id uuid,
  source_kind text not null
    check (source_kind in ('user_statement', 'life_event', 'profile_record', 'agent_derivation')),
  assertion_mode text not null check (assertion_mode in ('direct', 'derived')),
  evidence_type text not null,
  exact_quote text not null,
  summary text not null,
  normalized_json jsonb not null default '{}',
  occurred_on date,
  quality numeric not null check (quality >= 0 and quality <= 1),
  idempotency_key text not null,
  created_by_run_id uuid,  -- FK added after astro_agent_runs exists
  created_at timestamptz not null default now(),
  constraint astro_evidence_exactly_one_source
    check (num_nonnulls(source_message_id, source_event_id) = 1),
  constraint astro_evidence_profile_idempotency_key unique (profile_id, idempotency_key),
  constraint astro_evidence_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint astro_evidence_session_owner_fk
    foreign key (session_id, user_id) references public.astro_sessions (id, user_id) on delete cascade,
  constraint astro_evidence_source_message_fk
    foreign key (source_message_id) references public.astro_messages (id) on delete cascade,
  constraint astro_evidence_source_event_fk
    foreign key (source_event_id) references public.astro_events (id) on delete cascade
);
alter table public.astro_evidence
  add constraint astro_evidence_id_user_id_key unique (id, user_id);

create index if not exists astro_evidence_profile_created_idx
  on public.astro_evidence (profile_id, created_at desc);
create index if not exists astro_evidence_profile_kind_idx
  on public.astro_evidence (profile_id, source_kind);

-- Backfill each existing life event once as direct evidence.
insert into public.astro_evidence (
  id, user_id, profile_id, session_id, source_event_id, source_kind,
  assertion_mode, evidence_type, exact_quote, summary, normalized_json,
  occurred_on, quality, idempotency_key, created_at
)
select
  gen_random_uuid(),
  e.user_id,
  e.profile_id,
  null,
  e.id,
  'life_event',
  'direct',
  'life_event',
  coalesce(nullif(e.detail, ''), e.title),
  e.title,
  jsonb_build_object('on_date', e.on_date, 'fit', e.fit, 'chain', e.chain),
  e.on_date,
  0.8,
  'legacy_event_' || e.id::text,
  e.created_at
from public.astro_events e
where not exists (
  select 1 from public.astro_evidence v
  where v.profile_id = e.profile_id and v.idempotency_key = 'legacy_event_' || e.id::text
);

-- ===========================================================================
-- 7. Person map: current projection + evidence links + immutable revisions
-- ===========================================================================

create table if not exists public.astro_person_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  fact_key text not null,
  value_json jsonb not null,
  summary text not null,
  origin text not null check (origin in ('direct', 'derived')),
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'contradicted', 'retired')),
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  revision integer not null default 1 check (revision >= 1),
  created_by_run_id uuid,
  updated_by_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint astro_person_facts_profile_fact_key unique (profile_id, fact_key),
  constraint astro_person_facts_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade
);
alter table public.astro_person_facts
  add constraint astro_person_facts_id_user_id_key unique (id, user_id);
create index if not exists astro_person_facts_profile_status_idx
  on public.astro_person_facts (profile_id, status);

create trigger astro_person_facts_set_updated_at
  before update on public.astro_person_facts
  for each row execute procedure public.set_updated_at();

create table if not exists public.astro_fact_evidence (
  user_id uuid not null,
  profile_id uuid not null,
  fact_id uuid not null,
  evidence_id uuid not null,
  relation text not null check (relation in ('supports', 'contradicts', 'qualifies')),
  note text,
  weight numeric check (weight is null or (weight >= 0 and weight <= 1)),
  run_id uuid,  -- FK added after astro_agent_runs exists
  created_at timestamptz not null default now(),
  primary key (fact_id, evidence_id, relation),
  constraint astro_fact_evidence_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint astro_fact_evidence_fact_owner_fk
    foreign key (fact_id, user_id) references public.astro_person_facts (id, user_id) on delete cascade,
  constraint astro_fact_evidence_evidence_owner_fk
    foreign key (evidence_id, user_id) references public.astro_evidence (id, user_id) on delete cascade
);
create index if not exists astro_fact_evidence_fact_idx
  on public.astro_fact_evidence (fact_id);

create table if not exists public.astro_map_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  fact_id uuid not null,
  run_id uuid,  -- FK added after astro_agent_runs exists
  revision_no integer not null check (revision_no >= 1),
  previous_value_json jsonb,
  new_value_json jsonb,
  previous_status text,
  new_status text,
  previous_confidence numeric,
  new_confidence numeric,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint astro_map_revisions_fact_revision unique (fact_id, revision_no),
  constraint astro_map_revisions_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint astro_map_revisions_fact_owner_fk
    foreign key (fact_id, user_id) references public.astro_person_facts (id, user_id) on delete cascade
);
create index if not exists astro_map_revisions_fact_created_idx
  on public.astro_map_revisions (fact_id, created_at desc);

-- ===========================================================================
-- 8. Hypotheses: revision/confidence columns + evidence links
-- ===========================================================================

alter table public.astro_hypotheses
  add column revision bigint not null default 1 check (revision >= 1),
  add column confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  add column updated_by_run_id uuid;  -- FK added after astro_agent_runs exists

create table if not exists public.astro_hypothesis_evidence (
  user_id uuid not null,
  profile_id uuid not null,
  hypothesis_id uuid not null,
  evidence_id uuid not null,
  relation text not null check (relation in ('supports', 'contradicts', 'control')),
  run_id uuid,  -- FK added after astro_agent_runs exists
  created_at timestamptz not null default now(),
  primary key (hypothesis_id, evidence_id, relation),
  constraint astro_hypothesis_evidence_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint astro_hypothesis_evidence_hypothesis_owner_fk
    foreign key (hypothesis_id, user_id) references public.astro_hypotheses (id, user_id) on delete cascade,
  constraint astro_hypothesis_evidence_evidence_owner_fk
    foreign key (evidence_id, user_id) references public.astro_evidence (id, user_id) on delete cascade
);

-- ===========================================================================
-- 9. Durable execution tables
-- ===========================================================================

create table if not exists public.astro_agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  session_id uuid not null,
  kind text not null check (kind in ('intake', 'question')),
  status text not null default 'active'
    check (status in ('active', 'waiting_for_user', 'complete', 'failed')),
  phase text check (phase in ('planning', 'retrieval', 'analysis', 'verification', 'responding')),
  client_request_id uuid not null,
  triggering_message_id uuid,
  resume_from_run_id uuid,
  output_message_id uuid,
  workflow_run_id text,
  plan_json jsonb,
  checkpoint_json jsonb not null default '{}',
  context_version bigint not null default 0,
  last_completed_step text,
  next_action text,
  resumable boolean not null default false,
  step_count integer not null default 0,
  version bigint not null default 1,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint astro_agent_runs_user_client_request unique (user_id, client_request_id),
  constraint astro_agent_runs_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint astro_agent_runs_session_owner_fk
    foreign key (session_id, user_id) references public.astro_sessions (id, user_id) on delete cascade
);

create unique index if not exists astro_agent_runs_workflow_run_key
  on public.astro_agent_runs (workflow_run_id)
  where workflow_run_id is not null;
-- At most one active run per profile.
create unique index if not exists astro_agent_runs_one_active_per_profile
  on public.astro_agent_runs (profile_id)
  where status = 'active';
create index if not exists astro_agent_runs_user_created_idx
  on public.astro_agent_runs (user_id, started_at desc);

create trigger astro_agent_runs_set_updated_at
  before update on public.astro_agent_runs
  for each row execute procedure public.set_updated_at();

alter table public.astro_agent_runs
  add constraint astro_agent_runs_id_user_id_key unique (id, user_id);

create table if not exists public.astro_agent_run_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  session_id uuid not null,
  run_id uuid not null,  -- FK added below
  ordinal integer not null,
  step_key text not null,
  kind text not null check (kind in ('plan', 'retrieval', 'model', 'tool', 'verification', 'checkpoint')),
  status text not null check (status in ('started', 'succeeded', 'failed')),
  tool_name text,
  input_summary text,
  output_summary text,
  refs jsonb not null default '{}',
  cache_hit boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint astro_agent_run_steps_run_step_key unique (run_id, step_key),
  constraint astro_agent_run_steps_run_owner_fk
    foreign key (run_id, user_id) references public.astro_agent_runs (id, user_id) on delete cascade
);
alter table public.astro_agent_run_steps
  add constraint astro_agent_run_steps_id_user_id_key unique (id, user_id);
create index if not exists astro_agent_run_steps_run_ordinal_idx
  on public.astro_agent_run_steps (run_id, ordinal);

create table if not exists public.astro_run_context_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  run_id uuid not null,  -- FK added below
  fact_id uuid,
  evidence_id uuid,
  hypothesis_id uuid,
  event_id uuid,
  message_id uuid,
  purpose text not null check (purpose in ('selected', 'reviewed', 'produced')),
  rank integer,
  reason text,
  step_key text,
  created_at timestamptz not null default now(),
  item_key text generated always as (
    coalesce(
      'fact:' || fact_id::text,
      'evidence:' || evidence_id::text,
      'hypothesis:' || hypothesis_id::text,
      'event:' || event_id::text,
      'message:' || message_id::text
    )
  ) stored,
  constraint astro_run_context_items_exactly_one_item
    check (num_nonnulls(fact_id, evidence_id, hypothesis_id, event_id, message_id) = 1),
  constraint astro_run_context_items_run_purpose_item unique (run_id, purpose, item_key),
  constraint astro_run_context_items_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint astro_run_context_items_fact_fk
    foreign key (fact_id, user_id) references public.astro_person_facts (id, user_id) on delete cascade,
  constraint astro_run_context_items_evidence_fk
    foreign key (evidence_id, user_id) references public.astro_evidence (id, user_id) on delete cascade,
  constraint astro_run_context_items_hypothesis_fk
    foreign key (hypothesis_id, user_id) references public.astro_hypotheses (id, user_id) on delete cascade,
  constraint astro_run_context_items_event_fk
    foreign key (event_id, user_id) references public.astro_events (id, user_id) on delete cascade,
  constraint astro_run_context_items_message_fk
    foreign key (message_id, user_id) references public.astro_messages (id, user_id) on delete cascade
);
create index if not exists astro_run_context_items_run_idx
  on public.astro_run_context_items (run_id, purpose);

-- ===========================================================================
-- 10. Deferred foreign keys (targets now exist)
-- ===========================================================================

alter table public.astro_sessions
  add constraint astro_sessions_last_run_fk
  foreign key (last_run_id) references public.astro_agent_runs (id) on delete set null;
alter table public.astro_messages
  add column run_id uuid,
  add constraint astro_messages_run_fk
  foreign key (run_id) references public.astro_agent_runs (id) on delete set null;
alter table public.astro_agent_runs
  add constraint astro_agent_runs_triggering_message_fk
  foreign key (triggering_message_id) references public.astro_messages (id) on delete set null,
  add constraint astro_agent_runs_output_message_fk
  foreign key (output_message_id) references public.astro_messages (id) on delete set null,
  add constraint astro_agent_runs_resume_from_fk
  foreign key (resume_from_run_id) references public.astro_agent_runs (id) on delete set null;
alter table public.astro_evidence
  add constraint astro_evidence_created_by_run_fk
  foreign key (created_by_run_id) references public.astro_agent_runs (id) on delete set null;
alter table public.astro_person_facts
  add constraint astro_person_facts_created_by_run_fk
  foreign key (created_by_run_id) references public.astro_agent_runs (id) on delete set null,
  add constraint astro_person_facts_updated_by_run_fk
  foreign key (updated_by_run_id) references public.astro_agent_runs (id) on delete set null;
alter table public.astro_fact_evidence
  add constraint astro_fact_evidence_run_fk
  foreign key (run_id) references public.astro_agent_runs (id) on delete set null;
alter table public.astro_map_revisions
  add constraint astro_map_revisions_run_fk
  foreign key (run_id) references public.astro_agent_runs (id) on delete set null;
alter table public.astro_hypotheses
  add constraint astro_hypotheses_updated_by_run_fk
  foreign key (updated_by_run_id) references public.astro_agent_runs (id) on delete set null;
alter table public.astro_hypothesis_evidence
  add constraint astro_hypothesis_evidence_run_fk
  foreign key (run_id) references public.astro_agent_runs (id) on delete set null;
alter table public.astro_agent_run_steps
  add constraint astro_agent_run_steps_run_fk
  foreign key (run_id) references public.astro_agent_runs (id) on delete cascade;
alter table public.astro_run_context_items
  add constraint astro_run_context_items_run_fk
  foreign key (run_id) references public.astro_agent_runs (id) on delete cascade;

-- ===========================================================================
-- 11. Deterministic calculation cache
-- ===========================================================================

create table if not exists public.astro_calculation_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  engine_version text not null,
  tool_name text not null,
  args_hash text not null,
  args_json jsonb not null,
  result_json jsonb not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint astro_calculation_cache_key
    unique (profile_id, engine_version, tool_name, args_hash),
  constraint astro_calculation_cache_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade
);
create index if not exists astro_calculation_cache_expiry_idx
  on public.astro_calculation_cache (profile_id, expires_at);

create trigger astro_calculation_cache_set_updated_at
  before update on public.astro_calculation_cache
  for each row execute procedure public.set_updated_at();

-- ===========================================================================
-- 12. Lexical retrieval: tsvector columns + GIN indexes
-- ===========================================================================

alter table public.astro_evidence add column search tsvector
  generated always as (
    pg_catalog.to_tsvector('simple', coalesce(summary, '') || ' ' || coalesce(exact_quote, ''))
  ) stored;
alter table public.astro_person_facts add column search tsvector
  generated always as (
    pg_catalog.to_tsvector('simple', coalesce(fact_key, '') || ' ' || coalesce(summary, ''))
  ) stored;
alter table public.astro_hypotheses add column search tsvector
  generated always as (pg_catalog.to_tsvector('simple', coalesce(claim, ''))) stored;
alter table public.astro_sessions add column search tsvector
  generated always as (pg_catalog.to_tsvector('simple', coalesce(summary_text, ''))) stored;
alter table public.astro_events add column search tsvector
  generated always as (
    pg_catalog.to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(detail, ''))
  ) stored;
alter table public.astro_messages add column search tsvector
  generated always as (pg_catalog.to_tsvector('simple', coalesce(content, ''))) stored;

create index if not exists astro_evidence_search_idx on public.astro_evidence using gin (search);
create index if not exists astro_person_facts_search_idx on public.astro_person_facts using gin (search);
create index if not exists astro_hypotheses_search_idx on public.astro_hypotheses using gin (search);
create index if not exists astro_sessions_search_idx on public.astro_sessions using gin (search);
create index if not exists astro_events_search_idx on public.astro_events using gin (search);
create index if not exists astro_messages_search_idx on public.astro_messages using gin (search);

-- ===========================================================================
-- 13. Worker RPC: selective cross-session retrieval
-- ===========================================================================

create or replace function public.worker_astro_relevant_context(
  p_run_id uuid,
  p_query text,
  p_kinds text[] default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 20
)
returns table (
  kind text,
  id uuid,
  rank real,
  title text,
  excerpt text,
  confidence numeric,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_profile_id uuid;
  v_tsq tsquery;
  v_limit integer;
  v_blank boolean;
begin
  select r.user_id, r.profile_id into v_user_id, v_profile_id
    from public.astro_agent_runs r where r.id = p_run_id;
  if v_user_id is null then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 25);
  v_blank := coalesce(btrim(coalesce(p_query, '')), '') = '';
  if v_blank then
    v_tsq := null;
  else
    v_tsq := pg_catalog.websearch_to_tsquery('simple', p_query);
  end if;

  return query
  with facts as (
    select 'fact'::text as kind, f.id, f.fact_key as title, f.summary as excerpt,
           f.confidence, f.status, f.updated_at as created_at,
           case when v_tsq is null then 0::real
                else pg_catalog.ts_rank(f.search, v_tsq) end as rank
    from public.astro_person_facts f
    where f.user_id = v_user_id
      and f.profile_id = v_profile_id
      and f.status in ('proposed', 'confirmed')
      and (v_tsq is null or f.search @@ v_tsq)
  ),
  evidence as (
    select 'evidence'::text as kind, e.id, e.evidence_type as title,
           left(e.summary, 400) as excerpt, e.quality as confidence,
           e.assertion_mode as status, e.created_at,
           case when v_tsq is null then 0::real
                else pg_catalog.ts_rank(e.search, v_tsq) end as rank
    from public.astro_evidence e
    where e.user_id = v_user_id
      and e.profile_id = v_profile_id
      and (v_tsq is null or e.search @@ v_tsq)
      and (p_from is null or e.occurred_on is null or e.occurred_on >= p_from)
      and (p_to is null or e.occurred_on is null or e.occurred_on <= p_to)
  ),
  hypotheses as (
    select 'hypothesis'::text as kind, h.id, h.hid as title, h.claim as excerpt,
           h.confidence, h.status, h.updated_at as created_at,
           case when v_tsq is null then 0::real
                else pg_catalog.ts_rank(h.search, v_tsq) end as rank
    from public.astro_hypotheses h
    where h.user_id = v_user_id
      and h.profile_id = v_profile_id
      and h.status in ('open', 'confirmed', 'ambiguous')
      and (v_tsq is null or h.search @@ v_tsq)
  ),
  events as (
    select 'event'::text as kind, ev.id, ev.title as title,
           left(ev.detail, 400) as excerpt, null::numeric as confidence,
           ev.fit as status, ev.created_at,
           case when v_tsq is null then 0::real
                else pg_catalog.ts_rank(ev.search, v_tsq) end as rank
    from public.astro_events ev
    where ev.user_id = v_user_id
      and ev.profile_id = v_profile_id
      and (v_tsq is null or ev.search @@ v_tsq)
      and (p_from is null or ev.on_date >= p_from)
      and (p_to is null or ev.on_date <= p_to)
  ),
  sessions as (
    select 'session'::text as kind, s.id, s.title as title,
           left(s.summary_text, 400) as excerpt, null::numeric as confidence,
           s.status, s.updated_at as created_at,
           case when v_tsq is null then 0::real
                else pg_catalog.ts_rank(s.search, v_tsq) end as rank
    from public.astro_sessions s
    where s.user_id = v_user_id
      and s.profile_id = v_profile_id
      and coalesce(s.summary_text, '') <> ''
      and (v_tsq is null or s.search @@ v_tsq)
  ),
  messages as (
    select 'message'::text as kind, m.id,
           case m.role when 'user' then 'user message' else 'assistant message' end as title,
           left(m.content, 400) as excerpt, null::numeric as confidence,
           m.role as status, m.created_at,
           case when v_tsq is null then 0::real
                else pg_catalog.ts_rank(m.search, v_tsq) end as rank
    from public.astro_messages m
    where m.user_id = v_user_id
      and m.role in ('user', 'assistant')
      and m.session_id in (
        select s2.id from public.astro_sessions s2
        where s2.user_id = v_user_id and s2.profile_id = v_profile_id
      )
      and (v_tsq is null or m.search @@ v_tsq)
      and (p_from is null or (m.created_at at time zone 'utc')::date >= p_from)
      and (p_to is null or (m.created_at at time zone 'utc')::date <= p_to)
  )
  select u.kind, u.id, u.rank, u.title, u.excerpt, u.confidence, u.status, u.created_at
  from (
    select * from facts
    union all select * from evidence
    union all select * from hypotheses
    union all select * from events
    union all select * from sessions
    union all select * from messages
  ) u
  where (p_kinds is null or u.kind = any (p_kinds))
  order by u.rank desc,
           u.confidence desc nulls last,
           u.created_at desc,
           u.id asc
  limit v_limit;
end;
$$;

-- Blank-query branch: bounded confirmed/proposed facts plus recent evidence,
-- never all rows. Implemented by capping each source above via ordering and
-- the shared limit; facts/evidence dominate through rank/confidence ordering.

-- ===========================================================================
-- 14. User-entry RPCs (authenticated, SECURITY DEFINER)
-- ===========================================================================

create or replace function public.begin_astro_profile_intake(
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
  v_name text;
  v_date date;
  v_time text;
  v_lat double precision;
  v_lng double precision;
  v_tz text;
  v_place text;
  v_time_source text;
  v_time_confidence text;
  v_profile_id uuid;
  v_session_id uuid;
  v_run_id uuid;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = 'AFB01';
  end if;

  v_name := p_birth ->> 'name';
  v_time := p_birth ->> 'time';
  v_tz := p_birth ->> 'timezone';
  v_place := p_birth ->> 'place_name';
  v_time_source := coalesce(p_birth ->> 'time_source', 'unknown');
  v_time_confidence := coalesce(p_birth ->> 'time_confidence', 'unknown');
  begin
    v_date := (p_birth ->> 'date')::date;
    v_lat := (p_birth ->> 'latitude')::double precision;
    v_lng := (p_birth ->> 'longitude')::double precision;
  exception when others then
    raise exception 'invalid birth data' using errcode = 'AIR01';
  end;
  if coalesce(v_name, '') = '' or v_date is null or coalesce(v_time, '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
     or v_lat is null or v_lat < -90 or v_lat > 90
     or v_lng is null or v_lng < -180 or v_lng > 180
     or coalesce(v_tz, '') = '' then
    raise exception 'invalid birth data' using errcode = 'AIR01';
  end if;

  -- Idempotent replay of an identical intake request.
  select r.id, r.status into v_run_id, v_status
    from public.astro_agent_runs r
    where r.user_id = v_user_id
      and r.client_request_id = p_client_request_id
      and r.kind = 'intake'
    limit 1;
  if v_run_id is not null then
    select profile_id, session_id into v_profile_id, v_session_id
      from public.astro_agent_runs where id = v_run_id;
    return jsonb_build_object(
      'profileId', v_profile_id, 'sessionId', v_session_id,
      'runId', v_run_id, 'status', v_status, 'replayed', true);
  end if;

  insert into public.astro_profiles (
    user_id, name, birth_date, birth_time, lat, lng, tz, place_name,
    time_source, time_confidence, initialization_status, intake_request_id
  ) values (
    v_user_id, v_name, v_date, v_time, v_lat, v_lng, v_tz, nullif(v_place, ''),
    v_time_source, v_time_confidence, 'pending', p_client_request_id
  )
  on conflict (user_id, intake_request_id) where intake_request_id is not null do nothing
  returning id into v_profile_id;

  if v_profile_id is null then
    -- Concurrent identical request: fetch the winner.
    select id into v_profile_id from public.astro_profiles
      where user_id = v_user_id and intake_request_id = p_client_request_id;
    select id, status into v_run_id, v_status
      from public.astro_agent_runs
      where user_id = v_user_id and client_request_id = p_client_request_id and kind = 'intake'
      limit 1;
    select session_id into v_session_id from public.astro_agent_runs where id = v_run_id;
    return jsonb_build_object(
      'profileId', v_profile_id, 'sessionId', v_session_id,
      'runId', v_run_id, 'status', v_status, 'replayed', true);
  end if;

  insert into public.astro_sessions (user_id, profile_id, title, status)
    values (v_user_id, v_profile_id, v_name, 'active')
    returning id into v_session_id;

  insert into public.astro_agent_runs (
    user_id, profile_id, session_id, kind, status, phase, client_request_id
  ) values (
    v_user_id, v_profile_id, v_session_id, 'intake', 'active', 'planning', p_client_request_id
  ) returning id into v_run_id;

  update public.astro_sessions
    set last_run_id = v_run_id, status = 'active'
    where id = v_session_id;

  return jsonb_build_object(
    'profileId', v_profile_id, 'sessionId', v_session_id,
    'runId', v_run_id, 'status', 'active', 'replayed', false);
end;
$$;

create or replace function public.create_astro_session(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_ready boolean;
  v_name text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = 'AFB01';
  end if;
  select initialization_status = 'ready', name into v_ready, v_name
    from public.astro_profiles
    where id = p_profile_id and user_id = v_user_id;
  if not found then
    raise exception 'profile not found' using errcode = 'ANF01';
  end if;
  if not v_ready then
    raise exception 'profile initialization is not complete' using errcode = 'AIT01';
  end if;

  insert into public.astro_sessions (user_id, profile_id, title, status)
    values (v_user_id, p_profile_id, v_name, 'complete')
    returning id into v_session_id;

  return jsonb_build_object('sessionId', v_session_id, 'profileId', p_profile_id);
end;
$$;

create or replace function public.begin_astro_agent_run(
  p_session_id uuid,
  p_message text,
  p_client_message_id uuid,
  p_answer_to_question_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_last_run_id uuid;
  v_existing_run_id uuid;
  v_existing_message_id uuid;
  v_new_run_id uuid;
  v_message_id uuid;
  v_question jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = 'AFB01';
  end if;
  if coalesce(p_message, '') = '' or length(p_message) > 4000 then
    raise exception 'invalid message' using errcode = 'AIR01';
  end if;

  select s.profile_id, s.last_run_id, s.current_question
    into v_profile_id, v_last_run_id, v_question
    from public.astro_sessions s
    where s.id = p_session_id and s.user_id = v_user_id
    for update of s;
  if not found then
    raise exception 'session not found' using errcode = 'ANF01';
  end if;

  -- Focused-question answers must reference the stored question.
  if p_answer_to_question_id is not null then
    if v_question is null or v_question ->> 'id' <> p_answer_to_question_id::text then
      raise exception 'stale or unknown focused question' using errcode = 'ACF01';
    end if;
  end if;

  -- Idempotent retry: same client message id returns the same run/message.
  select m.id into v_existing_message_id
    from public.astro_messages m
    where m.session_id = p_session_id and m.client_message_id = p_client_message_id
    limit 1;
  if v_existing_message_id is not null then
    select r.id into v_existing_run_id
      from public.astro_agent_runs r
      where r.triggering_message_id = v_existing_message_id
      order by r.started_at desc limit 1;
    if v_existing_run_id is not null then
      return jsonb_build_object(
        'runId', v_existing_run_id, 'messageId', v_existing_message_id,
        'replayed', true,
        'status', (select status from public.astro_agent_runs where id = v_existing_run_id));
    end if;
  end if;

  -- One active run per profile.
  if exists (
    select 1 from public.astro_agent_runs r
    where r.profile_id = v_profile_id and r.status = 'active'
  ) then
    raise exception 'another run is active for this profile' using errcode = 'ACF01';
  end if;

  insert into public.astro_messages (
    user_id, session_id, role, content, client_message_id
  ) values (
    v_user_id, p_session_id, 'user', p_message, p_client_message_id
  ) returning id into v_message_id;

  insert into public.astro_agent_runs (
    user_id, profile_id, session_id, kind, status, phase,
    client_request_id, triggering_message_id, resume_from_run_id
  ) values (
    v_user_id, v_profile_id, p_session_id, 'question', 'active', 'planning',
    p_client_message_id, v_message_id,
    case when v_last_run_id is not null then v_last_run_id else null end
  ) returning id into v_new_run_id;

  update public.astro_sessions
    set status = 'active',
        last_run_id = v_new_run_id,
        last_message_preview = left(p_message, 140),
        state_version = state_version + 1
    where id = p_session_id;

  return jsonb_build_object(
    'runId', v_new_run_id, 'messageId', v_message_id, 'replayed', false, 'status', 'active');
end;
$$;

create or replace function public.resume_astro_agent_run(
  p_failed_run_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_failed record;
  v_new_run_id uuid;
  v_existing_run_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = 'AFB01';
  end if;

  select r.* into v_failed
    from public.astro_agent_runs r
    where r.id = p_failed_run_id and r.user_id = v_user_id
    for update of r;
  if not found then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;
  if v_failed.status <> 'failed' or not v_failed.resumable then
    raise exception 'run is not resumable' using errcode = 'AIT01';
  end if;

  -- Idempotent replay of the same resume request.
  select id into v_existing_run_id
    from public.astro_agent_runs
    where user_id = v_user_id
      and client_request_id = p_client_request_id
      and resume_from_run_id = p_failed_run_id
    limit 1;
  if v_existing_run_id is not null then
    return jsonb_build_object(
      'runId', v_existing_run_id, 'messageId', null, 'replayed', true,
      'status', (select status from public.astro_agent_runs where id = v_existing_run_id));
  end if;

  if exists (
    select 1 from public.astro_agent_runs r
    where r.profile_id = v_failed.profile_id and r.status = 'active'
  ) then
    raise exception 'another run is active for this profile' using errcode = 'ACF01';
  end if;

  insert into public.astro_agent_runs (
    user_id, profile_id, session_id, kind, status, phase,
    client_request_id, resume_from_run_id, checkpoint_json, context_version,
    last_completed_step, next_action
  ) values (
    v_user_id, v_failed.profile_id, v_failed.session_id, v_failed.kind, 'active', 'planning',
    p_client_request_id, p_failed_run_id, v_failed.checkpoint_json, v_failed.context_version,
    v_failed.last_completed_step, v_failed.next_action
  ) returning id into v_new_run_id;

  update public.astro_sessions
    set status = 'active', last_run_id = v_new_run_id, state_version = state_version + 1
    where id = v_failed.session_id;

  return jsonb_build_object(
    'runId', v_new_run_id, 'messageId', null, 'replayed', false, 'status', 'active');
end;
$$;

create or replace function public.attach_astro_workflow_run(
  p_run_id uuid,
  p_workflow_run_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing text;
  v_won boolean;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = 'AFB01';
  end if;
  if coalesce(p_workflow_run_id, '') = '' then
    raise exception 'invalid workflow run id' using errcode = 'AIR01';
  end if;

  select workflow_run_id into v_existing
    from public.astro_agent_runs
    where id = p_run_id and user_id = v_user_id;
  if not found then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;
  if v_existing is not null then
    return jsonb_build_object('workflowRunId', v_existing, 'won', false);
  end if;

  update public.astro_agent_runs
    set workflow_run_id = p_workflow_run_id
    where id = p_run_id and user_id = v_user_id and workflow_run_id is null;
  if found then
    return jsonb_build_object('workflowRunId', p_workflow_run_id, 'won', true);
  end if;

  -- Lost the race: return the winning ID so the caller can cancel its duplicate.
  select workflow_run_id into v_existing
    from public.astro_agent_runs
    where id = p_run_id and user_id = v_user_id;
  return jsonb_build_object('workflowRunId', v_existing, 'won', false);
end;
$$;

-- ===========================================================================
-- 15. Worker RPCs (service role only)
-- ===========================================================================

create or replace function public.worker_checkpoint_astro_run(
  p_run_id uuid,
  p_expected_version bigint,
  p_step jsonb,
  p_checkpoint jsonb default null,
  p_session_patch jsonb default null,
  p_assistant_message jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
  v_question jsonb;
  v_question_id uuid;
  v_message_id uuid;
  v_new_status text;
  v_ordinal integer;
begin
  select * into v_run from public.astro_agent_runs where id = p_run_id for update;
  if not found then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;
  if v_run.version <> p_expected_version then
    raise exception 'stale run version' using errcode = 'ASV01';
  end if;
  if v_run.status not in ('active', 'waiting_for_user') then
    raise exception 'run is not active' using errcode = 'AIT01';
  end if;

  v_ordinal := v_run.step_count + 1;

  -- Step row: insert on first sight of the step key, update on completion.
  if exists (
    select 1 from public.astro_agent_run_steps s
    where s.run_id = p_run_id and s.step_key = (p_step ->> 'stepKey')
  ) then
    update public.astro_agent_run_steps s
      set status = coalesce(p_step ->> 'status', s.status),
          output_summary = left(coalesce(p_step ->> 'outputSummary', ''), 500),
          refs = coalesce(p_step -> 'refs', s.refs),
          cache_hit = coalesce((p_step ->> 'cacheHit')::boolean, s.cache_hit),
          completed_at = case when coalesce(p_step ->> 'status', '') = 'succeeded'
            then now() else s.completed_at end
      where s.run_id = p_run_id and s.step_key = (p_step ->> 'stepKey');
  else
    insert into public.astro_agent_run_steps (
      user_id, profile_id, session_id, run_id, ordinal, step_key, kind, status,
      tool_name, input_summary, output_summary, refs, cache_hit, completed_at
    ) values (
      v_run.user_id, v_run.profile_id, v_run.session_id, p_run_id, v_ordinal,
      left(p_step ->> 'stepKey', 120),
      coalesce(p_step ->> 'kind', 'model'),
      coalesce(p_step ->> 'status', 'succeeded'),
      p_step ->> 'toolName',
      left(coalesce(p_step ->> 'inputSummary', ''), 500),
      left(coalesce(p_step ->> 'outputSummary', ''), 500),
      coalesce(p_step -> 'refs', '{}'::jsonb),
      coalesce((p_step ->> 'cacheHit')::boolean, false),
      case when coalesce(p_step ->> 'status', '') = 'succeeded' then now() else null end
    );
  end if;

  update public.astro_agent_runs
    set checkpoint_json = coalesce(p_checkpoint, checkpoint_json),
        last_completed_step = coalesce(p_step ->> 'stepKey', last_completed_step),
        next_action = coalesce(p_step ->> 'nextAction', next_action),
        phase = coalesce(p_step ->> 'phase', phase),
        context_version = coalesce((p_step ->> 'contextVersion')::bigint, context_version),
        step_count = greatest(step_count, v_ordinal),
        version = version + 1
    where id = p_run_id;

  -- Session state mirror.
  update public.astro_sessions
    set status = coalesce(p_session_patch ->> 'status', status),
        current_goal = coalesce(p_session_patch ->> 'currentGoal', current_goal),
        current_question = coalesce(p_session_patch -> 'currentQuestion', current_question),
        next_action = coalesce(p_session_patch ->> 'nextAction', next_action),
        last_completed_step = coalesce(p_session_patch ->> 'lastCompletedStep', last_completed_step),
        checkpoint_json = coalesce(p_checkpoint, checkpoint_json),
        last_context_version = coalesce((p_step ->> 'contextVersion')::bigint, last_context_version),
        last_message_preview = coalesce(p_session_patch ->> 'lastMessagePreview', last_message_preview),
        summary_text = coalesce(p_session_patch ->> 'summaryText', summary_text),
        summary_json = coalesce(p_session_patch -> 'summaryJson', summary_json),
        state_version = state_version + 1
    where id = v_run.session_id;

  -- Terminal assistant message: persisted in the same transaction.
  if p_assistant_message is not null then
    v_new_status := p_assistant_message ->> 'status';
    if v_new_status not in ('waiting_for_user', 'complete') then
      raise exception 'invalid terminal status' using errcode = 'AIR01';
    end if;

    v_question := p_assistant_message -> 'focusedQuestion';
    if v_question is not null and v_question <> 'null'::jsonb then
      v_question_id := gen_random_uuid();
      v_question := jsonb_build_object(
        'id', v_question_id,
        'prompt', left(coalesce(v_question ->> 'prompt', ''), 2000),
        'responseKind', coalesce(v_question ->> 'responseKind', 'free_text'),
        'options', coalesce(v_question -> 'options', '[]'::jsonb),
        'allowFreeText', coalesce((v_question ->> 'allowFreeText')::boolean, true));
      if v_question ->> 'responseKind' = 'single_choice'
         and pg_catalog.jsonb_array_length(v_question -> 'options') < 2 then
        raise exception 'single_choice question needs at least two options' using errcode = 'AIR01';
      end if;
      if (select count(*) from pg_catalog.jsonb_array_elements(v_question -> 'options') o
          where o ->> 'kind' = 'control') > 1 then
        raise exception 'at most one control option is allowed' using errcode = 'AIR01';
      end if;
    else
      v_question := null;
    end if;

    insert into public.astro_messages (
      user_id, session_id, role, content, run_id, step_key
    ) values (
      v_run.user_id, v_run.session_id, 'assistant',
      left(coalesce(p_assistant_message ->> 'content', ''), 6000),
      p_run_id, p_step ->> 'stepKey'
    ) returning id into v_message_id;

    update public.astro_agent_runs
      set status = v_new_status,
          output_message_id = v_message_id,
          checkpoint_json = coalesce(p_checkpoint, checkpoint_json),
          completed_at = now()
      where id = p_run_id;

    update public.astro_sessions
      set status = v_new_status,
          current_question = v_question,
          current_goal = coalesce(p_session_patch ->> 'currentGoal', current_goal),
          next_action = coalesce(p_session_patch ->> 'nextAction', next_action),
          summary_text = coalesce(p_session_patch ->> 'summaryText', summary_text),
          summary_json = coalesce(p_session_patch -> 'summaryJson', summary_json),
          last_message_preview = left(coalesce(p_assistant_message ->> 'content', ''), 140),
          last_run_id = p_run_id,
          state_version = state_version + 1
      where id = v_run.session_id;
  end if;

  return jsonb_build_object(
    'version', (select version from public.astro_agent_runs where id = p_run_id),
    'stepCount', (select step_count from public.astro_agent_runs where id = p_run_id),
    'messageId', v_message_id,
    'questionId', v_question_id);
end;
$$;

create or replace function public.worker_fail_astro_run(
  p_run_id uuid,
  p_expected_version bigint,
  p_error_code text,
  p_error_message text,
  p_resumable boolean default true,
  p_next_action text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
begin
  select * into v_run from public.astro_agent_runs where id = p_run_id for update;
  if not found then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;
  if v_run.version <> p_expected_version then
    raise exception 'stale run version' using errcode = 'ASV01';
  end if;
  if v_run.status not in ('active', 'waiting_for_user') then
    return jsonb_build_object('status', v_run.status);
  end if;

  update public.astro_agent_runs
    set status = 'failed',
        error_code = left(coalesce(p_error_code, 'internal'), 80),
        error_message = left(coalesce(p_error_message, ''), 500),
        resumable = coalesce(p_resumable, true),
        next_action = coalesce(p_next_action, next_action),
        completed_at = now(),
        version = version + 1
    where id = p_run_id;

  update public.astro_sessions
    set status = 'failed',
        next_action = coalesce(p_next_action, next_action),
        state_version = state_version + 1
    where id = v_run.session_id;

  return jsonb_build_object('status', 'failed');
end;
$$;

create or replace function public.worker_apply_astro_memory_change(
  p_run_id uuid,
  p_operation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
  v_action text;
  v_fact_key text;
  v_fact record;
  v_evidence_ids uuid[] := '{}';
  v_evidence_count integer;
  v_evidence record;
  v_verified_direct boolean;
  v_supporting_sources integer;
  v_new_status text;
  v_new_revision integer;
  v_new_confidence numeric;
  v_value jsonb;
  v_reason text;
  v_fact_id uuid;
  v_rel text;
begin
  select * into v_run from public.astro_agent_runs where id = p_run_id;
  if not found then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;

  v_action := p_operation ->> 'action';
  v_fact_key := left(coalesce(p_operation ->> 'factKey', ''), 120);
  v_reason := left(coalesce(p_operation ->> 'reason', ''), 1000);
  v_value := coalesce(p_operation -> 'value', '{}'::jsonb);
  v_new_confidence := least(greatest(coalesce((p_operation ->> 'confidence')::numeric, 0.5), 0), 1);

  if p_operation -> 'evidenceIds' is not null then
    select coalesce(array_agg(x.value::uuid), '{}'::uuid[])
      into v_evidence_ids
      from pg_catalog.jsonb_array_elements_text(p_operation -> 'evidenceIds') as x;
  end if;

  -- All evidence must belong to the run's owner/profile.
  if array_length(v_evidence_ids, 1) is not null then
    select count(*) into v_evidence_count
      from public.astro_evidence
      where id = any (v_evidence_ids)
        and user_id = v_run.user_id
        and profile_id = v_run.profile_id;
    if v_evidence_count <> pg_catalog.array_length(v_evidence_ids, 1) then
      raise exception 'evidence does not belong to run owner' using errcode = 'AFB01';
    end if;
  end if;

  -- A quote is "verified" when it is an exact substring of its owned source
  -- user message.
  if array_length(v_evidence_ids, 1) is not null then
    select bool_or(
             e.source_kind = 'user_statement'
             and e.assertion_mode = 'direct'
             and e.source_message_id is not null
             and position(e.exact_quote in m.content) > 0
           )
      into v_verified_direct
      from public.astro_evidence e
      join public.astro_messages m on m.id = e.source_message_id
      where e.id = any (v_evidence_ids)
        and e.user_id = v_run.user_id;
  else
    v_verified_direct := false;
  end if;

  if v_action = 'propose' then
    select * into v_fact from public.astro_person_facts
      where profile_id = v_run.profile_id and fact_key = v_fact_key for update;
    if found then
      raise exception 'fact already exists; use assess' using errcode = 'ACF01';
    end if;

    -- Hybrid policy: direct facts enter confirmed only on a verified direct
    -- quote; derived facts always start proposed.
    if (p_operation ->> 'origin') = 'direct' and v_verified_direct then
      v_new_status := 'confirmed';
    else
      v_new_status := 'proposed';
    end if;

    insert into public.astro_person_facts (
      user_id, profile_id, fact_key, value_json, summary, origin, status,
      confidence, revision, created_by_run_id, updated_by_run_id
    ) values (
      v_run.user_id, v_run.profile_id, v_fact_key, v_value,
      left(coalesce(p_operation ->> 'summary', ''), 500),
      coalesce(p_operation ->> 'origin', 'derived'),
      v_new_status, v_new_confidence, 1, p_run_id, p_run_id
    ) returning id into v_fact_id;

    insert into public.astro_map_revisions (
      user_id, profile_id, fact_id, run_id, revision_no,
      previous_value_json, new_value_json, previous_status, new_status,
      previous_confidence, new_confidence, reason
    ) values (
      v_run.user_id, v_run.profile_id, v_fact_id, p_run_id, 1,
      null, v_value, null, v_new_status, null, v_new_confidence, v_reason
    );

  elsif v_action in ('confirm', 'contradict', 'retire') then
    select * into v_fact from public.astro_person_facts
      where profile_id = v_run.profile_id and fact_key = v_fact_key for update;
    if not found then
      raise exception 'fact not found' using errcode = 'ANF01';
    end if;
    if v_fact.revision <> coalesce((p_operation ->> 'expectedRevision')::integer, -1) then
      raise exception 'stale fact revision' using errcode = 'ASV01';
    end if;
    if v_fact.status = 'retired' then
      raise exception 'fact is retired' using errcode = 'AIT01';
    end if;

    if v_action = 'confirm' then
      if v_fact.origin = 'direct' then
        if not v_verified_direct then
          raise exception 'direct fact confirmation requires a verified direct quote'
            using errcode = 'AIT01';
        end if;
      else
        -- Derived: explicit direct confirmation OR two distinct supporting
        -- source messages/events.
        -- Distinct supporting source messages/events across both the fact's
        -- existing links and the evidence supplied with this confirmation.
        select count(distinct coalesce(e.source_message_id::text, e.source_event_id::text))
          into v_supporting_sources
          from public.astro_evidence e
          where e.user_id = v_run.user_id
            and e.profile_id = v_run.profile_id
            and (
              e.id in (
                select fe.evidence_id from public.astro_fact_evidence fe
                where fe.fact_id = v_fact.id and fe.relation = 'supports'
                  and fe.user_id = v_run.user_id
              )
              or (array_length(v_evidence_ids, 1) is not null
                  and e.id = any (v_evidence_ids))
            );
        if not (v_verified_direct or v_supporting_sources >= 2) then
          raise exception 'derived fact needs explicit confirmation or two independent sources'
            using errcode = 'AIT01';
        end if;
      end if;
      v_new_status := 'confirmed';
    elsif v_action = 'contradict' then
      v_new_status := 'contradicted';
    else
      v_new_status := 'retired';
    end if;

    v_new_revision := v_fact.revision + 1;
    update public.astro_person_facts
      set status = v_new_status,
          confidence = v_new_confidence,
          revision = v_new_revision,
          updated_by_run_id = p_run_id
      where id = v_fact.id;

    insert into public.astro_map_revisions (
      user_id, profile_id, fact_id, run_id, revision_no,
      previous_value_json, new_value_json, previous_status, new_status,
      previous_confidence, new_confidence, reason
    ) values (
      v_run.user_id, v_run.profile_id, v_fact.id, p_run_id, v_new_revision,
      v_fact.value_json, v_fact.value_json, v_fact.status, v_new_status,
      v_fact.confidence, v_new_confidence, v_reason
    );

  else
    raise exception 'unknown memory operation' using errcode = 'AIR01';
  end if;

  -- Evidence links (supports for propose/confirm, contradicts otherwise).
  v_rel := case when v_action = 'contradict' then 'contradicts' else 'supports' end;
  if array_length(v_evidence_ids, 1) is not null then
    insert into public.astro_fact_evidence (
      user_id, profile_id, fact_id, evidence_id, relation, run_id
    )
    select v_run.user_id, v_run.profile_id,
           coalesce(v_fact_id, v_fact.id), e.id, v_rel, p_run_id
      from pg_catalog.unnest(v_evidence_ids) as e(id)
    on conflict (fact_id, evidence_id, relation) do nothing;
  end if;

  update public.astro_profiles
    set memory_version = memory_version + 1
    where id = v_run.profile_id;

  return jsonb_build_object(
    'factId', coalesce(v_fact_id, v_fact.id),
    'revision', coalesce(v_new_revision, 1),
    'status', v_new_status,
    'memoryVersion', (
      select memory_version from public.astro_profiles where id = v_run.profile_id));
end;
$$;

create or replace function public.worker_claim_astro_tool_call(
  p_run_id uuid,
  p_step_key text,
  p_tool_name text,
  p_day date,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
  v_existing record;
  v_tool_calls integer;
begin
  select * into v_run from public.astro_agent_runs where id = p_run_id;
  if not found then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;

  -- Idempotent replay: the same completed step reuses its prior claim.
  select * into v_existing
    from public.astro_agent_run_steps
    where run_id = p_run_id and step_key = left(p_step_key, 120);
  if found and v_existing.status in ('started', 'succeeded')
     and (v_existing.refs ->> 'claimed') = 'true' then
    select tool_calls into v_tool_calls
      from public.astro_quotas
      where user_id = v_run.user_id and day = p_day;
    return jsonb_build_object(
      'claimed', true, 'replayed', true,
      'toolCalls', coalesce(v_tool_calls, 0));
  end if;
  if found and v_existing.status = 'failed' then
    -- Retry of the same logical call: reuse the claim, no new quota charge.
    update public.astro_agent_run_steps
      set status = 'started'
      where id = v_existing.id;
    select tool_calls into v_tool_calls
      from public.astro_quotas
      where user_id = v_run.user_id and day = p_day;
    return jsonb_build_object(
      'claimed', true, 'replayed', true, 'toolCalls', coalesce(v_tool_calls, 0));
  end if;

  -- Atomic daily quota enforcement.
  select tool_calls into v_tool_calls
    from public.astro_quotas
    where user_id = v_run.user_id and day = p_day
    for update;
  if coalesce(v_tool_calls, 0) >= p_limit then
    raise exception 'daily tool call limit reached' using errcode = 'AQU01';
  end if;

  insert into public.astro_quotas (user_id, day, tool_calls)
    values (v_run.user_id, p_day, 1)
    on conflict (user_id, day) do update
      set tool_calls = public.astro_quotas.tool_calls + 1
    returning tool_calls into v_tool_calls;

  if v_existing is null then
    insert into public.astro_agent_run_steps (
      user_id, profile_id, session_id, run_id, ordinal, step_key, kind, status,
      tool_name, refs
    ) values (
      v_run.user_id, v_run.profile_id, v_run.session_id, p_run_id,
      v_run.step_count + 1, left(p_step_key, 120), 'tool', 'started',
      left(p_tool_name, 80),
      jsonb_build_object('claimed', true, 'day', p_day)
    );
  else
    update public.astro_agent_run_steps
      set status = 'started', refs = refs || jsonb_build_object('claimed', true)
      where id = v_existing.id;
  end if;

  return jsonb_build_object('claimed', true, 'replayed', false, 'toolCalls', v_tool_calls);
end;
$$;

create or replace function public.worker_finish_astro_intake(
  p_run_id uuid,
  p_chart jsonb,
  p_sensitivity jsonb,
  p_greeting text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
  v_message_id uuid;
begin
  select * into v_run from public.astro_agent_runs where id = p_run_id for update;
  if not found then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;
  if v_run.kind <> 'intake' then
    raise exception 'run is not an intake' using errcode = 'AIT01';
  end if;
  if v_run.status = 'complete' then
    -- Idempotent replay.
    return jsonb_build_object('status', 'complete', 'replayed', true,
      'messageId', v_run.output_message_id);
  end if;
  if v_run.status <> 'active' then
    raise exception 'run is not active' using errcode = 'AIT01';
  end if;
  if p_chart is null or p_sensitivity is null then
    raise exception 'chart and sensitivity are required' using errcode = 'AIR01';
  end if;

  update public.astro_profiles
    set chart_json = p_chart,
        sensitivity_json = p_sensitivity,
        initialization_status = 'ready',
        initialization_error = null
    where id = v_run.profile_id;

  insert into public.astro_messages (
    user_id, session_id, role, content, run_id
  ) values (
    v_run.user_id, v_run.session_id, 'assistant',
    left(coalesce(p_greeting, ''), 6000), p_run_id
  ) returning id into v_message_id;

  update public.astro_agent_runs
    set status = 'complete', phase = null, output_message_id = v_message_id,
        completed_at = now(), version = version + 1
    where id = p_run_id;

  update public.astro_sessions
    set status = 'complete',
        last_run_id = p_run_id,
        last_message_preview = left(coalesce(p_greeting, ''), 140),
        state_version = state_version + 1
    where id = v_run.session_id;

  return jsonb_build_object('status', 'complete', 'replayed', false, 'messageId', v_message_id);
end;
$$;

create or replace function public.worker_fail_astro_intake(
  p_run_id uuid,
  p_error_code text,
  p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
begin
  select * into v_run from public.astro_agent_runs where id = p_run_id for update;
  if not found then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;
  if v_run.status = 'complete' then
    return jsonb_build_object('status', 'complete');
  end if;

  update public.astro_profiles
    set initialization_status = 'failed',
        initialization_error = left(coalesce(p_error_message, 'intake failed'), 500)
    where id = v_run.profile_id;

  update public.astro_agent_runs
    set status = 'failed',
        error_code = left(coalesce(p_error_code, 'internal'), 80),
        error_message = left(coalesce(p_error_message, ''), 500),
        resumable = true,
        completed_at = now(),
        version = version + 1
    where id = p_run_id;

  update public.astro_sessions
    set status = 'failed', state_version = state_version + 1
    where id = v_run.session_id;

  return jsonb_build_object('status', 'failed');
end;
$$;

create or replace function public.worker_record_astro_evidence(
  p_run_id uuid,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
  v_message record;
  v_event record;
  v_source_message_id uuid;
  v_source_event_id uuid;
  v_source_kind text;
  v_assertion_mode text;
  v_exact_quote text;
  v_idem text;
  v_evidence_id uuid;
  v_verified boolean := false;
begin
  select * into v_run from public.astro_agent_runs where id = p_run_id;
  if not found then
    raise exception 'run not found' using errcode = 'ANF01';
  end if;

  v_source_message_id := (p_evidence ->> 'sourceMessageId')::uuid;
  v_source_event_id := (p_evidence ->> 'sourceEventId')::uuid;
  if num_nonnulls(v_source_message_id, v_source_event_id) <> 1 then
    raise exception 'exactly one of sourceMessageId/sourceEventId is required'
      using errcode = 'AIR01';
  end if;
  v_source_kind := coalesce(p_evidence ->> 'sourceKind',
    case when v_source_message_id is not null then 'user_statement' else 'life_event' end);
  if v_source_kind not in ('user_statement', 'life_event', 'profile_record', 'agent_derivation') then
    raise exception 'invalid source kind' using errcode = 'AIR01';
  end if;
  v_assertion_mode := coalesce(p_evidence ->> 'assertionMode', 'direct');
  if v_assertion_mode not in ('direct', 'derived') then
    raise exception 'invalid assertion mode' using errcode = 'AIR01';
  end if;
  v_exact_quote := coalesce(p_evidence ->> 'exactQuote', '');
  if v_exact_quote = '' then
    raise exception 'exact quote is required' using errcode = 'AIR01';
  end if;

  if v_source_message_id is not null then
    select * into v_message from public.astro_messages
      where id = v_source_message_id and user_id = v_run.user_id
        and session_id = v_run.session_id;
    if not found then
      raise exception 'source message not found for this run' using errcode = 'ANF01';
    end if;
    -- Direct user statements must quote the owned message exactly.
    if v_source_kind = 'user_statement' and v_assertion_mode = 'direct' then
      v_verified := position(v_exact_quote in v_message.content) > 0;
      if not v_verified then
        raise exception 'exact quote is not a substring of the source message'
          using errcode = 'AIR01';
      end if;
    else
      v_verified := true;
    end if;
  else
    select * into v_event from public.astro_events
      where id = v_source_event_id and user_id = v_run.user_id
        and profile_id = v_run.profile_id;
    if not found then
      raise exception 'source event not found for this profile' using errcode = 'ANF01';
    end if;
    v_verified := true;
  end if;

  v_idem := coalesce(p_evidence ->> 'idempotencyKey', 'run:' || p_run_id::text);

  insert into public.astro_evidence (
    user_id, profile_id, session_id, source_message_id, source_event_id,
    source_kind, assertion_mode, evidence_type, exact_quote, summary,
    normalized_json, occurred_on, quality, idempotency_key, created_by_run_id
  ) values (
    v_run.user_id, v_run.profile_id, v_run.session_id,
    v_source_message_id, v_source_event_id,
    v_source_kind, v_assertion_mode,
    left(coalesce(p_evidence ->> 'evidenceType', 'observation'), 80),
    left(v_exact_quote, 2000),
    left(coalesce(p_evidence ->> 'summary', ''), 1000),
    coalesce(p_evidence -> 'normalized', '{}'::jsonb),
    (p_evidence ->> 'occurredOn')::date,
    least(greatest(coalesce((p_evidence ->> 'quality')::numeric, 0.5), 0), 1),
    v_idem,
    p_run_id
  )
  on conflict (profile_id, idempotency_key) do nothing
  returning id into v_evidence_id;

  if v_evidence_id is null then
    select id into v_evidence_id
      from public.astro_evidence
      where profile_id = v_run.profile_id and idempotency_key = v_idem;
    return jsonb_build_object('evidenceId', v_evidence_id, 'replayed', true,
      'verified', v_verified);
  end if;

  return jsonb_build_object('evidenceId', v_evidence_id, 'replayed', false,
    'verified', v_verified);
end;
$$;

revoke all on function public.worker_record_astro_evidence(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.worker_record_astro_evidence(uuid, jsonb) to service_role;

-- ===========================================================================
-- 16. RLS, grants, and function execution rights
-- ===========================================================================

-- New tables: authenticated users get owner-scoped SELECT only. All writes
-- go through the RPCs above (service role bypasses RLS).
alter table public.astro_evidence enable row level security;
alter table public.astro_person_facts enable row level security;
alter table public.astro_fact_evidence enable row level security;
alter table public.astro_map_revisions enable row level security;
alter table public.astro_hypothesis_evidence enable row level security;
alter table public.astro_agent_runs enable row level security;
alter table public.astro_agent_run_steps enable row level security;
alter table public.astro_run_context_items enable row level security;
alter table public.astro_calculation_cache enable row level security;

drop policy if exists "Users read their own astro evidence" on public.astro_evidence;
create policy "Users read their own astro evidence"
  on public.astro_evidence for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own astro person facts" on public.astro_person_facts;
create policy "Users read their own astro person facts"
  on public.astro_person_facts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own astro fact evidence" on public.astro_fact_evidence;
create policy "Users read their own astro fact evidence"
  on public.astro_fact_evidence for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own astro map revisions" on public.astro_map_revisions;
create policy "Users read their own astro map revisions"
  on public.astro_map_revisions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own astro hypothesis evidence" on public.astro_hypothesis_evidence;
create policy "Users read their own astro hypothesis evidence"
  on public.astro_hypothesis_evidence for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own astro agent runs" on public.astro_agent_runs;
create policy "Users read their own astro agent runs"
  on public.astro_agent_runs for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own astro run steps" on public.astro_agent_run_steps;
create policy "Users read their own astro run steps"
  on public.astro_agent_run_steps for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own astro context items" on public.astro_run_context_items;
create policy "Users read their own astro context items"
  on public.astro_run_context_items for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own astro calculation cache" on public.astro_calculation_cache;
create policy "Users read their own astro calculation cache"
  on public.astro_calculation_cache for select to authenticated
  using ((select auth.uid()) = user_id);

-- Table privileges: SELECT only for authenticated on new ledgers.
revoke all on table public.astro_evidence from anon, authenticated;
revoke all on table public.astro_person_facts from anon, authenticated;
revoke all on table public.astro_fact_evidence from anon, authenticated;
revoke all on table public.astro_map_revisions from anon, authenticated;
revoke all on table public.astro_hypothesis_evidence from anon, authenticated;
revoke all on table public.astro_agent_runs from anon, authenticated;
revoke all on table public.astro_agent_run_steps from anon, authenticated;
revoke all on table public.astro_run_context_items from anon, authenticated;
revoke all on table public.astro_calculation_cache from anon, authenticated;

grant select on table public.astro_evidence to authenticated;
grant select on table public.astro_person_facts to authenticated;
grant select on table public.astro_fact_evidence to authenticated;
grant select on table public.astro_map_revisions to authenticated;
grant select on table public.astro_hypothesis_evidence to authenticated;
grant select on table public.astro_agent_runs to authenticated;
grant select on table public.astro_agent_run_steps to authenticated;
grant select on table public.astro_run_context_items to authenticated;
grant select on table public.astro_calculation_cache to authenticated;

-- Function execution: user-entry RPCs to authenticated, worker RPCs to
-- service_role only.
revoke all on function public.begin_astro_profile_intake(jsonb, uuid) from public, anon;
revoke all on function public.create_astro_session(uuid) from public, anon;
revoke all on function public.begin_astro_agent_run(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.resume_astro_agent_run(uuid, uuid) from public, anon;
revoke all on function public.attach_astro_workflow_run(uuid, text) from public, anon;
revoke all on function public.worker_astro_relevant_context(uuid, text, text[], date, date, integer) from public, anon, authenticated;
revoke all on function public.worker_checkpoint_astro_run(uuid, bigint, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.worker_fail_astro_run(uuid, bigint, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.worker_apply_astro_memory_change(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.worker_claim_astro_tool_call(uuid, text, text, date, integer) from public, anon, authenticated;
revoke all on function public.worker_finish_astro_intake(uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.worker_fail_astro_intake(uuid, text, text) from public, anon, authenticated;

grant execute on function public.begin_astro_profile_intake(jsonb, uuid) to authenticated;
grant execute on function public.create_astro_session(uuid) to authenticated;
grant execute on function public.begin_astro_agent_run(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.resume_astro_agent_run(uuid, uuid) to authenticated;
grant execute on function public.attach_astro_workflow_run(uuid, text) to authenticated;

grant execute on function public.worker_astro_relevant_context(uuid, text, text[], date, date, integer) to service_role;
grant execute on function public.worker_checkpoint_astro_run(uuid, bigint, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.worker_fail_astro_run(uuid, bigint, text, text, boolean, text) to service_role;
grant execute on function public.worker_apply_astro_memory_change(uuid, jsonb) to service_role;
grant execute on function public.worker_claim_astro_tool_call(uuid, text, text, date, integer) to service_role;
grant execute on function public.worker_finish_astro_intake(uuid, jsonb, jsonb, text) to service_role;
grant execute on function public.worker_fail_astro_intake(uuid, text, text) to service_role;
