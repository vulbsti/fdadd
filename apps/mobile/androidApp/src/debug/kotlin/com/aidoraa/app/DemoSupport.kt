package com.aidoraa.app

import io.ktor.client.engine.HttpClientEngine

/** Debug builds only: the sign-in screen offers "Demo: open with sample data". */
internal object DemoSupport {
    val engineFactory: (() -> HttpClientEngine)? = { DemoBackend().engine() }
}
