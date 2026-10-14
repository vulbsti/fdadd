package com.aidoraa.app

import com.aidoraa.app.data.PanelSlotDto
import com.aidoraa.app.domain.PanelId
import com.aidoraa.app.domain.PanelLayout
import com.aidoraa.app.domain.PanelSize
import com.aidoraa.app.domain.PanelSlot
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame
import kotlin.test.assertTrue

class PanelLayoutTest {
    private fun ids(slots: List<PanelSlot>) = slots.map { it.id.wire }

    @Test fun defaultHasEveryPanelOnce() {
        assertEquals(PanelId.entries.toSet(), PanelLayout.default.map { it.id }.toSet())
        assertEquals(PanelLayout.default.size, PanelId.entries.size)
    }

    @Test fun fromDtoDropsUnknownAndDuplicates() {
        val result = PanelLayout.fromDto(listOf(
            PanelSlotDto("drives", "full"), PanelSlotDto("horoscope", "half"),
            PanelSlotDto("drives", "half"), PanelSlotDto("people", "weird"),
        ))
        assertEquals(listOf(PanelSlot(PanelId.Drives, PanelSize.Full), PanelSlot(PanelId.People, PanelSize.Half)), result)
    }

    @Test fun fromDtoNullOrAllInvalidGivesDefault() {
        assertEquals(PanelLayout.default, PanelLayout.fromDto(null))
        assertEquals(PanelLayout.default, PanelLayout.fromDto(listOf(PanelSlotDto("nope", "half"))))
    }

    @Test fun fromDtoKeepsAnEmptyChoice() {
        assertEquals(emptyList(), PanelLayout.fromDto(emptyList()))
    }

    @Test fun moveReorders() {
        val moved = PanelLayout.move(PanelLayout.default, 0, 2)
        assertEquals(listOf("drives", "effort", "knows", "arc"), ids(moved).take(4))
        assertSame(PanelLayout.default, PanelLayout.move(PanelLayout.default, 0, 99))
    }

    @Test fun toggleHideAndAdd() {
        val toggled = PanelLayout.toggleSize(PanelLayout.default, PanelId.Knows)
        assertEquals(PanelSize.Half, toggled.first { it.id == PanelId.Knows }.size)
        val hidden = PanelLayout.hide(toggled, PanelId.People)
        assertEquals(listOf(PanelId.People), PanelLayout.hidden(hidden))
        val added = PanelLayout.add(hidden, PanelId.People)
        assertEquals(PanelId.People, added.last().id)
        assertEquals(PanelSize.Half, added.last().size)
        assertSame(added, PanelLayout.add(added, PanelId.People))
    }

    @Test fun rowsPairHalvesAndKeepFullsAlone() {
        val slots = listOf(
            PanelSlot(PanelId.Drives, PanelSize.Half), PanelSlot(PanelId.Effort, PanelSize.Half),
            PanelSlot(PanelId.Patterns, PanelSize.Half), PanelSlot(PanelId.Arc, PanelSize.Full),
            PanelSlot(PanelId.People, PanelSize.Half),
        )
        val rows = PanelLayout.rows(slots).map { row -> row.map { it.id } }
        assertEquals(listOf(
            listOf(PanelId.Drives, PanelId.Effort), listOf(PanelId.Patterns), listOf(PanelId.Arc), listOf(PanelId.People),
        ), rows)
    }

    @Test fun encodeDecodeRoundTrip() {
        val slots = PanelLayout.toggleSize(PanelLayout.default, PanelId.Arc)
        assertEquals(slots, PanelLayout.decode(PanelLayout.encode(slots)))
        assertEquals(emptyList(), PanelLayout.decode(""))
        assertEquals(null, PanelLayout.decode(null))
    }

    @Test fun toDtoUsesWireNames() {
        val dto = PanelLayout.toDto(listOf(PanelSlot(PanelId.Question, PanelSize.Full)))
        assertEquals(listOf(PanelSlotDto("question", "full")), dto)
        assertTrue(PanelLayout.fromDto(List(30) { PanelSlotDto(PanelId.entries[it % 8].wire, "half") }).size <= PanelLayout.MAX_PANELS)
    }
}
