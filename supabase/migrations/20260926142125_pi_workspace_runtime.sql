-- Private, server-mediated durable workspace bytes. No authenticated/anon
-- storage policies: user access must pass owner + consent checks in the app.
insert into storage.buckets (id, name, public)
values ('pi-workspaces', 'pi-workspaces', false)
on conflict (id) do nothing;

create table public.pi_workspace_checkpoints (
  run_id uuid not null references public.astro_agent_runs(id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.astro_profiles(id) on delete cascade,
  mode_epoch bigint not null, privacy_epoch bigint not null, birth_revision bigint not null,
  object_path text not null, digest text not null, final boolean not null,
  created_at timestamptz not null default now(),
  primary key (run_id, sequence)
);
alter table public.pi_workspace_checkpoints enable row level security;
revoke all on public.pi_workspace_checkpoints from anon, authenticated;
grant all on public.pi_workspace_checkpoints to service_role;

create or replace function public.worker_save_pi_checkpoint(
  p_run_id uuid, p_sequence bigint, p_mode_epoch bigint, p_privacy_epoch bigint,
  p_birth_revision bigint, p_object_path text, p_digest text, p_final boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare r public.astro_agent_runs; latest public.pi_workspace_checkpoints;
  prefs public.person_preferences; head public.person_model_heads; profile public.astro_profiles;
begin
  select * into r from public.astro_agent_runs where id = p_run_id;
  if not found or r.status <> 'active' then raise exception 'run not active'; end if;
  select * into profile from public.astro_profiles where id = r.profile_id and user_id = r.user_id for share;
  select * into head from public.person_model_heads where profile_id = r.profile_id and user_id = r.user_id for share;
  select * into prefs from public.person_preferences where profile_id = r.profile_id and user_id = r.user_id for share;
  select * into r from public.astro_agent_runs where id = p_run_id for update;
  if r.status <> 'active' then raise exception 'run not active'; end if;
  if prefs.mode_epoch is distinct from p_mode_epoch or head.privacy_epoch is distinct from p_privacy_epoch
    or profile.birth_revision is distinct from p_birth_revision then raise exception 'workspace authority changed'; end if;
  if p_object_path <> r.user_id::text || '/' || r.profile_id::text || '/' || r.id::text || '/' || p_digest || '.json'
    or p_digest !~ '^[a-f0-9]{64}$' then raise exception 'invalid artifact address'; end if;
  select * into latest from public.pi_workspace_checkpoints where run_id = p_run_id order by sequence desc limit 1;
  if found then
    if latest.sequence = p_sequence and latest.digest = p_digest then return; end if;
    if latest.final or p_sequence <= latest.sequence then raise exception 'stale checkpoint'; end if;
  end if;
  insert into public.pi_workspace_checkpoints values
    (r.id,p_sequence,r.user_id,r.profile_id,p_mode_epoch,p_privacy_epoch,p_birth_revision,p_object_path,p_digest,p_final,now());
end;
$$;
revoke all on function public.worker_save_pi_checkpoint(uuid,bigint,bigint,bigint,bigint,text,text,boolean) from public,anon,authenticated;
grant execute on function public.worker_save_pi_checkpoint(uuid,bigint,bigint,bigint,bigint,text,text,boolean) to service_role;

-- Preserve the original checkpoint transaction and grants; remove only its
-- silent durable-answer prefix. Display previews remain separately bounded.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.worker_checkpoint_astro_run(uuid,bigint,jsonb,jsonb,jsonb,jsonb)'::regprocedure);
  if position('left(coalesce(p_assistant_message ->> ''content'', ''''), 6000)' in definition) = 0 then
    raise exception 'Unexpected checkpoint function: answer-preservation migration needs review';
  end if;
  execute replace(definition,
    'left(coalesce(p_assistant_message ->> ''content'', ''''), 6000)',
    'coalesce(p_assistant_message ->> ''content'', '''')');
end;
$$;

-- A service-role-only publication gate. Checks and publication share a
-- transaction/locks, so a consent change cannot race between them.
create or replace function public.worker_finish_pi_run(
  p_run_id uuid, p_expected_version bigint, p_mode_epoch bigint,
  p_privacy_epoch bigint, p_birth_revision bigint, p_answer text, p_refs jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.astro_agent_runs; prefs public.person_preferences; head public.person_model_heads; profile public.astro_profiles;
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
    jsonb_build_object('status','complete','currentGoal','','nextAction','','summaryText','','summaryJson','{}'::jsonb,'currentQuestion','null'::jsonb),
    jsonb_build_object('content',p_answer,'status','complete','focusedQuestion','null'::jsonb));
end;
$$;
revoke all on function public.worker_finish_pi_run(uuid,bigint,bigint,bigint,bigint,text,jsonb) from public, anon, authenticated;
grant execute on function public.worker_finish_pi_run(uuid,bigint,bigint,bigint,bigint,text,jsonb) to service_role;
