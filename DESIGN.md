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
**The Amber-Is-Now Rule.** Amber is for live and low: the stage in progress, a size about to run out, and the attention states that follow from them (keyboard focus, selection, an error on the board). On the customer side, money the customer owes right now counts as live: the pay notice's edge and lamp, and the small pay pill on an Orders row, which clear as soon as a payment is waiting for the shop. A shop reply waiting to be read counts too: the chat bubble's unread count, which clears when the chat is opened. It never fills a section, a headline, a button at rest, or an illustration chrome. If nothing is live, low, owed, or unread, a screen should show no amber at all.

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

### Custom orders (admin)
Every custom order is a game in progress, so its page carries a small board. A Court Green strip holds a period lamp for each stage (Placed, Accepted, In production, Ready, Picked up): passed stages lit, the current one live amber, the rest idle. On phones the strip names the current stage with its "3/5" in board numerals. Everything else is the calm admin document. Production is a column of tick rows (who and when on each); only the next step can be tapped ("Tap when done"). Status pills keep amber for the one state waiting on the shop (New); active orders are outlined ink, Ready is solid ink, and closed orders are muted. Closing actions (decline, cancel, reprint, back to production) always ask for a reason in a dialog, and the reason lands in the history. Finished photos sit on the photo backdrop, and removing one takes two taps. Outcomes of status moves show in one line at the top of the page.

### Payments (admin)
Money waiting on the shop is the only amber here: a customer's GCash payment "To review" wears the amber pill, and the To review tab carries a live lamp. Checked payments recede. Verified is an outlined ink pill, and rejected is muted (never struck through: strikethrough belongs to voided sales). Checking a payment is a calm document: the reference and the sums in a short two-column list, then Verify (green) or Reject (outlined, always with a reason the customer reads). Anything that stops a verify is said in an amber alert panel above the buttons, and only Reject remains. A verified payment becomes a **payment slip**, the same paper as a sale receipt: Card ground, dashed tear rules, the amount in board numerals, and order total / paid to date / balance (or "Fully paid") at the time it was verified. On the order page, money lives in one "Price and payments" section: the totals, every payment as a linked row with its pill, and a green "Record a payment" dialog. In that dialog, chips fill in the rest of the down payment or the balance. Exceptions to the 50% rule are owner-only text links that ask for a reason.

### Chat (admin, owner only)
Chat is a calm document, never a board. The customer's bubbles sit on the left in ground-2 with a hairline; the shop's sit on the right in ink. A tightened corner on the speaker's side is the only tail. Days are separated in the label voice, and an "About CO-…" link sits above a message only when the order it's about changes. Amber marks only what's waiting on the owner: unread counts, the dot on More, and the reply box's focus ring. Board green appears only on unread avatars and the Send button. The reply box is a surface card that sticks above the dock at the same spot where it rests, so it never jumps. The inbox and the open conversation sit side by side on wide screens and are separate screens on phones, where the conversation header stays pinned under the top bar.

