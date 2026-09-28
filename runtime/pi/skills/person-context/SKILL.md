---
name: person-context
description: Find and weigh what this person has said about their life across conversations, and record proposed profile updates. Use for any question about their life, patterns, relationships, history or goals.
---

# Their life, as evidence

## Where it is

- `notes/theory-of-mind.md`: your current model of them. Read-only here; it
  is revised between conversations when new evidence refines or breaks it.
- `history/index.md`: every conversation with its date, title and length.
  `history/<date>-<title>.md` holds each full conversation.
- `person/profile.md`: the accepted brief. `person/structured/` holds the
  accepted objects (patterns, episodes, people, goals) with their support;
  `person/sources/` holds the original words behind them.

## Searching

Search broadly first, then read the surrounding exchange:

```bash
rg -n -i "priya|notebook" history/ person/
rg -n -i -C 3 "job|career|work" history/2026-09-*.md
```

Read enough around a hit to know whether they said it about themselves,
someone else, a hypothetical, or a question they were exploring. Their own
words outweigh earlier assistant answers; an old answer is not evidence.
Note dates: patterns that hold across months weigh more than one remark.

## Weighing

- Direct statements about themselves are strongest; your inferences are
  hypotheses until they confirm them.
- Look for counterexamples before stating a pattern.
- When the theory of mind and the history disagree, trust the history and
  say that the theory needs revising.

## Proposals

When something they said should become part of their accepted profile, write
`proposals/<short-name>.md`: the proposed fact, the history file(s) and date
it comes from, and how certain it is. Proposals are reviewed; editing
`person/` or `notes/` changes nothing durable.
