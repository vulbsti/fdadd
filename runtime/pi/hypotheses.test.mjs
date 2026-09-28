import assert from 'node:assert/strict';
import test from 'node:test';
import { compareHypothesis, LABEL, TIME } from './hypotheses.mjs';

const chart = (ascIndex, planets, d9 = 'Libra') => ({
  lagna_chart: { ascendant: { sign_index: ascIndex, degree: 21.2 }, planets },
  bhava_chalit: { positions: planets.map((p) => ({ planet: p.planet, bhava_house: p.bhava })) },
  divisional_charts: { D9: { ascendant: { sign: d9 } }, D10: { ascendant: { sign: 'Cancer' } } },
});
const timeline = (start) => ({ rows: [{ mahadasha: { planet: 'Rahu', start: '2008-12-03' }, antardasha: { planet: 'Mars', start } }] });
const birth = (time) => ({ date: '1991-02-03', time });

test('reports house, Bhava Chalit, D9 and dasha changes', () => {
  const saved = chart(8, [{ planet: 'Saturn', sign: 'Capricorn', sign_index: 9, bhava: 1 }]);
  const candidate = chart(8, [{ planet: 'Saturn', sign: 'Capricorn', sign_index: 9, bhava: 2 }], 'Virgo');
  const text = compareHypothesis({ label: 'minus-10min', reason: 'Saturn themes', saved, candidate,
    savedTimeline: timeline('2025-11-16'), candidateTimeline: timeline('2025-11-12'), savedBirth: birth('04:56'), candidateBirth: birth('04:46') });
  assert.match(text, /Saturn: Bhava Chalit house 1 → 2/);
  assert.match(text, /D9 lagna: Libra → Virgo/);
  assert.match(text, /move by up to 4 days/);
  assert.doesNotMatch(text, /whole-sign house/);
});

test('flags a lagna sign change', () => {
  const saved = chart(8, [{ planet: 'Sun', sign: 'Capricorn', sign_index: 9, bhava: 2 }]);
  const candidate = chart(9, [{ planet: 'Sun', sign: 'Capricorn', sign_index: 9, bhava: 1 }]);
  const text = compareHypothesis({ label: 'x', reason: 'r', saved, candidate, savedBirth: birth('04:56'), candidateBirth: birth('07:00') });
  assert.match(text, /sign changes: every house changes/);
  assert.match(text, /Sun: whole-sign house 2 → 1/);
});

test('validates labels and times', () => {
  assert.ok(LABEL.test('plus-4min'));
  assert.ok(!LABEL.test('../escape'));
  assert.ok(TIME.test('04:56'));
  assert.ok(!TIME.test('24:00'));
});
