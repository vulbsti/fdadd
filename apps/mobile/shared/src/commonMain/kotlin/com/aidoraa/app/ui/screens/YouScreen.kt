package com.aidoraa.app.ui.screens

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aidoraa.app.core.formatShortDate
import com.aidoraa.app.core.parseIsoMillis
import com.aidoraa.app.data.ApiException
import com.aidoraa.app.domain.MANAGE_SUBSCRIPTION_URL
import com.aidoraa.app.domain.Plans
import com.aidoraa.app.state.AppController
import com.aidoraa.app.state.InfoKind
import com.aidoraa.app.state.Route
import com.aidoraa.app.ui.LocalSheet
import com.aidoraa.app.ui.components.CardMedium
import com.aidoraa.app.ui.components.ErrorText
import com.aidoraa.app.ui.components.Eyebrow
import com.aidoraa.app.ui.components.Field
import com.aidoraa.app.ui.components.FieldLabel
import com.aidoraa.app.ui.components.GlassButton
import com.aidoraa.app.ui.components.Group
import com.aidoraa.app.ui.components.Icon
import com.aidoraa.app.ui.components.Icons
import com.aidoraa.app.ui.components.PrimaryButton
import com.aidoraa.app.ui.components.ScreenTitle
import com.aidoraa.app.ui.components.SettingsRow
import com.aidoraa.app.ui.components.SmallButton
import com.aidoraa.app.ui.components.T
import com.aidoraa.app.ui.components.TextLink
import com.aidoraa.app.ui.components.glass
import com.aidoraa.app.ui.components.tap
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type
import kotlinx.coroutines.launch

@Composable
fun YouScreen(app: AppController, scroll: ScrollState) {
    val bootstrap by app.bootstrap.collectAsState()
    val imports by app.imports.state.collectAsState()
    val personId by app.personId.collectAsState()
    val user = bootstrap?.user
    val plan = bootstrap?.plan
    val name = user?.displayName?.takeIf { it.isNotBlank() } ?: user?.email?.substringBefore('@') ?: "You"
    val person = bootstrap?.profiles?.firstOrNull { it.id == personId }
    androidx.compose.runtime.LaunchedEffect(personId) { if (imports.overview == null) app.imports.load() }

    ScrollScreen(scroll) {
        Eyebrow("You")
        Row(Modifier.padding(top = 10.dp).fillMaxWidth().glass(CardMedium).tap("Edit profile") { app.push(Route.Profile) }.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Avatar(name, 56)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                T(name, Type.display(22.sp), maxLines = 1)
                user?.email?.let { T(it, Type.body(13.5.sp, Palette.Ink2), maxLines = 1) }
                if (plan != null) T(planLine(plan), Type.body(12.sp, Palette.Ok))
            }
        }

        Group("Your picture") {
            SettingsRow(Icons.You, "Profile", user?.displayName ?: "Your name") { app.push(Route.Profile) }
            SettingsRow(Icons.People, "People in your life",
                "${bootstrap?.profiles?.size ?: 0} ${if (bootstrap?.profiles?.size == 1) "person" else "people"}${person?.let { " · looking at ${it.name}" } ?: ""}") { app.push(Route.People) }
            SettingsRow(Icons.Import, "Imports and connections", importsLine(imports.overview), divider = false) { app.push(Route.Imports) }
        }
        Group("Plan") {
            SettingsRow(Icons.Star, "Plan and billing", plan?.let { "${it.name}, ${Plans.formatUsd(it.priceUsdMonthly)} a month. ${Plans.usageLine(it)}" }) { app.push(Route.Plans) }
            SettingsRow(Icons.Out, "Manage in Google Play", "Change plan or cancel", divider = false) { app.platform.openExternal(MANAGE_SUBSCRIPTION_URL) }
        }
        Group("App") {
            SettingsRow(Icons.Bell, "Notifications", "Off for now") { app.push(Route.Info(InfoKind.Notifications)) }
            SettingsRow(Icons.Eye, "Appearance", "Glass night") { app.push(Route.Info(InfoKind.Appearance)) }
            SettingsRow(Icons.Shield, "Privacy and data", "Download my data") { app.push(Route.Info(InfoKind.Privacy)) }
            SettingsRow(Icons.Lock, "Security", "Password, sign out everywhere", divider = false) { app.push(Route.Info(InfoKind.Security)) }
        }
        Group("Help") {
            SettingsRow(Icons.Help, "Help and feedback", "Report an answer that seemed wrong") { app.push(Route.Info(InfoKind.Help)) }
            SettingsRow(Icons.Doc, "Terms and privacy", "Version ${app.config.appVersion}", divider = false) { app.push(Route.Info(InfoKind.Legal)) }
        }
        Group(null) {
            SettingsRow(Icons.Out, "Sign out", chevron = false) { app.signOut() }
            SettingsRow(Icons.Trash, "Delete account", danger = true, divider = false) { app.push(Route.DeleteAccount) }
        }
    }
}

