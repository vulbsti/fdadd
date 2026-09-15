/**
 * Birth-place lookup for the intake form: server-proxied Open-Meteo
 * geocoding (no API key). Returns deduped city/locality candidates with
 * coordinates, IANA timezone, and display name. Client sends `?q=`.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const PlaceSchema = z.object({
  name: z.string(),
  admin1: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().nullable().optional(),
});
type OpenMeteoPlace = z.infer<typeof PlaceSchema>;

const ResultSchema = z.array(
  z.object({
    id: z.string(),
    place: z.string(),
    region: z.string().nullable(),
    country: z.string().nullable(),
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string(),
  }),
);
export type PlaceResult = z.infer<typeof ResultSchema>;

const FETCH_TIMEOUT_MS = 6_000;
const MIN_QUERY_LENGTH = 2;

/** Map one Open-Meteo result to a stable display candidate. */
function toResult(place: OpenMeteoPlace, index: number): PlaceResult[number] | null {
  const timezone = place.timezone || '';
  if (!timezone) return null;
  const region = [place.admin1, place.country].filter(Boolean).join(', ') || null;
  return {
    id: `${place.latitude},${place.longitude},${place.name}`,
    place: place.name,
    region,
    country: place.country ?? null,
    latitude: place.latitude,
    longitude: place.longitude,
    timezone,
  };
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ places: [] satisfies PlaceResult });
  }

  const endpoint = new URL('https://geocoding-api.open-meteo.com/v1/search');
  endpoint.searchParams.set('name', query);
  endpoint.searchParams.set('count', '8');
  endpoint.searchParams.set('language', 'en');
  endpoint.searchParams.set('format', 'json');

  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return NextResponse.json({ places: [] satisfies PlaceResult, error: 'geocoder_unavailable' });
    }
    const body = (await response.json()) as { results?: unknown[] };
    const parsed = z.array(PlaceSchema).safeParse(body.results ?? []);
    const places = parsed.success
      ? parsed.data.map(toResult).filter((p): p is PlaceResult[number] => p !== null)
      : [];
    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ places: [] satisfies PlaceResult, error: 'geocoder_unavailable' });
  }
}
