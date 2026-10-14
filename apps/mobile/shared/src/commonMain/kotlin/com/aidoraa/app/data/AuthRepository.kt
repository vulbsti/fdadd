package com.aidoraa.app.data

import com.aidoraa.app.core.AppConfig
import com.aidoraa.app.core.SecureStore
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.SignOutScope
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.auth.user.UserSession
import io.github.jan.supabase.createSupabaseClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Who is signed in, as the app needs to know it. */
sealed interface AuthState {
    data object Loading : AuthState
    data object SignedOut : AuthState
    data class SignedIn(val userId: String, val email: String?) : AuthState
}

/** Keeps the Supabase session in the platform's encrypted store. */
private class SecureSessionManager(private val store: SecureStore) : SessionManager {
    override suspend fun saveSession(session: UserSession) {
        store.put(KEY, AppJson.encodeToString(UserSession.serializer(), session))
    }

    override suspend fun loadSession(): UserSession {
        val raw = store.get(KEY) ?: throw io.github.jan.supabase.auth.exception.NoSessionFoundException()
        return AppJson.decodeFromString(UserSession.serializer(), raw)
    }

    override suspend fun deleteSession() {
        store.put(KEY, null)
    }

    companion object { const val KEY = "supabase.session" }
}

/**
 * Sign in, sign up, Google ID tokens and token refresh through supabase-kt,
 * reaching Supabase via the website's same-origin /sb proxy.
 */
class AuthRepository(private val config: AppConfig, secureStore: SecureStore, scope: CoroutineScope) {
    private val client: SupabaseClient? = if (!config.signInConfigured) null else createSupabaseClient(
        supabaseUrl = config.supabaseUrl,
        supabaseKey = config.supabaseKey,
    ) {
        install(Auth) {
            sessionManager = SecureSessionManager(secureStore)
            // The proxy lives under a path, so name the auth endpoint explicitly.
            customUrl = config.supabaseUrl.trimEnd('/') + "/auth/v1"
            alwaysAutoRefresh = true
            autoLoadFromStorage = true
            autoSaveToStorage = true
        }
    }

    private val _state = MutableStateFlow<AuthState>(if (client == null) AuthState.SignedOut else AuthState.Loading)
    val state: StateFlow<AuthState> = _state.asStateFlow()
    private val refreshLock = Mutex()

    init {
        client?.let { supabase ->
            scope.launch {
                supabase.auth.sessionStatus.collect { status ->
                    if (demoMode) return@collect
                    _state.value = when (status) {
                        is SessionStatus.Authenticated -> AuthState.SignedIn(
                            status.session.user?.id ?: supabase.auth.currentUserOrNull()?.id ?: "",
                            status.session.user?.email,
                        )
                        is SessionStatus.NotAuthenticated -> AuthState.SignedOut
                        is SessionStatus.Initializing -> AuthState.Loading
                        // Keep the person signed in while offline; the next call refreshes.
                        is SessionStatus.RefreshFailure -> _state.value.takeIf { it is AuthState.SignedIn } ?: AuthState.SignedOut
                    }
                }
            }
        }
    }

    val configured: Boolean get() = client != null

    /** Sample-data demo (debug builds only): signed in locally, no Supabase, no network. */
    var demoMode: Boolean = false
        private set

    fun startDemo(userId: String, email: String) {
        demoMode = true
        _state.value = AuthState.SignedIn(userId, email)
    }

    val userId: String? get() = (state.value as? AuthState.SignedIn)?.userId

    suspend fun accessToken(forceRefresh: Boolean): String? {
        if (demoMode) return "demo"
        val supabase = client ?: return null
        if (forceRefresh) {
            refreshLock.withLock { runCatching { supabase.auth.refreshCurrentSession() } }
        }
        return supabase.auth.currentAccessTokenOrNull()
    }

    suspend fun signIn(email: String, password: String) = guarded {
        it.auth.signInWith(Email) { this.email = email.trim(); this.password = password }
    }

    /** Returns true when the account still needs its email confirmed before signing in. */
    suspend fun signUp(email: String, password: String): Boolean {
        var needsConfirmation = false
        guarded {
            it.auth.signUpWith(Email) { this.email = email.trim(); this.password = password }
            needsConfirmation = it.auth.currentSessionOrNull() == null
        }
        return needsConfirmation
    }

    suspend fun signInWithGoogle(idToken: String, rawNonce: String) = guarded {
        it.auth.signInWith(IDToken) {
            this.idToken = idToken
            provider = Google
            nonce = rawNonce
        }
    }

    suspend fun sendPasswordReset(email: String) = guarded {
        it.auth.resetPasswordForEmail(email.trim(), redirectUrl = config.origin.trimEnd('/') + "/auth/update-password")
    }

    suspend fun signOut(everywhere: Boolean = false) {
        if (demoMode) {
            demoMode = false
            _state.value = AuthState.SignedOut
            return
        }
        val supabase = client ?: return
        runCatching { supabase.auth.signOut(if (everywhere) SignOutScope.GLOBAL else SignOutScope.LOCAL) }
        // Even when the network call fails, forget the local session.
        runCatching { supabase.auth.clearSession() }
        _state.value = AuthState.SignedOut
    }

    private suspend fun guarded(block: suspend (SupabaseClient) -> Unit) {
        val supabase = client ?: throw AuthException("Sign in isn't set up in this build of the app.")
        try {
            block(supabase)
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (error: Throwable) {
            throw AuthException(friendlyAuthMessage(error.message))
        }
    }
}

class AuthException(message: String) : Exception(message)

fun friendlyAuthMessage(raw: String?): String {
    val text = raw.orEmpty().lowercase()
    return when {
        "invalid login" in text || "invalid_credentials" in text || "invalid credentials" in text ->
            "That email and password don't match. Try again or reset your password."
        "already registered" in text || "already exists" in text -> "There's already an account with this email. Sign in instead."
        "email not confirmed" in text -> "Please confirm your email first. We sent you a link."
        "password" in text && ("short" in text || "least" in text || "weak" in text) -> "Choose a longer password (at least 8 characters)."
        "rate limit" in text || "too many" in text -> "Too many attempts. Please wait a minute and try again."
        "network" in text || "unable to resolve" in text || "timeout" in text || "failed to connect" in text ->
            "We couldn't reach Aidoraa. Check your connection and try again."
        else -> "Sign in didn't work. Please try again."
    }
}
