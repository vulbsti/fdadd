/**
 * Astrologer server tool implementations.
 *
 * These run on the server with the request's Supabase client (RLS user
 * context) and are never model-callable directly — the agent loop in
 * `loop.ts` exposes OpenAI-style schemas that dispatch here. CLI
 * `--root/--name` path args are forbidden: everything is scoped to
 * `(user_id, profile_id)` rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseBirthData,
  runAtros,
  chartArgs,
  dashaArgs,
  currentArgs,
  timelineArgs,
  transitArgs,
  sensitivityArgs,
  type AtrosResult,
  type BirthDataInput,
} from './atros-commands';

export interface ProfileRow {
  id: string;
  user_id: string;
  name: string;
  birth_date: string;
  birth_time: string;
  lat: number;
  lng: number;
  tz: string;
  place_name: string | null;
  time_source: string;
  time_confidence: string;
  chart_json: unknown | null;
  sensitivity_json: unknown | null;
}

function birthFromProfile(profile: ProfileRow): BirthDataInput {
  return parseBirthData({
    name: profile.name,
    date: profile.birth_date,
    time: profile.birth_time,
    latitude: profile.lat,
    longitude: profile.lng,
    timezone: profile.tz,
    ...(profile.place_name ? { place_name: profile.place_name } : {}),
  });
}

function logCall(
  userId: string,
  sessionId: string,
  toolName: string,
  ms: number,
  ok: boolean,
): void {
  console.info(
    JSON.stringify({ scope: 'astrologer-tool', user_id: userId, session_id: sessionId, tool_name: toolName, ms, ok }),
  );
}

async function timed<T>(
  userId: string,
  sessionId: string,
  toolName: string,
  fn: () => Promise<T & { ok: boolean }>,
): Promise<T> {
  const started = Date.now();
  const result = await fn();
  logCall(userId, sessionId, toolName, Date.now() - started, result.ok);
  return result;
}

async function requireProfile(
  client: SupabaseClient,
  userId: string,
  profileId: string,
): Promise<ProfileRow> {
  const { data, error } = await client
    .from('astro_profiles')
    .select('*')
    .eq('id', profileId)
    .eq('user_id', userId)
    .single();
  if (error || !data) throw new Error('profile not found');
  return data as ProfileRow;
}

export async function astroProfileGet(
  client: SupabaseClient,
  userId: string,
  profileId: string,
): Promise<ProfileRow> {
  return requireProfile(client, userId, profileId);
}

export interface ProfileInitInput extends BirthDataInput {
  time_source?: string;
  time_confidence?: string;
}

/**
 * Insert the profile row, then fire chart+sensitivity in parallel and freeze
 * the results into `chart_json`/`sensitivity_json` (never recomputed after).
 */
