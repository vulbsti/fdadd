-- P3 durable, source-led consolidation contracts. This is additive to P2:
-- outbox/job claiming and atomic revision publication remain authoritative.
-- Candidate/source/stage records are attempt-scoped so a reclaimed worker can
-- never reuse or overwrite receipts produced under an older fencing token.

create extension if not exists pgcrypto with schema extensions;

create table public.person_job_stage_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  job_id uuid not null,
  fence bigint not null check (fence >= 1),
  stage_key text not null,
  stage text not null check (stage in
    ('ingest','extract','match','retrieve','reconcile','compose','plan_suggestions','verify','publish','repair')),
  chunk_key text not null default 'all',
  state text not null check (state in ('started','succeeded','retryable_failure','needs_clarification','failed','skipped')),
  input_payload_id uuid,
  output_payload_id uuid,
  provider text,
  model text,
  guidance_version text,
  model_policy_version text,
  metrics jsonb not null default '{}' check (jsonb_typeof(metrics) = 'object'),
  safe_summary text check (safe_summary is null or char_length(safe_summary) <= 1000),
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint person_job_stage_receipts_job_fk foreign key (job_id,user_id,profile_id)
    references public.person_jobs(id,user_id,profile_id) on delete cascade,
  constraint person_job_stage_receipts_profile_fk foreign key (profile_id,user_id)
    references public.astro_profiles(id,user_id) on delete cascade,
  constraint person_job_stage_receipts_input_fk foreign key (input_payload_id,user_id,profile_id)
    references public.person_run_payloads(id,user_id,profile_id) on delete set null (input_payload_id),
  constraint person_job_stage_receipts_output_fk foreign key (output_payload_id,user_id,profile_id)
    references public.person_run_payloads(id,user_id,profile_id) on delete set null (output_payload_id),
  constraint person_job_stage_receipts_fence_key unique (job_id,fence,stage_key,chunk_key)
);
create index person_job_stage_receipts_history_idx
  on public.person_job_stage_receipts(job_id,fence,started_at);

create table public.person_job_source_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  job_id uuid not null,
  source_item_id uuid not null,
  source_seq bigint not null check (source_seq >= 1),
  fence bigint not null check (fence >= 1),
  outcome text not null check (outcome in ('handled','partial','excluded','retryable','needs_clarification')),
  outcome_code text,
  finding_refs jsonb not null default '[]' check (jsonb_typeof(finding_refs) = 'array'),
  created_at timestamptz not null default now(),
  constraint person_job_source_outcomes_job_fk foreign key (job_id,user_id,profile_id)
    references public.person_jobs(id,user_id,profile_id) on delete cascade,
  constraint person_job_source_outcomes_source_fk foreign key (source_item_id,user_id,profile_id)
    references public.person_source_items(id,user_id,profile_id) on delete cascade,
  constraint person_job_source_outcomes_seq_fk foreign key (profile_id,user_id,source_seq)
    references public.person_source_items(profile_id,user_id,source_seq) on delete cascade,
  constraint person_job_source_outcomes_attempt_key unique (job_id,source_item_id,fence)
);
create index person_job_source_outcomes_watermark_idx
  on public.person_job_source_outcomes(job_id,fence,source_seq,outcome);

create table public.person_consolidation_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  job_id uuid not null,
  fence bigint not null check (fence >= 1),
  base_revision bigint not null,
  privacy_epoch bigint not null check (privacy_epoch >= 0),
  mode_epoch bigint not null check (mode_epoch >= 0),
  source_from_seq bigint not null,
  source_to_seq bigint not null,
  processed_source_seq bigint not null,
  candidate_hash text not null check (candidate_hash ~ '^[0-9a-f]{64}$'),
  schema_version text not null,
  guidance_version text,
  model_policy_version text,
  provider text,
  model text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  verification_state text not null check (verification_state in ('pending','verified','rejected','published')),
  published_revision bigint,
  created_at timestamptz not null default now(),
  constraint person_consolidation_candidates_job_fk foreign key (job_id,user_id,profile_id)
    references public.person_jobs(id,user_id,profile_id) on delete cascade,
  constraint person_consolidation_candidates_profile_fk foreign key (profile_id,user_id)
    references public.astro_profiles(id,user_id) on delete cascade,
  constraint person_consolidation_candidates_attempt_key unique (job_id,fence,id),
  constraint person_consolidation_candidates_id_owner_key unique (id,user_id,profile_id),
  constraint person_consolidation_candidates_watermark_check
    check (source_from_seq >= 1 and source_to_seq >= source_from_seq
      and processed_source_seq >= source_from_seq - 1 and processed_source_seq <= source_to_seq)
);
create index person_consolidation_candidates_job_idx
  on public.person_consolidation_candidates(job_id,fence,created_at desc);

