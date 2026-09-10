import { useEffect, useRef, useState } from 'react'
import { SignInButton } from '@clerk/clerk-react'
import { useAccountUiReady } from '../../../hooks/useAccountUiReady.js'
import { useSignedIn } from '../../../hooks/useAuthState.js'
import { useLeagueFresh as useLeague } from '../stores.js'
import { scenariosFor, sublineOf } from '../../practiceScenarios.js'
import { LIVE_HASH, beginV2Draft, resumeV2Draft, setupProblem } from '../cockpit/flow.js'
import { ordinal } from '../v2data.js'
import { Arrow, GhostButton, Kicker, PosChip, Skeleton } from '../v2ui.jsx'
import DraftSettingsDrawer from './DraftSettingsDrawer.jsx'
import { Icon, safe, shortAgo, useDraftEngine, useHashFlag, useTwoTap } from './draftKit.jsx'

/* The Draft Room's launcher — production's DraftRoomEntry, in telemetry.

   ---- What this page is for, in order ----

   1. A draft you were in the middle of, when there is one. It leads the
      page because an unfinished draft is a more urgent ask than a new one —
      the same order the production list takes, promoted from a row to the
      top of the column.
   2. The next mock: what it will be (read off the one live `league`, never
      a second copy) and the one volt button that starts it.
   3. The settings that decide what it starts, one press away in a drawer.
   4. Draft with friends and four preset scenarios — other ways in.
   5. What you have already run, and what it adds up to (Your Insights).

   ---- What left, on purpose ----

   The Football / Basketball / Baseball chips. Two of three are locked and
   their only action is an early-access email form; on a page whose whole
   job is one button they are a roadmap teaser standing between the reader
   and it. The pipeline is NFL end to end and every number here says so.

   ---- Every row is real ----

   historyList(), inProgressSummary(), historyStats(), insightsReport() —
   the same engine reads the production launcher and the Locker make. A
   fresh visitor sees empty states that say so, never sample rows. */

const RECENT = 5
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt'

function clockLabel(s) {
  if (!s) return 'Off'
  return s >= 120 ? `${Math.round(s / 60)}m` : `${s}s`
}

/* The primary action. VoltButton's own look, with the two things this one
   needs that the shared primitive does not carry: a real disabled state
   (a refusal must not look pressable) and the data-start-draft hook the
   test suite anchors every Start button on. */
function StartButton({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      data-start-draft
      onClick={onClick}
      disabled={disabled}
      className={`group inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-[14px] px-5 text-[16px] font-semibold transition-transform duration-150 ${focusRing} focus-visible:ring-offset-2 focus-visible:ring-offset-v2-panel ${
        disabled
          ? 'cursor-not-allowed bg-white/[0.06] text-v2-ink3'
          : 'bg-v2-volt text-v2-voltInk shadow-[0_0_0_1px_rgba(0,255,102,0.35),0_10px_32px_-10px_rgba(0,255,102,0.6)] hover:-translate-y-px active:translate-y-0'
      }`}
    >
      {children}
    </button>
  )
}

function Problem({ text }) {
  if (!text) return null
  return (
    <p role="status" className="flex gap-2 rounded-[10px] bg-v2-loss/[0.08] px-3 py-2.5 text-[13px] leading-[1.5] text-v2-loss ring-1 ring-inset ring-v2-loss/25">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </p>
  )
}

