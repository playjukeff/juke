import { useEffect, useRef, useState } from 'react'
import ConnectLeagueModal from '../../shell/ConnectLeagueModal.jsx'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { noteLeagueConnected } from '../../../hooks/useLeague.js'
import { useSignedIn } from '../../../hooks/useAuthState.js'
import { leagueCap } from '../../../lib/tiers.js'
import { countdownParts, draftPhase } from '../../../lib/countdown.js'
import { useLeagueFresh, useTierFresh } from '../../v2/stores.js'
import { verdictFor } from '../../ledger/verdicts.js'
import { CallButton, Icon, Label, QuietButton, Sheet, cx } from '../ui.jsx'
import { BarFill, CountText, Reveal } from '../motion.jsx'

/* Pieces the connected Now, League and team pages share. v3 primitives
   that ui.jsx does not carry live here (the brief's rule: a missing
   primitive is written in the owning directory), and each is named in the
   builder's report: WinBar, KpiGrid, SampleTag, InjuryChip, ResultChip,
   LeagueSwitcher, ConnectCall. */

/* A whole percent and never a decimal: ten thousand seasons put the
   standard error at half a point, so a tenth is a digit the simulation
   cannot support (seasonSim.js). */
export function pct(p) {
  return typeof p === 'number' ? `${Math.round(p * 100)}%` : '—'
}

/* SAMPLE, on an invented figure the reader could meet without the notice
   that explains it — a block further down the page, or one that re-mounts
   as a control changes. Warn, because it is a caution about the number
   beside it.

   Deliberately NOT on every card. It was, and on the League demo that put
   seven SAMPLE badges in one viewport: one per KPI, plus the eyebrow, plus
   the band, plus the notice card directly above them that already says it
   in a full sentence. A caution repeated past the point of being read is
   decoration, and it costs the badge its force in the places further down
   where the notice really has been scrolled past. The rule is the reader's
   distance from the explanation, not the card. */
export function SampleTag({ className = '' }) {
  return (
    <span className={cx('inline-flex shrink-0 items-center rounded-[4px] bg-v3-warnWash px-1.5 py-0.5 font-figure text-[11px] font-bold uppercase tracking-[0.12em] text-v3-warn', className)}>
      Sample
    </span>
  )
}

/* A countdown to an instant, once a second, and null once it has passed —
   countdown.js's own rule: a countdown that has run out is a different
   thing, and the caller says which. */