create table public.person_candidate_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  candidate_id uuid not null,
  field_path text not null check (char_length(field_path) <= 300),
  finding_code text not null check (char_length(finding_code) <= 100),
  severity text not null check (severity in ('info','warning','blocking')),
  decision text not null check (decision in ('accept','qualify','reject','clarify')),
  source_refs jsonb not null default '[]' check (jsonb_typeof(source_refs) = 'array'),
  semantic_rationale text not null check (char_length(semantic_rationale) <= 2000),
  created_at timestamptz not null default now(),
  constraint person_candidate_findings_candidate_fk foreign key(candidate_id,user_id,profile_id)
    references public.person_consolidation_candidates(id,user_id,profile_id) on delete cascade
);
create index person_candidate_findings_candidate_idx on public.person_candidate_findings(candidate_id,severity);

create table public.person_job_failure_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  job_id uuid not null,
  fence bigint not null check (fence >= 1),
  stage text not null,
  failure_kind text not null check (failure_kind in
    ('provider','quota','timeout','malformed_output','verification_exhausted','dispatch','database','unknown')),
  retryable boolean not null,
  needs_clarification boolean not null default false,
  error_code text not null check (char_length(error_code) <= 100),
  safe_message text not null check (char_length(safe_message) between 1 and 1000),
  diagnostic jsonb not null default '{}' check (jsonb_typeof(diagnostic) = 'object'),
  created_at timestamptz not null default now(),
  constraint person_job_failure_receipts_job_fk foreign key(job_id,user_id,profile_id)
    references public.person_jobs(id,user_id,profile_id) on delete cascade,
  constraint person_job_failure_receipts_profile_fk foreign key(profile_id,user_id)
    references public.astro_profiles(id,user_id) on delete cascade,
  constraint person_job_failure_receipts_attempt_key unique(job_id,fence)
);
create index person_job_failure_receipts_profile_idx
  on public.person_job_failure_receipts(profile_id,created_at desc);

-- All new public tables are closed to client roles. Access is through narrow
-- service-only SECURITY DEFINER RPCs below; RLS remains defense in depth.
alter table public.person_job_stage_receipts enable row level security;
alter table public.person_job_source_outcomes enable row level security;
alter table public.person_consolidation_candidates enable row level security;
alter table public.person_candidate_findings enable row level security;
alter table public.person_job_failure_receipts enable row level security;
revoke all on public.person_job_stage_receipts, public.person_job_source_outcomes,
  public.person_consolidation_candidates, public.person_candidate_findings,
  public.person_job_failure_receipts from public, anon, authenticated, service_role;
create policy person_job_failure_receipts_owner_read on public.person_job_failure_receipts
  for select to authenticated using ((select auth.uid())=user_id);
grant select (id,user_id,profile_id,job_id,fence,stage,failure_kind,retryable,needs_clarification,error_code,safe_message,created_at)
  on public.person_job_failure_receipts to authenticated;
grant select on public.person_job_stage_receipts, public.person_job_source_outcomes,
  public.person_consolidation_candidates, public.person_candidate_findings,
  public.person_job_failure_receipts to service_role;

