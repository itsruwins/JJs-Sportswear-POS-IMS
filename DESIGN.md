---
name: J&J Sportswear
description: The liga scoreboard world. Court-green board panels, off-white split-flap cards, shot-clock amber for live and low.
colors:
  board: "oklch(0.43 0.105 158)"
  board-deep: "oklch(0.355 0.09 158)"
  board-edge: "oklch(0.3 0.075 158)"
  board-line: "oklch(0.52 0.09 158)"
  board-text: "oklch(0.43 0.105 158)"
  board-ink: "oklch(0.975 0.012 158)"
  board-ink-2: "oklch(0.85 0.045 158)"
  card: "oklch(0.985 0.002 158)"
  card-shade: "oklch(0.93 0.004 158)"
  card-ink: "oklch(0.17 0.012 158)"
  amber: "oklch(0.82 0.165 78)"
  amber-ink: "oklch(0.28 0.06 65)"
  ground: "oklch(0.975 0.004 158)"
  ground-2: "oklch(0.948 0.007 158)"
  ink: "oklch(0.2 0.016 158)"
  ink-2: "oklch(0.42 0.018 158)"
  line: "oklch(0.87 0.01 158)"
  nav-bg: "oklch(0.975 0.004 158 / 0.72)"
  board-dark: "oklch(0.37 0.09 158)"
  board-deep-dark: "oklch(0.3 0.075 158)"
  board-edge-dark: "oklch(0.24 0.06 158)"
  board-line-dark: "oklch(0.46 0.08 158)"
  board-text-dark: "oklch(0.78 0.13 156)"
  card-dark: "oklch(0.935 0.004 158)"
  card-shade-dark: "oklch(0.87 0.006 158)"
  ground-dark: "oklch(0.165 0.012 158)"
  ground-2-dark: "oklch(0.205 0.015 158)"
  ink-dark: "oklch(0.955 0.01 158)"
  ink-2-dark: "oklch(0.76 0.018 158)"
  line-dark: "oklch(0.31 0.016 158)"
  nav-bg-dark: "oklch(0.165 0.012 158 / 0.7)"
typography:
  board:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 800
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\""
    fontVariation: "\"wdth\" 62"
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 7.4vw, 5.75rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.02em"
    fontVariation: "\"wdth\" 72"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 5.5vw, 4.25rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.02em"
    fontVariation: "\"wdth\" 72"
  body-lead:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 650
    letterSpacing: "0.02em"
    fontVariation: "\"wdth\" 85"
  board-label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    letterSpacing: "0.02em"
    fontVariation: "\"wdth\" 85"
rounded:
  flap: "0.09em"
  cell: "6px"
  cell-rail: "8px"
  control: "12px"
  tile: "16px"
  stage: "2rem"
  board: "1.75rem"
  board-lg: "2.25rem"
  pill: "999px"
spacing:
  shell-max: "80rem"
  gutter-sm: "16px"
  gutter-md: "24px"
  gutter-lg: "40px"
  section: "80px"
  section-lg: "112px"
  board-pad: "16px"
  board-pad-lg: "32px"
components:
  button-board:
    backgroundColor: "{colors.board}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  button-board-hover:
    backgroundColor: "{colors.board-deep}"
  button-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-ink}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "48px"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-quiet:
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  button-quiet-hover:
    backgroundColor: "{colors.ground-2}"
  input-ground:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  input-board:
    backgroundColor: "{colors.board-deep}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  board:
    backgroundColor: "{colors.board}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.board}"
    padding: "{spacing.board-pad}"
  board-well:
    backgroundColor: "{colors.board-deep}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.tile}"
  flap-cell:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-ink}"
    typography: "{typography.board}"
    rounded: "{rounded.flap}"
    width: "0.72em"
    height: "1em"
  lamp-idle:
    backgroundColor: "{colors.board-edge}"
    rounded: "{rounded.pill}"
    size: "0.7rem"
  lamp-done:
    backgroundColor: "{colors.board-ink}"
    rounded: "{rounded.pill}"
    size: "0.7rem"
  lamp-live:
    backgroundColor: "{colors.amber}"
    rounded: "{rounded.pill}"
    size: "0.7rem"
  size-rail:
    backgroundColor: "{colors.board}"
    rounded: "{rounded.control}"
    padding: "6px"
  stock-cell-in:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-ink}"
    typography: "{typography.board}"
    rounded: "{rounded.cell-rail}"
  stock-cell-low:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.amber-ink}"
    rounded: "{rounded.cell-rail}"
  stock-cell-out:
    backgroundColor: "{colors.board-deep}"
    textColor: "{colors.board-ink-2}"
    rounded: "{rounded.cell-rail}"
  nav:
    backgroundColor: "{colors.nav-bg}"
    textColor: "{colors.ink}"
    height: "64px"
