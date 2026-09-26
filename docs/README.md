# Documentation index

This index separates current implementation guidance from approved future
design. The repository's source and test evidence remain authoritative when a
document and the code disagree.

## Use these first

- [`../README.md`](../README.md) — local development, current product
  boundaries, checks, and deployment workflow.
- [`operations/system-pipeline.md`](operations/system-pipeline.md) — local and
  hosted system-proof commands, private artifacts, and the manual migration
  gate.
- [`qa/2026-09-26-pipeline-repair.md`](qa/2026-09-26-pipeline-repair.md) — observed
  pipeline failures, repairs, hosted test evidence, and remaining acceptance.
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
- [`architecture/person-model-v3/P2-EXECUTION-RECEIPT.md`](architecture/person-model-v3/P2-EXECUTION-RECEIPT.md)
  — accepted P2 person/revision authority, staging and browser evidence, visual-infrastructure status, and explicit P3 boundary.
- [`design/astrologer-ui-mocks/2026-09-19/v2-life-map/README.md`](design/astrologer-ui-mocks/2026-09-19/v2-life-map/README.md)
  — the approved visual direction and the four retained reference images.
- [`qa/2026-09-26-visual-comparison.md`](qa/2026-09-26-visual-comparison.md)
  — P2 fixture screenshots at desktop, laptop, and mobile widths, with observed
  differences from the approved references.

## Status boundaries

The v3 person/revision authority and route-backed visual infrastructure now
exist through P2. Source-led learning, suggestion generation, complete guided
loops, imports/deletion, and release gates remain later phases. The P2 receipt
separates revision-backed contract-fixture UI proof from learned-model proof.

The current source has real Supabase authentication and payment routes, while
FashionDaddy, DatePlanner, blog, and RSS still contain sample or in-memory
behavior. The production workflow calls the P0 code/database/browser checks,
requires a same-commit hosted staging journey, then compares production schema
state before promotion. Those gates do not establish complete v3
design or reasoning parity.

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
