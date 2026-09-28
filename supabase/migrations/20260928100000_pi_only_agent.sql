-- Pi is the only chat runtime. This migration adds the calculation store,
-- the per-person theory of mind with session reflection bookkeeping, and
-- focused questions on Pi answers.

-- ---------------------------------------------------------------------------
-- 1. Precomputed Vedic calculations, frozen per birth revision.
-- ---------------------------------------------------------------------------
create table public.astro_profile_calculations (
  profile_id uuid not null,
  user_id uuid not null,
  birth_revision bigint not null,
  engine_version text not null,
  chart jsonb not null,
  sensitivity jsonb not null,
  timeline jsonb not null,
  transits jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (profile_id, birth_revision),
  constraint astro_profile_calculations_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade
);
alter table public.astro_profile_calculations enable row level security;
revoke all on public.astro_profile_calculations from anon, authenticated;
grant all on public.astro_profile_calculations to service_role;

-- ---------------------------------------------------------------------------
-- 2. Theory of mind: the agent's model of the person, revised per session
--    only when new evidence refines or breaks it.
-- ---------------------------------------------------------------------------
create table public.person_theory_of_mind (
  profile_id uuid not null,
  user_id uuid not null,
  revision integer not null check (revision > 0),
  content text not null check (char_length(content) <= 60000),
  change_summary text not null default '' check (char_length(change_summary) <= 4000),
  session_id uuid not null,
  privacy_epoch bigint not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, revision),
  constraint person_theory_of_mind_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade
);
alter table public.person_theory_of_mind enable row level security;
revoke all on public.person_theory_of_mind from anon, authenticated;
grant all on public.person_theory_of_mind to service_role;

alter table public.astro_sessions
  add column reflected_through timestamptz,
  add column reflection_claimed_at timestamptz;

-- Claim one session whose messages are newer than its last reflection and
-- that has been quiet for p_idle, or that the owner has moved on from.
create or replace function public.claim_session_reflection(p_session_id uuid, p_idle interval default interval '30 minutes')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.astro_sessions; v_last timestamptz;
begin
  select * into s from public.astro_sessions where id = p_session_id for update;
  if not found or s.profile_id is null then return null; end if;
  select max(created_at) into v_last from public.astro_messages
    where session_id = p_session_id and role in ('user', 'assistant');
  if v_last is null or (s.reflected_through is not null and s.reflected_through >= v_last) then return null; end if;
  if v_last > now() - p_idle then return null; end if;
  if s.reflection_claimed_at is not null and s.reflection_claimed_at > now() - interval '15 minutes' then return null; end if;
  if exists (select 1 from public.astro_agent_runs r where r.session_id = p_session_id and r.status = 'active') then return null; end if;
  update public.astro_sessions set reflection_claimed_at = now() where id = p_session_id;
  return jsonb_build_object('sessionId', s.id, 'userId', s.user_id, 'profileId', s.profile_id, 'through', v_last);
end;
$$;

