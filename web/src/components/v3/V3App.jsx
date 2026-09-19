import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SignInButton, SignedIn, SignedOut, useClerk, useUser } from '@clerk/clerk-react'
import JukeLogo from '../juke-logo/JukeLogo.jsx'
import { useAccountUiReady } from '../../hooks/useAccountUiReady.js'
import { useSignedIn } from '../../hooks/useAuthState.js'
import { countdownParts } from '../../lib/countdown.js'
import { Icon, Label, Headline, CallButton, QuietButton, cx, TOUCH } from './ui.jsx'
import { useMotionOK } from './motion.jsx'
import { THEME_CHOICES, mountTheme, useV3Theme } from './theme.js'
import { MotionRoot, SPRING, motion } from './motion.jsx'
import Now from './now/Now.jsx'
import V3League from './league/V3League.jsx'
import V3Team from './league/V3Team.jsx'
import V3Matchup from './league/V3Matchup.jsx'
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
import V3Game from './games/V3Game.jsx'
import ScoresTicker from './games/ScoresTicker.jsx'
import V3Scores from './games/V3Scores.jsx'
import { WelcomeRoute } from './landing/Landing.jsx'
import YahooReturn from '../shell/YahooReturn.jsx'
import FullValueTips from './FullValue.jsx'

/* Juke — "Call Sheet". This is the site as of the cutover: its own
   information architecture rather than a restyle of what came before, and
   the thing #/ renders. It began as the v3 proposal and kept the directory
   name, which is now a fact about where the files live and nothing about
   what the product is.

   ---- The information architecture, in one sentence ----

   Organised by the decision in front of you, not by the room it lives in.
   The site it replaced had six rooms and three account pages; this has five
   places:

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

/* A layout effect in the browser, an ordinary one on the server.

   The theme has to be stamped before the first v3 frame paints, which is
   what useLayoutEffect buys — and a layout effect cannot run during
   renderToString(), so React warns about every one it meets there. That
   warning is real rather than noise: it is telling you the server's markup
   and the client's intended markup can disagree. Here they cannot, because
   what this effect writes is an attribute on <html> rather than anything in
   this tree, and /theme.js has already written the identical value in <head>
   before the body was parsed (see its second block). Selecting the hook at
   module scope keeps the hook COUNT identical on both sides, which is the
   only thing React's rules actually require. */
const useMountEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

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
  { key: 'now', label: 'Now', icon: 'now', href: '#/', match: ['', 'calls'] },
  { key: 'league', label: 'League', icon: 'league', href: '#/league', match: ['league'] },
  { key: 'players', label: 'Players', icon: 'players', href: '#/players', match: ['players'] },
  { key: 'draft', label: 'Draft', icon: 'draft', href: '#/draft', match: ['draft'] },
  { key: 'record', label: 'Record', icon: 'record', href: '#/record', match: ['record'] },
]

/* The next NFL kickoff, counted down — production's own nextKickoff(), and
   nothing drawn when there is nothing honest to count to.

   It ticks in persistent chrome, which is the one place a moving number is
   defensible: a clock IS the fact, where a projection that moves is a
   projection nobody can read. Two things keep it from being noise anyway.
   aria-live is off explicitly rather than by omission — a second-by-second
   region would talk over everything else on the page — and under reduced
   motion it goes coarse and slow: "47m" re-read once a minute rather than
   a seconds digit turning sixty times. */
function coarseKickoff(ms) {
  if (!(ms > 0)) return null
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function Kickoff() {
  const [text, setText] = useState(null)
  const at = useRef(null)
  const motionOK = useMotionOK()
  useEffect(() => {
    let alive = true
    const tick = () => {
      const e = window.JukeEngine
      if ((!at.current || at.current <= Date.now()) && e && e.nextKickoff) {
        at.current = e.nextKickoff() || null
        if (!at.current && e.primeScores) e.primeScores().then(() => { if (alive && e.nextKickoff) at.current = e.nextKickoff() || null })
      }
      if (!alive) return
      if (!at.current) { setText(null); return }
      const ms = at.current - Date.now()
      const parts = countdownParts(ms)
      setText(motionOK ? (parts ? parts.full || parts.compact : null) : coarseKickoff(ms))
    }
    tick()
    const id = setInterval(tick, motionOK ? 1000 : 60000)
    return () => { alive = false; clearInterval(id) }
  }, [motionOK])
  if (!text) return null
  return (
    <span aria-live="off" className="hidden items-center gap-2 font-figure text-[13px] text-v3-ink2 lg:inline-flex" aria-label={`Next kickoff in ${text}`}>
      <span className="font-semibold uppercase tracking-[0.1em] text-v3-ink3">Kickoff</span>
      <span className="font-bold tabular-nums text-v3-ink">{text}</span>
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
            <button type="button" className={cx(TOUCH, 'min-h-[40px] rounded-[6px] px-3 text-[15px] font-semibold text-v3-ink hover:bg-v3-well')}>Log in</button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <AccountMenu />
        </SignedIn>
      </>
    )
  }
  return (
    <a href="#/account" aria-label="Account" className={cx(TOUCH, 'inline-flex min-h-[40px] items-center gap-2 rounded-[6px] px-3 text-[15px] font-semibold text-v3-ink hover:bg-v3-well')}>
      <Icon name="account" className="h-5 w-5" />
      <span className="hidden sm:inline">{signedIn ? 'Account' : 'Log in'}</span>
    </a>
  )
}

