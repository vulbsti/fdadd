# Reconcile notes: gold back-test to 2022-06-30 (age 37.19)

Scope: 32 antardashas, from Sun-Jupiter at birth to Rahu-Mars (began 2022-06-19, running at the cut-off). The inputs were the sealed blind reading, the exact period and transit files, and the 79-event fit file. No life evidence after the cut-off was used.

## Counts (153 judged items)
| Category | Domain preds (69) | Pratyantar checks (18) | Quiet calls (53) | Unpredicted mag>=3 (13) | Total |
|---|---|---|---|---|---|
| hit | 14 | 4 | - | - | 18 |
| partial | 17 | 4 | 1 | - | 22 |
| stronger-influence | 5 | 2 | - | 6 | 13 |
| alternate-reading | 4 | 1 | - | 7 | 12 |
| outside-chart | 1 | 0 | - | 0 | 1 |
| quiet-correct | - | - | 51 | - | 51 |
| data-gap | 28 | 7 | 1 | 0 | 36 |
| birth-time-fragile | 0 | 0 | 0 | 0 | 0 |

- Every prediction and every magnitude-3+ fit event inside a window is matched or explained (checked by script).
- Weak explanations: 53 of 153. Of those, 36 are data-gaps, which are labelled weak by convention because the gap is a fact about the record, not a chart argument. Chart-based explanations that are weak (post-hoc): **17** (8 partial, 5 stronger-influence, 4 alternate-reading). Strong: 100.
- Adult Rahu-MD sub-periods, excluding the open Rahu-Mars (28 domain predictions): 9 hit, 8 partial, 4 stronger-influence, 3 alternate-reading, 1 outside-chart, 3 data-gap.
- Childhood (Sun and Moon MD, 20 predictions): 16 data-gap and 4 partial. The record cannot test childhood, so these are not misses.
- Rahu-Mars: all 3 domain calls are data-gap (window open, 11 of about 383 days elapsed).
- Natal readings (41 candidates): 20 supported, 2 refuted (nr-11b 'notable but not exceptional', nr-15c 'late bloomer'), 19 open. Of the 15 prior favourites: 7 supported, 8 open, none refuted.
- birth-time-fragile was not needed as a verdict. Fragility is recorded in the notes (lagna boundary about 04:43; about 3 months of dasha shift per hour).

## Dominant rules (rules.json, 13 rules)
1. rule-01 (high): Mercury, Venus and Jupiter periods are career periods. They form the D10 10th cluster, which overrides their rasi 12th-house and debilitation. This explains the two biggest misses.
2. rule-04 (high): Rahu and Jupiter act through patrons and sponsors, and conflicts are fights with sponsors and co-founders, not lawsuits.
3. rule-02 (medium): Saturn means forced restructuring that ends upward (Rahu-Saturn; the Saturn pratyantar of 2019).
4. rule-12 (medium): Malefic and Jupiter pratyantars time events to within days or weeks (the 2008 crisis; the 2018 board exit; the 2015 pitch; the 2020 API).
5. rule-05, 07, 11 (medium): money moves as other people's capital and big bets; ashtama Shani hit the father; pressure on the Moon comes out as a public stand or family turbulence.
6. rule-10 (high, meta): do not count the childhood data-gaps against the chart.

## Where the blind reading was most wrong
- **Rahu-Venus career 'stable, consolidates'** (strength 2). It was actually the largest leap: OpenAI CEO, the capped-profit structure, a $1B partner, exit from YC. The blind said 'Venus not linked to the 10th' and ignored the D10 that was in its own input.
- **Rahu-Mercury 'litigation resolved in his favour'** (strength 4). There was no litigation. The career rise was under-called at strength 3 against two magnitude-5 events (YC president, OpenAI).
- **Rahu-Ketu 'partnership ends'** (strength 4). The break had already happened in Rahu-Saturn (2012) under Saturn in Libra. Ketu produced delegation.
- **Rahu-Sun 'top authority and recognition peak'** (career 5, reputation 4). He held the top role, but 2020 was a low-visibility year. The blind treated Saturn in the 10th as an amplifier when it constricted.
- **Health under ashtama Shani** (Rahu-Venus). It became the father's death (Saturn transiting the 9th); his own health has never surfaced.
- **Life arc nr-15a 'setback 26-31'.** Only 25-27 was a setback; 28-31 was a strong rise.
- **What was right:** Rahu-Saturn (setback plus wider scope, five days into the AD), Rahu-Jupiter reputation and patrons, Mars-Venus (college, first relationship), Rahu-Rahu traction, Rahu-Moon property, and the D10 and nr-06b/nr-07a/nr-08a readings.

## Engine and data issues found
1. **Fit file leaks post-cut-off material.** Descriptions and notes cite sources and describe developments dated after the cut-off (content deliberately not repeated). endDate runs past the cut-off on ev-067 and ev-078. The model files rewrite these descriptions; the fit builder should clip endDates and strip notes before an Analyst sees them.
2. **ev-079 (year-only 2022)** may fall after the cut-off. ev-073 has a date conflict (2021 vs Apr 2022; both inside Rahu-Moon).
3. **Year-only dates straddle AD seams:** ev-004 (1989: Moon-Moon, Moon-Mars or Moon-Rahu), ev-016 (2005: Mars-Moon vs Rahu-Rahu), ev-010/011 (2001), ev-062 (2019), ev-069 ('late 2020', possibly Rahu-Moon). The mid-year placement convention decides some verdicts; month-level dating would sharpen them.
4. **Birth time is from memory (about 05:00 CST, Rodden A).** The Aries lagna is 6.9 deg, so a Pisces lagna applies before about 04:43. The Moon (Taurus 2.9, Krittika) is stable all morning, but the dasha seams shift about 3 months per hour. This was not rectified.
5. **Engine yoga list:** it misses Jupiter's neecha bhanga (the blind caught it), flags Kemadruma although Mars conjoins the Moon, and lists Amala on a debilitated Jupiter without a caveat.
6. **Blind method gap:** the career strength of each AD should use D10 occupancy (the input carried it). The method used rasi lordship only.
7. **Minor rounding:** periods-by-age gives Jupiter-Saturn's end at 42.87 vs 42.88 from the exact dates. Harmless.
8. The transits file ends around age 45, so Saturn after that is extrapolated (as the blind noted).

## Files
gold/calibration.json, rules.json, natal-verdicts.json, model/{life-timeline, chart-readings, calibration, arcs, drives, context, now}.md
