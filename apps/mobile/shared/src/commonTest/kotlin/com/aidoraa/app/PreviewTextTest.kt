package com.aidoraa.app

import com.aidoraa.app.ui.screens.plainPreview
import kotlin.test.Test
import kotlin.test.assertEquals

class PreviewTextTest {
    @Test
    fun dropsMarkdownSymbols() {
        assertEquals("The headline Focus on one thing", plainPreview("## The headline\n\n**Focus** on one thing"))
    }

    @Test
    fun handlesBoldCutOffByTheServer() {
        assertEquals("the bottleneck is execution", plainPreview("**the bottleneck is execution"))
    }

    @Test
    fun keepsItShort() {
        assertEquals(80, plainPreview("word ".repeat(40)).length)
    }
}
