import { useEffect, useMemo, useRef, useState } from 'react'
import { KPI_ACCENT, TONE_INK, delay } from './tokens.js'
import ViewLeftOnBoard from './ViewLeftOnBoard.jsx'
import ViewLeverage from './ViewLeverage.jsx'
import ViewField from './ViewField.jsx'
import ViewTrust from './ViewTrust.jsx'
import InsightsSidebar from './InsightsSidebar.jsx'

/* Your Insights — design_handoff_your_insights, option 1a.

   One panel, four views selected from a left rail, and a sidebar that does
   not change with the view. It replaced the eight-card analytics grid that
   used to sit under "Your Tendencies": positional shares and averages, which
   is what every competitor shows and which converges on the population's own
   base rates the more mocks somebody runs. What is here instead is decision
   science — what a pick cost against the best value still on the board, which
   picks actually moved projected win %, how you compare to the room you
   drafted against, and how much fourteen mocks can honestly prove.

   NOTHING ON THIS PAGE IS COMPUTED HERE. Every figure and every sentence
   comes off `engine.insightsReport()` / `engine.insightsMock()` (app.js
   section 11d2), for the reason oneThatGotAway() and usageFor() already
   live in the engine: a component that renders a verdict it also computes is
   the written-down-twice rule in React, and the sidebar's habit card and the
   centre panel's pick table are two readings of one audit that must never
   disagree about which decision was expensive.

   Two things the handoff specifies that this deliberately does not do, both
   because the data does not support them and a page whose whole subject is
   evidence may not be the thing on the site that overclaims:

   - "Each fork re-simulated a thousand times." There is no simulator. What
     there is is projectedWinPctForRoom()'s normal-difference model, run
     twice — once as drafted and once with the alternative in your lineup —
     and the copy says exactly that.
   - "Against drafters in the same seat and format." There is no
     cross-account draft store. The field on this page is the OTHER SEATS IN
     YOUR OWN ROOMS, which is a real and useful control (same board, same
     ADP, same night) and is named as such everywhere it appears.

   The handoff is authored at a fixed 1480px and says a responsive pass has
   not been designed. This page is reachable from DraftRoomEntry's "Your
   insights" at every width, phones included, so it cannot ship desktop-only:
   below `xl` the sidebar drops under the panel and the rail becomes a
   horizontal strip, which is the README's own recommendation rather than an
   improvisation on top of it. */

const VIEWS = [
  {
    key: 'left',
    num: '01',
    title: 'What you left on the board',
    sub: 'Every pick against the best value available at that slot',
    icon: 'M4 19h16M7 19V9m5 10V5m5 14v-7',
  },
  {
    key: 'leverage',
    num: '02',
    title: 'Which picks actually mattered',
    sub: 'The forks that moved your projected win percentage',
    icon: 'M12 4v6m0 0l-5 4m5-4l5 4M7 14v6m10-6v6',
  },
  {
    key: 'field',
    num: '03',
    title: 'You against the room',
    sub: 'Where you take each position versus the seats you drafted against',
    icon: 'M5 8h14M5 16h14M9 8v8m6-8v8',
  },
  {
    key: 'trust',
    num: '04',
    title: 'What these mocks can prove',
    sub: 'Coverage, error, and how correlated your drafts are',
    icon: 'M12 4l7 3v6c0 3.6-2.9 6-7 7-4.1-1-7-3.4-7-7V7z',
  },
]

