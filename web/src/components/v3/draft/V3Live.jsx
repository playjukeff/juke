import { useEffect, useMemo, useRef, useState } from 'react'
import { useMinWidth } from '../../../hooks/useBreakpoint.js'
import { useDraftNotifications } from '../../../hooks/useDraftNotifications.js'
import { readDecide, readHeader, readNextPicks, readRoster } from '../../v2/cockpit/cockpitData.js'
import { useDraftVersion, useEngine } from '../../v2/cockpit/useCockpit.js'
import { CallButton, Headline, Label, QuietButton, Skeleton, cx } from '../ui.jsx'
import { FRIENDS_HASH, LAUNCH_HASH, REPORT_HASH, resume } from './flow.js'
import { FOCUS, Glyph, useDialogFocus } from './kit.jsx'
import LiveHeader, { PickRibbon } from './live/LiveHeader.jsx'
import LiveMenu from './live/LiveMenu.jsx'
import Pool, { usePoolFilters } from './live/Pool.jsx'
import Board from './live/Board.jsx'
import Analysis from './live/Analysis.jsx'
import PlayerDrawer from './live/PlayerDrawer.jsx'
import { CallCard, CallDock, Forecast, RoomRead } from './live/Call.jsx'
import { NextPicks, PicksFeed, QueuePanel, RosterPanel } from './live/Rails.jsx'
import { Still } from '../motion.jsx'

