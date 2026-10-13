package com.aidoraa.app;

/**
 * Opens Aidoraa in a Trusted Web Activity. Everything (sign-in, chat, imports)
 * runs on the live site, so the app shares the web app's backend and session.
 * Configuration lives in the meta-data on this activity in AndroidManifest.xml.
 */
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
}
