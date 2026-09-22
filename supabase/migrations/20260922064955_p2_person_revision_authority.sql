-- P2: shared person identity and revision authority.
--
-- Additive compatibility boundary: astro_profiles.id remains the person ID;
-- legacy facts/evidence and astro_* chat tables remain readable. Backfilled
-- revisions are intentionally empty; legacy assistant summaries are not
-- promoted to person claims or direct evidence by this migration.
--
-- Cutover: new writes must use person_* entry/publication RPCs. Do not route
-- both the legacy memory writer and this revision publisher as authorities.
-- Rollback: roll back readers/writers behind a feature flag but retain accepted
-- sources and revision data. Never restore a writer that ignores corrections.

alter table public.astro_profiles
  alter column birth_date drop not null,
  alter column birth_time drop not null,
  alter column lat drop not null,
  alter column lng drop not null,
  alter column tz drop not null,
  add column person_status text not null default 'active'
    check (person_status in ('active', 'archived', 'deleting', 'deleted')),
  add column astro_status text not null default 'not_configured'
    check (astro_status in ('not_configured', 'pending', 'ready', 'failed', 'disabled'));

update public.astro_profiles
set person_status = 'active',
    astro_status = case
      when initialization_status = 'ready'
        and chart_json is not null and sensitivity_json is not null then 'ready'
      when initialization_status = 'pending' then 'pending'
      when initialization_status = 'failed' and birth_date is not null then 'failed'
      else 'not_configured'
    end;

create or replace function public.person_sync_astro_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.chart_json is not null and new.sensitivity_json is not null
     and new.initialization_status = 'ready' then
    new.astro_status := 'ready';
  elsif new.initialization_status = 'pending' then
    new.astro_status := 'pending';
  elsif new.initialization_status = 'failed' and new.birth_date is not null then
    new.astro_status := 'failed';
  elsif new.birth_date is null and new.birth_time is null and new.lat is null
     and new.lng is null and new.tz is null and new.chart_json is null then
    new.astro_status := 'not_configured';
  end if;
  return new;
end;
$$;
create trigger person_profiles_sync_astro_status
before insert or update of initialization_status, birth_date, birth_time, lat, lng, tz,
  chart_json, sensitivity_json on public.astro_profiles
for each row execute function public.person_sync_astro_status();

-- Published revision history. Each existing person receives an empty baseline
-- revision; old summaries are intentionally not copied into it.
create table public.person_model_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  revision_no bigint not null check (revision_no >= 1),
  parent_revision bigint,
  processed_source_seq bigint not null default 0 check (processed_source_seq >= 0),
  privacy_epoch bigint not null default 0 check (privacy_epoch >= 0),
  mode_epoch bigint not null default 0 check (mode_epoch >= 0),
  brief text not null default '' check (char_length(brief) <= 12000),
  changed_ids jsonb not null default '[]' check (jsonb_typeof(changed_ids) = 'array'),
  decision_summary text not null default '' check (char_length(decision_summary) <= 4000),
  verifier_receipt jsonb not null default '{}',
  schema_version text not null default 'person-v3-p2',
  guidance_version text,
  model_policy_version text,
  job_id uuid,
  commit_id uuid not null,
  commit_request jsonb not null default '{}',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint person_model_revisions_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint person_model_revisions_parent_fk
    foreign key (profile_id, user_id, parent_revision)
    references public.person_model_revisions (profile_id, user_id, revision_no),
  constraint person_model_revisions_profile_revision_key unique (profile_id, user_id, revision_no),
  constraint person_model_revisions_commit_key unique (profile_id, user_id, commit_id),
  constraint person_model_revisions_id_owner_key unique (id, user_id, profile_id)
);

create table public.person_model_heads (
  profile_id uuid primary key,
  user_id uuid not null,
  current_revision bigint not null,
  processed_source_seq bigint not null default 0 check (processed_source_seq >= 0),
  privacy_epoch bigint not null default 0 check (privacy_epoch >= 0),
  publication_state text not null default 'current'
    check (publication_state in ('empty', 'current', 'stale', 'blocked', 'deleting')),
  updated_at timestamptz not null default now(),
  constraint person_model_heads_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint person_model_heads_current_revision_fk
    foreign key (profile_id, user_id, current_revision)
    references public.person_model_revisions (profile_id, user_id, revision_no)
    deferrable initially deferred,
  constraint person_model_heads_profile_owner_key unique (profile_id, user_id)
);

create table public.person_preferences (
  profile_id uuid primary key,
  user_id uuid not null,
  astrology_enabled boolean not null default false,
  mode_epoch bigint not null default 0 check (mode_epoch >= 0),
  domains jsonb not null default '{}' check (jsonb_typeof(domains) = 'object'),
  locale text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint person_preferences_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint person_preferences_profile_owner_key unique (profile_id, user_id)
);

create table public.person_source_sequences (
  profile_id uuid primary key,
  user_id uuid not null,
  last_accepted_seq bigint not null default 0 check (last_accepted_seq >= 0),
  updated_at timestamptz not null default now(),
  constraint person_source_sequences_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint person_source_sequences_profile_owner_key unique (profile_id, user_id)
);

-- The request body is canonical JSONB for exact semantic replay comparison.
-- Private source text remains in astro_messages, not in this command ledger.
create table public.person_command_ledger (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  profile_id uuid,
  command_type text not null,
  request_body jsonb not null check (jsonb_typeof(request_body) = 'object'),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, command_id),
  constraint person_command_ledger_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade
);

create table public.person_source_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  source_seq bigint not null check (source_seq >= 1),
  source_kind text not null check (source_kind in
    ('native_message', 'explicit_correction', 'explicit_exclusion', 'import_item', 'other')),
  source_message_id uuid,
  speaker_role text not null check (speaker_role in ('user', 'assistant', 'tool', 'system', 'unknown')),
  subject_kind text not null default 'self'
    check (subject_kind in ('self', 'other', 'hypothetical', 'unknown')),
  subject_label text,
  source_time timestamptz,
  ingested_at timestamptz not null default now(),
  original_order bigint,
  inclusion_status text not null default 'included'
    check (inclusion_status in ('included', 'excluded', 'pending', 'retracted')),
  dedup_key text,
  content_fingerprint text not null,
  lineage jsonb not null default '{}' check (jsonb_typeof(lineage) = 'object'),
  retention_until timestamptz,
  command_id uuid,
  constraint person_source_items_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint person_source_items_message_owner_fk
    foreign key (source_message_id, user_id) references public.astro_messages (id, user_id) on delete cascade,
  constraint person_source_items_command_fk
    foreign key (user_id, command_id) references public.person_command_ledger (user_id, command_id)
    on delete set null (command_id),
  constraint person_source_items_profile_seq_key unique (profile_id, user_id, source_seq),
  constraint person_source_items_id_owner_key unique (id, user_id, profile_id),
  constraint person_source_items_message_once unique (profile_id, source_message_id),
  constraint person_source_items_dedup_key unique (profile_id, dedup_key)
);
create index person_source_items_profile_included_seq_idx
  on public.person_source_items (profile_id, source_seq desc) where inclusion_status = 'included';
create index person_source_items_message_idx
  on public.person_source_items (source_message_id, user_id) where source_message_id is not null;

create table public.person_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  source_item_id uuid not null,
  source_seq bigint not null,
  span_start integer,
  span_end integer,
  exact_quote text,
  normalized_assertion jsonb not null check (jsonb_typeof(normalized_assertion) = 'object'),
  subject_kind text not null check (subject_kind in ('self', 'other', 'hypothetical', 'unknown')),
  subject_label text,
  domain text not null check (char_length(domain) <= 80),
  assertion_type text not null check (assertion_type in
    ('direct', 'derived', 'reported_interpretation', 'assistant_hypothesis', 'unknown')),
  occurred_from timestamptz,
  occurred_to timestamptz,
  time_precision text not null default 'unknown' check (time_precision in
    ('exact', 'day', 'month', 'year', 'range', 'age', 'relative', 'unknown')),
  extraction_version text,
  verifier_version text,
  status text not null default 'proposed'
    check (status in ('proposed', 'verified', 'rejected', 'superseded')),
  created_at timestamptz not null default now(),
  constraint person_observations_source_owner_fk
    foreign key (source_item_id, user_id, profile_id)
    references public.person_source_items (id, user_id, profile_id) on delete cascade,
  constraint person_observations_source_seq_fk
    foreign key (profile_id, user_id, source_seq)
    references public.person_source_items (profile_id, user_id, source_seq) on delete cascade,
  constraint person_observations_span_check
    check ((span_start is null and span_end is null) or (span_start >= 0 and span_end >= span_start)),
  constraint person_observations_event_range_check
    check (occurred_to is null or occurred_from is null or occurred_to >= occurred_from),
  constraint person_observations_id_owner_key unique (id, user_id, profile_id)
);
create index person_observations_profile_seq_idx on public.person_observations (profile_id, source_seq, status);
create index person_observations_domain_idx on public.person_observations (profile_id, domain, status);

