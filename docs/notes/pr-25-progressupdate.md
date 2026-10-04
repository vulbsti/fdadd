# PR 25 progress note

## Why

Steps 2 and 3 of the storage plan approved on 4 Oct 2026: Pi workspace files
to Cloudflare R2, live streaming off Postgres. Free tiers only.

## Owner decisions (2026-10-04)

- Cloudflare account on utkiiti@gmail.com with R2 enabled, created by the
  owner. Wrangler logged in on the owner's device.
- Optimise for performance inside the free tiers.

## Decisions made while building

- One Worker fronts both R2 and the Durable Object, with one shared HMAC
  secret. No S3 keys: fewer secrets, and R2 verifies the SHA-256 on write.
- Steps 2 and 3 ship together: they share the Worker, the firewall rule and
  the runner bundle, and one bundle change means one VM rebuild per person.
- No bulk copy from Supabase. Objects move on first read; both stores are
  tiny today.
- Server-sent events, not WebSockets: the object is awake while a run posts
  to it anyway, and the browser code stays close to the existing reader.
- The Workflow poll loop stays. The plan said to replace it with a hook; the
  loop is proven under replay and crash, and with text gone from Postgres it
  costs little. Left as a follow-up.
- The Worker is plain `.mjs` so the app's `tsc` (which includes every `.ts`)
  does not need Worker types.

## Infrastructure created

- R2 buckets `aidoraa-staging`, `aidoraa-production`.
- Workers `aidoraa-edge-staging`, `aidoraa-edge-production` on the
  `aidoraa.workers.dev` subdomain, each with its own `EDGE_SIGNING_SECRET`.
- Vercel env `EDGE_ORIGIN`, `EDGE_SIGNING_SECRET` on Preview (staging Worker)
  and Production (production Worker).

## Dead ends

- `vercel env add … preview` hangs waiting for a branch prompt after saving;
  `--non-interactive` with a timeout works.
- workers.dev needed a subdomain registered before the first deploy;
  "aidoraa" was free.

## Verified

- Unit, runtime and preflight suites, typecheck, lint.
- Worker smoke test on staging.
- Staging journey: storage path end to end. Runner to edge stream publish
  confirmed from inside the sandbox (exit frame received by a watcher).

## Pending

- A green staging journey: blocked by the model provider returning 429.
- Live text seen in a real browser on staging (same blocker).
- Import bodies to R2.
- Push and PR: waiting for the owner's approval.
