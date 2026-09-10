// The phone Players table's position-driven column sets — README section
// 4c, adapted where the spec names a stat this pipeline genuinely has no
// source for rather than inventing one. playerColumns.js stays what the
// tablet/desktop table reads; this is a second, deliberately different
// shape (derived ratios like Y/A that the flat desktop column list
// doesn't compute), built off the exact same raw projection block
// (`ctx.projOf(player)`, the same reader statValue() already uses) so
// there is nothing here to drift out of sync with what the rest of the
// app calls the same stat.
//
// Rost % (every position) is the one column dropped on the owner's own
// call rather than a measurement: Sleeper has no public roster-percentage
// feed, and app.js already says so in rankRow()'s own comment ("we have
// no equivalent of and would be guessing at"). Every other column below
// that the design handoff asked for and this file doesn't show was cut
// after being measured against the real board and found to never
// populate — see the long comment above PHONE_POSITION_COLUMNS.

// pct(a, b) — a share of b, as a rounded whole-number percentage, or null
// if the denominator is absent/zero. "A missing number is not a small
// number" (CLAUDE.md) applies here exactly as it does to a raw stat: 0
// completions over 0 attempts is "no data," not "0%."
function pct(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number' || b <= 0) return null
  return Math.round((a / b) * 1000) / 10
}

function ratio(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number' || b <= 0) return null
  return Math.round((a / b) * 10) / 10
}

// One decimal for these; everything else that isn't a percentage/ratio
// column renders as a whole number. Matches README 4c's own formatting
// rule ("adp, pts, ypc, cmp, ya, ydrec always render to one decimal")
// minus every column this file drops.
const ONE_DECIMAL = new Set(['adp', 'pts', 'ypc', 'ydrec', 'cmp', 'ya'])

// Every column reader takes (player, ctx) — ctx is the same
// {pointsFor, projOf} shape playerColumns.js's statValue() already uses,
// so ADP/PTS never disagree with any other reading of the same player on
// this screen.
const READERS = {
  adp: (p) => (typeof p.adp === 'number' ? p.adp : null),
  pts: (p, ctx) => ctx.pointsFor(p),
  bye: (p) => p.bye || null,
  passYd: (p, ctx) => ctx.projOf(p)?.py ?? null,
  passTd: (p, ctx) => ctx.projOf(p)?.pt ?? null,
  int: (p, ctx) => ctx.projOf(p)?.pi ?? null,
  cmp: (p, ctx) => pct(ctx.projOf(p)?.pc, ctx.projOf(p)?.pa),
  att: (p, ctx) => ctx.projOf(p)?.pa ?? null,
  rush: (p, ctx) => ctx.projOf(p)?.ra ?? null,
  rushYd: (p, ctx) => ctx.projOf(p)?.ry ?? null,
  rushTd: (p, ctx) => ctx.projOf(p)?.rt ?? null,
  ya: (p, ctx) => ratio(ctx.projOf(p)?.ry, ctx.projOf(p)?.ra),
  recYd: (p, ctx) => ctx.projOf(p)?.cy ?? null,
  rec: (p, ctx) => ctx.projOf(p)?.rc ?? null,
  recTd: (p, ctx) => ctx.projOf(p)?.ct ?? null,
  ypc: (p, ctx) => ratio(ctx.projOf(p)?.ry, ctx.projOf(p)?.ra),
  ydrec: (p, ctx) => ratio(ctx.projOf(p)?.cy, ctx.projOf(p)?.rc),
  xpm: (p, ctx) => ctx.projOf(p)?.xp ?? null,
  sack: (p, ctx) => ctx.projOf(p)?.sk ?? null,
  defInt: (p, ctx) => ctx.projOf(p)?.in ?? null,
  fr: (p, ctx) => ctx.projOf(p)?.fr ?? null,
}

