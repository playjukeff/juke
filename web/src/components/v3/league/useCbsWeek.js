import { useEffect, useReducer } from 'react'

/* One CBS week's per-player points and lineups, shared by every caller.

   CBS keeps a played week's box score behind `league/stats?period=N`, and
   who was STARTED that week behind `league/rosters?...&period=N` — so it is
   one request per week a reader opens rather than a field on the snapshot.
   `actuals` there is stamped with ONE week, deliberately, and the matchup
   page asks about whichever week somebody clicked.

   Same shape as useSleeperWeeks, and deliberately a sibling rather than a
   branch inside it: that store asks a Sleeper route for PAIRINGS, this one
   asks a CBS route for POINTS, and the only thing they share is "one
   request per week, held for the worker's own window". Folding them
   together would put two providers and two questions behind one key.

   A week nobody has played answers ok with a null view. That is a normal
   answer about a game that has not happened, so it is held as ready —
   never as a failure with a Try again in front of it. */

const WINDOW_MS = 120000
const held = new Map()
const listeners = new Set()

const key = (leagueId, week) => String(leagueId) + ':' + Number(week)
function announce() {
  listeners.forEach((fn) => { try { fn() } catch { /* a listener's problem */ } })
}

function token() {
  const auth = typeof window !== 'undefined' ? window.JukeAuth : null
  return auth && auth.isSignedIn && auth.getToken ? auth.getToken() : Promise.resolve(null)
}

function load(leagueId, week) {
  const k = key(leagueId, week)
  const now = Date.now()
  const cur = held.get(k)
  if (cur && (cur.status === 'loading' || now - cur.at < WINDOW_MS)) return
  const L = typeof window !== 'undefined' ? window.Live : null
  if (!L || typeof L.leagueWeekActuals !== 'function') {
    /* live.js has not landed, or is a copy older than the method. Not
       held, so the load after juke:data-loaded asks again. */
    if (!cur || cur.status !== 'ready') {
      held.set(k, { status: 'error', reason: 'absent', at: 0, view: cur ? cur.view : null })
      announce()
    }
    return
  }
  held.set(k, { status: 'loading', at: now, view: cur ? cur.view : null, reason: null })
  announce()
  token()
    .catch(() => null)
    .then((t) => L.leagueWeekActuals(leagueId, week, 'cbs', t))
    .then((res) => {
      if (res && res.ok) held.set(k, { status: 'ready', at: Date.now(), view: res.week || null, reason: null })
      /* A refresh that fails keeps the answer already on screen — the rule
         the snapshot store follows: replacing a week that was right a
         minute ago with "could not read" is worse than showing it. */
      else held.set(k, { status: cur && cur.view ? 'ready' : 'error', at: Date.now(), view: cur ? cur.view : null, reason: (res && res.reason) || 'offline' })
    })
    .catch(() => held.set(k, { status: cur && cur.view ? 'ready' : 'error', at: Date.now(), view: cur ? cur.view : null, reason: 'offline' }))
    .finally(announce)
}

export function retryCbsWeek(leagueId) {
  for (const [k, v] of held) if (k.startsWith(String(leagueId) + ':') && v.status === 'error') held.delete(k)
  announce()
}

/* One week at a time, which is the whole difference from useSleeperWeeks.

   That store loads every week in the strip, because the strip draws a
   result per week and the pairings are what fill it. This one is 201 KB a
   week against a panel that shows ONE week's lineups, so loading the strip
   would be seventeen requests to draw one table. */
export function useCbsWeek(leagueId, provider, week) {
  const [, bump] = useReducer((n) => n + 1, 0)
  useEffect(() => {
    listeners.add(bump)
    return () => { listeners.delete(bump) }
  }, [])
  const on = provider === 'cbs' && leagueId && Number.isInteger(week) && week > 0
  useEffect(() => {
    if (!on) return undefined
    const run = () => load(leagueId, week)
    run()
    const onData = () => run()
    window.addEventListener('juke:data-loaded', onData)
    /* A week in progress moves. load() declines inside its own window, so
       this is a refresh every couple of minutes rather than every thirty
       seconds — the cadence the snapshot store already settled on. */
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      run()
    }, 30000)
    return () => { window.removeEventListener('juke:data-loaded', onData); clearInterval(id) }
  }, [on, leagueId, week])
  if (!on) return { status: 'off', view: null, reason: null }
  return held.get(key(leagueId, week)) || { status: 'loading', view: null, reason: null }
}
