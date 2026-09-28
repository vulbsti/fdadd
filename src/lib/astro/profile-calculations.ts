/**
 * Birth-setup calculations: everything deterministic the agent reads later,
 * computed once per birth revision in the shared Atros sandbox.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  ATROS_ENGINE_VERSION,
  chartArgs,
  parseBirthData,
  runAtros,
  runAtrosBatch,
  sensitivityArgs,
  timelineArgs,
  transitArgs,
  type BirthDataInput,
} from './atros-commands';
import { TimelineSchema, TransitSnapshotSchema, timelineWindow, transitDates, type ProfileCalculations } from './calculations';

export type CalculationKind = 'chart' | 'sensitivity' | 'timeline' | 'transits';

export interface ProfileBirth {
  profileId: string;
  userId: string;
  birthRevision: number;
  birth: BirthDataInput;
}

export async function loadProfileBirth(admin: SupabaseClient, profileId: string, userId: string): Promise<ProfileBirth> {
  const { data, error } = await admin.from('astro_profiles')
    .select('id,user_id,name,birth_date,birth_time,lat,lng,tz,place_name,birth_revision')
    .eq('id', profileId).eq('user_id', userId).single();
  if (error || !data) throw new Error('profile not found');
  if (!data.birth_date || !data.birth_time || data.lat == null || data.lng == null || !data.tz) {
    throw new Error('Astrology is unavailable until complete birth information is configured.');
  }
  return {
    profileId, userId, birthRevision: Number(data.birth_revision ?? 0),
    birth: parseBirthData({
      name: data.name, date: data.birth_date, time: String(data.birth_time).slice(0, 5),
      latitude: Number(data.lat), longitude: Number(data.lng), timezone: data.tz,
      ...(data.place_name ? { place_name: data.place_name } : {}),
    }),
  };
}

/** One calculation; independent kinds can run in parallel Workflow steps. */
export async function calculate(kind: CalculationKind, birth: BirthDataInput, today = new Date()): Promise<unknown> {
  if (kind === 'transits') {
    const snapshots = await runAtrosBatch(transitDates(today).map((date) => transitArgs(birth, date)));
    return z.array(TransitSnapshotSchema).parse(snapshots);
  }
  const window = timelineWindow(birth.date);
  const argv = kind === 'chart' ? chartArgs(birth)
    : kind === 'sensitivity' ? sensitivityArgs(birth)
      : timelineArgs(birth, window.from, window.to, 'pratyantar');
  const outcome = await runAtros(argv, { sessionId: 'birth-setup', timeoutMs: 120_000 });
  if (!outcome.ok) throw new Error(`atros ${kind} failed: ${outcome.error.code} ${outcome.error.message}`);
  return kind === 'timeline' ? TimelineSchema.parse(outcome.data) : outcome.data;
}

export async function storeProfileCalculations(admin: SupabaseClient, profile: ProfileBirth,
  results: Pick<ProfileCalculations, 'chart' | 'sensitivity' | 'timeline' | 'transits'>) {
  const { error } = await admin.from('astro_profile_calculations').upsert({
    profile_id: profile.profileId, user_id: profile.userId, birth_revision: profile.birthRevision,
    engine_version: ATROS_ENGINE_VERSION, chart: results.chart, sensitivity: results.sensitivity,
    timeline: results.timeline, transits: results.transits, computed_at: new Date().toISOString(),
  }, { onConflict: 'profile_id,birth_revision' });
  if (error) throw new Error(`Calculations could not be saved (${error.code ?? 'database'}).`);
}

/** Recompute everything for one profile (backfill and engine upgrades). */
export async function recomputeProfileCalculations(admin: SupabaseClient, profileId: string, userId: string) {
  const profile = await loadProfileBirth(admin, profileId, userId);
  const [chart, sensitivity, timeline, transits] = await Promise.all(
    (['chart', 'sensitivity', 'timeline', 'transits'] as const).map((kind) => calculate(kind, profile.birth)));
  const results = { chart: chart as Record<string, unknown>, sensitivity: sensitivity as Record<string, unknown>,
    timeline: TimelineSchema.parse(timeline), transits: z.array(TransitSnapshotSchema).parse(transits) };
  await storeProfileCalculations(admin, profile, results);
  // Keep the profile's frozen copies in step for the UI and older readers.
  const { error } = await admin.from('astro_profiles').update({ chart_json: results.chart, sensitivity_json: results.sensitivity })
    .eq('id', profileId).eq('user_id', userId).eq('birth_revision', profile.birthRevision);
  if (error) throw new Error(`Profile chart could not be refreshed (${error.code ?? 'database'}).`);
  return { birthRevision: profile.birthRevision };
}
