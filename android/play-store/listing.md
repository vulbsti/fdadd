# Aidoraa: Google Play store listing

Package: `com.aidoraa.app` (Trusted Web Activity for https://www.aidoraa.com/astrologer)
Default language: English (United States) – en-US

Character counts are checked against Play limits (see "Lengths" at the end).

---

## App name (max 30)

```
Aidoraa: Understand Yourself
```

Fallback if you want the plain brand only: `Aidoraa`

## Short description (max 80)

```
See what's shaping your life right now, and where to put your energy next.
```

Alternative: `A guide that knows your whole story: mind, timing, people and the world.`

## Full description (max 4000)

```
Some seasons, everything lands. Others, nothing does, however hard you push. That is not only about effort. How your mind works, the people around you, the economy you live in and the rhythm of your own life are all moving with you or against you, mostly out of sight.

Aidoraa brings them together into one clear picture of your life, so you can see why things unfold the way they do, and choose where to focus next.

A GUIDE THAT KNOWS YOUR WHOLE STORY
Talk to Aidoraa the way you would talk to someone who truly knows you. It remembers what you share and builds on it, so you never start from zero. The more you share, the clearer the picture becomes and the more useful its answers get.

ONE PICTURE, MANY LENSES
No single lens holds the answer. The understanding comes from how they connect, and you are where they meet.
• Mind: how you decide, what drives you, and what quietly holds you back.
• Timing: your birth chart, read as one lens on your nature and the seasons of your life, and always checked against what has actually happened to you.
• World: how events far away find their way into your work, your money and your plans.
• People: the relationships and circles that shape what feels possible, and which way they pull.
• Place: the communities and rhythms that sustain you or drain you.

WHAT YOU GET
• A conversation that knows you and remembers what matters.
• Your life map: the chapters and turning points that brought you here.
• Your patterns: the loops you keep repeating, what sets them off, and what breaks them.
• Your people: the relationships that shape you, and how each one pulls on you.
• Paths ahead: the choices in front of you, played forward, so you can weigh where each might lead before you take it.

HOW IT BEGINS
1. Tell it when and where you were born. That is enough for a first sketch of you.
2. Talk about your life: what happened, what you want, what keeps getting in the way. Bring old notes and past AI chats if you like.
3. Watch the picture sharpen. Every conversation adds detail, and the picture changes when the evidence does.

WHAT WE BELIEVE
• You come first, not the method. Each lens is a tool for understanding you; none of them is the truth on its own.
• Your life is the evidence. Every reading is checked against your real experience, and it changes when it does not fit.
• Understanding should lead somewhere: to deciding well, timing things well, and not repeating what hurts.
• Your story stays yours. What you share is private and used only to understand you better.

A NOTE ON WHAT AIDORAA IS
Aidoraa is a tool for reflection and self-understanding. It offers perspectives, not guarantees, and it does not predict the future. It is not a substitute for professional medical, psychological, legal or financial advice.

Privacy policy: https://www.aidoraa.com/privacy
Terms: https://www.aidoraa.com/terms
```

## Category and tags

- **App category:** Lifestyle (primary recommendation). Alternative: Health & Fitness is not recommended (invites health-claim review); Productivity is a weaker fit.
- **Tags** (pick up to 5 in Play Console > Store settings > Tags; choose the closest available): Self-improvement, Journaling, Personal growth / Wellbeing, Astrology & horoscopes (one tag only, as a secondary lens), AI assistant / Chatbot.

## Contact details

- Email (required, public): `support@aidoraa.com` **(placeholder: confirm the mailbox exists)**
- Website: https://www.aidoraa.com
- Phone: optional, leave blank

## Policy URLs

- Privacy policy: https://www.aidoraa.com/privacy
- Terms of service: https://www.aidoraa.com/terms
- Account deletion URL: **MISSING (see "Gaps" below)**

---

## Content rating questionnaire (IARC) notes

Category to choose: **"All other app types"** (not Game, not Social/Communication-first).

| Question area | Suggested answer | Why |
|---|---|---|
| Violence, blood, sexual content, profanity, drugs, alcohol, tobacco, gambling | No | None in app content. |
| Simulated gambling / real-money gambling | No | Single paid access plan via Razorpay; no wagering. |
| Users can interact or exchange content with **other users** | No | Chat is one-to-one with the AI; nothing is shared with other users. |
| Shares user's physical location with other users | No | Birth place is stored privately; not shared. |
| Allows purchase of digital goods | Yes | Paid "Aidoraa access" plan (Razorpay). See billing gap below. |
| Unrestricted internet access / web browser | No | TWA is locked to aidoraa.com. |
| Generative AI content | Declare yes where asked | Chat replies are AI-generated. |

Expected outcome: IARC 3+ / PEGI 3 / ESRB Everyone, possibly 12+ in some regions because of open-ended AI chat. **Target audience** (App content > Target audience): set **18+** (or 16+ minimum) so the app is not in scope for the Families policy.

Also in App content:
- **Ads:** No ads.
- **AI-generated content policy:** Google requires apps with generative AI to let users report or flag offensive AI output from inside the app. Add a "Report this reply" control (or at least a feedback link) in the chat before production review.
- **Health / financial features declaration:** Answer no to health and financial-services features; the app gives reflective perspectives, not medical or financial advice (the description states this).

---

## Data safety form (draft)

Based on the code as of today: Supabase auth (`src/contexts/AuthContext.tsx`: email + password or Google sign-in, display name), `BirthInputSchema` in `src/lib/astro/contracts.ts` (name, birth date, time, latitude/longitude, timezone, place name), chat messages, imports (`src/app/api/astrologer/profiles/[personId]/imports`: uploaded export files, Google Drive picker, Notion pages), payments (`src/app/api/payments`: Razorpay orders, verify, webhook), AI replies through an LLM provider (`src/lib/ai/provider.ts`, OpenRouter/OpenAI-compatible).

**Overview answers**

- Does your app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes** (HTTPS only)
- Do you provide a way for users to request that their data be deleted? **Must be Yes for approval; currently not implemented, see Gaps.**

**Data types**

| Data type (Play category) | Collected | Shared* | Optional? | Purposes | Notes |
|---|---|---|---|---|---|
| Personal info > Name | Yes | No | Required | App functionality, Account management | Account name and the name on the birth profile. |
| Personal info > Email address | Yes | No | Required | Account management, App functionality, Developer communications | Supabase auth; Google sign-in returns email. |
| Personal info > User IDs | Yes | No | Required | Account management | Supabase user id. |
| Personal info > Other info | Yes | No | Required | App functionality, Personalization | Birth date, birth time, birth place (with its coordinates and timezone). Typed by the user; this is **not** device location. |
| Location (approximate / precise) | **No** | No | n/a | n/a | The app does not read device location. Birth-place coordinates go under "Other info" above. |
| Messages > Other in-app messages | Yes | No | Required | App functionality, Personalization | Chat messages with the AI guide. |
| Files and docs | Yes | No | Optional | App functionality, Personalization | Imported notes, past AI chat exports, Google Drive and Notion pages the user chooses. |
| Financial info > Purchase history | Yes | No | Optional | App functionality, Account management | Order id, amount, status of the access plan. Card or UPI details are entered with Razorpay and never reach Aidoraa's servers. |
| App activity > Other user-generated content | Yes | No | Required | App functionality | Profile notes/answers the user writes. |
| App info and performance > Crash logs / Diagnostics | Yes, if server logs count | No | Required | Analytics | Server request logs only (IP, user agent). No analytics SDK found in the codebase. |
| Device or other IDs | No | No | n/a | n/a | TWA adds no SDKs. |

\*"Shared" in Play's sense excludes transfers to **service providers** processing data on your behalf. Supabase (hosting/auth), the LLM provider (chat processing), Razorpay (payment processing), Google Drive / Notion (user-initiated imports) and Vercel (hosting) all count as service providers, so answer "Not shared" but name them in the privacy policy.

**Security practices**
- Data encrypted in transit: Yes
- Users can request deletion: Yes, once the deletion URL below exists
- Independent security review: No
- Committed to Play Families policy: No (18+ audience)

---

## Gaps to fix before submitting

1. **No account deletion.** A search for "delete account" / account deletion across `src/` finds nothing; only per-import and connector `DELETE` routes exist. Play requires (a) an in-app path to delete the account and (b) a public **web URL** where users can request deletion without reinstalling the app. Add e.g. `https://www.aidoraa.com/account/delete` (sign-in + confirm, or a request form/email) and a "Delete account" button in Settings that removes the Supabase user, profiles, chats, imports and stored files.
2. **Privacy policy is still a template.** `src/app/privacy/page.tsx` contains `[Your Website URL]`, `[Your Contact Email/Link]` and a "this is a template" note, says nothing about birth details' sensitivity beyond one line, and does not name Razorpay or Notion/Google Drive. Play reviewers reject placeholder policies. Also `src/app/terms/page.tsx` has `[Your Country]` and `[Your Contact Email/Link]`. The policy should also describe retention and how to delete data.
3. **Payments inside a Play app.** The paid "Aidoraa access" plan is sold through Razorpay. Under Google Play's Payments policy, digital access sold inside an app distributed on Play must use Google Play Billing, unless you enroll in **User Choice Billing / alternative billing** (available for users in India) and meet its UI requirements. Options: enroll in alternative billing for India, add Play Billing (Digital Goods API for TWA), or hide the purchase flow in the TWA and let users buy on the web (follow the current anti-steering rules for your region).
4. **AI content reporting** control in the chat (see Content rating notes).
5. **Support email** placeholder above must be a real, monitored address.

---

## Lengths

- App name "Aidoraa: Understand Yourself": 28 / 30
- Short description: 74 / 80 (alternative: 72 / 80)
- Full description: 2867 / 4000