/* One labelled button for everything about the signed-in account (A11).
   It replaced an "Account" link sitting beside Clerk's own avatar button:
   two controls for one subject, and only one of them said what it was.
   Clerk's <UserButton/> is not reused because its trigger is an unlabelled
   avatar and its menu cannot carry our own Account page; useClerk() gives
   the same two actions it offered (manage profile, sign out) under our own
   words. Safe to call here: this only renders inside <SignedIn>, which is
   only rendered once a provider exists. */
function AccountMenu() {
  const { user } = useUser()
  const clerk = useClerk()
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
  const name = (user && (user.firstName || user.username || (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress))) || 'Account'
  const item = 'flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left text-[15px] font-medium text-v3-ink transition-colors hover:bg-v3-paper focus-visible:bg-v3-paper focus-visible:outline-none'
  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(TOUCH, 'inline-flex min-h-[44px] items-center gap-2 rounded-[6px] px-2 text-[15px] font-semibold text-v3-ink hover:bg-v3-well focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call sm:px-3')}
      >
        {user && user.imageUrl
          ? <img src={user.imageUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
          : <Icon name="account" className="h-5 w-5" />}
        <span className="hidden sm:inline">Account</span>
        <span className="sr-only sm:hidden">Account</span>
      </button>
      {open && (
        <div role="group" aria-label="Account" className="absolute right-0 z-50 mt-2 w-[260px] overflow-hidden rounded-[6px] border border-v3-rule bg-v3-sheet shadow-[0_12px_32px_-12px_rgb(var(--v3-shade)/0.35)]">
          <div className="border-b border-v3-rule px-4 py-2.5">
            <Label>Signed in as</Label>
            <p className="mt-0.5 truncate text-[15px] font-semibold text-v3-ink" title={name}>{name}</p>
          </div>
          <a href="#/account" onClick={() => setOpen(false)} className={item}><Icon name="settings" className="h-5 w-5 shrink-0 text-v3-ink2" />Account and leagues</a>
          <button type="button" onClick={() => { setOpen(false); clerk.openUserProfile() }} className={item}><Icon name="account" className="h-5 w-5 shrink-0 text-v3-ink2" />Profile and security</button>
          <button type="button" onClick={() => { setOpen(false); clerk.signOut() }} className={cx(item, 'border-t border-v3-rule')}><Icon name="back" className="h-5 w-5 shrink-0 text-v3-ink2" />Sign out</button>
        </div>
      )}
    </div>
  )
}

/* The "Compare" menu and the "v3" badge beside the logo both left with the
   cutover, and neither was a styling decision.

   The badge said "this is the proposal" on the thing that is now the
   product — the stale-copy failure this project already has a rule about,
   in the most-read four characters on the site. And the menu's own first
   entry pointed at "Production", which is #/, which is the page it was
   drawn on: a control that navigates to itself, which is the dead-control
   failure with a destination rather than without one. Its second entry
   invited every visitor to go and look at a design that was not chosen.

   #/v2 is still REACHABLE and that is the point of keeping it — it is the
   comparison record, it costs one branch in App.jsx, and it is the only way
   to see what was proposed beside what shipped. It is simply no longer
   advertised in the primary bar of a shipped product. Unadvertised is not
   the same as absent, the same way #view-app is unreachable rather than
   deleted. */

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
                  <span className={cx('block text-[15px] text-v3-ink', on ? 'font-bold' : 'font-medium')}>{c.label}</span>
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

