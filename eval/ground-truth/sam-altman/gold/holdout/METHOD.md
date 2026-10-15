# METHOD

- Inputs: only the files in predict-in/ (chart.json, periods-*.json, transits-*.json, rules.json, natal-verdicts.json, arcs.md, drives.md, now.md, chart-readings.md). No repo, no /mnt/project-files, no web.
- Conventions: Lahiri, whole-sign, true node, Vimshottari, saved birth time (05:00 reported). The time is not rectified; dates carry about ±3 months per hour of birth-time error.
- Recognition disclosure: the person model's details make the subject recognisable to me. I set that aside and did not knowingly use any real-world knowledge of events after 2022-06-30. Each prediction is derived from dasha and transit mechanics plus the learned rules. Where a draft phrase looked more specific than the rules justify (e.g. a particular form of ownership change, or "removal"), I cut it back to the rule-level claim. Even so, residual contamination cannot be fully excluded, and scorers should weigh this.
- Structure:
  1. Every one of the 11 domains for each AD in the window: Rahu-Mars, Jupiter-Jupiter, and Jupiter-Saturn (from 2025-08-24, truncated at 2026-06).
  2. The MD seam treated as a 2023-01 to 2024-01 window (rule-09).
  3. Pratyantar flags from now.md, used only where rule-12 says they are reliable (Saturn, Mars, Jupiter, Mercury/Venus for career). Venus pratyantars are not used for relationships (rule-12, rule-06).
- How the rules were applied:
  - rule-01: Jupiter, Mercury and Venus windows are scored career >=4.
  - rule-02: Saturn AD and pratyantars are read as restructuring ending upward, not collapse.
  - rule-03: no breakup is predicted, because Saturn does not reach Libra.
  - rule-04: patrons, boards and sponsors are the channel, and they strain in malefic pratyantars.
  - rule-05: money is read as institutional capital flows.
  - rule-07: health is low-weight and low-confidence.
  - rule-08: visibility requires a Rahu or Jupiter activation (Rahu on the lagna to 2023-11; Jupiter on the lagna 2023-04 to 2024-05).
  - rule-11: Moon pratyantars are read as family turbulence.
  - rule-13: property is read from Moon activation and Jupiter in Cancer.
- Slow transits used:
  - Saturn: Capricorn (over natal Jupiter) to 2023-01, then Aquarius (11th) to 2025-03, then Pisces (12th, over Venus/Mercury).
  - Rahu: Aries (lagna) to 2023-11, then Pisces, then Aquarius.
  - Jupiter: Aries (aspects 5th/7th/9th), then Taurus (over the Moon), then Gemini (aspects the 7th), then Cancer (4th).
- Classical additions beyond the rules (marked low): Jupiter's aspect on the 7th and 5th as a commitment/family window; nr-06c for reputational scrutiny in Jupiter-Saturn.
- Confidence calibration: there are no "high" items. The strongest calls (medium) are the Jupiter-Jupiter career and money peak, the winter 2023-24 governance crisis (Saturn pratyantar at the seam), and Jupiter-Saturn restructuring with reputational scrutiny.
- 54 predictions; JSON validated with python3 (schema enums, magnitude range, window order).
