package com.aidoraa.app

import com.aidoraa.app.data.ProjectionDto
import com.aidoraa.app.data.ViewNodeDto
import com.aidoraa.app.domain.LifeModelBuilder
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LifeModelTest {
    private val map = ProjectionDto(nodes = listOf(
        ViewNodeDto("c1", "chapter", "Leaving home", dateLabel = "2015 – 2019"),
        ViewNodeDto("c2", "chapter", "The long middle", dateLabel = "2019 – 2025"),
        ViewNodeDto("n1", "current_state", "A building chapter", dateLabel = "Jun 2025 – Feb 2027"),
    ))

    @Test fun nowOnTheArcIsTodaysYearNotTheChapterStart() {
        val arc = LifeModelBuilder.build(map, null, null, null, currentYear = 2026).arc
        assertEquals(listOf(2015, 2019, 2026), arc.map { it.year })
        assertEquals(2026, arc.single { it.isNow }.year)
        assertEquals("A building chapter", arc.last().title)
    }

    @Test fun withoutACurrentChapterTodayIsStillNow() {
        val past = ProjectionDto(nodes = map.nodes.take(2))
        val arc = LifeModelBuilder.build(past, null, null, null, currentYear = 2030).arc
        assertEquals(2030, arc.last().year)
        assertTrue(arc.last().isNow && arc.count { it.isNow } == 1)
    }

    @Test fun noDatedPastAndNoNowMeansNoArc() {
        assertTrue(LifeModelBuilder.build(ProjectionDto(), null, null, null, currentYear = 2026).arc.isEmpty())
    }
}