function Resume({ summary, onResume, onDiscard, armed }) {
  const pct = summary.total ? Math.round((summary.made / summary.total) * 100) : 0
  return (
    <section aria-labelledby="v2-resume" className="rounded-[18px] bg-v2-panel p-4 ring-1 ring-inset ring-v2-warn/30 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-v2-warn" aria-hidden="true" />
            <Kicker tone="text-v2-warn">{summary.myTurn ? 'In progress · you are on the clock' : 'In progress'}</Kicker>
          </span>
          <h2 id="v2-resume" className="mt-1.5 font-telemetry text-[26px] font-bold uppercase italic leading-none text-v2-ink">
            {summary.teams}-team {summary.scoring}
          </h2>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-v2-ink2">
            Round {summary.round ?? '—'} · pick {summary.made + 1} of {summary.total} · you draft {summary.pickPosition}
            {summary.startedAt ? (shortAgo(summary.startedAt) === 'now' ? ' · started just now' : ` · started ${shortAgo(summary.startedAt)} ago`) : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            aria-label={armed ? 'Press again to discard this draft' : 'Discard this draft'}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-[11px] px-3 text-[13px] font-medium ring-1 ring-inset transition-colors ${focusRing} ${
              armed ? 'bg-v2-loss/[0.12] text-v2-loss ring-v2-loss/40' : 'text-v2-ink2 ring-white/[0.12] hover:text-v2-ink'
            }`}
          >
            <Icon name="trash" className="h-4 w-4" />
            {armed ? 'Press again' : 'Discard'}
          </button>
          <button
            type="button"
            onClick={onResume}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-[11px] bg-v2-ink px-4 text-[14px] font-semibold text-v2-ground transition-transform hover:-translate-y-px ${focusRing}`}
          >
            Resume <Arrow className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${summary.made} of ${summary.total} picks made`}>
        <span className="block h-full rounded-full bg-v2-warn/80" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      {summary.recentPicks && summary.recentPicks.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Kicker>Your roster so far</Kicker>
          {summary.recentPicks.map((p) => (
            <span key={p.name} className="flex items-center gap-1.5">
              <PosChip pos={p.pos} />
              <span className="text-[12px] text-v2-ink2">{p.name}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

function ShapeCell({ label, value, sub }) {
  return (
    <div className="min-w-0 rounded-[12px] bg-v2-inset px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]">
      <dt><Kicker>{label}</Kicker></dt>
      <dd className="mt-1.5 font-telemetry text-[30px] font-bold leading-none tabular-nums text-v2-ink sm:text-[36px]">{value}</dd>
      {sub && <dd className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">{sub}</dd>}
    </div>
  )
}

function Launch({ engine, ready, roomActive, problem, startProblem, onStart, onSettings }) {
  const league = ready ? safe(() => engine.league()) : null
  if (!league) {
    return <div className="rounded-[18px] bg-v2-panel p-5 ring-1 ring-inset ring-white/[0.07]"><Skeleton lines={5} /></div>
  }
  const names = safe(() => engine.scoringNames(), {})
  const types = safe(() => engine.draftTypes(), [])
  const type = types.find((t) => t.key === league.draftType)
  const seat = safe(() => engine.mySlot(), 0) + 1
  const clock = safe(() => engine.clockLength(), 60)
  /* The line under the numerals is what the numerals do not already say:
     the starting lineup, off engine.lineup(), plus whatever settingsText()
     names past its first three facts — shapeExtras(), the non-default
     settings (linear, rookies-only, no CPU autopick) that a reader would
     otherwise sit inside without knowing. */
  const lu = safe(() => engine.lineup())
  const slots = []
  if (lu) {
    for (const pos of ['QB', 'RB', 'WR', 'TE']) if (lu.starters[pos]) slots.push(lu.starters[pos] > 1 ? `${lu.starters[pos]} ${pos}` : pos)
    if (lu.flex) slots.push(lu.flex > 1 ? `${lu.flex} FLEX` : 'FLEX')
    if (lu.superflex) slots.push('SFLEX')
    for (const pos of ['K', 'DST']) if (lu.starters[pos]) slots.push(pos)
    if (lu.bench) slots.push(`${lu.bench} BN`)
  }
  const extras = safe(() => engine.settingsText(league), '').split(' · ').slice(3)
  const summary = [...slots, ...extras].join(' · ')
  const shown = startProblem || problem

  return (
    <section aria-labelledby="v2-launch" className="rounded-[18px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07] sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Kicker>Your next mock</Kicker>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink2">
          {names[league.scoring] || league.scoring}{type ? ` · ${type.label}` : ''}{league.thirdRoundReversal && league.draftType === 'snake' ? ' · 3RR' : ''}
        </span>
      </div>
      <h2 id="v2-launch" className="sr-only">Your next mock draft</h2>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ShapeCell label="Teams" value={league.teams} sub={`${Math.max(0, league.teams - 1)} CPU`} />
        <ShapeCell label="Rounds" value={league.rounds} sub={`${league.teams * league.rounds} picks`} />
        <ShapeCell label="Your seat" value={seat} sub={ordinal(seat) + ' pick'} />
        <ShapeCell label="Clock" value={clockLabel(clock)} sub={clock ? 'per pick' : 'no limit'} />
      </dl>
      <p className="mt-3 truncate font-mono text-[11px] uppercase tracking-[0.08em] text-v2-ink3" title={summary}>{summary}</p>

      <div className="mt-4 space-y-3">
        {roomActive ? (
          /* In a room the Start button is the room's, not this page's — the
             room decides when a shared draft begins. The honest route is the
             production room screen that owns it. */
          <a
            href="#/rooms/draft?friends=1"
            className={`group inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-v2-volt px-5 text-[16px] font-semibold text-v2-voltInk shadow-[0_0_0_1px_rgba(0,255,102,0.35),0_10px_32px_-10px_rgba(0,255,102,0.6)] ${focusRing}`}
          >
            Open your draft room <Arrow className="h-4 w-4" />
          </a>
        ) : (
          <StartButton onClick={onStart} disabled={!!problem}>
            <Icon name="play" className="h-5 w-5" />
            Start mock draft
            <Arrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </StartButton>
        )}
        <Problem text={shown} />
        <div className="grid grid-cols-2 gap-2">
          <GhostButton onClick={onSettings} className="w-full !min-h-[44px]">
            <Icon name="gear" className="h-4 w-4" /> Draft settings
          </GhostButton>
          <GhostButton href="#/v2/insights" className="w-full !min-h-[44px]">
            <Icon name="chart" className="h-4 w-4" /> Your insights
          </GhostButton>
        </div>
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-v2-ink3">
          {roomActive ? 'A room fixes the league for every seat' : 'No account needed · runs in your browser'}
        </p>
      </div>
    </section>
  )
}

function Friends({ flagged, roomActive }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!flagged || !ref.current) return
    ref.current.scrollIntoView({ block: 'center' })
    ref.current.focus({ preventScroll: true })
  }, [flagged])
  return (
    <a
      ref={ref}
      href="#/rooms/draft?friends=1"
      data-friends-link
      className={`group flex items-center gap-3 rounded-[14px] px-4 py-3.5 transition-colors ${focusRing} ${
        flagged
          ? 'bg-v2-cyan/[0.08] ring-2 ring-inset ring-v2-cyan/60'
          : 'bg-v2-panel ring-1 ring-inset ring-white/[0.07] hover:ring-white/[0.18]'
      }`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-white/[0.04] text-v2-cyan ring-1 ring-inset ring-white/[0.08]">
        <Icon name="users" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        {flagged && <Kicker tone="text-v2-cyan" className="block">You came here for this</Kicker>}
        <span className="block text-[15px] font-semibold text-v2-ink">
          {roomActive ? 'Your draft room — invite or enter' : 'Draft with friends'}
        </span>
        <span className="block text-[12px] leading-[1.45] text-v2-ink2">
          One board, real managers. Opens the current Draft Room, which runs the invite and the shared clock.
        </span>
      </span>
      <Arrow className="h-4 w-4 shrink-0 text-v2-ink2 transition-transform group-hover:translate-x-0.5" />
    </a>
  )
}

/* The four preset drafts. practiceScenarios.js decides which four — guest
   presets, or four built from real history once a signed-in manager has
   three graded mocks — and engine.startScenario() is what turns a card
   into a draft. This only draws them. */
function Scenarios({ engine, ready, tick, roomActive }) {
  const signedIn = useSignedIn()
  const accountsReady = useAccountUiReady()
  const { league: connected } = useLeague()
  const [data, setData] = useState(null)
  const [launching, setLaunching] = useState(null)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    if (!engine || !ready) return
    try {
      setData(scenariosFor({
        signedIn,
        league: engine.league(),
        history: engine.historyList() || [],
        stats: engine.historyStats() || {},
        connectedLeague: connected,
      }))
    } catch { setData(null) }
  }, [engine, ready, tick, signedIn, connected])

  if (!data) return null

  const launch = (s) => {
    setProblem('')
    if (roomActive) { setProblem('Scenarios are for solo mocks. Leave the room to run one.'); return }
    setLaunching(s.id)
    const r = safe(() => engine.startScenario(s))
    if (!r || r.ok !== true) {
      setLaunching(null)
      setProblem((r && r.problem) || 'That scenario could not be started.')
      return
    }
    location.hash = LIVE_HASH
  }

  return (
    <section aria-labelledby="v2-scen">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="v2-scen"><Kicker tone="text-v2-ink2">Practice a scenario</Kicker></h2>
        <span className="text-[12px] text-v2-ink3">{data.rightLabel}</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2">
        {data.scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            data-practice-scenario={s.id}
            disabled={!!launching}
            onClick={() => launch(s)}
            className={`group relative flex min-h-[104px] flex-col gap-1.5 overflow-hidden rounded-[14px] bg-v2-panel p-4 text-left ring-1 ring-inset ring-white/[0.07] transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:ring-white/[0.18] ${focusRing} disabled:cursor-wait`}
          >
            {/* The card's own accent, from practiceScenarios.js — a rule down
                the edge rather than a fill, so four hues do not become four
                competing surfaces. */}
            <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: s.accent }} aria-hidden="true" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: launching === s.id ? undefined : s.accent }}>
              {launching === s.id ? <span className="text-v2-ink2">Starting…</span> : s.eyebrow}
            </span>
            <span className="font-telemetry text-[22px] font-bold uppercase italic leading-[0.95] text-v2-ink">{s.title}</span>
            <span className="text-[12px] leading-[1.45] text-v2-ink2">{sublineOf(s)}</span>
            <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[12px] font-medium text-v2-ink2 group-hover:text-v2-ink">
              Start this draft <Arrow className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </div>
      {problem && <div className="mt-3"><Problem text={problem} /></div>}
      <p className="mt-3 text-center text-[12px] text-v2-ink3">
        {data.derived || signedIn ? data.footer : (
          <>
            {accountsReady ? (
              <SignInButton mode="modal">
                <button type="button" className={`font-semibold text-v2-ink underline decoration-white/30 underline-offset-2 hover:decoration-white ${focusRing}`}>Sign in</button>
              </SignInButton>
            ) : <span className="font-semibold text-v2-ink">Sign in</span>}
            {' to save results and get scenarios built from your drafts'}
          </>
        )}
      </p>
    </section>
  )
}

function Recent({ history, inProgress, onDelete }) {
  const { armed, press } = useTwoTap()
  return (
    <section aria-labelledby="v2-recent" className="overflow-hidden rounded-[18px] bg-v2-panel ring-1 ring-inset ring-white/[0.07]">
      <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
        <h2 id="v2-recent"><Kicker tone="text-v2-ink2">Your mock drafts</Kicker></h2>
        <span className="font-mono text-[11px] tabular-nums text-v2-ink3">{history.length} finished</span>
      </div>
      {!history.length ? (
        <p className="px-5 py-8 text-center text-[14px] leading-[1.55] text-v2-ink2">
          {inProgress
            ? 'Nothing finished yet — the draft above lands here, graded, the moment its last pick is in.'
            : 'No mocks yet. Start one — it runs entirely in your browser and is graded the moment it ends.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-white/[0.05]">
            {history.slice(0, RECENT).map((e) => (
              <li key={e.id} className="flex items-center gap-1 pr-2">
                <a
                  href={`#/v2/draft/report?id=${encodeURIComponent(e.id)}`}
                  className={`grid min-w-0 flex-1 grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025] sm:px-5 ${focusRing}`}
                >
                  <span className="font-telemetry text-[30px] font-bold italic leading-none text-v2-ink">{e.grade || '—'}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-v2-ink">
                      {e.rank ? `${e.projectedRank} of ${e.teams}` : 'Not graded'}
                      <span className="font-normal text-v2-ink2"> · {e.leagueType}</span>
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">Seat {e.seat}</span>
                      {e.round1Pick && (
                        <>
                          <span className="text-v2-ink3" aria-hidden="true">·</span>
                          {e.round1PickPos && <PosChip pos={e.round1PickPos} className="shrink-0" />}
                          <span className="truncate text-[12px] text-v2-ink2">{e.round1Pick}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-v2-ink3">{shortAgo(e.completedAt)}</span>
                </a>
                <button
                  type="button"
                  onClick={() => press(e.id, () => onDelete(e.id))}
                  aria-label={armed === e.id ? 'Press again to delete this draft' : 'Delete this draft'}
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] transition-colors ${focusRing} ${
                    armed === e.id ? 'bg-v2-loss/[0.12] text-v2-loss' : 'text-v2-ink3 hover:text-v2-ink'
                  }`}
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {armed && (
            <p className="border-t border-white/[0.05] px-5 py-2 text-[12px] text-v2-loss" role="status">Press the bin again to delete that draft for good.</p>
          )}
          {history.length > RECENT && (
            <a
              href="#/v2/drafts"
              className={`flex min-h-[48px] items-center justify-center gap-1.5 border-t border-white/[0.06] text-[13px] font-medium text-v2-ink hover:bg-white/[0.03] ${focusRing}`}
            >
              See all {history.length} drafts <Arrow className="h-3.5 w-3.5" />
            </a>
          )}
        </>
      )}
    </section>
  )
}

/* What the locker adds up to, as a door into Your Insights. It reads the
   same insightsReport() that page draws — one number off it when there is
   enough history, and the honest count of how far off that is when not. */
function InsightsTeaser({ engine, ready }) {
  const report = ready ? safe(() => engine.insightsReport()) : null
  const kpi = report && report.ready ? report.kpis.find((k) => k.key === 'value') : null
  return (
    <a
      href="#/v2/insights"
      className={`group block rounded-[18px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07] transition-colors hover:ring-white/[0.18] sm:p-5 ${focusRing}`}
    >
      <div className="flex items-center justify-between gap-3">
        <Kicker tone="text-v2-ink2">Your insights</Kicker>
        <Icon name="chart" className="h-4 w-4 text-v2-ink3" />
      </div>
      {!report ? (
        <div className="mt-3"><Skeleton lines={2} /></div>
      ) : kpi ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-telemetry text-[44px] font-bold leading-none tabular-nums text-v2-ink">{kpi.value}</span>
            {kpi.delta && (
              <span className={`font-mono text-[12px] tabular-nums ${kpi.tone === 'good' ? 'text-v2-volt' : kpi.tone === 'bad' ? 'text-v2-loss' : 'text-v2-ink2'}`}>{kpi.delta}</span>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-[1.5] text-v2-ink2">
            Points of starter value you leave on the board per draft, over your last {report.mocks} mocks.
          </p>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-1.5" role="img" aria-label={`${report.mocks || 0} of ${report.minMocks} mocks logged`}>
            {Array.from({ length: report.minMocks || 5 }, (_, i) => (
              <span key={i} className={`h-2 w-6 rounded-full ${i < (report.mocks || 0) ? 'bg-v2-cyan' : 'bg-white/[0.08]'}`} />
            ))}
            <span className="ml-2 font-mono text-[11px] tabular-nums text-v2-ink3">{report.mocks || 0} of {report.minMocks}</span>
          </div>
          <p className="mt-2 text-[13px] leading-[1.5] text-v2-ink2">
            {report.reason === 'loading'
              ? 'Reading your board.'
              : `Run ${Math.max(0, report.minMocks - (report.mocks || 0))} more and Juke starts auditing what each draft left on the board.`}
          </p>
        </>
      )}
      <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-v2-ink">
        Open Your Insights <Arrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  )
}

export default function V2DraftEntry() {
  const { engine, ready, tick, bump } = useDraftEngine()
  const friends = useHashFlag('friends')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [startProblem, setStartProblem] = useState('')
  const [resumeProblem, setResumeProblem] = useState('')
  const [history, setHistory] = useState([])
  const discard = useTwoTap()

  /* `tick` is load-bearing, for DraftRoomEntry's own reason: a history row's
     round-one position is resolved against the LIVE board, which is empty
     until the deferred players.js lands. Read once on mount, every row would
     draw a dash where its position belongs. */
  useEffect(() => {
    if (!engine) return
    setHistory(safe(() => engine.historyList(), []) || [])
  }, [engine, tick])

  const problem = ready ? safe(() => engine.setupProblem(), '') : ''
  const inProgress = ready ? safe(() => engine.inProgressSummary()) : null
  const roomActive = !!(engine && safe(() => engine.hasRoom(), false))

  // A refusal is about the league as it was when Start was pressed; once the
  // league moves, the sentence on screen should be setupProblem()'s current
  // one, not a stale copy of it.
  useEffect(() => { setStartProblem('') }, [tick])

  const start = () => {
    setStartProblem('')
    const ok = beginV2Draft({ mySlot: safe(() => engine.mySlot(), 0), clockLength: safe(() => engine.clockLength(), 60) })
    if (!ok) setStartProblem(setupProblem() || 'The draft could not be started.')
  }

  const resume = () => {
    setResumeProblem('')
    if (!resumeV2Draft()) setResumeProblem('That draft could not be resumed — the player list has changed since it was saved.')
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <a href="#/v2/rooms" className={`-ml-1 inline-flex w-fit items-center gap-1 rounded-[8px] px-1 py-1 text-[13px] font-medium text-v2-ink2 hover:text-v2-ink ${focusRing}`}>
          <Icon name="chevLeft" className="h-4 w-4" /> Rooms
        </a>
        <div className="max-w-[760px]">
          <Kicker tone="text-v2-ink2">The Draft Room · mock drafts</Kicker>
          <h1 className="mt-3 font-telemetry text-[clamp(2.8rem,6vw,5rem)] font-extrabold uppercase italic leading-[0.88] text-v2-ink">
            Draft against tonight&apos;s board.
          </h1>
          <p className="mt-4 max-w-[60ch] text-[16px] leading-[1.55] text-v2-ink2">
            A full mock against CPU managers drafting off real ADP. It runs in your browser, needs no account,
            and is graded the moment the last pick is in.
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {inProgress && (
            <>
              <Resume
                summary={inProgress}
                onResume={resume}
                armed={discard.armed === 'save'}
                onDiscard={() => discard.press('save', () => { engine.restart(); bump() })}
              />
              <Problem text={resumeProblem} />
            </>
          )}
          <Launch
            engine={engine}
            ready={ready}
            roomActive={roomActive}
            problem={problem}
            startProblem={startProblem}
            onStart={start}
            onSettings={() => setSettingsOpen(true)}
          />
          <Friends flagged={friends} roomActive={roomActive} />
          <div className="mt-2">
            <Scenarios engine={engine} ready={ready} tick={tick} roomActive={roomActive} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Recent
            history={history}
            inProgress={inProgress}
            onDelete={(id) => { engine.deleteHistoryDraft(id); bump() }}
          />
          <InsightsTeaser engine={engine} ready={ready} />
        </div>
      </div>

      <DraftSettingsDrawer open={settingsOpen} engine={engine} onClose={() => setSettingsOpen(false)} onChange={bump} />
    </>
  )
}
