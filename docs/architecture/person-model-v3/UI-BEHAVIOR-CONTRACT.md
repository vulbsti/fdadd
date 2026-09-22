# Approved UI: behavior and data contract

The four approved images under `docs/design/astrologer-ui-mocks/2026-09-19/v2-life-map/` are the visual references. Preserve their sidebar, Chat/Profile separation, editorial hierarchy, timeline, diagrams, focused episode view, and conversation entry points. Implement text, lines, controls, and cards as accessible components; never ship an image as the interface. Personal copy is generated from the person's records.

## Navigation and progressive disclosure

Canonical route family: `/astrologer/p/[personId]`.

| Route suffix | Surface |
|---|---|
| `/chat/[sessionId]` | Existing conversation; context breadcrumb when opened from a profile object |
| `/profile/life-map` | Whole-picture overview |
| `/profile/life-map/episodes/[episodeId]` | Focused episode and its connected meaning changes |
| `/profile/life-map/chapters/[chapterId]` | Expanded group of episodes, such as A mission changes meaning |
| `/profile/patterns` and `/profile/patterns/[patternId]` | How you think; pattern detail |
| `/profile/people` and `/profile/people/[influenceId]` | People & influences; contextual detail |
| `/profile/paths` and `/profile/paths/[scenarioId]` | Paths ahead; conditional scenario detail |
| `/imports` and `/imports/[importId]` | Import flow and durable progress/review |
| `/settings` | Person preferences, birth information, and data controls |

`/astrologer` selects the last accessible person and session or opens a first-person flow. `/profile` remains the existing account route; do not overload it. All private routes check ownership on the server. An ID is a navigation reference, not authorization.

Keep the shared shell mounted. Each focused view has a parent breadcrumb and a real browser-history entry. Back restores selected domain, time range, scroll position, and map focus. Reloading a deep link reconstructs the same object from the database; no chat replay is required. When an object is merged or retired, explain the change and link to the replacement or history. Deleted content returns an unavailable state without leaking its former title.

Progressive disclosure has three levels:

1. Overview: approximately 6–10 meaningful episodes/chapters, a dated present, and up to three useful invitations.
2. Focused connection: 3–7 relevant linked objects, reported effects, conditions, exceptions, and a question.
3. Supporting account: source excerpts, dates, prior understanding, and corrections behind a secondary control.

These are presentation budgets, not storage limits. A dense life never loses history just because it does not fit on the initial map. Chapter grouping needs a meaningful shared theme and source-linked members; a generic age bucket is not automatically a life chapter.

## Visible controls

| Control | Required behavior | Backing contract |
|---|---|---|
| Aidoraa wordmark | Returns to this person's last chat | Navigation state only |
| Person selector | Lists owned people, selects one, or creates a person; clears prior person's view and query cache before rendering | Person identity independent of birth profile |
| New conversation | Creates a persisted empty chat for the selected person; first message starts the run | Idempotent session creation; latest person model reused |
| Search conversations | Searches titles and permitted message text for the selected person; results open the precise message with adjacent context | Scoped full-text search and message anchors; no all-person search by accident |
| Recent conversation | Loads persisted messages and active question; pagination preserves same-timestamp messages | Stable `(created_at,id)` cursor or source-order cursor for imports |
| Chat / Profile | Switches surfaces while preserving unsent chat text, selected object, and scroll state | Canonical routes and person-scoped draft state |
| Life map | Opens the curated timeline | Person revision and deterministic overview projection |
| How you think | Lists concrete patterns with situations and exceptions | Pattern records and presentation order |
| People & influences | Shows people through specific episodes and reported impacts | Influence/entity records; user's perspective made clear |
| Paths ahead | Shows goal-linked, conditional possibilities and observable signs | Scenario records, current constraints, and live dependencies |
| Timeline node or chapter title | Opens the focused explanation, including A mission changes meaning | Stable episode/chapter ID, not title matching |
| Timeline connection | Opens a brief explanation of reported impact, chronology, or working hypothesis | Typed relation with supporting records |
| Domain/time filters | Narrows visible content without changing stored understanding | Query parameters; unknown dates remain visible in an appropriate group |
| Add a turning point | Opens a compact form: what happened, when/how certain, what changed; optional people/domain | Creates a source account and consolidation job; no mandatory astrology fields |
| Add what changed | Opens a contextual account entry for the selected meaning change | Source plus target object and expected revision |
| Correct this account | Lets the user correct content, date, attribution, or interpretation; previews the affected statement | Authoritative correction event and immediate invalidation of affected active claims |
| This does not fit me | Records a rejection without demanding an explanation; optionally asks what is wrong | Rejected hypothesis + dependent-suggestion invalidation; not a mere thumbs-down metric |
| Compare the situations | Opens the relevant pattern and its episode comparisons | Pattern ID and episode set |
| Explore in chat | Offers existing relevant chat or starts one; displays its contextual opening without pretending the user wrote a message | Canonical exploration ID resolved by server; persists start context and selected revision |
| Suggested answer chip | Submits the selected option as an explicit user response; free text stays available | Question ID, option ID, idempotency key; never infer acceptance from displaying it |
| Explore the next step | Opens the proposed action's rationale and questions, then lets the user accept/adapt/dismiss | Versioned suggestion and lifecycle |
| Open life map | Returns to and highlights the originating object | Stored navigation context |
| Astrological connection row | Expands a claim-specific interpretation with calculations, relevant life context, alternatives, and uncertainty | Interpretation record + calculation and person revisions |
| Astrology layer toggle | Switches complete reasoning mode as specified below | Server preference, mode epoch, mode-aware projection and model context |
| Private lock | Opens Privacy & access details and controls | Actual server-reported access, processing, source inclusion, export/deletion status |
| Import conversations | Opens select → parse → preview → confirm → consolidate flow | Import job, reviewed mapping, source records, and progress events |
| Settings | Opens person name, astrology preference, birth data/accuracy, imported-source controls, and privacy settings | Authorized settings APIs with revision checks |
| Composer plus | Attach a supported text/document/conversation file; previews filename and ingestion purpose before send | Same safe ingestion pipeline; attached conversation can become a reviewed import |
| Send | Saves message once, displays durable run status, and recovers after disconnect | Message ID, run ID, sequence number, mode epoch |

