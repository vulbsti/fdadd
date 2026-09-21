# Phased execution plan — approved life-understanding experience

Status: execution plan, not implementation or release evidence. Prepared September 20, 2026 against local commit `27fc172`. The approved [v2 screens](../../design/astrologer-ui-mocks/2026-09-19/v2-life-map/README.md) and the [v3 specification](EXECUTION-SPEC.md), [behavior contract](UI-BEHAVIOR-CONTRACT.md), and [acceptance plan](ACCEPTANCE-PLAN.md) define the destination. If this plan and those contracts disagree, resolve the disagreement in a documented decision before implementation; do not silently narrow the product.

## Outcome and current gap

Deliver a single companion with many chats sharing one revisable, evidence-backed understanding of a person. Life map, focused explanations, guided conversation, suggestions, and optional astrology must read the same published person revision. The source archive, personal understanding, astrological calculations/interpretations, conversation/run state, and presentation/suggestions remain separate authoritative layers. Imported or corrected input must update the same system; an attractive screen populated with fixture copy is not parity.

At planning time, source had an authenticated astrologer chat/intake surface, Supabase schema, Workflow-backed runs, provider adapter, and Atros boundary. It did **not** have the v3 person model, route-backed approved screens, imports, real privacy controls, or E2E/visual test harness. The prior live database audit reported zero person facts/evidence/revisions and two stalled active runs. The planning pass ran `npm test` (26 tests in four files), but no browser, provider, Atros, database integration, or deployed product flow. It also found the removed `next lint` command and a deployment workflow without tests. See the [P0 execution receipt](P0-EXECUTION-RECEIPT.md) for the newer verified baseline; neither document claims v3 parity.

## Non-negotiable execution rules

1. Each phase is a reviewable vertical change, with its own automated tests, browser path when UI exists, screenshot comparison when UI exists, architecture review, and receipt. No phase closes solely because code merged or a mock looks similar.
2. Accept and persist user input before asynchronous answer/consolidation work. Durable dispatch, idempotency, fences, and a recoverable failure state are required. A Workflow start or HTTP 202 is not proof that the user received an answer or that learning published.
3. Personal claims need attributed source support and explicit epistemic status. Keep user accounts, assistant hypotheses, calculations, interpretations, and unknowns distinct. Corrections invalidate dependents immediately; source exclusion and deletion are not cosmetic status changes.
4. All four approved images are **visual references**, not production seed content. The example biography is a private, dated acceptance case. The product must also work for a sparse person and at least one substantially different life history.
5. Birth information is optional for person creation and personal-only use. Astrology-off must remove astro-derived context, tools, suggestions, and projections, not just hide an overlay.
6. Keep the existing authenticated routes, provider adapter, Supabase/Postgres, Workflow, and allowlisted Atros CLI boundary. Make additive migrations and a controlled cutover; avoid a competing second model writer or a graph database introduced merely for display.
7. Before coding, read the relevant installed Next 16 guides under `node_modules/next/dist/docs/`; check current Supabase/Workflow docs and installed CLI help for schema, auth, and job changes. Use forward migrations, RLS on exposed tables, owner/profile constraints, scoped service privileges, and two-user access tests. Never expose service credentials or store private transcripts in public test artifacts.

## Definition of proof for **every** feature

For a feature ticket, record all five layers below. “N/A” needs a reason, not an empty box.

| Layer | Required proof |
|---|---|
| Contract | Typed API/DTO, persisted identity/version/dependencies, access boundary, failure and retry behavior, and the source-to-result trace are named. |
| Automated | Unit/schema tests plus relevant database, provider, Workflow, parser, or concurrency integration tests. Run the test against real storage/service adapters where the boundary matters; mocks alone do not prove it. |
| E2E | From authenticated browser or equivalent public API entry, perform the user's action, observe durable result, reload/reconnect, and verify server state. Include at least one failure/retry and one second-person or second-chat variant when relevant. |
| Visual/accessibility | Capture approved-size desktop (`1586×992`), normal laptop, and narrow-screen states for UI changes; inspect against the four references, keyboard path, accessible text for diagrams, loading/empty/error states, and no horizontal overflow. Differences are classified as intentional, defect, or missing design guidance. |
| Long-term fit | Demonstrate stable object IDs, one authoritative writer, revision-aware projection, provenance, corrections, sparse/different-person behavior, scaling budget, mode/privacy filtering, and no hardcoded biography. A narrow shortcut fails this gate even if its one E2E happy path passes. |

