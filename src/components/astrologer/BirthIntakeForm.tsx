'use client';

/**
 * Birth intake form. Structured inputs: birth-place autocomplete (server
 * geocoding fills lat/lng/timezone), calendar date picker, native time
 * picker, and a bounded time-source select. Submit is unchanged:
 * POST /api/astrologer/sessions with {mode:'new_profile', clientRequestId, birth}.
 */

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarIcon, Loader2, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

const intakeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the birth date'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick the birth time'),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  timezone: z.string().min(1, 'Birth place sets the timezone').max(100),
  place_name: z.string().max(300).optional(),
  time_source: z.string().max(50).optional(),
  time_confidence: z.string().max(50).optional(),
});

export type IntakeValues = z.infer<typeof intakeSchema>;

interface PlaceCandidate {
  id: string;
  place: string;
  region: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface BirthIntakeFormProps {
  onSessionOpened: (sessionId: string) => void;
}

const TIME_SOURCES = [
  { value: 'hospital', label: 'Hospital record' },
  { value: 'birth_record', label: 'Birth record / certificate' },
  { value: 'family', label: 'Family memory' },
  { value: 'approximate', label: 'Approximate (estimate)' },
  { value: 'unknown', label: 'Not sure' },
] as const;

/** Time sources map to the frozen-profile confidence the agent rectifies against. */
const SOURCE_CONFIDENCE: Record<string, string> = {
  hospital: 'exact',
  birth_record: 'exact',
  family: 'approximate',
  approximate: 'approximate',
  unknown: 'unknown',
};

function formatDate(date: Date | undefined): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(raw: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default function BirthIntakeForm({ onSessionOpened }: BirthIntakeFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<PlaceCandidate[]>([]);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceCandidate | null>(null);
  const requestSeq = useRef(0);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<IntakeValues>({ resolver: zodResolver(intakeSchema) });

  // Register invisible fields filled by the place picker.
  useEffect(() => {
    register('place_name');
    register('date');
    register('latitude');
    register('longitude');
    register('timezone');
    register('time_source');
    register('time_confidence');
  }, [register]);

  const watchDate = watch('date');
  const parsedDate = parseDate(watchDate ?? '');

  useEffect(() => {
    if (query.trim().length < 2 || selectedPlace) {
      setPlaces([]);
      setPlaceError(null);
      setPlaceOpen(false);
      setPlaceLoading(false);
      return;
    }
    const seq = ++requestSeq.current;
    setPlaceLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/astrologer/places?q=${encodeURIComponent(query.trim())}`);
        if (seq !== requestSeq.current) return;
        if (!response.ok) throw new Error('search failed');
        const data = (await response.json()) as { places: PlaceCandidate[] };
        setPlaces(data.places);
        setPlaceError(data.places.length === 0 ? 'No matching places found.' : null);
        setPlaceOpen(data.places.length > 0);
      } catch {
        if (seq === requestSeq.current) {
          setPlaces([]);
          setPlaceError('Could not search places. Try again.');
          setPlaceOpen(false);
        }
      } finally {
        if (seq === requestSeq.current) setPlaceLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selectedPlace]);

  const choosePlace = useCallback(
    (candidate: PlaceCandidate) => {
      requestSeq.current += 1;
      setSelectedPlace(candidate);
      setPlaceOpen(false);
      setPlaceError(null);
      setPlaces([]);
      const display = [candidate.place, candidate.region].filter(Boolean).join(', ');
      setValue('place_name', display, { shouldValidate: true });
      setValue('latitude', candidate.latitude, { shouldValidate: true });
      setValue('longitude', candidate.longitude, { shouldValidate: true });
      setValue('timezone', candidate.timezone, { shouldValidate: true });
    },
    [setValue],
  );

  const resetPlace = () => {
    setSelectedPlace(null);
    setPlaces([]);
    setQuery('');
    setValue('place_name', undefined);
    setValue('latitude', Number.NaN, { shouldValidate: false });
    setValue('longitude', Number.NaN, { shouldValidate: false });
    setValue('timezone', '');
  };

  const onSubmit = async (values: IntakeValues) => {
    setServerError(null);
    try {
      const response = await fetch('/api/astrologer/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'new_profile',
          clientRequestId: crypto.randomUUID(),
          birth: values,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.sessionId) {
        setServerError(payload?.message ?? 'Could not open a session. Please try again.');
        return;
      }
      onSessionOpened(payload.sessionId as string);
    } catch {
      setServerError('Could not reach the astrologer service. Please try again.');
    }
  };

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>Birth details</CardTitle>
        <CardDescription>
          Your chart is calculated once and frozen — timing questions are answered against it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="astro-name">Name</Label>
            <Input id="astro-name" {...register('name')} placeholder="Full name" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="astro-place">Birth place</Label>
            {selectedPlace ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {selectedPlace.place}
                    {selectedPlace.region ? ` — ${selectedPlace.region}` : ''}
                  </span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{selectedPlace.timezone}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={resetPlace}
                  >
                    Change
                  </Button>
                </span>
              </div>
            ) : (
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="astro-place"
                  autoComplete="off"
                  className="pl-9"
                  placeholder="Search a city — e.g. Kanpur"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelectedPlace(null);
                  }}
                  onFocus={() => {
                    if (places.length > 0) setPlaceOpen(true);
                  }}
                />
                {placeLoading ? (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : null}
                {placeOpen && places.length > 0 ? (
                  <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-md">
                    {places.map((candidate) => (
                      <button
                        type="button"
                        key={candidate.id}
                        className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => choosePlace(candidate)}
                      >
                        <span>{candidate.place}</span>
                        <span className="text-xs text-muted-foreground">{candidate.region}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            {placeError && <p className="text-sm text-destructive">{placeError}</p>}
            {(errors.latitude || errors.timezone) && !selectedPlace && (
              <p className="text-sm text-destructive">Select a birth place from the list.</p>
            )}
          </div>

          <div>
            <Label htmlFor="astro-date">Birth date</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="astro-date"
                  type="button"
                  variant="outline"
                  className={cn(
                    'h-10 w-full justify-start font-normal',
                    !watchDate && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {watchDate ? watchDate : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parsedDate}
                  defaultMonth={parsedDate ?? new Date(2000, 0, 1)}
                  fromYear={1900}
                  toYear={new Date().getFullYear()}
                  captionLayout="dropdown"
                  onSelect={(day) => {
                    const formatted = formatDate(day);
                    setValue('date', formatted, { shouldValidate: true });
                    setDateOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
          </div>

          <div>
            <Label htmlFor="astro-time">Birth time</Label>
            <Input id="astro-time" type="time" {...register('time')} />
            {errors.time && <p className="text-sm text-destructive">{errors.time.message}</p>}
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="astro-source">Time source</Label>
            <Select
              defaultValue="unknown"
              onValueChange={(value) => {
                setValue('time_source', value === 'unknown' ? undefined : value);
                setValue('time_confidence', SOURCE_CONFIDENCE[value] ?? 'unknown');
              }}
            >
              <SelectTrigger id="astro-source" className="h-10">
                <SelectValue placeholder="How do you know this time?" />
              </SelectTrigger>
              <SelectContent>
                {TIME_SOURCES.map((source) => (
                  <SelectItem key={source.value} value={source.value}>
                    {source.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {serverError && <p className="text-sm text-destructive sm:col-span-2">{serverError}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Opening your reading…' : 'Open my reading'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
