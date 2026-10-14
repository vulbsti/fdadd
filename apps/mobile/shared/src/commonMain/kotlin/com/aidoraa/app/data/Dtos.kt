package com.aidoraa.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/*
 * Every request and response shape the app uses, in one place so the server
 * contract is easy to adjust. Parsing ignores unknown keys and every field has
 * a tolerant default, so a server that adds or omits a field never breaks a screen.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

@Serializable
data class ApiErrorBody(
    val code: String = "internal",
    val message: String = "",
    val minSupportedVersion: String? = null,
)

// ---------------------------------------------------------------------------
// /api/app/v1
// ---------------------------------------------------------------------------

@Serializable
data class BootstrapDto(
    val minSupportedVersion: String = "1.0.0",
    val user: AppUserDto = AppUserDto(),
    val plan: PlanSummaryDto = PlanSummaryDto(),
    val profiles: List<PersonDto> = emptyList(),
    val homeLayout: List<PanelSlotDto>? = null,
    val flags: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class AppUserDto(
    val id: String = "",
    val email: String? = null,
    val displayName: String? = null,
    val avatarUrl: String? = null,
)

@Serializable
data class PlanSummaryDto(
    val id: String = "free",
    val name: String = "Free",
    val priceUsdMonthly: Double = 0.0,
    /** active | in_grace | on_hold | paused | canceled | expired | none */
    val status: String = "none",
    /** google_play | razorpay | manual | null */
    val source: String? = null,
    val renewsAt: String? = null,
    val questionsUsed: Int = 0,
    val questionsLimit: Int = 0,
    val periodEnd: String? = null,
    val questionsResetAt: String? = null,
)

@Serializable
data class PersonDto(
    val id: String = "",
    val name: String = "",
    val astroStatus: String? = null,
)

@Serializable
data class PanelSlotDto(
    val id: String = "",
    /** half | full */
    val size: String = "half",
)

@Serializable
data class PlansResponseDto(
    val currency: String = "USD",
    val billingPeriod: String = "monthly",
    val plans: List<PlanDto> = emptyList(),
)

@Serializable
data class PlanDto(
    val id: String = "free",
    val name: String = "",
    val priceUsdMonthly: Double = 0.0,
    val promise: String = "",
    val monthlyQuestions: Int = 0,
    val googlePlay: GooglePlayPlanDto? = null,
)

@Serializable
data class GooglePlayPlanDto(
    val productId: String = "",
    val basePlanId: String = "",
)

@Serializable
data class HomeLayoutRequest(val layout: List<PanelSlotDto>?)

@Serializable
data class HomeLayoutResponse(val homeLayout: List<PanelSlotDto>? = null)

@Serializable
data class ProfilePatchRequest(val displayName: String?)

@Serializable
data class ProfilePatchResponse(val displayName: String? = null, val avatarUrl: String? = null)

@Serializable
data class GoogleVerifyRequest(
    val productId: String,
    val basePlanId: String? = null,
    val purchaseToken: String,
)

@Serializable
data class PlanEnvelopeDto(val plan: PlanSummaryDto = PlanSummaryDto())

@Serializable
data class DeleteAccountRequest(val confirm: String = "DELETE")

@Serializable
data class DeleteAccountResponse(
    val deleted: Boolean = false,
    val pendingCleanup: List<String> = emptyList(),
    val googlePlayRenewalStopped: Boolean? = null,
)

// ---------------------------------------------------------------------------
// /api/astrologer: people, projections, sessions, chat
// ---------------------------------------------------------------------------

@Serializable
data class CreatePersonRequest(val name: String, val idempotencyKey: String)

@Serializable
data class CreatePersonResponse(val profileId: String? = null, val replayed: Boolean = false)

@Serializable
data class BirthDto(
    val date: String,
    val time: String,
    val latitude: Double,
    val longitude: Double,
    val timezone: String,
    @SerialName("place_name") val placeName: String? = null,
    @SerialName("time_source") val timeSource: String? = null,
    @SerialName("time_confidence") val timeConfidence: String? = null,
)

@Serializable
data class BirthSetupRequest(val clientRequestId: String, val birth: BirthDto)

@Serializable
data class BirthSetupResponse(
    val profileId: String? = null,
    val sessionId: String? = null,
    val runId: String? = null,
    val status: String? = null,
)

@Serializable
data class BirthStatusDto(
    val profileId: String? = null,
    /** pending | ready | failed | none, as the profile reports it */
    val status: String? = null,
    val initializationStatus: String? = null,
    val error: String? = null,
)

@Serializable
data class PlaceDto(
    val id: String = "",
    val place: String = "",
    val region: String? = null,
    val country: String? = null,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val timezone: String = "",
)

@Serializable
data class PlacesResponse(val places: List<PlaceDto> = emptyList())

@Serializable
data class ProjectionDto(
    val personId: String = "",
    val personRevision: Int = 0,
    val mode: String = "personal",
    val generatedAt: String? = null,
    /** current | updating | failed */
    val updateState: String = "current",
    val view: String = "",
    val title: String = "",
    val subtitle: String? = null,
    val nodes: List<ViewNodeDto> = emptyList(),
    val edges: List<ViewEdgeDto> = emptyList(),
)

@Serializable
data class ViewNodeDto(
    val id: String = "",
    val kind: String = "",
    val title: String = "",
    val summary: String? = null,
    val dateLabel: String? = null,
    val payload: JsonObject = JsonObject(emptyMap()),
    val lifecycle: String? = null,
    val epistemicClass: String? = null,
)

