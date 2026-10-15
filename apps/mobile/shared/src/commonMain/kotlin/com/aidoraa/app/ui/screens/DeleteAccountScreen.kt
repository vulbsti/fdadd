package com.aidoraa.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aidoraa.app.data.ApiException
import com.aidoraa.app.domain.MANAGE_SUBSCRIPTION_URL
import com.aidoraa.app.domain.Plans
import com.aidoraa.app.state.AppController
import com.aidoraa.app.ui.components.CardMedium
import com.aidoraa.app.ui.components.DangerButton
import com.aidoraa.app.ui.components.ErrorText
import com.aidoraa.app.ui.components.Fine
import com.aidoraa.app.ui.BackHandler
import com.aidoraa.app.ui.components.Field
import com.aidoraa.app.ui.components.FieldLabel
import com.aidoraa.app.ui.components.GlassButton
import com.aidoraa.app.ui.components.PrimaryButton
import com.aidoraa.app.ui.components.ScreenTitle
import com.aidoraa.app.ui.components.T
import com.aidoraa.app.ui.components.glass
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private val DELETED = listOf(
    "Your account and sign-in",
    "Everyone you added, with their birth details",
    "Your life map, patterns and chapters",
    "Every conversation with Aidoraa",
    "Your imports and connections to Notion and Google Drive",
)

@Composable
fun DeleteAccountScreen(app: AppController) {
    val bootstrap by app.bootstrap.collectAsState()
    val plan = bootstrap?.plan
    val hadPlay = plan != null && Plans.hasPlaySubscription(plan)
    var typed by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    /** Set once deleted while Google Play may still renew: we ask them to cancel before signing out. */
    var playStillRenewing by remember { mutableStateOf(false) }

    BackHandler(enabled = playStillRenewing) { app.accountDeleted() }

    if (playStillRenewing) {
        PushedScreen {
            ScreenTitle("Your account ", "is deleted")
            Paragraph("One more step: Google Play may still renew your membership. Cancel it in Google Play so you're not charged again.")
            Gap(18)
            PrimaryButton("Open Google Play") { app.platform.openExternal(MANAGE_SUBSCRIPTION_URL) }
            Gap(10)
            GlassButton("Done") { app.accountDeleted() }
        }
        return
    }

    PushedScreen {
        ScreenTitle("Delete ", "your account")
        Paragraph("This can't be undone. Everything below is removed for good.")
        Column(Modifier.padding(top = 14.dp).fillMaxWidth().glass(CardMedium).padding(16.dp)) {
            DELETED.forEach { T("•  $it", Type.body(14.5.sp, Palette.Ink2), Modifier.padding(bottom = 6.dp)) }
        }
        if (hadPlay) {
            Column(Modifier.padding(top = 14.dp).fillMaxWidth().glass(CardMedium).padding(16.dp)) {
                T("Your membership is billed by Google Play", Type.body(15.sp, Palette.GoldSoft))
                T("Deleting your account doesn't always stop Google Play from charging you. Cancel your membership in Google Play too.",
                    Type.body(14.sp, Palette.Ink2), Modifier.padding(top = 4.dp, bottom = 12.dp))
                GlassButton("Open Google Play") { app.platform.openExternal(MANAGE_SUBSCRIPTION_URL) }
            }
        }
        T("If you only want a copy of your data, you can download it from You, then Privacy.", Type.body(13.sp, Palette.Ink3), Modifier.padding(top = 14.dp))
        FieldLabel("Type DELETE to confirm")
        Field(typed, { typed = it.take(10) }, "DELETE", keyboardType = KeyboardType.Ascii, letterSpaced = true)
        ErrorText(error, Modifier.padding(top = 8.dp))
        Gap(16)
        DangerButton("Delete my account", enabled = typed.trim() == "DELETE" && !busy, busy = busy) {
            busy = true
            error = null
            app.scope.launch {
                try {
                    val result = app.api.deleteAccount()
                    if (hadPlay && result.googlePlayRenewalStopped != true) playStillRenewing = true
                    else app.accountDeleted()
                } catch (c: CancellationException) { throw c } catch (e: ApiException) {
                    error = if (e.isNetwork) "You're offline. Try again when you're connected." else e.message.ifBlank { "Your account could not be deleted. Try again." }
                } catch (e: Exception) {
                    error = "Your account could not be deleted. Try again."
                } finally { busy = false }
            }
        }
        Fine("You can also delete your account at aidoraa.com/account/delete", Modifier.padding(top = 14.dp))
    }
}
