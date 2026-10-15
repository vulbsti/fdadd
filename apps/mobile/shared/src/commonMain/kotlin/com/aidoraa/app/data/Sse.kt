package com.aidoraa.app.data

/** One server-sent event. */
data class SseEvent(val id: String?, val event: String, val data: String)

/**
 * Incremental text/event-stream parser (the WHATWG rules the browser's
 * EventSource applies): feed it text as it arrives and it returns each
 * complete event. Comments and unknown fields are ignored; a frame without
 * data is not dispatched; `id` persists across events like Last-Event-ID.
 */
class SseParser {
    private val buffer = StringBuilder()
    private var eventName: String? = null
    private val data = StringBuilder()
    private var hasData = false
    var lastEventId: String? = null
        private set

    fun feed(chunk: String): List<SseEvent> {
        buffer.append(chunk)
        val events = mutableListOf<SseEvent>()
        while (true) {
            val newline = buffer.indexOfFirst { it == '\n' || it == '\r' }
            if (newline < 0) break
            // A lone '\r' at the end may be the first half of "\r\n"; wait for more.
            if (buffer[newline] == '\r' && newline == buffer.length - 1) break
            val line = buffer.substring(0, newline)
            val skip = if (buffer[newline] == '\r' && buffer.getOrNull(newline + 1) == '\n') 2 else 1
            buffer.deleteRange(0, newline + skip)
            processLine(line)?.let(events::add)
        }
        return events
    }

    /** Ends the stream; an unterminated final event is discarded, as browsers do. */
    fun finish(): List<SseEvent> {
        buffer.clear(); data.clear(); hasData = false; eventName = null
        return emptyList()
    }

    private fun processLine(line: String): SseEvent? {
        if (line.isEmpty()) return dispatch()
        if (line.startsWith(":")) return null
        val colon = line.indexOf(':')
        val field = if (colon < 0) line else line.substring(0, colon)
        var value = if (colon < 0) "" else line.substring(colon + 1)
        if (value.startsWith(" ")) value = value.substring(1)
        when (field) {
            "event" -> eventName = value
            "data" -> {
                if (hasData) data.append('\n')
                data.append(value)
                hasData = true
            }
            "id" -> if (!value.contains('\u0000')) lastEventId = value
        }
        return null
    }

    private fun dispatch(): SseEvent? {
        val event = if (hasData) SseEvent(lastEventId, eventName ?: "message", data.toString()) else null
        data.clear(); hasData = false; eventName = null
        return event
    }
}
