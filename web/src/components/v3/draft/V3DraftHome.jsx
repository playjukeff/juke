import { useEffect, useState } from 'react'
import { SignInButton } from '@clerk/clerk-react'
import { useAccountUiReady } from '../../../hooks/useAccountUiReady.js'
import { useSignedIn } from '../../../hooks/useAuthState.js'
import { useLeagueFresh } from '../../v2/stores.js'
import { scenariosFor, sublineOf } from '../../practiceScenarios.js'
import { safe, shortAgo, useDraftEngine, useTwoTap } from '../../v2/draft/draftKit.jsx'
import { CallButton, GoLink, Headline, Icon, Label, PageHead, PosTag, QuietButton, Sheet, Skeleton, ValueBar, cx, ordinal , HIT } from '../ui.jsx'
import { INSIGHTS_HASH, RECORD_HASH, begin, resume, setupProblem, startScenario } from './flow.js'
import { FOCUS, Glyph, Problem } from './kit.jsx'
import { cleanCode, codeOf, createRoom, joinRoom, roomHref } from './live/room.js'
import SettingsDrawer from './SettingsDrawer.jsx'
import { CountText, LIFT, StreamText } from '../motion.jsx'

/* Draft — v3's launcher for a mock draft.

   ---- The order of the sheet ----

   1. A draft you were in the middle of, when there is one. An unfinished
      draft is a more urgent ask than a new one, so it leads.
   2. The next mock: its shape, read off the one live `league`, and the one
      cobalt Start. A setupProblem() answer disables Start and prints its
      sentence beside it — a refusal is only as good as the reason it gives.
   3. The settings behind that shape, in a drawer (every production control).
   4. Other ways in: draft with friends — create a room or join one by code
      or link, both through the engine's own doors — and four practice
      scenarios through engine.startScenario().
   5. What you have run: five recent drafts, and what they add up to.

   Every row is real — historyList(), inProgressSummary(), historyStats(),
   insightsReport(). A fresh visitor sees empty states that say so. */

const RECENT = 5

function clockLabel(s) {
  if (!s) return 'Off'
  return s >= 120 ? `${Math.round(s / 60)}m` : `${s}s`
}

function InProgress({ summary, onResume, onDiscard, armed, problem }) {
  const pct = summary.total ? summary.made / summary.total : 0
  const ago = summary.startedAt ? shortAgo(summary.startedAt) : ''
  return (
    <Sheet code={summary.myTurn ? 'In progress · you are on the clock' : 'In progress'} aside={`Round ${summary.round ?? '—'} of ${summary.rounds}`} aria-labelledby="v3-resume">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Headline as="h2" size="block" id="v3-resume">{summary.teams}-team {summary.scoring}</Headline>
          <p className="mt-1.5 font-figure text-[13px] text-v3-ink2">
            Pick {summary.made + 1} of {summary.total} · you draft {summary.pickPosition}
            {ago ? (ago === 'now' ? ' · started just now' : ` · started ${ago} ago`) : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            aria-label={armed ? 'Press again to discard this draft' : 'Discard this draft'}
            className={cx('inline-flex min-h-[44px] items-center gap-1.5 rounded-[6px] border px-3.5 text-[15px] font-semibold transition-colors', FOCUS, armed ? 'border-v3-warn bg-v3-warnWash text-v3-warn' : 'border-v3-rule bg-v3-sheet text-v3-ink2 hover:text-v3-ink')}
          >
            <Glyph name="trash" className="h-4 w-4" /> {armed ? 'Press again to discard' : 'Discard'}
          </button>
          <QuietButton onClick={onResume} className="border-v3-ink">Resume <Icon name="arrow" className="h-4 w-4" /></QuietButton>
        </div>
      </div>
      <div className="mt-4" role="img" aria-label={`${summary.made} of ${summary.total} picks made`}>
        <ValueBar value={Math.max(0.02, pct)} max={1} tone="neutral" />
      </div>
      {summary.recentPicks && summary.recentPicks.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Label>Your roster so far</Label>
          {summary.recentPicks.map((p) => (
            <span key={p.name} className="flex items-center gap-1.5"><PosTag pos={p.pos} /><span className="text-[15px] text-v3-ink2">{p.name}</span></span>
          ))}
        </div>
      )}
      {problem && <Problem className="mt-3" text={problem} />}
    </Sheet>
  )
}

