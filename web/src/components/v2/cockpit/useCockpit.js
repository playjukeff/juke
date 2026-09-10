import { useEffect, useReducer, useRef, useState } from 'react'

/* The cockpit's two subscriptions, and why there are two.

   "juke:header" fires from renderHeader() on every render AND on every
   second of the pick clock. A 480-row player table re-rendering once a
   second to move one digit in the header is the cost DraftRoom.jsx pays
   and this does not have to: `useDraftVersion` bumps only when something a
   pick, a queue star or a pause could have changed actually moved, and
   `useClockTick` is the per-second one, used by the two small components
   that draw the clock. */

export function useEngine() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.JukeEngine) setReady(true)
  }, [])
  return ready ? window.JukeEngine : null
}

function draftKey(e) {
  try {
    const h = e.headerInfo()
    const picks = e.picks() || []
    const league = e.league() || {}
    return [
      e.dataReady() ? 1 : 0,
      h.started ? 1 : 0,
      h.over ? 1 : 0,
      h.myTurn ? 1 : 0,
      // Flips at most twice a turn, so it costs nothing — and the header's
      // top rule turns loss-red on it outside the ticking readout.
      h.urgent ? 1 : 0,
      picks.length,
      e.mySlot(),
      e.paused() ? 1 : 0,
      (e.queue() || []).join('|'),
      e.watchlist ? (e.watchlist() || []).join('|') : '',
      (e.board() || []).length,
      e.hasRoom() ? 1 : 0,
      e.clockLength(),
      league.teams,
      league.rounds,
      league.scoring,
    ].join('~')
  } catch {
    return 'err'
  }
}

export function useDraftVersion(engine) {
  const [version, bump] = useReducer((x) => x + 1, 0)
  const last = useRef(null)
  useEffect(() => {
    if (!engine) return
    const on = () => {
      const k = draftKey(engine)
      if (k !== last.current) {
        last.current = k
        bump()
      }
    }
    on()
    window.addEventListener('juke:header', on)
    window.addEventListener('juke:data-loaded', on)
    return () => {
      window.removeEventListener('juke:header', on)
      window.removeEventListener('juke:data-loaded', on)
    }
  }, [engine])
  return version
}

export function useClockTick(engine) {
  const [, force] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    if (!engine) return
    window.addEventListener('juke:header', force)
    return () => window.removeEventListener('juke:header', force)
  }, [engine])
}

/* A plain keyed cache, the same shape DraftRoom's keyedMemo() is and for a
   narrower reason: these readers are called from components with early
   returns above them, and a hook placed after one changes the hook count
   between renders. */
export function keyedMemo() {
  let key
  let value
  return (nextKey, compute) => {
    if (key !== undefined && key.length === nextKey.length && key.every((v, i) => v === nextKey[i])) return value
    key = nextKey
    value = compute()
    return value
  }
}

/* Esc closes, focus goes in on open and back where it came from on close.
   The drawer and the menu both need exactly this and nothing more. */
export function useDialogFocus(open, onClose, panelRef) {
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    const t = setTimeout(() => {
      const el = panelRef.current
      if (!el) return
      const first = el.querySelector('[data-autofocus]') || el.querySelector('button, a[href], input, select, [tabindex]:not([tabindex="-1"])')
      if (first) first.focus()
    }, 30)
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const nodes = [...panelRef.current.querySelectorAll('button:not([disabled]), a[href], input, select, [tabindex]:not([tabindex="-1"])')]
        .filter((n) => n.offsetParent !== null)
      if (!nodes.length) return
      const first = nodes[0]
      const lastNode = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastNode.focus() }
      else if (!e.shiftKey && document.activeElement === lastNode) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey, true)
      if (prev && prev.focus) prev.focus()
    }
  }, [open, onClose, panelRef])
}
