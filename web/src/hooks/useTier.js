import { useEffect, useReducer } from 'react'
import { refreshTier, subscribeTier, tierState } from '../lib/tierStore.js'

/* React's view of the account's subscription tier. The store is
   web/src/lib/tierStore.js; this file is the subscription and nothing
   else — the identical split useLeague.js already makes for leagueStore.js
   and for the same reason (see that file's own header). */
export function useTier() {
  const [, bump] = useReducer((n) => n + 1, 0)

  useEffect(() => {
    const unsubscribe = subscribeTier(bump)
    refreshTier()

    // Same three signals useLeague() re-reads on: who is signed in changed,
    // the deferred scripts landed, or the tab came back after a failure.
    const reread = () => refreshTier()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && tierState().status === 'error') refreshTier()
    }
    window.addEventListener('juke:auth', reread)
    window.addEventListener('juke:data-loaded', reread)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      unsubscribe()
      window.removeEventListener('juke:auth', reread)
      window.removeEventListener('juke:data-loaded', reread)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const snapshot = tierState()
  return { status: snapshot.status, tier: snapshot.tier, refresh: refreshTier }
}
