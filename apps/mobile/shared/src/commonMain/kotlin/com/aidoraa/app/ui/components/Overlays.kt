package com.aidoraa.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aidoraa.app.ui.theme.LocalEffects
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow

private val sheetShape = RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp)

/** A bottom sheet with a scrim, as in the prototype. Tapping the scrim closes it. */
@Composable
fun BoxScope.Sheet(visible: Boolean, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val reduce = LocalEffects.current.reduceMotion
    AnimatedVisibility(visible, enter = fadeIn(tween(if (reduce) 0 else 250)), exit = fadeOut(tween(if (reduce) 0 else 250))) {
        Box(Modifier.fillMaxSize().background(Color(0x8C03060E)).tap("Close", onClick = onDismiss))
    }
    AnimatedVisibility(
        visible,
        modifier = Modifier.align(Alignment.BottomCenter),
        enter = slideInVertically(tween(if (reduce) 0 else 320)) { it },
        exit = slideOutVertically(tween(if (reduce) 0 else 260)) { it },
    ) {
        Box(Modifier.fillMaxHeight(0.86f), contentAlignment = Alignment.BottomCenter) {
        Column(
            Modifier.fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Palette.SheetTop, Palette.SheetBottom)), sheetShape)
                .border(1.dp, Palette.Edge, sheetShape)
                .tap(null) { }
                .windowInsetsPadding(WindowInsets.navigationBars)
                .imePadding()
                .padding(start = 20.dp, end = 20.dp, top = 10.dp, bottom = 28.dp),
        ) {
            Box(Modifier.align(Alignment.CenterHorizontally).padding(bottom = 14.dp).width(40.dp).height(5.dp)
                .background(Color(0x40FFFFFF), RoundedCornerShape(3.dp)))
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), content = content)
        }
        }
    }
}

/** Short messages that slide in under the status bar. */
@Composable
fun BoxScope.ToastHost(messages: Flow<String>) {
    var current by remember { mutableStateOf<String?>(null) }
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(messages) {
        messages.collect { message ->
            current = message
            visible = true
            delay(2200)
            visible = false
        }
    }
    AnimatedVisibility(
        visible,
        modifier = Modifier.align(Alignment.TopCenter).windowInsetsPadding(WindowInsets.statusBars).padding(top = 12.dp, start = 24.dp, end = 24.dp),
        enter = fadeIn() + slideInVertically { -it / 2 },
        exit = fadeOut(),
    ) {
        T(
            current.orEmpty(),
            Type.body(13.5.sp),
            Modifier.semantics { liveRegion = LiveRegionMode.Polite }
                .background(Color(0xE61E2840), Pill).border(1.dp, Palette.Edge, Pill)
                .padding(horizontal = 16.dp, vertical = 10.dp),
        )
    }
}

/** A sheet-like card in the middle of the screen for blocking messages. */
@Composable
fun CenterNotice(content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(24.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.fillMaxWidth().glass(CardLarge).padding(24.dp), content = content)
    }
}

/** Top bar with a round glass back button. */
@Composable
fun BackBar(onBack: () -> Unit, trailing: @Composable () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 6.dp).height(52.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconCircleButton(Icons.Back, "Back", onClick = onBack)
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) { trailing() }
    }
}

@Composable
fun Dot(color: Color, modifier: Modifier = Modifier) = Box(modifier.size(8.dp).background(color, Pill))
