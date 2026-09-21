# Person model v3 — execution specification

Date: September 20, 2026. Status: proposed implementation contract. Approved UI references: [v2 mockups](../../design/astrologer-ui-mocks/2026-09-19/v2-life-map/README.md). Supporting documents: [audit](CURRENT-STATE-AUDIT.md), [interaction contract](UI-BEHAVIOR-CONTRACT.md), [acceptance plan](ACCEPTANCE-PLAN.md).

## 1. Outcome and architectural decisions

The product maintains a revisable understanding of a person that explains their experiences, reported meanings, current circumstances, recurring patterns, relationships, goals, and possible paths. It helps a person discover useful questions without requiring expert prompts. Its understanding remains provisional and inspectable.

Keep Next.js, Supabase/Postgres, the current provider adapter, Vercel Workflow, and the allowlisted Atros CLI in Vercel Sandbox. Use relational records and typed relations in Postgres; a separate graph database is unnecessary. Retrieval helps inspect sources; it does not own the current person model.

Five boundaries are authoritative:

1. **Source archive:** what someone actually said, when, in which conversation, and about whom.
2. **Current personal understanding:** a revisioned set of connected objects plus a coherent concise brief, with active hypotheses, counterexamples, and gaps.
3. **Astrological material:** immutable calculation versions and separately revisable interpretations tied to personal context.
4. **Conversation/run state:** current intent, working context, tool results, questions, retries, and outputs.
5. **Presentation and suggestions:** versioned projections of the current understanding, with traceable dependencies.

The personal understanding is independently useful when astrology is off. Neither the UI nor a chat session owns its own competing copy of the person.

## 2. Persistence model

### Identity, ownership, and versions

Retain `astro_profiles.id` as the stable person ID to avoid rewriting every existing reference. Expand its responsibility to person identity; legacy astrology naming can be hidden behind a PersonStore. Do not rename the entire database during this migration.

Add a person lifecycle independent of chart initialization; allow creation with a name only. Move active birth information toward `person_birth_revisions` and relax legacy birth NOT NULL constraints only after compatibility readers/writers are deployed. `person_status` and `astro_status` must be independent. Existing `initialization_status` remains a legacy adapter during cutover.

Every domain table includes `user_id`, `profile_id`, timestamps, and same-owner/profile constraints. Stable UUIDs identify objects; mutable prose and titles never act as identity keys. The authoritative published pointer is `person_model_heads.current_revision`. Existing `memory_version` becomes a compatibility mirror of that pointer, not a second independently updated counter.

Distinguish:

- `source_seq`: monotonically ordered accepted input for a person.
- `person_revision`: published personal model revision.
- `birth_revision` and `calculation_revision`: input and deterministic-output versions.
- `interpretation_revision`: reading tied to a particular person/calculation version.
- `mode_epoch`: reasoning-mode preference version.
- `privacy_epoch`: eligibility/deletion version checked at reads, model calls, and publication.
- `schema_version`, `guidance_version`, and `model_policy_version`: implementation/evaluation provenance.

A timestamp is not a concurrency token. A chat's run version is not a person revision.

### Proposed tables and record families

These are additive logical tables to implement through forward migrations. Exact column constraints and indexes must accompany the migration; do not hide integrity-critical fields solely inside JSON.

| Table/family | Minimum content and responsibility |
|---|---|
| `person_model_heads` | Person ID, published revision, processed source watermark, privacy epoch, publication state; one row/person |
| `person_preferences` | Astrology enabled, mode epoch, selected domain preferences, locale; authorized changes only |
| `person_source_items` | Native/imported message or explicit correction reference, source sequence, speaker role, subject identity, source time, ingestion time, original order, inclusion status, lineage/dedup key, retention metadata |
| `person_observations` | Source span/offset, exact quote where applicable, normalized assertion, subject, domain, event-time bounds/precision, assertion type, extraction/verifier versions; observations do not automatically become profile claims |
| `person_objects` | Stable identity, object kind, owner/person, current object-version pointer; kinds listed below |
| `person_object_versions` | Immutable typed payload version, epistemic class, lifecycle, effective-time bounds, source/observation support, contradiction and qualification references |
| `person_relations` and versions | Stable relation ID, typed endpoints, `precedes`, `reported_effect`, `changed_meaning`, `supports`, `qualifies`, `contradicts`, `influenced`, `part_of`, `hypothesized_link`; own evidence and epistemic class |
| `person_conflicts` | Competing assertions, conflict type, active alternatives, resolution/correction links, consequences blocked by the conflict |
| `person_model_revisions` | Parent revision, processed watermark, object/edge version membership, coherent personal brief, changed IDs, bounded decision summary, verifier receipt, job ID and schema/guidance versions |
| `person_view_snapshots` | Revision-keyed overview/detail manifests and summaries; deterministic layout input, presentation order, dependencies; multiple views reference the same versions |
| `person_suggestions` and versions | Question/action/exploration proposal, dependencies, purpose, mode, validity rules, originating revision, semantic duplicate key |
| `person_suggestion_events` | Shown/opened/answered/accepted/adapted/dismissed/snoozed/completed/invalidated events, linked message or outcome; transitions idempotent |
| `person_birth_revisions` | Birth date/time/place/timezone and uncertainty, origin and correction history; never invent a missing birth time |
| `person_astro_interpretations` | Calculation references, base person revision, reading, compatible/contradicting personal context, alternatives, sensitivity, status and dependency list |
| `person_imports` and `person_import_items` | File manifest, parser version, selected conversations/branches, identity mapping, preview decision, processing watermark, errors and source links |
| `person_jobs`, `person_outbox`, `person_job_steps` | Durable dispatch, input watermark, base revision, lease/attempt/fence, stage result references, retry state and budgets |
| `person_changes` | Explicit correction/rejection/exclusion/deletion requests and affected IDs; authorized intent, not hidden chain-of-thought |
| `person_run_payloads` | Typed full tool/analysis/final-response payloads with access/retention controls; separate from bounded operational logs |

