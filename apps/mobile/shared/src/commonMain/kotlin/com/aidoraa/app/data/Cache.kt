package com.aidoraa.app.data

import com.aidoraa.app.core.KeyValueStore
import kotlinx.serialization.KSerializer

/**
 * Screens open from this cache at once and refresh in the background. Entries
 * are namespaced by user so a different account never sees another's data.
 */
class JsonCache(private val store: KeyValueStore) {
    var userId: String? = null

    private fun key(name: String) = "cache.${userId ?: "anon"}.$name"

    fun <T> read(name: String, serializer: KSerializer<T>): T? =
        store.get(key(name))?.let { runCatching { AppJson.decodeFromString(serializer, it) }.getOrNull() }

    fun <T> write(name: String, serializer: KSerializer<T>, value: T?) {
        store.put(key(name), value?.let { AppJson.encodeToString(serializer, it) })
    }

    fun readString(name: String): String? = store.get(key(name))
    fun writeString(name: String, value: String?) = store.put(key(name), value)

    /** Global (not per-user) preferences. */
    fun pref(name: String): String? = store.get("pref.$name")
    fun setPref(name: String, value: String?) = store.put("pref.$name", value)

    fun clearAll() = store.clear()
}
