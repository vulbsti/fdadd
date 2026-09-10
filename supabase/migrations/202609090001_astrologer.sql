-- Astrologer agent tables: per-user birth profiles, evidence events,
-- rectification hypotheses, chat sessions/messages, and the daily tool-call quota.
-- Owner-only RLS matching the `profiles` pattern in 202608230001_auth_and_payments.sql.

create table if not exists public.astro_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  birth_date date not null,
  birth_time text not null,
  lat double precision not null,
  lng double precision not null,
  tz text not null,
  place_name text,
  time_source text not null default 'unknown',
  time_confidence text not null default 'unknown',
  chart_json jsonb,
  sensitivity_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.astro_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.astro_profiles(id) on delete cascade,
  on_date date not null,
  title text not null,
  detail text not null default '',
  chain jsonb not null default '{}',
  fit text not null default 'unassessed',
  created_at timestamptz not null default now()
);

create index if not exists astro_events_profile_date_idx
  on public.astro_events (profile_id, on_date);

create table if not exists public.astro_hypotheses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.astro_profiles(id) on delete cascade,
  hid text not null,
  claim text not null,
  predictions jsonb not null default '[]',
  tests jsonb not null default '[]',
  status text not null default 'open'
    check (status in ('open', 'confirmed', 'eliminated', 'ambiguous')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, hid)
);

create table if not exists public.astro_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.astro_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.astro_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.astro_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content text not null default '',
  tool_name text,
  tool_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists astro_messages_session_created_idx
  on public.astro_messages (session_id, created_at);

-- Daily per-user tool-call budget. The chat route check-and-increments this row.
create table if not exists public.astro_quotas (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  tool_calls integer not null default 0 check (tool_calls >= 0),
  primary key (user_id, day)
);

alter table public.astro_profiles enable row level security;
alter table public.astro_events enable row level security;
alter table public.astro_hypotheses enable row level security;
alter table public.astro_sessions enable row level security;
alter table public.astro_messages enable row level security;
alter table public.astro_quotas enable row level security;

revoke all on table public.astro_profiles from anon, authenticated;
revoke all on table public.astro_events from anon, authenticated;
revoke all on table public.astro_hypotheses from anon, authenticated;
revoke all on table public.astro_sessions from anon, authenticated;
revoke all on table public.astro_messages from anon, authenticated;
revoke all on table public.astro_quotas from anon, authenticated;

grant select, insert, update on table public.astro_profiles to authenticated;
grant select, insert, update on table public.astro_events to authenticated;
grant select, insert, update on table public.astro_hypotheses to authenticated;
grant select, insert, update on table public.astro_sessions to authenticated;
grant select, insert on table public.astro_messages to authenticated;
grant select, insert, update on table public.astro_quotas to authenticated;

-- One owner policy set per table: users touch only rows whose user_id is them.
create policy "Users manage their own astro profiles"
  on public.astro_profiles for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own astro events"
  on public.astro_events for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own astro hypotheses"
  on public.astro_hypotheses for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own astro sessions"
  on public.astro_sessions for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users read and write their own astro messages"
  on public.astro_messages for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own astro quotas"
  on public.astro_quotas for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists astro_profiles_set_updated_at on public.astro_profiles;
create trigger astro_profiles_set_updated_at
  before update on public.astro_profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists astro_hypotheses_set_updated_at on public.astro_hypotheses;
create trigger astro_hypotheses_set_updated_at
  before update on public.astro_hypotheses
  for each row execute procedure public.set_updated_at();

drop trigger if exists astro_sessions_set_updated_at on public.astro_sessions;
create trigger astro_sessions_set_updated_at
  before update on public.astro_sessions
  for each row execute procedure public.set_updated_at();
