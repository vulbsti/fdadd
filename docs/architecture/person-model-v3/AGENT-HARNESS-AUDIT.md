# Agent harness: evidence loss, rigid control, and stale context

Date: 2026-09-26. Source baseline: `071b47f`.
Status: audit and proposed implementation contract, **not an implemented fix**.

Runtime direction: the owner's subsequent correction selects headless Pi in
isolated Vercel workspaces. See `PI-WORKSPACE-RUNTIME.md`. Retain this audit's
failure cases and acceptance gates, but implement them through the Pi runtime
rather than expanding the custom orchestration loop described here.

## Finding

The dasha failure is not primarily a weak model or failed calculation. The
planned calculation succeeds, but its result is reduced to a 300-character
prefix before answering. The answer model cannot recover: its advertised tool
set contains only `astro_finish_run`. The verifier sees the same abbreviated
references and is instructed to judge factual support, not task completion.
Consequently, “please supply the timeline” can pass verification even though
the system already calculated that timeline.

This contradicts the existing execution spec: full source spans must remain
resolvable, tool calls and results are typed data rather than log summaries,
and ordinary turns need not pass through mandatory planning. See
`EXECUTION-SPEC.md:121–137,264`.

The correction is not “remove every limit.” Separate **authority and resource
controls** from **limits that silently become a ceiling on knowledge or work**.
A page size is acceptable when another page can be read. A compact context
pack is acceptable when omitted evidence can be fetched. A timeout is
acceptable when progress is retained and continuation is explicit. None should
silently mean “the information does not exist” or “answer now without it.”

## Scope and evidence

- Searched application code for slicing, substring operations, query limits,
  schema cardinalities, token budgets, retries, timeouts, and forced finishes.
- Inspected conversational orchestration, provider conversion, tool registry,
  Atros result delivery, context assembly, chat submission, and relevant memory
  consolidation, store, and schema paths. A Luna subagent audited memory paths;
  high-impact findings were cross-checked in source.
- This is a bounded codebase audit, not a claim that every numeric constant or
  every historical migration is a defect. Dependencies, generated output, and
  visual assets were not audited. Unrelated blog previews, avatars, date
  formatting, toast limits, and ordinary paginated views were classified apart.
- Earlier production diagnosis established successful calculation plus missing
  dated evidence and current enabled preferences plus old-chat refusals. Private
  receipts remain under ignored `test-results/production-diagnosis-20260926/`.
  No personal chart contents, credentials, or authenticated traces are copied here.
- No database writes, production experiments, app-code changes, or deployment
  were performed for this audit. Production scale failures below are risks
  supported by source, not incidents asserted to have happened.

## Inventory: conversational path

Line numbers refer to the baseline above. “Replace” means change the mechanism,
not merely raise the number.

