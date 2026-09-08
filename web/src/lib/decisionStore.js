/* The decision ledger: one shared answer, and the state machine over it.
 *
 * "Juke said -> you did -> reality -> verdict". A room writes one of these
 * when it recommends something; My League's week strip and the History
 * screen read them back.
 *
 * ---- Why this imports nothing ----
 *
 * The same argument leagueStore.js makes for itself, and it is not a style
 * preference: CI installs no npm dependencies at all -- every step in
 * tests.yml is stdlib Python or dependency-free Node -- so a machine that
 * could only be reached through a React hook could only be tested by
 * installing web/node_modules for one file. And the surfaces that show
 * this one all sit inside Clerk's <SignedIn>, which a keyless build never
 * renders, so driving it through the page is not available either.
 *
 * useDecisions.js is the React subscription over it and re-exports
 * everything, so no consumer imports from here directly.
 */

/* ---- Four states, the same four and for the same reasons ----
 *
 *   "loading"  we have not asked yet. Nothing is known, including whether
 *              there are any.
 *   "none"     asked and answered: this account has recorded nothing.
 *   "ready"    `decisions` is real and non-empty.
 *   "error"    asked, and could not find out.
 *
 * "error" is a separate state rather than an empty list for the reason
 * leagueStore's own header records at length: a failure that renders as
 * "nothing here" is a screen quietly claiming a fact it does not have.
 * A History screen drawing "no decisions yet" over an unreachable worker
 * has told somebody their record is empty when it is not -- worse than
 * saying nothing, and worse here than it was there, because a ledger is
 * the one part of this product whose whole value is being a record you
 * can trust.
 */
const state = { status: 'loading', decisions: [], reason: null }
const subscribers = new Set()

/* Identity for "is this the same ledger". refreshDecisions() is bound to
   window events that fire on every Clerk render, so an unchanged answer
   must cost no re-render.

   ---- It compares CONTENT, and an id list is not enough here ----

   leagueStore's equivalent keys on `provider:leagueId`, which is right
   there: a league row is a mostly-static label, and what changes is which
   one is at the head.

   A decision row is the opposite. It is written once and then edited in
   place, twice — `did` when the manager acts on a recommendation, and
   `verdict`/`gradedAt` when the week is graded — and its id never moves.
   So a key built from ids swallows exactly the two updates this ledger
   exists to show. Caught by test_decision_state.mjs: re-recording d9 with
   a `did` left the store holding the version without one, because settle()
   read the list as unchanged and returned early.

   Keying on `id:verdict` fixes only the grading half and looks like it
   fixes both, which is the worse version of the same bug. */
function listKey(decisions) {
  return JSON.stringify(decisions || [])
}

let inFlight = null

/* Bounded retry, then stop -- leagueStore's shape and its reasoning: a
   blip should heal without anybody pressing anything, and an unreachable
   worker must not be polled forever by a tab nobody is watching. */
const RETRY_MS = [2000, 6000, 15000]
let retries = 0
let retryTimer = null

function scheduleRetry() {
  if (retryTimer || retries >= RETRY_MS.length) return
  const wait = RETRY_MS[retries]
  retries += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    refreshDecisions()
  }, wait)
}

