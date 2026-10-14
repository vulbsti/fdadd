package com.aidoraa.app.core

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import platform.CoreCrypto.CC_SHA256
import platform.CoreCrypto.CC_SHA256_DIGEST_LENGTH
import platform.Foundation.NSCalendar
import platform.Foundation.NSCalendarUnitHour
import platform.Foundation.NSDate
import platform.Foundation.NSDateFormatter
import platform.Foundation.NSISO8601DateFormatter
import platform.Foundation.timeIntervalSince1970
import platform.Foundation.dateWithTimeIntervalSince1970

actual fun nowMillis(): Long = (NSDate().timeIntervalSince1970 * 1000).toLong()

actual fun localHour(): Int = NSCalendar.currentCalendar.component(NSCalendarUnitHour, NSDate()).toInt()

actual fun localWeekdayName(): String = NSDateFormatter().apply { dateFormat = "EEEE" }.stringFromDate(NSDate())

actual fun parseIsoMillis(iso: String): Long? =
    NSISO8601DateFormatter().dateFromString(iso)?.let { (it.timeIntervalSince1970 * 1000).toLong() }

actual fun formatShortDate(epochMillis: Long): String =
    NSDateFormatter().apply { dateFormat = "d MMM" }.stringFromDate(NSDate.dateWithTimeIntervalSince1970(epochMillis / 1000.0))

@OptIn(ExperimentalForeignApi::class)
actual fun sha256Hex(input: String): String {
    val data = input.encodeToByteArray()
    val digest = UByteArray(CC_SHA256_DIGEST_LENGTH)
    data.usePinned { pinned ->
        digest.usePinned { out -> CC_SHA256(pinned.addressOf(0), data.size.toUInt(), out.addressOf(0)) }
    }
    return digest.joinToString("") { it.toString(16).padStart(2, '0') }
}
