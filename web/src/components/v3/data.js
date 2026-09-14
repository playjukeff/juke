/* Readers for the figures v3's own shell and Now page draw. Pure functions
   over window.JukeEngine, answering null rather than throwing before the
   board lands. Nothing here re-derives a number: projection and value over
   replacement come from vorpUnder(), ADP from the board. */

import { timeAgo } from '../dataFreshness.js'

export const FORMATS = ['standard', 'half', 'ppr']
export const LEAD = ['QB', 'RB', 'WR', 'TE']

/* The call: two players at one position that the market drafts back to back
   and the points order the other way round.

   The market's order is ADP. The points' order is value over a replaceable
   starter under the chosen scoring (vorpUnder), so a scoring switch can
   genuinely flip a call — which is the product's argument, demonstrated
   rather than asserted.

   Of every pair whose ADP sits within WINDOW picks, at this position, among
   the first DEPTH players the market takes there, the one whose value
   disagrees with the market by the most. When nothing disagrees the answer
   says so (`agree: true`) with the top two, rather than inventing a call. */
const WINDOW = 6
const DEPTH = 24

export function readCall(engine, pos, format) {
  const board = engine.board()
  if (!board || !board.length || !engine.vorpUnder) return null
  const table = engine.vorpUnder(format)
  const rows = board
    .filter((p) => p.pos === pos && typeof p.adp === 'number')
    .slice(0, DEPTH)
    .map((p) => {
      const r = table[p.id]
      if (!r || r.vorp === null || r.vorp === undefined || r.projPts === null) return null
      return {
        id: p.id,
        name: p.name,
        team: p.team,
        pos: p.pos,
        adp: p.adp,
        pts: r.projPts,
        vorp: r.vorp,
        replacement: r.projPts - r.vorp,
        photo: engine.photoUrl ? engine.photoUrl(p) : '',
      }
    })
    .filter(Boolean)
  if (rows.length < 2) return null

  let best = null
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i] // taken earlier by the market
      const b = rows[j]
      if (b.adp - a.adp > WINDOW) continue
      const gap = b.vorp - a.vorp // positive: the later pick is worth more
      if (gap > 0 && (!best || gap > best.gap)) best = { market: a, juke: b, gap }
    }
  }
  const round = (r) => ({ ...r, pts: Math.round(r.pts), vorp: Math.round(r.vorp), replacement: Math.round(r.replacement), adp: Math.round(r.adp * 10) / 10 })
  if (!best) {
    const [a, b] = rows
    return { agree: true, market: round(a), juke: round(a), other: round(b), gap: Math.round(a.vorp - b.vorp), pos, format }
  }
  return { agree: false, market: round(best.market), juke: round(best.juke), gap: Math.round(best.gap), pos, format }
}

/* What the page's situation band says: the board's size, how old it is, and
   the scoring the live league is set to. All read, none written down —
   freshness goes through production's own dataFreshness helper so the two
   builds cannot word the age differently. */
export function readSituation(engine) {
  const board = engine.board()
  if (!board || !board.length) return null
  const league = engine.league()
  const names = engine.scoringNames ? engine.scoringNames() : {}
  const meta = engine.playersMeta ? engine.playersMeta() : null
  return {
    players: board.length,
    scoring: league && names[league.scoring] ? names[league.scoring] : null,
    scoringKey: league && FORMATS.includes(league.scoring) ? league.scoring : 'half',
    refreshed: meta && meta.generated ? timeAgo(meta.generated) : null,
  }
}
