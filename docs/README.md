# Documentation index

This index separates current implementation guidance from approved future
design. The repository's source and test evidence remain authoritative when a
document and the code disagree.

## Use these first

- [`../README.md`](../README.md) — local development, current product
  boundaries, checks, and deployment workflow.
- [`supabase-razorpay-setup.md`](supabase-razorpay-setup.md) — Supabase/Razorpay
  configuration, callback URLs, environment variables,
  verification cases, and rollout notes.
- [`architecture/person-model-v3/README.md`](architecture/person-model-v3/README.md)
  — the authoritative September 20, 2026 execution package for the proposed
  life-understanding system.
- [`architecture/person-model-v3/PHASED-IMPLEMENTATION-PLAN.md`](architecture/person-model-v3/PHASED-IMPLEMENTATION-PLAN.md)
  — sequenced delivery gates and per-feature E2E, visual, and long-term-fit checks.
- [`architecture/person-model-v3/P0-EXECUTION-RECEIPT.md`](architecture/person-model-v3/P0-EXECUTION-RECEIPT.md)
  — the local baseline, harness results, and still-unverified external boundaries.
- [`architecture/person-model-v3/P1-PROGRESS-RECEIPT.md`](architecture/person-model-v3/P1-PROGRESS-RECEIPT.md)
  — accepted P1 reliability gate, isolated staging/deployed recovery proof, visual findings, and explicit P2 handoff limits.
- [`design/astrologer-ui-mocks/2026-09-19/v2-life-map/README.md`](design/astrologer-ui-mocks/2026-09-19/v2-life-map/README.md)
  — the approved visual direction and the four retained reference images.

## Status boundaries

The v3 architecture package is implementation-ready design. It does not claim
that the v3 person model, import flow, profile projections, privacy controls,
or release gates already exist. The current astrologer page still redirects
unauthenticated or unconfigured visitors to `/`; the v3 UI behavior contract
describes the intended future behavior.

The current source has real Supabase authentication and payment routes, while
FashionDaddy, DatePlanner, blog, and RSS still contain sample or in-memory
behavior. The production workflow now runs typecheck, ESLint, and unit tests;
the separate P0 quality workflow adds local two-user database and authenticated
browser smoke gates. A passing smoke test is not v3 design or reasoning parity.

## Design references

The four PNGs in [`design/astrologer-ui-mocks/2026-09-19/v2-life-map/`](design/astrologer-ui-mocks/2026-09-19/v2-life-map/)
are approved visual references, not implemented screens or production seed
content. `PROMPTS.md` retains the complete generation and refinement record.
The earlier `01-chat.png` and `02-profile.png` concepts were superseded and
are not part of the approved design set.

## Historical records

[`../logs/changes_logs.md`](../logs/changes_logs.md) is retained as a dated
operational record. Its entries explain past Next.js blog fixes and should not
be read as a current framework guide.
