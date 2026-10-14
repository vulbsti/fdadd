package com.aidoraa.app.core

import kotlinx.coroutines.flow.StateFlow

/** Public build settings. Nothing secret ever lives here. */
data class AppConfig(
    val origin: String,
    val supabaseUrl: String,
    val supabaseKey: String,
    val googleWebClientId: String,
    val appVersion: String,
    val platform: String,
) {
    val signInConfigured: Boolean get() = supabaseKey.isNotBlank() && supabaseUrl.isNotBlank()
    val googleSignInConfigured: Boolean get() = signInConfigured && googleWebClientId.isNotBlank()
}

/** What the device can afford to draw. */
data class DeviceCapabilities(
    /** Live background blur (Android 12+ on a device that is not low on memory). */
    val liveBlur: Boolean,
    /** The person asked for less motion (system setting or animator scale 0). */
    val reduceMotion: Boolean,
)

/** Small persistent key/value storage for caches and preferences (not secret). */
interface KeyValueStore {
    fun get(key: String): String?
    fun put(key: String, value: String?)
    fun clear()
}

/** Encrypted storage for the sign-in session. */
interface SecureStore {
    fun get(key: String): String?
    fun put(key: String, value: String?)
}

/** A file the person picked with the system picker. */
class PickedFile(val name: String, val mimeType: String?, val bytes: ByteArray)

sealed interface GoogleSignInResult {
    data class Success(val idToken: String) : GoogleSignInResult
    data object Cancelled : GoogleSignInResult
    data class Failed(val message: String) : GoogleSignInResult
}

/** A Play subscription purchase as the store reports it. */
data class StorePurchase(
    val productId: String,
    val purchaseToken: String,
    val acknowledged: Boolean,
    val pending: Boolean,
)

sealed interface PurchaseOutcome {
    data class Purchased(val purchase: StorePurchase) : PurchaseOutcome
    data object Pending : PurchaseOutcome
    data object Cancelled : PurchaseOutcome
    data class Failed(val message: String) : PurchaseOutcome
}

/** Store prices for one product, keyed by base plan id, already formatted in local currency. */
data class StorePrices(val formattedByBasePlan: Map<String, String>)

/** Play Billing on Android; a no-op elsewhere until the iOS store is added. */
interface BillingGateway {
    val available: Boolean
    suspend fun prices(productId: String): StorePrices
    suspend fun purchase(productId: String, basePlanId: String, accountId: String): PurchaseOutcome
    suspend fun ownedPurchases(productId: String): List<StorePurchase>
    suspend fun acknowledge(purchaseToken: String)

    /**
     * Receives purchases the store reports outside a purchase() call, for example a
     * pending payment that completes later. Set once at start; lives as long as the app.
     */
    fun setPurchaseListener(listener: (List<StorePurchase>) -> Unit)
}

/** Everything the shared UI asks of the host platform. */
interface PlatformServices {
    val capabilities: StateFlow<DeviceCapabilities>
    val billing: BillingGateway
    val keyValueStore: KeyValueStore
    val secureStore: SecureStore

    /** Opens a web page in an in-app browser tab. */
    fun openInAppBrowser(url: String)

    /** Opens a URL with whatever app handles it (Play Store, mail). */
    fun openExternal(url: String)

    /** Credential Manager sign in with Google. [hashedNonce] is the SHA-256 hex of the raw nonce. */
    suspend fun googleIdToken(hashedNonce: String): GoogleSignInResult

    /** System file picker for export files. Returns an empty list when cancelled. */
    suspend fun pickFiles(mimeTypes: List<String>): List<PickedFile>

    /** System "save as" for a file the person downloads. Returns true when saved. */
    suspend fun saveFile(suggestedName: String, mimeType: String, bytes: ByteArray): Boolean

    /** Builds the ZIP upload for an export the way the website does (text entries only). */
    fun buildImportArchive(files: List<PickedFile>): ByteArray
}
