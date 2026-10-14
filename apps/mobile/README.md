# Aidoraa mobile

The native Aidoraa app. Android ships first; iOS will be built from the same shared code later.

- **Stack:** Kotlin Multiplatform + Compose Multiplatform. There is no WebView; web pages such as terms and connector sign-in open in a Custom Tab.
- **Package:** `com.aidoraa.app`, version 1.0.0 (code 1). minSdk 26, targetSdk 36, compileSdk 37.

## Layout

```
apps/mobile
├── shared/        common UI, state, data and network (android + iosArm64 + iosSimulatorArm64)
│   └── src/commonMain/kotlin/com/aidoraa/app/
│       ├── core/      platform contracts (PlatformServices, BillingGateway, stores), time helpers
│       ├── data/      DTOs, ApiClient (Ktor), SSE parser, Supabase auth, JSON cache
│       ├── domain/    pure logic: panel layout, plans, version gate, run stream, life model
│       ├── state/     AppController + chat, imports, billing, onboarding controllers
│       └── ui/        theme, sky + glass components, screens
├── androidApp/    thin shell: Application, MainActivity, Play Billing, Credential Manager,
│                  pickers, Custom Tabs, adaptive icon
└── play-store/    listing text, Data safety answers, graphics
```

## Versions

Gradle 9.8.1, AGP 9.4.1, Kotlin 2.4.21, Compose Multiplatform 1.12.1, Ktor 3.6.0, kotlinx.serialization 1.11.0, coroutines 1.11.0, supabase-kt 3.8.0, Haze 2.0.1, Play Billing 9.1.0, Credentials 1.6.0, googleid 1.2.1. All versions are in `gradle/libs.versions.toml`.

## Build and test

You need JDK 17+ and an Android SDK with `platforms;android-37.0` and `build-tools;37.0.0`. Set `sdk.dir` in `local.properties`.

```bash
cd apps/mobile
./gradlew :androidApp:assembleDebug          # androidApp/build/outputs/apk/debug/androidApp-debug.apk
./gradlew :shared:testAndroidHostTest        # commonTest unit tests on the JVM
./gradlew :androidApp:installDebug           # to a connected device
```

## Configuration (public values only)

Each value is read from a Gradle property (`-P`, `~/.gradle/gradle.properties`, or `gradle.properties`), then from `local.properties`. If neither is set, the default below is used.

| Property | Default | What it is |
|---|---|---|
| `aidoraaOrigin` | `https://www.aidoraa.com` | Website and API origin. Point it at a staging or local server for testing. |
| `aidoraaSupabaseUrl` | `<origin>/sb` | Supabase, reached through the site's `/sb` proxy |
| `aidoraaSupabaseKey` | empty | Supabase **publishable / anon** key (public) |
| `aidoraaGoogleWebClientId` | empty | Google OAuth **web** client id, the one Supabase accepts for Google ID tokens |

If the key is empty, the app builds and runs, but the sign-in screen says sign-in is not set up in this build.

Never put service-role keys, provider keys or any other secret here. Everything in BuildConfig ships inside the APK.

Every request sends these headers:
- `Authorization: Bearer <Supabase access token>`
- `X-Aidoraa-App-Version: 1.0.0`
- `X-Aidoraa-Platform: android`

A `426 update_required` response shows a blocking "Update the app" screen. So does a `minSupportedVersion` from bootstrap that is newer than this build.

## Release signing

Release builds use R8 with minify and resource shrinking. They are signed with the upload key when one is configured, read from either of these:

- `apps/mobile/keystore.properties` (gitignored), with `storeFile`, `storePassword`, `keyAlias` and `keyPassword`. A relative `storeFile` resolves against `apps/mobile`.
- The environment variables `AIDORAA_UPLOAD_STORE_FILE`, `AIDORAA_UPLOAD_STORE_PASSWORD`, `AIDORAA_UPLOAD_KEY_ALIAS` and `AIDORAA_UPLOAD_KEY_PASSWORD`.

Without a key, `assembleRelease` produces an unsigned APK.

```bash
./gradlew :androidApp:assembleRelease :androidApp:bundleRelease
```

The `.gitignore` excludes `*.jks`, `*.keystore` and `keystore.properties`. Never commit the keystore or its passwords.

## Design and performance notes

- **Sky:** drawn on a Canvas. The stars twinkle at about 15 fps; with reduce-motion they are static.
- **Panels:** they are not blurred live. Each one draws the pre-blurred sky gradient aligned to the screen, plus a tint, so it costs the same on every phone.
- **Live blur (Haze):** used only on floating chrome (tab bar, composer), and only on Android 12+ devices that are not low-RAM and have 3 GB of RAM or more. Other devices get a tinted fallback. You > Appearance > Reduce effects turns it off.
- **Reduce motion:** follows the system "Remove animations" setting (animator scale 0). Under it, word-by-word reveals and transitions become instant.
- **Fonts:** Newsreader and Figtree are bundled as Latin-subset static instances (OFL; licences in `licenses/`).

## TODO

- **Baseline Profile:** not added yet. A `:baselineprofile` module needs a device or emulator to generate the profile, and this environment has neither. Add one with `androidx.baselineprofile` once CI has an emulator.
- **iOS:** `iosMain` has the Ktor Darwin engine and the time/crypto actuals. Still to do:
  - an `IosPlatformServices` (Keychain store, StoreKit 2 `BillingGateway`, Sign in with Google/Apple, document picker)
  - a `MainViewController` that calls `AidoraaApp(controller)`
  - an Xcode project that embeds the `AidoraaShared` framework

  The iOS targets cannot be compiled on Linux.
