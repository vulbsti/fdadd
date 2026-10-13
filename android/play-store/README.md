# Aidoraa: Play Store assets

Store listing material for `com.aidoraa.app`, the Trusted Web Activity (TWA) that opens https://www.aidoraa.com/astrologer.

## Contents

| Path | What it is | Play Console field |
|---|---|---|
| `listing.md` | App name, short and full description, category, tags, contact, policy URLs, content rating notes, Data safety draft, and **gaps to fix before submitting** | Main store listing, App content |
| `graphics/icon-512.png` | 512 x 512, 32-bit PNG (RGBA), rendered from `android/branding/icon.svg` | App icon |
| `graphics/feature-graphic.png` | 1024 x 500 PNG, no alpha: navy background, gold constellation "A", wordmark and tagline | Feature graphic |
| `screenshots/` | Empty for now (`.gitkeep`). Add phone screenshots from the emulator: at least 2 (up to 8), PNG or JPEG, 16:9 or 9:16, each side 320 to 3840 px; 1080 x 1920 or 1080 x 2400 works well | Phone screenshots |
| `src/` | Sources for the graphics (`icon.svg`, `feature-graphic.html`) | n/a |

### Re-rendering the graphics

```bash
R=<path to>/render.mjs   # Playwright/Chromium screenshot helper
node $R src/icon.svg graphics/icon-512.png 512 512
node $R src/feature-graphic.html graphics/feature-graphic.png 1024 500
# Play wants RGBA for the icon; the feature graphic may be RGB:
python3 -c "from PIL import Image as I; I.open('graphics/icon-512.png').convert('RGBA').save('graphics/icon-512.png'); I.open('graphics/feature-graphic.png').convert('RGB').save('graphics/feature-graphic.png')"
```

The feature graphic loads Playfair Display and Inter from Google Fonts; render with network access or the text falls back to Georgia/system sans.

## Publishing steps (Play Console)

Before you start, fix the blockers listed under "Gaps" in `listing.md` (account deletion URL, privacy policy placeholders, billing for the paid plan). Review will fail without the first two.

1. **Create the app.** Play Console > All apps > Create app. Name "Aidoraa: Understand Yourself" (or "Aidoraa"), default language English (US), App, Free (the app is free to install). Accept the declarations.
2. **Set up the store listing.** Grow > Store presence > Main store listing: paste the name, short and full description from `listing.md`; upload `graphics/icon-512.png`, `graphics/feature-graphic.png` and the screenshots. Store settings: category Lifestyle, tags, contact email, website.
3. **Complete App content.** Privacy policy URL (https://www.aidoraa.com/privacy), Ads (none), App access (give reviewers a test login, since everything is behind sign-in), Content rating (IARC questionnaire, notes in `listing.md`), Target audience (18+), Data safety (draft in `listing.md`), Account deletion URL, Financial/Health declarations (none), Government app (no).
4. **Build the release bundle.** From `android/`, with the upload keystore configured (`android/keystore.properties` or the `AIDORAA_UPLOAD_*` env vars): `./gradlew bundleRelease`. Output: `android/app/build/outputs/bundle/release/app-release.aab`. Bump `versionCode` in `android/app/build.gradle.kts` for each later upload.
5. **Internal testing track.** Test and release > Testing > Internal testing > Create new release. Opt in to **Play App Signing** when prompted (Google holds the app signing key; your keystore becomes the upload key). Upload the AAB, add release notes, save, review and roll out. Add tester emails under the Testers tab and open the opt-in link on a device.
6. **Register the Play signing key for Digital Asset Links.** Play Console > Test and release > Setup > App signing (App integrity). Copy the **App signing key certificate SHA-256** fingerprint. In Vercel > Project > Settings > Environment Variables, set `ANDROID_CERT_SHA256_FINGERPRINTS` (Production) to that value (comma-separate if you add more than one), then redeploy. The upload key's fingerprint is already built in (`src/app/.well-known/assetlinks.json/fingerprints.ts`).
   - Check: `curl https://www.aidoraa.com/.well-known/assetlinks.json` should list both fingerprints for `com.aidoraa.app`.
   - Why: apps installed from Play are signed with Google's key, not your upload key. If that key's fingerprint is missing, Chrome cannot verify the site-app link and the TWA shows a browser URL bar at the top.
   - On the test device, after installing from Play, clear Chrome's data or reinstall if the bar persists (verification is cached).
7. **Verify on device.** Install from the internal testing link, confirm there is no URL bar, sign-in (email and Google) works, and the payment flow behaves as intended.
8. **Promote.** Once internal testing looks good, promote the release to Closed testing and then Production. New personal developer accounts must run a closed test with at least 12 testers for 14 days before production access is granted.
