package com.aidoraa.app.ui.screens

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aidoraa.app.domain.MANAGE_SUBSCRIPTION_URL
import com.aidoraa.app.domain.Plans
import com.aidoraa.app.state.AppController
import com.aidoraa.app.ui.components.CardLarge
import com.aidoraa.app.ui.components.CardMedium
import com.aidoraa.app.ui.components.Icon
import com.aidoraa.app.ui.components.Icons
import com.aidoraa.app.ui.components.Pill
import com.aidoraa.app.ui.components.PrimaryButton
import com.aidoraa.app.ui.components.T
import com.aidoraa.app.ui.components.TextLink
import com.aidoraa.app.ui.components.glass
import com.aidoraa.app.ui.components.tap
import com.aidoraa.app.ui.theme.LocalEffects
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type
import com.aidoraa.app.ui.theme.emphasised

private val FEATURES = listOf(
    "Explains the chapter you are in",
    "Answers your questions about your life",
    "Remembers what you tell it",
    "Connects your notes from Notion and Drive",
    "Maps the people who shape you",
    "Covers your family and partner too",
)

@Composable
fun PlansScreen(app: AppController) {
    val billing by app.billing.state.collectAsState()
    val bootstrap by app.bootstrap.collectAsState()
    val current = bootstrap?.plan ?: com.aidoraa.app.data.PlanSummaryDto()
    val options = billing.options
    var selected by remember { mutableIntStateOf(options.indexOfFirst { it.id == current.id }.let { if (it < 0 || it == 0) options.indexOfFirst { o -> o.id == "plus" }.coerceAtLeast(0) else it }) }
    val reduce = LocalEffects.current.reduceMotion
    val origin = app.config.origin.trimEnd('/')

    LaunchedEffect(Unit) { app.billing.loadCatalog() }

    PushedScreen {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            T(emphasised("Choose your ", "plan", Palette.Ink, ""), Type.display(40.sp).copy(textAlign = TextAlign.Center))
            T("A clearer picture of your life, and what to do with it", Type.muted().copy(textAlign = TextAlign.Center), Modifier.padding(top = 6.dp))
            if (current.questionsLimit > 0) T("You're on ${current.name}. ${Plans.usageLine(current)}.", Type.body(13.sp, Palette.Ink3).copy(textAlign = TextAlign.Center), Modifier.padding(top = 6.dp))
        }

        // Pill switcher with a sliding thumb.
        BoxWithConstraints(Modifier.padding(top = 22.dp, bottom = 16.dp).fillMaxWidth().glass(Pill).padding(5.dp)) {
            val count = options.size.coerceAtLeast(1)
            val segment = maxWidth / count
            val thumbX by animateDpAsState(segment * selected, if (reduce) tween(0) else tween(350))
            Box(Modifier.offset(x = thumbX).width(segment).height(44.dp).background(Palette.Paper, Pill))
            Row(Modifier.fillMaxWidth().height(44.dp)) {
                options.forEachIndexed { index, option ->
                    Box(
                        Modifier.weight(1f).fillMaxHeight().semantics { role = Role.Tab; this.selected = index == selected }
                            .tap(option.name) { selected = index },
                        contentAlignment = Alignment.Center,
                    ) {
                        T(option.name, Type.body(15.sp, if (index == selected) Palette.Navy else Palette.Ink2, if (index == selected) FontWeight.SemiBold else FontWeight.Normal))
                    }
                }
            }
        }

        val option = options.getOrNull(selected) ?: return@PushedScreen
        Column(Modifier.fillMaxWidth().glass(CardLarge).padding(22.dp)) {
            T(
                androidx.compose.ui.text.buildAnnotatedString {
                    pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.Medium)); append("Aidoraa "); pop()
                    pushStyle(androidx.compose.ui.text.SpanStyle(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic, color = Palette.Ink3)); append(option.name.lowercase()); pop()
                },
                Type.display(40.sp), Modifier.padding(bottom = 14.dp),
            )
            T(option.promise, Type.body(15.sp, weight = FontWeight.Medium), Modifier.padding(bottom = 12.dp))
            FEATURES.forEach { feature ->
                Row(Modifier.padding(bottom = 10.dp)) {
                    Icon(Icons.Check, Palette.Ink2, 18.dp, modifier = Modifier.padding(top = 2.dp))
                    Spacer(Modifier.width(12.dp))
                    T(feature, Type.body(15.sp))
                }
            }
            if (option.monthlyQuestions > 0) T("${option.monthlyQuestions} questions a month", Type.body(14.sp, Palette.GoldSoft), Modifier.padding(bottom = 8.dp))
            T("Every plan has every feature. Higher plans give more room: more conversations and deeper analysis each month.", Type.body(14.sp, Palette.Ink2))
        }

        Column(
            Modifier.padding(top = 14.dp).fillMaxWidth().background(Color(0x1FD8A94F), CardMedium).border(1.dp, Palette.GoldSoft, CardMedium).padding(14.dp),
        ) {
            T("Monthly", Type.body(12.5.sp, Palette.Ink3))
            T(option.displayPrice, Type.display(24.sp))
            T(if (option.isFree) "free forever" else "per month, cancel any time", Type.body(12.5.sp, Palette.Ink3))
        }

        billing.message?.let { T(it, Type.body(14.sp, Palette.GoldSoft), Modifier.padding(top = 12.dp)) }

        val label = Plans.ctaLabel(current, option)
        Spacer(Modifier.height(16.dp))
        PrimaryButton(label, enabled = label != "Your current plan", busy = billing.busy) {
            app.billing.clearMessage()
            when {
                option.isFree && Plans.hasPlaySubscription(current) -> app.platform.openExternal(MANAGE_SUBSCRIPTION_URL)
                option.isFree -> app.pop()
                else -> app.billing.purchase(option)
            }
        }
        if (option.isFree && Plans.hasPlaySubscription(current)) {
            T("To move to Free, cancel your membership in Google Play. You keep your plan until the end of the period.", Type.body(13.sp, Palette.Ink3), Modifier.padding(top = 8.dp))
        }

        T("Prices come from Google Play in your own currency. Cancel any time in Google Play.",
            Type.body(12.5.sp, Palette.Ink3).copy(textAlign = TextAlign.Center), Modifier.fillMaxWidth().padding(top = 12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            TextLink("Restore purchases", color = Palette.Ink2, size = 13) { app.billing.restore() }
            T("·", Type.body(13.sp, Palette.Ink3))
            TextLink("Terms", color = Palette.Ink2, size = 13) { app.platform.openInAppBrowser("$origin/terms") }
            T("·", Type.body(13.sp, Palette.Ink3))
            TextLink("Privacy", color = Palette.Ink2, size = 13) { app.platform.openInAppBrowser("$origin/privacy") }
        }
        if (Plans.hasPlaySubscription(current)) {
            TextLink("Manage subscription in Google Play", modifier = Modifier.align(Alignment.CenterHorizontally), size = 13) {
                app.platform.openExternal(MANAGE_SUBSCRIPTION_URL)
            }
        }
    }
}
