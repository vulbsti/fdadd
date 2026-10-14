package com.aidoraa.app.state

import com.aidoraa.app.core.randomUuid
import com.aidoraa.app.data.ApiException
import com.aidoraa.app.data.AppJson
import com.aidoraa.app.data.ChatRequest
import com.aidoraa.app.data.FocusedQuestionDto
import com.aidoraa.app.data.MessageDto
import com.aidoraa.app.data.RunEventDto
import com.aidoraa.app.data.SessionDetailDto
import com.aidoraa.app.data.UpdateRequiredException
import com.aidoraa.app.domain.RunStream
import com.aidoraa.app.domain.RunStreamState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ChatMessage(
    val id: String,
    val role: String,
    val text: String,
    val delivery: Delivery = Delivery.Sent,
) {
    enum class Delivery { Sending, Sent, Failed }
}

data class ChatUiState(
    val sessionId: String? = null,
    val title: String? = null,
    val messages: List<ChatMessage> = emptyList(),
    val loading: Boolean = false,
    val sending: Boolean = false,
    val stream: RunStreamState? = null,
    val focusedQuestion: FocusedQuestionDto? = null,
    val error: String? = null,
    val quotaExceeded: Boolean = false,
    val canResume: Boolean = false,
    /** The finished answer that should keep revealing word by word after the live draft. */
    val handoffMessageId: String? = null,
    val handoffWords: Int = 0,
)

/**
 * Ask: one conversation at a time. Sends go to /api/astrologer/chat; the
 * answer streams from the run's server-sent events plus the edge live text
 * (when present), deduplicated by sequence number, exactly like the website.
 * The stored conversation is re-read whenever the stream says an answer is
 * ready, and every few seconds while one is being written.
 */
class ChatController(private val app: AppController) {
    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    private val _draft = MutableStateFlow("")
    val draft: StateFlow<String> = _draft.asStateFlow()

    private var streamJob: Job? = null
    private var liveJob: Job? = null
    private var pollJob: Job? = null
    private var loadJob: Job? = null
    /** Words of the live draft the person has already seen (reported by the UI). */
    var shownWords: Int = 0

    fun setDraft(text: String) { _draft.value = text }

    fun reset() {
        stopStreaming()
        loadJob?.cancel()
        _state.value = ChatUiState()
        _draft.value = ""
    }

    /** A fresh conversation, optionally with a prefilled message. */
    fun startNew(prefill: String? = null) {
        reset()
        if (prefill != null) _draft.value = prefill
    }

    fun open(sessionId: String) {
        if (_state.value.sessionId == sessionId) return
        reset()
        _state.value = ChatUiState(sessionId = sessionId, loading = true,
            title = app.sessions.value.firstOrNull { it.id == sessionId }?.title)
        loadDetail(connectIfActive = true)
    }

    fun dismissQuota() { _state.value = _state.value.copy(quotaExceeded = false) }
    fun clearError() { _state.value = _state.value.copy(error = null) }

    private fun mergeMessages(local: List<ChatMessage>, persisted: List<MessageDto>): List<ChatMessage> {
        val server = persisted.map { ChatMessage(it.id, it.role, it.content) }
        val serverIds = server.map { it.id }.toSet()
        val serverUserTexts = persisted.filter { it.role == "user" }.map { it.content }.toMutableList()
        val pendingLocal = local.filter { message ->
            message.id !in serverIds && message.role == "user" && !serverUserTexts.remove(message.text)
        }
        return server + pendingLocal
    }

    fun loadDetail(connectIfActive: Boolean = false) {
        val sessionId = _state.value.sessionId ?: return
        loadJob?.cancel()
        loadJob = app.scope.launch {
            try {
                val detail = app.api.session(sessionId)
                applyDetail(detail, connectIfActive)
            } catch (c: CancellationException) { throw c } catch (_: UpdateRequiredException) {
            } catch (error: ApiException) {
                _state.value = _state.value.copy(loading = false, error = error.message)
            }
        }
    }

    private fun applyDetail(detail: SessionDetailDto, connectIfActive: Boolean) {
        val current = _state.value
        val run = detail.latestRun
        val active = run != null && run.kind == "question" && run.status == "active"
        val streamingRun = current.stream?.runId
        var handoffId = current.handoffMessageId
        var handoffWords = current.handoffWords
        if (streamingRun != null && !active) {
            // The answer is stored: keep revealing it from where the live draft was.
            val answer = detail.messages.lastOrNull { it.role == "assistant" && it.runId == streamingRun }
                ?: detail.messages.lastOrNull { it.role == "assistant" }
            if (answer != null && current.messages.none { it.id == answer.id }) {
                handoffId = answer.id
                handoffWords = shownWords
            }
            stopStreaming()
        }
        _state.value = current.copy(
            title = detail.session.title.ifBlank { current.title },
            messages = mergeMessages(current.messages, detail.messages),
            loading = false,
            focusedQuestion = detail.session.currentQuestion,
            stream = if (active) current.stream ?: RunStreamState(run.id) else null,
            sending = active,
            canResume = run != null && run.kind == "question" && run.status == "failed" && run.resumable,
            handoffMessageId = handoffId,
            handoffWords = handoffWords,
            error = null,
        )
        if (active && connectIfActive) connect(run.id)
    }

