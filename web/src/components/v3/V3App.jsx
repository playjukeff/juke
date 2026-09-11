import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SignInButton, SignedIn, SignedOut, UserButton } from '@clerk/clerk-react'
import JukeLogo from '../juke-logo/JukeLogo.jsx'
import { useAccountUiReady } from '../../hooks/useAccountUiReady.js'
import { useSignedIn } from '../../hooks/useAuthState.js'
import { countdownParts } from '../../lib/countdown.js'
import { Icon, Label, Headline, CallButton, QuietButton, cx } from './ui.jsx'
import { THEME_CHOICES, mountTheme, useV3Theme } from './theme.js'
import Now from './now/Now.jsx'
import V3League from './league/V3League.jsx'
import V3Team from './league/V3Team.jsx'
import V3DraftHome from './draft/V3DraftHome.jsx'
import V3Live from './draft/V3Live.jsx'
import V3Report from './draft/V3Report.jsx'
import V3Insights from './draft/V3Insights.jsx'
import V3Players from './players/V3Players.jsx'
import V3Player from './players/V3Player.jsx'
import V3Rookies from './players/V3Rookies.jsx'
import V3Call from './calls/V3Call.jsx'
import V3Record from './record/V3Record.jsx'
import V3Account from './account/V3Account.jsx'
import V3Method from './method/V3Method.jsx'

/* Juke v3 — "Call Sheet". The full-autonomy proposal: its own information
   architecture, not a restyle of production or of v2.

   ---- The information architecture, in one sentence ----

   Organised by the decision in front of you, not by the room it lives in.
   Production has six rooms and three account pages; v3 has five places:

     Now      the calls in front of you today — the week's lineup swap, the
              claim worth making, the trade window, the draft countdown — or,
              signed out, what a priced call looks like
     League   standings, the schedule, playoff odds, every team's roster
     Players  every player on the board, one page each; rookies are a view
     Draft    mock drafts: start, draft, the report, your insights
     Record   every draft you have run and every call you were given, graded

   The three in-season rooms become TOOLS a call opens (calls/lineup,
   calls/wire, calls/trade) rather than places you visit to find out whether
   they have anything to say. Account and method live off the header and the
   footer. Nothing production can do is dropped: every capability has an
   address here, listed in the route table below.

   ---- Why five and not six ----

   Five fits a phone's bottom bar with room for a label under every icon,
   which is the guideline the design system search returned for mobile nav,
   and it is the same five on desktop so a reader never relearns the map. */

let facesRequested = false
function useSheetFaces() {
  useEffect(() => {
    if (facesRequested || typeof document === 'undefined') return
    facesRequested = true
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800;900&family=Inconsolata:wdth,wght@75..100,400..800&display=swap'
    document.head.appendChild(link)
  }, [])
}

export const NAV = [
  { key: 'now', label: 'Now', icon: 'now', href: '#/v3', match: ['', 'calls'] },
  { key: 'league', label: 'League', icon: 'league', href: '#/v3/league', match: ['league'] },
  { key: 'players', label: 'Players', icon: 'players', href: '#/v3/players', match: ['players'] },
  { key: 'draft', label: 'Draft', icon: 'draft', href: '#/v3/draft', match: ['draft'] },
  { key: 'record', label: 'Record', icon: 'record', href: '#/v3/record', match: ['record'] },
]

/* The next NFL kickoff, counted down — production's own nextKickoff(), and
   nothing drawn when there is nothing honest to count to. */