create table public.person_objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  kind text not null check (kind in
    ('episode', 'meaning_change', 'pattern', 'influence', 'goal', 'issue',
     'current_state', 'gap', 'scenario', 'chapter')),
  current_version_id uuid,
  lifecycle text not null default 'active'
    check (lifecycle in ('active', 'superseded', 'retired', 'invalidated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_objects_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint person_objects_id_owner_key unique (id, user_id, profile_id),
  constraint person_objects_id_identity_key unique (id, profile_id, user_id)
);
create index person_objects_profile_kind_lifecycle_idx on public.person_objects (profile_id, kind, lifecycle);

create table public.person_object_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  object_id uuid not null,
  version_no integer not null check (version_no >= 1),
  epistemic_class text not null check (epistemic_class in
    ('reported', 'working_hypothesis', 'unknown', 'calculated', 'interpretation')),
  lifecycle text not null check (lifecycle in ('active', 'superseded', 'retired', 'invalidated')),
  typed_payload jsonb not null check (jsonb_typeof(typed_payload) = 'object'),
  effective_from timestamptz,
  effective_to timestamptz,
  time_precision text not null default 'unknown' check (time_precision in
    ('exact', 'day', 'month', 'year', 'range', 'age', 'relative', 'unknown')),
  created_by_run_id uuid,
  created_at timestamptz not null default now(),
  constraint person_object_versions_object_owner_fk
    foreign key (object_id, user_id, profile_id)
    references public.person_objects (id, user_id, profile_id) on delete cascade,
  constraint person_object_versions_version_key unique (object_id, user_id, profile_id, version_no),
  constraint person_object_versions_id_owner_key unique (id, user_id, profile_id),
  constraint person_object_versions_id_identity_key unique (id, object_id, user_id, profile_id),
  constraint person_object_versions_run_fk
    foreign key (created_by_run_id, user_id)
    references public.astro_agent_runs (id, user_id) on delete set null (created_by_run_id),
  constraint person_object_versions_effective_range_check
    check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

alter table public.person_objects
  add constraint person_objects_current_version_fk
  foreign key (current_version_id, id, user_id, profile_id)
  references public.person_object_versions (id, object_id, user_id, profile_id)
  deferrable initially deferred;

create table public.person_object_version_support (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  object_version_id uuid not null,
  source_item_id uuid,
  observation_id uuid,
  relation text not null check (relation in ('supports', 'contradicts', 'qualifies')),
  note text,
  weight numeric check (weight is null or (weight >= 0 and weight <= 1)),
  created_at timestamptz not null default now(),
  constraint person_object_version_support_one_source
    check (num_nonnulls(source_item_id, observation_id) = 1),
  constraint person_object_version_support_version_fk
    foreign key (object_version_id, user_id, profile_id)
    references public.person_object_versions (id, user_id, profile_id) on delete cascade,
  constraint person_object_version_support_source_fk
    foreign key (source_item_id, user_id, profile_id)
    references public.person_source_items (id, user_id, profile_id) on delete cascade,
  constraint person_object_version_support_observation_fk
    foreign key (observation_id, user_id, profile_id)
    references public.person_observations (id, user_id, profile_id) on delete cascade
);
create unique index person_object_support_source_unique
  on public.person_object_version_support (object_version_id, source_item_id, relation)
  where source_item_id is not null;
create unique index person_object_support_observation_unique
  on public.person_object_version_support (object_version_id, observation_id, relation)
  where observation_id is not null;
create index person_object_version_support_source_idx
  on public.person_object_version_support (source_item_id, profile_id)
  where source_item_id is not null;
create index person_object_version_support_observation_idx
  on public.person_object_version_support (observation_id, profile_id)
  where observation_id is not null;

create table public.person_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  from_object_id uuid not null,
  to_object_id uuid not null,
  relation_kind text not null check (relation_kind in
    ('precedes', 'reported_effect', 'changed_meaning', 'supports', 'qualifies',
     'contradicts', 'influenced', 'part_of', 'hypothesized_link')),
  current_version_id uuid,
  lifecycle text not null default 'active'
    check (lifecycle in ('active', 'superseded', 'retired', 'invalidated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_relations_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint person_relations_from_owner_fk
    foreign key (from_object_id, user_id, profile_id)
    references public.person_objects (id, user_id, profile_id) on delete cascade,
  constraint person_relations_to_owner_fk
    foreign key (to_object_id, user_id, profile_id)
    references public.person_objects (id, user_id, profile_id) on delete cascade,
  constraint person_relations_distinct_endpoints check (from_object_id <> to_object_id),
  constraint person_relations_id_owner_key unique (id, user_id, profile_id),
  constraint person_relations_id_identity_key unique (id, profile_id, user_id)
);
create index person_relations_from_idx on public.person_relations (profile_id, from_object_id, lifecycle);
create index person_relations_to_idx on public.person_relations (profile_id, to_object_id, lifecycle);

create table public.person_relation_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  relation_id uuid not null,
  version_no integer not null check (version_no >= 1),
  epistemic_class text not null check (epistemic_class in
    ('reported', 'working_hypothesis', 'unknown', 'calculated', 'interpretation')),
  lifecycle text not null check (lifecycle in ('active', 'superseded', 'retired', 'invalidated')),
  typed_payload jsonb not null check (jsonb_typeof(typed_payload) = 'object'),
  created_at timestamptz not null default now(),
  constraint person_relation_versions_relation_owner_fk
    foreign key (relation_id, user_id, profile_id)
    references public.person_relations (id, user_id, profile_id) on delete cascade,
  constraint person_relation_versions_version_key unique (relation_id, user_id, profile_id, version_no),
  constraint person_relation_versions_id_owner_key unique (id, user_id, profile_id),
  constraint person_relation_versions_id_identity_key unique (id, relation_id, user_id, profile_id)
);

alter table public.person_relations
  add constraint person_relations_current_version_fk
  foreign key (current_version_id, id, user_id, profile_id)
  references public.person_relation_versions (id, relation_id, user_id, profile_id)
  deferrable initially deferred;

create table public.person_relation_version_support (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  relation_version_id uuid not null,
  source_item_id uuid,
  observation_id uuid,
  relation text not null check (relation in ('supports', 'contradicts', 'qualifies')),
  created_at timestamptz not null default now(),
  constraint person_relation_version_support_one_source
    check (num_nonnulls(source_item_id, observation_id) = 1),
  constraint person_relation_version_support_version_fk
    foreign key (relation_version_id, user_id, profile_id)
    references public.person_relation_versions (id, user_id, profile_id) on delete cascade,
  constraint person_relation_version_support_source_fk
    foreign key (source_item_id, user_id, profile_id)
    references public.person_source_items (id, user_id, profile_id) on delete cascade,
  constraint person_relation_version_support_observation_fk
    foreign key (observation_id, user_id, profile_id)
    references public.person_observations (id, user_id, profile_id) on delete cascade
);
create unique index person_relation_support_source_unique
  on public.person_relation_version_support (relation_version_id, source_item_id, relation)
  where source_item_id is not null;
create unique index person_relation_support_observation_unique
  on public.person_relation_version_support (relation_version_id, observation_id, relation)
  where observation_id is not null;

create table public.person_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  conflict_kind text not null check (conflict_kind in
    ('competing_dates', 'competing_claims', 'subject_attribution', 'meaning', 'other')),
  status text not null default 'open' check (status in ('open', 'resolved', 'deferred')),
  summary text not null default '' check (char_length(summary) <= 2000),
  blocked_consequences jsonb not null default '[]'
    check (jsonb_typeof(blocked_consequences) = 'array'),
  resolved_by_change_id uuid,
  resolved_revision bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_conflicts_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint person_conflicts_id_owner_key unique (id, user_id, profile_id)
);
create index person_conflicts_open_idx on public.person_conflicts (profile_id, status, created_at desc);

