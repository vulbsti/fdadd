package com.aidoraa.app.ui.screens

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import com.aidoraa.app.data.ReportRequest
import com.aidoraa.app.ui.components.ErrorText
import com.aidoraa.app.ui.components.Field
import com.aidoraa.app.ui.components.SmallButton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aidoraa.app.core.parseIsoMillis
import com.aidoraa.app.core.relativeDay
import com.aidoraa.app.domain.Plans
import com.aidoraa.app.domain.RunStream
import com.aidoraa.app.state.AppController
import com.aidoraa.app.state.ChatMessage
import com.aidoraa.app.state.Route
import com.aidoraa.app.ui.LocalSheet
import com.aidoraa.app.ui.blurSource
import com.aidoraa.app.ui.components.CardMedium
import com.aidoraa.app.ui.components.Eyebrow
import com.aidoraa.app.ui.components.Group
import com.aidoraa.app.ui.components.Icon
import com.aidoraa.app.ui.components.IconCircleButton
import com.aidoraa.app.ui.components.Icons
import com.aidoraa.app.ui.components.Pill
import com.aidoraa.app.ui.components.PrimaryButton
import com.aidoraa.app.ui.components.RevealText
import com.aidoraa.app.ui.components.ScreenTitle
import com.aidoraa.app.ui.components.SettingsRow
import com.aidoraa.app.ui.components.SmallButton
import com.aidoraa.app.ui.components.Spinner
import com.aidoraa.app.ui.components.T
import com.aidoraa.app.ui.components.TextLink
import com.aidoraa.app.ui.components.floatingGlass
import com.aidoraa.app.ui.components.glass
import com.aidoraa.app.ui.components.markdownToAnnotated
import com.aidoraa.app.ui.components.tap
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type
import com.aidoraa.app.ui.theme.emphasised

private val SUGGESTIONS = listOf(
    "What chapter am I in right now?",
    "What should I prioritise this month?",
    "Why do I lose steam halfway through things?",
    "Who should I talk to before a big decision?",
)

