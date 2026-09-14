import { useCallback, useEffect, useState } from 'react'

/* The readers the Record and Account pages share. Nothing here re-derives a
   grade, a rank or a projection: the locker is `historyList()` through the
   bridge (the same summary production's archive, Locker table and entry
   screen all draw), the ledger is the decision store, and where the record
   lives is `syncStatus()`. What IS worked out here is counting — how many
   entries, how many of them finished in the top half of their own room —
   which is arithmetic on stored facts rather than a second opinion about
   football. */

/* The locker, re-read whenever anything could have changed it.

   Three signals, for three reasons. `juke:data-loaded` because
   `historySummary()` resolves each stored round-one NAME against the live
   board to get a position, and the board is empty until players.js lands —
   read before that, every row is right about the name and blank about the
   position (production's DraftsScreen records exactly that failure).
   `juke:header` because a merge from the account (reconcileWithServer) and a
   draft finishing both announce on it. And `refresh()` for a delete, which
   rewrites localStorage and broadcasts nothing at all. */
export function useLocker() {
  const [state, setState] = useState({ ready: false, list: [] })
  const read = useCallback(() => {
    const e = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!e || !e.dataReady || !e.dataReady()) return
    let list = []
    try { list = e.historyList ? e.historyList() || [] : [] } catch { list = [] }
    setState({ ready: true, list })
  }, [])
  useEffect(() => {
    read()
    window.addEventListener('juke:data-loaded', read)
    window.addEventListener('juke:header', read)
    return () => {
      window.removeEventListener('juke:data-loaded', read)
      window.removeEventListener('juke:header', read)
    }
  }, [read])
  return { ...state, refresh: read }
}

/* Summary figures over the WHOLE locker, never a filtered slice — a count
   that moves when a filter is pressed is the filter's arithmetic. */
export function lockerStats(list) {
  const graded = list.filter((e) => e.grade && e.rank && e.teams)
  // Best is relative to the room: 2nd of 12 beats 2nd of 8. Ties go to the
  // most recent, which is the order historyList() already hands back.
  const best = graded.length
    ? graded.reduce((b, e) => (((e.rank - 1) / Math.max(1, e.teams - 1)) < ((b.rank - 1) / Math.max(1, b.teams - 1)) ? e : b))
    : null
  const topHalf = graded.filter((e) => e.rank <= e.teams / 2).length
  const formats = new Set(list.map((e) => e.leagueType)).size
  return { count: list.length, graded: graded.length, best, topHalf, formats, last: list[0] || null }
}

/* Counts over the whole ledger, the rule production's HistoryScreen states:
   a hit rate that moves when you press a filter is not a hit rate. An
   absent or unknown verdict is pending — `verdictFor()`'s own answer. */
export function callStats(decisions, known) {
  const good = decisions.filter((d) => d.verdict === 'good').length
  const bad = decisions.filter((d) => d.verdict === 'bad').length
  const pending = decisions.filter((d) => !d.verdict || d.verdict === 'pending' || !known[d.verdict]).length
  const graded = good + bad
  return {
    total: decisions.length,
    good,
    bad,
    pending,
    other: decisions.length - good - bad - pending,
    graded,
    // A rate over nothing is unknown, not zero.
    rate: graded ? Math.round((good / graded) * 100) : null,
  }
}

/* Where the record lives — `syncStatus()`'s own vocabulary, re-read on the
   events it announces on. The sentences are this page's; the states are the
   engine's (app.js section 11e lists all six and why each is different). */
export function useSyncStatus() {
  const read = () => {
    const e = typeof window !== 'undefined' ? window.JukeEngine : null
    try { return e && e.syncStatus ? e.syncStatus() : 'off' } catch { return 'off' }
  }
  const [s, setS] = useState(read)
  useEffect(() => {
    const on = () => setS(read())
    on()
    window.addEventListener('juke:header', on)
    window.addEventListener('juke:auth', on)
    return () => {
      window.removeEventListener('juke:header', on)
      window.removeEventListener('juke:auth', on)
    }
  }, [])
  return s
}

export const SYNC_TEXT = {
  ok: { warn: false, short: 'Synced to your account', text: 'Your drafts follow you to every browser you sign in on.' },
  off: { warn: false, short: 'On this device, syncing soon', text: 'Nothing has reached your account yet this session. It happens on its own when this tab talks to your account.' },
  unauthorized: { warn: true, short: 'Sign-in not confirmed', text: 'Juke could not confirm your sign-in, so drafts are saving to this browser only. Signing out and back in usually fixes it.' },
  'store-failed': { warn: true, short: 'Could not save to your account', text: 'Juke reached your account and could not store to it. That is our end — nothing is lost in this browser meanwhile.' },
  'id-taken': { warn: true, short: 'One draft did not sync', text: 'One draft could not be added to your account because its id is already in use. Nothing is lost here, and later drafts sync as usual.' },
  offline: { warn: true, short: 'Account unreachable', text: 'Juke cannot reach your account right now. Your drafts are safe in this browser and sync on their own once the connection is back.' },
}

/* The query string of the current hash, as URLSearchParams. V3App strips it
   before routing, so a page that wants its own ?show= or ?s= reads it here. */
export function hashQuery() {
  const q = (typeof location !== 'undefined' ? location.hash : '').split('?')[1] || ''
  return new URLSearchParams(q)
}

/* Rewrite the query on the current hash WITHOUT a hashchange. A hashchange
   runs app.js's applyRoute(), which ends in scrollTo(0, 0) — so a filter
   pressed halfway down the page would throw the reader back to the top.
   replaceState moves the address and nothing else. */
export function replaceQuery(params) {
  if (typeof location === 'undefined') return
  const base = location.hash.split('?')[0]
  const q = new URLSearchParams(params).toString()
  history.replaceState(history.state, '', `${location.pathname}${location.search}${base}${q ? `?${q}` : ''}`)
}

/* Scroll the WINDOW so `el` sits under the header, honouring the same
   offsets CSS declares (the document's scroll-padding plus the heading's
   scroll-margin). Not scrollIntoView(): that also scrolls every clipping
   ancestor on the way up, and one of the legacy page's containers is
   overflow-hidden — measured, a contents click left the whole shell shifted
   up with the dark document ground showing above the header. 'instant', not
   'auto', because the stylesheet sets scroll-behavior: smooth on the
   document and 'auto' inherits it; a deep link should not animate across a
   page that is still laying out. */
export function scrollPageTo(el, smooth) {
  const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
  const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - pad - margin)
  window.scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' })
}