Maintain a private fixture corpus from reviewed, authorized source material plus synthetic histories. Begin with the mission/meaning-change and solitude/exception cases, a sparse person, and a non-career-centered history; expand to at least 20 small histories before release. Never copy private transcripts into public fixtures, screenshots, logs, or a PR. Each E2E receipt should include test ID, commit, environment, schema revision, person fixture ID, input/action, durable IDs/revisions before and after, browser route, screenshot paths, and result. Store only sanitized excerpts or hashes in shareable reports.

## Dependency path and phase gates

`P0 baseline → P1 reliable runs → P2 authoritative data → P3 learning → P4 suggestions/projections → P5 approved UI → P6 guided loop → P7 astrology modes → P8 import/privacy → P9 release`.

UI components can be developed against **contract fixtures** once P2 projection DTOs are frozen, but cannot be marked integrated until they render a revision published by P3/P4. Import parser work can proceed after P2 source identity is fixed; ingestion and deletion cannot ship before privacy epochs and dependency invalidation work. Do not remove the old profile-wide active-run guard until the P2 publication/fencing path is proven. P7/P8 are release scope, not optional polish. Phase gates are dependency gates rather than dates.

### P0 — baseline, observability, and the proof harness

**Work:** Inventory existing routes, schema/grants, Workflow registrations, provider configuration by presence only, and installed framework behavior. Diagnose the two historically stalled runs through read-only live run/Workflow/step receipts if access is available; distinguish database status from deployment cause before remediation. Add test infrastructure for disposable two-user Supabase DB integration, authenticated browser E2E, screenshots, private/synthetic fixtures, and a receipt manifest. Fix the broken lint command using installed Next 16 guidance; add tests and E2E smoke to CI without forcing external-secret-dependent tests on every PR. Define staging credentials and teardown rules. Establish visual baselines from the four approved PNGs and component-level screenshots, not generated screenshots as UI.

**Exit:** Local typecheck, unit tests, corrected lint, DB fixture setup/teardown, and one authenticated browser smoke run are repeatable; CI reports them separately. There is a written current deployment/run-status receipt or an explicit “unverified” marker. Record test/environment availability without printing secrets.

**Fit check:** Tests exercise public routes and actual owner isolation, not only internal helpers. Harness supports sparse and alternate persons, responsive screenshots, and per-phase receipts without leaking personal data. No data cleanup of stalled runs is authorized by this diagnostic phase.

### P1 — make the existing conversation execution trustworthy (spec WP0)

**Work:** Repair selected-context hydration (full typed records, not ledger reason strings), compact personal context, typed final-answer/question payloads rather than truncated log arguments, validated finish path, typed Atros tool calls, nested calculation errors, and composite message cursor. Add transactional run dispatch outbox/sweeper, idempotent replay, leases/fences, bounded retries, and user-visible recovery. Preserve current chats and external provider adapter. Sequence turns within a chat; keep broader person-level serialization until P2 replaces it safely.

**E2E proof:** Create a session, send a long answer-triggering question, observe the persisted answer and stable question ID through stream reconnect and page reload; send follow-up and open another chat. Inject provider failure, dispatch crash-before-start, duplicate start, slow call/lease expiry, and nested Atros error; each produces one logical result or a recoverable failure. Check source content actually reaches verification, not just a source key. Run real configured-provider and Sandbox/Atros smoke in staging with sanitized receipts.

**Visual proof:** Current chat loading, reconnect, failure/retry, long response, and question state are readable on desktop/mobile. This is reliability proof, not approval of the final v2 design.