private val meShape = RoundedCornerShape(20.dp, 20.dp, 6.dp, 20.dp)
private val aiShape = RoundedCornerShape(20.dp, 20.dp, 20.dp, 6.dp)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AskScreen(app: AppController) {
    val state by app.chat.state.collectAsState()
    val draft by app.chat.draft.collectAsState()
    val bootstrap by app.bootstrap.collectAsState()
    val list = rememberLazyListState()
    val sheet = LocalSheet.current

    val itemCount = state.messages.size + (if (state.stream != null) 1 else 0)
    LaunchedEffect(itemCount, state.stream?.draft?.length?.div(80)) {
        val total = list.layoutInfo.totalItemsCount
        if (itemCount > 0 && total > 0) list.animateScrollToItem(total - 1)
    }
    LaunchedEffect(state.quotaExceeded) {
        if (state.quotaExceeded) {
            app.chat.dismissQuota()
            sheet.show { QuotaSheet(app) }
        }
    }

    Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars)) {
        Column(Modifier.fillMaxSize()) {
            val returnTo by app.conversationReturn.collectAsState()
            Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (returnTo != null && returnTo?.sessionId == state.sessionId) {
                    IconCircleButton(Icons.Back, "Back to past conversations") { app.pop() }
                    Spacer(Modifier.width(12.dp))
                }
                Column(Modifier.weight(1f)) {
                    Eyebrow("Ask")
                    T(state.title ?: "A new conversation", Type.display(24.sp), maxLines = 2)
                }
                IconCircleButton(Icons.List, "Past conversations") { app.loadSessions(); app.push(Route.Conversations) }
                Spacer(Modifier.width(8.dp))
                IconCircleButton(Icons.Plus, "New conversation") { app.chat.startNew() }
            }
            LazyColumn(
                state = list,
                modifier = Modifier.fillMaxSize().blurSource(),
                contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 12.dp, bottom = 190.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (state.messages.isEmpty() && state.stream == null) {
                    item {
                        Column {
                            if (state.loading) Spinner()
                            else {
                                T(emphasised("What's on ", "your mind?", Palette.GoldSoft), Type.display(30.sp), Modifier.padding(top = 12.dp))
                                T("Ask about a decision, a pattern you've noticed, or what to prioritise. Aidoraa answers from what it knows about your life.", Type.muted(), Modifier.padding(top = 6.dp))
                                val plan = bootstrap?.plan
                                if (plan != null && plan.questionsLimit > 0) T(Plans.usageLine(plan), Type.body(12.5.sp, Palette.Ink3), Modifier.padding(top = 10.dp))
                            }
                        }
                    }
                }
                items(state.messages, key = { it.id }) { message ->
                    if (message.role == "user") UserBubble(message) { app.chat.retry(message.id) }
                    else AssistantBubble(onReport = { sheet.show { ReportSheet(app, state.sessionId, message) } }) {
                        if (message.id == state.handoffMessageId) {
                            RevealText(message.text, Type.body(15.sp), startWords = state.handoffWords, onDone = { app.chat.handoffFinished() })
                        } else T(markdownToAnnotated(message.text), Type.body(15.sp))
                    }
                }
                val stream = state.stream
                if (stream != null) {
                    item(key = "stream-${stream.runId}") {
                        AssistantBubble {
                            if (stream.draft.isEmpty()) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Spinner(size = 16.dp)
                                    Spacer(Modifier.width(10.dp))
                                    T(RunStream.activityLine(stream), Type.body(14.sp, Palette.Ink2))
                                }
                            } else {
                                RevealText(stream.draft, Type.body(15.sp), caret = true, onProgress = { app.chat.shownWords = it })
                            }
                        }
                    }
                }
                if (state.canResume) item {
                    Column(Modifier.fillMaxWidth().glass(CardMedium).padding(16.dp)) {
                        T("The answer stopped before it finished.", Type.body(14.sp))
                        TextLink("Continue the answer") { app.chat.resume() }
                    }
                }
                state.error?.let { error ->
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            T(error, Type.body(14.sp, Palette.Danger), Modifier.weight(1f))
                            TextLink("Dismiss", color = Palette.Ink3) { app.chat.clearError() }
                        }
                    }
                }
            }
        }

        // Focused question options, suggestions and the composer float above the tab bar and the
        // keyboard. The tab bar hides while the keyboard is up (MainShell); a keyboard that reports
        // only a small inset (handwriting toolbar, floating mode) still can't push the composer
        // under the tab bar, because the larger of the two offsets wins.
        val density = androidx.compose.ui.platform.LocalDensity.current
        val imeVisible = WindowInsets.isImeVisible
        val imeBottom = with(density) { WindowInsets.ime.getBottom(density).toDp() }
        val navBottom = with(density) { WindowInsets.navigationBars.getBottom(density).toDp() }
        val composerBottom = composerOffset(imeBottom, navBottom, tabBarShown = !imeVisible)
        Column(Modifier.align(Alignment.BottomCenter).padding(bottom = composerBottom)) {
            val question = state.focusedQuestion
            val chips = when {
                question != null && question.options.isNotEmpty() -> question.options.map { it.label }
                state.messages.isEmpty() && state.stream == null && draft.isEmpty() -> SUGGESTIONS
                else -> emptyList()
            }
            if (question != null) {
                T(question.prompt, Type.body(13.5.sp, Palette.Ink2), Modifier.padding(horizontal = 22.dp, vertical = 6.dp), maxLines = 3)
            }
            if (chips.isNotEmpty()) {
                Row(
                    Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    chips.forEach { label ->
                        T(label, Type.body(13.5.sp),
                            Modifier.floatingGlass(Pill).tap(label) { app.chat.send(label) }.padding(horizontal = 12.dp, vertical = 8.dp))
                    }
                }
            }
            Composer(
                value = draft,
                onChange = app.chat::setDraft,
                enabled = !state.sending,
                onSend = { app.chat.send() },
            )
        }
    }
}

