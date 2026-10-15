package com.aidoraa.app.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.aidoraa.app.core.greetingFor
import com.aidoraa.app.core.localHour
import com.aidoraa.app.core.localWeekdayName
import com.aidoraa.app.core.parseIsoMillis
import com.aidoraa.app.core.partOfDay
import com.aidoraa.app.core.relativeDay
import com.aidoraa.app.domain.LifeModel
import com.aidoraa.app.domain.PanelId
import com.aidoraa.app.domain.PanelLayout
import com.aidoraa.app.domain.PanelSize
import com.aidoraa.app.domain.PanelSlot
import com.aidoraa.app.state.AppController
import com.aidoraa.app.state.Route
import com.aidoraa.app.state.Tab
import com.aidoraa.app.data.SessionSummaryDto
import com.aidoraa.app.ui.BackHandler
import com.aidoraa.app.ui.LocalSheet
import com.aidoraa.app.ui.components.CardLarge
import com.aidoraa.app.ui.components.CardMedium
import com.aidoraa.app.ui.components.Chip
import com.aidoraa.app.ui.components.Eyebrow
import com.aidoraa.app.ui.components.Icon
import com.aidoraa.app.ui.components.Icons
import com.aidoraa.app.ui.components.LocalRootSize
import com.aidoraa.app.ui.components.SmallButton
import com.aidoraa.app.ui.components.Spinner
import com.aidoraa.app.ui.components.StillLearning
import com.aidoraa.app.ui.components.T
import com.aidoraa.app.ui.components.TextLink
import com.aidoraa.app.ui.components.glass
import com.aidoraa.app.ui.components.tap
import com.aidoraa.app.ui.theme.LocalEffects
import com.aidoraa.app.ui.theme.LocalFonts
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type
import com.aidoraa.app.ui.theme.emphasised
import kotlinx.coroutines.delay

@Composable
fun NowScreen(app: AppController, scroll: ScrollState) {
    val bootstrap by app.bootstrap.collectAsState()
    val life by app.life.collectAsState()
    val loading by app.lifeLoading.collectAsState()
    val layout by app.layout.collectAsState()
    val sessions by app.sessions.collectAsState()
    val personId by app.personId.collectAsState()
    var arranging by remember { mutableStateOf(false) }
    val sheet = LocalSheet.current

    BackHandler(enabled = arranging) { arranging = false }

    val person = bootstrap?.profiles?.firstOrNull { it.id == personId }
    val firstName = (bootstrap?.user?.displayName?.takeIf { it.isNotBlank() } ?: person?.name ?: "").trim().split(' ').firstOrNull().orEmpty()
    val hour = remember { localHour() }

    ScrollScreen(scroll) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Eyebrow("${localWeekdayName()} ${partOfDay(hour)}")
                T(
                    if (firstName.isNotEmpty()) emphasised("${greetingFor(hour)}, ", firstName) else emphasised(greetingFor(hour), ""),
                    Type.display(34.sp), Modifier.padding(top = 4.dp),
                )
                if (person != null && bootstrap?.user?.displayName != null && person.name.split(' ').first() != firstName) {
                    T("Looking at ${person.name}'s life", Type.body(13.sp, Palette.Ink3), Modifier.padding(top = 2.dp))
                }
            }
            Avatar(firstName.ifEmpty { person?.name.orEmpty() }, 44) { app.selectTab(Tab.You) }
        }

        ChapterCard(life, loading) { app.selectTab(Tab.LifeMap) }

        Row(Modifier.fillMaxWidth().padding(top = 24.dp, bottom = 10.dp, start = 2.dp, end = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Eyebrow("Your panels", Modifier.weight(1f))
            TextLink(if (arranging) "Done" else "Arrange") { arranging = !arranging }
        }
        if (arranging) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 2.dp, bottom = 10.dp)) {
                T("Hold and drag to reorder. Resize or hide with the buttons.", Type.body(13.sp, Palette.Ink3), Modifier.weight(1f))
                TextLink("Add panel") { sheet.show { AddPanelSheet(app) } }
            }
        } else if (layout.isEmpty()) {
            T("Every panel is hidden. Tap Arrange, then Add panel.", Type.body(13.sp, Palette.Ink3), Modifier.padding(start = 2.dp))
        }

        PanelGrid(
            slots = layout,
            arranging = arranging,
            scroll = scroll,
            onArrange = { arranging = true },
            onMove = app::movePanel,
            onResize = app::togglePanelSize,
            onHide = app::hidePanel,
            onOpen = { id -> openPanel(app, id, life, sessions) },
        ) { id -> PanelBody(id, life, LifeModelSessions(sessions, personId)) }
    }
}

