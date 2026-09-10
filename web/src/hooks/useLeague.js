import { useEffect, useReducer } from 'react'
import {
  leagueState,
  noteLeagueConnected,
  refreshLeagues,
  removeLeague,
  retryLeagues,
  selectLeague,
  subscribeLeagues,
} from '../lib/leagueStore.js'
import {
  requestSnapshot,
  retrySnapshot,
  snapshotKey,
  snapshotState,
  subscribeSnapshot,
} from '../lib/snapshotStore.js'

/* React's view of the connected-league store.
 *
 * The store is web/src/lib/leagueStore.js and its own header explains both
 * the four states and why it has no imports. This file is the subscription
 * and nothing else.
 *
 * Re-exported so every existing import site keeps working -- the split was
 * about testability, not about moving anybody's imports. */
export {
  leagueState,
  noteLeagueConnected,
  refreshLeagues,
  removeLeague,
  retryLeagues,
  selectLeague,
  retrySnapshot,
}

export function useLeague() {
  const [, bump] = useReducer((n) => n + 1, 0)

  useEffect(() => {
    const unsubscribe = subscribeLeagues(bump)
    refreshLeagues()

    /* Three reasons to re-read, and they are different questions.

       `juke:auth` — who is signed in changed. AuthBridge fires it on every
       Clerk render, so the first useful one is usually the moment the
       session resolves, which is exactly when the answer above went from
       "signed out, none" to something worth asking about.

       `juke:league` — somebody connected or disconnected one in another
       part of the tree. noteLeagueConnected() settles the state directly,
       so this is for anything that changes it without knowing the answer.

       `juke:data-loaded` — the deferred scripts landed, which is the one
       thing that can turn the early return above from "not yet" into an
       answer. */
    const reread = () => refreshLeagues()
    /* Coming back to the tab is the strongest evidence there is that now is
       the moment, which is the same signal reconcileWithServer() and
       live.js already act on. Only from "error", because the other three
       states are already answers and a re-read on every tab focus would be
       a request per glance for a fact that has not changed. */
    const onVisible = () => {
      if (document.visibilityState === 'visible' && leagueState().status === 'error') retryLeagues()
    }
    window.addEventListener('juke:auth', reread)
    window.addEventListener('juke:league', reread)
    window.addEventListener('juke:data-loaded', reread)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      unsubscribe()
      window.removeEventListener('juke:auth', reread)
      window.removeEventListener('juke:league', reread)
      window.removeEventListener('juke:data-loaded', reread)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const snapshot = leagueState()
  return {
    status: snapshot.status,
    league: snapshot.league,
    leagues: snapshot.leagues,
    reason: snapshot.reason,
    refresh: refreshLeagues,
    retry: retryLeagues,
    select: selectLeague,
    remove: removeLeague,
  }
}

/* A league's live state, from the one place that holds it.

   The store is `web/src/lib/snapshotStore.js` and its header explains why
   the answer is shared rather than per-component. This file is the
   subscription and nothing else, which is the split `leagueStore`/
   `useLeague` already has.

   The signature and the four states are unchanged, deliberately: every
   consumer of this — RoomPage, MyLeagueScreen, useRoomStakes — branches on
   `status` exactly as it did, and the point of the change is the number of
   requests rather than what anybody renders.

   ---- A null id answers here rather than in the store ----

   `RoomPage` passes `live ? league.leagueId : null`, so a room that is not
   live asks for nothing at all. If that reached the store it would settle
   it to "none" and wipe an answer a mounted sibling is still drawing —
   which is the hazard a SHARED store introduces and a per-component one
   never had. So "there is no league to ask about" is answered locally and
   the store is left holding whatever it holds.

   ---- And an answer about another league is not this caller's ----

   During a switch the store still holds the previous league for a tick.
   Handing that to a caller asking about the new one would draw one render
   of somebody else's rosters under the right name, which is exactly what
   the dependency list on the hook this replaces was protecting. The key
   check is that protection, kept. */
export function useLeagueSnapshot(leagueId, provider) {
  const [, bump] = useReducer((n) => n + 1, 0)

  useEffect(() => {
    if (!leagueId) return undefined
    const unsubscribe = subscribeSnapshot(bump)
    requestSnapshot(leagueId, provider)

    /* The one event that can turn the store's "live.js has not landed yet"
       early return into an answer. Without it that path is terminal — a
       cold load straight onto a room sits in "loading" for ever — which is
       the identical shape leagueStore already had and fixed. */
    const reread = () => requestSnapshot(leagueId, provider)
    window.addEventListener('juke:data-loaded', reread)
    return () => {
      unsubscribe()
      window.removeEventListener('juke:data-loaded', reread)
    }
  }, [leagueId, provider])

  if (!leagueId) return { snapshot: null, status: 'none', reason: null }

  const held = snapshotState()
  if (held.key !== snapshotKey(leagueId, provider)) {
    return { snapshot: null, status: 'loading', reason: null }
  }
  return { snapshot: held.snapshot, status: held.status, reason: held.reason }
}
