package com.aidoraa.app

import com.aidoraa.app.data.PlanSummaryDto
import com.aidoraa.app.domain.MANAGE_SUBSCRIPTION_URL
import com.aidoraa.app.domain.Plans
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PlansTest {
    @Test fun fallbackCatalogHasFourPlansWithUsdPrices() {
        val options = Plans.options(emptyList(), emptyMap())
        assertEquals(listOf("free", "basic", "plus", "pro"), options.map { it.id })
        assertEquals(listOf("$0", "$5", "$20", "$60"), options.map { it.displayPrice })
        assertEquals(listOf(null, "basic-monthly", "plus-monthly", "pro-monthly"), options.map { it.basePlanId })
        assertTrue(options.first().isFree)
        assertFalse(options.any { it.priceFromStore })
    }

    @Test fun storePricesWinWhenPresent() {
        val options = Plans.options(Plans.fallbackCatalog.reversed(), mapOf("plus-monthly" to "₹1,700.00", "pro-monthly" to ""))
        val plus = options.first { it.id == "plus" }
        assertEquals("₹1,700.00", plus.displayPrice)
        assertTrue(plus.priceFromStore)
        assertEquals("$60", options.first { it.id == "pro" }.displayPrice)
        assertEquals("free", options.first().id)
    }

    @Test fun planForBasePlan() {
        val options = Plans.options(emptyList(), emptyMap())
        assertEquals("pro", Plans.planForBasePlan(options, "pro-monthly")?.id)
        assertNull(Plans.planForBasePlan(options, null))
    }

    @Test fun formatUsd() {
        assertEquals("$5", Plans.formatUsd(5.0))
        assertEquals("$4.99", Plans.formatUsd(4.99))
        assertEquals("$0.50", Plans.formatUsd(0.5))
    }

    @Test fun ctaLabels() {
        val options = Plans.options(emptyList(), emptyMap())
        val free = PlanSummaryDto(id = "free", status = "none")
        assertEquals("Your current plan", Plans.ctaLabel(free, options[0]))
        assertEquals("Continue", Plans.ctaLabel(free, options[2]))
        val plus = PlanSummaryDto(id = "plus", status = "active", source = "google_play")
        assertEquals("Your current plan", Plans.ctaLabel(plus, options[2]))
        assertEquals("Stay on Free", Plans.ctaLabel(plus, options[0]))
        val expired = PlanSummaryDto(id = "plus", status = "expired", source = "google_play")
        assertEquals("Continue", Plans.ctaLabel(expired, options[2]))
    }

    @Test fun playSubscriptionDetection() {
        assertTrue(Plans.hasPlaySubscription(PlanSummaryDto(id = "basic", status = "in_grace", source = "google_play")))
        assertFalse(Plans.hasPlaySubscription(PlanSummaryDto(id = "basic", status = "active", source = "razorpay")))
        assertFalse(Plans.hasPlaySubscription(PlanSummaryDto(id = "basic", status = "canceled", source = "google_play")))
    }

    @Test fun verifyErrorsArePlain() {
        assertTrue(Plans.verifyErrorMessage("purchase_already_linked", "x").contains("different Aidoraa account"))
        assertTrue(Plans.verifyErrorMessage("store_unavailable", "x").contains("Restore purchases"))
        assertEquals("server said", Plans.verifyErrorMessage("other", "server said"))
        assertTrue(Plans.verifyErrorMessage("other", "").isNotBlank())
    }

    @Test fun manageUrl() {
        assertEquals("https://play.google.com/store/account/subscriptions?sku=aidoraa_membership&package=com.aidoraa.app", MANAGE_SUBSCRIPTION_URL)
    }
}
