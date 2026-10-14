package com.aidoraa.app.domain

import com.aidoraa.app.data.GooglePlayPlanDto
import com.aidoraa.app.data.PlanDto
import com.aidoraa.app.data.PlanSummaryDto

const val PLAY_PRODUCT_ID = "aidoraa_membership"
const val PLAY_PACKAGE = "com.aidoraa.app"
const val MANAGE_SUBSCRIPTION_URL =
    "https://play.google.com/store/account/subscriptions?sku=$PLAY_PRODUCT_ID&package=$PLAY_PACKAGE"

/** One plan as the plans screen shows it. */
data class PlanOption(
    val id: String,
    val name: String,
    val priceUsdMonthly: Double,
    val promise: String,
    val monthlyQuestions: Int,
    val productId: String?,
    val basePlanId: String?,
    /** What to show: Play's local price when known, otherwise the catalog's USD price. */
    val displayPrice: String,
    val priceFromStore: Boolean,
) {
    val isFree: Boolean get() = priceUsdMonthly <= 0.0 || basePlanId == null
}

object Plans {
    val PLAN_ORDER = listOf("free", "basic", "plus", "pro")

    /** The catalog the app falls back to before the server answers. */
    val fallbackCatalog: List<PlanDto> = listOf(
        PlanDto("free", "Free", 0.0, "Try everything and get to know yourself a little better.", 10, null),
        PlanDto("basic", "Basic", 5.0, "Room for a steady habit of checking in with yourself.", 150,
            GooglePlayPlanDto(PLAY_PRODUCT_ID, "basic-monthly")),
        PlanDto("plus", "Plus", 20.0, "Plenty of room to think through work, family and the people around you.", 800,
            GooglePlayPlanDto(PLAY_PRODUCT_ID, "plus-monthly")),
        PlanDto("pro", "Pro", 60.0, "The most room, for daily use and the big decisions.", 3000,
            GooglePlayPlanDto(PLAY_PRODUCT_ID, "pro-monthly")),
    )

    fun formatUsd(amount: Double): String {
        val whole = amount.toLong()
        return if (amount == whole.toDouble()) "$$whole" else {
            val cents = ((amount - whole) * 100 + 0.5).toLong().coerceIn(0, 99)
            "$$whole.${cents.toString().padStart(2, '0')}"
        }
    }

    /** Server catalog plus Play prices (keyed by base plan) into display options, in plan order. */
    fun options(catalog: List<PlanDto>, storePrices: Map<String, String>): List<PlanOption> {
        val source = catalog.ifEmpty { fallbackCatalog }
        return source
            .sortedBy { PLAN_ORDER.indexOf(it.id).let { index -> if (index < 0) Int.MAX_VALUE else index } }
            .map { plan ->
                val basePlan = plan.googlePlay?.basePlanId?.takeIf { it.isNotBlank() }
                val storePrice = basePlan?.let { storePrices[it] }?.takeIf { it.isNotBlank() }
                PlanOption(
                    id = plan.id,
                    name = plan.name.ifBlank { plan.id.replaceFirstChar { it.uppercase() } },
                    priceUsdMonthly = plan.priceUsdMonthly,
                    promise = plan.promise,
                    monthlyQuestions = plan.monthlyQuestions,
                    productId = plan.googlePlay?.productId?.takeIf { it.isNotBlank() },
                    basePlanId = basePlan,
                    displayPrice = storePrice ?: formatUsd(plan.priceUsdMonthly),
                    priceFromStore = storePrice != null,
                )
            }
    }

    /** The plan a base plan sells, if any. */
    fun planForBasePlan(options: List<PlanOption>, basePlanId: String?): PlanOption? =
        options.firstOrNull { basePlanId != null && it.basePlanId == basePlanId }

    /** Whether the person currently pays through Google Play (affects cancel/delete guidance). */
    fun hasPlaySubscription(plan: PlanSummaryDto): Boolean =
        plan.source == "google_play" && plan.status in setOf("active", "in_grace", "on_hold", "paused")

    fun isPaid(plan: PlanSummaryDto): Boolean = plan.id != "free" && plan.status in setOf("active", "in_grace")

    /** The label under the CTA for the selected option relative to the current plan. */
    fun ctaLabel(current: PlanSummaryDto, selected: PlanOption): String = when {
        selected.id == current.id && (selected.isFree || isPaid(current)) -> "Your current plan"
        selected.isFree -> "Stay on Free"
        else -> "Continue"
    }

    /** A plain-language line about usage, such as "12 of 150 questions used this month". */
    fun usageLine(plan: PlanSummaryDto): String =
        if (plan.questionsLimit > 0) "${plan.questionsUsed} of ${plan.questionsLimit} questions used this month" else ""

    /** Plain messages for the verify route's error codes. */
    fun verifyErrorMessage(code: String, fallback: String): String = when (code) {
        "unconfigured" -> "Google Play purchases aren't switched on yet. Please try again later."
        "purchase_account_mismatch" -> "This purchase belongs to a different Aidoraa account. Sign in with that account to use it."
        "purchase_already_linked" -> "This purchase is already linked to a different Aidoraa account."
        "purchase_not_found" -> "Google Play couldn't find this purchase. If you were charged, tap Restore purchases."
        "purchase_not_supported" -> "This purchase isn't an Aidoraa membership."
        "store_unavailable" -> "Google Play couldn't be reached. Your purchase is safe; tap Restore purchases in a moment."
        else -> fallback.ifBlank { "Something went wrong while confirming your purchase. Tap Restore purchases to try again." }
    }
}
