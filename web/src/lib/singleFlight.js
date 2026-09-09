/* One request at a time, with a deadline on the latch.
 *
 * ---- The latch was permanent, and nothing could clear it ----
 *
 * leagueStore, tierStore and decisionStore each carried the same eight
 * lines: a module-level `inFlight`, an early `if (inFlight) return`, and a
 * `.finally(() => { inFlight = null })` to let go. That is correct for
 * every way a request can END and has no answer at all for a request that
 * does not.
 *
 * `fetch()` has no timeout in any browser. A connection a proxy accepts and
 * never answers hangs for as long as the tab is open, and Clerk's own
 * `getToken()` is awaited in front of it. So one wedged attempt held the
 * latch for the life of the session, and from that moment every retry, every
 * `juke:auth`, every `juke:data-loaded` and every tab focus hit
 * `if (inFlight) return` and did nothing. The store stayed on whatever it
 * had last settled — for leagueStore that is "none" from the pre-Clerk
 * pass, which every screen draws as "you have no league".
 *
 * Suspected during the 8 September 2026 `/me/leagues` outage and found
 * INNOCENT of it: `wrangler tail` showed six requests in one sitting, so the
 * latch was clearing exactly as written and the fault was a worker crash.
 * It is fixed here on its own merits rather than on that theory — which is
 * the same call this project records about `DraftEngine.jitter()`, reached
 * from the other side: measure first, then fix what the measurement leaves
 * standing.
 *
 * ---- Why a shared module, in files whose headers say they import nothing ----
 *
 * leagueStore.js's header states that it imports nothing, and the REASON it
 * gives is testability: tests.yml installs no npm dependencies, so anything
 * reached through a React hook would need a full web/node_modules install
 * for one file. A relative import of another dependency-free module keeps
 * that property exactly — `scripts/test_league_state.mjs` still loads the
 * store by path in bare Node, and now loads this with it.
 *
 * What the rule is really against is a FACT written down twice. A
 * sequence-guarded latch with a deadline is subtle enough that three copies
 * would drift, and the deadline itself is one number that should not become
 * three.
 *
 * ---- Two guards, not one, because releasing early creates the second ----
 *
 * Releasing the latch on a deadline means two attempts can now be in flight
 * at once, which was impossible before. So a late answer must not overwrite
 * a fresher one — the same rule the player sheet already follows for news
 * ("which player an answer belongs to is checked when it lands, not when it
 * was asked for"). `work` is handed `isCurrent()`, which goes false the
 * moment a newer attempt starts, and every caller checks it before it
 * settles anything.
 *
 * A late answer that is still the newest one IS applied, deliberately. The
 * deadline exists to stop the latch wedging, not to throw away a slow
 * success — so firing it costs a briefly-shown error state and never a lost
 * answer.
 */

/* Fifteen seconds, and it is derived twice over.
 *
 * Measured against the deployed worker on 8 September 2026: `/me/leagues`
 * took 24–733ms of worker time across six real requests, so this is roughly
 * twenty times the slowest healthy one and cannot fire on a request that was
 * going to succeed on any ordinary connection.
 *
 * And it is the last rung of the stores' own RETRY_MS ladder, which is the
 * longest wait they already treat as reasonable — so a wedged attempt is
 * released no later than the point their backoff had already decided was
 * worth waiting. Move the two together if either changes. */
export const LATCH_TIMEOUT_MS = 15000

export function singleFlight(timeoutMs = LATCH_TIMEOUT_MS) {
  // The attempt holding the latch, and the most recent one started. Two
  // counters rather than one flag because they answer different questions:
  // "may another start" and "is this answer still the newest". A timeout
  // clears the first and deliberately leaves the second alone.
  let holder = 0
  let latest = 0
  let timer = null

  function release(n) {
    // A late attempt must not release a newer one's latch — the mirror of
    // the stale-answer guard, on the other side of the same race.
    if (holder !== n) return
    holder = 0
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    /* Run `work(isCurrent)` unless one is already in flight.
     *
     * `work` must settle its own errors — every caller here already ends its
     * chain in .catch — and the catch below exists only so that a bug in one
     * cannot surface as an unhandled rejection on a page that is otherwise
     * fine. It is logged rather than swallowed: reaching it means a caller
     * stopped handling its own failures. */
    run(work, onTimeout) {
      if (holder !== 0) return
      const mine = ++latest
      holder = mine

      timer = setTimeout(() => {
        if (holder !== mine) return
        release(mine)
        if (onTimeout) onTimeout()
      }, timeoutMs)

      const isCurrent = () => latest === mine

      Promise.resolve()
        .then(() => work(isCurrent))
        .catch((err) => {
          console.error('singleFlight: work rejected rather than settling', err)
        })
        .finally(() => release(mine))
    },

    // Whether one is in flight. Nothing in the app reads this; the store
    // tests do, to assert the latch is actually let go.
    busy() { return holder !== 0 },

    /* Test-only, and exported for the reason __resetDecisions() already
       gives: a module is evaluated once per process, so without this one
       case's wedged latch would silently decide the next case's result. */
    __reset() {
      holder = 0
      latest = 0
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }
  }
}
