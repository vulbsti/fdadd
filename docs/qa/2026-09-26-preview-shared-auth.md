# Shared preview authentication repair — 2026-09-26

## Cause and live configuration

The reported deployment was
`https://fdadd-2gk5gff6o-vulbstis-projects.vercel.app`.
Its Preview defaults used the separate `aidoraa-staging` Supabase project
(`wtloawiwntyjiidjbmuk`), while main used `aidoraa`
(`ezanfqbewuqttatrkvhf`). Accounts and saved setup were therefore independent.
The isolated project's hosted Site URL was `http://localhost:3000`, with an
empty redirect allowlist. That configuration explains the confirmation link's
localhost destination despite the browser supplying its current origin.

Normal project-wide Preview defaults now use `ezanfqbewuqttatrkvhf`, with its
publishable key and a validated server secret key from that project. Vercel
marks pulled sensitive variables as `[SENSITIVE]`; obtain actual server keys
from Supabase rather than copying the masked Vercel export. Production
environment variables were not changed. Preview edits now affect the same
saved product data as main, while browser sessions remain per domain.
Redundant `feature/redesignv2` overrides for the three Supabase variables were
removed; that branch now inherits the shared Preview defaults. The pulled
branch URL and publishable key were verified against production's values.

The production auth allowlist retains its prior entries and adds
`https://fdadd-*-vulbstis-projects.vercel.app/**`. Its Site URL remains
`https://www.aidoraa.com`. The isolated project's localhost Site URL was also
replaced by the reported hosted preview origin and given the same owner-scoped
Preview allowlist. Only these auth URL properties were pushed; hosted
confirmation requirements and unrelated settings were preserved.

The original source was rebuilt with the corrected defaults:

- Verified deployment: `https://fdadd-8jdqo119a-vulbstis-projects.vercel.app`
- Stable branch alias: `https://fdadd-git-codex-fix-prototype-pipeline-vulbstis-projects.vercel.app`

Existing immutable deployment URLs retain their original build-time
configuration. Use a rebuilt deployment or its branch alias.

## Verification

- The read-only production schema preflight passed: 28 repository migrations
  and 12 required schema objects.
- Hosted auth config readback showed no remaining declared-property drift.
- A disposable synthetic account confirmed through the rebuilt Preview's
  `/auth/confirm` route and landed on an authenticated profile.
- The same account signed in through the real login modal on main and Preview,
  and each authenticated profile survived reload.
- A person created through Preview's authenticated API was returned identically
  by main's authenticated API. Preview's life map rendered and was visually
  inspected.
- Generated confirmation/recovery links retained the requested Preview
  callback, accepted a future owner-scoped preview hostname, and rejected an
  unrelated hostname by falling back to the production Site URL. Link generation
  did not send email; actual inbox delivery and the Google provider were not
  tested in this repair.
- Test sessions were revoked and the exact synthetic user and its cascaded setup
  were deleted. No customer account was reset, moved, or merged.
- Eight release preflight tests passed, including isolation guards and removal
  of shared credentials from the test build. Changed scripts passed ESLint;
  `git diff --check` passed.

## Automated test deployment

The user explicitly chose to retain an isolated database for the release
workflow's disposable system test deployment. That candidate now overrides
database credentials and `CRON_SECRET` at build and runtime using the
`P3_STAGING_*` secrets. Ordinary Preview defaults stay shared with production.
The local operator helper prepares a test-only recovery secret and creates a
prebuilt candidate with the same isolated overrides; it no longer changes the
project-wide Preview recovery secret.

The full provider-backed release journey was not rerun for these workflow
changes. Its existing staging database restrictions remain in place. Merge the
repository repair to put the revised release workflow into use; live shared
Preview configuration and the verified rebuilt application are already active.