| ID | Location / constraint | Consequence and disposition |
|---|---|---|
| C1 | `src/workflows/astrologer-run.ts:998`: successful planned tool result JSON sliced to 300 characters | **Confirmed incident mechanism. Replace.** Headings displace dated tables. Keep full result as private artifact; deliver complete relevant records and a working read handle. |
| C2 | Same file `:1097`: dynamic tool result also added to 300-character `toolRefs` | **Important distinction:** this path additionally appends full result to `modelTranscript` at `:1100`, unlike C1. The verifier still receives abbreviated references. Replace summary-based verification inputs too. |
| C3 | Same file `:430–443`: normal decision model gets only `astro_finish_run` | **Replace.** Runtime has tool execution branches, but the model cannot normally select those tools. Expose permitted retrieval and calculation tools throughout the working loop. |
| C4 | `src/lib/astro/agent-tools.ts:653–671`: discard steps after first evaluate, remove verify steps, keep at most seven evidence steps, append final evaluate | **Replace.** Silently changes model intent into a fixed sequence. Make planning optional and revisable; validate safety/types without rewriting away useful work. |
| C5 | `astrologer-run.ts:40–43,919,1015,1221`; `src/lib/astro/agent-budget.ts:9`: 16 operations, two rejected drafts, reserved forced finishes | **Redesign.** Tool and model calls consume this budget. Near exhaustion, instructions forbid further evidence and finally remove tools. Use durable pause/continuation and progress-aware loop detection. These limits did not cause the observed six-step dasha failure. |
| C6 | `astrologer-run.ts:147,153`: first 12 fact labels and first 10,000 brief characters | **Replace context assembly.** The brief schema permits 12,000 characters, so a valid brief may lose its tail. Fact labels are an index, not full evidence. Provide query-relevant summaries and complete read access. |
| C7 | `src/lib/astro/selected-context.ts:45`: 18,000-character pack, stop at first non-fitting item | **Reproduced.** One oversized first item suppresses every later item, even a small relevant one. An omission count exists, but not an accessible continuation in the finish-only model. |
| C8 | `src/lib/astro/person-agent-context.ts:171`: 24,000-character file-shaped pack with the same whole-item break | **Reproduced.** Alphabetical kind/ID order is not relevance selection. Paths printed in a prompt are not actual readable files/tools. Add a real revision-fenced read/search interface; do not imply filesystem access that does not exist. |
| C9 | `src/lib/astro/agent-store.ts:783,877,936`: selected records 100, prior session summaries 10, last six messages | **Recall gaps.** Keep an initial working set, but allow older turns and selected evidence to be retrieved. `listMessages` itself has valid 50-row keyset pagination; the model context caller does not consume older pages. |
| C10 | `src/lib/astro/agent-tools.ts:365–380`; `src/lib/astro/contracts.ts:241–248`: legacy context search max 25, query max 300 | **Replace the recall interface, not its page size.** No cursor is exposed in this tool schema. Requerying can improve relevance but cannot guarantee traversal or fetch a complete original span. |
| C11 | `astrologer-run.ts:950,1258`: reviewed evidence IDs first 50; `:949,1268` receipt IDs first 25 | **Separate provenance from display.** A bounded visible receipt is fine; durable reviewed/grounding membership must not be a prefix. Retain complete membership outside prompt/checkpoint summaries. |
| C12 | `astrologer-run.ts:1380`: completed-session summary is goal + “resolved” + first 280 answer characters | **Replace.** This is later reasoning input, not merely a sidebar preview. It can omit qualifications. The waiting branch does not create this summary, but also does not clear an earlier summary. Store actual disposition, open work, source references, and authority versions. |
| C13 | `src/lib/astro/contracts.ts:297,310–312`: answer max 6,000 characters; grounding arrays max 20 each | **Review/replace.** Valid prose/evidence sets can be rejected by a presentation-shaped contract. Use answer blocks and separately stored complete grounding; retain bounded wire payloads with continuation when needed. |
| C14 | `astrologer-run.ts:338,446,562`: 2,048 planning / 4,096 answering-verification / 1,600 forced-final tokens | **Resource budgets need explicit handling.** Do not confuse exhausted output allowance with a complete result. Size requests to task and context; preserve incomplete status and resumable progress. |
| C15 | `src/lib/ai/provider.ts:60,157–188,318–345`: neutral result omits completion status/usage; Responses reads only text/function calls; Chat schema drops `finish_reason` | **Reproduced for Chat parser.** A length-limited response is accepted without its reason. Preserve protocol-supported completion/incomplete/refusal/usage metadata. This audit does not establish which server-side continuation features OpenCode Go supports. |
| C16 | `astrologer-run.ts:531`: verifier judges only factual claims and exempts missing-information questions | **Replace acceptance semantics.** Factual caution is necessary but not task completion. Check whether requested output was delivered or a genuine external blocker exists, and whether available tools could resolve a claimed gap. |
| C17 | `supabase/migrations/202609140001_astrologer_agent_memory.sql:1188`: terminal assistant content persisted with `left(...,6000)` | **Replace alongside C13.** Changing only the TypeScript answer limit will still lose the answer tail in SQL. Keep full durable answer content; apply preview lengths only to display fields. |
| C18 | Same migration `:618,639,655,668,1746–1747`: search excerpts 400 characters; evidence quote 2,000 / summary 1,000 | **Distinguish layers.** Search snippets are legitimate indexes; selected evidence/events/messages are rehydrated by `agent-store.ts:767` before context packing. The evidence writer itself prefix-caps content; current tool schemas reject oversized quotes first. Preserve original-span references and explicit length validation rather than silently rewriting accepted source text. |

The Atros command wrapper returns full successful stdout. Increasing the CLI
output allowance does not repair C1. Error excerpts, UI trace summaries, and
`lastMessagePreview` are legitimately short **if never reused as evidence**.

## Inventory: durable person memory and browse surfaces

