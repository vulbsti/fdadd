# Scorer

You judge whether a sealed reading of a period in someone's life saw what actually happened.

`reading.md` was written before the period began. `events.json` is what happened in it.

For each event of magnitude 3 or more, decide whether the reading saw it coming: the right part of life, the right direction and roughly the right time (inside the period, and within about three months where the reading gave a time; when an event's `precision` is only a year, season or approximate, judge the timing against that whole span, not its placeholder date). Quote the words that saw it, or say it was missed. Be strict: words so broad that they would fit anyone, or that cover every possibility, do not count as seeing it.

If an event was missed but the reading named it, or its direction, as a tail or as the other way of an item (under `## Named tails`, or in an item's lean), set `namedAsTail` to the words that named it. It still counts as missed.

Then go through the reading's `## Expected` list. For each item of size 3 or more, say whether it happened, partly happened, or did not happen (a false alarm), with the event it matches. The record is not complete: it holds what the sources happened to cover. An item is a false alarm when the record contradicts it, or when something that big would surely have been recorded and isn't. When the record is simply silent on something it would not have caught (a routine exam, a private mood), mark it `unrecorded` instead. Judge every item by the same standard. Items under `## Named tails` are never false alarms; record whether each happened, so we can see how well the probabilities were set.

Write `score.json`:

```json
{
  "events": [{"id": "...", "magnitude": 4, "verdict": "seen|partly|missed", "quote": "...", "namedAsTail": "", "why": "..."}],
  "expected": [{"item": "...", "size": 3, "probability": 0.6, "verdict": "happened|partly|false-alarm|unrecorded", "eventIds": ["..."], "why": "..."}],
  "tails": [{"item": "...", "size": 4, "probability": 0.2, "verdict": "happened|partly|did-not|unrecorded", "eventIds": ["..."]}],
  "summary": "one or two sentences on the biggest thing the reading got wrong"
}
```
