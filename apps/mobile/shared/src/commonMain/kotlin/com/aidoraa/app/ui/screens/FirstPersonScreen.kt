package com.aidoraa.app.ui.screens

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aidoraa.app.state.AppController
import com.aidoraa.app.state.OnboardingController
import com.aidoraa.app.state.OnboardingStep
import com.aidoraa.app.ui.LocalApp
import com.aidoraa.app.ui.components.BackBar
import com.aidoraa.app.ui.components.BrandMark
import com.aidoraa.app.ui.components.CardMedium
import com.aidoraa.app.ui.components.ErrorText
import com.aidoraa.app.ui.components.Eyebrow
import com.aidoraa.app.ui.components.Field
import com.aidoraa.app.ui.components.FieldLabel
import com.aidoraa.app.ui.components.Fine
import com.aidoraa.app.ui.components.Icon
import com.aidoraa.app.ui.components.Icons
import com.aidoraa.app.ui.components.PrimaryButton
import com.aidoraa.app.ui.components.ProgressBar
import com.aidoraa.app.ui.components.T
import com.aidoraa.app.ui.components.TextLink
import com.aidoraa.app.ui.components.glass
import com.aidoraa.app.ui.components.tap
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type
import com.aidoraa.app.ui.theme.emphasised

@Composable
fun AddPersonScreen(app: AppController) {
    LaunchedEffect(Unit) { app.onboarding.begin(firstRun = false) }
    Column(Modifier.windowInsetsPadding(WindowInsets.statusBars)) {
        BackBar(onBack = { app.pop() })
        FirstPersonScreen(app.onboarding, firstRun = false)
    }
}

@Composable
fun FirstPersonScreen(controller: OnboardingController, firstRun: Boolean) {
    val state by controller.state.collectAsState()
    val app = LocalApp.current
    FormColumn(bottomAligned = false) {
        if (firstRun) {
            Spacer(Modifier.height(24.dp))
            BrandMark(48.dp)
        }
        when (state.step) {
            OnboardingStep.Name -> {
                Eyebrow("Begin with a person", Modifier.padding(top = 24.dp))
                T(emphasised("Whose life are ", "we understanding?", Palette.GoldSoft), Type.display(40.sp), Modifier.padding(top = 8.dp, bottom = 10.dp))
                T("Start with yourself, or someone close to you. A name is enough to begin; you can add more people later.", Type.muted())
                FieldLabel("Name")
                Field(state.name, { value -> controller.update { it.copy(name = value.take(120)) } }, "Their name", onDone = controller::submitName)
                ErrorText(state.error)
                Spacer(Modifier.height(20.dp))
                PrimaryButton("Continue", enabled = state.name.isNotBlank(), busy = state.busy, onClick = controller::submitName)
                if (firstRun) TextLink("Sign out", color = Palette.Ink3, modifier = Modifier.padding(top = 10.dp)) { app.signOut() }
            }
            OnboardingStep.Birth -> {
                Eyebrow("When and where", Modifier.padding(top = 24.dp))
                T(emphasised("When was ", "${state.name.trim()} born?", Palette.GoldSoft), Type.display(36.sp), Modifier.padding(top = 8.dp, bottom = 10.dp))
                T("Birth details help Aidoraa see the shape of a life: its chapters and turning points. They stay private.", Type.muted())
                FieldLabel("Date of birth")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field(state.day, { v -> controller.update { it.copy(day = v.filter(Char::isDigit).take(2)) } }, "Day", Modifier.weight(1f), KeyboardType.Number)
                    Field(state.month, { v -> controller.update { it.copy(month = v.filter(Char::isDigit).take(2)) } }, "Month", Modifier.weight(1f), KeyboardType.Number)
                    Field(state.year, { v -> controller.update { it.copy(year = v.filter(Char::isDigit).take(4)) } }, "Year", Modifier.weight(1.3f), KeyboardType.Number)
                }
                FieldLabel("Time of birth")
                if (!state.timeUnknown) {
                    Field(state.time, { v -> controller.update { it.copy(time = v.filter { c -> c.isDigit() || c == ':' }.take(5)) } }, "Like 07:30", keyboardType = KeyboardType.Number)
                }
                Row(
                    Modifier.padding(top = 10.dp).tap("I don't know the time") { controller.update { it.copy(timeUnknown = !it.timeUnknown) } },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(22.dp).background(if (state.timeUnknown) Palette.Gold else Color.Transparent, RoundedCornerShape(6.dp))
                            .border(1.dp, Palette.Edge, RoundedCornerShape(6.dp)),
                        contentAlignment = Alignment.Center,
                    ) { if (state.timeUnknown) Icon(Icons.Check, Palette.OnGold, 14.dp) }
                    Spacer(Modifier.width(10.dp))
                    T("I don't know the time", Type.body(14.sp, Palette.Ink2))
                }
                FieldLabel("Place of birth")
                Field(state.placeQuery, controller::searchPlaces, "Start typing a town or city")
                if (state.placeResults.isNotEmpty()) {
                    Column(Modifier.fillMaxWidth().padding(top = 6.dp).glass(CardMedium)) {
                        state.placeResults.take(6).forEach { place ->
                            Column(Modifier.fillMaxWidth().tap(place.place) { controller.choosePlace(place) }.padding(horizontal = 16.dp, vertical = 12.dp)) {
                                T(place.place, Type.body(15.sp))
                                if (!place.region.isNullOrBlank()) T(place.region, Type.body(12.5.sp, Palette.Ink3))
                            }
                        }
                    }
                }
                ErrorText(state.error)
                Spacer(Modifier.height(20.dp))
                PrimaryButton("Build the picture", busy = state.busy, onClick = controller::submitBirth)
                TextLink("Skip for now", color = Palette.Ink2, modifier = Modifier.padding(top = 8.dp), onClick = controller::skipBirth)
                Fine("You can add or change birth details later. Without them, Aidoraa learns from what you share.")
            }
            OnboardingStep.Building -> {
                Eyebrow("One moment", Modifier.padding(top = 24.dp))
                T(emphasised("Building ", "your picture", Palette.GoldSoft), Type.display(40.sp), Modifier.padding(top = 8.dp, bottom = 10.dp))
                T(
                    if (state.ready) "Ready. Your life map and first chapter are waiting."
                    else "Aidoraa is laying out the chapters of ${state.name.trim().ifEmpty { "this life" }}. This usually takes about a minute.",
                    Type.muted(),
                )
                Spacer(Modifier.height(24.dp))
                ProgressBar(state.progress)
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    T("Chapters", Type.body(12.5.sp, Palette.Ink3))
                    T("Patterns", Type.body(12.5.sp, Palette.Ink3))
                    T("What's next", Type.body(12.5.sp, Palette.Ink3))
                }
                ErrorText(state.error)
                Spacer(Modifier.height(28.dp))
                PrimaryButton(if (state.ready) "Open my picture" else "Carry on while it finishes", onClick = controller::finish)
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}
