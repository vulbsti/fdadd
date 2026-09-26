# Pi workspace runtime on Vercel

Date: 2026-09-26. Status: the real-provider isolated staging Preview journey
passed in 13.4 minutes, including full calculation/session restore. See
`../../qa/2026-09-26-pi-workspace-preview.md` for artifacts and remaining gates.
Production continues to use the legacy runtime until a later explicit
rollout. Implemented code, local checks, and unproven acceptance gates are
separated below.

## Implemented slice

- `ASTROLOGER_RUNTIME=pi` selects headless Pi 0.87.1 and one brokered Go Luna
  model. The switch refuses production and any database other than the approved
  staging project. The regular production deployment does not enable it.
- A separate Vercel Sandbox is created for each owner/person/run and authority
  epoch, with `persistent: false`. The VM is an ephemeral working copy, not the
  persistence boundary. The explicit Ubuntu managed image supports the Atros
  installer; the deprecated `runtime: node22` image is Amazon Linux and does
  not. Initialization verifies the pinned Pi bundle and actual Atros executable
  on every preparation, including retries after a partially failed setup.
  An install-ready marker and a private-data phase marker separate installation
  from hydration: data-bearing VMs cannot reinstall or reopen broad egress.
  Atros pins Kerykeion 5.12.9; a fresh install must not silently migrate to v6.
  Simultaneous runs cannot replace another run's
  firewall-injected capability. Kernel locking prevents duplicate runner
  processes within the same run.
- The real working directory is `/vercel/sandbox/aidoraa/workspace`. It contains
  current `person/profile.md`, `person/theory-of-mind.md`, original permitted
  user sources, structured object/relation/source JSON, a manifest, optional
  birth/chart files, and complete calculation outputs with CLI receipts.
- Pi has explicit list/read/search/write, current-authority, and Atros tools.
  Built-in arbitrary shell/tools and automatic extension/skill/context-file
  discovery are disabled. Trusted extension tools remain enabled. User files
  cannot install extensions or supply executable skill instructions.
- Full Pi JSONL sessions and working/calculation/answer artifacts are archived
  in private `pi-workspaces` Storage. Content hashes and monotonic database
  receipts prevent stale writes or regression from final to partial state.
  Each authority-sensitive operation rechecks the current database state.
- Checkpoint upload uses 1 MiB binary chunks encoded as base64, then a commit
  request verifies the assembled byte length, SHA256 digest, checkpoint schema,
  and current authority before saving the immutable checkpoint receipt. Restore
  returns an authority-bound immutable manifest and paged chunks, not one large
  response. The complete archive has a prototype 50 MiB budget: exceeding it
  fails explicitly without truncation. This avoids the 4.5 MB broker transport
  limit for checkpoint upload/restore; it does not remove provider/context or
  execution budgets.
- The durable Workflow starts a detached process and polls in short steps;
  model execution does not need one long Next.js invocation. Partial and
  failed-parent recovery reopen saved sessions. Completed publication replay
  verifies the exact final receipt rather than publishing a duplicate answer.
- A change in astrology/privacy/birth dependencies invalidates the old session
  restore and reconstructs the permitted context. Old refusals are not reused
  as system policy. Canonical personal records are refreshed for every run.
- Chat renders the user bubble before acknowledgment, reconciles the accepted
  message ID, and offers same-ID retry. It refreshes mode presentation on focus
  and reconnects an active question's event stream after loading the chat.
  Existing background consolidation still builds the source-backed person
  model; Pi file edits are proposals, not an unvalidated second memory database.

The persistence implementation does not depend on a Sandbox snapshot or on the
original VM remaining alive. The persistent-Sandbox path encountered a hosted
storage-entitlement failure and is not used in this slice. Same-run partial
checkpoints, eligible failed-parent checkpoints, and eligible prior completed
chat sessions are explicitly restored from private durable archives.

There is no 16-step limit in the Pi loop and no 300-character calculation
substitute. File pagination returns continuation offsets, while full results
remain accessible. Operational process/provider/storage budgets can still
pause or fail explicitly; this is not a claim of unlimited runtime or context.

## Architectural direction (intent, not acceptance evidence)

Replace the custom conversational planner/finish loop with **headless Pi inside
an isolated Vercel Sandbox**, operating on real Markdown, structured records,
calculation artifacts, and persistent session files. The application owns
identity, permissions, durable acceptance/publication, and the website. Pi owns
the model/tool loop and context navigation. Do not recreate a second agent loop
around Pi that restores the restrictions identified in `AGENT-HARNESS-AUDIT.md`.

The legacy production implementation is not this architecture: `atros-commands.ts`
uses the shared `atros-template` sandbox only for calculations, while
`person-agent-context.ts` prints a bounded file-shaped context pack. There is
no Pi dependency in the application package manifest. The new dependency is
isolated and pinned in `runtime/pi/package-lock.json`, installed inside the VM.

The following layout and design rules describe the broader intended
architecture. Only the implemented slice above is present today; a target
path, rule, or capability below is not evidence that its full workflow has
passed hosted acceptance.

