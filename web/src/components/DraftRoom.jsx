import { useEffect, useReducer, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import DraftLocker from './DraftLocker.jsx'
import DraftLogDock from './DraftLogDock.jsx'
import DraftCockpitHeader from './DraftCockpitHeader.jsx'
import DraftMenuOverlay from './DraftMenuOverlay.jsx'
import NotificationSettings from './settings/NotificationSettings.jsx'
import DraftWithFriendsModal from './DraftWithFriendsModal.jsx'
import DraftBoardGrid from './DraftBoardGrid.jsx'
import PickTicker from './PickTicker.jsx'
import PlayerQueueSidebar, { SORT_DEFAULT_DIR } from './PlayerQueueSidebar.jsx'
import PlayersTab from './PlayersTab.jsx'
import PicksRail from './PicksRail.jsx'
import AnalysisTab from './AnalysisTab.jsx'
import DraftDecideScreen from './DraftDecideScreen.jsx'
import DraftInsightsDashboard from './DraftInsightsDashboard.jsx'
import PlayerProfileModal from './PlayerProfileModal.jsx'
import DraftSettingsModal from './DraftSettingsModal.jsx'
import DraftEntryScreen from './DraftEntryScreen.jsx'
import DraftLobby from './DraftLobby.jsx'
import DraftRoomLoader from './DraftRoomLoader.jsx'
import ShellHeader from './shell/ShellHeader.jsx'
import RailNav from './shell/RailNav.jsx'
import MobileAppTabBar from './MobileAppTabBar.jsx'
import MobileDraftTabBar from './MobileDraftTabBar.jsx'
import PickClockBand from './PickClockBand.jsx'
import { POS_LIST } from './draftRoomPositions.js'
import { useMinWidth, usePhoneWidth } from '../hooks/useBreakpoint.js'
import { useDraftNotifications } from '../hooks/useDraftNotifications.js'
import DraftRoomPhone from './phone/DraftRoomPhone.jsx'
import DraftRoomEntry from './DraftRoomEntry.jsx'
import EarlyAccessModal from './EarlyAccessModal.jsx'

// The Board tab's own dock height per tray position — fixed pixels. This
// used to also size a percentage-of-remaining-space split on the Analysis
// tab, back when Analysis shared the board-plus-panels layout with Board
// (the same `tray` state moved a dock here and a graph share there); full
// width for Analysis (and Insights) retired that second reading, so `tray`
// is Board's own state now, not a value two tabs have to agree on.
const DOCK_H = { hidden: 37, default: 296, raised: 460 }

// The Board tab's own mobile segmented control.
const BOARD_PANES = [
  { key: 'board', label: 'Board' },
  { key: 'pool', label: 'Pool' },
  { key: 'picks', label: 'Picks' },
]

function useEngine() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.JukeEngine) setReady(true)
  }, [])
  return ready ? window.JukeEngine : null
}

// "juke:header" fires from renderHeader() on every render, tick and pause
// toggle (see AppHeader.jsx's useHeaderInfo) — reused here as the one
// "something changed, re-read the bridge" signal so the whole page
// re-renders together off board()/picks()/league() rather than each panel
// polling on its own timer.
//
// Returns the counter itself, not just a forced re-render, because it's
// also the one thing keyedMemo() below can key on. board()/league()/
// picks() all read a plain `() => board` closure in app.js — the array is
// mutated in place (a pick sets p.drafted on an existing object; nothing
// ever replaces the reference) — so `board` itself never changes identity
// and is useless as a memo key. This counter is the only signal that
// actually flips when the bridge might have.
function useJukeTick(engine) {
  const [tick, force] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    if (!engine) return
    window.addEventListener('juke:header', force)
    /* And read once on attach, because the event can land before this
       listener exists. useEngine() resolves in an effect, so the listener
       goes on two renders after mount - and in a lobby the room's first
       state is often the only broadcast there will be, so missing it means
       showing an empty board until something else happens to fire. The live
       board never showed this: picks keep coming, and the next one repaired
       it. A quiet screen has no next one. */
    force()
    return () => window.removeEventListener('juke:header', force)
  }, [engine])
  return tick
}

// A plain cache, deliberately not useMemo. DraftRoom has four sequential
// early returns before the code that wants this (no engine yet, the
// starting transition, the pre-draft Locker, the entry screen not yet
// started) — none of the ~700 lines between useJukeTick and the point
// this is called from is a hook today, all of it plain consts and
// closures, because a hook positioned past a conditional return is a
// Rules-of-Hooks violation: it runs on some renders and not others, and
// React does not tolerate that even when the two branches never coexist
// in the same tree. Tried first as useMemo exactly where the plain
// `const tierAvgByPos = {}` used to sit — the moment `starting` flips
// false to true to false across three renders of the *same* mounted
// instance, that showed up immediately as "Rendered more hooks than
// during the previous render" and a blank #draftroom-root, not a lint
// warning. Moving the memoization above all four gates would mean
// duplicating or null-guarding everything between them and here (rules,
// lineup, nextOverall's own dependency chain), which is a far larger and
// riskier change than the memoization itself. A plain function has no
// such rule and can be called from anywhere, conditionally or not — this
// is the same caching useMemo would give, without being a hook.
//
// One instance per value below (module scope, not per-render), which is
// safe the same way the rest of this app's bridge already assumes one
// live draft at a time — there is never more than one DraftRoom mounted
// together to share a cache across.
function keyedMemo() {
  let key
  let value
  return (nextKey, compute) => {
    if (key !== undefined && key.length === nextKey.length && key.every((v, i) => v === nextKey[i])) {
      return value
    }
    key = nextKey
    value = compute()
    return value
  }
}