private data class LifeModelSessions(val all: List<SessionSummaryDto>, val personId: String?)

private fun openPanel(app: AppController, id: PanelId, life: LifeModel, sessions: List<SessionSummaryDto>) {
    when (id) {
        PanelId.People -> app.push(Route.People)
        PanelId.Question -> {
            app.chat.startNew(life.question?.let { "About \"$it\": " })
            app.selectTab(Tab.Ask)
        }
        PanelId.Recent -> app.push(Route.Conversations)
        else -> app.selectTab(Tab.LifeMap)
    }
}

@Composable
fun Avatar(name: String, sizeDp: Int, onClick: (() -> Unit)? = null) {
    Box(
        Modifier.size(sizeDp.dp)
            .background(Brush.linearGradient(listOf(Palette.GoldSoft, Palette.Gold)), CircleShape)
            .then(if (onClick != null) Modifier.tap("Your profile", onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        T(name.trim().take(1).uppercase().ifEmpty { "A" }, Type.display((sizeDp * 0.45f).sp, Palette.Sky))
    }
}

@Composable
private fun ChapterCard(life: LifeModel, loading: Boolean, onOpen: () -> Unit) {
    val chapter = life.current
    Column(
        Modifier.padding(top = 18.dp).fillMaxWidth().glass(CardLarge)
            .drawBehind {
                drawCircle(
                    Brush.radialGradient(listOf(Color(0x59D8A94F), Color.Transparent), Offset(size.width - 50.dp.toPx(), 50.dp.toPx()), 90.dp.toPx()),
                    90.dp.toPx(), Offset(size.width - 50.dp.toPx(), 50.dp.toPx()),
                )
            }
            .tap("Open your life map", onClick = onOpen)
            .padding(20.dp),
    ) {
        Eyebrow("The chapter you are in")
        if (chapter != null) {
            T(chapter.title, Type.display(28.sp), Modifier.padding(top = 6.dp, bottom = 8.dp))
            chapter.summary?.let { T(it, Type.muted()) }
            chapter.period?.let { T(it, Type.body(12.5.sp, Palette.Ink3), Modifier.padding(top = 10.dp)) }
        } else {
            T(emphasised("Your chapter is ", "taking shape", Palette.GoldSoft), Type.display(28.sp), Modifier.padding(top = 6.dp, bottom = 8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (loading) { Spinner(size = 16.dp); Spacer(Modifier.width(10.dp)) }
                T(
                    if (life.updating || loading) "Aidoraa is still learning this. Tell it about your life in Ask and this fills in."
                    else "Aidoraa is still learning this. Share a turning point in Ask, or import your notes.",
                    Type.muted(),
                )
            }
        }
    }
}

/**
 * The two-column panel grid. One Layout holds every panel (keyed by id) so a
 * panel keeps its drag gesture while it moves between rows.
 */
@Composable
private fun PanelGrid(
    slots: List<PanelSlot>,
    arranging: Boolean,
    scroll: ScrollState,
    onArrange: () -> Unit,
    onMove: (Int, Int) -> Unit,
    onResize: (PanelId) -> Unit,
    onHide: (PanelId) -> Unit,
    onOpen: (PanelId) -> Unit,
    body: @Composable (PanelId) -> Unit,
) {
    val bounds = remember { mutableStateMapOf<PanelId, Rect>() }
    var dragging by remember { mutableStateOf<PanelId?>(null) }
    var pointer by remember { mutableStateOf(Offset.Zero) }
    var grab by remember { mutableStateOf(Offset.Zero) }
    val currentSlots by rememberUpdatedState(slots)
    val rootSize = LocalRootSize.current
    val reduce = LocalEffects.current.reduceMotion

    // Scroll while a panel is held near the top or bottom edge.
    LaunchedEffect(dragging) {
        while (dragging != null) {
            val height = rootSize.value.height
            val step = when {
                pointer.y < 160f -> -18f
                height > 0 && pointer.y > height - 260f -> 18f
                else -> 0f
            }
            if (step != 0f) scroll.scrollBy(step)
            delay(16)
        }
    }

    val still = remember { mutableStateOf(0f) }
    val wobble: androidx.compose.runtime.State<Float> = if (arranging && !reduce) {
        val transition = rememberInfiniteTransition()
        transition.animateFloat(-0.6f, 0.6f, infiniteRepeatable(tween(500), RepeatMode.Reverse))
    } else still

    Layout(
        content = {
            slots.forEachIndexed { index, slot ->
                key(slot.id) {
                    val isDragged = dragging == slot.id
                    Box(
                        Modifier
                            .zIndex(if (isDragged) 1f else 0f)
                            .onGloballyPositioned { bounds[slot.id] = it.boundsInRoot() }
                            .graphicsLayer {
                                if (isDragged) {
                                    val rect = bounds[slot.id]
                                    if (rect != null) {
                                        translationX = pointer.x - grab.x - rect.left
                                        translationY = pointer.y - grab.y - rect.top
                                    }
                                    scaleX = 1.04f; scaleY = 1.04f
                                    shadowElevation = 20f
                                } else {
                                    rotationZ = if (index % 2 == 0) wobble.value else -wobble.value
                                }
                            }
                            .pointerInput(slot.id) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { local ->
                                        onArrange()
                                        val rect = bounds[slot.id] ?: return@detectDragGesturesAfterLongPress
                                        dragging = slot.id
                                        grab = local
                                        pointer = rect.topLeft + local
                                    },
                                    onDrag = { change, amount ->
                                        change.consume()
                                        pointer += amount
                                        val target = bounds.entries.firstOrNull { (id, rect) -> id != slot.id && rect.contains(pointer) }?.key
                                        if (target != null) {
                                            val from = currentSlots.indexOfFirst { it.id == slot.id }
                                            val to = currentSlots.indexOfFirst { it.id == target }
                                            if (from >= 0 && to >= 0) onMove(from, to)
                                        }
                                    },
                                    onDragEnd = { dragging = null },
                                    onDragCancel = { dragging = null },
                                )
                            }
                            .semantics {
                                customActions = listOfNotNull(
                                    if (index > 0) CustomAccessibilityAction("Move up") { onMove(index, index - 1); true } else null,
                                    if (index < slots.lastIndex) CustomAccessibilityAction("Move down") { onMove(index, index + 1); true } else null,
                                    CustomAccessibilityAction(if (slot.size == PanelSize.Full) "Make half width" else "Make full width") { onResize(slot.id); true },
                                    CustomAccessibilityAction("Hide panel") { onHide(slot.id); true },
                                )
                            },
                    ) {
                        Column(
                            Modifier.fillMaxWidth().glass(CardMedium)
                                .then(if (!arranging) Modifier.tap(slot.id.title) { onOpen(slot.id) } else Modifier)
                                .padding(16.dp),
                        ) {
                            T(slot.id.title, Type.body(13.sp, Palette.Ink2, androidx.compose.ui.text.font.FontWeight.SemiBold),
                                Modifier.padding(end = if (arranging) 70.dp else 0.dp, bottom = 8.dp))
                            body(slot.id)
                        }
                        if (arranging) {
                            Row(Modifier.align(Alignment.TopEnd).padding(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                CtrlButton(Icons.Resize, "Resize ${slot.id.title}") { onResize(slot.id) }
                                CtrlButton(Icons.Close, "Hide ${slot.id.title}") { onHide(slot.id) }
                            }
                        }
                    }
                }
            }
        },
    ) { measurables, constraints ->
        val gap = 12.dp.roundToPx()
        val width = constraints.maxWidth
        val half = (width - gap) / 2
        val bySlot = slots.zip(measurables)
        val rows = PanelLayout.rows(slots)
        val placements = mutableListOf<Triple<androidx.compose.ui.layout.Placeable, Int, Int>>()
        var y = 0
        rows.forEach { row ->
            val items = row.map { slot -> bySlot.first { it.first.id == slot.id } }
            val widths = row.map { if (it.size == PanelSize.Full || row.size == 1 && it.size == PanelSize.Full) width else half }
            val rowHeight = items.mapIndexed { i, (_, m) -> m.minIntrinsicHeight(widths[i]) }.maxOrNull() ?: 0
            var x = 0
            items.forEachIndexed { i, (_, measurable) ->
                val placeable = measurable.measure(Constraints.fixed(widths[i], rowHeight.coerceAtLeast(1)))
                placements += Triple(placeable, x, y)
                x += widths[i] + gap
            }
            y += rowHeight + gap
        }
        val height = (y - gap).coerceAtLeast(0)
        layout(width, height) { placements.forEach { (p, px, py) -> p.place(px, py) } }
    }
}

@Composable
private fun CtrlButton(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, onClick: () -> Unit) {
    Box(
        Modifier.size(30.dp).background(Color(0xBF0B1222), CircleShape).border(1.dp, Palette.Edge, CircleShape).tap(description, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, Palette.Ink, 14.dp, description) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PanelBody(id: PanelId, life: LifeModel, sessions: LifeModelSessions) {
    val big = Type.display(21.sp).copy(lineHeight = 25.sp)
    when (id) {
        PanelId.Knows -> when {
            life.beliefs.isNotEmpty() -> Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                life.beliefs.forEach { belief ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        T(belief.text, Type.body(14.sp), Modifier.weight(1f))
                        Spacer(Modifier.width(8.dp))
                        Box(Modifier.width(34.dp).height(4.dp).background(Color(0x1FFFFFFF), RoundedCornerShape(4.dp))) {
                            Box(Modifier.fillMaxWidth(belief.confidence).height(4.dp).background(Palette.GoldSoft, RoundedCornerShape(4.dp)))
                        }
                        Spacer(Modifier.width(6.dp))
                        T(belief.label, Type.body(12.sp, Palette.Ink3))
                    }
                }
            }
            life.brief != null -> T(life.brief, Type.body(14.sp), maxLines = 6)
            else -> StillLearning()
        }
        PanelId.Drives -> if (life.drives.isNotEmpty()) T(life.drives.first(), big, maxLines = 4) else StillLearning()
        PanelId.Effort -> StillLearning()
        PanelId.Arc -> if (life.arc.size >= 2) LifeArc(life) else StillLearning()
        PanelId.Patterns -> if (life.patterns.isNotEmpty()) T(life.patterns.first(), big, maxLines = 4) else StillLearning()
        PanelId.People -> if (life.people.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                life.people.take(5).forEach { Chip(it) }
            }
        } else StillLearning()
        PanelId.Question -> if (life.question != null) T(life.question, big, maxLines = 4) else StillLearning()
        PanelId.Recent -> {
            val recent = sessions.all.filter { sessions.personId == null || it.profileId == null || it.profileId == sessions.personId }.take(3)
            if (recent.isEmpty()) StillLearning("No conversations yet. Ask anything about your life.")
            else Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                recent.forEach { session ->
                    Row {
                        T(session.title.ifBlank { "Conversation" }, Type.body(14.sp), Modifier.weight(1f), maxLines = 1)
                        Spacer(Modifier.width(8.dp))
                        T(parseIsoMillis(session.updatedAt)?.let { relativeDay(it) }.orEmpty(), Type.body(12.sp, Palette.Ink3))
                    }
                }
            }
        }
    }
}