export async function astroProfileInit(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  input: ProfileInitInput,
): Promise<ProfileRow> {
  const birth = parseBirthData(input);
  const { data, error } = await client
    .from('astro_profiles')
    .insert({
      user_id: userId,
      name: birth.name,
      birth_date: birth.date,
      birth_time: birth.time,
      lat: birth.latitude,
      lng: birth.longitude,
      tz: birth.timezone,
      place_name: birth.place_name ?? null,
      time_source: input.time_source ?? 'unknown',
      time_confidence: input.time_confidence ?? 'unknown',
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`profile init failed: ${error?.message ?? 'unknown'}`);
  const profile = data as ProfileRow;

  const [chart, sensitivity] = await Promise.all([
    timed(userId, sessionId, 'atros_chart', () => runAtros(chartArgs(birth), { sessionId })),
    timed(userId, sessionId, 'atros_sensitivity', () =>
      runAtros(sensitivityArgs(birth), { sessionId }),
    ),
  ]);
  if (!chart.ok) throw new Error(`chart failed: ${chart.error.message}`);
  if (!sensitivity.ok) throw new Error(`sensitivity failed: ${sensitivity.error.message}`);

  const { data: frozen, error: freezeError } = await client
    .from('astro_profiles')
    .update({ chart_json: chart.data, sensitivity_json: sensitivity.data })
    .eq('id', profile.id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (freezeError || !frozen) throw new Error('could not freeze chart facts');
  return frozen as ProfileRow;
}

export interface EventInput {
  on_date: string;
  title: string;
  detail?: string;
  fit?: string;
}

export async function astroEventAdd(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  profileId: string,
  input: EventInput,
): Promise<Record<string, unknown>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.on_date)) throw new Error('on_date must be YYYY-MM-DD');
  const profile = await requireProfile(client, userId, profileId);
  const birth = birthFromProfile(profile);

  // Tag the event with the active MD/AD/PD chain from a 2-day timeline window.
  let chain: Record<string, unknown> = {};
  try {
    const next = new Date(`${input.on_date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const to = next.toISOString().slice(0, 10);
    const timeline = await timed(userId, sessionId, 'atros_timeline', () =>
      runAtros(timelineArgs(birth, input.on_date, to, 'sookshma'), { sessionId }),
    );
    const rows = (timeline.ok ? (timeline.data as { rows?: unknown[] }).rows : []) ?? [];
    const first = rows[0] as
      | { mahadasha?: { planet?: string }; antardasha?: { planet?: string }; pratyantar?: { planet?: string }; sookshma?: { planet?: string } }
      | undefined;
    if (first) {
      chain = {
        mahadasha: first.mahadasha?.planet ?? null,
        antardasha: first.antardasha?.planet ?? null,
        pratyantar: first.pratyantar?.planet ?? null,
        sookshma: first.sookshma?.planet ?? null,
      };
    }
  } catch {
    chain = {};
  }

  const { data, error } = await client
    .from('astro_events')
    .insert({
      user_id: userId,
      profile_id: profileId,
      on_date: input.on_date,
      title: input.title,
      detail: input.detail ?? '',
      chain,
      fit: input.fit ?? 'unassessed',
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`event insert failed: ${error?.message ?? 'unknown'}`);
  return data as Record<string, unknown>;
}

export interface HypothesisInput {
  hid: string;
  claim: string;
  predictions: string[];
  tests: string[];
  status?: 'open' | 'confirmed' | 'eliminated' | 'ambiguous';
}

export async function astroHypothesisUpsert(
  client: SupabaseClient,
  userId: string,
  profileId: string,
  input: HypothesisInput,
): Promise<Record<string, unknown>> {
  await requireProfile(client, userId, profileId);
  const { data, error } = await client
    .from('astro_hypotheses')
    .upsert(
      {
        user_id: userId,
        profile_id: profileId,
        hid: input.hid,
        claim: input.claim,
        predictions: input.predictions,
        tests: input.tests,
        status: input.status ?? 'open',
      },
      { onConflict: 'profile_id,hid' },
    )
    .select('*')
    .single();
  if (error || !data) throw new Error(`hypothesis upsert failed: ${error?.message ?? 'unknown'}`);
  return data as Record<string, unknown>;
}

export async function astroHypothesisStatus(
  client: SupabaseClient,
  userId: string,
  profileId: string,
  hid: string,
  status: 'open' | 'confirmed' | 'eliminated' | 'ambiguous',
): Promise<Record<string, unknown>> {
  await requireProfile(client, userId, profileId);
  const { data, error } = await client
    .from('astro_hypotheses')
    .update({ status })
    .eq('profile_id', profileId)
    .eq('hid', hid)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error || !data) throw new Error(`hypothesis ${hid} not found`);
  return data as Record<string, unknown>;
}

export async function astroEliminationTable(
  client: SupabaseClient,
  userId: string,
  profileId: string,
): Promise<Array<{ id: string; claim: string; status: string; tests: unknown }>> {
  await requireProfile(client, userId, profileId);
  const { data, error } = await client
    .from('astro_hypotheses')
    .select('hid, claim, status, tests')
    .eq('profile_id', profileId)
    .eq('user_id', userId);
  if (error) throw new Error(`elimination table failed: ${error.message}`);
  return (data ?? []).map((h: { hid: string; claim: string; status: string; tests: unknown }) => ({
    id: h.hid,
    claim: h.claim,
    status: h.status,
    tests: h.tests,
  }));
}

// --- Sandbox-backed calculation wrappers (frozen profile birth) ---

export async function atrosChart(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  profileId: string,
): Promise<AtrosResult> {
  const profile = await requireProfile(client, userId, profileId);
  if (profile.chart_json) return { ok: true, data: profile.chart_json };
  return timed(userId, sessionId, 'atros_chart', () =>
    runAtros(chartArgs(birthFromProfile(profile)), { sessionId }),
  );
}

export async function atrosSensitivity(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  profileId: string,
  offsets?: number[],
): Promise<AtrosResult> {
  const profile = await requireProfile(client, userId, profileId);
  if (profile.sensitivity_json && !offsets) return { ok: true, data: profile.sensitivity_json };
  const birth = birthFromProfile(profile);
  return timed(userId, sessionId, 'atros_sensitivity', () =>
    runAtros(sensitivityArgs(birth, offsets), { sessionId }),
  );
}

export async function atrosTimeline(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  profileId: string,
  from: string,
  to: string,
  level: 'maha' | 'antar' | 'pratyantar' | 'sookshma' = 'pratyantar',
): Promise<AtrosResult> {
  const profile = await requireProfile(client, userId, profileId);
  return timed(userId, sessionId, 'atros_timeline', () =>
    runAtros(timelineArgs(birthFromProfile(profile), from, to, level), { sessionId }),
  );
}

export async function atrosTransit(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  profileId: string,
  asOf: string,
): Promise<AtrosResult> {
  const profile = await requireProfile(client, userId, profileId);
  return timed(userId, sessionId, 'atros_transit', () =>
    runAtros(transitArgs(birthFromProfile(profile), asOf), { sessionId }),
  );
}

export async function atrosCurrentDasha(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  profileId: string,
): Promise<AtrosResult> {
  const profile = await requireProfile(client, userId, profileId);
  return timed(userId, sessionId, 'atros_current_dasha', () =>
    runAtros(currentArgs(birthFromProfile(profile)), { sessionId }),
  );
}

export async function atrosDasha(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  profileId: string,
  years = 50,
): Promise<AtrosResult> {
  const profile = await requireProfile(client, userId, profileId);
  return timed(userId, sessionId, 'atros_dasha', () =>
    runAtros(dashaArgs(birthFromProfile(profile), years), { sessionId }),
  );
}
