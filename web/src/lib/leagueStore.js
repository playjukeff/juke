/* The connected league: one shared answer, and the state machine over it.
 *
 * ---- Why this is not in useLeague.js any more ----
 *
 * Nothing in this file imports anything. That is the point, and it is the
 * same argument draft-engine.js already makes for itself: a thing worth
 * trusting should be runnable outside the one host that normally runs it.
 *
 * It was split out on 6 September 2026, by the bug written up below. Every
 * surface that could show that bug sits inside Clerk's <SignedIn>, and a
 * build with no publishable key renders the signed-out fallback instead --
 * confirmed rather than assumed, by a Playwright spec against the real page
 * that found no card at all. So the page could not be driven into the broken
 * state, and the machine had to be testable on its own.
 *
 * With React imported here that was still not possible: CI installs no npm
 * dependencies at all -- every other suite in tests.yml is stdlib Python or
 * dependency-free Node -- so a test that reached this through the hook would
 * have needed web/node_modules and a minutes-long install for one file.
 *
 * useLeague.js re-exports all of this, so no consumer changed.
 */

/* The connected league, and whether we know yet.

   ---- Four states, and the fourth one is a bug fix ----

   `status` is the whole reason this is a hook rather than a boolean, and
   getting it wrong is what makes a connect flow feel broken:

     "loading"    we have not asked yet. Nothing about the league is
                  known, including whether there is one.
     "none"       asked and answered: this account has connected nothing.
     "connected"  `league` is real.
     "error"      asked, and could not find out.

   Collapsing loading into none is the bug this shape exists to prevent —
   a signed-in manager with a league would see "Connect your league" for a
   beat on every load, which reads as having been disconnected.

   ---- "error" used to be spelled "loading", and it made a card vanish ----

   Reported 6 September 2026 from the deployed site, with a screenshot: the
   hero's whole right column flashes on load and then disappears, and the
   header's league chip never draws at all. Both read this hook, and both
   draw nothing while it says "loading" — correctly, because that state
   means *we do not know yet*.

   The failure paths settled back to "loading". So the state machine ran
   BACKWARDS, from a settled answer into "we have not asked", and every
   caller un-rendered:

     1. page loads, Clerk has not resolved -> settle("none") -> the card
        RENDERS, which is the flash
     2. Clerk resolves, juke:auth fires, GET /me/leagues goes out
     3. it fails -> settle("loading") -> the card UNMOUNTS
     4. nothing retried, so that was permanent

   The reasoning for not saying "none" there was right and is unchanged: a
   failure is not "no league", and offering Connect to somebody who has
   already connected would have them reconnect a league they never
   disconnected. What was wrong is that the state it chose instead is the
   one every caller renders as nothing — so the failure was invisible AND
   terminal, which is the worst pair available.

   **A state that means "we could not find out" must be renderable.** This
   project already has that rule where it says a page claiming a backup it
   does not have is worse than one claiming nothing; the Locker's storage
   strip is the same fix on a different surface. ConnectCard draws an
   honest card with a Retry on "error" now, and the header chip still draws
   nothing, which is right for a chip that would otherwise name a league we
   cannot verify.

   Every caller branches on all four or draws nothing. The other seven
   surfaces needed no change, because they ask `status === 'connected'` —
   a positive test, which treats a new negative state correctly for free.

   ---- It reads the account, not localStorage ----

   A connection is per-account by design: the handoff's rule is that
   connecting always routes through account creation first, and the point
   of that is a league that follows somebody to their phone. So this asks
   the worker, with a Clerk token, and answers "none" while signed out
   rather than pretending.

   `window.JukeAuth` rather than Clerk's own hooks, for the reason
   AuthBridge exists: `getToken` is reassigned on every render there, so
   reading it at call time is what keeps this from holding a stale closure
   across a token refresh.

   ---- One answer, shared, and it is what makes connecting VISIBLE ----

   This used to be per-component state: every caller fetched its own copy
   and kept it to itself. Two things followed, and both were reported as
   one bug — "even after it said it connected, the Connect messaging is
   still there throughout the website".

   **Nothing could tell anybody.** ConnectLeagueModal wrote the league to
   the worker and said so in its own dialog, and every other surface on the
   page went on asking for a league it already had. The header's chip, the
   homepage's "your next move" card, the Rooms lobby's unlock bar and the
   You screen's empty section were each holding an answer fetched before
   the connect happened, with no way to hear that it had. Only a reload
   fixed it, which is exactly what a reader will not do to check whether
   the thing they just did worked.

   **And every caller was its own request.** Four surfaces on one screen
   meant four `GET /me/leagues` per page load, for one fact about one
   account.

   So the answer lives here, once, and components subscribe to it.
   `noteLeagueConnected()` is what the connect flow calls the instant the
   worker confirms — the same shape as `juke:header`, one level up: the
   thing that changed the state is what announces it, rather than every
   reader polling for it. */

