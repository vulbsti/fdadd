package com.aidoraa.app

import com.aidoraa.app.data.LiveFrameDto
import com.aidoraa.app.data.RunEventDto
import com.aidoraa.app.domain.RunStream
import com.aidoraa.app.domain.RunStreamState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RunStreamTest {
    private fun delta(text: String, seq: Long, segment: Int = 0) =
        RunEventDto(event = "answer.delta", runId = "r", delta = text, seq = seq, segment = segment)

    @Test fun appendsDeltasAndSkipsRepeats() {
        var state: RunStreamState? = RunStreamState("r")
        state = RunStream.apply(state, delta("Hello ", 1))
        state = RunStream.apply(state, delta("world", 2))
        state = RunStream.apply(state, delta("world", 2))
        assertEquals("Hello world", state?.draft)
    }

    @Test fun newSegmentReplacesDraft() {
        var state: RunStreamState? = RunStreamState("r")
        state = RunStream.apply(state, delta("draft one", 1, 0))
        state = RunStream.apply(state, delta("final", 2, 1))
        assertEquals("final", state?.draft)
        assertEquals(1, state?.segment)
    }

    @Test fun otherRunsAndTerminalEvents() {
        val state = RunStreamState("r")
        assertEquals(state, RunStream.apply(state, RunEventDto(event = "answer.delta", runId = "other", delta = "x", seq = 9)))
        assertTrue(RunStream.apply(state, RunEventDto(event = "run.failed", runId = "r"))!!.failed)
    }

    @Test fun liveFrames() {
        assertEquals("hi", RunStream.liveFrameToEvent("r", LiveFrameDto(3, "text_delta", 0, "hi"))?.delta)
        assertNull(RunStream.liveFrameToEvent("r", LiveFrameDto(4, "exit", 0, null)))
    }

    @Test fun revealsWordByWord() {
        val text = "One two  three\nfour"
        assertEquals("", RunStream.revealWords(text, 0))
        assertEquals("One two", RunStream.revealWords(text, 2))
        assertEquals("One two  three", RunStream.revealWords(text, 3))
        assertEquals(text, RunStream.revealWords(text, 10))
        assertEquals(4, RunStream.wordCount(text))
    }
}