create table public.person_conflict_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  conflict_id uuid not null,
  observation_id uuid,
  object_version_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint person_conflict_items_one_candidate
    check (num_nonnulls(observation_id, object_version_id) = 1),
  constraint person_conflict_items_conflict_fk
    foreign key (conflict_id, user_id, profile_id)
    references public.person_conflicts (id, user_id, profile_id) on delete cascade,
  constraint person_conflict_items_observation_fk
    foreign key (observation_id, user_id, profile_id)
    references public.person_observations (id, user_id, profile_id) on delete cascade,
  constraint person_conflict_items_object_version_fk
    foreign key (object_version_id, user_id, profile_id)
    references public.person_object_versions (id, user_id, profile_id) on delete cascade
);
create unique index person_conflict_items_observation_unique
  on public.person_conflict_items (conflict_id, observation_id)
  where observation_id is not null;
create unique index person_conflict_items_object_version_unique
  on public.person_conflict_items (conflict_id, object_version_id)
  where object_version_id is not null;

create table public.person_revision_objects (
  user_id uuid not null,
  profile_id uuid not null,
  revision_no bigint not null,
  object_id uuid not null,
  object_version_id uuid not null,
  created_at timestamptz not null default now(),
  constraint person_revision_objects_revision_fk
    foreign key (profile_id, user_id, revision_no)
    references public.person_model_revisions (profile_id, user_id, revision_no) on delete cascade,
  constraint person_revision_objects_object_fk
    foreign key (object_id, user_id, profile_id)
    references public.person_objects (id, user_id, profile_id) on delete cascade,
  constraint person_revision_objects_version_fk
    foreign key (object_version_id, object_id, user_id, profile_id)
    references public.person_object_versions (id, object_id, user_id, profile_id) on delete cascade,
  primary key (profile_id, user_id, revision_no, object_id),
  constraint person_revision_objects_one_version unique (profile_id, user_id, revision_no, object_version_id)
);
create index person_revision_objects_object_idx
  on public.person_revision_objects (object_id, profile_id, revision_no desc);

create table public.person_revision_relations (
  user_id uuid not null,
  profile_id uuid not null,
  revision_no bigint not null,
  relation_id uuid not null,
  relation_version_id uuid not null,
  created_at timestamptz not null default now(),
  constraint person_revision_relations_revision_fk
    foreign key (profile_id, user_id, revision_no)
    references public.person_model_revisions (profile_id, user_id, revision_no) on delete cascade,
  constraint person_revision_relations_relation_fk
    foreign key (relation_id, user_id, profile_id)
    references public.person_relations (id, user_id, profile_id) on delete cascade,
  constraint person_revision_relations_version_fk
    foreign key (relation_version_id, relation_id, user_id, profile_id)
    references public.person_relation_versions (id, relation_id, user_id, profile_id) on delete cascade,
  primary key (profile_id, user_id, revision_no, relation_id),
  constraint person_revision_relations_one_version unique (profile_id, user_id, revision_no, relation_version_id)
);
create index person_revision_relations_relation_idx
  on public.person_revision_relations (relation_id, profile_id, revision_no desc);

create table public.person_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  source_item_id uuid not null,
  source_seq bigint not null,
  change_kind text not null check (change_kind in
    ('correction', 'rejection', 'exclusion', 'inclusion', 'deletion', 'merge', 'split')),
  target_kind text not null check (target_kind in ('object', 'relation', 'source', 'person')),
  target_id uuid not null,
  prior_version_id uuid,
  status text not null default 'accepted' check (status in ('accepted', 'resolved', 'cancelled')),
  resolved_revision bigint,
  request jsonb not null default '{}' check (jsonb_typeof(request) = 'object'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint person_changes_source_fk
    foreign key (source_item_id, user_id, profile_id)
    references public.person_source_items (id, user_id, profile_id) on delete cascade,
  constraint person_changes_source_seq_fk
    foreign key (profile_id, user_id, source_seq)
    references public.person_source_items (profile_id, user_id, source_seq) on delete cascade,
  constraint person_changes_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint person_changes_prior_object_version_fk
    foreign key (prior_version_id, user_id, profile_id)
    references public.person_object_versions (id, user_id, profile_id)
    on delete set null (prior_version_id),
  constraint person_changes_id_owner_key unique (id, user_id, profile_id)
);
create index person_changes_pending_idx on public.person_changes (profile_id, status, source_seq);

create table public.person_change_impacts (
  change_id uuid not null,
  user_id uuid not null,
  profile_id uuid not null,
  entity_kind text not null check (entity_kind in ('object', 'relation', 'suggestion', 'view')),
  entity_id uuid not null,
  invalidated_revision bigint,
  created_at timestamptz not null default now(),
  constraint person_change_impacts_change_fk
    foreign key (change_id, user_id, profile_id)
    references public.person_changes (id, user_id, profile_id) on delete cascade,
  constraint person_change_impacts_revision_fk
    foreign key (profile_id, user_id, invalidated_revision)
    references public.person_model_revisions (profile_id, user_id, revision_no)
    on delete set null (invalidated_revision),
  primary key (change_id, entity_kind, entity_id)
);
create index person_change_impacts_entity_idx
  on public.person_change_impacts (profile_id, entity_kind, entity_id);

create table public.person_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  job_kind text not null check (job_kind in
    ('source_consolidation', 'correction', 'exclusion', 'deletion', 'rebuild')),
  state text not null default 'pending' check (state in
    ('pending', 'leased', 'running', 'completed', 'failed', 'cancelled')),
  source_from_seq bigint not null check (source_from_seq >= 1),
  source_to_seq bigint not null check (source_to_seq >= source_from_seq),
  base_revision bigint not null,
  privacy_epoch bigint not null check (privacy_epoch >= 0),
  mode_epoch bigint not null check (mode_epoch >= 0),
  command_id uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  fence bigint not null default 0 check (fence >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  budget_json jsonb not null default '{}' check (jsonb_typeof(budget_json) = 'object'),
  result_revision bigint,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint person_jobs_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint person_jobs_base_revision_fk
    foreign key (profile_id, user_id, base_revision)
    references public.person_model_revisions (profile_id, user_id, revision_no),
  constraint person_jobs_command_fk
    foreign key (user_id, command_id) references public.person_command_ledger (user_id, command_id)
    on delete set null (command_id),
  constraint person_jobs_result_revision_fk
    foreign key (profile_id, user_id, result_revision)
    references public.person_model_revisions (profile_id, user_id, revision_no),
  constraint person_jobs_lease_shape check
    ((state = 'leased' and lease_token is not null and lease_expires_at is not null) or state <> 'leased'),
  constraint person_jobs_source_range
    unique (profile_id, user_id, job_kind, source_from_seq, source_to_seq),
  constraint person_jobs_id_owner_key unique (id, user_id, profile_id)
);
create index person_jobs_ready_idx on public.person_jobs (available_at, created_at)
  where state in ('pending', 'leased');
create index person_jobs_profile_recent_idx on public.person_jobs (profile_id, created_at desc);

create table public.person_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  job_id uuid not null,
  event_type text not null check (event_type in ('person.input.accepted', 'person.updated', 'person.job.failed')),
  event_payload jsonb not null default '{}' check (jsonb_typeof(event_payload) = 'object'),
  state text not null default 'pending' check (state in ('pending', 'leased', 'delivered', 'dead')),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  fence bigint not null default 0 check (fence >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint person_outbox_job_fk
    foreign key (job_id, user_id, profile_id)
    references public.person_jobs (id, user_id, profile_id) on delete cascade,
  constraint person_outbox_one_job_event unique (job_id, event_type),
  constraint person_outbox_lease_shape check
    ((state = 'leased' and lease_token is not null and lease_expires_at is not null) or state <> 'leased')
);
create index person_outbox_ready_idx on public.person_outbox (available_at, created_at)
  where state in ('pending', 'leased');