| ID | Location / constraint | Consequence and disposition |
|---|---|---|
| M1 | `src/lib/person-model/consolidation-store.ts:388–391`: newest 200 prior observations | Older counterexamples are unavailable to the match stage. Add source-linked relevance/contradiction retrieval plus pageable recall; do not treat the newest window as all history. |
| M2 | Same file `:476–487`: first 200 open conflict IDs, no explicit order/cursor | Arbitrary subset at scale. Page deterministically; preserve complete conflict membership and retrieve relevant conflict details. |
| M3 | `src/workflows/person-consolidation.ts:52–59,155–183`: fixed per-stage 2,000–5,000 token budgets, one malformed-output repair per stage invocation | Longer jobs have no split/continuation path. Keep structured stage contracts but add explicit work units and coverage accounting; distinguish invalid output from incomplete output. |
| M4 | `src/lib/person-model/consolidation.ts:83–181`: extraction 100 observations / 30 unknowns; matching/reconciliation 100 items; composition 200 objects / 500 relations | Reasonable per-batch envelopes become total job ceilings because included sources are handled together. Preserve raw sources and split work without advancing the watermark over unprocessed material. |
| M5 | Same file `:671–675,1133–1164`: verifier accepts max 200 keys, including brief, versus up to 701 proposed keys | **Contract mismatch.** Verified-subset filtering can publish only part of a large composition; a generic unresolved note is not full coverage. Verify in batches and distinguish rejected, unreviewed, deferred, and accepted items. Do not publish unreviewed items. Explicit correction/rejection coverage already has a guard; retain it. |
| M6 | Same file `:1159–1164`: merged unresolved questions sliced to first 50 | Possible omission of newly discovered gaps, including the generic partial-verification warning itself when earlier lists fill the budget. Store a complete gap ledger and page its presentation. |
| M7 | `consolidation-store.ts:354–382,420–465`; `src/lib/astro/person-agent-context.ts:69–158`: multirow reads and unbatched ID lists | Missing explicit paging/completeness checks. Repo `supabase/config.toml:16–18` sets API max rows 1,000; hosted values were not inspected in this audit. Some consolidation missing-version cases throw; the answer-context loader silently skips absent versions and can lose support rows. Assert membership completeness and page all required relations/support. |
| M8 | `src/lib/person-model/store.ts:368–383,487–499`: observations/changes max 250 with no returned cursor | Browse/recall ceiling, not deletion of stored records. Add stable keyset pagination. Source listing already accepts `afterSeq`; reuse that principle. |
| M9 | `consolidation.ts:20–30,933`: source body max 24,000 characters; stage JSON max 100,000 | Keep ingress/wire protection, add chunked source references and resumable structured output. These reject oversize input/output; they are not silent prefix truncation. |
| M10 | `src/lib/person-model/contracts.ts`: domain list and publication candidate maxima | Per-object limits (e.g. chapter members 200) and candidate limits (500 objects / 1,000 relations) need declared batch-vs-total semantics. Use relational membership/pageable views where these represent growing history; keep shape/type validation. |
| M11 | `src/lib/person-model/contracts.ts:589,639`: revision read schema brief max 10,000 versus publication candidate max 12,000 | **Contract mismatch.** Database schema also allows 12,000. Align stored/read contracts and replace C6's prefix projection with deliberate context budgeting; valid stored content must not become invalid merely on read. |
| U1 | `src/app/astrologer/p/[personId]/layout.tsx:17`, `agent-store.ts:435`: recent sessions 30/50 | Acceptable recent sidebar windows, but require older conversation discovery rather than imply deletion. Not the dasha incident cause. |
| U2 | `LifeMapView.tsx:29–32`, `ChapterDetailView.tsx:22`, `PatternDetailView.tsx:101`: selected cards 2/3/6 | Presentation limits, not model evidence. Keep curated layouts only with a truthful route to full relevant details. Do not render thousands of cards or blindly remove these limits. |

## Stale reasoning: establish authority, not louder prompts

The observed old-chat failure is consistent with stale **application context**,
not proof of a provider retaining hidden reasoning. `loadRunSnapshot` reads
fresh preferences, but embeds `sessionCheckpoint.currentGoal/nextAction` as
continuing instructions (`astrologer-run.ts:136–145`). Recent assistant refusals
are then replayed (`:1017–1030`). Current settings and historic conclusions
contradict one another. New-chat success at recognizing astrology supports this
diagnosis; it does not reveal the model's internal causal process.

The proposed authority order is:

1. Server-verified owner, consent, privacy state, and current capabilities.
2. Current accepted user request, interpreted within those permissions.
3. Versioned personal evidence and calculations, with source provenance.
4. Previous assistant responses and derived plans, as fallible history only.