create or replace function public.person_record_stage_receipt(
  p_job_id uuid,p_lease_token uuid,p_fence bigint,p_stage_key text,p_stage text,p_chunk_key text,
  p_state text,p_input_payload_id uuid,p_output_payload_id uuid,p_provider text,p_model text,
  p_guidance_version text,p_model_policy_version text,p_metrics jsonb,p_safe_summary text,p_error_code text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_job public.person_jobs%rowtype; v_id uuid;
begin
  select * into v_job from public.person_jobs where id=p_job_id for update;
  if not found or v_job.state not in ('leased','running') or v_job.lease_token is distinct from p_lease_token
    or v_job.fence is distinct from p_fence or v_job.lease_expires_at is null or v_job.lease_expires_at<=now() then
    raise exception 'job lease fence is stale' using errcode='PJF01';
  end if;
  if p_stage_key is null or p_stage_key='' or p_chunk_key is null or p_chunk_key=''
    or p_metrics is null or jsonb_typeof(p_metrics)<>'object' then
    raise exception 'invalid stage receipt' using errcode='22023';
  end if;
  insert into public.person_job_stage_receipts(user_id,profile_id,job_id,fence,stage_key,stage,chunk_key,state,
    input_payload_id,output_payload_id,provider,model,guidance_version,model_policy_version,metrics,safe_summary,error_code,completed_at)
  values(v_job.user_id,v_job.profile_id,p_job_id,p_fence,p_stage_key,p_stage,p_chunk_key,p_state,
    p_input_payload_id,p_output_payload_id,p_provider,p_model,p_guidance_version,p_model_policy_version,
    p_metrics,p_safe_summary,p_error_code,case when p_state='started' then null else now() end)
  on conflict(job_id,fence,stage_key,chunk_key) do update set
    state=excluded.state,input_payload_id=excluded.input_payload_id,output_payload_id=excluded.output_payload_id,
    provider=excluded.provider,model=excluded.model,guidance_version=excluded.guidance_version,
    model_policy_version=excluded.model_policy_version,metrics=excluded.metrics,
    safe_summary=excluded.safe_summary,error_code=excluded.error_code,
    completed_at=excluded.completed_at
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.person_record_source_outcomes(
  p_job_id uuid,p_lease_token uuid,p_fence bigint,p_outcomes jsonb
)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_job public.person_jobs%rowtype; v_item jsonb; v_source public.person_source_items%rowtype; v_n integer:=0;
begin
  select * into v_job from public.person_jobs where id=p_job_id for update;
  if not found or v_job.state not in ('leased','running') or v_job.lease_token is distinct from p_lease_token
    or v_job.fence is distinct from p_fence or v_job.lease_expires_at is null or v_job.lease_expires_at<=now() then
    raise exception 'job lease fence is stale' using errcode='PJF01';
  end if;
  if p_outcomes is null or jsonb_typeof(p_outcomes)<>'array' or jsonb_array_length(p_outcomes)>500 then
    raise exception 'outcomes must be a bounded array' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_outcomes) loop
    select * into v_source from public.person_source_items s where s.id=(v_item->>'sourceId')::uuid
      and s.user_id=v_job.user_id and s.profile_id=v_job.profile_id
      and s.source_seq between v_job.source_from_seq and v_job.source_to_seq;
    if not found then raise exception 'source is outside job range' using errcode='PSQ01'; end if;
    if (v_item->>'outcome') not in ('handled','partial','excluded','retryable','needs_clarification') then
      raise exception 'invalid source outcome' using errcode='22023';
    end if;
    if (v_item->>'outcome')='excluded' and v_source.inclusion_status not in ('excluded','retracted') then
      raise exception 'excluded outcome requires excluded or retracted source' using errcode='PSQ01';
    elsif (v_item->>'outcome')<>'excluded' and v_source.inclusion_status<>'included' then
      raise exception 'ineligible source cannot be consolidated' using errcode='PSQ01';
    end if;
    insert into public.person_job_source_outcomes(user_id,profile_id,job_id,source_item_id,source_seq,fence,outcome,outcome_code,finding_refs)
    values(v_job.user_id,v_job.profile_id,p_job_id,v_source.id,v_source.source_seq,p_fence,v_item->>'outcome',
      nullif(v_item->>'outcomeCode',''),coalesce(v_item->'findingRefs','[]'::jsonb))
    on conflict(job_id,source_item_id,fence) do update set outcome=excluded.outcome,
      outcome_code=excluded.outcome_code,finding_refs=excluded.finding_refs,created_at=now();
    v_n:=v_n+1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.person_stage_consolidation_candidate(
  p_job_id uuid,p_lease_token uuid,p_fence bigint,p_candidate jsonb,p_findings jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_job public.person_jobs%rowtype; v_head public.person_model_heads%rowtype; v_candidate_id uuid;
  v_finding jsonb; v_hash text; v_watermark bigint; v_privacy bigint; v_mode bigint;
begin
  select * into v_job from public.person_jobs where id=p_job_id for update;
  if not found or v_job.state not in ('leased','running') or v_job.lease_token is distinct from p_lease_token
    or v_job.fence is distinct from p_fence or v_job.lease_expires_at is null or v_job.lease_expires_at<=now() then
    raise exception 'job lease fence is stale' using errcode='PJF01';
  end if;
  select * into v_head from public.person_model_heads h where h.profile_id=v_job.profile_id and h.user_id=v_job.user_id;
  if p_candidate is null or jsonb_typeof(p_candidate)<>'object' or p_findings is null
    or jsonb_typeof(p_findings)<>'array' or jsonb_array_length(p_findings)>500 then
    raise exception 'invalid candidate or findings' using errcode='22023';
  end if;
  v_privacy:=coalesce((p_candidate->>'privacyEpoch')::bigint,v_job.privacy_epoch);
  v_mode:=coalesce((p_candidate->>'modeEpoch')::bigint,v_job.mode_epoch);
  v_watermark:=coalesce((p_candidate->>'processedSourceSeq')::bigint,-1);
  if v_job.base_revision<>v_head.current_revision or v_job.privacy_epoch<>v_head.privacy_epoch
    or v_job.mode_epoch<>v_head.mode_epoch or v_privacy<>v_job.privacy_epoch or v_mode<>v_job.mode_epoch then
    raise exception 'candidate freshness tuple is stale' using errcode='PST01';
  end if;
  if v_watermark<v_head.processed_source_seq or v_watermark>v_job.source_to_seq
    or v_watermark<v_job.source_from_seq-1 then
    raise exception 'candidate watermark is outside its job range' using errcode='PSQ01';
  end if;
  v_hash:=encode(extensions.digest(convert_to(p_candidate::text,'UTF8'),'sha256'),'hex');
  insert into public.person_consolidation_candidates(user_id,profile_id,job_id,fence,base_revision,privacy_epoch,mode_epoch,
    source_from_seq,source_to_seq,processed_source_seq,candidate_hash,schema_version,guidance_version,model_policy_version,
    provider,model,payload,verification_state)
  values(v_job.user_id,v_job.profile_id,p_job_id,p_fence,v_job.base_revision,v_privacy,v_mode,v_job.source_from_seq,
    v_job.source_to_seq,v_watermark,v_hash,coalesce(p_candidate->>'schemaVersion','person-v3-p3'),
    p_candidate->>'guidanceVersion',p_candidate->>'modelPolicyVersion',p_candidate->>'provider',p_candidate->>'model',
    p_candidate,'pending') returning id into v_candidate_id;
  for v_finding in select value from jsonb_array_elements(p_findings) loop
    if coalesce(v_finding->>'fieldPath','')='' or coalesce(v_finding->>'code','')=''
      or coalesce(v_finding->>'severity','') not in ('info','warning','blocking')
      or coalesce(v_finding->>'decision','') not in ('accept','qualify','reject','clarify')
      or coalesce(v_finding->>'rationale','')='' then
      raise exception 'invalid typed verifier finding' using errcode='22023';
    end if;
    insert into public.person_candidate_findings(user_id,profile_id,candidate_id,field_path,finding_code,severity,decision,source_refs,semantic_rationale)
    values(v_job.user_id,v_job.profile_id,v_candidate_id,v_finding->>'fieldPath',v_finding->>'code',v_finding->>'severity',
      v_finding->>'decision',coalesce(v_finding->'sourceRefs','[]'::jsonb),v_finding->>'rationale');
  end loop;
  update public.person_consolidation_candidates c set verification_state=
    case when exists(select 1 from public.person_candidate_findings f where f.candidate_id=c.id and f.severity='blocking')
      then 'rejected' else 'verified' end
  where c.id=v_candidate_id;
  return v_candidate_id;
end;
$$;

create or replace function public.person_renew_job_lease(p_job_id uuid,p_lease_token uuid,p_fence bigint,p_lease_seconds integer default 180)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_expiry timestamptz;
begin
  update public.person_jobs set lease_expires_at=now()+make_interval(secs=>least(greatest(coalesce(p_lease_seconds,180),30),600)),
    state='running',updated_at=now()
  where id=p_job_id and state in ('leased','running') and lease_token=p_lease_token and fence=p_fence and lease_expires_at>now()
  returning lease_expires_at into v_expiry;
  if v_expiry is null then raise exception 'job lease fence is stale' using errcode='PJF01'; end if;
  return v_expiry;
end;
$$;

create or replace function public.person_fail_or_retry_job(
  p_job_id uuid,p_lease_token uuid,p_fence bigint,p_stage text,p_failure_kind text,
  p_retryable boolean,p_needs_clarification boolean,p_error_code text,p_safe_message text,p_diagnostic jsonb default '{}'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.person_jobs%rowtype; v_terminal boolean; v_next text;
begin
  select * into v_job from public.person_jobs where id=p_job_id for update;
  if not found or v_job.state not in ('leased','running') or v_job.lease_token is distinct from p_lease_token
    or v_job.fence is distinct from p_fence or v_job.lease_expires_at is null or v_job.lease_expires_at<=now() then
    raise exception 'job lease fence is stale' using errcode='PJF01';
  end if;
  v_terminal:=not p_retryable or v_job.attempt_count>=v_job.max_attempts;
  insert into public.person_job_failure_receipts(user_id,profile_id,job_id,fence,stage,failure_kind,retryable,
    needs_clarification,error_code,safe_message,diagnostic)
  values(v_job.user_id,v_job.profile_id,p_job_id,p_fence,p_stage,p_failure_kind,p_retryable,
    p_needs_clarification,p_error_code,p_safe_message,coalesce(p_diagnostic,'{}'::jsonb));
  v_next:=case when v_terminal then 'failed' else 'pending' end;
  update public.person_jobs set state=v_next,lease_token=null,lease_expires_at=null,
    fence=fence+1,
    last_error_code=p_error_code,completed_at=case when v_terminal then now() else null end,
    available_at=case when v_terminal then available_at else now()+make_interval(secs=>least(300,power(2,least(attempt_count,8))::integer)) end,
    updated_at=now() where id=p_job_id;
  if v_terminal then
    insert into public.person_outbox(user_id,profile_id,job_id,event_type,event_payload)
    values(v_job.user_id,v_job.profile_id,p_job_id,'person.job.failed',jsonb_build_object(
      'jobId',p_job_id,'stage',p_stage,'errorCode',p_error_code,'needsClarification',p_needs_clarification))
    on conflict(job_id,event_type) do nothing;
  end if;
  update public.person_model_heads h set publication_state=
    case when exists(select 1 from public.person_jobs j where j.profile_id=h.profile_id and j.user_id=h.user_id
      and j.id<>p_job_id and j.state in ('pending','leased','running')) then 'stale' else 'blocked' end,
    updated_at=now()
  where h.profile_id=v_job.profile_id and h.user_id=v_job.user_id and v_terminal;
  return jsonb_build_object('jobId',p_job_id,'state',v_next,'terminal',v_terminal,
    'needsClarification',p_needs_clarification,'attempt',v_job.attempt_count,'maxAttempts',v_job.max_attempts);
end;
$$;

-- Atomic trusted write boundary: materialize the already verified candidate's
-- observations and typed graph, then delegate membership/head swap to P2's
-- single publisher in the same transaction. Any invalid row rolls everything back.
create or replace function public.person_publish_staged_candidate(
  p_job_id uuid,p_lease_token uuid,p_fence bigint,p_candidate_id uuid,p_commit_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.person_jobs%rowtype; v_c public.person_consolidation_candidates%rowtype;
  v_item jsonb; v_source public.person_source_items%rowtype; v_object_id uuid; v_version_id uuid;
  v_relation_id uuid; v_relation_version_id uuid; v_pub jsonb; v_watermark bigint; v_expected bigint;
begin
  select * into v_job from public.person_jobs where id=p_job_id for update;
  if not found or v_job.state not in ('leased','running') or v_job.lease_token is distinct from p_lease_token
    or v_job.fence is distinct from p_fence or v_job.lease_expires_at is null or v_job.lease_expires_at<=now() then
    raise exception 'job lease fence is stale' using errcode='PJF01';
  end if;
  select * into v_c from public.person_consolidation_candidates c where c.id=p_candidate_id
    and c.job_id=p_job_id and c.user_id=v_job.user_id and c.profile_id=v_job.profile_id and c.fence=p_fence for update;
  if not found or v_c.verification_state<>'verified' then
    raise exception 'candidate is missing, stale, or not verified' using errcode='PCV01';
  end if;
  if v_c.candidate_hash<>encode(extensions.digest(convert_to(v_c.payload::text,'UTF8'),'sha256'),'hex') then
    raise exception 'candidate payload hash mismatch' using errcode='PCV02';
  end if;
  if v_c.base_revision<>v_job.base_revision or v_c.privacy_epoch<>v_job.privacy_epoch or v_c.mode_epoch<>v_job.mode_epoch then
    raise exception 'candidate freshness tuple mismatch' using errcode='PST01';
  end if;
  v_expected:=v_c.processed_source_seq;
  select coalesce(min(s.source_seq)-1,v_job.source_to_seq) into v_watermark
  from public.person_source_items s
  left join public.person_job_source_outcomes o on o.job_id=p_job_id and o.source_item_id=s.id and o.fence=p_fence
  where s.user_id=v_job.user_id and s.profile_id=v_job.profile_id
    and s.source_seq between greatest(v_job.source_from_seq,(select h.processed_source_seq+1 from public.person_model_heads h where h.profile_id=v_job.profile_id)) and v_job.source_to_seq
    and (o.id is null or o.outcome in ('retryable','needs_clarification'));
  if v_watermark is null then v_watermark:=v_job.source_to_seq; end if;
  if v_expected>v_watermark then raise exception 'candidate watermark crosses unhandled source' using errcode='PSQ01'; end if;
  -- Every seq through the candidate watermark has a terminal outcome on this fence.
  if exists(select 1 from public.person_source_items s left join public.person_job_source_outcomes o
      on o.job_id=p_job_id and o.source_item_id=s.id and o.fence=p_fence
    where s.user_id=v_job.user_id and s.profile_id=v_job.profile_id
      and s.source_seq between greatest(v_job.source_from_seq,(select h.processed_source_seq+1 from public.person_model_heads h where h.profile_id=v_job.profile_id)) and v_expected
      and (o.id is null or o.outcome not in ('handled','partial','excluded'))) then
    raise exception 'source watermark is not contiguous and fully handled' using errcode='PSQ01';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(v_c.payload->'observations','[]'::jsonb)) loop
    select * into v_source from public.person_source_items s where s.id=(v_item->>'sourceId')::uuid
      and s.user_id=v_job.user_id and s.profile_id=v_job.profile_id
      and s.source_seq between v_job.source_from_seq and v_expected and s.inclusion_status='included';
    if not found then raise exception 'observation source is not eligible' using errcode='PSQ01'; end if;
    insert into public.person_observations(id,user_id,profile_id,source_item_id,source_seq,span_start,span_end,exact_quote,
      normalized_assertion,subject_kind,subject_label,domain,assertion_type,occurred_from,occurred_to,time_precision,
      extraction_version,verifier_version,status,job_id,idempotency_key,subject_profile_id,event_time,extractor_version)
    values(coalesce(nullif(v_item->>'observationId','')::uuid,gen_random_uuid()),v_job.user_id,v_job.profile_id,v_source.id,v_source.source_seq,nullif(v_item->>'spanStart','')::integer,
      nullif(v_item->>'spanEnd','')::integer,nullif(v_item->>'exactQuote',''),coalesce(v_item->'normalizedAssertion','{}'::jsonb),
      coalesce(v_item->>'subjectKind','unknown'),nullif(v_item->>'subjectLabel',''),coalesce(v_item->>'domain',''),
      coalesce(v_item->>'assertionType','unknown'),nullif(v_item->>'occurredFrom','')::timestamptz,
      nullif(v_item->>'occurredTo','')::timestamptz,coalesce(v_item->>'timePrecision','unknown'),
      v_c.schema_version,v_c.schema_version,'verified',p_job_id,md5(v_item::text),
      nullif(v_item->>'subjectPersonId','')::uuid,coalesce(v_item->'eventTime','{}'::jsonb),v_c.schema_version)
    on conflict(job_id,idempotency_key) where job_id is not null do nothing;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(v_c.payload->'objects','[]'::jsonb)) loop
    v_object_id:=(v_item->>'objectId')::uuid; v_version_id:=(v_item->>'versionId')::uuid;
    insert into public.person_objects(id,user_id,profile_id,kind,lifecycle)
    values(v_object_id,v_job.user_id,v_job.profile_id,v_item->>'kind',coalesce(v_item->>'lifecycle','active'))
    on conflict(id) do nothing;
    insert into public.person_object_versions(id,user_id,profile_id,object_id,version_no,epistemic_class,lifecycle,
      typed_payload,effective_from,effective_to,time_precision)
    values(v_version_id,v_job.user_id,v_job.profile_id,v_object_id,(v_item->>'versionNo')::integer,
      v_item->>'epistemicClass',coalesce(v_item->>'lifecycle','active'),coalesce(v_item->'typedPayload','{}'::jsonb),
      nullif(v_item->>'effectiveFrom','')::timestamptz,nullif(v_item->>'effectiveTo','')::timestamptz,
      coalesce(v_item->>'timePrecision','unknown')) on conflict(id) do nothing;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(v_c.payload->'objectSupport','[]'::jsonb)) loop
    insert into public.person_object_version_support(user_id,profile_id,object_version_id,source_item_id,observation_id,relation,note,weight)
    values(v_job.user_id,v_job.profile_id,(v_item->>'versionId')::uuid,nullif(v_item->>'sourceId','')::uuid,
      nullif(v_item->>'observationId','')::uuid,v_item->>'relation',v_item->>'note',nullif(v_item->>'weight','')::numeric)
    on conflict do nothing;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(v_c.payload->'relations','[]'::jsonb)) loop
    v_relation_id:=(v_item->>'relationId')::uuid; v_relation_version_id:=(v_item->>'versionId')::uuid;
    insert into public.person_relations(id,user_id,profile_id,from_object_id,to_object_id,relation_kind,lifecycle)
    values(v_relation_id,v_job.user_id,v_job.profile_id,(v_item->>'fromObjectId')::uuid,(v_item->>'toObjectId')::uuid,
      v_item->>'relationKind',coalesce(v_item->>'lifecycle','active')) on conflict(id) do nothing;
    insert into public.person_relation_versions(id,user_id,profile_id,relation_id,version_no,epistemic_class,lifecycle,typed_payload)
    values(v_relation_version_id,v_job.user_id,v_job.profile_id,v_relation_id,(v_item->>'versionNo')::integer,
      v_item->>'epistemicClass',coalesce(v_item->>'lifecycle','active'),coalesce(v_item->'typedPayload','{}'::jsonb))
    on conflict(id) do nothing;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(v_c.payload->'relationSupport','[]'::jsonb)) loop
    insert into public.person_relation_version_support(user_id,profile_id,relation_version_id,source_item_id,observation_id,relation)
    values(v_job.user_id,v_job.profile_id,(v_item->>'versionId')::uuid,nullif(v_item->>'sourceId','')::uuid,
      nullif(v_item->>'observationId','')::uuid,v_item->>'relation') on conflict do nothing;
  end loop;
  v_pub:=coalesce(v_c.payload->'publication','{}'::jsonb)||jsonb_build_object('processedSourceSeq',v_expected,
    'schemaVersion',v_c.schema_version,'guidanceVersion',v_c.guidance_version,'modelPolicyVersion',v_c.model_policy_version);
  v_pub:=public.person_publish_revision(p_job_id,p_lease_token,p_fence,v_c.base_revision,v_c.privacy_epoch,p_commit_id,v_pub);
  update public.person_consolidation_candidates set verification_state='published',
    published_revision=(v_pub->>'revision')::bigint where id=p_candidate_id;
  return v_pub;