/* The live draft, at #/v3/draft/live.

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

function EmptyState({ engine }) {
  let saved = null
  try { saved = engine.inProgressSummary() } catch { saved = null }
  const room = engine.hasRoom()
  const [problem, setProblem] = useState('')
  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-v3-paper">
      <div className="mx-auto flex min-h-full max-w-[720px] flex-col justify-center px-5 py-16">
        <Label>The Draft Room · live</Label>
        <Headline className="mt-3">{room ? 'This draft is a shared room.' : saved ? 'Your draft is waiting.' : 'No draft on the clock.'}</Headline>
        <p className="mt-4 max-w-[60ch] text-[17px] leading-[1.55] text-v3-ink2">
          {room
            ? 'A draft with friends runs in the classic Draft Room, where the room itself keeps the clock, the seats and the chat for everybody. v3 hands shared rooms there rather than drawing a second copy of them.'
            : saved
              ? `${saved.leagueType} from the ${saved.pickPosition} seat — ${saved.made} of ${saved.total} picks made. It picks up exactly where you left it.`
              : 'Start a mock from the launcher — it runs entirely in your browser, against CPU drafters on tonight’s board.'}
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          {room ? <CallButton href={FRIENDS_HASH}>Open the room <Glyph name="arrow" className="h-4 w-4" /></CallButton>
            : saved ? <CallButton onClick={() => { if (!resume()) setProblem('That draft could not be resumed — the player list has changed since it was saved.') }}>Resume the draft <Glyph name="arrow" className="h-4 w-4" /></CallButton>
              : <CallButton href={LAUNCH_HASH}>Set up a mock draft <Glyph name="arrow" className="h-4 w-4" /></CallButton>}
          <QuietButton href="#/v3">Back to Now</QuietButton>
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
  const header = ready ? readHeader(engine) : { started: false }
  const mySlot = ready ? engine.mySlot() ?? 0 : 0
  const room = ready ? engine.hasRoom() : false
  const myTurn = !!header.myTurn
  const over = !!header.over
  const live = ready && header.started && !over && !room
  const { nextOverall, nextPicks } = ready && header.started ? readNextPicks(engine, myTurn) : { nextOverall: null, nextPicks: [] }
  const canDraft = header.started && !over && myTurn && !autopick && !room
  const draftReason = over ? 'The draft is over' : !myTurn ? 'Not your turn' : autopick ? 'Turn autopick off to draft by hand' : ''
  // `version` is the key, never `engine` or `board`: board is mutated in
  // place, so it cannot tell a memo that a pick landed.
  const decide = useMemo(() => (live ? readDecide(engine, nextOverall) : EMPTY_DECIDE), [version, nextOverall, live])
  const phone = !desktop

  useEffect(() => { if (engine) setSoundOn(!!engine.soundWanted()) }, [engine])

  /* app.js paints its own pick ticker into the legacy .sticky-top strip,
     straight under <body>, on every pick. The room covers it — it is never
     seen — but it stays in the accessibility tree, so a screen reader met
     "Purdy Vacant selected…" before this room's own announcement. While the
     room is mounted the strip is inert and hidden from assistive tech; the
     attributes come off on the way out, and app.js never reads either. */
  useEffect(() => {
    const strip = typeof document !== 'undefined' ? document.querySelector('body > .sticky-top') : null
    if (!strip) return undefined
    const had = { hidden: strip.getAttribute('aria-hidden'), inert: strip.hasAttribute('inert') }
    strip.setAttribute('aria-hidden', 'true')
    strip.setAttribute('inert', '')
    return () => {
      if (had.hidden === null) strip.removeAttribute('aria-hidden'); else strip.setAttribute('aria-hidden', had.hidden)
      if (!had.inert) strip.removeAttribute('inert')
    }
  }, [])
  useEffect(() => { setRosterSlot(mySlot); setGradeSlot(mySlot) }, [mySlot])
  useEffect(() => { if (desktop && view === 'team') setView('pool') }, [desktop, view])

  // Solo autopick — see the file comment.
  useEffect(() => {
    if (!live || !autopick || !myTurn) return
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
      if (p) setNotice(`${engine.teamLabel(p.slot)} took ${p.player.name} off your queue.`)
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
      const who = p.slot === mySlot ? 'You' : engine.teamLabel(p.slot)
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
  if (!header.started || room) return <EmptyState engine={engine} />

  const onDraft = (p) => {
    if (!canDraft) return
    const err = engine.draftPlayer(p)
    if (err) setNotice(err === 'not-your-turn' ? 'It is not your turn any more.' : `That pick was refused (${err}).`)
  }
  const onSound = () => { engine.toggleSound(); setSoundOn(!!engine.soundWanted()) }
  const onUndo = () => {
    setAutopick(false)
    lastAuto.current = -1
    engine.undo()
    setNotice('Rolled back to your last pick — it is yours to make again.')
  }
  const closeMenu = () => { setMenu(null); setNotifyKey((n) => n + 1) }
  const board = engine.board() || []
  const roster = readRoster(engine, rosterSlot)
  const counts = engine.filterCounts()
  const queueCount = (engine.queue() || []).length
  const mine = (engine.picks() || []).filter((p) => p.slot === mySlot).length
  const common = { engine, canDraft, draftReason, onDraft, onOpen: setSelected, nextOverall }

  // The room strip sits over the pool on a desk; a phone keeps its height
  // for players and carries the strip in the Call sheet instead.
  const pool = (
    <>
      {!phone && <RoomRead engine={engine} decide={decide} />}
      <Pool {...common} version={version} f={f} set={setF} sort={sortBy} phone={phone} />
    </>
  )
  const field =
    view === 'board' ? <Board engine={engine} version={version} onOpen={setSelected} phone={phone} />
      : view === 'grade' ? <Analysis engine={engine} slot={gradeSlot} onSlot={setGradeSlot} phone={phone} />
        : pool

  const picksPane = (
    <>
      <NextPicks engine={engine} nextPicks={nextPicks} picksMade={header.picksMade} />
      {!myTurn && <Forecast engine={engine} decide={decide} nextOverall={nextOverall} onOpen={setSelected} limit={phone ? 6 : 5} />}
      <PicksFeed engine={engine} sniped={sniped} onOpen={setSelected} limit={phone ? 40 : 24} />
    </>
  )
  const teamBody = (tab) => (
    tab === 'queue' ? <QueuePanel engine={engine} board={board} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={setSelected} />
      : tab === 'picks' ? picksPane
        : <RosterPanel engine={engine} slot={rosterSlot} onSlot={setRosterSlot} roster={roster} counts={counts} onOpen={setSelected} />
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
      <NotifyWatcher key={notifyKey} engine={engine} header={header} />
      {menu && <LiveMenu engine={engine} header={header} onClose={closeMenu} soundOn={soundOn} onSound={onSound} autopick={autopick} onAutopick={setAutopick} onUndo={onUndo} phone={phone} startPage={menu} />}
      <PlayerDrawer engine={engine} player={selected} onClose={() => setSelected(null)} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} nextOverall={nextOverall} phone={phone} />
    </>
  )

  if (phone) {
    return (
      <div className="fixed inset-0 z-[55] flex flex-col bg-v3-paper font-sheet text-v3-ink">
        <LiveHeader engine={engine} header={header} phone autopick={autopick} onAutopick={setAutopick} soundOn={soundOn} onSound={onSound} onMenu={() => setMenu('main')} menuOpen={!!menu} />
        <div className="shrink-0 border-b border-v3-rule bg-v3-paper px-2 py-1.5">
          <Segments label="Draft views" value={view} onChange={setView} items={PHONE_VIEWS.map((v) => [v.key, v.label])} />
        </div>
        <main role="tabpanel" aria-label={PHONE_VIEWS.find((v) => v.key === view)?.label} className="flex min-h-0 flex-1 flex-col">
          {view === 'team' ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="sticky top-0 z-10 border-b border-v3-rule bg-v3-paper p-2">
                <Segments label="Team" value={teamPane} onChange={setTeamPane} items={[['roster', 'Roster', `${mine}`], ['queue', 'Queue', `${queueCount}`], ['picks', 'Picks']]} />
              </div>
              <div className="flex flex-col gap-3 p-3">{teamBody(teamPane)}</div>
            </div>
          ) : field}
        </main>
        <CallDock engine={engine} decide={decide} header={header} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpenCall={() => setSheetOpen(true)} autopick={autopick} onAutopick={setAutopick} nextOverall={nextOverall} />
        {sheetOpen && (
          <CallSheet onClose={() => setSheetOpen(false)}>
            <CallCard {...common} decide={decide} header={header} autopick={autopick} onDraft={(p) => { onDraft(p); setSheetOpen(false) }} />
            <div className="overflow-hidden rounded-[6px] border border-v3-rule"><RoomRead engine={engine} decide={decide} phone /></div>
            {!myTurn && <Forecast engine={engine} decide={decide} nextOverall={nextOverall} onOpen={setSelected} />}
          </CallSheet>
        )}
        {overlays}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-v3-paper font-sheet text-v3-ink">
      <LiveHeader engine={engine} header={header} autopick={autopick} onAutopick={setAutopick} soundOn={soundOn} onSound={onSound} onMenu={() => setMenu('main')} menuOpen={!!menu} />
      <PickRibbon engine={engine} header={header} />
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
            <CallCard {...common} decide={decide} header={header} autopick={autopick} compact={!wide} />
          </div>
          <div className="sticky top-0 z-10 shrink-0 bg-v3-paper px-3 pb-2">
            <Segments label="Your sheet" value={railTab} onChange={setRailTab} items={RAIL_TABS.map(([k, t]) => [k, t, k === 'team' ? `${mine}/${header.rounds}` : k === 'queue' ? `${queueCount}` : null])} />
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 [@media(max-height:780px)]:flex-none [@media(max-height:780px)]:overflow-visible">
            {teamBody(railTab)}
          </div>
        </aside>
      </div>
      {overlays}
    </div>
  )
}
