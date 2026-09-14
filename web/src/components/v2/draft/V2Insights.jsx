import { useState } from 'react'
import { motion } from 'framer-motion'
import { beginV2Draft, resumeV2Draft, setupProblem } from '../cockpit/flow.js'
import { Arrow, Kicker, Skeleton, VoltButton, useReducedMotionPref } from '../v2ui.jsx'
import { Icon, safe, useDraftEngine } from './draftKit.jsx'
import { Sidebar, TONE_TEXT, ViewField, ViewLeft, ViewLeverage, ViewTrust } from './InsightsViews.jsx'

/* Your Insights — production's insights/ panel, in telemetry.

   Every figure and every sentence is off engine.insightsReport() /
   insightsMock() (app.js section 11d2). The four views, the rail that picks
   between them, the habits sidebar, the four KPIs and the one "run this
   next" launch are all here; what changed is the frame.

   ---- The one launch, and what it does ----

   The rail's card, the habit card's button and view 04's experiment cards
   all go through one runAt(scoring, seat), production's own, so the three
   can never aim at a (format, seat) the other two cannot. It sets the
   format through setLeague(), clamps the seat to the league it is about to
   run in — the coverage grid counts seats up to the deepest room in your
   history, and a seat outside the league is a draft that never offers you a
   pick — and starts through beginV2Draft(), which is the engine's own
   startDraft() and then the live cockpit.

   ---- What is not on this page, and where it went ----

   Production's page carries the Locker table under the panel. The v2 build
   already has that table at #/v2/drafts, so this page links to it rather
   than drawing it twice. */

const VIEWS = [
  { key: 'left', num: '01', title: 'What you left on the board', sub: 'Every pick against the best value available at that slot' },
  { key: 'leverage', num: '02', title: 'Which picks actually mattered', sub: 'The forks that moved your projected win percentage' },
  { key: 'field', num: '03', title: 'You against the room', sub: 'Where you take each position versus the seats you drafted against' },
  { key: 'trust', num: '04', title: 'What these mocks can prove', sub: 'Coverage, error, and how correlated your drafts are' },
]
// Views 01 and 02 are two readings of one draft, so the selected mock
// survives a move between them; 03 and 04 never read it and clear it.
// Production's own split, kept.
const ABOUT_ONE_MOCK = ['left', 'leverage']

const ACCENT = { bad: 'bg-v2-loss', blue: 'bg-v2-cyan', warn: 'bg-v2-warn', good: 'bg-v2-violet' }
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt'

function Kpi({ kpi }) {
  return (
    <div className="min-w-0 rounded-[14px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07]">
      <span className={`block h-[3px] w-5 rounded-full ${ACCENT[kpi.accent] || 'bg-v2-ink3'}`} aria-hidden="true" />
      <Kicker className="mt-2.5 block">{kpi.label}</Kicker>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        <span className="font-telemetry text-[34px] font-bold leading-none tabular-nums text-v2-ink">{kpi.value}</span>
        {kpi.delta && <span className={`font-mono text-[12px] tabular-nums ${TONE_TEXT[kpi.tone] || 'text-v2-ink2'}`}>{kpi.delta}</span>}
      </div>
      <p className="mt-1.5 text-[12px] leading-[1.45] text-v2-ink3">{kpi.note}</p>
    </div>
  )
}

