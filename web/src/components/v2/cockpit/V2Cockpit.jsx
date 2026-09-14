import { useEffect, useRef, useState } from 'react'
import { useMinWidth } from '../../../hooks/useBreakpoint.js'
import { Arrow, GhostButton, Kicker, PosChip, Skeleton, VoltButton } from '../v2ui.jsx'
import { LAUNCH_HASH, REPORT_HASH, resumeV2Draft } from './flow.js'
import { readHeader, readNextPicks, readRoster, signedInt } from './cockpitData.js'
import { useDraftVersion, useEngine } from './useCockpit.js'
import { DraftButton, FOCUS, Headshot, Panel } from './parts.jsx'
import { IconChart, IconCompass, IconGrid, IconList, IconUsers } from './icons.jsx'
import CockpitHeader from './CockpitHeader.jsx'
import CockpitMenu from './CockpitMenu.jsx'
import PlayerPool, { usePoolFilters } from './PlayerPool.jsx'
import DraftBoard from './DraftBoard.jsx'
import DecidePanel from './DecidePanel.jsx'
import AnalysisPanel from './AnalysisPanel.jsx'
import PlayerDrawer from './PlayerDrawer.jsx'
import { NextPicks, PickRibbon, PicksFeed, QueuePanel, RosterPanel } from './Rails.jsx'

/* The live draft, at #/v2/draft/live.

   ---- Who moves the draft ----

   Not this component. A solo draft's CPU picks (runCPUs() -> cpuStep())
   and its pick clock (resetClock() -> startTicking(), which drafts for you
   off your queue when it runs out) live in app.js, and app.js's
   applyRoute() carries them on when the hash arrives here — see
   onV2LiveRoute() there, the one change this build makes to that file.
   Production's DraftRoom.jsx stays mounted on this route, as it is on
   every route, but every effect of its that drafts (its own autopick) is
   gated on the #/draft-room hash, so nothing is driven twice.

   The one thing this component does drive is solo autopick, and it does it
   the way DraftRoom does: when it is your turn and the switch is on, submit
   engine.autoPickForMe() — queue first, then what a CPU in your chair would
   take, then the best man left — through engine.draftPlayer(), the same
   door the Draft button uses. Guarded per pick, so a re-render during your
   own turn cannot submit twice.

   ---- One tree at each width ----

   Desktop (lg+) is a workspace: roster and queue on the left, the view in
   the middle, the pick feed on the right from xl. A phone is a different
   screen rather than a narrower one — one view at a time under a bottom
   tab bar — and useMinWidth picks between them rather than CSS, because
   CSS-hidden is still mounted and the player drawer's news tab would then
   fetch twice (CLAUDE.md, "that is what useMinWidth is for"). */

const VIEWS = [
  { key: 'players', label: 'Players', icon: IconList },
  { key: 'board', label: 'Board', icon: IconGrid },
  { key: 'decide', label: 'Decide', icon: IconCompass },
  { key: 'analysis', label: 'Analysis', icon: IconChart },
]
const PHONE_VIEWS = [VIEWS[0], VIEWS[1], VIEWS[2], { key: 'team', label: 'Team', icon: IconUsers }, VIEWS[3]]

