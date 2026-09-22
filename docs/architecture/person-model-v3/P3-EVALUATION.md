# P3 evaluation harness

Status: **deterministic harness and one local real-provider ordinary-chat vertical slice pass; hosted rerun is blocked by the provider's five-hour usage window and repeated semantic acceptance remains pending.** Updated September 23, 2026.

## Corpus

[`tests/fixtures/person-model-v3/p3-history-corpus.ts`](../../../tests/fixtures/person-model-v3/p3-history-corpus.ts) contains 20 synthetic, independently runnable histories. It contains no imported or copied personal transcript. Cases are tagged to connect directly to acceptance IDs and hard invariants:

- formative event, later challenge, unresolved meaning, chapter, and cross-chat retrieval (C02–C05);
- productive solitude, prolonged-isolation counterexample, and a productive day alone (C06–C07);
- correction, rejected explanation, sparse family information, and alternate caregiving domain (C08, C13–C14, C20);
- third-party and hypothetical subject, assistant-claim repetition, exact-but-irrelevant quotation, stale state, conflicting dates, multiple domains, and long incremental history (C09–C12, D05);
- failed-outcome evidence, privacy exclusion, and unknown date/source state.

Fixture `preserve`, `remainUnknown`, and `forbiddenConclusions` fields are expected invariants, not exact output text. Multiple faithful phrasings and groupings remain valid. Extend the corpus with reviewed, user-authorized examples only in private evaluation infrastructure; never commit private chat data or provider prompts/responses.

## Deterministic checks and limits

Run:

```bash
npm exec -- vitest run --config vitest.p3.config.ts
```

The test-only [`p3-evaluator.ts`](../../../tests/person-model-v3/p3-evaluator.ts) adapter checks the existing `PersonObjectPayloadSchema`, required object kinds, source turn identity, exact character spans, speaker/subject match, direct-reported evidence role, listed hard-unknown values, and exact-string forbidden phrase probes. The corpus suite also runs all 20 histories through the current `ConsolidationSourceSchema`, `PersonExtractionOutputSchema`, `PersonObservationDraftSchema`, and `validateObservationSpans` seams, while explicitly keeping assistant turns out of direct-user observations. This is a **mechanical contract evaluator**, not a semantic-quality score: exact spans do not establish relevance, and phrase checks do not detect paraphrased hallucinations. The durable worker now uses these typed seams, but the corpus has not yet been executed 3× per case through configured providers.

Required complementary evaluation before P3 acceptance:

1. Run the >=20 histories against the actual versioned extraction/reconciliation/composition/verifier pipeline, using at least three repetitions per configured model/guidance version.
2. Require zero unsupported personal assertions, exact attribution, protected unknowns, preserved counterexamples/corrections, no assistant-evidence laundering, and valid dependencies in every repetition.
3. Have an independent verifier and human review a representative set for source relevance, specificity, coherence, useful inquiry, and respect for counterevidence. The acceptance plan's initial reviewed quality threshold is >=4/5 on specificity, coherence, and usefulness; those are review ratings, not profile scores.
4. Keep deterministic adapter tests, configured-provider evaluations, browser proofs, and staging/deployment receipts as separate evidence lines.

## Authenticated ordinary-chat browser proof

[`tests/e2e/p3-ordinary-chat-learning.spec.ts`](../../../tests/e2e/p3-ordinary-chat-learning.spec.ts) is the gated real-provider integration proof. It requires `P3_REAL_PROVIDER_E2E=1` as explicit opt-in because the answer/consolidation path may make billable provider calls. It refuses non-loopback Supabase. It provisions one disposable Auth user, creates the name-only person and session through an authenticated user RPC, signs into the app through the visible login UI, and sends ordinary messages through the visible composer. The Supabase admin client is used only to observe persisted state and delete that exact disposable user in `finally`; it never seeds source messages, candidate objects, object versions, or revisions.

Run once on the laptop project against local Supabase; that one real provider run captures all responsive sizes and avoids triple provider spend:

