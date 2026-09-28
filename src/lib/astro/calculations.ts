/**
 * Precomputed Vedic calculations. Deterministic Atros output is produced once
 * per birth revision and read by the agent as files; nothing here calls a
 * model. The Markdown views derive houses and lordships from signs so they
 * stay whole-sign even if an engine field disagrees.
 */
import { z } from 'zod';

export const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'] as const;
const SIGN_LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const PLANET_ORDER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

/** Years covered by the stored timeline, counted from birth. */
export const TIMELINE_YEARS = 100;
/** Monthly transit snapshots: from the start of last year through two years ahead. */
export function transitDates(today: Date): string[] {
  const dates: string[] = [];
  for (let year = today.getUTCFullYear() - 1; year <= today.getUTCFullYear() + 2; year++) {
    for (let month = 1; month <= 12; month++) dates.push(`${year}-${String(month).padStart(2, '0')}-01`);
  }
  return dates;
}

export function timelineWindow(birthDate: string) {
  const [year, ...rest] = birthDate.split('-');
  return { from: birthDate, to: [String(Number(year) + TIMELINE_YEARS), ...rest].join('-') };
}

const period = z.object({ planet: z.string(), start: z.string(), end: z.string() });
export const TimelineSchema = z.object({
  level: z.string(),
  rows: z.array(z.object({
    chain: z.string(), mahadasha: period, antardasha: period.nullable().optional(),
    pratyantar: period.nullable().optional(),
  }).passthrough()),
}).passthrough();
export type Timeline = z.infer<typeof TimelineSchema>;

export const TransitSnapshotSchema = z.object({
  as_of: z.string(),
  natal_moon_sign: z.string().optional(),
  transits: z.array(z.object({
    planet: z.string(), transit_sign: z.string(), transit_sign_index: z.number(), house_from_moon: z.number().optional(),
    is_favorable: z.boolean().optional(), is_vedha_obstructed: z.boolean().optional(),
  }).passthrough()),
  sade_sati: z.object({ is_active: z.boolean(), phase_name: z.string().nullable().optional() }).passthrough().optional(),
  double_transit_signs: z.array(z.string()).optional(),
}).passthrough();
export type TransitSnapshot = z.infer<typeof TransitSnapshotSchema>;

export interface ProfileCalculations {
  birthRevision: number;
  engineVersion: string;
  chart: Record<string, unknown>;
  sensitivity: Record<string, unknown>;
  timeline: Timeline;
  transits: TransitSnapshot[];
}

export function wholeSignHouse(signIndex: number, ascendantIndex: number) {
  return ((signIndex - ascendantIndex + 12) % 12) + 1;
}

/** Houses (whole-sign) whose sign this planet rules. */
export function ruledHouses(planet: string, ascendantIndex: number) {
  return SIGN_LORDS.flatMap((lord, sign) => lord === planet ? [wholeSignHouse(sign, ascendantIndex)] : []).sort((a, b) => a - b);
}

type Loose = Record<string, any>;
const deg = (value: unknown) => typeof value === 'number' ? `${Math.floor(value)}°${String(Math.round((value % 1) * 60)).padStart(2, '0')}′` : '';
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const list = (items: string[]) => items.length ? items.join(', ') : 'none';

