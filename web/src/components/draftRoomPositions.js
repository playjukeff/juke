// Six positions, six hues. The set below is the board palette handoff's
// ("Draft board palette — option 2h, Seat bracket"), pulled up out of the
// board and made the site's again rather than left to live in one grid.
//
// The previous set was orange/emerald/blue/fuchsia/yellow/indigo, and its
// own comment argued at length that teal, purple and rose were unavailable
// as position hues — teal and purple being the brand accent pair, rose
// already meaning danger. The handoff overrules that on two of the three,
// and it is worth saying why the objection was weaker than it read.
//
// Teal is still out, and always will be: it is the CTA, the focus ring,
// the live pick, and — as of this pass — the seat bracket on this very
// board. That one really does have five jobs already.
//
// Rose and violet do not. Neither is a *surface* or a *control* colour
// anywhere in the room: rose appears as text on an urgent countdown and on
// a Discard hover, violet as an injury-status chip — both small, both
// captioned, neither ever a position. A hue is only spoken for when a
// reader could confuse the two meanings in the same glance, and a pink
// chalk cell reading QB is nowhere near a red digit counting down in the
// header. What the old set bought by avoiding them was a K/QB pair
// (yellow/orange) one step apart on the wheel and a DST that was "deep and
// moody" rather than distinct.
//
//   QB  rose    — the marquee position, and the one hue nothing else on
//                 the board carries at any size
//   RB  emerald — unchanged; every component already agreed on it
//   WR  blue    — a true blue, nowhere near teal
//   TE  orange  — was fuchsia; orange frees rose for QB and reads apart
//                 from it at chalk strength far better than fuchsia did
//   K   violet  — was yellow, which sat beside orange on the wheel
//   DST slate   — the one position that is genuinely a non-colour, and it
//                 is a real light-grey block on the board rather than an
//                 absence of one
//
// This is the one hue reference for the whole site, not just the draft
// room — POS_BADGE is imported by ShowYourWorking.jsx's homepage scoring
// demo as well as the queue, the profile drawer, the roster dock and the
// log dock; POS_CHALK and POS_RAIL are the board's own cells and every
// position mark on the Draft Lobby's analytics cards; POS_SOLID is the
// filled block that carries white text. All five maps point at the same
// six hue *families* below, so a position can no longer read as a
// different colour depending which panel — or which page — you are
// looking at.
//
// Which of the three a call site wants is decided by one question, and it
// is not which screen it is on: **does type sit on the colour?** A chip
// has its own letters inside it and takes POS_BADGE. A filled block with a
// name written across it takes POS_SOLID. A bar, a column, a dot, a tier
// square, a run strip — anything whose labels sit outside it — takes
// POS_CHALK, because the step that exists to survive white text is the
// darkest one and it disappears against a dark panel. That last case is
// most of them, and it was wrong for all six for a long time; see the
// measurement on POS_SOLID below.
//
// Family, not hex. A chip is a -300 tint on a dark panel, a solid is a
// -700 step under white text, a rail is the handoff's own saturated value
// and a chalk fill is its pastel. Those are four different jobs on four
// different grounds and they were never going to be one number; what has
// to hold is that all four are recognisably the same colour, which is what
// "same Tailwind family" buys and what the old orange-cell/red-chip drift
// cost.
//
// Written out as full literal class strings in the two class maps below
// rather than built from a name -> hue map with template interpolation:
// Tailwind's JIT scanner finds classes by grepping source files for the
// literal string, and `` `bg-${hue}-500/15` `` never appears as one — it
// would compile to nothing, silently, and every chip would render with no
// colour at all. The table above is documentation only, not code these
// read from.

// Small translucent chip — the queue's position tag, the profile drawer's
// header badge, a roster-dock slot, a log-dock row. Same 15%-bg/300-text
// formula this always used; only which hue each position points at moved.
// Measured against slate-panel (#232D3A), the darkest panel one of these
// lands on: 7.36 (rose) to 9.38 (slate), all well clear of 4.5.
export const POS_BADGE = {
  QB: 'bg-rose-500/15 text-rose-300',
  RB: 'bg-emerald-500/15 text-emerald-300',
  WR: 'bg-blue-500/15 text-blue-300',
  TE: 'bg-orange-500/15 text-orange-300',
  K: 'bg-violet-500/15 text-violet-300',
  DST: 'bg-slate-500/15 text-slate-300',
}

export const POS_LIST = ['QB', 'RB', 'WR', 'TE']