@Serializable
data class ViewEdgeDto(
    val id: String = "",
    val kind: String = "",
    val fromId: String = "",
    val toId: String = "",
    val label: String? = null,
)

@Serializable
data class PersonModelDto(
    val personId: String = "",
    val name: String = "",
    val brief: String = "",
    val updateState: String = "current",
    val generatedAt: String? = null,
)

@Serializable
data class SessionsResponse(val sessions: List<SessionSummaryDto> = emptyList())

@Serializable
data class SessionSummaryDto(
    val id: String = "",
    val profileId: String? = null,
    val profileName: String? = null,
    val title: String = "",
    val status: String = "complete",
    val currentQuestion: FocusedQuestionDto? = null,
    val nextAction: String? = null,
    val lastMessagePreview: String? = null,
    val latestRun: RunSummaryDto? = null,
    val updatedAt: String = "",
)

@Serializable
data class FocusedQuestionDto(
    val id: String = "",
    val prompt: String = "",
    val responseKind: String = "free_text",
    val options: List<FocusedOptionDto> = emptyList(),
    val allowFreeText: Boolean = true,
)

@Serializable
data class FocusedOptionDto(val id: String = "", val label: String = "", val kind: String = "answer")

@Serializable
data class RunSummaryDto(
    val id: String = "",
    /** intake | question */
    val kind: String = "question",
    /** active | waiting_for_user | complete | failed */
    val status: String = "complete",
    val phase: String? = null,
    val resumable: Boolean = false,
)

@Serializable
data class MessageDto(
    val id: String = "",
    val role: String = "assistant",
    val content: String = "",
    val createdAt: String = "",
    val runId: String? = null,
)

@Serializable
data class SessionDetailDto(
    val session: SessionSummaryDto = SessionSummaryDto(),
    val messages: List<MessageDto> = emptyList(),
    val latestRun: RunSummaryDto? = null,
    val nextCursor: String? = null,
)

@Serializable
data class CreateSessionRequest(val mode: String = "existing_profile", val profileId: String)

@Serializable
data class CreateSessionResponse(val sessionId: String = "", val profileId: String? = null)

@Serializable
data class ChatRequest(
    val sessionId: String,
    val message: String,
    val clientMessageId: String,
    val answerToQuestionId: String? = null,
)

@Serializable
data class StartRunResponse(
    val runId: String = "",
    val messageId: String? = null,
    val status: String = "active",
    val eventsUrl: String = "",
    val replayed: Boolean = false,
)

@Serializable
data class ResumeRequest(val clientRequestId: String)

/** One server-sent event of a run (the events route), or a live text frame mapped onto it. */
@Serializable
data class RunEventDto(
    val event: String = "",
    val runId: String = "",
    val phase: String? = null,
    val tool: String? = null,
    val summary: String? = null,
    val status: String? = null,
    val delta: String? = null,
    val segment: Int? = null,
    val seq: Long? = null,
    val question: JsonElement? = null,
    val error: RunErrorDto? = null,
)

@Serializable
data class RunErrorDto(val code: String = "internal", val message: String = "", val resumable: Boolean = false)

@Serializable
data class LiveLocationDto(val url: String = "", val token: String = "")

/** A frame of the edge live stream. */
@Serializable
data class LiveFrameDto(val seq: Long? = null, val kind: String? = null, val segment: Int? = null, val text: String? = null)

// ---------------------------------------------------------------------------
// Imports and connectors
// ---------------------------------------------------------------------------

@Serializable
data class ImportsOverviewDto(
    val imports: List<ImportSummaryDto> = emptyList(),
    val notion: NotionStatusDto = NotionStatusDto(),
    val google: GoogleStatusDto = GoogleStatusDto(),
)

@Serializable
data class NotionStatusDto(val configured: Boolean = false, val connected: Boolean = false, val workspaceName: String? = null)

@Serializable
data class GoogleStatusDto(val configured: Boolean = false, val connected: Boolean = false, val email: String? = null)

@Serializable
data class ImportSummaryDto(
    val id: String = "",
    val provider: String = "other",
    val status: String = "",
    val fileName: String? = null,
    val format: String? = null,
    val warnings: List<String> = emptyList(),
    val error: String? = null,
    val createdAt: String = "",
    val importedAt: String? = null,
    val itemCount: Int = 0,
)

@Serializable
data class CreateImportRequest(val provider: String, val fileName: String)

@Serializable
data class UploadTargetDto(val importId: String = "", val bucket: String = "", val path: String = "", val token: String = "")

@Serializable
data class ImportDetailDto(
    val import: ImportSummaryDto = ImportSummaryDto(),
    val personSpeaker: String? = null,
    val speakers: List<String> = emptyList(),
    val items: List<ImportItemDto> = emptyList(),
)

@Serializable
data class ImportItemDto(
    val id: String = "",
    val kind: String = "conversation",
    val title: String = "",
    val messageCount: Int = 0,
    val speakers: List<String> = emptyList(),
    val duplicateState: String? = null,
    val status: String = "",
)

@Serializable
data class ConfirmImportRequest(val itemIds: List<String>, val personSpeaker: String?)

@Serializable
data class ConfirmImportResponse(val importId: String = "", val imported: Int = 0)

@Serializable
data class NotionPagesDto(val pages: List<NotionPageDto> = emptyList(), val nextCursor: String? = null)

@Serializable
data class NotionPageDto(val id: String = "", val title: String = "", val url: String? = null, val lastEditedAt: String? = null)

@Serializable
data class NotionImportRequest(val importId: String?, val pageIds: List<String>)

@Serializable
data class NotionImportResponse(val importId: String = "", val skipped: List<String> = emptyList())
