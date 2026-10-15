package com.aidoraa.app.domain

/** Semantic version handling that mirrors the server's gate (src/lib/app/version.ts). */
object VersionGate {
    private val pattern = Regex("""^v?(\d{1,6})\.(\d{1,6})(?:\.(\d{1,6}))?(?:[-+].*)?$""")

    fun parse(value: String?): Triple<Int, Int, Int>? {
        val match = pattern.matchEntire(value?.trim() ?: return null) ?: return null
        val (major, minor, patch) = match.destructured
        return Triple(major.toInt(), minor.toInt(), patch.ifEmpty { "0" }.toInt())
    }

    fun compare(a: Triple<Int, Int, Int>, b: Triple<Int, Int, Int>): Int =
        compareValuesBy(a, b, { it.first }, { it.second }, { it.third })

    /** True when [appVersion] is older than [minimum]. An unreadable minimum never blocks. */
    fun isUpdateRequired(appVersion: String, minimum: String?): Boolean {
        val floor = parse(minimum) ?: return false
        val current = parse(appVersion) ?: return true
        return compare(current, floor) < 0
    }

    /** Whether an HTTP failure means the app must be updated before anything else works. */
    fun isUpdateResponse(status: Int, code: String?): Boolean = status == 426 || code == "update_required"
}
