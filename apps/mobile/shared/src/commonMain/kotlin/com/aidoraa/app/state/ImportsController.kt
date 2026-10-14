package com.aidoraa.app.state

import com.aidoraa.app.data.ApiException
import com.aidoraa.app.data.ImportDetailDto
import com.aidoraa.app.data.ImportsOverviewDto
import com.aidoraa.app.data.NotionPageDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** An export the person can upload, as the website's imports page lists them. */
data class UploadSource(val provider: String, val label: String, val hint: String, val steps: List<String>)

val UPLOAD_SOURCES = listOf(
    UploadSource("google_keep", "Google Keep", "Through Google Takeout", listOf(
        "Open takeout.google.com, choose only Keep, and create the export.",
        "Download the .zip Google emails you.",
        "Upload the .zip here as it is. Only the note text is read.")),
    UploadSource("chatgpt", "ChatGPT", "Settings, then Export data", listOf(
        "In ChatGPT, open Settings, then Data controls, and choose Export data.",
        "OpenAI emails you a download link. Download the .zip.",
        "Upload the .zip here. Only the conversation text is read; images stay on your phone.")),
    UploadSource("claude", "Claude", "Settings, then Export data", listOf(
        "In Claude, open Settings, then Privacy, and choose Export data.",
        "Download the .zip from the email.",
        "Upload the .zip here as it is.")),
    UploadSource("gemini", "Gemini", "Through Google Takeout", listOf(
        "Open takeout.google.com, choose My Activity and filter to Gemini Apps.",
        "Download the .zip Google emails you.",
        "Upload the .zip here as it is.")),
    UploadSource("other", "Other chats", "WhatsApp, DeepSeek, Meta AI and more", listOf(
        "Export the chat as a .zip, .json or .txt file from the app it lives in.",
        "Upload it here. You'll be asked which speaker is you.")),
)

data class ImportsUiState(
    val overview: ImportsOverviewDto? = null,
    val loading: Boolean = false,
    val busy: String? = null,
    val error: String? = null,
    /** An upload that was read and needs the person to say which speaker they are. */
    val review: ImportDetailDto? = null,
    val notionPages: List<NotionPageDto>? = null,
    val notionCursor: String? = null,
)

/** Imports and connections for the active person. */
class ImportsController(private val app: AppController) {
    private val _state = MutableStateFlow(ImportsUiState())
    val state: StateFlow<ImportsUiState> = _state.asStateFlow()

    fun reset() { _state.value = ImportsUiState() }

    private fun person(): String? = app.personId.value

    fun load() {
        val personId = person() ?: return
        _state.value = _state.value.copy(loading = _state.value.overview == null, error = null)
        app.scope.launch {
            try {
                _state.value = _state.value.copy(overview = app.api.imports(personId), loading = false)
            } catch (c: CancellationException) { throw c } catch (error: Exception) {
                _state.value = _state.value.copy(loading = false, error = error.message)
            }
        }
    }

    private fun busy(label: String?) { _state.value = _state.value.copy(busy = label) }

    fun connect(service: String) {
        val personId = person() ?: return
        app.platform.openInAppBrowser(app.api.connectorStartUrl(service, personId))
    }

    fun disconnect(service: String) {
        app.scope.launch {
            busy("Disconnecting")
            try { app.api.disconnect(service); app.toast("Disconnected"); load() }
            catch (c: CancellationException) { throw c } catch (error: Exception) { _state.value = _state.value.copy(error = error.message) }
            finally { busy(null) }
        }
    }

    /** Called when the browser returns to aidoraa://connectors/<service>?result=... */
    fun connectorReturned(service: String, result: String?) {
        when (result) {
            "connected" -> app.toast("${if (service == "notion") "Notion" else "Google Drive"} connected")
            "cancelled" -> app.toast("Connection cancelled")
            "failed" -> app.toast("That connection didn't work. Please try again.")
        }
        load()
    }