export function chartSummaryMarkdown(input: { chart: Loose; sensitivity: Loose | null; timeSource?: string | null; timeConfidence?: string | null }) {
  const { chart, sensitivity } = input;
  const lagna = chart.lagna_chart ?? {};
  const asc = lagna.ascendant ?? {};
  const ascIndex = Number(asc.sign_index);
  const planets: Loose[] = [...(lagna.planets ?? [])].sort((a, b) => PLANET_ORDER.indexOf(a.planet) - PLANET_ORDER.indexOf(b.planet));
  const byPlanet = new Map(planets.map((p) => [p.planet, p]));
  const house = (p: Loose) => wholeSignHouse(Number(p.sign_index), ascIndex);
  const combust = new Map<string, boolean>((chart.combustion ?? []).map((c: Loose) => [c.planet, c.is_combust === true]));
  const strength = new Map<string, Loose>((chart.shadbala ?? []).map((s: Loose) => [s.planet, s]));
  const birth = chart.birth_data ?? {};
  const lagnaLord = byPlanet.get(SIGN_LORDS[ascIndex]);
  const moon = byPlanet.get('Moon');
  const lines: string[] = [];
  lines.push('# Birth chart summary', '');
  lines.push('Vedic (sidereal, Lahiri ayanamsa), whole-sign houses counted from the lagna. Calculated once from the saved birth details; read it, do not recompute it.', '');
  lines.push(`- Birth: ${birth.birth_date ?? '?'} ${String(birth.birth_time ?? '').slice(11, 16)} (${birth.timezone ?? '?'}), ${birth.place_name ?? `${birth.latitude}, ${birth.longitude}`}`);
  if (input.timeSource || input.timeConfidence) lines.push(`- Birth time source: ${input.timeSource ?? 'unknown'}, confidence: ${input.timeConfidence ?? 'unknown'}`);
  lines.push(`- Lagna: ${asc.sign} ${deg(asc.degree)}; lagna lord ${SIGN_LORDS[ascIndex]}${lagnaLord ? ` in ${lagnaLord.sign} (${ord(house(lagnaLord))} house)` : ''}`);
  if (moon) lines.push(`- Moon: ${moon.sign} ${deg(moon.degree)} in the ${ord(house(moon))} house, nakshatra ${moon.nakshatra} pada ${moon.pada} (lord ${moon.nakshatra_lord})`);
  if (chart.panchanga) lines.push(`- Panchanga: ${chart.panchanga.vara}, ${chart.panchanga.tithi_name}, yoga ${chart.panchanga.nithya_yoga_name}, karana ${chart.panchanga.karana_name}`);
  lines.push('', '## Planets', '', '| Planet | Sign | House | Rules houses | Dignity | Nakshatra (lord) | Notes | Shadbala |', '|---|---|---|---|---|---|---|---|');
  for (const p of planets) {
    const notes = [p.retrograde ? 'retrograde' : '', combust.get(p.planet) ? 'combust' : ''].filter(Boolean).join(', ');
    const s = strength.get(p.planet);
    const bala = s ? `${Number(s.total_rupas).toFixed(2)} of ${s.minimum_required} rupas${s.is_strong ? ' (strong)' : ''}` : '';
    const rules = p.planet === 'Rahu' || p.planet === 'Ketu' ? '—' : list(ruledHouses(p.planet, ascIndex).map(String));
    lines.push(`| ${p.planet} | ${p.sign} ${deg(p.degree)} | ${house(p)} | ${rules} | ${p.dignity ?? '—'} | ${p.nakshatra} ${p.pada ?? ''} (${p.nakshatra_lord}) | ${notes || '—'} | ${bala} |`);
  }
  lines.push('', '## Houses', '', '| House | Sign | Lord | Lord placed in | Occupants |', '|---|---|---|---|---|');
  for (let h = 1; h <= 12; h++) {
    const sign = (ascIndex + h - 1) % 12;
    const lord = byPlanet.get(SIGN_LORDS[sign]);
    const occupants = planets.filter((p) => house(p) === h).map((p) => p.planet);
    lines.push(`| ${h} | ${SIGNS[sign]} | ${SIGN_LORDS[sign]} | ${lord ? `${ord(house(lord))} (${lord.sign})` : '?'} | ${list(occupants)} |`);
  }
  const bhava: Loose[] = chart.bhava_chalit?.positions ?? [];
  const shifted = bhava.filter((b) => b.bhava_house !== wholeSignHouse(Number(byPlanet.get(b.planet)?.sign_index), ascIndex));
  if (shifted.length) {
    lines.push('', '## Bhava Chalit (cusp-based) differences', '', 'Planets whose cusp-based house differs from the whole-sign house. Results tend to show through the Bhava Chalit house.', '');
    for (const b of shifted) lines.push(`- ${b.planet}: whole-sign ${house(byPlanet.get(b.planet)!)}, Bhava Chalit ${b.bhava_house}`);
  }
  const yogas: Loose[] = chart.yogas ?? [];
  lines.push('', '## Yogas reported by the engine', '');
  if (!yogas.length) lines.push('None reported.');
  for (const y of yogas) lines.push(`- ${y.name} (${list(y.planets_involved ?? [])}): ${y.description ?? ''}`);
  const divisional = chart.divisional_charts ?? {};
  lines.push('', '## Divisional charts', '');
  for (const key of ['D9', 'D10', 'D7', 'D12', 'D60']) {
    const d = divisional[key];
    if (!d) continue;
    const positions = (d.positions ?? []).map((x: Loose) => `${x.planet} ${x.sign}`).join(', ');
    lines.push(`- ${key} ${d.name ?? ''} (${d.description ?? ''}): lagna ${d.ascendant?.sign}; ${positions}`);
  }
  if (sensitivity) {
    lines.push('', '## Birth-time sensitivity', '');
    lines.push(`Offsets tested (minutes): ${list((sensitivity.offsets_tested ?? []).map(String))}. Ascendant moves about ${sensitivity.ascendant_rate_deg_per_min}° per minute.`, '');
    const boundary: Loose[] = sensitivity.boundary_planets ?? [];
    if (boundary.length) {
      lines.push('Planets near a Bhava Chalit boundary (smaller margin = more sensitive):', '');
      for (const b of boundary) lines.push(`- ${b.planet}: ${b.boundary_description}, margin ${b.margin_arcminutes}′, flips to Bhava ${b.flipped_bhava_house} at ${b.flip_offset_minutes > 0 ? '+' : ''}${b.flip_offset_minutes} min`);
    } else lines.push('No planet is near a Bhava Chalit boundary within the tested offsets.');
    const d9 = sensitivity.d9_sensitivity;
    if (d9) lines.push('', `D9 lagna ${d9.base_sign}; changes at: ${list((d9.changes_at ?? []).map((c: Loose) => `${c.offset > 0 ? '+' : ''}${c.offset} min → ${c.new_sign}`))}`);
    const shifts: Loose[] = sensitivity.dasha_shifts ?? [];
    if (shifts.length) lines.push(`Dasha dates move up to ${Math.max(...shifts.map((s) => Number(s.max_shift_days) || 0))} days across the tested offsets.`);
  }
  lines.push('', 'Full data: `chart.json`, `sensitivity.json`, `dasha/timeline.json` (every pratyantar), `transits.md`.');
  return `${lines.join('\n')}\n`;
}

