# PR 24 progress note

## Why

Storage review of 29 Sep 2026
(https://claude.ai/artifact/VGGMUGpek8X6DgCtKr3MFD): about 95% of the
`pi-workspaces` bucket was the checkpoint stored twice plus superseded
checkpoints. Plan for the whole storage and streaming change approved by the
owner on 4 Oct 2026; this is step 1, which needs no Cloudflare.

## Owner decisions (2026-10-04)

- All review recommendations approved; stay on free tiers (Vercel Hobby,
  Supabase Free, Cloudflare Free plus R2 with a card on file).
- Cloudflare account created by the owner; Wrangler is logged in on the
  owner's device.

## Decisions made while building

- Keep one checkpoint per run, not one per chat: the cold-VM restore reads
  the latest checkpoint of the prior completed run by its artifact prefix.
- Cleanup is best effort everywhere it follows a durable write. Storage
  leftovers cost bytes; a failed answer costs the user.
- Live rows are cleared at publication only. Failed runs keep theirs until
  the operator script runs; step 3 moves text deltas out of Postgres anyway.
- The staging cron job is not in migrations (it was created by hand), so its
  log trim lives in the operator script, not a migration.
- The script lists objects with SQL through the management API and deletes
  through the Storage API, because Supabase blocks direct deletes on
  `storage.objects`.

## Dead ends

- supabase-js could not reach `<ref>.supabase.co` from the owner's network:
  the ISP resolver returns a wrong address. The script now asks
  cloudflare-dns.com and pins the address for the request.

## Verified

- Unit suite, typecheck, lint, release-preflight (17 tests).
- Staging cleanup applied and re-checked by dry run: nothing left to remove.

## Pending

- Production cleanup `--apply` (dry run: 140 transfer pieces 12.0 MB, 27
  superseded checkpoints 5.8 MB, 509 live rows). Waiting for the owner.
- Pi base snapshot: blocked on the owner's OK to delete old sandbox
  snapshots that fill the 15 GB Hobby quota.
- Push and PR: waiting for the owner's approval.
- Steps 2 (R2 behind a Worker) and 3 (Durable Object streaming).
