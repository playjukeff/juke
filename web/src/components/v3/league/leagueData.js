import { useMemo } from 'react'
import { useBoardSize } from '../../v2/league/useLeagueModel.js'
import { myTeam, freeAgents, rosterGaps } from '../../rooms/waiverBoard.js'
import {
  bestSwaps, benchRows, injuryWatch, leagueWeekPts, lineupRows, projectedTotal,
  projectionSource, withLiveStatus,
} from '../../rooms/strategyBoard.js'
import { rosterTotal, rosterValues } from '../../rooms/tradeBoard.js'
import { roomStakes } from '../../shell/roomStakes.js'
import { gameInWeek, myGames } from '../../../lib/schedule.js'
import { matchupRead, teamWeek } from '../../../lib/matchup.js'
import { tradeWindow } from '../../../lib/tradeDeadline.js'
import { ordered, hasPlayed } from '../../../lib/standings.js'
import { leagueGapOf } from '../../../lib/leagueGap.js'

/* The connected-league readings v3's Now, League and team pages draw.

   Nothing here is arithmetic of its own. Every figure is one production
   module asked the question production asks it, with the same inputs:

     the week's scorer     leagueWeekPts()  — the league's own projection
                           first, Juke's weekly block, then the season
                           average, bye zeroed (strategyBoard.js)
     who is out            withLiveStatus() over the board, on a copy
     the swap              bestSwaps(), same position only
     the matchup           gameInWeek() + teamWeek() + the bridge's
                           winProbability(), the Draft Room's own model
     the wire              freeAgents()/rosterGaps() at roomStakes' depth
     the stakes            roomStakes(), in its two units
     the trade window      tradeWindow()
     the table             ordered()/hasPlayed()

   Keyed on the board's SIZE, never on the engine: the engine is one object
   for the life of the page, and a memo on it alone answers null before
   stats.js lands and never again (CLAUDE.md, "A memo keyed on engine can
   never see the board arrive"). */

/* roomStakes' own wire depth, quoted so the "+N on the wire" in a band and
   the gap rows under it are the same sum rather than two readings of two
   different depths of the wire. */
export const WIRE_DEPTH = 60

/* The board, the league's week scorer and the live status, for one
   snapshot. Shared by every connected page so no two of them build the
   scorer differently — which is the three-scorers failure strategyBoard's
   own header records. */
export function usePricing(snapshot) {
  const size = useBoardSize()
  const ready = size > 0
  const engine = typeof window !== 'undefined' ? window.JukeEngine : null
  const boardById = useMemo(
    () => (ready && engine ? new Map(engine.board().map((p) => [String(p.id), p])) : new Map()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size]
  )
  const week = snapshot ? snapshot.week : null
  const byId = useMemo(
    () => withLiveStatus(boardById, snapshot && snapshot.status, week),
    [boardById, snapshot, week]
  )
  const weekPts = useMemo(
    () => (ready ? leagueWeekPts(engine, snapshot) : null),
    [engine, snapshot, ready]
  )
  const rules = snapshot && snapshot.rules ? snapshot.rules : null
  const cv = useMemo(
    () => (ready && engine && engine.weeklyCV ? engine.weeklyCV(rules) : null),
    [engine, rules, ready]
  )
  // Priced under THIS league's scoring and shape, not the Draft Room's.
  const gapOfLeague = useMemo(() => leagueGapOf(engine, snapshot), [engine, snapshot])
  const gapOf = ready ? gapOfLeague : null
  return { ready, engine, byId, weekPts, week, cv, gapOf }
}

