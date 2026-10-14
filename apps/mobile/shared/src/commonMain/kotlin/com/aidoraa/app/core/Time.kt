package com.aidoraa.app.core

import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/** Wall clock in milliseconds since the epoch. */
expect fun nowMillis(): Long

/** The local hour of the day, 0 to 23. */
expect fun localHour(): Int

/** The local weekday name, such as "Tuesday". */
expect fun localWeekdayName(): String

/** An ISO-8601 timestamp to epoch milliseconds, or null when it cannot be read. */
expect fun parseIsoMillis(iso: String): Long?

/** A short local date such as "12 Nov" (or "12 Nov 2024" outside this year). */
expect fun formatShortDate(epochMillis: Long): String

/** Lowercase hex SHA-256 of the UTF-8 bytes of [input]. */
expect fun sha256Hex(input: String): String

@OptIn(ExperimentalUuidApi::class)
fun randomUuid(): String = Uuid.random().toString()

/** A random nonce for Google sign in: the raw value goes to Supabase, its hash to Google. */
@OptIn(ExperimentalUuidApi::class)
fun randomNonce(): String = Uuid.random().toHexString() + Uuid.random().toHexString()

/** "Today", "Yesterday", a weekday within the week, otherwise a short date. */
fun relativeDay(epochMillis: Long, now: Long = nowMillis()): String {
    val dayMs = 86_400_000L
    val hourOffset = (localHour() * 3_600_000L)
    // Start of today in local time, approximated from the current local hour.
    val startOfToday = now - (now % 3_600_000L) - hourOffset
    return when {
        epochMillis >= startOfToday -> "Today"
        epochMillis >= startOfToday - dayMs -> "Yesterday"
        else -> formatShortDate(epochMillis)
    }
}

fun partOfDay(hour: Int): String = when (hour) {
    in 5..11 -> "morning"
    in 12..16 -> "afternoon"
    in 17..21 -> "evening"
    else -> "night"
}

fun greetingFor(hour: Int): String = when (hour) {
    in 5..11 -> "Good morning"
    in 12..16 -> "Good afternoon"
    else -> "Good evening"
}
