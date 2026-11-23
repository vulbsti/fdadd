-- A chat message's consolidation job covers every source after the last
-- published one, not just its own message. Publication only accepts a job
-- that starts right after the published watermark, so a job that failed for
-- good used to leave a gap that rejected every later job (PSQ01) forever.
-- Overlapping jobs are safe: whichever publishes first wins, and the others
-- rebase onto the new head or complete as already processed.
create or replace function public.person_register_user_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_seq bigint;
  v_source_id uuid;
  v_revision bigint;
  v_privacy bigint;
  v_mode bigint;
  v_processed bigint;
  v_job_id uuid;
begin
  if new.role <> 'user' or new.profile_id is null then return new; end if;
  if exists (select 1 from public.person_source_items
      where profile_id = new.profile_id and user_id = new.user_id and source_message_id = new.id) then
    return new;
  end if;
  update public.person_source_sequences set last_accepted_seq = last_accepted_seq + 1, updated_at = now()
  where profile_id = new.profile_id and user_id = new.user_id returning last_accepted_seq into v_seq;
  if not found then raise exception 'person source sequence is missing' using errcode = 'ANF01'; end if;
  insert into public.person_source_items (
    user_id, profile_id, source_seq, source_kind, source_message_id, speaker_role,
    subject_kind, source_time, original_order, content_fingerprint, lineage
  ) values (
    new.user_id, new.profile_id, v_seq, 'native_message', new.id, 'user',
    'self', new.created_at, extract(epoch from new.created_at)::bigint,
    md5(new.content), jsonb_build_object('messageId', new.id, 'sessionId', new.session_id)
  ) returning id into v_source_id;
  select h.current_revision, h.privacy_epoch, h.mode_epoch, h.processed_source_seq
    into v_revision, v_privacy, v_mode, v_processed
  from public.person_model_heads h where h.profile_id = new.profile_id and h.user_id = new.user_id;
  insert into public.person_jobs (
    user_id, profile_id, job_kind, source_from_seq, source_to_seq,
    base_revision, privacy_epoch, mode_epoch
  ) values (
    new.user_id, new.profile_id, 'source_consolidation',
    least(v_seq, greatest(coalesce(v_processed, 0) + 1, 1)), v_seq,
    v_revision, v_privacy, v_mode
  ) returning id into v_job_id;
  insert into public.person_outbox (user_id, profile_id, job_id, event_type, event_payload)
  values (new.user_id, new.profile_id, v_job_id, 'person.input.accepted',
    jsonb_build_object('sourceId', v_source_id, 'sourceSeq', v_seq, 'messageId', new.id));
  return new;
end;
$$;
revoke all on function public.person_register_user_message() from public, anon, authenticated, service_role;