end;
$$;

-- Every new revision must match the current mode tuple. If a preference
-- mutation races publication, the preference/head transaction wins one side;
-- projection freshness checks still fail closed during the transition.
create or replace function public.person_revision_mode_fence()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_head public.person_model_heads%rowtype; v_mode bigint;
begin
  select * into v_head from public.person_model_heads h where h.profile_id=new.profile_id and h.user_id=new.user_id;
  select p.mode_epoch into v_mode from public.person_preferences p where p.profile_id=new.profile_id and p.user_id=new.user_id;
  if v_head.profile_id is null and new.parent_revision is null and new.revision_no=1
    and new.commit_request->>'kind'='empty_new_person_baseline' and new.mode_epoch=0 and new.privacy_epoch=0 and v_mode=0 then
    return new;
  end if;
  if v_head.profile_id is null or v_mode is null or new.mode_epoch is distinct from v_head.mode_epoch or new.mode_epoch is distinct from v_mode
    or new.privacy_epoch is distinct from v_head.privacy_epoch then
    raise exception 'revision mode or privacy epoch is stale' using errcode='PST02';
  end if;
  return new;
end;
$$;
create trigger person_revision_mode_fence_before_insert before insert on public.person_model_revisions
for each row execute function public.person_revision_mode_fence();

