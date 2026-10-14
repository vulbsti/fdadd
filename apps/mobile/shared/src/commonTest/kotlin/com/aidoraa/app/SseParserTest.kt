package com.aidoraa.app

import com.aidoraa.app.data.SseEvent
import com.aidoraa.app.data.SseParser
import kotlin.test.Test
import kotlin.test.assertEquals

class SseParserTest {
    @Test fun parsesEventsSplitAcrossChunks() {
        val parser = SseParser()
        val out = mutableListOf<SseEvent>()
        "id: 7\nevent: answer.delta\ndata: {\"delta\":\"Hel".chunked(5).forEach { out += parser.feed(it) }
        assertEquals(emptyList(), out)
        out += parser.feed("lo\"}\n\n")
        assertEquals(listOf(SseEvent("7", "answer.delta", "{\"delta\":\"Hello\"}")), out)
        assertEquals("7", parser.lastEventId)
    }

    @Test fun handlesCrLfAndLoneCr() {
        val parser = SseParser()
        val events = parser.feed("data: a\r\n\r") + parser.feed("\ndata: b\r\rdata: c\n\n")
        assertEquals(listOf("a", "b", "c"), events.map { it.data })
    }

    @Test fun joinsMultiLineDataAndSkipsComments() {
        val parser = SseParser()
        val events = parser.feed(": keep-alive\n\ndata: one\ndata:two\n\n")
        assertEquals(listOf(SseEvent(null, "message", "one\ntwo")), events)
    }

    @Test fun idPersistsAndEventNameResets() {
        val parser = SseParser()
        val events = parser.feed("id: 1\nevent: x\ndata: a\n\ndata: b\n\nid\ndata: c\n\n")
        assertEquals(listOf(SseEvent("1", "x", "a"), SseEvent("1", "message", "b"), SseEvent("", "message", "c")), events)
    }

    @Test fun noDataNoDispatchAndUnfinishedEventDropped() {
        val parser = SseParser()
        assertEquals(emptyList(), parser.feed("event: ping\n\n"))
        parser.feed("data: partial")
        assertEquals(emptyList(), parser.finish())
    }
}
