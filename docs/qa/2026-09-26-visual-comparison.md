# P2 approved-mock visual comparison — 2026-09-26

## Evidence and scope

Ran `npm run test:e2e:p2-visual:local -- --output=test-results/p2-visual-20260926`
and reran the same suite with `--trace=on`. The dedicated production build is
`.next-p2-visual`; the app ran on port 9014 against the disposable local
Supabase stack. All 3 Playwright projects passed on both runs: `laptop-wide`
(1586×992), `laptop` (1366×768), and `mobile` (390×844 CSS px). The harness
generated 12 UI screenshots, one mobile keyboard-tab capture, and
three successful-run trace archives under:

`/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/`

This is deterministic fixture data, not the real-provider/system-pipeline
journey. The test checks for horizontal document overflow; it does not compare
pixels or validate the live reasoning pipeline. Traces were explicitly enabled
for the second run; keep them private because they contain authenticated local
browser state.

## Comparison

| Approved reference → fixture view | Concrete visual difference |
| --- | --- |
| [`01-life-map.png`](</home/vulbsti/proj/aidora/fadd-redv2/docs/design/astrologer-ui-mocks/2026-09-19/v2-life-map/01-life-map.png>) → life map | The warm paper, navy type, three-part “shaped / where / paths” framing, and event line carry through. The fixture is much sparser: three nodes in the shaped column, one current-state entry, and one conditional path, versus the mock's branching timeline, multiple events, two paths, and lower quote/question cards. In desktop captures a second “WHAT SHAPED YOU” label repeats inside the first panel. At mobile width the three framing headers stack before the actual timeline, making the opening disproportionately tall. |
| [`02-how-you-think.png`](</home/vulbsti/proj/aidora/fadd-redv2/docs/design/astrologer-ui-mocks/2026-09-19/v2-life-map/02-how-you-think.png>) → pattern | The product keeps the title, working explanation, exception, and visual step cards, but the mock's richer two-loop causal picture (including a stalled cycle, open question, quoted evidence, and episode timeline) becomes a simple three-card progression plus exception/alternative/question tiles. The reference's astrology-connection panel is absent in this fixture. Desktop/laptop spacing is looser and the lower question/Explore action falls below the captured first screen compared with the mock's single composed view. On mobile the large title and vertical card stack turn the view into a long scroll. |
| [`04-meaning-change.png`](</home/vulbsti/proj/aidora/fadd-redv2/docs/design/astrologer-ui-mocks/2026-09-19/v2-life-map/04-meaning-change.png>) → chapter | The colored stages and “continue from this turning point” action preserve the mock's story-and-follow-up intent. The mock shows an explicit early account, intervening questions, a changed account, and present-day connections as one linked narrative; the fixture uses three separate cards with minimal content and a fourth “no present-day connection” panel. Desktop preserves the left-to-right sequence, but laptop leaves substantial empty card space; mobile turns the sequence into very tall cards. |
| [`03-guided-chat.png`](</home/vulbsti/proj/aidora/fadd-redv2/docs/design/astrologer-ui-mocks/2026-09-19/v2-life-map/03-guided-chat.png>) → guided chat | The mock is an active conversation: an assistant answer, “what stays / what may change” recap, follow-up choices, and composer. The fixture is the pre-message state: its title names the chapter, a saved-context banner and two recap tiles appear above a “Start with a focused question” prompt card, and the composer is empty. This proves the contextual entry route, not the answer-and-follow-up experience in the approved mock. Mobile has the same content in a tall single column. |

The navy/cream palette, serif display headings, sans-serif body text, profile
navigation, and warm accent links are consistent across captures and mocks.
The life-map page-width assertion passed at all three widths, and the mobile
test confirmed the off-screen “Paths ahead” tab is keyboard reachable. The
suite does not measure every route for overflow. This is responsive/interaction
evidence, not visual parity. The largest parity gaps are content density and
narrative richness in the pattern, chapter, and active-chat views.

## Local screenshot paths

Each entry below is a viewport screenshot. `laptop-wide` is the desktop-sized
project (1586×992); `mobile` images are device-scale screenshots at 390×844 CSS
px. The file suffix matches the project and the file name.

- Life map:
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-laptop-wide/p2-life-map-laptop-wide.png`
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-laptop/p2-life-map-laptop.png`
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-mobile/p2-life-map-mobile.png`
- Pattern:
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-laptop-wide/p2-pattern-laptop-wide.png`
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-laptop/p2-pattern-laptop.png`
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-mobile/p2-pattern-mobile.png`
- Chapter:
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-laptop-wide/p2-chapter-laptop-wide.png`
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-laptop/p2-chapter-laptop.png`
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-mobile/p2-chapter-mobile.png`
- Guided chat:
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-laptop-wide/p2-guided-chat-laptop-wide.png`
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-laptop/p2-guided-chat-laptop.png`
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-mobile/p2-guided-chat-mobile.png`
- Keyboard reachability:
  - `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-mobile/p2-tabs-keyboard-reachable-mobile.png`

## Successful-run traces

One private trace archive was generated for each Playwright project:

- `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-laptop-wide/trace.zip`
- `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-laptop/trace.zip`
- `/home/vulbsti/proj/aidora/fadd-redv2/test-results/p2-visual-20260926/astrologer-p2-visual-revis-74a0f-ch-the-approved-composition-mobile/trace.zip`

These are ignored local artifacts, not CI uploads. They may contain auth state;
do not commit or share them.
