-- Service role workers can stage immutable candidate facts, but publication
-- authority, user changes, jobs/outbox, heads and revisions are RPC-only.
-- SECURITY DEFINER RPCs execute as their owner and retain their bounded writes.
revoke insert, update, delete, truncate, references, trigger on table
  public.person_model_revisions, public.person_model_heads, public.person_preferences,
  public.person_source_sequences, public.person_command_ledger, public.person_source_items,
  public.person_revision_objects, public.person_revision_relations, public.person_revision_conflicts,
  public.person_changes, public.person_change_impacts, public.person_jobs, public.person_outbox,
  public.person_view_snapshots
from service_role;
grant select on table
  public.person_model_revisions, public.person_model_heads, public.person_preferences,
  public.person_source_sequences, public.person_command_ledger, public.person_source_items,
  public.person_revision_objects, public.person_revision_relations, public.person_revision_conflicts,
  public.person_changes, public.person_change_impacts, public.person_jobs, public.person_outbox,
  public.person_view_snapshots
to service_role;

-- Stable IDs/typed immutable versions may be staged by the trusted worker;
-- current pointers and published membership remain publisher-only.
revoke update, delete, truncate, references, trigger on table
  public.person_objects, public.person_object_versions, public.person_object_version_support,
  public.person_relations, public.person_relation_versions, public.person_relation_version_support,
  public.person_conflicts, public.person_conflict_items
from service_role;
grant select, insert on table
  public.person_objects, public.person_object_versions, public.person_object_version_support,
  public.person_relations, public.person_relation_versions, public.person_relation_version_support,
  public.person_conflicts, public.person_conflict_items
to service_role;
revoke insert, update, delete, truncate, references, trigger on table public.person_observations from service_role;
grant select on table public.person_observations to service_role;
revoke update, delete, truncate, references, trigger on table public.person_run_payloads from service_role;
grant select, insert on table public.person_run_payloads to service_role;
revoke delete, truncate, references, trigger on table public.person_job_steps from service_role;
grant select, insert, update on table public.person_job_steps to service_role;

-- Candidate snapshots must agree with the exact revision freshness tuple.
create or replace function public.person_revision_store_views()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_key text; v_snapshot jsonb;
begin
  for v in select value from jsonb_array_elements(
    coalesce(new.commit_request->'candidate'->'viewSnapshots', '[]'::jsonb)) loop
    v_key := v->>'viewKey';
    v_snapshot := v->'snapshot';
    if v_key not in ('life_map','chapters','patterns','people','paths','chapter_detail','object_detail')
       or v_snapshot is null or jsonb_typeof(v_snapshot) <> 'object'
       or coalesce((v_snapshot->>'personRevision')::bigint,-1) <> new.revision_no
       or coalesce((v_snapshot->>'sourceWatermark')::bigint,-1) <> new.processed_source_seq
       or coalesce((v_snapshot->>'modeEpoch')::bigint,-1) <> new.mode_epoch
       or coalesce((v_snapshot->>'privacyEpoch')::bigint,-1) <> new.privacy_epoch then
      raise exception 'view snapshot freshness tuple does not match revision' using errcode = '23514';
    end if;
    insert into public.person_view_snapshots (
      user_id, profile_id, person_revision, view_key, snapshot_json,
      source_watermark, mode_epoch, privacy_epoch
    ) values (new.user_id,new.profile_id,new.revision_no,v_key,v_snapshot,
      new.processed_source_seq,new.mode_epoch,new.privacy_epoch);
  end loop;
  return new;
end;
$$;
revoke all on function public.person_revision_store_views() from public, anon, authenticated, service_role;

-- The accepted UI contract includes approximate event time.
alter table public.person_observations drop constraint person_observations_time_precision_check;
alter table public.person_observations add constraint person_observations_time_precision_check
  check (time_precision in ('exact','day','month','year','range','age','relative','approximate','unknown'));
