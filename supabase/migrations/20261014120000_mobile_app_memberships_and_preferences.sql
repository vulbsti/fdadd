-- Memberships and per-person app settings for the native Aidoraa app.
-- One current membership row per person. Google Play (and later other
-- sources) write it through the server with the service role only; the owner
-- can read their own row. No row means the Free plan.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('free', 'basic', 'plus', 'pro')),
  status text not null
    check (status in ('active', 'in_grace', 'on_hold', 'paused', 'canceled', 'expired')),
  source text not null check (source in ('google_play', 'razorpay', 'manual')),
  current_period_end timestamptz,
  auto_renewing boolean not null default false,
  google_purchase_token text unique check (google_purchase_token is null or char_length(google_purchase_token) <= 4096),
  google_order_id text check (google_order_id is null or char_length(google_order_id) <= 200),
  -- Latest purchase state as the store reported it, for support and audits.
  raw_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

revoke all on table public.subscriptions from anon, authenticated;
grant select on table public.subscriptions to authenticated;
grant all privileges on table public.subscriptions to service_role;

drop policy if exists "Users can view their own subscription" on public.subscriptions;
create policy "Users can view their own subscription"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No client write policies exist for subscriptions. Only server routes using
-- the service-role key may create or update membership records.

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_updated_at();

-- Per-person settings for the app, starting with the home screen layout:
-- an array of {"id": <panel>, "size": "half" | "full"}, or null for the default.
create table if not exists public.app_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  home_layout jsonb check (home_layout is null or jsonb_typeof(home_layout) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_preferences enable row level security;

revoke all on table public.app_preferences from anon, authenticated;
grant select, insert, update on table public.app_preferences to authenticated;
grant all privileges on table public.app_preferences to service_role;

drop policy if exists "Users can view their own app preferences" on public.app_preferences;
create policy "Users can view their own app preferences"
  on public.app_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own app preferences" on public.app_preferences;
create policy "Users can insert their own app preferences"
  on public.app_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own app preferences" on public.app_preferences;
create policy "Users can update their own app preferences"
  on public.app_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists app_preferences_set_updated_at on public.app_preferences;
create trigger app_preferences_set_updated_at
  before update on public.app_preferences
  for each row execute procedure public.set_updated_at();

-- Monthly question counts read the person's own chat turns.
create index if not exists astro_messages_user_turns_created_idx
  on public.astro_messages (user_id, created_at)
  where role = 'user';

-- Account deletion removes the person's rows and auth user at once. Files in
-- object storage (Supabase Storage and the edge R2 store) and the Google Play
-- renewal are cleaned up in the same request; any step that fails is listed
-- here so it can be retried. The id refers to a user that no longer exists and
-- the row holds no personal data. Server-only.
create table if not exists public.account_deletion_cleanups (
  user_id uuid primary key,
  pending text[] not null default '{}',
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_deletion_cleanups enable row level security;
revoke all on table public.account_deletion_cleanups from anon, authenticated;
grant all privileges on table public.account_deletion_cleanups to service_role;

drop trigger if exists account_deletion_cleanups_set_updated_at on public.account_deletion_cleanups;
create trigger account_deletion_cleanups_set_updated_at
  before update on public.account_deletion_cleanups
  for each row execute procedure public.set_updated_at();