**Fit check:** The data contract can carry full structured output and selected source spans independent of the current UI. No log truncation is repurposed as storage; no per-process promise is the only dispatcher. Maps/audit cases A01–A05, A10–A11, A14, A16; acceptance D01–D03, D06–D09 and A07–A08.

### P2 — establish one person identity and revision authority (spec WP1)

**Work:** Add name-only person creation, independent person/chart readiness, attributed source items/sequences, observations, typed objects/relations, conflicts, model revisions/head, versioned preferences, privacy/mode epochs, jobs/outbox, and typed run payload storage. Keep `astro_profiles.id` as person ID via a compatibility adapter. Add `PersonStore`/contracts/dependency validation, transactionally accepted inputs, atomic publication, optimistic rebase, and immediate invalidation for explicit correction/exclusion. Restrict client writes to trusted roles, calculation provenance, revision pointers, and raw message authorship. Backfill stable identities without promoting assistant summaries into facts; define old-writer cutover and rollback boundaries.

**E2E proof:** Name-only person, personal-only chat, explicit dated event, and correction produce source IDs and exactly one coherent published revision each. Reload model/view APIs and inspect support, chronology, history, and invalidations. Two chats can accept input concurrently; two publishers preserve or rebase both changes. Authenticated person B cannot access person A through API, SQL, stream, or storage. Direct browser attempt to write trusted author/role/revision is rejected.

**Visual proof:** Sparse/empty person entry and update/error states are honest; birth fields are never required for personal-only creation. A simple model inspector may be development-only; no mock parity is claimed yet.

**Fit check:** Five authoritative boundaries remain separate; one published pointer and one write path exist per concept. Stable IDs survive correction/merge; privacy epoch fences stale work; performance/indexes are checked with representative corpus. Maps A06–A10, A12, A17; acceptance C01, C08, D04–D05, D11, I11–I12.

### P3 — source-led consolidation that changes understanding (spec WP2)

**Work:** Implement durable ingestion and staged `extract → match/countercontext → reconcile → compose → verify → publish` Workflow. Persist direct/derived distinctions, exact spans, author and subject, event time vs source time vs ingestion time, conditions/exceptions, unknowns, conflicts, goals/issues/current state, meaning changes, chapters, and concise whole-person brief. Include source watermark, bounded chunks/calls, verifier field findings, partial valid publication, and recoverable clarification/failure. Profile learning must occur even when conversation answering fails. Version guidance and model/provider provenance; evaluate semantic support and counterevidence, not quote substring or two source IDs alone.

**E2E proof:** From ordinary chat messages, form the age-15 episode, later challenge, *unknown* changed meaning, and an explorable chapter. Separately form productive solitude and prolonged-isolation accounts without an incapacity label; a counterexample qualifies the hypothesis. Correct a date or reject an explanation and see all dependent brief/object/projection content change while history remains inspectable. New chat retrieves current understanding and source, not only last ten summaries. Repeat with sparse and family/caregiving histories and failed provider turn.

**Visual proof:** Inspect source drawer, uncertainty/working-explanation labels, dated historical versus current-state labels, and update indicators in a temporary integrated view or final UI components. Never display inferred text as a quotation.

**Fit check:** Corpus evaluation rejects generic name-swap copy, assistant-evidence laundering, invented unknowns, and source-role confusion. Incremental update and broad-audit threshold are measured; current brief is coherent without being a sole lossy memory store. Maps A07–A09, A14–A15; acceptance C02, C06–C14, D07.

### P4 — suggestions and revision-keyed view projections (spec WP3 + projection half of WP4)

**Work:** Derive questions, actions, and scenarios from active gaps/goals/issues/constraints with dependencies, semantic duplicate keys, mode/privacy eligibility, lifecycle events, and outcome ingestion. Produce deterministic, revision-keyed life-map, chapter, pattern, people, and paths DTOs from the same canonical object/edge versions. Curation balances significance, relevance, and domain/time coverage; unknown dates remain accessible. Keep scenario branches conditional with counterconditions/observable signs, not probabilities or forecasts. Build projection refresh/invalidation and pinned-revision reads; GETs do not trigger uncontrolled model rebuilds.

