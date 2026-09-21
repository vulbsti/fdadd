# P1 progress receipt — conversation reliability

Updated: September 21, 2026. Status: **implementing; provider-backed happy path verified**, not an accepted P1 gate or release. Source base: `27fc172` plus the reviewed shared worktree. The [phased plan](PHASED-IMPLEMENTATION-PLAN.md) remains the acceptance contract. No connected database row, deployment, alias, or migration history was changed.

## What changed locally

| Slice | Implementation | Proof and remaining limit |
|---|---|---|
| Selected context | The run resolves selected ledger IDs to owned fact, evidence, hypothesis, event, or message records, including the evidence quote, and bounds the model block to 18,000 characters. Retired facts and cross-profile sources are omitted. | Unit tests and a disposable local Supabase integration fixture prove that a selected quote—not the ledger reason—reaches the prompt projection and that owner scoping holds. This is not yet a semantic support/counterevidence verifier. |
| Final payload | The complete, schema-validated `astro_finish_run` proposal is retained in the workflow decision state; the 500-character trace is no longer reread as payload storage. The SQL-generated focused-question ID is loaded from the canonical session field on the next turn. | Unit tests cover long answers and malformed questions; local storage integration checks canonical question identity. A provider-generated `complete` answer persisted and survived browser reload. The `waiting_for_user` provider path still needs an E2E question-ID assertion. |
| Message paging | The descending cursor now seeks by `(created_at, id)`, and the route validates its opaque cursor's timestamp and UUID. | Local storage integration paged 53 messages sharing a timestamp in 50 + 3, with no missing/duplicate IDs. |
| Workflow event stream | Stream writes now execute inside a durable `use step` function. Previously `getWriter()` ran in the workflow function before its `try`, which the local Workflow runtime rejected as `Not supported in workflow functions`. | The first local provider E2E yielded an active database run with zero steps and a failed Workflow. After the fix, a new run reached `planRun`, retried, and durably failed in the database. This proves local failure persistence, not the historical remote cause. |
| Model/tool continuation | Model-requested tools now run inside a same-plan-step pass loop. Their exact assistant calls and tool results feed the next provider request, and each pass/tool gets a distinct durable key. Near the bounded limit the model is instructed to finish with the best supported answer or one question. | Before the fix, three tools completed but `continue` advanced the outer plan loop; the plan ended without a draft and was mislabeled `agent_step_limit`. After the fix, the same synthetic request completed through answer persistence and reload. Fault/duplicate/lease cases remain open. |
| E2E harness | An opt-in authenticated browser test creates a disposable synthetic local user/profile/session, submits a real chat, waits for durable answer, reloads, captures a screenshot, and deletes the user. | **Pass:** the configured provider planned, requested context tools, consumed their results on a follow-up turn, persisted an answer, and the exact answer was visible after reload. The test refuses a remote Supabase target. Follow-up, second-chat, reconnect, resume, and focused-question variants remain open. |

## Read-only external diagnosis

- Connected Supabase project `ezanfqbewuqttatrkvhf` still has two active, zero-step runs from September 15. Their remote Workflow details were not recoverable: the dashboard says “Run Not Found”/possibly expired, and the available CLI could not decode the remote run-detail response. The local `getWriter()` failure matches the *shape* of active/zero-step state, but **does not prove** it caused either remote run.
- Local and connected astro/profile schema fingerprints match for table columns, public functions, constraints, indexes, policies, and triggers. Migration ledger versions differ while names correspond. Do not repair or apply a production migration merely to align version IDs.
- The `aidoraa.com` and `www.aidoraa.com` aliases resolve to a ready deployment built from an older dirty checkout, not local HEAD. The main git deployment is also older. This work is neither deployed nor a production fix.
- The earlier 401 was local configuration precedence, not a bad current Go credential. `.env` contained the working value under case-mismatched `Opengo_API`, while higher-priority `.env.local` supplied a different `OPENGO_API`. The provider reads only case-sensitive `OPENGO_API`; Next loads `.env.local` before `.env`. A same-endpoint canary returned 200 for the `.env` value and 401 for the `.env.local` value. The ignored local files were corrected so one `OPENGO_API` is loaded from `.env`. No secret value was printed, copied into this receipt, or committed.

## Verification matrix

| Gate | Result | Evidence |
|---|---|---|
| ESLint | Pass with one existing `BirthIntakeForm.tsx` React Hook Form compiler warning. | `npm run lint` |
| TypeScript | Pass. | `npm run typecheck` |
| Unit | 31 pass, one conditional local integration skipped in normal unit mode. | `npm test` |
| Storage integration | Pass, one test with disposable local Auth/profile/run/source records, cleaned in `finally`. | `npm run test:integration:local` |
| Production build | Pass; 95 Workflow steps and two workflows compiled. Existing `middleware` deprecation warning. | `npm run build` |
| Local two-user RLS + browser smoke | 19 pgTAP assertions passed; three authenticated Chromium projects passed at 1586×992, 1366×768, and 390×844. These tests are not model-answer proof. | `npm run test:db:local`, `npm run test:e2e:local` |
| Real-provider browser answer | **Pass:** authenticated send, provider plan/tool/follow-up execution, durable answer, reload, and exact rendered answer. | `npm run test:e2e:provider:local`; ignored `synthetic-conversation-reloaded.png` under `test-results/` |
| Visual parity | Not claimed. The successful laptop capture is readable and shows the persisted answer and run trace, but it is the existing chat UI—not the approved life-map screens. The phase label still read `RESPONDING` in the reloaded capture despite the completed session summary, and the P0 narrow-screen overflow remains open. | Visually inspected ignored Playwright success PNG; approved reference PNGs in `docs/design/` |
| Hosted CI / deployment | Unverified. The new quality workflow exists only in the uncommitted worktree. | No GitHub run or deployment made. |

Post-test local read-only cleanup check found zero `p0-e2e-`/`p1-e2e-` Auth users and zero synthetic P1 profiles. Playwright traces and screenshots are ignored local artifacts, not publishable receipts.

## Next P1 work and exit decision

1. Extend the provider E2E through `waiting_for_user`, stable focused-question identity, stream reconnect, follow-up, resume, and a second chat. A single successful `complete` answer does not close the conversation gate.
2. Implement the transactional dispatch outbox/sweeper, idempotent replay, leases/fences, bounded retry classification, and user-visible recovery; inject crash-before-start, duplicate start, and lease-expiry cases. The current event-step fix closes one failure path but is **not** a general dispatch guarantee.
3. Test typed Atros calls and nested calculation failure, selected-source semantic verification, and long-answer/question transitions against the real provider and Sandbox boundary with sanitized receipts.
4. Run and inspect hosted CI after this work is pushed to a reviewed branch. Do not mutate the two historical connected runs on the strength of a matching local symptom.

Architecture assessment: these fixes preserve the existing Supabase/Workflow/provider boundaries and improve typed payload/source provenance. They do not create the v3 person revision authority, publication fencing, astrology-off guarantee, or final approved UI. P1 remains open until the dispatch/failure matrix and multi-turn/second-chat paths are proven.