function clearRetries() {
  retries = 0
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

function announce() {
  subscribers.forEach((fn) => fn())
}

function settle(status, decisions, reason) {
  const list = decisions || []
  if (
    state.status === status &&
    state.reason === (reason || null) &&
    listKey(state.decisions) === listKey(list)
  ) return
  state.status = status
  state.decisions = list
  state.reason = reason || null
  announce()
}

function authToken() {
  const auth = typeof window !== 'undefined' ? window.JukeAuth : null
  return auth && auth.isSignedIn && auth.getToken ? auth.getToken() : Promise.resolve(null)
}

/* Ask the worker for every decision this account has, newest first.
 *
 * Unscoped on purpose, where the route itself takes an optional `?league=`.
 * Two surfaces read this and they want different slices -- My League wants
 * the active league's, History wants all of them -- so one request holds
 * both and decisionsFor() below does the narrowing. Scoping the fetch
 * instead would mean a request per league per screen, and switching the
 * active league would refetch a set already in memory.
 */
export function refreshDecisions() {
  if (typeof window === 'undefined') return
  if (inFlight) return

  const auth = window.JukeAuth
  if (!auth || !auth.isSignedIn) {
    settle('none', [], 'signed-out')
    return
  }
  // live.js has not landed yet. Stay in "loading" rather than claiming an
  // empty ledger on the strength of a script that has not arrived -- the
  // juke:data-loaded listener in the hook is what re-runs this.
  if (!window.Live || !window.Live.loadDecisions) return

  inFlight = Promise.resolve(authToken())
    .then((token) => window.Live.loadDecisions(token))
    .then((res) => {
      if (!res.ok) {
        // Keep what we already have rather than blanking a ledger that is
        // on screen, and say why -- the same call leagueStore makes when a
        // refresh fails with leagues already in hand.
        settle(state.decisions.length ? 'ready' : 'error', state.decisions, res.reason)
        scheduleRetry()
        return
      }
      const list = Array.isArray(res.decisions) ? res.decisions : []
      clearRetries()
      settle(list.length ? 'ready' : 'none', list, null)
    })
    .catch(() => {
      settle(state.decisions.length ? 'ready' : 'error', state.decisions, 'offline')
      scheduleRetry()
    })
    .finally(() => { inFlight = null })
}

/* A deliberate retry: somebody pressed something, or the tab came back.
   Separate from refreshDecisions() because the automatic retry calls that
   one and must not refill its own budget -- a backoff that resets on every
   attempt is an unbounded poll wearing a backoff's clothes. */
export function retryDecisions() {
  clearRetries()
  refreshDecisions()
}

/* Record a decision, or update one already recorded.
 *
 * ---- Deliberately NOT optimistic ----
 *
 * selectLeague() is optimistic because a menu that waits a round trip
 * reads as a menu that did not take the press, and because a switch that
 * fails is undone by switching back. Neither applies here. A decision is a
 * deliberate act with a button that can say "saving", and a row that
 * appeared in somebody's ledger and then vanished is the "claims a backup
 * it does not have" failure aimed at the one screen whose entire value is
 * being a record you can trust. So the row lands when the worker says it
 * landed, and the caller gets the reason when it does not.
 *
 * The resolved shape is { ok, reason }, which the caller renders. Two
 * reasons matter to a room and neither is generic:
 *
 *   "not-connected"  no live connection to that league. Free cannot
 *                    connect one at all, so this is the tier rule arriving
 *                    at the moment somebody tries to use the product.
 *   "refused"        the id belongs to another account. Not retryable.
 */
export function recordDecision(decision) {
  if (!decision || !decision.id) {
    return Promise.resolve({ ok: false, reason: 'bad-request' })
  }

  const live = typeof window !== 'undefined' ? window.Live : null
  if (!live || !live.saveDecision) {
    return Promise.resolve({ ok: false, reason: 'offline' })
  }

  return Promise.resolve(authToken())
    .then((token) => live.saveDecision(token, decision))
    .then((res) => {
      if (!res.ok) return { ok: false, reason: res.reason }
      /* Merge locally rather than re-reading. The worker has just been
         told what this row is, so asking for it back is a round trip to
         learn what we are already holding -- noteLeagueConnected()'s own
         argument, and the same consequence if it is skipped: the room says
         "recorded" while every surface reading this store still does not
         show it.

         By id, and at the head, because the list is newest-first and this
         is the newest thing that has happened. An update to an existing
         decision (the manager acted on a recommendation made earlier)
         replaces it rather than appending a second row nothing joins. */
      const rest = state.decisions.filter((d) => d.id !== decision.id)
      settle('ready', [decision].concat(rest), null)
      return { ok: true, reason: null }
    })
    .catch(() => ({ ok: false, reason: 'offline' }))
}

/* Remove one. Not optimistic, for recordDecision()'s reason read the other
   way round: somebody believing a record is gone when it is not is the
   worse half of this particular mistake. */
export function forgetDecision(id) {
  if (!id) return Promise.resolve({ ok: false, reason: 'bad-request' })

  const live = typeof window !== 'undefined' ? window.Live : null
  if (!live || !live.deleteDecision) {
    return Promise.resolve({ ok: false, reason: 'offline' })
  }

  return Promise.resolve(authToken())
    .then((token) => live.deleteDecision(token, id))
    .then((res) => {
      if (!res.ok) return { ok: false, reason: res.reason }
      const left = state.decisions.filter((d) => d.id !== id)
      settle(left.length ? 'ready' : 'none', left, null)
      return { ok: true, reason: null }
    })
    .catch(() => ({ ok: false, reason: 'offline' }))
}

/* One league's decisions, out of the one list.
 *
 * A plain filter rather than a second fetch, which is the whole reason the
 * read above is unscoped. It takes the league rather than reading the
 * active one itself, because this module deliberately knows nothing about
 * leagueStore -- two stores that import each other are one store with a
 * seam in it, and the seam is where a stale active league would live. */
export function decisionsFor(leagueId, decisions) {
  const list = decisions || state.decisions
  if (!leagueId) return list
  return list.filter((d) => d.leagueId === leagueId)
}

/* Everything one week of one league decided, for My League's week strip.
 *
 * `week` is compared as a number because that is what the column is: a
 * decision written with a string week would never match a strip drawn from
 * the snapshot's own numeric week, and it would fail by drawing an empty
 * week rather than by throwing. */
export function decisionsForWeek(leagueId, week, decisions) {
  const n = Number(week)
  return decisionsFor(leagueId, decisions).filter((d) => Number(d.week) === n)
}

/* The tick a week carries on My League's strip: 'bad', 'good', or none.
 *
 * ---- A week is only marked once something in it has been GRADED ----
 *
 * The prototype marks any week that has rows: bad if one of them is a bad
 * call, good otherwise. That is right for a mock-up whose sample data is
 * graded by construction and wrong for real decisions, which are recorded
 * days before they can be judged -- a week holding three pending calls
 * would carry a green tick claiming an outcome nobody knows yet.
 *
 * So an ungraded week is unmarked, which is the same "absent, not empty"
 * call MyLeagueScreen already makes about the sections it does not draw.
 * Once anything in the week has a verdict, one bad call marks it bad:
 * a week is a warning if it holds a mistake, whatever else went right.
 */
export function weekMark(leagueId, week, decisions) {
  const rows = decisionsForWeek(leagueId, week, decisions)
  let graded = false
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i].verdict
    if (v === 'bad') return 'bad'
    if (v && v !== 'pending') graded = true
  }
  return graded ? 'good' : null
}

/* The current answer, without a React subscription -- what makes this
   testable outside a browser at all. A copy, so nobody can write through
   it. */
export function decisionState() {
  return { status: state.status, decisions: state.decisions, reason: state.reason }
}

export function subscribeDecisions(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

/* Test-only: put the machine back to its opening state.
 *
 * Exported rather than reached by re-importing the module, because a
 * module is evaluated once per process -- so a suite of cases against one
 * store would otherwise carry every earlier case's rows into the next, and
 * a broken store would look consistent while doing it. */
export function __resetDecisions() {
  clearRetries()
  inFlight = null
  state.status = 'loading'
  state.decisions = []
  state.reason = null
}
