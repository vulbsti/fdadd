---
name: rectify
description: Test whether the person's birth time is off when chart-based predictions keep conflicting with their life. Use only after real conflict, and only with the person's agreement.
---

# Rectification in conversation

Adapted from the Atros rectify workflow for a chat that spans several
messages. The saved chart stays the reference until the person confirms a new
birth time in their settings; you never change it yourself.

## When to start

Only when both are true:

- Predictions from the saved chart repeatedly miss what the person reports
  (several events or traits, not one), and
- `astrology/sensitivity.json` shows fragility where the misses are: a
  boundary planet whose house carries the missed themes, a D9 lagna that
  flips within the tested offsets, or dated events within the dasha shift
  window of a seam.

Then tell the person what doesn't fit, why a small birth-time difference
could explain it, and ask whether they want to test it. The birth-time
source in `chart-summary.md` matters: a hospital record is usually within a
few minutes; a parent's memory can be off by 15 or more.

## Keep state in files

Everything for one rectification lives in `work/rectification/`:

- `events.md`: dated life events with what they said and where (history
  file), each tagged with its maha/antar/pratyantar at the saved time.
- `hypotheses.md`: two or three candidate birth times, each with what it
  predicts differently and which answers would discriminate.
- `log.md`: questions asked, answers, and how each moved the constraint.

Read these first if they exist; the rectification may have started in an
earlier conversation.

## Evidence, strongest first

1. **Boundary-planet tests**: for each boundary planet, describe the two
   lived versions (planet + dignity + each candidate house + lordship, in
   everyday words, per `../chart-reading/references/questioning-framework.md`
   and `house-themes.md`). One clear answer constrains minutes.
2. **Dasha seam timing**: events near seams. If events consistently land
   before the seams, the time is likely later; after, earlier.
3. **D9 lagna**: inner nature and partnership descriptions for the candidate
   D9 signs (`ascendant-profiles.md`). Rules out ranges; never pinpoints.
4. **Ascendant character**: only for confidence, unless the time is very
   uncertain.

## Asking

Use `ask_person` for one question at a time. Frame options in everyday life
terms, never "Saturn in the 12th". Always include one option that would mean
the current hypothesis is wrong; answers where every option confirms are
worthless. "Both fit" or "I don't know" means abandon that line and switch
evidence type. Silence is data: a period predicted to be quiet should be.

## Testing a candidate time

Use `recalculate` with the candidate birth time and a label (for example
`plus-4min`). It writes the chart summary, timeline and a comparison with the
saved chart into `astrology/hypotheses/<label>/`. Compare which version the
evidence fits. Contradictory pushes (one test says earlier, another later)
mean investigate the weaker test; never average them.

## Finishing

Before claiming a time, ask yourself: does my evidence distinguish adjacent
candidates at the precision I am claiming? Report the most likely time or
range, the confidence, and the evidence for it, and tell the person they can
update the birth time in Settings if they agree. Record the outcome in
`work/rectification/log.md`.