    fun send(text: String = _draft.value, answerToQuestionId: String? = _state.value.focusedQuestion?.id) {
        val message = text.trim()
        if (message.isEmpty() || _state.value.sending) return
        val personId = app.personId.value ?: return
        _draft.value = ""
        val clientId = randomUuid()
        _state.value = _state.value.copy(
            messages = _state.value.messages + ChatMessage(clientId, "user", message, ChatMessage.Delivery.Sending),
            sending = true, error = null, focusedQuestion = null, handoffMessageId = null,
        )
        app.scope.launch {
            try {
                var sessionId = _state.value.sessionId
                if (sessionId == null) {
                    sessionId = app.api.createSession(personId).sessionId
                    _state.value = _state.value.copy(sessionId = sessionId, title = message.take(60))
                }
                val started = app.api.chat(ChatRequest(sessionId, message, clientId, answerToQuestionId))
                _state.value = _state.value.copy(
                    messages = _state.value.messages.map {
                        if (it.id == clientId) it.copy(id = started.messageId ?: clientId, delivery = ChatMessage.Delivery.Sent) else it
                    },
                )
                if (started.status == "active") connect(started.runId) else {
                    _state.value = _state.value.copy(sending = false)
                    loadDetail()
                }
                app.loadSessions()
            } catch (c: CancellationException) { throw c } catch (_: UpdateRequiredException) {
                markFailed(clientId)
            } catch (error: ApiException) {
                markFailed(clientId)
                if (error.isQuotaExceeded) _state.value = _state.value.copy(quotaExceeded = true)
                else _state.value = _state.value.copy(error = error.message)
            }
        }
    }

    fun retry(messageId: String) {
        val failed = _state.value.messages.firstOrNull { it.id == messageId && it.delivery == ChatMessage.Delivery.Failed } ?: return
        _state.value = _state.value.copy(messages = _state.value.messages - failed)
        send(failed.text, null)
    }

    fun resume() {
        val sessionId = _state.value.sessionId ?: return
        app.scope.launch {
            try {
                val detail = app.api.session(sessionId)
                val run = detail.latestRun ?: return@launch
                _state.value = _state.value.copy(sending = true, canResume = false)
                val started = app.api.resume(run.id, randomUuid())
                connect(started.runId)
            } catch (c: CancellationException) { throw c } catch (error: Exception) {
                _state.value = _state.value.copy(sending = false, error = error.message ?: "Couldn't continue the answer.")
            }
        }
    }

    private fun markFailed(clientId: String) {
        _state.value = _state.value.copy(
            sending = false,
            messages = _state.value.messages.map { if (it.id == clientId) it.copy(delivery = ChatMessage.Delivery.Failed) else it },
        )
    }

    private fun applyEvent(event: RunEventDto) {
        val current = _state.value
        val next = RunStream.apply(current.stream, event)
        if (next != current.stream) _state.value = current.copy(stream = next)
    }

    private fun connect(runId: String) {
        stopStreaming()
        shownWords = 0
        _state.value = _state.value.copy(stream = RunStreamState(runId), sending = true)
        streamJob = app.scope.launch {
            var lastId: String? = null
            var failures = 0
            while (failures < 20) {
                var terminal = false
                try {
                    lastId = app.api.streamRunEvents(runId, lastId) { sse ->
                        val event = runCatching { AppJson.decodeFromString(RunEventDto.serializer(), sse.data) }.getOrNull()
                            ?: return@streamRunEvents
                        applyEvent(event)
                        if (event.event == "answer.ready") loadDetail()
                        if (event.event in RunStream.TERMINAL) terminal = true
                    } ?: lastId
                    failures = 0
                } catch (c: CancellationException) { throw c } catch (_: UpdateRequiredException) { return@launch
                } catch (_: Exception) { failures++ }
                if (terminal) { loadDetail(); return@launch }
                // The connection closed early (server renewal or network); resume after the last event.
                delay(if (failures == 0) 500L else 1000L * failures.coerceAtMost(5))
                loadDetail()
            }
        }
        liveJob = app.scope.launch {
            var after = 0L
            repeat(20) {
                val location = try { app.api.liveLocation(runId) } catch (c: CancellationException) { throw c } catch (_: Exception) { return@launch }
                var exited = false
                try {
                    app.api.streamLiveText(location, after) { frame ->
                        if (frame.kind == "exit") { exited = true; return@streamLiveText }
                        frame.seq?.let { after = maxOf(after, it) }
                        RunStream.liveFrameToEvent(runId, frame)?.let(::applyEvent)
                    }
                } catch (c: CancellationException) { throw c } catch (_: Exception) { }
                if (exited) return@launch
                delay(1000)
            }
        }
        pollJob = app.scope.launch {
            while (true) {
                delay(5000)
                loadDetail()
            }
        }
    }

    private fun stopStreaming() {
        streamJob?.cancel(); liveJob?.cancel(); pollJob?.cancel()
        streamJob = null; liveJob = null; pollJob = null
    }

    fun handoffFinished() {
        _state.value = _state.value.copy(handoffMessageId = null, handoffWords = 0)
    }
}
