package com.aidoraa.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aidoraa.app.domain.ChapterItem
import com.aidoraa.app.domain.Stage
import com.aidoraa.app.state.AppController
import com.aidoraa.app.state.Tab
import com.aidoraa.app.ui.components.CardMedium
import com.aidoraa.app.ui.components.Eyebrow
import com.aidoraa.app.ui.components.GlassButton
import com.aidoraa.app.ui.components.Pill
import com.aidoraa.app.ui.components.ScreenTitle
import com.aidoraa.app.ui.components.Spinner
import com.aidoraa.app.ui.components.T
import com.aidoraa.app.ui.components.TextLink
import com.aidoraa.app.ui.components.glass
import com.aidoraa.app.ui.components.tap
import com.aidoraa.app.ui.theme.LocalEffects
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type

@Composable
fun LifeMapScreen(app: AppController, scroll: ScrollState) {
    val life by app.life.collectAsState()
    val loading by app.lifeLoading.collectAsState()
    ScrollScreen(scroll) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Eyebrow("Life map", Modifier.weight(1f))
            if (loading) Spinner(size = 16.dp)
        }
        ScreenTitle("Your life, ", "chapter by chapter")
        T(
            if (life.chapters.isEmpty()) "Your life map starts with what you choose to share."
            else "Tap a chapter to open it. The ones you told Aidoraa about yourself are marked.",
            Type.muted(),
        )
        if (life.updating) T("Updating with what you shared recently.", Type.body(13.sp, Palette.GoldSoft), Modifier.padding(top = 6.dp))
        if (life.chapters.isEmpty()) {
            Spacer(Modifier.height(20.dp))
            T("Aidoraa is still learning this. Share a moment that changed what mattered to you, and the map grows from there.", Type.body(14.sp, Palette.Ink3))
            Spacer(Modifier.height(16.dp))
            GlassButton("Share a turning point") {
                app.chat.startNew("A turning point in my life was ")
                app.selectTab(Tab.Ask)
            }
        } else {
            Spacer(Modifier.height(16.dp))
            Box {
                // The path: muted for the past, gold through now, fading into what's coming.
                Box(Modifier.matchParentSize().padding(start = 13.dp, top = 8.dp, bottom = 8.dp)) {
                    Box(
                        Modifier.width(2.dp).fillMaxHeight()
                            .background(Brush.verticalGradient(0f to Palette.Ink3, 0.62f to Palette.Gold, 1f to Color(0x14FFFFFF))),
                    )
                }
                Column(Modifier.padding(start = 34.dp)) {
                    life.chapters.forEach { chapter -> Stop(chapter, app) }
                }
            }
        }
    }
}


@Composable
private fun Stop(chapter: ChapterItem, app: AppController) {
    var open by remember(chapter.id) { mutableStateOf(chapter.stage == Stage.Now) }
    val reduce = LocalEffects.current.reduceMotion
    val isNow = chapter.stage == Stage.Now
    Box(Modifier.padding(bottom = 14.dp).alpha(if (chapter.stage == Stage.Coming) 0.72f else 1f)) {
        // The dot on the path.
        Box(
            Modifier.offset(x = (-27).dp, y = 20.dp).size(14.dp)
                .drawBehind { if (isNow) drawCircle(Color(0x33D8A94F), size.minDimension / 2 + 6.dp.toPx(), Offset(size.width / 2, size.height / 2)) }
                .background(if (isNow) Palette.Gold else Palette.Sky2, CircleShape)
                .border(2.dp, if (isNow) Palette.GoldSoft else Palette.Ink3, CircleShape),
        )
        Column(
            Modifier.fillMaxWidth().glass(CardMedium)
                .semantics { stateDescription = if (open) "Open" else "Closed" }
                .tap(chapter.title) { open = !open }
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                T(chapter.period ?: when (chapter.stage) { Stage.Now -> "Now"; Stage.Coming -> "Coming"; Stage.Past -> "Earlier" },
                    Type.body(12.5.sp, Palette.Ink3))
                if (isNow) Tag("now")
                if (chapter.stage == Stage.Coming) Tag("a possible path")
                chapter.tag?.let { Tag(it) }
            }
            T(chapter.title, Type.display(21.sp), Modifier.padding(top = 2.dp, bottom = 4.dp))
            AnimatedVisibility(
                open,
                enter = if (reduce) fadeIn(tween(0)) else expandVertically(tween(350)) + fadeIn(),
                exit = if (reduce) fadeOut(tween(0)) else shrinkVertically(tween(300)) + fadeOut(),
            ) {
                Column {
                    chapter.summary?.let { T(it, Type.body(14.sp, Palette.Ink2), Modifier.padding(top = 6.dp)) }
                    chapter.details.forEach { T(it, Type.body(14.sp, Palette.Ink2), Modifier.padding(top = 8.dp)) }
                    if (chapter.summary == null && chapter.details.isEmpty()) {
                        T("Aidoraa is still learning about this part of your life.", Type.body(14.sp, Palette.Ink3), Modifier.padding(top = 6.dp))
                    }
                    TextLink("Ask about this chapter", modifier = Modifier.padding(top = 4.dp)) {
                        app.chat.startNew("About \"${chapter.title}\": ")
                        app.selectTab(Tab.Ask)
                    }
                }
            }
        }
    }
}

@Composable
private fun Tag(text: String) {
    T(
        text, Type.body(11.5.sp, Palette.GoldSoft),
        Modifier.padding(start = 6.dp).border(1.dp, Palette.GoldSoft.copy(alpha = 0.35f), Pill).padding(horizontal = 8.dp, vertical = 2.dp),
    )
}
