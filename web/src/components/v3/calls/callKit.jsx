import { useState } from 'react'
import { SignInButton, SignUpButton } from '@clerk/clerk-react'
import { useAccountUiReady } from '../../../hooks/useAccountUiReady.js'
import { useSignedIn } from '../../../hooks/useAuthState.js'
import { LINE as PLATFORM_LINE } from '../../shell/leaguePlatforms.js'
import { meetsTier, tierLabel } from '../../../lib/tiers.js'
import { useTierFresh } from '../../v2/stores.js'
import { CallButton, Fig, Icon, Label, PageHead, PosTag, QuietButton, Sheet, Skeleton, cx, ordinal } from '../ui.jsx'

/* The call tools' own parts, in the Call Sheet idiom.

   Written here rather than in ui.jsx because the brief keeps ui.jsx closed;
   each is a small composition of ui.jsx's primitives, and two of them are
   genuinely new shapes worth naming in the report:

     MarkedBar  a ValueBar with a reference line and a word on it — the
                win probability's EVEN, which is the one reference on these
                pages that is not measured from anything.
     Steps      the numbered "how the call is made" list Now draws inline;
                every tool opens with one, so it is a part here.

   No colour is chosen in this file that ui.jsx's header does not already
   assign a job: cobalt only on CallButton, ink for chosen state, gain/cost
   for a value's direction, warn for caution (an injury, a SAMPLE label). */

export function playerHref(p) {
  return p && p.id ? `#/v3/players/${encodeURIComponent(String(p.id))}` : null
}
export function teamHref(t) {
  return t && t.rosterId !== null && t.rosterId !== undefined ? `#/v3/league/team/${encodeURIComponent(String(t.rosterId))}` : null
}

export function BackToNow() {
  return (
    <a
      href="#/v3"
      className="-ml-1 inline-flex min-h-[40px] items-center gap-1.5 rounded-[4px] px-1 font-figure text-[12px] font-semibold uppercase tracking-[0.12em] text-v3-ink2 hover:text-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call"
    >
      <Icon name="back" className="h-4 w-4" /> Back to Now
    </a>
  )
}

/* Every tool page opens the same way: the way back, the call as a sentence
   (the page's headline), its arithmetic in one line, and the situation band.
   `action` is the page's one primary action, when it has one. */
export function CallHead({ label, title, lede, action, band }) {
  return (
    <div className="grid gap-5">
      <div><BackToNow /></div>
      <PageHead label={label} title={title} lede={lede} action={action} />
      {band}
    </div>
  )
}

/* What the band says on a sample page: how the invented league was made. */
export function sampleBandItems(info, what) {
  if (!info) return ['a sample league', 'not your league']
  return [
    `${info.teams} teams drafted by ADP on tonight’s board`,
    `your sample team picks ${ordinal(info.seat)}`,
    what,
    'not your league',
  ].filter(Boolean)
}

export function SampleTag({ className = '' }) {
  return (
    <span className={cx('inline-flex h-[22px] shrink-0 items-center rounded-[4px] bg-v3-warnWash px-1.5 font-figure text-[11px] font-bold uppercase tracking-[0.12em] text-v3-warn', className)}>
      Sample
    </span>
  )
}

/* The situation a tool is reading: which league, which week, whose numbers.
   The same solid band Now opens with, so every page says where it is before
   it says anything else. A sample page leads the band with SAMPLE. */
export function SituationBand({ items, sample = false, lead }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-[6px] bg-v3-band px-4 py-2.5 font-figure text-[13px] text-v3-bandInk">
      {sample && <span className="rounded-[4px] bg-v3-warnWash px-1.5 py-0.5 font-bold uppercase tracking-[0.12em] text-v3-warn">Sample</span>}
      {lead && <span className="font-bold uppercase tracking-[0.14em] text-white">{lead}</span>}
      {items.filter(Boolean).map((it, i) => (
        <span key={i}>{it}</span>
      ))}
    </div>
  )
}

/* A player in a list. The name is a link to his page; `right` is whatever
   the row measures him by. */
