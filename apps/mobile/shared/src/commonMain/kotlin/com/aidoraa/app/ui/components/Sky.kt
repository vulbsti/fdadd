package com.aidoraa.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.unit.dp
import com.aidoraa.app.ui.theme.LocalEffects
import com.aidoraa.app.ui.theme.Palette
import dev.chrisbanes.haze.HazeInput
import dev.chrisbanes.haze.HazePerformanceMode
import dev.chrisbanes.haze.blur.HazeBlurStyle
import dev.chrisbanes.haze.blur.HazeColorEffect
import dev.chrisbanes.haze.blur.hazeBlur
import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random

/** The window size, so glass panels can line their blurred-sky backdrop up with the real sky. */
val LocalRootSize = compositionLocalOf { mutableStateOf(Size.Zero) }

private class Star(val x: Float, val y: Float, val radius: Float, val phase: Float)

private val stars: List<Star> = Random(7).let { random ->
    List(140) { Star(random.nextFloat(), random.nextFloat(), random.nextFloat() * 1.3f + 0.3f, random.nextFloat() * 2f * PI.toFloat()) }
}

private val skyStops = arrayOf(0f to Color(0xFF0A1020), 0.55f to Color(0xFF121C36), 1f to Color(0xFF1D2747))

/** The smooth part of the sky (gradient and glows): the sky as it looks blurred, stars gone. */
fun DrawScope.drawSkyBase(full: Size) {
    if (full.width <= 0f || full.height <= 0f) return
    drawRect(Brush.verticalGradient(*skyStops, startY = 0f, endY = full.height), size = full)
    drawRect(
        Brush.radialGradient(listOf(Color(0x29D8A94F), Color.Transparent), Offset(full.width * 0.85f, full.height * 0.12f), full.width * 0.7f),
        size = full,
    )
    drawRect(
        Brush.radialGradient(listOf(Color(0x2E5A6EBE), Color.Transparent), Offset(full.width * 0.1f, full.height * 0.7f), full.width * 0.8f),
        size = full,
    )
}

/**
 * The starry night behind everything, drawn with a Canvas. Stars twinkle at
 * about 15 frames a second, and hold still when motion is reduced.
 */
@Composable
fun SkyBackground(modifier: Modifier = Modifier, animate: Boolean) {
    var time by remember { mutableFloatStateOf(0f) }
    if (animate) {
        LaunchedEffect(Unit) {
            var last = 0L
            while (true) {
                withFrameMillis { frame ->
                    if (frame - last >= 66) { time = frame.toFloat(); last = frame }
                }
            }
        }
    }
    Canvas(modifier.fillMaxSize()) {
        drawSkyBase(size)
        val scale = size.width / 390f
        val t = time
        for (star in stars) {
            val alpha = if (animate) 0.35f + 0.4f * sin(t / 1400f + star.phase) else 0.35f + 0.4f * sin(star.phase)
            drawCircle(Color(0xFFF0ECE0).copy(alpha = alpha.coerceIn(0.05f, 1f)), star.radius * scale, Offset(star.x * size.width, star.y * size.height))
        }
    }
}

private val glassTint = Brush.linearGradient(listOf(Color(0x1AFFFFFF), Color(0x0AFFFFFF)), start = Offset.Zero, end = Offset(600f, 1200f))
private val edgeBrush = Brush.verticalGradient(listOf(Palette.EdgeTop, Palette.Edge, Palette.Edge))

/**
 * Glass for panels that sit on the sky. The sky is blurred once, in effect:
 * each panel draws the same smooth sky (no stars) lined up with its position,
 * then the frosted tint and a lit top edge. No per-panel live blur is needed,
 * so it is equally cheap on every device.
 */
fun Modifier.glass(shape: Shape, strong: Boolean = false): Modifier = composed {
    val rootSize = LocalRootSize.current
    val position = remember { mutableStateOf(Offset.Zero) }
    this
        .onGloballyPositioned { position.value = it.positionInRoot() }
        .drawBehind {
            val outline = shape.createOutline(size, layoutDirection, this)
            val path = androidx.compose.ui.graphics.Path().apply { addOutline(outline) }
            clipPath(path) {
                val origin = position.value
                translate(-origin.x, -origin.y) { drawSkyBase(rootSize.value) }
                drawRect(Color(0xFF0B1222).copy(alpha = 0.18f))
                drawRect(glassTint)
                if (strong) drawRect(Color(0x0FFFFFFF))
            }
        }
        .border(1.dp, edgeBrush, shape)
}

/**
 * Glass for chrome that floats over moving content (tab bar, composer,
 * sheets). With live blur it samples the shared Haze source; without it
 * (Android 11 and below, low-memory phones, or reduced effects) it is a
 * tinted translucent panel.
 */
fun Modifier.floatingGlass(shape: Shape, fallback: Color = Color(0xE6182240)): Modifier = composed {
    val effects = LocalEffects.current
    val haze = effects.hazeState
    val base = this
    if (effects.liveBlur && haze != null) {
        base
            .clip(shape)
            .hazeBlur(
                HazeInput.Sources(haze),
                HazeBlurStyle {
                    blurRadius(22.dp)
                    backgroundColor(Palette.Sky)
                    colorEffects(listOf(HazeColorEffect.tint(Color(0x401A2440))))
                    noiseFactor(0f)
                },
                HazePerformanceMode.Balanced,
                true,
            )
            .drawBehind { drawOutline(shape.createOutline(size, layoutDirection, this), glassTint) }
            .border(1.dp, edgeBrush, shape)
    } else {
        base
            .drawBehind { drawOutline(shape.createOutline(size, layoutDirection, this), fallback) }
            .drawBehind { drawOutline(shape.createOutline(size, layoutDirection, this), glassTint) }
            .border(1.dp, edgeBrush, shape)
    }
}