At each new turn build a typed capability/context envelope containing person ID,
mode/privacy epochs, birth revision, person-model revision, source watermark,
available tools, freshness, and explicit unavailability reasons. Keep
`astrology_enabled` distinct from `birth_inputs_complete`, `chart_ready`, and
`current_person_brief_available`; a stale brief is not permission denial.

Checkpoint working state must declare its dependencies. When relevant epochs or
birth inputs change, supersede stale plans, next actions, unanswered suggestions,
and derived summaries. Keep chat history visible, but annotate its old authority
state and do not promote old refusal text to a current rule. Rebuild the active
context from source-backed permitted records. A newer user request can replace
an old goal without erasing the historical conversation.

During a run, recheck authority before external calls and publication. If the
mode/privacy epoch changes, stop unsafe continuation, persist progress, and
rebuild under the new state; do not replay an old astrology-bearing context
after consent is disabled. Existing epoch checks are useful and must remain.
Ordinary new memory can be revision-pinned for coherence with a freshness label;
privacy/consent invalidation is stricter than ordinary revision freshness.

“I enabled astrology” in chat must **not** flip the preference or override
authorization. It should cause a permitted current-state read. If the server
says enabled and inputs exist, proceed; if disabled, explain the actual setting
and how to change it. The screenshot refusal despite a verified enabled state
is not a security success. Security is enforcing current consent, not defending
an obsolete assistant assertion.

## Target harness contract

Keep the working Luna/provider and the deterministic Atros CLI. Do not expand
model support as part of this repair.

### Evidence access and adaptive execution

- Persist complete typed tool calls and results with matching call IDs and
  private artifact references. Trace previews are a separate display field.
- Provide real owner/revision-fenced read/search tools for original source
  spans, older conversation turns, person objects/relations, and calculation
  artifacts. A printed `/person/...` path is insufficient.
- A tool response declares its artifact ID, version/checksum, coverage, returned
  range/fields, and `complete` or a usable continuation cursor. Return complete
  small results directly. For larger results, expose query-relevant sections
  with exact source offsets/IDs and a discoverable remainder.
- A dated question should retrieve/calculates its dated range, not just a birth
  balance. Relevant date tables must reach both answer and verifier. No second
  model should have to infer missing table contents from a prose preview.
- The model can choose a permitted tool, inspect its result, ask for another
  calculation/source, revise its plan, and continue. Planning is optional advice,
  not a hardcoded first stage or irrevocable list. Missing-information questions
  are appropriate only for information/tools genuinely unavailable to the system.
- Validate factual support **and goal coverage** before accepting completion.
  A verifier rejection should name evidence gaps and return to the working loop,
  not force unsupported completion. A real external blocker becomes a clear
  blocked/waiting state, not a fabricated successful resolution.

