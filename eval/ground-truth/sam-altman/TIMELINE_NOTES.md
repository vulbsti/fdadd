# Sam Altman: gold timeline notes

Built 2026-10-15 from the existing dossier only. No new web research was done; the one conflict that mattered (the 2026 Musk verdict) is settled by verifier B's fetches.

## Files
- `life-events.json`: 176 events sorted by date (ids ev-001 to ev-176). Fields follow the spec, plus `set`.
- `traits.json`: 27 traits (tr-01 to tr-27). Evidence entries are event ids plus dossier file:line references.

## Inputs and how they were merged
- Main sources: v1 `14_master_timeline.md` (~330 rows plus anchors and a 37-item conflict register) and v2 `08_master_timeline.md` (~150 rows), merged by event. The ~480 source rows became 176 events.
- Collapsed: minute-level Nov 17–22, 2023 rows into 4 events (fired, weekend talks, Microsoft offer and staff letter, return); ~40 sister-case docket rows into 4 (filed and denied, counterclaim, Mar 2026 partial ruling, Sep 2026 status).
- Product releases were dropped unless they changed his life. Kept: API, ChatGPT, GPT-4, GPT-5 backlash, Astra. Dropped: GPT-2, Whisper, o-series, Sora details and similar.
- Early life, family, homes and health come from v1 raw/08, v2 raw/01 and raw/05.
- The Nov 2023 ouster audit (AUDIT.md, SOURCES.md) is used for sourcing on the crisis events and for the coalition and Murati framing in the traits.
- Sources are dossier `file:line` references, plus URLs where the dossier gives a primary link (New Yorker 2016 and 2026, GeekWire and BBC for the verdict, OpenAI posts).

## Verifier corrections applied (vA and vB)
- Father: Jerold Donald Altman, Oct 4 1950 – May 25 2018.
- Staff-letter counts are given as dated snapshots only, with no "745" final figure.
- Wedding NBC URL is unverifiable, so the marriage is REPORTED at month precision.
- Baby post is a REPORTED proxy and surrogacy is quarantined; v2 had graded the baby post VERIFIED, and v1/vA's lower grade was kept.
- Rows that rely on the Verge exhibit log (2015–18 Musk emails) are downgraded to REPORTED.
- Sister case: the Amended CMO controls the schedule (discovery Oct 23 2026, trial May 3 2027). The Mar 20 2026 ruling is a partial dismissal with leave to amend, not "dismissed".
- 2026 round: $122B at $852B dated March, not April. The Feb $110B/$730B step is RUMOR and was dropped.
- Astra: Sep 3 phased rollout is confirmed; Sep 4 general availability is REPORTED only.
- Toner interview: May 28 PT / May 29 UTC. Fortune IPO quotes dated Sep 15.