function JukesPick({ engine, header, canDraft, draftReason, onDraft, onOpen, nextOverall, phone }) {
  if (header.over) return null
  const top = engine.suggestions('ALL')[0]
  if (!top) return null
  const vorp = engine.replacementGap(top)
  const survival = engine.survivalProbability(top, nextOverall)
  return (
    <div className={`flex items-center gap-3 border-b border-white/[0.06] bg-v2-raised/60 ${phone ? 'px-3 py-2' : 'px-4 py-2.5'}`}>
      <Kicker tone="text-v2-ink2" className="hidden shrink-0 sm:inline">{header.myTurn ? 'Juke’s pick' : 'Juke would take'}</Kicker>
      <button type="button" onClick={() => onOpen(top)} className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[8px] text-left ${FOCUS}`}>
        <Headshot src={engine.photoUrl(top)} name={top.name} pos={top.pos} size={30} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-v2-ink">{top.name}</span>
            <PosChip pos={top.pos} />
          </span>
          <span className="block truncate font-mono text-[10px] tabular-nums text-v2-ink3">
            VORP <span className={vorp > 0 ? 'text-v2-volt' : vorp < 0 ? 'text-v2-loss' : ''}>{signedInt(vorp)}</span>
            {survival != null && nextOverall ? ` · ${Math.round(survival * 100)}% still there at pick ${nextOverall}` : ''}
          </span>
        </span>
      </button>
      {header.myTurn && (
        <DraftButton variant="primary" disabled={!canDraft} reason={draftReason} onClick={() => onDraft(top)} label={phone ? 'Draft' : `Draft ${top.name.split(' ').slice(-1)[0]}`} />
      )}
    </div>
  )
}

function EmptyState({ engine }) {
  let saved = null
  try { saved = engine.inProgressSummary() } catch { saved = null }
  const room = engine.hasRoom()
  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-v2-ground">
      <div className="mx-auto flex min-h-full max-w-[720px] flex-col justify-center px-5 py-16">
        <Kicker tone="text-v2-ink2">The Draft Room · live</Kicker>
        <h1 className="mt-3 font-telemetry text-[clamp(2.8rem,6vw,5rem)] font-extrabold uppercase italic leading-[0.88] text-v2-ink">
          {room ? 'This draft is a shared room.' : saved ? 'Your draft is waiting.' : 'No draft on the clock.'}
        </h1>
        <p className="mt-4 max-w-[60ch] text-[16px] leading-[1.55] text-v2-ink2">
          {room
            ? 'A draft with friends runs in the classic Draft Room, where the room itself keeps the clock for everybody.'
            : saved
              ? `${saved.leagueType} from the ${saved.pickPosition} seat — ${saved.made} of ${saved.total} picks made. It picks up exactly where you left it.`
              : 'Start a mock from the launcher — it runs entirely in your browser, against nine CPU drafters on tonight’s board.'}
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          {room ? (
            <VoltButton href="#/draft-room">Open the room <Arrow /></VoltButton>
          ) : saved ? (
            <VoltButton onClick={() => resumeV2Draft()}>Resume the draft <Arrow /></VoltButton>
          ) : (
            <VoltButton href={LAUNCH_HASH}>Set up a mock draft <Arrow /></VoltButton>
          )}
          <GhostButton href="#/v2">Back to the board</GhostButton>
        </div>
      </div>
    </div>
  )
}

export default function V2Cockpit() {
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

  // Solo autopick — see the file comment. Keyed on the overall pick, so it
  // fires once per turn however many times this renders during it.
  useEffect(() => {
    if (!ready || !header.started || over || room || !autopick || !myTurn) return
    if (lastAuto.current === header.overall) return
    lastAuto.current = header.overall
    const choice = engine.autoPickForMe()
    if (choice) engine.draftPlayer(choice)
  }, [version, autopick])

  // The draft ended: the report is the next screen, the way production
  // opens Insights on the edge. replace(), so Back does not land on a live
  // route that would bounce straight forward again.
  useEffect(() => {
    if (ready && header.started && over) location.replace(REPORT_HASH)
  }, [version])

  // Which picks took a player off YOUR queue. Caught as it happens — the
  // queue prunes a drafted player the moment the pick lands, so it cannot be
  // derived afterwards (DraftRoom.jsx's own "sniped" note).
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
      <div className="fixed inset-0 z-[55] grid place-items-center bg-v2-ground p-8">
        <div className="w-full max-w-[480px]"><Kicker tone="text-v2-ink2">Loading tonight’s board</Kicker><div className="mt-4"><Skeleton lines={5} /></div></div>
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

  const centre =
    view === 'players' ? (
      <>
        <JukesPick engine={engine} header={header} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={setSelected} nextOverall={nextOverall} phone={!desktop} />
        <PlayerPool engine={engine} version={version} f={f} set={setF} sort={sortBy} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={setSelected} nextOverall={nextOverall} phone={!desktop} />
      </>
    ) : view === 'board' ? (
      <DraftBoard engine={engine} version={version} onOpen={setSelected} phone={!desktop} />
    ) : view === 'decide' ? (
      <DecidePanel engine={engine} myTurn={myTurn} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={setSelected} nextOverall={nextOverall} onBrowse={() => setView('players')} phone={!desktop} />
    ) : view === 'analysis' ? (
      <AnalysisPanel engine={engine} slot={gradeSlot} onSlot={setGradeSlot} phone={!desktop} />
    ) : (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex gap-1 border-b border-white/[0.06] bg-v2-ground/95 p-2 backdrop-blur" role="tablist" aria-label="Team">
          {[['roster', 'Roster'], ['queue', 'Queue'], ['picks', 'Picks']].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={teamPane === k} onClick={() => setTeamPane(k)} className={`min-h-[40px] flex-1 rounded-[9px] font-mono text-[11px] font-semibold uppercase tracking-[0.08em] ${FOCUS} ${teamPane === k ? 'bg-v2-volt text-v2-voltInk' : 'text-v2-ink2 ring-1 ring-inset ring-white/[0.08]'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="p-3">
          {teamPane === 'roster' && <RosterPanel engine={engine} slot={rosterSlot} onSlot={setRosterSlot} roster={roster} counts={counts} onOpen={setSelected} />}
          {teamPane === 'queue' && <QueuePanel engine={engine} board={board} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={setSelected} />}
          {teamPane === 'picks' && (
            <div className="space-y-3">
              <NextPicks engine={engine} nextPicks={nextPicks} picksMade={header.picksMade} />
              <PicksFeed engine={engine} sniped={sniped} onOpen={setSelected} limit={40} />
            </div>
          )}
        </div>
      </div>
    )

  const toast = notice && (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4 lg:bottom-6">
      <span className="rounded-[12px] bg-v2-raised px-4 py-2.5 text-[13px] text-v2-ink shadow-lg ring-1 ring-inset ring-v2-loss/30">{notice}</span>
    </div>
  )

  if (!desktop) {
    return (
      <div className="fixed inset-0 z-[55] flex flex-col bg-v2-ground text-v2-ink">
        <CockpitHeader engine={engine} header={header} phone autopick={autopick} onAutopick={setAutopick} soundOn={soundOn} onSound={onSound} onMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />
        <main className="flex min-h-0 flex-1 flex-col">{centre}</main>
        <nav aria-label="Draft views" className="shrink-0 border-t border-white/[0.07] bg-v2-ground/95 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <ul className="grid grid-cols-5">
            {PHONE_VIEWS.map((v) => {
              const on = view === v.key
              const Icon = v.icon
              return (
                <li key={v.key}>
                  <button type="button" onClick={() => setView(v.key)} aria-current={on ? 'page' : undefined} className={`relative flex min-h-[56px] w-full flex-col items-center justify-center gap-1 ${FOCUS} ${on ? 'text-v2-ink' : 'text-v2-ink3'}`}>
                    {on && <span className="absolute inset-x-5 top-0 h-[2px] rounded-full bg-v2-volt" aria-hidden="true" />}
                    <Icon className="h-[18px] w-[18px]" />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em]">{v.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        {toast}
        {menuOpen && <CockpitMenu engine={engine} header={header} onClose={() => setMenuOpen(false)} soundOn={soundOn} onSound={onSound} phone />}
        <PlayerDrawer engine={engine} player={selected} onClose={() => setSelected(null)} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} nextOverall={nextOverall} phone />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-v2-ground text-v2-ink">
      <CockpitHeader engine={engine} header={header} autopick={autopick} onAutopick={setAutopick} soundOn={soundOn} onSound={onSound} onMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />
      <PickRibbon engine={engine} header={header} />
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Your team" className="flex w-[300px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/[0.06] p-4">
          <RosterPanel engine={engine} slot={rosterSlot} onSlot={setRosterSlot} roster={roster} counts={counts} onOpen={setSelected} />
          <QueuePanel engine={engine} board={board} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={setSelected} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <div role="tablist" aria-label="Draft views" className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-3">
            {VIEWS.map((v) => {
              const on = view === v.key
              return (
                <button key={v.key} type="button" role="tab" aria-selected={on} onClick={() => setView(v.key)} className={`relative inline-flex h-12 items-center gap-2 rounded-t-[8px] px-3.5 text-[13px] font-medium ${FOCUS} ${on ? 'text-v2-ink' : 'text-v2-ink3 hover:text-v2-ink2'}`}>
                  <v.icon className="h-4 w-4" /> {v.label}
                  {on && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-v2-volt" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
          {centre}
        </main>
        <aside aria-label="Picks" className="hidden w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-white/[0.06] p-4 xl:flex">
          <NextPicks engine={engine} nextPicks={nextPicks} picksMade={header.picksMade} />
          <PicksFeed engine={engine} sniped={sniped} onOpen={setSelected} />
        </aside>
      </div>
      {toast}
      {menuOpen && <CockpitMenu engine={engine} header={header} onClose={() => setMenuOpen(false)} soundOn={soundOn} onSound={onSound} />}
      <PlayerDrawer engine={engine} player={selected} onClose={() => setSelected(null)} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} nextOverall={nextOverall} />
    </div>
  )
}