// The plain-English name for a position key — used anywhere a sentence
// names a position rather than labelling a chip (TendenciesStrip.jsx's
// weakest-spot sentence, AllDraftsInsights.jsx's report). Promoted here
// from a local copy in TendenciesStrip.jsx once a second file needed the
// same six names — this file is already documented as the one position
// reference for the whole site, and a name is exactly the kind of thing
// that drifts silently if it is ever written down twice.
//
// THERE ARE NOW TWO COPIES AND THEY MUST NOT DRIFT. app.js carries
// POS_NAMES_LONG beside posLabel(), because the Your Insights page's habit
// headlines are written in the engine, beside the arithmetic that produced
// them, and a sentence that names a position needs the noun rather than the
// chip. That copy is deliberate and it is the same shape as normalise()
// living in both build_players.py and worker/names.js: one side is a classic
// script and the other an ES module, app.js loads first, and a module-scope
// read of window.JukeEngine is undefined during the prerender
// (entry-server.jsx runs in Node, where there is no window). Six English
// nouns are the cheapest possible thing to keep in step; a build-time bridge
// for them would not be. Change one, change the other.
export const POS_NAMES = { QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end', DST: 'Defense', K: 'Kicker' }

/* The board cell, and the two maps that draw it. These are the palette
   handoff's own values, unrounded — this project's rule once a hex has
   been explicitly chosen is to keep it rather than snap it to the nearest
   thing already in the file.

   POS_CHALK is a matte pastel fill and POS_RAIL is the 5px saturated rule
   down the cell's left edge. The pair is what replaced two earlier answers,
   both of which are worth keeping on the record because this cell has now
   been redrawn four times and three of those looked settled at the time:

     1. Full-strength position blocks. Rejected as "a saturated quilt" —
        painting six hues across 140 full cells emphasises nothing, because
        everything already is.
     2. A neutral #151923 cell with a 3px rail and no fill at all. Rejected
        twice before it shipped ("at working zoom the rails are nearly
        invisible"), shipped anyway once the ADP-delta tint it used to
        compete with was gone, and it is what this replaces.
     3. That same cell with a 14%-alpha wash of the rail colour behind it.
        The step between 2 and 3, and the one that made the position
        legible at a glance without making it shout.

   Chalk-on-dark is the fourth, and it is a different move from all three:
   the cell stops being a dark surface with a hint of hue in it and becomes
   a light card, so position is carried by the *whole* cell at full
   saturation of value while the ink on it goes dark. The board reads as a
   sheet of coloured cards on a dark ground rather than as a dark grid with
   coloured lighting. That is also what makes the rail legible for the
   first time: a saturated rule against a pastel of its own hue is a real
   edge, where the same rule against near-black was the thing two earlier
   looks called invisible.

   Measured against these fills, which is the check that matters because
   the ink went dark with them: CELL_INK clears 9.47:1 on the worst fill
   (K's #CDBDEF) and 11.86 on the best, CELL_SUB clears 7.19 to 9.01. Both
   are well past AA at 10-13px, and the sub value is deliberately not any
   lighter — it was raised twice in design review and the handoff says so
   explicitly. */
export const POS_CHALK = {
  QB: '#F7BCCB',
  RB: '#ABDFC7',
  WR: '#AACAF2',
  TE: '#FBD5A8',
  K: '#CDBDEF',
  DST: '#C2CCD7',
}

export const POS_RAIL = {
  QB: '#F0326B',
  RB: '#00A87A',
  WR: '#1668E8',
  TE: '#E5760A',
  K: '#6B35E8',
  DST: '#4E6377',
}

/* The two ink values that live *on* a chalk fill, and nowhere else in the
   app — every other surface in the draft room is dark and takes `ink.*`
   from tailwind.config.js. They are here rather than as Tailwind tokens
   for the same reason POS_CHALK is: a colour that is only ever correct on
   one specific set of six backgrounds should not be reachable as a general
   `text-cell-ink` utility somebody could put on a dark panel, where it is
   1.4:1 and invisible. Kept as hexes, passed as a style prop. */
export const CELL_INK = '#16202E'
export const CELL_SUB = '#2B3540'

/* The *solids*, for the one job the tints above and the pastels below
   cannot do: a filled block with white text written across it. Each
   carries its own ground on purpose — white on a position solid is the
   contract these were darkened to meet, so whatever sits behind them is
   never part of the sum.

   That is now the whole of what they are for, and the list of callers is
   shorter than it was. This used to fill every bar on the Draft Lobby's
   analytics cards, the Decide screen's tier squares and its live run
   strip, and none of those has a character written on it — every label
   sits outside the mark. So they were paying the darkening and getting
   nothing back for it: measured against the analytics card's own track,
   the six ran **1.46:1 (DST) to 2.93:1 (TE)**, all six under the 3:1 a
   non-text mark answers to, with a DST bar that was effectively not drawn
   at all. The same six as POS_CHALK clear 8.74 at worst. Every one of
   those marks reads POS_CHALK now.

   Five of the six failed that bar under the *previous* palette too
   (1.92 to 3.08), so this is a long-standing miss the palette pass
   surfaced rather than caused — it only became findable once the board
   started drawing the same six positions in a way that visibly worked.

   Kept rather than deleted, unlike POS_CELL_BLOCK above, because it still
   has a real job and a live caller: anywhere a position is a filled block
   under a name, which is what the roster slots and the profile header are.
   The rule to apply before reaching for it is the one in this file's
   header — does type sit on the colour?

   All six are their family's -700 step, which is uniform for the reason
   the previous set's was: the shade is picked by the hardest case rather
   than per hue, and five of them stopping earlier just because they could
   would read as arbitrary. Measured against white: rose 6.29, emerald
   5.48, blue 6.70, orange 5.18, violet 7.10, slate 10.35.

   These are a *step* of the same families POS_RAIL names, not the same
   hexes — a rail is a 1-5px rule against a pastel of its own hue and a
   solid is a filled bar under white text, and one value cannot be right
   for both grounds. Same family is the invariant; same number never was. */
export const POS_SOLID = {
  QB: '#BE123C',   // rose-700, white 6.29
  RB: '#047857',   // emerald-700, white 5.48
  WR: '#1D4ED8',   // blue-700, white 6.70
  TE: '#C2410C',   // orange-700, white 5.18
  K: '#6D28D9',    // violet-700, white 7.10
  DST: '#334155',  // slate-700, white 10.35
}

// Sleeper's injury_status, already computed into player.inj by
// injury_code() in build_players.py — RULED_OUT/RISKY in app.js group
// these into two severities for the bust-risk score; this groups them into
// three for a chip, since a badge has room to say more than "risky or not."
//
// Two of these three hues are now position hues as well, and that used to
// be the argument against them: this comment previously read "none of the
// three below is a POS_BADGE hue — amber and violet aren't spoken for at
// all, and rose is already the app's one reserved danger colour." The
// position set moved underneath it (see this file's own header), so rose
// is QB and violet is K, and the collision is real but small: an injury
// mark is never a *bare* colour the way a position chip is — it is either
// captioned ("Questionable") or a dot with a title on it, and it never
// appears without the position chip it would otherwise be confused with
// sitting a few pixels away in a different shape. Recolouring severity to
// dodge that would cost more than it buys: amber/rose/violet already read
// as caution/danger/other, which is the whole job.
//
// What the move did break is legibility, not meaning. `dot` is a -400 step
// picked for a dark cell, and the board's cells are chalk now — rose-400
// on QB's #F7BCCB measures 1.55:1, which is a dot nobody can see, on
// exactly the position whose fill shares its hue. `chalk` is the same
// severity a few steps down, for that one ground: measured against all six
// fills, the worst case is 3.63 (rose-700 on K) against the 3:1 a non-text
// mark answers to. Two fields rather than one computed at read time, for
// the reason this file's header already gives about `dot` itself — and
// because "which ground is this on" is a fact the call site knows and the
// map cannot.
export const INJURY_META = {
  Q: { label: 'Questionable', cls: 'bg-amber-500/15 text-amber-300', dot: 'bg-amber-400', chalk: '#92400E' },
  D: { label: 'Doubtful', cls: 'bg-rose-500/15 text-rose-300', dot: 'bg-rose-400', chalk: '#BE123C' },
  O: { label: 'Out', cls: 'bg-rose-500/15 text-rose-300', dot: 'bg-rose-400', chalk: '#BE123C' },
  IR: { label: 'Injured reserve', cls: 'bg-rose-500/15 text-rose-300', dot: 'bg-rose-400', chalk: '#BE123C' },
  PUP: { label: 'Physically unable to perform', cls: 'bg-violet-500/15 text-violet-300', dot: 'bg-violet-400', chalk: '#6D28D9' },
  NFI: { label: 'Non-football injury', cls: 'bg-violet-500/15 text-violet-300', dot: 'bg-violet-400', chalk: '#6D28D9' },
  SUS: { label: 'Suspended', cls: 'bg-white/10 text-white/50', dot: 'bg-white/50', chalk: '#475569' },
  DNR: { label: 'Did not report', cls: 'bg-white/10 text-white/50', dot: 'bg-white/50', chalk: '#475569' },
  COV: { label: 'Reserve/COVID-19', cls: 'bg-white/10 text-white/50', dot: 'bg-white/50', chalk: '#475569' },
}
