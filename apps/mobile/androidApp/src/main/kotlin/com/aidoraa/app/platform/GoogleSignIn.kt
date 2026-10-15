package com.aidoraa.app.platform

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.aidoraa.app.core.GoogleSignInResult
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException

/**
 * "Sign in with Google" through Credential Manager. Google gets the SHA-256 hex of the
 * nonce; Supabase later gets the raw nonce and checks the hash inside the ID token.
 */
internal class GoogleSignIn(private val webClientId: String) {
    suspend fun request(activity: Activity, hashedNonce: String): GoogleSignInResult {
        if (webClientId.isBlank()) return GoogleSignInResult.Failed("Google sign-in isn't set up in this build.")
        val option = GetSignInWithGoogleOption.Builder(webClientId).setNonce(hashedNonce).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        return try {
            val response = CredentialManager.create(activity).getCredential(activity, request)
            val credential = response.credential
            if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                GoogleSignInResult.Success(GoogleIdTokenCredential.createFrom(credential.data).idToken)
            } else GoogleSignInResult.Failed("Google didn't return an account. Please try again.")
        } catch (_: GetCredentialCancellationException) {
            GoogleSignInResult.Cancelled
        } catch (_: NoCredentialException) {
            GoogleSignInResult.Failed("No Google account is available on this phone.")
        } catch (_: GoogleIdTokenParsingException) {
            GoogleSignInResult.Failed("Google sign-in didn't work. Please try again.")
        } catch (e: GetCredentialException) {
            GoogleSignInResult.Failed("Google sign-in didn't work. Please try again.")
        }
    }
}
