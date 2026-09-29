-- Imported conversations from other assistants and documents from connected
-- services. Parsed items stay pending until the person reviews and confirms
-- the import; confirmed items become searchable files in the Pi workspace
-- under imports/. All access is server-mediated (service role only).

insert into storage.buckets (id, name, public)
values ('person-imports', 'person-imports', false)
on conflict (id) do nothing;

create table public.person_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid not null,
  provider text not null check (provider in ('chatgpt', 'claude', 'grok', 'gemini', 'deepseek', 'meta_ai', 'other', 'notion', 'google_drive', 'google_keep')),
  status text not null default 'uploading' check (status in ('uploading', 'awaiting_review', 'imported', 'failed')),
  file_name text check (file_name is null or char_length(file_name) <= 300),
  upload_path text,
  detected_format text,
  parser_version text,
  person_speaker text check (person_speaker is null or char_length(person_speaker) <= 100),
  warnings text[] not null default '{}',
  error text check (error is null or char_length(error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  imported_at timestamptz,
  constraint person_imports_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade
);
create index person_imports_profile_idx on public.person_imports (profile_id, created_at desc);
alter table public.person_imports enable row level security;
revoke all on public.person_imports from anon, authenticated;
grant all on public.person_imports to service_role;

create table public.person_import_items (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.person_imports (id) on delete cascade,
  user_id uuid not null,
  profile_id uuid not null,
  provider text not null,
  kind text not null check (kind in ('conversation', 'document')),
  external_id text not null check (char_length(external_id) <= 300),
  title text not null check (char_length(title) <= 300),
  started_at timestamptz,
  ended_at timestamptz,
  message_count integer not null default 0,
  person_message_count integer not null default 0,
  speakers text[] not null default '{}',
  messages jsonb not null default '[]'::jsonb,
  body text,
  source_url text,
  -- new: not imported before; updated: an earlier copy has fewer messages or
  -- older edits; unchanged: already imported as is.
  duplicate_state text not null default 'new' check (duplicate_state in ('new', 'updated', 'unchanged')),
  status text not null default 'pending' check (status in ('pending', 'imported')),
  created_at timestamptz not null default now(),
  unique (import_id, external_id),
  constraint person_import_items_profile_owner_fk
    foreign key (profile_id, user_id) references public.astro_profiles (id, user_id) on delete cascade
);
create unique index person_import_items_imported_once
  on public.person_import_items (profile_id, provider, external_id) where status = 'imported';
create index person_import_items_import_idx on public.person_import_items (import_id);
alter table public.person_import_items enable row level security;
revoke all on public.person_import_items from anon, authenticated;
grant all on public.person_import_items to service_role;

-- OAuth connections (Notion, Google). Tokens are encrypted by the server before
-- they are stored and are never readable by the browser.
create table public.user_connector_accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('notion', 'google')),
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text,
  account_email text,
  workspace_id text,
  workspace_name text,
  bot_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.user_connector_accounts enable row level security;
revoke all on public.user_connector_accounts from anon, authenticated;
grant all on public.user_connector_accounts to service_role;

-- Confirm a reviewed import: keep the selected items, replace earlier copies
-- of the same conversations, and drop earlier imports left with nothing.
create or replace function public.confirm_person_import(
  p_user_id uuid, p_import_id uuid, p_item_ids uuid[], p_person_speaker text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_import public.person_imports; v_count integer;
begin
  select * into v_import from public.person_imports
    where id = p_import_id and user_id = p_user_id for update;
  if not found then raise exception 'import not found' using errcode = 'IMP01'; end if;
  if v_import.status <> 'awaiting_review' then raise exception 'import is not awaiting review' using errcode = 'IMP02'; end if;
  -- Serialise confirmations per person so two imports cannot both win a conversation.
  perform 1 from public.astro_profiles where id = v_import.profile_id and user_id = p_user_id for update;

  delete from public.person_import_items
    where import_id = p_import_id and status = 'pending' and not (id = any(coalesce(p_item_ids, '{}')));
  delete from public.person_import_items old
    using public.person_import_items new
    where new.import_id = p_import_id and new.status = 'pending'
      and old.status = 'imported' and old.profile_id = new.profile_id
      and old.provider = new.provider and old.external_id = new.external_id;
  update public.person_import_items set status = 'imported'
    where import_id = p_import_id and status = 'pending';
  get diagnostics v_count = row_count;
  update public.person_imports
    set status = 'imported', person_speaker = p_person_speaker, imported_at = now(), updated_at = now()
    where id = p_import_id;
  delete from public.person_imports i
    where i.profile_id = v_import.profile_id and i.user_id = p_user_id and i.status = 'imported' and i.id <> p_import_id
      and not exists (select 1 from public.person_import_items x where x.import_id = i.id);
  return jsonb_build_object('importId', p_import_id, 'imported', v_count);
end $$;
revoke all on function public.confirm_person_import(uuid, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.confirm_person_import(uuid, uuid, uuid[], text) to service_role;