function TopBar({ current, ticker = true }) {
  return (
    <header className="sticky top-0 z-40 border-b border-v3-rule bg-v3-sheet/95 backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-[1320px] items-center gap-3 px-4 sm:px-8">
        <a href="#/" aria-label="Juke, Now" className={cx(TOUCH, 'inline-flex shrink-0 items-center')}><JukeLogo size={26} markWidth={76} onLight color="rgb(var(--v3-ink))" /></a>
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
                {/* One mark, and it travels to where you went rather than
                    blinking out in one place and on in another. */}
                {on && <motion.span layoutId="v3-nav-mark" transition={SPRING.layout} className="absolute inset-x-3 bottom-0 h-[3px] bg-v3-ink" aria-hidden="true" />}
              </a>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Kickoff />
          <ThemeMenu />
          <Account />
        </div>
      </div>
      {/* Game day only; draws nothing the rest of the week. Not on a game
          page, whose own strip of the week's games is the same thing. */}
      {ticker && <ScoresTicker />}
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
              className={cx('relative flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[12px] font-semibold', on ? 'text-v3-ink' : 'text-v3-ink3')}
            >
              {on && <motion.span layoutId="v3-tab-mark" transition={SPRING.layout} className="absolute inset-x-4 top-0 h-[3px] bg-v3-ink" aria-hidden="true" />}
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
    <footer className="mt-section border-t border-v3-rule bg-v3-sheet">
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-8 px-4 py-10 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <JukeLogo size={28} markWidth={56} onLight color="rgb(var(--v3-ink))" />
          <p className="mt-3 max-w-[46ch] text-[15px] leading-[1.6] text-v3-ink2">
            A solo mock draft runs entirely in your browser — nothing you draft is sent anywhere. Connecting a league is read-only; Juke never edits it.
          </p>
        </div>
        <div className="grid content-start gap-2 text-[15px]">
          <Label>Method</Label>
          <a className={cx(TOUCH, 'inline-flex items-center text-v3-ink hover:underline')} href="#/method/how-it-works">How Juke calls it</a>
          <a className={cx(TOUCH, 'inline-flex items-center text-v3-ink hover:underline')} href="#/method/how-it-works?s=s06">The draft grade</a>
        </div>
        <div className="grid content-start gap-2 text-[15px]">
          <Label>The small print</Label>
          <a className={cx(TOUCH, 'inline-flex items-center text-v3-ink hover:underline')} href="#/method/privacy">Privacy</a>
          <a className={cx(TOUCH, 'inline-flex items-center text-v3-ink hover:underline')} href="#/method/terms">Terms</a>
          <a className={cx(TOUCH, 'inline-flex items-center text-v3-ink hover:underline')} href="#/account">Account and leagues</a>
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
      <p className="max-w-[52ch] text-[18px] leading-[1.55] text-v3-ink2">
        Nothing in Juke answers to this address. Everything that does is one of the five places below.
      </p>
      <div className="flex flex-wrap gap-2">
        <CallButton href="#/">Back to Now</CallButton>
        <QuietButton href="#/players">Browse players</QuietButton>
      </div>
    </div>
  )
}

/* The route table — every address the site answers to, and where each of
   the old ones landed. The left column is what somebody may have saved;
   app.js's canonicalHash() is what rewrites it, and this is the map it
   implements. Neither list is the other's source: that one runs in a
   classic script and cannot import this file, so the two are checked
   against each other by tests/route.spec.mjs rather than by a shared
   constant. Move them together.

     #/                  → #/                 Now
     #/rooms             → #/                 gone: the rooms are calls on
                                               Now and tools behind them
     #/rooms/draft       → #/draft             (+ /live, /report, /insights)
     #/rooms/draft?report=<id> → #/draft/report?id=<id>
     #/rooms/prospect    → #/players/rookies
     #/rooms/strategy    → #/calls/lineup
     #/rooms/waiver      → #/calls/wire
     #/rooms/trade       → #/calls/trade
     #/rooms/league      → #/league
     #/my-league         → #/league           (+ /team/<id>,
                                               /matchup?week=N[&team=id])
     #/you               → #/account
     #/drafts, #/history → #/record
     #/draft-room        → #/draft
     #/draft?room=<code> → #/draft/live?room=<code>   an invite
     #/v3/...            → #/...              the proposal's own prefix
     #/games/<espnId>    one NFL game — new, nothing redirects to it
     /docs/*.html        → #/method/<doc> */
