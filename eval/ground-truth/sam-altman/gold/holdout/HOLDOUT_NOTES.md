# Holdout notes: sealed predictions vs 2022-07..2026-06

Scope: 54 sealed predictions (Rahu-Mars, Jupiter-Jupiter, Jupiter-Saturn truncated at 2026-06-30) scored against the 50 holdout events of magnitude >= 3 dated on or before 2026-06-30. Files: scoring.json, calibration-holdout.json, rules-update.json. The sealed files were not edited.

## Headline numbers
| Predictions (54) | hit | partial | miss | false-alarm | untestable |
|---|---|---|---|---|---|
| all | 39 (72%) | 13 (24%) | 1 (2%) | 1 (2%) | 0 |
| excluding 9 null calls | 30 of 45 (67%) | 13 (29%) | 1 | 1 | 0 |
| pratyantar-level (19) | 10 | 8 | 0 | 1 | 0 |

| Events | anticipated | partial | missed | contradicted |
|---|---|---|---|---|
| mag >= 3 (50) | 40 (80%) | 6 | 2 (pledge ev-110, donation ev-127) | 2 (home attacks ev-163/164) |
| mag >= 4 (23) | 20 (87%) | 1 | 0 | 2 |
| mag 5 (7) | 6 (86%) | 1 (sibling suit ev-130) | 0 | 0 |

Scoring rule used: hit = domain + direction + window (+-3 months at edges). Pratyantar calls that match only through the edge allowance are scored partial, because rule-12 claims days-to-weeks precision. Null calls ("no break-up", "no health event") count as hits but are flagged and also reported without them.

## What the calibrated model got right
- The 2023 removal-and-return: p-17 (MD seam, rule-09) and p-32 (Saturn pratyantar 2023-10..2024-02, "resolves within months into him in a stronger position").
- The Jan 2023 strategic investment in the Mercury pratyantar (p-14, p-15), the spring-2023 Senate and heads-of-state engagement in the Venus pratyantar (p-16).
- The 2025 corporate restructuring in the Jupiter-Saturn opening Saturn pratyantar (p-41, p-52).
- The Jupiter-Jupiter-Moon pratyantar (Jan-Mar 2025): sibling suit, son, property purchase, counterclaims (p-38, p-27).
- Jupiter-Saturn themes: infrastructure megadeals with sustainability doubts (p-42), personal honesty scrutiny (p-43), lawsuits with no removal (p-44).

## What it got wrong or under-weighted
- p-13 (false alarm): the late-2022 Saturn pratyantar was read as a forced setback; it held the product launch (ev-080), the biggest positive event of the span.
- p-47 (miss): a home purchase was forecast for the Jupiter-in-Cancer windows; instead the estate was listed for sale and the home was attacked twice in April 2026 (contradicted, ev-163/164).
- Magnitude was under-called for every magnitude-5 private event: marriage (p-25: 3), child (p-26/p-38: 3), sibling suit (p-38: 3). It was over-called for essays (p-29: 4 vs <= 2) and the 2024 raise (p-36: 5 vs 3).
- Jupiter and Ketu pratyantar timing was poor (p-12, p-31, p-35, p-54 all partial). Mercury pratyantars were read as clean rises but also held the worst reputational damage (2024 and 2026).
- Unforeseen: a philanthropic pledge (ev-110) and a political donation (ev-127).

## Rules that carried the hits
rule-02 (Saturn = restructuring ending upward), rule-04 (sponsors and boards as the channel), rule-01 (Mercury/Venus/Jupiter = career), rule-05 (money = institutional capital), rule-09 (seams +-6 months), rule-11 (Moon pratyantar = family turbulence). Held: 01, 02, 03, 05, 07, 09, 11. Need revision: 04 (patron strain now escalates to litigation), 06 (commitment timed by Jupiter, not "no marriage"), 08 (drop Ketu as a timer), 12 (Jupiter-pratyantar timing failed), 13 (Jupiter-in-Cancer clause failed). Not tested: 10. Four new low/medium rules (N-01..N-04); the strongest is N-03 (Mercury pratyantars bring both gains and accusations).

## Gap accounting (calibration-holdout.json)
Every prediction and every non-anticipated magnitude-3+ event has a category. Predictions: 30 hit, 9 quiet-correct, 13 partial, 1 alternate-reading (p-13), 1 stronger-influence (p-47). Unpredicted or partly predicted events: 6 partial, 2 alternate-reading, 2 stronger-influence. No outside-chart, birth-time-fragile or data-gap verdicts were needed. All 5 miss explanations are weak (post-hoc), as are 15 of the 19 partial explanations. Zero unexplained.

## Contamination caveat
The predictor disclosed that it recognised the subject (SEAL.txt, METHOD.md). It says it set that aside and cut phrases that were more specific than the rules. Even so, several hits are more specific than the rules justify:
- p-25 names marriage in mid-2023..mid-2024, against the spirit of rule-06.
- p-32 brackets the board crisis to the exact pratyantar and states the outcome.
- p-37 pairs senior departures with the corporate-form change.
- p-42 adds "public doubt about whether they are sustainable".
- p-43 adds "media investigations, testimony".
- p-16 adds government forums in spring 2023.
- p-26 adds a "non-conventional route to a child".
Treat these results as possibly contaminated. The hit rate is an upper bound on the method, not an estimate of it.

## Real predictive power vs post-hoc fitting
- The 72% hit rate overstates the method. 9 hits are null calls, and many AD-level calls are broad: "legal challenges", "criticism of trustworthiness" and "large capital raises" would hit for almost any prominent tech CEO in 2023-26. 18 of the 40 anticipated events are covered only by such two-year AD statements.
- The informative test is the 19 pratyantar-level calls: 10 hit, 8 partial and 1 false alarm. Some of these hits are exactly the items flagged for contamination (p-16, p-32, p-52). The clean timing successes that follow mechanically from the rules are the Saturn pratyantars (p-32, p-52, via rule-02 and rule-12), the Mercury pratyantar for capital (p-14, p-15) and the Moon pratyantar (p-38). No base-rate comparison was run.
- The rules were fitted on 1985-2022. The calibration explanations for the misses here (Saturn's technology signification, Saturn in the 12th over the 6th lord, the Sun as karaka of rulers) were added after the fact and are all marked weak. The method is good at explaining the past; it was not clearly better than an informed generic forecast at predicting it.
- Verdict: weak to moderate evidence of predictive power at the AD and seam level, confounded by contamination. To test it properly, the next window should be scored by a predictor that does not recognise the subject, alongside a generic-CEO baseline.
