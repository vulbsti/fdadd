-- Typed changes must take ownership of every accepted source not yet covered
-- by a published revision, including an earlier pending chat source.
begin;
set search_path = public;
\pset tuples_only on
\pset format unaligned
select '1..3';

set local role postgres;
insert into auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,role)
values ('3b300000-0000-4000-8000-000000000001','p3-range@example.invalid','fixture',now(),now(),now(),'authenticated');

set local role authenticated;
set local request.jwt.claims = '{"sub":"3b300000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.person_create('P3 range', '3b300000-0000-4000-8000-000000000010'::uuid);
select public.create_astro_session((select id from public.astro_profiles
  where user_id='3b300000-0000-4000-8000-000000000001'::uuid and name='P3 range'));
insert into public.astro_messages(user_id,session_id,role,content,client_message_id)
select '3b300000-0000-4000-8000-000000000001'::uuid,s.id,'user',
  'An earlier accepted account is still waiting to be learned.',
  '3b300000-0000-4000-8000-000000000011'::uuid
from public.astro_sessions s join public.astro_profiles p on p.id=s.profile_id
where p.user_id='3b300000-0000-4000-8000-000000000001'::uuid and p.name='P3 range';

select public.person_submit_change(
  (select id from public.astro_profiles where user_id='3b300000-0000-4000-8000-000000000001'::uuid and name='P3 range'),
  '3b300000-0000-4000-8000-000000000012'::uuid,1,
  '{"kind":"add_event","payload":{"what":"A later turning point"}}'::jsonb
) as change_receipt \gset

set local role postgres;
select case when (select source_from_seq from public.person_jobs where id=(:'change_receipt'::jsonb->>'job_id')::uuid) = 1
  then 'ok 1 - typed change job starts at the first still-unpublished source'
  else 'not ok 1 - typed change job starts at the first still-unpublished source' end;
select case when (select source_to_seq from public.person_jobs where id=(:'change_receipt'::jsonb->>'job_id')::uuid) = 2
  then 'ok 2 - typed change job ends at its newly accepted source'
  else 'not ok 2 - typed change job ends at its newly accepted source' end;
select case when (select count(*) from public.person_source_items where profile_id=(:'change_receipt'::jsonb->>'person_id')::uuid) = 2
  then 'ok 3 - both immutable sources remain available to the consolidation job'
  else 'not ok 3 - both immutable sources remain available to the consolidation job' end;

rollback;
