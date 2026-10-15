package com.aidoraa.app.domain

import com.aidoraa.app.core.localYear
import com.aidoraa.app.data.ProjectionDto
import com.aidoraa.app.data.SessionSummaryDto
import com.aidoraa.app.data.ViewNodeDto
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

enum class Stage { Past, Now, Coming }

/** One stop on the Life map path. */
data class ChapterItem(
    val id: String,
    val period: String?,
    val title: String,
    val summary: String?,
    val details: List<String>,
    val stage: Stage,
    /** "you said" for things the person reported, "likely" for working ideas, else null. */
    val tag: String?,
)

data class Belief(val text: String, val confidence: Float, val label: String)

data class ArcPoint(val year: Int, val title: String, val isNow: Boolean)

/** Everything Home and Life map need, derived from the person's projections. */
data class LifeModel(
    val chapters: List<ChapterItem> = emptyList(),
    val current: ChapterItem? = null,
    val beliefs: List<Belief> = emptyList(),
    val brief: String? = null,
    val drives: List<String> = emptyList(),
    val patterns: List<String> = emptyList(),
    val people: List<String> = emptyList(),
    val question: String? = null,
    val arc: List<ArcPoint> = emptyList(),
    val updating: Boolean = false,
) {
    val isEmpty: Boolean get() = chapters.isEmpty() && beliefs.isEmpty() && brief.isNullOrBlank()
}

private val PAST_KINDS = setOf("episode", "meaning_change", "chapter", "goal")
private val YEAR = Regex("""\b(19\d{2}|20\d{2})\b""")

fun ViewNodeDto.text(key: String): String? =
    (payload[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }

private fun ViewNodeDto.textList(key: String): List<String> =
    (payload[key] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.contentOrNull?.trim() }
        ?.filter { it.isNotEmpty() } ?: emptyList()

private fun tagFor(node: ViewNodeDto): String? = when (node.epistemicClass) {
    "reported" -> "you said"
    "working_hypothesis", "interpretation" -> "likely"
    else -> null
}

private fun confidenceFor(node: ViewNodeDto): Pair<Float, String> = when (node.epistemicClass) {
    "reported" -> 0.85f to "sure"
    "working_hypothesis", "interpretation" -> 0.65f to "likely"
    else -> 0.4f to "checking"
}

/** Extra lines to show when a chapter opens, from the account's own fields. */
private fun detailsFor(node: ViewNodeDto): List<String> {
    val keys = listOf("reportedExperience", "laterMeaning", "whatChanged", "underlyingValue", "presentRelevance",
        "possibleDevelopment", "uncertainty", "unresolvedInterpretation")
    val lines = keys.mapNotNull { node.text(it) } + node.textList("unresolvedQuestions").take(2)
    return lines.distinct().filter { it != node.summary }.take(3)
}

fun yearOf(label: String?): Int? = label?.let { YEAR.find(it)?.value?.toIntOrNull() }

object LifeModelBuilder {
    fun build(
        lifeMap: ProjectionDto?,
        patterns: ProjectionDto?,
        people: ProjectionDto?,
        brief: String?,
        currentYear: Int = localYear(),
    ): LifeModel {
        val nodes = lifeMap?.nodes.orEmpty().filter { it.lifecycle == null || it.lifecycle != "retracted" }
        val past = nodes.filter { it.kind in PAST_KINDS }
        val now = nodes.filter { it.kind == "current_state" }
        val coming = nodes.filter { it.kind == "scenario" }

        fun item(node: ViewNodeDto, stage: Stage) = ChapterItem(
            id = node.id,
            period = node.dateLabel?.takeIf { it.length <= 40 },
            title = node.title.ifBlank { "A chapter still taking shape" },
            summary = node.summary,
            details = detailsFor(node),
            stage = stage,
            tag = tagFor(node),
        )

        val chapters = past.map { item(it, Stage.Past) } + now.take(3).map { item(it, Stage.Now) } +
            coming.take(3).map { item(it, Stage.Coming) }
        val current = chapters.firstOrNull { it.stage == Stage.Now }
            ?: chapters.lastOrNull { it.stage == Stage.Past && past.firstOrNull { p -> p.id == it.id }?.kind == "chapter" }

        val patternNodes = patterns?.nodes.orEmpty().filter { it.kind in setOf("pattern", "issue") }
        val beliefs = patternNodes.take(3).map { node ->
            val (confidence, label) = confidenceFor(node)
            Belief(node.title, confidence, label)
        }

        val drives = nodes.filter { it.kind == "goal" }
            .mapNotNull { it.text("underlyingValue") ?: it.title.takeIf { t -> t.isNotBlank() } }
            .distinct().take(2)

        val question = (nodes + patterns?.nodes.orEmpty())
            .firstOrNull { it.kind == "gap" && it.text("candidateQuestion") != null }
            ?.text("candidateQuestion")

        // The arc runs from the past chapters to today. "Now" is always this year (from the
        // injected clock), never the year the current chapter started.
        val pastPoints = past.mapNotNull { node -> yearOf(node.dateLabel)?.let { ArcPoint(it, node.title, false) } }
            .filter { it.year <= currentYear }
            .sortedBy { it.year }
        val arc = if (pastPoints.isEmpty() && now.isEmpty()) emptyList() else {
            val nowTitle = now.firstOrNull()?.title?.takeIf { it.isNotBlank() } ?: pastPoints.lastOrNull()?.title ?: "Today"
            pastPoints + ArcPoint(currentYear, nowTitle, true)
        }

        return LifeModel(
            chapters = chapters,
            current = current,
            beliefs = beliefs,
            brief = brief?.trim()?.takeIf { it.isNotEmpty() },
            drives = drives,
            patterns = patternNodes.map { it.title }.filter { it.isNotBlank() }.take(3),
            people = people?.nodes.orEmpty().filter { it.kind == "influence" || it.kind == "person" }
                .map { it.title }.filter { it.isNotBlank() }.distinct().take(6),
            question = question,
            arc = arc,
            updating = listOfNotNull(lifeMap, patterns, people).any { it.updateState == "updating" },
        )
    }

    /** Recent conversations for one person, newest first. */
    fun recent(sessions: List<SessionSummaryDto>, personId: String?): List<SessionSummaryDto> =
        sessions.filter { personId == null || it.profileId == null || it.profileId == personId }
            .sortedByDescending { it.updatedAt }
}

/** A JSON object helper for tests and previews. */
fun emptyPayload(): JsonObject = JsonObject(emptyMap())
