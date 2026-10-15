package com.aidoraa.app.state

import com.aidoraa.app.core.nowMillis
import com.aidoraa.app.core.AppConfig
import com.aidoraa.app.core.PlatformServices
import com.aidoraa.app.data.ApiClient
import com.aidoraa.app.data.ApiException
import com.aidoraa.app.data.AuthRepository
import com.aidoraa.app.data.AuthState
import com.aidoraa.app.data.BootstrapDto
import com.aidoraa.app.data.JsonCache
import com.aidoraa.app.data.PersonModelDto
import com.aidoraa.app.data.PlanSummaryDto
import com.aidoraa.app.data.ProjectionDto
import com.aidoraa.app.data.SessionSummaryDto
import com.aidoraa.app.data.UpdateRequiredException
import com.aidoraa.app.domain.LifeModel
import com.aidoraa.app.domain.LifeModelBuilder
import com.aidoraa.app.domain.PanelId
import com.aidoraa.app.domain.PanelLayout
import com.aidoraa.app.domain.PanelSlot
import com.aidoraa.app.domain.VersionGate
import io.ktor.client.engine.HttpClientEngine
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.builtins.ListSerializer

sealed interface AppPhase {
    data object Loading : AppPhase
    data object SignedOut : AppPhase
    data class UpdateRequired(val message: String) : AppPhase
    /** Signed in, but the first load failed and nothing is cached. */
    data class LoadFailed(val message: String) : AppPhase
    /** Signed in with no person yet: the first-run flow. */
    data object FirstPerson : AppPhase
    data object Main : AppPhase
}

enum class Tab(val label: String) { Now("Now"), LifeMap("Life map"), Ask("Ask"), You("You") }

sealed interface Route {
    data object Plans : Route
    data object Imports : Route
    data object DeleteAccount : Route
    data object Conversations : Route
    data object People : Route
    data object AddPerson : Route
    data object Profile : Route
    data class Info(val kind: InfoKind) : Route
}

enum class InfoKind { Notifications, Appearance, Privacy, Security, Help, Legal }

/**
 * The app's single source of truth: who is signed in, the bootstrap, the
 * person being looked at, Home's panels, and navigation. Everything loads from
 * the cache first and then refreshes from the server.
 */
