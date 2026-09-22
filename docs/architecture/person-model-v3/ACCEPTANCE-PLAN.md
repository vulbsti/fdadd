# Acceptance and release evidence

The approved UI is complete only when its content and interactions are produced by persistent backend state. A screenshot populated with hand-written examples does not pass these checks.

## Test corpus

Build a private, reviewed fixture corpus from the user-authorized example conversations and synthetic alternatives. Keep personal transcripts out of public fixtures/logs. Start with at least 20 small person histories covering sparse information, long histories, different life domains, corrections, contradictory sources, unknown dates, repeated assistant claims, and branching imports. Include the reviewed mission/solitude cases but do not optimize only for this person.

Annotate expected source attribution, known episodes, unknown meanings, must-preserve exceptions, valid questions, and forbidden conclusions. Multiple faithful phrasings and chapter groupings are acceptable. Evaluate semantic properties rather than matching a single generated paragraph.

Repeat reasoning fixtures under the configured model/guidance versions at least three times to expose unstable failures. Hard invariants must pass every time. Use an independent verifier plus human review of a representative set for depth, specificity, useful inquiry, and respect for counterexamples. The initial quality gate is no unsupported biographical assertions and at least 4/5 on each of specificity, coherence, and usefulness for reviewed samples. Those ratings are evaluation criteria, not person scores.

## Critical product and reasoning cases

| ID | Input/action | Required outcome | Failure it catches |
|---|---|---|---|
| C01 | Create a name-only person, astrology off | Chat and a sparse personal map work; birth data remains optional | Birth-gated product |
| C02 | Provide age-15 mission, later philosophical challenge, partly changed goal | Episode, meaning change, open gap and chapter appear; new meaning is not invented | Generic/fabricated life narrative |
| C03 | Open A mission changes meaning, then reload/back | Focused view reads the same versioned objects; breadcrumb/back restore overview | Decorative expansion without data identity |
| C04 | Explore the chapter and answer what changed | One source input resolves/refines the gap; chapter, brief, and suggestions update together | A chat that never updates understanding |
| C05 | Open a different chat after C04 | Companion uses the revised meaning and can retrieve its source | Session-local memory |
| C06 | Supply productive solitude and draining prolonged isolation | Both accounts remain; context/condition question appears; no fixed incapable-of-discipline label | Contradiction flattening |
| C07 | Add a productive day alone without social contact | Necessary-social-contact hypothesis is qualified/rejected; dependent suggestion is revised | Confirmation bias |
| C08 | Correct job date from 2024 to 2025 | Active date and dependent timeline/scenarios change; historical correction is traceable | Status-only mutation |
| C09 | Import five copied assistant interpretations plus one direct user correction | Copies do not count as independent evidence; correction dominates active account | Evidence laundering |
| C10 | Cite an exact quote unrelated to the proposed claim | Semantic verification rejects the claim despite valid substring/source ID | Citation-shaped hallucination |
| C11 | Discuss a parent's experience or a hypothetical story | Subject/epistemic attribution preserved; not recorded as the user's own event | Pronoun/subject confusion |
| C12 | Provide an old current-state snapshot | It is dated history; present advice asks for necessary update or qualifies freshness | Stale present/future |
| C13 | Supply little family information | Unknown domain stays sparse; useful optional invitation, no invented roles or events | Filling space with generic profile prose |
| C14 | Provide a caregiving/family-responsibility history | Map, patterns, and paths concern that life, not automatic publishing/productivity advice | Overfitting the original user |
| C15 | Personal-only suggestions for a goal with an unresolved constraint | Clarifying question precedes an action relying on that constraint | Premature advice |
| C16 | Answer/dismiss a suggestion, then open another chat | Same and paraphrased duplicate prompts are suppressed until materially new context | Repeated questions across chats |
| C17 | Open an action card without accepting it | No accepted goal/action is inferred; explicit adaptation/dismissal works | Click-through treated as commitment |
| C18 | Report that an accepted experiment did not help | Outcome updates pattern/action relevance; no automatic success interpretation | Self-confirming learning |
| C19 | Choose a time/domain filter and expand a node | Relevant objects remain reachable; viewport/back state survives update | Lost overview context |
| C20 | Reject a working explanation without elaborating | Rejected premise and dependent advice stop; optional follow-up does not gate rejection | User corrections ignored |

## Astrology-mode and calculation cases

| ID | Input/action | Required outcome |
|---|---|---|
| A01 | Switch off with a populated personal/astro profile | No astrological overlay, derived claims, tools, guidance, or astrology-only suggestion enters the new view/context |
| A02 | Switch off inside an old astrology-heavy chat | Prior transcript remains attributable; new response uses personal-only sources and a clean personal brief |
| A03 | Feed an ordinary-sounding personality claim supported only by an old astrology reading | Claim is excluded from personal-only synthesis; removing planet names does not make it eligible |
| A04 | Toggle while a model request is in flight, including from another tab | Old epoch cannot publish into the new-mode foreground; input is retained and response safely retried |
| A05 | Switch on without birth data or during Atros failure | Personal map stays usable; setup or recoverable overlay error is honest |
| A06 | Correct birth time/settings/engine version | Compatible cache only; affected interpretations/scenarios become stale; personal history remains intact |
| A07 | Request a specific historical transit/dasha window | Typed request reaches correct CLI function/options; full structured output is available to verifier |
| A08 | Atros returns an error nested in a wrapper | Run records a calculation failure; no successful calculation claim or error-result cache entry |
| A09 | Change personal context with unchanged birth data | Interpretation dependencies update without pretending the astronomical calculation changed |
| A10 | Open a future branch | Conditions, desired goal, unknowns, and observable signs are explicit; no guaranteed forecast or invented probability |