/* `leagues` is every league this account has connected, active first, and
   `league` is its head.

   Both, rather than one derived at each call site, because they answer
   different questions and almost every caller wants only the first: the
   header draws the active league, My League reads the active league's
   snapshot, the You screen lists all of them. Keeping `league` on the
   object means the seven surfaces that read it did not change when this
   grew a list underneath them.

   The order is the server's. listLeagues() returns most-recently-selected
   first, so the head IS the active league by construction — there is no
   `activeId` here to keep in step with the array, which would be the same
   fact written down twice and would drift the first time a switch failed
   halfway. */
const state = { status: 'loading', league: null, leagues: [], reason: null }
const subscribers = new Set()

/* Cheap identity for "is this the same list, in the same order". Used only
   to decide whether a re-render is worth announcing: refreshLeagues() runs
   on three window events, one of which (`juke:auth`) fires on every Clerk
   render, so an unchanged answer must cost nothing. */
function listKey(leagues) {
  return (leagues || []).map((l) => l.provider + ':' + l.leagueId).join('|')
}

/* One request at a time. Four components mounting together ask four times
   otherwise, and `refresh()` is also bound to three window events that can
   fire in the same tick. */
let inFlight = null

/* A failed read retries itself, bounded, and then stops.

   The "error" state above is renderable, which is most of the fix — but a
   reader should not have to press anything for a blip to heal. Three tries
   over ~23s covers the case this was reported for (a token that was not
   ready on the first ask), and stopping after them is what keeps a genuinely
   unreachable worker from being polled forever by a tab nobody is watching.

   `visibilitychange` re-arms it, which is the one signal worth trusting for
   "now is the moment": coming back to a tab is the same evidence
   reconcileWithServer() and live.js already act on, and it costs nothing
   while the tab is hidden. */
const RETRY_MS = [2000, 6000, 15000]
let retries = 0
let retryTimer = null