### Point of sale and receipts (admin)
The counter keeps the admin's calm ground with one piece of board: the sale's **total** sits on a small Court Green strip in split-flap cards that flip as the sale changes, the one place the counter shows the world's motion. Size pickers are rows of off-board stock cells counting what's left after the current sale (lit, amber low, hollow ink-ringed sold out, which can't be tapped). The sale panel is hairline-edged: one-row lines (name and size · color · price, a −/qty/+ stepper you can also type into, line total, a trash icon), Cash | GCash as an ink segmented control, change in board numerals, and one full-width green **Charge ₱X** that always names its amount and, when it can't run, says why underneath. Problems sit under their line as an amber-tinted strip with one fix button. On phones the sale is a second step behind a green floating "N pieces · ₱X  Review sale" bar above the dock. A **receipt** is a slip of paper, light in both themes: Card ground, hairline, dashed tear rules, the shop name in the display voice, the total in board numerals, and an ink-ringed **VOIDED** stamp when voided. In print it's full black ink on an 80 mm roll (72 mm wide) or a centred half-page on A4.

### Customer app shell
The customer gets a seat at the same counter: the admin's ground, top bar, and dock, so both sides read as one system, and no storefront furniture (no mega-menu, promo banner, or cart icon). The **top bar** is the landing's translucent Navigation with the wordmark (to Shop), a theme button, and on desktop the tabs as 36px pills (0.9375rem semibold muted ink, `ground-2` hover; the current one a Court Green pill in Board Chalk). On phones and tablets the tabs (Shop, Orders, Design, Account) live in the admin's dock instead, with the same green pill for the current one. On desktop, Account moves into an avatar button that opens the admin's account popover (name, @username, Your account, home, Log out). Its initials disc is neutral (`ground-2` with a hairline, label voice) so the current tab is the only green in the bar, and it takes `ground-2` when Account is current. Pages share one column (80rem max, 16/24/40px sides) and open with a display-voice title (clamp 2.25–3.5rem) and a 48ch muted lead. Shop is the catalog described under Shop catalog and product page (customer). A tab that isn't built yet says so in a **not-yet panel**: a `ground-2` surface with a hairline and 1.25rem radius, a semibold title, plain copy about what it will hold, and a muted label-voice line with a small dot ("Opens in the next update"). There are no controls that go nowhere. Counts in a panel are ink board numerals and stay truthful. Orders shows the custom-order strip idle (five unlit lamps, Placed to Picked up). On phones each cell centres its lamp over a two-line label box so a wrapped stage keeps the run even. Account is a ruled details list (label-voice terms, "Not added" in muted ink) ending in an outlined Log out pill. Amber appears in only three places on the customer side: Shop's low-stock dot, money the customer owes right now (the pay notice on an order page and the amber pay pill on its Orders row), and the chat bubble's unread count, since a shop reply waiting on the customer counts as now. Everywhere else it stays off, because nothing else here is live or low.

### Shop catalog and product page (customer)
A store window where the garment leads and chrome recedes; no promo banners, discount chips, ratings, or badges. Garments sit on **Photo Backdrop tiles** (1.125rem radius, 4:5 in the grid, square in the rail), light in both themes, so any type set on the backdrop uses Card Ink, never the theme's ink. Sample art is padded inside the tile (12%) and scales to 1.04 on hover (420ms, hover devices only); sold-out art drops to 55% opacity. **Featured band:** one product on a 2rem backdrop panel, art large on one side (top on phones), name in the display voice (clamp 2.25–4.25rem) in Card Ink, a 38ch line at 70% Card Ink, a 48px Card Ink "View product" pill in Card text with an arrow, and the price beside it. **Sport and type rail:** "Shop by sport and type", square backdrop tiles with a label and a muted count under each; it scrolls sideways with snap on phones and becomes an even row at lg; the current category's tile takes a 2px Card Ink inset ring. **Filters:** a 48px search pill (`ground-2`, hairline, amber focus ring), then 40px controls: hairline chips (semibold 0.9375rem) whose pressed state is a Court Green fill in Board Chalk, native selects dressed as hairline pills with a chevron (Size, Sort), and an In stock pill holding a small switch (`line` track, green when on, 240ms thumb). Chips scroll sideways on phones without a visible bar. **Cards** are photo-first: the tile, then name (semibold), sport · type in muted ink, and a plain tabular ink price or a muted "Sold out"; stock lives on the product page. The grid runs 2/3/4 columns; no results is a `ground-2` hairline panel. **Product page:** the art on a square backdrop tile, sticky beside the details on desktop (top 6rem), on top on phones; name in the display voice, category muted, price 1.25rem semibold. **Swatches** are 40px discs with a faint inner edge; the chosen one wears an ink ring outside a 3px ground gap, and a color sold out in every size carries a diagonal rule. The **size grid** (auto-fill, 5rem min, 0.875rem radius, hairline) shows each size over its pieces left in the chosen color; the selected size is Court Green; only a low count carries a small amber dot. A **sold-out size** recedes: a dashed hairline, a faint diagonal rule, muted regular-weight text, never a ring stronger than the sizes you can buy, and it can't be tapped. A live stock line under the grid reads "Only N left" with the amber dot when low. Actions stack full width at 56px: a green **Buy at the shop** pill with a store icon, and an outlined (hairline) **Make a custom version** pill in muted ink, marked as opening later. Below sit "About this item" and a ruled label/value list. **Buy sheet:** the auth dialog's sheet with a display-voice title, a `ground-2` summary row (thumbnail tile, name, size · color, price and pieces left), plain label/value rows on hairlines (Where, Hours, Phone, Pay with; unconfirmed values in muted ink), and a full-width Ink "Got it" button. **Signature:** picking a swatch recolors the sample art with the world's jersey cross-fade (fill and stroke, 480ms `--ease-out`) and the size counts update to that color; under reduced motion it drops to 1ms. Sample data is marked in a muted note under the grid and on the product page.

### Custom-order requests (customer)
Asking for a custom run is a calm form with one piece of board. The **request form** (46rem column) is three steps (Details, Garments, Review) under a small Court Green strip with a lamp per step: done steps lit (and tappable to go back), the current one live amber, the rest idle. Each step opens with a display-voice title (clamp 1.875–2.5rem) and a muted line. **Fields** are the auth inputs: `ground-2`, the amber focus ring, and a solid ink ring in error. Error messages are semibold ink and clear as the field changes; never red. **Garment cards** are hairline cards (1.25rem radius) and a card in error wears a 2px ink ring. Each holds a garment select (with "Other…" opening a text field), a color input with a live swatch dot, a **fit switch** (Adult / Women's / Kids / One size) as a `ground-2` hairline pill track whose pressed segment is solid ink, and the **size run**: a grid of quantity cells (`ground-2`, hairline, 0.875rem radius, size in a small semibold muted label over a tabular count). A size with pieces gets a 1.5px ink edge, never a new color, and the amber ring marks only focus. **Reference pictures** (up to 3) sit on photo backdrop tiles with a round ink remove button. **Review** is ruled label/value rows grouped under semibold headings with underlined Edit links, garments written as "S ×2 · M ×5" with their piece count, then a "What happens next" `ground-2` hairline note. Buttons: ink **Next** with an arrow, a quiet text **Back**, and on Review a 56px green **Send request** (Save changes when editing). **Orders list:** ruled rows of number (tabular, muted), status pill, team or description (semibold), pieces · garments, sent and needed-by dates, and a chevron that nudges on hover. Status pills follow the admin's: moving orders outlined ink, Ready solid ink, closed muted. The one amber on a row is a solid amber **pay pill** (28px, tabular, `amber-ink` text: "Pay ₱X down payment" or "₱X balance due") beside the status pill, and only on an order that owes a down payment or a balance; nothing else here waits on the customer. The list splits into two display-voice groups (1.5rem), **In progress** and **Past orders**, each a ruled list. **Order page:** the number in the display voice, the five-lamp stage strip, and while pending an outlined **Edit request** and a quiet **Cancel request** (a dialog with an optional reason); then a ruled "Your request" list (reference pictures as small backdrop tiles) and a Garments list of swatch dot, name · color, size run, and pieces.

### Order tracking and payments (customer)
The **order page** widens to a 72rem column: a back link, the order number in the display voice (clamp 2–3rem) with its status, the five-lamp stage strip, then on desktop a main column beside a 22rem aside (stacked on phones), each section opening with a 1.75rem display-voice title over a hairline. The **pay notice** is the customer side's Amber-Is-Now exception, and it is tied only to money owed: a `ground-2` panel (1rem radius) with a 1.5px amber edge (never an amber fill), the live amber lamp, a semibold "Down payment needed." or "Balance due." lead, and the green **Pay** button. It shows only for the down payment once the shop has accepted and priced the order, and for the balance when the order is Ready or being picked up. While a payment is being checked it disappears and a quiet ink-2 line takes its place ("Your ₱X GCash payment is being checked by the shop."). **Production** is a list of tick rows on hairlines: a done step is a filled ink disc with a check, its label semibold and its timestamp on the right; the next step is a 2px ink ring with "In progress"; the rest are hairline rings in muted ink. Before the down payment, one muted line says production starts once it's in. A reprint or a return to production is a `ground-2` hairline panel under the ticks with a rotate icon, a semibold title ("Reprinted after inspection" or "Back to production"), its time, and the shop's reason. **Finished photos** are photo backdrop tiles, square, 2 columns on phones and 3 from small screens, each opening full size. **Price and payments** (aside) is a ruled list: Total in board numerals (1.75rem), Down payment (50%) with "· paid" once covered, Paid, Being checked when there is any, then a semibold "Still to pay" or "Fully paid" with an ink check (and Refunded if any). Payment rows show the amount, "GCash · ref …1234" or "Cash at the shop" with the date, and a pill: **Verified** is outlined ink, the same as the admin's; **Being checked** is a dashed ink-2 outline, not yet settled; **Not accepted** is muted `ground-2` with a hairline and the shop's reason in quotes underneath. Under the list, an outlined pay button and a muted line that cash is paid at the counter. **Pickup** gives the order number to bring, the address with a map pin, and hours ("to follow" in muted ink until set); once picked up it is a muted thank-you. **History** is a ruled list, newest first, each entry titled by its step note (reprints titled "Reprinted after inspection") with its time on the right. The **pay modal** is the auth dialog's sheet (a bottom sheet on phones) titled "Pay with GCash" over the order number: a `ground-2` hairline box with the shop's GCash name, number (tabular, with a Copy pill), and QR, where missing details read "to follow" in muted ink; **amount chips** (shop chips: "Down payment" or "Rest of the down payment", and "Full amount" or "Everything still due") above a ₱ field that groups thousands; the 13-digit **reference** grouped 4-3-6 with a live "n/13" counter; a required **screenshot** button (56px, 1.5px hairline edge, a 2px ink ring in error) that becomes a thumbnail with Change; and a 56px green **Send payment · ₱X**. Errors follow the request form: semibold ink text and solid ink rings, never red, and focus moves to the first field with a problem. Sent, the sheet becomes "Payment sent" with a plain note that the shop will verify it and an ink Done button. The modal can't close mid-upload or mid-send.

### AI design studio (customer)
Design is a builder beside a stage: picks in a 25rem column on the left, the stage and gallery on the right (on phones the picks lead until there's a design, then the stage does). The page header carries the one piece of board, a **tries-left pill**: a small Court Green board pill with three lamps, lit for each design still available today, and a "n of 3 left today" line in Board Chalk; refinements count. **Picks** are labelled groups of the shop's chips (36px, pressed Court Green in Board Chalk) for Garment, Sport, and Style. **Colors** are the shop's swatches with the chosen ones numbered in pick order (a small `ground` disc with a tabular ink rank), up to three, read back in a muted line as Main · Second · Accent; a fourth pick is refused in a plain message, never silently. Team name, Name and Number (tabular, digits only), an optional logo (a 48px button with a 1.5px hairline edge that becomes a small backdrop tile with an outlined Remove), and an "Anything else?" field use the auth inputs. A 56px green **Generate design** pill with a sparkle sits under them, greyed to `ground-2` as "No designs left today" when the lamps are out. The **stage** is a Photo Backdrop tile at 3:2. Before the first design it shows the sample garment front and back recolored from the picks (main color for the body, second for the trim) with the jersey cross-fade (480ms), drawn flat, with no shadow and no sheen, so it matches the previews it stands in for, over a Card Ink line ("Sample art in your colors."). **Preview honesty:** until the shop's AI key is set, a `ground-2` hairline notice under the title says "Preview mode." and that previews still count, every preview image carries "PREVIEW · SAMPLE ART" in its own top margin, and Refine is replaced by a muted line saying it comes when the AI is on. Preview lettering is drawn as Archivo outlines, not live text: extra-condensed 800 for team, name, and number, semi-condensed 650 for the tracked labels (PREVIEW, FRONT, BACK). A team name too long for one line wraps to two equal lines split near the middle, both at one size. Under the stage sit the design's name and a muted summary, then a 48px green **Use this design** pill with an arrow (into a new request) and, with the AI on, a Refine field with an outlined ink button. **Your designs** is a display-voice gallery of 3:2 backdrop thumbnails (2 columns, 3 from small screens); the one on the stage wears a 2px ink outline offset 2px outside the tile, so the picture can't cover it, and others take a hairline outline on hover. In the request form, a design arrives as a **Design from the studio** card at the top of the Details step: a `ground-2` hairline card with the thumbnail, a semibold summary, "The shop sees this design with your request.", and an outlined Remove. A heading that takes focus from code (to announce a new step or result) never draws the amber keyboard ring; the ring stays for controls.

### Chat widget (customer)
Chat isn't a tab; it's a **bubble** that floats over every customer page, a small piece of the board: a 3.5rem Court Green disc with a chat icon in Board Chalk, bottom-right, just above the tab bar on phones, beside the floating dock on tablets, and in the corner on desktop. Shop replies waiting on the customer show as an **amber unread count** (tabular, `amber-ink`, a 2px ground ring, "9+" past nine). The **panel** is calm ground with the popover lift (a hairline plus a soft green-tinted shadow, 1.5rem radius, 24rem wide) and rises out of the bubble the way the admin's popovers do (opacity 180ms, a 10px rise from 0.97 scale over 280ms `--ease-out`, anchored bottom-right; opacity only under reduced motion), while the bubble turns into an X. On phones it is a full-screen modal sheet instead: the page behind goes inert and stops scrolling, the bubble steps aside, and an X sits in the header. The **header** is a green board strip with the wordmark's two hinged J cards in small, "J&J Sportswear" semibold, and "A person from the shop answers" in Board Chalk at 75%. It opens like a chatbot but never pretends to be one: a **greeting** from the shop that names the store hours, then **quick replies** as shop chips (Ask about my order, Sizes and prices, Custom order help) that send real messages. Asking about an order lists every open order as a chip (number in tabular semibold, status in muted ink), ready first, then "Another order" and a quiet "Never mind". **Messages** mirror the admin inbox: yours in ink on the right, the shop's on `ground-2` with a hairline on the left, 1.125rem radius with a tightened corner on the speaker's side as the only tail; photos are hairline-edged tiles. Days are split in the label voice, and an "About CO-…" link sits above a message when its order changes. Times sit at the end of each run, "· Seen" follows your last message once the shop has read it, and while it's unread a muted note says when the shop replies. The **composer** is a rounded `ground-2` hairline field holding a photo button, the text (Enter sends with a keyboard; it grows to about five lines), and a 40px green **Send** circle that greys to `ground-2` when empty; the amber ring marks its focus. A message about an order carries a removable "About CO-…" chip above the field, and a photo to send shows as a thumbnail with a round ink remove button. Pages open it from two entry points: an outlined **Ask about this order** pill on the order page (which adds the chip) and a quiet **Ask the shop about this** text button on the product page (which starts the message). Green appears only on the header, the bubble, and Send; amber only on the unread count and the focus ring.

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