No visible link or button may resolve to a placeholder toast. Import and privacy panels use the same design language; their behavior is specified here even though their expanded layouts were not separately mocked.

## Astrology off/on

Default for this astrology-led product: on when the person has a usable birth profile and the user has not chosen otherwise. A person without birth information starts with personal-only reasoning and can still use every life-understanding feature.

The toggle stores one preference for the person across their chats and tabs. **Off** means:

- Remove astrological bands, interpretations, chart overlays, and astrology-dependent suggestions from profile views.
- Exclude calculation records, astrological hypotheses, astro-only derived summaries, and astrological guidance from new model contexts.
- Disable Atros tools and astrology-specific reasoning prompts for new conversation runs.
- Retain personal events and independently supported meanings/patterns. A mixed record must have a separate personal formulation with its own support; stripping the planet names is insufficient.
- Use only personal sources to select next steps and questions. Switching off must not delete calculations or personal history.
- Preserve map positions and selected personal objects. If the selected object only exists in the astrology layer, move to its personal parent with a short explanation.

**On** restores the optional interpretation overlay; it cannot overwrite the personal model. Missing birth inputs open setup using calendar, time picker, and searchable place selection. A failed chart displays an error in the overlay while the person map remains usable.

Changing mode increments a server mode epoch. Cancel/supersede in-flight generation under the old epoch before publishing its response into the new mode; retain the saved user input and retry once under the new mode with idempotent handling. Other tabs refresh their preference. Do not surface stale mode-specific suggestions during the transition.

Previously written chat messages remain an honest transcript. Older astrological responses are labeled with the mode used when written; they are not silently rewritten. They must not enter new personal-only context. The user's statements inside an astrology discussion remain eligible if independently extractable. An explicit historical-quote request can show the original message as an archive excerpt without treating its astrology as current reasoning.

## What Private does

The lock opens a small Privacy & access sheet. Initial content:

- **Access:** this account's profile; no public link or other-user access is enabled.
- **Processing:** the companion uses the configured AI provider and application storage to answer and update the profile. Display accurate configuration/policy information; do not imply that only the user can technically decrypt it.
- **Included context:** which conversations and imports contribute to understanding; allow source exclusion and re-inclusion.
- **Data controls:** export this person's data, remove an import, and delete the person. Destructive controls preview their scope and require an explicit confirmation at execution time.
- **Update status:** pending removal, completed removal, or failure; do not show success while derived content is still eligible for retrieval.

The initial release has no public-sharing feature. Private is not an incognito switch, no-storage mode, or astrology switch. No unsupported promise about provider training or retention is displayed. Account access and AI processing are separate concepts.

## UI freshness and error states

All projection responses include `personRevision`, `sourceWatermark`, `mode`, `modeEpoch`, `generatedAt`, and `updateState`. Interpretation responses additionally include `calculationRevision` and their base person revision.

- After a new message, the chat can respond while the map shows a quiet Updating indicator. It must not claim the update has been saved before publication.
- A successful commit invalidates all affected query keys together. Swap a complete view revision, never individual nodes from different revisions.
- A privacy exclusion or direct correction immediately suppresses affected content/suggestions while recomputation runs. A general new anecdote can retain the last valid map during updating.
- Do not move the user's selected node or steal focus when an update arrives. Offer a small View changes control; preserve viewport where possible.
- Failure keeps the last valid, permitted view and offers retry. If it is no longer permitted, show a targeted unavailable/updating state.
- An empty profile invites one formative episode or an import. Do not invent an entire biography, family map, or future to fill space.
- A missing detail stays unknown. Ask when its answer would change understanding or a decision; avoid exhaustive intake questionnaires.
- Import progress survives reload and distinguishes parsing, awaiting review, learning, complete, and failed.

## Visual and accessibility acceptance

Match the approved desktop composition at 1586×992 and a normal laptop viewport. Preserve large timeline/diagram area and restrained copy. Use a consistent font system across renders; exclude generated decorative landscape imagery and accidental quotation marks around paraphrases. On narrow screens, overview becomes a readable chronological stack and focused views become a single column; no hidden mandatory function.

Nodes, edges with explanations, tabs, chips, and expanders support keyboard focus and accessible names. Diagram meaning must also be available as structured text. Color alone cannot encode reported fact, interpretation, uncertainty, or current state. Browser back, refresh, deep links, loading, empty, permission-denied, and failed states are part of the shipped UI.