---

# Design System: J&J Sportswear

## Overview

**Creative North Star: "The Liga Scoreboard"**

Every custom order is a game in progress, kept on the hand-flipped scoreboard of a barangay covered court and rebuilt with Apple precision. The instrument surfaces are painted court-green boards; the readouts on them are true off-white split-flap cards carrying near-black condensed numerals; and one shot-clock amber is held back for the things that are happening right now. Everything around the board sits on a quiet neutral ground tinted toward the same green, so the board is always the loudest object in view.

The system is one family, Archivo, worked across its width axis: pulled to its narrowest for board numerals and display, kept at normal width for anything people read. Density follows the scoreboard: a strict cell module, identical cells in a run, ruled bands between readings, lamps for stage. Depth is physical and restrained (a lit, slightly convex board; recessed wells; cards that sit proud of the paint), and the only authored motion is the flip.

**Key Characteristics:**
- One saturated court green owns every instrument surface; the ground is near-neutral green-tinted paper.
- Off-white flip cards with a hinge line are the signature readout, never decoration.
- Amber means "now": live stage, low stock, focus, and a board-side error. Nothing else.
- Archivo only, differentiated by width (62 / 72 / 85 / normal), weight, and tabular figures.
- Light and dark are both first-class, switched by `prefers-color-scheme`.
- Every control has press travel; the flip is the single authored animation.

## Colors

A green-painted instrument on a green-tinted neutral ground, with one warm amber signal. All values are OKLCH and canonical as written in the frontmatter; `-dark` keys are the `prefers-color-scheme: dark` values of the same role.

### Primary
- **Court Green** (`board`): the painted board. Scoreboard panel, the drenched staff section, size rails, garment tiles, the primary "Create account" pill on ground. Dark mode deepens it (`board-dark`).
- **Board Well Green** (`board-deep`): recessed surfaces cut into the board (status window, control strip, input on board), sold-out slots on a rail, and the hover state of green buttons.
- **Board Edge** (`board-edge`): the unlit lamp; the darkest paint.
- **Board Rule** (`board-line`): ruled lines between bands on the board (period strip, box-score rows).
- **Court Green Text** (`board-text`): green used as type or stroke on ground (the "Wear it." accent, the order-band rule and stage dots, inline icons). In dark mode it lifts to a lighter, more chromatic green (`board-text-dark`) to hold contrast on dark ground.
- **Board Chalk** (`board-ink`) and **Board Chalk Muted** (`board-ink-2`): primary and secondary type on green. Unchanged in dark mode.

### Secondary
- **Shot-Clock Amber** (`amber`) with **Amber Ink** (`amber-ink`): live period lamp, low-stock cells, focus rings, text selection, and the error hint on board. Amber Ink is the only text color allowed on amber. Unchanged in dark mode.

### Neutral
- **Flip Card** (`card`) and **Card Shade** (`card-shade`): the off-white of split-flap cards and stock cells; the shade is the lower end of the top flap's gradient. Dark mode dims the card slightly (`card-dark`, `card-shade-dark`) so it never glares.
- **Card Ink** (`card-ink`): numerals on cards and text on card-colored buttons.
- **Court Ground** (`ground`) and **Ground Raised** (`ground-2`): page background and the alternate band (AI studio section, inputs on ground, prompt tiles). Dark: `ground-dark`, `ground-2-dark`.
- **Ink** (`ink`) and **Ink Muted** (`ink-2`): reading text on ground. Dark: `ink-dark`, `ink-2-dark`.
- **Rule** (`line`): hairlines between sections and table rows, the inset 1px edge of inputs and cells on ground. Dark: `line-dark`.
- **Nav Glass** (`nav-bg`): ground at 72% (70% dark) under the translucent nav.

### Named Rules
**The Amber-Is-Now Rule.** Amber is for live and low: the stage in progress, a size about to run out, and the attention states that follow from them (keyboard focus, selection, an error on the board). It never fills a section, a headline, a button at rest, or an illustration chrome. If nothing is live or low, a screen should show no amber at all.

**The One Green Rule.** One saturated green owns the instrument surfaces. Do not introduce a second brand hue; supporting surfaces are the green-tinted neutrals, and new states are expressed as card state (lit, amber, blank), not new colors.

**The Card Ink Rule.** On amber use `amber-ink`; on cards use `card-ink`; on green use `board-ink` / `board-ink-2`. On light ground, an error hint is semibold `ink` rather than amber text, because amber text on light ground is illegible.

