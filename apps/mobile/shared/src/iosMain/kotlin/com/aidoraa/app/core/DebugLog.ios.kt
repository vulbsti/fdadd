package com.aidoraa.app.core

actual fun debugLog(tag: String, message: String, error: Throwable?) {
    println("$tag: $message${error?.let { " ($it)" }.orEmpty()}")
}
