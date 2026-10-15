package com.aidoraa.app

import com.aidoraa.app.core.AppConfig
import com.aidoraa.app.core.BillingGateway
import com.aidoraa.app.core.DeviceCapabilities
import com.aidoraa.app.core.GoogleSignInResult
import com.aidoraa.app.core.KeyValueStore
import com.aidoraa.app.core.PickedFile
import com.aidoraa.app.core.PlatformServices
import com.aidoraa.app.core.PurchaseOutcome
import com.aidoraa.app.core.SecureStore
import com.aidoraa.app.core.StorePrices
import com.aidoraa.app.core.StorePurchase
import com.aidoraa.app.state.AppController
import com.aidoraa.app.state.Route
import com.aidoraa.app.state.Tab
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private class MemoryStore : KeyValueStore, SecureStore {
    val map = HashMap<String, String>()
    override fun get(key: String) = map[key]
    override fun put(key: String, value: String?) { if (value == null) map.remove(key) else map[key] = value }
    override fun clear() = map.clear()
}

private class FakePlatform : PlatformServices {
    override val capabilities = MutableStateFlow(DeviceCapabilities(liveBlur = false, reduceMotion = true))
    override val billing = object : BillingGateway {
        override val available = false
        override suspend fun prices(productId: String) = StorePrices(emptyMap())
        override suspend fun purchase(productId: String, basePlanId: String, accountId: String) = PurchaseOutcome.Cancelled
        override suspend fun ownedPurchases(productId: String) = emptyList<StorePurchase>()
        override suspend fun acknowledge(purchaseToken: String) {}
        override fun setPurchaseListener(listener: (List<StorePurchase>) -> Unit) {}
    }
    override val keyValueStore = MemoryStore()
    override val secureStore = MemoryStore()
    override fun openInAppBrowser(url: String) {}
    override fun openExternal(url: String) {}
    override suspend fun googleIdToken(hashedNonce: String) = GoogleSignInResult.Cancelled
    override suspend fun pickFiles(mimeTypes: List<String>) = emptyList<PickedFile>()
    override suspend fun saveFile(suggestedName: String, mimeType: String, bytes: ByteArray) = false
    override fun buildImportArchive(files: List<PickedFile>) = ByteArray(0)
}

@OptIn(ExperimentalCoroutinesApi::class)
class NavigationTest {
    @BeforeTest fun setUp() = Dispatchers.setMain(StandardTestDispatcher())
    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private fun app() = AppController(AppConfig("https://example.invalid", "", "", "", "1.0.0", "android"), FakePlatform())

    @Test fun backFromAnOpenedConversationReturnsToTheList() {
        val app = app()
        app.selectTab(Tab.Ask)
        app.push(Route.Conversations)
        app.pop()
        app.openConversation("s1")
        assertEquals(Tab.Ask, app.tab.value)
        assertTrue(app.stack.value.isEmpty())

        assertTrue(app.handleBack())
        assertEquals(listOf<Route>(Route.Conversations), app.stack.value)
        assertEquals(Tab.Ask, app.tab.value)
    }

    @Test fun listOpenedFromNowReturnsToNowAfterward() {
        val app = app()
        app.push(Route.Conversations) // from the Recent panel on Now
        app.pop()
        app.openConversation("s2")
        assertTrue(app.handleBack())
        assertEquals(Tab.Now, app.tab.value)
        assertEquals(listOf<Route>(Route.Conversations), app.stack.value)
        assertTrue(app.handleBack())
        assertTrue(app.stack.value.isEmpty())
        assertFalse(app.handleBack()) // Now with nothing open: the app may close
    }

    @Test fun switchingTabsForgetsTheList() {
        val app = app()
        app.openConversation("s3")
        app.selectTab(Tab.You)
        app.selectTab(Tab.Ask)
        app.handleBack()
        assertTrue(app.stack.value.isEmpty()) // not sent back to the list
    }
}
