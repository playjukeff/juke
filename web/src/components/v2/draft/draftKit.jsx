import { useEffect, useRef, useState } from 'react'

/* The two draft pages' own small parts: one engine hook, a handful of
   stroke icons, and the relative-age formatter. Presentation and plumbing
   only — every number either page prints is asked of window.JukeEngine.

   ---- Why not useV2Data here ----

   useV2Data re-reads only when its change key moves, and that key is
   teams/rounds/scoring/rules/history — the right key for a marketing
   section and the wrong one for a settings screen. Draft type, player pool,
   seat, pick clock, CPU autopick and a starter swapped for another starter
   all leave that key where it was, so a stepper would move the league and
   the screen would go on drawing the old one. These pages draw the live
   league, so they re-read on every `juke:header` (which setLeague(),
   setMySlot() and setClockLength() all fire through render()) and on
   `juke:data-loaded`, and a write here bumps once more itself so a setter
   that does not render still repaints. */

export function useDraftEngine() {
  const [engine, setEngine] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const e = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!e) return
    setEngine(e)
    const bump = () => setTick((t) => t + 1)
    window.addEventListener('juke:header', bump)
    window.addEventListener('juke:data-loaded', bump)
    bump()
    return () => {
      window.removeEventListener('juke:header', bump)
      window.removeEventListener('juke:data-loaded', bump)
    }
  }, [])
  const ready = !!(engine && engine.dataReady && engine.dataReady())
  return { engine, ready, tick, bump: () => setTick((t) => t + 1) }
}

/* A value from the engine that answers null rather than throwing. Every
   bridge read on these pages goes through it: a throw costs the one figure
   and never the page. */
export function safe(fn, fallback = null) {
  try {
    const v = fn()
    return v === undefined ? fallback : v
  } catch {
    return fallback
  }
}

/* "4d", "now", "3w" — the two or three characters a list row has room for.
   DraftRoomEntry's own shortAgo(), the same question and the same shape. */
export function shortAgo(ms) {
  if (!ms) return ''
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000))
  if (mins < 2) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks}w`
  return `${Math.round(days / 30)}mo`
}

/* Whether the address carries a flag in its query — `?friends=1` is the one
   these pages read. The route itself strips the query before V2App sees it,
   so this asks the hash directly and re-asks on every hashchange. */
export function useHashFlag(name) {
  const read = () => (typeof window === 'undefined' ? false : new RegExp(`[?&]${name}=1(?:&|$)`).test(window.location.hash))
  const [on, setOn] = useState(read)
  useEffect(() => {
    const onHash = () => setOn(read())
    window.addEventListener('hashchange', onHash)
    onHash()
    return () => window.removeEventListener('hashchange', onHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])
  return on
}

/* Two presses, in place, rather than a confirm dialog — the shape the
   production launcher's own delete uses, and the reason is the same: a
   modal over a list to ask about one line of it. Arms for four seconds. */
export function useTwoTap() {
  const [armed, setArmed] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const press = (id, action) => {
    if (armed !== id) {
      setArmed(id)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setArmed((a) => (a === id ? null : a)), 4000)
      return
    }
    setArmed(null)
    action()
  }
  return { armed, press }
}

const P = { stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }

export function Icon({ name, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {name === 'play' && <path d="M7 4.5v11l9-5.5z" {...P} />}
      {name === 'gear' && (
        <>
          <circle cx="10" cy="10" r="2.6" {...P} />
          <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" {...P} />
        </>
      )}
      {name === 'chart' && <path d="M3.5 16.5h13M6 16.5V10m4 6.5V5m4 11.5V8" {...P} />}
      {name === 'users' && (
        <>
          <circle cx="7.5" cy="7" r="2.8" {...P} />
          <path d="M2.5 16.5c.6-2.8 2.6-4.3 5-4.3s4.4 1.5 5 4.3M13 4.6a2.7 2.7 0 0 1 0 5M14.8 12.4c1.4.6 2.3 2 2.7 4.1" {...P} />
        </>
      )}
      {name === 'trash' && <path d="M4 6h12M8 6V4.2h4V6M5.5 6l.8 10h7.4l.8-10M8.5 9v4.5M11.5 9v4.5" {...P} />}
      {name === 'close' && <path d="M5 5l10 10M15 5 5 15" {...P} />}
      {name === 'chevLeft' && <path d="M12 4.5 6.5 10 12 15.5" {...P} />}
      {name === 'shuffle' && <path d="M3 6h3.5c3 0 4 8 7 8H17M14.5 11.5 17 14l-2.5 2.5M3 14h3.5c1.2 0 2-1.2 2.7-2.8M11.2 8.8C11.9 7.2 12.7 6 14 6h3M14.5 3.5 17 6l-2.5 2.5" {...P} />}
      {name === 'cpu' && (
        <>
          <rect x="5.5" y="5.5" width="9" height="9" rx="1.8" {...P} />
          <path d="M8 2.5v3M12 2.5v3M8 14.5v3M12 14.5v3M2.5 8h3M2.5 12h3M14.5 8h3M14.5 12h3" {...P} />
        </>
      )}
      {name === 'person' && (
        <>
          <circle cx="10" cy="7" r="3" {...P} />
          <path d="M4 16.5c.8-3 3.1-4.6 6-4.6s5.2 1.6 6 4.6" {...P} />
        </>
      )}
      {name === 'plus' && <path d="M10 4.5v11M4.5 10h11" {...P} />}
      {name === 'minus' && <path d="M4.5 10h11" {...P} />}
      {name === 'chevDown' && <path d="M5 8l5 5 5-5" {...P} />}
      {name === 'alert' && <path d="M10 3.5 17 16H3zM10 8.5v3.5M10 14.2v.2" {...P} />}
    </svg>
  )
}

/* The focus behaviour every overlay on these pages owes a keyboard reader:
   focus lands inside on open, Tab cannot walk out of it, Esc closes it, and
   focus goes back to whatever opened it. RoomHub's drawer does the first,
   third and fourth; the trap is the half it leaves to the backdrop. */
export function useDialogFocus(open, onClose, panelRef, initialRef) {
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    const t = setTimeout(() => {
      const el = (initialRef && initialRef.current) || panelRef.current
      el && el.focus && el.focus()
    }, 0)
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab' || !panelRef.current) return
      const f = [...panelRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter((n) => n.offsetParent !== null)
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      if (opener && opener.focus) requestAnimationFrame(() => opener.focus())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
