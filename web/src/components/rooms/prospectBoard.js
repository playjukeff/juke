/* What Juke actually knows about a rookie, and what it does not.
 *
 * Imports nothing, like the three room modules beside it.
 *
 * ---- This room's honesty problem is the largest in the product ----
 *
 * ROOMS' own blurb promises "the college production and NFL translation of
 * incoming rookies", and CLAUDE.md already records that the half which is
 * not here is exactly that: un-retiring the entry did not build the room
 * behind it. Measured against the 8 September 2026 board — 77 rookies,
 * every one with a college and a 2026 projection, 62 with a depth-chart
 * slot, and NOT ONE with a college statistic, a combine number or an NFL
 * draft position anywhere in this repository.
 *
 * So the room can rank rookies and cannot explain them, and the handoff's
 * own copy says the right thing about that: "Juke keeps confidence low
 * until the combine and the NFL draft say something. It will not pretend
 * otherwise." That is the posture, and these functions are built to make
 * it true rather than to make it sound true.
 */

/* Everybody in their first NFL season, best first.
 *
 * `exp` is Sleeper's years_exp, on every matched stats record. A player
 * the crosswalk never placed has no stats record and therefore no `exp` —
 * and is NOT a rookie by default. Absence of evidence is the "treat 0 from
 * an API as missing" rule, and defaulting to 0 here would fill a rookie
 * board with veterans nobody could join.
 *
 * Ranked by projection rather than by ADP, deliberately. ADP for a rookie
 * is the market's guess before anybody has seen him play, and this room's
 * whole claim is that it has a view of its own; ordering by the market
 * would make the board a mirror. `rankBy` is passed in so the caller can
 * still offer ADP order without this module having two opinions.
 */
export function rookies(board, statOf, rankBy) {
  if (!Array.isArray(board) || !statOf) return []
  const out = []
  for (const player of board) {
    if (!player || !player.id) continue
    const stat = statOf(player)
    if (!stat || stat.exp !== 0) continue
    const value = rankBy ? rankBy(player) : null
    out.push({ player, stat, value })
  }
  out.sort((a, b) => {
    // Unranked last, never first — the null-sorts-to-the-top trap the
    // trade board already paid for. A rookie the app cannot price is
    // genuinely below one it prices badly, in a list about who to take.
    if (a.value === null && b.value === null) return 0
    if (a.value === null) return 1
    if (b.value === null) return -1
    return b.value - a.value
  })
  return out
}

/* The facts about one rookie, split into what is known and what is not.
 *
 * BOTH halves are returned, and the missing half is the point. A prospect
 * screen that quietly showed six fields would read as a complete profile;
 * one that names what it is missing tells a reader how much weight to put
 * on the ranking above it — which is the same job the Juke score's own
 * "unranked" note does for kickers.
 *
 * Nothing here is derived or estimated. Every `known` entry is a value
 * that arrived from a feed.
 */
export function knownAbout(row) {
  const stat = (row && row.stat) || {}
  const player = (row && row.player) || {}

  const known = []
  if (stat.col) known.push({ label: 'College', value: stat.col })
  if (stat.age) known.push({ label: 'Age', value: String(stat.age) })
  if (stat.ht && stat.wt) {
    // Sleeper stores height as inches, a bare number. heightText() renders
    // it in app.js; this is the same conversion and nothing else.
    const inches = Number(stat.ht)
    const ht = inches > 0 ? Math.floor(inches / 12) + "'" + (inches % 12) + '"' : null
    known.push({ label: 'Size', value: [ht, stat.wt ? stat.wt + ' lb' : null].filter(Boolean).join(' · ') })
  }
  if (stat.depth) {
    known.push({
      label: 'Depth chart',
      value: stat.depth + (stat.order ? ' #' + stat.order : ''),
    })
  }
  if (player.team) known.push({ label: 'Team', value: player.team })

  /* What nobody can look up here, named rather than omitted.

     `deep` is the pipeline's own flag for a player past real ADP — no
     draft has ever taken him, so the market has said nothing either. */
  const missing = ['College production', 'Combine testing', 'NFL draft position']
  if (!stat.depth) missing.push('Depth chart role')
  if (player.deep) missing.push('Any real draft position')
  if (player.projPts === null || player.projPts === undefined) missing.push('A 2026 projection')

  /* What is deliberately NOT in this list: the fact that Juke declines to
     RANK kickers and defenses. That is a refusal rather than a gap — the
     app could rate them and has measured that it should not — and folding
     it in here would count it as one more thing nobody knows, which is a
     different and weaker claim. jukeReadout().unrankedNote is where that
     sentence already lives, written once, and the room renders it beside
     these rather than inside them. */

  return { known, missing }
}

/* How much of a rookie's ranking is standing on evidence.
 *
 * Deliberately NOT a confidence percentage. The handoff caps confidence at
 * 71% until April, which is a number chosen to look uncertain — and a
 * number that looks uncertain is still a number, which a reader will
 * compare against another one. This returns a count and a total, so a
 * screen can say "2 of 5 things known" and nothing more precise than the
 * truth.
 */
export function evidence(row) {
  const { known, missing } = knownAbout(row)
  return { known: known.length, total: known.length + missing.length }
}
