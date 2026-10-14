package com.aidoraa.app

import androidx.compose.ui.unit.dp
import com.aidoraa.app.ui.screens.TAB_BAR_SPACE
import com.aidoraa.app.ui.screens.composerOffset
import kotlin.test.Test
import kotlin.test.assertEquals

class LayoutMathTest {
    @Test fun noKeyboardSitsAboveTheTabBar() {
        assertEquals(24.dp + TAB_BAR_SPACE, composerOffset(0.dp, 24.dp, tabBarShown = true))
    }

    @Test fun fullKeyboardSitsAboveTheKeyboard() {
        assertEquals(308.dp, composerOffset(300.dp, 24.dp, tabBarShown = false))
    }

    @Test fun smallKeyboardInsetNeverPutsTheComposerUnderTheTabBar() {
        // A handwriting toolbar or floating keyboard can report a short inset while the tab bar shows.
        assertEquals(24.dp + TAB_BAR_SPACE, composerOffset(40.dp, 24.dp, tabBarShown = true))
        assertEquals(48.dp, composerOffset(40.dp, 24.dp, tabBarShown = false))
    }
}
