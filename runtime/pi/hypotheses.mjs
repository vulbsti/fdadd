// Pure helpers for the recalculate tool: compare a hypothetical birth-time
// chart and timeline with the saved one, in the terms rectification uses.

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const house = (signIndex, ascIndex) => ((signIndex - ascIndex + 12) % 12) + 1;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export const LABEL = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

function placements(chart) {
  const lagna = chart?.lagna_chart ?? {};
  const asc = Number(lagna.ascendant?.sign_index);
  const planets = Object.fromEntries((lagna.planets ?? []).map((p) => [p.planet, { sign: p.sign, house: house(Number(p.sign_index), asc) }]));
  const bhava = Object.fromEntries((chart?.bhava_chalit?.positions ?? []).map((b) => [b.planet, b.bhava_house]));
  const d9 = chart?.divisional_charts?.D9?.ascendant?.sign ?? null;
  const d10 = chart?.divisional_charts?.D10?.ascendant?.sign ?? null;
  return { lagna: `${SIGNS[asc] ?? '?'} ${Number(lagna.ascendant?.degree ?? 0).toFixed(2)}°`, lagnaSign: SIGNS[asc], planets, bhava, d9, d10 };
}

function seams(timeline) {
  const out = new Map();
  for (const row of timeline?.rows ?? []) {
    for (const level of ['mahadasha', 'antardasha']) {
      const p = row[level];
      if (!p) continue;
      out.set(`${level}:${row.mahadasha.planet}:${p.planet}`, p.start);
    }
  }
  return out;
}

/** Markdown comparison of the saved chart against a hypothesis. */
export function compareHypothesis({ label, reason, saved, candidate, savedTimeline, candidateTimeline, savedBirth, candidateBirth }) {
  const a = placements(saved);
  const b = placements(candidate);
  const lines = [`# Hypothesis ${label}`, '', `Reason: ${reason}`, '',
    `Saved birth: ${savedBirth.date} ${savedBirth.time}. Hypothesis: ${candidateBirth.date} ${candidateBirth.time}.`, '', '## What changes', ''];
  const changes = [];
  if (a.lagna !== b.lagna) changes.push(`- Lagna: ${a.lagna} → ${b.lagna}${a.lagnaSign !== b.lagnaSign ? ' (sign changes: every house changes)' : ''}`);
  for (const planet of Object.keys(a.planets)) {
    const x = a.planets[planet]; const y = b.planets[planet];
    if (y && x.house !== y.house) changes.push(`- ${planet}: whole-sign house ${x.house} → ${y.house}`);
    if (y && x.sign !== y.sign) changes.push(`- ${planet}: sign ${x.sign} → ${y.sign}`);
    if (b.bhava[planet] !== undefined && a.bhava[planet] !== b.bhava[planet]) changes.push(`- ${planet}: Bhava Chalit house ${a.bhava[planet]} → ${b.bhava[planet]}`);
  }
  if (a.d9 !== b.d9) changes.push(`- D9 lagna: ${a.d9} → ${b.d9}`);
  if (a.d10 !== b.d10) changes.push(`- D10 lagna: ${a.d10} → ${b.d10}`);
  lines.push(...(changes.length ? changes : ['- No change in lagna sign, planet houses, Bhava Chalit or D9/D10 lagna.']));
  if (savedTimeline && candidateTimeline) {
    const before = seams(savedTimeline);
    const after = seams(candidateTimeline);
    const shifts = [];
    for (const [key, start] of after) {
      const old = before.get(key);
      if (old && old !== start) shifts.push(Math.abs(days(old, start)));
    }
    lines.push('', '## Dasha dates', '', shifts.length
      ? `Maha and antar boundaries move by up to ${Math.max(...shifts)} days (typical ${shifts.sort((x, y) => x - y)[Math.floor(shifts.length / 2)]} days). Compare dated events against \`timeline.json\` in this folder.`
      : 'Dasha boundaries are unchanged in the compared range.');
  }
  return `${lines.join('\n')}\n`;
}
