package com.aidoraa.app.platform

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.acknowledgePurchase
import com.android.billingclient.api.queryProductDetails
import com.android.billingclient.api.queryPurchasesAsync
import com.aidoraa.app.core.BillingGateway
import com.aidoraa.app.core.PurchaseOutcome
import com.aidoraa.app.core.StorePrices
import com.aidoraa.app.core.StorePurchase
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Google Play Billing for the one subscription, aidoraa_membership, with a base plan per paid tier.
 * It only talks to Play: the purchase token goes to the server, which decides the plan.
 */
internal class PlayBilling(context: Context, private val activity: () -> Activity?) : BillingGateway {
    private var pending: CompletableDeferred<PurchaseOutcome>? = null

    private val listener = PurchasesUpdatedListener { result, purchases ->
        val waiting = pending ?: return@PurchasesUpdatedListener
        pending = null
        waiting.complete(outcome(result, purchases))
    }

    private val client = BillingClient.newBuilder(context.applicationContext)
        .setListener(listener)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()

    private val connectLock = Mutex()
    private val details = HashMap<String, ProductDetails>()

    override val available: Boolean get() = true

    private suspend fun connect(): Boolean = connectLock.withLock {
        if (client.isReady) return true
        val done = CompletableDeferred<Boolean>()
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                done.complete(result.responseCode == BillingClient.BillingResponseCode.OK)
            }
            override fun onBillingServiceDisconnected() { done.complete(false) }
        })
        withTimeoutOrNull(15_000) { done.await() } ?: false
    }

    private suspend fun productDetails(productId: String): ProductDetails? {
        details[productId]?.let { return it }
        if (!connect()) return null
        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
        )).build()
        val result = withContext(Dispatchers.IO) { client.queryProductDetails(params) }
        val found = result.productDetailsList?.firstOrNull { it.productId == productId } ?: return null
        details[productId] = found
        return found
    }

    /** The base offer of a base plan (no offer id): what the plan costs every month. */
    private fun baseOffer(product: ProductDetails, basePlanId: String) =
        product.subscriptionOfferDetails?.firstOrNull { it.basePlanId == basePlanId && it.offerId == null }
            ?: product.subscriptionOfferDetails?.firstOrNull { it.basePlanId == basePlanId }

    override suspend fun prices(productId: String): StorePrices {
        val product = productDetails(productId) ?: return StorePrices(emptyMap())
        val prices = product.subscriptionOfferDetails.orEmpty()
            .filter { it.offerId == null }
            .mapNotNull { offer ->
                offer.pricingPhases.pricingPhaseList.lastOrNull()?.formattedPrice?.let { offer.basePlanId to it }
            }.toMap()
        return StorePrices(prices)
    }

    override suspend fun purchase(productId: String, basePlanId: String, accountId: String): PurchaseOutcome {
        val host = activity() ?: return PurchaseOutcome.Failed("Open Aidoraa and try again.")
        if (!connect()) return PurchaseOutcome.Failed("Google Play isn't reachable right now. Please try again.")
        val product = productDetails(productId) ?: return PurchaseOutcome.Failed("This plan isn't available in Google Play yet.")
        val offer = baseOffer(product, basePlanId) ?: return PurchaseOutcome.Failed("This plan isn't available in Google Play yet.")

        // Changing tier: replace the current subscription instead of buying a second one.
        val current = ownedPurchases(productId).firstOrNull { !it.pending }
        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(product)
            .setOfferToken(offer.offerToken)
        if (current != null) {
            productParams.setSubscriptionProductReplacementParams(
                BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.newBuilder()
                    .setOldProductId(current.productId)
                    .setReplacementMode(BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.ReplacementMode.WITH_TIME_PRORATION)
                    .build(),
            )
        }
        val builder = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams.build()))
            .setObfuscatedAccountId(accountId)
        if (current != null) {
            builder.setSubscriptionUpdateParams(
                BillingFlowParams.SubscriptionUpdateParams.newBuilder().setOldPurchaseToken(current.purchaseToken).build(),
            )
        }

        val result = CompletableDeferred<PurchaseOutcome>()
        pending?.complete(PurchaseOutcome.Cancelled)
        pending = result
        val launch = withContext(Dispatchers.Main) { client.launchBillingFlow(host, builder.build()) }
        if (launch.responseCode != BillingClient.BillingResponseCode.OK) {
            pending = null
            return outcome(launch, null)
        }
        return result.await()
    }

    private fun outcome(result: BillingResult, purchases: List<Purchase>?): PurchaseOutcome = when (result.responseCode) {
        BillingClient.BillingResponseCode.OK -> {
            val purchase = purchases?.firstOrNull()
            when {
                purchase == null -> PurchaseOutcome.Failed("Google Play didn't confirm the purchase. Try Restore purchases.")
                purchase.purchaseState == Purchase.PurchaseState.PENDING -> PurchaseOutcome.Pending
                else -> PurchaseOutcome.Purchased(purchase.toStore())
            }
        }
        BillingClient.BillingResponseCode.USER_CANCELED -> PurchaseOutcome.Cancelled
        BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED ->
            PurchaseOutcome.Failed("You already have this membership. Tap Restore purchases to link it.")
        BillingClient.BillingResponseCode.BILLING_UNAVAILABLE, BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE,
        BillingClient.BillingResponseCode.SERVICE_DISCONNECTED, BillingClient.BillingResponseCode.NETWORK_ERROR ->
            PurchaseOutcome.Failed("Google Play isn't reachable right now. Please try again.")
        else -> PurchaseOutcome.Failed("The purchase didn't go through. Please try again.")
    }

    override suspend fun ownedPurchases(productId: String): List<StorePurchase> {
        if (!connect()) return emptyList()
        val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
        val result = withContext(Dispatchers.IO) { client.queryPurchasesAsync(params) }
        return result.purchasesList
            .filter { productId in it.products && it.purchaseState != Purchase.PurchaseState.UNSPECIFIED_STATE }
            .map { it.toStore(productId) }
    }

    override suspend fun acknowledge(purchaseToken: String) {
        if (!connect()) return
        val params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchaseToken).build()
        withContext(Dispatchers.IO) { client.acknowledgePurchase(params) }
    }

    private fun Purchase.toStore(productId: String = products.firstOrNull().orEmpty()) = StorePurchase(
        productId = productId,
        purchaseToken = purchaseToken,
        acknowledged = isAcknowledged,
        pending = purchaseState == Purchase.PurchaseState.PENDING,
    )
}