// One KPI tile. The accent rule, the label, the value-and-delta baseline and
// the note, in that order — four facts stacked, none of them competing for
// the same weight.
function Kpi({ kpi, i }) {
  return (
    <div
      data-ins-rise
      style={delay(80 + i * 70)}
      /* Two up on a phone, four across from sm. One per row is what a plain
         168px basis produces at 375px (the panel leaves 311px, and two cards
         plus their gap want 346), which is four full-width tiles and most of
         a screen of numbers before the panel they summarise. */
      className="min-w-0 flex-1 basis-[calc(50%-5px)] rounded-[14px] border border-white/[0.07] bg-slate-panel px-[15px] py-[13px] sm:basis-[168px]"
    >
      <span className="block h-[3px] w-5 rounded-full" style={{ background: KPI_ACCENT[kpi.accent] }} />
      <p className="mt-2.5 font-plex text-[10px] tracking-[0.13em] text-ink-soft">{kpi.label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="font-display text-[27px] font-bold leading-none text-ink">{kpi.value}</p>
        {kpi.delta && (
          <p className="font-plex text-[12px] leading-none" style={{ color: TONE_INK[kpi.tone] }}>
            {kpi.delta}
          </p>
        )}
      </div>
      <p className="mt-1.5 text-[12px] leading-[1.35] text-ink-soft">{kpi.note}</p>
    </div>
  )
}

function RailButton({ view, on, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={on ? 'true' : undefined}
      data-ins-view={view.key}
      className={
        /* Capped below xl, uncapped in the column. Without the cap each button
           sizes to its own title and the strip comes out 2313px wide with the
           widest card at 418px - a scroller a phone reader has to drag three
           times to see four options. */
        'relative w-[220px] shrink-0 overflow-hidden rounded-[13px] border px-[15px] py-[13px] text-left ' +
        'transition-[border-color,background-color,transform] duration-[180ms] xl:w-auto ' +
        (on
          ? 'border-teal-400/50 bg-teal-400/[0.07] xl:translate-x-[3px]'
          : 'border-white/[0.07] bg-slate-panel hover:border-teal-400/45')
      }
    >
      {/* Keyed on the view so the indicator replays its own wipe every time
          the selection moves — the same trick the centre panel uses, at the
          scale of one 3px rule. */}
      {on && (
        <span
          key={view.key}
          data-ins-rail
          className="absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r-[3px]"
          style={{ background: 'linear-gradient(180deg, #00E5FF, #82A1F6)' }}
        />
      )}
      <div className="flex items-center gap-[9px]">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={on ? '#00E5FF' : '#8A9BAA'}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 transition-colors duration-[180ms]"
          aria-hidden="true"
        >
          <path d={view.icon} />
        </svg>
        <p className={'font-plex text-[11px] tracking-[0.16em] ' + (on ? 'text-teal-300' : 'text-ink-soft')}>
          {view.num}
        </p>
      </div>
      <p
        className={
          'mt-[7px] font-display text-[17.5px] font-bold leading-[1.15] ' + (on ? 'text-white' : 'text-ink')
        }
      >
        {view.title}
      </p>
      {/* The sub is the rail's whole reason for being four cards rather than
          four tabs, and below xl it is also a third copy of a sentence the
          centre panel prints in full two inches below. Dropped there so the
          strip is four readable options rather than one and a half. */}
      <p className={'mt-1 hidden text-[13px] leading-[1.45] xl:block ' + (on ? 'text-ink/80' : 'text-ink-soft')}>
        {view.sub}
      </p>
    </button>
  )
}

/* The pre-sample state, which the handoff explicitly leaves undesigned and
   which this page cannot ship without: views 01 to 03 have no honest content
   at zero mocks, and every number on view 04 would be a claim about a sample
   of one. The dots are the same five-dot progress the analytics grid this
   replaced already used for the same gate at the same threshold — the reader
   and the question have not changed, so neither has the count. */
function NotYet({ report, onStart }) {
  const have = report.mocks || 0
  const want = report.minMocks
  const loading = report.reason === 'loading'
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/[0.14] bg-slate/60 p-10 text-center">
      <p className="max-w-[420px] text-sm leading-relaxed text-ink-soft">
        {loading ? (
          'Reading your board.'
        ) : (
          <>
            Run {want - have} more mock{want - have === 1 ? '' : 's'} and Juke can start telling you what
            each draft left on the board, which picks actually moved your projected win rate, and how you
            compare to the rooms you drafted against.
          </>
        )}
      </p>
      {!loading && (
        <>
          <div
            className="mt-4 flex items-center gap-2"
            role="img"
            aria-label={`${have} of ${want} mocks logged`}
          >
            {Array.from({ length: want }, (_, i) => (
              <span
                key={i}
                className={
                  'h-2 w-2 rounded-full ' +
                  (i < have ? 'bg-teal-400 shadow-[0_0_6px_rgba(0,229,255,0.6)]' : 'border border-white/15')
                }
              />
            ))}
          </div>
          <p className="mt-2 font-plex text-xs tabular-nums text-ink-muted">
            {have} of {want} logged so far
          </p>
          {onStart && (
            <button
              type="button"
              onClick={onStart}
              className="mt-5 rounded-[10px] bg-teal-400 px-5 py-3 text-[12.5px] font-extrabold tracking-[0.03em] text-obsidian transition-transform duration-150 hover:-translate-y-0.5"
            >
              Run a mock draft
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default function YourInsights({ engine, roomActive, onRunAtSeat }) {
  const [view, setView] = useState('left')
  const [mockId, setMockId] = useState(null)
  const [hoverBar, setHoverBar] = useState(null)
  const [hoverPos, setHoverPos] = useState(null)

  const report = engine.insightsReport ? engine.insightsReport() : { ready: false, mocks: 0, minMocks: 5 }

  /* Which mock is selected survives a move between the two views that are
     ABOUT a mock, and is cleared by the two that are not.

     The handoff clears it on every rail press, and the reason it gives is
     sound: view 01's header names the selected mock, so coming back to it
     later showing a draft nobody chose this visit is the stale-view leak
     DraftRoom.jsx already documents for `view` and `soloAutopick`. What that
     rule costs is the link between 01 and 02, which are two readings of one
     draft — audit a mock, press "Which picks actually mattered", and the
     handoff hands you a different draft's forks with no way to ask for the
     one you were looking at, because a fork card's own click goes back to 01.

     Views 03 and 04 never read `mock`, so clearing it there is invisible
     until the reader returns to 01 — which is exactly the moment the
     handoff's rule is protecting. Both halves kept, each where it applies. */
  const ABOUT_ONE_MOCK = ['left', 'leverage']
  const selectView = (key) => {
    setView(key)
    if (!ABOUT_ONE_MOCK.includes(key)) setMockId(null)
    setHoverBar(null)
    setHoverPos(null)
  }

  const mock = useMemo(() => {
    if (!report.ready || !engine.insightsMock) return null
    return engine.insightsMock(mockId || report.featuredId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.ready, report.featuredId, mockId, report.eyebrow])

  /* The one-shot light sweep, and the reason it is a ref rather than a `key`
     on the content node.

     Keying the content on the view remounts it, which is what replays every
     staggered entrance underneath — that part the handoff gets right and this
     does too. What a `key` alone does NOT do is re-run the sweep when a
     reader selects a different MOCK inside view 01, which is a content change
     with no view change behind it. Bumping a counter on both is one source of
     truth for "the panel's contents just changed". */
  const [pulse, setPulse] = useState(0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setPulse((n) => n + 1)
  }, [view, mockId])

  if (!report.ready) {
    return (
      <div>
        <Header report={report} />
        <NotYet report={report} onStart={onRunAtSeat ? () => onRunAtSeat(engine.mySlot()) : null} />
      </div>
    )
  }

  const head = report.views[view]
  const sub = view === 'left' && mock ? mock.heroSub : head.sub

  /* The one launch on this page. Every CTA goes through it — the rail's "run
     this next", the sidebar's habit button and view 04's three experiment
     cards — so the three can never aim at a (format, seat) the other two
     cannot, which is the same reason describeRecommendation() exists for the
     pair that came before them.

     The seat is clamped to the league it is about to launch in. The coverage
     grid counts seats up to the deepest room in your history, so a
     recommendation can name seat 12 while the live league runs ten:
     startDraft() writes opts.mySlot straight onto state, and a seat outside
     the league is the draft that runs to the end without ever offering you a
     pick — no error, nothing on screen, it simply skips you. clampSeat()
     guards setLeague() and readSetup(); this is the third door. */
  const runAt = (scoring, seat) => {
    if (roomActive || !onRunAtSeat) return
    if (scoring) engine.setLeague({ scoring })
    const teams = engine.league().teams
    onRunAtSeat(Math.min(Math.max(1, seat), teams) - 1)
  }

  return (
    <div className="mb-7">
      <div
        data-ins-deal
        className="rounded-[22px] border border-white/[0.07] bg-slate px-4 pb-6 pt-5 sm:px-7 sm:pb-[30px] sm:pt-[26px]"
      >
        <Header report={report} />

        <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
          {/* The rail. A column at xl and a horizontal scroller under it —
              four 210px buttons stacked would push the panel below the fold
              on a phone before anything it selects had been seen. */}
          {/* The rail, and the card under it.

              Two elements rather than one, because they want different things
              below xl: the four buttons become a horizontal strip you swipe,
              and the CTA under them must NOT - a call to action parked at the
              far end of a scroller is a control most readers never reach. In
              the column at xl the two stack and read as one rail, which is
              what the handoff draws. */}
          <div className="flex shrink-0 flex-col gap-2 xl:w-[262px]">
          <nav
            aria-label="Insights views"
            /* xl:pr-1 pays for the active button’s own translateX(3px):
               the rail is overflow-visible in its column form, so without it
               the lit button hangs 3px into the gap and an overflow sweep
               reports the nav as leaking. */
            className="no-scrollbar flex gap-2 overflow-x-auto xl:flex-col xl:overflow-visible xl:pr-1"
          >
            {VIEWS.map((v) => (
              <RailButton key={v.key} view={v} on={v.key === view} onSelect={() => selectView(v.key)} />
            ))}
          </nav>
            {report.runNext && (
              <div className="mt-0 rounded-[13px] border border-teal-400/30 bg-slate-panel p-[15px] xl:mt-1">
                <p className="font-plex text-[10.5px] tracking-[0.14em] text-teal-300">RUN THIS NEXT</p>
                <p className="mt-2 text-[13.5px] leading-[1.45] text-ink/80">{report.runNext.line}</p>
                <button
                  type="button"
                  onClick={() => runAt(report.runNext.scoring, report.runNext.seat)}
                  disabled={roomActive}
                  title={roomActive ? 'Not available in a room' : undefined}
                  className={
                    'mt-3 w-full rounded-[10px] py-[11px] text-[12.5px] font-extrabold tracking-[0.03em] transition-transform duration-150 ' +
                    (roomActive
                      ? 'cursor-not-allowed bg-white/10 text-white/30'
                      : 'bg-teal-400 text-obsidian hover:-translate-y-0.5')
                  }
                >
                  {report.runNext.label}
                </button>
                {roomActive && (
                  <p className="mt-1.5 text-[11px] text-ink-muted">
                    Not available in a room — seat and scoring are the room&rsquo;s.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* The centre panel. */}
          <section className="min-w-0 flex-1 rounded-[18px] border border-white/[0.07] bg-slate-panel px-4 py-5 sm:px-6 sm:py-[22px]">
            <div className="mb-[18px] flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-display text-[20px] font-bold text-white sm:text-[23px]">{head.title}</h3>
                <p className="mt-[5px] text-[13.5px] text-ink-soft">{sub}</p>
              </div>
              <span className="shrink-0 rounded-full bg-teal-400/[0.12] px-3 py-1.5 font-plex text-[10.5px] tracking-[0.1em] text-teal-300">
                {head.badge}
              </span>
            </div>

            {/* data-ins-body, and the four data-ins-view attributes on the
                rail, exist for the tests rather than for the styling. An
                attribute says what an element IS; a class says what it
                currently looks like, and this panel's classes are a
                breakpoint-dependent min-height that has already changed once.
                Same rule as data-start-draft and data-pick-code. */}
            <div key={view + ':' + pulse} data-ins-body className="relative min-h-[420px] xl:min-h-[545px]">
              {/* The clipping layer must be its own element: `overflow:
                  hidden` on the content wrapper crops the charts inside it,
                  which is the handoff's own warning and is a real bug — the
                  dumbbell dots sit half outside their track. */}
              <span className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
                <span
                  data-ins-sweep
                  className="absolute bottom-0 left-0 top-0 w-[34%]"
                  style={{ background: 'linear-gradient(100deg, transparent, rgba(0,229,255,0.07), transparent)' }}
                />
              </span>

              {view === 'left' && (
                <ViewLeftOnBoard
                  report={report}
                  mock={mock}
                  selectedId={mockId || report.featuredId}
                  hover={hoverBar}
                  onHover={setHoverBar}
                  onSelect={setMockId}
                />
              )}
              {view === 'leverage' && <ViewLeverage mock={mock} onOpen={() => selectView('left')} />}
              {view === 'field' && (
                <ViewField
                  report={report}
                  hover={hoverPos}
                  onHover={setHoverPos}
                  onOpen={() => selectView('leverage')}
                />
              )}
              {view === 'trust' && <ViewTrust report={report} onRun={runAt} roomActive={roomActive} />}
            </div>
          </section>

          <InsightsSidebar
            report={report}
            roomActive={roomActive}
            onRun={runAt}
            onOpenHabit={() => selectView('leverage')}
          />
        </div>
      </div>
    </div>
  )
}

function Header({ report }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="font-plex text-[10.5px] tracking-[0.18em] text-teal-300">
          {report.ready ? report.eyebrow : 'YOUR DRAFTING, MEASURED'}
        </p>
        {/* The page's h1, and the only one. DraftLocker used to carry its own
            "Your Insights" above this panel; the handoff draws the heading as
            part of the panel's own header row, beside the KPI cards, so that
            one was removed rather than left to say the same two words twice
            an inch apart. */}
        <h1 className="mt-1.5 font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-white sm:text-[33px]">
          Your Insights
        </h1>
      </div>
      {/* Four cards that share whatever the heading leaves, and wrap when that
          is not enough. The handoff fixes each at 168px and never wraps, which
          is right at its own fixed 1480px and overflowed this panel by 34px at
          1560: the notes under the values are longer here because they name
          the real comparison ("the room's median is 186") rather than a sample
          one. `basis` rather than a min-width, so four unequal notes still
          produce four equal cards. */}
      {report.ready && (
        <div className="flex w-full min-w-0 flex-wrap gap-2.5 xl:max-w-[760px]">
          {report.kpis.map((k, i) => (
            <Kpi key={k.key} kpi={k} i={i} />
          ))}
        </div>
      )}
    </div>
  )
}
