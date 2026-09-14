import { useEffect, useMemo, useState } from 'react'
import { lineupRows } from '../../rooms/strategyBoard.js'
import { teamWeek } from '../../../lib/matchup.js'
import { seasonOdds, seedFor } from '../../../lib/seasonSim.js'

/* How many board rows are loaded, re-read on the two events that can
   change it. React bails out of a set to the same number, so the clock
   ticks of a live draft running behind this page (`juke:header` fires on
   every one) cost a comparison and not a render. 0 means "not yet", and it
   is the one value every memo below keys on. */
export function useBoardSize() {
  const read = () => {
    const e = typeof window !== 'undefined' ? window.JukeEngine : null
    return e && e.dataReady && e.dataReady() && e.board ? e.board().length : 0
  }
  const [n, setN] = useState(read)
  useEffect(() => {
    const on = () => setN(read())
    on()
    window.addEventListener('juke:data-loaded', on)
    window.addEventListener('juke:header', on)
    return () => {
      window.removeEventListener('juke:data-loaded', on)
      window.removeEventListener('juke:header', on)
    }
  }, [])
  return n
}

/* The season simulation, fed exactly what production's StandingsPanel
   feeds it — every team's lineup priced by lineupRows()/teamWeek() under
   the league's OWN scoring (projPerGameUnder), the measured weekly spread
   (weeklyCV), and seedFor(league, week) so a reload shows the same number.

   Keyed on the board's size rather than on the engine, which is one object
   for the life of the page: a memo on `engine` alone computes null before
   stats.js lands and never again (CLAUDE.md, "A memo keyed on engine can
   never see the board arrive"). */
export function useLeagueModel(league, snapshot) {
  const size = useBoardSize()
  const engine = typeof window !== 'undefined' ? window.JukeEngine : null
  const ready = size > 0

  const byId = useMemo(
    () => (ready ? new Map(engine.board().map((p) => [String(p.id), p])) : new Map()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size]
  )
  const rules = snapshot && snapshot.rules ? snapshot.rules : null
  const weekPts = useMemo(() => {
    if (!engine) return null
    if (!rules) return engine.projPerGame || null
    return (p) => engine.projPerGameUnder(p, rules)
  }, [engine, rules])
  const cv = useMemo(
    () => (ready && engine && engine.weeklyCV ? engine.weeklyCV(rules) : null),
    [engine, rules, ready]
  )
  const odds = useMemo(() => {
    if (!snapshot || !weekPts || !cv) return null
    const strength = {}
    for (const t of snapshot.teams || []) {
      strength[String(t.ownerId)] = teamWeek(lineupRows(t, byId, weekPts), cv)
    }
    return seasonOdds({
      schedule: snapshot.schedule,
      teams: snapshot.teams,
      strength,
      playoffTeams: snapshot.playoffTeams,
      seed: seedFor(league && league.leagueId, snapshot.week),
    })
  }, [snapshot, byId, weekPts, cv, league])

  return { ready, byId, odds }
}
