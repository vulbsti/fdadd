# Current state and why the approved UI cannot work yet

Inspected September 20, 2026, Asia/Kolkata. Local commit: `27fc172156633cb15b550d1b36c69eb702fdcbba`. The existing untracked planning files were preserved. This audit distinguishes current source from live database observations; the deployed application commit and a successful live provider conversation were not verified in this pass.

## Live database observations

Read-only aggregate queries against the connected `aidoraa` Supabase project (`ezanfqbewuqttatrkvhf`) returned:

| Stored object | Count |
|---|---:|
| Profiles | 3 |
| Sessions | 4 |
| Person facts | 0 |
| Evidence | 0 |
| Map revisions | 0 |
| Life events | 0 |
| Hypotheses | 0 |

There were two complete intake runs, one failed intake, and two question runs still marked active. Both question runs had attached workflow IDs but zero recorded run steps. Their earliest start was September 15, 2026 at 12:21:05 UTC; their latest update was September 15 at 14:45:23 UTC. This establishes stalled product state, not the underlying provider/deployment cause. Runtime diagnosis is a work-package prerequisite.

The inspected live policies restrict the selected profile, message, evidence, and fact tables to their account owner. This is useful access-control groundwork; policy inspection alone is not an end-to-end privacy or deletion test.

## Source findings

Paths below are repository-relative. Line anchors refer to the inspected commit.

| ID | Finding and evidence | Consequence for the approved experience | Required change |
|---|---|---|---|
| A01 | `src/workflows/astrologer-run.ts:1026` reconstructs selected context using context-ledger `reason` and `item_key`, not the referenced records. `agent-store.ts:663` returns those ledger rows. | Explicit retrieval may find useful episodes, but analysis and verification receive bookkeeping text. A model-initiated search can still return full rows through its tool response; the defect is specifically the persisted selected-context path. | Hydrate a versioned context bundle with typed source references and actual content; retrieve a full record when a search excerpt is insufficient. |
| A02 | `astrologer-run.ts:59` gives the planner at most 12 fact keys/statuses and counts of hypotheses/summaries. `agent-store.ts:749` caps prior summaries at ten. | No coherent base understanding or coverage map is guaranteed in a new chat. | Mandatory compact current person brief, relevant issues/goals, exceptions, unresolved questions, plus selective detail retrieval. |
| A03 | `agent-tools.ts:144–316` exposes no Atros calculation functions. `astrologer-run.ts:665` picks calculations by keywords in a prose objective. | The analyst cannot reliably choose a divisional chart, a dated transit, or a dasha window; ambiguous prose selects the wrong calculation. | Validated typed calculation calls with explicit date ranges and options; no keyword routing. |
| A04 | `astrologer-run.ts:705` and `:769` truncate calculation/tool references to 300 characters. `verifyDraft` sees these references at `:331`. | Verification can approve or reject claims without the relevant calculation or evidence. | Persist full structured results; give the verifier claim-specific fields and access to original records. Bounded logs remain logs. |
| A05 | `astrologer-run.ts:790` truncates tool arguments to 500 characters; `:1041` tries to parse them as the final-response payload. The special finish branch at `:748` also bypasses the registered finish validator. | Ordinary detailed answers can lose follow-up questions, next action, and terminal status. | Persist a schema-validated final-response object with stable question IDs, separately from receipts. |
| A06 | `agent-tools.ts:235,252` offers propose/confirm/contradict/retire. Migration `202609140001...sql:1341` rejects an existing fact, and `:1425` only updates status/confidence. | A corrected date, new meaning, or narrowed pattern cannot replace its active content. | Versioned revise, qualify, merge, split, supersede, retire, and deletion operations over stable object IDs. |
| A07 | No consolidation workflow or source-ingestion outbox exists. Memory writes are optional analyst tool calls. | A successful answer can leave no person understanding behind; a failed answer can lose learning from the user's input. | Guaranteed source ingestion and independent consolidation with watermarks and retry. |
| A08 | SQL at `:1708` accepts message evidence only from the current session. It does not check `role='user'`; directness is inferred from a source-kind argument and a substring match. SQL at `:1323` verifies quote existence, not claim support. | Earlier chats cannot be cited directly by this writer. Assistant claims or unrelated exact quotes can be promoted as user evidence. | Author/subject attribution, same-person cross-session references, exact-span validation, and semantic entailment checks. Imported assistant text remains interpretation. |
| A09 | SQL at `:1399` counts distinct source IDs as independent support. | Repeated or copied interpretations can turn into confirmed personality claims. Two related observations do not prove an explanation. | Deduplicate source lineage; retain interpretive status; represent user endorsement separately from observational support. |
| A10 | Only one active run per profile (`migration:371`, `:912`). Run creation and `startAndAttach` are separate boundaries (`chat/route.ts:37`, `api-helpers.ts:62`); replay skips dispatch when `replayed=true`. | One stuck chat blocks every chat for that person. A crash before dispatch can leave an active run that retries do not restart. | Session-level conversation sequencing, transactional dispatch outbox, leases/fencing, and serialized profile publication. |
| A11 | `runAtrosTool` returns outer `ok: true` even when `cachedAtrosCall` carries an error in `result` (`agent-tools.ts:77`, `:542`). | A failed calculation can be recorded as completed and treated as usable grounding. | One explicit success/error contract from CLI through cache through verifier. |
| A12 | `astro_profiles` requires birth fields (`202609090001...sql:9`); `ProfileChooser.tsx:69` permits only ready chart profiles. | A personal map or import cannot start without astrology intake, even with astrology off. | Decouple person readiness from birth/calculation readiness. |
| A13 | Profile API only lists chooser summaries (`profiles/route.ts:9`). No model/view/import/preferences/corrections/suggestion APIs exist. `AstrologerApp.tsx` is a chat shell. | The approved tabs, toggle, expanded nodes, imports, privacy control, and maps have no backing behavior. | Implement the UI behavior contract and canonical projection APIs. |
| A14 | Session summary is an answer prefix labeled resolved (`astrologer-run.ts:1071`), written only for complete runs at `:957`. | Ongoing unresolved discussions become missing or misleading context. | Maintain an attributed session digest after each turn, including unresolved matters; never use it as independent evidence. |
| A15 | System prompts identify only a Vedic astrologer (`astrologer-run.ts:175,725`); no domain guidance loader was found in the current astrology/workflow paths. | The companion does not reliably reason about experience, meaning, exceptions, or information gaps as the product requires. | Versioned, bounded guidance selected by task, with structured outputs and evaluated behavior. |
| A16 | Message pagination sorts by time and ID but only filters time (`agent-store.ts:370–381`). | Imported messages sharing timestamps can be skipped when browsing history. | Composite keyset cursor and preserved original message order. |
| A17 | Existing raw message/profile grants permit owner writes beyond the new invariant-heavy RPCs (`202609090001...sql:98–103`). | Client-supplied author roles or chart fields can undermine the trusted-source model. This is an integrity issue even within one account. | Restrict invariant-heavy writes; trusted routes/RPCs assign origin, role, and calculation provenance. |

