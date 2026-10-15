package com.aidoraa.app

import com.aidoraa.app.domain.VersionGate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class VersionGateTest {
    @Test fun parses() {
        assertEquals(Triple(1, 2, 3), VersionGate.parse("1.2.3"))
        assertEquals(Triple(1, 2, 0), VersionGate.parse("v1.2"))
        assertEquals(Triple(2, 0, 1), VersionGate.parse("2.0.1-beta+5"))
        assertNull(VersionGate.parse("one"))
        assertNull(VersionGate.parse(null))
    }

    @Test fun gate() {
        assertFalse(VersionGate.isUpdateRequired("1.0.0", "1.0.0"))
        assertFalse(VersionGate.isUpdateRequired("1.0.0", "0.9.9"))
        assertTrue(VersionGate.isUpdateRequired("1.0.0", "1.0.1"))
        assertTrue(VersionGate.isUpdateRequired("1.9.0", "1.10.0"))
        assertFalse(VersionGate.isUpdateRequired("1.0.0", null))
        assertFalse(VersionGate.isUpdateRequired("1.0.0", "garbage"))
    }

    @Test fun updateResponses() {
        assertTrue(VersionGate.isUpdateResponse(426, null))
        assertTrue(VersionGate.isUpdateResponse(400, "update_required"))
        assertFalse(VersionGate.isUpdateResponse(401, "unauthenticated"))
    }
}