export function PlayerRow({ player, name, pos, meta, right, dim = false, lead }) {
  const href = playerHref(player)
  const label = name || (player ? player.name : 'Empty slot')
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-v3-rule py-2.5 last:border-b-0">
      <span className="flex items-center gap-2">
        {lead}
        <PosTag pos={pos || (player ? player.pos : 'DST')} />
      </span>
      <span className="min-w-0">
        {href && !dim ? (
          <a href={href} className="block truncate text-[15px] font-semibold text-v3-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
            {label}
          </a>
        ) : (
          <span className={cx('block truncate text-[15px] font-semibold', dim ? 'text-v3-ink3' : 'text-v3-ink')}>{label}</span>
        )}
        {meta && <span className="mt-0.5 block truncate font-figure text-[12px] text-v3-ink3">{meta}</span>}
      </span>
      <span className="shrink-0 text-right">{right}</span>
    </li>
  )
}

/* A projected figure. A dash for a missing one, never a 0 — on these
   screens a 0 is a real and very different projection. */
export function Pts({ value, digits = 1, className = '' }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className={cx('font-figure text-[15px] text-v3-ink3', className)}>—</span>
  return <Fig className={cx('text-[16px] font-bold text-v3-ink', className)}>{Number(value).toFixed(digits)}</Fig>
}

/* A signed whole-number value with a real minus, no sign on zero, and the
   caller's tone. Used where Delta's colour-by-sign is wrong: a wire player at
   or below replacement has not COST anybody anything, so he takes ink3. */
export function Signed({ value, tone, className = '' }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className={cx('font-figure text-v3-ink3', className)}>—</span>
  const n = Math.round(value)
  const txt = n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0'
  const color = tone === 'gain' ? 'text-v3-gain' : tone === 'cost' ? 'text-v3-cost' : tone === 'quiet' ? 'text-v3-ink3' : 'text-v3-ink'
  return <span className={cx('font-figure font-semibold tabular-nums', color, className)}>{txt}</span>
}

/* An injury or a bye, said in a chip. Out and bye are cost (the slot scores
   nothing); a questionable tag is caution. */
export function StatusChip({ row }) {
  const out = row.onBye || row.severity === 'out'
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className={cx('rounded-[4px] px-1.5 py-0.5 font-figure text-[11px] font-bold uppercase tracking-[0.1em]', out ? 'bg-v3-costWash text-v3-cost' : 'bg-v3-warnWash text-v3-warn')}>
        {row.onBye ? 'Bye' : row.player.inj}
      </span>
      <span className="font-figure text-[11px] uppercase tracking-[0.08em] text-v3-ink3">{row.onBye ? 'not playing' : row.severity}</span>
    </span>
  )
}

/* A bar with a reference mark on it. The mark is a line AND a word, above
   the track, so it can never be mistaken for the fill's own end. */
export function MarkedBar({ value, max = 1, tone = 'neutral', marker, label, className = '' }) {
  const share = max ? Math.max(0, Math.min(1, (value || 0) / max)) : 0
  const fill = tone === 'gain' ? 'bg-v3-gain' : tone === 'cost' ? 'bg-v3-cost' : 'bg-v3-ink2'
  const at = marker ? Math.max(0, Math.min(1, marker.at / max)) * 100 : null
  return (
    <div className={cx('relative pt-6', className)} role="img" aria-label={label}>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-v3-well">
        <span className={cx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none', fill)} style={{ width: `${share * 100}%` }} />
      </div>
      {marker && (
        <>
          <span aria-hidden="true" className="absolute bottom-[-4px] top-[18px] w-[2px] -translate-x-1/2 bg-v3-ink" style={{ left: `${at}%` }} />
          <span aria-hidden="true" className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-figure text-[11px] font-bold uppercase tracking-[0.12em] text-v3-ink" style={{ left: `${at}%` }}>
            {marker.label}
          </span>
        </>
      )}
    </div>
  )
}

/* The arithmetic behind a call, as the sequence it actually is. */
export function Steps({ children }) {
  return <ol className="grid gap-4">{children}</ol>
}
export function Step({ n, what, sub, children }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-v3-band font-figure text-[13px] font-bold text-white" aria-hidden="true">{n}</span>
      <div className="min-w-0">
        <div className="text-[15px] font-bold leading-snug text-v3-ink">
          {what}{sub && <span className="font-normal text-v3-ink2"> — {sub}</span>}
        </div>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </li>
  )
}