const periodText = (p: { planet: string; start: string; end: string }) => `${p.planet} ${p.start} → ${p.end}`;

/** Maha and antar periods as a readable table; pratyantar stays in JSON. */
export function timelineMarkdown(timeline: Timeline) {
  const lines = ['# Vimshottari dasha timeline', '', 'Every mahadasha and antardasha from birth. Each pratyantar is in `timeline.json` (search it with grep or jq).', ''];
  const seen = new Set<string>();
  let maha = '';
  for (const row of timeline.rows) {
    const mahaKey = `${row.mahadasha.planet}:${row.mahadasha.start}`;
    if (mahaKey !== maha) {
      maha = mahaKey;
      lines.push('', `## ${row.mahadasha.planet} mahadasha: ${row.mahadasha.start} → ${row.mahadasha.end}`, '', '| Antardasha | Start | End |', '|---|---|---|');
    }
    const antar = row.antardasha;
    if (!antar) continue;
    const key = `${mahaKey}:${antar.planet}:${antar.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`| ${row.mahadasha.planet}–${antar.planet} | ${antar.start} | ${antar.end} |`);
  }
  return `${lines.join('\n')}\n`;
}

/** Today's running chain and the next seams, regenerated for every run. */
export function nowMarkdown(timeline: Timeline, today: string, seams = 6) {
  const current = timeline.rows.find((row) => (row.pratyantar ?? row.antardasha ?? row.mahadasha).start <= today && today < (row.pratyantar ?? row.antardasha ?? row.mahadasha).end);
  const lines = [`# Running dasha on ${today}`, ''];
  if (!current) lines.push('Today is outside the stored timeline.');
  else {
    lines.push(`- Mahadasha: ${periodText(current.mahadasha)}`);
    if (current.antardasha) lines.push(`- Antardasha: ${periodText(current.antardasha)}`);
    if (current.pratyantar) lines.push(`- Pratyantar: ${periodText(current.pratyantar)}`);
  }
  const next: string[] = [];
  let previous = current ?? null;
  for (const row of timeline.rows) {
    if (next.length >= seams) break;
    const start = (row.pratyantar ?? row.antardasha ?? row.mahadasha).start;
    if (start <= today) { previous = row; continue; }
    const level = !previous || previous.mahadasha.planet !== row.mahadasha.planet ? 'mahadasha'
      : previous.antardasha?.planet !== row.antardasha?.planet ? 'antardasha' : 'pratyantar';
    next.push(`- ${start}: ${row.chain.replace(/-/g, '–')} begins (${level} change)`);
    previous = row;
  }
  lines.push('', '## Next changes', '', ...(next.length ? next : ['None in the stored range.']));
  return `${lines.join('\n')}\n`;
}

/** Monthly slow-planet transits, from the Moon (gochara) and from the lagna. */
export function transitsMarkdown(transits: TransitSnapshot[], ascendantIndex: number) {
  const slow = ['Saturn', 'Jupiter', 'Rahu', 'Ketu'];
  const lines = ['# Monthly transits (gochara)', '', 'First of each month. "M" is the house counted from the natal Moon, "L" from the lagna. Favourable/obstructed follow classical gochara rules. Other dates: use `recalculate` only if a specific day matters.', '',
    `| Month | ${slow.join(' | ')} | Sade Sati | Double transit |`, `|---|${slow.map(() => '---').join('|')}|---|---|`];
  for (const snap of transits) {
    const cells = slow.map((planet) => {
      const t = snap.transits.find((x) => x.planet === planet);
      if (!t) return '—';
      const flag = t.is_favorable ? (t.is_vedha_obstructed ? ' fav, obstructed' : ' fav') : '';
      return `${t.transit_sign} M${t.house_from_moon ?? '?'} L${wholeSignHouse(t.transit_sign_index, ascendantIndex)}${flag}`;
    });
    const sade = snap.sade_sati?.is_active ? (snap.sade_sati.phase_name ?? 'active') : '—';
    lines.push(`| ${snap.as_of.slice(0, 7)} | ${cells.join(' | ')} | ${sade} | ${list(snap.double_transit_signs ?? [])} |`);
  }
  return `${lines.join('\n')}\n`;
}

/** Workspace files for the astrology folder, or none when astrology is off. */
export function astrologyWorkspaceFiles(calc: ProfileCalculations, today: string, profile: { timeSource?: string | null; timeConfidence?: string | null }) {
  const ascIndex = Number((calc.chart as Loose).lagna_chart?.ascendant?.sign_index);
  return [
    { path: 'astrology/chart-summary.md', content: chartSummaryMarkdown({ chart: calc.chart, sensitivity: calc.sensitivity, ...profile }) },
    { path: 'astrology/chart.json', content: JSON.stringify(calc.chart, null, 2) },
    { path: 'astrology/sensitivity.json', content: JSON.stringify(calc.sensitivity, null, 2) },
    { path: 'astrology/dasha/timeline.json', content: JSON.stringify(calc.timeline, null, 2) },
    { path: 'astrology/dasha/timeline.md', content: timelineMarkdown(calc.timeline) },
    { path: 'astrology/dasha/now.md', content: nowMarkdown(calc.timeline, today) },
    { path: 'astrology/transits.md', content: transitsMarkdown(calc.transits, ascIndex) },
  ];
}
