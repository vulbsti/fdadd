package com.aidoraa.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.aidoraa.app.resources.Res
import com.aidoraa.app.resources.figtree_medium
import com.aidoraa.app.resources.figtree_regular
import com.aidoraa.app.resources.figtree_semibold
import com.aidoraa.app.resources.newsreader_italic
import com.aidoraa.app.resources.newsreader_medium
import com.aidoraa.app.resources.newsreader_regular
import dev.chrisbanes.haze.HazeState
import org.jetbrains.compose.resources.Font

/** The "glass night" palette from the approved prototype. */
object Palette {
    val Sky = Color(0xFF0B1222)
    val Sky2 = Color(0xFF16213D)
    val Ink = Color(0xFFEEF1F7)
    val Ink2 = Color(0xFFAAB3C7)
    val Ink3 = Color(0xFF737E96)
    val Gold = Color(0xFFD8A94F)
    val GoldSoft = Color(0xFFE9C983)
    val Edge = Color(0x24FFFFFF)
    val EdgeTop = Color(0x47FFFFFF)
    val Danger = Color(0xFFEF8A7A)
    val Ok = Color(0xFF8FD3B0)
    val Paper = Color(0xFFF3F1EC)
    val OnGold = Color(0xFF1B1407)
    val Navy = Color(0xFF10172A)
    val SheetTop = Color(0xEB222C48)
    val SheetBottom = Color(0xF510182C)
}

@Immutable
data class AppFonts(val display: FontFamily, val body: FontFamily)

/** Rendering choices for this device: live blur, motion, and the shared blur source. */
@Immutable
data class Effects(
    val liveBlur: Boolean,
    val reduceMotion: Boolean,
    val hazeState: HazeState?,
)

val LocalFonts = staticCompositionLocalOf { AppFonts(FontFamily.Serif, FontFamily.SansSerif) }
val LocalEffects = staticCompositionLocalOf { Effects(liveBlur = false, reduceMotion = false, hazeState = null) }

@Composable
fun rememberAppFonts(): AppFonts {
    val display = FontFamily(
        Font(Res.font.newsreader_regular, FontWeight.Normal, FontStyle.Normal),
        Font(Res.font.newsreader_medium, FontWeight.Medium, FontStyle.Normal),
        Font(Res.font.newsreader_italic, FontWeight.Normal, FontStyle.Italic),
    )
    val body = FontFamily(
        Font(Res.font.figtree_regular, FontWeight.Normal, FontStyle.Normal),
        Font(Res.font.figtree_medium, FontWeight.Medium, FontStyle.Normal),
        Font(Res.font.figtree_semibold, FontWeight.SemiBold, FontStyle.Normal),
    )
    return AppFonts(display, body)
}

@Composable
fun AidoraaTheme(fonts: AppFonts, effects: Effects, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalFonts provides fonts, LocalEffects provides effects, content = content)
}

/** Text styles, read from the current fonts. */
object Type {
    @Composable fun body(size: TextUnit = 15.sp, color: Color = Palette.Ink, weight: FontWeight = FontWeight.Normal) =
        TextStyle(fontFamily = LocalFonts.current.body, fontSize = size, color = color, fontWeight = weight, lineHeight = size * 1.45f)

    @Composable fun display(size: TextUnit = 34.sp, color: Color = Palette.Ink, weight: FontWeight = FontWeight.Normal) =
        TextStyle(fontFamily = LocalFonts.current.display, fontSize = size, color = color, fontWeight = weight, lineHeight = size * 1.1f)

    @Composable fun eyebrow(color: Color = Palette.Ink3) =
        TextStyle(fontFamily = LocalFonts.current.body, fontSize = 12.sp, color = color, letterSpacing = 0.08.em, lineHeight = 16.sp)

    @Composable fun muted(size: TextUnit = 15.sp) = body(size, Palette.Ink2)
}

/** "Good evening, *Meera*": the emphasised part in italic and a softer color. */
fun emphasised(plain: String, emphasis: String, emphasisColor: Color = Palette.Ink2, after: String = ""): AnnotatedString =
    buildAnnotatedString {
        append(plain)
        withStyle(SpanStyle(fontStyle = FontStyle.Italic, color = emphasisColor)) { append(emphasis) }
        append(after)
    }
