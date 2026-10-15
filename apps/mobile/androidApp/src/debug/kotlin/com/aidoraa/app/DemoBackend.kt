package com.aidoraa.app

import com.aidoraa.app.data.AppJson
import com.aidoraa.app.data.AppUserDto
import com.aidoraa.app.data.BirthSetupResponse
import com.aidoraa.app.data.BirthStatusDto
import com.aidoraa.app.data.BootstrapDto
import com.aidoraa.app.data.ChatRequest
import com.aidoraa.app.data.CreatePersonRequest
import com.aidoraa.app.data.CreatePersonResponse
import com.aidoraa.app.data.CreateSessionResponse
import com.aidoraa.app.data.DeleteAccountResponse
import com.aidoraa.app.data.HomeLayoutRequest
import com.aidoraa.app.data.HomeLayoutResponse
import com.aidoraa.app.data.ImportSummaryDto
import com.aidoraa.app.data.ImportsOverviewDto
import com.aidoraa.app.data.MessageDto
import com.aidoraa.app.data.NotionStatusDto
import com.aidoraa.app.data.GoogleStatusDto
import com.aidoraa.app.data.OkResponse
import com.aidoraa.app.data.PanelSlotDto
import com.aidoraa.app.data.PersonDto
import com.aidoraa.app.data.PersonModelDto
import com.aidoraa.app.data.PlaceDto
import com.aidoraa.app.data.PlacesResponse
import com.aidoraa.app.data.PlanSummaryDto
import com.aidoraa.app.data.PlansResponseDto
import com.aidoraa.app.data.ProfilePatchRequest
import com.aidoraa.app.data.ProfilePatchResponse
import com.aidoraa.app.data.ProjectionDto
import com.aidoraa.app.data.RunEventDto
import com.aidoraa.app.data.RunSummaryDto
import com.aidoraa.app.data.SessionDetailDto
import com.aidoraa.app.data.SessionSummaryDto
import com.aidoraa.app.data.SessionsResponse
import com.aidoraa.app.data.StartRunResponse
import com.aidoraa.app.data.ViewNodeDto
import com.aidoraa.app.domain.Plans
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteChannel
import io.ktor.utils.io.writeStringUtf8
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * An in-memory stand-in for the Aidoraa API with the prototype's sample person, Meera.
 * Debug builds only (src/debug), so none of this ships in release. It never touches the network.
 */
internal class DemoBackend {
    private val people = mutableListOf(
        PersonDto("demo-meera", "Meera Iyer", "ready"),
        PersonDto("demo-ananya", "Ananya Iyer", "ready"),
        PersonDto("demo-ravi", "Ravi Menon", "ready"),
    )
    private var displayName: String? = "Meera Iyer"
    private var layout: List<PanelSlotDto>? = null
    private val sessions = LinkedHashMap<String, SessionSummaryDto>()
    private val messages = HashMap<String, MutableList<MessageDto>>()
    private val runs = HashMap<String, Pair<String, String>>() // runId -> sessionId, question
    private val streamScope = CoroutineScope(Dispatchers.Default)

    init {
        addSession("demo-s1", "Should I take the Pune offer?", ago(1, ChronoUnit.DAYS), listOf(
            "user" to "I got an offer from a bigger company in Pune. More money, less ownership. Should I take it?",
            "assistant" to PUNE_ANSWER,
        ))
        addSession("demo-s2", "Why do I lose steam in March?", ago(3, ChronoUnit.DAYS), listOf(
            "user" to "Why do I lose steam in March?",
            "assistant" to "Look at what March usually holds for you: the end of a planning stretch, when the exciting start is over and the dull middle begins. " +
                "Your pattern is to start strong and stall exactly there. It isn't laziness. You work best when progress is visible, so the quiet weeks feel like failure.\n\n" +
                "**Try this:** before March, pick one small thing you can finish and show each week. Visible progress is what keeps you going.",
        ))
    }

    private fun ago(amount: Long, unit: ChronoUnit) = Instant.now().minus(amount, unit).toString()

    private fun addSession(id: String, title: String, at: String, lines: List<Pair<String, String>>) {
        sessions[id] = SessionSummaryDto(id = id, profileId = "demo-meera", profileName = "Meera Iyer", title = title,
            status = "complete", lastMessagePreview = lines.last().second.take(120), updatedAt = at)
        messages[id] = lines.mapIndexed { i, (role, text) -> MessageDto("$id-m$i", role, text, at, if (role == "assistant") "$id-run" else null) }.toMutableList()
    }

