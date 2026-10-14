package com.aidoraa.app.platform

import android.app.ActivityManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import com.aidoraa.app.core.BillingGateway
import com.aidoraa.app.core.DeviceCapabilities
import com.aidoraa.app.core.GoogleSignInResult
import com.aidoraa.app.core.ImportArchive
import com.aidoraa.app.core.KeyValueStore
import com.aidoraa.app.core.KeystoreSecureStore
import com.aidoraa.app.core.PickedFile
import com.aidoraa.app.core.PlatformServices
import com.aidoraa.app.core.PrefsKeyValueStore
import com.aidoraa.app.core.SecureStore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicInteger

/** Android side of everything the shared UI needs from the device. */
class AndroidPlatformServices(private val context: Context, googleWebClientId: String) : PlatformServices {
    private var activityRef = WeakReference<ComponentActivity>(null)
    private val requestCounter = AtomicInteger()

    fun attach(activity: ComponentActivity) { activityRef = WeakReference(activity) }
    fun detach(activity: ComponentActivity) { if (activityRef.get() === activity) activityRef.clear() }
    internal fun activity(): ComponentActivity? = activityRef.get()

    private val _capabilities = MutableStateFlow(readCapabilities())
    override val capabilities: StateFlow<DeviceCapabilities> = _capabilities.asStateFlow()

    /** Called on resume: the person may have changed "Remove animations" meanwhile. */
    fun refreshCapabilities() { _capabilities.value = readCapabilities() }

    private fun readCapabilities(): DeviceCapabilities {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memory = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        val liveBlur = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            !am.isLowRamDevice && memory.totalMem >= 3L * 1024 * 1024 * 1024
        val animatorScale = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        return DeviceCapabilities(liveBlur = liveBlur, reduceMotion = animatorScale == 0f)
    }

    override val keyValueStore: KeyValueStore = PrefsKeyValueStore(context)
    override val secureStore: SecureStore = KeystoreSecureStore(context)
    override val billing: BillingGateway = PlayBilling(context, ::activity)
    private val googleSignIn = GoogleSignIn(googleWebClientId)

    override fun openInAppBrowser(url: String) {
        val activity = activity() ?: return openExternal(url)
        val colors = CustomTabColorSchemeParams.Builder().setToolbarColor(0xFF0B1222.toInt()).build()
        val intent = CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(colors)
            .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
            .setShowTitle(true)
            .build()
        try { intent.launchUrl(activity, Uri.parse(url)) } catch (_: ActivityNotFoundException) { openExternal(url) }
    }

    override fun openExternal(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        val activity = activity()
        try {
            if (activity != null) activity.startActivity(intent)
            else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) { }
    }

    override suspend fun googleIdToken(hashedNonce: String): GoogleSignInResult {
        val activity = activity() ?: return GoogleSignInResult.Failed("Open Aidoraa and try again.")
        return googleSignIn.request(activity, hashedNonce)
    }

    /** Runs one system activity for a result with a one-off registry entry (no onCreate registration needed). */
    private suspend fun <I, O> launch(contract: ActivityResultContract<I, O>, input: I): O? {
        val activity = activity() ?: return null
        val result = CompletableDeferred<O?>()
        val key = "aidoraa-${requestCounter.incrementAndGet()}"
        val launcher = activity.activityResultRegistry.register(key, contract) { result.complete(it) }
        return try {
            launcher.launch(input)
            result.await()
        } catch (e: ActivityNotFoundException) {
            null
        } finally {
            launcher.unregister()
        }
    }

    override suspend fun pickFiles(mimeTypes: List<String>): List<PickedFile> {
        val uris = launch(ActivityResultContracts.OpenMultipleDocuments(), mimeTypes.toTypedArray()).orEmpty()
        if (uris.isEmpty()) return emptyList()
        return withContext(Dispatchers.IO) {
            uris.take(10).mapNotNull { uri ->
                val resolver = context.contentResolver
                val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) cursor.getString(0) else null
                } ?: uri.lastPathSegment ?: "export"
                val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return@mapNotNull null
                PickedFile(name, resolver.getType(uri), bytes)
            }
        }
    }

    override suspend fun saveFile(suggestedName: String, mimeType: String, bytes: ByteArray): Boolean {
        val uri = launch(ActivityResultContracts.CreateDocument(mimeType), suggestedName) ?: return false
        return withContext(Dispatchers.IO) {
            runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } != null }.getOrDefault(false)
        }
    }

    override fun buildImportArchive(files: List<PickedFile>): ByteArray = ImportArchive.build(files)
}
