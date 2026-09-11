import { useEffect, useRef, useState } from 'react'
import { useMinWidth } from '../../../hooks/useBreakpoint.js'
import { readHeader, readNextPicks, readRoster } from '../../v2/cockpit/cockpitData.js'
import { useDraftVersion, useEngine } from '../../v2/cockpit/useCockpit.js'
import { CallButton, Headline, Label, QuietButton, Skeleton, cx } from '../ui.jsx'
import { FRIENDS_HASH, LAUNCH_HASH, REPORT_HASH, resume } from './flow.js'
import { FOCUS, Glyph } from './kit.jsx'
import LiveHeader, { PickRibbon } from './live/LiveHeader.jsx'
import LiveMenu from './live/LiveMenu.jsx'
import Pool, { usePoolFilters } from './live/Pool.jsx'
import Board from './live/Board.jsx'
import Decide from './live/Decide.jsx'
import Analysis from './live/Analysis.jsx'
import PlayerDrawer from './live/PlayerDrawer.jsx'
import { JukesPick, NextPicks, PicksFeed, QueuePanel, RosterPanel } from './live/Rails.jsx'

/* The live draft, at #/v3/draft/live — the call sheet at the table.

   ---- Who moves the draft ----

   Not this component. A solo draft's CPU picks and its pick clock (which
   drafts for you off your queue when it runs out) live in app.js, and
   applyRoute() carries them on when the hash arrives here — onV2LiveRoute()
   matches this route too. The one thing this page drives is solo autopick,
   the way production's room does: on your turn with the switch on, submit
   engine.autoPickForMe() — queue first, then what a CPU in your chair would
   take, then the best man left — through engine.draftPlayer(), the same door
   the Draft button uses. Keyed on the overall pick, so a re-render during
   your turn cannot submit twice.

   ---- Bare, so it carries its own way out ----

   No shell on this route: the header's Leave (and the menu's) goes back to
   the launcher, and the draft stays saved.

   ---- One tree at each width ----

   A desk (lg+) is a workspace: roster and queue on the left, the view in
   the middle, your next picks and the pick feed on the right from xl. A phone
   is one view at a time under its own bottom nav. useMinWidth picks between
   them rather than CSS, because CSS-hidden is still mounted and the player
   drawer's news tab would then fetch twice (CLAUDE.md, "that is what
   useMinWidth is for"). */

const VIEWS = [
  { key: 'players', label: 'Players', icon: 'list' },
  { key: 'board', label: 'Board', icon: 'grid' },
  { key: 'decide', label: 'Decide', icon: 'compass' },
  { key: 'analysis', label: 'Analysis', icon: 'chart' },
]
const PHONE_VIEWS = [VIEWS[0], VIEWS[1], VIEWS[2], { key: 'team', label: 'Team', icon: 'users' }, VIEWS[3]]

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
            ? 'A draft with friends runs in the classic Draft Room, where the room itself keeps the clock for everybody. v3 hands shared rooms there rather than redrawing them.'
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