## Typography

**Display Font:** Archivo variable, `wdth` axis loaded via next/font (`--font-archivo`), fallback `ui-sans-serif, system-ui, sans-serif`
**Body Font:** Archivo at normal width
**Label Font:** Archivo at `wdth` 85

**Character:** One grotesque stretched across its width axis: extra-condensed black numerals read like painted scoreboard figures; the normal width reads like a well-set receipt.

### Hierarchy
- **Board** (800, `wdth` 62, tabular figures, -0.01em; sized to its container): flip cards, size-run quantities, order-band stage words and box-score row names (uppercase), the wordmark. Sizes in use run from 1.25rem cells to the status word at up to 4.4rem.
- **Display** (800, `wdth` 72, clamp(2.75rem, 7.4vw, 5.75rem), line-height 0.98, -0.02em, word-spacing 0.12em): the hero headline, left-aligned; the closing headline uses clamp(2.75rem, 6.5vw, 5rem).
- **Headline** (same voice, clamp(2.5rem, 5.5vw, 4.25rem)): section headlines.
- **Body Lead** (400, 1.0625rem, relaxed 1.625): section intros, capped at 36 to 52ch.
- **Body** (400, 0.9375rem, relaxed): detail copy, table cells, nav links, capped near 38 to 56ch.
- **Label** (650, `wdth` 85, 0.8125rem, +0.02em): form labels, column heads, prompt-group labels.
- **Board Label** (650, `wdth` 85, 0.75rem, uppercase): the scoreboard's own field names (Home, Status, Pieces, Size run, Paid, Ready by).

### Named Rules
**The Width-Is-Voice Rule.** Hierarchy is carried by the width axis and weight of one family, never by a second typeface. Board numerals are `wdth` 62, display is 72, labels 85, reading text normal width.

**The Tabular Board Rule.** Every number that can change (counts, percentages, dates, timestamps, order numbers) is set in tabular figures so the board never reflows.

## Layout

A single shell: content max 80rem, gutters 16px / 24px / 40px at base / sm / lg. Sections stack as full-width bands separated by a 1px rule or a ground change (`ground-2` band, or a full `board` drench for the staff section), with vertical rhythm of 80px (112px at lg) and a roomier close (96px / 128px). One instrument per viewport: the scoreboard owns the hero, and each later band holds one primary object (ruled order band, prompt-plus-jersey stage, stock standings table, box-score table).

Headline and intro sit side by side on large screens (two columns aligned to the bottom edge) and stack on phones. The scoreboard's three-column readout (Home, Status, Size run) collapses to Status first on mobile. The order band is a horizontal ruled timeline at md and a vertical rule on phones. Tables (stock standings, box score) are real tables that restack into rows on small screens. Fixed-cell padding (`length`) on flip text keeps boards from reflowing when values change.

## Elevation & Depth

Depth is tonal and physical, never ambient decoration. The board is the one lifted object: a faint top highlight inset, a soft radial sheen from above, and a deep green-tinted drop. Wells are pressed into the paint with an inner shadow. Cards and cells sit just proud of the board with a 1–2px shadow. Off the board, surfaces are flat and edged with a 1px inset rule.

### Shadow Vocabulary
- **Board lift** (light: `0 1px 0 oklch(1 0 0 / 0.12) inset, 0 30px 60px -30px oklch(0.25 0.08 158 / 0.55), 0 12px 24px -12px oklch(0.25 0.06 158 / 0.35)`; dark: `0 1px 0 oklch(1 0 0 / 0.08) inset, 0 30px 60px -30px oklch(0 0 0 / 0.7)`): the scoreboard only.
- **Well** (`inset 0 2px 6px oklch(0 0 0 / 0.28), 0 1px 0 oklch(1 0 0 / 0.08)`): status window, control strip, input on board.
- **Card on board** (`0 1px 2px oklch(0 0 0 / 0.2)`): stock cells on a rail.
- **Card button on board** (`0 1px 0 oklch(1 0 0 / 0.6) inset, 0 6px 14px -6px oklch(0 0 0 / 0.45)`): the off-white primary action set on green.
- **Lamp recess / glow**: idle `inset 0 1px 2px oklch(0 0 0 / 0.45)`; live `0 0 0 3px oklch(0.82 0.165 78 / 0.25), 0 2px 6px oklch(0.82 0.165 78 / 0.45)`.
- **Selected tile** (`0 10px 24px -14px oklch(0.2 0.02 158 / 0.6)`): the chosen prompt tile.

