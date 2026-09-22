-- The revision mode-epoch validator is active for every post-P2 profile.
-- Seed preferences before inserting the baseline revision so a newly created
-- person can satisfy that invariant in the same profile-insert transaction.
create or replace function public.person_initialize_profile_model()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint := greatest(coalesce(new.memory_version, 0), 1);
begin
  insert into public.person_preferences
    (profile_id, user_id, astrology_enabled, mode_epoch, domains)
  values (new.id, new.user_id, false, 0, '{}'::jsonb);

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
    (profile_id, user_id, current_revision, processed_source_seq,
     privacy_epoch, mode_epoch, publication_state)
  values (new.id, new.user_id, v_revision, 0, 0, 0, 'current');
  insert into public.person_source_sequences
    (profile_id, user_id, last_accepted_seq)
  values (new.id, new.user_id, 0);
  update public.astro_profiles p set memory_version = v_revision where p.id = new.id;
  return new;
end;
$$;
revoke all on function public.person_initialize_profile_model()
  from public, anon, authenticated, service_role;