function ResumeBand({ summary, onResume }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-v2-panel px-4 py-3 ring-1 ring-inset ring-v2-warn/30">
      <span className="min-w-0">
        <Kicker tone="text-v2-warn">In progress</Kicker>
        <span className="mt-0.5 block truncate text-[14px] text-v2-ink">
          {summary.teams}-team {summary.scoring} · round {summary.round ?? '—'} · pick {summary.made + 1} of {summary.total}
        </span>
      </span>
      <button
        type="button"
        onClick={onResume}
        className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-[11px] bg-v2-ink px-4 text-[14px] font-semibold text-v2-ground transition-transform hover:-translate-y-px ${focusRing}`}
      >
        Resume <Arrow className="h-4 w-4" />
      </button>
    </div>
  )
}

/* Too few mocks, as production handles it: views 01 to 03 have no honest
   content at zero, and every number on 04 would be a claim about a sample
   of one. The progress is the same five dots at the same threshold. */
function NotYet({ report, onStart, problem }) {
  const have = report.mocks || 0
  const want = report.minMocks || 5
  const loading = report.reason === 'loading'
  return (
    <div className="flex min-h-[380px] flex-col items-center justify-center rounded-[20px] border border-dashed border-white/[0.14] bg-v2-panel/60 px-6 py-12 text-center">
      {loading ? (
        <>
          <Kicker>Reading your board</Kicker>
          <div className="mt-4 w-full max-w-[360px]"><Skeleton lines={3} /></div>
        </>
      ) : (
        <>
          <span className="font-telemetry text-[64px] font-extrabold italic leading-none tabular-nums text-v2-ink">
            {have}<span className="text-v2-ink3">/{want}</span>
          </span>
          <Kicker className="mt-2 block">Mocks logged</Kicker>
          <div className="mt-4 flex items-center gap-1.5" role="img" aria-label={`${have} of ${want} mocks logged`}>
            {Array.from({ length: want }, (_, i) => (
              <span key={i} className={`h-2 w-8 rounded-full ${i < have ? 'bg-v2-cyan' : 'bg-white/[0.08]'}`} />
            ))}
          </div>
          <p className="mt-5 max-w-[48ch] text-[15px] leading-[1.6] text-v2-ink2">
            Run {want - have} more mock{want - have === 1 ? '' : 's'} and Juke can start telling you what each draft
            left on the board, which picks actually moved your projected win rate, and how you compare to the rooms
            you drafted against.
          </p>
          <VoltButton onClick={onStart} className="mt-6">
            <Icon name="play" className="h-4 w-4" /> Run a mock draft <Arrow />
          </VoltButton>
          {problem && <p role="status" className="mt-3 max-w-[48ch] text-[13px] text-v2-loss">{problem}</p>}
        </>
      )}
    </div>
  )
}

function RailButton({ view, on, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={on}
      data-ins-view={view.key}
      className={`relative w-[210px] shrink-0 overflow-hidden rounded-[13px] px-4 py-3 text-left ring-1 ring-inset transition-colors xl:w-auto ${focusRing} ${
        on ? 'bg-white/[0.05] ring-v2-volt/40' : 'bg-v2-panel ring-white/[0.07] hover:ring-white/[0.18]'
      }`}
    >
      {on && <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-v2-volt" aria-hidden="true" />}
      <span className={`block font-mono text-[11px] font-semibold tracking-[0.16em] ${on ? 'text-v2-volt' : 'text-v2-ink3'}`}>{view.num}</span>
      <span className={`mt-1 block font-telemetry text-[20px] font-bold uppercase italic leading-[1] ${on ? 'text-v2-ink' : 'text-v2-ink2'}`}>{view.title}</span>
      <span className="mt-1 hidden text-[12px] leading-[1.45] text-v2-ink3 xl:block">{view.sub}</span>
    </button>
  )
}

export default function V2Insights() {
  const { engine, ready } = useDraftEngine()
  const reduce = useReducedMotionPref()
  const [view, setView] = useState('left')
  const [mockId, setMockId] = useState(null)
  const [hoverBar, setHoverBar] = useState(null)
  const [hoverPos, setHoverPos] = useState(null)
  const [problem, setProblem] = useState('')

  /* Cheap to ask on every render: insightsReport() caches on the raw
     locker string, the board and the scoring shape, and answers from that
     cache in about a microsecond — production reads it the same way. */
  const report = ready ? safe(() => engine.insightsReport()) : null
  const mock = report && report.ready ? safe(() => engine.insightsMock(mockId || report.featuredId)) : null
  const inProgress = ready ? safe(() => engine.inProgressSummary()) : null
  const roomActive = !!(engine && safe(() => engine.hasRoom(), false))

  const selectView = (key) => {
    setView(key)
    if (!ABOUT_ONE_MOCK.includes(key)) setMockId(null)
    setHoverBar(null)
    setHoverPos(null)
  }

  const runAt = (scoring, seat) => {
    setProblem('')
    if (roomActive || !engine) return
    if (scoring) engine.setLeague({ scoring })
    const teams = safe(() => engine.league().teams, 10)
    const ok = beginV2Draft({ mySlot: Math.min(Math.max(1, seat), teams) - 1, clockLength: safe(() => engine.clockLength(), 60) })
    if (!ok) setProblem(setupProblem() || 'The draft could not be started.')
  }
  const startHere = () => {
    setProblem('')
    const ok = beginV2Draft({ mySlot: safe(() => engine.mySlot(), 0), clockLength: safe(() => engine.clockLength(), 60) })
    if (!ok) setProblem(setupProblem() || 'The draft could not be started.')
  }
  const resume = () => {
    if (!resumeV2Draft()) setProblem('That draft could not be resumed — the player list has changed since it was saved.')
  }

  const ok = report && report.ready
  const head = ok ? report.views[view] : null
  const sub = ok ? (view === 'left' && mock ? mock.heroSub : head.sub) : ''

  return (
    <>
      <div className="flex flex-col gap-3">
        <a href="#/v2/draft" className={`-ml-1 inline-flex w-fit items-center gap-1 rounded-[8px] px-1 py-1 text-[13px] font-medium text-v2-ink2 hover:text-v2-ink ${focusRing}`}>
          <Icon name="chevLeft" className="h-4 w-4" /> Mock drafts
        </a>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[760px]">
            <Kicker tone="text-v2-ink2">{ok ? report.eyebrow : 'Your drafting, measured'}</Kicker>
            <h1 className="mt-3 font-telemetry text-[clamp(2.8rem,6vw,5rem)] font-extrabold uppercase italic leading-[0.88] text-v2-ink">
              Your insights.
            </h1>
            <p className="mt-4 max-w-[60ch] text-[16px] leading-[1.55] text-v2-ink2">
              Not the positions you like — what each pick cost against the best value still on the board, which
              picks moved your projected win rate, and how much your own sample can honestly prove.
            </p>
          </div>
          <a href="#/v2/drafts" className={`inline-flex min-h-[40px] w-fit shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.12] hover:bg-white/[0.04] ${focusRing}`}>
            Every draft, in the locker <Arrow className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {inProgress && <div className="mt-6"><ResumeBand summary={inProgress} onResume={resume} /></div>}

      {!report ? (
        <div className="mt-8 rounded-[20px] bg-v2-panel p-6 ring-1 ring-inset ring-white/[0.07]"><Skeleton lines={8} /></div>
      ) : !ok ? (
        <div className="mt-8"><NotYet report={report} onStart={startHere} problem={problem} /></div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {report.kpis.map((k) => <Kpi key={k.key} kpi={k} />)}
          </div>

          <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-start">
            <div className="flex min-w-0 shrink-0 flex-col gap-2.5 xl:w-[250px]">
              <nav aria-label="Insights views" className="flex gap-2 overflow-x-auto p-[3px] xl:flex-col xl:overflow-visible xl:p-0">
                {VIEWS.map((v) => <RailButton key={v.key} view={v} on={v.key === view} onSelect={() => selectView(v.key)} />)}
              </nav>
              {report.runNext && (
                <div className="rounded-[14px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07]">
                  <Kicker tone="text-v2-ink2">Run this next</Kicker>
                  <p className="mt-2 text-[13px] leading-[1.5] text-v2-ink2">{report.runNext.line}</p>
                  {roomActive ? (
                    <p className="mt-3 text-[12px] text-v2-ink3">Not available in a room — seat and scoring are the room&apos;s.</p>
                  ) : (
                    <VoltButton onClick={() => runAt(report.runNext.scoring, report.runNext.seat)} size="md" className="mt-3 w-full">
                      {report.runNext.label}
                    </VoltButton>
                  )}
                  {problem && <p role="status" className="mt-2 text-[12px] leading-[1.45] text-v2-loss">{problem}</p>}
                </div>
              )}
            </div>

            <section aria-labelledby="v2-ins-view" className="min-w-0 flex-1 rounded-[18px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07] sm:p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="v2-ins-view" className="font-telemetry text-[30px] font-bold uppercase italic leading-[0.95] text-v2-ink sm:text-[36px]">{head.title}</h2>
                  <p className="mt-1.5 text-[14px] leading-[1.5] text-v2-ink2">{sub}</p>
                </div>
                <span className="shrink-0 rounded-[7px] bg-white/[0.04] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-v2-ink2 ring-1 ring-inset ring-white/[0.1]">
                  {head.badge}
                </span>
              </div>
              <motion.div
                key={view + ':' + (view === 'left' || view === 'leverage' ? mockId || '' : '')}
                data-ins-body
                initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 0.22, ease: 'easeOut' }}
                className="min-h-[360px]"
              >
                {view === 'left' && (
                  <ViewLeft report={report} mock={mock} selectedId={mockId || report.featuredId} hover={hoverBar} onHover={setHoverBar} onSelect={setMockId} />
                )}
                {view === 'leverage' && <ViewLeverage mock={mock} onOpen={() => selectView('left')} />}
                {view === 'field' && <ViewField report={report} hover={hoverPos} onHover={setHoverPos} onOpen={() => selectView('leverage')} />}
                {view === 'trust' && <ViewTrust report={report} onRun={runAt} roomActive={roomActive} />}
              </motion.div>
            </section>

            <Sidebar report={report} roomActive={roomActive} onRun={runAt} onOpenHabit={() => selectView('leverage')} />
          </div>

          <p className="mt-4 max-w-[80ch] text-[12px] leading-[1.6] text-v2-ink3">
            Windowed to your most recent {report.mocks} mocks{report.windowed ? ` of ${report.totalMocks}` : ''}, replayed against
            tonight&apos;s board. &ldquo;The room&rdquo; is the other seats in your own mocks — same board, same ADP — not other
            Juke drafters. A win-% swing is the projected-win model run twice, once as drafted and once with the alternative in
            your lineup; it is not a simulated season.
          </p>
        </>
      )}
    </>
  )
}