export function median(nums) {
  if (!nums.length) return null
  const s = nums.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function recordText(t) {
  if (!t) return '—'
  return `${t.wins || 0}-${t.losses || 0}${t.ties ? `-${t.ties}` : ''}`
}

/* A team's page address. The snapshot's `rosterId` is short and stable on
   both platforms; V3Team also accepts `ownerId`, which is what a schedule
   names a team by, so a link built from either lands. */
export function teamHref(team) {
  if (!team) return '#/v3/league'
  const id = team.rosterId !== null && team.rosterId !== undefined ? team.rosterId : team.ownerId
  return `#/v3/league/team/${encodeURIComponent(String(id))}`
}

export function findTeam(snapshot, id) {
  const teams = (snapshot && snapshot.teams) || []
  const key = String(id)
  return teams.find((t) => String(t.rosterId) === key) || teams.find((t) => String(t.ownerId) === key) || null
}

/* The table and the reader's place in it. The rank is null until somebody
   has played — before week one every sort key is zero and a number would be
   the order the platform returned its teams in (hasPlayed()). */
export function standing(snapshot, ownerId) {
  const table = ordered((snapshot && snapshot.teams) || [])
  const played = hasPlayed(table)
  const me = ownerId ? table.find((t) => String(t.ownerId) === String(ownerId)) || null : null
  const rankOf = (t) => (played && t ? table.indexOf(t) + 1 : null)
  const pfMedian = table.length ? median(table.map((t) => t.pointsFor || 0)) : null
  const paMedian = table.length ? median(table.map((t) => t.pointsAgainst || 0)) : null
  return { table, played, me, rank: rankOf(me), rankOf, pfMedian, paMedian }
}

/* One team's week: its lineup under the league's scorer, its total, and
   whose number that total is. Used for the reader's team on Now and for any
   team on its own page. */
export function teamWeekRows(team, pricing, snapshot) {
  const { byId, weekPts, week } = pricing
  if (!team || !weekPts) return { lineup: [], bench: [], total: null, source: 'none' }
  const lineup = lineupRows(team, byId, weekPts)
  return {
    lineup,
    bench: benchRows(team, byId, weekPts),
    total: projectedTotal(team, byId, weekPts),
    source: projectionSource(lineup, snapshot && snapshot.projections, week),
  }
}

/* Everything Now's call sheet reads, in one pass over one snapshot. */
export function useWeekSheet(league, snapshot) {
  const pricing = usePricing(snapshot)
  const { ready, engine, byId, weekPts, week, cv, gapOf } = pricing
  return useMemo(() => {
    if (!snapshot || !ready || !engine) return null
    const teams = snapshot.teams || []
    const mine = myTeam(snapshot, league)

    const lineup = mine ? lineupRows(mine, byId, weekPts) : []
    const total = mine ? projectedTotal(mine, byId, weekPts) : null
    const swaps = mine ? bestSwaps(mine, byId, weekPts, week, 10) : []
    const source = projectionSource(lineup, snapshot.projections, week)

    const game = gameInWeek(snapshot.schedule, league && league.ownerId, week)
    const opponent = game && game.opponentId
      ? teams.find((t) => String(t.ownerId) === String(game.opponentId)) || null
      : null
    const oppLineup = opponent ? lineupRows(opponent, byId, weekPts) : []
    const oppTotal = opponent ? projectedTotal(opponent, byId, weekPts) : null
    const mineWeek = teamWeek(lineup, cv)
    const oppWeek = teamWeek(oppLineup, cv)
    const winProb = engine.winProbability ? engine.winProbability(mineWeek, oppWeek) : null

    const hurt = mine ? injuryWatch(mine, byId, week) : []

    const available = gapOf ? freeAgents([...byId.values()], snapshot, gapOf, WIRE_DEPTH) : []
    const gaps = mine && gapOf ? rosterGaps(mine, byId, available, gapOf) : []
    const stakes = roomStakes({ snapshot, league, byId, gapOf, weekPts, week })

    const window_ = tradeWindow(snapshot.tradeDeadline, { week })
    const value = mine && gapOf ? rosterTotal(mine, byId, gapOf) : null
    const chips = mine && gapOf
      ? rosterValues(mine, byId, gapOf).filter((r) => r.value !== null).sort((a, b) => b.value - a.value)
      : []

    const games = myGames(snapshot.schedule, league && league.ownerId)
    const rostered = teams.some((t) => (t.players || []).length)

    return {
      mine, lineup, total, swaps, source, game, opponent, oppTotal, mineWeek, oppWeek,
      winProb, read: matchupRead(winProb), hurt, gaps, available, stakes,
      tradeWindow: window_, value, chips, games, rostered,
    }
  }, [snapshot, league, ready, engine, byId, weekPts, week, cv, gapOf])
}