/* Two or three named quantities on one scale, for a Step. Wraps on its
   container: below ~22rem the bar takes its own line under the name. */
export function StepBars({ rows, max, digits = 1 }) {
  return (
    <div className="grid gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,10rem)_1fr_4rem]">
          <span className="truncate text-[13px] text-v3-ink2">{r.label}</span>
          <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
            <span className="relative block h-2 overflow-hidden rounded-full bg-v3-well">
              <span
                className={cx('absolute inset-y-0 left-0 rounded-full', r.tone === 'gain' ? 'bg-v3-gain' : r.tone === 'cost' ? 'bg-v3-cost' : 'bg-v3-ink2')}
                style={{ width: `${max ? Math.max(0, Math.min(1, (r.value || 0) / max)) * 100 : 0}%` }}
              />
            </span>
          </span>
          <Fig className="text-right text-[14px] font-bold text-v3-ink">
            {r.value === null || r.value === undefined ? '—' : r.signed ? (r.value > 0 ? '+' : r.value < 0 ? '−' : '') + Math.abs(r.value).toFixed(digits) : Number(r.value).toFixed(digits)}
          </Fig>
        </div>
      ))}
    </div>
  )
}

/* A small figure cell for a strip of facts. */
export function FactCell({ label, value, note, tone }) {
  const color = tone === 'gain' ? 'text-v3-gain' : tone === 'cost' ? 'text-v3-cost' : 'text-v3-ink'
  return (
    <div className="min-w-0 rounded-[6px] bg-v3-paper p-3">
      <dt><Label className="text-[11px]">{label}</Label></dt>
      <dd className={cx('mt-1 truncate font-figure text-[24px] font-bold leading-none tabular-nums', color)}>{value}</dd>
      {note && <dd className="mt-1.5 text-[13px] leading-[1.45] text-v3-ink2">{note}</dd>}
    </div>
  )
}

export function Note({ children, className = '' }) {
  return <p className={cx('border-t border-v3-rule pt-3 text-[13px] leading-[1.55] text-v3-ink2', className)}>{children}</p>
}

export function Empty({ children }) {
  return <p className="py-8 text-center text-[15px] leading-[1.55] text-v3-ink2">{children}</p>
}

export function Loading({ lines = 6 }) {
  return (
    <div role="status" aria-label="Loading" className="rounded-[6px] border border-v3-rule bg-v3-sheet p-5">
      <Skeleton lines={lines} />
    </div>
  )
}

export function CouldNotRead({ reason, onRetry }) {
  return (
    <Sheet code="Your league" aside="Not read" role="alert">
      <p className="text-[17px] font-bold text-v3-ink">We could not read your league.</p>
      <p className="mt-2 max-w-[58ch] text-[15px] leading-[1.55] text-v3-ink2">
        {reason === 'not-found'
          ? 'That league no longer answers. It may have been deleted, or made private.'
          : 'Nothing is wrong with your roster — this page just could not fetch it.'}
      </p>
      {onRetry && <QuietButton onClick={onRetry} className="mt-4">Try again</QuietButton>}
    </Sheet>
  )
}

export function NoTeam({ teams, what }) {
  return (
    <Sheet code="Your team" aside="Not found">
      <p className="max-w-[60ch] text-[15px] leading-[1.55] text-v3-ink2">
        Reconnect this league to {what} — Juke does not know which of the {teams} rosters is yours.
      </p>
      <div className="mt-4"><QuietButton href="#/v3/account">Your leagues</QuietButton></div>
    </Sheet>
  )
}

