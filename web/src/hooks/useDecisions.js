import { useEffect, useReducer } from 'react'
import {
  decisionState,
  decisionsFor,
  decisionsForWeek,
  forgetDecision,
  recordDecision,
  refreshDecisions,
  retryDecisions,
  subscribeDecisions,
  weekMark,
} from '../lib/decisionStore.js'

/* React's view of the decision ledger.
 *
 * The store is web/src/lib/decisionStore.js and its own header explains
 * the four states and why it imports nothing. This file is the
 * subscription and nothing else -- the identical split useLeague.js makes
 * over leagueStore.js, and for the identical reason: CI can run the
 * machine, and cannot run a hook.
 *
 * Re-exported so nothing imports from lib/ directly.
 */
export {
  decisionState,
  decisionsFor,
  decisionsForWeek,
  forgetDecision,
  recordDecision,
  refreshDecisions,
  retryDecisions,
  weekMark,
}

export function useDecisions() {
  const [, bump] = useReducer((n) => n + 1, 0)

  useEffect(() => {
    const unsubscribe = subscribeDecisions(bump)
    refreshDecisions()

    /* Three reasons to re-read, and they are different questions.

       `juke:auth` — who is signed in changed. AuthBridge fires it on every
       Clerk render, so the first useful one is usually the moment the
       session resolves, which is when the answer above goes from
       "signed out, none" to something worth asking about.

       `juke:decision` — a room recorded one somewhere else in the tree.
       recordDecision() settles the state directly, so this is for anything
       that changes the ledger without holding the answer: the grading job's
       verdicts arriving is the case that matters, since nothing on this
       page writes those.

       `juke:data-loaded` — the deferred scripts landed, which is the one
       thing that can turn the store's early return from "not yet" into an
       answer. Without it a cold load sits in "loading" for ever, which is
       the terminal state leagueStore's own header records paying for. */
    const reread = () => refreshDecisions()

    /* Coming back to the tab, and only from "error" — the other three are
       already answers, and a re-read per glance would be a request for a
       fact that has not changed. Same rule useLeague() follows. */
    const onVisible = () => {
      if (document.visibilityState === 'visible' && decisionState().status === 'error') {
        retryDecisions()
      }
    }

    window.addEventListener('juke:auth', reread)
    window.addEventListener('juke:decision', reread)
    window.addEventListener('juke:data-loaded', reread)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      unsubscribe()
      window.removeEventListener('juke:auth', reread)
      window.removeEventListener('juke:decision', reread)
      window.removeEventListener('juke:data-loaded', reread)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const snapshot = decisionState()
  return {
    status: snapshot.status,
    decisions: snapshot.decisions,
    reason: snapshot.reason,
    refresh: refreshDecisions,
    retry: retryDecisions,
    record: recordDecision,
    forget: forgetDecision,
  }
}