function Kickoff() {
  const [text, setText] = useState(null)
  const at = useRef(null)
  useEffect(() => {
    let alive = true
    const tick = () => {
      const e = window.JukeEngine
      if ((!at.current || at.current <= Date.now()) && e && e.nextKickoff) {
        at.current = e.nextKickoff() || null
        if (!at.current && e.primeScores) e.primeScores().then(() => { if (alive && e.nextKickoff) at.current = e.nextKickoff() || null })
      }
      if (alive) setText(at.current ? countdownParts(at.current - Date.now()) : null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  if (!text) return null
  return (
    <span className="hidden items-center gap-2 font-figure text-[13px] text-v3-ink2 lg:inline-flex" aria-label={`Next kickoff in ${text.full || text.compact}`}>
      <span className="font-semibold uppercase tracking-[0.1em] text-v3-ink3">Kickoff</span>
      <span className="font-bold tabular-nums text-v3-ink">{text.full || text.compact}</span>
    </span>
  )
}

function Account() {
  const ready = useAccountUiReady()
  const signedIn = useSignedIn()
  if (ready) {
    return (
      <>
        <SignedOut>
          <SignInButton mode="modal">
            <button type="button" className="min-h-[40px] rounded-[6px] px-3 text-[14px] font-semibold text-v3-ink hover:bg-v3-well">Log in</button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <a href="#/v3/account" className="min-h-[40px] rounded-[6px] px-3 py-2 text-[14px] font-semibold text-v3-ink hover:bg-v3-well">Account</a>
          <UserButton />
        </SignedIn>
      </>
    )
  }
  return (
    <a href="#/v3/account" aria-label="Account" className="inline-flex min-h-[40px] items-center gap-2 rounded-[6px] px-3 text-[14px] font-semibold text-v3-ink hover:bg-v3-well">
      <Icon name="account" className="h-5 w-5" />
      <span className="hidden sm:inline">{signedIn ? 'Account' : 'Log in'}</span>
    </a>
  )
}

function Compare() {
  return (
    <details className="relative hidden sm:block">
      <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 rounded-[6px] border border-v3-rule px-3 text-[13px] font-semibold text-v3-ink2 hover:text-v3-ink [&::-webkit-details-marker]:hidden">
        Compare <Icon name="arrow" className="h-3.5 w-3.5 rotate-90" />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-[220px] overflow-hidden rounded-[6px] border border-v3-rule bg-v3-sheet shadow-[0_12px_32px_-12px_rgb(var(--v3-shade)/0.25)]">
        <a href="#/" className="flex min-h-[44px] items-center justify-between px-4 text-[14px] text-v3-ink hover:bg-v3-paper">Production <Icon name="arrow" className="h-4 w-4 text-v3-ink3" /></a>
        <a href="#/v2" className="flex min-h-[44px] items-center justify-between border-t border-v3-rule px-4 text-[14px] text-v3-ink hover:bg-v3-paper">v2 · Telemetry <Icon name="arrow" className="h-4 w-4 text-v3-ink3" /></a>
      </div>
    </details>
  )
}

/* The theme, from the top bar, on every screen and at every width. An icon
   rather than a labelled Seg because the bar is full on a phone; the icon is
   the theme you are LOOKING at (a moon at night whichever way you got
   there), and the menu under it says which of the three you chose. The
   Account page and the live draft's menu carry the same choice with its
   words showing (ThemeChoice), all three over one store. */
const THEME_ICON = { light: 'sun', dark: 'moon', system: 'device' }
function ThemeMenu() {
  const { choice, resolved, setChoice } = useV3Theme()
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const trigger = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); if (trigger.current) trigger.current.focus() } }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const named = THEME_CHOICES.find((c) => c.value === choice)
  const spoken = choice === 'system' ? `Theme: System, ${resolved} now` : `Theme: ${named ? named.label : choice}`
  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={spoken}
        title={spoken}
        onClick={() => setOpen((o) => !o)}
        className="grid h-11 w-11 place-items-center rounded-[6px] text-v3-ink2 transition-colors hover:bg-v3-well hover:text-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call"
      >
        <Icon name={resolved === 'dark' ? 'moon' : 'sun'} className="h-5 w-5" />
      </button>
      {open && (
        <div role="group" aria-label="Theme" className="absolute right-0 z-50 mt-2 w-[240px] overflow-hidden rounded-[6px] border border-v3-rule bg-v3-sheet shadow-[0_12px_32px_-12px_rgb(var(--v3-shade)/0.35)]">
          <div className="border-b border-v3-rule px-4 py-2.5"><Label>Theme</Label></div>
          {THEME_CHOICES.map((c) => {
            const on = c.value === choice
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={on}
                onClick={() => { setChoice(c.value); setOpen(false); if (trigger.current) trigger.current.focus() }}
                className={cx('flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-v3-paper focus-visible:bg-v3-paper focus-visible:outline-none', on && 'bg-v3-paper')}
              >
                <Icon name={THEME_ICON[c.value]} className="h-5 w-5 shrink-0 text-v3-ink2" />
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-[14px] text-v3-ink', on ? 'font-bold' : 'font-medium')}>{c.label}</span>
                  {c.value === 'system' && <span className="block text-[12px] text-v3-ink3">Follows your device · {resolved} now</span>}
                </span>
                {on && <Icon name="check" className="h-4 w-4 shrink-0 text-v3-ink" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TopBar({ current }) {
  return (
    <header className="sticky top-0 z-40 border-b border-v3-rule bg-v3-sheet/95 backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-[1320px] items-center gap-3 px-4 sm:px-8">
        <a href="#/v3" aria-label="Juke v3, Now" className="shrink-0"><JukeLogo size={18} onLight color="rgb(var(--v3-ink))" /></a>
        <span className="rounded-[4px] bg-v3-callWash px-1.5 py-0.5 font-figure text-[11px] font-bold uppercase tracking-[0.12em] text-v3-call">v3</span>
        <nav aria-label="Primary" className="ml-6 hidden h-full items-stretch gap-1 md:flex">
          {NAV.map((n) => {
            const on = n.match.includes(current)
            return (
              <a
                key={n.key}
                href={n.href}
                aria-current={on ? 'page' : undefined}
                className={cx(
                  'relative flex items-center px-3 text-[15px] font-semibold transition-colors',
                  on ? 'text-v3-ink' : 'text-v3-ink2 hover:text-v3-ink',
                )}
              >
                {n.label}
                {on && <span className="absolute inset-x-3 bottom-0 h-[3px] bg-v3-ink" aria-hidden="true" />}
              </a>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Kickoff />
          <Compare />
          <ThemeMenu />
          <Account />
        </div>
      </div>
    </header>
  )
}

/* The phone's map: the same five, fixed to the bottom, each 64px wide at
   worst on a 320px screen, icon over label. Ink marks where you are. */
function TabBar({ current }) {
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-v3-rule bg-v3-sheet/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {NAV.map((n) => {
          const on = n.match.includes(current)
          return (
            <a
              key={n.key}
              href={n.href}
              aria-current={on ? 'page' : undefined}
              className={cx('relative flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', on ? 'text-v3-ink' : 'text-v3-ink3')}
            >
              {on && <span className="absolute inset-x-4 top-0 h-[3px] bg-v3-ink" aria-hidden="true" />}
              <Icon name={n.icon} className="h-[22px] w-[22px]" />
              {n.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-v3-rule bg-v3-sheet">
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-8 px-4 py-10 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <JukeLogo size={16} onLight color="rgb(var(--v3-ink))" />
          <p className="mt-3 max-w-[46ch] text-[14px] leading-[1.6] text-v3-ink2">
            A solo mock draft runs entirely in your browser — nothing you draft is sent anywhere. Connecting a league is read-only; Juke never edits it.
          </p>
        </div>
        <div className="grid content-start gap-2 text-[14px]">
          <Label>Method</Label>
          <a className="text-v3-ink hover:underline" href="#/v3/method/how-it-works">How Juke calls it</a>
          <a className="text-v3-ink hover:underline" href="#/v3/method/how-it-works?s=s06">The draft grade</a>
        </div>
        <div className="grid content-start gap-2 text-[14px]">
          <Label>The small print</Label>
          <a className="text-v3-ink hover:underline" href="#/v3/method/privacy">Privacy</a>
          <a className="text-v3-ink hover:underline" href="#/v3/method/terms">Terms</a>
          <a className="text-v3-ink hover:underline" href="#/v3/account">Account and leagues</a>
        </div>
      </div>
    </footer>
  )
}

function NotFound() {
  return (
    <div className="grid min-h-[50vh] content-center gap-6">
      <Label>404 · incomplete pass</Label>
      <Headline>That play isn&apos;t on the sheet.</Headline>
      <p className="max-w-[52ch] text-[17px] leading-[1.55] text-v3-ink2">
        Nothing in Juke answers to this address. Everything that does is one of the five places below.
      </p>
      <div className="flex flex-wrap gap-2">
        <CallButton href="#/v3">Back to Now</CallButton>
        <QuietButton href="#/v3/players">Browse players</QuietButton>
      </div>
    </div>
  )
}

/* The route table — every v3 address, and where each production capability
   landed. Production → v3:
     #/                 → #/v3                (Now)
     #/rooms/draft      → #/v3/draft          (+ /live, /report, /insights)
     #/drafts, #/history→ #/v3/record
     #/rooms/prospect   → #/v3/players/rookies
     #/rooms/strategy   → #/v3/calls/lineup
     #/rooms/waiver     → #/v3/calls/wire
     #/rooms/trade      → #/v3/calls/trade
     #/my-league        → #/v3/league          (+ /team/<id>)
     #/you              → #/v3/account
     #/rooms            → gone: the rooms are calls on Now and tools behind them
     /docs/*.html       → #/v3/method/<doc> */
function route(sub) {
  const [a = '', b, c] = (sub || '').split('/')
  if (!a) return { page: <Now /> }
  if (a === 'calls' && b) return { page: <V3Call slug={b} /> }
  if (a === 'league' && b === 'team' && c) return { page: <V3Team teamId={c} /> }
  if (a === 'league') return { page: <V3League /> }
  if (a === 'players' && b === 'rookies') return { page: <V3Rookies /> }
  if (a === 'players' && b) return { page: <V3Player playerId={b} /> }
  if (a === 'players') return { page: <V3Players /> }
  if (a === 'draft' && b === 'live') return { page: <V3Live />, bare: true }
  if (a === 'draft' && b === 'report') return { page: <V3Report /> }
  if (a === 'draft' && b === 'insights') return { page: <V3Insights /> }
  if (a === 'draft') return { page: <V3DraftHome /> }
  if (a === 'record') return { page: <V3Record /> }
  if (a === 'account') return { page: <V3Account /> }
  if (a === 'method') return { page: <V3Method doc={b || 'how-it-works'} /> }
  return { page: <NotFound /> }
}

export default function V3App({ sub = '' }) {
  useSheetFaces()
  // Before paint, so the first v3 frame is already in the chosen theme; and
  // undone on the way out, so production and v2 never see the attribute.
  useLayoutEffect(() => mountTheme(), [])
  const clean = (sub || '').split('?')[0]
  const current = clean.split('/')[0]
  const { page, bare } = route(clean)
  useEffect(() => { window.scrollTo(0, 0) }, [clean])
  return (
    <div className="min-h-screen overflow-x-clip bg-v3-paper font-sheet text-v3-ink antialiased">
      {bare ? (
        <main>{page}</main>
      ) : (
        <>
          <TopBar current={current} />
          <main className="mx-auto max-w-[1320px] px-4 pb-24 pt-8 sm:px-8 sm:pt-12 md:pb-0">{page}</main>
          <Footer />
          <TabBar current={current} />
        </>
      )}
    </div>
  )
}
