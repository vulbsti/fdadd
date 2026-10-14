package com.aidoraa.app.domain

import com.aidoraa.app.data.LiveFrameDto
import com.aidoraa.app.data.RunEventDto

/**
 * Live view of an answer being written, built from run events exactly like
 * the website's run-stream-state.ts: deltas append, a new segment replaces
 * the draft, and repeated rows (by sequence number) are skipped.
 */
data class RunStreamState(
    val runId: String,
    val segment: Int = 0,
    val draft: String = "",
    val activity: String? = null,
    val seq: Long = 0,
    val finished: Boolean = false,
    val failed: Boolean = false,
)

object RunStream {
    val TERMINAL = setOf("run.completed", "run.failed")

    fun apply(state: RunStreamState?, event: RunEventDto): RunStreamState? {
        if (state == null || state.runId != event.runId) return state
        return when (event.event) {
            "answer.delta" -> {
                val seq = event.seq
                if (seq != null && seq <= state.seq) return state
                val segment = event.segment ?: state.segment
                val draft = if (segment == state.segment) state.draft + (event.delta ?: "") else event.delta ?: ""
                state.copy(segment = segment, draft = draft, seq = seq ?: state.seq)
            }
            "tool.started" -> state.copy(activity = event.summary ?: state.activity)
            "tool.completed", "phase.changed" -> state.copy(activity = event.summary ?: state.activity)
            "run.completed" -> state.copy(finished = true)
            "run.failed" -> state.copy(finished = true, failed = true)
            else -> state
        }
    }

    /** The edge's live frames become the same answer.delta event; anything else is ignored. */
    fun liveFrameToEvent(runId: String, frame: LiveFrameDto): RunEventDto? {
        if (frame.kind != "text_delta" || frame.text == null || frame.seq == null) return null
        return RunEventDto(event = "answer.delta", runId = runId, phase = "responding",
            segment = frame.segment ?: 0, delta = frame.text, seq = frame.seq)
    }

    /**
     * How much of [target] to show after [shownWords] words, for the word by
     * word reveal. Returns the prefix ending at a word boundary.
     */
    fun revealWords(target: String, shownWords: Int): String {
        if (shownWords <= 0) return ""
        var count = 0
        var index = 0
        while (index < target.length) {
            // skip whitespace, then a word
            while (index < target.length && target[index].isWhitespace()) index++
            if (index >= target.length) break
            while (index < target.length && !target[index].isWhitespace()) index++
            count++
            if (count >= shownWords) return target.substring(0, index)
        }
        return target
    }

    fun wordCount(text: String): Int = text.split(Regex("\\s+")).count { it.isNotEmpty() }

    /** A friendly line for the activity indicator; tool and phase names are never shown raw. */
    fun activityLine(state: RunStreamState?): String = when {
        state == null -> "Thinking"
        state.draft.isNotEmpty() -> "Writing"
        else -> "Looking at what you've shared"
    }
}
