import { useEffect, useRef, useState } from 'react'
import { SignUpButton } from '@clerk/clerk-react'
import ConnectLeagueModal from '../../shell/ConnectLeagueModal.jsx'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { verdictFor } from '../../ledger/verdicts.js'
import { draftPhase } from '../../../lib/countdown.js'
import { leagueCap } from '../../../lib/tiers.js'
import { useAccountUiReady } from '../../../hooks/useAccountUiReady.js'
import { useSignedIn } from '../../../hooks/useAuthState.js'
import { noteLeagueConnected } from '../../../hooks/useLeague.js'
import { useLeagueFresh as useLeague, useTierFresh as useTier } from '../stores.js'
import { GhostButton, Kicker, VoltButton } from '../v2ui.jsx'

/* The account-and-league pages' own small parts. Presentation only: every
   figure a component here draws is handed to it, and every action goes
   through the same store function production calls. */

export const CARD = 'rounded-[18px] bg-v2-panel ring-1 ring-inset ring-white/[0.07]'
export const WELL = 'rounded-[12px] bg-v2-inset ring-1 ring-inset ring-white/[0.06]'

/* The strong secondary: ink on ground, the shape HeroTelemetry's account
   card already uses for "Create free account". Volt stays with the one
   primary action a view has. */
export const STRONG_BTN =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[11px] bg-v2-ink px-4 text-[14px] font-semibold text-v2-ground transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt focus-visible:ring-offset-2 focus-visible:ring-offset-v2-ground'

const TEXT_BASE =
  'inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt'
export const TEXT_BTN = `${TEXT_BASE} text-v2-ink2 hover:text-v2-ink`
export const INK_BTN = `${TEXT_BASE} text-v2-ink hover:bg-white/[0.04]`

export function PageHead({ kicker, title, lede, aside, id }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 max-w-[760px]">
        <Kicker tone="text-v2-ink2">{kicker}</Kicker>
        <h1 id={id} className="mt-3 break-words font-telemetry text-[clamp(2.8rem,6vw,5rem)] font-extrabold uppercase italic leading-[0.88] text-v2-ink">
          {title}
        </h1>
        {lede ? <p className="mt-4 max-w-[60ch] text-[16px] leading-[1.55] text-v2-ink2">{lede}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  )
}

/* One figure. The numeral is the telemetry face and the note is the
   framing it may not be shown without. `delta` carries its own sign and
   its own tone, because "up" and "good" point opposite ways on points
   against — the sign is direction, the colour is meaning. */
export function KpiTile({ label, value, delta, deltaTone = 'text-v2-ink2', note, tag, children }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[14px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <Kicker>{label}</Kicker>
        {tag ? (
          <span className="rounded-[5px] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3 ring-1 ring-inset ring-white/[0.08]">
            {tag}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className="font-telemetry text-[44px] font-bold leading-none text-v2-ink tabular-nums">{value}</span>
        {delta ? <span className={`font-mono text-[12px] font-semibold tabular-nums ${deltaTone}`}>{delta}</span> : null}
      </div>
      {children}
      {note ? <p className="mt-2 text-[12px] leading-[1.45] text-v2-ink3">{note}</p> : null}
    </div>
  )
}

export function PlatformBadge({ provider, size = 'sm' }) {
  const p = platformFor(provider)
  const dims = size === 'lg' ? 'h-9 w-9 text-[15px] rounded-[10px]' : 'h-[22px] w-[22px] text-[11px] rounded-[6px]'
  return (
    <span
      className={`grid shrink-0 place-items-center bg-white/[0.06] font-mono font-bold text-v2-ink ring-1 ring-inset ring-white/[0.14] ${dims}`}
      aria-hidden="true"
    >
      {p.mark}
    </span>
  )
}

/* The verdict vocabulary is the ledger's (verdicts.js) — glyph and label
   are read from it, never typed here. Only the tone is v2's own, because
   the production tone classes are the live palette's tokens. */
const V2_TONE = {
  good: 'text-v2-volt',
  bad: 'text-v2-loss',
  incon: 'text-v2-warn',
  changed: 'text-v2-warn',
  recchanged: 'text-v2-warn',
  pending: 'text-v2-ink2',
  ignored: 'text-v2-ink3',
  insuf: 'text-v2-ink3',
  expired: 'text-v2-ink3',
}

export function verdictTone(verdict) {
  return V2_TONE[verdict] || V2_TONE.pending
}

export function VerdictChip({ verdict }) {
  const v = verdictFor(verdict)
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] ring-1 ring-inset ring-white/[0.08] ${verdictTone(verdict)}`}>
      <span aria-hidden="true">{v.glyph}</span>
      {v.label}
    </span>
  )
}

/* A draft countdown, ticking once a second while it counts and never
   otherwise. `draftPhase()` is the one reading of the league's own
   `draftAt`/`draftStatus`; a finished or unscheduled draft draws nothing,
   because the rosters are then their own explanation. */
export function DraftClock({ league, className = '' }) {
  const at = league && league.draftAt
  const status = league && league.draftStatus
  const [state, setState] = useState(() => draftPhase(at, status))
  useEffect(() => {
    const next = draftPhase(at, status)
    setState(next)
    if (next.phase !== 'soon') return undefined
    const id = setInterval(() => setState(draftPhase(at, status)), 1000)
    return () => clearInterval(id)
  }, [at, status])

  if (state.phase === 'none' || state.phase === 'complete') return null
  const label = state.phase === 'drafting' ? 'Drafting now' : state.phase === 'late' ? 'Draft time passed' : 'Drafts in'
  const tone = state.phase === 'late' ? 'text-v2-warn ring-v2-warn/30' : 'text-v2-cyan ring-v2-cyan/30'
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] tabular-nums ring-1 ring-inset ${tone} ${className}`}>
      {state.parts ? `${label} ${state.parts.full}` : label}
    </span>
  )
}