Reuse `astro_messages`, `astro_sessions`, `astro_agent_runs`, and calculation cache where their contracts fit. Source items point to native messages rather than duplicating full text. Imported canonical messages can live in the same transcript tables with explicit origin and original timestamps/order; service parsers, not clients, assign role and origin. Existing evidence/fact/history tables remain readable during migration, then become adapters or archived legacy input. There must be exactly one authoritative write path per concept after cutover.

### Typed personal objects

Use discriminated payload schemas. A generic bag of arbitrary keys cannot drive the approved views reliably.

| Object | Required distinctions |
|---|---|
| `episode` | What occurred, uncertain date/range or age, setting, people, user-reported experience, reported effects, unresolved interpretation |
| `meaning_change` | Prior belief/value/expectation, experience that challenged it, later meaning if actually known, effective period, unknown remainder |
| `pattern` | Trigger/context, expectation or attention, response, reported consequence, supporting episodes, exceptions, alternative explanations, scope/time range |
| `influence` | Person/environment/entity, relationship label as reported, connected episodes and experienced influence; no claimed access to another person's mind |
| `goal` | User-stated desired outcome or value, active/paused/changed status, timeframe if supplied, related purpose; model-proposed goals stay separate |
| `issue` | User's described concern/tension, present relevance, constraints, what is unresolved; avoid converting distress into a diagnosis |
| `current_state` | Dated account of present circumstances, source freshness and open checks; an old present snapshot becomes historical |
| `gap` | Specific missing distinction, why it matters, what decision/interpretation it blocks, candidate question, optional/deferred/answered status |
| `scenario` | Current-state basis, goal, conditions, possible development, counterconditions, observable signs, uncertainty, personal/astro basis, time horizon |
| `chapter` | Meaningful grouping of episodes/changes, membership and ordering, brief theme, supported title, unresolved questions; hierarchy is editorial, not new evidence |

Store `reported`, `working_hypothesis`, and `unknown` distinctly. User endorsement is an additional attribute, not proof of psychological causality. An astronomical calculation is a calculated datum; a life reading based on it remains interpretation. Numerical model confidence cannot convert an interpretation into fact.

Time fields separate **when something happened**, **when the person said it**, and **when the system learned it**. An age-only event stays age-only unless a known birth date supports a marked derived range. Unknown order uses an explicit partial order; do not force exact chronology to make a neat line.

Current-state freshness is domain-dependent: a historical scholarship does not expire, whereas an unlaunched first product is a dated state that may soon change. Give mutable present claims review conditions instead of silently carrying them forward as today's truth. Passage of time can make a suggestion stale; it cannot establish that an event happened.

### Integrity, queries, and storage boundaries

- Composite FKs enforce owner/person agreement for all object, source, relation, suggestion, and calculation references. Validate that endpoints exist in the revision being published.
- Index `(profile_id,source_seq)`, `(profile_id,kind,lifecycle)`, active relation endpoints, revision membership, dependency targets, and runnable jobs. Index referencing FK columns used by reads/deletion. Use GIN full-text indexes for source discovery; embeddings are optional later search enhancements.
- Read-only profile projections respect RLS. Client roles have no direct writes to trusted source roles, calculation provenance, revision pointers, or worker state. Explicit entry RPCs are narrowly granted; service-only functions derive person/owner from authorized job IDs.
- Unknown speaker/subject mappings cannot silently become first-person facts. Quotes must match the attributed source span, and the asserted meaning must pass a separate semantic check.
- Source archive and revision history are append-only during normal use, with an explicit privileged deletion path. Immutability must not defeat the user's data deletion request.
- Store concise reasons, evidence links, alternatives, and outcomes. Do not store hidden chain-of-thought as the person's profile or expose it as an explanation.

## 3. Agent responsibilities and execution

One companion is visible to the user. Internally use bounded stages with explicit inputs/outputs; these can use the same configured model. Do not introduce autonomous agents with separate memories or unbounded agent-to-agent conversation.

| Role | Reads | Produces | Cannot do |
|---|---|---|---|
| Conversation companion | Current permitted person brief, selected connection, relevant details, local dialogue, eligible suggestions; astro data only in on mode | Answer, focused question, staged observations, explicit user intents | Publish arbitrary profile mutations or mark its own prose as evidence |
| Extractor | Newly accepted source spans, trusted author/subject metadata, limited neighboring text | Attributed observations, possible episode matches, corrections, gaps | Invent unmentioned experience or infer truth from assistant repetition |
| Reconciler | Observations, affected objects/relations, alternatives, related original sources | Typed change set and dependency invalidations | Commit directly or erase disagreement to obtain a tidy story |
| Profile editor | Verified change set, current whole-person brief, domain coverage | Coherent concise personal brief, chapter/overview selection, updated patterns and detail text | Fill unknown life domains with boilerplate |
| Suggestion planner | Goals, issues, constraints, gaps, scenario conditions, prior suggestion outcomes | Ranked candidate questions, explorations, and actions with validity rules | Invent a goal or consider a displayed card accepted |
| Verifier | Candidate claims/change set, exact source spans, calculations where eligible | Field-level findings and bounded correction requests | Approve based only on plausible prose, record IDs, or model confidence |
| Publisher | Validated versioned payloads and job authority | One atomic revision and update event | Perform semantic inference inside the transaction |

