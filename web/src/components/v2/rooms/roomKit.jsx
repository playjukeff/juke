import { useEffect, useState } from 'react'
import { meetsTier, tierLabel } from '../../../lib/tiers.js'
import { useTierFresh as useTier } from '../stores.js'
import { Kicker, LockIcon, PosChip, Skeleton, useReducedMotionPref } from '../v2ui.jsx'

/* The room pages' own parts, in v2 idiom.

   These are the decision system's primitives (KpiStrip, Bar/BarRow,
   StakeCard, RunNextCard) and the tier gate, restyled rather than imported:
   the production ones carry the slate/teal palette and would read as a
   different product one scroll down a v2 page. What is kept is every rule
   they enforce — one scale per list, a zero axis for a two-sided number, a
   marker that is a line and a word, a dash for a missing value, and a gate
   that draws what it hides rather than an empty box.

   Colour, in one place so no card chooses its own:
     gain     a positive value delta   -> volt numeral, cyan bar
     cost     a cost / negative        -> loss
     evidence a quantity with no sign  -> ink numeral, cyan bar
   Volt is never a bar fill here: a page of volt bars is a page of volt,
   and the brief spends volt on the action, the selection and the delta. */

export const TONE_TEXT = { gain: 'text-v2-volt', cost: 'text-v2-loss', evidence: 'text-v2-ink', warn: 'text-v2-warn' }
const TONE_RULE = { gain: 'bg-v2-volt', cost: 'bg-v2-loss', evidence: 'bg-v2-cyan', warn: 'bg-v2-warn' }
const TONE_FILL = { gain: 'bg-v2-cyan', cost: 'bg-v2-loss', evidence: 'bg-v2-cyan' }

/* A real minus, never a hyphen, and no sign on zero — the same helper the
   production primitives share, restated here only because that one lives
   beside a palette this page does not use. */
export function signedNum(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const r = digits ? Number(n).toFixed(digits) : String(Math.round(n))
  if (Number(r) === 0) return digits ? (0).toFixed(digits) : '0'
  return (n > 0 ? '+' : '−') + r.replace('-', '')
}

export function RoomIcon({ slug, className = 'h-5 w-5', style }) {
  const p = { stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }
  return (
    <svg viewBox="0 0 20 20" className={className} style={style} aria-hidden="true">
      {slug === 'draft' && (<><circle cx="10" cy="10" r="7" {...p} /><circle cx="10" cy="10" r="3.5" {...p} /></>)}
      {slug === 'prospect' && (<><path d="M3 12l9-5 1.5 3-9 5z" {...p} /><path d="M12.5 7.5l3-1.7 1.4 2.6-3 1.7M7 14.2 6 18M9 13l1.5 5" {...p} /></>)}
      {slug === 'waiver' && <path d="M11 2 4.5 11H10l-1 7 6.5-9H10z" {...p} />}
      {slug === 'trade' && <path d="M4 7h11l-3-3M16 13H5l3 3" {...p} />}
      {slug === 'strategy' && (<><circle cx="10" cy="10" r="7.5" {...p} /><path d="m12.8 7.2-1.6 4-4 1.6 1.6-4z" {...p} /></>)}
    </svg>
  )
}

export function Panel({ title, action, children, className = '', pad = true, id }) {
  return (
    <section id={id} className={`rounded-[18px] bg-v2-panel ring-1 ring-inset ring-white/[0.07] ${className}`}>
      {title !== undefined && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
          <h2 className="font-telemetry text-[22px] font-bold uppercase italic leading-none text-v2-ink">{title}</h2>
          {action}
        </div>
      )}
      <div className={pad ? 'px-4 sm:px-5' : ''}>{children}</div>
    </section>
  )
}

export function Empty({ children }) {
  return <div className="py-10 text-center text-[14px] leading-[1.55] text-v2-ink2">{children}</div>
}

export function Footnote({ children, border = true }) {
  return (
    <p className={`py-3 text-[12px] leading-[1.55] text-v2-ink3 ${border ? 'border-t border-white/[0.06]' : ''}`}>{children}</p>
  )
}

/* Four numbers at the top of a room, each with the one line that says what
   it is. The rule across the top is the only colour a card gets outside
   its numeral, and it says what KIND of number sits under it. */
export function KpiStrip({ items }) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="relative overflow-hidden rounded-[14px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07]">
          <span className={`absolute left-4 top-0 h-[3px] w-6 rounded-b-full ${TONE_RULE[k.tone] || TONE_RULE.evidence}`} aria-hidden="true" />
          <dt><Kicker>{k.label}</Kicker></dt>
          <dd className={`mt-2 truncate font-telemetry text-[34px] font-bold sm:text-[40px] leading-none tabular-nums ${TONE_TEXT[k.tone] || 'text-v2-ink'}`}>
            {k.value}
          </dd>
          {k.note && <dd className="mt-2 text-[12px] leading-[1.5] text-v2-ink2">{k.note}</dd>}
        </div>
      ))}
    </dl>
  )
}

/* The track and its fill. Grows from nothing on mount so a list reads as
   being measured; reduced motion gets the final length. One scale per list
   is the caller's job — `max` is required for that reason. */
