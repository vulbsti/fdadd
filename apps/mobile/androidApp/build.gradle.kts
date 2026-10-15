import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.isFile) file.inputStream().use { load(it) }
}

/**
 * A public build setting: -P / gradle.properties first, then local.properties, then the
 * environment variable [env], then the default. Only public values belong here.
 */
fun publicSetting(name: String, env: String, default: String = ""): String =
    providers.gradleProperty(name).orNull?.trim()?.takeIf { it.isNotEmpty() }
        ?: localProperties.getProperty(name)?.trim()?.takeIf { it.isNotEmpty() }
        ?: providers.environmentVariable(env).orNull?.trim()?.takeIf { it.isNotEmpty() }
        ?: default

fun String.quoted() = "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val origin = publicSetting("aidoraaOrigin", "AIDORAA_ORIGIN", "https://www.aidoraa.com").trimEnd('/')
val supabaseUrl = publicSetting("aidoraaSupabaseUrl", "AIDORAA_SUPABASE_URL", "$origin/sb").trimEnd('/')
val supabaseKey = publicSetting("aidoraaSupabaseKey", "AIDORAA_SUPABASE_KEY")
val googleWebClientId = publicSetting("aidoraaGoogleWebClientId", "AIDORAA_GOOGLE_WEB_CLIENT_ID")

/** Release signing: apps/mobile/keystore.properties, or AIDORAA_UPLOAD_* environment variables. */
val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.isFile) file.inputStream().use { load(it) }
}
fun signingValue(property: String, env: String): String? =
    keystoreProperties.getProperty(property)?.takeIf { it.isNotBlank() } ?: System.getenv(env)?.takeIf { it.isNotBlank() }
val uploadStoreFile = signingValue("storeFile", "AIDORAA_UPLOAD_STORE_FILE")
val hasUploadKey = uploadStoreFile != null && rootProject.file(uploadStoreFile).isFile

android {
    namespace = "com.aidoraa.app"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.aidoraa.app"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "AIDORAA_ORIGIN", origin.quoted())
        buildConfigField("String", "SUPABASE_URL", supabaseUrl.quoted())
        buildConfigField("String", "SUPABASE_KEY", supabaseKey.quoted())
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", googleWebClientId.quoted())
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    signingConfigs {
        if (hasUploadKey) {
            create("upload") {
                storeFile = rootProject.file(uploadStoreFile!!)
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
            if (hasUploadKey) signingConfig = signingConfigs.getByName("upload")
        }
    }

    packaging {
        resources {
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "/META-INF/versions/9/previous-compilation-data.bin",
                "DebugProbesKt.bin",
                "kotlin-tooling-metadata.json",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation(project(":shared"))
    implementation(libs.compose.runtime)
    implementation(libs.compose.foundation)
    implementation(libs.compose.ui)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.googleid)
    implementation(libs.billing)
    implementation(libs.kotlinx.coroutines.android)
    implementation(project.dependencies.platform(libs.supabase.bom))
    implementation(libs.supabase.auth)
    implementation(libs.ktor.client.core)
    implementation(libs.kotlinx.serialization.json)
    // Sample-data demo backend (src/debug only; not in release builds).
    debugImplementation(libs.ktor.client.mock)

    testImplementation(kotlin("test-junit"))
    testImplementation(libs.kotlinx.coroutines.test)
}