## A real workspace

Target layout (the implemented subset is listed above; separate goal/timeline
projections and a user-facing workspace browser are not yet implemented):

```text
/workspace/
  manifest.json                 # owner/person/revision/consent versions
  person/
    profile.md                  # source-backed overview, not all history
    theory-of-mind.md            # hypotheses, uncertainty, counterexamples
    goals.md
    timeline.md
    sources/                    # original permitted documents/transcripts
    structured/                 # JSON records and provenance references
  astrology/                    # only available in permitted runtime mode
    birth.json
    chart.json
    calculations/<artifact-id>/
      result.md                 # complete CLI text, including dated tables
      result.json               # where the command supports structured output
      receipt.json              # arguments, birth revision, engine, checksum
  conversations/<chat-id>/
    transcript.md
    session.jsonl               # actual Pi session state
  work/<run-id>/                 # editable scratch, analysis artifacts
  proposals/<change-id>/         # memory edits with supporting source IDs
  outputs/<run-id>/              # answer/report and its artifact manifest
```

Trusted skills/extensions live in a separately controlled runtime bundle, not
in imported user documents. Suggested skills cover person-context navigation,
Atros calculations, evidence-backed memory updates, and handling uncertainty.
User content is data; importing `AGENTS.md` or `SKILL.md` must not install code
or elevate it into runtime instructions. Pin Pi, extensions, and dependencies.

Pi can read, search, write, and run approved workspace operations. Pagination
and tool previews may still exist inside Pi; inspect the pinned version and
prove that omitted content can be read in full. Changing harnesses alone does
not establish unlimited recall or correct answers.

## Isolation and authority

No two users or runs share a data-bearing sandbox. The prototype uses separate
owner/person/run workspaces and version-checked publication. The existing
one-active-run-per-person database admission rule is still in place; a visible
queue and multiple simultaneous writes are not claimed in this slice.

A future common base image may contain Pi, trusted runtime code, and dependencies,
never user files, session history, or secrets. The current prototype installs
the pinned runtime on VM creation; it does not use a shared data-bearing image
or persistent per-user snapshots. Sandbox selection is server-owned and bound
to authenticated ownership; the model cannot supply another user's sandbox
name or storage key.

Use restricted networking and a scoped broker for model requests, structured
data queries, and publishing. Do not put Supabase service-role keys, Vercel
management tokens, or broad provider credentials in agent-readable files or
environment variables. A directory convention or Pi `cwd` is not a security
boundary. Validate paths, symlinks, manifests, and ownership outside the agent.

If astrology is disabled, prepare an execution view without its tools, binary,
calculation files, or astrology-derived context. Do not leave them reachable by
shell after merely hiding a tool definition. Consent changes require stopping
the affected run and rebuilding the permitted view/session before continuation.
The model must not change consent by editing `manifest.json`.

## Files and structured data: avoid two competing truths

Use the existing database for owner/consent state, accepted messages, source
identities, versioned personal records, job state, and publication receipts.
Use private durable artifact storage for complete file bytes and versioned
manifests. The sandbox filesystem is the actual working copy, not the only copy.

Markdown profile files are readable materializations of accepted personal
understanding. Pi can propose edits and create narrative/report artifacts;
accepted profile updates retain sources, contradictions, and version lineage.
A file write is not automatically a trusted fact or an accepted memory update.
Structured records remain available through scoped query tools and JSON files.
Persist original transcripts and tool outputs independently of summaries.

Use one explicit publication boundary: upload immutable changed artifacts,
validate the proposed manifest and memory change, then commit a versioned
reference with an idempotency key and expected workspace/consent versions.
Regenerate the readable profile from the accepted revision. Do not independently
overwrite Markdown and database rows and hope that background sync reconciles
them. Uncommitted files remain useful recoverable work, not website truth.

## One chat turn in the implemented slice

1. The browser shows a pending user bubble immediately. The API persists the
   message/run/outbox once and returns acknowledgement IDs.
2. A durable Workflow prepares the run-scoped ephemeral sandbox and starts a
   detached, kernel-locked runner. The runner starts Pi in RPC mode with an
   eligible saved session. The Next.js chat request is not the process owner.
3. Refresh the manifest and permitted files from current authoritative state.
   If consent/birth/privacy dependencies changed, rebuild stale working context
   instead of blindly replaying the old Pi session or compaction summary.
4. Pi reads relevant profile/source files, searches structured data, invokes the
   permitted Atros tool, and inspects saved output. For a 2026 dasha question it
   can request the dated range, read the table, and continue until it can answer.
5. Tool lifecycle events and full session/artifact checkpoints are saved during
   progress. Short Workflow poll steps publish safe tool receipts and browser
   events; a dropped browser connection does not own or cancel the runner.
   RPC acceptance is not completion: publication requires a final durable
   checkpoint and matching authority. Reconnection behavior still needs hosted
   failure/retry acceptance.