create or replace function public.person_mark_model_stale_on_source()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.person_model_heads set publication_state='stale',updated_at=now()
  where profile_id=new.profile_id and user_id=new.user_id and publication_state<>'deleting';
  return new;
end;
$$;
create trigger person_source_marks_model_stale after insert on public.person_source_items
for each row execute function public.person_mark_model_stale_on_source();

-- Explicit subject_kind preservation for intermediate extraction writes.
create or replace function public.person_record_observations(
  p_job_id uuid,p_lease_token uuid,p_fence bigint,p_observations jsonb
)
returns setof public.person_observations language plpgsql security definer set search_path = '' as $$
declare v_job public.person_jobs%rowtype; v_item jsonb; v_source public.person_source_items%rowtype;
  v_result public.person_observations%rowtype; v_key text; v_precision text; v_start timestamptz; v_end timestamptz;
  v_subject text; v_assertion text;
begin
  if p_observations is null or jsonb_typeof(p_observations)<>'array' or jsonb_array_length(p_observations)<1 or jsonb_array_length(p_observations)>500 then
    raise exception 'observations must be a bounded non-empty array' using errcode='22023';
  end if;
  select * into v_job from public.person_jobs where id=p_job_id for update;
  if not found or v_job.state not in ('leased','running') or v_job.lease_token is distinct from p_lease_token
    or v_job.fence is distinct from p_fence or v_job.lease_expires_at is null or v_job.lease_expires_at<=now() then
    raise exception 'job lease fence is stale' using errcode='PJF01';
  end if;
  for v_item in select value from jsonb_array_elements(p_observations) loop
    select * into v_source from public.person_source_items s where s.id=(v_item->>'sourceId')::uuid
      and s.user_id=v_job.user_id and s.profile_id=v_job.profile_id and s.source_seq between v_job.source_from_seq and v_job.source_to_seq;
    if not found or v_source.inclusion_status<>'included' then raise exception 'observation source is outside eligible job range' using errcode='PSQ01'; end if;
    v_subject:=coalesce(v_item->>'subjectKind','unknown');
    if v_subject not in ('self','other','hypothetical','unknown') then raise exception 'invalid subject attribution' using errcode='22023'; end if;
    v_assertion:=coalesce(v_item->>'assertionType','unknown');
    if v_assertion='question' then v_assertion:='unknown'; elsif v_assertion='correction' then v_assertion:='direct'; end if;
    v_key:=md5(v_item::text); v_precision:=coalesce(v_item->'eventTime'->>'precision','unknown');
    v_start:=nullif(v_item->'eventTime'->>'start','')::timestamptz; v_end:=nullif(v_item->'eventTime'->>'end','')::timestamptz;
    insert into public.person_observations(user_id,profile_id,source_item_id,source_seq,span_start,span_end,exact_quote,
      normalized_assertion,subject_kind,subject_label,domain,assertion_type,occurred_from,occurred_to,time_precision,
      extraction_version,verifier_version,status,job_id,idempotency_key,subject_profile_id,event_time,extractor_version)
    values(v_job.user_id,v_job.profile_id,v_source.id,v_source.source_seq,nullif(v_item->>'spanStart','')::integer,
      nullif(v_item->>'spanEnd','')::integer,nullif(v_item->>'exactQuote',''),
      coalesce(v_item->'normalizedAssertion',jsonb_build_object('text',v_item->>'normalizedAssertion')),
      v_subject,nullif(v_item->>'subjectLabel',''),coalesce(v_item->>'domain',''),v_assertion,v_start,v_end,v_precision,
      v_item->>'extractorVersion',v_item->>'verifierVersion','proposed',p_job_id,v_key,
      nullif(v_item->>'subjectPersonId','')::uuid,coalesce(v_item->'eventTime','{}'::jsonb),v_item->>'extractorVersion')
    on conflict(job_id,idempotency_key) where job_id is not null do nothing;
    select * into v_result from public.person_observations where job_id=p_job_id and idempotency_key=v_key;
    return next v_result;
  end loop;
  return;
