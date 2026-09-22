# P2 execution receipt — person identity and revision authority

Updated: September 22, 2026. Status: **P2 authority gate accepted on local and isolated staging**. This receipt covers source ownership, atomic person revisions, correction invalidation, owner isolation, and revision-backed UI infrastructure. It is not a claim that P3 consolidation, P4 suggestion generation, P8 imports/deletion, or production rollout is complete. Implementation commit `9339b2b` on branch `feature/redesignv2`, PR [#7](https://github.com/vulbsti/fdadd/pull/7).

Production Supabase `aidoraa` (`ezanfqbewuqttatrkvhf`) and the production Vercel alias were not changed. The requested `supabase-amber-book` project (`svekonjfpqlusrwmmafg`) is inactive and past Supabase's [restoration window](https://supabase.com/docs/guides/platform/free-project-pausing), so the existing active `aidoraa-staging` project (`wtloawiwntyjiidjbmuk`) remains the isolated test target.

## What was built

| Boundary | Implementation | Evidence |
| --- | --- | --- |
| One person identity | `astro_profiles.id` remains the compatibility person ID. `person_create` accepts a name without birth data, initializes personal mode and an empty baseline revision, and is command-idempotent. Astrology readiness is separate. | Fresh local database reset; pgTAP name-only, baseline, replay, and changed-body cases; staging canary created a name-only person. |
| Attributed input | Accepted user messages register an immutable, ordered `person_source_items` row and consolidation job/outbox entry in the same database transaction. | pgTAP source-sequence and exactly-once cases; staging canary observed the source and queued job for the inserted message. |
| Revision authority | Typed object, object-version, relation-version, conflict, observation, support, revision-membership, view-snapshot, and head tables are owner-scoped. One fenced publication transaction validates dependencies, advances the immutable revision, persists the view snapshot, and moves the head. | Local publication/replay/stale-writer cases; linked schema lint; staging canary claimed a job, published revision 2, and read one object from that same revision. |
| Concurrency and recovery | Jobs have typed ranges, leases, fencing tokens, bounded attempts, and publication lock ordering. A stale but still-relevant job can rebase and requeue over a competing winner without losing either revision membership or unprocessed input. | Dedicated rebase pgTAP proves stale rejection, new fencing, and two-object merged membership. |
| Corrections and exclusions | `person_submit_change` exposes typed owner commands. Accepted correction/rejection immediately suppresses affected current content, increments the privacy epoch where required, queues recomputation, and prevents an old worker from republishing. | pgTAP covers idempotency/body conflict, immediate invalidation, corrected version publication, stale epoch/base rejection, and history retention. |
| Trusted writes and owner isolation | Browser roles cannot write trusted objects, versions, revision pointers, exploration contexts, chart state, or worker RPCs. Reads and public RPCs derive the owner from `auth.uid()`. | Two-user pgTAP plus live staging probes rejected direct trusted writes and cross-user read/search. |
| Coherent reads | `person_read_projection` reads the head, preferences, objects, relations, and accepted-change invalidation in one SQL statement and returns one revision/mode/privacy tuple. | pgTAP asserts one revision for projection metadata and members; staging canary matched the published revision and member count. |
| Revision-bound exploration and search | `person_start_exploration` stores the exact person revision/object version without fabricating a transcript message. `person_search_conversations` provides owner-scoped full-text results with session/message/source anchors. | Local and staging assertions observed zero fabricated messages and one exact search anchor. |
| Astrology-off boundary | Personal mode removes astrology instructions and tools from the server-side workflow path; it is not only hidden in the UI. | Unit coverage for contract/tool selection and workflow guard; TypeScript/build verification. |

## Browser and visual proof

The shared person shell now has route-backed Life map, Patterns, People, Paths, chapter/episode/pattern/scenario/influence detail, Settings, Imports, and guided-chat surfaces. New-person creation, switching people, starting a conversation, privacy/settings, correction/rejection, full-text message search, and Explore in chat call owned APIs rather than mutating fixture state in the browser.

The P2 visual scenario publishes a synthetic eight-object revision through the trusted worker boundary, then signs in through the public UI and captures Life map, Pattern detail, Chapter detail, and Guided chat at laptop-wide, laptop, and mobile sizes. It asserts navigation, deep links, revision content, no horizontal overflow, an enabled composer, and zero fabricated exploration messages. The latest Luna-assisted review specifically checked timeline/card separation, visible conditional versus exception paths, mobile tab scrolling, in-flow CTAs, chapter uncertainty, guided context, and mobile sheet accessibility.

This is **revision-backed contract-fixture integration**, not proof that ordinary conversation already learns these objects. The fixture is inserted as trusted worker output because P3's `extract → reconcile → verify → publish` workflow does not exist yet. The implementation therefore advances portions of P5/P6 infrastructure without closing those later phase gates. Imports intentionally remains an unavailable-state page until P8 rather than presenting a false control.

## Verification matrix

| Layer | Result | Command or receipt |
| --- | --- | --- |
| TypeScript | Pass | `npm run typecheck` |
| ESLint | Pass with one pre-existing non-blocking React Hook Form compiler warning in `BirthIntakeForm.tsx` | `npm run lint` |
| Unit/contract | 15 files passed, 2 skipped; 97 passed, 2 conditional integration tests skipped | `npm test -- --run` |
| Database | 5 files, 134 assertions passed after a fresh migration replay | `npx supabase test db --local` |
| Schema lint | No error-level findings locally or on `aidoraa-staging` | `npx supabase db lint --local --level error`; `npx supabase db lint --linked --level error` |
| Build | Pass on installed Next.js 16.3.5 | `npm run build` |
| Browser/visual | Three Chromium viewports; four route screenshots per viewport | `npm run test:e2e:p2-visual:local` |
| Hosted browser/visual | Pass on all three viewports against the exact Ready Preview deployment and staging database; public login, routes, deep links, persisted exploration context, and zero fabricated messages were exercised. | Deployment `dpl_CUfnrKXdLJyNyCxzCf7pMTXfhQKT`; [Preview](https://fdadd-552bncx7e-vulbstis-projects.vercel.app); `npm run test:e2e:p2-visual:staging` |
| Staging data path | Pass: person, source, job, publication, coherent projection, exploration, search, direct-write denial, and cross-user denial; both disposable users deleted in `finally` | `npm run test:p2:staging` with guarded staging-only environment |

The local network resolved project subdomains to an address that could not complete TLS. The staging canary supports an optional DNS-over-HTTPS-resolved IP through a process-local Undici dispatcher while retaining the original hostname for TLS verification. No host file, global resolver, or Supabase project setting was changed. The currently issued `publishable`/`secret` keys returned `Invalid API key` from the data-plane gateway, while the project's legacy `anon`/`service_role` keys passed; the canary never prints either value.

## Exit decision and next phase

P2 is accepted because its authoritative database paths, trusted write boundary, retry/concurrency behavior, API contracts, live isolated-staging path, and revision-backed browser surfaces agree. The implementation is shaped for the long-term model: immutable source and version records, explicit provenance, stable object IDs, one atomic head, mode/privacy epochs, typed dependencies, and bounded worker authority replace session-local summaries and client-authored profile JSON.

P3 is next. Implement the durable source-led consolidation worker with versioned guidance/provider provenance, exact source spans, conditions and exceptions, conflicts/unknowns, semantic verification, partial-valid publication, failure recovery, and corpus evaluation. Its first integration gate is: an ordinary chat message—not a service fixture—must create a specific supported revision, while a correction and a counterexample revise dependent content without losing history. Only after that evidence may the current screens be called learned-model integration rather than revision-backed UI infrastructure.
