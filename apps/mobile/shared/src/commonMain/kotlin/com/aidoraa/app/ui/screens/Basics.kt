package com.aidoraa.app.ui.screens

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aidoraa.app.ui.LocalApp
import com.aidoraa.app.ui.blurSource
import com.aidoraa.app.ui.components.BackBar
import com.aidoraa.app.ui.components.BrandMark
import com.aidoraa.app.ui.components.CenterNotice
import com.aidoraa.app.ui.components.GlassButton
import com.aidoraa.app.ui.components.PrimaryButton
import com.aidoraa.app.ui.components.Spinner
import com.aidoraa.app.ui.components.T
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type
import com.aidoraa.app.ui.theme.emphasised

/** A scrolling screen on the sky, clear of the status bar and the tab bar. */
@Composable
fun ScrollScreen(
    scroll: ScrollState = rememberScrollState(),
    bottom: Dp = 120.dp,
    top: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars)) {
        top?.invoke()
        Column(
            Modifier.fillMaxSize().blurSource().verticalScroll(scroll).imePadding()
                .padding(start = 18.dp, end = 18.dp, top = 12.dp, bottom = bottom),
            content = content,
        )
    }
}

/** A pushed screen with a back button. */
@Composable
fun PushedScreen(content: @Composable ColumnScope.() -> Unit) {
    val app = LocalApp.current
    ScrollScreen(bottom = 40.dp, top = { BackBar(onBack = { app.pop() }) }, content = content)
}

@Composable
fun SplashScreen() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BrandMark(64.dp)
            Spacer(Modifier.height(24.dp))
            Spinner()
        }
    }
}

@Composable
fun UpdateRequiredScreen(message: String) {
    val app = LocalApp.current
    CenterNotice {
        BrandMark(48.dp)
        T(emphasised("Update ", "the app"), Type.display(34.sp), Modifier.padding(top = 18.dp, bottom = 10.dp))
        T(message, Type.muted())
        Spacer(Modifier.height(20.dp))
        PrimaryButton("Update in Google Play") {
            app.platform.openExternal("https://play.google.com/store/apps/details?id=com.aidoraa.app")
        }
    }
}

@Composable
fun LoadFailedScreen(message: String, onRetry: () -> Unit, onSignOut: () -> Unit) {
    CenterNotice {
        T(emphasised("We couldn't ", "load your picture"), Type.display(30.sp), Modifier.padding(bottom = 10.dp))
        T(message, Type.muted())
        Spacer(Modifier.height(20.dp))
        PrimaryButton("Try again", onClick = onRetry)
        Spacer(Modifier.height(10.dp))
        GlassButton("Sign out", onClick = onSignOut)
    }
}

/** Full-width content column helper for forms on the sky. */
@Composable
fun FormColumn(bottomAligned: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    androidx.compose.foundation.layout.BoxWithConstraints(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).imePadding(),
    ) {
        val minHeight = maxHeight
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            Column(
                Modifier.fillMaxWidth().heightIn(min = minHeight).padding(horizontal = 22.dp, vertical = 24.dp),
                verticalArrangement = if (bottomAligned) androidx.compose.foundation.layout.Arrangement.Bottom else androidx.compose.foundation.layout.Arrangement.Top,
                content = content,
            )
        }
    }
}

@Composable
fun Gap(height: Int) = Spacer(Modifier.height(height.dp))

@Composable
fun FullWidth(content: @Composable ColumnScope.() -> Unit) = Column(Modifier.fillMaxWidth(), content = content)

@Composable
fun Paragraph(text: String, modifier: Modifier = Modifier) = T(text, Type.muted(), modifier)

@Composable
fun SubtleNote(text: String, modifier: Modifier = Modifier) = T(text, Type.body(13.sp, Palette.Ink3), modifier)
