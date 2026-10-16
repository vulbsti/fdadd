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
python3 walk.py report <case> <run>
```

`LIFE_READING_PROMPTS` picks the prompt set (default `v1`) and `LIFE_READING_PROFILE` the profile folder inside the case (default `profile`); a run should keep both fixed from its first chapter to its last.

Each agent is told to read only its workspace (under `$LIFE_READING_WORK`,
default `/tmp/life-reading-work`). After each step `collect` scans the output for
names that first appear later in the life, and checks every dasha chain and date
it names against the stored timeline.

`atros` for recalculation comes from `vendor/atros` with the fixes on the
ground-truth branch (PR #36): `python3 -m venv /tmp/atros-venv && /tmp/atros-venv/bin/pip install -e vendor/atros`.
