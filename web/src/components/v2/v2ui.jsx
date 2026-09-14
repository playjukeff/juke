import { useEffect, useRef, useState } from 'react'
import { POS_CHALK } from '../draftRoomPositions.js'

/* The v2 build's small shared parts. Everything here is presentation;
   anything that is a number comes from v2data.js. */

export function useReducedMotionPref() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduce(mq.matches)
    on()
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on)
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on))
  }, [])
  return reduce
}

/* What would make any v2 figure different. Compared on every `juke:header`,
   which fires once per pick AND once per clock tick of a live draft —
   applyRoute() hides #view-home during a draft but never unmounts it, so
   without this a marketing page would re-run full-board reads every second
   behind the draft room. HomeProof learned that the expensive way. */
function changeKey(engine) {
  const board = engine.board()
  const league = engine.league()
  if (!board || !league) return null
  let rules = 0
  const table = league.rules || {}
  for (const k in table) if (typeof table[k] === 'number') rules += table[k]
  let hist = 0
  try { hist = engine.historyList ? engine.historyList().length : 0 } catch { hist = 0 }
  return `${board.length}|${league.teams}|${league.rounds}|${league.scoring}|${rules}|${hist}`
}

export function useV2Data(read) {
  const [data, setData] = useState(null)
  const last = useRef(null)
  const readRef = useRef(read)
  readRef.current = read

  useEffect(() => {
    const engine = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!engine) return
    const run = () => {
      if (!engine.dataReady || !engine.dataReady()) return
      const key = changeKey(engine)
      if (key !== null && key === last.current) return
      try {
        const next = readRef.current(engine)
        if (next) { last.current = key; setData(next) }
      } catch {
        // A throw costs this section and never the page.
        setData(null)
      }
    }
    run()
    window.addEventListener('juke:data-loaded', run)
    window.addEventListener('juke:header', run)
    return () => {
      window.removeEventListener('juke:data-loaded', run)
      window.removeEventListener('juke:header', run)
    }
  }, [])
  return data
}

function hexA(hex, a) {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/* A position as a low-opacity tint of its own chalk hue, with the chalk
   itself as the ink. The hues are the product's — POS_CHALK is the one
   reference every screen reads — so a WR here is the colour a WR is on the
   board one click away. Measured on v2.panel: the lowest-contrast chalk ink
   on its own 14% tint is WR at 8.4:1. */
export function PosChip({ pos, className = '' }) {
  const c = POS_CHALK[pos] || '#C2CCD7'
  return (
    <span
      className={`inline-grid h-[20px] min-w-[30px] place-items-center rounded-[5px] px-1.5 font-mono text-[10px] font-semibold tracking-[0.04em] ${className}`}
      style={{ background: hexA(c, 0.14), color: c, boxShadow: `inset 0 0 0 1px ${hexA(c, 0.28)}` }}
    >
      {pos}
    </span>
  )
}

export function posColor(pos) {
  return POS_CHALK[pos] || '#C2CCD7'
}

/* A number that travels to its new value rather than snapping, so a
   scoring toggle reads as the same player's worth changing. Reduced motion
   gets the snap. */
export function useTween(value, ms = 420) {
  const reduce = useReducedMotionPref()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (value === null || value === undefined) { setShown(value); return }
    if (reduce || from.current === null || from.current === undefined) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      setShown(a + (value - a) * e)
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); from.current = value }
  }, [value, ms, reduce])
  return shown
}

export function Tween({ value, signed = false, digits = 0, className = '' }) {
  const v = useTween(value)
  if (v === null || v === undefined) return <span className={className}>—</span>
  const r = digits ? v.toFixed(digits) : String(Math.round(v))
  const sign = signed && Math.round(v * 10 ** digits) > 0 ? '+' : ''
  return <span className={`tabular-nums ${className}`}>{sign}{r.replace('-', '−')}</span>
}

/* A segmented control. Buttons with aria-pressed rather than radios: each
   one is an action ("show me this format"), and the group is labelled. */
export function Segmented({ label, options, value, onChange, size = 'md' }) {
  const pad = size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-[12px]'
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[10px] bg-v2-inset p-1 ring-1 ring-inset ring-white/[0.06]">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`min-h-[34px] rounded-[7px] font-mono font-semibold uppercase tracking-[0.08em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt ${pad} ${
              on ? 'bg-v2-volt text-v2-voltInk' : 'text-v2-ink2 hover:bg-white/[0.04] hover:text-v2-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Kicker({ children, className = '', tone = 'text-v2-ink3' }) {
  return (
    <span className={`font-mono text-[10px] font-semibold uppercase tracking-[0.16em] ${tone} ${className}`}>
      {children}
    </span>
  )
}

export function Skeleton({ lines = 4 }) {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-7 animate-pulse rounded-md bg-white/[0.04]" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  )
}

/* The primary action. Volt is spent here and on selections and nowhere
   else a click is not available — see V2App's note on the one exception
   this build makes for value deltas. */
export function VoltButton({ href, onClick, children, className = '', size = 'lg' }) {
  const cls = `group inline-flex items-center justify-center gap-2 rounded-[12px] bg-v2-volt font-semibold text-v2-voltInk shadow-[0_0_0_1px_rgba(0,255,102,0.35),0_8px_28px_-8px_rgba(0,255,102,0.55)] transition-transform duration-150 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt focus-visible:ring-offset-2 focus-visible:ring-offset-v2-ground ${
    size === 'lg' ? 'min-h-[52px] px-5 text-[15px]' : 'min-h-[40px] px-4 text-[13px]'
  } ${className}`
  if (href) return <a href={href} className={cls}>{children}</a>
  return <button type="button" onClick={onClick} className={cls}>{children}</button>
}

export function GhostButton({ href, onClick, children, className = '' }) {
  const cls = `inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[10px] px-3.5 text-[13px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.12] transition-colors duration-150 hover:bg-white/[0.04] hover:ring-white/[0.22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt ${className}`
  if (href) return <a href={href} className={cls}>{children}</a>
  return <button type="button" onClick={onClick} className={cls}>{children}</button>
}

export function Arrow({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LockIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <rect x="3.25" y="7" width="9.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
