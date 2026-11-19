# Documentation index

The source and tests are authoritative when a document and the code disagree.

## Start here

- [`VISION.md`](VISION.md) — the product goal, how the agents should reason,
  and the quality check for prompts, skills and answers. Read this first.
- [`../README.md`](../README.md) — local development, checks, and deployment.
- [`architecture/person-model-v3/PI-WORKSPACE-RUNTIME.md`](architecture/person-model-v3/PI-WORKSPACE-RUNTIME.md)
  — the Pi workspace on Vercel Sandbox, the only chat runtime.
- [`operations/system-pipeline.md`](operations/system-pipeline.md) — local and
  hosted system-proof commands, private artifacts, and the manual migration
  gate.

## Setup and operations

- [`supabase-razorpay-setup.md`](supabase-razorpay-setup.md) — Supabase and
  Razorpay configuration, callback URLs, and environment variables.
- [`auth-on-blocked-networks.md`](auth-on-blocked-networks.md) — sign-in on
  networks that block `supabase.co`.
- [`mobile-backend.md`](mobile-backend.md) — the server side of the native app.
- [`operations/beta-testers.md`](operations/beta-testers.md) — the one-tap beta
  signup for the Play closed test.
- [`architecture/person-model-v3/IMPORTS.md`](architecture/person-model-v3/IMPORTS.md)
  — chat imports and connectors.
- [`architecture/person-model-v3/DB-HARNESS.md`](architecture/person-model-v3/DB-HARNESS.md)
  and [`BROWSER-HARNESS.md`](architecture/person-model-v3/BROWSER-HARNESS.md)
  — the local RLS and browser smoke checks.

## Person model design

[`architecture/person-model-v3/README.md`](architecture/person-model-v3/README.md)
is the September 20, 2026 design for the person model, the life map and the
other profile views. The four PNGs in
[`design/astrologer-ui-mocks/2026-09-19/v2-life-map/`](design/astrologer-ui-mocks/2026-09-19/v2-life-map/)
are its visual references, not implemented screens or seed content.