export function Bar({ value, max, tone = 'evidence', zeroAxis = false, marker, className = '' }) {
  const reduce = useReducedMotionPref()
  const [grown, setGrown] = useState(reduce)
  useEffect(() => {
    if (reduce) { setGrown(true); return undefined }
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [reduce])

  const share = max ? Math.min(100, (Math.abs(value || 0) / Math.abs(max)) * 100) : 0
  // 4% floor so a real but tiny value is visibly there; zero draws nothing.
  const width = share === 0 ? 0 : Math.max(4, share)
  const neg = zeroAxis && value < 0
  const fill = neg ? TONE_FILL.cost : TONE_FILL[tone] || TONE_FILL.evidence
  const shown = grown ? (zeroAxis ? width / 2 : width) : 0
  return (
    <span className={`relative block h-1.5 w-full rounded-full bg-white/[0.06] ${className}`}>
      {zeroAxis && <span aria-hidden="true" className="absolute -top-1 bottom-[-4px] left-1/2 w-px bg-v2-ink3" />}
      {width > 0 && (
        <span
          className={`absolute inset-y-0 rounded-full transition-[width] duration-500 ease-out ${fill}`}
          style={{
            width: `${shown}%`,
            left: zeroAxis ? (neg ? 'auto' : '50%') : 0,
            right: zeroAxis && neg ? '50%' : 'auto',
          }}
        />
      )}
      {marker && (
        <>
          <span aria-hidden="true" className="absolute -top-1 h-[14px] w-px bg-v2-ink2" style={{ left: `${Math.min(100, (marker.at / max) * 100)}%` }} />
          <span className="pointer-events-none absolute -top-[18px] -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3" style={{ left: `${Math.min(100, (marker.at / max) * 100)}%` }}>
            {marker.label}
          </span>
        </>
      )}
    </span>
  )
}

/* A row of a shared-unit list: label, bar, numeral. Flex with a basis on
   each part, so it wraps on its CONTAINER's width — the bar drops to its own
   line in a narrow rail and grows to fill it, rather than squeezing the
   label to an ellipsis. The bases are production BarRow's measured ones
   (12rem + 8rem + a 56px numeral): any narrower bar basis lets label and
   bar share a line in a 360px rail and strands the numeral alone below. */
export function BarRow({ label, sub, value, max, tone = 'evidence', display, zeroAxis = false }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/[0.05] py-2.5 last:border-b-0">
      <span className="min-w-0 flex-[1_1_12rem]">
        <span className="block truncate text-[14px] text-v2-ink">{label}</span>
        {sub && <span className="block truncate font-mono text-[11px] text-v2-ink3">{sub}</span>}
      </span>
      <Bar value={value} max={max} tone={tone} zeroAxis={zeroAxis} className="flex-[1_1_8rem]" />
      <span className={`w-14 shrink-0 text-right font-mono text-[14px] font-semibold tabular-nums ${TONE_TEXT[tone] || 'text-v2-ink'}`}>
        {display}
      </span>
    </div>
  )
}

/* The one card per route that says what the room is costing you. Not a
   light surface here — v2 has none — but the only card on the page with a
   loss rule down its edge and a loss numeral, which is the same "one loud
   thing" rule reached in this palette. */
export function StakeCard({ eyebrow, title, cost, children }) {
  return (
    <section className="relative overflow-hidden rounded-[18px] bg-v2-raised p-5 ring-1 ring-inset ring-v2-loss/30">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-v2-loss" aria-hidden="true" />
      <Kicker tone="text-v2-loss">{eyebrow}</Kicker>
      <h3 className="mt-2 text-[16px] font-semibold leading-snug text-v2-ink">{title}</h3>
      <p className="mt-2 font-telemetry text-[40px] font-bold italic leading-none tabular-nums text-v2-loss">{cost}</p>
      <p className="mt-3 text-[13px] leading-[1.55] text-v2-ink2">{children}</p>
    </section>
  )
}

export function RunNextCard({ eyebrow, title, children, action }) {
  return (
    <section className="rounded-[18px] bg-v2-panel p-5 ring-1 ring-inset ring-white/[0.1]">
      <Kicker tone="text-v2-ink2">{eyebrow}</Kicker>
      <h3 className="mt-1.5 font-telemetry text-[26px] font-bold uppercase italic leading-none text-v2-ink">{title}</h3>
      <p className="mt-2 text-[13px] leading-[1.55] text-v2-ink2">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </section>
  )
}

export function PosSquare({ pos }) {
  return <PosChip pos={pos || 'DST'} className="h-[26px] min-w-[36px]" />
}

