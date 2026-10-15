package com.aidoraa.app.ui.components

import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import com.aidoraa.app.domain.RunStream
import com.aidoraa.app.ui.theme.LocalEffects
import com.aidoraa.app.ui.theme.Palette
import kotlinx.coroutines.delay

/**
 * A small, safe subset of Markdown for answers: headings and **bold** become
 * bold, *italic* becomes italic, list markers become bullets. Links and
 * anything else stay plain text.
 */
fun markdownToAnnotated(text: String, caret: Boolean = false): AnnotatedString = buildAnnotatedString {
    val lines = text.replace("\r\n", "\n").split('\n')
    lines.forEachIndexed { index, rawLine ->
        var line = rawLine
        var heading = false
        Regex("""^\s{0,3}#{1,6}\s+""").find(line)?.let { line = line.substring(it.range.last + 1); heading = true }
        Regex("""^\s*[-*+]\s+""").find(line)?.let { line = "•  " + line.substring(it.range.last + 1) }
        if (heading) withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { appendInline(line) } else appendInline(line)
        if (index < lines.lastIndex) append('\n')
    }
    if (caret) withStyle(SpanStyle(color = Palette.GoldSoft)) { append(" ▍") }
}

private fun AnnotatedString.Builder.appendInline(line: String) {
    var i = 0
    while (i < line.length) {
        when {
            line.startsWith("**", i) -> {
                val end = line.indexOf("**", i + 2)
                if (end > i + 2) { withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(line.substring(i + 2, end)) }; i = end + 2 }
                else { append(line.substring(i + 2)); i = line.length }
            }
            line[i] == '*' && i + 1 < line.length && line[i + 1] != ' ' -> {
                val end = line.indexOf('*', i + 1)
                if (end > i + 1) { withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(line.substring(i + 1, end)) }; i = end + 1 }
                else { append('*'); i++ }
            }
            line[i] == '`' -> i++
            else -> { append(line[i]); i++ }
        }
    }
}

/**
 * Reveals [target] word by word (about 22 words a second, faster when far
 * behind). Keeps its place when [target] grows, so streamed text flows on.
 * With reduced motion the whole text shows at once.
 */
@Composable
fun RevealText(
    target: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    startWords: Int = 0,
    caret: Boolean = false,
    onProgress: (Int) -> Unit = {},
    onDone: () -> Unit = {},
) {
    val reduce = LocalEffects.current.reduceMotion
    var shown by remember { mutableIntStateOf(startWords) }
    val progress by rememberUpdatedState(onProgress)
    val done by rememberUpdatedState(onDone)
    val total = RunStream.wordCount(target)
    LaunchedEffect(target, reduce) {
        if (reduce) { shown = total } else {
            while (shown < total) {
                delay(if (total - shown > 40) 12 else 45)
                shown++
                progress(shown)
            }
        }
        done()
    }
    val visible = if (shown >= total) target else RunStream.revealWords(target, shown)
    T(markdownToAnnotated(visible, caret), style, modifier)
}
