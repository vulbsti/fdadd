package com.aidoraa.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aidoraa.app.core.formatShortDate
import com.aidoraa.app.core.parseIsoMillis
import com.aidoraa.app.data.ImportDetailDto
import com.aidoraa.app.data.ImportSummaryDto
import com.aidoraa.app.state.AppController
import com.aidoraa.app.state.UPLOAD_SOURCES
import com.aidoraa.app.state.UploadSource
import com.aidoraa.app.ui.LocalSheet
import com.aidoraa.app.ui.components.ErrorText
import com.aidoraa.app.ui.components.Group
import com.aidoraa.app.ui.components.Icons
import com.aidoraa.app.ui.components.PrimaryButton
import com.aidoraa.app.ui.components.ScreenTitle
import com.aidoraa.app.ui.components.SettingsRow
import com.aidoraa.app.ui.components.SmallButton
import com.aidoraa.app.ui.components.Spinner
import com.aidoraa.app.ui.components.T
import com.aidoraa.app.ui.components.TextLink
import com.aidoraa.app.ui.theme.Palette
import com.aidoraa.app.ui.theme.Type

private fun providerLabel(provider: String) = when (provider) {
    "google_keep" -> "Google Keep"
    "chatgpt" -> "ChatGPT"
    "claude" -> "Claude"
    "gemini" -> "Gemini"
    "notion" -> "Notion"
    "google_drive" -> "Google Drive"
    else -> "Upload"
}

private fun statusLabel(item: ImportSummaryDto) = when (item.status) {
    "imported", "completed", "complete" -> "${item.itemCount} item${if (item.itemCount == 1) "" else "s"} added"
    "failed" -> item.error?.let { "Could not be read" } ?: "Could not be read"
    "parsed", "ready", "awaiting_confirmation" -> "Waiting for you to confirm"
    else -> "Reading"
}

@Composable
fun ImportsScreen(app: AppController) {
    val state by app.imports.state.collectAsState()
    val personId by app.personId.collectAsState()
    val sheet = LocalSheet.current
    var expanded by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(personId) { app.imports.load() }
    LaunchedEffect(state.review?.import?.id) {
        val review = state.review
        if (review != null) sheet.show { SpeakerSheet(app, review) }
    }
    LaunchedEffect(state.notionPages != null) {
        if (state.notionPages != null) sheet.show { NotionPagesSheet(app) }
    }

    PushedScreen {
        ScreenTitle("Bring in ", "what you've written")
        Paragraph("Notes and chats you choose to share help Aidoraa understand you faster. Only text is read. You can delete an import at any time, and what it added goes with it.")

        state.busy?.let {
            Row(Modifier.padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Spinner(size = 16.dp); Spacer(Modifier.width(10.dp)); T(it, Type.body(14.sp, Palette.GoldSoft))
            }
        }
        ErrorText(state.error, Modifier.padding(top = 10.dp))

        val overview = state.overview
        Group("Connect") {
            val notion = overview?.notion
            SettingsRow(
                Icons.Doc, "Notion",
                sub = when {
                    notion == null -> null
                    !notion.configured -> "Not available yet"
                    notion.connected -> "Connected" + (notion.workspaceName?.let { " to $it" } ?: "")
                    else -> "Choose the pages to share"
                },
                chevron = false,
                trailing = {
                    if (notion?.configured == true) {
                        if (notion.connected) {
                            SmallButton("Choose pages", enabled = state.busy == null) { app.imports.loadNotionPages() }
                            Spacer(Modifier.width(6.dp))
                            SmallButton("Disconnect", enabled = state.busy == null) { app.imports.disconnect("notion") }
                        } else SmallButton("Connect", on = true, enabled = state.busy == null) { app.imports.connect("notion") }
                    }
                },
            )
            val google = overview?.google
            SettingsRow(
                Icons.Doc, "Google Drive",
                sub = when {
                    google == null -> null
                    !google.configured -> "Not available yet"
                    google.connected -> "Connected" + (google.email?.let { " as $it" } ?: "")
                    else -> "Docs you pick are read once"
                },
                chevron = false, divider = false,
                trailing = {
                    if (google?.configured == true) {
                        if (google.connected) {
                            SmallButton("Choose files", enabled = state.busy == null) { app.imports.chooseDriveFiles() }
                            Spacer(Modifier.width(6.dp))
                            SmallButton("Disconnect", enabled = state.busy == null) { app.imports.disconnect("google") }
                        }
                        else SmallButton("Connect", on = true, enabled = state.busy == null) { app.imports.connect("google") }
                    }
                },
            )
        }

        Group("Upload an export") {
            UPLOAD_SOURCES.forEachIndexed { index, source ->
                UploadRow(source, expanded == source.provider, index == UPLOAD_SOURCES.lastIndex, state.busy == null,
                    onToggle = { expanded = if (expanded == source.provider) null else source.provider },
                    onUpload = { app.imports.upload(source) })
            }
        }

        Group("Imported") {
            when {
                overview == null && state.loading -> Row(Modifier.padding(16.dp)) { Spinner(size = 18.dp) }
                overview == null || overview.imports.isEmpty() ->
                    T("Nothing imported yet.", Type.body(14.sp, Palette.Ink3), Modifier.padding(16.dp))
                else -> overview.imports.forEachIndexed { index, item ->
                    val date = parseIsoMillis(item.importedAt ?: item.createdAt)?.let { formatShortDate(it) }
                    SettingsRow(
                        Icons.Import, item.fileName?.takeIf { it.isNotBlank() } ?: providerLabel(item.provider),
                        sub = listOfNotNull(providerLabel(item.provider), statusLabel(item), date).joinToString(" · "),
                        chevron = false, divider = index < overview.imports.lastIndex,
                        trailing = { SmallButton("Delete", enabled = state.busy == null) { app.imports.delete(item.id) } },
                    )
                }
            }
        }
        SubtleNote("Deleting an import removes the notes and chats it brought in.", Modifier.padding(top = 10.dp, start = 6.dp))
    }
}