private fun planLine(plan: com.aidoraa.app.data.PlanSummaryDto): String {
    val renew = plan.renewsAt?.let(::parseIsoMillis)?.let { " · renews ${formatShortDate(it)}" }.orEmpty()
    return when (plan.status) {
        "in_grace", "on_hold" -> "${plan.name} · payment needs attention in Google Play"
        "canceled" -> "${plan.name} · ends ${plan.periodEnd?.let(::parseIsoMillis)?.let(::formatShortDate) ?: "soon"}"
        else -> plan.name + renew
    }
}

private fun importsLine(overview: com.aidoraa.app.data.ImportsOverviewDto?): String {
    if (overview == null) return "Notion, Google Drive, chat exports"
    val parts = mutableListOf<String>()
    if (overview.notion.connected) parts += "Notion connected"
    if (overview.google.connected) parts += "Drive connected"
    val uploads = overview.imports.count { it.provider != "notion" && it.provider != "google_drive" }
    if (uploads > 0) parts += "$uploads ${if (uploads == 1) "export" else "exports"}"
    return parts.joinToString(", ").ifEmpty { "Nothing connected yet" }
}

@Composable
fun ProfileScreen(app: AppController) {
    val bootstrap by app.bootstrap.collectAsState()
    var name by remember { mutableStateOf(bootstrap?.user?.displayName.orEmpty()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    PushedScreen {
        ScreenTitle("Your ", "profile")
        T("This is the name Aidoraa greets you by.", Type.muted())
        FieldLabel("Your name")
        Field(name, { name = it.take(80) }, "Your name")
        bootstrap?.user?.email?.let { FieldLabel("Email"); T(it, Type.body(15.sp, Palette.Ink2)) }
        ErrorText(error)
        Spacer(Modifier.height(20.dp))
        PrimaryButton("Save", busy = busy) {
            busy = true; error = null
            scope.launch {
                try {
                    val saved = app.api.updateProfile(name.trim().ifEmpty { null })
                    app.updateDisplayName(saved.displayName)
                    app.toast("Saved")
                    app.pop()
                } catch (e: Exception) { error = e.message } finally { busy = false }
            }
        }
        Spacer(Modifier.height(18.dp))
        T("Birth details for each person are part of their picture. To change them, add the person again or ask us through Help.", Type.body(13.sp, Palette.Ink3))
    }
}

@Composable
fun PeopleScreen(app: AppController) {
    val bootstrap by app.bootstrap.collectAsState()
    val personId by app.personId.collectAsState()
    val life by app.life.collectAsState()
    PushedScreen {
        ScreenTitle("People in ", "your life")
        T("Each person has their own picture. Choose whose life the app is showing.", Type.muted())
        Group("Your people") {
            val people = bootstrap?.profiles.orEmpty()
            people.forEachIndexed { index, person ->
                SettingsRow(
                    icon = null,
                    label = person.name,
                    sub = if (person.id == personId) "Showing now" else "Tap to look at their picture",
                    chevron = false,
                    divider = index < people.lastIndex,
                    trailing = { if (person.id == personId) Icon(Icons.Check, Palette.GoldSoft, 18.dp) },
                ) {
                    if (person.id != personId) { app.selectPerson(person.id); app.toast("Showing ${person.name}") }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        GlassButton("Add a person") { app.push(Route.AddPerson) }
        Group("Who shapes ${bootstrap?.profiles?.firstOrNull { it.id == personId }?.name ?: "this life"}") {
            if (life.people.isEmpty()) T("Aidoraa is still learning this. Mention the people around you in Ask.", Type.body(14.sp, Palette.Ink3), Modifier.padding(16.dp))
            else life.people.forEachIndexed { index, name -> SettingsRow(null, name, chevron = false, divider = index < life.people.lastIndex) }
        }
    }
}

@Composable
fun InfoScreen(app: AppController, kind: InfoKind) {
    val reduceEffects by app.reduceEffects.collectAsState()
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val origin = app.config.origin.trimEnd('/')
    PushedScreen {
        when (kind) {
            InfoKind.Notifications -> {
                ScreenTitle("", "Notifications")
                T("Aidoraa doesn't send notifications yet. When it does, you'll choose here which ones you want, such as when an answer is ready or a new chapter begins.", Type.muted())
            }
            InfoKind.Appearance -> {
                ScreenTitle("", "Appearance")
                T("Aidoraa uses one look, glass night: a quiet sky, glass panels and gold accents.", Type.muted())
                Group("Effects") {
                    SettingsRow(Icons.Eye, "Reduce effects", "Still sky and simple panels. Easier on older phones and on the battery.",
                        chevron = false, divider = false,
                        trailing = { SmallButton(if (reduceEffects) "On" else "Off", on = reduceEffects) { app.setReduceEffects(!reduceEffects) } })
                }
                T("Animations also follow your phone's Remove animations setting.", Type.body(13.sp, Palette.Ink3), Modifier.padding(top = 12.dp))
            }
            InfoKind.Privacy -> {
                ScreenTitle("Privacy and ", "data")
                T("Only you can see your people, conversations and imports. You can take a copy of everything, or delete your account at any time.", Type.muted())
                Group(null) {
                    SettingsRow(Icons.Import, "Download my data", "A JSON file with your account, people and conversations", chevron = false) {
                        if (busy) return@SettingsRow
                        busy = true
                        scope.launch {
                            try {
                                val bytes = app.api.exportAccount()
                                if (app.platform.saveFile("aidoraa-export.json", "application/json", bytes)) app.toast("Saved your data")
                            } catch (e: Exception) { app.toast(e.message ?: "Couldn't download your data") } finally { busy = false }
                        }
                    }
                    SettingsRow(Icons.Doc, "Privacy policy", "How Aidoraa handles your data", divider = false) { app.platform.openInAppBrowser("$origin/privacy") }
                }
            }
            InfoKind.Security -> {
                ScreenTitle("", "Security")
                T("Your session is stored encrypted on this phone.", Type.muted())
                Group(null) {
                    SettingsRow(Icons.Lock, "Change password", "We'll email you a link") {
                        val email = app.bootstrap.value?.user?.email ?: return@SettingsRow
                        scope.launch {
                            try { app.auth.sendPasswordReset(email); app.toast("Check $email for the link") }
                            catch (e: Exception) { app.toast(e.message ?: "Couldn't send the link") }
                        }
                    }
                    SettingsRow(Icons.Out, "Sign out everywhere", "Ends every session, on every device", divider = false) { app.signOut(everywhere = true) }
                }
            }
            InfoKind.Help -> {
                ScreenTitle("Help and ", "feedback")
                T("If an answer seemed wrong, tell us what it said and what is true. It helps Aidoraa understand you better.", Type.muted())
                Group(null) {
                    SettingsRow(Icons.Help, "Help centre", null) { app.platform.openInAppBrowser("$origin/help") }
                    SettingsRow(Icons.Doc, "Contact us", "Report an answer or a problem", divider = false) { app.platform.openInAppBrowser("$origin/contact") }
                }
            }
            InfoKind.Legal -> {
                ScreenTitle("Terms and ", "privacy")
                Group(null) {
                    SettingsRow(Icons.Doc, "Terms of service", null) { app.platform.openInAppBrowser("$origin/terms") }
                    SettingsRow(Icons.Shield, "Privacy policy", null) { app.platform.openInAppBrowser("$origin/privacy") }
                    SettingsRow(Icons.Doc, "Open source", "Fonts: Newsreader and Figtree, SIL Open Font License 1.1", chevron = false, divider = false)
                }
                T("Aidoraa ${app.config.appVersion}", Type.body(13.sp, Palette.Ink3), Modifier.padding(top = 14.dp))
            }
        }
    }
}
