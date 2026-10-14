# Backend for the native Aidoraa app

Status: code and migration are in the repository. This document does not
assert that the migration is applied or that Play Console, Google Cloud or
Vercel are configured; check each before release.

## How the app talks to the server

- Sign-in goes through Supabase Auth at `https://www.aidoraa.com/sb` (the same
  proxy the website uses). The server keeps calling the real project URL.
- Every API call sends `Authorization: Bearer <supabase access token>`. The
  server verifies it with `auth.getUser(token)` and queries as that user, so
  row level security applies. The website keeps using the cookie. One helper
  does both: `getRequestUser()` in `src/lib/supabase/request-auth.ts`, used by
  `/api/astrologer/*`, `/api/connectors/*` and `/api/app/v1/*`.
- The app also sends `X-Aidoraa-App-Version: <semver>` and
  `X-Aidoraa-Platform: android|ios`. `/api/app/v1/*` answers
  `426 {code: 'update_required', message, minSupportedVersion}` to builds
  older than `APP_MIN_SUPPORTED_VERSION`. Requests without the header (the
  website) are never blocked.

## Environment variables (Vercel)

| Name | Default | Purpose |
| --- | --- | --- |
| `APP_MIN_SUPPORTED_VERSION` | `1.0.0` | Oldest app build allowed on `/api/app/v1/*`. |
| `PLAN_LIMITS_ENFORCED` | off | `true` turns on monthly question limits on `POST /api/astrologer/chat` (429 `quota_exceeded`). |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | unset | Service account key JSON (raw or base64). Unset: verify answers 503 `unconfigured`. Server only. |
| `GOOGLE_PLAY_RTDN_TOKEN` | unset | Long random secret carried in the Pub/Sub push URL. Unset: the notification route answers 503. |

Plan prices and monthly question allowances live in
`src/lib/payments/plans.ts` (`FREE_MONTHLY_QUESTIONS` and friends).

## Play Console and Google Cloud setup

1. Play Console > the app `com.aidoraa.app` > Monetize > Subscriptions: create
   the subscription `aidoraa_membership` with three auto-renewing monthly base
   plans, priced in USD (let Play convert other countries):
   `basic-monthly` $5, `plus-monthly` $20, `pro-monthly` $60.
2. Google Cloud (any project, free tier): create a service account, enable the
   Google Play Android Developer API, create a JSON key, and put the whole JSON
   in `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
3. Play Console > Users and permissions: invite the service account email and
   give it access to the app with "View financial data, orders and
   cancellation survey responses" and "Manage orders and subscriptions".
4. Google Cloud > Pub/Sub: create a topic (e.g. `play-billing`) and grant
   `google-play-developer-notifications@system.gserviceaccount.com` the
   Pub/Sub Publisher role on it. Create a push subscription on that topic to
   `https://www.aidoraa.com/api/billing/google/rtdn?token=<GOOGLE_PLAY_RTDN_TOKEN>`.
   The token in the URL is the only credential; keep it secret and rotate it
   by changing both the env var and the subscription URL.
5. Play Console > Monetization setup > Real-time developer notifications: enter
   the topic name and send a test notification (the route answers 200 and
   ignores it).
6. The app must set `obfuscatedAccountId` in the billing flow to the Supabase
   user id; verify refuses a purchase made for another account.

## Database

Apply `supabase/migrations/20261014120000_mobile_app_memberships_and_preferences.sql`
with `node scripts/apply-compatible-migrations.mjs staging` (dry run), then
`--apply`, then the same for production. It adds:

- `public.subscriptions`: one row per user; the owner can read it, only the
  service role writes it. No row means Free.
- `public.app_preferences`: the app's home layout; owner select/insert/update.
- `public.account_deletion_cleanups`: file cleanups left by account deletions,
  retried by the daily `/api/cron/astrologer-dispatch` sweep. Server only.
- an index on `astro_messages (user_id, created_at) where role = 'user'` for
  the monthly question count.

Until it is applied, `/api/app/v1/bootstrap` treats everyone as Free with no
saved layout; verify, home-layout and the limits need the tables.

## Account deletion

`DELETE /api/app/v1/account` (also used by the web page `/account/delete`,
the URL to give Google Play) stops a renewing Google Play membership, revokes
the Google Drive grant, ends every session, deletes `payment_orders` and
`person_exploration_contexts` rows (both block the cascade), deletes the auth
user (everything else cascades), then removes the user's files under
`<userId>/` in the `pi-workspaces` and `person-imports` buckets and in the edge
R2 store. Failed file steps, and accounts that had a run in progress, are
queued in `account_deletion_cleanups` for the daily sweep.

## Connectors, Drive picker and reports from the app

- `POST /api/app/v1/connectors/{notion|google}/start-url {personId}` returns
  `{url}`. The OAuth state is a one-time ticket (`app_handoff_tickets`, 10
  minutes, hash only). The existing callbacks finish the connection as on the
  web and redirect to `aidoraa://connectors/<service>?result=connected|cancelled|failed`.
  The provider redirect URIs do not change.
- `POST /api/app/v1/connectors/google/picker-url {personId}` returns `{url}`
  to `/connectors/google/pick?ticket=…`. That page works without the website
  cookie, shows Google's picker, fetches the picked files into a pending
  import and redirects to
  `aidoraa://imports?result=imported|cancelled|failed&count=N&personId=…&importId=…`.
  The app then shows the import for review and confirms it through
  `/api/astrologer/profiles/{personId}/imports/{importId}` and `/confirm`.
- `POST /api/app/v1/reports` stores a report of an AI reply in
  `ai_reply_reports` (people can add, never read; 10 per 10 minutes, 50 a day).

Apply `supabase/migrations/20261014150000_app_handoffs_and_reply_reports.sql`
after the membership migration.
