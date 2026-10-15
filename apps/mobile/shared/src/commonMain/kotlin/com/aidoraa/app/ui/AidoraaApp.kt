package com.aidoraa.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.toSize
import com.aidoraa.app.state.AppController
import com.aidoraa.app.state.AppPhase
import com.aidoraa.app.state.InfoKind
import com.aidoraa.app.state.Route
import com.aidoraa.app.state.Tab
import com.aidoraa.app.ui.components.Icon
import com.aidoraa.app.ui.components.Icons
import com.aidoraa.app.ui.components.LocalRootSize
import com.aidoraa.app.ui.components.SkyBackground
import com.aidoraa.app.ui.components.Sheet
import com.aidoraa.app.ui.components.T
import com.aidoraa.app.ui.components.ToastHost
import com.aidoraa.app.ui.components.floatingGlass
import com.aidoraa.app.ui.components.tap
import com.aidoraa.app.ui.screens.AddPersonScreen
import com.aidoraa.app.ui.screens.AskScreen
import com.aidoraa.app.ui.screens.ConversationsScreen
import com.aidoraa.app.ui.screens.DeleteAccountScreen
import com.aidoraa.app.ui.screens.FirstPersonScreen
import com.aidoraa.app.ui.screens.ImportsScreen
import com.aidoraa.app.ui.screens.InfoScreen
import com.aidoraa.app.ui.screens.LifeMapScreen
import com.aidoraa.app.ui.screens.LoadFailedScreen
import com.aidoraa.app.ui.screens.NowScreen
import com.aidoraa.app.ui.screens.PeopleScreen
import com.aidoraa.app.ui.screens.PlansScreen
import com.aidoraa.app.ui.screens.ProfileScreen
import com.aidoraa.app.ui.screens.SignInScreen
import com.aidoraa.app.ui.screens.SplashScreen
import com.aidoraa.app.ui.screens.UpdateRequiredScreen
import com.aidoraa.app.ui.screens.YouScreen
import com.aidoraa.app.ui.theme.AidoraaTheme
import com.aidoraa.app.ui.theme.Effects
import com.aidoraa.app.ui.theme.LocalEffects
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type
import com.aidoraa.app.ui.theme.rememberAppFonts
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState

val LocalApp = compositionLocalOf<AppController> { error("No AppController") }

/** One bottom sheet at a time, drawn above the tab bar. */
class SheetHost {
    var content by mutableStateOf<(@Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit)?>(null)
        private set
    var visible by mutableStateOf(false)
        private set

    fun show(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) { this.content = content; visible = true }
    fun hide() { visible = false }
}

val LocalSheet = compositionLocalOf { SheetHost() }

/** Marks content the floating glass (tab bar, composer, sheets) may blur. */
fun Modifier.blurSource(): Modifier = composed {
    val effects = LocalEffects.current
    val state = effects.hazeState
    if (effects.liveBlur && state != null) hazeSource(state) else this
}

/** Registers a system back handler while [enabled]; the newest handler runs first. */
@Composable
fun BackHandler(enabled: Boolean = true, onBack: () -> Unit) {
    val app = LocalApp.current
    val current by rememberUpdatedState(onBack)
    val enabledState by rememberUpdatedState(enabled)
    DisposableEffect(app) {
        val handler: () -> Boolean = { if (enabledState) { current(); true } else false }
        app.addBackHandler(handler)
        onDispose { app.removeBackHandler(handler) }
    }
}