### Named Rules
**The Only-The-Board-Lifts Rule.** The large drop shadow belongs to the scoreboard. Other surfaces are flat with a hairline, or recessed as wells.

## Shapes

Soft-cornered rectangles scaled to their size: flip cards round at 0.09em, cells 6–8px, controls and inputs 12px, tiles 16px, the jersey stage 2rem, and the scoreboard 1.75rem (2.25rem at lg); the control strip shares the board's bottom radius. Pills (999px) are for nav links, small actions, period buttons, and lamps. The hinge is the recurring geometric mark: a 1px dark line across the vertical middle of every flip card and the wordmark's two J cards. Ruled lines (1px `line` on ground, `board-line` on green) divide bands and rows; the order band uses a 2px green rule with 16px ringed stage dots.

## Components

### Buttons
Tactile and short-travel: every control carries press travel (`translateY(1px) scale(0.975)` on `:active`, 60ms in, 120ms back on `--ease-out`).
- **Shape:** pills (999px) on ground; 12px rounded rectangles at 48px tall for form-level actions.
- **Board (primary on ground):** Court Green pill, Board Chalk text, semibold 0.9375rem, 8px 16px; hover to Board Well Green.
- **Card (primary on board):** off-white card, Card Ink, semibold 1rem, 48px tall, 20px sides, card-on-board shadow; trailing arrow icon.
- **Ink (secondary on ground):** Ink pill, Ground text, 44px tall; hover drops to 90% opacity.
- **Quiet:** text-only pill with `ground-2` hover (Log in); on board, a text link with arrow and underline on hover.
- **Focus:** global 2px amber outline, 3px offset, 6px radius.

### Inputs / Fields
- **Style:** 48px, 12px radius, 16px sides, an `@` prefix in muted ink. On ground: `ground-2` fill with a 1px inset `line` edge. On board: a well.
- **Focus:** a 2px amber ring replaces the edge (`0 0 0 2px var(--amber)`), 200ms.
- **Error:** the same amber ring persists; the hint turns semibold amber on board, semibold ink on ground. Hint text always present below (0.8125rem).

### Navigation
Sticky translucent bar, 64px, Nav Glass with `blur(20px) saturate(170%)`. Once scrolled past 8px, a 12px fade from Nav Glass to transparent appears under it (200ms). Links are 0.9375rem muted ink pills that darken on hover; Log in is quiet, Create account is the Board pill. Under `prefers-reduced-transparency`, the bar becomes solid ground with no blur. Links collapse below lg; the wordmark's "Sportswear" word hides below sm.

### Scoreboard (signature)
The board surface (Court Green with radial sheen and board lift, 1.75rem / 2.25rem radius, 16–32px padding) holds board labels, flip readouts, and a status well. A ruled period strip carries the period buttons; a full-bleed well along the bottom is the control strip that holds the working form. Board type is Board Chalk; secondary reading text is Board Chalk Muted.

### Split-flap cell (signature)
Each character is a 0.72em × 1em off-white card in two hinged halves; the top half shades from Flip Card to Card Shade, and a 1px `oklch(0.2 0.02 158 / 0.35)` hinge crosses the middle. Flip text pads to a fixed cell count so the board never reflows; unused cells stay in place at 22% opacity so the word reads first. Cells sit 0.06em apart.

### Period lamps
0.7rem round lamps inside pill buttons. **Idle:** Board Edge, recessed. **Done:** Board Chalk with a faint white ring. **Live:** amber with a soft amber halo. 220ms color transition. Tapping a period flips the board to that stage; tapping the live period steps through its remaining statuses.

### Stock cells on a board rail
Size runs are a strip of board (Court Green, 12px radius, 6px padding, 6px gaps) holding identical cells. **In:** lit off-white card with the count in Board voice. **Low:** amber card, Amber Ink. **Out:** a blank well slot (Board Well Green, inner shadow, a dash). The legend uses miniature rails (3px pad, 3px cells). State changes cross-fade at 260ms.

### Stock cells off the board (admin)
Lists, the restock queue, and the size × color grid use loose cells on the page ground. **In:** the lit card with a 1px rule. **Low:** amber. **Out:** a hollow slot with a 1.5px solid ink ring and the count "0", identical in light and dark, so a sold-out size reads as the most urgent state without inverting into a lit card in dark mode. When one color of a size is sold out but others still have stock, the size's cell is amber with a small ink dot in its top-right corner. Product photos sit on a light Photo Backdrop (`oklch(0.955 0.004 158)` light, `oklch(0.9 0.005 158)` dark) in both themes, the way product photography is shot; light garments carry a soft outline.