// { key, label } pairs, in display order, per README 4c — with a second
// round of real-data verification on top of the Rost %/Yd·A notes above,
// this time measured rather than reasoned about (per this file's own
// testing culture: "a measurement is true of the board it was taken on").
// Loading the real 27 Aug board and counting non-null values per column,
// several of the spec's columns turned out to be dead on arrival for
// *projected* data specifically, for reasons CLAUDE.md already documents
// elsewhere about this exact pipeline — not bugs in this file, gaps in
// what Sleeper forecasts:
//   - Tar / Catch % / Yd·Tar: 0 of 165 RB/WR/TE carry a projected target
//     at all. This is the identical fact CLAUDE.md's own desktop table
//     already worked around ("Sleeper shows a TAR column their own
//     projections do not fill... We show REC instead") — applied here
//     rather than re-discovered and ignored. Rec/Rec Yd/Yd·Rec stay,
//     because rec and cy both do project.
//   - FGM / FGA / FG % / XPA / Lng: Sleeper's own kicker projections carry
//     only the 40-49 and 50-59 yard make bands (CLAUDE.md: "no field goal
//     under forty yards at all"), never a total make/attempt count or a
//     longest-kick figure — 0 of 19 kickers carry any of these five.
//     Summing the two bands into a fake "FGM" would silently undercount
//     (253 of 406 real 2025 makes were under 40 yards) and present the
//     gap as a real total, which is exactly the thing this pipeline
//     refuses to do anywhere else. XPM is the one kicking figure that
//     does project (19 of 19).
//   - TD / Sfty / PA for DEF: defensive touchdowns and safeties are not
//     forecast at all (0 of 21), and the points-allowed bands that would
//     back a PA estimate are effectively single-valued in practice — only
//     the d0 band was populated across the whole board, which collapses
//     paEstimate() to 0 for every defense rather than a real spread. A
//     column that reads identically for all 21 defenses is exactly the
//     "constant is not information" trap CLAUDE.md's grade section names
//     — Sack/INT/FR stay, all three fully populated.
// ALL is the union, matching the desktop table's own "union, not
// per-position" convention -- but ORDERED by how many cards can fill a
// column, not by the order the positions happen to be listed in above.
// Led by QB it put PASS YD / PASS TD / INT first, so on a 390px card a
// running back's opening three cells were three dashes, and the majority
// of every roster is not a quarterback. Receiving leads because RB, WR and
// TE all carry it; rushing follows; passing comes after, where the two
// quarterbacks on a roster still find it and nobody else pays for it.
const QB = [['passYd', 'Pass Yd'], ['passTd', 'Pass TD'], ['int', 'INT'], ['cmp', 'Cmp %'], ['att', 'Att'], ['rush', 'Rush'], ['rushYd', 'Rush Yd'], ['rushTd', 'Rush TD'], ['ya', 'Y/A']]
const RB = [['rushYd', 'Rush Yd'], ['recYd', 'Rec Yd'], ['rec', 'Rec'], ['rushTd', 'Rush TD'], ['recTd', 'Rec TD'], ['rush', 'Rush'], ['ypc', 'YPC'], ['ydrec', 'Yd/Rec']]
const WR = [['recYd', 'Rec Yd'], ['rec', 'Rec'], ['recTd', 'Rec TD'], ['ydrec', 'Yd/Rec'], ['rush', 'Rush'], ['rushYd', 'Rush Yd'], ['rushTd', 'Rush TD']]
const TE = [['recYd', 'Rec Yd'], ['rec', 'Rec'], ['recTd', 'Rec TD'], ['ydrec', 'Yd/Rec']]
const K = [['xpm', 'XPM']]
const DEF = [['sack', 'Sack'], ['defInt', 'INT'], ['fr', 'FR']]

function dedupe(pairs) {
  const seen = new Set()
  return pairs.filter(([key]) => (seen.has(key) ? false : (seen.add(key), true)))
}

export const PHONE_POSITION_COLUMNS = {
  ALL: dedupe([...WR, ...RB, ...TE, ...QB, ...K, ...DEF]),
  QB, RB, FLEX: RB, WR, TE, K, DST: DEF,
}

export function phoneColumnValue(key, player, ctx) {
  const reader = READERS[key]
  const raw = reader ? reader(player, ctx) : null
  if (raw == null) return '-'
  return ONE_DECIMAL.has(key) ? raw.toFixed(1) : String(Math.round(raw))
}

export function phoneColumnRaw(key, player, ctx) {
  const reader = READERS[key]
  return reader ? reader(player, ctx) : null
}