function route(sub) {
  const [a = '', b, c] = (sub || '').split('/')
  if (!a) return { page: <Now /> }
  if (a === 'calls' && b) return { page: <V3Call slug={b} /> }
  if (a === 'league' && b === 'team' && c) return { page: <V3Team teamId={c} /> }
  if (a === 'league' && b === 'matchup') return { page: <V3Matchup /> }
  if (a === 'league') return { page: <V3League /> }
  if (a === 'players' && b === 'rookies') return { page: <V3Rookies /> }
  if (a === 'players' && b) return { page: <V3Player playerId={b} /> }
  if (a === 'players') return { page: <V3Players /> }
  if (a === 'draft' && b === 'live') return { page: <V3Live />, bare: true }
  if (a === 'draft' && b === 'report') return { page: <V3Report /> }
  if (a === 'draft' && b === 'insights') return { page: <V3Insights /> }
  if (a === 'draft') return { page: <V3DraftHome /> }
  if (a === 'record') return { page: <V3Record /> }
  if (a === 'games' && b) return { page: <V3Game gameId={b} /> }
  if (a === 'scores') return { page: <V3Scores /> }
  if (a === 'account') return { page: <V3Account /> }
  if (a === 'method') return { page: <V3Method doc={b || 'how-it-works'} /> }
  if (a === 'welcome') return { page: <WelcomeRoute /> }
  return { page: <NotFound /> }
}

export default function V3App({ sub = '' }) {
  useSheetFaces()
  /* Before paint, so the first v3 frame is already in the chosen theme; and
     undone on the way out, so v2 never sees the attribute.

     /theme.js stamps the same value in <head> now that v3 is the site — a
     layout effect runs after the module bundle has hydrated, which is far
     too late to stop a dark reader watching a light page paint first. This
     is what keeps the attribute answering to the CHOICE afterwards: the
     store's listener, the System case following the device, and the Account
     page's own control all hang off this mount. */
  useMountEffect(() => mountTheme(), [])
  const clean = (sub || '').split('?')[0]
  const current = clean.split('/')[0]
  const { page, bare } = route(clean)
  useEffect(() => { window.scrollTo(0, 0) }, [clean])
  /* A route change moved the page and left focus on the nav link that
     caused it: a keyboard reader tabbed out of the nav again on every
     navigation, and a screen reader was told nothing at all. Focus moves
     into the new page's own container (tabIndex -1, so it takes focus and
     stays out of the tab order), and the announcer says where they are.
     Not on the first paint — a cold load has not navigated anywhere. */
  const mainRef = useRef(null)
  const landed = useRef(false)
  const [announce, setAnnounce] = useState('')
  useEffect(() => {
    if (!landed.current) { landed.current = true; return }
    if (mainRef.current) mainRef.current.focus({ preventScroll: true })
    const h1 = typeof document !== 'undefined' ? document.querySelector('main h1') : null
    setAnnounce(h1 && h1.textContent ? h1.textContent.trim() : 'Page changed')
  }, [clean])
  // MotionRoot: Framer's reducedMotion="user" for everything declarative
  // under it; the imperative primitives in motion.jsx ask on their own.
  return (
    <MotionRoot>
      <div data-v3-root className="min-h-screen overflow-x-clip bg-v3-paper font-sheet text-v3-ink antialiased">
        {bare ? (
          <main>{page}</main>
        ) : (
          <>
            <a
              href="#v3-main"
              className="sr-only rounded-[6px] bg-v3-call px-4 py-2 text-[15px] font-semibold text-v3-onCall focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
            >
              Skip to content
            </a>
            <TopBar current={current} ticker={current !== 'games'} />
            {/* pt-5 on a phone, not pt-12. Forty-eight pixels of air under a
                sticky header is a desk's proportion: on a 390px screen it is
                spent before the page's own eyebrow has started, and the
                header is already a hard edge above it, so the gap is buying
                separation that is not needed. sm: is untouched. */}
            <main id="v3-main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-[1320px] px-4 pb-24 pt-5 focus:outline-none sm:px-8 sm:pt-24 md:pb-0">{page}</main>
            <p aria-live="polite" className="sr-only">{announce}</p>
            <Footer />
            <FullValueTips />
            <TabBar current={current} />
          </>
        )}
        {/* Finishes a Yahoo connect on whichever route Yahoo returned the
            reader to. Draws nothing until there is one to finish. */}
        <YahooReturn />
      </div>
    </MotionRoot>
  )
}