/* A player in a list. `right` is whatever the row measures him by. */
export function PlayerLine({ pos, name, note, right, dim = false }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.05] py-2.5 last:border-b-0">
      <PosSquare pos={pos} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14px] font-medium ${dim ? 'text-v2-ink3' : 'text-v2-ink'}`}>{name}</span>
        {note && <span className="block truncate font-mono text-[11px] text-v2-ink3">{note}</span>}
      </span>
      {right}
    </div>
  )
}

export function Loading() {
  return (
    <div className="rounded-[18px] bg-v2-panel p-6 ring-1 ring-inset ring-white/[0.07]" role="status" aria-label="Loading">
      <Skeleton lines={5} />
    </div>
  )
}

/* The snapshot could not be read. Says which of two things it is, and
   offers the one action a reader has. */
export function CouldNotRead({ reason, onRetry }) {
  return (
    <div className="rounded-[18px] bg-v2-panel px-6 py-10 text-center ring-1 ring-inset ring-white/[0.07]" role="alert">
      <p className="font-telemetry text-[26px] font-bold uppercase italic leading-none text-v2-ink">We could not read your league</p>
      <p className="mx-auto mt-3 max-w-[52ch] text-[14px] leading-[1.55] text-v2-ink2">
        {reason === 'not-found'
          ? 'That league no longer answers. It may have been deleted, or made private.'
          : 'Nothing is wrong with your roster — this page just could not fetch it.'}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex min-h-[44px] items-center rounded-[10px] px-4 text-[13px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.14] hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function NoTeam({ teams, what }) {
  return (
    <div className="rounded-[18px] bg-v2-panel px-6 py-10 text-center ring-1 ring-inset ring-white/[0.07]">
      <p className="mx-auto max-w-[54ch] text-[14px] leading-[1.55] text-v2-ink2">
        Reconnect this league to {what} — Juke does not know which of the {teams} rosters is yours.
      </p>
    </div>
  )
}

/* A filter chip row. Buttons with aria-pressed, 44px targets, volt only on
   the chip that is selected. */
export function ChipRow({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o === value
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o)}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt ${
              on ? 'bg-v2-volt text-v2-voltInk' : 'text-v2-ink2 ring-1 ring-inset ring-white/[0.1] hover:text-v2-ink'
            }`}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

/* A section this tier cannot open yet, drawn and then obscured rather than
   withheld — production's UpgradeGate, in this palette. Same contract:
   an unknown tier reaches nothing (a gate that falls open while the tier
   loads flashes paid content), billing is not built so the card is an
   email capture that says so, and the blur is aria-hidden and inert. */
export function TierGate({ need, title, children }) {
  const { tier } = useTier()
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle')

  if (meetsTier(tier, need)) return children

  const submit = (e) => {
    e.preventDefault()
    const value = email.trim()
    if (!value || value.indexOf('@') < 1) { setState('invalid'); return }
    setState('submitting')
    const live = typeof window !== 'undefined' ? window.Live : null
    if (!live || !live.signup) { setState('error'); return }
    live.signup(value, 'upgrade:' + need)
      .then((res) => setState(res && res.ok ? 'success' : 'error'))
      .catch(() => setState('error'))
  }

  return (
    <div className="relative min-h-[420px] overflow-hidden rounded-[18px]">
      <div aria-hidden="true" inert="" className="pointer-events-none select-none blur-[3px]">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(11,15,25,0.35),rgba(11,15,25,0.94)_55%)] p-4">
        <div className="w-full max-w-[440px] rounded-[18px] bg-v2-raised p-6 text-center ring-1 ring-inset ring-white/[0.1]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-v2-warn/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-v2-warn ring-1 ring-inset ring-v2-warn/30">
            <LockIcon className="h-3 w-3" /> {tierLabel(need)}
          </span>
          <p className="mt-3 font-telemetry text-[28px] font-bold uppercase italic leading-[0.95] text-v2-ink">{title}</p>
          <p className="mx-auto mt-2 max-w-[40ch] text-[13px] leading-[1.55] text-v2-ink2">
            It is real and it is behind {tierLabel(need)} — which is not on sale yet. Leave an email and we
            will tell you when it is.
          </p>
          {state === 'success' ? (
            <p className="mt-4 text-[13px] font-semibold text-v2-volt" role="status">You are on the list. Nothing else to do.</p>
          ) : (
            <form onSubmit={submit} noValidate className="mt-4 flex flex-wrap justify-center gap-2">
              <label className="sr-only" htmlFor={`v2-upgrade-${need}`}>Email address</label>
              <input
                id={`v2-upgrade-${need}`}
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (state !== 'idle') setState('idle') }}
                placeholder="you@example.com"
                className="min-h-[44px] min-w-0 flex-1 rounded-[10px] bg-v2-inset px-3 text-[16px] text-v2-ink ring-1 ring-inset ring-white/[0.1] placeholder:text-v2-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
              />
              <button
                type="submit"
                disabled={state === 'submitting'}
                className="min-h-[44px] rounded-[10px] bg-v2-volt px-4 text-[13px] font-semibold text-v2-voltInk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt focus-visible:ring-offset-2 focus-visible:ring-offset-v2-raised disabled:cursor-wait"
              >
                {state === 'submitting' ? 'Sending…' : 'Tell me'}
              </button>
            </form>
          )}
          {state === 'invalid' && <p className="mt-2 text-[12px] text-v2-loss" role="alert">That does not look like an email.</p>}
          {state === 'error' && <p className="mt-2 text-[12px] text-v2-loss" role="alert">That did not send. Nothing was lost — try again in a moment.</p>}
        </div>
      </div>
    </div>
  )
}