## Conflicts resolved
- **Musk verdict (2026-05-18):** v2 excluded it as Wikipedia-only. Verifier B confirmed it via GeekWire and BBC, so it is kept as VERIFIED. Same for the IPO filing (Jun 8) and the Astra rollout (CNBC).
- **New Yorker exposé:** v1 has a duplicate row dated 2025-04-06. raw/11 and raw/12 and the URL (/2026/04/13/) show it is **2026-04-06**, so the 2025 row was dropped.
- **Raine suit:** 2025-08-26, not 2024 (follows v1's own register).
- **Molotov and shooting (Apr 10 and 12, 2026):** v1 slice 08 listed them as index-only, while slice 11 and v2 (TechCrunch citing SFPD/NYT) substantiate them. Kept as REPORTED.
- **Reddit Series B:** v2's Sep 30 2014 day date was used over v1's Oct 2014 month.
- **Toner relay and Q\*:** the Q\* letter is excluded entirely (single anonymous source). The "fired from YC" claim is noted as contested (Graham denied it), not stated as fact.
- **Left as recorded conflicts in `notes`:** "The Merge" date (2017-03 vs 2017-12, so year precision); Retro investment (2021 vs 2022-04); Sivo start (2003 vs 2004); dropout month; wedding day and site; io price ($6.4B vs $6.5B); Hawaii bedrooms (10 vs 12); Russian Hill lots ($14M vs $38M).
- **Evidence grade when v1 and v2 differ:** I usually took the more conservative grade unless a verifier settled it. Exceptions are a few launch-level facts, such as the dropout and the YC part-time partner role, where v2's VERIFIED was kept and the disagreement is noted.

## Policy choices
- Sister lawsuit: recorded only as filed, denied, counterclaimed, ruled on and pending. No allegation content.
- The 2021 public-estrangement period is dated from his own counterclaim, with no content.
- Suchir Balaji's death is kept as VERIFIED, but any claim that Altman was involved is treated as noise.
- Anonymous Hao and Hagey lines are never treated as VERIFIED.
- Valence is from his personal point of view at the time. Magnitude 5 is used only for life-defining moments: birth, dropout, YC S05, Loopt sale, YC presidency, OpenAI founding and becoming CEO, father's death, ChatGPT, the Nov 2023 firing, staff revolt and return, marriage, the sister's suit, and his son's birth.
- Vague dates: seasons use a representative month with precision `season` (spring 2003 = 2003-05, summer 2005 = 2005-06, fall 2003 = 2003-09); "late 1990s"/"~2001" use `approx-year`; Ann's birth year (~1994) is derived from her pleaded age.

## What is thin
- **Childhood:** 1985–2003 has no exact dates except birth and the 8th-birthday Mac. Every other early-life date is approximate:
  the 1989 move rests on one citation chain, the JBS start year is unknown, and coming out is ~2001.
  Brothers' birth years and the parents' marriage are absent.
- **Birth time:** the only source is his "around 5 am central" email (Rodden A, from memory). There is no certificate.
- **Health:** sparse. The record is limited to scurvy (2005), the 2016 prepper and lifestyle snapshot, psychedelics (disclosed 2024, retreat date unknown) and sleep (2025, snippet-level). Statin, sleep-protocol and marathon claims had no source and were excluded.
- **Relationships:** the Sivo start and end years and the Mulherin meeting year are REPORTED only. The wedding day is unresolved.
- **Homes:** purchase months come from BI/SF Standard (REPORTED); the Big Sur parcel is unidentified.
- **Quiet stretches:** coded as `period` events (14 total) so the set includes low-activity years: infancy, Clayton childhood, Stanford, Loopt plateau, the 2012–14 interregnum, the YC Group era and the 2019–22 build years. The dossier documents nothing distinctive in 1989–1992 or 2003–04.
- **2024–2026:** dense but often REPORTED (press syntheses). Mid-2026 items (rogue agents, Florida suit, RL pause) are not independently verified.
- **Cutoff:** the dossier ends 2026-09-17. The sister case and the Musk counterclaims are still open.

## Counts
- Total 176. **fit** (date < 2022-07-01): 79. **holdout**: 97.
- Kind: 135 event, 27 turning-point, 14 period (10 fit / 4 holdout).
- Evidence: 104 VERIFIED, 72 REPORTED. Magnitude 1/2/3/4/5: 19/59/51/32/15.
- Domains (all / fit / holdout); events can carry several domains:

| Domain | All | Fit | Holdout |
|---|---|---|---|
| career | 72 | 38 | 34 |
| reputation | 54 | 15 | 39 |
| money | 37 | 20 | 17 |
| conflict-legal | 37 | 2 | 35 |
| mind-worldview | 28 | 13 | 15 |
| network-mentors | 28 | 15 | 13 |
| family | 18 | 9 | 9 |
| home | 14 | 8 | 6 |
| education | 9 | 8 | 1 |
| partnership | 9 | 3 | 6 |
| health | 7 | 3 | 4 |

- **Imbalance warning:** conflict-legal is almost entirely holdout (2 fit vs 35), and education is almost entirely fit. Scorers should normalize by domain.
- Traits: 27, each with at least two independent supports. Contested: 6 (coalition building, candor, governance bypass, retaliation, strategic ambiguity, regulation split).
