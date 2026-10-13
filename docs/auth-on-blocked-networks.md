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
   If you use a different client, add its ID to Supabase > Authentication >
   Providers > Google > Client IDs.
3. **Supabase** > Authentication > Email Templates:
   - Confirm signup: link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/astrologer`
   - Reset password: link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password`

## Checking it

On a phone or emulator with Private DNS off on an affected network: email
sign-in, Google sign-in, sign-up confirmation and password reset should all
work without the device ever resolving `supabase.co`.