## What to keep

Keep authenticated routes, owner checks, same-owner foreign-key groundwork, source and revision concepts, typed contracts, durable workflow integration, the provider adapter, Atros allowlisting/Sandbox execution, calculation cache, saved chat hydration, and operational error UI. These are useful components; they do not constitute a self-evolving person model by themselves.

## Why the earlier plan is insufficient

- It treats the map principally as fact keys. The approved screens require episodes, reported effects, meaning changes, relationship context, patterns with exceptions, and conditional scenarios.
- It equates evidence counts with confirmation and lacks explicit semantic support checks.
- It models an agent's operational next step, but not a user's proposed action or a question that resolves a specific knowledge gap.
- It has no authoritative state for which suggestions were answered, dismissed, invalidated, or accepted.
- It couples birth intake and chart readiness to the person's existence.
- It leaves correction propagation, import attribution, actual deletion, and astrology-off reasoning undefined.
- It serializes all chats for a person instead of only serializing model publication.

The new specification replaces these decisions explicitly; it does not simply add more prompts to the current loop.

## Verification performed and limits

`npm test -- src/lib/astro/agent-tools.test.ts src/lib/astro/contracts.test.ts src/lib/astro/workflow-errors.test.ts`: 23 tests passed across three files. They mostly exercise schemas, parsing, cache helpers, and error normalization. They do not cover the conversation-to-profile-to-suggestion loop. No application code was changed, so no new implementation tests or deployment were represented as complete.

The database test file exists at `supabase/tests/astrologer_agent_memory.sql`; it was inspected, not executed against production. This pass did not execute a live model turn, Sandbox calculation, browser walkthrough, import, or deletion. Those are mandatory later release gates, specified in the acceptance plan.
