# Sign-in on networks that block supabase.co

Some ISPs (seen on ACT in India, 2026-10-13) answer every DNS lookup under
`supabase.co` with their own address, even when asked through 1.1.1.1 or
8.8.8.8. Browsers on those networks cannot reach `<project>.supabase.co`, so
sign-in fails unless the browser uses encrypted DNS.

What keeps sign-in working there:

- **Browser to Supabase** goes through `https://www.aidoraa.com/sb/*`, a
  rewrite in `next.config.ts` (`SUPABASE_PROXY_PATH`). Servers call Supabase
  directly. The browser client keeps the real project's cookie name so the
  session is shared with the server.
- **Google sign-in** runs through `/auth/google/start` and
  `/auth/google/callback`. Google returns to our domain and the server signs in
  with `signInWithIdToken`. Until it is configured, `/auth/google/start` falls
  back to Supabase's hosted flow, which returns via `supabase.co`.
- **Email links** must point at our domain, not `supabase.co`.

## One-time setup

1. **Google Cloud console** > APIs & Services > Credentials > the OAuth client
   that Supabase's Google provider uses > Authorized redirect URIs: add
   `https://www.aidoraa.com/auth/google/callback`.
2. **Vercel** > Project > Settings > Environment Variables (Production, and
   Preview if wanted): set `GOOGLE_SIGNIN_CLIENT_ID` and
   `GOOGLE_SIGNIN_CLIENT_SECRET` to that client's ID and secret, then redeploy.
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are the Google Drive connector's
   and are not read by sign-in.
   If you use a different client, add its ID to Supabase > Authentication >
   Providers > Google > Client IDs.
3. **Supabase** > Authentication > Email Templates (needs step 4 first on the
   Free plan). Paste `supabase/templates/confirmation.html` and
   `supabase/templates/recovery.html`, with subjects "Confirm your email at
   Aidoraa" and "Reset your Aidoraa password". Their links:
   - Confirm signup: link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/astrologer`
   - Reset password: link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password`

4. **Sender name.** The proxy only changes which address browsers reach; the
   email itself still comes from Supabase's built-in mailer ("Supabase Auth",
   with a "powered by Supabase" footer) until the project has its own SMTP.
   Supabase > Authentication > Emails > SMTP Settings: turn on custom SMTP,
   sender `Aidoraa <hello@aidoraa.com>` (any address on the domain), and the
   host, port, user and password of a mail service allowed to send for
   aidoraa.com (for example Resend's free tier: verify the domain with the DNS
   records it gives, then host `smtp.resend.com`, port 465, user `resend`,
   password = an API key). Zoho's free plan has no SMTP access. Then raise
   Authentication > Rate Limits > emails per hour (2 with the built-in mailer).

If sign-in fails, Vercel's function logs for `/auth/callback` and
`/auth/google/callback` record the reason Supabase or Google gave.

## Checking it

On a phone or emulator with Private DNS off on an affected network: email
sign-in, Google sign-in, sign-up confirmation and password reset should all
work without the device ever resolving `supabase.co`.