6. Commit the final checkpoint and publish the answer through the existing
   idempotent database boundary. Completed replay requires the exact Pi final
   receipt and matching authority epochs/artifact prefix. Ordinary background
   consolidation handles accepted user sources; Pi-written memory proposals
   are not automatically applied to the canonical personal model. General
   proposal validation/publication remains outside this slice.

## Persistence and stale reasoning

The current VM is ephemeral, and its filesystem is not treated as durable.
Recovery reconstructs the permitted canonical files and restores an eligible
session plus saved working/calculation artifacts from private checkpoints.
The runner process itself is not persisted. A crash before an acknowledged
checkpoint can lose progress since the last committed receipt; neither an
orderly final snapshot nor an always-running VM is assumed. Recovery must
reject stale workers, and crash/restart behavior remains an acceptance gate.

Version working context against consent/privacy epochs, birth revision, and
person revision. Historical assistant text remains visible as history, not
current authority. A user saying “I enabled astrology” requests a fresh settings
read; it does not grant permission. A server-confirmed change must reach the
active agent as refreshed capabilities and context, not merely a new sidebar label.

Use Pi's context management, but test it. Keep retrievable original files,
attributed summaries, and explicit incomplete/paused states. Replace the custom
16-operation forced finish with observable resource budgets and no-progress
detection; preserve useful work when pausing. The host enforces authority, not
the model's sequence of reasoning steps.

## Hosted acceptance gates

Implementation exists behind a staging-only switch with one pinned Luna model.
The passed staged test exercised name-only onboarding, immediate optimistic sending,
astrology-off chat, fresh-chat personal recall, birth setup, enabling astrology
in another tab while the original chat remains mounted, a real dated 2026
Atros timeline, full checkpoint receipts, and three viewport sizes. Its four Pi
runs completed without failed tools; saved calculation bytes survived a fresh
sandbox for the follow-up. This is one synthetic happy-path journey, not a
production, scale, or precision-calculation acceptance claim.

- [x] Pin and smoke-test Pi RPC, the OpenCode Go model adapter, event handling,
  file tools, full-output retrieval, and session reopen in a real Vercel Sandbox.
- [ ] Create two synthetic owners' isolated workspaces; verify neither can read,
  request, publish, or resume the other's files/session, including path escapes.
- [x] Hydrate one person's Markdown/JSON context and wire scoped structured reads.
- [x] Ask a dated question; let Pi independently call Atros, save a complete
  result, read the relevant table, and answer without user-supplied calculations.
  The answer exposed, rather than fabricated around, the existing Atros date gap.
- [x] Publish ordinary source consolidation, verify fresh-chat recall, and restore
  a completed session/calculation into a new sandbox for a dated follow-up.
- [x] Enable astrology in another tab and answer in the original mounted chat
  without carrying the old disabled capability into the new model context.
- [ ] Test on-to-off changes, mid-run disable, stale resumed sessions, duplicate
  sends, runner crash, and interrupted browser reconnection end-to-end.
- [x] Persist 32 screenshots at desktop/laptop/mobile widths and the private trace;
  review immediate echo, Markdown tables, scrolling, and ordinary-chat styling.
- [ ] Establish parity for guided context, pattern detail, and meaning-change
  states not represented in this journey's screenshots.
- [ ] Only then replace the production custom loop. Reuse audit acceptance
  tests; do not port every old planner/verifier stage into mandatory Pi steps.

## Local evidence, references, and remaining uncertainty

Local checkpoint codec tests pass for a multibyte archive larger than 4.5 MB,
missing/altered/reordered parts, noncanonical base64, the explicit 50 MiB
boundary, and safe Unicode/space artifact paths with traversal rejection.
Focused lint, TypeScript typecheck, and runner syntax checks pass. These checks
do not prove hosted model execution, durable recovery, cross-owner isolation,
UI quality, or a correct dated answer.

- [Pi RPC documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md): headless subprocess control and event lifecycle.
- [Pi SDK/session documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md): configurable tools/resources and persisted session context.
- [Vercel persistence](https://vercel.com/kb/guide/vercel-sandbox-duration-and-persistence): filesystem restoration and startup/resume hooks.
- [Vercel function limits](https://vercel.com/docs/functions/limitations#request-body-size): request/response payload budget motivating checkpoint chunk transport.
- [Vercel firewall](https://vercel.com/docs/sandbox/concepts/firewall): egress policy and credential brokering. Domain access alone is not endpoint authorization; broker rules require separate enforcement.

Pi 0.87.1 is pinned in the separate runtime package, and runtime, broker,
checkpoint migration, Workflow, and chat changes are implemented. The main
application manifest is not the Pi installation location. The hosted proof
establishes provider compatibility, normal checkpoint publication/restore, and
the specific responsive journey above. Recovery under faults, live cross-owner
attacks, mid-run authority changes, large hosted archives, broader answer
quality, and the Atros calendar-boundary defect remain separate gates. Turns
still take minutes because of installation/checkpoint overhead. Production
rollout remains a separate explicit decision after those gates.
