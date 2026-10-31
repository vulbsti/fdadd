# One-tap beta signup (www.aidoraa.com/beta)

The Android closed test on Google Play lists Google Groups as its testers.
People have to join a normal `@googlegroups.com` group by clicking
"Join group" themselves, and Google has no API that adds them. Our server can
fill a group on our own domain, run by Cloud Identity Free (no cost).

## Flow

1. The tester opens `/beta` and taps **Become a tester**.
2. `/beta/start` sends them to Google sign-in (scope `openid email`, account picker).
3. `/beta/callback` reads their verified email and adds it to `BETA_TESTERS_GROUP`
   with the Cloud Identity Groups API, using a service account that holds the
   Groups Admin role.
4. `/beta?joined=…` forwards them to `https://play.google.com/apps/testing/com.aidoraa.app`.
   There they tap "Become a tester", which is Google's own consent step. It can't
   be skipped, and it's what counts toward the 12 opted-in testers. Then they
   install.

Until every setting below exists, `/beta` shows the old manual steps.

## Current setup (2026-10-31)

- Cloud Identity Free org "Laplacia Labs" on **laplacianmind.com** (no paid
  subscription). `testers@laplacianmind.com` is the admin *user*; the group is
  **`beta@laplacianmind.com`** ("Aidoraa testers").
- Service account `aidoraa-beta-groups@level-studio-509811-a3.iam.gserviceaccount.com`
  in Cloud project "Aidoraa", with the Groups Admin role. Key kept on the
  owner's machine, not in the repo.
- `/beta/callback` redirect URI is on both OAuth clients ("Aidoraa Web" and
  "Aidoraa Drive Import"); the site uses `GOOGLE_CLIENT_ID`.
- Vercel Production has `BETA_TESTERS_GROUP` and `BETA_GROUPS_SERVICE_ACCOUNT_JSON`.
- Tested: the API adds a gmail.com account to the group (200).

## One-time setup

1. **Cloud Identity Free.** Sign up at https://workspace.google.com/signup/gcpidentity/welcome
   with the aidoraa.com domain and verify it with the TXT record Google gives
   you. You don't need to change MX, because the group never has to receive mail.
2. **Allow outside members.** Admin console > Apps > Google Workspace > Groups
   for Business > Sharing settings: turn on "Group owners can allow external
   members".
3. **Create the group.** Admin console > Directory > Groups > Create group:
   `beta@<domain>`. In its Access settings turn on "Allow members outside
   your organization". Set "Who can join" to "Only invited users".
4. **Service account.** In the Google Cloud project that has the Play billing
   service account (or any project), enable the **Cloud Identity API**. Reuse
   that service account or create a new one and download a JSON key.
5. **Give it the role.** Admin console > Account > Admin roles > Groups Admin >
   Admins > Assign service accounts, and paste the service account's email.
6. **Sign-in client.** In Google Cloud > APIs & Services > Credentials, open the
   OAuth web client whose ID is in `GOOGLE_SIGNIN_CLIENT_ID` (or in
   `GOOGLE_CLIENT_ID` if the first isn't set). Add the redirect URI
   `https://www.aidoraa.com/beta/callback`. Its OAuth consent screen must be
   "In production", or only listed test users can sign in. Email-only sign-in
   doesn't need Google's review.
7. **Vercel (Production).**
   - `BETA_TESTERS_GROUP=testers@aidoraa.com`
   - `BETA_GROUPS_SERVICE_ACCOUNT_JSON=<key JSON or base64 of it>`. Leave it unset
     to reuse `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
8. **Play Console.** Testing > Closed testing > the track > Testers: add
   `beta@<domain>` as another Google Group. Keep `aidoraa-testers@googlegroups.com`
   so people who already joined stay in.
9. **Check it.** Open `/beta` on a phone and tap Become a tester. Confirm that the
   account appears in the group's member list and that Play's opt-in page
   accepts it. Errors show up in the Vercel logs as `[beta/callback]`.

## Notes

- Play may take a few minutes to notice a new group member. The page tells
  testers to wait and tap Continue again.
- Google blocks sign-in inside some in-app browsers, such as Instagram and
  Facebook. If sign-in won't load, tell testers to open the link in Chrome.
