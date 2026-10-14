package com.aidoraa.app

import io.ktor.client.engine.HttpClientEngine

/** Release builds have no sample-data demo; the debug source set provides one. */
internal object DemoSupport {
    val engineFactory: (() -> HttpClientEngine)? = null
}
