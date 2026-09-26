# Pi workspace Preview verification

Date: 2026-09-26. Branch: `codex/pi-workspace-runtime`.

This is a staging-only implementation and proof, not a production rollout.
The ordinary production runtime is unchanged. `ASTROLOGER_RUNTIME=pi` rejects
production and any Supabase project other than the approved staging project.

## What changed

Headless Pi 0.87.1 now runs in a separate ephemeral Vercel Sandbox for each
owner/person/run. Current personal context is materialized as real Markdown and
JSON; file tools can list, search, and read complete pages. Atros tools execute
the installed CLI and retain complete calculation results. Pi owns the tool
loop, without the legacy 16-step finish rule or 300-character calculation pack.

Sessions, working files, full outputs, and safe tool receipts are checkpointed
to private Storage with owner/consent/birth authority checks and monotonic,
content-hashed database receipts. Transfers are chunked around the Vercel
request-size constraint. The explicit prototype archive budget is 50 MiB;
exceeding it fails rather than silently dropping content.

User messages appear optimistically before network acknowledgment. Accepted
message IDs reconcile them, and failed sends retry the same client identity.
Mounted chats refresh their mode after a settings change; stale consent/birth
sessions are not reused as current model context.

## Local verification

- Vitest: **227 passed, 5 skipped**, including nine stream-lifecycle tests,
  three person-scoped cross-tab invalidation tests, 16 initialization/locking
  regressions, and three safe Markdown rendering checks.
- Opt-in fresh Vercel Sandbox bootstrap: **passed** installation, executable
  readiness re-entry, and a complete JSON 2026 timeline in a new Ubuntu VM.
- Filesystem and release-preflight Node tests: **19 passed**.
- Local database contract suite: **183 passed across 8 files**, including 13
  Pi-specific checkpoint/publication/authority tests.
- Full TypeScript and lint passed. Lint retains the pre-existing React Hook
  Form compiler warning in `BirthIntakeForm`; generated Vercel output is excluded.
- The Pi database migration was applied to local and staging only, not production.
- PR CI passed code quality/build, local RLS/database integration, populated
  legacy-schema upgrade, selected-context integration, and authenticated browser
  smoke on implementation commit `f9128a9`.

## Hosted investigation

The real browser test uses an explicitly isolated Preview, a disposable staging
owner, real Go Luna, actual Vercel Sandbox execution, and real Atros. It checks
database receipts and complete private artifact bytes as well as visible UI.
Normal Preview deployments must not be used: they share production defaults.

Failures found during this implementation, rather than hidden by test doubles:

1. The local Vercel builder traced an ignored private dotenv file. Deployment
   now builds from a clean working-tree copy and validates the prebuilt map.
2. Persistent sandbox creation exceeded the account snapshot-storage quota.
   The new runtime uses ephemeral VMs with independently durable checkpoints.
3. A previous-run lookup used an ambiguous PostgREST relationship. It now uses
   explicit owner/session-scoped run and receipt queries.
4. The real cross-tab test caught an enum mismatch: the API returns
   `astrology`, while chat refresh accepted `astrology_enabled`. Presentation
   now uses the shared projection schema. A second browser pass showed focus
   events alone were insufficient: committed preference/birth changes now
   explicitly invalidate other tabs through a person-scoped storage event.
   Receivers re-fetch authenticated server state; event values are not authority.
5. Browser disconnects left some SSE readers alive until Vercel's 300-second
   deadline. Readers now cancel on disconnect, stop on terminal events, and
   renew the connection before the hosting deadline without stopping the run.
6. Structured context omitted stable object kinds and relationship endpoints.
   Exact owner-scoped metadata is now included. Missing source bodies fail
   explicitly rather than silently producing a lineage-only context file.
7. The third browser pass proved cross-tab refresh, but the actual Atros tool
   returned `spawn /tmp/atros-venv/bin/atros ENOENT`. The deprecated `node22`
   runtime is Amazon Linux, while the installer uses Debian package commands.
   Worse, a failed `getOrCreate.onCreate` left the named VM behind; Workflow
   replay reused it without reinstalling. Pi now selects the Ubuntu managed
   image and explicitly verifies initialization on every preparation. Setup
   must finish before personal files are mounted; an incomplete data-bearing
   VM fails closed rather than reopening installation access.
8. An independent fresh-image bootstrap then exposed dependency drift:
   `kerykeion>=5.0.0` installed v6, which removed `AstrologicalSubject` and changed
   calculation defaults. The vendored dependency now pins **5.12.9**, matching
   the existing working Atros sandbox. This is not a v6 engine migration.
9. Luna's screenshot review found literal Markdown syntax in assistant bubbles.
   The chat now renders Markdown headings, emphasis, lists, and tables; raw HTML
   is disabled, unsafe link protocols are stripped, and model-provided images
   are represented by alt text rather than fetched automatically.

Hosted acceptance results and final Preview URL will be added after the running
browser journey finishes. A deployment being Ready is not evidence that Pi
completed an answer.

## Snapshot cleanup

At the owner's request, 23 superseded project snapshots were permanently
deleted after checking current sandbox references again. Their reported sizes
totaled **18.4147 GiB**; actual storage accounting can differ because of
deduplication or delayed billing updates. All 16 current snapshots, including
the shared `atros-template` snapshot, were preserved. No profile, conversation,
or production database data was deleted by this cleanup.

## Evidence handling and remaining gates

Screenshots cover desktop 1586×992, laptop 1366×768, and mobile 390×844.
Authenticated Playwright traces stay in ignored local `test-results`; do not
publish them, because they can contain cookies and private request data.
Safe receipts and network metadata exclude authentication headers and bodies.

No claim is made yet for forced-crash recovery, mid-run consent revocation in
the browser, two live synthetic owners attacking each other's workspaces, or
full visual parity of every approved mock. Unit/database authority and path
tests are narrower evidence. The user-facing workspace browser, automatic
acceptance of Pi memory proposals, and production artifact retention/deletion
integration are not implemented. Existing validated background consolidation
continues to own accepted personal memory.

The hosted timing receipts also expose substantial checkpoint overhead: one
personal answer produced 20 checkpoints approximately 5–6 seconds apart.
Coalescing pending snapshots while preserving every receipt and final file is a
next optimization; this prototype does not yet provide low-latency turns.

### Separate Atros engine defect found during verification

The synthetic 1991-02-03 04:56 Asia/Kolkata Bengaluru fixture exposes a real
date-partition defect in the vendored CLI, not lost context in Pi. Its Rahu
mahadasha is 2008-12-03–2026-12-03 (6,574 days), but the nine antardashas sum to
6,569 days; the last ends 2026-11-28. `antardasha.py` floors each child duration
independently and never allocates the remainder. The same issue exists in
pratyantar and generic subdivision. Inclusive lookup also selects the old
mahadasha on the shared 2026-12-03 boundary and returns no antardasha.

Reproduction used the existing Python environment with `PYTHONPATH` explicitly
pointed at this repository's `vendor/atros/src`; imported module paths were
checked. This PR does not change the engine's calendar convention. Before a
precision-calculation release: add partition/continuity regressions, choose a
consistent residual allocation across all subdividers, and use consistent
half-open boundary selection. A successful tool call or preserved dated output
is **not** evidence that this engine edge case is correct.
