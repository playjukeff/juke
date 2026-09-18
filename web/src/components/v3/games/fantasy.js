/* One NFL week, priced for the reader: the fantasy points the scores pages
   show beside a real player.

   ---- The platform's number first ----

   A player on a connected league's roster scored whatever THAT platform
   says he scored. Four leagues score one stat line four ways -- 49.3 full
   PPR on ESPN and Sleeper, 43.82 half PPR, 40.82 on CBS, for one Josh
   Allen game -- and none of them is Juke's to recompute. So:

     1. the platform's own figure for this week, when it has one:
        snapshot.actuals (ESPN and Sleeper, rostered players, current week)
        or the CBS week (every player CBS scored that week);
     2. otherwise Juke's calculation from ESPN's box score under the
        league's own rules (lib/gameSummary.js linePoints), labelled so;
     3. with no league at all, Juke's default half PPR, labelled so.

   `source` rides on every figure so no screen prints a calculation as if
   the platform had said it.

   ---- Which league ----

   The active one -- the head of the connected list, which the League page's
   switcher reorders. Switching there switches every figure here. */
import { useMemo } from 'react'
import { useLeagueFresh, useSnapshotFresh } from '../../v2/stores.js'
import { myTeam } from '../../rooms/waiverBoard.js'
import { useWeekSheet } from '../league/leagueData.js'
import { useCbsWeek } from '../league/useCbsWeek.js'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { boardTeam, normName } from '../../../lib/gameSummary.js'
import { useBoardSize } from '../../v2/league/useLeagueModel.js'

/* The platform's per-player figures for one week, as a Map of Sleeper id to
   points, or null when the platform has published none for that week. */
export function platformPoints(snapshot, cbsView, week) {
  if (!snapshot || !week) return null
  if (snapshot.provider === 'cbs') {
    const v = cbsView
    if (!v || Number(v.week) !== Number(week) || !v.players) return null
    return new Map(Object.entries(v.players).filter(([, p]) => Number.isFinite(p)).map(([id, p]) => [String(id), p]))
  }
  const a = snapshot.actuals
  if (!a || !a.players || Number(a.week) !== Number(week)) return null
  const out = new Map()
  for (const [id, row] of Object.entries(a.players)) {
    if (row && Number.isFinite(row.points)) out.set(String(id), row.points)
  }
  return out.size ? out : null
}

/* The board, indexed the way ESPN names a player: club and normalised name.
   A defence is its club. */
export function boardIndex(board) {
  const m = new Map()
  for (const p of board || []) {
    if (!p || !p.team) continue
    const team = String(p.team).toUpperCase()
    if (p.pos === 'DST') { m.set(`${team}|dst`, p); continue }
    m.set(`${team}|${normName(p.name)}`, p)
  }
  return m
}
export function findOnBoard(index, abbr, name) {
  if (!index) return null
  return index.get(`${boardTeam(abbr)}|${normName(name)}`) || null
}

export function useFantasy(week) {
  const size = useBoardSize()
  const engine = typeof window !== 'undefined' ? window.JukeEngine : null
  const { league, status: ls } = useLeagueFresh()
  const connected = ls === 'connected' && !!league
  const { snapshot, status } = useSnapshotFresh(connected ? league.leagueId : null, connected ? league.provider : null)
  const ready = connected && status === 'ready' && !!snapshot
  const w = Number(week) || (ready ? Number(snapshot.week) : null)
  const cbs = useCbsWeek(ready ? league.leagueId : null, ready ? league.provider : null, w)
  const sheet = useWeekSheet(ready ? league : null, ready ? snapshot : null)

  return useMemo(() => {
    const board = size && engine && engine.board ? engine.board() : []
    const index = boardIndex(board)
    const leagueRules = ready && engine && engine.rulesFromLeague ? engine.rulesFromLeague(snapshot.rules) : null
    const rules = leagueRules || (engine && engine.rulesForFormat ? engine.rulesForFormat('half') : null)
    const platform = ready ? platformFor(league.provider).name : null
    const label = ready ? (snapshot.name || league.name || 'Your league') : 'Juke half PPR'
    const pts = ready ? platformPoints(snapshot, cbs.view, w) : null
    const mine = ready ? myTeam(snapshot, league) : null
    const opp = sheet && sheet.opponent ? sheet.opponent : null
    const owners = new Map()
    if (ready) {
      for (const t of snapshot.teams || []) {
        for (const id of t.players || []) owners.set(String(id), { name: t.teamName || t.name || 'A team', mine: t === mine, opp: t === opp })
      }
    }
    const starters = new Set(((mine && mine.starters) || []).map(String))
    const oppStarters = new Set(((opp && opp.starters) || []).map(String))
    /* Points for a board player, given Juke's own calculation for the
       fallback. `null` calc and no platform figure is a dash. */
    const pointsFor = (id, calc) => {
      const k = id != null ? String(id) : null
      if (k && pts && pts.has(k)) return { v: pts.get(k), src: platform }
      if (calc == null || !Number.isFinite(calc)) return null
      return { v: Math.round(calc * 100) / 100, src: 'calc' }
    }
    return {
      ready, league: ready ? league : null, snapshot: ready ? snapshot : null, week: w,
      label, platform, rules, leagueRules: !!leagueRules, index, owners, starters, oppStarters,
      opponentName: opp ? opp.teamName || opp.name || null : null, pointsFor,
    }
  }, [size, engine, ready, snapshot, league, cbs.view, w, sheet])
}

/* "from ESPN" / "Juke calc" -- short enough for a figure's caption. */
export const sourceText = (x) => (!x ? '' : x.src === 'calc' ? 'Juke calc' : `from ${x.src}`)