    fun engine(): HttpClientEngine = MockEngine { request -> route(request) }

    private val json = headersOf(HttpHeaders.ContentType, "application/json")

    private fun <T> MockRequestHandleScope.ok(serializer: KSerializer<T>, value: T, status: HttpStatusCode = HttpStatusCode.OK): HttpResponseData =
        respond(AppJson.encodeToString(serializer, value), status, json)

    private fun MockRequestHandleScope.error(status: HttpStatusCode, code: String, message: String): HttpResponseData =
        respond("""{"code":"$code","message":"$message"}""", status, json)

    private suspend fun <T> HttpRequestData.read(serializer: KSerializer<T>): T =
        AppJson.decodeFromString(serializer, body.toByteArray().decodeToString())

    private suspend fun MockRequestHandleScope.route(request: HttpRequestData): HttpResponseData {
        delay(150) // feels like a network
        val path = request.url.encodedPath.removeSuffix("/")
        val method = request.method
        val parts = path.split('/').filter { it.isNotEmpty() }
        return when {
            path == "/api/app/v1/bootstrap" -> ok(BootstrapDto.serializer(), bootstrap())
            path == "/api/app/v1/plans" -> ok(PlansResponseDto.serializer(), PlansResponseDto(plans = Plans.fallbackCatalog))
            path == "/api/app/v1/home-layout" -> {
                layout = request.read(HomeLayoutRequest.serializer()).layout
                ok(HomeLayoutResponse.serializer(), HomeLayoutResponse(layout))
            }
            path == "/api/app/v1/profile" -> {
                displayName = request.read(ProfilePatchRequest.serializer()).displayName
                ok(ProfilePatchResponse.serializer(), ProfilePatchResponse(displayName))
            }
            path == "/api/app/v1/account/export" ->
                respond("""{"sample":true,"note":"This is sample data from the demo."}""", HttpStatusCode.OK, json)
            path == "/api/app/v1/account" && method == HttpMethod.Delete ->
                ok(DeleteAccountResponse.serializer(), DeleteAccountResponse(deleted = true, googlePlayRenewalStopped = null))
            path == "/api/app/v1/reports" -> ok(OkResponse.serializer(), OkResponse(true))
            path == "/api/app/v1/billing/google/verify" -> error(HttpStatusCode.ServiceUnavailable, "unconfigured", "Not available with sample data.")
            path.startsWith("/api/app/v1/connectors/") -> error(HttpStatusCode.ServiceUnavailable, "unconfigured", "Not available with sample data.")
            path == "/api/astrologer/places" -> ok(PlacesResponse.serializer(), PlacesResponse(PLACES.filter {
                it.place.contains(request.url.parameters["q"].orEmpty(), ignoreCase = true)
            }))
            path == "/api/astrologer/profiles" && method == HttpMethod.Post -> {
                val name = request.read(CreatePersonRequest.serializer()).name
                val id = "demo-" + UUID.randomUUID().toString().take(8)
                people += PersonDto(id, name, "ready")
                ok(CreatePersonResponse.serializer(), CreatePersonResponse(id))
            }
            parts.size == 5 && parts[2] == "profiles" && parts[4] == "birth" ->
                if (method == HttpMethod.Post) ok(BirthSetupResponse.serializer(), BirthSetupResponse(parts[3], status = "pending"))
                else ok(BirthStatusDto.serializer(), BirthStatusDto(parts[3], "ready", "ready"))
            parts.size == 6 && parts[4] == "views" -> ok(ProjectionDto.serializer(), view(parts[3], parts[5]))
            parts.size == 5 && parts[4] == "model" -> ok(PersonModelDto.serializer(), PersonModelDto(parts[3], "Meera", if (parts[3] == "demo-meera") BRIEF else ""))
            parts.size == 5 && parts[4] == "imports" && method == HttpMethod.Get -> ok(ImportsOverviewDto.serializer(), imports())
            parts.size == 6 && parts[4] == "imports" && method == HttpMethod.Delete -> respond("{}", HttpStatusCode.OK, json)
            path == "/api/astrologer/sessions" && method == HttpMethod.Get ->
                ok(SessionsResponse.serializer(), SessionsResponse(sessions.values.sortedByDescending { it.updatedAt }))
            path == "/api/astrologer/sessions" && method == HttpMethod.Post -> {
                val id = "demo-s" + UUID.randomUUID().toString().take(8)
                sessions[id] = SessionSummaryDto(id = id, profileId = "demo-meera", title = "New conversation", updatedAt = Instant.now().toString())
                messages[id] = mutableListOf()
                ok(CreateSessionResponse.serializer(), CreateSessionResponse(id, "demo-meera"))
            }
            parts.size == 4 && parts[2] == "sessions" -> {
                val id = parts[3]
                val session = sessions[id] ?: return error(HttpStatusCode.NotFound, "not_found", "That conversation could not be found.")
                val active = runs.entries.firstOrNull { it.value.first == id }?.key
                ok(SessionDetailDto.serializer(), SessionDetailDto(session, messages[id].orEmpty().toList(),
                    RunSummaryDto(active ?: "$id-run", "question", if (active != null) "active" else "complete")))
            }
            path == "/api/astrologer/chat" -> chat(request.read(ChatRequest.serializer()))
            parts.size == 5 && parts[2] == "runs" && parts[4] == "events" -> events(parts[3])
            parts.size == 5 && parts[2] == "runs" && parts[4] == "live" -> error(HttpStatusCode.NotFound, "not_found", "No live stream.")
            else -> error(HttpStatusCode.NotFound, "not_found", "That isn't part of the sample data.")
        }
    }

