import { useEffect, useMemo, useRef, useState } from 'react'
import { useMinWidth } from '../../../hooks/useBreakpoint.js'
import { useDraftNotifications } from '../../../hooks/useDraftNotifications.js'
import { readDecide, readHeader, readNextPicks, readRoster } from '../../v2/cockpit/cockpitData.js'
import { useDraftVersion, useEngine } from '../../v2/cockpit/useCockpit.js'
import { CallButton, Headline, Label, QuietButton, Skeleton, cx } from '../ui.jsx'
import { LAUNCH_HASH, REPORT_HASH, resume } from './flow.js'
import { FOCUS, Glyph, useDialogFocus } from './kit.jsx'
import LiveHeader, { PickRibbon } from './live/LiveHeader.jsx'
import LiveMenu from './live/LiveMenu.jsx'
import RoomLobby from './live/RoomLobby.jsx'
import RoomChat from './live/RoomChat.jsx'
import { readRoom, sendBlocker, useRoomVersion, withRoomNames } from './live/room.js'
import Pool, { usePoolFilters } from './live/Pool.jsx'
import Board from './live/Board.jsx'
import Analysis from './live/Analysis.jsx'
import PlayerDrawer from './live/PlayerDrawer.jsx'
import { CallCard, CallDock, Forecast, RoomRead } from './live/Call.jsx'
import { NextPicks, PicksFeed, QueuePanel, RosterPanel } from './live/Rails.jsx'
import { Still } from '../motion.jsx'

/* The live draft, at #/draft/live.

   ---- The design, in two sentences ----

   The pick is the page: the room is built around one card, the Call, that
   is always on screen and reshapes itself around whose turn it is —
   Juke's pick, two alternatives and the one cobalt Draft while you are on
   the clock, a forecast of your next pick while you wait. Everything else
   (the pool, the board, the grade, a player's research) is the field you
   look across without the decision ever leaving view.

   ---- What that changes against the room it replaces ----

   Four tabs become three. Decide was a place you had to go to find the
   recommendation; its three candidates are the Call now, its "still here at
   your pick" is the Forecast, and its tier ladder and run are the Room
   strip over the pool. So the tabs are only the field: Pool, Board, Grade.

   A desk is two columns — the field, and a rail that is your sheet: the
   Call on top, then Team / Queue / Picks. A phone is one view at a time
   with the Call docked under the thumb — Juke's pick and Draft one tap
   from anywhere — instead of a five-item bottom nav.

   ---- Who moves the draft ----

   Not this component. A solo draft's CPU picks and its pick clock (which
   drafts for you off your queue when it runs out) live in app.js, and
   applyRoute() carries them on when the hash arrives here. The one thing
   this page drives is solo autopick, the way production's room does: on
   your turn with the switch on, engine.autoPickForMe() through
   engine.draftPlayer() — the Draft button's own door — keyed on the overall
   pick so a re-render cannot submit twice.

   ---- And in a shared room it drives even less ----

   #/draft/live?room=CODE is the same page with the room as its authority.
   The browser STOPS DECIDING: engine.draftPlayer() already sends the intent
   and returns (draftAndAdvance in app.js), the board moves on the broadcast,
   the clock is painted rather than counted, and the host's own browser
   drafts the empty chairs off those broadcasts whatever route it is on. So
   nothing in this file changes about who moves a draft — what changes is
   which controls are offered, and what a seat is called.

   Three gates, and they are three different questions. `room` is "this is a
   shared draft" (hasRoom, true through a dropped socket). `view.socket` is
   "the room can hear us right now" — every control that SENDS is behind it,
   with the reason said rather than greyed. `view.isHost` is "this browser is
   the one the room takes a pause or a start from". Undo is hidden outright,
   because there is no shared undo and a local one is overwritten by the next
   broadcast; End draft is hidden because "the rest" in a room is nine other
   people's teams.

   Autopick is asymmetric on purpose: solo it is this component's own
   per-turn loop, and in a room it is state.autoMe — a real, persistent flag
   the room's own broadcast handler re-invokes (driveMyAutopilot in app.js).
   Reading it from React would be a second copy of a flag that already
   exists, so the switch is bound straight to engine.autoMe().

   ---- One tree at each width ----

   useMinWidth rather than CSS picks the tree, because CSS-hidden is still
   mounted and the player drawer's news tab would fetch twice (CLAUDE.md,
   "that is what useMinWidth is for"). */