create table public.person_run_payloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  job_id uuid,
  astro_run_id uuid,
  payload_key text not null,
  payload_kind text not null check (payload_kind in
    ('candidate', 'verification', 'final_response', 'tool_result', 'checkpoint', 'repair')),
  schema_version text not null,
  payload jsonb not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint person_run_payloads_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade,
  constraint person_run_payloads_job_fk
    foreign key (job_id, user_id, profile_id)
    references public.person_jobs (id, user_id, profile_id) on delete cascade,
  constraint person_run_payloads_run_fk
    foreign key (astro_run_id, user_id) references public.astro_agent_runs (id, user_id) on delete cascade,
  constraint person_run_payloads_job_key unique (job_id, payload_key),
  constraint person_run_payloads_id_owner_key unique (id, user_id, profile_id),
  constraint person_run_payloads_exactly_one_run check (num_nonnulls(job_id, astro_run_id) = 1)
);
create index person_run_payloads_expiry_idx on public.person_run_payloads (profile_id, expires_at);

create table public.person_job_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  job_id uuid not null,
  ordinal integer not null check (ordinal >= 0),
  step_key text not null,
  stage text not null check (stage in
    ('ingest', 'extract', 'retrieve', 'reconcile', 'verify', 'publish', 'repair')),
  state text not null check (state in ('started', 'succeeded', 'failed', 'skipped')),
  input_payload_id uuid,
  output_payload_id uuid,
  refs jsonb not null default '{}' check (jsonb_typeof(refs) = 'object'),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint person_job_steps_job_fk
    foreign key (job_id, user_id, profile_id)
    references public.person_jobs (id, user_id, profile_id) on delete cascade,
  constraint person_job_steps_key unique (job_id, step_key),
  constraint person_job_steps_id_owner_key unique (id, user_id, profile_id)
);
alter table public.person_job_steps
  add constraint person_job_steps_input_payload_fk
  foreign key (input_payload_id, user_id, profile_id)
  references public.person_run_payloads (id, user_id, profile_id)
  on delete set null (input_payload_id),
  add constraint person_job_steps_output_payload_fk
  foreign key (output_payload_id, user_id, profile_id)
  references public.person_run_payloads (id, user_id, profile_id)
  on delete set null (output_payload_id);
create index person_job_steps_job_order_idx on public.person_job_steps (job_id, ordinal);

alter table public.person_model_revisions
  add constraint person_model_revisions_job_fk
  foreign key (job_id, user_id, profile_id)
  references public.person_jobs (id, user_id, profile_id) on delete set null (job_id);

alter table public.person_changes
  add constraint person_changes_resolved_revision_fk
  foreign key (profile_id, user_id, resolved_revision)
  references public.person_model_revisions (profile_id, user_id, revision_no)
  on delete set null (resolved_revision);

alter table public.person_conflicts
  add constraint person_conflicts_resolved_change_fk
  foreign key (resolved_by_change_id, user_id, profile_id)
  references public.person_changes (id, user_id, profile_id)
  on delete set null (resolved_by_change_id),
  add constraint person_conflicts_resolved_revision_fk
  foreign key (profile_id, user_id, resolved_revision)
  references public.person_model_revisions (profile_id, user_id, revision_no)
  on delete set null (resolved_revision);

create table public.person_revision_conflicts (
  user_id uuid not null,
  profile_id uuid not null,
  revision_no bigint not null,
  conflict_id uuid not null,
  created_at timestamptz not null default now(),
  constraint person_revision_conflicts_revision_fk
    foreign key (profile_id, user_id, revision_no)
    references public.person_model_revisions (profile_id, user_id, revision_no) on delete cascade,
  constraint person_revision_conflicts_conflict_fk
    foreign key (conflict_id, user_id, profile_id)
    references public.person_conflicts (id, user_id, profile_id) on delete cascade,
  primary key (profile_id, user_id, revision_no, conflict_id)
);