end;
$$;

-- Service role gets no direct mutation path for staged facts; writes above and
-- existing publication/observation APIs are the only accepted boundary.
revoke insert,update,delete,truncate,references,trigger on public.person_objects,
  public.person_object_versions,public.person_object_version_support,public.person_relations,
  public.person_relation_versions,public.person_relation_version_support,public.person_observations,
  public.person_job_stage_receipts,public.person_job_source_outcomes,public.person_consolidation_candidates,
  public.person_candidate_findings,public.person_job_failure_receipts from service_role;
grant select on public.person_objects,public.person_object_versions,public.person_object_version_support,
  public.person_relations,public.person_relation_versions,public.person_relation_version_support,
  public.person_observations to service_role;

revoke all on function public.person_record_stage_receipt(uuid,uuid,bigint,text,text,text,text,uuid,uuid,text,text,text,text,jsonb,text,text),
  public.person_record_source_outcomes(uuid,uuid,bigint,jsonb),
  public.person_stage_consolidation_candidate(uuid,uuid,bigint,jsonb,jsonb),
  public.person_renew_job_lease(uuid,uuid,bigint,integer),
  public.person_fail_or_retry_job(uuid,uuid,bigint,text,text,boolean,boolean,text,text,jsonb),
  public.person_publish_staged_candidate(uuid,uuid,bigint,uuid,uuid),
  public.person_revision_mode_fence(),
  public.person_record_observations(uuid,uuid,bigint,jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.person_record_stage_receipt(uuid,uuid,bigint,text,text,text,text,uuid,uuid,text,text,text,text,jsonb,text,text),
  public.person_record_source_outcomes(uuid,uuid,bigint,jsonb),
  public.person_stage_consolidation_candidate(uuid,uuid,bigint,jsonb,jsonb),
  public.person_renew_job_lease(uuid,uuid,bigint,integer),
  public.person_fail_or_retry_job(uuid,uuid,bigint,text,text,boolean,boolean,text,text,jsonb),
  public.person_publish_staged_candidate(uuid,uuid,bigint,uuid,uuid),
  public.person_record_observations(uuid,uuid,bigint,jsonb)
to service_role;

-- Current-revision evidence drawer. The security-invoker function relies on
-- existing owner RLS; only verified direct user-authored spans become quotes.
create or replace function public.person_read_object_sources(p_profile_id uuid,p_object_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('profileId',h.profile_id,'objectId',o.id,'revision',h.current_revision,
    'sources',coalesce(jsonb_agg(jsonb_build_object(
      'supportId',s.id,'observationId',obs.id,
      'sourceId',si.id,'sourceSeq',si.source_seq,'sourceTime',si.source_time,'speakerRole',si.speaker_role,
      'subjectKind',coalesce(obs.subject_kind,si.subject_kind),'subjectLabel',coalesce(obs.subject_label,si.subject_label),
      'assertionType',obs.assertion_type,'epistemicClass',ov.epistemic_class,
      'supportRelation',s.relation,'spanStart',obs.span_start,'spanEnd',obs.span_end,
      'quote',case when obs.status='verified' and obs.assertion_type='direct' and si.speaker_role='user'
        then obs.exact_quote else null end
    ) order by si.source_seq) filter (where si.id is not null),'[]'::jsonb))
  from public.person_model_heads h
  join public.person_revision_objects ro on ro.profile_id=h.profile_id and ro.user_id=h.user_id
    and ro.revision_no=h.current_revision and ro.object_id=p_object_id
  join public.person_objects o on o.id=ro.object_id and o.user_id=ro.user_id and o.profile_id=ro.profile_id
  join public.person_object_versions ov on ov.id=ro.object_version_id and ov.object_id=o.id
    and ov.user_id=o.user_id and ov.profile_id=o.profile_id
  left join public.person_object_version_support s on s.object_version_id=ov.id and s.user_id=ov.user_id and s.profile_id=ov.profile_id
  left join public.person_observations obs on obs.id=s.observation_id and obs.user_id=s.user_id and obs.profile_id=s.profile_id
  left join public.person_source_items si on si.id=coalesce(s.source_item_id,obs.source_item_id)
    and si.user_id=s.user_id and si.profile_id=s.profile_id
  where h.profile_id=p_profile_id and h.user_id=(select auth.uid())
    and exists(select 1 from public.person_preferences pref where pref.profile_id=h.profile_id
      and pref.user_id=h.user_id and pref.mode_epoch=h.mode_epoch)
    and exists(select 1 from public.person_model_revisions r where r.profile_id=h.profile_id and r.user_id=h.user_id
      and r.revision_no=h.current_revision and r.mode_epoch=h.mode_epoch and r.privacy_epoch=h.privacy_epoch)
  group by h.profile_id,o.id,h.current_revision
$$;
revoke all on function public.person_read_object_sources(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.person_read_object_sources(uuid,uuid) to authenticated;
