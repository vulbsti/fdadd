package com.aidoraa.app.core

import java.security.MessageDigest
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

actual fun nowMillis(): Long = System.currentTimeMillis()

actual fun localHour(): Int = java.time.LocalTime.now().hour

actual fun localWeekdayName(): String =
    java.time.LocalDate.now().dayOfWeek.getDisplayName(TextStyle.FULL, Locale.getDefault())

actual fun parseIsoMillis(iso: String): Long? =
    runCatching { OffsetDateTime.parse(iso).toInstant().toEpochMilli() }.getOrNull()
        ?: runCatching { Instant.parse(iso).toEpochMilli() }.getOrNull()

actual fun formatShortDate(epochMillis: Long): String {
    val date = Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault()).toLocalDate()
    val pattern = if (date.year == java.time.LocalDate.now().year) "d MMM" else "d MMM yyyy"
    return date.format(DateTimeFormatter.ofPattern(pattern, Locale.getDefault()))
}

actual fun sha256Hex(input: String): String =
    MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