-- Entry command reservation. Returns NULL for a newly reserved command, the
-- original receipt for an exact replay, or raises PDC01 for a body mismatch.
create or replace function public.person_reserve_command(
  p_user_id uuid,
  p_command_id uuid,
  p_command_type text,
  p_request_body jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.person_command_ledger%rowtype;
begin
  if p_command_id is null or p_request_body is null
     or jsonb_typeof(p_request_body) <> 'object' then
    raise exception 'invalid command' using errcode = 'AIR01';
  end if;
  insert into public.person_command_ledger (user_id, command_id, command_type, request_body)
  values (p_user_id, p_command_id, p_command_type, p_request_body)
  on conflict (user_id, command_id) do nothing;
  if found then return null; end if;

  select * into v_existing
  from public.person_command_ledger
  where user_id = p_user_id and command_id = p_command_id
  for update;
  if not found or v_existing.command_type <> p_command_type
     or v_existing.request_body <> p_request_body then
    raise exception 'command id reused with a different body' using errcode = 'PDC01';
  end if;
  if v_existing.result is null then
    -- An unfinished row cannot be committed by a normal entry call; this is a
    -- defensive guard for manual/partial ledger changes.
    raise exception 'command receipt is incomplete' using errcode = 'PDC02';
  end if;
  return v_existing.result || jsonb_build_object('replayed', true);
end;
$$;

create or replace function public.person_complete_command(
  p_user_id uuid,
  p_command_id uuid,
  p_profile_id uuid,
  p_result jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.person_command_ledger
  set profile_id = p_profile_id,
      result = p_result - 'replayed',
      completed_at = now()
  where user_id = p_user_id and command_id = p_command_id;
  if not found then raise exception 'command reservation not found' using errcode = 'PDC02'; end if;
end;
$$;

create or replace function public.person_create(
  p_name text,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_body jsonb;
  v_replay jsonb;
  v_profile_id uuid;
  v_revision bigint;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = 'AFB01'; end if;
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'name must be 1-120 characters' using errcode = 'AIR01';
  end if;
  v_body := jsonb_build_object('name', v_name);
  v_replay := public.person_reserve_command(v_user_id, p_command_id, 'person.create', v_body);
  if v_replay is not null then return v_replay; end if;

  -- `ready` is retained only to let the legacy session adapter remain usable;
  -- astro_status is independently `not_configured`, and all chart fields are
  -- NULL. Astro-aware readers must gate on astro_status, not this legacy flag.
  insert into public.astro_profiles
    (user_id, name, initialization_status, person_status, astro_status)
  values (v_user_id, v_name, 'ready', 'active', 'not_configured')
  returning id into v_profile_id;

  select current_revision into v_revision
  from public.person_model_heads where profile_id = v_profile_id and user_id = v_user_id;
  v_result := jsonb_build_object(
    'profileId', v_profile_id, 'personStatus', 'active',
    'astroStatus', 'not_configured', 'revision', v_revision);
  perform public.person_complete_command(v_user_id, p_command_id, v_profile_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end;
$$;

create or replace function public.person_accept_user_message(
  p_profile_id uuid,
  p_message_id uuid,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_body jsonb;
  v_replay jsonb;
  v_message public.astro_messages%rowtype;
  v_source_id uuid;
  v_source_seq bigint;
  v_job_id uuid;
  v_revision bigint;
  v_privacy_epoch bigint;
  v_mode_epoch bigint;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = 'AFB01'; end if;
  v_body := jsonb_build_object('profileId', p_profile_id, 'messageId', p_message_id);
  v_replay := public.person_reserve_command(v_user_id, p_command_id, 'source.accept_user_message', v_body);
  if v_replay is not null then return v_replay; end if;

  select m.* into v_message
  from public.astro_messages m
  join public.astro_profiles p on p.id = m.profile_id and p.user_id = m.user_id
  where m.id = p_message_id and m.user_id = v_user_id and m.profile_id = p_profile_id
    and m.role = 'user' and p.person_status = 'active';
  if not found then raise exception 'user message not found for person' using errcode = 'ANF01'; end if;

  select id, source_seq into v_source_id, v_source_seq
  from public.person_source_items
  where profile_id = p_profile_id and user_id = v_user_id and source_message_id = p_message_id;
  if v_source_id is null then
    update public.person_source_sequences
    set last_accepted_seq = last_accepted_seq + 1, updated_at = now()
    where profile_id = p_profile_id and user_id = v_user_id
    returning last_accepted_seq into v_source_seq;
    if not found then raise exception 'person source sequence missing' using errcode = 'ANF01'; end if;

    insert into public.person_source_items (
      user_id, profile_id, source_seq, source_kind, source_message_id,
      speaker_role, subject_kind, source_time, original_order,
      content_fingerprint, command_id
    ) values (
      v_user_id, p_profile_id, v_source_seq, 'native_message', p_message_id,
      'user', 'self', v_message.created_at, v_message.created_at,
      md5(v_message.content), p_command_id
    ) returning id into v_source_id;

    select h.current_revision, h.privacy_epoch, pref.mode_epoch
      into v_revision, v_privacy_epoch, v_mode_epoch
    from public.person_model_heads h
    join public.person_preferences pref using (profile_id, user_id)
    where h.profile_id = p_profile_id and h.user_id = v_user_id;

    insert into public.person_jobs (
      user_id, profile_id, job_kind, source_from_seq, source_to_seq,
      base_revision, privacy_epoch, mode_epoch, command_id
    ) values (
      v_user_id, p_profile_id, 'source_consolidation', v_source_seq, v_source_seq,
      v_revision, v_privacy_epoch, v_mode_epoch, p_command_id
    ) returning id into v_job_id;
    insert into public.person_outbox (user_id, profile_id, job_id, event_type, event_payload)
    values (v_user_id, p_profile_id, v_job_id, 'person.input.accepted',
            jsonb_build_object('sourceSeq', v_source_seq));
  end if;

  v_result := jsonb_build_object('profileId', p_profile_id, 'sourceId', v_source_id,
    'sourceSeq', v_source_seq, 'jobId', v_job_id, 'alreadyAccepted', v_job_id is null);
  perform public.person_complete_command(v_user_id, p_command_id, p_profile_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end;
$$;

create or replace function public.person_record_correction(
  p_profile_id uuid,
  p_message_id uuid,
  p_target_object_id uuid,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_body jsonb;
  v_replay jsonb;
  v_message public.astro_messages%rowtype;
  v_source_id uuid;
  v_source_seq bigint;
  v_change_id uuid;
  v_job_id uuid;
  v_prior_version uuid;
  v_revision bigint;
  v_privacy_epoch bigint;
  v_mode_epoch bigint;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = 'AFB01'; end if;
  v_body := jsonb_build_object('profileId', p_profile_id, 'messageId', p_message_id,
    'targetObjectId', p_target_object_id);
  v_replay := public.person_reserve_command(v_user_id, p_command_id, 'person.correction', v_body);
  if v_replay is not null then return v_replay; end if;

  select m.* into v_message
  from public.astro_messages m
  where m.id = p_message_id and m.user_id = v_user_id
    and m.profile_id = p_profile_id and m.role = 'user';
  if not found then raise exception 'correction message not found for person' using errcode = 'ANF01'; end if;
  if not exists (
    select 1 from public.person_model_heads h
    join public.person_revision_objects ro
      on ro.profile_id = h.profile_id and ro.user_id = h.user_id
      and ro.revision_no = h.current_revision
    where h.profile_id = p_profile_id and h.user_id = v_user_id
      and ro.object_id = p_target_object_id
  ) then raise exception 'correction target is not in current person revision' using errcode = 'ANF01'; end if;

  select id, source_seq into v_source_id, v_source_seq
  from public.person_source_items
  where user_id = v_user_id and profile_id = p_profile_id and source_message_id = p_message_id;
  if v_source_id is null then
    update public.person_source_sequences
    set last_accepted_seq = last_accepted_seq + 1, updated_at = now()
    where profile_id = p_profile_id and user_id = v_user_id
    returning last_accepted_seq into v_source_seq;
    if not found then raise exception 'person source sequence missing' using errcode = 'ANF01'; end if;
    insert into public.person_source_items (
      user_id, profile_id, source_seq, source_kind, source_message_id,
      speaker_role, subject_kind, source_time, original_order,
      content_fingerprint, command_id, lineage
    ) values (
      v_user_id, p_profile_id, v_source_seq, 'explicit_correction', p_message_id,
      'user', 'self', v_message.created_at, extract(epoch from v_message.created_at)::bigint,
      md5(v_message.content), p_command_id,
      jsonb_build_object('targetObjectId', p_target_object_id)
    ) returning id into v_source_id;
  else
    update public.person_source_items set source_kind='explicit_correction',
      command_id=p_command_id, lineage=lineage || jsonb_build_object('targetObjectId',p_target_object_id)
    where id=v_source_id and user_id=v_user_id and profile_id=p_profile_id;
    update public.person_jobs set state='cancelled', lease_token=null, lease_expires_at=null,
      updated_at=now(), last_error_code='superseded_by_correction'
    where user_id=v_user_id and profile_id=p_profile_id and job_kind='source_consolidation'
      and source_from_seq=v_source_seq and source_to_seq=v_source_seq and state='pending';
  end if;

  select current_version_id into v_prior_version
  from public.person_objects
  where id = p_target_object_id and user_id = v_user_id and profile_id = p_profile_id;
  insert into public.person_changes (
    user_id, profile_id, source_item_id, source_seq, change_kind,
    target_kind, target_id, prior_version_id, request
  ) values (
    v_user_id, p_profile_id, v_source_id, v_source_seq, 'correction',
    'object', p_target_object_id, v_prior_version,
    jsonb_build_object('commandId', p_command_id, 'sourceMessageId', p_message_id)
  ) returning id into v_change_id;
  insert into public.person_change_impacts (change_id, user_id, profile_id, entity_kind, entity_id)
  values (v_change_id, v_user_id, p_profile_id, 'object', p_target_object_id);

  update public.person_model_heads
  set privacy_epoch = privacy_epoch + 1, publication_state = 'stale', updated_at = now()
  where profile_id = p_profile_id and user_id = v_user_id
  returning current_revision, privacy_epoch into v_revision, v_privacy_epoch;
  select mode_epoch into v_mode_epoch from public.person_preferences
  where profile_id = p_profile_id and user_id = v_user_id;
  insert into public.person_jobs (
    user_id, profile_id, job_kind, source_from_seq, source_to_seq,
    base_revision, privacy_epoch, mode_epoch, command_id
  ) values (
    v_user_id, p_profile_id, 'correction', v_source_seq, v_source_seq,
    v_revision, v_privacy_epoch, v_mode_epoch, p_command_id
  ) returning id into v_job_id;
  insert into public.person_outbox (user_id, profile_id, job_id, event_type, event_payload)
  values (v_user_id, p_profile_id, v_job_id, 'person.input.accepted',
    jsonb_build_object('sourceSeq', v_source_seq, 'changeId', v_change_id));

  v_result := jsonb_build_object('profileId', p_profile_id, 'sourceId', v_source_id,
    'sourceSeq', v_source_seq, 'changeId', v_change_id, 'jobId', v_job_id,
    'invalidatedObjectId', p_target_object_id, 'privacyEpoch', v_privacy_epoch);
  perform public.person_complete_command(v_user_id, p_command_id, p_profile_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end;
$$;

create or replace function public.person_set_preferences(
  p_profile_id uuid,
  p_astrology_enabled boolean,
  p_domains jsonb,
  p_locale text,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_body jsonb;
  v_replay jsonb;
  v_mode_epoch bigint;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'unauthenticated' using errcode = 'AFB01'; end if;
  if p_domains is null or jsonb_typeof(p_domains) <> 'object'
     or pg_catalog.pg_column_size(p_domains) > 8192
     or char_length(coalesce(p_locale, '')) > 32 then
    raise exception 'invalid preference payload' using errcode = 'AIR01';
  end if;
  v_body := jsonb_build_object('profileId', p_profile_id,
    'astrologyEnabled', p_astrology_enabled, 'domains', p_domains, 'locale', p_locale);
  v_replay := public.person_reserve_command(v_user_id, p_command_id, 'person.preferences.set', v_body);
  if v_replay is not null then return v_replay; end if;

  update public.person_preferences
  set astrology_enabled = p_astrology_enabled, domains = p_domains, locale = nullif(p_locale, ''),
      mode_epoch = mode_epoch + 1, updated_at = now()
  where profile_id = p_profile_id and user_id = v_user_id
  returning mode_epoch into v_mode_epoch;
  if not found then raise exception 'person not found' using errcode = 'ANF01'; end if;
  update public.person_model_heads set publication_state = 'stale', updated_at = now()
  where profile_id = p_profile_id and user_id = v_user_id;
  v_result := jsonb_build_object('profileId', p_profile_id,
    'astrologyEnabled', p_astrology_enabled, 'modeEpoch', v_mode_epoch);
  perform public.person_complete_command(v_user_id, p_command_id, p_profile_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end;
$$;

create or replace function public.person_claim_job(
  p_job_id uuid,
  p_lease_seconds integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.person_jobs%rowtype;
  v_token uuid := gen_random_uuid();
begin
  select * into v_job from public.person_jobs j
  where j.id = p_job_id and j.attempt_count < j.max_attempts
    and j.available_at <= now()
    and (j.state = 'pending' or (j.state = 'leased' and j.lease_expires_at <= now()))
  for update;
  if not found then return jsonb_build_object('claimed', false); end if;
  update public.person_jobs
  set state = 'leased', lease_token = v_token,
      lease_expires_at = now() + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 180), 30), 600)),
      fence = fence + 1, attempt_count = attempt_count + 1, updated_at = now()
  where id = p_job_id
  returning * into v_job;
  return jsonb_build_object('claimed', true, 'jobId', v_job.id, 'leaseToken', v_job.lease_token,
    'fence', v_job.fence, 'leaseExpiresAt', v_job.lease_expires_at,
    'profileId', v_job.profile_id, 'baseRevision', v_job.base_revision,
    'privacyEpoch', v_job.privacy_epoch, 'modeEpoch', v_job.mode_epoch,
    'sourceFromSeq', v_job.source_from_seq, 'sourceToSeq', v_job.source_to_seq);
end;
$$;

create or replace function public.person_claim_outbox(p_lease_seconds integer default 60)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outbox public.person_outbox%rowtype;
  v_token uuid := gen_random_uuid();
begin
  select * into v_outbox from public.person_outbox o
  where o.available_at <= now()
    and (o.state = 'pending' or (o.state = 'leased' and o.lease_expires_at <= now()))
  order by o.available_at, o.created_at
  for update skip locked limit 1;
  if not found then return jsonb_build_object('claimed', false); end if;
  update public.person_outbox
  set state = 'leased', lease_token = v_token,
      lease_expires_at = now() + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 60), 15), 300)),
      fence = fence + 1, attempt_count = attempt_count + 1
  where id = v_outbox.id
  returning * into v_outbox;
  return jsonb_build_object('claimed', true, 'outboxId', v_outbox.id,
    'jobId', v_outbox.job_id, 'leaseToken', v_outbox.lease_token,
    'fence', v_outbox.fence, 'eventType', v_outbox.event_type,
    'eventPayload', v_outbox.event_payload);
end;
$$;

-- Anchor accepted native messages to the person that owned their session. This
-- makes source-to-message integrity enforceable with a composite FK instead
-- of trusting a client-supplied profile ID.
alter table public.astro_sessions
  add constraint astro_sessions_id_owner_profile_key unique (id, user_id, profile_id);
alter table public.astro_messages
  add column profile_id uuid;

update public.astro_messages m
set profile_id = s.profile_id
from public.astro_sessions s
where s.id = m.session_id and s.user_id = m.user_id;

alter table public.astro_messages
  add constraint astro_messages_id_profile_owner_key unique (id, profile_id, user_id),
  add constraint astro_messages_session_profile_owner_fk
    foreign key (session_id, user_id, profile_id)
    references public.astro_sessions (id, user_id, profile_id) on delete cascade;

alter table public.person_source_items drop constraint person_source_items_message_owner_fk;
alter table public.person_source_items
  add constraint person_source_items_message_owner_fk
    foreign key (source_message_id, profile_id, user_id)
    references public.astro_messages (id, profile_id, user_id) on delete cascade;

create or replace function public.person_anchor_message_profile()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_profile_id uuid;
begin
  select s.profile_id into v_profile_id
  from public.astro_sessions s
  where s.id = new.session_id and s.user_id = new.user_id;
  if not found then
    raise exception 'session not found for message owner' using errcode = 'ANF01';
  end if;
  new.profile_id := v_profile_id;
  return new;
end;
$$;
create trigger astro_messages_anchor_person
before insert or update of session_id, user_id on public.astro_messages
for each row execute function public.person_anchor_message_profile();

-- Empty baseline revisions for all current profiles. No legacy fact, evidence,
-- assistant summary, or chat summary is copied into the P2 model.
insert into public.person_model_revisions (
  user_id, profile_id, revision_no, parent_revision, processed_source_seq,
  privacy_epoch, mode_epoch, brief, changed_ids, decision_summary,
  verifier_receipt, schema_version, commit_id, commit_request
)
select p.user_id, p.id, greatest(p.memory_version, 1), null, 0, 0, 0,
       '', '[]'::jsonb, '', '{}'::jsonb, 'person-v3-p2', gen_random_uuid(),
       jsonb_build_object('kind', 'empty_legacy_baseline')
from public.astro_profiles p;

insert into public.person_model_heads (
  profile_id, user_id, current_revision, processed_source_seq,
  privacy_epoch, publication_state
)
select r.profile_id, r.user_id, r.revision_no, 0, 0, 'current'
from public.person_model_revisions r;

insert into public.person_preferences (profile_id, user_id, astrology_enabled, mode_epoch, domains)
select p.id, p.user_id, false, 0, '{}'::jsonb
from public.astro_profiles p;

insert into public.person_source_sequences (profile_id, user_id, last_accepted_seq)
select p.id, p.user_id, 0 from public.astro_profiles p;

update public.astro_profiles p
set memory_version = h.current_revision
from public.person_model_heads h
where h.profile_id = p.id and h.user_id = p.user_id;

create or replace function public.person_initialize_profile_model()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_revision bigint := greatest(coalesce(new.memory_version, 0), 1);
begin
  insert into public.person_model_revisions (
    user_id, profile_id, revision_no, parent_revision, processed_source_seq,
    privacy_epoch, mode_epoch, brief, changed_ids, decision_summary,
    verifier_receipt, schema_version, commit_id, commit_request
  ) values (
    new.user_id, new.id, v_revision, null, 0, 0, 0, '', '[]'::jsonb, '',
    '{}'::jsonb, 'person-v3-p2', gen_random_uuid(),
    jsonb_build_object('kind', 'empty_new_person_baseline')
  );
  insert into public.person_model_heads
    (profile_id, user_id, current_revision, processed_source_seq, privacy_epoch, publication_state)
  values (new.id, new.user_id, v_revision, 0, 0, 'current');
  insert into public.person_preferences (profile_id, user_id, astrology_enabled, mode_epoch, domains)
    values (new.id, new.user_id, false, 0, '{}'::jsonb);
  insert into public.person_source_sequences (profile_id, user_id, last_accepted_seq)
    values (new.id, new.user_id, 0);
  update public.astro_profiles p set memory_version = v_revision where p.id = new.id;
  return new;
end;
$$;
create trigger astro_profiles_initialize_person_model
after insert on public.astro_profiles
for each row execute function public.person_initialize_profile_model();

-- P2 trusted boundary: charts, revision pointers and assistant-authored raw
-- transcript rows are server/workflow-owned. Authenticated users can still
-- read their own profiles and insert only their own user-role messages.
drop policy if exists "Users manage their own astro profiles" on public.astro_profiles;
drop policy if exists "Users can view their own profile" on public.astro_profiles;
drop policy if exists "Users can insert their own profile" on public.astro_profiles;
drop policy if exists "Users can update their own profile" on public.astro_profiles;
create policy person_profiles_owner_read on public.astro_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.astro_profiles from anon, authenticated;
grant select on table public.astro_profiles to authenticated;

drop policy if exists "Users read and write their own astro messages" on public.astro_messages;
create policy person_messages_owner_read on public.astro_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy person_messages_user_insert on public.astro_messages
  for insert to authenticated
  with check ((select auth.uid()) = user_id and role = 'user');
revoke update, delete on table public.astro_messages from anon, authenticated;

-- Read projections are invoker-security views: the underlying owner policies
-- still apply, and accepted explicit corrections immediately hide impacted
-- records while a replacement revision is being prepared.
create view public.person_current_objects
with (security_invoker = true)
as
select o.user_id, o.profile_id, o.id as object_id, o.kind, ov.id as version_id,
       ov.version_no, ov.epistemic_class, ov.lifecycle, ov.typed_payload,
       ov.effective_from, ov.effective_to, h.current_revision
from public.person_model_heads h
join public.person_revision_objects ro
  on ro.profile_id = h.profile_id and ro.user_id = h.user_id
 and ro.revision_no = h.current_revision
join public.person_objects o
  on o.id = ro.object_id and o.user_id = ro.user_id and o.profile_id = ro.profile_id
join public.person_object_versions ov
  on ov.id = ro.object_version_id and ov.user_id = ro.user_id and ov.profile_id = ro.profile_id
where not exists (
  select 1 from public.person_change_impacts ci
  join public.person_changes c on c.id = ci.change_id and c.user_id = ci.user_id and c.profile_id = ci.profile_id
  where ci.user_id = h.user_id and ci.profile_id = h.profile_id
    and ci.entity_kind = 'object' and ci.entity_id = o.id and c.status = 'accepted'
);

create view public.person_current_relations
with (security_invoker = true)
as
select r.user_id, r.profile_id, r.id as relation_id, r.relation_kind,
       r.from_object_id, r.to_object_id, rv.id as version_id, rv.version_no,
       rv.epistemic_class, rv.lifecycle, rv.typed_payload, h.current_revision
from public.person_model_heads h
join public.person_revision_relations rr
  on rr.profile_id = h.profile_id and rr.user_id = h.user_id
 and rr.revision_no = h.current_revision
join public.person_relations r
  on r.id = rr.relation_id and r.user_id = rr.user_id and r.profile_id = rr.profile_id
join public.person_relation_versions rv
  on rv.id = rr.relation_version_id and rv.user_id = rr.user_id and rv.profile_id = rr.profile_id
where not exists (
  select 1 from public.person_change_impacts ci
  join public.person_changes c on c.id = ci.change_id and c.user_id = ci.user_id and c.profile_id = ci.profile_id
  where ci.user_id = h.user_id and ci.profile_id = h.profile_id
    and ci.entity_kind = 'relation' and ci.entity_id = r.id and c.status = 'accepted'
)
and exists (select 1 from public.person_current_objects a
  where a.profile_id = h.profile_id and a.user_id = h.user_id and a.object_id = r.from_object_id)
and exists (select 1 from public.person_current_objects b
  where b.profile_id = h.profile_id and b.user_id = h.user_id and b.object_id = r.to_object_id);

-- Atomic revision publication. The commit receipt is checked before lease or
-- freshness checks so an exact retry remains idempotent after a successful
-- commit. Any exception aborts every membership/head/job write in the txn.
create or replace function public.person_publish_revision(
  p_job_id uuid, p_lease_token uuid, p_fence bigint,
  p_expected_base_revision bigint, p_expected_privacy_epoch bigint,
  p_commit_id uuid, p_candidate jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_job public.person_jobs%rowtype;
  v_head public.person_model_heads%rowtype;
  v_existing public.person_model_revisions%rowtype;
  v_profile uuid;
  v_user uuid;
  v_revision bigint;
  v_watermark bigint;
  v_request jsonb;
  v_item jsonb;
  v_object_id uuid;
  v_relation_id uuid;
  v_version_id uuid;
  v_change_id uuid;
  v_conflict_id uuid;
begin
  if p_candidate is null or jsonb_typeof(p_candidate) <> 'object' or p_commit_id is null then
    raise exception 'invalid candidate or commit id' using errcode = '22023';
  end if;
  v_watermark := coalesce((p_candidate->>'processedSourceSeq')::bigint, -1);
  if v_watermark < 0
     or jsonb_typeof(coalesce(p_candidate->'objectMembers', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_candidate->'relationMembers', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_candidate->'conflictIds', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_candidate->'resolveChangeIds', '[]'::jsonb)) <> 'array'
     or char_length(coalesce(p_candidate->>'brief', '')) > 12000
     or char_length(coalesce(p_candidate->>'decisionSummary', '')) > 4000 then
    raise exception 'invalid candidate shape' using errcode = '22023';
  end if;
  select j.* into v_job from public.person_jobs j where j.id = p_job_id;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  v_profile := v_job.profile_id;
  v_user := v_job.user_id;
  v_request := jsonb_build_object('jobId', p_job_id, 'baseRevision', p_expected_base_revision,
    'privacyEpoch', p_expected_privacy_epoch, 'candidate', p_candidate);
  select * into v_existing from public.person_model_revisions r
    where r.profile_id = v_profile and r.user_id = v_user and r.commit_id = p_commit_id;
  if found then
    if v_existing.commit_request <> v_request then
      raise exception 'commit id reused with a different body' using errcode = 'PDC01';
    end if;
    return jsonb_build_object('published', true, 'replayed', true,
      'profileId', v_profile, 'revision', v_existing.revision_no, 'revisionId', v_existing.id);
  end if;

  select * into v_job from public.person_jobs j where j.id = p_job_id for update;
  if not found or v_job.state not in ('leased', 'running')
     or v_job.lease_token is distinct from p_lease_token
     or v_job.fence is distinct from p_fence or v_job.lease_expires_at <= now() then
    raise exception 'job lease fence is stale' using errcode = 'PJF01';
  end if;
  select * into v_head from public.person_model_heads h
    where h.profile_id = v_profile and h.user_id = v_user for update;
  if not found or v_head.current_revision <> p_expected_base_revision
     or v_job.base_revision <> p_expected_base_revision
     or v_head.privacy_epoch <> p_expected_privacy_epoch
     or v_job.privacy_epoch <> p_expected_privacy_epoch then
    raise exception 'candidate is based on stale revision or privacy epoch' using errcode = 'PST01';
  end if;
  if v_watermark < v_head.processed_source_seq or v_watermark > v_job.source_to_seq
     or v_watermark < v_job.source_from_seq - 1
     or (v_watermark > v_head.processed_source_seq and v_job.source_from_seq > v_head.processed_source_seq + 1) then
    raise exception 'candidate source watermark is not contiguous' using errcode = 'PSQ01';
  end if;

  v_revision := v_head.current_revision + 1;
  insert into public.person_model_revisions (
    user_id, profile_id, revision_no, parent_revision, processed_source_seq,
    privacy_epoch, mode_epoch, brief, changed_ids, decision_summary,
    verifier_receipt, schema_version, guidance_version, model_policy_version,
    job_id, commit_id, commit_request
  ) values (
    v_user, v_profile, v_revision, v_head.current_revision, v_watermark,
    v_head.privacy_epoch, v_job.mode_epoch, coalesce(p_candidate->>'brief', ''),
    coalesce(p_candidate->'changedIds', '[]'::jsonb), coalesce(p_candidate->>'decisionSummary', ''),
    coalesce(p_candidate->'verifierReceipt', '{}'::jsonb),
    coalesce(p_candidate->>'schemaVersion', 'person-v3-p2'),
    p_candidate->>'guidanceVersion', p_candidate->>'modelPolicyVersion',
    p_job_id, p_commit_id, v_request
  );
  for v_item in select value from jsonb_array_elements(coalesce(p_candidate->'objectMembers', '[]'::jsonb)) loop
    v_object_id := (v_item->>'objectId')::uuid;
    v_version_id := (v_item->>'versionId')::uuid;
    insert into public.person_revision_objects (user_id, profile_id, revision_no, object_id, object_version_id)
      values (v_user, v_profile, v_revision, v_object_id, v_version_id);
    update public.person_objects o set current_version_id = v_version_id,
      lifecycle = ov.lifecycle, updated_at = now()
    from public.person_object_versions ov
    where o.id = v_object_id and o.user_id = v_user and o.profile_id = v_profile
      and ov.id = v_version_id and ov.object_id = o.id and ov.user_id = v_user and ov.profile_id = v_profile;
    if not found then raise exception 'object/version pair is invalid' using errcode = '23514'; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_candidate->'relationMembers', '[]'::jsonb)) loop
    v_relation_id := (v_item->>'relationId')::uuid;
    v_version_id := (v_item->>'versionId')::uuid;
    insert into public.person_revision_relations (user_id, profile_id, revision_no, relation_id, relation_version_id)
      values (v_user, v_profile, v_revision, v_relation_id, v_version_id);
    update public.person_relations r set current_version_id = v_version_id,
      lifecycle = rv.lifecycle, updated_at = now()
    from public.person_relation_versions rv
    where r.id = v_relation_id and r.user_id = v_user and r.profile_id = v_profile
      and rv.id = v_version_id and rv.relation_id = r.id and rv.user_id = v_user and rv.profile_id = v_profile;
    if not found then raise exception 'relation/version pair is invalid' using errcode = '23514'; end if;
    if not exists (
      select 1 from public.person_relations r
      where r.id = v_relation_id and r.profile_id = v_profile and r.user_id = v_user
        and exists (select 1 from public.person_revision_objects ro where ro.profile_id = v_profile
          and ro.user_id = v_user and ro.revision_no = v_revision and ro.object_id = r.from_object_id)
        and exists (select 1 from public.person_revision_objects ro where ro.profile_id = v_profile
          and ro.user_id = v_user and ro.revision_no = v_revision and ro.object_id = r.to_object_id)
    ) then raise exception 'relation endpoints must be in candidate revision' using errcode = '23514'; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_candidate->'conflictIds', '[]'::jsonb)) loop
    v_conflict_id := (v_item #>> '{}')::uuid;
    insert into public.person_revision_conflicts (user_id, profile_id, revision_no, conflict_id)
      values (v_user, v_profile, v_revision, v_conflict_id);
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_candidate->'resolveChangeIds', '[]'::jsonb)) loop
    v_change_id := (v_item #>> '{}')::uuid;
    update public.person_changes c set status = 'resolved', resolved_revision = v_revision, resolved_at = now()
    where c.id = v_change_id and c.user_id = v_user and c.profile_id = v_profile
      and c.status = 'accepted' and c.source_seq <= v_watermark;
    if not found then raise exception 'change is not eligible for resolution' using errcode = '23514'; end if;
  end loop;
  update public.person_change_impacts ci set invalidated_revision = v_revision
  from public.person_changes c where c.id = ci.change_id and c.user_id = ci.user_id and c.profile_id = ci.profile_id
    and c.user_id = v_user and c.profile_id = v_profile and c.resolved_revision = v_revision
    and ci.invalidated_revision is null;
  update public.person_model_heads set current_revision = v_revision,
    processed_source_seq = v_watermark, publication_state = 'current', updated_at = now()
    where profile_id = v_profile and user_id = v_user;
  update public.astro_profiles set memory_version = v_revision where id = v_profile and user_id = v_user;
  update public.person_jobs set state = 'completed', result_revision = v_revision,
    completed_at = now(), lease_token = null, lease_expires_at = null, updated_at = now()
    where id = p_job_id and user_id = v_user and profile_id = v_profile;
  insert into public.person_outbox (user_id, profile_id, job_id, event_type, event_payload)
    values (v_user, v_profile, p_job_id, 'person.updated',
      jsonb_build_object('profileId', v_profile, 'revision', v_revision))
    on conflict (job_id, event_type) do nothing;
  return jsonb_build_object('published', true, 'replayed', false,
    'profileId', v_profile, 'revision', v_revision);
end;
$$;

create or replace function public.person_finish_outbox(
  p_outbox_id uuid, p_lease_token uuid, p_fence bigint, p_succeeded boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_outbox public.person_outbox%rowtype;
begin
  select * into v_outbox from public.person_outbox where id = p_outbox_id for update;
  if not found or v_outbox.state <> 'leased' or v_outbox.lease_token is distinct from p_lease_token
     or v_outbox.fence is distinct from p_fence or v_outbox.lease_expires_at <= now() then
    raise exception 'outbox lease fence is stale' using errcode = 'PJF01';
  end if;
  update public.person_outbox set
    state = case when p_succeeded then 'delivered' when attempt_count >= max_attempts then 'dead' else 'pending' end,
    available_at = case when p_succeeded or attempt_count >= max_attempts then available_at
      else now() + make_interval(secs => least(300, power(2, least(attempt_count, 8))::integer)) end,
    lease_token = null, lease_expires_at = null
  where id = p_outbox_id;
  return jsonb_build_object('outboxId', p_outbox_id, 'state',
    case when p_succeeded then 'delivered' when v_outbox.attempt_count >= v_outbox.max_attempts then 'dead' else 'pending' end);
end;
$$;

-- Explicit Data API exposure: owner-scoped read model only; all writes enter
-- through narrow RPCs. Trusted operational data is closed to client roles.
do $$
declare
  t text;
  readable text[] := array[
    'person_model_revisions','person_model_heads','person_preferences','person_source_items',
    'person_observations','person_objects','person_object_versions','person_object_version_support',
    'person_relations','person_relation_versions','person_relation_version_support','person_conflicts',
    'person_conflict_items','person_revision_objects','person_revision_relations','person_revision_conflicts',
    'person_changes','person_change_impacts'
  ];
begin
  foreach t in array array[
    'person_model_revisions','person_model_heads','person_preferences','person_source_sequences',
    'person_command_ledger','person_source_items','person_observations','person_objects',
    'person_object_versions','person_object_version_support','person_relations','person_relation_versions',
    'person_relation_version_support','person_conflicts','person_conflict_items','person_revision_objects',
    'person_revision_relations','person_revision_conflicts','person_changes','person_change_impacts',
    'person_jobs','person_outbox','person_run_payloads','person_job_steps'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all privileges on table public.%I to service_role', t);
  end loop;
  foreach t in array readable loop
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_owner_read', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
end;
$$;

grant select on public.person_current_objects, public.person_current_relations to authenticated;
revoke all on public.person_current_objects, public.person_current_relations from anon;

-- Narrow authenticated entry API.
revoke all on function public.person_reserve_command(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.person_complete_command(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.person_sync_astro_status() from public, anon, authenticated, service_role;
revoke all on function public.person_anchor_message_profile() from public, anon, authenticated, service_role;
revoke all on function public.person_initialize_profile_model() from public, anon, authenticated, service_role;
revoke all on function public.person_create(text, uuid) from public, anon, authenticated;
revoke all on function public.person_accept_user_message(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.person_record_correction(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.person_set_preferences(uuid, boolean, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.person_create(text, uuid) to authenticated;
grant execute on function public.person_accept_user_message(uuid, uuid, uuid) to authenticated;
grant execute on function public.person_record_correction(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.person_set_preferences(uuid, boolean, jsonb, text, uuid) to authenticated;

-- Workers may claim and publish, but clients cannot impersonate workers.
revoke all on function public.person_claim_job(uuid, integer) from public, anon, authenticated;
revoke all on function public.person_claim_outbox(integer) from public, anon, authenticated;
revoke all on function public.person_finish_outbox(uuid, uuid, bigint, boolean) from public, anon, authenticated;
revoke all on function public.person_publish_revision(uuid, uuid, bigint, bigint, bigint, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.person_claim_job(uuid, integer) to service_role;
grant execute on function public.person_claim_outbox(integer) to service_role;
grant execute on function public.person_finish_outbox(uuid, uuid, bigint, boolean) to service_role;
grant execute on function public.person_publish_revision(uuid, uuid, bigint, bigint, bigint, uuid, jsonb) to service_role;