**E2E proof:** A gap creates a specific helpful question; answering, dismissing, snoozing, or rejecting its premise suppresses the same/paraphrased prompt across chats. An action card opens without counting as acceptance; accepted experiment outcome changes relevance. A correction/source exclusion removes invalid suggestions immediately. A changed revision swaps all nodes/edges coherently; stale IDs resolve to history/replacement or unavailable state. Sparse profile remains sparse, while a longer alternate-domain profile preserves access beyond the overview budget.

**Visual proof:** Render fixture-driven overview/detail/scenario states and inspect copy hierarchy, question/action distinction, dated present, unknowns, and node-edge semantics at target sizes. These are component/contract screenshots until P5 browser navigation is wired.

**Fit check:** Every displayed invitation has current dependencies and a useful purpose; clicks do not mutate the person's goals. Projection payloads are semantic data, never model-authored HTML or hardcoded coordinates. Acceptance C12–C20, A10, D10.

### P5 — build the approved shell and all four visual surfaces (spec WP4)

**Work:** Implement the canonical `/astrologer/p/[personId]` route family and shared sidebar/top navigation. Build Life map, How you think/pattern detail, guided-chat presentation, and meaning-change chapter, plus People & influences and Paths ahead; each uses P4 DTOs and real object IDs. Implement person selector, new/search/recent conversations, breadcrumbs, node/edge expansion, filters, source support drawer, add turning point, correction/rejection entry, Private entry, settings, and import entry. Preserve drafts/focus/scroll across Chat/Profile, back/forward, deep link, refresh, and coherent revision swaps. Build usable empty/loading/error/permission-denied/retired states and accessible structured text for diagrams. No visible control gets a placeholder toast.

**E2E proof:** For each visible control in the [behavior contract](UI-BEHAVIOR-CONTRACT.md), maintain a browser test that clicks or keyboards through its route, observes the backed API mutation/navigation, reloads, and checks owned state. Switch persons to prove cache separation. Open a chapter, reload/back, change filter, inspect edge/source, and follow the replacement of a merged object. Use both sparse and populated profiles.

**Visual proof:** Compare all four reference compositions at `1586×992`, laptop, and narrow viewport. Review shared shell, warm ivory/navy/ochre palette, restrained typography, timeline size, two-path mechanism, contextual chat strip, three-stage meaning diagram, and progressive disclosure. Keep timeline larger than prose; avoid stock photos, cosmic graphics, scores, and generic KPI cards. Mockup typo/quote/date artifacts do not override source truth. Test keyboard focus, screen-reader labels/linearized diagrams, contrast, and no hidden mobile action. Save approved diffs and intentional deviations.

**Fit check:** Screens are renderers of revisioned model data; no biography in React constants or screenshot images as UI. The same components adapt to alternate histories and unknown dates. Acceptance C03, C19, D10 and browser coverage of the complete UI contract.

### P6 — close the profile → chat → revised profile loop (spec WP5)

**Work:** Resolve Explore-in-chat server-side using selected object, revision, question ID, and an existing/new session choice. Persist an exploration context without forging a user message. Give the companion the current brief, selected connection, exact source/counterevidence, active question, and latest unsynthesized input. Persist the answer and question atomically, then run consolidation; show durable updating/retry state, versioned result, and a View changes affordance. A second chat must see the revised person model.

**E2E proof:** On meaning-change or solitude detail, click Explore, answer via chip and then free text, reload mid-run, see question transition, revised diagram/brief/suggestion, then open a different chat and ask about the same issue. Reject a premise from the detail screen and confirm the companion stops repeating it. Test concurrent edit while focused view is open and that the prior revision never mixes with new edges.

**Visual proof:** Compare guided chat to screen 03 with contextual strip, readable assistant response, optional astro expander, follow-up chips, composer, and return-to-map link. Check mobile/keyboard, in-flight, recoverable failure, and update-not-yet-published states.

