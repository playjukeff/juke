import { useEffect, useReducer } from 'react'

/* Sleeper's weeks, one request each, shared by every caller on the page.

   Sleeper publishes a league's matchups a week at a time (worker/sleeper.js
   leagueMatchups), so a week strip that shows every result and every next
   opponent costs a request per week. They are held here, keyed on the
   league and the week, for the snapshot store's own window —
   SNAPSHOT_TTL_MS, the worker's max-age — so moving between weeks, or
   leaving the page and coming back, does not ask again inside it, and two
   components asking about the same week share one answer.

   A week that failed is held as a failure for the same window, so a worker
   that predates the route (or an unreachable one) is asked once rather
   than on every render; `retrySleeperWeeks()` clears them. The page reads
   `reason` to say what it could not read, and never draws a failure as an
   empty week. */

const WINDOW_MS = 120000
const held = new Map()
const listeners = new Set()

function key(leagueId, week) {
  return String(leagueId) + ':' + Number(week)
}
function announce() {
  listeners.forEach((fn) => { try { fn() } catch { /* a listener's problem */ } })
}

function load(leagueId, week) {
  const k = key(leagueId, week)
  const now = Date.now()
  const cur = held.get(k)
  if (cur && (cur.status === 'loading' || now - cur.at < WINDOW_MS)) return
  const L = typeof window !== 'undefined' ? window.Live : null
  if (!L || typeof L.leagueMatchups !== 'function') {
    // live.js has not landed, or is a copy older than the method. Not held,
    // so the load after juke:data-loaded asks again.
    if (!cur || cur.status !== 'ready') { held.set(k, { status: 'error', reason: 'absent', at: 0, view: cur ? cur.view : null }); announce() }
    return
  }
  held.set(k, { status: 'loading', at: now, view: cur ? cur.view : null, reason: null })
  announce()
  Promise.resolve(L.leagueMatchups(leagueId, week, 'sleeper'))
    .then((res) => {
      if (res && res.ok && res.week) held.set(k, { status: 'ready', at: Date.now(), view: res.week, reason: null })
      /* A refresh that fails keeps the answer already on screen, the rule
         the snapshot store follows: replacing a week that was right a
         minute ago with "could not read" is worse than showing it. */
      else held.set(k, { status: cur && cur.view ? 'ready' : 'error', at: Date.now(), view: cur ? cur.view : null, reason: (res && res.reason) || 'offline' })
    })
    .catch(() => held.set(k, { status: cur && cur.view ? 'ready' : 'error', at: Date.now(), view: cur ? cur.view : null, reason: 'offline' }))
    .finally(announce)
}

export function retrySleeperWeeks(leagueId) {
  for (const [k, v] of held) if (k.startsWith(String(leagueId) + ':') && v.status === 'error') held.delete(k)
  announce()
}

export function useSleeperWeeks(leagueId, weeks, first) {
  const [, bump] = useReducer((n) => n + 1, 0)
  useEffect(() => {
    listeners.add(bump)
    return () => { listeners.delete(bump) }
  }, [])
  const list = (weeks || []).filter((w) => Number.isInteger(w) && w > 0)
  const sig = list.join(',')
  useEffect(() => {
    if (!leagueId || !list.length) return undefined
    // The week being looked at goes first; the strip's weeks follow.
    const order = first && list.includes(first) ? [first, ...list.filter((w) => w !== first)] : list
    const run = () => order.forEach((w) => load(leagueId, w))
    run()
    const onData = () => run()
    window.addEventListener('juke:data-loaded', onData)
    /* The week being looked at is re-asked while the tab is in front: a
       live week's points move. load() declines inside the window, so this
       is a refresh every couple of minutes, not every half-minute. */
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (first) load(leagueId, first)
    }, 30000)
    return () => { window.removeEventListener('juke:data-loaded', onData); clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, sig, first])
  const out = {}
  for (const w of list) out[w] = held.get(key(leagueId, w)) || { status: 'loading', view: null, reason: null }
  return out
}