### Mandatory ingestion

When a user message, reviewed import batch, explicit event, correction, or suggestion answer is accepted:

1. Authenticate and resolve owned person/session; capture mode/privacy epochs.
2. In one transaction, persist the input, assign its source sequence, mark it eligible according to source settings, and enqueue a unique consolidation outbox event. For chat also create the conversation run/outbox event. Repeated client IDs return the same records.
3. Return persisted IDs immediately. Chat rendering does not wait for the full profile revision.
4. A dispatcher claims pending work and starts the appropriate Workflow. In-process background promises are not the only execution path.

Profile learning survives provider answer failure. If the user pauses inclusion for a conversation, its messages remain visible there but do not enter cross-chat profile context until inclusion is enabled.

### Conversation path

Read a pinned published revision and the selected session's recent dialogue. Include the latest unprocessed user-source delta as explicitly unsynthesized context when consolidation lags; do not tell the user the profile is fully updated. If a recent cross-chat correction affects the topic, honor its immediate invalidation even before the next published revision.

The context bundle always contains a concise personal brief, active relevant goals/issues, important exceptions, current freshness, and relevant open questions. Then add selected object/detail records, exact supporting spans, and counterevidence as needed. Recent messages serve linguistic continuity. Source search returns excerpts plus resolvable typed IDs; the agent fetches full spans before making claims whose support is truncated.

Persist model tool calls and matching outputs as typed payloads. Tool registries expose calculation arguments directly when astrology is on. Final output uses a validated schema containing answer blocks, grounding, question/suggestion IDs, and terminal status. It is never reconstructed from log summaries.

Verify factual and interpretive claims against a claim-evidence matrix. Allow natural connective prose without a citation on every sentence, but require internally traceable support for personal claims and clearly scoped hypotheses. If verification cannot resolve a material claim, qualify, ask, or omit it. Persist the answer and question state atomically; emit the answer event only after persistence.

Do not run a full multi-stage biography rewrite before every chat reply. The conversational path is latency-sensitive; consolidation is the durable learning path. Ordinary turns may skip explicit planning calls when a direct response is sufficient, while still producing typed outputs and preserving evidence boundaries.

### Consolidation state machine

`queued → extract → reconcile → compose → plan_suggestions → verify → ready_to_publish → committed`.

Any stage can enter `retryable_failure`, `needs_user_clarification`, or `failed`. A clarification does not block publishing independent, supported updates. Unresolved parts remain alternatives/gaps and cannot support decisive actions.

At job creation, pin input high-watermark H and published revision R. Read eligible source deltas through H. Complete these steps:

1. **Extract:** identify direct accounts, dates, goals, effects, expectations, corrections, denials, and question answers. Keep context around quoted speech, hypotheticals, negation, third-party reports, and assistant interpretations.
2. **Match:** resolve existing episodes/entities by identity, time, semantic meaning, and source lineage. Similar vocabulary alone is insufficient for merging different experiences.
3. **Retrieve countercontext:** fetch earlier relevant observations, known exceptions, rejected interpretations, competing dates, and source material for affected connections. This step is explicit, not optional positive-match retrieval.
4. **Reconcile:** classify each difference as correction, change over time, context qualification, duplicate account, unresolved contradiction, or unsupported previous inference.
5. **Build changes:** create/revise/qualify/merge/split/supersede/retire objects and relations. Preserve original reported experience when only its meaning changes. Rejection removes a working explanation from active use, even if older assistant text repeated it.
6. **Recompose:** update the affected sections plus whole-person brief and overview selection. Check for disagreement across work, family, relationship, and other known domains; do not force a single theme across all of them.
7. **Replan:** answer/invalidate affected gaps and suggestions, refresh conditional scenarios, and nominate at most a few useful invitations.
8. **Verify:** validate schema, authorship, semantic support, date precision, mode separation, counterexamples, absence of generic filler, and referential consistency. Record issues by object/field.
9. **Publish:** atomically publish the candidate if base revision, privacy epoch, and source eligibility remain valid. Otherwise rebase/recompute the affected set; never use last-writer-wins for the person's model.

Incremental changes use the dependency graph to avoid rereading the whole archive. Trigger a broader audit after an import, birth change affecting interpretation, merge/split, or an accumulation threshold of 25 meaningful object changes; that default is tunable and evaluated. Broad audits inspect representative original sources and contradictions, not only summaries of summaries. No periodic job manufactures new personal events in the absence of input.

Bound jobs by input chunks, model calls, retries, and token budget. Initial policy: one extraction pass per bounded chunk, at most two verifier repair passes for a candidate, then publish the valid subset and preserve unresolved items. Carry a watermark across chunks; do not silently truncate a large import. Record cost and latency per stage for tuning.

### Publication transaction and concurrency

Do expensive extraction, retrieval, and model calls outside database locks. A publisher transaction:

1. Locks the person's head row briefly.
2. Checks job lease/fencing token, expected base revision, privacy epoch, and eligibility of every dependent source.
3. Validates all object/edge/suggestion references and their version membership.
4. Writes new object versions, relations, conflict outcomes, suggestion versions/invalidation events, coherent brief, and complete view manifests.
5. Writes revision R+1, advances the processed input watermark only through fully handled inputs, and swaps the head pointer.
6. Enqueues `person.updated` with revision and affected IDs; marks this logical commit ID complete.