@Composable
private fun Composer(value: String, onChange: (String) -> Unit, enabled: Boolean, onSend: () -> Unit) {
    Row(
        Modifier.padding(horizontal = 14.dp).fillMaxWidth().floatingGlass(RoundedCornerShape(28.dp))
            .padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.weight(1f).padding(vertical = 8.dp)) {
            if (value.isEmpty()) T("Ask about your life", Type.body(15.sp, Palette.Ink3))
            BasicTextField(
                value = value,
                onValueChange = { onChange(it.take(4000)) },
                textStyle = Type.body(15.sp),
                cursorBrush = SolidColor(Palette.GoldSoft),
                maxLines = 5,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { if (enabled) onSend() }),
                modifier = Modifier.fillMaxWidth().heightIn(min = 22.dp).semantics { contentDescription = "Message" },
            )
        }
        Spacer(Modifier.width(8.dp))
        val canSend = enabled && value.isNotBlank()
        Box(
            Modifier.size(42.dp).background(if (canSend) Palette.Gold else Palette.Gold.copy(alpha = 0.4f), CircleShape)
                .tap("Send", enabled = canSend, onClick = onSend),
            contentAlignment = Alignment.Center,
        ) {
            if (!enabled) Spinner(Palette.OnGold, 18.dp) else Icon(Icons.Send, Palette.OnGold, 18.dp, "Send")
        }
    }
}

@Composable
private fun UserBubble(message: ChatMessage, onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
        androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopEnd) {
            T(
                message.text, Type.body(15.sp, Palette.OnGold),
                Modifier.widthIn(max = maxWidth * 0.86f)
                    .background(Brush.linearGradient(listOf(Palette.GoldSoft, Palette.Gold)), meShape)
                    .padding(horizontal = 15.dp, vertical = 12.dp),
            )
        }
        when (message.delivery) {
            ChatMessage.Delivery.Sending -> T("Sending", Type.body(12.sp, Palette.Ink3), Modifier.padding(top = 4.dp))
            ChatMessage.Delivery.Failed -> TextLink("Not sent. Tap to try again.", color = Palette.Danger, size = 12, onClick = onRetry)
            ChatMessage.Delivery.Sent -> Unit
        }
    }
}

@Composable
private fun AssistantBubble(onReport: (() -> Unit)? = null, content: @Composable () -> Unit) {
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth()) {
        val limit = maxWidth * 0.9f
        val bubble = Modifier.widthIn(max = limit).glass(aiShape)
            .then(
                if (onReport == null) Modifier
                else Modifier
                    .pointerInput(onReport) { detectTapGestures(onLongPress = { onReport() }) }
                    .semantics { customActions = listOf(CustomAccessibilityAction("Report this reply") { onReport(); true }) },
            )
            .padding(horizontal = 15.dp, vertical = 12.dp)
        Column {
            Box(bubble) { content() }
            if (onReport != null) {
                Box(Modifier.widthIn(max = limit).fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                    T("•••", Type.body(13.sp, Palette.Ink3),
                        Modifier.tap("More options for this reply", onClick = onReport).padding(horizontal = 10.dp, vertical = 4.dp))
                }
            }
        }
    }
}

private val REPORT_REASONS = listOf("wrong" to "Seems wrong", "harmful" to "Harmful", "offensive" to "Offensive", "other" to "Something else")

