import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/sagittarius-chart.json';
import {
  astrologyWorkspaceFiles, chartSummaryMarkdown, nowMarkdown, ruledHouses, timelineMarkdown, TimelineSchema,
  timelineWindow, transitDates, TransitSnapshotSchema, transitsMarkdown, wholeSignHouse,
} from './calculations';

const timeline = TimelineSchema.parse(fixture.timeline);
const chart = fixture.chart as Record<string, unknown>;

describe('whole-sign houses', () => {
  it('counts from the lagna sign', () => {
    // Sagittarius (8) rising: Capricorn (9) is the 2nd, Cancer (3) the 8th.
    expect(wholeSignHouse(9, 8)).toBe(2);
    expect(wholeSignHouse(3, 8)).toBe(8);
    expect(wholeSignHouse(8, 8)).toBe(1);
  });

  it('derives lordships from the lagna', () => {
    expect(ruledHouses('Mars', 8)).toEqual([5, 12]);
    expect(ruledHouses('Jupiter', 8)).toEqual([1, 4]);
    expect(ruledHouses('Sun', 8)).toEqual([9]);
  });
});

describe('chart summary', () => {
  const summary = chartSummaryMarkdown({ chart, sensitivity: fixture.sensitivity, timeSource: 'hospital', timeConfidence: 'exact' });

  it('uses whole-sign houses even when the engine field disagrees', () => {
    // The fixture predates the engine fix and labels Sun as house 1.
    expect(summary).toMatch(/\| Sun \| Capricorn 19°53′ \| 2 \| 9 \|/);
    expect(summary).toMatch(/\| Jupiter \| Cancer 14°11′ \| 8 \| 1, 4 \| Exalted \|/);
    expect(summary).toContain('Lagna: Sagittarius 21°14′; lagna lord Jupiter in Cancer (8th house)');
  });

  it('lists houses, sensitivity and the birth-time source', () => {
    expect(summary).toContain('| 2 | Capricorn | Saturn | 2nd (Capricorn) | Sun, Mercury, Saturn, Rahu |');
    expect(summary).toContain('Birth time source: hospital, confidence: exact');
    expect(summary).toMatch(/Saturn: .*margin 24.4′/);
  });
});

describe('timeline views', () => {
  it('shows the running chain and the next seams in order', () => {
    const now = nowMarkdown(timeline, '2026-09-28');
    expect(now).toContain('- Mahadasha: Rahu');
    expect(now).toContain('- Antardasha: Mars');
    expect(now).toMatch(/Next changes[\s\S]*Rahu–Mars–Sun begins \(pratyantar change\)/);
    expect(now).toMatch(/Jupiter–Jupiter–Jupiter begins \(mahadasha change\)/);
  });

  it('groups antardashas under their mahadasha once each', () => {
    const markdown = timelineMarkdown(timeline);
    expect(markdown.match(/\| Rahu–Mars \|/g)).toHaveLength(1);
    expect(markdown).toContain('## Jupiter mahadasha');
  });

  it('covers a lifetime and three years of monthly transits', () => {
    expect(timelineWindow('1991-02-03')).toEqual({ from: '1991-02-03', to: '2091-02-03' });
    const dates = transitDates(new Date('2026-09-28T00:00:00Z'));
    expect(dates[0]).toBe('2025-01-01');
    expect(dates.at(-1)).toBe('2028-12-01');
    expect(dates).toHaveLength(48);
  });

  it('writes transit rows from the Moon and the lagna', () => {
    const markdown = transitsMarkdown([TransitSnapshotSchema.parse(fixture.transit)], 8);
    expect(markdown).toContain('| 2026-03 | Pisces M7 L4 |');
  });
});

it('produces the full astrology folder', () => {
  const files = astrologyWorkspaceFiles({ birthRevision: 1, engineVersion: 'test', chart, sensitivity: fixture.sensitivity,
    timeline, transits: [TransitSnapshotSchema.parse(fixture.transit)] }, '2026-09-28', {});
  expect(files.map((file) => file.path)).toEqual(['astrology/chart-summary.md', 'astrology/chart.json', 'astrology/sensitivity.json',
    'astrology/dasha/timeline.json', 'astrology/dasha/timeline.md', 'astrology/dasha/now.md', 'astrology/transits.md']);
});
