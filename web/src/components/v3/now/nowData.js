/* The sample week the in-season pages show to somebody Juke cannot read a
   league for: the matchup, the lineup call and the claim, each computed by
   the function the tool behind it computes with, on the SAMPLE league the
   call tools already draft off tonight's board (calls/callData.js).

   Nothing here scores a player. The lineup call is bestSwaps() under
   leagueWeekPts() — the Strategy Room's own — and the claim is
   rosterGaps() over freeAgents() priced by JukeEngine.replacementGap, the
   Waiver Room's. The win probability is the bridge's winProbability() over
   lib/matchup.js's teamWeek(), which is what the matchup page draws.

   ---- Each row is the sample its own tool opens on ----

   A row links to its tool, and the figure on the row has to be the figure
   the tool shows when it opens. The lineup tool asks sampleLeague() for a
   chair its lineup call would change (V3Call.jsx's readLineupSample); the
   matchup page and the wire ask for the mock's own seat. So the lineup row
   is read off the first and the other two off the second — usually the
   same chair, and when it is not, each row still matches the page it opens
   rather than a page nobody opens. */

import { sampleLeague } from '../calls/callData.js'
import { bestSwaps, leagueWeekPts, lineupRows, projectedTotal } from '../../rooms/strategyBoard.js'
import { freeAgents, rosterGaps } from '../../rooms/waiverBoard.js'
import { teamWeek, matchupRead } from '../../../lib/matchup.js'

const WIRE_DEPTH = 60

export function readSampleWeek(engine) {
  if (!engine || !engine.board || !engine.dataReady || !engine.dataReady()) return null
  const board = engine.board()
  if (!board || !board.length) return null
  const byId = new Map(board.map((p) => [String(p.id), p]))
  const weekPts = leagueWeekPts(engine, null)

  const plain = sampleLeague(engine)
  if (!plain) return null
  const snap = plain.snapshot
  const me = snap.teams.find((t) => t.ownerId === plain.league.ownerId)
  const them = me ? snap.teams[(snap.teams.indexOf(me) + 1) % snap.teams.length] : null

  let matchup = null
  if (me && them) {
    const cv = engine.weeklyCV ? engine.weeklyCV(null) : null
    const wA = teamWeek(lineupRows(me, byId, weekPts), cv)
    const wB = teamWeek(lineupRows(them, byId, weekPts), cv)
    const winProb = wA && wB && engine.winProbability ? engine.winProbability(wA, wB) : null
    matchup = {
      me: me.teamName,
      them: them.teamName,
      mine: projectedTotal(me, byId, weekPts),
      theirs: projectedTotal(them, byId, weekPts),
      winProb: typeof winProb === 'number' ? winProb : null,
      read: matchupRead(typeof winProb === 'number' ? winProb : null),
    }
  }

  let claim = null
  const gapOf = engine.replacementGap || null
  if (me && gapOf) {
    const available = freeAgents(board, snap, gapOf, WIRE_DEPTH)
    const gaps = rosterGaps(me, byId, available, gapOf)
    if (gaps.length) claim = { player: gaps[0].best.player, pos: gaps[0].pos, improvement: gaps[0].improvement, held: gaps[0].held }
  }

  const preferred = sampleLeague(engine, { prefer: (team) => bestSwaps(team, byId, weekPts, null, 1).length > 0 })
  let swap = null
  if (preferred) {
    const mine = preferred.snapshot.teams.find((t) => t.ownerId === preferred.league.ownerId)
    const best = mine ? bestSwaps(mine, byId, weekPts, null, 1)[0] : null
    if (best) swap = { start: best.start, sit: best.sit, gain: best.gain, team: mine.teamName }
  }

  return { teams: plain.teams, matchup, swap, claim }
}
