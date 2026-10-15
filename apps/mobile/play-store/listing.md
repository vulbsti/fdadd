# Aidoraa: Google Play store listing

Package: `com.aidoraa.app`. This is the native Android app built from `apps/mobile` (Kotlin + Compose Multiplatform), not a web wrapper.
Default language: English (United States), en-US.

Character counts are checked against Play limits (see "Lengths" at the end).

---

## App name (max 30)

```
Aidoraa: Understand Yourself
```

Fallback: `Aidoraa`

## Short description (max 80)

```
See what's shaping your life right now, and where to put your energy next.
```

## Full description (max 4000)

```
Some seasons, everything lands. Others, nothing does, however hard you push. That is not only about effort. How your mind works, the people around you, the world you live in and the rhythm of your own life are all moving with you or against you, mostly out of sight.

Aidoraa brings them together into one clear picture of your life, so you can see why things unfold the way they do, and choose where to focus next.

A GUIDE THAT KNOWS YOUR WHOLE STORY
Talk to Aidoraa the way you would talk to someone who truly knows you. It remembers what you share and builds on it, so you never start from zero. The more you share, the clearer the picture becomes.

WHAT YOU GET
• Now: the chapter you are in, what drives you, your patterns and the people around you, on one home screen you arrange the way you like.
• Life map: the chapters and turning points that brought you here, and the paths that may come next.
• Ask: a conversation that knows you. Answers appear as they are written, and past conversations are always there.
• People: the relationships that shape you. Add your partner or family and understand them too.
• Imports: bring in notes from Notion or Google Drive, or exports from Google Keep, ChatGPT, Claude and Gemini.

HOW IT BEGINS
1. Tell it your name, and when and where you were born. That is enough for a first sketch.
2. Talk about your life: what happened, what you want, what keeps getting in the way.
3. Watch the picture sharpen. It changes when your life shows it got something wrong.

PLANS
Every plan has every feature. Higher plans give more room: more conversations and deeper analysis each month.
• Free: try everything.
• Basic, Plus and Pro: monthly memberships through Google Play, cancel any time in Google Play.

YOUR STORY STAYS YOURS
What you share is private and used only to understand you better. You can download your data or delete your account at any time, from inside the app.

A NOTE ON WHAT AIDORAA IS
Aidoraa is a tool for reflection and self-understanding. It offers perspectives, not guarantees, and it does not predict the future. It is not a substitute for professional medical, psychological, legal or financial advice.

Privacy policy: https://www.aidoraa.com/privacy
Terms: https://www.aidoraa.com/terms
```

## Category and tags

- **App category:** Lifestyle.
- **Tags** (up to 5): Self-improvement, Journaling, Personal growth / Wellbeing, AI assistant / Chatbot.

## Contact details

- Email (public): `support@aidoraa.com` **(confirm the mailbox exists)**
- Website: https://www.aidoraa.com

## Policy URLs

- Privacy policy: https://www.aidoraa.com/privacy
- Terms of service: https://www.aidoraa.com/terms
- Account deletion URL: https://www.aidoraa.com/account/delete (the app also has You > Delete account)

---

## In-app products (Monetize > Subscriptions)

One subscription with three auto-renewing monthly base plans. The server's `/api/app/v1/plans` catalog names the same ids.

| Subscription product id | Base plan id | Plan | US price | Monthly questions |
|---|---|---|---|---|
| `aidoraa_membership` | `basic-monthly` | Basic | $5 | 150 |
| `aidoraa_membership` | `plus-monthly` | Plus | $20 | 800 |
| `aidoraa_membership` | `pro-monthly` | Pro | $60 | 3000 |

Free ($0, 10 questions) is not a Play product.