## Import, search, and privacy cases

| ID | Input/action | Required outcome |
|---|---|---|
| I01 | Import a representative ChatGPT, Claude, Codex, and generic export | Roles/order/branches/dates preview correctly; each adapter has real sample coverage |
| I02 | Import the same file twice or retry after worker crash | No duplicate canonical sources or profile effects; receipt identifies replay/duplicates |
| I03 | Import unknown speakers, two people, or unclear pasted boundaries | Review requests mapping; no silent attribution to the selected person |
| I04 | Import a very large conversation within limits | Bounded chunks retain necessary context and processing watermark; no silent tail loss |
| I05 | Import prompt instructions or malicious HTML/ZIP paths | Content stays inert; no permission/tool changes, executable rendering, or path escape |
| I06 | Search imported/native conversations with equal timestamps | Correct owned message/branch opens; pagination skips none and duplicates none |
| I07 | Exclude an import while a model/update job runs | Immediate eligibility revocation; stale worker cannot publish; dependent current content suppressed |
| I08 | Delete an import whose facts also have independent support | Raw selected content removed; survivors re-verified; unsupported derivatives and cached snippets purged |
| I09 | Delete person while export/download/consolidation is pending | Jobs and links lose eligibility; no resurrection via retry or stale export |
| I10 | Open Private | Access, processing, inclusion and actual data controls work; no public-sharing or end-to-end-encryption claim |
| I11 | Authenticated user B guesses user A's object/import/run IDs | All API, SQL, storage, stream and export paths deny access without leaking existence/content |
| I12 | Browser attempts direct trusted-role/chart/revision writes | Rejected by grants/RPC boundaries even for its own account |

## Durability and consistency cases

| ID | Fault/action | Required outcome |
|---|---|---|
| D01 | Crash after input transaction, before Workflow start | Outbox dispatcher/sweeper starts accepted work without a new user message |
| D02 | Lose response from Workflow start; dispatch again | Domain job claim/fence prevents duplicate effects; one logical commit |
| D03 | Crash after revision commit, before job completion response | Retry returns committed revision; no duplicate source, message, or suggestion |
| D04 | Two chats update different aspects of one person concurrently | No profile-wide blockage; serialized publication preserves both or rebases stale work |
| D05 | Two chats give conflicting dates concurrently | Explicit unresolved conflict/correction handling; no last-writer-wins guess |
| D06 | Lease expires during a slow provider call | New worker fence prevents stale worker publication; bounded recoverable state |
| D07 | Provider fails, quota exhausted, malformed output, or verifier repairs exhausted | Accepted user source still learns if eligible; invalid candidate not published; user sees a recoverable state |
| D08 | Detailed answer exceeds old 500-character receipt limit | Full final answer/question/status persists from typed payload; refresh preserves it |
| D09 | Reconnect an expired event stream | Current canonical answer/question/profile revision comes from DB, not only transient events |
| D10 | Profile update arrives while a focused view is open | Whole revision swaps coherently without stale edges or lost focus |
| D11 | Same command ID with same/different body | Same body replays; changed body conflicts; no duplicate effect |
| D12 | Roll back UI/worker deployment after v3 input exists | No source loss and no reactivation of privacy-excluded or corrected content |

## Layered verification

1. **Schema and unit:** discriminated payloads, date precision, suggestion eligibility, dependency traversal, canonical cache keys, parser behavior, and mode/context filtering.
2. **Database integration:** owner restrictions, role restrictions, composite FKs, revision publication, idempotency, watermarks, conflict handling, deletion and concurrent transactions using multiple fixture users.
3. **Agent evaluation:** exact source spans, direct/derived distinctions, meaningful pattern conditions, preserved exceptions, generic-copy/name-swap failures, valid gap/action derivation, and update behavior across model runs.
4. **Provider/calculation integration:** configured provider tool protocol, typed complete tool results, real Atros chart/dasha calls, calculation failure and cached/recomputed outputs.
5. **Browser:** all visible controls, full guided learning loop, visual comparisons to the four approved screens, responsive/keyboard use, back/reload/deep links, empty/loading/error states.
6. **Deployed environment:** commit/build metadata, applied migration versions, worker registration, upload/storage access, outbox sweep, real authenticated conversation/import and profile revision. Local tests alone cannot validate this.

## Release receipt

Store one receipt per candidate build identifying source commit, database migration set, provider/model/guidance versions, Atros version, test corpus version, environment, evaluated mode, timestamps, test outcomes, latency/cost observations, and artifact paths. Use sanitized operational IDs and bounded summaries; do not publish private transcript text.

Hard release gates: no cross-person leak, no off-mode astrology leakage, no unsupported biography in reviewed fixtures, no lost correction/input on retries, no stale publication after exclusion/deletion, no placeholder control, and a passing end-to-end guided-update loop. Every question/action must have valid current dependencies and a useful, supported purpose. Passing these gates supports a release decision; it does not establish an infallible model of a person's mind.

Existing baseline on September 20: 23 unit tests passed. None of the new acceptance cases above is claimed implemented or passing yet. Progress reports must distinguish implemented code, local tests, database integration, agent evaluation, browser behavior, and deployment evidence.
