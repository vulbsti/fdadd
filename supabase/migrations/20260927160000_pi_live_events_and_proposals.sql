-- Live Pi run events (text deltas and tool lifecycle) written by the broker
-- while a run is active, so the Workflow can stream them without downloading
-- checkpoint archives. Service-role only, like pi_workspace_checkpoints.
create table public.pi_run_events (
  run_id uuid not null references public.astro_agent_runs(id) on delete cascade,
  seq bigint not null check (seq > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.astro_profiles(id) on delete cascade,
  kind text not null check (kind in ('text_delta', 'tool_start', 'tool_end', 'exit')),
  segment integer not null default 0 check (segment >= 0),
  tool_name text check (tool_name is null or tool_name ~ '^[a-z_]{1,80}$'),
  tool_call_id text check (tool_call_id is null or length(tool_call_id) <= 200),
  is_error boolean not null default false,
  text text check (text is null or length(text) <= 16000),
  created_at timestamptz not null default now(),
  primary key (run_id, seq)
);
alter table public.pi_run_events enable row level security;
revoke all on public.pi_run_events from anon, authenticated;
grant all on public.pi_run_events to service_role;

-- Memory proposals written by Pi under proposals/. They are candidates only:
-- nothing here changes the accepted person model until consolidation or the
-- owner accepts it.
create table public.pi_memory_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.astro_agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.astro_profiles(id) on delete cascade,
  path text not null check (path ~ '^proposals/' and length(path) <= 500),
  digest text not null check (digest ~ '^[a-f0-9]{64}$'),
  content text not null,
  source_ids uuid[] not null default '{}',
  unknown_source_refs text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (profile_id, digest)
);
create index pi_memory_proposals_pending_idx on public.pi_memory_proposals (profile_id, created_at) where status = 'pending';
alter table public.pi_memory_proposals enable row level security;
revoke all on public.pi_memory_proposals from anon, authenticated;
grant all on public.pi_memory_proposals to service_role;
create policy pi_memory_proposals_owner_read on public.pi_memory_proposals
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.pi_memory_proposals to authenticated;