export default function V3Live() {
  const engine = useEngine()
  const version = useDraftVersion(engine)
  const desktop = useMinWidth(1024)
  const [view, setView] = useState('players')
  const [teamPane, setTeamPane] = useState('roster')
  const [f, setF, sortBy] = usePoolFilters()
  const [selected, setSelected] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [autopick, setAutopick] = useState(false)
  const [rosterSlot, setRosterSlot] = useState(0)
  const [gradeSlot, setGradeSlot] = useState(0)
  const [soundOn, setSoundOn] = useState(false)
  const [sniped, setSniped] = useState(() => new Set())
  const [notice, setNotice] = useState('')
  const lastAuto = useRef(-1)
  const queueSeen = useRef(null)

  const ready = !!engine && engine.dataReady()
  const header = ready ? readHeader(engine) : { started: false }
  const mySlot = ready ? engine.mySlot() ?? 0 : 0
  const room = ready ? engine.hasRoom() : false
  const myTurn = !!header.myTurn
  const over = !!header.over
  const { nextOverall, nextPicks } = ready && header.started ? readNextPicks(engine, myTurn) : { nextOverall: null, nextPicks: [] }
  const canDraft = header.started && !over && myTurn && !autopick && !room
  const draftReason = over ? 'The draft is over' : !myTurn ? 'Not your turn' : autopick ? 'Turn autopick off to draft by hand' : ''

  useEffect(() => { if (engine) setSoundOn(!!engine.soundWanted()) }, [engine])
  useEffect(() => { setRosterSlot(mySlot); setGradeSlot(mySlot) }, [mySlot])

  // Solo autopick — see the file comment.
  useEffect(() => {
    if (!ready || !header.started || over || room || !autopick || !myTurn) return
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
    if (!before) return
    const picks = engine.picks() || []
    if (!picks.length) { if (sniped.size) setSniped(new Set()); return }
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

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 4200)
    return () => clearTimeout(t)
  }, [notice])

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
  const board = engine.board() || []
  const roster = readRoster(engine, rosterSlot)
  const counts = engine.filterCounts()
  const phone = !desktop

  const centre =
    view === 'players' ? (
      <>
        <JukesPick engine={engine} header={header} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={setSelected} nextOverall={nextOverall} phone={phone} />
        <Pool engine={engine} version={version} f={f} set={setF} sort={sortBy} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={setSelected} nextOverall={nextOverall} phone={phone} />
      </>
    ) : view === 'board' ? <Board engine={engine} version={version} onOpen={setSelected} phone={phone} />
      : view === 'decide' ? <Decide engine={engine} myTurn={myTurn} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={setSelected} nextOverall={nextOverall} onBrowse={() => setView('players')} phone={phone} />
        : view === 'analysis' ? <Analysis engine={engine} slot={gradeSlot} onSlot={setGradeSlot} phone={phone} />
          : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="sticky top-0 z-10 flex gap-1 border-b border-v3-rule bg-v3-paper p-2" role="tablist" aria-label="Team">
                {[['roster', 'Roster'], ['queue', 'Queue'], ['picks', 'Picks']].map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={teamPane === k} onClick={() => setTeamPane(k)} className={cx('min-h-[44px] flex-1 rounded-[4px] border font-figure text-[12px] font-semibold uppercase tracking-[0.08em]', FOCUS, teamPane === k ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet text-v3-ink2')}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-3 p-3">
                {teamPane === 'roster' && <RosterPanel engine={engine} slot={rosterSlot} onSlot={setRosterSlot} roster={roster} counts={counts} onOpen={setSelected} />}
                {teamPane === 'queue' && <QueuePanel engine={engine} board={board} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={setSelected} />}
                {teamPane === 'picks' && (
                  <>
                    <NextPicks engine={engine} nextPicks={nextPicks} picksMade={header.picksMade} />
                    <PicksFeed engine={engine} sniped={sniped} onOpen={setSelected} limit={40} />
                  </>
                )}
              </div>
            </div>
          )

  const toast = notice && (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4 lg:bottom-6">
      <span className="rounded-[6px] border border-v3-warn/40 bg-v3-warnWash px-4 py-2.5 text-[14px] font-semibold text-v3-warn shadow-[0_8px_24px_-12px_rgb(var(--v3-shade)/0.35)]">{notice}</span>
    </div>
  )

  if (phone) {
    return (
      <div className="fixed inset-0 z-[55] flex flex-col bg-v3-paper font-sheet text-v3-ink">
        <LiveHeader engine={engine} header={header} phone autopick={autopick} onAutopick={setAutopick} soundOn={soundOn} onSound={onSound} onMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />
        <main className="flex min-h-0 flex-1 flex-col">{centre}</main>
        <nav aria-label="Draft views" className="shrink-0 border-t border-v3-rule bg-v3-sheet" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <ul className="grid grid-cols-5">
            {PHONE_VIEWS.map((v) => {
              const on = view === v.key
              return (
                <li key={v.key}>
                  <button type="button" onClick={() => setView(v.key)} aria-current={on ? 'page' : undefined} className={cx('relative flex min-h-[58px] w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', FOCUS, on ? 'text-v3-ink' : 'text-v3-ink3')}>
                    {on && <span className="absolute inset-x-4 top-0 h-[3px] bg-v3-ink" aria-hidden="true" />}
                    <Glyph name={v.icon} className="h-[22px] w-[22px]" />
                    {v.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        {toast}
        {menuOpen && <LiveMenu engine={engine} header={header} onClose={() => setMenuOpen(false)} soundOn={soundOn} onSound={onSound} phone />}
        <PlayerDrawer engine={engine} player={selected} onClose={() => setSelected(null)} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} nextOverall={nextOverall} phone />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-v3-paper font-sheet text-v3-ink">
      <LiveHeader engine={engine} header={header} autopick={autopick} onAutopick={setAutopick} soundOn={soundOn} onSound={onSound} onMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />
      <PickRibbon engine={engine} header={header} />
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Your team" className="w-[300px] shrink-0 space-y-4 overflow-y-auto border-r border-v3-rule p-3">
          <RosterPanel engine={engine} slot={rosterSlot} onSlot={setRosterSlot} roster={roster} counts={counts} onOpen={setSelected} />
          <QueuePanel engine={engine} board={board} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={setSelected} />
          {/* Below xl the right-hand column is gone, so its two blocks sit
              here rather than vanishing at the widths a laptop runs at. */}
          <div className="space-y-4 xl:hidden">
            <NextPicks engine={engine} nextPicks={nextPicks} picksMade={header.picksMade} />
            <PicksFeed engine={engine} sniped={sniped} onOpen={setSelected} limit={8} />
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <div role="tablist" aria-label="Draft views" className="flex shrink-0 items-stretch gap-1 border-b border-v3-rule bg-v3-sheet px-3">
            {VIEWS.map((v) => {
              const on = view === v.key
              return (
                <button key={v.key} type="button" role="tab" aria-selected={on} onClick={() => setView(v.key)} className={cx('relative inline-flex h-12 items-center gap-2 px-3.5 text-[15px] font-semibold', FOCUS, on ? 'text-v3-ink' : 'text-v3-ink2 hover:text-v3-ink')}>
                  <Glyph name={v.icon} className="h-4 w-4" /> {v.label}
                  {on && <span className="absolute inset-x-3 bottom-0 h-[3px] bg-v3-ink" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
          {centre}
        </main>
        <aside aria-label="Picks" className="hidden w-[300px] shrink-0 space-y-4 overflow-y-auto border-l border-v3-rule p-3 xl:block">
          <NextPicks engine={engine} nextPicks={nextPicks} picksMade={header.picksMade} />
          <PicksFeed engine={engine} sniped={sniped} onOpen={setSelected} />
        </aside>
      </div>
      {toast}
      {menuOpen && <LiveMenu engine={engine} header={header} onClose={() => setMenuOpen(false)} soundOn={soundOn} onSound={onSound} />}
      <PlayerDrawer engine={engine} player={selected} onClose={() => setSelected(null)} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} nextOverall={nextOverall} />
    </div>
  )
}