/* "Connect a league", in v2 clothes, over the production flow.

   The trigger is ours and the dialog is the real ConnectLeagueModal — the
   platform step, the Sleeper username and ESPN id, the tier-limit screen —
   because a second connect flow here would be a second answer to one
   question, and the worker enforces the same cap whichever opens it.
   The logic is ConnectLeagueCta's: signed out it is Clerk's sign-up (a
   connection is stored against an account, so there is nowhere to put one
   without it); signed in it opens the dialog, or lands straight on the
   tier-limit screen when the cap is already known to be reached. Without
   a Clerk key a signed-out trigger is inert, the fallback every account
   surface in this build makes. */
export function ConnectButton({ variant = 'volt', label = 'Connect a league', signedOutLabel, className = '', children }) {
  const ref = useRef(null)
  const ready = useAccountUiReady()
  const signedIn = useSignedIn()
  const { tier, status: tierStatus } = useTier()
  const { leagues } = useLeague()

  const text = children || (!signedIn && signedOutLabel ? signedOutLabel : label)
  const make = (onClick) => {
    if (variant === 'volt') return <VoltButton onClick={onClick} size="md" className={className}>{text}</VoltButton>
    if (variant === 'strong') return <button type="button" onClick={onClick} className={`${STRONG_BTN} ${className}`}>{text}</button>
    if (variant === 'row') {
      return (
        <button
          type="button"
          onClick={onClick}
          className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[14px] border border-dashed border-white/[0.18] px-4 text-left text-[14px] text-v2-ink transition-colors hover:border-white/[0.3] hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt ${className}`}
        >
          {text}
        </button>
      )
    }
    return <GhostButton onClick={onClick} className={className}>{text}</GhostButton>
  }

  if (!signedIn) {
    if (!ready) return make(undefined)
    return <SignUpButton mode="modal">{make(undefined)}</SignUpButton>
  }

  const open = () => {
    if (tierStatus === 'ready' && leagues.length >= leagueCap(tier)) {
      ref.current?.openAtLimit(tier, leagueCap(tier))
      return
    }
    ref.current?.open()
  }

  return (
    <>
      {make(open)}
      <ConnectLeagueModal ref={ref} onConnected={noteLeagueConnected} />
    </>
  )
}

/* An honest state for a page: loading nothing, failing, or empty. */
export function Notice({ title, body, children, tone = 'default' }) {
  return (
    <div className={`${CARD} p-6 sm:p-8`} role={tone === 'error' ? 'alert' : undefined}>
      {tone === 'error' ? (
        <span className="mb-3 inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-v2-warn">
          <span className="h-1.5 w-1.5 rounded-full bg-v2-warn" aria-hidden="true" /> Could not read
        </span>
      ) : null}
      <h2 className="font-telemetry text-[30px] font-bold uppercase italic leading-[0.95] text-v2-ink">{title}</h2>
      {body ? <p className="mt-3 max-w-[60ch] text-[15px] leading-[1.6] text-v2-ink2">{body}</p> : null}
      {children ? <div className="mt-5 flex flex-wrap items-center gap-2.5">{children}</div> : null}
    </div>
  )
}

export function Chevron({ open, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 16 16" className={`${className} transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function median(nums) {
  if (!nums.length) return 0
  const s = nums.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function pct(p) {
  return typeof p === 'number' ? `${Math.round(p * 100)}%` : '—'
}
