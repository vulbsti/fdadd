package com.aidoraa.app

import com.aidoraa.app.data.PlaceDto
import com.aidoraa.app.state.BirthForm
import com.aidoraa.app.state.OnboardingState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class BirthFormTest {
    private val place = PlaceDto(id = "p", place = "Pune", region = "Maharashtra", country = "India",
        latitude = 18.52, longitude = 73.85, timezone = "Asia/Kolkata")

    @Test fun buildsRequest() {
        val (birth, error) = BirthForm.build(OnboardingState(day = "9", month = "3", year = "1994", time = "7.05", place = place))
        assertNull(error)
        assertEquals("1994-03-09", birth?.date)
        assertEquals("07:05", birth?.time)
        assertEquals("Pune, Maharashtra", birth?.placeName)
    }

    @Test fun unknownTimeUsesNoon() {
        val (birth, _) = BirthForm.build(OnboardingState(day = "1", month = "1", year = "2000", timeUnknown = true, place = place))
        assertEquals("12:00", birth?.time)
        assertEquals("unknown", birth?.timeSource)
    }

    @Test fun rejectsBadInput() {
        assertNotNull(BirthForm.build(OnboardingState(day = "30", month = "2", year = "2000", time = "10:00", place = place)).second)
        assertNotNull(BirthForm.build(OnboardingState(day = "29", month = "2", year = "2001", time = "10:00", place = place)).second)
        assertNotNull(BirthForm.build(OnboardingState(day = "1", month = "1", year = "2000", time = "25:00", place = place)).second)
        assertNotNull(BirthForm.build(OnboardingState(day = "1", month = "1", year = "2000", time = "10:00")).second)
        assertEquals("23:59", BirthForm.normalizeTime("2359"))
    }
}