function NextMock({ engine, ready, roomActive, problem, startProblem, onStart, onSettings }) {
  const league = ready ? safe(() => engine.league()) : null
  if (!league) return <Sheet code="The next mock"><Skeleton lines={5} /></Sheet>
  const names = safe(() => engine.scoringNames(), {})
  const types = safe(() => engine.draftTypes(), [])
  const type = types.find((t) => t.key === league.draftType)
  const seat = safe(() => engine.mySlot(), 0) + 1
  const clock = safe(() => engine.clockLength(), 60)
  /* The line under the figures is what the figures do not already say: the
     starting lineup, off engine.lineup(), plus whatever settingsText() names
     past its first three facts — the non-default settings a reader would
     otherwise sit inside without knowing. */
  const lu = safe(() => engine.lineup())
  const slots = []
  if (lu) {
    for (const pos of ['QB', 'RB', 'WR', 'TE']) if (lu.starters[pos]) slots.push(lu.starters[pos] > 1 ? `${lu.starters[pos]} ${pos}` : pos)
    if (lu.flex) slots.push(lu.flex > 1 ? `${lu.flex} FLEX` : 'FLEX')
    if (lu.superflex) slots.push('SFLEX')
    for (const pos of ['K', 'DST']) if (lu.starters[pos]) slots.push(pos === 'DST' ? 'D/ST' : pos)
    if (lu.bench) slots.push(`${lu.bench} BN`)
  }
  const extras = safe(() => engine.settingsText(league), '').split(' · ').slice(3)
  const shown = startProblem || problem
  const aside = `${type ? type.label : league.draftType}${league.thirdRoundReversal && league.draftType === 'snake' ? ' · 3RR' : ''}`
  const title = league.name || `${league.teams}-team ${names[league.scoring] || league.scoring}`

  return (
    <Sheet code="The next mock" aside={aside} aria-labelledby="v3-launch">
      <Headline as="h2" size="block" id="v3-launch">{title}</Headline>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Teams', league.teams, `${Math.max(0, league.teams - 1)} CPU`],
          ['Rounds', league.rounds, `${league.teams * league.rounds} picks`],
          ['Your seat', ordinal(seat), 'pick in round 1'],
          ['Clock', clockLabel(clock), clock ? 'per pick' : 'no limit'],
        ].map(([k, v, sub]) => (
          <div key={k} className="min-w-0 rounded-[4px] bg-v3-paper p-3">
            <dt><Label className="text-[12px]">{k}</Label></dt>
            <dd className="mt-1 font-figure text-[28px] font-bold leading-none tabular-nums text-v3-ink">{v}</dd>
            <dd className="mt-1 truncate font-figure text-[12px] text-v3-ink3">{sub}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 font-figure text-[13px] leading-[1.5] text-v3-ink2">
        <span className="text-v3-ink3">Starts </span>{[...slots, ...extras].join(' · ')}
      </p>

      <div className="mt-5 flex flex-col gap-3">
        {roomActive ? (
          /* In a room the Start button is the room's: a shared draft begins
             when the host says so and everybody moves on the broadcast, so
             this is a way back to the room rather than a second Start. */
          <CallButton href={roomHref(codeOf(engine))} className="w-full sm:w-auto sm:self-start">Open your draft room <Icon name="arrow" className="h-4 w-4" /></CallButton>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <CallButton data-start-draft onClick={onStart} disabled={!!problem} className="min-h-[52px] w-full px-7 text-[15px] sm:w-auto">
              <Glyph name="play" className="h-4 w-4" filled /> Start mock draft
            </CallButton>
            {shown && <Problem text={shown} className="flex-1" />}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <QuietButton onClick={onSettings}><Glyph name="gear" className="h-4 w-4" /> Draft settings</QuietButton>
          <GoLink href={INSIGHTS_HASH}>Your insights</GoLink>
        </div>
        <p className="text-[12px] text-v3-ink3">
          {roomActive ? 'A room fixes the league for every seat.' : 'No account needed · runs in your browser · graded the moment it ends'}
        </p>
      </div>
    </Sheet>
  )
}

/* Draft with friends: make a room, or walk into one.

   Both buttons go through the engine's own doors — engine.createRoom() and
   engine.joinRoomByCode(), the exact calls the classic lobby presses, which
   are also the only ones that register app.js's own room handler. This page
   adds no protocol and holds no socket; it navigates, and the room screen
   draws whatever the room broadcasts.

   Creating can be refused: setupProblem() answers for a league the board
   cannot seat, and createRoom() returns null rather than a room nobody can
   draft in. The sentence is said here, beside the button, because a refusal
   is only as good as the reason it gives. */
function Friends({ engine, roomActive }) {
  const [code, setCode] = useState('')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  const create = () => {
    setProblem('')
    setBusy(true)
    const made = createRoom(engine)
    if (!made) { setBusy(false); setProblem(setupProblem() || 'That room could not be created. Check the league settings and try again.') }
  }
  const join = (e) => {
    e.preventDefault()
    setProblem('')
    if (!cleanCode(code)) { setProblem('That is not a room code. Paste the whole invite link, or the eight characters from it.'); return }
    setBusy(true)
    if (!joinRoom(engine, code)) { setBusy(false); setProblem('That room could not be joined.') }
  }

  if (roomActive) {
    return (
      <Sheet code="Draft with friends" aside="You are in a room">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Glyph name="users" className="mt-0.5 h-6 w-6 shrink-0 text-v3-ink" />
            <p className="min-w-0 max-w-[52ch] text-[15px] leading-[1.5] text-v3-ink2">
              Your room is open. Its seats, its invite and its chat are all on the room screen — and the league is the room's while you are in it.
            </p>
          </div>
          <QuietButton href={roomHref(codeOf(engine))} className="shrink-0">Back to the room <Icon name="arrow" className="h-4 w-4" /></QuietButton>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet code="Draft with friends" aside="Real managers">
      <div className="flex items-start gap-3">
        <Glyph name="users" className="mt-0.5 h-6 w-6 shrink-0 text-v3-ink" />
        <p className="min-w-0 max-w-[56ch] text-[15px] leading-[1.5] text-v3-ink2">
          One board, one clock, and a chair for everybody who turns up. Empty chairs draft as CPUs, so a room of three still runs a full ten-team draft.
        </p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          {/* Ink, not cobalt. "Start mock draft" is this page's one primary
              action and the rule is one per view — the same second rank the
              in-progress card's Resume already takes on this screen, rather
              than a second call-to-action arguing with the first. */}
          <QuietButton onClick={create} data-create-room className="w-full border-v3-ink">
            <Glyph name="plus" className="h-4 w-4" /> {busy ? 'Opening the room…' : 'Create a room'}
          </QuietButton>
          <p className="mt-2 text-[13px] leading-[1.5] text-v3-ink3">Your league, your clock. You get a link to send.</p>
        </div>
        <form onSubmit={join}>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="v3-join-code">Room code or invite link</label>
            <input
              id="v3-join-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code or link"
              autoComplete="off"
              spellCheck={false}
              className={cx('min-h-[44px] min-w-0 flex-1 rounded-[4px] border border-v3-rule bg-v3-paper px-3 font-figure text-[16px] uppercase tracking-[0.08em] text-v3-ink placeholder:normal-case placeholder:tracking-normal placeholder:text-v3-ink3', FOCUS)}
            />
            <QuietButton onClick={join} data-join-room className="shrink-0 px-4">Join</QuietButton>
          </div>
          <p className="mt-2 text-[13px] leading-[1.5] text-v3-ink3">Somebody sent you a link? Open it, or paste it here.</p>
        </form>
      </div>
      {problem && <Problem className="mt-3" text={problem} />}
    </Sheet>
  )
}

/* The four preset drafts. practiceScenarios.js decides which four — guest
   presets, or four built from real history once a signed-in manager has
   three graded mocks — and engine.startScenario() turns a card into a
   draft. This only draws them. */
function Scenarios({ engine, ready, tick, roomActive }) {
  const signedIn = useSignedIn()
  const accountsReady = useAccountUiReady()
  const { league: connected } = useLeagueFresh()
  const [data, setData] = useState(null)
  const [launching, setLaunching] = useState(null)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    if (!engine || !ready) return
    try {
      setData(scenariosFor({ signedIn, league: engine.league(), history: engine.historyList() || [], stats: engine.historyStats() || {}, connectedLeague: connected }))
    } catch { setData(null) }
  }, [engine, ready, tick, signedIn, connected])

  if (!data) return null

  const launch = (s) => {
    setProblem('')
    setLaunching(s.id)
    const r = startScenario(s)
    if (!r.ok) { setLaunching(null); setProblem(r.problem) }
  }

  return (
    <Sheet code="Practice a scenario" aside="4 presets">
      <p className="mb-3 text-[15px] text-v3-ink2">{data.rightLabel}. Each card starts a real mock with its settings already chosen — they become your league.</p>
      <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2">
        {data.scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            data-practice-scenario={s.id}
            data-rise=""
            disabled={!!launching || roomActive}
            onClick={() => launch(s)}
            className={cx('group flex min-h-[112px] flex-col gap-1 rounded-[4px] border border-v3-rule bg-v3-sheet p-4 text-left hover:border-v3-ink disabled:cursor-not-allowed disabled:bg-v3-paper', LIFT, FOCUS)}
          >
            <Label className="text-[12px]">{launching === s.id ? 'Starting…' : s.eyebrow}</Label>
            <span className="text-[18px] font-extrabold leading-tight tracking-[-0.01em] text-v3-ink">{s.title}</span>
            <span className="text-[13px] leading-[1.45] text-v3-ink2">{sublineOf(s)}</span>
            <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[13px] font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4 group-hover:decoration-v3-ink">
              Start this draft <Icon name="arrow" className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </div>
      {roomActive && <Problem className="mt-3" text="Scenarios are for solo mocks. Leave the room to run one." />}
      {problem && <Problem className="mt-3" text={problem} />}
      <p className="mt-3 text-[13px] text-v3-ink2">
        {data.derived || signedIn ? data.footer : (
          <>
            {accountsReady ? (
              <SignInButton mode="modal">
                <button type="button" className={cx(HIT, 'font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink', FOCUS)}>Sign in</button>
              </SignInButton>
            ) : <a href="#/account" className={cx(HIT, 'font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4')}>Sign in</a>}
            {' to save results and get scenarios built from your drafts.'}
          </>
        )}
      </p>
    </Sheet>
  )
}

function Recent({ history, inProgress, onDelete }) {
  const { armed, press } = useTwoTap()
  return (
    <Sheet code="Recent drafts" aside={`${history.length} finished`} bodyClass="p-0">
      {!history.length ? (
        <p className="px-5 py-8 text-center text-[15px] leading-[1.55] text-v3-ink2">
          {inProgress
            ? 'Nothing finished yet — the draft above lands here, graded, the moment its last pick is in.'
            : 'No mocks yet. Start one — it runs in your browser and is graded the moment it ends.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-v3-rule">
            {history.slice(0, RECENT).map((e) => (
              <li key={e.id} data-rise="" className="flex items-center gap-1 pr-2">
                <a href={`#/draft/report?id=${encodeURIComponent(e.id)}`} className={cx('grid min-w-0 flex-1 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-v3-paper sm:px-5', FOCUS)}>
                  <span className="font-sheet text-[28px] font-black leading-none tracking-[-0.03em] text-v3-ink">{e.grade || '—'}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-v3-ink">
                      {e.rank ? `${e.projectedRank} of ${e.teams}` : 'Not graded'}
                      <span className="font-normal text-v3-ink2"> · {e.leagueType}</span>
                    </span>
                    <span className="mt-1 flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 font-figure text-[12px] uppercase tracking-[0.08em] text-v3-ink3">Seat {e.seat}</span>
                      {e.round1Pick && (
                        <>
                          <span className="text-v3-ink3" aria-hidden="true">·</span>
                          {e.round1PickPos && <PosTag pos={e.round1PickPos} />}
                          <span className="truncate text-[13px] text-v3-ink2">{e.round1Pick}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="font-figure text-[12px] tabular-nums text-v3-ink3">{shortAgo(e.completedAt)}</span>
                </a>
                <button
                  type="button"
                  onClick={() => press(e.id, () => onDelete(e.id))}
                  aria-label={armed === e.id ? 'Press again to delete this draft' : 'Delete this draft'}
                  className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[4px] transition-colors', FOCUS, armed === e.id ? 'bg-v3-warnWash text-v3-warn' : 'text-v3-ink3 hover:text-v3-ink')}
                >
                  <Glyph name="trash" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {armed && <p role="status" className="border-t border-v3-rule px-5 py-2 text-[13px] text-v3-warn">Press the bin again to delete that draft for good.</p>}
          <div className="border-t border-v3-rule px-5 py-3">
            <GoLink href={RECORD_HASH}>{history.length > RECENT ? `See all ${history.length} in your record` : 'See them in your record'}</GoLink>
          </div>
        </>
      )}
    </Sheet>
  )
}

/* What the locker adds up to, as a door into Your Insights. The same
   insightsReport() that page draws — one number when there is enough
   history, the honest count of how far off that is when not. */
function InsightsTeaser({ engine, ready }) {
  const report = ready ? safe(() => engine.insightsReport()) : null
  const kpi = report && report.ready ? report.kpis.find((k) => k.key === 'value') : null
  const want = (report && report.minMocks) || 5
  const have = (report && report.mocks) || 0
  return (
    <Sheet code="Your insights" aside={report && report.ready ? `Last ${report.mocks} mocks` : 'Needs five mocks'}>
      {!report ? <Skeleton lines={2} /> : kpi ? (
        <>
          <div className="flex items-baseline gap-2">
            <CountText text={kpi.value} className="font-figure text-[40px] font-bold leading-none tabular-nums text-v3-ink" />
            {kpi.delta && <span className="font-figure text-[13px] text-v3-ink2">{kpi.delta}</span>}
          </div>
          <StreamText as="p" text="Points of starter value you leave on the board per draft." className="mt-1.5 text-[15px] leading-[1.5] text-v3-ink2" />
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5" role="img" aria-label={`${have} of ${want} mocks logged`}>
            {Array.from({ length: want }, (_, i) => (
              <span key={i} className={cx('h-2 w-7 rounded-full', i < have ? 'bg-v3-band' : 'bg-v3-well')} />
            ))}
            <span className="ml-2 font-figure text-[13px] tabular-nums text-v3-ink2">{have} of {want}</span>
          </div>
          <p className="mt-2 text-[15px] leading-[1.5] text-v3-ink2">
            {report.reason === 'loading' ? 'Reading your board.' : `Run ${Math.max(0, want - have)} more and Juke starts auditing what each draft left on the board.`}
          </p>
        </>
      )}
      <div className="mt-4"><GoLink href={INSIGHTS_HASH}>Open your insights</GoLink></div>
    </Sheet>
  )
}

export default function V3DraftHome() {
  const { engine, ready, tick, bump } = useDraftEngine()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [startProblem, setStartProblem] = useState('')
  const [resumeProblem, setResumeProblem] = useState('')
  const [history, setHistory] = useState([])
  const discard = useTwoTap()

  /* `tick` is load-bearing: a history row's round-one position resolves
     against the LIVE board, which is empty until the deferred players.js
     lands. Read once on mount, every row draws a dash where its position
     belongs (DraftRoomEntry's own finding). */
  useEffect(() => {
    if (!engine) return
    setHistory(safe(() => engine.historyList(), []) || [])
  }, [engine, tick])

  // A refusal is about the league when Start was pressed; once the league
  // moves, the sentence should be setupProblem()'s current one.
  useEffect(() => { setStartProblem('') }, [tick])

  const problem = ready ? safe(() => engine.setupProblem(), '') : ''
  const inProgress = ready ? safe(() => engine.inProgressSummary()) : null
  const roomActive = !!(engine && safe(() => engine.hasRoom(), false))

  const start = () => {
    setStartProblem('')
    const ok = begin({ mySlot: safe(() => engine.mySlot(), 0), clockLength: safe(() => engine.clockLength(), 60) })
    if (!ok) setStartProblem(setupProblem() || 'The draft could not be started.')
  }
  const doResume = () => {
    setResumeProblem('')
    if (!resume()) setResumeProblem('That draft could not be resumed — the player list has changed since it was saved.')
  }

  return (
    <div className="grid grid-cols-1 gap-section">
      <PageHead
        title="Draft against tonight's board."
        lede="A full mock against CPU managers drafting off real ADP. It runs in your browser, needs no account, and is graded the moment the last pick is in."
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          {inProgress && (
            <InProgress
              summary={inProgress}
              onResume={doResume}
              armed={discard.armed === 'save'}
              onDiscard={() => discard.press('save', () => { engine.restart(); bump() })}
              problem={resumeProblem}
            />
          )}
          <NextMock engine={engine} ready={ready} roomActive={roomActive} problem={problem} startProblem={startProblem} onStart={start} onSettings={() => setSettingsOpen(true)} />
          <Scenarios engine={engine} ready={ready} tick={tick} roomActive={roomActive} />
          <Friends engine={engine} roomActive={roomActive} />
        </div>
        <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-[76px] lg:self-start">
          <Recent history={history} inProgress={inProgress} onDelete={(id) => { engine.deleteHistoryDraft(id); bump() }} />
          <InsightsTeaser engine={engine} ready={ready} />
        </div>
      </div>

      <SettingsDrawer open={settingsOpen} engine={engine} onClose={() => setSettingsOpen(false)} onChange={bump} />
    </div>
  )
}
