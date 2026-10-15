# Ground-truth evaluation

Checks the Astrologer against people whose lives we know in depth, so a
change to prompts, skills, the person model or the runtime shows where it
moves closer to, or away from, what [VISION](../docs/VISION.md) asks for.

## What a case holds

`ground-truth/<person>/`

| Path | What it is |
| --- | --- |
| `case.json` | Birth details and their source, the cut-off date (`asOf`), input variants |
| `chart/` | Chart, every antardasha and pratyantar, slow-planet ingresses, from the vendored Atros engine |
| `life-events.json` | Every dated life event with source and evidence grade; `set` is `fit` (before the cut-off) or `holdout` (after) |
| `traits.json` | Patterns of behaviour with independent witnesses |
| `blind/` | Readings written from the chart alone, with identity and dates removed, sealed by hash before the life was looked at |
| `gold/calibration.json` | Every antardasha to the cut-off: what the blind reading predicted, what happened, and an explanation for every miss (fixed categories, each marked strong or weak) |
| `gold/rules.json` | Person-specific lessons from the misses, in chart terms |
| `gold/natal-verdicts.json` | Which candidate readings of each placement the life supports or refutes |
| `gold/model/` | The person-model files the Analyst should hold on the cut-off date |
| `gold/holdout/` | Predictions for the held-out years made from the calibrated model (sealed), their score, and the gap explanations |
| `inputs/` | What the agent under test sees: the person's own-words history to the cut-off and their profile. `masked` hides who they are; `named` does not |
| `questions.json` | What we ask on the cut-off date, and what each answer is judged on |

"Zero deviation" means every prediction and every significant event is
either matched or carries a recorded explanation; nothing is unexplained.
Weak (after-the-fact) explanations are allowed but labelled.

## Running it

Needs `OPENCODE_API_KEY` (the production model key) and, once per containerIn a Claude cloud session the agent proxy injects the key for opencode.ai, so
set `OPENCODE_API_KEY` to any placeholder and `NODE_USE_ENV_PROXY=1` (Node's
`fetch` skips the proxy otherwise and the provider answers 401). Once per
container:

```bash
eval/setup.sh
```

Then:

```bash
node --experimental-strip-types eval/harness/run.mjs eval/ground-truth/sam-altman --variant masked
node eval/harness/score.mjs eval/ground-truth/sam-altman eval/runs/<run>
node eval/harness/compare.mjs eval/runs/<baseline> eval/runs/<run>
```

`run.mjs` builds the workspace with the app's own renderers, starts a local
stand-in for the Pi broker that forwards model calls to the production
endpoint and model, and runs the unchanged `runtime/pi/runner.mjs` once per
question in a fresh workspace. `score.mjs` adds code checks (dasha facts
against the stored timeline, chart jargon, day/week-level claims, the one
question, knowledge of the future or of the person's identity the inputs never
gave) and a judge pass with a fixed rubric against the gold data.
`compare.mjs` lists every metric and verdict that moved between two runs.

## Known limits

- A model that recognises a famous person can answer from memorised news
  rather than the chart. Masked inputs reduce this; the identity and future
  leak checks measure it. A person the model cannot know about (the owner's
  own data) is the only fully clean case.
- The birth time is the person's own recollection, so dasha dates carry about
  three months of uncertainty per hour of error.
