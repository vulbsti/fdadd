# P0 execution receipt — baseline and proof harness

Date: September 20, 2026. Status: local P0 proof harness verified; hosted CI execution and deployed state remain unverified. Source base: `27fc172` plus the uncommitted P0 worktree. This is a local execution receipt, **not** a production release or v3 parity claim. The [phased plan](PHASED-IMPLEMENTATION-PLAN.md) defines the gate.

## Current state, with evidence boundaries

| Boundary | Observation | Proof / limit |
|---|---|---|
| Source | Next 16 App Router exposes the current astrologer page and seven `/api/astrologer` route files; `astrologer-run` and `astrologer-intake` are Workflow entry points. | Inspected `src/app/astrologer`, `src/app/api/astrologer`, `src/workflows`, and build output. This is source inventory, not a completed model turn. |
| Local database | Local Supabase at `127.0.0.1` has zero profiles, sessions, person facts, evidence, map revisions, runs, and run steps before disposable tests. | Read-only aggregate queries through the configured local service key; no user content fetched. |
| Connected Aidoraa database | Three profiles, four sessions, zero person facts/evidence/map revisions/run steps, and two active runs. Both active runs have Workflow IDs, zero steps, and last updates on September 15. | Read-only aggregate and run-status queries through the Supabase connector to project `ezanfqbewuqttatrkvhf`. This proves stale database state, **not** the Workflow-side cause. No rows were changed. |
| Migration ledger | Local files: `202608230001`, `202609090001`, `202609140001`. Connected database ledger: `202608230001`, `20260915101436` named `202609090001_astrologer`, and `20260915101444` named `202609140001_astrologer_agent_memory`. | Read-only ledger query. Names correspond; version IDs differ. Do not run a migration, repair, or reset until actual schema and migration-history equivalence are checked in P1. |
| Deployed app / Workflow service | Deployment commit, registered remote worker version, and attached Workflow statuses for the two active runs are **unverified**. | No trustworthy deployment/Workflow receipt was available in this phase. The two active database rows are not an explanation of their cause. |
| Provider / Atros | Local provider and Supabase variables are present; no live provider or Atros call was made. | Configuration was checked by variable presence only. P1 owns provider/Sandbox execution proof. |

## Repeatable checks and artifacts

| Check | Result | Artifact / command |
|---|---|---|
| Lint | Pass with one existing React Hook Form compiler-compatibility warning in `BirthIntakeForm.tsx`; `next lint` replaced with ESLint CLI. | `npm run lint`, `eslint.config.mjs`. Generated Workflow routes are excluded. |
| Typecheck | Pass. | `npm run typecheck`. |
| Unit | 26 pass in four files. | `npm test`. The Vite native-loader warning remains informational. |
| Build | Pass; 95 Workflow steps and two workflows compiled. | `npm run build`. Next reports the existing `middleware` convention as deprecated. |
| DB/RLS | 19 pgTAP tests pass locally with two authenticated subjects; all fixtures rolled back. | `npm run test:db:local`, [`DB-HARNESS.md`](DB-HARNESS.md). Covers read isolation and selected write/RPC denial, not all future v3 tables. |
| Browser E2E | Three local Chromium projects passed: 1586×992, 1366×768, and 390×844. A disposable confirmed user signed in through the real UI; protected page, owned empty profiles API, and reload worked. Post-run local check found zero remaining `p0-e2e-` Auth users and zero astro profiles/sessions/runs. | `npm run test:e2e:local` (3 passed), [`BROWSER-HARNESS.md`](BROWSER-HARNESS.md). No provider or model run was exercised. |
| Visual baseline | Inspected wide and mobile full-page captures. The present surface is an Astrologer reading/intake card, not the approved life-map shell. At a 390px viewport, the full-page image is 1073px wide: the current card horizontally overflows and leaves its main area off-screen. | Ignored local PNGs under `test-results/astrologer-smoke-*/`. The approved four PNGs remain design references. This is a recorded P5 responsive defect, not a P0 visual parity pass. |
| CI | Workflow authored and YAML parsed; remote GitHub run unverified. | `.github/workflows/p0-quality.yml` runs static checks plus local DB/browser smoke; production workflow now runs lint and unit tests before deployment. |
| Fixtures / visual refs | Four explicitly synthetic histories added; approved images remain references, not seed data. | `tests/fixtures/p0-synthetic-histories.json`; `docs/design/astrologer-ui-mocks/2026-09-19/v2-life-map/`. |

The local browser harness uses disposable test identity and screenshots under ignored `test-results/`; do not commit or upload traces or authenticated browser state. Failure traces may contain ephemeral form values/tokens. The integration workflow requires Docker and Chrome dependencies on CI, not production provider secrets. CI startup obtains only local Supabase keys. Its actual run must be observed before marking the CI gate complete.

No staging identity or credential set was provisioned in P0. The repeatable target is the loopback app and local Supabase stack only; a later staging run needs a separately approved disposable identity, scoped credentials, artifact-retention policy, and exact-user teardown receipt. Neither harness accepts a remote Supabase target today.

**Long-term-fit check:** the database test crosses real authenticated RLS roles, the browser test uses the app's real auth/session and owned route, and both are isolated from the model/provider. The synthetic corpus includes sparse, changing-purpose, conditional-pattern, and caregiving lives without hardcoding the approved person's biography. Future phases must extend these harnesses to revision/source/mode/privacy behavior; P0 deliberately does not substitute fixture screenshots for a published person model.

## Remaining P0 gate / P1 handoff

- Preserve the 390px overflow observation as an explicit P5 responsive requirement. The P0 browser harness passes behavior, but the current UI does not pass approved visual parity or narrow-screen usability.
- Observe a real CI run (PR or main push). Local YAML validity does not prove runner startup, browser installation, or completion.
- P1 must diagnose the attached Workflow IDs through provider/Workflow/deployment receipts before remediation. Do not delete messages or force-complete active rows to clear a lock.
- P1 must reconcile connected migration history with the three local migration files before applying any new migration. No production schema mutation was made here.
- Dependency audit reported 23 advisories during installation (1 low, 4 moderate, 18 high); these were not triaged or auto-fixed in P0. Avoid `npm audit fix --force` without a reviewed upgrade plan.