// A route of its own, deliberately outside applyRoute()'s home/draft
// toggle — see the comment beside #draftroom-root in index.html. Nothing
// here touches app.js's routing; it just watches the hash itself.
function useHashActive(prefix) {
  const [active, setActive] = useState(
    () => typeof window !== 'undefined' && window.location.hash.startsWith(prefix)
  )
  useEffect(() => {
    const onHash = () => setActive(window.location.hash.startsWith(prefix))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [prefix])
  return active
}

// tierAvgByPos and availablePlayers below — see keyedMemo's own comment
// for why each gets its own instance rather than a hook.
const tierAvgMemo = keyedMemo()
const availablePlayersMemo = keyedMemo()

export default function DraftRoom() {
  const engine = useEngine()
  const tick = useJukeTick(engine)
  // 1024px matches Tailwind's own `lg` — see useBreakpoint.js's own comment
  // for why the Board tab's dock needs a real answer to "is this desktop"
  // rather than trusting its own `hidden ... lg:flex` CSS to imply it.
  const isDesktop = useMinWidth(1024)
  // The mobile redesign's own line, distinct from isDesktop above — see
  // usePhoneWidth()'s own comment for why 640 rather than reusing lg. A
  // tablet (640-1024) still falls through to every branch below exactly as
  // it already did; only a real phone width takes the exit near the bottom
  // of this component's live-draft return.
  const isPhone = usePhoneWidth()
  const active = useHashActive('#/draft-room')
  // A direct, bookmarkable link to the locker — previously there was none:
  // the locker only ever showed as #/draft-room's own not-yet-entered
  // state, so a finished draft's grade had no way back to it once you'd
  // navigated anywhere else. Deliberately not folded into `active` itself
  // — the live-draft-only effects below (autopick, etc.) all gate on
  // `active` meaning specifically "on the live draft route", and widening
  // it would let them fire while looking at the locker instead.
  /* #/rooms/draft, not #/drafts, as of design_handoff_v3_alive.
     The handoff splits what this route used to be into two screens: the
     Draft Room's own entry -- start a mock, settings, insights, recent --
     which is a room and lives under #/rooms with the other five, and a
     separate archive of every draft you have run, which is what the nav's
     Drafts tab means now and which App renders at #/drafts.

     This branch is the first of those, so it moves to the room's address.
     Nothing else about it changes: it is still the route that forces the
     Lobby regardless of `enteredRoom`, which is the whole reason it exists
     -- pressing "Back to the locker" on a finished draft and then Start
     has to reach a clean choice rather than the board you just left. Every
     "back to the locker" link moved with it for exactly that reason: the
     archive has no Start button on it, by design, so sending a finished
     draft there would end that flow. */
  const draftsActive = useHashActive('#/rooms/draft')

  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('ALL')
  // Independent of posFilter rather than folded into it — "RB rookies I'm
  // watching" is a real combination someone would want, and a single-select
  // list can't hold three things that all have to be true at once.
  const [expBand, setExpBand] = useState('all') // 'all' | 'rookie' | 'veteran'
  const [showDrafted, setShowDrafted] = useState(false)
  // The Players tab's own two filters, alongside the shared ones above
  // rather than a second copy of filter state local to that tab — every
  // other surface reading `availablePlayers` (the Board tab's dock,
  // PlayerHub's mobile sheet) just never exposes a control for these, the
  // same way none of them expose a "season" or "NFL team" idea of their
  // own either.
  const [season, setSeason] = useState('projected') // 'projected' | 'prior'
  const [nflTeamFilter, setNflTeamFilter] = useState('ALL')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  /* The tray under the board has three positions, not two, and the middle
     one is the default — the same shape Sleeper's chevrons drive. `hidden`
     is the old isolate: board only, nothing underneath. `raised` gives the
     panels the room to read a long player list without leaving the board
     entirely.

     A boolean could not express this, and the old one lived in the header as
     a maximise icon — which is a control for a thing that is not the header.
     The chevrons sit on the board's own bottom-right corner instead, where
     the thing they move actually is. */
  const TRAY = ['hidden', 'default', 'raised']
  const [tray, setTray] = useState('default')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  /* Which of the two Lobby screens a phone is on. null is the simple Mock
     Drafts list; anything else is the full analytics dashboard, with an
     id meaning "and open this report". Desktop never reads it — the
     dashboard is unconditionally what #/drafts is there. */
  const [lockerView, setLockerView] = useState(null)
  /* #/rooms/draft?report=<id> opens that entry's own frozen report.

     The archive (#/drafts, DraftsScreen.jsx) is a different screen in a
     different React tree, so a row there cannot set this state directly --
     and the two must not each hold their own idea of "which report is
     open". The hash is the one channel both can see, which is the same
     answer #/draft?room=ABC1 already gives for an invite.

     It reads on every hashchange rather than only at mount, because
     DraftRoom does not unmount between routes: arriving from the archive
     is a hashchange, not a mount, and a mount-only read would open the
     screen with whatever report was last looked at. Cleared on any hash
     without the param for the same reason -- a stale id here is the
     `view`/`soloAutopick` leak this file already documents, one state
     along. */
  useEffect(() => {
    const read = () => {
      const q = window.location.hash.split('?')[1] || ''
      const id = new URLSearchParams(q).get('report')
      setLockerView(id || null)
    }
    window.addEventListener('hashchange', read)
    read()
    return () => window.removeEventListener('hashchange', read)
  }, [])
  const sportsModalRef = useRef(null)
  /* Deleting a locker entry changes nothing the engine broadcasts — it is a
     localStorage rewrite — so there is no "juke:header" to ride and this
     screen has to redraw itself. The same local bump DraftLocker's own
     forceLocal() already does for the identical action. */
  const [, forceTick] = useReducer((n) => n + 1, 0)
  // The Lobby's direct "Draft with friends" popover — see
  // DraftWithFriendsModal.jsx. Separate from settingsOpen: the two used to
  // be the same modal (Edit setup -> Invite tab), and collapsing them back
  // into one flag would silently re-bury this behind Edit setup again.
  const [friendsModalOpen, setFriendsModalOpen] = useState(false)
  /* #/rooms/draft?friends=1 opens that popover on arrival.

     The homepage's "Or draft with friends -- same board, real managers"
     row pointed at bare #/rooms/draft, which is the same href as the
     Mock Draft card directly above it, the league-error card's own
     fallback link and the closing CTA. Five links, one destination, and
     the one promising multiplayer landed on a screen where multiplayer
     is a row the reader then has to find for themselves. That is the
     mobile pass's own finding -- "it was the control that was missing,
     not the feature" -- reappearing one layer up: this time the control
     exists and the link simply does not reach it.

     The hash is the channel because the homepage is a different React
     tree, which is the identical argument ?report= above already makes
     for the archive, and #/draft?room=ABC1 makes for an invite. route()
     and syncHomeVisibility() both split the query off before deciding a
     path, so the parameter costs the routing nothing.

     Read on hashchange as well as at mount, for ?report='s reason: this
     component does not unmount between routes, so arriving from the
     homepage is a hashchange and a mount-only read would never fire. */
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
      if (params.get('friends')) { setFriendsModalOpen(true); return }
      /* Leaving closes it, and the ONE exception is the hash change this
         modal's own Create a room / Join makes.

         Not symmetric with ?report= above, and the asymmetry is the whole
         point: that one selects a view, this one has an action running
         inside it. engine.createRoom() sets the hash to
         #/draft-room?room=<code>, so a plain "clear when the parameter is
         gone" would close this on the exact tick RoomPanel renders the
         invite link -- destroying the thing DraftWithFriendsModal's own
         comment exists to protect ("the host never saw the link
         RoomPanel just rendered"). A hash carrying ?room= is that action
         reporting itself, so it survives; everything else closes.

         Without this the flag is a stale-modal leak of exactly the kind
         DraftRoom already documents for `view` and `soloAutopick`: this
         component does not unmount between routes, so a modal opened
         here and navigated away from is still open on the way back.
         Confirmed reachable before this change too, with no parameter
         involved -- open it from the entry screen's own row, go home,
         come back, and it is sitting there unasked. */
      if (!params.get('room')) setFriendsModalOpen(false)
    }
    window.addEventListener('hashchange', read)
    read()
    return () => window.removeEventListener('hashchange', read)
  }, [])
  /* Closing drops the parameter, and that is not tidiness.

     A hash that does not change fires no hashchange, so leaving it in
     place makes the link inert for anybody already standing on it --
     press, close, press again, nothing. replaceState rather than
     assigning location.hash: it leaves the path alone, adds no
     back-button entry to a modal that was never a page, and fires no
     hashchange, so applyRoute() and the two useHashActive watchers all
     stay out of it. */
  const closeFriendsModal = () => {
    setFriendsModalOpen(false)
    const [path, q] = window.location.hash.split('?')
    if (!q) return
    const params = new URLSearchParams(q)
    if (!params.has('friends')) return
    params.delete('friends')
    const rest = params.toString()
    window.history.replaceState(null, '', window.location.pathname + window.location.search + path + (rest ? `?${rest}` : ''))
  }
  /* The seat, shared between the form's dropdown, the lobby board and the
     Draft Settings screen's own Draft order section.

     Read off the engine rather than held here, and that is a fix rather than
     a style preference. It was `useState(0)`, which made the seat the one
     thing about a draft that was written down twice: DraftOrder.jsx has
     always set it through engine.setMySlot(), which writes state.mySlot, and
     beginDraft() then called startDraft({ mySlot: lobbySlot }) — so
     startDraft's own `state.mySlot = opts.mySlot` overwrote the chosen seat
     with this component's stale 0 on the way in. Pick seat 6 in Draft
     Settings, press Start, land in seat 1. Reported off the phone, where the
     settings screen is the only way to the seat at all; it was never
     phone-specific, it was specific to choosing the seat on that screen,
     which the desktop lobby's own dropdown happens to bypass.

     state.mySlot was already the pre-commit seat as far as the engine is
     concerned — draftOrder() reads it to decide which row says "You", which
     is why the settings list highlighted the right chair while the draft
     started in the wrong one. Two right answers, one of them not being asked.

     setMySlot() calls render(), which fires "juke:header", which useJukeTick
     above re-renders on — so this is live without a second copy to keep in
     step. It also refuses a seat outside the league, which the useState
     never did. */
  const lobbySlot = engine ? engine.mySlot() : 0
  const setLobbySlot = (seat) => { if (engine) engine.setMySlot(seat) }
  // Three screens, not two: Settings & Locker (league config, nothing
  // drafted yet, no board) -> choose a seat (the live page's own shell,
  // board in claimable mode) -> the live draft itself, gated by `started`
  // below. entered/! started is the middle one. Local and UI-only on
  // purpose — it says nothing about the actual draft, which is exactly why
  // it can't just be `!started` reused: a page refresh mid-"choosing a
  // seat" has nothing saved to resume into anyway, so there is no save to
  // desync from by starting back at the Locker.
  const [enteredRoom, setEnteredRoom] = useState(false)
  // Homepage v4 pass 0's lobby -> draft room sonar placement. Pressing
  // Start Draft flips this true; the poll effect below drops it once the
  // engine both reports started AND has real data loaded (players.js/
  // stats.js/draft-engine.js — see app.js's deferred-data boot and its
  // dataReady() bridge method), held to a floor. Distinct from `started`
  // itself: engine.startDraft() flips state.started synchronously in
  // app.js, before React has had a chance to paint anything for it, and
  // reaching #/draft-room at all almost always means the deferred data
  // landed long ago on the homepage — so this is mostly the floor doing
  // its job, not a real wait, but the brief's requirement is unconditional
  // ("every surface, always"), not "only when slow".
  //
  // The floor is 1600ms: one full turn of the loader's own 1.6s loop.
  //
  // It shipped at 500 — the design package's stated minimum — and that was
  // wrong on the real screen. Reported by the owner off the deployed site:
  // "way too short and you almost can't make out what's on the screen before
  // you get sent into the draft room."
  //
  // The argument that produced 500 is worth keeping because of how it failed.
  // It went: 400 was too short historically because SonarLoader's ring is a
  // sweep with a beginning, so a screen gone before one cycle completed read
  // as a flash; 2100 was RING_MS, one full sweep, so the thing always finished
  // what it started; and DraftRoomLoader has no sweep to complete, because its
  // teeth run on negative delays stepped 55ms apart and it is mid-loop on its
  // first painted frame. All of that is true. It looks the same held for 500ms
  // as for 5000.
  //
  // And it answers the wrong question. "Does it look stuttery" and "can a
  // person see it" are different quantities, and only the first one is about
  // the animation. Dwell time is about the reader. At a 500ms floor the layer
  // is on screen for 500 plus a 220ms fade-out, and the first 160 of that is
  // still fading IN — so roughly a third of a second at full opacity, for a
  // screen carrying a mark, a heading and a sub-line. That is not enough to
  // read, and no property of the loop's seamlessness changes it.
  //
  // 1600 is one complete cycle: the teeth sweep left to right once and the
  // eyes flicker once, so the whole gesture plays through rather than being
  // sampled. That is a reason rather than a taste — it is the shortest hold
  // that shows the composition entire. It also lands between the 2100 nobody
  // complained about and the 500 that was reported, nearer the former.
  //
  // The package's 500 is a MINIMUM and this does not contradict it. What it
  // forbids is going lower.
  //
  // 2400 now, on the same report and the same reasoning one step further:
  // asked for slightly longer alongside a larger mark. It is one and a half
  // turns of the 1.6s loop, and landing off a cycle boundary costs nothing
  // here — this is a FLOOR, so the actual end is max(floor, ready) and ready
  // is arbitrary, which means the layer already leaves mid-loop on any wait
  // that outlasts the floor. Cycle alignment was never achievable and was
  // never what 1600 bought; what it bought was dwell, and this buys more of
  // it. On screen that is 2400 plus the 220ms fade against 1820 before.
  const [starting, setStarting] = useState(false)
  const startingSinceRef = useRef(0)
  const START_TRANSITION_MIN_MS = 2400
  // The layer stays mounted through its own 220ms fade-out, so the board is
  // not revealed by a hard cut. `leaving` is what separates "the draft is
  // ready" from "the loader has finished getting out of the way" — without it
  // the element unmounts on the first of those and the fade never plays.
  const [leaving, setLeaving] = useState(false)
  // 15s, from the package: past this the wait has stopped being a wait. The
  // poll below has no other exit — it is an rAF loop on a condition that a
  // wedged engine never satisfies — so without this the screen is a permanent
  // full-viewport layer at z-index 60 with no way out but a reload.
  const START_TRANSITION_MAX_MS = 15000
  const [startTimedOut, setStartTimedOut] = useState(false)
  // The one thing that can refuse the Start button, said beside it rather
  // than folded away — the rule the legacy setup screen already followed.
  const problem = engine ? engine.setupProblem() : ''

  /* The saved, unfinished draft — for the phone Mock Drafts list's own
     resume row. DraftLocker computes the same thing for its InProgressBand
     and keeps it local, which is right for it; this one has to live here
     because the two Lobby screens are chosen here.

     inProgressSummary() is guarded on its own (CLAUDE.md records the cold-
     load ReferenceError that came of trusting a caller to check dataReady()
     first), so this is safe on the first pass and simply returns null until
     the deferred data lands. `tick` is what makes it re-read once it has,
     and after a discard or a resume. */
  const inProgress = engine && tick >= 0 ? (() => {
    try { return engine.inProgressSummary() } catch { return null }
  })() : null
  // Recomputed each render rather than memoized: these change on every pick,
  // and state.picks is mutated in place so nothing here may be keyed on it.
  const filterCounts = engine ? engine.filterCounts() : null
  /* Who is sitting where, straight off the room's broadcast. viewFor() has
     already turned member ids into names before it leaves the server — a
     client that has never been told another member's id must not learn it
     from this screen. Null off-room: there is nobody else to show. */
  const roomSeats = (() => {
    const room = engine ? engine.room() : null
    return room && room.seats ? room.seats : null
  })()
  /* Functional update, not a read of `tray`. Written the obvious way first,
     and two quick clicks moved the tray one step: both handlers closed over
     the same render's `tray`, computed the same next position, and the
     second set it to where the first already had. The bug only shows up when
     somebody presses twice faster than a re-render, which is exactly how a
     person uses a chevron to go from raised straight to hidden. */
  const moveTray = (dir) => {
    setTray((current) => {
      const i = TRAY.indexOf(current)
      return TRAY[Math.min(TRAY.length - 1, Math.max(0, i + dir))]
    })
  }
  // 'board' is the default — the board's own ADP-rank order, same as
  // sortBy === 'adp' asc for undrafted players, but it's its own case so
  // clicking away from a column and never toggling anything back to it
  // isn't required just to get the original order back.
  const [sortBy, setSortBy] = useState('board')
  const [sortDir, setSortDir] = useState('asc')
  const handleSort = (column) => {
    if (column === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDir(SORT_DEFAULT_DIR[column])
    }
  }
  /* Players / Board / Decide / Analysis — the Cockpit's own four tabs,
     driven by DraftCockpitHeader's tab nav rather than a second strip
     inside the body (there was one, redundant with the header the moment
     the header grew tab buttons of its own). Players is the default now:
     the ESPN-style queue/roster/pool/picks screen most of a draft is
     actually spent on, per the Players tab handoff. Decide stays the
     fallback the finished-draft redirect below uses — it still answers
     "what should I do right now," just no longer the first thing a
     manager sees. Board and Analysis keep the existing panels-below-the-
     fold layout (Queue/Roster/Chat/Log for Analysis; Board grew its own
     ribbon/dock in the Board tab pass); Decide and Players each own a full
     content-area layout instead, with nothing below either of them. */
  const [view, setView] = useState('players')
  const [menuOpen, setMenuOpen] = useState(false)
  /* Mirrors AppHeader.jsx's own soundOn state — engine.soundWanted() is
     not covered by the "juke:header" tick, since toggling it never
     touches renderHeader(). This page renders its own header
     (DraftRoomStatusBar, or LobbyBar pre-entry) rather than AppHeader, so
     it keeps its own copy of the same sync instead of reaching into that
     component. */
  const [soundOn, setSoundOn] = useState(false)
  useEffect(() => {
    if (!engine) return
    setSoundOn(engine.soundWanted())
  }, [engine])
  const handleToggleSound = () => {
    if (!engine) return
    engine.toggleSound()
    setSoundOn(engine.soundWanted())
  }

  // Solo has no real persistent "keep drafting for me" flag to read (see
  // the bridge comment on toggleRoomAutopilot in app.js) — a room does, so
  // this is only ever the source of truth off-room.
  const [soloAutopick, setSoloAutopick] = useState(false)
  // Guards the solo autopick effect against submitting twice for the same
  // turn — it re-runs on every "juke:header" tick while it's my turn, not
  // just on the one that actually changed anything.
  const lastAutoPickedOverall = useRef(-1)

  // Derived, engine-dependent values, computed with safe fallbacks so they
  // can sit above the early return below — every hook in this component
  // has to run on every render, in the same order, so the autopick effect
  // can't wait until after `if (!engine) return null`.
  const DE = typeof window !== 'undefined' ? window.DraftEngine : null
  const league = engine ? engine.league() : null
  const picks = engine ? engine.picks() || [] : []
  const board = engine ? engine.board() || [] : []
  // mySlot is only set once a real draft has started; this page is also
  // reachable before that (a fresh board, nobody on the clock yet), so it
  // falls back to seat 0 rather than leaving every "mine" check undefined.
  const mySlot = engine ? engine.mySlot() ?? 0 : 0
  const onClock = engine && DE && league ? DE.onTheClock(league, picks.length) : null
  const overall = picks.length + 1
  const myTurn = !!onClock && onClock.slot === mySlot
  const roomActive = engine ? engine.inRoom() : false
  // In a room, state.autoMe is the real flag (toggleable from the legacy
  // UI too, so this has to read it live rather than mirror a local copy).
  // Off-room it's just the local switch above.
  const autopick = roomActive ? !!(engine && engine.autoMe()) : soloAutopick
  // hasRoom() ("in a room") rather than inRoom() ("the socket is up right
  // now") — the same distinction CLAUDE.md's own dropped-socket section
  // draws, and the one that matters here: a guest whose socket blips
  // mid-draft is still in the room and must not be bounced back to the
  // locker just because roomActive flickered false for a reconnect.
  const hasRoomVal = engine ? engine.hasRoom() : false

  const started = engine ? !!engine.headerInfo().started : false
  // enteredRoom only ever gets set true by the "Enter Draft Room" button
  // (and the locker's own start-a-new-mock action) — there was no path
  // that set it when a draft became started any other way, which is
  // every path that matters more: resuming a saved draft, or a room
  // broadcast landing on a guest who joined the URL directly. Without
  // this, resuming from the locker flipped state.started but the screen
  // just kept showing the locker forever, since enteredRoom || !started
  // never followed. If a draft is genuinely running, "entered" is true
  // by definition — there's no state where started should be true and
  // this should still be showing Settings & Locker.
  useEffect(() => { if (started) setEnteredRoom(true) }, [started])
  // The other half of the effect above: enteredRoom had three ways to
  // become true and, until this, none to become false again. goHome()
  // (app.js — the real function behind restart(), which is both "Discard
  // draft" and "Leave the room" in the header kebab) is vanilla JS with no
  // reference to this component's state, so it says so on window the same
  // way headerInfo() already does for "juke:header". Without this, discard
  // or leave cleared state.started and disconnected the room exactly as
  // they should, but enteredRoom stayed stuck true from whatever had set
  // it earlier — and the next Lobby visit fell straight through its own
  // draftsActive || !enteredRoom guard into a stale, nothing-going-on
  // seat-picker instead of back to the Locker. A page load never needs
  // this — enteredRoom starts false — so there is nothing to reconcile on
  // mount, only on the way out.
  useEffect(() => {
    const onHome = () => setEnteredRoom(false)
    window.addEventListener('juke:home', onHome)
    return () => window.removeEventListener('juke:home', onHome)
  }, [])
  // Polls the engine directly on rAF rather than waiting on another
  // "juke:header" tick: app.js's deferred-data retry (see the boot at its
  // foot) only re-runs refreshSetup() while state.started is still false,
  // so if the deferred files finish loading *after* Start Draft was
  // pressed, nothing re-dispatches that event and a listener keyed on it
  // would hang here forever. engine.headerInfo().started and
  // engine.dataReady() are read fresh every frame instead, independent of
  // whether app.js has any further reason to re-render.
  useEffect(() => {
    if (!starting || !engine) return
    let raf
    let fade
    const check = () => {
      const ready = !!engine.headerInfo().started && engine.dataReady()
      const elapsed = performance.now() - startingSinceRef.current
      if (ready && elapsed >= START_TRANSITION_MIN_MS) {
        // Fade the layer out over 220ms and only then unmount it. Setting
        // `starting` false here directly is what produced the hard cut this
        // replaces; the flag that actually ends the transition is the timer.
        setLeaving(true)
        fade = setTimeout(() => { setStarting(false); setLeaving(false) }, 220)
        return
      }
      if (elapsed >= START_TRANSITION_MAX_MS) { setStartTimedOut(true); return }
      raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      // The fade timer has to be cleared too. This effect re-runs on `engine`,
      // which moves on every juke:header tick, so a surviving timer from a
      // previous run would drop `starting` mid-transition on a later one.
      if (fade) clearTimeout(fade)
    }
  }, [starting, engine])
  // A real invite link (#/draft-room?room=CODE) joins the room over the
  // socket the moment app.js boots — see joinRoom() in app.js — entirely
  // independently of this component's own local enteredRoom state. Without
  // this, a guest who clicked a friend's invite landed on "Your draft
  // locker / Nothing in progress / Start your first mock" instead of the
  // seats they were just invited to, and had to notice and press "Enter
  // Draft Room" themselves to see them. Joining a room is never a fresh
  // start, so it should never show the locker a fresh start shows.
  //
  // suppressAutoEnterRef is what keeps this from also firing on the host's
  // own "Draft with friends" action (DraftWithFriendsModal.jsx). Gating on
  // draftsActive (the Lobby route) was the first fix tried and doesn't
  // hold up: createRoom() writes location.hash = "#/draft-room?room=..."
  // itself, as part of creating the room, and that hash change flips
  // draftsActive to false immediately — well before hasRoomVal actually
  // turns true, since that one waits on the socket rather than just the
  // hash write. By the time this effect's condition is actually checked,
  // draftsActive already reads false regardless of which action caused
  // hasRoomVal to flip, because createRoom() is what moved it there in the
  // first place. Snapshotting the hash once at mount doesn't hold up
  // either: DraftRoom mounts unconditionally on every page load — home,
  // Lobby, wherever — so a session that starts on the homepage and only
  // later navigates client-side to the Lobby would freeze the wrong
  // answer. handleDraftWithFriends() below is the one place that actually
  // knows "this specific hasRoomVal transition is about to be the Lobby's
  // own doing" — RoomPanel.jsx's onCreated prop reports that fact directly
  // the instant createRoom() succeeds, rather than it being inferred after
  // the fact from state that's already moved on. Without this, the host
  // saw the seat-picker before they'd had a chance to see the invite link
  // DraftWithFriendsModal.jsx had just rendered — pulled out from under
  // the exact screen whose whole job was to show it to them.
  const suppressAutoEnterRef = useRef(false)
  useEffect(() => { if (hasRoomVal && !suppressAutoEnterRef.current) setEnteredRoom(true) }, [hasRoomVal])
  // Computed up here, with the other pre-early-return fallbacks, so the
  // insights effect below can watch it — the later render code reuses this
  // same value rather than asking engine.draftOver() a second time.
  const draftIsOver = engine && started ? !!engine.draftOver() : false

  /* Tell the reader it is their pick when they are not looking at the tab.
     Sits here, above every early return, for the reason the comment on the
     derived values above already gives: every hook in this component runs
     on every render in the same order, so this cannot wait until after
     `if (!engine) return null` or the phone branch's own return. The hook
     is a no-op with notifications off, unsupported or unpermitted, and
     fires on the turn-CHANGE rather than the turn — see its own file for
     why that distinction is the whole feature. */
  useDraftNotifications({
    engine,
    myTurn,
    over: draftIsOver,
    code: DE && league && onClock ? DE.pickCode(picks.length + 1, league) : null,
  })

  // Which team's report the Insights tab is showing. Yours on the
  // auto-navigate below; a board header click opens that column's team
  // instead. State lives here rather than inside the tab's own component
  // so a header click can pick the team and switch to it in one gesture.
  const [insightsSlot, setInsightsSlot] = useState(0)
  // Which seat the desktop Roster panel is showing. Separate from
  // insightsSlot: reading a rival's roster mid-draft and reading a
  // finished team's report are different questions, and one resetting
  // the other would be a surprise.
  const [rosterSlot, setRosterSlot] = useState(0)
  // PickClockBand's own swipe-to-collapse state, lifted here rather than
  // owned there — collapsing the band also has to hand its height back to
  // PlayersTab.jsx's autopick ribbon directly beneath it (see that band's
  // own comment), which is a sibling component PickClockBand has no reach
  // into on its own.
  const [bandCollapsed, setBandCollapsed] = useState(false)
  // Which pane PlayersTab.jsx's own mobile segmented control is showing —
  // Pool/Queue/Roster/Picks — lifted here for the same reason hubTab is:
  // DraftDecideScreen's Roster link and "Browse all N players" button both
  // reach across from the Decide tab into a different screen entirely, and
  // a control cannot open a specific pane of a screen that owns its pane as
  // unreachable local state.
  const [mobilePane, setMobilePane] = useState('pool')
  // The Board tab's own mobile segmented control — Board/Pool/Picks, a
  // different vocabulary than Players' own mobilePane above (Pool/Queue/
  // Roster/Picks), so a separate piece of state rather than one shared
  // value two different pane sets would have to agree on.
  const [boardPane, setBoardPane] = useState('board')
  // DraftDecideScreen's "Browse all N players" button calls this with
  // 'players' — the only value anything in the app still passes. It used
  // to also take 'team' for a "Roster ›" link that opened PlayerHub's
  // sheet; that link is gone from DraftDecideScreen's own mobile pass too
  // now (prompt 06 folded roster info into Decide's own Team pane instead
  // of routing away from the screen for it), so 'players' → the Pool pane
  // is the only real destination left. Was named openHub() while a
  // 'queue'/'chat'/'log' branch still routed into PlayerHub's sheet
  // instead; keeping that name once nothing calls it that way any more
  // would be exactly the stale-name-after-the-behaviour-moved bug CLAUDE.md
  // already documents elsewhere in this app (Discard/pause/etc) — the same
  // reason this dropped its now-dead 'team' branch rather than keeping an
  // argument nothing passes.
  const openPlayersScreen = () => {
    setMobilePane('pool')
    setView('players')
  }
  // The Insights tab opens itself on the edge — "the draft just became
  // over", not "the draft is over" — same reasoning as
  // checkDraftFinished()/revealAnalysis() in app.js: acting on the state
  // would drag the view back to Insights on every re-render after
  // somebody had navigated away from it to look around. The effect's dep
  // array IS the edge detector: it only re-fires when draftIsOver actually
  // changes. A draft reopened from the Locker mounts with draftIsOver
  // already true, so the first run fires too — which is right, since
  // opening a finished draft is exactly a request for this screen. This
  // used to open a separate modal over whichever tab was active and
  // separately nudge that tab off of Decide (which has nothing left to
  // decide once the draft is over); now that Insights is a real tab
  // rather than an overlay, switching straight to it is both of those at
  // once — Decide is hidden from the tab bar the same edge this fires on
  // (see DraftCockpitHeader.jsx/MobileDraftTabBar.jsx), so there's nowhere
  // stale left to nudge away from.
  //
  // The falling edge matters just as much and had no handler, which is the
  // second half of the "Start mock draft opens an old insights report" bug.
  // This component never unmounts between drafts — the Lobby is one of its
  // own branches (draftsActive, below), so finishing a draft, going back to
  // the locker and starting a new one is all one mount, and `view` stayed on
  // 'insights' from wherever the last draft had left it. With the engine
  // side fixed the new draft was genuinely fresh and still landed on a
  // report: grade A+, every lineup slot "Empty", the header beside it
  // correctly reading ROUND 1 · PICK 1. A right value in the wrong view.
  //
  // Watched through a ref rather than added as an `else` on the branch
  // above, because this effect also depends on mySlot: an `else` would fire
  // on any mySlot change while a draft was merely in progress and yank a
  // reader off whatever tab they were on. Only a real true -> false
  // transition means "the draft I was reading about is gone".
  const wasOverRef = useRef(false)
  useEffect(() => {
    if (draftIsOver) {
      setInsightsSlot(mySlot)
      setView('insights')
    } else if (wasOverRef.current) {
      // Board rather than the previous tab: there is no previous tab to
      // return to, and Board is where every other "Close" in this room
      // already lands.
      setView('board')
    }
    wasOverRef.current = draftIsOver
  }, [draftIsOver, mySlot])

  // The Roster panel opens on your own seat. mySlot is 0 until a draft
  // actually starts, so this follows it rather than being an initial
  // value that would strand the panel on seat 0 for anyone who drafted
  // from a different one.
  useEffect(() => { setRosterSlot(mySlot) }, [mySlot])

  // Solo autopick's real submission path: the exact same engine.draftPlayer
  // the Draft button uses (draftAndAdvance() underneath), just triggered
  // automatically instead of by a click, with the pick chosen by
  // engine.autoPickForMe() — the same queueTop() -> cpuChoice() ->
  // bestLeft() order autoDraftRest()'s own solo loop already uses for my
  // seat. Room mode needs none of this: driveMyAutopilot() already re-runs
  // itself off every room broadcast once toggled on (see the bridge
  // comment on toggleRoomAutopilot), so this effect only ever acts off-room.
  useEffect(() => {
    if (!active || !engine || !started || roomActive || !soloAutopick || !myTurn) return
    if (lastAutoPickedOverall.current === overall) return
    lastAutoPickedOverall.current = overall
    const choice = engine.autoPickForMe()
    if (choice) engine.draftPlayer(choice)
  }, [active, engine, started, roomActive, soloAutopick, myTurn, overall])

  if (!(active || draftsActive) || !engine) return null

  // Takes priority over every branch below, including the entry screen
  // Start Draft was pressed from and the live board `started` now points
  // at — the loader is the thing standing between those two, not a state
  // alongside them. bg-slate matches the ground DraftLocker/DraftEntryScreen
  // already render on (see their own "fixed inset-0 ... bg-slate" shells
  // below); JukeMark's surface="app" is the negatives variant measured
  // against that exact hex (#1E2733, tailwind.config.js's slate.DEFAULT),
  // not "obsidian", which is the boot overlay's own void-page ground.
  if (starting) {
    /* Design package 03. The layer draws its own ground (#151D2B) and its own
       centring, so there is no wrapper here any more — the <div> this replaced
       existed to supply bg-slate and a flex column, and a second box around it
       would only be somewhere for a future className to go wrong.

       The fade is on this element rather than inside the component so that the
       component stays usable inline, where a caller wants it to appear with
       whatever it is sitting in rather than to animate itself in. 160ms in and
       220ms out, both from the package; `leaving` is set 220ms before the
       unmount so the transition has time to run. */
    return (
      <DraftRoomLoader
        label={startTimedOut ? 'This is taking longer than it should' : 'Entering draft room'}
        sub={startTimedOut || !league ? '' : `Seating ${league.teams} teams`}
        error={startTimedOut ? 'This is taking longer than it should' : ''}
        className={
          'transition-opacity motion-reduce:transition-none ' +
          (leaving ? 'opacity-0 duration-[220ms] ease-out' : 'animate-[sonar-fade_160ms_ease-out_both]')
        }
      />
    )
  }

  // Enter takes you to #/draft-room whether you arrived here via that
  // route already or via the direct #/drafts link — location.hash is a
  // harmless no-op when it's already what it's being set to.
  const enterDraftRoom = () => {
    location.hash = '#/draft-room'
    setEnteredRoom(true)
  }

  // Homepage v4 pass 0's lobby -> draft room sonar placement. Pressing
  // Start flips `starting` true; the poll effect below drops it once the
  // engine both reports started AND has real data loaded, held to a
  // floor — see `starting`'s own declaration for the full reasoning.
  // Factored out rather than left inline on the preDraft header's
  // onStartDraft, because the solo-skip path below needs the identical
  // sequence and a second copy of "start the sonar, then start the
  // engine" is exactly the kind of duplication that drifts.
  /* Everything this screen has to forget before a new draft, in one place
     because there are exactly two functions that call engine.startDraft()
     and a second copy of this would drift the first time a third arrives.

     Autopilot is a decision about the next few minutes, not a preference —
     the same reasoning state.autoMe is already deliberately never saved
     under ("coming back to a draft still on autopilot is a nasty surprise").
     soloAutopick is this component's own state and this component does not
     unmount between drafts, so a manager who armed it to step away from one
     draft had it still armed on the next, which then drafted their team
     without being asked. Found while fixing the stale-picks bug above: same
     screen, same shape, one flag over.

     Deliberately not an effect on an edge of `started` or `draftIsOver`,
     which is where this was written first and does not hold: "Back to the
     locker" is a route change that leaves state.started true, so neither
     flag moves between finishing one draft and starting the next, and the
     effect never re-fires. That is the same wrong assumption the bug itself
     is made of. Pressing Start is the event that actually means "new
     draft", so this hangs off that and nothing else. */
  const armFreshDraft = () => {
    setSoloAutopick(false)
    startingSinceRef.current = performance.now()
    // Both transition flags are per-attempt and both have to be cleared on the
    // way IN, for exactly the reason this function exists: DraftRoom does not
    // unmount between drafts, so anything left set survives into the next one.
    // A stuck `startTimedOut` would open the following draft on the timeout
    // message, and a stuck `leaving` would start it already faded out — the
    // same shape as the `view`/`soloAutopick` leaks this function was written
    // for, one state pair along.
    setStartTimedOut(false)
    setLeaving(false)
    setStarting(true)
  }

  const beginDraft = () => {
    armFreshDraft()
    /* The clock comes from state, which is where it lives — the New Mock
       card and the settings modal both write it through setClockLength().
       Reading it here rather than holding a second copy is what stopped
       either control being decorative. */
    engine.startDraft({ mySlot: lobbySlot, clockLength: engine.clockLength() })
  }

  // The Lobby's "Start mock draft" button. A room still has to go through
  // the seat-picker — somebody has to actually claim a chair before
  // "Start for everyone" means anything — but solo has nobody else to wait
  // on, and the seat/clock it would ask for on that screen are exactly the
  // ones already chosen on the New Mock card a moment ago. Making somebody
  // confirm a choice they just made is the "unnecessary second step" this
  // was built to remove.
  const handleStartNew = () => {
    if (roomActive) { enterDraftRoom(); return }
    location.hash = '#/draft-room'
    setEnteredRoom(true)
    beginDraft()
  }

  // The recommendation banner's own launch path (WhatToRunNext.jsx,
  // RecommendationEngine.jsx, via runRecommendation() in recommendation.js)
  // — deliberately its own function rather than an optional seat parameter
  // on beginDraft/handleStartNew above, even though that reads like less
  // code. Both of those are bound directly to a raw onClick in more than
  // one place already (DraftCockpitHeader's "Start" button passes
  // beginDraft straight through as onStartDraft; NewMockPanel's own "Start
  // mock draft" button does the same with handleStartNew) — an ordinary
  // click passes its own SyntheticEvent as the first argument, and an
  // optional `seatOverride ?? lobbySlot` would happily treat that truthy
  // event object as a seat index. This path is never bound to a click
  // directly, only ever called from inside runRecommendation() with a
  // real seat, so it stays separate rather than a shared signature two
  // very different call shapes would have to stay compatible with.
  //
  // roomActive is checked and refused here too, not just left to the
  // caller's own disabled state — every other control that can rewrite
  // league shape (NewMockPanel's Teams/Scoring selects, DraftSettingsModal)
  // refuses the same way once a room exists, and this was the one write
  // path to setLeague() that didn't.
  const startAtSeat = (seat) => {
    if (roomActive) return
    setLobbySlot(seat)
    location.hash = '#/draft-room'
    setEnteredRoom(true)
    armFreshDraft()
    engine.startDraft({ mySlot: seat, clockLength: engine.clockLength() })
  }

  /* The Practice-a-scenario grid's launch path (PracticeScenarios.jsx).
     Its own function for the same reason startAtSeat above is one: it is
     never bound to a click directly — the card calls it with a scenario
     object — so it can take a real argument without an ordinary
     SyntheticEvent ever arriving in that position.

     Order matters here in a way the two paths above do not have to worry
     about. engine.startScenario() can REFUSE (a config setupProblem() will
     not run, or a room that owns the league), and it puts the league back
     when it does — so the route change and the loader have to wait for the
     answer rather than lead it, or a refused card would leave a reader on
     a covered screen with a draft that never started. Returns the engine's
     own { ok, problem } so the card that was pressed shows the sentence. */
  const startScenarioDraft = (scenario) => {
    if (!engine || !engine.startScenario) return { ok: false, problem: 'Still loading the board.' }
    if (roomActive) return { ok: false, problem: 'Scenarios are for solo mocks. Leave the room to run one.' }
    armFreshDraft()
    const result = engine.startScenario(scenario)
    if (!result || result.ok !== true) {
      // Nothing started, so nothing may be covering the screen — the loader
      // this raised a line ago has no draft to wait for and would sit at its
      // 15s ceiling before admitting it.
      setStarting(false)
      return result || { ok: false, problem: 'That scenario could not be started.' }
    }
    location.hash = '#/draft-room'
    setEnteredRoom(true)
    return result
  }

  // The Lobby's direct multiplayer action — createRoom() is the exact call
  // RoomPanel.jsx's own "Create a room" button already makes; this just
  // reaches it without an Edit setup -> Invite detour first. Deliberately
  // doesn't also flip enteredRoom: see DraftWithFriendsModal.jsx's own
  // comment on why the link has to be seen before the screen holding it
  // is swapped out from under the host.
  const handleDraftWithFriends = () => setFriendsModalOpen(true)

  // Fired by RoomPanel.jsx's own onCreated the instant createRoom()
  // succeeds — see suppressAutoEnterRef's own comment above for why this
  // has to be an explicit report from the action itself rather than
  // something inferred afterwards from hasRoomVal or the route.
  const handleRoomCreatedFromLobby = () => { suppressAutoEnterRef.current = true }

  // Before a draft exists, this is the exact same real form the setup
  // page uses — league size, scoring, pick clock, draft position, and its
  // own Resume/Discard for a save in progress — rather than this page
  // guessing at a seat and a clock length nobody chose.
  //
  // draftsActive forces this screen regardless of enteredRoom — it's the
  // direct link back to the locker, and has to win even mid-draft (the
  // chevron on the live status bar points here now); the enteredRoom sync
  // effect above is what makes leaving it via Resume land back on the
  // live board rather than stranding you here.
  if (draftsActive || !enteredRoom) {
    /* Settings & Locker, full bleed, board-free.

       This was three equal columns — Configure Draft, Draft with friends, and
       the Locker — under a claimable board. The columns went first (every
       setting in Configure Draft now lives on the settings modal's General
       tab, and Draft with friends is its Invite tab — keeping both would have
       been the same duplication as two randomise buttons, at the scale of a
       whole panel), and the board went second: picking a seat is a live-page
       question now (see the next block), so this screen answers only "what
       is this draft" and "what have I already drafted" — settings and the
       locker, exactly what it says on the tin.

       Resume and Discard were checked before the Configure column went:
       InProgressBand inside the Locker owns both, so a saved draft is
       still resumable. ConfigureDraftForm only ever read the save to pre-fill
       its own fields — it's gone now (nothing imported it anywhere in the
       app), which is also why DraftLocker's own empty-state CTA needed
       rewiring rather than continuing to scroll to a form that no longer
       exists.

       z-[60], not z-40: #root (Homepage) never unmounts — a separate React
       root behind this one, per main.jsx — and its own fixed header is z-50.
       z-40 would trap this whole overlay beneath it. */
    return (
      <div className="fixed inset-0 z-[60] flex bg-slate text-white">
        {/* The rail, for the same reason ShellHeader is here: this route
            hides #view-home, which is where AppShell -- and so every other
            screen's rail -- lives. AppShell's own comment already records
            that the phone nav is mounted per-screen for exactly this route;
            the desktop rail was the half that never got the same treatment,
            so #/rooms/draft was the one app screen with no way off itself on
            a desktop. Reported as "the left rail disappears completely".

            RailNav takes no props -- it reads the hash itself, so it
            highlights Draft here without being told, and cannot disagree
            with the rail on the screen you arrived from.

            The outer div is a flex ROW now rather than a column, mirroring
            AppShell. Below lg RailNav is `hidden`, so the row has exactly
            one child and the layout is what it always was. */}
        <RailNav />
        <div className="flex min-w-0 flex-1 flex-col">
        {/* Both screens under this route get the site header, and the
            version that gated it on `lockerView` was wrong.

            The reasoning behind that gate was that the entry screen
            carries its own back chevron and title, so a header above it
            would be a second one. 3cg and 3cu say otherwise: they draw the
            full JUKE / Home / Drafts / Rooms bar AND the "‹ Rooms" chevron
            underneath it. They are not alternatives — the chevron goes
            back one level, the header goes anywhere. Reported as "header
            completely missing from the Draft Room page", which is exactly
            what it was: this route hides #view-home, so with no header
            rendered here there was none on the page at all.

            It is ShellHeader rather than the LobbyBar that used to sit
            here, which was the last of the pre-handoff marketing header
            left anywhere: a "How It Works / The Rooms" nav with a
            dropdown, on one screen, disagreeing with the three tabs every
            other screen shows.

            What LobbyBar carried that this does not is the settings gear.
            The entry screen's own "Draft settings" button is the way in
            now, and it is the only one — the dashboard behind "Your
            insights" is analytics and nothing else.

            active="rooms" because the Draft Room is a room and this is
            reached through #/rooms/draft. */}
        <ShellHeader active="rooms" />

        {settingsOpen && (
          <DraftSettingsModal
            engine={engine}
            started={false}
            inRoom={roomActive}
            mySlot={lobbySlot}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {friendsModalOpen && (
          <DraftWithFriendsModal
            onClose={closeFriendsModal}
            onCreated={handleRoomCreatedFromLobby}
            onEnter={enterDraftRoom}
          />
        )}

        {/* pb-[calc(58px+env(safe-area-inset-bottom))]: MobileAppTabBar's own
            fixed footprint, reserved on the scroll container the same way
            PlayerHub's mobile sheet already reserves its own clearance
            elsewhere in this file — never a fixed offset guessed
            independently of what's actually covering the content. lg: reverts
            to nothing, since the bar itself is lg:hidden. */}
        {/* No bottom padding of its own any more: the nav is a floating
            pill now (FloatingNavPill.jsx) and a `fixed` pill costs the page
            no layout height, so the clearance moved onto the screens
            themselves — NAV_PILL_CLEARANCE, which each of them reserves.
            Reserving it here too would double it on the phone screen and
            leave the desktop dashboard with padding for a bar that is
            `sm:hidden`. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Two Lobbies, and which one you get is no longer a question of
             width. It was: the dashboard is twelve analytics cells and a
             history table, which stacks into one very long column on a
             390px screen with the button the whole screen exists to offer
             somewhere past the fourth chart — so a phone got the launcher
             and a desk got the dashboard, and that was right.

             design_handoff_v3_alive's screen c is that same launcher at
             1280px (3cg), with the dashboard behind "Your insights" where a
             phone already had it. So the entry is what this route shows at
             every width, and `lockerView` alone decides. Nothing is lost:
             "Your insights" opens this exact component and a history row
             opens its own report path, both unchanged. */}
          {!lockerView ? (
            <DraftRoomEntry
              engine={engine}
              tick={tick}
              problem={problem}
              inProgress={inProgress}
              onStartNew={handleStartNew}
              onResume={() => { engine.resumeSavedDraft(); location.hash = '#/draft-room'; setEnteredRoom(true) }}
              onDiscard={() => engine.restart()}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenAnalytics={() => setLockerView('dashboard')}
              onDraftWithFriends={handleDraftWithFriends}
              roomActive={roomActive}
              onAnalyze={(id) => setLockerView(id)}
              onDelete={(id) => { engine.deleteHistoryDraft(id); forceTick() }}
              onLaunchScenario={startScenarioDraft}
              onSignupSport={(sport) =>
                sportsModalRef.current?.open(
                  `Juke is football only today. Leave an email and we'll tell you when ${sport} opens.`,
                  'sport:' + sport.toLowerCase(),
                )
              }
            />
          ) : (
            /* Host-only gating belongs on the real Start Draft action one
               screen further in, not here — anyone should be able to walk in
               and look at seats regardless of who the room says can actually
               begin it. Only a genuinely broken league config (problem) stops
               the launcher's own CTA from working, same rule LobbyBar used to
               enforce before this screen owned the action itself. */
            <DraftLocker
              onRunAtSeat={startAtSeat}
              roomActive={roomActive}
              initialAnalyzeId={typeof lockerView === 'string' && lockerView !== 'dashboard' ? lockerView : null}
              /* Every width now, for the same reason the branch above
                 stopped asking: the dashboard is reached FROM the entry
                 screen on a desktop too, so it needs the way back.

                 It clears the hash as well as the state, and that is not
                 tidiness. #/rooms/draft?report=<id> exists so this screen
                 and the archive cannot each hold their own idea of which
                 report is open — and leaving the id in the address while
                 the view has gone back to the entry is exactly that
                 disagreement, with this component on the wrong side of it.
                 Reloading would reopen a report the reader had closed.

                 replaceState, not `location.hash = ...`: assigning the hash
                 pushes a history entry, so Back would return to the report
                 the reader just dismissed. It also fires no hashchange,
                 which is right — the state is already set here, and the
                 effect above would only set it to the same value again. */
              onBackToList={() => {
                setLockerView(null)
                if (/[?&]report=/.test(window.location.hash)) {
                  history.replaceState(
                    null,
                    '',
                    window.location.pathname + window.location.search + '#/rooms/draft',
                  )
                }
              }}
            />
          )}
        </div>
        </div>
        <MobileAppTabBar />
        <EarlyAccessModal ref={sportsModalRef} />
      </div>
    )
  }

  // Entered, but nobody's picked yet — the live page's own shell (see the
  // final return below, which this deliberately mirrors: same fixed
  // inset-0 overlay, same DraftRoomStatusBar) with the claimable board
  // standing in for the real one. It's the *same* DraftBoardGrid the draft
  // itself uses, in claimable mode, for the reason DraftLobby.jsx's own
  // comment already gives: a second board drawn just for this moment would
  // be a picture of the real one that's wrong the first time it changes.

  // Declared before the !started early return below — DraftCockpitHeader
  // shows a working Autopick toggle pre-draft too (Entry's own summary
  // row displays the same room-aware `autopick` value), so this has to
  // exist before that branch can reach it. Room vs. solo really do mean
  // different things here — see the bridge comment on toggleRoomAutopilot
  // in app.js for why neither branch is a stand-in for the other. Both
  // pre-draft display sites used to read the raw `soloAutopick` state
  // regardless of room status, so toggling room autopilot here genuinely
  // worked but never visibly updated either of them — fixed at both call
  // sites below.
  const handleToggleAutopick = () => {
    if (roomActive) engine.toggleRoomAutopilot()
    else setSoloAutopick((a) => !a)
  }

  if (!started) {
    const startLabel = roomActive
      ? (engine.isHost() ? 'Start for everyone' : 'Waiting for the host')
      : 'Start draft'
    // "Start for everyone" alone is 163px at 375px width — before the sound
    // icon joined this row it was already a single pixel from clipping past
    // the edge (measured), and the icon's own 34px+gap pushed the room-host
    // case to a 43px overflow and even solo's shorter "Start draft" to 20px.
    // Same lever this bar already pulls everywhere else it's run out of
    // room (Round N ·, your turn): shorten the text rather than drop a
    // control. Computed beside startLabel because this is the one place
    // that already knows which of the three meanings is live — pattern-
    // matching the string back apart inside the header would be a second,
    // fragile copy of this same branch.
    const startLabelShort = roomActive
      ? (engine.isHost() ? 'Start' : 'Waiting…')
      : 'Start'
    // A guest can never press this button — only the host can start the
    // room — so below lg it collapses to a plain status icon instead of a
    // second CTA-shaped pill. Measured: even "Waiting…" alone, at this
    // button's normal padding, still overflowed the header by 74px once
    // Autopick+Sound+Settings were also accounted for — there wasn't a
    // shorter string that fit, because the real problem wasn't the text.
    // A control nobody in this seat can ever activate doesn't need CTA
    // weight at any width; see DraftCockpitHeader.jsx's own comment on
    // this exact prop for why a disabled-but-CTA-styled pill is its own,
    // separate problem from the overflow that surfaced it.
    const waitingForHost = roomActive && !engine.isHost()

    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-slate text-white">
        <DraftCockpitHeader
          preDraft
          problem={problem}
          startLabel={startLabel}
          startLabelShort={startLabelShort}
          waitingForHost={waitingForHost}
          startDisabled={!!problem || (roomActive && !engine.isHost())}
          onStartDraft={beginDraft}
          /* autopick (room-aware), not soloAutopick — handleToggleAutopick
             right above correctly flips the room's real state.autoMe when
             roomActive, but this was still displaying the local solo flag,
             which toggleRoomAutopilot() never touches. A room guest could
             tap this, genuinely enable their own room autopilot, and watch
             the switch keep reading "off" the whole pre-draft screen. */
          autopick={autopick}
          onToggleAutopick={handleToggleAutopick}
          onOpenMenu={() => setSettingsOpen(true)}
          soundOn={soundOn}
          onToggleSound={handleToggleSound}
        />

        {settingsOpen && (
          <DraftSettingsModal
            engine={engine}
            started={false}
            inRoom={roomActive}
            mySlot={lobbySlot}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {/* pt-[62px] matches DraftCockpitHeader's own height — see its own
            comment on why 62px isn't a Tailwind step and has to be
            matched exactly rather than rounded. No md: step-up any more:
            that used to add the ticker strip's own 6-unit band, which a
            design review had removed from the Draft Room entirely (it
            fought the pick clock directly beneath it). */}
        {/* overflow-hidden only from lg, where the three columns are sized
            to the viewport and each scrolls internally. Below lg the entry
            screen stacks to roughly 1520px, and this branch renders no
            bottom tab bar to reserve clearance for, so it just scrolls.
            Without this the screen was clipped at the fold with no way to
            reach the rest of it. */}
        <div className="flex flex-1 flex-col overflow-y-auto pt-[62px] lg:overflow-hidden">
          <DraftEntryScreen
            engine={engine}
            league={league}
            /* -1 while we are in a room whose seats have not arrived yet.
               mySlot is a leftover from before the room existed, so falling
               back to it draws "You" on seat 0 for a guest who is actually
               sitting somewhere else — briefly, but it is a chair with the
               wrong person's name on it, and the room is about to say so.
               No seat is better than the wrong seat. */
            mySlot={roomActive ? (roomSeats ? mySlot : -1) : lobbySlot}
            roomActive={roomActive}
            seats={roomSeats}
            /* autopick, not soloAutopick — same fix as the header a few
               lines up: this summary row unconditionally read the local
               solo flag, so a room guest who toggled room autopilot on
               kept seeing "Autopick: Off" here regardless. */
            autopick={autopick}
            onOpenSettings={() => setSettingsOpen(true)}
            /* Only in a room — off-room there is nobody to invite, and a
               control that opens a "create a room" panel from inside a
               draft you are about to start solo is a different action
               wearing this one's label. See DraftEntryScreen's own note
               for why this screen needs it at all. */
            onInvite={roomActive ? () => setFriendsModalOpen(true) : undefined}
            onClaimSeat={(seat) => {
              // In a room the room decides; off-room this is just my chair.
              if (roomActive) engine.claimSeat(seat)
              else setLobbySlot(seat)
            }}
          />
        </div>

        {/* The same modal the Lobby renders, mounted here too rather than
            moved: both screens can be the one a host is looking at when
            they want the link, and the Lobby's own copy is what surfaces it
            the moment a room is created. onCreated is not passed — a room
            already exists by the time this branch can render at all, so
            there is no creation for it to suppress the auto-enter of, and
            onEnter is what this screen's own Start button already does. */}
        {friendsModalOpen && (
          <DraftWithFriendsModal
            onClose={closeFriendsModal}
            onEnter={closeFriendsModal}
          />
        )}
      </div>
    )
  }

  const code = onClock && DE ? DE.pickCode(overall, league) : null

  // "If you wait" means past *this* pick — when it's genuinely my turn,
  // nextPicksFor(mySlot, 1) returns the pick I'm on right now (trivial: of
  // course he's still there before anyone's picked yet), not the one after
  // it. Skip my own current pick in that case; when it's someone else's
  // turn, my own next pick is already the right question to ask. Lifted
  // here from DraftDecideScreen.jsx, which used to compute this itself —
  // PickClockBand needs the identical value above the tab strip on every
  // tab, not just Decide, and a second copy of an off-by-one that already
  // cost one design-review round to fix is exactly the risk "nothing about
  // the league shape may be written down twice" exists to prevent.
  const upcoming = engine.nextPicksFor(mySlot, 2)
  const nextOverall = myTurn ? (upcoming[1] ?? null) : (upcoming[0] ?? null)
  // Same skip, same reason — a design review caught this exact rail
  // printing the pick already on the clock as though it were still ahead of
  // you ("1.11 · 2.02 · 3.11" while 1.11 was the live pick).
  const nextPicks = myTurn ? engine.nextPicksFor(mySlot, 5).slice(1) : engine.nextPicksFor(mySlot, 4)

  // DraftCockpitHeader composes its own "Round N · Pick N · your turn"
  // caption straight from onClock/overall/myTurn (below) rather than
  // reading headerInfo()'s pre-formatted statusLine/rightLabel/rightValue
  // strings — those were shaped for the old two-line bar's different
  // slots. urgent is the one field still worth reading off headerInfo()
  // itself: isMyTurn()'s own clock-under-10s check, not re-derived here.
  const urgent = !!engine.headerInfo().urgent

  const lineup = engine.seatedLineup()
  const rules = engine.rulesForFormat(league.scoring)
  const pointsFor = (player) => {
    const stat = engine.statOf(player)
    if (!stat || !stat.p) return null
    return engine.pointsUnder(stat.p, rules)
  }
  // overallScore() is the same "Juke score" used everywhere else on the
  // site — points above replacement at the player's position, as a share
  // of the best such figure on the board. Not a second value metric.
  const valueFor = (player) => engine.overallScore(player)
  // playerColumns.js's VORP/JUKE split: VORP is replacementGap() — the raw,
  // un-clamped points-above-replacement figure overallScore() divides down
  // to a 0-100 share — not a second value metric either, just the
  // un-shared form of the one above. survivalProbability() is asked
  // against nextOverall (below), the same "if I wait" pick the rail and
  // PickClockBand already compute, not a second guess at when I pick again.
  const vorpFor = (player) => engine.replacementGap(player)
  const survivalFor = (player) => engine.survivalProbability(player, nextOverall)
  // The Players tab's season toggle. p.priorPts/p.priorGames are already
  // real fields on every board player (buildPriorSeason() in app.js scores
  // them under these same rules), so "last season" is just a different
  // reader passed into the identical table rather than a second code path
  // — PlayerQueueSidebar never learns a season exists. VORP has no prior-
  // season equivalent (it's a projection concept — replacementGap() only
  // means something against a *forecast* replacement line), so that mode
  // withholds it rather than inventing one.
  const priorSeasonYear = engine.priorSeason ? engine.priorSeason() : null
  const pointsForActive = season === 'prior' ? (player) => player.priorPts : pointsFor
  const vorpForActive = season === 'prior' ? () => null : vorpFor
  /* The block a player's raw counting stats live on — the same `s.p`
     logColumns() reads in app.js, UNLESS the season toggle is on
     `priorSeasonYear`'s actual season, in which case it's `s.s[year]`
     instead. This was unconditionally `s.p` for a while: pointsForActive/
     vorpForActive already switched with the season toggle (above), and
     the "2025 Actual" group label already claimed to (playerColumns.js's
     projectedGroupLabel prop), but the raw REC/YDS/TD cells underneath
     that label kept reading next season's projection regardless of which
     season was selected. Reported directly: a true rookie with no 2025
     line at all — Makai Lemon, exp: 0 — sorted to the top of "2025
     Season" with 775 receiving yards, while the PTS/VORP columns in the
     same row correctly showed a dash for the very same reason (no prior-
     season stat.s entry to read). Same gp > 0 "a season the player was
     not in the league is absent, never a zero" test buildPriorSeason()
     already applies to p.priorPts — a second, independent read of the
     identical fact rather than reusing p.priorGames, since this can be
     asked about a season the toggle names before p.priorPts is even in
     scope on the caller's side. */
  const projOf = (player) => {
    const s = engine.statOf(player)
    if (season === 'prior') {
      const line = priorSeasonYear && s && s.s ? s.s[priorSeasonYear] : null
      return line && line.gp > 0 ? line : null
    }
    return s && s.p ? s.p : null
  }

  /* Per-position, per-tier average points — what the pool's tier-cliff
     divider names as "the next tier projects N fewer points." Built off
     the whole board (drafted players included), because a tier's own
     quality doesn't change as it empties out — the same reasoning
     DraftDecideScreen.jsx's tierLadder already applies to tier 1 vs 2,
     generalised here to whichever tier boundary the pool is actually
     showing. Reuses pointsFor() rather than reading board.projPts
     directly, so this can never disagree with the PTS column sitting in
     the very same table (CLAUDE.md: "never a second calculation" — see
     DraftBoardGrid's adpGap()/adpText() for the same rule applied to the
     ADP-gap number). Scoped to POS_LIST (QB/RB/WR/TE): K/DST are excluded
     from tiering-adjacent measures everywhere else in this app (their
     projections are the ones CLAUDE.md documents as unranked), and
     Decide's own tierLadder makes the identical exclusion. */
  // Keyed on tick alone (see keyedMemo's own comment for why this isn't
  // useMemo): this is a full per-position, per-tier scan of the whole
  // board, and nothing about it depends on any of the Players tab's own
  // filter/sort/season state — only on whether the bridge itself might
  // have moved. pointsFor (not pointsForActive) and board don't need to be
  // in the key: both are fully determined by `engine`, whose only "this
  // changed" signal is tick — keying on them directly would either do
  // nothing (board never changes identity) or invalidate every render
  // (pointsFor is a fresh closure every render, same as every other reader
  // here).
  const tierAvgByPos = tierAvgMemo([tick], () => {
    const out = {}
    POS_LIST.forEach((pos) => {
      const byTier = {}
      board.filter((p) => p.pos === pos).forEach((p) => {
        if (p.tier == null) return
        const pts = pointsFor(p)
        if (pts == null) return
        if (!byTier[p.tier]) byTier[p.tier] = { sum: 0, n: 0 }
        byTier[p.tier].sum += pts
        byTier[p.tier].n += 1
      })
      out[pos] = Object.fromEntries(
        Object.entries(byTier).map(([t, { sum, n }]) => [t, sum / n])
      )
    })
    return out
  })

  const photoFor = (player) => engine.photoUrl(player)
  const initialsFor = (player) => engine.initials(player.name)

  // FLEX is a roster slot (RB/WR/TE), not a player.pos, so it can't be a
  // plain equality check the way every other pill is. flexPositions() is
  // SLOT_ELIGIBLE.FLEX from app.js, bridged rather than hand-copied — see
  // the bridge comment on photoUrl/initials/flexPositions.
  const flexPositions = engine.flexPositions()
  // Who took a drafted player, for the showDrafted view — picks() rather
  // than a second copy of "who has who": teamLabel() is the exact name the
  // board's own header row already uses for that seat.
  const draftedByFor = (player) => {
    const pick = picks.find((p) => p.player.name === player.name)
    return pick ? engine.teamLabel(pick.slot) : null
  }
  // Keyed so switching tabs, or anything else that re-renders DraftRoom
  // without touching a filter, doesn't re-run five filters and a sort over
  // ~260 players for a list nobody asked to see recalculated. tick stands
  // in for board/engine for the same reason tierAvgByPos's memo above does,
  // and the season-aware readers (pointsForActive and friends) are the
  // same story as pointsFor there: fresh closures every render, fully
  // determined by engine + season, so keying on them would either change
  // nothing or invalidate the cache every time. flexPositions is
  // engine-derived too and isn't in the key for the same reason, but it's
  // still read correctly: the callback below is a new closure every render
  // same as always, keyedMemo just decides whether to call this render's
  // copy or keep the previous result, so whichever invocation actually
  // runs sees its own render's values regardless of what's in the key.
  const availablePlayers = availablePlayersMemo([
    tick, showDrafted, posFilter, expBand, nflTeamFilter, search, sortBy, sortDir, season,
  ], () => board
    .filter((p) => showDrafted || !p.drafted)
    .filter((p) => {
      if (posFilter === 'ALL') return true
      if (posFilter === 'FLEX') return flexPositions.includes(p.pos)
      return p.pos === posFilter
    })
    .filter((p) => {
      if (expBand === 'all') return true
      const exp = engine.statOf(p)?.exp
      return expBand === 'rookie' ? exp === 0 : exp !== undefined && exp > 0
    })
    // The Players tab's own filter — 'ALL' keeps everyone, same convention
    // as posFilter above rather than a separate sentinel.
    .filter((p) => nflTeamFilter === 'ALL' || p.team === nflTeamFilter)
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'board') return a.overall - b.overall
      /* Reuse the exact same readers the cells render from, so a sort can
         never disagree with what is on screen. Anything that is not one
         of the derived columns is a raw projection key (rushing yards,
         targets, and the rest of the scrollable stats), read off the same
         block those cells draw from.

         pointsFor/vorpFor here — not pointsForActive/vorpForActive — was
         the bug: PTS and VORP display through the season-aware readers
         (passed to PlayerQueueSidebar as pointsFor/vorpFor a few props
         down), so the table already showed 2025 numbers correctly with
         the season toggle set to prior — while a click on either header
         kept sorting by the plain, always-2026-projected reader. Reported
         directly as "sorting on metrics... sorts based on 2026 projects
         instead of 2025" — the two are meant to be the same rule this
         comment already states, and weren't. */
      const reader =
        sortBy === 'adp' ? (p) => p.adp
          : sortBy === 'pts' ? pointsForActive
            // 'vorp' is replacementGap() (the raw figure); 'juke' (and the
            // old 'value' alias PlayerProfileModal-era callers may still
            // pass) is overallScore() — two different columns since the
            // Players tab pass split what used to be one, see
            // playerColumns.js's own comment on the two keys.
            : sortBy === 'vorp' ? vorpForActive
              : sortBy === 'juke' || sortBy === 'value' ? valueFor
                // Tier is a rank within a position (T1 best), read straight
                // off the board rather than through statValue()'s 'T'+n
                // display string. Lasts is the same survivalFor() the LASTS
                // cell renders from (as a raw 0-1 probability rather than
                // the rounded percentage — sort order is identical either
                // way, so there's no reason to scale it up first). Both
                // used to have no branch here at all: playerColumns.js
                // marked them un-sortable for exactly that reason, until a
                // direct ask to sort by them made the case for adding one
                // instead of leaving the gap.
                : sortBy === 'tier' ? (p) => p.tier
                  : sortBy === 'lasts' ? survivalFor
                    : (p) => { const proj = projOf(p); const v = proj ? proj[sortBy] : null; return v || null }
      const av = reader(a)
      const bv = reader(b)
      // "A missing number is not a small number" — Value is null for K/DST
      // (overallScore() withholds a rank for UNRANKED_POSITIONS) and Proj
      // Pts is null for anyone with no projection. Blanks sort last in
      // both directions rather than reading as 0, same rule the legacy
      // player grid's own column sorts already follow.
      const aMissing = av == null || Number.isNaN(av)
      const bMissing = bv == null || Number.isNaN(bv)
      if (aMissing && bMissing) return 0
      if (aMissing) return 1
      if (bMissing) return -1
      return sortDir === 'asc' ? av - bv : bv - av
    }))

  // Real submission: engine.draftPlayer() is draftAndAdvance() underneath
  // (see the bridge comment in app.js), so this mutates the same
  // board/state a legacy Draft button would, and — in a room — sends the
  // same Live.pick() request. It re-checks isMyTurn() itself, but the
  // button is also disabled off the same `myTurn` value below, so a click
  // here should only ever be a no-op if the turn changed in the instant
  // between render and click (another manager's pick landing, a CPU step).
  // draftAndAdvance() calls render() synchronously, which fires
  // "juke:header" — useJukeTick() above picks that up and this whole page
  // (board, roster dock, status bar) re-renders with the real result,
  // including the CPU cascade that follows in solo mode.
  const handleDraft = (player) => {
    engine.draftPlayer(player)
  }

  // Discard is a real, direct call into app.js — restart() is
  // clearSave()+goHome(), the exact "Discard draft"/"Leave the room"
  // action. Not reimplemented here.
  const handleDiscard = () => engine.restart()

  /* "End draft" finishes it rather than stepping away from it — see
     DraftMenuOverlay's own note on why those have to be two different
     things and why this is never offered in a room. autoDraftRest() is
     app.js's own function, the same one a finished-draft test harness
     uses; the effect above that flips `view` to 'insights' on draftIsOver
     is what lands the reader on the report, and the Lobby is one press
     from there with the draft in the locker. */
  const handleEndDraft = () => engine.autoDraftRest()

  // The real queue (state.queue, an array of player names) — queueToggle()
  // is the exact function the legacy rail's star button already calls.
  // queuedNames as a Set just makes the sidebar's per-row lookup cheap.
  // queuePlayers resolves those same names back to board players, for
  // PlayerHub's mobile Queue tab — the exact resolution DraftLogDock's
  // desktop "My Queue" tab already does, not a second copy of it.
  const queuedNames = new Set(engine.queue() || [])
  const queuePlayers = (engine.queue() || []).map((name) => board.find((p) => p.name === name)).filter(Boolean)
  const handleToggleQueue = (name) => engine.queueToggle(name)

  /* Everybody else's picks, most recent first — the Draft Log's data.
     Computed once here and handed to both surfaces that draw it (the
     desktop panel and the mobile sheet's Log tab) rather than each
     deriving its own: two copies of "what has happened" is exactly the
     kind of thing that drifts.

     "Not my seat" is the honest filter. In a room some of those seats are
     other people rather than CPUs, and there is no per-pick flag saying
     which was which at the moment it picked. */
  const recentOthers = picks
    .filter((p) => p.slot !== mySlot)
    .slice(-10)
    .reverse()

  /* The phone redesign's own exit, taken only mid-draft — `view` flips to
     'insights' the moment draftIsOver (the effect above), and Insights is
     already responsive at every width today (it's been a real tab reached
     from MobileDraftTabBar since before this pass), so falling through to
     the existing return below for that one view is a deliberate choice,
     not an oversight: rebuilding a phone-specific Insights would duplicate
     a screen that already works here. Every value passed down is one this
     component already computed for the desktop/tablet render a few lines
     up — nothing here re-derives from `engine` a second time. */
  if (isPhone && view !== 'insights') {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-slate text-white">
        <DraftRoomPhone
          engine={engine}
          league={league}
          picks={picks}
          board={board}
          tick={tick}
          mySlot={mySlot}
          onClock={onClock}
          overall={overall}
          myTurn={myTurn}
          code={code}
          urgent={urgent}
          timeLeft={engine.timeLeft()}
          clockLength={engine.clockLength()}
          onOpenMenu={() => setMenuOpen(true)}
          autopick={autopick}
          onToggleAutopick={handleToggleAutopick}
          over={draftIsOver}
          rules={rules}
          pointsFor={pointsForActive}
          valueFor={valueFor}
          vorpFor={vorpForActive}
          survivalFor={survivalFor}
          photoFor={photoFor}
          initialsFor={initialsFor}
          flexPositions={flexPositions}
          draftedByFor={draftedByFor}
          queuedNames={queuedNames}
          queuePlayers={queuePlayers}
          onToggleQueue={handleToggleQueue}
          onDraft={handleDraft}
          filterCounts={filterCounts}
          tierAvgByPos={tierAvgByPos}
          priorSeasonYear={priorSeasonYear}
          projOf={projOf}
          season={season}
          onSetSeason={setSeason}
        />

        {menuOpen && (
          <DraftMenuOverlay
            engine={engine}
            onClose={() => setMenuOpen(false)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenNotifications={() => setNotifyOpen(true)}
            inRoom={roomActive}
            started={started}
            over={draftIsOver}
            discardLabel={hasRoomVal ? 'Leave the room' : 'Delete draft'}
            discardDanger={!hasRoomVal}
            onDiscard={handleDiscard}
            onEndDraft={handleEndDraft}
          />
        )}
        {notifyOpen && <NotificationSettings onBack={() => setNotifyOpen(false)} />}
        {settingsOpen && (
          <DraftSettingsModal
            engine={engine}
            started={started}
            inRoom={roomActive}
            mySlot={mySlot}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    )
  }

  return (
    // z-[60], not z-40: #root (Homepage) is a separate React root that
    // never unmounts (see main.jsx) and its own header is a fixed z-50.
    // z-40 traps this whole overlay beneath that header's stacking
    // context — invisible as long as DraftRoom rendered its own identical
    // <Header/> on top, but this view's header now has different content
    // (round/pick/clock/autopick, no login/signup), so the trap became a
    // real bug: Homepage's header was painting over this one entirely.
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate text-white">
      {/* DraftCockpitHeader is the fixed top bar for this view now — it
          carries the brand/ticker Header.jsx used to own here, consolidated
          with the round/pick/clock/autopick/tab-nav controls into one
          62px row. Header.jsx itself is untouched and still fixed-h-16 on
          the homepage — neither pre-draft screen in this file renders it
          either (LobbyBar and this same header in its preDraft mode are
          their own bars, not Header reused). */}
      <DraftCockpitHeader
        cockpitTab={view}
        onSelectTab={setView}
        round={onClock ? onClock.round : null}
        overall={overall}
        code={code}
        myTurn={myTurn}
        urgent={urgent}
        over={draftIsOver}
        clockLength={engine.clockLength()}
        timeLeft={engine.timeLeft()}
        autopick={autopick}
        onToggleAutopick={handleToggleAutopick}
        onOpenMenu={() => setMenuOpen(true)}
        soundOn={soundOn}
        onToggleSound={handleToggleSound}
        hidePill={(view === 'board' || view === 'players') && !draftIsOver}
      />
      {menuOpen && (
        <DraftMenuOverlay
          engine={engine}
          onClose={() => setMenuOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenNotifications={() => setNotifyOpen(true)}
          inRoom={roomActive}
          started={started}
          over={draftIsOver}
          discardLabel={hasRoomVal ? 'Leave the room' : 'Delete draft'}
          discardDanger={!hasRoomVal}
          onDiscard={handleDiscard}
          onEndDraft={handleEndDraft}
        />
      )}
      {notifyOpen && <NotificationSettings onBack={() => setNotifyOpen(false)} />}
      {/* pt-[46px]/lg:pt-[62px] matches DraftCockpitHeader's own height at
          each breakpoint — 46px below lg now that a live draft renders the
          compact mobile header there instead of the 62px bar (see that
          component's own comment). The ticker strip that used to add an
          md: step-up here is gone, removed from the Draft Room entirely
          per a design review (it fought the pick clock directly beneath
          it). No bottom padding here: PlayerHub's mobile sheet is `fixed`
          and so occupies no space in this flow — clearance for it is
          reserved inside the scrollable panels themselves (the board's and
          the player list's own pb-28), and reserving it here too would
          shrink the row for no reason.

          Analysis is the one exception, still flat pt-[62px]: its own
          mobile top bar (AnalysisTab.jsx) is a `fixed`, 62px, z-[55]
          replacement for this bar's mobile rendering, not a consumer of
          it, and that content div has no top-clearance of its own — it
          relies entirely on this wrapper's padding to clear whichever
          fixed header is actually floating above it. Shrinking this to
          46px for Analysis too without also shrinking that header would
          uncover 16px of its own fixed bar over the report's own content.
          AnalysisTab's mobile header is still 62px because reworking it is
          a later prompt's job, not this padding line's. */}
      <div className={'flex flex-1 flex-col overflow-hidden ' + (view === 'analysis' ? 'pt-[62px]' : 'pt-[46px] lg:pt-[62px]')}>
        {/* Same "!draftIsOver" gate PickTicker already uses a few lines
            down, extended to this band too — there is no live pick left
            to describe once the draft ends, and without this guard the
            band kept rendering "ON THE CLOCK · " with nothing after the
            dot (onClock is null once picks.length reaches totalPicks) and
            a clock that had stopped meaning anything. Real everywhere,
            not only on Analysis: any tab reachable after the draft ends
            shared the same stale band, this just happens to be the pass
            that noticed it while giving Analysis's own report the "while
            the draft is live" treatment prompt 08 asks for. */}
        {!draftIsOver && (
        <PickClockBand
          code={code}
          myTurn={myTurn}
          urgent={urgent}
          timeLeft={engine.timeLeft()}
          clockLength={engine.clockLength()}
          nextOverall={nextOverall}
          nextPicks={nextPicks}
          overall={overall}
          league={league}
          onClock={onClock}
          teamLabelOf={(slot) => engine.teamLabel(slot)}
          collapsed={bandCollapsed}
          onSetCollapsed={setBandCollapsed}
        />
        )}
        {view === 'decide' ? (
          /* Decide owns the whole content area, not half of it — its own
             roster rail and room-live rail already cover what the panels
             below the board show for Board/Analysis, so nothing renders
             underneath it. Board and Analysis keep the existing
             board-plus-panels layout exactly as it already worked. */
          <DraftDecideScreen
            engine={engine}
            league={league}
            mySlot={mySlot}
            myTurn={myTurn}
            /* This screen never received autopick at all — every Draft
               affordance on it (the ranked cards, the queue, "Everyone
               else") stayed live through a whole autopick turn. See
               DraftDecideScreen.jsx's own comment on canDraftNow. */
            autopick={autopick}
            picks={picks}
            onDraft={handleDraft}
            onQueueToggle={handleToggleQueue}
            onOpenProfile={setSelectedPlayer}
            queuedNames={queuedNames}
            nextOverall={nextOverall}
            nextPicks={nextPicks}
            /* Decide's own "Browse all N players" button reaches into the
               Players screen rather than mounting a player surface of its
               own — see openPlayersScreen()'s own comment for why this
               used to mean PlayerHub's sheet and now means PlayersTab.jsx
               directly. */
            onOpenHub={openPlayersScreen}
          />
        ) : view === 'players' ? (
          <>
            {/* PickTicker gates itself to lg+ internally (its own root
                className), same as the Board tab's identical call below —
                no external hidden/lg:flex wrapper needed. PlayersTab now
                does the same for its own two renderings (see its own file
                comment), so this branch is just its two real children,
                same shape as the Board branch a few lines down. */}
            {!draftIsOver && (
              <PickTicker
                league={league}
                onClock={onClock}
                overall={overall}
                mySlot={mySlot}
                myTurn={myTurn}
                urgent={urgent}
                code={code}
                timeLeft={engine.timeLeft()}
                clockLength={engine.clockLength()}
                teamLabelOf={(slot) => engine.teamLabel(slot)}
                autopick={autopick}
                roomSeats={roomSeats}
              />
            )}
            <PlayersTab
              engine={engine}
              league={league}
              mySlot={mySlot}
              myTurn={myTurn}
              teamLabelOf={(slot) => engine.teamLabel(slot)}
              autopick={autopick}
              onToggleAutopick={handleToggleAutopick}
              queuePlayers={queuePlayers}
              onToggleQueue={handleToggleQueue}
              rosterSlot={rosterSlot}
              onRosterSlot={setRosterSlot}
              filterCounts={filterCounts}
              picks={picks}
              board={board}
              players={availablePlayers}
              search={search}
              onSearch={setSearch}
              posFilter={posFilter}
              onPosFilter={setPosFilter}
              expBand={expBand}
              onExpBand={setExpBand}
              showDrafted={showDrafted}
              onShowDrafted={setShowDrafted}
              season={season}
              onSeason={setSeason}
              priorSeasonYear={priorSeasonYear}
              nflTeamFilter={nflTeamFilter}
              onNflTeamFilter={setNflTeamFilter}
              pointsFor={pointsForActive}
              vorpFor={vorpForActive}
              valueFor={valueFor}
              survivalFor={survivalFor}
              photoFor={photoFor}
              initialsFor={initialsFor}
              onDraft={handleDraft}
              draftOver={draftIsOver}
              queuedNames={queuedNames}
              draftedByFor={draftedByFor}
              onSelectPlayer={setSelectedPlayer}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={handleSort}
              projOf={projOf}
              tierAvgByPos={tierAvgByPos}
              mobilePane={mobilePane}
              onMobilePane={setMobilePane}
              bandCollapsed={bandCollapsed}
            />
          </>
        ) : view === 'board' ? (
          <>
            {/* The ribbon takes over the header's own centre pill on this
                tab (hidePill, above) — the same round/pick/clock, now beside
                a full-draft ticker rather than squeezed alone into the
                header. Hidden once the draft is over: there is no live pick
                left for it to describe, and the header's "Draft complete"
                pill takes the centre track back at that point — see
                DraftCockpitHeader's own hidePill comment for why the two
                never both want the centre track at once. */}
            {!draftIsOver && (
              <PickTicker
                league={league}
                onClock={onClock}
                overall={overall}
                mySlot={mySlot}
                myTurn={myTurn}
                urgent={urgent}
                code={code}
                timeLeft={engine.timeLeft()}
                clockLength={engine.clockLength()}
                teamLabelOf={(slot) => engine.teamLabel(slot)}
                autopick={autopick}
                roomSeats={roomSeats}
              />
            )}
            <div className="relative flex flex-1 flex-col overflow-hidden">
              {/* Board/Pool/Picks — mobile only. Below lg this tab has no
                  side dock and no PlayerHub sheet any more (see the retired
                  mount's own former comment, replaced by this one): the
                  three things the desktop dock plus that sheet used to
                  split across two mechanisms are one segmented control
                  instead, matching the Players tab's own precedent (a
                  dedicated screen beats a sheet floating over the board).
                  Chat and the activity Log lose their Board-tab access
                  point with it — Analysis's own mobile sheet still carries
                  both (its tabs prop stays the full default set), so
                  neither is gone, just no longer reachable from here,
                  the same trade Players' own mobile pass already made. */}
              <div className="flex shrink-0 gap-1.5 border-b border-slate-rule bg-slate-panel/40 px-2.5 py-2 lg:hidden">
                {BOARD_PANES.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setBoardPane(p.key)}
                    aria-pressed={boardPane === p.key}
                    className={
                      'h-11 flex-1 rounded-full px-2 text-center text-xs font-semibold transition-colors duration-150 ' +
                      (boardPane === p.key ? 'bg-teal-400/[0.14] text-teal-300' : 'text-ink-muted hover:text-white/60')
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* DraftBoardGrid's own flex-1 + min-h-[240px] (its root
                  className, unchanged) is the board's floor here — already
                  well past the 120px this tab's own acceptance check asks
                  for, so nothing about that component needed loosening for
                  this tab specifically. trayPos/onTrayUp/onTrayDown are new:
                  DraftLobby.jsx's own claimable-board mount never passes
                  them, so its chevrons stay unrendered there (see
                  DraftBoardGrid's own comment on that pair).

                  hidden/flex by boardPane below lg, always flex at lg+ —
                  the segmented control above is itself lg:hidden, so
                  boardPane is meaningless at desktop width and the grid
                  must never hide because of it there. */}
              {/* followLive: the board tracks the live pick, and stops
                  the moment the reader scrolls it themselves. There is no
                  crosshair on this board, which is why DraftBoardGrid
                  re-arms following on its own once the live cell is
                  scrolled back into view — see its own note. */}
              <div className={(boardPane === 'board' ? 'flex' : 'hidden') + ' min-h-0 flex-1 flex-col lg:flex'}>
                <DraftBoardGrid
                  shortNameOf={engine.shortName}
                  league={league}
                  picks={picks}
                  mySlot={mySlot}
                  onClock={onClock}
                  teamLabelOf={(slot) => engine.teamLabel(slot)}
                  onSelectPlayer={setSelectedPlayer}
                  onTeamClick={
                    draftIsOver
                      ? (slot) => { setInsightsSlot(slot); setView('insights') }
                      : undefined
                  }
                  trayPos={tray}
                  onTrayUp={() => moveTray(1)}
                  onTrayDown={() => moveTray(-1)}
                  followLive
                />
              </div>

              {/* The dock: the pool left, Chat/Log/Picks right, at a fixed
                  pixel height per tray position (DOCK_H, above) rather than
                  the graph's own percentage split the Analysis branch below
                  still uses. flex-shrink (not shrink-0) plus min-h-[37px] is
                  what lets a short window (924x540 is the acceptance check's
                  own number) take height back from the dock rather than
                  clip it or the board — the board's own 240px floor and this
                  37px floor both fit well inside 540px alongside the header,
                  ribbon and legend above them. lg:flex only: below lg this
                  tab's player access is still PlayerHub's mobile sheet,
                  mounted just below. */}
              <div
                style={{ flexBasis: DOCK_H[tray] }}
                className="hidden min-h-[37px] flex-shrink flex-grow-0 items-stretch overflow-hidden border-t border-slate-rule bg-slate-bar lg:flex"
              >
                {/* PlayerQueueSidebar, not a second pool table — the
                    Players tab pass folded this dock's own search/chips/
                    count/chevron header in front of the same shared table
                    every other surface uses, in bareTable mode so its own
                    built-in header (the recommendation card, its own
                    search box) doesn't render twice. */}
                <div className="flex min-w-0 flex-1 flex-col border-r border-slate-rule">
                  <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-rule px-3 py-2">
                    <span className="relative block w-[180px] shrink-0">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search players"
                        className="h-7 w-full rounded-md border border-slate-rule bg-slate-sunk/60 pl-7 pr-2 text-xs text-white placeholder:text-white/30 focus:border-teal-400/60 focus:outline-none"
                      />
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                      {['ALL', ...POS_LIST, 'FLEX', 'K', 'DST'].map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setPosFilter(pos)}
                          className={
                            'h-[26px] shrink-0 rounded-full px-2.5 text-[11px] font-semibold transition-colors duration-150 ' +
                            (posFilter === pos ? 'bg-teal-500 text-obsidian' : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white')
                          }
                        >
                          {pos === 'ALL' ? 'All' : pos === 'DST' ? 'D/ST' : pos}
                        </button>
                      ))}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="whitespace-nowrap font-numeral tabular-nums text-[10px] text-ink-muted">{availablePlayers.length} available</span>
                      <button
                        type="button"
                        onClick={() => setTray((t) => (t === 'hidden' ? 'default' : 'hidden'))}
                        title={tray === 'hidden' ? 'Open the pool' : 'Collapse the pool'}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white/5 text-ink-soft transition-colors duration-150 hover:bg-white/10 hover:text-white"
                      >
                        {tray === 'hidden' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  {/* flex, not bare min-h-0 flex-1 — PlayerQueueSidebar's
                      own root comment requires its parent to be a flex row
                      so align-items:stretch can size it; without a display
                      utility this div is still block regardless of
                      min-h-0/flex-1, so the child never got a height to
                      stretch into and grew to its full content size
                      instead, leaving nothing for the inner list to
                      scroll. Same miss as PlayersTab.jsx's identical
                      wrapper, and the mobile Pool pane below shares it
                      too. */}
                  <div className="flex min-h-0 flex-1">
                    {/* isDesktop, not this dock's own `hidden ... lg:flex`
                        ancestor — that class is CSS-only, so the dock's
                        PlayerQueueSidebar stayed React-mounted (just
                        invisible) below lg the whole time boardPane's own
                        `{boardPane === 'pool' && ...}` Pool pane further
                        down was truly mounting a second one, colliding on
                        shared layoutIds. See useBreakpoint.js's own
                        comment and PlayersTab.jsx's identical fix for the
                        same mistake made the same way there. */}
                    {isDesktop && (
                    <PlayerQueueSidebar
                      bareTable
                      engine={engine}
                      players={availablePlayers}
                      posFilter={posFilter}
                      /* pointsForActive/vorpForActive, not the plain
                         pointsFor/vorpFor this used to pass — availablePlayers
                         (above) is already sorted by the season-aware
                         readers whenever the Players tab's season toggle is
                         on "prior", and projOf (passed a few lines down) is
                         season-aware too, so this dock was displaying
                         2026-projected PTS/VORP in rows a season toggle had
                         already sorted, and re-drawn with, 2025-actual data.
                         Same bug as the Makai Lemon incident, just on the
                         Board tab's own dock instead of the Players table —
                         found auditing for other instances of that shape
                         rather than reported. */
                      pointsFor={pointsForActive}
                      valueFor={valueFor}
                      vorpFor={vorpForActive}
                      survivalFor={survivalFor}
                      projOf={projOf}
                      // Same expression PlayersTab.jsx computes from these
                      // same two props — without this, the fix above makes
                      // the numbers season-aware while the column-group
                      // header above them still reads "Projected", which is
                      // the identical label-vs-data mismatch in a new spot.
                      projectedGroupLabel={season === 'prior' ? `${priorSeasonYear} Actual` : 'Projected'}
                      photoFor={photoFor}
                      initialsFor={initialsFor}
                      onDraft={handleDraft}
                      /* myTurn && !autopick, not bare myTurn — PlayerQueueSidebar
                         has no autopick concept of its own; it just trusts
                         whatever myTurn it's given and disables its Draft
                         buttons on `!myTurn`, exactly like PlayersTab.jsx's
                         identical fold at its own two call sites (see its
                         own comment: "a human clicking Draft while [autopick
                         is] on is a race that shouldn't read as available").
                         This dock skipped that fold, so during autopick it
                         kept showing live, clickable Draft buttons — and
                         engine.draftPlayer() only checks whose turn it is,
                         never the local autopick toggle, so a click here
                         while autopick's own effect is also about to submit
                         is a genuine race for who actually drafts, not a
                         harmless no-op. */
                      myTurn={myTurn && !autopick}
                      queuedNames={queuedNames}
                      onToggleQueue={handleToggleQueue}
                      draftedByFor={draftedByFor}
                      onSelectPlayer={setSelectedPlayer}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      tierAvgByPos={tierAvgByPos}
                    />
                    )}
                  </div>
                </div>
                {/* 360px fixed, matching the handoff exactly. Chat/Log/Picks
                    — DraftLogDock.jsx already has exactly these three tabs
                    and needed no change for this tab to reuse it. */}
                <div className="hidden w-[360px] shrink-0 lg:flex">
                  <DraftLogDock recentOthers={recentOthers} />
                </div>
              </div>

              {/* Pool pane — mobile only. A quick position-filtered look at
                  the same pool table Players owns in full (search, season,
                  NFL team, tenure, Show drafted) — this one carries only
                  the position chips the desktop dock's own filter row
                  already has, matching the design handoff exactly: a
                  glance from the board, not a second copy of the Players
                  screen's own filter chrome. */}
              {boardPane === 'pool' && (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
                  <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b border-slate-rule px-2.5 py-2">
                    {['ALL', ...POS_LIST, 'FLEX', 'K', 'DST'].map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setPosFilter(pos)}
                        aria-pressed={posFilter === pos}
                        className={
                          'h-11 shrink-0 rounded-full px-3.5 text-xs font-semibold transition-colors duration-150 ' +
                          (posFilter === pos ? 'bg-teal-500 text-obsidian' : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white')
                        }
                      >
                        {pos === 'ALL' ? 'All' : pos === 'DST' ? 'D/ST' : pos}
                      </button>
                    ))}
                  </div>
                  {/* flex, for the identical reason the desktop dock above
                      needs it — see that comment. Same class, same missing
                      display utility, same fix; this is the Board tab's own
                      Pool pane, the second of the two places this was
                      reported unable to swipe. */}
                  <div className="flex min-h-0 flex-1">
                    <PlayerQueueSidebar
                      bareTable
                      mobile
                      engine={engine}
                      players={availablePlayers}
                      posFilter={posFilter}
                      // Same fix as the desktop dock above, same reason —
                      // including the group label, or the numbers go
                      // season-aware while the header above them doesn't.
                      pointsFor={pointsForActive}
                      valueFor={valueFor}
                      vorpFor={vorpForActive}
                      survivalFor={survivalFor}
                      projOf={projOf}
                      projectedGroupLabel={season === 'prior' ? `${priorSeasonYear} Actual` : 'Projected'}
                      photoFor={photoFor}
                      initialsFor={initialsFor}
                      onDraft={handleDraft}
                      // Same fix as the desktop dock above, same reason.
                      myTurn={myTurn && !autopick}
                      queuedNames={queuedNames}
                      onToggleQueue={handleToggleQueue}
                      draftedByFor={draftedByFor}
                      onSelectPlayer={setSelectedPlayer}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      tierAvgByPos={tierAvgByPos}
                    />
                  </div>
                </div>
              )}

              {/* Picks pane — mobile only, the same avatar-card list as the
                  desktop right rail. */}
              {boardPane === 'picks' && (
                <div className="flex min-h-0 flex-1 flex-col lg:hidden">
                  <PicksRail mobile picks={picks} league={league} mySlot={mySlot} teamLabelOf={(slot) => engine.teamLabel(slot)} initialsFor={initialsFor} />
                </div>
              )}
            </div>
          </>
        ) : view === 'analysis' ? (
          /* Full width, no dock — Analysis and Insights (below) are both a
             read on a draft that's either finished or almost there, not a
             place to draft from, so neither one gives up half its width to
             the Queue/Roster/Chat/Log panels Players and Board still need.
             That dock used to sit under this exact branch (PlayerHub's pool
             column had already been dropped from it; SidePanel/DraftLogDock
             were the last of it) — full width for the report itself is the
             rest of that same cleanup, not a new decision. onClose: the
             report's own "Close" exit action. Analysis is a tab, not a
             modal, so dismissing it means switching tabs — Board is the
             obvious landing spot, the same content this strip shows for
             every other tab. */
          <AnalysisTab engine={engine} league={league} picks={picks} mySlot={mySlot} onClose={() => setView('board')} />
        ) : view === 'insights' ? (
          /* Also full width, same reasoning as Analysis above — and this
             one used to be a `fixed inset-0` modal over whichever tab was
             active, reached only by a floating pill once you'd closed it.
             A real tab, always one press away on the same bar as every
             other screen, needs neither: onClose here is exactly the
             modal's old exit action, still real (a header click can be
             viewing someone else's report, and this is how you leave it
             open on the board instead), just landing on Board like every
             other tab's Close does rather than on whatever was behind an
             overlay. */
          <DraftInsightsDashboard
            engine={engine}
            league={league}
            mySlot={mySlot}
            viewSlot={insightsSlot}
            onViewSlot={setInsightsSlot}
            onClose={() => setView('board')}
          />
        ) : null}
      </div>

      <MobileDraftTabBar
        view={view}
        onSelectView={setView}
        draftIsOver={draftIsOver}
      />

      {settingsOpen && (
        <DraftSettingsModal
          engine={engine}
          started={started}
          inRoom={roomActive}
          mySlot={mySlot}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Top-level, not nested inside whichever tab happens to be mounted
          — see PlayerProfileModal.jsx's own comment. A player's name is
          clickable from the board grid, both Decide-tab card types, the
          recommended-pick card and the player list itself now, and every
          one of those sets the same selectedPlayer state this reads. */}
      <PlayerProfileModal
        player={selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        photoFor={photoFor}
        initialsFor={initialsFor}
        nextOverall={nextOverall}
        queuedNames={queuedNames}
        onToggleQueue={handleToggleQueue}
        onDraft={handleDraft}
        myTurn={myTurn}
        autopick={autopick}
        pointsFor={pointsFor}
        vorpFor={vorpFor}
        valueFor={valueFor}
        survivalFor={survivalFor}
      />

    </div>
  )
}
