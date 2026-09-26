# Prototype pipeline repair — 26 September 2026

This receipt separates a working browser journey from unit checks and visual
resemblance. The agent-step-budget redesign is explicitly deferred.

## Failures reproduced and repaired

| Boundary | Observed failure | Repair |
| --- | --- | --- |
| Production name-only onboarding | `person_create` is absent; plain PostgREST error became `500 internal error` | Safe unavailable classification; read-only migration/RPC/grant release gate; production schema repair must precede release |
| Existing-data database upgrade | Deferred backfill FK checks blocked later RLS DDL; the whole transaction rolled back | Operator-only immediate constraint checks during migration; preserve validation, old migration SQL, and runtime defaults; add an existing-profile upgrade regression |
| Preview environment | Default Preview inherited production database settings | Preview explicitly targets `wtloawiwntyjiidjbmuk`; production remains `ezanfqbewuqttatrkvhf` |
| Rejected answer draft | Independent verifier feedback was not fed into the next draft | Pass rejected claims and missing evidence back as explicit revision instructions; no step-limit redesign |
| Automatic memory | Exact quote ended at offset 163 for a 162-character source; JS `slice` silently clamped it, so normalization preserved an invalid span | Normalize out-of-bounds end offsets by uniquely locating the already-exact quote; preserve strict provenance validation |
| Memory retry | Database requeued work, but another request/sweeper had to wake it | Durable Workflow sleep uses the database's `available_at`; database fences, backoff and failure-attempt policy remain authoritative |
| Birth details | Existing person had no customer-facing birth setup | Settings form, geocoding, immutable birth revisions, chart/sensitivity workflow, pending/failure/retry states on the same person |
| Birth edit eligibility | Parked `waiting_for_user` conversations prevented setup indefinitely | Block executing `active` runs, preserve parked conversations and current-mode checks |
| Birth workflow start | Birth RPC saved the run, then the obsolete attachment RPC rejected server credentials with `403 unauthenticated` | Use transactional outbox dispatch and Workflow self-registration for intake as well as questions |
| Local Sandbox | Local OIDC credential had expired on 14 September | Refresh via Vercel pull; test wrapper copies only fresh Sandbox OIDC, not remote database settings |
| Mobile onboarding | 48px heading forced card beyond 390px viewport | Responsive heading/padding and minimum-width correction |
| Sparse life map | One episode occupied one of three fixed desktop cells | One/two/three episode layouts adapt without changing the three-event reference layout |
| Release sequencing | Independent production deployment could precede quality/browser checks | Same-source candidate Preview, hosted system proof, production schema gate, then production build/promotion; disable automatic Vercel Git deployment of main |
| Recovery scheduling | Vercel Hobby rejects minute-level cron | Daily orphan-recovery safety sweep; ordinary dispatch is immediate and memory retries self-wake; no billing upgrade |

Historical production ledger aliases were verified against the repository SQL,
not blindly marked applied: `20260915101436 → 202609090001` and
`20260915101444 → 202609140001`. The operator migration helper applies only
missing migrations in one transaction and preserves those historical entries.

## Evidence and scope

- Regression/unit suite, local owner-isolation/pgTAP suite, typecheck, lint,
  production build, selected-context storage integration, real Atros Sandbox
  chart integration, and release-preflight tests are run separately.
- The full browser harness creates a disposable user, signs in visibly, creates
  a name-only person through the UI, sends an ordinary pattern, adds a
  counterexample in another conversation, checks durable memory and new-chat
  recall, enters birth details through Settings, then asks for a live Atros
  current-dasha calculation. It does not seed a birth-ready profile.
- Ordinary memory waits do not call the cron endpoint. Local evidence already
  demonstrated a second-attempt recovery without a cron nudge.
- Hosted recovery endpoint was separately checked: unauthenticated caller 401,
  authenticated operator 200. This maintenance probe was on an earlier
  candidate, not the final clean acceptance run.
- Screenshots cover 1586×992, 1366×768 and 390×844. One private journey trace
  records the viewport transitions and actual UI interactions at all widths.
