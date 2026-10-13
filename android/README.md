# Aidoraa for Android

A [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity)
that opens https://www.aidoraa.com/astrologer full screen. Sign-in (email and
Google), chat streaming, imports and payments all run on the live site, so the
app uses the same backend, session cookies and server-held keys as the web app
and ships no secrets.

If no browser that supports TWAs is installed, the app falls back to an in-app
WebView (Google sign-in is unavailable there; email sign-in still works).

## Build

Requirements: JDK 17+, Android SDK with platform 36 (`local.properties` with
`sdk.dir=...`, or `ANDROID_HOME`).

```bash
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease        # app/build/outputs/bundle/release/app-release.aab (Play upload)
```

Point a build at another deploy with `-PaidoraaOrigin=https://<preview-host>`.

### Release signing

Release builds are signed with the upload key when `android/keystore.properties`
exists (never commit it):

```properties
storeFile=app-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

or with the env vars `AIDORAA_UPLOAD_STORE_FILE`, `AIDORAA_UPLOAD_STORE_PASSWORD`,
`AIDORAA_UPLOAD_KEY_ALIAS`, `AIDORAA_UPLOAD_KEY_PASSWORD`. `storeFile` is
relative to `android/`.

## Link verification

Chrome hides its URL bar only when `https://www.aidoraa.com/.well-known/assetlinks.json`
lists the SHA-256 of the certificate that signed the installed app. The upload
key is built into `src/app/.well-known/assetlinks.json/fingerprints.ts`; add the
Play App Signing key through the `ANDROID_CERT_SHA256_FINGERPRINTS` env var
(comma-separated) once Play generates it.

## Store listing

See [play-store/README.md](play-store/README.md).