    private fun bootstrap() = BootstrapDto(
        minSupportedVersion = "1.0.0",
        user = AppUserDto(DEMO_USER, "meera@example.com", displayName),
        plan = PlanSummaryDto("plus", "Plus", 20.0, "active", "manual", renewsAt = Instant.now().plus(29, ChronoUnit.DAYS).toString(),
            questionsUsed = 512, questionsLimit = 800, questionsResetAt = Instant.now().plus(29, ChronoUnit.DAYS).toString()),
        profiles = people.toList(),
        homeLayout = layout,
    )

    private fun MockRequestHandleScope.chat(body: ChatRequest): HttpResponseData {
        val list = messages.getOrPut(body.sessionId) { mutableListOf() }
        list += MessageDto(body.clientMessageId, "user", body.message, Instant.now().toString())
        val runId = "demo-run-" + UUID.randomUUID().toString().take(8)
        runs[runId] = body.sessionId to body.message
        sessions[body.sessionId]?.let { s ->
            sessions[body.sessionId] = s.copy(title = if (s.title == "New conversation") body.message.take(60) else s.title, updatedAt = Instant.now().toString())
        }
        return ok(StartRunResponse.serializer(), StartRunResponse(runId, body.clientMessageId, "active", "/api/astrologer/runs/$runId/events"), HttpStatusCode.Accepted)
    }

