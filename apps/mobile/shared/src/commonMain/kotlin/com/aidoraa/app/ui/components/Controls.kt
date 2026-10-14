package com.aidoraa.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aidoraa.app.ui.theme.LocalEffects
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type

val Pill = RoundedCornerShape(99.dp)
val CardLarge = RoundedCornerShape(26.dp)
val CardMedium = RoundedCornerShape(18.dp)

@Composable
fun Icon(vector: ImageVector, tint: Color = Palette.Ink, size: Dp = 20.dp, description: String? = null, modifier: Modifier = Modifier) {
    Image(
        painter = rememberVectorPainter(vector),
        contentDescription = description,
        colorFilter = ColorFilter.tint(tint),
        modifier = modifier.size(size),
    )
}

@Composable
fun T(text: String, style: TextStyle, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE) =
    BasicText(text, modifier, style, maxLines = maxLines, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)

@Composable
fun T(text: AnnotatedString, style: TextStyle, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE) =
    BasicText(text, modifier, style, maxLines = maxLines, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)

@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier, color: Color = Palette.Ink3) =
    T(text.uppercase(), Type.eyebrow(color), modifier)

@Composable
fun ScreenTitle(plain: String, emphasis: String = "", modifier: Modifier = Modifier, size: Int = 34) =
    T(com.aidoraa.app.ui.theme.emphasised(plain, emphasis), Type.display(size.sp), modifier.padding(top = 4.dp, bottom = 6.dp))

/** Tappable without a ripple; the screens give their own visual feedback. */
@Composable
fun Modifier.tap(label: String? = null, enabled: Boolean = true, onClick: () -> Unit): Modifier =
    this.clickable(
        interactionSource = remember { MutableInteractionSource() },
        indication = null,
        enabled = enabled,
        role = Role.Button,
        onClickLabel = label,
        onClick = onClick,
    )

private val goldBrush = Brush.linearGradient(listOf(Palette.GoldSoft, Palette.Gold), start = Offset.Zero, end = Offset(400f, 300f))

@Composable
fun PrimaryButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, busy: Boolean = false, onClick: () -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(Pill)
            .background(goldBrush)
            .alpha(if (enabled) 1f else 0.4f)
            .tap(text, enabled && !busy, onClick)
            .padding(vertical = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (busy) Spinner(color = Palette.OnGold, size = 20.dp)
        else T(text, Type.body(16.sp, Palette.OnGold, FontWeight.SemiBold))
    }
}

@Composable
fun LightButton(text: String, modifier: Modifier = Modifier, leading: (@Composable () -> Unit)? = null, enabled: Boolean = true, onClick: () -> Unit) {
    Row(
        modifier.fillMaxWidth().clip(Pill).background(Palette.Paper).alpha(if (enabled) 1f else 0.5f)
            .tap(text, enabled, onClick).padding(vertical = 15.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) { leading(); Spacer(Modifier.width(10.dp)) }
        T(text, Type.body(15.sp, Palette.Navy, FontWeight.Medium))
    }
}

@Composable
fun GlassButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, color: Color = Palette.Ink, onClick: () -> Unit) {
    Box(
        modifier.fillMaxWidth().glass(Pill).alpha(if (enabled) 1f else 0.5f).tap(text, enabled, onClick).padding(vertical = 15.dp),
        contentAlignment = Alignment.Center,
    ) { T(text, Type.body(15.sp, color, FontWeight.Medium)) }
}

@Composable
fun DangerButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, busy: Boolean = false, onClick: () -> Unit) {
    Box(
        modifier.fillMaxWidth().clip(Pill).background(Palette.Danger).alpha(if (enabled) 1f else 0.35f)
            .tap(text, enabled && !busy, onClick).padding(vertical = 15.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (busy) Spinner(color = Color(0xFF2A0F0A), size = 20.dp)
        else T(text, Type.body(15.sp, Color(0xFF2A0F0A), FontWeight.SemiBold))
    }
}

@Composable
fun TextLink(text: String, modifier: Modifier = Modifier, color: Color = Palette.GoldSoft, size: Int = 14, onClick: () -> Unit) {
    T(text, Type.body(size.sp, color, FontWeight.Medium), modifier.tap(text, onClick = onClick).padding(vertical = 8.dp, horizontal = 4.dp))
}

@Composable
fun SmallButton(text: String, modifier: Modifier = Modifier, on: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        modifier.clip(Pill).background(Color(0x12FFFFFF))
            .border(1.dp, if (on) Palette.Ok.copy(alpha = 0.4f) else Palette.Edge, Pill)
            .alpha(if (enabled) 1f else 0.5f)
            .tap(text, enabled, onClick).padding(horizontal = 13.dp, vertical = 7.dp),
    ) { T(text, Type.body(13.sp, if (on) Palette.Ok else Palette.Ink)) }
}

@Composable
fun Chip(text: String, modifier: Modifier = Modifier) {
    T(text, Type.body(12.5.sp), modifier.clip(Pill).background(Color(0x14FFFFFF)).border(1.dp, Palette.Edge, Pill).padding(horizontal = 10.dp, vertical = 4.dp))
}

@Composable
fun IconCircleButton(icon: ImageVector, description: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(modifier.size(44.dp).glass(CircleShape).tap(description, onClick = onClick).semantics { contentDescription = description }, contentAlignment = Alignment.Center) {
        Icon(icon, Palette.Ink, 20.dp)
    }
}