export function useCountdown(at) {
  const [parts, setParts] = useState(() => (at ? countdownParts(at - Date.now()) : null))
  useEffect(() => {
    if (!at) { setParts(null); return undefined }
    const tick = () => setParts(countdownParts(at - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [at])
  return parts
}

/* The next NFL kickoff, off production's nextKickoff() — the same source
   the shell's header reads, so the two never disagree. Nothing when there
   is nothing honest to count to. */
export function useKickoff() {
  const [at, setAt] = useState(null)
  useEffect(() => {
    let alive = true
    const read = () => {
      const e = window.JukeEngine
      if (!e || !e.nextKickoff) return
      const next = e.nextKickoff() || null
      if (next) { if (alive) setAt(next); return }
      if (e.primeScores) e.primeScores().then(() => { if (alive && e.nextKickoff) setAt(e.nextKickoff() || null) })
    }
    read()
    const id = setInterval(() => { if (!at || at <= Date.now()) read() }, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [at])
  return useCountdown(at)
}

/* draftPhase() re-read once a second while it counts, so "soon" becomes
   "late" on the second it should rather than on the next render. */
export function useDraftPhase(at, status) {
  const [state, setState] = useState(() => draftPhase(at, status))
  useEffect(() => {
    const next = draftPhase(at, status)
    setState(next)
    if (next.phase !== 'soon') return undefined
    const id = setInterval(() => setState(draftPhase(at, status)), 1000)
    return () => clearInterval(id)
  }, [at, status])
  return state
}

/* A date in the reader's own zone, with the zone named — a draft is a wall
   clock somebody has to be awake for. */
export function whenText(ms, withZone = true) {
  try {
    return new Date(ms).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      ...(withZone ? { timeZoneName: 'short' } : {}),
    })
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  }
}

/* One player's availability chip. Out and bye are one fact for a lineup —
   the slot scores nothing — so both take cost; a designation that is only
   a doubt takes warn. The code itself is printed so a bye is never
   mistaken for an injury. */
const CODE_WORD = { O: 'Out' }
export function InjuryChip({ severity, onBye, code }) {
  const out = onBye || severity === 'out'
  return (
    <span className={cx('inline-flex h-[22px] shrink-0 items-center rounded-[4px] px-1.5 font-figure text-[12px] font-bold uppercase tracking-[0.06em]', out ? 'bg-v3-costWash text-v3-cost' : 'bg-v3-warnWash text-v3-warn')}>
      {onBye ? 'Bye' : CODE_WORD[code] || code || 'Q'}
    </span>
  )
}

export function ResultChip({ result }) {
  if (!result) return <span className="inline-grid h-[22px] w-[22px] place-items-center rounded-[4px] bg-v3-well font-figure text-[12px] text-v3-ink3">—</span>
  const tone = result === 'W' ? 'bg-v3-gainWash text-v3-gain' : result === 'L' ? 'bg-v3-costWash text-v3-cost' : 'bg-v3-well text-v3-ink'
  return (
    <span className={cx('inline-grid h-[22px] w-[22px] place-items-center rounded-[4px] font-figure text-[12px] font-bold', tone)} aria-label={result === 'W' ? 'won' : result === 'L' ? 'lost' : 'tied'}>
      {result}
    </span>
  )
}

/* A verdict from the ledger's own vocabulary — glyph and label read from
   verdicts.js, only the tone is v3's. */
const VERDICT_TONE = { good: 'text-v3-gain', bad: 'text-v3-cost', incon: 'text-v3-warn', changed: 'text-v3-warn', recchanged: 'text-v3-warn' }
export function Verdict({ verdict }) {
  const v = verdictFor(verdict)
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1.5 font-figure text-[12px] font-bold uppercase tracking-[0.08em]', VERDICT_TONE[verdict] || 'text-v3-ink3')}>
      <span aria-hidden="true">{v.glyph}</span>{v.label}
    </span>
  )
}

/* A win probability, as a length with EVEN drawn on it.

   50% is the one reference value here that is not measured from anything,
   and without it a bar is a length a reader compares against a number in
   their head — which side of the line the fill ends is the whole reading.
   The colour follows matchupRead(): gain when favoured, cost when behind,
   ink when close, because a coin toss is not a gain. */
export function WinBar({ p, read, className = '' }) {
  const fill = read === 'favoured' ? 'bg-v3-gain' : read === 'behind' ? 'bg-v3-cost' : 'bg-v3-ink2'
  return (
    <div className={cx('relative pt-4', className)}>
      <span className="absolute left-1/2 top-0 -translate-x-1/2 font-figure text-[11px] uppercase tracking-[0.1em] text-v3-ink3">even</span>
      <div className="relative h-3 overflow-hidden rounded-full bg-v3-well" role="img" aria-label={`Win probability ${pct(p)}`}>
        <BarFill width={Math.max(0, Math.min(1, p || 0)) * 100} className={cx('absolute inset-y-0 left-0 rounded-full', fill)} style={{ width: `${Math.max(0, Math.min(1, p || 0)) * 100}%` }} />
        <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-v3-ink" aria-hidden="true" />
      </div>
    </div>
  )
}

/* Four numbers in one ruled grid: the cells share hairlines rather than
   each drawing a card, so the strip reads as one reading of the season.
   A figure that is one number ("80%", "820.0", "$100") ticks up to itself
   on first view (motion.jsx CountText); a record, an ordinal or a word is
   drawn as it is. The strip rises as one piece — its cells are divided by
   the grid's own ground, which a per-cell stagger would show as grey
   tiles on the way in. */
export function KpiGrid({ items }) {
  return (
    <Reveal className="grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-v3-rule bg-v3-rule lg:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="min-w-0 bg-v3-sheet p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <Label>{k.label}</Label>
            {k.tag}
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <CountText text={k.value} className="font-figure text-[28px] font-bold leading-none tabular-nums text-v3-ink sm:text-[34px]" />
            {k.delta}
          </div>
          {k.children}
          {k.note ? <p className="mt-2 text-[13px] leading-[1.45] text-v3-ink2">{k.note}</p> : null}
        </div>
      ))}
    </Reveal>
  )
}

/* A failed read, said as the failure it was, with the one thing to do.

   `provider` rather than only the platform's display NAME, because the two
   refusals behind a 403 have different fixes and only one of them is a
   league setting:

     ESPN   a public league that stopped being public -- League Settings,
            visibility -- OR a private one whose saved sign-in has expired
     CBS    only ever the second. There is no public CBS league to make
            public: every endpoint that says who is in a league answers
            "User not signed in" anonymously, which is why its connect
            dialog asks for the cookie in the same step as the address

   This card read "ESPN will only let Juke read a public league" under a
   CBS league, which is the hardcoded-platform-name bug CLAUDE.md already
   records fixing once in LeagueRoomLive -- and its own instruction was to
   grep for the previous platform's name when a new one ships. That was not
   done when CBS landed, so it sent a CBS reader to an ESPN setting that
   does not exist on their platform. */