- Set each base plan to **auto-renewing, 1 month**, and let Play convert prices for other countries (the app shows Play's local price; the USD figure is only a fallback).
- Tier changes use the old purchase token with time proration.
- The app sets `obfuscatedAccountId` to the Supabase user id and sends each purchase token to `POST /api/app/v1/billing/google/verify`. The server checks the purchase with Google and decides the plan; the app never unlocks anything itself.
- Manage link used in the app: `https://play.google.com/store/account/subscriptions?sku=aidoraa_membership&package=com.aidoraa.app`

---

## Content rating questionnaire (IARC) notes

Category: **"All other app types"**.

| Question area | Answer | Why |
|---|---|---|
| Violence, sexual content, profanity, drugs, gambling | No | None in app content. |
| Users interact with **other users** | No | Chat is one-to-one with the AI. |
| Shares the user's location with other users | No | Birth place is stored privately; device location is never read. |
| Purchase of digital goods | Yes | Monthly membership through Google Play Billing. |
| Unrestricted internet / web browser | No | Web pages (terms, privacy, connector sign-in) open in a Custom Tab. |
| Generative AI content | Yes | Answers are AI-generated. Every answer can be reported in the app (long-press or the ••• under it: Seems wrong / Harmful / Offensive / Something else, plus a note). |

**Target audience:** 18+.
**Ads:** none.

---

## Data safety form

Based on the native app as built. The app contains no analytics, ads or crash-reporting SDKs. Network calls go only to `www.aidoraa.com` (API and the `/sb` sign-in proxy), Google Play (billing) and Google's Credential Manager (sign-in).

**Overview**

- Collects or shares user data: **Yes**
- Encrypted in transit: **Yes** (HTTPS only; the sign-in session is also encrypted at rest with an Android Keystore key)
- Users can request deletion: **Yes**: in the app (You > Delete account) and at https://www.aidoraa.com/account/delete

**Data types**

| Play category | Collected | Shared* | Optional? | Purposes | What exactly |
|---|---|---|---|---|---|
| Personal info > Name | Yes | No | Required | App functionality, Account management | Display name, and the name of each person the user adds. |
| Personal info > Email address | Yes | No | Required | Account management | Email sign-in, or the email from Google sign-in. |
| Personal info > User IDs | Yes | No | Required | Account management | Account id; also sent to Google Play as the obfuscated account id on purchases. |
| Personal info > Other info | Yes | No | Optional | App functionality, Personalization | Birth date, birth time and birth place (with coordinates and timezone), typed by the user. Not device location. |
| Location | **No** | | | | The app has no location permission. |
| Messages > Other in-app messages | Yes | No | Required | App functionality, Personalization | Conversations with Aidoraa. |
| Files and docs | Yes | No | Optional | App functionality, Personalization | Export files the user picks (Google Keep, ChatGPT, Claude, Gemini, other chats), and Notion / Google Drive pages they choose. Only text is uploaded. |
| Financial info > Purchase history | Yes | No | Optional | App functionality | Google Play purchase token, plan and status. Card details stay with Google Play. |
| App activity > Other user-generated content | Yes | No | Optional | App functionality | Home screen panel layout. |
| App info and performance | No | | | | No crash or analytics SDK. Server request logs only. |
| Device or other IDs | No | | | | |

\*Service providers that process data on Aidoraa's behalf (hosting, Supabase auth and database, the AI model provider, Google Play, Notion and Google Drive for imports the user starts) do not count as "sharing" in Play's sense. Name them in the privacy policy.

**Security practices**
- Data encrypted in transit: Yes
- Users can request deletion: Yes
- Independent security review: No

---

## Gaps to fix before submitting

1. **Privacy policy and terms are still templates.** `src/app/privacy/page.tsx` and `src/app/terms/page.tsx` contain `[Your ...]` placeholders. Reviewers reject placeholder policies. The policy should name the processors above, cover birth details, retention, export and deletion.
2. **Reviewer access.** Everything is behind sign-in; give reviewers a test account under App content > App access.
3. **Support email** must be a real, monitored address.
4. **Play subscription set-up**: create `aidoraa_membership` and the three base plans above, and configure the server's Google Play credentials, before the internal test.

---

## Lengths

- App name: 28 / 30
- Short description: 74 / 80
- Full description: about 2,350 / 4,000