    fun upload(source: UploadSource) {
        val personId = person() ?: return
        app.scope.launch {
            try {
                val files = app.platform.pickFiles(listOf("application/zip", "application/json", "text/plain", "text/markdown", "application/octet-stream"))
                if (files.isEmpty()) return@launch
                busy("Preparing ${source.label}")
                val archive = app.platform.buildImportArchive(files)
                busy("Uploading")
                val target = app.api.createImport(personId, source.provider, files.first().name.take(300))
                app.api.uploadToSignedUrl(target, archive)
                busy("Reading your export")
                val detail = app.api.parseImport(personId, target.importId)
                if (detail.items.isEmpty()) {
                    _state.value = _state.value.copy(error = detail.import.error ?: "Nothing readable was found in that file.")
                    load(); return@launch
                }
                if (detail.speakers.size > 1 && detail.personSpeaker == null) {
                    _state.value = _state.value.copy(review = detail)
                } else {
                    confirm(detail, detail.personSpeaker ?: detail.speakers.singleOrNull())
                }
            } catch (c: CancellationException) { throw c } catch (error: Exception) {
                _state.value = _state.value.copy(error = error.message ?: "The import didn't finish.")
                load()
            } finally { busy(null) }
        }
    }

    /** Imports every item the export contained (the person can delete the import afterwards). */
    fun confirm(detail: ImportDetailDto, speaker: String?) {
        val personId = person() ?: return
        _state.value = _state.value.copy(review = null)
        app.scope.launch {
            busy("Importing")
            try {
                val ids = detail.items.filter { it.duplicateState != "duplicate" }.map { it.id }.ifEmpty { detail.items.map { it.id } }
                val result = app.api.confirmImport(personId, detail.import.id, ids, speaker)
                app.toast("Imported ${result.imported} ${if (result.imported == 1) "item" else "items"}")
                load()
                app.loadLife()
            } catch (c: CancellationException) { throw c } catch (error: Exception) {
                _state.value = _state.value.copy(error = error.message)
            } finally { busy(null) }
        }
    }

    fun cancelReview() {
        val review = _state.value.review ?: return
        _state.value = _state.value.copy(review = null)
        delete(review.import.id, quiet = true)
    }

    fun delete(importId: String, quiet: Boolean = false) {
        val personId = person() ?: return
        app.scope.launch {
            try {
                app.api.deleteImport(personId, importId)
                if (!quiet) app.toast("Import deleted")
                load()
            } catch (c: CancellationException) { throw c } catch (error: Exception) {
                _state.value = _state.value.copy(error = error.message)
            }
        }
    }

    fun loadNotionPages(more: Boolean = false) {
        val personId = person() ?: return
        app.scope.launch {
            try {
                val page = app.api.notionPages(personId, if (more) _state.value.notionCursor else null)
                val pages = if (more) _state.value.notionPages.orEmpty() + page.pages else page.pages
                _state.value = _state.value.copy(notionPages = pages, notionCursor = page.nextCursor)
            } catch (c: CancellationException) { throw c } catch (error: ApiException) {
                _state.value = _state.value.copy(error = error.message, notionPages = null)
                if (error.code == "notion_disconnected") load()
            }
        }
    }

    fun closeNotionPages() { _state.value = _state.value.copy(notionPages = null, notionCursor = null) }

    fun importNotion(pageIds: List<String>) {
        val personId = person() ?: return
        closeNotionPages()
        app.scope.launch {
            try {
                var importId: String? = null
                pageIds.chunked(10).forEachIndexed { index, chunk ->
                    busy("Fetching pages ${index * 10 + 1} to ${index * 10 + chunk.size} of ${pageIds.size}")
                    importId = app.api.importNotionPages(personId, importId, chunk).importId
                }
                val id = importId ?: return@launch
                confirm(app.api.importDetail(personId, id), null)
            } catch (c: CancellationException) { throw c } catch (error: Exception) {
                _state.value = _state.value.copy(error = error.message)
            } finally { busy(null) }
        }
    }

    fun clearError() { _state.value = _state.value.copy(error = null) }
}
