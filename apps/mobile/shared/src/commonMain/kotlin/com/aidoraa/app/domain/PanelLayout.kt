package com.aidoraa.app.domain

import com.aidoraa.app.data.PanelSlotDto

enum class PanelSize(val wire: String) {
    Half("half"), Full("full");

    fun toggled(): PanelSize = if (this == Half) Full else Half

    companion object {
        fun fromWire(value: String?): PanelSize = if (value == "full") Full else Half
    }
}

/** The panels Home can show. Ids match the server's home-layout contract. */
enum class PanelId(val wire: String, val title: String, val defaultSize: PanelSize) {
    Knows("knows", "What Aidoraa knows about you", PanelSize.Full),
    Drives("drives", "What drives you", PanelSize.Half),
    Effort("effort", "Where effort pays off", PanelSize.Half),
    Arc("arc", "Your life arc", PanelSize.Full),
    Patterns("patterns", "Patterns", PanelSize.Half),
    People("people", "People", PanelSize.Half),
    Question("question", "A question for you", PanelSize.Full),
    Recent("recent", "Recent conversations", PanelSize.Full);

    companion object {
        fun fromWire(value: String): PanelId? = entries.firstOrNull { it.wire == value }
    }
}

data class PanelSlot(val id: PanelId, val size: PanelSize)

/**
 * Pure operations on the Home layout. Every operation returns a new list and
 * never produces duplicates, unknown panels, or more than [MAX_PANELS] slots.
 */
object PanelLayout {
    const val MAX_PANELS = 20

    val default: List<PanelSlot> = listOf(
        PanelId.Knows, PanelId.Drives, PanelId.Effort, PanelId.Arc,
        PanelId.Question, PanelId.Patterns, PanelId.People, PanelId.Recent,
    ).map { PanelSlot(it, it.defaultSize) }

    /** A stored layout (server or local), cleaned; null or unusable input gives the default. */
    fun fromDto(slots: List<PanelSlotDto>?): List<PanelSlot> {
        if (slots == null) return default
        val seen = mutableSetOf<PanelId>()
        val parsed = slots.mapNotNull { slot ->
            val id = PanelId.fromWire(slot.id) ?: return@mapNotNull null
            if (!seen.add(id)) return@mapNotNull null
            PanelSlot(id, PanelSize.fromWire(slot.size))
        }.take(MAX_PANELS)
        // An explicitly empty layout is a choice (everything hidden); keep it.
        return if (parsed.isEmpty() && slots.isNotEmpty()) default else parsed
    }

    fun toDto(slots: List<PanelSlot>): List<PanelSlotDto> = slots.map { PanelSlotDto(it.id.wire, it.size.wire) }

    fun move(slots: List<PanelSlot>, from: Int, to: Int): List<PanelSlot> {
        if (from !in slots.indices || to !in slots.indices || from == to) return slots
        val result = slots.toMutableList()
        val item = result.removeAt(from)
        result.add(to, item)
        return result
    }

    fun toggleSize(slots: List<PanelSlot>, id: PanelId): List<PanelSlot> =
        slots.map { if (it.id == id) it.copy(size = it.size.toggled()) else it }

    fun hide(slots: List<PanelSlot>, id: PanelId): List<PanelSlot> = slots.filterNot { it.id == id }

    fun add(slots: List<PanelSlot>, id: PanelId): List<PanelSlot> =
        if (slots.any { it.id == id } || slots.size >= MAX_PANELS) slots else slots + PanelSlot(id, id.defaultSize)

    fun hidden(slots: List<PanelSlot>): List<PanelId> = PanelId.entries.filter { id -> slots.none { it.id == id } }

    /**
     * Rows for a two-column grid: a full panel takes a row; half panels pair up
     * in order. A half panel followed by a full one sits alone on its row.
     */
    fun rows(slots: List<PanelSlot>): List<List<PanelSlot>> {
        val rows = mutableListOf<List<PanelSlot>>()
        var pending: PanelSlot? = null
        for (slot in slots) {
            if (slot.size == PanelSize.Full) {
                pending?.let { rows += listOf(it); pending = null }
                rows += listOf(slot)
            } else if (pending == null) {
                pending = slot
            } else {
                rows += listOf(pending, slot)
                pending = null
            }
        }
        pending?.let { rows += listOf(it) }
        return rows
    }

    /** Local storage encoding: "knows:full,drives:half". */
    fun encode(slots: List<PanelSlot>): String = slots.joinToString(",") { "${it.id.wire}:${it.size.wire}" }

    fun decode(value: String?): List<PanelSlot>? {
        if (value == null) return null
        if (value.isEmpty()) return emptyList()
        return fromDto(value.split(',').map { part ->
            val (id, size) = (part.split(':') + "half").take(2)
            PanelSlotDto(id, size)
        })
    }
}
