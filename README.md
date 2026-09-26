# Aidoraa

Aidoraa is a Next.js application containing the fashion, date-planning, blog,
payment, authentication, and astrologer surfaces. The repository is a working
prototype with a real Supabase authentication/payment foundation. Several
product areas still use sample or in-memory data; the documentation labels
those boundaries explicitly.

## Current surfaces

- **FashionDaddy** — a client-side styling UI with sample chat history,
  wardrobe data, and placeholder replies.
- **DatePlanner** — a client-side date-plan UI with a small keyword-based
  placeholder generator.
- **Aesthetic Quiz** — the style-preference quiz.
- **Blog and RSS** — sample/in-memory services and route handlers.
- **Contact form** — a placeholder submission alert; no delivery backend.
- **Authentication and payments** — Supabase Auth with email/Google flows and
  Razorpay order/verification/webhook routes. Provider configuration is in
  [`docs/supabase-razorpay-setup.md`](docs/supabase-razorpay-setup.md).
- **Astrologer** — an authenticated chart and conversation surface backed by
  Supabase, Workflow, the provider adapter, and Atros. The approved v3 person
  model remains a proposed implementation contract; it is not delivered by the
  current source tree.

## Stack

- Next.js `^16.3.5` App Router, React `^18.3.1`, and TypeScript.
- Node.js 22.x and npm.
- Tailwind CSS, Radix UI primitives, and the existing component library.
- Supabase Auth/Postgres, Vercel Workflow, and Vercel Sandbox for Atros.
- The astrologer provider resolves keys in this order:
  `OPENCODE_API_KEY`, `OPENGO_API`, then `OPENROUTER_API_KEY`. OpenCode Go
  uses `muse-spark-1.3-contributor` by default; `ASTROLOGER_MODEL` and then
  `OPENROUTER_MODEL` can override the model.
- Structured person-model consolidation can be routed independently with
  `PERSON_CONSOLIDATION_MODEL`; without an override, OpenCode Go uses
  `kimi-k3` for exact extraction and JSON-schema-guided later stages. Every
  stage is still locally validated before it can be staged or published.

## Local development

Use Node.js 22, install the locked dependencies, and configure the services
you need in `.env.local`:

```bash
npm ci
npm run dev
```

Open [http://localhost:9002](http://localhost:9002). Copy `.env.example` for
the Supabase and Razorpay variables. Set an OpenCode Go key (`OPENCODE_API_KEY`
or `OPENGO_API`) for the primary model path, or `OPENROUTER_API_KEY` for the
fallback path. Never commit `.env.local` or server-only secrets.

OpenRouter is selected when no Go key is configured; it is not automatic
failover after a Go request fails.

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:db:local
npm run test:e2e:local
```

The database and browser smoke commands require the local Supabase stack. They
use disposable fixtures; see the [P0 receipt](docs/architecture/person-model-v3/P0-EXECUTION-RECEIPT.md)
for their exact coverage and limits.

## Dev-time agent CLI

`opencode.json` selects `opencode-go/muse-spark-1.3-contributor` for local
agent work. For example:

```bash
opencode run "help me debug the astrologer chat route"
```

## Deployment

`.github/workflows/deploy-production.yml` runs for pushes to `main` and for a
manual dispatch from `main`. It calls the full local quality workflow, deploys
this commit to an isolated Preview configured for staging, and runs the hosted
person-model browser journey. It then checks the production migration ledger
and required person-model tables and RPC grants before creating a staged
production deployment and promoting it. Vercel Git deployment is disabled for `main` so it cannot
race that gated release path. The hosted test uses real configured providers
and can incur provider cost; CI retains screenshot artifacts, while its
authenticated Playwright trace remains on the ephemeral runner to avoid
publishing session cookies or deployment-bypass headers. It does not replace
human comparison against the approved visual mocks or prove every v3 acceptance
case. The [system-pipeline operator notes](docs/operations/system-pipeline.md)
cover the local and hosted test commands, artifact handling, and migration
operator gate.

Configure the repository secrets `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`,
`P3_STAGING_SUPABASE_REF`, `P3_STAGING_SUPABASE_URL`, `P3_STAGING_SUPABASE_IP`,
`P3_STAGING_SUPABASE_SECRET_KEY`, `P3_STAGING_SUPABASE_PUBLISHABLE_KEY`,
`P3_STAGING_CRON_SECRET`, and `VERCEL_AUTOMATION_BYPASS_SECRET`. Configure the
Vercel Preview environment for the same staging Supabase project and a working
provider key; configure Production environment variables separately. The
read-only schema check targets Supabase project ref `ezanfqbewuqttatrkvhf`
through the CLI Management API; it never applies migrations. Missing migration
versions block promotion until they have been reviewed and applied through the
separate database release process.
Vercel Production must have a non-empty `CRON_SECRET`; this is checked before
building. The protected dispatch and consolidation recovery sweeps run daily
as an orphan-recovery safety net. Normal consolidation retries are scheduled
from the database's durable `available_at` time and self-wake the existing
workflow; they do not depend on a chat request or frequent cron polling. Chat
and run-event requests can also attempt orphan recovery. Vercel Hobby only
permits daily cron jobs, so the daily schedule is not a fast orphan-recovery
guarantee. See the person-model evaluation guide for hosted test details.

## Documentation map

The documentation index at [`docs/README.md`](docs/README.md) is the entry
point for design, architecture, provider setup, and historical operational
records.

- [Approved v3 person-model package](docs/architecture/person-model-v3/README.md)
  — current-state audit, proposed execution specification, UI behavior
  contract, and acceptance plan. It is an implementation plan, not a delivery
  receipt.
- [Approved v2 profile concepts](docs/design/astrologer-ui-mocks/2026-09-19/v2-life-map/README.md)
  — the four visual references and their generation/refinement prompts.
- [Supabase and Razorpay setup](docs/supabase-razorpay-setup.md) — provider
  configuration, environment variables, verification matrix, and rollout.
- [`logs/changes_logs.md`](logs/changes_logs.md) — dated historical notes;
  entries are not current implementation claims.

The source commit reviewed by the current architecture package is
`27fc172156633cb15b550d1b36c69eb702fdcbba`.
