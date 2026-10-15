package com.aidoraa.app.core

import android.util.Log

actual fun debugLog(tag: String, message: String, error: Throwable?) {
    Log.w(tag, message, error)
}