class AppController(
    val config: AppConfig,
    val platform: PlatformServices,
    /** Debug builds only: an in-memory backend with sample data. Null in release builds. */
    private val demoEngine: (() -> HttpClientEngine)? = null,
) {
    /** A last-resort guard: a failure in background work shows a short message instead of closing the app. */
    private val failureGuard = CoroutineExceptionHandler { _, error ->
        if (error !is CancellationException) _toasts.tryEmit("Something went wrong. Please try again.")
    }
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main + failureGuard)
    val cache = JsonCache(platform.keyValueStore)
    val auth = AuthRepository(config, platform.secureStore, scope)
    private val liveApi = ApiClient(config, auth::accessToken, onUpdateRequired = { message -> _phase.value = AppPhase.UpdateRequired(message) })
    var api: ApiClient = liveApi
        private set

    /** Whether the sample-data demo can be opened (debug builds). */
    val demoAvailable: Boolean get() = demoEngine != null

    /** True while the app shows sample data instead of an account. */
    val demo: Boolean get() = auth.demoMode

    /** Opens the app on bundled sample data, without an account or the network. */
    fun startDemo() {
        val engine = demoEngine ?: return
        api = ApiClient(config, auth::accessToken, { message -> _phase.value = AppPhase.UpdateRequired(message) }, engine())
        auth.startDemo(DEMO_USER_ID, "meera@example.com")
    }

    private val _phase = MutableStateFlow<AppPhase>(AppPhase.Loading)
    val phase: StateFlow<AppPhase> = _phase.asStateFlow()

    private val _bootstrap = MutableStateFlow<BootstrapDto?>(null)
    val bootstrap: StateFlow<BootstrapDto?> = _bootstrap.asStateFlow()

    private val _personId = MutableStateFlow<String?>(null)
    val personId: StateFlow<String?> = _personId.asStateFlow()

    private val _layout = MutableStateFlow(PanelLayout.default)
    val layout: StateFlow<List<PanelSlot>> = _layout.asStateFlow()

    private val _life = MutableStateFlow(LifeModel())
    val life: StateFlow<LifeModel> = _life.asStateFlow()

    private val _lifeLoading = MutableStateFlow(false)
    val lifeLoading: StateFlow<Boolean> = _lifeLoading.asStateFlow()

    private val _sessions = MutableStateFlow<List<SessionSummaryDto>>(emptyList())
    val sessions: StateFlow<List<SessionSummaryDto>> = _sessions.asStateFlow()

    private val _toasts = MutableSharedFlow<String>(extraBufferCapacity = 4, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val toasts: SharedFlow<String> = _toasts

    // Navigation
    private val _tab = MutableStateFlow(Tab.Now)
    val tab: StateFlow<Tab> = _tab.asStateFlow()
    private val _stack = MutableStateFlow<List<Route>>(emptyList())
    val stack: StateFlow<List<Route>> = _stack.asStateFlow()

    /** Reduce visual effects (no twinkle, no live blur), chosen in Appearance. */
    private val _reduceEffects = MutableStateFlow(cache.pref("reduceEffects") == "1")
    val reduceEffects: StateFlow<Boolean> = _reduceEffects.asStateFlow()

    val chat = ChatController(this)
    val imports = ImportsController(this)
    val billing = BillingController(this)
    val onboarding = OnboardingController(this)

    private var layoutSaveJob: Job? = null
    private var lifeJob: Job? = null

    init {
        scope.launch {
            auth.state.map { it }.distinctUntilChanged().collect { state ->
                when (state) {
                    AuthState.Loading -> _phase.value = AppPhase.Loading
                    AuthState.SignedOut -> onSignedOut()
                    is AuthState.SignedIn -> onSignedIn(state.userId)
                }
            }
        }
        billing.loadCatalog()
    }

    fun toast(message: String) { _toasts.tryEmit(message) }

    // -- navigation ------------------------------------------------------------

    private val backHandlers = ArrayList<() -> Boolean>()
    fun addBackHandler(handler: () -> Boolean) { backHandlers += handler }
    fun removeBackHandler(handler: () -> Boolean) { backHandlers -= handler }

    /** System back: open sheets first, then pushed screens, then back to Now. False lets the app close. */
    fun handleBack(): Boolean {
        for (handler in backHandlers.asReversed().toList()) if (handler()) return true
        if (_phase.value == AppPhase.FirstPerson && onboarding.back()) return true
        return pop()
    }

    fun selectTab(tab: Tab) { _stack.value = emptyList(); _tab.value = tab; _conversationReturn.value = null }

    /** Set while Ask shows a conversation opened from the list: back returns to that list. */
    data class ConversationReturn(val sessionId: String, val tab: Tab)
    private val _conversationReturn = MutableStateFlow<ConversationReturn?>(null)
    val conversationReturn: StateFlow<ConversationReturn?> = _conversationReturn.asStateFlow()

    /** Opens a past conversation in Ask, remembering the list (and the tab under it) for back. */
    fun openConversation(sessionId: String) {
        val origin = _tab.value
        chat.open(sessionId)
        _stack.value = emptyList()
        _tab.value = Tab.Ask
        _conversationReturn.value = ConversationReturn(sessionId, origin)
    }

    /** Back from an opened conversation: the list again, on the tab it was opened from. */
    private fun returnToConversationList(): Boolean {
        val target = _conversationReturn.value ?: return false
        _conversationReturn.value = null
        if (_tab.value != Tab.Ask || _stack.value.isNotEmpty() || chat.state.value.sessionId != target.sessionId) return false
        _tab.value = target.tab
        _stack.value = listOf(Route.Conversations)
        loadSessions()
        return true
    }
    fun push(route: Route) { _stack.value = _stack.value + route }
    fun pop(): Boolean {
        val stack = _stack.value
        if (stack.isNotEmpty()) { _stack.value = stack.dropLast(1); return true }
        if (returnToConversationList()) return true
        if (_tab.value != Tab.Now && _phase.value == AppPhase.Main) { _tab.value = Tab.Now; return true }
        return false
    }

    fun setReduceEffects(value: Boolean) {
        _reduceEffects.value = value
        cache.setPref("reduceEffects", if (value) "1" else null)
    }

    // -- session lifecycle -------------------------------------------------------

    private var signedInUser: String? = null

    private fun onSignedOut() {
        signedInUser = null
        cache.userId = null
        _bootstrap.value = null
        _personId.value = null
        _life.value = LifeModel()
        _sessions.value = emptyList()
        _layout.value = PanelLayout.default
        _stack.value = emptyList()
        _tab.value = Tab.Now
        chat.reset()
        imports.reset()
        if (_phase.value !is AppPhase.UpdateRequired) _phase.value = AppPhase.SignedOut
    }

    private fun onSignedIn(userId: String) {
        if (signedInUser == userId && _phase.value != AppPhase.Loading && _phase.value != AppPhase.SignedOut) return
        signedInUser = userId
        cache.userId = userId
        // Open from cache immediately.
        val cached = cache.read("bootstrap", BootstrapDto.serializer())
        val cachedLayout = PanelLayout.decode(cache.readString("layout"))
        if (cachedLayout != null) _layout.value = cachedLayout
        if (cached != null) applyBootstrap(cached, fromCache = true)
        cache.read("sessions", ListSerializer(SessionSummaryDto.serializer()))?.let { _sessions.value = it }
        refresh()
    }

    /** Re-reads everything from the server; safe to call often (app resume, pull to refresh). */
    private var lastRefresh = 0L

    /** Called when the app comes to the foreground; skips the call if the data is fresh. */
    fun onForeground() {
        if (nowMillis() - lastRefresh > 60_000) refresh()
        else if (_sessions.value.isEmpty()) loadSessions()
    }

    fun refresh() {
        if (auth.state.value !is AuthState.SignedIn) return
        lastRefresh = nowMillis()
        scope.launch {
            try {
                val fresh = api.bootstrap()
                cache.write("bootstrap", BootstrapDto.serializer(), fresh)
                applyBootstrap(fresh, fromCache = false)
                billing.syncPurchases()
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (update: UpdateRequiredException) {
                // The update screen is already showing.
            } catch (error: ApiException) {
                if (error.isUnauthenticated) { auth.signOut(); return@launch }
                if (_bootstrap.value == null) _phase.value = AppPhase.LoadFailed(error.message)
                else toast("Showing what was saved. ${if (error.isNetwork) "You're offline." else ""}".trim())
            } catch (error: Exception) {
                if (_bootstrap.value == null) _phase.value = AppPhase.LoadFailed("Aidoraa couldn't load your account. Please try again.")
            }
        }
    }

    private fun applyBootstrap(dto: BootstrapDto, fromCache: Boolean) {
        if (VersionGate.isUpdateRequired(config.appVersion, dto.minSupportedVersion)) {
            _phase.value = AppPhase.UpdateRequired("A newer version of Aidoraa is available. Please update the app to keep going.")
            return
        }
        _bootstrap.value = dto
        if (!fromCache) {
            // The server layout wins unless a local change is still waiting to sync.
            if (cache.readString("layoutDirty") == null) {
                val layout = PanelLayout.fromDto(dto.homeLayout)
                _layout.value = layout
                cache.writeString("layout", PanelLayout.encode(layout))
            } else {
                syncLayout()
            }
        }
        val people = dto.profiles
        val chosen = cache.readString("personId")?.takeIf { id -> people.any { it.id == id } } ?: people.firstOrNull()?.id
        if (chosen == null) {
            _personId.value = null
            if (!fromCache && !onboarding.inProgress) _phase.value = AppPhase.FirstPerson
            else if (fromCache) _phase.value = AppPhase.Loading
            return
        }
        val personChanged = _personId.value != chosen
        _personId.value = chosen
        if (_phase.value != AppPhase.FirstPerson || !onboarding.inProgress) _phase.value = AppPhase.Main
        if (personChanged || !fromCache) loadLife(chosen, useCache = personChanged)
        if (!fromCache) loadSessions()
    }

    fun selectPerson(id: String) {
        cache.writeString("personId", id)
        _personId.value = id
        chat.reset()
        imports.reset()
        loadLife(id, useCache = true)
    }

    fun updatePlan(plan: PlanSummaryDto) {
        val current = _bootstrap.value ?: return
        val updated = current.copy(plan = plan)
        _bootstrap.value = updated
        cache.write("bootstrap", BootstrapDto.serializer(), updated)
    }

    fun updateDisplayName(name: String?) {
        val current = _bootstrap.value ?: return
        val updated = current.copy(user = current.user.copy(displayName = name))
        _bootstrap.value = updated
        cache.write("bootstrap", BootstrapDto.serializer(), updated)
    }

    /** After the first-run flow creates a person. */
    fun personCreated(id: String) {
        cache.writeString("personId", id)
        refresh()
    }

    fun finishOnboarding() {
        _phase.value = if (_personId.value != null) AppPhase.Main else AppPhase.Loading
        _tab.value = Tab.Now
        refresh()
    }

    // -- life model ------------------------------------------------------------------

    fun loadLife(personId: String = _personId.value ?: "", useCache: Boolean = true) {
        if (personId.isEmpty()) return
        if (useCache) {
            val lifeMap = cache.read("view.$personId.life-map", ProjectionDto.serializer())
            val patterns = cache.read("view.$personId.patterns", ProjectionDto.serializer())
            val people = cache.read("view.$personId.people", ProjectionDto.serializer())
            val model = cache.read("model.$personId", PersonModelDto.serializer())
            _life.value = LifeModelBuilder.build(lifeMap, patterns, people, model?.brief)
        }
        lifeJob?.cancel()
        lifeJob = scope.launch {
            _lifeLoading.value = true
            try {
                suspend fun <T> soft(block: suspend () -> T): T? = try { block() } catch (c: CancellationException) { throw c } catch (_: UpdateRequiredException) { null } catch (_: ApiException) { null }
                val lifeMap = async { soft { api.view(personId, "life-map") } }
                val patterns = async { soft { api.view(personId, "patterns") } }
                val people = async { soft { api.view(personId, "people") } }
                val model = async { soft { api.model(personId) } }
                val l = lifeMap.await(); val p = patterns.await(); val pe = people.await(); val m = model.await()
                l?.let { cache.write("view.$personId.life-map", ProjectionDto.serializer(), it) }
                p?.let { cache.write("view.$personId.patterns", ProjectionDto.serializer(), it) }
                pe?.let { cache.write("view.$personId.people", ProjectionDto.serializer(), it) }
                m?.let { cache.write("model.$personId", PersonModelDto.serializer(), it) }
                if (l != null || p != null || pe != null || m != null) {
                    _life.value = LifeModelBuilder.build(
                        l ?: cache.read("view.$personId.life-map", ProjectionDto.serializer()),
                        p ?: cache.read("view.$personId.patterns", ProjectionDto.serializer()),
                        pe ?: cache.read("view.$personId.people", ProjectionDto.serializer()),
                        (m ?: cache.read("model.$personId", PersonModelDto.serializer()))?.brief,
                    )
                }
                // While the picture is still being written, look again shortly.
                if (_life.value.updating) { delay(20_000); loadLife(personId, useCache = false) }
            } finally {
                _lifeLoading.value = false
            }
        }
    }

    fun loadSessions() {
        val cached = cache.read("sessions", ListSerializer(SessionSummaryDto.serializer()))
        if (cached != null && _sessions.value.isEmpty()) _sessions.value = cached
        scope.launch {
            try {
                val fresh = api.sessions()
                _sessions.value = fresh
                cache.write("sessions", ListSerializer(SessionSummaryDto.serializer()), fresh)
            } catch (c: CancellationException) { throw c } catch (_: Exception) { }
        }
    }

    // -- home layout -------------------------------------------------------------------

    fun setLayout(layout: List<PanelSlot>) {
        if (layout == _layout.value) return
        _layout.value = layout
        cache.writeString("layout", PanelLayout.encode(layout))
        cache.writeString("layoutDirty", "1")
        syncLayout()
    }

    fun movePanel(from: Int, to: Int) = setLayout(PanelLayout.move(_layout.value, from, to))
    fun togglePanelSize(id: PanelId) = setLayout(PanelLayout.toggleSize(_layout.value, id))
    fun hidePanel(id: PanelId) = setLayout(PanelLayout.hide(_layout.value, id))
    fun addPanel(id: PanelId) = setLayout(PanelLayout.add(_layout.value, id))

    /** Saved locally at once; synced to the server shortly after the last change. */
    private fun syncLayout() {
        layoutSaveJob?.cancel()
        layoutSaveJob = scope.launch {
            delay(1200)
            var attempt = 0
            while (attempt < 4) {
                try {
                    api.saveHomeLayout(PanelLayout.toDto(_layout.value))
                    cache.writeString("layoutDirty", null)
                    return@launch
                } catch (c: CancellationException) { throw c } catch (_: UpdateRequiredException) { return@launch } catch (_: Exception) {
                    attempt++
                    delay(5_000L * attempt)
                }
            }
        }
    }

    // -- account -------------------------------------------------------------------------

    fun signOut(everywhere: Boolean = false) {
        scope.launch {
            val wasDemo = demo
            auth.signOut(everywhere)
            cache.clearAll()
            if (wasDemo) api = liveApi
        }
    }

    /** After the account is deleted on the server. */
    fun accountDeleted() {
        scope.launch {
            cache.clearAll()
            if (demo) api = liveApi
            auth.signOut()
        }
    }

    fun retryAfterFailure() {
        _phase.value = AppPhase.Loading
        refresh()
    }
}

const val DEMO_USER_ID = "demo-sample-user"