### Reports and print (admin)
The inventory report is a calm document, not a board: plain board-numeral figures on the ground, sections under display headings on a 1px rule, each with an outlined "CSV" pill at the right. Tables use label-voice headers, tabular figures, and zero shown as a muted dash so real numbers stand out; pieces out carry a minus so a row adds across to Net. On phones, short lists stack like Home's rows and wide tables scroll sideways inside a labeled, focusable region with the first column pinned. **Print** is always a white A4 page with dark ink, whatever the theme: app chrome and controls are hidden, the shop name folds into the "as of" sentence (never a kicker above the title), rows compact to 10pt, table headers repeat, headings stay with their tables, and a quiet 8pt footer reads "J&J Sportswear · Inventory report" and "Page N of M". Amber stays limited to Low pills.

### Sales report and charts (admin)
The sales report is the inventory report's calm document with one chart. **Figures** stay board numerals on the ground, each with its change against the period before in plain ink ("+12% vs before"): no green-up or red-down judgement, and the comparison spelled out once ("Changes compare with the 30 days before"). **Charts** are single-series columns in court green (dark mode uses its own validated step, oklch(0.64 0.125 156), never the light green inverted). They have no legend because the heading names the series, columns at most 24px wide with 4px rounded tops and 2px gaps, solid hairline gridlines with clean ₱ ticks, and x labels thinned to fit and anchored on the latest bar. Each column shows a dark ink tooltip with the value first. A "Show as a table" twin always prints. Ranked tables bold the column they're ranked by. Each report prints with its own footer through named print pages.

### Point of sale and receipts (admin)
The counter keeps the admin's calm ground with one piece of board: the sale's **total** sits on a small Court Green strip in split-flap cards that flip as the sale changes, the one place the counter shows the world's motion. Size pickers are rows of off-board stock cells counting what's left after the current sale (lit, amber low, hollow ink-ringed sold out, which can't be tapped). The sale panel is hairline-edged: one-row lines (name and size · color · price, a −/qty/+ stepper you can also type into, line total, a trash icon), Cash | GCash as an ink segmented control, change in board numerals, and one full-width green **Charge ₱X** that always names its amount and, when it can't run, says why underneath. Problems sit under their line as an amber-tinted strip with one fix button. On phones the sale is a second step behind a green floating "N pieces · ₱X  Review sale" bar above the dock. A **receipt** is a slip of paper, light in both themes: Card ground, hairline, dashed tear rules, the shop name in the display voice, the total in board numerals, and an ink-ringed **VOIDED** stamp when voided. In print it's full black ink on an 80 mm roll (72 mm wide) or a centred half-page on A4.

### Motion
**The One Flip Rule.** The flip is the single authored motion: the top flap falls (170ms, `--ease-in` `cubic-bezier(0.55, 0, 1, 0.45)`, rotateX 0 to -90deg, dimming to 82%), then the bottom flap rises (230ms, `--ease-out` `cubic-bezier(0.22, 1, 0.36, 1)`), staggered 28ms per cell. It is interruptible: a new value always starts from the card on screen. The board auto-advances (2.6s) only while at least 35% visible and the tab is visible, and stops for good after a manual tap. Everything else is state transition only (press travel, lamp, cell, nav fade, jersey color cross-fade at 480ms).

**Reduced motion.** Under `prefers-reduced-motion: reduce` the falling flap is removed and the rising card shows at rest (cards swap in place), auto-advance is off, press travel is disabled, smooth scrolling is off, and jersey transitions drop to 1ms.

## Do's and Don'ts

### Do:
- **Do** put live data on the board in flip cells with tabular figures and a fixed cell count.
- **Do** express inventory state as card state: lit, amber for low, a blank well slot for sold out on the board, and a hollow ink-ringed slot for sold out off the board.
- **Do** keep amber for live and low (plus focus, selection, and board-side error) only.
- **Do** separate the voices with Archivo's width axis: 62 board, 72 display, 85 label, normal for reading.
- **Do** give every control press travel and the global amber focus ring.
- **Do** ship light and dark together; check `board-text` and card values in both.
- **Do** honor reduced motion by swapping cards in place, and reduced transparency with a solid nav.

### Don't:
- **Don't** use amber as a brand fill, a button color at rest, or decoration.
- **Don't** add a second typeface or a second brand hue.
- **Don't** animate anything else with an authored entrance, scroll reveal, or loop; the flip is the motion.
- **Don't** put the board lift shadow on anything but the scoreboard.
- **Don't** set amber text on light ground; use semibold ink.
- **Don't** let a readout reflow when its value changes.
