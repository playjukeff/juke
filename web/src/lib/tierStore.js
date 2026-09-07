/* The account's subscription tier: one shared answer, fetched from GET
 * /me — architecturally identical to leagueStore.js, including why a
 * store like this has no imports (see that file's own header). useTier.js
 * is the subscription over it.
 *
 * ---- Three states ----
 *
 * 'loading'  we have not asked yet, or the deferred window.Live script
 *            has not landed.
 * 'ready'    `tier` is a real answer: 'free' | 'pro' | 'allaccess'.
 * 'error'    asked, and the worker could not say — worker/draft-room.js's
 *            meRoute() passes a genuine `null` through when getTier()
 *            itself failed, rather than guessing 'free'. Collapsing that
 *            into 'free' here would read as a downgrade to anybody who is
 *            actually paying, off nothing more than an infra hiccup.
 *
 * Signed out settles 'free' directly rather than 'error': a guest has no
 * token to ask with, and "not signed in" is exactly what the free tier
 * already is for every purpose this store exists to answer. */

const state = { status: 'loading', tier: null }
const subscribers = new Set()

let inFlight = null

function announce() {
  subscribers.forEach((fn) => fn())
}

function settle(status, tier) {
  if (state.status === status && state.tier === tier) return
  state.status = status
  state.tier = tier
  announce()
}

function authToken() {
  const auth = typeof window !== 'undefined' ? window.JukeAuth : null
  return auth && auth.isSignedIn && auth.getToken ? auth.getToken() : Promise.resolve(null)
}

/* Ask the worker. Safe to call as often as anything likes — one request at
   a time, the same guard leagueStore.js uses for the identical reason
   (several components mounting together, three window events that can
   fire in the same tick). */
export function refreshTier() {
  if (typeof window === 'undefined') return
  if (inFlight) return

  const auth = window.JukeAuth
  if (!auth || !auth.isSignedIn) {
    settle('ready', 'free')
    return
  }
  // The deferred script has not landed yet — stay in 'loading' rather than
  // guessing, the same reason leagueStore.js's own refreshLeagues() waits
  // on window.Live rather than answering 'none' early.
  if (!window.Live || !window.Live.me) return

  inFlight = Promise.resolve(authToken())
    .then((token) => window.Live.me(token))
    .then((res) => {
      if (!res || !res.ok) {
        settle('error', state.tier)
        return
      }
      if (!res.signedIn) {
        settle('ready', 'free')
        return
      }
      if (res.tier === null || res.tier === undefined) {
        settle('error', state.tier)
        return
      }
      settle('ready', res.tier)
    })
    .catch(() => settle('error', state.tier))
    .finally(() => { inFlight = null })
}

export function tierState() {
  return { status: state.status, tier: state.tier }
}

export function subscribeTier(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}
