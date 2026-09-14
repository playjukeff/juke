import { useEffect, useState } from 'react'
import { boardKey } from './playerData.js'

/* What would make any figure in the Players place different, as a string.

   ui.jsx's useEngineData reads once per board change and cannot see a
   component's own props or state (a scoring switch, the player id in the
   address), so these pages key their own memos on this instead.

   It re-checks on `juke:data-loaded` (the deferred board landing) and on
   `juke:header` (which fires per pick AND per clock tick of a live draft);
   a tick that changes nothing sets the same string and React bails out, so
   a draft running in another view costs these pages nothing. */
export function useBoardKey() {
  const [key, setKey] = useState(() => boardKey(typeof window !== 'undefined' ? window.JukeEngine : null))
  useEffect(() => {
    const engine = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!engine) return undefined
    const run = () => {
      const next = boardKey(engine)
      setKey((prev) => (prev === next ? prev : next))
    }
    run()
    window.addEventListener('juke:data-loaded', run)
    window.addEventListener('juke:header', run)
    return () => {
      window.removeEventListener('juke:data-loaded', run)
      window.removeEventListener('juke:header', run)
    }
  }, [])
  return key
}

/* A counter that moves on every `juke:header`, for the few reads that are
   draft state rather than board state (is he queued, is he on the
   watchlist, what does his draft fit say now). Only the player page uses
   it, and only for those. */
export function useHeaderTick() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const bump = () => setN((x) => x + 1)
    window.addEventListener('juke:header', bump)
    return () => window.removeEventListener('juke:header', bump)
  }, [])
  return n
}
