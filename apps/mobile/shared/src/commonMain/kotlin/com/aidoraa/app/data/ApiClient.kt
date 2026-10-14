package com.aidoraa.app.data

import com.aidoraa.app.core.AppConfig
import com.aidoraa.app.domain.VersionGate
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.timeout
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.prepareGet
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsChannel
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import io.ktor.http.encodeURLPathPart
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import io.ktor.utils.io.readLine
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json

/** A failed API call, with the server's `{code, message}`. */
class ApiException(val status: Int, val code: String, override val message: String) : Exception(message) {
    val isUnauthenticated: Boolean get() = status == 401
    val isQuotaExceeded: Boolean get() = status == 429 || code == "quota_exceeded"
    val isNetwork: Boolean get() = status == 0
}

/** Thrown after the update screen has been triggered; callers simply stop. */
class UpdateRequiredException(message: String) : Exception(message)

val AppJson: Json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    explicitNulls = false
    encodeDefaults = true
    isLenient = true
}

expect fun createPlatformHttpClient(block: io.ktor.client.HttpClientConfig<*>.() -> Unit): HttpClient

/**
 * Talks to the Aidoraa web API. Every request carries the Supabase access
 * token and the app's version and platform; a 426 flips the whole app to the
 * update screen.
 */
class ApiClient(
    private val config: AppConfig,
    private val accessToken: suspend (forceRefresh: Boolean) -> String?,
    private val onUpdateRequired: (message: String) -> Unit,
) {
    val http: HttpClient = createPlatformHttpClient {
        expectSuccess = false
        install(ContentNegotiation) { json(AppJson) }
        install(HttpTimeout) {
            connectTimeoutMillis = 15_000
            requestTimeoutMillis = 60_000
            socketTimeoutMillis = 60_000
        }
    }

    private fun url(path: String) = if (path.startsWith("http")) path else config.origin.trimEnd('/') + path

    private fun HttpRequestBuilder.appHeaders(token: String?) {
        header("X-Aidoraa-App-Version", config.appVersion)
        header("X-Aidoraa-Platform", config.platform)
        if (token != null) header(HttpHeaders.Authorization, "Bearer $token")
    }

    suspend fun raw(
        method: HttpMethod,
        path: String,
        body: Any? = null,
        authenticated: Boolean = true,
        configure: HttpRequestBuilder.() -> Unit = {},
    ): HttpResponse {
        suspend fun attempt(forceRefresh: Boolean): HttpResponse {
            val token = if (authenticated) accessToken(forceRefresh) else null
            return try {
                http.request(url(path)) {
                    this.method = method
                    appHeaders(token)
                    if (body != null) {
                        contentType(ContentType.Application.Json)
                        setBody(body)
                    }
                    configure()
                }
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (error: Throwable) {
                throw ApiException(0, "network", "We couldn't reach Aidoraa. Check your connection and try again.")
            }
        }
        var response = attempt(false)
        if (response.status.value == 401 && authenticated) response = attempt(true)
        if (!response.status.isSuccess()) throw failure(response)
        return response
    }

    private suspend fun failure(response: HttpResponse): Exception {
        val status = response.status.value
        val parsed = runCatching { AppJson.decodeFromString(ApiErrorBody.serializer(), response.bodyAsText()) }.getOrNull()
        if (VersionGate.isUpdateResponse(status, parsed?.code)) {
            val message = parsed?.message?.takeIf { it.isNotBlank() }
                ?: "A newer version of Aidoraa is available. Please update the app to keep going."
            onUpdateRequired(message)
            return UpdateRequiredException(message)
        }
        val message = parsed?.message?.takeIf { it.isNotBlank() } ?: when (status) {
            401 -> "Please sign in again."
            404 -> "That could not be found."
            in 500..599 -> "Aidoraa is having trouble right now. Please try again in a moment."
            else -> "Something went wrong. Please try again."
        }
        return ApiException(status, parsed?.code ?: "http_$status", message)
    }

    suspend inline fun <reified T> get(path: String, authenticated: Boolean = true, noinline configure: HttpRequestBuilder.() -> Unit = {}): T =
        raw(HttpMethod.Get, path, null, authenticated, configure).body()

    suspend inline fun <reified T> post(path: String, body: Any? = null): T = raw(HttpMethod.Post, path, body).body()
    suspend inline fun <reified T> put(path: String, body: Any? = null): T = raw(HttpMethod.Put, path, body).body()
    suspend inline fun <reified T> patch(path: String, body: Any? = null): T = raw(HttpMethod.Patch, path, body).body()
    suspend inline fun <reified T> delete(path: String, body: Any? = null): T = raw(HttpMethod.Delete, path, body).body()

    // -- app v1 -------------------------------------------------------------

    suspend fun bootstrap(): BootstrapDto = get("/api/app/v1/bootstrap")
    suspend fun plans(): PlansResponseDto = get("/api/app/v1/plans", authenticated = false)
    suspend fun saveHomeLayout(layout: List<PanelSlotDto>?): HomeLayoutResponse = put("/api/app/v1/home-layout", HomeLayoutRequest(layout))
    suspend fun updateProfile(displayName: String?): ProfilePatchResponse = patch("/api/app/v1/profile", ProfilePatchRequest(displayName))
    suspend fun verifyGooglePurchase(request: GoogleVerifyRequest): PlanEnvelopeDto = post("/api/app/v1/billing/google/verify", request)
    suspend fun exportAccount(): ByteArray = raw(HttpMethod.Get, "/api/app/v1/account/export").readRawBytes()
    suspend fun deleteAccount(): DeleteAccountResponse = delete("/api/app/v1/account", DeleteAccountRequest())

    // -- people and projections ----------------------------------------------

    suspend fun createPerson(name: String, idempotencyKey: String): CreatePersonResponse =
        post("/api/astrologer/profiles", CreatePersonRequest(name, idempotencyKey))

    suspend fun setBirth(personId: String, request: BirthSetupRequest): BirthSetupResponse =
        post("/api/astrologer/profiles/${personId.seg()}/birth", request)

    suspend fun birthStatus(personId: String): BirthStatusDto = get("/api/astrologer/profiles/${personId.seg()}/birth")

    suspend fun places(query: String): List<PlaceDto> =
        get<PlacesResponse>("/api/astrologer/places") { parameter("q", query) }.places

    suspend fun view(personId: String, view: String): ProjectionDto =
        get("/api/astrologer/profiles/${personId.seg()}/views/${view.seg()}")

    suspend fun model(personId: String): PersonModelDto = get("/api/astrologer/profiles/${personId.seg()}/model")

    // -- conversations ---------------------------------------------------------

    suspend fun sessions(): List<SessionSummaryDto> = get<SessionsResponse>("/api/astrologer/sessions").sessions
    suspend fun createSession(personId: String): CreateSessionResponse = post("/api/astrologer/sessions", CreateSessionRequest(profileId = personId))
    suspend fun session(sessionId: String): SessionDetailDto = get("/api/astrologer/sessions/${sessionId.seg()}")
    suspend fun chat(request: ChatRequest): StartRunResponse = post("/api/astrologer/chat", request)
    suspend fun resume(runId: String, clientRequestId: String): StartRunResponse =
        post("/api/astrologer/runs/${runId.seg()}/resume", ResumeRequest(clientRequestId))
    suspend fun liveLocation(runId: String): LiveLocationDto = get("/api/astrologer/runs/${runId.seg()}/live")

    /**
     * Reads a run's server-sent events until the stream ends. [after] resumes
     * from a cursor like Last-Event-ID. Returns the last event id seen.
     */
    suspend fun streamRunEvents(runId: String, after: String?, onEvent: (SseEvent) -> Unit): String? {
        val token = accessToken(false)
        val parser = SseParser()
        http.prepareGet(url("/api/astrologer/runs/${runId.seg()}/events")) {
            appHeaders(token)
            header(HttpHeaders.Accept, "text/event-stream")
            if (after != null) header("Last-Event-ID", after)
            timeout { requestTimeoutMillis = 330_000; socketTimeoutMillis = 120_000 }
        }.execute { response ->
            if (!response.status.isSuccess()) throw failure(response)
            readLines(response) { line -> parser.feed(line + "\n").forEach(onEvent) }
        }
        return parser.lastEventId
    }

    /** Reads the edge's live text stream (when the server has one) for word-by-word text. */
    suspend fun streamLiveText(location: LiveLocationDto, after: Long, onFrame: (LiveFrameDto) -> Unit) {
        val parser = SseParser()
        http.prepareGet("${location.url}?after=$after") {
            header(HttpHeaders.Authorization, "Bearer ${location.token}")
            header(HttpHeaders.Accept, "text/event-stream")
            timeout { requestTimeoutMillis = 330_000; socketTimeoutMillis = 120_000 }
        }.execute { response ->
            if (!response.status.isSuccess()) return@execute
            readLines(response) { line ->
                parser.feed(line + "\n").forEach { event ->
                    runCatching { AppJson.decodeFromString(LiveFrameDto.serializer(), event.data) }.getOrNull()?.let(onFrame)
                }
            }
        }
    }

    private suspend fun readLines(response: HttpResponse, onLine: (String) -> Unit) {
        val channel = response.bodyAsChannel()
        while (true) {
            val line = channel.readLine() ?: break
            onLine(line)
        }
    }

    // -- imports -------------------------------------------------------------

    private fun importsBase(personId: String) = "/api/astrologer/profiles/${personId.seg()}/imports"

    suspend fun imports(personId: String): ImportsOverviewDto = get(importsBase(personId))
    suspend fun createImport(personId: String, provider: String, fileName: String): UploadTargetDto =
        post(importsBase(personId), CreateImportRequest(provider, fileName))
    suspend fun parseImport(personId: String, importId: String): ImportDetailDto = post("${importsBase(personId)}/${importId.seg()}/parse")
    suspend fun confirmImport(personId: String, importId: String, itemIds: List<String>, personSpeaker: String?): ConfirmImportResponse =
        post("${importsBase(personId)}/${importId.seg()}/confirm", ConfirmImportRequest(itemIds, personSpeaker))
    suspend fun importDetail(personId: String, importId: String): ImportDetailDto = get("${importsBase(personId)}/${importId.seg()}")
    suspend fun deleteImport(personId: String, importId: String) { raw(HttpMethod.Delete, "${importsBase(personId)}/${importId.seg()}") }
    suspend fun notionPages(personId: String, cursor: String?): NotionPagesDto =
        get("${importsBase(personId)}/notion/pages") { if (cursor != null) parameter("cursor", cursor) }
    suspend fun importNotionPages(personId: String, importId: String?, pageIds: List<String>): NotionImportResponse =
        post("${importsBase(personId)}/notion", NotionImportRequest(importId, pageIds))
    suspend fun disconnect(service: String) { raw(HttpMethod.Delete, "/api/connectors/${service.seg()}") }

    fun connectorStartUrl(service: String, personId: String): String =
        url("/api/connectors/${service.seg()}/start?personId=${personId.seg()}&return=app")

    /** Uploads the export ZIP straight to private storage with the one-time signed upload token. */
    suspend fun uploadToSignedUrl(target: UploadTargetDto, bytes: ByteArray) {
        val token = accessToken(false)
        val path = target.path.split('/').filter { it.isNotEmpty() }.joinToString("/") { it.encodeURLPathPart() }
        val response = try {
            http.request("${config.supabaseUrl.trimEnd('/')}/storage/v1/object/upload/sign/${target.bucket.seg()}/$path") {
                method = HttpMethod.Put
                parameter("token", target.token)
                header("apikey", config.supabaseKey)
                if (token != null) header(HttpHeaders.Authorization, "Bearer $token")
                header("x-upsert", "false")
                header(HttpHeaders.CacheControl, "max-age=3600")
                contentType(ContentType.parse("application/zip"))
                setBody(bytes)
                timeout { requestTimeoutMillis = 600_000; socketTimeoutMillis = 120_000 }
            }
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (error: Throwable) {
            throw ApiException(0, "network", "The upload didn't finish. Check your connection and try again.")
        }
        if (!response.status.isSuccess()) {
            throw ApiException(response.status.value, "upload_failed", "The file couldn't be uploaded. Please try again.")
        }
    }

    private fun String.seg(): String = encodeURLPathPart()
}