/* The way in for somebody with no league. Signed out: Clerk's own sign-up
   and log-in (plain links to the account page in a keyless build, the same
   fallback the shell header makes). Signed in with no league: the account
   page, where connecting lives. Read-only is a promise and it is said here. */
export function WayIn() {
  const ready = useAccountUiReady()
  const signedIn = useSignedIn()
  if (signedIn) {
    return (
      <div className="grid gap-2">
        <CallButton href="#/v3/account">Connect a league <Icon name="arrow" className="h-4 w-4" /></CallButton>
      </div>
    )
  }
  const signup = <CallButton>Sign up &amp; connect <Icon name="arrow" className="h-4 w-4" /></CallButton>
  const login = <QuietButton>Log in</QuietButton>
  return (
    <div className="flex flex-wrap gap-2">
      {ready ? <SignUpButton mode="modal">{signup}</SignUpButton> : <CallButton href="#/v3/account">Sign up &amp; connect <Icon name="arrow" className="h-4 w-4" /></CallButton>}
      {ready ? <SignInButton mode="modal">{login}</SignInButton> : <QuietButton href="#/v3/account">Log in</QuietButton>}
    </div>
  )
}

export function ReadOnlyLine() {
  return (
    <p className="font-figure text-[13px] text-v3-ink3">
      Read-only — Juke never edits your league · {PLATFORM_LINE}
    </p>
  )
}

/* A section this tier cannot open yet — production's UpgradeGate rule:
   drawn and then obscured rather than withheld, an unknown tier reaches
   nothing (a gate that falls open while the tier loads flashes paid
   content), and billing is not built so the card is an email capture that
   says so. The obscured half is aria-hidden and inert. */
export function TierGate({ need, title, children }) {
  const { tier } = useTierFresh()
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
    <div className="relative min-h-[420px] overflow-hidden rounded-[6px]">
      <div aria-hidden="true" inert="" className="pointer-events-none select-none blur-[4px]">{children}</div>
      <div className="absolute inset-0 flex items-start justify-center p-4 pt-10">
        <Sheet code={`Locked · ${tierLabel(need)}`} aside={<Icon name="lock" className="h-4 w-4" />} className="w-full max-w-[460px]">
          <p className="text-[19px] font-black leading-tight tracking-[-0.01em] text-v3-ink">{title}</p>
          <p className="mt-2 text-[14px] leading-[1.55] text-v3-ink2">
            It is real and it is behind {tierLabel(need)} — which is not on sale yet. Leave an email and we will tell you when it is.
          </p>
          {state === 'success' ? (
            <p className="mt-4 text-[14px] font-semibold text-v3-gain" role="status">You are on the list. Nothing else to do.</p>
          ) : (
            <form onSubmit={submit} noValidate className="mt-4 flex flex-wrap gap-2">
              <label className="sr-only" htmlFor={`v3-upgrade-${need}`}>Email address</label>
              <input
                id={`v3-upgrade-${need}`}
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (state !== 'idle') setState('idle') }}
                placeholder="you@example.com"
                className="min-h-[44px] min-w-0 flex-1 rounded-[6px] border border-v3-rule bg-v3-sheet px-3 text-[16px] text-v3-ink placeholder:text-v3-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call"
              />
              <QuietButton type="submit">{state === 'submitting' ? 'Sending…' : 'Tell me'}</QuietButton>
            </form>
          )}
          {state === 'invalid' && <p className="mt-2 text-[13px] text-v3-cost" role="alert">That does not look like an email.</p>}
          {state === 'error' && <p className="mt-2 text-[13px] text-v3-cost" role="alert">That did not send. Nothing was lost — try again in a moment.</p>}
        </Sheet>
      </div>
    </div>
  )
}

/* A gated option's label for a Seg: the section name, a lock while this
   reader is below the tier, and the tier's name. */
export function GatedLabel({ text, gate, tier }) {
  if (!gate) return text
  const shut = !meetsTier(tier, gate)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {text}
      {shut && <Icon name="lock" className="h-3.5 w-3.5" />}
    </span>
  )
}