**Fit check:** Exploration references stable IDs and pinned revisions; source-derived learning is independent of response success. “One companion, many chats” is verified by shared current understanding, not a copied prompt or session-local summary. Acceptance C04–C05, C16, C20, D07–D10.

### P7 — make astrology genuinely optional and version-safe (spec WP6)

**Work:** Add birth revisions and typed calculation requests/results; separate immutable Atros calculations from revisioned interpretations and personal objects. Add mode-aware context/tool selection, mode epoch checks in all in-flight writes/streams, calculation/cache compatibility keys, interpretation dependency invalidation, and on/off projection filtering. Keep historical transcript honest and labeled; exclude earlier astro-derived statements from new personal-only reasoning. Birth setup uses a calendar, time picker, searchable place selection deriving coordinates/timezone, plus uncertainty and correction flows. A chart error cannot block the personal map.

**E2E proof:** Start name-only/off, create/use map and chats. Add/correct birth details, turn on, open a claim-specific reading, then turn off mid-run/from another tab; no astro-derived response, suggestion, context, or projection publishes into off mode. Repeat with old mixed chat, imported astro interpretation, cache hit, Atros failure, and changed birth time/engine version. Confirm calculations are reused only when compatible and personal history survives astro invalidation.

**Visual proof:** Astrology stays a restrained contextual row/expander, never the main narrative. Off mode removes astro bands without shifting selected personal object; missing input/error has honest setup/overlay states. Compare screens 01–04 in on mode and inspect off mode separately.

**Fit check:** Filtering is enforced before retrieval/model/tool/suggestion/publication, not by stripping labels or CSS. Acceptance A01–A10.

### P8 — imports, search, privacy, export, and forgetting (spec WP7)

**Work:** Implement safe upload/paste adapters for representative ChatGPT, Claude, Codex, and generic exports; preserve branches, speaker/subject, timestamps, original order, lineage, dedup, and preview/mapping approval. Durable chunked import Workflow exposes progress/watermarks/retry; only reviewed included items enter consolidation. Add owned source-aware conversation search with stable anchors. Private sheet reports actual account access, provider processing, inclusion, retention, export, and deletion status. Implement include/exclude, import removal, person deletion, short-lived owner-only export, epoch fencing, dependency re-verification, controlled purge of raw/derived/cache/search/job payloads, and truthful backup/provider-retention disclosure.

**E2E proof:** Import one real-format sample per adapter, review ambiguous roles, reload progress, retry same file, then search/open equal-timestamp messages without skips. Prompt-injection/HTML/ZIP-path samples stay inert. Exclude/import-delete during an active consolidation/model/export job; content disappears immediately from eligible context/UI, stale worker cannot resurrect it, and durable purge receipt completes. Test independently supported surviving claims, cross-user IDs, person delete with pending jobs, and export invalidation after deletion. Confirm source re-inclusion is explicit.

**Visual proof:** Import preview, mapping, progress, partial error, and complete states use the shared shell. Private sheet distinguishes account access from AI processing and pending removal from completed purge. Mobile/keyboard and destructive-confirmation flows are inspected.

**Fit check:** Imported content is source material, not prompt authority; no assistant text becomes direct user evidence. Deletion is real and propagated, not merely a retired flag, while non-content idempotency tombstones prevent resurrection. Acceptance I01–I12 and D12.

### P9 — full parity evaluation, staging, and controlled release (spec WP8)

**Work:** Run the entire [acceptance matrix](ACCEPTANCE-PLAN.md) against fixed schema/guidance/model versions and at least 20 diverse histories, with three repeated reasoning runs per fixture. Add concurrency/fault/privacy tests, provider + Sandbox receipts, browser functional suite, screenshot review, and accessibility review. Test source → DB → model → browser → deployed environment separately. Shadow-build candidate models from included legacy sources, compare counts/coverage/ownership, cut over one writer, then enable UI behind an account-scoped flag. Upgrade CI/deployment gates deliberately; staging deploy must verify applied migrations, worker registration, dispatcher/sweeper, auth, upload/storage access, real model answer, revision publication, and browser loop. Promote only after release receipt review; keep rollback compatible with new privacy/correction state.