const VIEWS = [
  { key: 'pool', label: 'Pool', icon: 'list', kbd: 'p' },
  { key: 'board', label: 'Board', icon: 'grid', kbd: 'b' },
  { key: 'grade', label: 'Grade', icon: 'chart', kbd: 'g' },
]
const PHONE_VIEWS = [VIEWS[0], VIEWS[1], { key: 'team', label: 'Team', icon: 'users', kbd: 't' }, VIEWS[2]]
const RAIL_TABS = [['team', 'Team'], ['queue', 'Queue'], ['picks', 'Picks']]
const EMPTY_DECIDE = { candidates: [], tierLadder: [], survivors: [], run: null, needs: [], counts: null }

/* state.autoMe, read rather than mirrored. It is a real flag the room's own
   broadcast handler already re-invokes, so a React copy of it would be the
   written-down-twice rule with an autopilot on it. Guarded because the
   bridge entry is a plain read that predates nothing and a build without it
   should draw the switch off rather than throw. */
function safeAuto(engine) {
  try { return engine.autoMe ? engine.autoMe() : false } catch { return false }
}

function EmptyState({ engine }) {
  let saved = null
  try { saved = engine.inProgressSummary() } catch { saved = null }
  const [problem, setProblem] = useState('')
  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-v3-paper">
      <div className="mx-auto flex min-h-full max-w-[720px] flex-col justify-center px-5 py-16">
        <Label>The Draft Room · live</Label>
        <Headline className="mt-3">{saved ? 'Your draft is waiting.' : 'No draft on the clock.'}</Headline>
        <p className="mt-4 max-w-[60ch] text-[17px] leading-[1.55] text-v3-ink2">
          {saved
            ? `${saved.leagueType} from the ${saved.pickPosition} seat — ${saved.made} of ${saved.total} picks made. It picks up exactly where you left it.`
            : 'Start a mock from the launcher — it runs entirely in your browser, against CPU drafters on tonight’s board.'}
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          {saved
            ? <CallButton onClick={() => { if (!resume()) setProblem('That draft could not be resumed — the player list has changed since it was saved.') }}>Resume the draft <Glyph name="arrow" className="h-4 w-4" /></CallButton>
            : <CallButton href={LAUNCH_HASH}>Set up a mock draft <Glyph name="arrow" className="h-4 w-4" /></CallButton>}
          <QuietButton href="#/">Back to Now</QuietButton>
        </div>
        {problem && <p role="status" className="mt-3 text-[14px] text-v3-warn">{problem}</p>}
      </div>
    </div>
  )
}

/* Production's notification hook, mounted in a child so closing the menu
   can remount it: the hook reads its preferences once, so a switch turned
   on in the menu would otherwise not arm it until the page reloaded. */
function NotifyWatcher({ engine, header }) {
  useDraftNotifications({ engine, myTurn: !!header.myTurn, over: !!header.over, code: header.code })
  return null
}

/* The phone's Call, opened from the dock: the whole card, and while you
   wait the forecast under it. A dialog, so focus, Tab and Esc behave. */
function CallSheet({ onClose, children }) {
  const panel = useRef(null)
  const closeRef = useRef(null)
  useDialogFocus(true, onClose, panel, closeRef)
  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <style>{'@keyframes v3cs{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}'}</style>
      <div className="absolute inset-0 bg-v3-shade/40" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="The call" tabIndex={-1} className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-[6px] bg-v3-paper motion-safe:animate-[v3cs_200ms_ease-out]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex shrink-0 items-center justify-between border-b border-v3-rule bg-v3-sheet py-1 pl-4 pr-1">
          <Label>The call</Label>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close the call" className={cx('grid h-11 w-11 place-items-center rounded-[4px] text-v3-ink hover:bg-v3-well', FOCUS)}>
            <Glyph name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  )
}

