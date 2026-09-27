---
name: atros
description: Precise Vedic astrology calculations (dasha timelines, current dasha, charts) with the Atros engine. Use for any dated or chart-based astrology claim when astrology is enabled.
---

# Precise astrology calculations

Use Atros, not mental arithmetic, for dated chart or dasha claims.

- For a requested year or month, call `atros_timeline` with that date range and
  the needed period level. Read the complete relevant records, including
  transitions at the range edges.
- `atros_current_dasha` and the birth balance are not a full dated timeline.
- Tool outputs are saved under `astrology/calculations/<id>/` with a
  `receipt.json`; search and read them again instead of recalculating.
- Other Atros subcommands are available through bash as
  `/tmp/atros-venv/bin/atros <command> --help`. Take birth inputs only from
  `astrology/birth.json`, and save anything you rely on under
  `astrology/calculations/`.

Ask for birth details only when `person_state` reports them missing. Never
change consent.