function scheduleRetry() {
  if (retryTimer || retries >= RETRY_MS.length) return
  const wait = RETRY_MS[retries]
  retries += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    refreshLeagues()
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

function settle(status, leagues, reason) {
  const list = leagues || []
  const head = list[0] || null
  // A no-op write still re-renders every subscriber if it announces, and
  // `juke:auth` fires on every Clerk render — which is often. The list is
  // compared by content rather than by reference because every refresh
  // builds a fresh array out of a fresh response, so an identity check
  // here would announce on every poll.
  if (
    state.status === status &&
    state.reason === (reason || null) &&
    listKey(state.leagues) === listKey(list)
  ) return
  state.status = status
  state.leagues = list
  state.league = head
  state.reason = reason || null
  announce()
}

function authToken() {
  const auth = typeof window !== 'undefined' ? window.JukeAuth : null
  return auth && auth.isSignedIn && auth.getToken ? auth.getToken() : Promise.resolve(null)
}

/* Ask the worker. Answers immediately and settles later; safe to call as
   often as anything likes. */
export function refreshLeagues() {
  if (typeof window === 'undefined') return
  if (inFlight) return

  const auth = window.JukeAuth
  if (!auth || !auth.isSignedIn) {
    settle('none', [], 'signed-out')
    return
  }
  /* live.js has not landed yet. Stay in "loading" so no screen claims
     there is no league on the strength of a file that has not arrived —
     and note that this is the one path that used to be terminal: nothing
     re-ran when the script finally arrived, so a cold load could sit in
     "loading" for ever and the header would draw no chip at all. The
     `juke:data-loaded` listener below is what closes it. */
  if (!window.Live || !window.Live.listLeagues) return

  inFlight = Promise.resolve(authToken())
    .then((token) => window.Live.listLeagues(token))
    .then((res) => {
      if (!res.ok) {
        /* A failure is not "no league". Saying "none" here would offer
           Connect to somebody who has already connected, and pressing it
           would reconnect a league they never disconnected — so an
           unreachable worker keeps the previous answer and reports why,
           and the caller decides whether that is worth a message.

           "error" rather than "loading", which is what this said until 6
           September 2026 and is the whole bug written up at the top of this
           file: "loading" is the one state every caller draws as nothing,
           so a failed read used to un-render the card that was already on
           screen and never put it back. */
        settle(state.leagues.length ? 'connected' : 'error', state.leagues, res.reason)
        scheduleRetry()
        return
      }
      const list = Array.isArray(res.leagues) ? res.leagues : []
      clearRetries()
      settle(list.length ? 'connected' : 'none', list, null)
    })
    .catch(() => {
      settle(state.leagues.length ? 'connected' : 'error', state.leagues, 'offline')
      scheduleRetry()
    })
    .finally(() => { inFlight = null })
}

/* A deliberate retry: a person pressed something, or the tab came back.

   Separate from refreshLeagues() because the automatic retry calls that one
   and must NOT reset its own budget — a backoff that clears itself on every
   attempt is an unbounded poll wearing a backoff's clothes. This is the only
   entry point that hands out a fresh three. */
export function retryLeagues() {
  clearRetries()
  refreshLeagues()
}

/* What the connect flow calls the moment the worker confirms a league.

   Not a `refresh()`: the worker has just told us what the league is, so
   asking it again is a round trip to learn what we are already holding —
   and on a slow connection it is a round trip during which every surface
   still says "Connect a league" after the dialog has said "Connected". */
export function noteLeagueConnected(league) {
  if (!league) { refreshLeagues(); return }
  /* At the head, because that is where the worker has just put it:
     POST /me/leagues selects what it connects. Prepending rather than
     appending is not cosmetic — the head is what every screen draws, so an
     appended league would be stored, listed, and invisible until a reload
     reordered it.

     Filtered first so reconnecting a league already in the list moves it
     and refreshes its label rather than listing it twice. */
  const rest = state.leagues.filter(
    (l) => !(l.provider === league.provider && l.leagueId === league.leagueId)
  )
  settle('connected', [league].concat(rest), null)
}

/* Switch the active league.

   ---- Optimistic, and it settles back on failure ----

   The reorder is applied before the request goes out, because a menu that
   waits a round trip to close reads as a menu that did not take the press.
   What it must not do is keep an order the account will not come back to:
   a switch that failed and stayed on screen is the "claims a backup it
   does not have" failure with a league name on it, and the reader finds
   out on their next page load.

   So a failure puts the previous order back and reports why. The caller
   gets the reason and decides whether it is worth a message; every
   subscriber gets the truth either way.

   ---- The success path takes the server's list, not the local one ----

   PATCH answers with the whole list because the server owns the order.
   Re-using the optimistic array here instead would be a second opinion
   about which league is active, which is the thing the head-is-active rule
   exists to prevent. */
export function selectLeague(league) {
  if (!league) return Promise.resolve({ ok: false, reason: 'bad-request' })

  const previous = state.leagues
  const already = previous[0]
  if (already && already.provider === league.provider && already.leagueId === league.leagueId) {
    return Promise.resolve({ ok: true, reason: null })
  }

  const rest = previous.filter(
    (l) => !(l.provider === league.provider && l.leagueId === league.leagueId)
  )
  settle('connected', [league].concat(rest), null)

  const live = typeof window !== 'undefined' ? window.Live : null
  if (!live || !live.selectLeague) {
    settle('connected', previous, 'offline')
    return Promise.resolve({ ok: false, reason: 'offline' })
  }

  return Promise.resolve(authToken())
    .then((token) => live.selectLeague(token, league.leagueId, league.provider))
    .then((res) => {
      if (!res.ok) {
        settle('connected', previous, res.reason)
        return { ok: false, reason: res.reason }
      }
      const list = Array.isArray(res.leagues) && res.leagues.length ? res.leagues : [league].concat(rest)
      settle('connected', list, null)
      return { ok: true, reason: null }
    })
    .catch(() => {
      settle('connected', previous, 'offline')
      return { ok: false, reason: 'offline' }
    })
}

/* Disconnect one.

   ---- Why this arrived with the switcher and not before ----

   `Live.disconnectLeague` has existed since connect shipped and nothing
   called it, which was survivable while the app drew one league: a second
   connect replaced the first on screen, so there was never a league you
   could see and not get rid of. The switcher ends that — leagues now
   accumulate and all of them are visible — so shipping the accumulation
   without the removal would leave somebody who connected the wrong league
   permanently looking at it.

   Not optimistic, unlike select(). A switch is reversible by switching
   back and costs nothing if it fails; a disconnect that appeared to work
   and did not would have somebody believing a league was gone from their
   account. So the row goes when the worker says it has gone.

   The list comes from a re-read rather than a local filter, because the
   server decides what is active next: removing the head promotes whatever
   was selected before it, and that is not a fact this side can derive. */
export function removeLeague(league) {
  if (!league) return Promise.resolve({ ok: false, reason: 'bad-request' })

  const live = typeof window !== 'undefined' ? window.Live : null
  if (!live || !live.disconnectLeague) {
    return Promise.resolve({ ok: false, reason: 'offline' })
  }

  return Promise.resolve(authToken())
    .then((token) => live.disconnectLeague(token, league.leagueId, league.provider))
    .then((res) => {
      if (!res.ok) return { ok: false, reason: res.reason }
      /* refreshLeagues() bails while a read is in flight, so the state is
         settled from a filtered copy first and then re-read. Without the
         first half a disconnect during an in-flight refresh would appear
         to do nothing at all. */
      const left = state.leagues.filter(
        (l) => !(l.provider === league.provider && l.leagueId === league.leagueId)
      )
      // "none" when that was the last one, or the screen keeps claiming a
      // connection it no longer has — status is what every caller branches
      // on, and an empty list under 'connected' is a state no reader of
      // this hook is written for.
      settle(left.length ? 'connected' : 'none', left, null)
      refreshLeagues()
      return { ok: true, reason: null }
    })
    .catch(() => ({ ok: false, reason: 'offline' }))
}

/* The current answer, without a React subscription.

   `useLeague()` is a subscription over this module's state machine, and
   that machine is where the vanishing-card bug lived. Every surface that
   could show it is inside Clerk's <SignedIn>, and a keyless build renders
   the signed-out fallback instead — which CLAUDE.md already records as the
   widest gap in this area's coverage — so driving the machine through the
   page is not available and a reader that does not need React is what
   makes it testable at all.

   Same argument draft-engine.js makes for having no DOM and no globals: a
   thing worth trusting should be runnable outside the one host that
   normally runs it. A copy, so nobody can write through it. */
export function leagueState() {
  return { status: state.status, league: state.league, leagues: state.leagues, reason: state.reason }
}

/* Subscribe to changes. Returns its own unsubscribe, so a caller never has
   to hold the set this module owns — which is what lets `subscribers` stay
   private and kept the React split honest rather than cosmetic. */
export function subscribeLeagues(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}
