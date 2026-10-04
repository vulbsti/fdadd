-- Imported conversation and document bodies can be large. When the edge
-- object store is configured the body lives there, and the row keeps only
-- its address and the digest used to detect an unchanged re-import.
alter table public.person_import_items
  add column body_object text check (body_object is null or char_length(body_object) <= 400),
  add column body_digest text check (body_digest is null or body_digest ~ '^[a-f0-9]{64}$');
