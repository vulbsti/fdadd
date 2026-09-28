---
name: chart-reading
description: Method for interpreting this person's Vedic chart, dasha periods and transits from the precomputed files. Read it before explaining what a period, placement or transit means for them.
---

# Reading this chart

Everything here works from files already in `astrology/`. Start with
`chart-summary.md`; open `chart.json` only for details the summary leaves out.

## Where to find things

| Need | File | Tip |
|---|---|---|
| Lagna, planets, houses, lordships, dignity, nakshatras, strength | `chart-summary.md` | Houses are whole-sign from the lagna |
| Cusp-based (Bhava Chalit) differences | `chart-summary.md` | Results tend to show through the Bhava Chalit house when it differs |
| Running periods today, next seams | `dasha/now.md` | Regenerated for today on every message |
| Any maha or antar period | `dasha/timeline.md` | One table per mahadasha |
| Any pratyantar | `dasha/timeline.json` | `jq '.rows[] \| select(.pratyantar.start >= "2026-01-01" and .pratyantar.start < "2027-01-01")' astrology/dasha/timeline.json` |
| Transits month by month | `transits.md` | Houses from Moon (M) and from lagna (L) |
| Birth-time fragility | `sensitivity.json`, summary section | Boundary planets, D9 flips, dasha shift in days |
| Divisional charts, yogas, aspects, shadbala | `chart.json` | D9 for inner nature and marriage, D10 for career |

## What a period lord delivers

A dasha lord's results come from four layers. Build them for every lord in
the chain you are reading, then combine.

1. **Nature** of the planet: its core significations
   (`references/dasha-signatures.md`).
2. **Dignity**: exalted and own sign express cleanly; friend's sign
   comfortably; enemy sign with friction; debilitated through struggle
   (check for cancellation). Retrograde turns attention inward or back to
   unfinished matters; combust weakens independent expression.
3. **House it occupies**: the life arena where results show
   (`references/house-themes.md`). If Bhava Chalit differs, weigh it.
4. **Houses it rules**: the matters it switches on, wherever it sits. A lord
   of a trine (1, 5, 9) supports; of a dusthana (6, 8, 12) brings effort,
   loss or transformation in that area; a lord of both mixes them.

Then add the nakshatra lord of the dasha lord (it colours how results
arrive), and the lord's relationship to the lagna lord and to the Moon (from
the Moon for the mind's experience of the period). Rahu and Ketu act like the
lord of the sign they occupy and the planets they sit with.

Translate the result into everyday language about this person's life, as the
rectify questioning framework does (`references/questioning-framework.md`),
never a textbook list.

## Layering the chain

- **Mahadasha**: the climate of years. What is the overarching story?
- **Antardasha**: the season. How does the sub-lord's promise interact with
  the main lord? Friendly lords reinforce each other; the house distance
  between them (6/8 or 2/12 apart is tense, 1/7 and trines cooperative)
  shows how smoothly.
- **Pratyantar**: the weeks when something specific surfaces.
- **Seams**: name each hand-over in the period asked about with its date and
  what shifts. A mahadasha seam is a chapter change people usually feel.

## Transits on top of the dasha

Dasha is the backbone; transits are the weather. Weigh slow planets first:
Saturn and Jupiter by house from the Moon and from the lagna, Rahu and Ketu
by axis. Note Sade Sati, and Jupiter plus Saturn both influencing the same
house (double transit), which tends to deliver that house's matters when the
dasha also points there. A transit rarely delivers what the running dasha
does not promise.

## Putting it together for the person

1. One-sentence seam statement: what this period is about for them.
2. The layers: climate, season, the weeks that stand out, with dates.
3. The transit stack for the dates in question.
4. A dated split when the period has distinct halves.
5. What to do with it: one practical play fitted to how this person actually
   works (from their theory of mind and history), not generic advice.
6. Where their life already shows this pattern, or contradicts it.