This follows the model/tool/result continuation pattern described in the
[OpenAI agent runtime guide](https://developers.openai.com/api/docs/guides/agents/running-agents).
It does not require replacing our provider or adopting a new SDK.

### Context and execution budgets

Use token-aware context assembly with reserved room for tool schemas and output.
Compact completed history into attributed, versioned summaries retaining open
goals, uncertainties, source references, and supersession markers. Keep raw
history durable and retrievable. Context omission must be observable and
recoverable; compaction is not truncating every result to its prefix.
Provider-native compaction is a possible future optimization, not assumed to be
supported by this gateway; the [official compaction guide](https://developers.openai.com/api/docs/guides/compaction)
illustrates carrying state forward rather than losing the tail.

Keep per-call timeouts, sandbox isolation, input/schema validation, owner checks,
consent gates, idempotency, quotas, and concurrency fencing. Distinguish:

- **Normal work:** continue while progress is being made and authority holds.
- **No-progress loop:** repeated normalized call + same result/error + unchanged
  state is evidence to change approach or pause. Cache reuse alone is not a loop;
  retries can be legitimate. Track signals across attempts, not just call count.
- **Operational budget exhausted:** checkpoint and report a resumable pause with
  reason and completed work. Do not force “best answer now” or erase evidence.
- **Provider incomplete output:** retain supported status/usage metadata, retry,
  split, or continue deliberately. Never execute partial tool arguments.

Every retained limit must have an owner, units, purpose, observable exhaustion
behavior, continuation strategy, and boundary test. Batch/cardinality limits must
not become total-memory ceilings. Validate accepted/rejected/deferred coverage
before advancing source watermarks or publishing a revision.

Examples to retain/review as operational policy rather than blindly remove:
the current 100 daily calculation-call quota (`astrologer-run.ts:43,391`),
provider request timeout (default 45 seconds, configurable within 5–120 seconds),
Atros command timeout/retry policy, dispatch batch sizes, and worker leases.
Quota exhaustion should be visible and resumable under an authorized budget;
it must not masquerade as absent birth data or missing calculations.

### Chat synchronization

The separate delayed-message problem remains: `AstrologerChat.tsx:142–173` sets
busy state without appending the submitted message, then waits for run events
to reload persisted messages. Show an immediate pending bubble keyed by stable
`clientMessageId`; reconcile with the acknowledged message ID without duplicates.
Preserve that key on retry, show send failure, and keep drafting distinct from
whether another turn can execute. Return durable acceptance before waiting on
worker startup. Refresh capability state on preference change, route/focus
re-entry, and authoritative event/detail responses, including other tabs.

## Execution sequence and acceptance gates

These are proposed next changes, all unchecked. Do not call a phase complete
because its unit tests or HTTP responses pass.

1. **Evidence delivery + current-state context**
   - [ ] Replace planned-tool prefixes in answer and verifier with typed results.
   - [ ] Version/invalidate working context; implement authoritative state refresh.
   - [ ] Fix immediate message echo and acknowledgement reconciliation.
   - [ ] Test a table whose needed row is beyond character 300; assert the exact
     dated row reaches answer and verifier, and no request for an existing table.
   - [ ] Same chat: off → on → dated question → off, plus second-tab changes and
     mid-run disable. Enabled state works; disabled state never exposes Atros.

2. **Adaptive loop + recoverable context access**
   - [ ] Expose typed, allowed Atros/source/person read tools during work.
   - [ ] Remove silent plan rewriting and forced-final behavior in favor of
     progress-aware control and durable pause/continuation.
   - [ ] Add provider incomplete-status handling and full artifact provenance.
   - [ ] Test insufficient first result → second tool request → supported answer;
     useful work exceeding 16 calls; repeated no-progress failures; retry after
     timeout without duplicate side effects; an oversized first context item
     followed by essential smaller evidence; original-span retrieval after compaction.
   - [ ] Verify user/import text cannot select another owner, enable disabled
     tools, run arbitrary shell commands, or bypass publication/consent checks.

3. **Memory coverage and scale boundaries**
   - [ ] Page countercontext/conflicts/support; add source and output chunking.
   - [ ] Reconcile composition/verifier cardinalities with complete coverage.
   - [ ] Store all unresolved work and complete provenance outside prompt budgets.
   - [ ] Test older counterexample beyond row 200, more than 200 proposed item
     keys, more than 50 unresolved gaps, API-row-limit boundaries, and a multi-
     source correction backlog. Assert no unreviewed publication, skipped source
     watermark, discarded accepted history, or loss of explicit corrections.

4. **Hosted proof and visual acceptance**
   - [ ] Use isolated staging, the existing working model, and real Atros.
   - [ ] Exercise immediate echo, existing-chat mode change, adaptive dated
     calculations, missing-birth clarification, follow-up recall, and recovery.
   - [ ] Persist private screenshots/traces at desktop, laptop, and mobile widths
     and compare with approved mocks. Verify behavior and useful answers, not
     only route rendering. Redact personal data from reviewable artifacts.
   - [ ] Release only after these paths pass on the exact candidate commit.

No legacy-profile recovery project, unrestricted shell tool, provider expansion,
or production data cleanup is implied by this sequence.

## Verification performed for this audit

Ran six existing unit suites: `selected-context`, `agent-budget`, `agent-tools`,
`run-mode`, `provider`, and `person-model/consolidation`: **54 tests passed**.
Some tests explicitly encode the current forced-finish and omission behavior;
their success is baseline evidence, not endorsement of that behavior.

Ran direct local synthetic probes against the actual exported context builders
and Chat response parser (no network/provider/database use):

- Oversized first selected source suppresses a later small source: reproduced.
- Oversized first person object suppresses a later small object: reproduced.
- Chat response with `finish_reason: "length"` is accepted but the finish reason
  is not retained in the parsed result: reproduced.

The unit suites do not prove same-chat mode synchronization, adaptive CLI use,
large-memory coverage, visual parity, or a production fix. Those are deliberately
listed as future acceptance gates above.
