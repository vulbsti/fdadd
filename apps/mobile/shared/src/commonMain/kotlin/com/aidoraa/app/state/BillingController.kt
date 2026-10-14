package com.aidoraa.app.state

import com.aidoraa.app.core.PurchaseOutcome
import com.aidoraa.app.core.StorePurchase
import com.aidoraa.app.data.ApiException
import com.aidoraa.app.data.GoogleVerifyRequest
import com.aidoraa.app.data.PlanDto
import com.aidoraa.app.data.PlansResponseDto
import com.aidoraa.app.domain.PLAY_PRODUCT_ID
import com.aidoraa.app.domain.PlanOption
import com.aidoraa.app.domain.Plans
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class BillingUiState(
    val options: List<PlanOption> = Plans.options(emptyList(), emptyMap()),
    val busy: Boolean = false,
    val message: String? = null,
)

/**
 * Plans and Play purchases. Nothing is ever unlocked here: every purchase
 * token goes to the server, and the plan shown is the one the server returns.
 */
class BillingController(private val app: AppController) {
    private val _state = MutableStateFlow(BillingUiState())
    val state: StateFlow<BillingUiState> = _state.asStateFlow()

    private var catalog: List<PlanDto> = app.cache.read("plans", PlansResponseDto.serializer())?.plans.orEmpty()
    private var prices: Map<String, String> = emptyMap()

    init { rebuild() }

    private fun rebuild() { _state.value = _state.value.copy(options = Plans.options(catalog, prices)) }

    fun loadCatalog() {
        app.scope.launch {
            try {
                val response = app.api.plans()
                app.cache.write("plans", PlansResponseDto.serializer(), response)
                catalog = response.plans
                rebuild()
            } catch (c: CancellationException) { throw c } catch (_: Exception) { }
        }
        loadPrices()
    }

    fun loadPrices() {
        if (!app.platform.billing.available) return
        app.scope.launch {
            try {
                prices = app.platform.billing.prices(PLAY_PRODUCT_ID).formattedByBasePlan
                rebuild()
            } catch (c: CancellationException) { throw c } catch (_: Exception) { }
        }
    }

    fun clearMessage() { _state.value = _state.value.copy(message = null) }

    fun purchase(option: PlanOption) {
        val basePlan = option.basePlanId ?: return
        val productId = option.productId ?: PLAY_PRODUCT_ID
        val userId = app.auth.userId ?: return
        if (!app.platform.billing.available) {
            _state.value = _state.value.copy(message = "Google Play isn't available on this device, so plans can't be bought here.")
            return
        }
        app.scope.launch {
            _state.value = _state.value.copy(busy = true, message = null)
            try {
                when (val outcome = app.platform.billing.purchase(productId, basePlan, userId)) {
                    is PurchaseOutcome.Purchased -> verify(outcome.purchase, basePlan, announce = true)
                    PurchaseOutcome.Pending -> _state.value = _state.value.copy(
                        message = "Your payment is pending. Your plan will change once Google Play confirms it.")
                    PurchaseOutcome.Cancelled -> Unit
                    is PurchaseOutcome.Failed -> _state.value = _state.value.copy(message = outcome.message)
                }
            } finally {
                _state.value = _state.value.copy(busy = false)
            }
        }
    }

    /** Sends every purchase Play knows about to the server again. */
    fun restore() {
        if (!app.platform.billing.available) {
            _state.value = _state.value.copy(message = "Google Play isn't available on this device.")
            return
        }
        app.scope.launch {
            _state.value = _state.value.copy(busy = true, message = null)
            try {
                val owned = app.platform.billing.ownedPurchases(PLAY_PRODUCT_ID).filterNot { it.pending }
                if (owned.isEmpty()) {
                    _state.value = _state.value.copy(message = "No Google Play membership was found for this account.")
                    app.refresh()
                } else {
                    owned.forEach { verify(it, null, announce = false) }
                    if (_state.value.message == null) app.toast("Purchases restored")
                }
            } finally {
                _state.value = _state.value.copy(busy = false)
            }
        }
    }

    private suspend fun verify(purchase: StorePurchase, basePlanId: String?, announce: Boolean) {
        try {
            val result = app.api.verifyGooglePurchase(GoogleVerifyRequest(purchase.productId, basePlanId, purchase.purchaseToken))
            app.updatePlan(result.plan)
            // The server confirms the purchase with Google; acknowledging here too is harmless and
            // keeps Play from refunding it if the server's acknowledgement is delayed.
            if (!purchase.acknowledged) runCatching { app.platform.billing.acknowledge(purchase.purchaseToken) }
            if (announce) app.toast("You're on ${result.plan.name} now")
        } catch (c: CancellationException) { throw c } catch (error: ApiException) {
            _state.value = _state.value.copy(message = Plans.verifyErrorMessage(error.code, error.message))
        } catch (error: Exception) {
            _state.value = _state.value.copy(message = Plans.verifyErrorMessage("", error.message ?: ""))
        }
    }
}