@Composable
private fun UploadRow(source: UploadSource, open: Boolean, last: Boolean, enabled: Boolean, onToggle: () -> Unit, onUpload: () -> Unit) {
    SettingsRow(Icons.Import, source.label, sub = source.hint, chevron = true, divider = !open && !last, onClick = onToggle)
    if (open) {
        Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 14.dp)) {
            source.steps.forEachIndexed { i, step ->
                T("${i + 1}. $step", Type.body(13.5.sp, Palette.Ink2), Modifier.padding(bottom = 6.dp))
            }
            PrimaryButton("Choose file", Modifier.padding(top = 6.dp), enabled = enabled, onClick = onUpload)
        }
    }
}

@Composable
private fun SpeakerSheet(app: AppController, detail: ImportDetailDto) {
    val sheet = LocalSheet.current
    val needsSpeaker = detail.speakers.size > 1
    var choice by remember(detail.import.id) { mutableStateOf(detail.personSpeaker ?: detail.speakers.singleOrNull()) }
    val found = "${detail.items.size} item${if (detail.items.size == 1) "" else "s"} found"
    if (needsSpeaker) {
        T("Which one is you?", Type.display(26.sp))
        Paragraph("This chat has more than one speaker. Aidoraa will learn from what you said and treat the rest as context.", Modifier.padding(top = 6.dp, bottom = 12.dp))
        detail.speakers.forEach { speaker ->
            SmallButton(speaker, Modifier.fillMaxWidth().padding(bottom = 8.dp), on = choice == speaker) { choice = speaker }
        }
    } else {
        T("Import these?", Type.display(26.sp))
        Paragraph("Aidoraa reads their text once. You can delete the import later, and what it added goes with it.", Modifier.padding(top = 6.dp, bottom = 12.dp))
        detail.items.take(8).forEach { item ->
            T("•  ${item.title.ifBlank { "Untitled" }}", Type.body(14.sp, Palette.Ink2), Modifier.padding(bottom = 4.dp))
        }
    }
    T(found, Type.body(13.sp, Palette.Ink3), Modifier.padding(top = 4.dp, bottom = 12.dp))
    PrimaryButton("Import", enabled = !needsSpeaker || choice != null) {
        sheet.hide()
        app.imports.confirm(detail, choice)
    }
    TextLink("Cancel and delete this import", Modifier.padding(top = 12.dp), color = Palette.Ink2) {
        sheet.hide()
        app.imports.cancelReview()
    }
}

@Composable
private fun NotionPagesSheet(app: AppController) {
    val sheet = LocalSheet.current
    val state by app.imports.state.collectAsState()
    var chosen by remember { mutableStateOf(setOf<String>()) }
    val pages = state.notionPages.orEmpty()
    T("Choose pages", Type.display(26.sp))
    Paragraph("Pick up to 25 pages. Aidoraa reads their text once.", Modifier.padding(top = 6.dp, bottom = 12.dp))
    if (pages.isEmpty()) T("No pages are shared with Aidoraa yet. In Notion, share pages with the Aidoraa connection first.", Type.body(14.sp, Palette.Ink3))
    pages.forEach { page ->
        val on = page.id in chosen
        SmallButton(page.title.ifBlank { "Untitled" }, Modifier.fillMaxWidth().padding(bottom = 8.dp), on = on,
            enabled = on || chosen.size < 25) {
            chosen = if (on) chosen - page.id else chosen + page.id
        }
    }
    if (state.notionCursor != null) TextLink("Show more", Modifier.padding(bottom = 10.dp)) { app.imports.loadNotionPages(more = true) }
    PrimaryButton(if (chosen.isEmpty()) "Import" else "Import ${chosen.size}", Modifier.padding(top = 6.dp), enabled = chosen.isNotEmpty()) {
        sheet.hide()
        app.imports.importNotion(chosen.toList())
    }
    TextLink("Cancel", Modifier.padding(top = 12.dp), color = Palette.Ink2) {
        sheet.hide()
        app.imports.closeNotionPages()
    }
}
