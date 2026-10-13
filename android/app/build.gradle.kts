import java.util.Properties

plugins {
    id("com.android.application")
}

// The web origin the app opens. Override with -PaidoraaOrigin=https://staging.example
// to point a debug build at a preview deploy.
val aidoraaOrigin: String = (findProperty("aidoraaOrigin") as String?) ?: "https://www.aidoraa.com"
val aidoraaHost: String = aidoraaOrigin.removePrefix("https://").removePrefix("http://").trimEnd('/')

// Release signing comes from android/keystore.properties (never committed) or
// the AIDORAA_UPLOAD_* environment variables in CI.
val signingProps = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
fun signingValue(key: String, env: String): String? = signingProps.getProperty(key) ?: System.getenv(env)

android {
    namespace = "com.aidoraa.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.aidoraa.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        manifestPlaceholders["hostName"] = aidoraaHost
        manifestPlaceholders["defaultUrl"] = "$aidoraaOrigin/astrologer"
        resValue("string", "aidoraa_origin", aidoraaOrigin)
        // Digital Asset Links: the site's /.well-known/assetlinks.json must list this
        // app's signing certificate for Chrome to drop the URL bar.
        resValue(
            "string",
            "asset_statements",
            "[{\\\"relation\\\": [\\\"delegate_permission/common.handle_all_urls\\\"], " +
                "\\\"target\\\": {\\\"namespace\\\": \\\"web\\\", \\\"site\\\": \\\"$aidoraaOrigin\\\"}}]",
        )
    }

    signingConfigs {
        create("release") {
            val storeFilePath = signingValue("storeFile", "AIDORAA_UPLOAD_STORE_FILE")
            if (storeFilePath != null) {
                storeFile = rootProject.file(storeFilePath)
                storePassword = signingValue("storePassword", "AIDORAA_UPLOAD_STORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "AIDORAA_UPLOAD_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "AIDORAA_UPLOAD_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (signingConfigs.getByName("release").storeFile != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        resValues = true
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
