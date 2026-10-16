# This step: forecast the hidden years

You stand at {{START}}. You have walked through this person's life up to here, and `notes/` holds everything you learned. Nothing after this date is known to you.

`chart/window.md` lists every chart signal for the span, each with an id (S1, S2, ...). Open `forecast.md` with a `## Signals` section that takes each one by its id and says how it could build and how it could break for this person. Group signals that say the same thing; leave none unanswered.

Then write the forecast: the life this person will live from {{START}} to {{END}}, chapter by chapter and sub-period by sub-period, as concretely as in your chapter readings. Cover relationships, work and business, money, family, health, home and their inner state. Say when things turn and what turns, and how sure you are. Over a span this long, life rarely only rises: weigh the hardest plausible turn for work, money and their inner state as seriously as the best, and say why you bet as you do. A decision still open at {{START}} (an offer in hand, a move being weighed) is not settled: give each way it could go, with your odds, and what each would look like.

The person's situation itself can change: a job can end, a move can happen, money can run out. So carry the possible situations forward from window to window, with their odds (for example, working / between jobs / building their own thing), and read each window for each situation that has a real chance, rather than writing every window as if the likeliest branch had already happened. Let their own history set your starting odds: how their jobs, offers, ventures and low periods have actually gone so far, and how their openings have come. Where you bet against that history, say what in the chart makes you do so.

For every situation with a real chance, say what the person does in it, not only how bad it is, using how they behaved in that situation before. Someone who has met past setbacks by starting something of their own will likely do so again; someone who has met them by withdrawing will likely withdraw. The events that matter most often live inside the branch you rated second.

At the end, say for the whole span how likely the biggest turns are (losing work, a stretch without income, a real low). These should be what your windows add up to: a .20 chance in one window and a .30 chance in another make about .44 across both, not .35. An Expected item written for one situation can't be likelier than that situation; scale it, or write what it becomes in the others.

So that a script can check the chain adds up, close the forecast with a fenced block tagged `json situations` holding what your windows say:

```json situations
{
  "situations": ["employed", "between jobs", "own venture"],
  "leadsTo": {"work ends": "between jobs"},
  "windows": [
    {"name": "Ma-Ra-Ju", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD",
     "share": {"employed": 0.60, "between jobs": 0.10, "own venture": 0.30},
     "risks": {"work ends": 0.05, "real low": 0.10}}
  ],
  "span": {"work ends": 0.35, "real low": 0.35},
  "items": [{"n": 4, "p": 0.60, "situation": "employed", "window": "Ma-Ju-Sa"}]
}
```

`share` is the odds of each situation at the window's end; `risks` is the chance each big turn happens inside that window; `span` is your whole-span figure for each turn; `items` lists the Expected items that are written for one situation only. Use your own situation and turn names, the same ones throughout. If `CHECKS.json` is in your workspace, it is what that script found in an earlier draft; settle each point in the forecast itself, either by changing the numbers or by saying why they stand.

Your notes end with what you expected going forward and what you were watching for. Each of those either finds a place in this forecast with odds, or gets a line on why you now set it aside.

Then list what you expect under `## Expected`, one per line: things you think more likely than not, each with the part of life, what happens, roughly when, how big it is for them (1 to 5), and your probability. For each item of size 3 or more, add a short lean: the signals (by id) that point this way, the ones that point the other way, and any rule from your notes you are relying on with its record. These are what you will be held to; padding counts against you.

Under `## Named tails`, list the turns you think less likely but real, each with its probability: the other way of your big items, and the biggest things the span could hold in either direction. Anything you give .50 or more is a bet wherever you write it, and is scored as one.
