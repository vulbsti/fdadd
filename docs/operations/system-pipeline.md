# System pipeline operator notes

The system proof runs a disposable user through onboarding, personal chat and
memory updates, birth/chart setup, and a live Atros dasha request. It uses real
provider calls and can incur cost. It captures desktop (1586×992), laptop
(1366×768), and mobile (390×844) screenshots at journey checkpoints. Screenshots
and the authenticated Playwright trace are local test outputs; compare the PNGs
with the approved mock set manually. The test checks horizontal overflow, not
pixel parity. Never upload a trace: it can contain session cookies and Vercel
bypass headers. `.vercelignore` excludes `test-results`; CI uploads PNGs only.

On 2026-09-26, Preview candidate `4iadfmk9k` passed the complete hosted journey
in 5.3 minutes. See [the repair receipt](../qa/2026-09-26-pipeline-repair.md)
for the test boundaries, production status, and remaining acceptance work.

## Local system journey

Start the disposable local Supabase stack and configure a real provider for the
local run. If the sandbox OIDC token has expired, refresh the Preview-linked
Vercel file, then run the system journey:

```bash
vercel pull --yes --environment=preview
E2E_VERCEL_ENV_FILE=.vercel/.env.preview.local npm run test:e2e:system:local
```

The wrapper reads only `VERCEL_OIDC_TOKEN` from that ignored file, checks its
expiry, and forwards only that token into the local test process. The app and
database still use the disposable local Supabase environment. Do not print or
copy the pulled file's other values into commands or logs.

## Hosted staging journey

Use an isolated Preview deployment whose Preview Supabase environment points
to the approved staging project. Rotate the Preview `CRON_SECRET` only when it
needs repair/rotation; do not repeat this during a run, since the already
deployed Preview would still have the previous value. Prepare, deploy, then pass
the exact immutable Preview URL to the helper:

```bash
node scripts/with-system-staging-env.mjs --prepare-cron
vercel deploy --yes
node scripts/with-system-staging-env.mjs https://<immutable-preview>.vercel.app npm exec -- playwright test --config=playwright.system-staging.config.ts --workers=1
```

The helper resolves staging keys and the pinned database IP privately and
injects them only into the child process. It validates the URL and refuses a
production target. It does not print the CLI errors that may contain sensitive
data. Inspect the generated PNGs locally; the hosted journey's trace is kept in
the ignored `test-results/` directory and must not be uploaded or shared.

## Schema preflight and migrations

`node scripts/check-remote-schema.mjs` is a read-only production compatibility
gate. It checks the fixed production migration history (including the two
explicit historical aliases whose SQL was verified) and required tables/RPCs.
It does not apply migrations. The migration helper is an operator tool pinned
to the approved staging and production project refs; it defaults to a dry run:

```bash
node scripts/apply-compatible-migrations.mjs staging
node scripts/apply-compatible-migrations.mjs production
```

Review the pending file names and hashes before any explicitly authorized
application with `--apply`. This is never run automatically by CI; production
migrations remain a separate operator-controlled database release step.

The operator transaction checks deferred constraints immediately while running
the upgrade. Existing-profile backfill otherwise leaves pending FK trigger
events that block the later RLS DDL. This preserves the historical migration
contents and runtime constraint defaults; it does not disable validation.
PostgreSQL documents the transaction-local behavior of
[SET CONSTRAINTS](https://www.postgresql.org/docs/current/sql-set-constraints.html).

Reproduce the populated upgrade safely before a release:

```bash
AIDORAA_LOCAL_UPGRADE_REPRO=1 node scripts/test-local-atomic-upgrade.mjs
```

This creates a uniquely named temporary database inside the verified local
Supabase container, applies the three legacy migrations, seeds one synthetic
profile, proves the old failure rolls back, and verifies the corrected upgrade
preserves the profile/chart and creates its revision head. It drops only that
temporary database and never connects to a remote project. P0 CI runs it too.
