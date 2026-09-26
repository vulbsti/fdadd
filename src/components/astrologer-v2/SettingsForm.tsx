'use client';

import { useEffect, useRef, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BirthValues {
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  timezone: string;
  place_name: string | null;
  time_source: string;
  time_confidence: string;
}

interface PlaceCandidate {
  id: string;
  place: string;
  region: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface SettingsFormProps {
  personId: string;
  name: string;
  astrologyEnabled: boolean;
  modeEpoch: number;
  astroStatus: 'not_configured' | 'pending' | 'ready' | 'failed' | 'disabled';
  initializationError: string | null;
  birth: BirthValues | null;
}

const SOURCE_OPTIONS = [
  ['hospital', 'Hospital record'],
  ['birth_record', 'Birth record / certificate'],
  ['family', 'Family memory'],
  ['approximate', 'Approximate estimate'],
  ['unknown', 'Not sure'],
] as const;

export default function SettingsForm({ personId, name, astrologyEnabled, modeEpoch, astroStatus: initialStatus, initializationError, birth }: SettingsFormProps) {
  const [enabled, setEnabled] = useState(astrologyEnabled);
  const [astroStatus, setAstroStatus] = useState(initialStatus);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState(initialStatus === 'failed' ? initializationError : null);
  const [date, setDate] = useState(birth?.date ?? '');
  const [time, setTime] = useState(birth?.time?.slice(0, 5) ?? '');
  const [timeSource, setTimeSource] = useState(birth?.time_source ?? 'unknown');
  const [timeConfidence, setTimeConfidence] = useState(birth?.time_confidence ?? 'unknown');
  const [query, setQuery] = useState(birth?.place_name ?? '');
  const [selectedPlace, setSelectedPlace] = useState<PlaceCandidate | null>(birth?.place_name && birth.latitude !== undefined
    ? { id: 'saved-birth-place', place: birth.place_name, region: null, latitude: birth.latitude, longitude: birth.longitude, timezone: birth.timezone }
    : null);
  const [places, setPlaces] = useState<PlaceCandidate[]>([]);
  const [placeMessage, setPlaceMessage] = useState<string | null>(null);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [savingBirth, setSavingBirth] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const querySequence = useRef(0);
  const birthRequestId = useRef<string | null>(null);
  const birthReady = astroStatus === 'ready';
  const birthPending = astroStatus === 'pending';

  useEffect(() => {
    if (!birthPending) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/astrologer/profiles/${personId}/birth`, { cache: 'no-store' });
        if (!response.ok) return;
        const result = await response.json() as { status?: typeof astroStatus; error?: string | null };
        if (result.status && result.status !== 'pending') {
          setAstroStatus(result.status);
          if (result.status === 'ready') setStatusMessage('Birth details are saved and the chart and sensitivity profile are ready.');
          if (result.status === 'failed') setErrorMessage(result.error || 'Chart calculation failed. Check the details and try again.');
        }
      } catch {
        // The persisted state remains available on refresh; keep polling quietly.
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [birthPending, personId]);

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2 || selectedPlace) return;
    const sequence = ++querySequence.current;
    const timer = window.setTimeout(async () => {
      setPlaceLoading(true);
      setPlaceMessage(null);
      try {
        const response = await fetch(`/api/astrologer/places?q=${encodeURIComponent(search)}`);
        if (!response.ok) throw new Error('lookup failed');
        const result = await response.json() as { places?: PlaceCandidate[] };
        if (sequence !== querySequence.current) return;
        setPlaces(result.places ?? []);
        setPlaceMessage(result.places?.length ? null : 'No matching places found.');
      } catch {
        if (sequence === querySequence.current) {
          setPlaces([]);
          setPlaceMessage('Could not search places. Try again.');
        }
      } finally {
        if (sequence === querySequence.current) setPlaceLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, selectedPlace]);

  function choosePlace(candidate: PlaceCandidate) {
    querySequence.current += 1;
    setSelectedPlace(candidate);
    setQuery([candidate.place, candidate.region].filter(Boolean).join(', '));
    setPlaces([]);
    setPlaceMessage(null);
  }

  function clearPlace() {
    querySequence.current += 1;
    setSelectedPlace(null);
    setQuery('');
    setPlaces([]);
  }

  function updatePlaceQuery(value: string) {
    setSelectedPlace(null);
    setQuery(value);
    setPlaces([]);
    setPlaceMessage(null);
    setPlaceLoading(false);
  }

  async function saveBirth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    if (!selectedPlace) {
      setPlaceMessage('Choose a result so we can use its coordinates and timezone.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setErrorMessage('Enter a valid birth date and time.');
      return;
    }
    setSavingBirth(true);
    try {
      const response = await fetch(`/api/astrologer/profiles/${personId}/birth`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientRequestId: birthRequestId.current ?? (birthRequestId.current = crypto.randomUUID()),
          birth: {
            date, time,
            latitude: selectedPlace.latitude,
            longitude: selectedPlace.longitude,
            timezone: selectedPlace.timezone,
            place_name: query.trim(),
            time_source: timeSource,
            time_confidence: timeConfidence,
          },
        }),
      });
      const result = await response.json().catch(() => null) as { message?: string; status?: string } | null;
      if (!response.ok) {
        setErrorMessage(result?.message ?? 'Could not save birth details. Please try again.');
        return;
      }
      birthRequestId.current = null;
      setAstroStatus('pending');
      setEnabled(false);
      setStatusMessage('Birth details saved. Calculating the chart and sensitivity profile…');
      window.setTimeout(() => window.location.reload(), 350);
    } catch {
      setErrorMessage('Could not reach the astrologer service. Your previous personal map is still available.');
    } finally {
      setSavingBirth(false);
    }
  }

  async function changeAstrology(next: boolean) {
    if (next && !birthReady) {
      setSettingsMessage('Finish birth setup before enabling the astrology layer. Personal mode remains available.');
      return;
    }
    setSettingsMessage('Saving…');
    const response = await fetch(`/api/astrologer/profiles/${personId}/preferences`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ astrologyEnabled: next, expectedModeEpoch: modeEpoch, clientCommandId: crypto.randomUUID() }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) { setSettingsMessage(body?.message ?? 'Could not save this setting.'); return; }
    setEnabled(next);
    setSettingsMessage(next ? 'Astrology layer enabled.' : 'Personal-only mode enabled.');
    window.location.reload();
  }

  return (
    <div className="max-w-3xl px-5 py-10 md:px-10">
      <h1 className="font-serif text-5xl">Settings</h1>
      <p className="mt-2 text-[#52627a]">Preferences for {name}.</p>

      <section className="mt-8 rounded-md border border-[#ded9d0] p-6">
        <h2 className="font-serif text-2xl">Birth details</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[#52627a]">Add or correct birth information for this same person. Each submission creates a saved revision and recalculates the chart and sensitivity profile. Your personal map and conversations stay available.</p>
        {birthPending ? <p role="status" data-testid="birth-status" className="mt-4 rounded-md bg-[#f5f0e8] p-3 text-sm">{statusMessage ?? 'Chart setup is in progress. You can keep using the personal map.'}</p> : null}
        {statusMessage && !birthPending ? <p role="status" data-testid="birth-status" className="mt-4 text-sm text-[#40516d]">{statusMessage}</p> : null}
        {errorMessage ? <p role="alert" data-testid="birth-status" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">Chart setup failed: {errorMessage} Birth details can be retried below.</p> : null}

        <form data-testid="birth-setup-form" onSubmit={(event) => void saveBirth(event)} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="birth-date">Birth date</Label>
            <Input id="birth-date" data-testid="birth-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required disabled={birthPending || savingBirth} />
          </div>
          <div>
            <Label htmlFor="birth-time">Birth time (HH:MM)</Label>
            <Input id="birth-time" data-testid="birth-time" type="time" step={60} value={time} onChange={(event) => setTime(event.target.value)} required disabled={birthPending || savingBirth} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="birth-place">Birth place</Label>
            {selectedPlace ? (
              <div className="mt-1 flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
                <span className="truncate">{query} <span className="text-muted-foreground">· {selectedPlace.timezone}</span></span>
                <Button type="button" variant="ghost" size="sm" onClick={clearPlace} disabled={birthPending || savingBirth}>Change</Button>
              </div>
            ) : <Input id="birth-place" data-testid="birth-place" autoComplete="off" value={query} onChange={(event) => updatePlaceQuery(event.target.value)} placeholder="Search city or town" disabled={birthPending || savingBirth} />}
            {placeLoading ? <p className="mt-1 text-xs text-muted-foreground">Searching places…</p> : null}
            {places.length > 0 ? <ul className="mt-1 max-h-52 overflow-auto rounded-md border border-[#ded9d0] bg-white" role="listbox" aria-label="Birth place results">{places.map((place) => <li key={place.id}><button type="button" role="option" aria-selected="false" className="w-full px-3 py-2 text-left text-sm hover:bg-[#f5f0e8]" onClick={() => choosePlace(place)}>{[place.place, place.region].filter(Boolean).join(', ')}<span className="block text-xs text-muted-foreground">{place.timezone}</span></button></li>)}</ul> : null}
            {placeMessage ? <p className="mt-1 text-sm text-red-700">{placeMessage}</p> : null}
          </div>
          <div>
            <Label htmlFor="birth-time-source">Time source</Label>
            <select id="birth-time-source" value={timeSource} onChange={(event) => setTimeSource(event.target.value)} disabled={birthPending || savingBirth} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="birth-time-confidence">Time confidence</Label>
            <select id="birth-time-confidence" value={timeConfidence} onChange={(event) => setTimeConfidence(event.target.value)} disabled={birthPending || savingBirth} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="exact">Exact</option>
              <option value="approximate">Approximate</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" data-testid="birth-submit" disabled={birthPending || savingBirth || placeLoading}>
              {savingBirth ? 'Saving…' : birthReady ? 'Save new details and recalculate chart' : errorMessage ? 'Retry chart setup' : 'Save details and calculate chart'}
            </Button>
            {birthReady ? <p className="mt-2 text-xs text-[#52627a]">The saved chart is frozen until you submit a new revision.</p> : null}
          </div>
        </form>
      </section>

      <section className="mt-5 rounded-md border border-[#ded9d0] p-6">
        <div className="flex items-start justify-between gap-6"><div><h2 className="font-serif text-2xl">Astrology layer</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#52627a]">When off, calculations, interpretations, astrological suggestions, and Atros tools are excluded from new runs and profile views. Personal history remains.</p></div><Switch checked={enabled} onCheckedChange={(next) => void changeAstrology(next)} aria-label="Astrology layer" disabled={!birthReady && !enabled} /></div>
        {!birthReady ? <p className="mt-4 rounded-md bg-[#f5f0e8] p-3 text-sm">Personal-only mode is available while birth details are missing or chart setup is in progress.</p> : null}
        {settingsMessage ? <p role="status" className="mt-4 text-sm text-[#40516d]">{settingsMessage}</p> : null}
      </section>
      <section className="mt-5 rounded-md border border-[#ded9d0] p-6"><h2 className="font-serif text-2xl">Privacy & data</h2><p className="mt-2 text-sm leading-6 text-[#52627a]">This person is owner-only. Source exclusion, export, and deletion require explicit confirmed operations; no public-sharing mode is enabled.</p></section>
    </div>
  );
}
