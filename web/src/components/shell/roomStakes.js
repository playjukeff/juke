import { myTeam, freeAgents, rosterGaps } from '../rooms/waiverBoard.js'
import { bestSwaps } from '../rooms/strategyBoard.js'

/* What each room has at stake, for the rail and the room grid.
 *
 * Screens 16 and 20 of the decision guide both ask a room's own tile to
 * carry its stake, and CLAUDE.md listed both under the screens the data
 * cannot answer: *"No room writes one; `railItems.js` already deleted a
 * 'needs action' dot for the same reason."*
 *
 * Re-measured 9 September 2026, and that is now half right. Two of the six
 * rooms compute a real stake today and have since their boards were
 * written — `rosterGaps()` is what the Waiver Room's own header KPI sums
 * into "PTS OPEN", and `bestSwaps()` is what the Strategy Room ranks its
 * lineup on. **Neither is new; nothing had asked them from outside a room.**
 *
 * The other four have nothing to ask. Trade needs a partner and a package
 * chosen before `tradeSwing()` means anything, so there is no passive
 * figure; League is standings; Prospect and Draft are not weekly at all.
 *
 * So this answers for the rooms that can and is silent for the rest, which
 * is the same call screens 05 and 07 already took. **A tile carrying a
 * confident number for four rooms and an invented one for two would be
 * worse than a grid where two tiles say something.**
 *
 * ---- The two are in DIFFERENT UNITS, and that is the whole care here ----
 *
 * Strategy's swap gain comes off `weekPts`, which is `projPerGame` under
 * the league's own rules: **points this week**. Waiver's improvement comes
 * off `gapOf`, which is `replacementGap()`: **projected points over
 * replacement for the season**.
 *
 * Those are not the same quantity and must never be printed as though they
 * were. The guide's own phrasing — "pts at stake this week" — is true of
 * one of them and false of the other, and a row reading "−4.2 pts/wk" over
 * a season figure is exactly the right-value-wrong-column failure this
 * project has shipped once in a standings table. Each stake therefore
 * carries its own `unit`, and every caller is obliged to print it.
 *
 * ---- The sign follows the Waiver Room's own card, rather than a second
 * opinion ----
 *
 * `WaiverRoomLive`'s stake card already prints `+N pts open` as a COST:
 * the magnitude is what you could gain, and the cost is that you have not.
 * Both stakes here are the same shape, so both are `cost`, and the caller
 * gets the sign rather than deciding it. Three copies of one vocabulary is
 * how a colour comes to mean two things.
 */

/* Enough of the wire to find the best claim at each position. 60 is what
   WaiverRoomLive itself asks for, and it is quoted rather than re-chosen so
   the lobby and the room cannot disagree about how deep the wire goes. */
const WIRE_DEPTH = 60

/* Below this, a stake is noise rather than news.
 *
 * Not a taste call: `replacementGap()` carries the projection's own error,
 * which CLAUDE.md measures at MAE 6.8 points a player. A sub-point "stake"
 * on a tile is a number a reader would act on that the model cannot
 * support, and a grid where every room always shows something is a grid
 * nobody reads. Rounded display means anything under 0.5 would print as 0
 * anyway, so this only widens that to a figure worth a colour. */
const FLOOR = 1

export function roomStakes(input) {
  const o = input || {}
  const { snapshot, league, byId, gapOf, weekPts, week } = o

  // Everything below needs a roster to be about. No connected league, no
  // crosswalk yet, or a snapshot that cannot say which team is the
  // reader's — all three are "we do not know", not "nothing is at stake".
  const mine = snapshot && league ? myTeam(snapshot, league) : null
  if (!mine || !byId || !byId.size) return {}

  const out = {}

  /* Waiver: what the wire holds that the roster does not.
     Summed across positions, which is what the room's own KPI does — one
     claim is the headline there and the tile has room for one number. */
  if (gapOf) {
    const available = freeAgents(
      // freeAgents wants the board; byId's values are it.
      [...byId.values()],
      snapshot,
      gapOf,
      WIRE_DEPTH
    )
    const gaps = rosterGaps(mine, byId, available, gapOf)
    const pts = gaps.reduce((sum, g) => sum + g.improvement, 0)
    if (pts >= FLOOR) out.waiver = { pts, unit: 'season', sign: 'cost' }
  }

  /* Strategy: the single best start/sit this week.
     The BEST rather than the sum, and the difference matters: swaps are
     alternatives to each other, not additions. Summing them would count
     the same starter's seat twice and print a number no lineup can reach —
     which is the same error `insightsReport()` records about summing an
     unmatched per-pick maximum. */
  if (weekPts) {
    const swaps = bestSwaps(mine, byId, weekPts, week, 1)
    const best = swaps && swaps[0]
    const pts = best && typeof best.gain === 'number' ? best.gain : 0
    if (pts >= FLOOR) out.strategy = { pts, unit: 'week', sign: 'cost' }
  }

  return out
}

/* One phrasing, so the rail and the grid cannot describe the same number
   two ways. The unit is in the words rather than in a suffix nobody reads:
   "8.4 this week" and "31 on the wire" are each true of their own quantity
   and neither can be mistaken for the other. */
export function stakeLabel(stake) {
  if (!stake) return null
  const n = stake.pts >= 10 ? Math.round(stake.pts) : Math.round(stake.pts * 10) / 10
  return stake.unit === 'week' ? `+${n} this week` : `+${n} on the wire`
}
