# Supabase Auth + Google + Razorpay Setup

Status: Supabase project, schema, auth URLs, and Vercel integration are connected.
Google OAuth credentials and Razorpay account settings are still required.

## System map

```text
Browser
  ├─ email/password or Google sign-in
  │    └─ Supabase Auth → cookie session → Next.js middleware refresh
  └─ Pay button
       └─ POST /api/payments/orders (authenticated)
            ├─ server selects the plan and amount
            ├─ Razorpay creates the order
            └─ Supabase service role records the order

Razorpay Checkout
  ├─ browser success → POST /api/payments/verify
  │    └─ server verifies HMAC using the order stored in Supabase
  └─ payment.captured webhook → POST /api/payments/webhook
       └─ raw-body HMAC verification → payment_orders.status = paid
```

The browser callback improves UX, but it does not grant access. A verified,
captured webhook is the payment source of truth.

## Decisions

- Use `@supabase/ssr` cookies so browser, Server Components, and API routes see
  the same authenticated user.
- Use Google through Supabase OAuth. Do not add a second Google auth SDK.
- Keep the Supabase publishable key public and enforce ownership with RLS.
- Keep the Supabase service-role key and both Razorpay secrets server-only.
- Use Razorpay Standard Checkout. It is smaller and safer than building custom
  card/UPI UI.
- Phase 1 supports one INR, one-time payment configured on the server. Add a
  catalog table only when the product actually has several prices.
- Payment APIs accept a plan ID, never an amount from the browser.
- Payment records are client-read-only. Server routes own all writes.
- Do not build subscriptions, coupons, invoices, or an entitlement engine until
  the business rules require them.

## 1. Supabase project

1. The dedicated `aidoraa` project is deployed in Mumbai (`ap-south-1`).
2. In Project Settings → API, the application uses:
   - Project URL
   - Publishable key (`sb_publishable_...`)
   - Secret key (`sb_secret_...`, server-only)
3. `supabase/migrations/202608230001_auth_and_payments.sql` has been applied.
4. Authentication → URL Configuration is managed by `supabase/config.toml`:
   - Site URL: `https://www.aidoraa.com`
   - Redirect URLs:
     - `https://www.aidoraa.com/auth/callback`
     - `https://www.aidoraa.com/auth/confirm`
     - `http://localhost:9002/auth/callback`
     - `http://localhost:9002/auth/confirm`
5. Keep email confirmation enabled for production.
6. The signup call supplies `/auth/callback?next=/profile` as its
   `emailRedirectTo`. The default hosted email template therefore returns with
   a PKCE code that the callback exchanges for a cookie-backed session.

On the Free plan, Supabase does not allow editing email templates while using
its default email provider. If custom SMTP is added later, the existing
`/auth/confirm` route also supports a token-hash template.

Do not use `aidoraa.com` as the primary Site URL. It redirects to `www`, which
adds another hop to sensitive callback traffic.

## 2. Google sign-in

1. In Google Auth Platform, create a Web application OAuth client.
2. Authorized JavaScript origins:
   - `https://www.aidoraa.com`
   - `http://localhost:9002`
3. Authorized redirect URI: use the exact Supabase callback shown on the
   Supabase Google provider page:

   `https://<project-ref>.supabase.co/auth/v1/callback`

4. Put the Google Client ID and Client Secret in Supabase Authentication →
   Providers → Google and enable it.

The Google client secret belongs in Supabase, not Vercel and not this repo.

## 3. Vercel variables

Copy `.env.example` to `.env.local` for development. Add the same variables in
Vercel Project → Settings → Environment Variables.

The Vercel project is connected to `vulbsti/fdadd`: feature branches create
Preview deployments, while changes merged to `main` create Production
deployments for `www.aidoraa.com`.

| Variable | Browser visible | Environments |
|---|---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Production, Preview, Development |
| `SUPABASE_SECRET_KEY` | no | Production and Preview; `.env.local` for local development |
| `RAZORPAY_KEY_ID` | returned for checkout | Test key outside Production; Live key in Production |
| `RAZORPAY_KEY_SECRET` | no | Match the Key ID's mode |
| `RAZORPAY_WEBHOOK_SECRET` | no | Separate test/live values |
| `AIDORAA_PAYMENT_AMOUNT_PAISE` | server-owned | Set only after price approval |
| `AIDORAA_PAYMENT_CURRENCY` | no | `INR` |
| `AIDORAA_PAYMENT_PLAN_NAME` | displayed | Approved product label |

Never put the service-role key, Razorpay Key Secret, or webhook secret in a
`NEXT_PUBLIC_` variable.

## 4. Razorpay dashboard

1. Complete account/KYC requirements.
2. Start in Test Mode and create test API keys.
3. Enable automatic capture.
4. Create a webhook:
   - URL: `https://www.aidoraa.com/api/payments/webhook`
   - Secret: generate a unique value of at least 32 random characters
   - Events: `payment.captured`, `payment.failed`, `order.paid`
5. Run the test matrix below before creating Live keys.
6. For production, replace only the Production environment with Live keys and
   configure the matching Live Mode webhook.

The webhook secret is independent of the Razorpay API Key Secret.

## 5. Verification matrix

### Auth

- Email signup sends a confirmation link.
- Confirmation returns to `/profile` with a cookie-backed session.
- Email sign-in survives refresh and a new tab.
- Google sign-in returns through `/auth/callback` to `/profile`.
- Sign-out removes access to `/profile` and `/billing`.
- A malformed `next=//external-site` callback cannot redirect off-site.

### Database and authorization

- An anonymous client cannot read `profiles` or `payment_orders`.
- User A cannot read User B's profile or orders.
- An authenticated browser cannot insert or update `payment_orders` directly.
- Only the server service role can create/update payment records.

### Payments (Test Mode)

- An unauthenticated order request returns 401.
- Changing amount/currency in browser devtools has no effect.
- Successful checkout produces a `created` → `verified` → `paid` progression.
- Invalid browser callback signature returns 400 and changes nothing.
- Invalid webhook signature returns 400 and changes nothing.
- Duplicate captured webhooks leave the order paid without duplicate effects.
- A late failure webhook cannot downgrade a paid order.
- Closing the browser after payment still results in `paid` through the webhook.

## 6. Product decision still required

Before enabling the Pay button, approve:

- the product name;
- the one-time price in paise;
- exactly what a captured payment unlocks;
- refund and cancellation policy;
- whether tax invoices are handled by Razorpay or a separate accounting flow.

When that is decided, add a small idempotent `grant_entitlement(order_id)` step
after `payment_orders.status` becomes `paid`. Do not grant access from the
browser verification route.

## Rollout

1. Configure Supabase and apply the migration. **Complete.**
2. Test email and Google auth locally.
3. Add Supabase variables to Vercel and verify production auth.
4. Configure Razorpay Test Mode and an approved test price.
5. Exercise every payment test above on a non-production deployment.
6. Add the entitlement rule.
7. Switch Production to Live Mode keys and perform one low-value live payment.
8. Confirm payment, webhook, database state, entitlement, refund path, and logs.

Rollback is simple: remove or disable the payment price variable to hide active
checkout, and disable Google or Razorpay at the provider dashboard. Existing
auth and payment audit records remain intact.
