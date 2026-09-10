/* One league's live state — rosters, records, points, schedule — held once
 * for every surface that reads it.
 *
 * ---- What this replaces, and the number that made it necessary ----
 *
 * `useLeagueSnapshot()` held its answer in component state, so every caller
 * fetched its own copy. That was fine while exactly one screen wanted
 * rosters, and it is the reason its own comment gave for staying separate
 * from `leagueStore`: the league's IDENTITY is wanted by the header on
 * every screen and its ROSTERS by one, and folding them together "would put
 * four upstream calls behind every page load to draw a chip that needs a
 * name".
 *
 * **That sentence is about four calls, not about one.** The rooms grid
 * (screen 16) wants a per-room stake, which is a fact about rosters, and
 * wiring it to a per-component fetch would have made the objection true —
 * the grid draws on `#/rooms` AND on the homepage, so a reader landing on
 * either would pay for a snapshot the room page then paid for again.
 *
 * Shared, the answer is one request per league per two minutes however many
 * components ask. So the constraint that kept the stake off the lobby is
 * the thing this file removes, rather than a rule being broken to fit it.
 *
 * ---- The same split, for the same reason ----
 *
 * This imports nothing but `singleFlight.js`, which is the property
 * `leagueStore.js` documents at length: `tests.yml` installs no npm
 * dependencies anywhere, so anything reachable only through a React hook is
 * untestable in CI. `useLeague.js` is the subscription and re-exports this,
 * so no consumer's import changed.
 */

import { singleFlight } from './singleFlight.js'

/* Two minutes, and it is the worker's own number rather than a guess.
 *
 * `SNAPSHOT_TTL` is 120 in both `worker/espn.js` and `worker/sleeper.js`,
 * and the route sends it as `cache-control: max-age=120` — so a second ask
 * inside that window is answered off the edge cache with bytes identical to
 * the ones already in hand. Asking more often than the answer can change is
 * a round trip spent to learn nothing.
 *
 * `live.js`'s own comment says the same thing from the other side ("cached
 * at the edge for a couple of minutes, so calling this on every navigation
 * is cheap"), which is why this is a freshness window rather than a
 * once-per-session cache: a lineup really does change during a Sunday, and
 * a room drawing a stale one is worse than a room that waited 200ms.
 *
 * Move the two together if either changes. */
export const SNAPSHOT_TTL_MS = 120000

/* Which league the held answer is about.
 *
 * A snapshot is only ever meaningful next to the id it was fetched for —
 * the same numeric league id is a different league on a different platform,
 * which is why the hook this replaces carried `provider` in its dependency
 * list. Holding the key beside the state is what lets a caller ask "is this
 * answer MINE" rather than trusting that nothing has switched underneath
 * it. */
export function snapshotKey(leagueId, provider) {
  if (!leagueId) return null
  return (provider || 'sleeper') + ':' + String(leagueId)
}

/* Four states, matching `leagueStore`'s exactly, and for its reason:
 *
 *   "loading"  we have not asked yet, or we are asking about a league this
 *              answer is not about.
 *   "ready"    `snapshot` is real.
 *   "error"    asked, and could not find out. `reason` says which.
 *   "none"     there is no league to ask about.
 *
 * `error` is deliberately not `loading`, which is the bug that file's whole
 * header is about: "loading" is the state every caller draws as nothing, so
 * settling into it on failure makes a screen that was already up disappear
 * with no way back. Every consumer of this branches on all four. */
const state = { key: null, status: 'loading', snapshot: null, reason: null }
let fetchedAt = 0
const subscribers = new Set()

/* One request at a time, with a deadline — three components mounting
   together ask three times otherwise, and `fetch()` never times out on its
   own. See singleFlight.js for what a latch without a deadline cost. */
const flight = singleFlight()

function announce() {
  subscribers.forEach((fn) => fn())
}

function settle(key, status, snapshot, reason) {
  if (
    state.key === key &&
    state.status === status &&
    state.reason === (reason || null) &&
    state.snapshot === (snapshot || null)
  ) return
  state.key = key
  state.status = status
  state.snapshot = snapshot || null
  state.reason = reason || null
  announce()
}