@Composable
fun Field(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    password: Boolean = false,
    singleLine: Boolean = true,
    onDone: (() -> Unit)? = null,
    letterSpaced: Boolean = false,
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = singleLine,
        textStyle = Type.body(16.sp).let { if (letterSpaced) it.copy(letterSpacing = 1.sp) else it },
        cursorBrush = SolidColor(Palette.GoldSoft),
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboardType),
        keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }, onGo = { onDone?.invoke() }),
        modifier = modifier.fillMaxWidth(),
        decorationBox = { inner ->
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0x0DFFFFFF))
                    .border(1.dp, Palette.Edge, RoundedCornerShape(14.dp)).padding(horizontal = 16.dp, vertical = 14.dp),
            ) {
                if (value.isEmpty()) T(placeholder, Type.body(16.sp, Palette.Ink3))
                inner()
            }
        },
    )
}

@Composable
fun FieldLabel(text: String, modifier: Modifier = Modifier) =
    T(text, Type.body(14.sp, Palette.Ink2), modifier.padding(top = 14.dp, bottom = 6.dp))

@Composable
fun ErrorText(text: String?, modifier: Modifier = Modifier) {
    if (!text.isNullOrBlank()) T(text, Type.body(14.sp, Palette.Danger), modifier.padding(top = 10.dp))
}

@Composable
fun Fine(text: String, modifier: Modifier = Modifier) =
    T(text, Type.body(12.5.sp, Palette.Ink3).copy(textAlign = TextAlign.Center), modifier.fillMaxWidth().padding(top = 12.dp))

/** A spinning arc; a still dot pattern when motion is reduced. */
@Composable
fun Spinner(color: Color = Palette.GoldSoft, size: Dp = 22.dp, modifier: Modifier = Modifier) {
    val reduce = LocalEffects.current.reduceMotion
    val angle = if (reduce) 0f else {
        val transition = rememberInfiniteTransition()
        val value by transition.animateFloat(0f, 360f, infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Restart))
        value
    }
    Canvas(modifier.size(size).rotate(angle).semantics { contentDescription = "Loading" }) {
        drawArc(color, 0f, 270f, false, style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round))
    }
}

/** A glass list group with an eyebrow, as on the You screen. */
@Composable
fun Group(title: String?, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.padding(top = 18.dp)) {
        if (title != null) Eyebrow(title, Modifier.padding(start = 6.dp, end = 6.dp, bottom = 8.dp))
        Column(Modifier.fillMaxWidth().glass(CardMedium), content = content)
    }
}

@Composable
fun SettingsRow(
    icon: ImageVector?,
    label: String,
    sub: String? = null,
    danger: Boolean = false,
    chevron: Boolean = true,
    divider: Boolean = true,
    trailing: (@Composable RowScope.() -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    val color = if (danger) Palette.Danger else Palette.Ink
    Column {
        Row(
            Modifier.fillMaxWidth().then(if (onClick != null) Modifier.tap(label, onClick = onClick) else Modifier)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) {
                Box(Modifier.size(32.dp).clip(RoundedCornerShape(10.dp)).background(Color(0x14FFFFFF)), contentAlignment = Alignment.Center) {
                    Icon(icon, color, 17.dp)
                }
                Spacer(Modifier.width(12.dp))
            }
            Column(Modifier.weight(1f)) {
                T(label, Type.body(15.sp, color))
                if (!sub.isNullOrBlank()) T(sub, Type.body(12.5.sp, Palette.Ink3))
            }
            trailing?.invoke(this)
            if (chevron && onClick != null) { Spacer(Modifier.width(8.dp)); Icon(Icons.Chevron, Palette.Ink3, 16.dp) }
        }
        if (divider) Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0x12FFFFFF)))
    }
}

@Composable
fun StillLearning(text: String = "Aidoraa is still learning this", modifier: Modifier = Modifier) =
    T(text, Type.body(13.5.sp, Palette.Ink3), modifier)

/** A thin progress bar in gold. */
@Composable
fun ProgressBar(fraction: Float, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(4.dp)).background(Color(0x1FFFFFFF))) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).height(4.dp).clip(RoundedCornerShape(4.dp))
            .background(Brush.horizontalGradient(listOf(Palette.Gold, Palette.GoldSoft))))
    }
}

/** The gold constellation "A" mark. */
@Composable
fun BrandMark(size: Dp = 64.dp, modifier: Modifier = Modifier) {
    Canvas(modifier.size(size)) {
        val s = this.size.width / 64f
        val stroke = Stroke(width = 2f * s, cap = StrokeCap.Round)
        fun p(x: Float, y: Float) = Offset(x * s, y * s)
        drawLine(Palette.GoldSoft, p(14f, 52f), p(32f, 12f), stroke.width, StrokeCap.Round)
        drawLine(Palette.GoldSoft, p(32f, 12f), p(50f, 52f), stroke.width, StrokeCap.Round)
        drawLine(Palette.GoldSoft, p(21f, 38f), p(43f, 38f), stroke.width, StrokeCap.Round)
        listOf(Triple(32f, 12f, 3f), Triple(14f, 52f, 3f), Triple(50f, 52f, 3f), Triple(21f, 38f, 2.2f), Triple(43f, 38f, 2.2f)).forEach { (x, y, r) ->
            drawCircle(Palette.GoldSoft, r * s, p(x, y))
        }
    }
}

val ScreenPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 120.dp)
