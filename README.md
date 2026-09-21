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
manual dispatch. It uses Node 22, runs `npm ci`, typecheck, lint, and unit
tests before pulling Vercel settings, building, and deploying. A separate P0
quality workflow runs local database and browser smoke checks on PRs and main.
These checks do not yet prove the v3 guided-update loop. Vercel production and
preview environment variables must be
configured separately; use the provider setup document for Supabase and
Razorpay callback URLs and server-only variables.

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