```bash
P3_REAL_PROVIDER_E2E=1 node scripts/with-local-supabase-env.mjs npm exec -- \
  playwright test tests/e2e/p3-ordinary-chat-learning.spec.ts --project=laptop --workers=1
```

The test requires an actual configured provider key and the P3 consolidation dispatcher/worker. It asserts that a chat-originated message creates an included native source, a completed source-consolidation job, a later published revision, claim-level exact quote spans, source-linked meaning/pattern plus episode-or-goal objects, field-level unknown meaning retention, model/view API coherence, visual routes at 1586×992, 1366×768, and 390×844, keyboard drawer operation, a genuinely different Explore session, a durable plan receipt for the published revision, and a grounded answer that survives reload. It saves synthetic-data screenshots per route/viewport in Playwright's ignored output directory.

The local optimized-production run passed with real provider calls. It must not be replaced by the P2 visual test's direct trusted-output fixture. That fixture now adds a narrower interaction receipt: it forces one rejection API failure, verifies that the UI does not claim success, retries through the actual typed-change endpoint, and checks the resulting `person_changes` plus message-less `person_source_items` rows. The worker now reconstructs correction text from the immutable change request, filters excluded evidence, and keeps source ranges contiguous. This still does not prove provider-backed correction publication or deterministic worker failure; both remain required before full P3 acceptance.

### Hosted staging variant (explicit opt-in; do not use for production)

The same spec has a separate fail-closed config, `playwright.p3-staging.config.ts`. It is restricted to the documented stable `feature/redesignv2` branch Preview host (`fdadd-git-feature-redesignv2-vulbstis-projects.vercel.app`) and the exact staging Supabase ref `wtloawiwntyjiidjbmuk`. It rejects production aliases and mismatched URL/ref combinations before creating a user. Both Supabase access from the runner and Chromium are pinned to the explicitly supplied staging IPv4 address. The deployed Preview must itself be configured for this same staging project; the runner cannot prove Vercel's environment mapping without the browser run. The runner also requires `P3_STAGING_CRON_SECRET` so bounded retry dispatches remain authenticated.

Required opt-ins and env vars (supply values through a secure shell/secret manager; never put credentials in docs or source): `P3_REAL_PROVIDER_E2E=1`, `P3_STAGING_E2E=1`, `P3_STAGING_PREVIEW_URL=https://fdadd-git-feature-redesignv2-vulbstis-projects.vercel.app`, `E2E_BASE_URL` with the identical URL, `P3_STAGING_SUPABASE_REF=wtloawiwntyjiidjbmuk`, `P3_STAGING_SUPABASE_URL=https://wtloawiwntyjiidjbmuk.supabase.co`, `P3_STAGING_SUPABASE_IP`, `P3_STAGING_SUPABASE_SECRET_KEY`, `P3_STAGING_SUPABASE_PUBLISHABLE_KEY`, `P3_STAGING_CRON_SECRET`, and `VERCEL_AUTOMATION_BYPASS_SECRET`. Provider calls execute using the configured provider on the Preview deployment; they may incur cost. This variant creates a disposable confirmed Auth user and sends actual messages, then signs out and deletes only that exact test user. Do not run it against production.

The approved staging command (one project makes all three viewport captures within one provider run) is:

```bash
playwright test tests/e2e/p3-ordinary-chat-learning.spec.ts --config=playwright.p3-staging.config.ts --project=laptop --workers=1
```

The test separately captures the pattern view before opening `Why this appears`, then asserts the drawer's `aria-expanded` state and captures it open at wide, laptop, and mobile sizes. It also retains life-map, chapter, and guided-chat captures at all three sizes, including lower-scroll mobile receipts for the life map and chat composer.

The authorized hosted run reached real visible authentication, foreground answer completion, source acceptance and extraction on the exact branch Preview. It first exposed an `agent_step_limit` failure; the agent budget now falls back to a final text-only model call after two constrained finish-tool attempts. On rerun, OpenCode Go accepted the key and processed calls, then returned `429 GoUsageLimitError` for its five-hour allowance during compose. The test was stopped before further retry dispatch, disposable data was removed, and no hosted publication or screenshot pass is claimed. Rerun this exact guarded command after the provider window resets.