export function CouldNotRead({ reason, platform, provider, onRetry, children }) {
  const cbs = provider === 'cbs'
  return (
    <Sheet code="Could not read your league" aside={platform} role="alert">
      <p className="text-[18px] font-extrabold text-v3-ink">
        {reason === 'not-found'
          ? 'That league is no longer readable'
          : reason === 'private'
            ? `${platform} would not show Juke this league`
            : `${platform} did not answer`}
      </p>
      <p className="mt-2 max-w-[62ch] text-[15px] leading-[1.55] text-v3-ink2">
        {reason === 'not-found'
          ? `${platform} does not return this league any more. It may have been deleted, or the season rolled over — reconnect it from your account.`
          : reason === 'private'
            ? cbs
              ? 'Your saved CBS sign-in has stopped working. Reconnect the league from your account and paste a fresh key.'
              : 'Either your saved ESPN sign-in has stopped working — reconnect the league from your account — or, if this league was public, check that visibility is still set to public in League Settings.'
            : 'Nothing is wrong with your league; this page could not fetch it. Try again in a moment.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {onRetry ? <QuietButton onClick={onRetry}>Try again</QuietButton> : null}
        {children}
      </div>
    </Sheet>
  )
}

/* "Connect a league", over production's own dialog.

   A second connect flow would be a second answer to one question, so the
   dialog is the real ConnectLeagueModal — platform step, Sleeper username,
   ESPN id, tier-limit screen — opened straight onto the limit when the cap
   is already known to be reached. Signed out there is nowhere to store a
   connection, so the button goes to the account page instead. */
export function ConnectCall({ primary = false, label = 'Connect a league', className = '' }) {
  const signedIn = useSignedIn()
  const { tier, status: tierStatus } = useTierFresh()
  const { leagues } = useLeagueFresh()
  const ref = useRef(null)
  const Btn = primary ? CallButton : QuietButton
  if (!signedIn) {
    return <Btn href="#/account" className={className}>Log in to connect <Icon name="arrow" className="h-4 w-4" /></Btn>
  }
  const open = () => {
    if (tierStatus === 'ready' && leagues.length >= leagueCap(tier)) ref.current?.openAtLimit(tier, leagueCap(tier))
    else ref.current?.open()
  }
  return (
    <>
      <Btn onClick={open} className={className}>{label}</Btn>
      <ConnectLeagueModal ref={ref} onConnected={noteLeagueConnected} />
    </>
  )
}

function PlatformMark({ provider }) {
  const p = platformFor(provider)
  return (
    <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[4px] bg-v3-band font-figure text-[12px] font-bold text-white" aria-hidden="true">
      {p.mark}
    </span>
  )
}

/* Which connected league these pages read, and how to read another.

   Production's LeagueSwitcher behaviour over the same store calls:
   select() is optimistic and settles back on failure, so the checked row is
   always the league that IS active, and the menu stays open saying so when
   a switch fails. "Connect another" is the real dialog; disconnecting lives
   on the League page's facts panel, two presses, where the league it
   removes is named. Offered at every width — a phone is where a second
   league is most often checked. */
export function LeagueSwitcher() {
  const { status, leagues, league, select } = useLeagueFresh()
  const { tier, status: tierStatus } = useTierFresh()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(null)
  const wrapRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const modalRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const items = () => (menuRef.current ? [...menuRef.current.querySelectorAll('[role^="menuitem"]')] : [])
    const first = items()[0]
    if (first) first.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current && triggerRef.current.focus(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const list = items()
        if (!list.length) return
        e.preventDefault()
        const at = list.indexOf(document.activeElement)
        const next = e.key === 'ArrowDown' ? (at + 1) % list.length : (at - 1 + list.length) % list.length
        list[next].focus()
      }
    }
    const onOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onOutside)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onOutside) }
  }, [open])

  if (status !== 'connected' || !league) return null

  const pick = async (next) => {
    setFailed(null)
    setBusy(true)
    const res = await select(next)
    setBusy(false)
    if (res.ok) { setOpen(false); triggerRef.current && triggerRef.current.focus(); return }
    setFailed(res.reason || 'error')
  }
  const connectAnother = () => {
    setOpen(false)
    if (tierStatus === 'ready' && leagues.length >= leagueCap(tier)) modalRef.current?.openAtLimit(tier, leagueCap(tier))
    else modalRef.current?.open()
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen((v) => !v); setFailed(null) }}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex min-h-[44px] max-w-full items-center gap-2.5 rounded-[6px] border border-v3-rule bg-v3-sheet px-3 text-[15px] font-semibold text-v3-ink transition-colors hover:border-v3-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call focus-visible:ring-offset-2"
      >
        <PlatformMark provider={league.provider} />
        <span className="min-w-0 truncate">{league.name}</span>
        <span className="hidden font-figure text-[12px] uppercase tracking-[0.1em] text-v3-ink3 sm:inline">{leagues.length} {leagues.length === 1 ? 'league' : 'leagues'}</span>
        <Icon name="arrow" className={cx('h-4 w-4 shrink-0 text-v3-ink2 transition-transform motion-reduce:transition-none', open ? '-rotate-90' : 'rotate-90')} />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Your leagues"
          className="absolute left-0 z-50 mt-2 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-[6px] border border-v3-rule bg-v3-sheet shadow-[0_16px_40px_-12px_rgb(var(--v3-shade)/0.3)] lg:left-auto lg:right-0"
        >
          <div className="bg-v3-band px-4 py-2.5 font-figure text-[12px] font-bold uppercase tracking-[0.14em] text-white">Your leagues</div>
          {leagues.map((lg) => {
            const on = lg.provider === league.provider && lg.leagueId === league.leagueId
            const plat = platformFor(lg.provider)
            return (
              <button
                key={lg.provider + ':' + lg.leagueId}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                disabled={busy}
                onClick={() => pick(lg)}
                className={cx('flex min-h-[52px] w-full items-start gap-3 border-b border-v3-rule px-4 py-3 text-left transition-colors hover:bg-v3-paper focus-visible:bg-v3-paper focus-visible:outline-none disabled:cursor-wait', on ? 'bg-v3-paper' : '')}
              >
                <PlatformMark provider={lg.provider} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-v3-ink">{lg.name}</span>
                  <span className="mt-0.5 block truncate font-figure text-[12px] uppercase tracking-[0.08em] text-v3-ink3">
                    {plat.name}{lg.season ? ` · ${lg.season}` : ''}{lg.totalTeams ? ` · ${lg.totalTeams} teams` : ''}
                  </span>
                  <MenuDraftLine league={lg} />
                </span>
                <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border', on ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule')} aria-hidden="true">
                  {on ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                </span>
              </button>
            )
          })}
          {failed ? (
            <p className="px-4 py-2.5 text-[13px] leading-[1.45] text-v3-cost" role="alert">
              {failed === 'not-connected' ? 'That league is no longer connected to this account.' : 'Could not switch just now — still on the league checked above.'}
            </p>
          ) : null}
          <button type="button" role="menuitem" onClick={connectAnother} className="flex min-h-[48px] w-full items-center gap-2.5 px-4 text-left text-[15px] font-semibold text-v3-ink hover:bg-v3-paper focus-visible:bg-v3-paper focus-visible:outline-none">
            <span aria-hidden="true" className="font-figure text-[18px] leading-none">+</span> Connect another league
          </button>
          <a href="#/account" role="menuitem" onClick={() => setOpen(false)} className="flex min-h-[48px] items-center gap-2.5 border-t border-v3-rule px-4 text-[15px] text-v3-ink2 hover:bg-v3-paper hover:text-v3-ink focus-visible:bg-v3-paper focus-visible:outline-none">
            <Icon name="account" className="h-4 w-4" /> Manage leagues
          </a>
        </div>
      ) : null}

      <ConnectLeagueModal ref={modalRef} onConnected={noteLeagueConnected} />
    </div>
  )
}

/* The connected-league cache carries each league's draft time, so the menu
   can say which league is about to draft without a snapshot per row. */
function MenuDraftLine({ league }) {
  const d = useDraftPhase(league.draftAt, league.draftStatus)
  if (d.phase === 'none' || d.phase === 'complete') return null
  return (
    <span className={cx('mt-1 block font-figure text-[12px] font-semibold uppercase tracking-[0.08em]', d.phase === 'late' ? 'text-v3-warn' : 'text-v3-ink2')}>
      {d.phase === 'drafting' ? 'Drafting now' : d.phase === 'late' ? 'Draft time passed' : `Drafts in ${d.parts.full}`}
    </span>
  )
}
