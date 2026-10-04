# PR 26 progress note

## Why

Step 5 of the storage review approved on 4 Oct 2026: import bodies out of
Postgres. Supabase Free allows 500 MB of database; R2 allows 10 GB.

## Decisions made while building

- One object per item holding `{messages, body}`, content-addressed under
  `<user>/<person>/imports/<importId>/`. The preview list needs only row
  metadata, so review never reads R2.
- Bodies go to R2 at parse time, not confirmation: pending items are the
  large ones too. Unselected items are swept after confirmation.
- The sweep is per person, because confirmation can replace items that
  belong to an older import.
- Raw upload stays on Supabase: moving it needs a browser-facing upload
  capability on the Worker and CORS for PUT; not needed until an export
  exceeds 50 MB.

## Verified

- Unit suite, typecheck, lint. Migration applied on staging.

## Pending

- Apply the migration on production before this deploys (the release gate
  compares migration history): waiting for the owner.
- A hosted import journey that exercises the R2 path.
