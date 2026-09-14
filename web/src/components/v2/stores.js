import { useEffect, useReducer } from 'react'
import { leagueState, useLeague, useLeagueSnapshot } from '../../hooks/useLeague.js'
import { snapshotState } from '../../lib/snapshotStore.js'
import { decisionState, useDecisions } from '../../hooks/useDecisions.js'
import { useTier } from '../../hooks/useTier.js'
import { tierState } from '../../lib/tierStore.js'

/* The production store hooks, with one re-check added. Every v2 page that
   reads a store goes through these — the hero's league pill drew a loading
   bar for the life of the page on a connected account, beside a button that
   already said "Switch or add league", which is this race with two readers.
   The real fix belongs in the production hooks; this is v2 not waiting on it.

   Each of useLeague / useDecisions / useTier reads the store during render
   and subscribes in an effect. If the store settles in the gap between the
   two — which a direct load of a page that is the store's only subscriber
   hits routinely, because `juke:data-loaded` can fire in exactly that gap —
   the announce goes to nobody, the refresh the effect then starts is a
   no-op (settle() declines to announce an unchanged answer), and the
   component stays on "loading" for the life of the page. Measured here:
   #/v2/league loaded straight, store "connected", screen "Checking which
   league is yours…" indefinitely; the same page reached by a hash change
   was fine.

   So after every render this compares what was drawn with what the store
   now holds and re-renders once if they differ. It reads the same store
   functions and changes nothing about them. */
function useRecheck(drawn, now) {
  const [, bump] = useReducer((n) => n + 1, 0)
  useEffect(() => {
    const cur = now()
    if (cur.some((v, i) => v !== drawn[i])) bump()
  })
}

export function useLeagueFresh() {
  const res = useLeague()
  useRecheck([res.status, res.league, res.leagues], () => {
    const s = leagueState()
    return [s.status, s.league, s.leagues]
  })
  return res
}

export function useDecisionsFresh() {
  const res = useDecisions()
  useRecheck([res.status, res.decisions], () => {
    const s = decisionState()
    return [s.status, s.decisions]
  })
  return res
}

export function useTierFresh() {
  const res = useTier()
  useRecheck([res.status, res.tier], () => {
    const s = tierState()
    return [s.status, s.tier]
  })
  return res
}

export function useSnapshotFresh(leagueId, provider) {
  const res = useLeagueSnapshot(leagueId, provider)
  const held = snapshotState()
  useRecheck([held.key, held.status, held.snapshot], () => {
    const s = snapshotState()
    return [s.key, s.status, s.snapshot]
  })
  return res
}
