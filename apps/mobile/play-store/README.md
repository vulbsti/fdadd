# Aidoraa: Play Store assets

Store listing material for `com.aidoraa.app`, the native Android app in `apps/mobile`.

## Contents

| Path | What it is | Play Console field |
|---|---|---|
| `listing.md` | App name, descriptions, category, the four plans and their Play product ids, content rating notes, Data safety answers, and gaps to fix before submitting | Main store listing, Monetize, App content |
| `graphics/icon-512.png` | 512 x 512 RGBA PNG, rendered from `src/icon.svg` | App icon |
| `graphics/feature-graphic.png` | 1024 x 500 PNG, no alpha | Feature graphic |
| `screenshots/` | Empty for now. Add 2 to 8 phone screenshots of the native app (1080 x 2400 works well): Now, Life map, Ask, Plans | Phone screenshots |
| `src/` | Sources for the graphics | n/a |

### Re-rendering the graphics

```bash
R=<path to>/render.mjs   # any headless-Chromium screenshot helper
node $R src/icon.svg graphics/icon-512.png 512 512
node $R src/feature-graphic.html graphics/feature-graphic.png 1024 500
python3 -c "from PIL import Image as I; I.open('graphics/icon-512.png').convert('RGBA').save('graphics/icon-512.png'); I.open('graphics/feature-graphic.png').convert('RGB').save('graphics/feature-graphic.png')"
```

Screenshots: `adb exec-out screencap -p > screenshots/01-now.png` on a device or emulator signed in to a test account (never a production account with real data).

## Publishing steps (Play Console)

1. **Create the app.** All apps > Create app. Name "Aidoraa: Understand Yourself", default language English (US), App, Free to install.
2. **Store listing.** Paste the texts from `listing.md`; upload the icon, feature graphic and screenshots. Category Lifestyle.
3. **App content.** Privacy policy URL, Ads (none), App access (a reviewer test login), Content rating, Target audience 18+, Data safety (from `listing.md`), Account deletion URL `https://www.aidoraa.com/account/delete`.
4. **Subscriptions.** Monetize > Products > Subscriptions: create `aidoraa_membership` with the base plans `basic-monthly`, `plus-monthly`, `pro-monthly` (auto-renewing, monthly). Activate them. In Setup > API access, link the Google Cloud service account the server uses for `POST /api/app/v1/billing/google/verify`. Add license testers (Setup > License testing) so test purchases are free.
5. **Build the bundle.** From `apps/mobile`, with the upload key configured (see `../README.md`): `./gradlew :androidApp:bundleRelease`. Output: `androidApp/build/outputs/bundle/release/androidApp-release.aab`. Raise `versionCode` in `androidApp/build.gradle.kts` for every upload.
6. **Internal testing.** Test and release > Internal testing > Create release. Opt in to Play App Signing (your keystore becomes the upload key). Upload the AAB and roll out to testers.
7. **Google sign-in.** In Google Cloud, add an **Android** OAuth client for `com.aidoraa.app` with the **Play app signing** SHA-256 (App integrity page) and with the upload key's SHA-256 for sideloaded builds. The app itself uses the **web** client id (`aidoraaGoogleWebClientId`), which must be the one Supabase accepts for Google ID tokens.
8. **Verify on device.** Install from the testing link: email and Google sign-in, a test purchase on each plan, Restore purchases, an import, account deletion with a Play subscription active.
9. **Promote** to Closed testing, then Production. New personal developer accounts need a closed test with at least 12 testers for 14 days first.
