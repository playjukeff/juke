import { useState } from 'react'
import { safe, useDraftEngine } from '../../v2/draft/draftKit.jsx'
import { CallButton, GoLink, Label, PageHead, QuietButton, Sheet, Skeleton, cx } from '../ui.jsx'
import { LAUNCH_HASH, RECORD_HASH, begin, resume, setupProblem } from './flow.js'
import { FOCUS, Glyph, Problem } from './kit.jsx'
import { Habits, Kpi, ViewField, ViewLeft, ViewLeverage, ViewTrust } from './InsightsViews.jsx'

/* Your Insights — production's insights panel, on the call sheet.

   Every figure and every sentence is off engine.insightsReport() /
   insightsMock() (app.js section 11d2): the four KPIs, the four views, the
   rail that picks between them, the habits column and the one "run this
   next" launch.

   ---- The one launch ----

   The rail's "Run this next", the habit card's button and view 04's
   experiment cards all go through one runAt(scoring, seat) — production's
   own YourInsights.runAt(), restated here because it lives inside that
   component and is not exported: setLeague({ scoring }), then clamp the seat
   to the league it is about to run in (the coverage grid counts seats up to
   the deepest room in your history, and a seat outside the league is a draft
   that never offers you a pick), then start through begin() — the engine's
   own startDraft() — and on to the live draft.

   ---- Thin sample ----

   Under five mocks views 01–03 have no honest content and every number on
   04 would be a claim about a sample of one, so the page says how far off
   it is and offers the one thing that closes the gap. */

const VIEWS = [
  { key: 'left', num: '01', title: 'What you left on the board', sub: 'Every pick against the best value available at that slot' },
  { key: 'leverage', num: '02', title: 'Which picks actually mattered', sub: 'The forks that moved your projected win percentage' },
  { key: 'field', num: '03', title: 'You against the room', sub: 'Where you take each position versus the seats you drafted against' },
  { key: 'trust', num: '04', title: 'What these mocks can prove', sub: 'Coverage, error, and how correlated your drafts are' },
]
// Views 01 and 02 are two readings of one draft, so the selected mock
// survives a move between them; 03 and 04 never read it and clear it.
const ABOUT_ONE_MOCK = ['left', 'leverage']

function NotYet({ report, onStart, problem }) {
  const have = report.mocks || 0
  const want = report.minMocks || 5
  if (report.reason === 'loading') return <Sheet code="Reading your board"><Skeleton lines={4} /></Sheet>
  return (
    <Sheet code="Not enough mocks yet" aside={`${have} of ${want} logged`}>
      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
        <div>
          <span className="font-figure text-[64px] font-bold leading-none tabular-nums text-v3-ink">{have}<span className="text-v3-ink3">/{want}</span></span>
          <div className="mt-3 flex items-center gap-1.5" role="img" aria-label={`${have} of ${want} mocks logged`}>
            {Array.from({ length: want }, (_, i) => <span key={i} className={cx('h-2.5 w-8 rounded-full', i < have ? 'bg-v3-band' : 'bg-v3-well')} />)}
          </div>
        </div>
        <div>
          <p className="max-w-[52ch] text-[16px] leading-[1.6] text-v3-ink2">
            Run {want - have} more mock{want - have === 1 ? '' : 's'} and Juke can start telling you what each draft left on the board, which picks actually moved your projected win rate, and how you compare to the rooms you drafted against. Until then every number here would be a claim about a sample too small to carry it.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <CallButton onClick={onStart}><Glyph name="play" className="h-4 w-4" filled /> Run a mock draft</CallButton>
            <GoLink href={LAUNCH_HASH}>Set it up first</GoLink>
          </div>
          {problem && <Problem className="mt-3" text={problem} />}
        </div>
      </div>
    </Sheet>
  )
}