@Composable
fun AidoraaApp(app: AppController) {
    val caps by app.platform.capabilities.collectAsState()
    val reduceEffects by app.reduceEffects.collectAsState()
    val hazeState = rememberHazeState()
    val fonts = rememberAppFonts()
    val effects = Effects(
        liveBlur = caps.liveBlur && !reduceEffects,
        reduceMotion = caps.reduceMotion,
        hazeState = hazeState,
    )
    val rootSize = remember { mutableStateOf(Size.Zero) }
    val sheet = remember { SheetHost() }
    CompositionLocalProvider(LocalRootSize provides rootSize, LocalApp provides app, LocalSheet provides sheet) {
        AidoraaTheme(fonts, effects) {
            Box(Modifier.fillMaxSize().background(Palette.Sky).onSizeChanged { rootSize.value = it.toSize() }) {
                SkyBackground(Modifier.blurSource())
                val phase by app.phase.collectAsState()
                when (val current = phase) {
                    AppPhase.Loading -> SplashScreen()
                    AppPhase.SignedOut -> SignInScreen(app)
                    is AppPhase.UpdateRequired -> UpdateRequiredScreen(current.message)
                    is AppPhase.LoadFailed -> LoadFailedScreen(current.message, onRetry = app::retryAfterFailure, onSignOut = { app.signOut() })
                    AppPhase.FirstPerson -> FirstPersonScreen(app.onboarding, firstRun = true)
                    AppPhase.Main -> MainShell(app)
                }
                BackHandler(enabled = sheet.visible) { sheet.hide() }
                Sheet(sheet.visible, onDismiss = sheet::hide) { sheet.content?.invoke(this) }
                ToastHost(app.toasts)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MainShell(app: AppController) {
    val tab by app.tab.collectAsState()
    val stack by app.stack.collectAsState()
    val reduce = LocalEffects.current.reduceMotion
    // Scroll positions survive switching tabs.
    val nowScroll = rememberScrollState()
    val mapScroll = rememberScrollState()
    val youScroll = rememberScrollState()
    val top = stack.lastOrNull()
    // The tab bar steps aside while the keyboard is up, so the composer can sit right above it.
    val imeVisible = WindowInsets.isImeVisible
    Column(Modifier.fillMaxSize()) {
    if (app.demo) {
        // Its own strip under the status bar: content starts below it, so it never covers
        // anything and grows with the font size. Debug builds only.
        Box(
            Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(top = 2.dp, bottom = 2.dp),
            contentAlignment = Alignment.Center,
        ) {
            com.aidoraa.app.ui.components.T(
                "Sample data",
                com.aidoraa.app.ui.theme.Type.body(11.5.sp, Palette.Navy, androidx.compose.ui.text.font.FontWeight.SemiBold),
                Modifier.background(Palette.GoldSoft, RoundedCornerShape(99.dp)).padding(horizontal = 10.dp, vertical = 2.dp),
            )
        }
    }
    Box(Modifier.fillMaxWidth().weight(1f).then(if (app.demo) Modifier.consumeWindowInsets(WindowInsets.statusBars) else Modifier)) {
        AnimatedContent(
            targetState = top ?: tab,
            transitionSpec = { fadeIn(tween(if (reduce) 0 else 220)) togetherWith fadeOut(tween(if (reduce) 0 else 160)) },
            label = "screen",
        ) { target ->
            when (target) {
                Tab.Now -> NowScreen(app, nowScroll)
                Tab.LifeMap -> LifeMapScreen(app, mapScroll)
                Tab.Ask -> AskScreen(app)
                Tab.You -> YouScreen(app, youScroll)
                Route.Plans -> PlansScreen(app)
                Route.Imports -> ImportsScreen(app)
                Route.DeleteAccount -> DeleteAccountScreen(app)
                Route.Conversations -> ConversationsScreen(app)
                Route.People -> PeopleScreen(app)
                Route.AddPerson -> AddPersonScreen(app)
                Route.Profile -> ProfileScreen(app)
                is Route.Info -> InfoScreen(app, target.kind)
                else -> Unit
            }
        }
        if (top == null && !imeVisible) TabBar(tab, Modifier.align(Alignment.BottomCenter), app::selectTab)
    }
    }
}

@Composable
private fun TabBar(selected: Tab, modifier: Modifier, onSelect: (Tab) -> Unit) {
    val shape = RoundedCornerShape(34.dp)
    Row(
        modifier
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(start = 14.dp, end = 14.dp, bottom = 14.dp)
            .fillMaxWidth()
            .height(68.dp)
            .floatingGlass(shape)
            .padding(6.dp),
    ) {
        Tab.entries.forEach { tab ->
            val active = tab == selected
            val icon = when (tab) { Tab.Now -> Icons.Now; Tab.LifeMap -> Icons.Map; Tab.Ask -> Icons.Ask; Tab.You -> Icons.You }
            Column(
                Modifier.weight(1f).fillMaxHeight()
                    .background(if (active) Color(0x1FFFFFFF) else Color.Transparent, RoundedCornerShape(28.dp))
                    .semantics { role = Role.Tab; this.selected = active }
                    .tap(tab.label) { onSelect(tab) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
            ) {
                Icon(icon, if (active) Palette.GoldSoft else Palette.Ink3, 22.dp)
                Spacer(Modifier.height(3.dp))
                T(tab.label, Type.body(11.5.sp, if (active) Palette.Ink else Palette.Ink3))
            }
        }
    }
}