function Segments({ items, value, onChange, label, className = '' }) {
  return (
    <div role="tablist" aria-label={label} className={cx('flex gap-1', className)}>
      {items.map(([k, text, count]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={cx('inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[4px] border font-figure text-[12px] font-semibold uppercase tracking-[0.08em]', FOCUS, value === k ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet text-v3-ink2 hover:text-v3-ink')}>
          {text}
          {count != null && <span className={cx('tabular-nums', value === k ? 'text-v3-bandInk' : 'text-v3-ink3')}>{count}</span>}
        </button>
      ))}
    </div>
  )
}

/* The room is a Still subtree: no Sheet rises as a rail tab is switched and
   no figure counts up while a clock runs. Its motion is the after-the-fact
   kind, drawn by the parts themselves — the ring walking the board, a pick
   landing, the ribbon advancing, the Call re-dealing — and none of it
   holds a pick: every control is live from its first frame. */
export default function V3Live() {
  return <Still><V3LiveRoom /></Still>
}

function V3LiveRoom() {
  const engine = useEngine()
  const version = useDraftVersion(engine)
  /* The room's own changes — a seat claimed, a name typed, a message sent, a
     socket dropped. useDraftVersion() carries none of them; see the hook's
     own comment for why that was invisible in a live draft and would not
     have been in the lobby. */
  const roomVersion = useRoomVersion(engine)
  const desktop = useMinWidth(1024)
  const wide = useMinWidth(1280)
  const [view, setView] = useState('pool')
  const [railTab, setRailTab] = useState('team')
  const [teamPane, setTeamPane] = useState('roster')
  const [f, setF, sortBy] = usePoolFilters()
  const [selected, setSelected] = useState(null)
  const [menu, setMenu] = useState(null) // null | 'main' | 'keys'
  const [sheetOpen, setSheetOpen] = useState(false)
  const [notifyKey, setNotifyKey] = useState(0)
  const [autopick, setAutopick] = useState(false)
  const [rosterSlot, setRosterSlot] = useState(0)
  const [gradeSlot, setGradeSlot] = useState(0)
  const [soundOn, setSoundOn] = useState(false)
  const [sniped, setSniped] = useState(() => new Set())
  const [notice, setNotice] = useState('')
  const [said, setSaid] = useState('')
  const lastAuto = useRef(-1)
  const queueSeen = useRef(null)
  const heard = useRef({ picks: null, mine: false })

  const ready = !!engine && engine.dataReady()
  /* The room, read once. Null for a solo draft, so every branch below is one
     question rather than a scatter of hasRoom() calls that could disagree. */
  const roomView = ready ? readRoom(engine) : null
  const room = !!roomView
  /* In a room, teamLabel() has to be the room's: "Your Team" and a CPU name
     are a lie about a chair a person called Blake is sitting in. One own-
     property override on a copy of the bridge, so Board, the ribbon, the
     rails, the pool and the drawer all name seats correctly without six
     props that mean nothing in a solo mock. Memoised on `room` rather than
     on `view`, which is a fresh object every render; the override reads the
     room at CALL time, so it is never a stale seat list. */
  const eng = useMemo(() => (room ? withRoomNames(engine, roomView) : engine), [engine, room])
  const header = ready ? readHeader(eng) : { started: false }
  const mySlot = ready ? engine.mySlot() ?? 0 : 0
  const myTurn = !!header.myTurn
  const over = !!header.over
  const live = ready && header.started && !over
  // Solo autopick is this component's own loop; a room has a real flag.
  const soloLive = live && !room
  const roomAuto = room ? !!safeAuto(engine) : false
  const autoOn = room ? roomAuto : autopick
  const blocked = room ? sendBlocker(roomView) : null
  const { nextOverall, nextPicks } = ready && header.started ? readNextPicks(eng, myTurn) : { nextOverall: null, nextPicks: [] }
  const canDraft = header.started && !over && myTurn && !autoOn && !blocked
  const draftReason = over ? 'The draft is over'
    : !myTurn ? 'Not your turn'
      : blocked || (autoOn ? 'Turn autopick off to draft by hand' : '')
  // `version` is the key, never `engine` or `board`: board is mutated in
  // place, so it cannot tell a memo that a pick landed.
  const decide = useMemo(() => (live ? readDecide(eng, nextOverall) : EMPTY_DECIDE), [version, nextOverall, live, eng])
  // Read so the room re-renders on it; nothing else consumes the number.
  void roomVersion
  const phone = !desktop

  useEffect(() => { if (engine) setSoundOn(!!engine.soundWanted()) }, [engine])

  /* app.js paints its own pick ticker into the legacy .sticky-top strip,
     straight under <body>, on every pick. The room covers it — it is never
     seen — but it stays in the accessibility tree, so a screen reader met
     "Purdy Vacant selected…" before this room's own announcement. While the
     room is mounted the strip is inert and hidden from assistive tech; the
     attributes come off on the way out, and app.js never reads either.

     The legacy chat dock and its phone button are the same problem, arriving
     the day v3 grew a room of its own: renderChat() un-hides both whenever
     Live.room() exists, whatever route the tab is on, so a shared draft here
     put a SECOND "Room chat" region and a floating button into the tree
     under this one. Covered on screen, and a duplicate to anybody not
     looking at it — which is how the collision was found, by a locator
     resolving to two elements rather than by anything on a screen. Same
     treatment, same restore, and app.js goes on writing into both. */
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    /* #tabrow and #ticker join them for a reason specific to a ROOM:
       enterDraftUI() runs off the room's own broadcast, whatever route the
       tab is on, and un-hides the legacy tab strip and action bar — so a
       shared draft here put "Suggestions", "Pause clock" and "Discard
       draft" into the tree under this room. A solo draft on this route
       never calls it, which is why they had never appeared before. */
    const quiet = ['body > .sticky-top', '#chatDock', '#chatFab', '#tabrow', '#ticker']
      .map((sel) => document.querySelector(sel))
      .filter(Boolean)
      .map((el) => {
        const had = { hidden: el.getAttribute('aria-hidden'), inert: el.hasAttribute('inert') }
        el.setAttribute('aria-hidden', 'true')
        el.setAttribute('inert', '')
        return { el, had }
      })
    return () => quiet.forEach(({ el, had }) => {
      if (had.hidden === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', had.hidden)
      if (!had.inert) el.removeAttribute('inert')
    })
  }, [])
  useEffect(() => { setRosterSlot(mySlot); setGradeSlot(mySlot) }, [mySlot])
  useEffect(() => { if (desktop && view === 'team') setView('pool') }, [desktop, view])

  // Solo autopick — see the file comment. A room has its own flag and its
  // own driver (driveMyAutopilot in app.js), so this must never run there:
  // two loops answering for one chair is the shape that trips the room's own
  // rate limit, which deadlocked a real draft once.
  useEffect(() => {
    if (!soloLive || !autopick || !myTurn) return
    if (lastAuto.current === header.overall) return
    lastAuto.current = header.overall
    const choice = engine.autoPickForMe()
    if (choice) engine.draftPlayer(choice)
  }, [version, autopick])

  // The draft ended: the report is the next screen. replace(), so Back does
  // not land on a live route that would bounce straight forward again.
  useEffect(() => {
    if (ready && header.started && over) location.replace(REPORT_HASH)
  }, [version])

  // Which picks took a player off YOUR queue — caught as it happens, because
  // the queue prunes a drafted player the moment the pick lands.
  useEffect(() => {
    if (!ready) return
    const now = new Set(engine.queue() || [])
    const before = queueSeen.current
    queueSeen.current = now
    const picks = engine.picks() || []
    // An undo takes picks back off the board; so does a fresh draft.
    if ([...sniped].some((o) => o > picks.length)) setSniped(new Set([...sniped].filter((o) => o <= picks.length)))
    if (!before || !picks.length) return
    const found = []
    for (const name of before) {
      if (now.has(name)) continue
      const pick = picks.find((x) => x.player && x.player.name === name)
      if (pick && pick.slot !== mySlot) found.push(pick.overall)
    }
    if (found.length) {
      setSniped((prev) => new Set([...prev, ...found]))
      const p = picks.find((x) => x.overall === found[found.length - 1])
      if (p) setNotice(`${eng.teamLabel(p.slot)} took ${p.player.name} off your queue.`)
    }
  }, [version])

  // What a screen reader hears: one atomic status — your turn arriving, or
  // the pick that just landed. Polite, so a run of CPU picks reads as the
  // latest one rather than a queue of twelve.
  useEffect(() => {
    if (!live) return
    const picks = engine.picks() || []
    const h = heard.current
    let msg = ''
    if (myTurn && !h.mine) msg = `You are on the clock — pick ${header.code}.`
    else if (h.picks != null && picks.length > h.picks) {
      const p = picks[picks.length - 1]
      const who = p.slot === mySlot ? 'You' : eng.teamLabel(p.slot)
      msg = `Pick ${p.overall}: ${who} took ${p.player.name}, ${p.player.pos === 'DST' ? 'defense' : p.player.pos}.`
    }
    heard.current = { picks: picks.length, mine: myTurn }
    if (msg) setSaid(msg)
  }, [version, live])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 4200)
    return () => clearTimeout(t)
  }, [notice])

  // The keyboard path. Single keys, never while typing in a field, never
  // with a modifier, and never while a sheet or the menu owns the keyboard.
  useEffect(() => {
    if (!live) return undefined
    const focusSoon = (find) => setTimeout(() => { const el = find(); if (el) el.focus() }, 60)
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (menu || selected || sheetOpen) return
      const k = e.key
      if (k === '/') { e.preventDefault(); setView('pool'); focusSoon(() => document.getElementById('v3-pool-search')) }
      else if (k === 'c') {
        e.preventDefault()
        focusSoon(() => document.querySelector('#v3-call-draft:not([disabled])') || document.querySelector('[data-dock-draft]:not([disabled])') || document.querySelector('[data-dock] button, section[aria-label="The call"] button'))
      } else if (k === 'p') setView('pool')
      else if (k === 'b') setView('board')
      else if (k === 'g') setView('grade')
      else if (k === 't' && phone) setView('team')
      else if (k === 'm') setMenu('main')
      else if (k === '?') setMenu('keys')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live, menu, selected, sheetOpen, phone])

  if (!engine || !ready) {
    return (
      <div className="fixed inset-0 z-[55] grid place-items-center bg-v3-paper p-8">
        <div className="w-full max-w-[480px]"><Label>Loading tonight’s board</Label><div className="mt-4"><Skeleton lines={5} /></div></div>
      </div>
    )
  }
  /* The lobby is the room before it is a draft, and the room is the
     authority on which it is: adoptRoom() sets state.started from exactly
     this field, so `phase` is the fact and header.started is its echo. The
     move off this screen therefore hangs off the broadcast — the nine other
     managers never press Start at all. */
  if (roomView && roomView.phase === 'lobby') return <RoomLobby engine={engine} view={roomView} />
  if (!header.started) return <EmptyState engine={engine} />

  const onDraft = (p) => {
    if (!canDraft) return
    // An intent in a room, a decision solo — one door either way, which is
    // what keeps two managers from taking the same player.
    const err = engine.draftPlayer(p)
    if (err) setNotice(err === 'not-your-turn' ? 'It is not your turn any more.' : `That pick was refused (${err}).`)
  }
  /* Autopick: the room's persistent flag, or this page's own per-turn loop.
     Never both — see the file comment. */
  const onAutopick = room ? () => { engine.toggleRoomAutopilot() } : setAutopick
  const onSound = () => { engine.toggleSound(); setSoundOn(!!engine.soundWanted()) }
  const onUndo = () => {
    setAutopick(false)
    lastAuto.current = -1
    engine.undo()
    setNotice('Rolled back to your last pick — it is yours to make again.')
  }
  const closeMenu = () => { setMenu(null); setNotifyKey((n) => n + 1) }
  const board = engine.board() || []
  const roster = readRoster(eng, rosterSlot)
  const counts = engine.filterCounts()
  const queueCount = (engine.queue() || []).length
  const mine = (engine.picks() || []).filter((p) => p.slot === mySlot).length
  const common = { engine: eng, canDraft, draftReason, onDraft, onOpen: setSelected, nextOverall }
  /* Chat is a fourth tab on the rail and a fifth view on a phone, and only in
     a room -- a tab that is always there and empty four drafts out of five is
     furniture. It sits beside Team/Queue/Picks rather than over the field,
     because the field is what a pick is made from and the talk is what the
     room is for; neither should cover the other. */
  const railTabs = room ? [...RAIL_TABS, ['chat', 'Chat']] : RAIL_TABS
  const phoneViews = room ? [...PHONE_VIEWS, { key: 'chat', label: 'Chat', icon: 'users', kbd: 'k' }] : PHONE_VIEWS
  const chat = room ? <RoomChat engine={eng} view={roomView} className="min-h-0 flex-1" /> : null

  // The room strip sits over the pool on a desk; a phone keeps its height
  // for players and carries the strip in the Call sheet instead.
  const pool = (
    <>
      {!phone && <RoomRead engine={eng} decide={decide} />}
      <Pool {...common} version={version} f={f} set={setF} sort={sortBy} phone={phone} />
    </>
  )
  const field =
    view === 'board' ? <Board engine={eng} version={version} onOpen={setSelected} phone={phone} />
      : view === 'grade' ? <Analysis engine={eng} slot={gradeSlot} onSlot={setGradeSlot} phone={phone} />
        : pool

  const picksPane = (
    <>
      <NextPicks engine={eng} nextPicks={nextPicks} picksMade={header.picksMade} />
      {!myTurn && <Forecast engine={eng} decide={decide} nextOverall={nextOverall} onOpen={setSelected} limit={phone ? 6 : 5} />}
      <PicksFeed engine={eng} sniped={sniped} onOpen={setSelected} limit={phone ? 40 : 24} />
    </>
  )
  const teamBody = (tab) => (
    tab === 'chat' ? chat
      : tab === 'queue' ? <QueuePanel engine={eng} board={board} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={setSelected} />
        : tab === 'picks' ? picksPane
          : <RosterPanel engine={eng} slot={rosterSlot} onSlot={setRosterSlot} roster={roster} counts={counts} onOpen={setSelected} />
  )

  const toast = notice && (
    <div role="status" className={cx('pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4', phone ? 'bottom-[104px]' : 'bottom-6')}>
      <span className="rounded-[6px] border border-v3-warn/40 bg-v3-warnWash px-4 py-2.5 text-[14px] font-semibold text-v3-warn shadow-[0_8px_24px_-12px_rgb(var(--v3-shade)/0.35)]">{notice}</span>
    </div>
  )
  const overlays = (
    <>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{said}</p>
      {toast}
      <NotifyWatcher key={notifyKey} engine={eng} header={header} />
      {menu && <LiveMenu engine={eng} header={header} room={roomView} blocked={blocked} onClose={closeMenu} soundOn={soundOn} onSound={onSound} autopick={autoOn} onAutopick={onAutopick} onUndo={onUndo} phone={phone} startPage={menu} />}
      <PlayerDrawer engine={eng} player={selected} onClose={() => setSelected(null)} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} nextOverall={nextOverall} phone={phone} />
    </>
  )

  if (phone) {
    return (
      <div className="fixed inset-0 z-[55] flex flex-col bg-v3-paper font-sheet text-v3-ink">
        <LiveHeader engine={eng} header={header} phone room={roomView} autopick={autoOn} onAutopick={onAutopick} soundOn={soundOn} onSound={onSound} onMenu={() => setMenu('main')} menuOpen={!!menu} />
        <div className="shrink-0 border-b border-v3-rule bg-v3-paper px-2 py-1.5">
          <Segments label="Draft views" value={view} onChange={setView} items={phoneViews.map((v) => [v.key, v.label])} />
        </div>
        <main role="tabpanel" aria-label={phoneViews.find((v) => v.key === view)?.label} className="flex min-h-0 flex-1 flex-col">
          {view === 'chat' ? <div className="flex min-h-0 flex-1 flex-col p-2">{chat}</div> : view === 'team' ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="sticky top-0 z-10 border-b border-v3-rule bg-v3-paper p-2">
                <Segments label="Team" value={teamPane} onChange={setTeamPane} items={[['roster', 'Roster', `${mine}`], ['queue', 'Queue', `${queueCount}`], ['picks', 'Picks']]} />
              </div>
              <div className="flex flex-col gap-3 p-3">{teamBody(teamPane)}</div>
            </div>
          ) : field}
        </main>
        <CallDock engine={eng} decide={decide} header={header} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpenCall={() => setSheetOpen(true)} autopick={autoOn} onAutopick={onAutopick} nextOverall={nextOverall} />
        {sheetOpen && (
          <CallSheet onClose={() => setSheetOpen(false)}>
            <CallCard {...common} decide={decide} header={header} autopick={autoOn} onDraft={(p) => { onDraft(p); setSheetOpen(false) }} />
            <div className="overflow-hidden rounded-[6px] border border-v3-rule"><RoomRead engine={eng} decide={decide} phone /></div>
            {!myTurn && <Forecast engine={eng} decide={decide} nextOverall={nextOverall} onOpen={setSelected} />}
          </CallSheet>
        )}
        {overlays}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-v3-paper font-sheet text-v3-ink">
      <LiveHeader engine={eng} header={header} room={roomView} autopick={autoOn} onAutopick={onAutopick} soundOn={soundOn} onSound={onSound} onMenu={() => setMenu('main')} menuOpen={!!menu} />
      <PickRibbon engine={eng} header={header} />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-stretch justify-between gap-3 border-b border-v3-rule bg-v3-sheet px-3">
            <div role="tablist" aria-label="Draft views" className="flex items-stretch gap-1">
              {VIEWS.map((v) => {
                const on = view === v.key
                return (
                  <button key={v.key} type="button" role="tab" aria-selected={on} onClick={() => setView(v.key)} className={cx('relative inline-flex h-12 items-center gap-2 px-3.5 text-[15px] font-semibold', FOCUS, on ? 'text-v3-ink' : 'text-v3-ink2 hover:text-v3-ink')}>
                    <Glyph name={v.icon} className="h-4 w-4" /> {v.label}
                    <kbd className="hidden rounded-[3px] border border-v3-rule px-1 font-figure text-[11px] font-semibold text-v3-ink3 xl:inline">{v.kbd}</kbd>
                    {on && <span className="absolute inset-x-3 bottom-0 h-[3px] bg-v3-ink" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
            <button type="button" onClick={() => setMenu('keys')} className={cx('my-2 hidden items-center gap-2 rounded-[4px] px-2.5 font-figure text-[12px] text-v3-ink3 hover:text-v3-ink xl:inline-flex', FOCUS)}>
              <kbd className="rounded-[3px] border border-v3-rule px-1 font-semibold">c</kbd> the call · <kbd className="rounded-[3px] border border-v3-rule px-1 font-semibold">?</kbd> keys
            </button>
          </div>
          <div role="tabpanel" aria-label={VIEWS.find((v) => v.key === view)?.label} className="flex min-h-0 flex-1 flex-col">{field}</div>
        </main>

        <aside aria-label="Your sheet" className="flex w-[344px] shrink-0 flex-col overflow-hidden border-l border-v3-rule bg-v3-paper xl:w-[392px] [@media(max-height:780px)]:overflow-y-auto">
          <div className="shrink-0 p-3 pb-2">
            <CallCard {...common} decide={decide} header={header} autopick={autoOn} compact={!wide} />
          </div>
          <div className="sticky top-0 z-10 shrink-0 bg-v3-paper px-3 pb-2">
            <Segments label="Your sheet" value={railTab} onChange={setRailTab} items={railTabs.map(([k, t]) => [k, t, k === 'team' ? `${mine}/${header.rounds}` : k === 'queue' ? `${queueCount}` : null])} />
          </div>
          {/* The chat brings its own scroller, so the rail must not be one
              too: a flex child of an overflow-y-auto parent sizes to its
              content, and the log came out about 180px tall under the Call.
              Every other tab is a column of panels and wants the rail's. */}
          <div className={cx('min-h-0 flex-1 px-3 pb-3', railTab === 'chat'
            ? 'flex flex-col'
            : 'space-y-3 overflow-y-auto [@media(max-height:780px)]:flex-none [@media(max-height:780px)]:overflow-visible')}>
            {teamBody(railTab)}
          </div>
        </aside>
      </div>
      {overlays}
    </div>
  )
}
