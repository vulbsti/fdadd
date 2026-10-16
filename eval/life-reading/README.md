# Life-reading walk

A workflow, run on Opus sessions, that reads a person's life from their Vedic
chart and their own story, checks every chapter against what happened, and
learns until it can forecast hidden years with no misses. The design is in the
project doc "Life-reading calibration workflow".

Nothing personal is stored here. Case data and runs live in
`$LIFE_READING_HOME` (default `/mnt/project-files/life-reading`).

## Agents

| Agent | Prompt | Sees |
| --- | --- | --- |
| Profiler | `prompts/v1/profiler.md` | All research material; writes a dated outer life (`events.json`) and inner life (`inner/YYYY.md`) |
| Analyst, reading | `analyst.md` + `task-read.md` | Chart, its notes, life up to the chapter start |
| Analyst, matching | `analyst.md` + `task-match.md` | The same, its sealed reading, and the chapter's events |
| Analyst, forecast | `analyst.md` + `task-forecast.md` | Chart, its notes, life up to the cut-off |
| Scorer | `scorer.md` | One sealed reading and the events it covered |
| Reviewer | `reviewer.md` | A whole walk, to find where the workflow let misses through |

## Driving a walk

```bash
python3 walk.py chapters <case>
python3 walk.py prepare <case> <run> 1 read      # prints the workspace; start an Opus agent in it
python3 walk.py collect <case> <run> 1 read      # seals reading.md, runs the dasha and leak checks
python3 walk.py prepare <case> <run> 1 match
python3 walk.py collect <case> <run> 1 match     # notes carry forward to chapter 2
# ... every chapter, then:
python3 walk.py prepare <case> <run> final forecast
python3 walk.py collect <case> <run> final forecast
python3 walk.py score-prep <case> <run> <n|final>   # Scorer workspace; then score-collect
python3 walk.py score-prep <case> <run> regression  # v4: the Scorer regression set, once per run; then score-collect
python3 walk.py report <case> <run>
```

`LIFE_READING_PROMPTS` picks the prompt set (default `v1`) and `LIFE_READING_PROFILE` the profile folder inside the case (default `profile`); a run should keep both fixed from its first chapter to its last.

Each agent is told to read only its workspace (under `$LIFE_READING_WORK`,
default `/tmp/life-reading-work`). After each step `collect` scans the output for
names that first appear later in the life, and checks every dasha chain and date
it names against the stored timeline.

From prompt set v3, `prepare` also writes `chart/window.md` for each read and forecast step: `signals.py` lists every period lord, the houses for each part of life, and every slow-transit ingress, station and exact contact in the window, each with an id. `collect` reports any id the reading left unanswered, and `report` adds a column for misses the reading had named as a tail.

## v4

`LIFE_READING_PROMPTS=v4` turns on what `prompts/v4/settings.json` lists (a set without that file runs as before):

- **Chart signals** (`signals.py --v4`): each slow contact gives the dates it enters and leaves its 2-degree orb (a contact that began before the window keeps its true start), the stations inside it and every sub-period it runs through. When a Jupiter aspect or conjunction on the Moon, the lagna or a period lord ends inside the window, that is an egress signal of its own, both by orb and by whole sign. Each period lord lists the houses it rules and sits in counted from the 10th, 2nd, 11th, 7th and 4th ("the 3rd = 6th from the 10th").
- **Birth time**: `walk.py sensitivity <case>` (once per case) recomputes the chart with atros at every minute within 5 of the recorded time and writes `chart/sensitivity-placements.json`. The existing `chart/sensitivity.json` is atros's own output and is left alone. `window.md` then marks every placement that moves in that range as "birth-time fragile", and says how far dasha dates move.
- **Record by part of life**: `prepare` appends a table to `window.md` for each read and forecast step. It is built from every earlier `score.json` in the run and shows, for career, money, relationships, family, health, inner life and place, how bets leaning build and break went, which way the misses went, and how many named tails happened.
- **Situations chain**: forecasts (and readings that have more than one live situation) close with a `json situations` block. `collect` and the new `check` command compute what the window risks add up to over the span. They flag a span figure more than .05 away from that, a window risk the table of situations does not carry, an Expected item written for one situation that is likelier than the situation, and any item at .50 or more under Named tails. Results go to `checks-*.json` under `chain`. Run `walk.py check <case> <run> <n|final> read|forecast` on the workspace before collecting. It writes `CHECKS.json` there, so the Analyst can be re-run until the checks come back clean.
- **Scorer**: it also gets the revealed `inner/` years and judges every item at .50 or more as a bet, wherever it is filed. For each event it adds `covered` (named as a bet or a tail, with a fitting window and direction), and for each item and event an `arena` and a `direction`. `report` adds a Covered column and a Chain flags column.
- **Scorer regression set**: `$LIFE_READING_HOME/regression/items.json` holds past items with agreed verdicts. It quotes private records, so it stays in the data dir; `regression/build.py` there rebuilds it. Score it once per run with `walk.py score-prep <case> <run> regression`, have a Scorer write `cases/<id>/score.json` for each folder, then run `walk.py score-collect <case> <run> regression`. The result goes to `runs/<case>/<run>/regression.json`, and `report` prints how many verdicts agree and which drifted.
- **Leak check** (all prompt sets): a case leak term or capitalised word the agent was already shown before the cut-off is no longer flagged, and neither are sentence-initial words or month ranges.

`atros` for recalculation comes from `vendor/atros` with the fixes on the
ground-truth branch (PR #36): `python3 -m venv /tmp/atros-venv && /tmp/atros-venv/bin/pip install -e vendor/atros`.