/** A gentle rising arc with the dated chapters as points and "now" in gold. */
@Composable
private fun LifeArc(life: LifeModel) {
    val points = life.arc
    val first = points.first().year
    val last = points.last().year.coerceAtLeast(first + 1)
    val fonts = LocalFonts.current
    Column {
        Canvas(Modifier.fillMaxWidth().height(70.dp)) {
            val w = size.width; val h = size.height
            fun x(year: Int) = 6f + (w - 12f) * (year - first) / (last - first).toFloat()
            fun y(i: Int) = h - 10f - (h - 24f) * (i + 1) / (points.size + 1).toFloat()
            val path = Path().apply {
                moveTo(4f, h - 6f)
                points.forEachIndexed { i, p -> lineTo(x(p.year), y(i)) }
            }
            drawPath(path, Color(0x40FFFFFF), style = Stroke(2.dp.toPx()))
            points.forEachIndexed { i, p ->
                val c = Offset(x(p.year), y(i))
                if (p.isNow) {
                    drawCircle(Color(0x40D8A94F), 10.dp.toPx() / 2 * 2, c)
                    drawCircle(Palette.Gold, 5.dp.toPx(), c)
                } else drawCircle(Palette.GoldSoft, 3.dp.toPx(), c)
            }
        }
        Row(Modifier.fillMaxWidth()) {
            T(first.toString(), Type.body(10.sp, Palette.Ink3), Modifier.weight(1f))
            T(points.lastOrNull { it.isNow }?.let { "Now, ${it.year}" } ?: points.last().year.toString(), Type.body(10.sp, Palette.GoldSoft))
        }
    }
}

@Composable
private fun AddPanelSheet(app: AppController) {
    val layout by app.layout.collectAsState()
    val sheet = LocalSheet.current
    val hidden = PanelLayout.hidden(layout)
    T(emphasised("Add a ", "panel"), Type.display(26.sp), Modifier.padding(bottom = 6.dp))
    T("Hidden panels wait here.", Type.muted())
    Spacer(Modifier.height(14.dp))
    if (hidden.isEmpty()) T("Every panel is already on Now.", Type.muted())
    hidden.forEach { id ->
        Row(
            Modifier.fillMaxWidth().padding(bottom = 8.dp).background(Color(0x0FFFFFFF), RoundedCornerShape(14.dp))
                .border(1.dp, Palette.Edge, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            T(id.title, Type.body(15.sp), Modifier.weight(1f))
            SmallButton("Add") { app.addPanel(id); app.toast("Panel added"); if (PanelLayout.hidden(app.layout.value).isEmpty()) sheet.hide() }
        }
    }
}
