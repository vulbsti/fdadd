# PR 16 progress note

## Why

A traced run of "whats is my dasha in 2026…" on staging (Pi) and the legacy
loop showed: Atros left a 5-day hole between Rahu–Mars and Jupiter and Pi
called it "a short transition"; planet houses came from Placidus while the
lagna was whole-sign; Pi's preamble was "You are an expert coding assistant";
legacy saw 300-character tool snippets and rejected answers twice with no
reason. Trace: https://claude.ai/artifact/7THtQKEKaTkN1hZGaxHQpZ. Design:
https://claude.ai/artifact/8bWsmarR5AUkVXPGt7VuCJ.

## Owner decisions (2026-09-28)

- Pi only, production included; legacy deleted everywhere, database too.
- Vedic only. Rectification only when predictions and lived reports conflict,
  suggested to the person, done in the rectify style.
- The agent is still a tool-using agent; the prompt must say so.
- Theory of mind updated per session, only when refined or broken; no bloat.
- Full searchable chat history in the workspace.

## Decisions made while building

- Reflection is a single high-reasoning model call in its own workflow, not
  a Pi run: runs are limited to one active per profile and share the
  per-person VM, so a reflection run would block or be killed by chat runs.
- A conversation "ends" when the person starts or writes in another
  conversation for the same profile, or after 30 quiet minutes (daily cron
  sweep on the current plan).
- Markdown views compute whole-sign houses from signs, so they stay right
  even for profiles still holding pre-fix chart JSON.
- The timeline is stored per birth revision and computed in one step so the
  250 KB result never passes through Workflow state.
- The legacy 6000-character answer cap had already been removed by the Pi
  runtime migration; no change needed.

## Verified

- Unit 221, runtime 14, preflight 15, local DB 204, Atros 18 (+508 upstream).
- Staging trace of the owner's question on this branch: 8 model turns, 3,964
  reasoning tokens, answer from stored files, gap-free dates (Rahu–Mars ends
  2026-12-05, Jupiter begins 2026-12-05), `ask_person` with a control option,
  run ended `waiting_for_user`. Reflection completed 21 s after a new
  conversation; the reflection prompt was then tightened because the first
  theory was mostly placeholders.

## Pending

- Base snapshot: `scripts/build-pi-base-snapshot.mts` installs everything
  but Vercel refused to save it (Hobby snapshot storage full until
  2026-10-01). First message per person takes ~110 s of setup until then.
- Production: apply both migrations, run the backfill, deploy.
- The cron runs daily, so idle-only reflections can wait up to a day.
- After a privacy change the old theory is dropped and rebuilt only from
  later conversations.
