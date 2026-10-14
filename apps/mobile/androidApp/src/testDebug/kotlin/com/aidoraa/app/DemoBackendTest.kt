package com.aidoraa.app

import com.aidoraa.app.core.AppConfig
import com.aidoraa.app.data.ApiClient
import com.aidoraa.app.data.ChatRequest
import com.aidoraa.app.data.ReportRequest
import com.aidoraa.app.data.RunEventDto
import com.aidoraa.app.data.AppJson
import com.aidoraa.app.domain.LifeModelBuilder
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The sample-data demo runs through the real ApiClient, so it exercises DTO parsing and SSE too. */
class DemoBackendTest {
    private val api = ApiClient(
        AppConfig("https://demo.invalid", "https://demo.invalid/sb", "", "", "1.0.0", "android"),
        accessToken = { "demo" }, onUpdateRequired = {}, engine = DemoBackend().engine(),
    )

    @Test fun bootstrapAndLifeModel() = runBlocking {
        val boot = api.bootstrap()
        assertEquals("Meera Iyer", boot.user.displayName)
        val person = boot.profiles.first().id
        val life = LifeModelBuilder.build(api.view(person, "life-map"), api.view(person, "patterns"), api.view(person, "people"), api.model(person).brief)
        assertEquals("A building chapter", life.current?.title)
        assertEquals(3, life.beliefs.size)
        assertEquals(listOf("Ananya", "Dad", "Ravi"), life.people)
        assertTrue(life.question != null && life.drives.isNotEmpty() && life.arc.size >= 2)
    }

    @Test fun chatStreamsAnAnswer() = runBlocking {
        val session = api.createSession("demo-meera").sessionId
        val run = api.chat(ChatRequest(session, "Should I take the Pune offer?", "c1"))
        val events = mutableListOf<RunEventDto>()
        api.streamRunEvents(run.runId, null) { events += AppJson.decodeFromString(RunEventDto.serializer(), it.data) }
        val text = events.filter { it.event == "answer.delta" }.joinToString("") { it.delta.orEmpty() }
        assertTrue(text.startsWith("You are in a building chapter"))
        assertEquals("run.completed", events.last().event)
        assertEquals(2, api.session(session).messages.size)
        api.report(ReportRequest(sessionId = session, reason = "wrong"))
    }
}
