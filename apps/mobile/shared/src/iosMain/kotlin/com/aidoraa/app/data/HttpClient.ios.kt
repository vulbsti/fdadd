package com.aidoraa.app.data

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.darwin.Darwin

@Suppress("UNCHECKED_CAST")
actual fun createPlatformHttpClient(block: HttpClientConfig<*>.() -> Unit): HttpClient = HttpClient(Darwin) {
    (block as HttpClientConfig<*>.() -> Unit).invoke(this)
}