- Approved references are the four images under
  `docs/design/astrologer-ui-mocks/2026-09-19/v2-life-map/`. Dedicated seeded P2
  visual fixtures are separate visual evidence, not proof of automatic learning.

## Private artifacts

Local and hosted system artifacts live in `test-results/system-pipeline-local/`
and `test-results/system-pipeline-staging/`. Authenticated traces may contain
session cookies; they must not be committed, uploaded in CI artifacts, or
included in Vercel source uploads. `.gitignore`, `.vercelignore`, and PNG-only
CI artifact selection enforce these boundaries. Do not publish raw traces.

## Release checkpoint

Final-candidate hosted browser journey passed on
`https://fdadd-4iadfmk9k-vulbstis-projects.vercel.app` in 5.3 minutes. All nine
stages produced screenshots at all three widths (27 PNGs) and one private
journey trace. The P2 fixture suite passed all three viewport projects and
saved a separate trace per viewport; its [mock comparison](2026-09-26-visual-comparison.md)
records remaining layout and narrative-density gaps. It is not full visual parity.

The local development-server journey reached all functional stages but its
final browser-error assertion failed on a Settings hydration warning involving
date/time input and hidden-switch inline styles. That warning is not filtered
out or counted as a green local run. Hosted production-build acceptance passed.
Disposable local and hosted users were removed; local test servers were stopped.

Final checks: 161 unit tests passed (4 gated tests skipped), 170 pgTAP assertions
passed, 10 dedicated P3 corpus/recovery tests passed, 6 release-preflight tests
passed, selected-context integration passed,
real Atros Sandbox chart integration passed, typecheck and production builds
passed. Lint has one pre-existing React Hook Form warning and no errors.

The populated legacy-upgrade regression reproduced SQLSTATE 55006, verified
rollback, and passed with immediate constraint checking. Production then
applied all 25 missing migrations atomically. The schema gate confirms all 28
repository migrations (accounting for the two verified aliases) and 12 required
objects/grants. Before and after counts are 3 profiles, 2 charts and 2 sensitivity
profiles; all 3 person revision heads were backfilled.

Production was promoted to `fdadd-8w5ck0hca-vulbstis-projects.vercel.app`
(`dpl_Gu91KF6b6oSbEqARMhVLLSoTJzwJ`); the `www.aidoraa.com` alias was verified
against this exact deployment. Its runtime source matches the hosted-tested
candidate. SHA-256 over sorted paths and contents of the 207 tracked/untracked
runtime files under `src`, `next.config.ts`, `package.json` and `package-lock.json`
(NUL-separated path/content pairs):
`65a5a846c22affb06d7af04b8267f7ed04dcd14d62885d15ce016fc7acd2b33c`.

Production onboarding smoke passed in 15.2 seconds: visible login, name-only
creation (HTTP 201), owner-scoped persisted profile, reload to the same life map,
and nine screenshots (three checkpoints at all three widths). The test revoked
the session and deleted its disposable user. Outputs and private trace are under
`test-results/production-smoke-private/`. This narrow production smoke does not
claim a second full production-provider journey; the full provider proof is the
staging run above.

Security advisors report
the intentional authenticated, owner-checking SECURITY DEFINER entry RPCs and
disabled leaked-password protection; no anonymous callable definer warning was
reported. Auth hardening is not being silently marked complete.
The CLI credential cannot administer GitHub Actions secrets (HTTP 403), so CI
secret activation must be verified separately even after a successful manual
release. The workflow fails closed when required configuration is absent.

## Remaining acceptance

- Activate/verify the GitHub Actions secrets before treating CI release gating
  as operational. Manual CLI validation is a separate receipt.
- Enable/review production leaked-password protection as a separate Auth
  hardening action; it is not required to reproduce the repaired onboarding path.
- Follow up the documented visual gaps with source-backed richer fixtures and
  populated guided-chat comparisons; do not fill sparse maps with invented facts.
- Run the P3 multi-history repeated semantic evaluation, including correction
  publication, mode transitions, failure recovery, and owner usefulness. One
  successful synthetic journey is prototype evidence, not broad reliability.
- Keep `agent_step_limit` redesign deferred as requested. This change improves
  rejected-draft feedback but does not remove or increase the current caps.