function now() {
  return Date.now()
}

/* Ask for a league's snapshot. Answers immediately and settles later, and
   is safe to call as often as anything likes — which is the whole point,
   because it is called from an effect in every component that draws off a
   roster.

   Four ways this declines to make a request, and each is a real case:

   - no league id at all. The caller is a room that is not live, or a
     screen with nothing connected;
   - `live.js` has not landed. **This used to be terminal** and is the one
     latent bug carried over from the hook: it returned early and nothing
     re-ran when the deferred script finally arrived, so a cold load
     straight onto a room could sit in "loading" for ever. The
     `juke:data-loaded` listener in useLeague.js is what closes it, and it
     is the identical fix leagueStore already made for the identical shape;
   - a fresh answer for this same league. The worker caches for two
     minutes; asking inside that returns the bytes we are holding;
   - a request already in flight. */
export function requestSnapshot(leagueId, provider) {
  if (typeof window === 'undefined') return
  const key = snapshotKey(leagueId, provider)

  if (!key) {
    settle(null, 'none', null, null)
    return
  }

  /* A different league. Everything held is about another roster, so it is
     dropped rather than shown while the new one loads — the alternative is
     one render of somebody else's lineup under the new league's name,
     which is the "which request an answer belongs to is checked when it
     LANDS" rule failing before the request is even made. */
  if (key !== state.key) {
    fetchedAt = 0
    settle(key, 'loading', null, null)
  } else if (state.status === 'ready' && now() - fetchedAt < SNAPSHOT_TTL_MS) {
    return
  } else if (state.status === 'error' && now() - fetchedAt < SNAPSHOT_TTL_MS) {
    /* A failure is bounded the same way a success is, rather than retried
       on every mount. An unreachable worker would otherwise be asked once
       per navigation for as long as somebody kept clicking, and the answer
       cannot have changed any faster than the cache in front of it. */
    return
  }

  if (!window.Live || !window.Live.leagueSnapshot) return
  if (flight.busy()) return

  flight.run(
    (isCurrent) =>
      window.Live.leagueSnapshot(leagueId, provider)
        .then((res) => {
          /* Two ways this answer can be stale and they are different
             questions. `isCurrent()` is "has a newer ATTEMPT started",
             which the deadline below newly makes possible; the key check
             is "has the reader switched LEAGUES while this was in the
             air", which would otherwise write one league's rosters under
             another's name. */
          if (!isCurrent() || state.key !== key) return
          fetchedAt = now()
          if (!res.ok) {
            settle(key, 'error', null, res.reason || 'offline')
            return
          }
          settle(key, res.snapshot ? 'ready' : 'error', res.snapshot, res.snapshot ? null : 'bad-response')
        })
        .catch(() => {
          if (!isCurrent() || state.key !== key) return
          fetchedAt = now()
          settle(key, 'error', null, 'offline')
        }),
    () => {
      if (state.key !== key) return
      fetchedAt = now()
      settle(key, 'error', null, 'timeout')
    }
  )
}

/* A deliberate retry: a person pressed something, or a caller knows the
   answer has changed. Clears the freshness window rather than calling
   `requestSnapshot` and hoping — which would return at the TTL guard and do
   nothing, the same shape as a backoff that resets its own budget. */
export function retrySnapshot(leagueId, provider) {
  fetchedAt = 0
  requestSnapshot(leagueId, provider)
}

/* A copy, so nobody can write through it — `leagueState()`'s reason. */
export function snapshotState() {
  return { key: state.key, status: state.status, snapshot: state.snapshot, reason: state.reason }
}

export function subscribeSnapshot(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

/* Test-only, for `singleFlight.__reset()`'s stated reason: a module is
   evaluated once per process, so without this one case's held answer would
   silently decide the next case's result. */
export function __resetSnapshots() {
  state.key = null
  state.status = 'loading'
  state.snapshot = null
  state.reason = null
  fetchedAt = 0
  subscribers.clear()
  flight.__reset()
}
