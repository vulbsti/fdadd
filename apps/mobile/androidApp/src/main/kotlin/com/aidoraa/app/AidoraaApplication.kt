package com.aidoraa.app

import android.app.Application
import com.aidoraa.app.core.AppConfig
import com.aidoraa.app.platform.AndroidPlatformServices
import com.aidoraa.app.state.AppController

/** Holds the one AppController for the process, so state survives rotation and activity restarts. */
class AidoraaApplication : Application() {
    lateinit var platform: AndroidPlatformServices
        private set

    val controller: AppController by lazy {
        AppController(
            AppConfig(
                origin = BuildConfig.AIDORAA_ORIGIN,
                supabaseUrl = BuildConfig.SUPABASE_URL,
                supabaseKey = BuildConfig.SUPABASE_KEY,
                googleWebClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID,
                appVersion = BuildConfig.VERSION_NAME,
                platform = "android",
            ),
            platform,
            demoEngine = DemoSupport.engineFactory,
        )
    }

    override fun onCreate() {
        super.onCreate()
        platform = AndroidPlatformServices(this, BuildConfig.GOOGLE_WEB_CLIENT_ID)
    }
}