    /** Streams a canned answer as server-sent events, a few words at a time. */
    private fun MockRequestHandleScope.events(runId: String): HttpResponseData {
        val (sessionId, question) = runs[runId] ?: return respond("", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "text/event-stream"))
        val answer = answerFor(question)
        val channel = ByteChannel(autoFlush = true)
        streamScope.launch {
            var seq = 0L
            fun frame(event: RunEventDto) = "id: ${++seq}\nevent: ${event.event}\ndata: ${AppJson.encodeToString(RunEventDto.serializer(), event)}\n\n"
            try {
                channel.writeStringUtf8(frame(RunEventDto("phase.changed", runId, summary = "Looking at what you've shared")))
                delay(900)
                answer.split(Regex("(?<=\\s)")).chunked(3).forEach { words ->
                    channel.writeStringUtf8(frame(RunEventDto("answer.delta", runId, delta = words.joinToString(""), segment = 0, seq = seq + 1)))
                    delay(110)
                }
                messages[sessionId]?.add(MessageDto("$runId-answer", "assistant", answer, Instant.now().toString(), runId))
                runs.remove(runId)
                channel.writeStringUtf8(frame(RunEventDto("answer.ready", runId)))
                channel.writeStringUtf8(frame(RunEventDto("run.completed", runId, status = "complete")))
            } finally {
                channel.flushAndClose()
            }
        }
        return respond(channel, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "text/event-stream"))
    }

    private fun answerFor(question: String): String {
        val q = question.lowercase()
        return when {
            "pune" in q || "offer" in q || "job" in q -> PUNE_ANSWER
            "march" in q || "steam" in q || "motivat" in q ->
                "You start strong and stall at the dull middle. When work stops showing visible progress, you read it as failure. " +
                    "Pick one small thing you can finish and show each week, and the middle stops feeling endless."
            "talk" in q || "who" in q || "people" in q ->
                "Start with Ananya. You've said she sees you more clearly than anyone, and she has made a similar move herself. " +
                    "Ravi is the right second call for the practical side: what ownership really looks like there."
            else ->
                "This is sample data, so this answer is made up. In the real app, Aidoraa answers from what it knows about your life: " +
                    "the chapter you're in, your patterns, and the people around you."
        }
    }

    private fun imports() = ImportsOverviewDto(
        imports = listOf(
            ImportSummaryDto("demo-i1", "chatgpt", "imported", "chatgpt-export.zip", itemCount = 42, createdAt = ago(12, ChronoUnit.DAYS)),
            ImportSummaryDto("demo-i2", "notion", "imported", "Journal 2023", itemCount = 9, createdAt = ago(30, ChronoUnit.DAYS)),
        ),
        notion = NotionStatusDto(configured = true, connected = true, workspaceName = "Meera's notes"),
        google = GoogleStatusDto(configured = true, connected = false),
    )

    private fun node(id: String, kind: String, title: String, summary: String? = null, date: String? = null,
                     epistemic: String? = null, payload: Map<String, String> = emptyMap()) =
        ViewNodeDto(id, kind, title, summary, date, JsonObject(payload.mapValues { JsonPrimitive(it.value) }), null, epistemic)

    private fun view(personId: String, view: String): ProjectionDto {
        if (personId != "demo-meera") return ProjectionDto(personId = personId, view = view)
        val nodes = when (view) {
            "life-map" -> listOf(
                node("c1", "chapter", "Watching and learning", "A quiet, observant childhood. You learned by copying people you admired.", "1999 – 2008", "reported"),
                node("c2", "chapter", "Testing the walls", "Restless school years, strong friendships, friction with rules. You found writing.", "2008 – 2015", "reported"),
                node("c3", "chapter", "Leaving home", "College and a city move. Confidence grew faster than direction.", "2015 – 2019"),
                node("c4", "chapter", "The long middle", "Hard work with slow visible results. The change of direction came in 2022, with the startup job.", "2019 – 2025", "interpretation"),
                node("g1", "goal", "Build something of my own", date = "2024", payload = mapOf("underlyingValue" to "Making something of your own")),
                node("n1", "current_state", "A building chapter", "Effort turns into results more easily than in the last two years. Things you start now tend to last.", "Jun 2025 – Feb 2027",
                    payload = mapOf("presentRelevance" to "Good for committing to one big thing and one close partnership.")),
                node("f1", "scenario", "Stepping forward", "More visibility and responsibility. Likely your strongest working years so far.", "2027 – 2031"),
                node("q1", "gap", "A move in 2019", payload = mapOf("candidateQuestion" to "In 2019, did a move or a new job change your direction?")),
            )
            "patterns" -> listOf(
                node("p1", "pattern", "Thinks best when building, not planning", epistemic = "reported"),
                node("p2", "pattern", "Restless when work has no visible progress", epistemic = "interpretation"),
                node("p3", "pattern", "Close to an older sibling, more than parents"),
                node("p4", "pattern", "Starts strong, stalls at the dull middle", epistemic = "reported"),
            )
            "people" -> listOf(
                node("pe1", "influence", "Ananya"), node("pe2", "influence", "Dad"), node("pe3", "influence", "Ravi"),
            )
            else -> emptyList()
        }
        return ProjectionDto(personId = personId, view = view, nodes = nodes)
    }

    companion object {
        const val DEMO_USER = com.aidoraa.app.state.DEMO_USER_ID

        const val PUNE_ANSWER =
            "You are in a building chapter, and you do your best work when something is yours. The last time you chose safety over ownership, " +
                "in 2019, you felt stuck within a year. So the money is real, but ask what you would own there. If the answer is nothing for two years, " +
                "it likely costs you more than it pays."

        const val BRIEF =
            "Meera, 27, born in Kochi. Thinks best by building. Restless when progress isn't visible. In a building chapter until early 2027."

        val PLACES = listOf(
            PlaceDto("pl1", "Kochi", "Kerala", "India", 9.93, 76.27, "Asia/Kolkata"),
            PlaceDto("pl2", "Pune", "Maharashtra", "India", 18.52, 73.86, "Asia/Kolkata"),
            PlaceDto("pl3", "Bengaluru", "Karnataka", "India", 12.97, 77.59, "Asia/Kolkata"),
            PlaceDto("pl4", "London", "England", "United Kingdom", 51.51, -0.13, "Europe/London"),
        )
    }
}