-- Record a reflection. A null content means the theory did not change.
create or replace function public.finish_session_reflection(
  p_session_id uuid, p_through timestamptz, p_expected_revision integer,
  p_content text, p_change_summary text, p_privacy_epoch bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.astro_sessions; v_current integer; v_epoch bigint;
begin
  select * into s from public.astro_sessions where id = p_session_id for update;
  if not found or s.profile_id is null then raise exception 'session not found' using errcode = 'ANF01'; end if;
  select coalesce(max(revision), 0) into v_current from public.person_theory_of_mind where profile_id = s.profile_id;
  if v_current <> p_expected_revision then raise exception 'theory of mind changed' using errcode = 'ASV01'; end if;
  select privacy_epoch into v_epoch from public.person_model_heads where profile_id = s.profile_id and user_id = s.user_id;
  if v_epoch is distinct from p_privacy_epoch then raise exception 'privacy changed' using errcode = 'ASV01'; end if;
  if p_content is not null and btrim(p_content) <> '' then
    insert into public.person_theory_of_mind (profile_id, user_id, revision, content, change_summary, session_id, privacy_epoch)
      values (s.profile_id, s.user_id, v_current + 1, p_content, coalesce(p_change_summary, ''), p_session_id, p_privacy_epoch);
    v_current := v_current + 1;
  end if;
  update public.astro_sessions
    set reflected_through = greatest(coalesce(reflected_through, p_through), p_through), reflection_claimed_at = null
    where id = p_session_id;
  return jsonb_build_object('revision', v_current);
end;
$$;

-- Conversations whose latest message has not been reflected yet, optionally
-- limited to one profile, quiet for at least p_idle.
create or replace function public.sessions_needing_reflection(
  p_idle interval, p_limit integer default 25, p_profile_id uuid default null, p_except_session_id uuid default null
) returns table (session_id uuid) language sql stable security definer set search_path = '' as $$
  select s.id
  from public.astro_sessions s
  cross join lateral (
    select max(m.created_at) as last_at from public.astro_messages m
    where m.session_id = s.id and m.role in ('user', 'assistant')
  ) last
  where s.profile_id is not null
    and (p_profile_id is null or s.profile_id = p_profile_id)
    and (p_except_session_id is null or s.id <> p_except_session_id)
    and last.last_at is not null
    and (s.reflected_through is null or s.reflected_through < last.last_at)
    and last.last_at <= now() - p_idle
    and (s.reflection_claimed_at is null or s.reflection_claimed_at < now() - interval '15 minutes')
  order by last.last_at desc
  limit greatest(1, least(p_limit, 100));
$$;
revoke all on function public.sessions_needing_reflection(interval, integer, uuid, uuid) from public, anon, authenticated;
grant execute on function public.sessions_needing_reflection(interval, integer, uuid, uuid) to service_role;

revoke all on function public.claim_session_reflection(uuid, interval) from public, anon, authenticated;
revoke all on function public.finish_session_reflection(uuid, timestamptz, integer, text, text, bigint) from public, anon, authenticated;
grant execute on function public.claim_session_reflection(uuid, interval) to service_role;
grant execute on function public.finish_session_reflection(uuid, timestamptz, integer, text, text, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Pi answers may end with one focused question.
-- ---------------------------------------------------------------------------
drop function if exists public.worker_finish_pi_run(uuid,bigint,bigint,bigint,bigint,text,jsonb);
create or replace function public.worker_finish_pi_run(
  p_run_id uuid, p_expected_version bigint, p_mode_epoch bigint,
  p_privacy_epoch bigint, p_birth_revision bigint, p_answer text, p_refs jsonb,
  p_focused_question jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.astro_agent_runs; prefs public.person_preferences; head public.person_model_heads; profile public.astro_profiles;
  v_status text := case when p_focused_question is null or p_focused_question = 'null'::jsonb then 'complete' else 'waiting_for_user' end;
begin
  select * into r from public.astro_agent_runs where id = p_run_id;
  if not found then raise exception 'run not found' using errcode = 'ANF01'; end if;
  select * into profile from public.astro_profiles where id = r.profile_id and user_id = r.user_id for share;
  select * into head from public.person_model_heads where profile_id = r.profile_id and user_id = r.user_id for share;
  select * into prefs from public.person_preferences where profile_id = r.profile_id and user_id = r.user_id for share;
  select * into r from public.astro_agent_runs where id = p_run_id for update;
  if prefs.mode_epoch is distinct from p_mode_epoch or head.privacy_epoch is distinct from p_privacy_epoch
    or profile.birth_revision is distinct from p_birth_revision then
    raise exception 'workspace authority changed' using errcode = 'ASV01';
  end if;
  if p_answer is null or btrim(p_answer) = '' then raise exception 'empty answer' using errcode = 'AIR01'; end if;
  return public.worker_checkpoint_astro_run(p_run_id, p_expected_version,
    jsonb_build_object('stepKey','pi:final','kind','checkpoint','status','succeeded','outputSummary','Pi answer and workspace persisted','phase','responding','refs',p_refs),
    jsonb_build_object('currentGoal','','nextAction','','contextVersion',head.current_revision),
    jsonb_build_object('status',v_status,'currentGoal','','nextAction','','summaryText','','summaryJson','{}'::jsonb,'currentQuestion',coalesce(p_focused_question,'null'::jsonb)),
    jsonb_build_object('content',p_answer,'status',v_status,'focusedQuestion',coalesce(p_focused_question,'null'::jsonb)));
end;
$$;
revoke all on function public.worker_finish_pi_run(uuid,bigint,bigint,bigint,bigint,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.worker_finish_pi_run(uuid,bigint,bigint,bigint,bigint,text,jsonb,jsonb) to service_role;