/** "Report this reply": a reason, an optional note, sent to /api/app/v1/reports. */
@Composable
private fun ReportSheet(app: AppController, sessionId: String?, message: ChatMessage) {
    val sheet = LocalSheet.current
    var reason by remember(message.id) { mutableStateOf<String?>(null) }
    var note by remember(message.id) { mutableStateOf("") }
    var busy by remember(message.id) { mutableStateOf(false) }
    var error by remember(message.id) { mutableStateOf<String?>(null) }
    T("Report this reply", Type.display(26.sp))
    T("Tell us what's wrong with it. Reports are read by people at Aidoraa and help make answers better.", Type.muted(), Modifier.padding(top = 6.dp, bottom = 14.dp))
    REPORT_REASONS.forEach { (id, label) ->
        SmallButton(label, Modifier.fillMaxWidth().padding(bottom = 8.dp), on = reason == id) { reason = id }
    }
    Field(note, { note = it.take(1000) }, "Add a note (optional)", Modifier.padding(top = 6.dp), singleLine = false)
    ErrorText(error, Modifier.padding(top = 8.dp))
    Spacer(Modifier.height(14.dp))
    PrimaryButton("Send report", enabled = reason != null && !busy, busy = busy) {
        val chosen = reason ?: return@PrimaryButton
        busy = true; error = null
        app.scope.launch {
            try {
                app.api.report(ReportRequest(sessionId = sessionId, messageId = message.id, runId = message.runId,
                    reason = chosen, note = note.trim().ifEmpty { null }))
                sheet.hide()
                app.toast("Thanks, we'll look at this")
            } catch (c: CancellationException) { throw c } catch (e: Exception) {
                error = e.message ?: "The report didn't send. Please try again."
            } finally { busy = false }
        }
    }
    TextLink("Cancel", color = Palette.Ink3, modifier = Modifier.padding(top = 6.dp)) { sheet.hide() }
}

@Composable
private fun QuotaSheet(app: AppController) {
    val sheet = LocalSheet.current
    val bootstrap by app.bootstrap.collectAsState()
    T(emphasised("You've used this month's ", "room", Palette.GoldSoft), Type.display(26.sp), Modifier.padding(bottom = 8.dp))
    val plan = bootstrap?.plan
    T(
        buildString {
            append("Your ${plan?.name ?: "current"} plan includes ${plan?.questionsLimit ?: 0} questions a month, and they're all used. ")
            append("Every plan has every feature; higher plans give more room.")
        },
        Type.muted(),
    )
    plan?.questionsResetAt?.let { reset ->
        parseIsoMillis(reset)?.let { T("Your allowance resets on ${com.aidoraa.app.core.formatShortDate(it)}.", Type.body(13.sp, Palette.Ink3), Modifier.padding(top = 8.dp)) }
    }
    Spacer(Modifier.height(18.dp))
    PrimaryButton("See plans") { sheet.hide(); app.push(Route.Plans) }
    TextLink("Not now", color = Palette.Ink3, modifier = Modifier.padding(top = 6.dp)) { sheet.hide() }
}

@Composable
fun ConversationsScreen(app: AppController) {
    val sessions by app.sessions.collectAsState()
    val personId by app.personId.collectAsState()
    val mine = sessions.filter { personId == null || it.profileId == null || it.profileId == personId }
    PushedScreen {
        ScreenTitle("Past ", "conversations")
        if (mine.isEmpty()) T("Nothing here yet. Your conversations will appear here.", Type.muted())
        else Group(null) {
            mine.forEachIndexed { index, session ->
                SettingsRow(
                    icon = null,
                    label = session.title.ifBlank { "Conversation" },
                    sub = listOfNotNull(parseIsoMillis(session.updatedAt)?.let { relativeDay(it) }, session.lastMessagePreview?.take(80)).joinToString(" · "),
                    divider = index < mine.lastIndex,
                ) {
                    app.pop()
                    app.openConversation(session.id)
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        SmallButton("Start a new conversation") { app.chat.startNew(); app.pop(); app.selectTab(com.aidoraa.app.state.Tab.Ask) }
    }
}

/** Height the tab bar takes above the navigation bar (68dp bar + 14dp margin + 10dp gap). */
internal val TAB_BAR_SPACE = 92.dp

/** How far the composer sits from the bottom edge: above the keyboard, and above the tab bar when it shows. */
internal fun composerOffset(ime: androidx.compose.ui.unit.Dp, nav: androidx.compose.ui.unit.Dp, tabBarShown: Boolean): androidx.compose.ui.unit.Dp {
    val aboveChrome = nav + if (tabBarShown) TAB_BAR_SPACE else 8.dp
    val aboveKeyboard = ime + 8.dp
    return if (aboveKeyboard > aboveChrome) aboveKeyboard else aboveChrome
}
