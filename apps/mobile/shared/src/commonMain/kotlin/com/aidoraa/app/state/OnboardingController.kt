package com.aidoraa.app.state

import com.aidoraa.app.core.randomUuid
import com.aidoraa.app.data.BirthDto
import com.aidoraa.app.data.BirthSetupRequest
import com.aidoraa.app.data.PlaceDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class OnboardingStep { Name, Birth, Building }

data class OnboardingState(
    val step: OnboardingStep = OnboardingStep.Name,
    val name: String = "",
    val day: String = "",
    val month: String = "",
    val year: String = "",
    val time: String = "",
    val timeUnknown: Boolean = false,
    val placeQuery: String = "",
    val placeResults: List<PlaceDto> = emptyList(),
    val place: PlaceDto? = null,
    val busy: Boolean = false,
    val error: String? = null,
    val personId: String? = null,
    /** 0..1 for the "building your picture" screen. */
    val progress: Float = 0f,
    val ready: Boolean = false,
    /** Whether this is the first person (first run) or another person added later. */
    val firstRun: Boolean = true,
)

/** Pure validation of the birth form; returns the request body or an error message. */
object BirthForm {
    fun build(state: OnboardingState): Pair<BirthDto?, String?> {
        val day = state.day.trim().toIntOrNull()
        val month = state.month.trim().toIntOrNull()
        val year = state.year.trim().toIntOrNull()
        if (day == null || month == null || year == null || month !in 1..12 || day !in 1..daysIn(month, year) || year !in 1900..2100) {
            return null to "Enter a real date of birth."
        }
        val time = if (state.timeUnknown) "12:00" else normalizeTime(state.time) ?: return null to "Enter the time as hours and minutes, like 07:30."
        val place = state.place ?: return null to "Choose the place of birth from the list."
        val date = "${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}"
        return BirthDto(
            date = date, time = time, latitude = place.latitude, longitude = place.longitude, timezone = place.timezone,
            placeName = listOfNotNull(place.place, place.region).joinToString(", ").take(300),
            timeSource = if (state.timeUnknown) "unknown" else "user",
            timeConfidence = if (state.timeUnknown) "unknown" else "stated",
        ) to null
    }

    fun normalizeTime(raw: String): String? {
        val match = Regex("""^\s*(\d{1,2})[:.](\d{2})\s*$""").matchEntire(raw) ?: Regex("""^\s*(\d{2})(\d{2})\s*$""").matchEntire(raw) ?: return null
        val hour = match.groupValues[1].toInt(); val minute = match.groupValues[2].toInt()
        if (hour !in 0..23 || minute !in 0..59) return null
        return "${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}"
    }

    fun daysIn(month: Int, year: Int): Int = when (month) {
        2 -> if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) 29 else 28
        4, 6, 9, 11 -> 30
        else -> 31
    }
}

/** "Whose life are we understanding?": name, optional birth details, then the build. */
class OnboardingController(private val app: AppController) {
    private val _state = MutableStateFlow(OnboardingState())
    val state: StateFlow<OnboardingState> = _state.asStateFlow()
    private var searchJob: Job? = null
    private var pollJob: Job? = null
    private var nameCommand: Pair<String, String>? = null

    val inProgress: Boolean get() = _state.value.personId != null && !_state.value.ready

    fun begin(firstRun: Boolean) {
        pollJob?.cancel()
        nameCommand = null
        _state.value = OnboardingState(firstRun = firstRun)
    }

    fun update(transform: (OnboardingState) -> OnboardingState) { _state.value = transform(_state.value).copy(error = null) }

    fun back(): Boolean {
        val state = _state.value
        if (state.step == OnboardingStep.Birth && state.personId == null) { _state.value = state.copy(step = OnboardingStep.Name); return true }
        return false
    }

    fun submitName() {
        val name = _state.value.name.trim()
        if (name.isEmpty()) { _state.value = _state.value.copy(error = "Enter a name."); return }
        if (nameCommand?.first != name) nameCommand = name to randomUuid()
        app.scope.launch {
            _state.value = _state.value.copy(busy = true)
            try {
                val created = app.api.createPerson(name, nameCommand!!.second)
                val id = created.profileId ?: error("Could not create this person.")
                _state.value = _state.value.copy(personId = id, step = OnboardingStep.Birth, busy = false)
            } catch (c: CancellationException) { throw c } catch (error: Exception) {
                _state.value = _state.value.copy(busy = false, error = error.message ?: "Could not create this person.")
            }
        }
    }

    fun searchPlaces(query: String) {
        _state.value = _state.value.copy(placeQuery = query, place = null, error = null)
        searchJob?.cancel()
        if (query.trim().length < 2) { _state.value = _state.value.copy(placeResults = emptyList()); return }
        searchJob = app.scope.launch {
            delay(300)
            try {
                _state.value = _state.value.copy(placeResults = app.api.places(query.trim()))
            } catch (c: CancellationException) { throw c } catch (_: Exception) { }
        }
    }

    fun choosePlace(place: PlaceDto) {
        _state.value = _state.value.copy(place = place, placeQuery = listOfNotNull(place.place, place.region).joinToString(", "), placeResults = emptyList())
    }

    fun submitBirth() {
        val state = _state.value
        val personId = state.personId ?: return
        val (birth, problem) = BirthForm.build(state)
        if (birth == null) { _state.value = state.copy(error = problem); return }
        app.scope.launch {
            _state.value = _state.value.copy(busy = true)
            try {
                app.api.setBirth(personId, BirthSetupRequest(randomUuid(), birth))
                _state.value = _state.value.copy(busy = false, step = OnboardingStep.Building)
                watchBuild(personId)
            } catch (c: CancellationException) { throw c } catch (error: Exception) {
                _state.value = _state.value.copy(busy = false, error = error.message ?: "Couldn't save the birth details.")
            }
        }
    }

    /** Skip birth details: the picture is built from what the person shares instead. */
    fun skipBirth() {
        val personId = _state.value.personId ?: return
        _state.value = _state.value.copy(step = OnboardingStep.Building, progress = 1f, ready = true)
        app.personCreated(personId)
    }

    private fun watchBuild(personId: String) {
        pollJob?.cancel()
        pollJob = app.scope.launch {
            var elapsed = 0
            while (true) {
                val status = try { app.api.birthStatus(personId) } catch (c: CancellationException) { throw c } catch (_: Exception) { null }
                val init = status?.initializationStatus ?: status?.status
                // Progress eases toward 90% until the server says ready.
                val eased = 0.9f * (1f - 1f / (1f + elapsed / 20f))
                when (init) {
                    "ready" -> { _state.value = _state.value.copy(progress = 1f, ready = true); app.personCreated(personId); return@launch }
                    "failed" -> {
                        _state.value = _state.value.copy(error = "We couldn't finish the picture from those details. You can carry on and add them again later.", ready = true, progress = 1f)
                        app.personCreated(personId); return@launch
                    }
                    else -> _state.value = _state.value.copy(progress = maxOf(_state.value.progress, eased))
                }
                delay(2500)
                elapsed += 3
            }
        }
    }

    fun finish() {
        pollJob?.cancel()
        val personId = _state.value.personId
        val firstRun = _state.value.firstRun
        _state.value = OnboardingState()
        if (personId != null) { app.selectPerson(personId); app.personCreated(personId) }
        if (firstRun) app.finishOnboarding() else { app.pop(); app.refresh() }
    }
}