The same commit ID returns the existing revision on retry. Two chats for the same person may answer concurrently from pinned context; their consolidation jobs publish serially. Two turns within one chat are sequenced to preserve dialogue. A stale candidate is rechecked against the new head, not blindly applied. A stale privacy epoch always prevents publication.

The old profile-wide active-run constraint must be replaced after these guards exist. Do not merely drop it before a safe publication path is available.

### Durable dispatch and repair

Use a transactional Postgres outbox with a fast dispatcher plus a scheduled application sweeper. This is application infrastructure, not a desktop reminder. The sweeper discovers undispatched jobs, expired leases, and database runs whose workflow is missing/terminal while the app still says active.

Worker claims are fenced; only the current lease holder can publish. Lease duration must exceed a permitted external-call timeout plus margin; start with a 180-second lease, a 90-second model-call timeout, and renewal before each external boundary. Long import work renews between bounded chunks. Reclaiming a job increments its fence. Retry backoff and a finite attempt limit end in a recoverable user-visible failure, never an indefinite spinner.

A duplicate Workflow may be started after an uncertain network response. It must acquire the domain job claim before any duplicate-sensitive work. Effect IDs are derived from stable job/stage/input identities, not model-generated prose or attempt number. Workflow replay does not by itself make external writes exactly once; idempotency and domain fences are required. See the [Workflow idempotency documentation](https://workflow-sdk.dev/docs/foundations/idempotency).

The implementation must test lease renewal against actual model/Sandbox timeouts. A waiting user question is a terminal conversation turn, not a job holding a worker lease. Long-lived clarification state lives in the database; the next user answer starts a new run. A content update failure must not lock the entire person out of chat.

Keep full private payloads in the controlled application store. Workflow stage inputs/returns should normally carry job/result references rather than entire biography or transcript text. Construct model prompts inside the step from permitted records. This makes retention and deletion more controllable and keeps operational logs small. Confirm the pinned Workflow SDK's supported APIs before implementing any feature shown only in newer documentation.

## 4. How questions and next steps are derived

Suggestions are part of the product's reasoning state. Every visible question/action must be reproducible from a specific model revision and contain a concise reason why it is relevant now.

### Suggestion schema

Required fields:

- Stable ID, person ID, kind `clarification|exploration|action|experiment|review`.
- User-facing title/prompt; response options if helpful, always allowing correction/free text.
- `purpose`: the goal/issue served or uncertainty resolved.
- `basisObjectVersions` and source/observation support; `gapId`, `goalId`, or `issueId` as appropriate.
- `mode` and astrology dependencies, if any.
- Preconditions, known constraints, expected useful result, and counterconditions.
- For a question: the distinction it tests and which interpretations/scenarios its answer could change.
- For an action: a small concrete behavior, who chose the goal, expected observation, effort estimate if justified, and a follow-up condition.
- `validUntil` or review condition, originating revision, semantic duplicate key, and lifecycle.

Separate these from `run.next_action`, which is an execution cursor such as retrieve evidence or resume a failed calculation.

### Selection policy

1. Generate candidates only from unresolved gaps, meaningful contrasts, current user goals/issues, scenario branch conditions, or an accepted action whose outcome is due for review.
2. Apply hard filters: ownership, permitted mode, valid support, current preconditions, no rejected premise, no unresolved critical contradiction, no recent equivalent question already answered or dismissed.
3. Prefer a needed clarification before advice that depends on it. Otherwise rank by current user intent, expected distinction gained, usefulness to a stated goal, specificity, reasonable burden, and coverage of neglected-but-relevant domains.
4. Apply diversity and repetition controls: normally one focused question in chat and up to three invitations in profile. No requirement to fill every slot.
5. Store candidates, eligibility decisions, chosen order, and short rationale. Ranking values are internal heuristics to evaluate, not calibrated psychological probabilities to show users.
6. Before display and before opening a suggestion, recheck its dependencies and current mode/privacy epoch. A previously served ID can become invalid.

For an action to count as profile-derived, it needs more than an attached source ID: a verifier must explain the link from an active user goal, through a supported constraint or opportunity, to that concrete next step. A generic action with an irrelevant evidence link fails.

### Example: solitude and momentum

Known: the person reports social exchange followed by deep solitary work, and separately reports ambition fading during prolonged isolation. These accounts establish a useful contrast; they do not prove that another person's approval is necessary.

Gap: which conditions differed on occasions when solitary work began and continued?

Question: On the last day you made progress alone, what was clear before you started?

Answer handling:

- If the person describes a well-defined technical problem and no social contact, add it as a counterexample to a necessary-social-contact explanation; revise the pattern's conditions.
- If the person describes discussing a problem with a colleague first, retain the reported sequence and explore what the discussion provided, without concluding that contact is always required.
- If they say the interpretation is wrong, retire/reject the relevant hypothesis and dependent suggestions; request their account only if they want to add it.

Only then might an experiment such as preparing one concrete question before a work session become appropriate, provided it serves a current goal the person endorsed. Do not recommend it universally from an astrology label.

### Lifecycle and learning from outcomes

`candidate → eligible → shown → opened → answered/accepted/adapted/dismissed/snoozed`.

Accepted actions can become `completed`, `not_helpful`, or `abandoned`; any active suggestion can become `invalidated` or `expired`. These are event-backed states with idempotent transitions. Clicking Explore starts discussion, not acceptance of advice. Clicking an answer option submits that answer; simply viewing it does not.

An answer creates a source record, resolves or refines its gap through consolidation, and updates affected patterns and paths. An action outcome becomes a user-reported observation; a single success is not a general causal discovery. Dismissal suppresses equivalent prompts until material new context or an explicit user request changes their relevance.

## 5. Worked example: A mission changes meaning

This is an acceptance fixture based on the reviewed personal account, not a hardcoded UI story.

1. Source spans describe the person's questions about life at 15, the mortality of admired scientists, the reported resolve to solve death, later identity/forever questions, and a statement that the goal acquired a new meaning.
2. Extract an age-15 episode, a reported meaning, two later philosophical questions, and a meaning-change object. Preserve the absence of an exact account of the new meaning.
3. Connect the episode to its reported meaning. Connect the later questions as the person's stated challenges to the goal. Do not insert invented intermediate experiences or exact dates.
4. Create a chapter containing those objects. Its overview title can be A mission changes meaning; its detail reads the exact same object versions as the timeline.
5. Add the gap: What did the goal come to mean after those questions? Tie it to the meaning-change object and a useful exploration invitation.
6. If independently supported, connect later work in AI and longevity to the continuing purpose. Keep the question of how fully that work expresses the evolved goal open.
7. The UI draws the episode/meaning/question structure from typed relations. Clicking the chapter resolves its stored ID and returns the detail projection. No LLM is needed on every click.
8. Explore in chat starts from that chapter and gap, with the relevant original spans available. It does not synthesize a fake user question as if the person had submitted it.
9. A later answer revises the meaning-change object, resolves or refines the gap, changes the focused diagram, and removes the now-answered invitation in one person revision.
10. A new chat uses that revised meaning without relying on the old chat's recent-message window. Astrology off retains the entire personal account and removes only optional interpretive connections.

The same machinery must work for a different person's family responsibility, relationship change, grief, or changed sense of belonging. A test with different domains is mandatory to prevent a product-specific career narrative from becoming the universal template.

## 6. Astrological calculation and interpretation boundary

### Calculation facts

Atros owns astronomical/dasha/chart calculations. Each calculation record identifies birth revision, engine/version, explicit calculation type and normalized options, time system/timezone, ayanamsa/house settings where applicable, output schema version, and result checksum. Keep complete structured results and return typed references or relevant fields to the model. Failures remain failures through every wrapper.

Expose explicit functions for chart, sensitivity, dated dasha/timeline, transit, and supported divisional/analysis requests. Enumerate the actual CLI capabilities from its checked-in implementation; do not advertise unsupported calculations. Date windows, requested levels, and as-of date are validated arguments, never inferred from a prose step by substring matching. Cache hashes use stable canonical serialization. Birth/profile edits and engine changes cannot reuse incompatible frozen results.

Correcting birth data creates a new birth revision. Old calculations remain attributable but inactive; dependent interpretations and suggestions are invalidated. The personal life map remains available. When birth time is uncertain, the reading records what changes across plausible inputs and avoids treating unstable placements as certain.

### Interpretation records

An interpretation includes a specific chart/period feature, the traditional meaning being considered, the personal episodes that make one reading relevant, competing readings, counterexamples, and remaining uncertainty. It cites both calculation and personal-object versions. It cannot add an unreported life event or convert a speculative forecast into past evidence.

When the personal model changes, an affected interpretation becomes stale. Regenerate only affected readings using dependency links. Serve a current personal map while the optional interpretation updates. An interpretation that depends on person revision R must not appear as if validated against R+1 without checking changed dependencies.

Life context can narrow the set of readings the companion discusses. The implementation must retain disconfirming accounts and alternatives; it must not select a reading merely because it matches the outcome in retrospect. Future scenarios are conditional; no invented success probabilities or inevitable-event claims.

### Enforcing personal-only mode

Mode filtering occurs at retrieval, context assembly, tool availability, suggestion eligibility, and projection serving. Annotate derivations with their dependency basis. Personal-only claims require a derivation from permitted personal sources; mixed claims must be split and independently re-established before entering the personal view.

Rebuild the personal brief from personal sources. Never reuse an old astrology-infused assistant summary and delete astrology vocabulary. Imported assistant astrology narratives cannot become personal evidence merely because they use ordinary psychological words.

The foreground companion always receives the mode and mode epoch. The personal consolidation pipeline remains personal-only; the optional interpretation job runs separately while enabled. Switching off stops new interpretation work and publication to the foreground. Switching on schedules only missing/stale reading work.

Cache/projection keys include person, revision, mode, and privacy epoch. At completion, a run checks that its mode epoch is still current; an old-mode answer is not published as a new-mode answer. Historical transcript display follows the UI contract rather than rewriting history.

## 7. Conversation imports

### Supported entry points

Ship adapters for ChatGPT exported conversation JSON, Claude exported conversation JSON, Codex JSONL conversation records, and a documented generic role/content JSON format. Also accept pasted or uploaded UTF-8 text/Markdown with a preview that confirms speaker boundaries. Unknown export versions receive a useful unsupported-format result and the generic/paste option; never guess speaker attribution silently.

The first release consumes user-provided exports. It does not require direct account connectors or access to the user's filesystem. Shared-chat URLs may be stored as references; automatic fetching is not implied by file import. Ordinary attached notes use the same ingestion infrastructure with a different source kind. Image/audio/PDF extraction is not silently claimed by a plus button; supported formats are clearly listed, with unsupported types rejected before upload.

Initial limits are explicit configuration: 25 MiB uploaded file, 100 MiB total expanded data, 2,000 archive entries, and 100,000 parsed messages per job. Larger collections are split into resumable imports. Bound ZIP expansion, reject path traversal and executable content, sanitize rendered Markdown/HTML, and never run code or tool instructions from exports.

### Durable flow

`uploaded → parsing → awaiting_review → confirmed → extracting → consolidating → complete`, with resumable failed/cancelled states.

1. Upload to a private owner-scoped location or submit pasted text. Record checksum, filename, size, detected format, parser version, and a job ID. Return progress immediately.
2. Parse trusted structural fields into normalized conversation/message records. Preserve author role, source timestamps, original order, branch IDs, attachments metadata, and source offsets. Codex internal/tool/system records are not personal user statements.
3. Preview conversation titles/counts, detected speakers, people mentioned, dates, duplicates, unsupported material, and ambiguities. Select conversations/branches, map the subject to a person, and choose inclusion. A file can discuss several people; do not assign every first-person statement to the selected profile without a confirmed speaker mapping.
4. User confirms the selection/mapping and inclusion scope. This is the import's review step; it does not require confirmation for every future normal consolidation update.
5. Create canonical source records idempotently. Chunk along conversation boundaries with enough adjacent context for pronouns and replies. Keep ambiguous material unresolved until clarified.
6. Feed those records through the same extraction/reconciliation/publication pipeline used for chat. No separate import-only biography writer.
7. Publish in bounded, consistent batches and show a completion receipt: conversations included, duplicates skipped, unresolved mappings, profile changes, and useful questions discovered. Distinguish processed source count from proven facts.
8. Imported conversations are searchable and readable in the sidebar with an Imported label. Continuing one creates a native continuation linked to the imported source; it does not rewrite the imported transcript.

### Trust and duplication

- An imported user statement is an attributed self-report, not independent real-world verification. A structured export helps preserve roles; it does not prove the author's identity cryptographically.
- An imported assistant statement is a prior interpretation. It may be useful context or a hypothesis to reconsider, never independent confirmation of a person claim. Quoting it in another chat does not make it a second independent source.
- Prefer exact provider conversation/message IDs when present, then owner-scoped content/lineage hashes. Preserve distinct re-tellings but link their shared event lineage; repeated accounts do not multiply evidence independence.
- Branches in exported chats retain branch identity. Two alternative assistant answers are not two chronological experiences. Import selection must make the chosen branches clear.
- A later explicit user correction can supersede an earlier date. A newer assistant summary cannot override it merely because it was ingested later.
- Source text is untrusted data. Instructions inside it cannot change the worker's permissions, tools, profile ownership, or guidance.

Removing or excluding an import immediately makes its sources ineligible and invalidates dependent claims/suggestions. Keep a derived record only if remaining independent support still justifies it; re-verify that support. See deletion semantics below.

## 8. APIs and UI projections

Keep the existing `/api/astrologer` prefix during this implementation. `P` below means `/api/astrologer/profiles/{personId}`. Every route resolves authenticated ownership and validates object/person agreement. Client-supplied biography, evidence, or owner IDs are never trusted as canonical state.

| Endpoint | Contract |
|---|---|
| `POST /profiles` | Create a person without requiring birth information; name + idempotency key |
| `GET P/model` | Compact current personal brief, revision/watermark/freshness, coverage/gaps, mode and readiness |
| `GET P/views/{view}` | Life-map, patterns, people, or paths projection; query by domain/time, pinned revision if permitted |
| `GET P/objects/{objectId}` | Focused object/connection/chapter detail, related objects, support controls, valid exploration IDs |
| `GET P/history` | Revision list and meaningful changes; permission/deletion filtering still applies |
| `GET P/suggestions` | Currently eligible ordered invitations, with dependency revalidation |
| `POST P/suggestions/{id}/events` | Idempotent answer/accept/adapt/dismiss/snooze/outcome event; typed payload and expected suggestion version |
| `POST P/explorations` | Resolve exploration/object server-side; create/reuse session and opening run; return context route and IDs |
| `POST P/changes` | Add event, correct account, reject interpretation, or add meaning; target IDs, expected revision, user account, client command ID |
| `PATCH P/preferences` | Change astrology mode/name/preferences with expected epoch/version; returns fresh mode and required refresh keys |
| `POST P/birth-revisions` | Validate and store corrected birth inputs; invalidate incompatible calculations/readings; enqueue calculation job |
| `GET P/conversations/search` | Owned source-aware search results with message anchors and permitted snippets |
| `POST P/imports` | Create upload/paste import and start parsing |
| `GET P/imports/{id}` | Preview/progress/errors/receipt; canonical selected items |
| `POST P/imports/{id}/confirm` | Commit user-reviewed conversation and speaker/person mapping |
| `POST P/imports/{id}/retry` | Resume incomplete stages idempotently |
| `PATCH P/sources/{id}` | Include/exclude a conversation or import; increments privacy eligibility epoch |
| `GET P/privacy` | Actual access/processing/retention configuration and active deletion/export status |
| `POST P/exports` | Create an owner-only export job with short-lived download access |
| `DELETE P/imports/{id}` / `DELETE P` | Confirmed removal request; immediate eligibility revocation plus durable purge/rebuild job |
| `GET P/updates` | Revision/job/status stream with replay cursor; polling fallback reads the same durable state |

Extend existing session/chat/run APIs with profile-scoped search, stable pagination, exploration references, message sequence, mode/privacy epoch, and typed final-response objects. Keep compatibility adapters for current routes until the new shell is deployed.

GETs never trigger an uncontrolled LLM rebuild. A stale projection can enqueue one deduplicated refresh, return the last permitted revision with freshness status, and notify on completion. Private responses use explicit private/no-store HTTP semantics; no shared CDN caching of person content.

### Projection envelope

Every view/detail response includes:

```json
{
  "personRevision": 42,
  "sourceWatermark": 118,
  "mode": "personal",
  "modeEpoch": 7,
  "privacyEpoch": 3,
  "updateState": "current",
  "view": "chapter",
  "objectId": "stable-owned-uuid",
  "title": "A mission changes meaning",
  "nodes": [],
  "edges": [],
  "explorationIds": [],
  "generatedAt": "2026-09-20T00:00:00Z"
}
```

The values are illustrative; UUID syntax and schemas are enforced in implementation. Nodes contain semantic content and stable order/layout hints, not model-authored HTML. Edges distinguish chronology, reported impact, hypothesis, and astrological interpretation. The frontend computes positions deterministically and preserves selection across updates. Each node's expansion resolves the same versioned canonical records used in the overview.

Overview curation balances user-marked significance, actual reported meaning, current relevance, coverage across known domains/time, and unresolved connections. Do not sort solely by recency or emotional intensity. Omitted detail stays reachable through chapters, filters, and search. A short life history should remain short rather than be inflated to match the screenshot.

### Error and transition semantics

Use stable error codes for `not_owned_or_missing`, `stale_revision`, `mode_changed`, `source_excluded`, `unsupported_import`, `needs_mapping`, `quota_exceeded`, `calculation_failed`, and `retryable_job_failure`. Avoid exposing another person's existence through distinct forbidden/missing responses. Retries return the original accepted command when its idempotency key and body match; a reused key with different content returns conflict.

A correction endpoint returns accepted change ID plus immediate invalidated IDs. Projection APIs suppress them until a coherent revision is ready. An answered question that another tab tries to answer again returns its current state and allows a new explicit correction rather than duplicate learning.

## 9. Guidance, context budgets, and model evaluation

Add a versioned internal guidance catalog for interviewing, life-event interpretation, pattern comparison, ambiguity/conflict handling, suggestion formulation, astrology interpretation, and import attribution. Each entry declares when it applies, required inputs, tool scope, structured output, and evaluation cases. Load only relevant guidance; do not dump every skill into every turn.

The core policy for personal-source support, subject attribution, uncertainty, and correction handling is always present. Astrology guidance is unavailable in personal-only mode. Guidance selection uses current intent and object kind, not only superficial keywords.

Personal adaptation is stored as scoped conversational preferences or observed useful approaches, with evidence and expiry/review conditions. For example, a user can prefer one question at a time or say that a kind of suggestion is unhelpful. This does not authorize rewriting shared skills, changing model weights, or altering application code. Shared changes require versioned review and regression evaluation.

Start with an explicit context budget divided among the personal brief, selected connection, source/counterexample spans, local dialogue, and working tool results. The exact token sizes are calibrated to the configured model; log budget use and dropped-context categories. Never silently drop the only counterexample or a correction to fit more supportive material. Prefer fetching narrow full records over sending truncated giant tool objects.

Structural validation can guarantee ownership, allowed transitions, and support links. It cannot mathematically guarantee that an LLM understands a life correctly. Therefore require a reviewed evaluation corpus, semantic verifier checks, visible correction controls, and continuing outcome feedback. The acceptance plan makes these limits testable instead of treating a plausible paragraph as proof.

## 10. Privacy, forgetting, and retention

The lock represents account-scoped access. Protect all person data and storage with explicit grants, owner policies, and scoped worker access. Views must not bypass those protections. [Supabase's RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) distinguishes table privileges from row policies; the migration and tests must cover both.

Distinguish three operations:

1. **Retire understanding:** remove an outdated or unsupported interpretation from active context while retaining history and sources.
2. **Exclude a source:** keep the original conversation for its owner to read, but revoke its use in profile derivation, cross-chat retrieval, suggestions, and model context. Rebuild dependent understanding from remaining support.
3. **Delete/forget:** remove the selected raw content and unsupported derived content, including affected revision payloads, projections, caches, search entries, exports, and controlled worker payloads. This is not implemented by a `retired` flag.

At exclusion/deletion request time, increment privacy epoch, fence active workers, block affected retrieval, suppress dependent current UI content, and enqueue durable work. The purge traverses dependency edges; independent surviving support must be rechecked before retaining a derived claim. Pending model calls cannot publish stale results after the request. Minimal non-content operation receipts may remain for idempotency; do not retain the forgotten personal text inside audit metadata.

Application deletion can revoke active access immediately. Backup retention and external provider retention follow configured policies; disclose those limits honestly. Do not claim immediate erasure from infrastructure the application cannot purge. Avoid persisting raw biography in Workflow logs/results so fewer uncontrolled copies need handling.

Retries and backfills must respect non-content deletion tombstones. Re-importing a previously removed source requires a new explicit inclusion decision; a stale queued import cannot resurrect it. A new independent user account can supply new evidence, but it must not silently restore deleted original source text.

Exports contain selected source conversations, current objects/relations, relevant versions and permissions/settings in readable plus machine-readable form. Downloads are short-lived and owner-authorized. Export jobs are invalidated by later deletion/privacy changes and must not provide a stale deleted snapshot.

## 11. Implementation work packages

Work packages are ordered by dependency and a demonstrable exit condition, not by arbitrary dates. Implement each through a reviewable change; keep the approved UI appearance throughout. The full requested scope is the completion of all packages, not just the first vertical slice.

| Package | Changes and code ownership | Exit condition |
|---|---|---|
| WP0 — repair execution | `src/workflows/astrologer-run.ts`, `src/lib/astro/agent-tools.ts`, `agent-context.ts`, `api-helpers.ts`, forward SQL migrations; fix selected-content hydration, finish payloads, explicit calculation schemas, nested errors, replay dispatch and message cursor | One real new-person/chat/follow-up run completes in the target environment; full answer/question survives reconnect; forced provider/dispatch failure becomes recoverable |
| WP1 — establish model ownership | Add `src/lib/person-model/{contracts,store,context,dependencies}.ts`; additive source/object/revision/job schema, owner controls, birth-independent person lifecycle; freeze conflicting legacy writers | A source input and an explicit correction can produce one validated revision atomically; replay and two-writer tests pass |
| WP2 — implement learning | Add `src/workflows/person-consolidation.ts`, extraction/reconciliation/editor/verifier modules and guidance catalog; source outbox, watermark and bounded job stages | A reviewed conversation corpus produces specific episodes/meanings/patterns/gaps with exceptions; correction revises content and dependents |
| WP3 — implement suggestions | Add suggestion generation, eligibility, ranking, semantic support check, interaction events and outcome ingestion | Every displayed question/action has valid current dependencies; answered/dismissed/rejected-premise prompts stop appearing |
| WP4 — build approved navigation | Replace astrology shell with shared person shell; add route-backed LifeMap, ChapterDetail, PatternDetail, InfluenceDetail, ScenarioDetail, source drawer and real controls | All four visual references are backed by model DTOs; deep links/back/refresh/person switch work; empty/error/mobile states are complete |
| WP5 — connect guided chat | Extend session/chat routes and typed run payloads; selected-object context, existing/new exploration sessions, updating indicators and revision invalidation | Click a map chapter → explore → answer → revised diagram and next question → new chat remembers the update |
| WP6 — implement astrology modes | Birth/calculation versions, interpretation dependencies, mode-safe context/tool selection and in-flight epoch checks | Personal-only mode remains clean across old mixed chats, imports, cache hits and concurrent mode changes; corrected birth inputs invalidate reading-only dependents |
| WP7 — import and data controls | Parser adapters, private uploads, preview/mapping, import Workflow, search, privacy sheet, include/exclude/export/delete jobs | Real supported export samples import safely and idempotently; removal clears derived retrieval/UI; privacy controls report true state |
| WP8 — evaluate and release | Fixture corpus, provider/Sandbox integration, cross-user/concurrency/fault tests, screenshot comparisons, instrumentation and staged deployment | Acceptance matrix passes with distinct source, DB, model, browser and deployment receipts; no silent placeholders remain |

WP4 may be developed against the agreed projection schema while WP2–3 are built, but fixture-backed UI is not considered backend completion. WP6–7 are required for the requested release, not optional polish. Review installed Next.js guides before implementation and use additive migrations produced through the project's migration workflow.

### Migration and rollout

1. Add schema and versioned contracts without deleting current chats/profiles. Backfill stable source identities and exact historical timestamps; do not promote old assistant summaries to evidence.
2. Shadow-build candidate personal models from explicitly included existing sources. Preserve corrections and reject ambiguous speaker attribution. No candidate model is served as current until validated.
3. Compare old/current IDs, ownership, counts, and source coverage. Keep old facts readable, but route all new updates through the one new publication path at cutover.
4. Publish initial personal revisions and expose the new shell behind an account-scoped release flag. Keep old URLs redirecting to canonical routes where their IDs are resolvable.
5. Exercise real provider and Atros runs in staging with separate deployment/database receipts. Diagnose stale production runs before remediation; do not delete user messages to clear locks.
6. Promote after acceptance. Monitor stuck-job age, profile update lag, correction failures, invalid-suggestion suppression, privacy purge state, and calculation errors. Roll back presentation/worker versions through a controlled feature flag without losing newly accepted sources. Do not roll back to a writer that ignores new privacy/correction state.

### Operational targets and observability

Initial targets to validate, not claims of measured performance: API acceptance p95 under two seconds excluding file transfer; existing profile reads p95 under one second for a representative corpus; normal single-turn consolidation p95 under 60 seconds; stalled dispatch detected within two minutes. Large imports show counted progress and estimated remaining work, not a fixed promise.

Track accepted-source-to-published-revision latency, processed watermarks, stage tokens/cost, verifier repair/rejection rates, unresolved conflicts, duplicate imports, answered-question repetition, invalidation propagation, off-mode leakage, worker lease loss, and real completion rate. Store operational receipts with IDs and bounded safe summaries. A passing HTTP response, schema test, or model-generated self-score is not sufficient evidence of useful understanding.

## 12. Source and design boundaries

Current code evidence is linked in the audit. The approved screenshots are design references; their named examples do not become hardcoded rules. The reviewed product grounding is retained in the [architecture package README](README.md).

Primary documentation checked for this spec: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Workflow idempotency](https://workflow-sdk.dev/docs/foundations/idempotency), [Workflow/step execution boundaries](https://workflow-sdk.dev/docs/foundations/workflows-and-steps), and the installed Next.js route/layout guides. Documentation informs the architecture; exact SDK behavior still needs integration testing against the installed versions. Supabase's changelog was checked; this plan does not rely on pinning extension versions or the deprecated analytics endpoint.