export default function V3Insights() {
  const { engine, ready } = useDraftEngine()
  const [view, setView] = useState('left')
  const [mockId, setMockId] = useState(null)
  const [hoverBar, setHoverBar] = useState(null)
  const [hoverPos, setHoverPos] = useState(null)
  const [problem, setProblem] = useState('')

  /* Cheap to ask on every render: insightsReport() caches on the raw locker
     string, the board and the scoring shape (CLAUDE.md, 0.0012ms cached). */
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
    const ok = begin({ mySlot: Math.min(Math.max(1, seat), teams) - 1, clockLength: safe(() => engine.clockLength(), 60) })
    if (!ok) setProblem(setupProblem() || 'The draft could not be started.')
  }
  const startHere = () => {
    setProblem('')
    const ok = begin({ mySlot: safe(() => engine.mySlot(), 0), clockLength: safe(() => engine.clockLength(), 60) })
    if (!ok) setProblem(setupProblem() || 'The draft could not be started.')
  }
  const doResume = () => { if (!resume()) setProblem('That draft could not be resumed — the player list has changed since it was saved.') }

  const ok = report && report.ready
  const head = ok ? report.views[view] : null
  const sub = ok ? (view === 'left' && mock ? mock.heroSub : head.sub) : ''

  return (
    <div className="grid grid-cols-1 gap-7">
      <div>
        <a href={LAUNCH_HASH} className={cx('-ml-1 mb-3 inline-flex items-center gap-1 rounded-[4px] px-1 py-1 text-[14px] font-semibold text-v3-ink2 hover:text-v3-ink', FOCUS)}>
          <Glyph name="back" className="h-4 w-4" /> Mock drafts
        </a>
        <PageHead
          label={ok ? report.eyebrow : 'Draft · your drafting, measured'}
          title="Your insights."
          lede="Not the positions you like — what each pick cost against the best value still on the board, which picks moved your projected win rate, and how much your own sample can honestly prove."
          action={<QuietButton href={RECORD_HASH}>Every draft, in your record <Glyph name="arrow" className="h-4 w-4" /></QuietButton>}
        />
      </div>

      {inProgress && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-v3-rule bg-v3-sheet px-4 py-3">
          <span className="min-w-0">
            <Label className="block text-[11px]">In progress</Label>
            <span className="mt-0.5 block truncate text-[15px] text-v3-ink">{inProgress.teams}-team {inProgress.scoring} · round {inProgress.round ?? '—'} · pick {inProgress.made + 1} of {inProgress.total}</span>
          </span>
          <QuietButton onClick={doResume} className="border-v3-ink">Resume <Glyph name="arrow" className="h-4 w-4" /></QuietButton>
        </div>
      )}

      {!report ? <Sheet code="Your insights"><Skeleton lines={8} /></Sheet> : !ok ? <NotYet report={report} onStart={startHere} problem={problem} /> : (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {report.kpis.map((k) => <Kpi key={k.key} kpi={k} />)}
          </div>

          <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
            <div className="flex min-w-0 shrink-0 flex-col gap-3 xl:w-[250px]">
              {/* The rail: a column at xl, a horizontal strip below it. The
                  "Run this next" card is NOT in the scroller — a call to action
                  parked at the far end of a scroller is one most readers never
                  reach. */}
              <nav aria-label="Insights views" className="flex gap-2 overflow-x-auto p-[2px] xl:flex-col xl:overflow-visible">
                {VIEWS.map((v) => {
                  const on = v.key === view
                  return (
                    <button key={v.key} type="button" onClick={() => selectView(v.key)} aria-pressed={on} data-ins-view={v.key} className={cx('w-[220px] shrink-0 rounded-[6px] border px-4 py-3 text-left xl:w-auto', FOCUS, on ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet hover:border-v3-ink3')}>
                      <span className={cx('block font-figure text-[12px] font-bold tracking-[0.14em]', on ? 'text-v3-bandInk' : 'text-v3-ink3')}>{v.num}</span>
                      <span className={cx('mt-1 block text-[16px] font-extrabold leading-tight', on ? 'text-white' : 'text-v3-ink')}>{v.title}</span>
                      <span className={cx('mt-1 hidden text-[13px] leading-[1.45] xl:block', on ? 'text-v3-bandInk' : 'text-v3-ink2')}>{v.sub}</span>
                    </button>
                  )
                })}
              </nav>
              {report.runNext && (
                <Sheet code="Run this next" bodyClass="p-4">
                  <p className="text-[14px] leading-[1.5] text-v3-ink2">{report.runNext.line}</p>
                  {roomActive ? <p className="mt-3 text-[13px] text-v3-ink2">Not available in a room — seat and scoring are the room’s.</p>
                    : <CallButton onClick={() => runAt(report.runNext.scoring, report.runNext.seat)} className="mt-3 w-full">{report.runNext.label}</CallButton>}
                  {problem && <Problem className="mt-3" text={problem} />}
                </Sheet>
              )}
            </div>

            <Sheet code={`${VIEWS.find((v) => v.key === view).num} · ${head.badge}`} aside={view === 'left' || view === 'leverage' ? (mock ? mock.label : '') : `last ${report.mocks} mocks`} className="min-w-0 flex-1" aria-labelledby="v3-ins-view">
              <div className="mb-5">
                <h2 id="v3-ins-view" className="font-sheet text-[26px] font-black leading-[1.1] tracking-[-0.02em] text-v3-ink sm:text-[30px]">{head.title}</h2>
                <p className="mt-1.5 text-[15px] leading-[1.5] text-v3-ink2">{sub}</p>
              </div>
              <div data-ins-body className="min-h-[340px]">
                {view === 'left' && <ViewLeft report={report} mock={mock} selectedId={mockId || report.featuredId} hover={hoverBar} onHover={setHoverBar} onSelect={setMockId} />}
                {view === 'leverage' && <ViewLeverage mock={mock} onOpen={() => selectView('left')} />}
                {view === 'field' && <ViewField report={report} hover={hoverPos} onHover={setHoverPos} onOpen={() => selectView('leverage')} />}
                {view === 'trust' && <ViewTrust report={report} onRun={runAt} roomActive={roomActive} />}
              </div>
            </Sheet>

            <Habits report={report} roomActive={roomActive} onRun={runAt} onOpenHabit={() => selectView('leverage')} />
          </div>

          <p className="max-w-[80ch] text-[13px] leading-[1.6] text-v3-ink2">
            Windowed to your most recent {report.mocks} mocks{report.windowed ? ` of ${report.totalMocks}` : ''}, replayed against tonight’s board. “The room” is the other seats in your own mocks — same board, same ADP — not other Juke drafters. A win-% swing is the projected-win model run twice, once as drafted and once with the alternative in your lineup; it is not a simulated season.
          </p>
        </>
      )}
    </div>
  )
}
