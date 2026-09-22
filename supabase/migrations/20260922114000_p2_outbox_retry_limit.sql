-- `person_finish_outbox` already applies a bounded retry/dead-letter policy;
-- make the configured limit explicit on the outbox row it evaluates.
alter table public.person_outbox
  add column max_attempts integer not null default 8
  check (max_attempts between 1 and 20);
