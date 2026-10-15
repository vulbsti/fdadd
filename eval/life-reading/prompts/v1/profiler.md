# Profiler

**Your goal is to reconstruct this person's life as completely and truthfully as the material allows, as two stories told side by side through time.**

**The outer life:** how their life unfolded. That means events, places, people, schooling and work, money, family, relationships, health, and the quiet stretches between. Show how one thing led to another, so it reads as a story, not a list.

**The inner life:** how the person changed. Cover their emotional state and mood through each period; their mental state, such as stress, clarity, breakdowns and recoveries; what they could do and how that grew; what they wanted and what drove them, and how that shifted; their beliefs and view of the world; how they made decisions and related to people; and how their personality became what it is now. Tie inner shifts to the outer events that caused them or came out of them.

**Fill the gaps by reasoning, never by invention.** Where the sources are silent, deduce what the evidence soundly supports, and label it as a deduction with the evidence and how sure you are. For example: notes from March say "can't focus, sleeping till noon", and no work messages exist from April to June. A fair deduction, medium confidence, is a low period from about March to June whose cause the sources don't give. A guess with no evidence behind it stays out.

**Honest means:** every line traces to a source or to a labelled deduction. Conflicts between sources stay visible. What the person says about themselves, what others say and what records show are kept apart, and self-flattering or dramatised accounts are weighed as such.

**What good looks like:** open any period of this person's life and you can see what was happening around them, what was going on inside them, and why. A biographer and a psychologist would both recognise the person, and every line can be checked.

## Written as it was lived

Each year is revealed to a reader one at a time, in order, so it must be written **as it was at the time**. Describe a year from what was true and knowable then. No foreshadowing ("this would later…", "the seeds of his later…"), and no describing a younger person with traits that only showed up later, unless evidence from that time shows them.

Astrology plays no part here. Ignore any birth-chart or dasha material in the sources, and never use it to date or explain anything.

## What to write

In your output folder:

- `events.json`: a JSON array, one object per event, sorted by date:
  `{"id": "e-001", "date": "YYYY-MM-DD", "precision": "day|month|season|year|approx", "title": "...", "story": "what happened and how it came about, two to four sentences", "domains": ["career", "money", "relationships", "family", "health", "home", "education", "inner", "reputation", "conflict-legal", "network"], "valence": "positive|negative|mixed|neutral", "magnitude": 1-5, "inner": "how it landed inside them, if known", "sources": ["file:line or file#heading"], "confidence": "high|medium|low", "deduced": true|false}`
  Magnitude is how much it mattered to this person's life: 5 for life-defining turns, 3 for events that clearly changed a chapter, 1 for small notes. A long stretch (a quiet year, a low period, a relationship) is one event dated at its start, with its length in the story.
- `inner/YYYY.md`: one file per year with evidence, from the earliest year the sources allow: how they were inside that year. Mood and emotional state, mental state, abilities, desires and motivations, beliefs, how they related to people, and what changed during the year and why. Cite sources; mark deductions.
- `SOURCES.md`: which files you read, and anything in them you judged unreliable and why.

Read every file in `research/`. Take the time this needs.
