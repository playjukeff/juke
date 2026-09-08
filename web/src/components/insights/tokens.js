/* The Your Insights page's own two data-series colours, and the tone map
   every number on it is coloured by.

   Almost nothing here is new. The design handoff this page is built from
   (`design_handoff_your_insights`) was authored against this repository's
   own palette and most of its hexes ARE repo tokens already: its panel is
   `slate` (#1E2733), its surface `slate-panel` (#232D3A), its ink `ink`
   (#EDF1F5), its dim ink `ink-muted` (#8A9BAA), its chip ink `CELL_INK`
   (#16202E), and its five position accents are POS_CHALK exactly. Those are
   used through their existing names rather than re-typed here — a second
   value one step off an existing one is the drift draftRoomPositions.js was
   rewritten to end, and CLAUDE.md's Flow v3 section already records this
   exact decision for the previous handoff.

   Three deliberate departures from the handoff, each for a rule this
   project already holds:

   1. The handoff's mint #ABDFC7 is POS_CHALK.RB, and it uses it for the
      active rail, the "You" dot, positives and the CTA — on the one screen
      that also draws an RB chip. A hue is spoken for when a reader could
      confuse two meanings in the same glance, and a mint You-dot sitting on
      a row labelled with a mint RB chip is that glance. Every one of those
      jobs is teal here instead, which is what the Draft Room's own seat
      bracket became in the board-palette pass ("cyan hairlines"), is the
      app's CTA and focus colour, and is the one hue documented as never
      being a position.

   2. The handoff's amber card #FBD5A8 is POS_CHALK.TE, and the sidebar's
      light card is about whichever position is costing you the most — a
      card in TE's own colour under a headline about running backs reads as
      a mistake. `flow.gold` is the repo's warm attention tone and is not a
      position chalk.

   3. The steel/oxblood pair below is NOT new: NetAdpValueCard.jsx has drawn
      exactly these two hexes, for exactly these two meanings, since it was
      written — which is the clearest evidence there is that the handoff was
      drawn against this app. It moved here so there is one copy, and that
      card imports it. */

/* The room, and what a decision cost.

   STEEL is every figure that belongs to the other seats rather than to you:
   the field dot, the baseline line, a bar at or under the room's median.
   OXBLOOD is cost — a value-left bar, a regret's swing. Deliberately not
   `flow.rose`, which is a state colour measured against the homepage's
   near-black ground, and deliberately not POS_SOLID.QB (rose-700), which is
   a position. NetAdpValueCard's own comment makes the same argument the
   other way round: "#BE6153 is a muted oxblood, not #F87171." */
export const STEEL = '#8AA6BE'
export const OXBLOOD = '#BE6153'

/* The lighter oxblood a NUMERAL takes, where the bar above takes the solid
   one. #BE6153 measures 3.4:1 on slate-panel — fine for a mark, under the
   bar for text — and this is the same hue at a value that clears it. */
export const OXBLOOD_INK = '#E39284'

// Teal, spelled out where a style prop needs a value rather than a class.
export const YOU = '#00E5FF'

/* Every tone the engine emits, and what it means on screen. The engine
   decides which of these a row is (see insightsField()/insightsFailures()
   in app.js); this only says what the four look like. */
export const TONE_INK = {
  good: '#66F0FF', // teal-300 — clears 4.5:1 on slate-panel where #00E5FF is a mark
  bad: OXBLOOD_INK,
  warn: '#E7AC4B', // flow.amber
  neutral: '#A0AEBC', // ink-soft
}

export const TONE_MARK = {
  good: YOU,
  bad: OXBLOOD,
  warn: '#E7AC4B',
  neutral: STEEL,
}

/* The KPI cards' accent bar. Four different hues so the four tiles read as
   four measurements rather than one repeated, which is the whole of what
   that 20x3px rule is doing. */
export const KPI_ACCENT = {
  bad: OXBLOOD,
  blue: '#AACAF2', // POS_CHALK.WR
  warn: '#F7D9A8', // flow.gold
  good: YOU,
}

/* One number, so every entrance on the page is on one clock. The design's
   own stagger is in milliseconds and inline, which is what CSS animation
   delays want; these are the two it is built from. */
export const STAGGER = 55
export const LEAD = 140

export function delay(ms) {
  return { animationDelay: ms + 'ms' }
}
