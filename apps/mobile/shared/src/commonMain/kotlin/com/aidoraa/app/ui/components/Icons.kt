package com.aidoraa.app.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/** Line icons from the prototype (24 x 24, stroked), tinted at the call site. */
object Icons {
    private fun icon(name: String, stroke: Float, strokes: List<String>, fills: List<String> = emptyList()): ImageVector =
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
            strokes.forEach { addPath(addPathNodes(it), stroke = SolidColor(Color.White), strokeLineWidth = stroke, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) }
            fills.forEach { addPath(addPathNodes(it), fill = SolidColor(Color.White)) }
        }.build()

    val Now: ImageVector by lazy { icon("Now", 1.6f, listOf("M8,12a4,4 0 1,0 8,0a4,4 0 1,0 -8,0", "M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2")) }
    val Map: ImageVector by lazy { icon("Map", 1.6f, listOf("M6 21c0-5 12-4 12-9S6 8 6 3"), listOf("M4.6,3a1.4,1.4 0 1,0 2.8,0a1.4,1.4 0 1,0 -2.8,0", "M10.6,11a1.4,1.4 0 1,0 2.8,0a1.4,1.4 0 1,0 -2.8,0", "M4.6,21a1.4,1.4 0 1,0 2.8,0a1.4,1.4 0 1,0 -2.8,0")) }
    val Ask: ImageVector by lazy { icon("Ask", 1.6f, listOf("M4 5h16v11H9l-5 4z")) }
    val You: ImageVector by lazy { icon("You", 1.6f, listOf("M8,8a4,4 0 1,0 8,0a4,4 0 1,0 -8,0", "M4 21c1-4 4-6 8-6s7 2 8 6")) }
    val Back: ImageVector by lazy { icon("Back", 2.0f, listOf("M15 5l-7 7 7 7")) }
    val Chevron: ImageVector by lazy { icon("Chevron", 2.0f, listOf("M9 5l7 7-7 7")) }
    val Check: ImageVector by lazy { icon("Check", 2.0f, listOf("M4 13l5 5L20 7")) }
    val Close: ImageVector by lazy { icon("Close", 2.2f, listOf("M6 6l12 12M18 6L6 18")) }
    val Resize: ImageVector by lazy { icon("Resize", 2.0f, listOf("M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6")) }
    val Send: ImageVector by lazy { icon("Send", 2.2f, listOf("M5 12h14M13 6l6 6-6 6")) }
    val People: ImageVector by lazy { icon("People", 1.7f, listOf("M5.5,8a3.5,3.5 0 1,0 7.0,0a3.5,3.5 0 1,0 -7.0,0", "M14.5,9a2.5,2.5 0 1,0 5.0,0a2.5,2.5 0 1,0 -5.0,0", "M3 20c.8-3.5 3-5 6-5s5.2 1.5 6 5M15 15c3 0 5 1.5 6 4")) }
    val Import: ImageVector by lazy { icon("Import", 1.7f, listOf("M12 3v12M7 10l5 5 5-5M4 19h16")) }
    val Star: ImageVector by lazy { icon("Star", 1.7f, listOf("M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z")) }
    val Bell: ImageVector by lazy { icon("Bell", 1.7f, listOf("M6 16V11a6 6 0 1112 0v5l2 2H4zM10 21h4")) }
    val Eye: ImageVector by lazy { icon("Eye", 1.7f, listOf("M9,12a3,3 0 1,0 6,0a3,3 0 1,0 -6,0", "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z")) }
    val Lock: ImageVector by lazy { icon("Lock", 1.7f, listOf("M7 10h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2z", "M8 10V7a4 4 0 018 0v3")) }
    val Shield: ImageVector by lazy { icon("Shield", 1.7f, listOf("M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z")) }
    val Help: ImageVector by lazy { icon("Help", 1.7f, listOf("M3,12a9,9 0 1,0 18,0a9,9 0 1,0 -18,0", "M9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.5M12 17h.01")) }
    val Doc: ImageVector by lazy { icon("Doc", 1.7f, listOf("M6 3h8l4 4v14H6z", "M14 3v4h4M9 12h6M9 16h6")) }
    val Trash: ImageVector by lazy { icon("Trash", 1.7f, listOf("M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13")) }
    val Out: ImageVector by lazy { icon("Out", 1.7f, listOf("M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10")) }
    val Plus: ImageVector by lazy { icon("Plus", 2.0f, listOf("M12 5v14M5 12h14")) }
    val List: ImageVector by lazy { icon("List", 1.8f, listOf("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01")) }
    val Edit: ImageVector by lazy { icon("Edit", 1.7f, listOf("M4 20h4L19 9l-4-4L4 16z", "M14 6l4 4")) }
}
