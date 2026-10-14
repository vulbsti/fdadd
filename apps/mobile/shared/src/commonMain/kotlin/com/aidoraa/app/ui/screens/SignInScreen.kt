package com.aidoraa.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aidoraa.app.core.GoogleSignInResult
import com.aidoraa.app.core.randomNonce
import com.aidoraa.app.core.sha256Hex
import com.aidoraa.app.state.AppController
import com.aidoraa.app.ui.BackHandler
import com.aidoraa.app.ui.components.BrandMark
import com.aidoraa.app.ui.components.ErrorText
import com.aidoraa.app.ui.components.Field
import com.aidoraa.app.ui.components.FieldLabel
import com.aidoraa.app.ui.components.Fine
import com.aidoraa.app.ui.components.GlassButton
import com.aidoraa.app.ui.components.LightButton
import com.aidoraa.app.ui.components.PrimaryButton
import com.aidoraa.app.ui.components.T
import com.aidoraa.app.ui.components.TextLink
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type
import kotlinx.coroutines.launch

private enum class SignInMode { Choose, SignIn, SignUp, Reset }

@Composable
fun SignInScreen(app: AppController) {
    var mode by remember { mutableStateOf(SignInMode.Choose) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    // Every switch of screen or method starts clean: no error or notice from the last attempt.
    fun go(next: SignInMode) { mode = next; error = null; notice = null }
    BackHandler(enabled = mode != SignInMode.Choose) { go(SignInMode.Choose) }

    fun run(block: suspend () -> Unit) {
        if (busy) return
        busy = true; error = null; notice = null
        scope.launch {
            try { block() } catch (e: Exception) { error = e.message ?: "Something went wrong." } finally { busy = false }
        }
    }

    fun google() = run {
        if (!app.config.googleSignInConfigured) { error = "Google sign in isn't set up in this build of the app."; return@run }
        val raw = randomNonce()
        when (val result = app.platform.googleIdToken(sha256Hex(raw))) {
            is GoogleSignInResult.Success -> app.auth.signInWithGoogle(result.idToken, raw)
            GoogleSignInResult.Cancelled -> Unit
            is GoogleSignInResult.Failed -> error = result.message
        }
    }

    FormColumn {
        BrandMark(64.dp)
        when (mode) {
            SignInMode.Choose -> {
                T(
                    com.aidoraa.app.ui.theme.emphasised("Understand ", "yourself", Palette.GoldSoft, ", and everything that shapes you"),
                    Type.display(44.sp).copy(lineHeight = 45.sp),
                    Modifier.padding(top = 18.dp, bottom = 10.dp),
                )
                T("Your life, your patterns and the chapter you are in, explained in plain words.", Type.muted())
                Spacer(Modifier.height(26.dp))
                LightButton("Continue with Google", leading = { GoogleG() }, enabled = !busy) { google() }
                Spacer(Modifier.height(10.dp))
                GlassButton("Continue with email", enabled = !busy) { go(SignInMode.SignIn) }
                ErrorText(error)
                Fine("New here? The same buttons create your account.")
                if (!app.config.signInConfigured) Fine("This build has no sign-in settings. See apps/mobile/README.md.")
                if (app.demoAvailable) {
                    Spacer(Modifier.height(18.dp))
                    GlassButton("Demo: open with sample data", enabled = !busy, color = Palette.GoldSoft) { app.startDemo() }
                    Fine("Debug builds only. Shows Meera, a made-up person, with no account and no network.")
                }
            }
            SignInMode.SignIn, SignInMode.SignUp -> {
                val signUp = mode == SignInMode.SignUp
                T(
                    if (signUp) com.aidoraa.app.ui.theme.emphasised("Create your ", "account", Palette.GoldSoft)
                    else com.aidoraa.app.ui.theme.emphasised("Welcome ", "back", Palette.GoldSoft),
                    Type.display(40.sp), Modifier.padding(top = 18.dp, bottom = 6.dp),
                )
                FieldLabel("Email")
                Field(email, { email = it; error = null }, "you@example.com", keyboardType = KeyboardType.Email)
                FieldLabel("Password")
                Field(password, { password = it; error = null }, if (signUp) "At least 8 characters" else "Your password", password = true, onDone = {})
                ErrorText(error)
                if (notice != null) T(notice!!, Type.body(14.sp, Palette.Ok), Modifier.padding(top = 10.dp))
                Spacer(Modifier.height(18.dp))
                PrimaryButton(if (signUp) "Create account" else "Sign in", enabled = email.contains('@') && password.length >= (if (signUp) 8 else 1), busy = busy) {
                    run {
                        if (signUp) {
                            val needsConfirmation = app.auth.signUp(email, password)
                            if (needsConfirmation) notice = "Check your email to confirm your account, then sign in here."
                        } else app.auth.signIn(email, password)
                    }
                }
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    TextLink(if (signUp) "I have an account" else "Create an account") { go(if (signUp) SignInMode.SignIn else SignInMode.SignUp) }
                    if (!signUp) TextLink("Forgot password?", color = Palette.Ink2) { go(SignInMode.Reset) }
                }
                TextLink("Back", Modifier.padding(top = 8.dp), color = Palette.Ink3) { go(SignInMode.Choose) }
            }
            SignInMode.Reset -> {
                T(com.aidoraa.app.ui.theme.emphasised("Reset your ", "password", Palette.GoldSoft), Type.display(40.sp), Modifier.padding(top = 18.dp, bottom = 6.dp))
                T("We'll email you a link to choose a new one.", Type.muted())
                FieldLabel("Email")
                Field(email, { email = it; error = null }, "you@example.com", keyboardType = KeyboardType.Email)
                ErrorText(error)
                if (notice != null) T(notice!!, Type.body(14.sp, Palette.Ok), Modifier.padding(top = 10.dp))
                Spacer(Modifier.height(18.dp))
                PrimaryButton("Send the link", enabled = email.contains('@'), busy = busy) {
                    run { app.auth.sendPasswordReset(email); notice = "If there's an account for $email, a link is on its way." }
                }
                TextLink("Back to sign in", Modifier.padding(top = 8.dp), color = Palette.Ink3) { go(SignInMode.SignIn) }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

/** Google's "G", drawn with its four brand colors. */
@Composable
private fun GoogleG() {
    Canvas(Modifier.size(18.dp)) {
        val stroke = Stroke(width = size.width * 0.2f)
        val inset = stroke.width / 2
        val arcSize = androidx.compose.ui.geometry.Size(size.width - stroke.width, size.height - stroke.width)
        val topLeft = androidx.compose.ui.geometry.Offset(inset, inset)
        drawArc(Color(0xFFEA4335), 200f, 110f, false, topLeft, arcSize, style = stroke)
        drawArc(Color(0xFFFBBC05), 140f, 60f, false, topLeft, arcSize, style = stroke)
        drawArc(Color(0xFF34A853), 40f, 100f, false, topLeft, arcSize, style = stroke)
        drawArc(Color(0xFF4285F4), -20f, 60f, false, topLeft, arcSize, style = stroke)
        drawRect(Color(0xFF4285F4), androidx.compose.ui.geometry.Offset(size.width / 2, size.height / 2 - stroke.width / 2),
            androidx.compose.ui.geometry.Size(size.width / 2, stroke.width))
    }
}
