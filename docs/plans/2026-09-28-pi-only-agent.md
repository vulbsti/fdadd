# Pi-only agent: persona, precomputed chart, legacy removal

Date: 2026-09-28. Branch: `claude/pi-only-agent`. Design discussion:
[Aidoraa Agent Redesign](https://claude.ai/artifact/8bWsmarR5AUkVXPGt7VuCJ) and
[Dasha Question Trace](https://claude.ai/artifact/7THtQKEKaTkN1hZGaxHQpZ).

## Decisions (from the owner)

- One runtime: the Pi workspace agent. The legacy planner loop is removed from
  code, tests and database; production runs Pi.
- Vedic astrology only (Vimshottari dasha, Lahiri, whole-sign houses). No
  other systems in reasoning or answers.
- Persona: an assistant that decodes and understands the person, connects
  dots, helps them see reality and make sense of things, and builds a theory
  of mind through astrology and personal context. It is still a tool-using
  agent: search, read, grep and write files well.
- Calculation and interpretation are separate. All deterministic calculations
  are made when birth details are saved and are read from files afterwards.
  Recalculation is only for rectification: when chart-derived predictions do
  not map to what the person reports, the agent suggests testing another
  birth time and reasons like the Atros rectify skill.
- Thinking level `high`.
- Theory of mind is updated per chat session, not per answer, and only when
  new information refines or breaks an earlier theory. Avoid bloat.
- The workspace holds the full, searchable chat history. Theory of mind is
  the model of the person; chat history is the evidence over time.

## Work items

1. **Atros correctness** (`vendor/atros`): dasha children tile their parent
   exactly (no truncation gaps); planet houses are whole-sign from the
   ascendant. Tests for both.
2. **Calculation layer**: `astro_profile_calculations` stores chart,
   sensitivity, lifetime pratyantar timeline and monthly transits per birth
   revision. Computed by the intake workflow; backfill for existing profiles.
   TypeScript formatters write `astrology/chart-summary.md`,
   `astrology/dasha/timeline.md`, `astrology/dasha/now.md`.
3. **Workspace content**: `history/` with every chat session as Markdown
   (searchable), `notes/theory-of-mind.md` from `person_theory_of_mind`
   (read-only during chat runs), existing `person/` files.
4. **Pi runtime**: replace Pi's coding preamble with the Aidoraa prompt
   (`--system-prompt`), skills `chart-reading`, `rectify`, `person-context`,
   tools: Pi built-ins + `person_state` (capabilities only) + `recalculate`
   (hypothesis birth time → `astrology/hypotheses/`) + `ask_person` (one
   focused question, publishes `waiting_for_user`). Remove `workspace_*` and
   `atros_*` tools. Thinking `high`.
5. **Session reflection**: a `reflect` run kind updates the theory of mind
   from one finished session (new session started for the person, or idle
   sweep), writing a new revision only when something is refined or broken.
6. **Sandbox image**: base snapshot installs Pi, Atros, `fd`, `ripgrep`,
   `jq`; the non-snapshot path installs the same before the network is sealed.
7. **Legacy removal**: the planner loop, its tools, verification, selected
   context, finish proposals, budgets, legacy tests and the
   `ASTROLOGER_RUNTIME` switch. Production guard removed.
8. **Database**: new tables and RPCs above; legacy-only tables and functions
   dropped in a separate migration applied after the owner confirms.
9. **Verification**: unit tests, local DB suite, staging Preview trace of the
   dasha, career and personal questions plus a reflection, then production
   migration and deploy only after owner approval.
