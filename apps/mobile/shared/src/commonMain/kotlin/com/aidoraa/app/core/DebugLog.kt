package com.aidoraa.app.core

/** Writes a diagnostic line to the device log. Release builds strip these calls (proguard-rules.pro). */
expect fun debugLog(tag: String, message: String, error: Throwable? = null)
