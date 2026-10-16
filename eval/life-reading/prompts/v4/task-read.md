# This step: read the chapter ahead

You stand at {{START}}. The {{CHAIN}} chapter runs from {{FULLSTART}} to {{FULLEND}}; you read it from {{START}} to {{END}}. The person is {{AGE}} years old. You know their life up to this date and nothing after it.

`chart/window.md` lists every chart signal for this chapter, each with an id (S1, S2, ...): the period lords and what each one is in this chart, the houses that carry each part of life, and every slow-transit ingress, station and exact contact with a natal point, with dates. Open `reading.md` with a `## Signals` section that takes each one by its id and says, in a line or two, how it could build and how it could break for this person, and which you expect. Group signals that say the same thing; leave none unanswered. This is where you see the whole chart before you tell its story.

Then write the reading: the life this person will live from {{START}} to {{END}}, as concretely as you can. Cover their relationships, work and business dealings, money, family, health, home and their inner state, and anything else this chart points to for this chapter. Say when things turn and what turns, using the sub-periods inside the chapter and the transits over it. Say how sure you are of each part, and why.

Chain the big items. If one of your tails comes true (the bond ends, the job goes, the mood drops), what do the window's other signals do to the person then, and what do they do in it, judging by how they have behaved in that situation before? Where the chapter has more than one live situation, read each one, and give each Expected item the odds it has across all of them, not only in the likeliest. If the chapter does turn on a situation that could change, you can close the reading with a fenced block tagged `json situations`, and a script will check that it adds up:

```json situations
{"situations": ["together", "apart"], "leadsTo": {"bond ends": "apart"},
 "windows": [{"name": "Ma-Ra-Ju", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "share": {"together": 0.7, "apart": 0.3}, "risks": {"bond ends": 0.25}}],
 "span": {"bond ends": 0.35},
 "items": [{"n": 4, "p": 0.55, "situation": "together"}]}
```

`share` is each situation's odds at the end of a window, `risks` the chance of each big turn inside it, `span` your figure for the whole chapter, and `items` the Expected items written for one situation only. If `CHECKS.json` is in your workspace, it is what that script found in an earlier draft; settle each point in the reading itself.

Then list what you expect under `## Expected`, one per line: things you think more likely than not, each with the part of life, what happens, roughly when, how big it is for them (1 to 5), and your probability. For each item of size 3 or more, add a short lean: the signals (by id) that point this way, the ones that point the other way, and any rule from your notes you are relying on with its record. These are what you will be held to; padding the list with things you don't believe counts against you. Every item is about the person's life, never about what the record will or won't contain.

Under `## Named tails`, list the turns you think less likely but real, each with its probability: the other way of your big items, and the biggest thing this chapter could hold in either direction if it isn't already in Expected. A tail that happens tells us you saw it and bet against it, which is a different lesson from not seeing it at all. Anything you give .50 or more is a bet wherever you write it, and is scored as one.

You may update `notes/` if reading the chapter taught you something about the chart. Don't touch anything outside this workspace.
