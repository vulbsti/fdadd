-- One-time handoffs from the native app to the web (connecting Notion or
-- Google from the app, and the Drive picker page), and reports of AI replies.

-- Only a sha256 of each token is stored. A ticket names one user, one person
-- and one purpose, expires within minutes and is deleted when it is used.
-- Server-only: the app and the browser never read this table.
create table if not exists public.app_handoff_tickets (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  kind text not null
    check (kind in ('oauth_notion', 'oauth_google', 'google_picker', 'google_picker_session')),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint app_handoff_tickets_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade
);

create index if not exists app_handoff_tickets_user_expiry_idx
  on public.app_handoff_tickets (user_id, expires_at);

alter table public.app_handoff_tickets enable row level security;
revoke all on table public.app_handoff_tickets from anon, authenticated;
grant all privileges on table public.app_handoff_tickets to service_role;

-- A person flags an AI reply as wrong, harmful or offensive (Google Play's
-- AI-generated content policy). People can file reports about their own
-- conversations but cannot read reports back; the team reads them with the
-- service role.
create table if not exists public.ai_reply_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid,
  message_id uuid,
  run_id uuid,
  reason text not null check (reason in ('wrong', 'harmful', 'offensive', 'other')),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  constraint ai_reply_reports_target_check
    check (session_id is not null or message_id is not null or run_id is not null)
);

create index if not exists ai_reply_reports_user_created_idx
  on public.ai_reply_reports (user_id, created_at desc);
create index if not exists ai_reply_reports_created_idx
  on public.ai_reply_reports (created_at desc);

alter table public.ai_reply_reports enable row level security;

revoke all on table public.ai_reply_reports from anon, authenticated;
grant insert on table public.ai_reply_reports to authenticated;
grant all privileges on table public.ai_reply_reports to service_role;

drop policy if exists "Users can report replies in their own conversations" on public.ai_reply_reports;
create policy "Users can report replies in their own conversations"
  on public.ai_reply_reports for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- No client select, update or delete policies exist for ai_reply_reports.