**Exit:** No cross-person or off-mode leak, unsupported biography in reviewed fixtures, lost input/correction on retry, stale publication after exclusion/deletion, placeholder control, or broken guided-update loop. Every visible question/action has valid current dependencies. Human review scores specificity/coherence/usefulness at least 4/5 for reviewed samples, with hard invariants passing every repeated run. Store a release receipt with commit, migration set, environment, provider/model/guidance/Atros/corpus versions, outcomes, sanitized artifact paths, latency/cost, unresolved deviations, and explicit go/no-go decision. These are release criteria, not a claim that the model infallibly understands a person.

## Feature-to-design traceability

| Feature / approved reference | Owning phases | Minimum E2E assertion | Visual assertion | Long-term parity question |
|---|---|---|---|---|
| Shared shell, person picker, history/search, Chat/Profile | P2, P5, P8 | Owned switch/search/deep link survives reload | Same shell across all four screens and mobile | Does switching people clear all prior-person caches and context? |
| Life map, dated present, conditional forks — screen 01 | P3–P5 | Source event/correction changes revision and map | Timeline dominates; chronology and dashed future visually distinct | Can unknown dates, sparse histories, and other life domains render honestly? |
| Pattern, exception, open question — screen 02 | P3–P5 | Counterexample revises explanation/question | Two pathways, working explanation, exception, CTA | Are conditions and exceptions stored, not generated only at render time? |
| Guided chat — screen 03 | P1, P3, P5–P6 | Explore/answer/reload/new chat sees revision | Context strip, natural response, chips, composer | Is the same canonical model shared across chats without transcript laundering? |
| Meaning-change chapter — screen 04 | P3–P6 | Unknown meaning stays open until answered/corrected | Three-stage progression, unresolved node, contextual invitation | Does it preserve event vs interpretation and change of meaning? |
| People & influences / Paths ahead | P3–P5 | Specific influence/scenario opens and updates from sources | Same editorial system; conditional language | Are third-party minds, future certainty, and invented goals excluded? |
| Astrology layer and birth setup | P1, P7 | Toggle/correct/failure affects only eligible readings | Secondary overlay/expander; clean off state | Does mode govern retrieval, tools, publication and all dependent outputs? |
| Import, Private, source controls | P2, P8 | Preview/confirm/exclude/delete/export and retry survive restart | Honest status, confirmation, accessible progress | Can a source be truly forgotten without stale workers or caches reviving it? |

## Agent handoff and progress ledger

For each feature or phase, create a tracking entry (issue/PR or a versioned internal ledger) with these fields; never mark a parent phase complete from one child happy path:

```text
ID / phase / owner / dependency / status: not-started | implementing | verifying | blocked | accepted
Contract and affected files/migrations:
Behavior contract controls + acceptance IDs:
Source→object→projection→UI trace, version/dependency IDs:
Tests: unit; DB/RLS; provider/Workflow/Atros; browser E2E; failure/retry; alternate-person
Visual: reference image; desktop/laptop/mobile screenshots; accessibility; reviewed deviations
Long-term fit: provenance; correction/deletion; mode; concurrency; sparse/different-person; scale
Receipts: commit; schema; environment; exact commands; sanitized logs/IDs; screenshot/artifact paths
Known gaps / follow-on / reviewer decision / accepted date:
```

Implementation agents should first read this plan and the four linked specification documents, then inspect current source/migrations and installed framework guides. Before each change, name its owning phase and acceptance IDs. After each change, run relevant tests, exercise the public E2E path, inspect screenshots if UI changed, and update the ledger with evidence or an explicit unverified/blocked status. Reviewers must reject “works on the example biography,” “screenshot matches,” or “unit tests pass” as sufficient by themselves. At handoff, distinguish code merged, local tests, database proof, model/provider proof, browser/visual proof, and deployed proof; never conflate them.
