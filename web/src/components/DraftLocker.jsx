import { useEffect, useReducer, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useEngine, useJukeTick } from '../hooks/useJukeEngine.js'
import InProgressBand from './InProgressBand.jsx'
import LockerTable from './LockerTable.jsx'
import DraftInsightsDashboard from './DraftInsightsDashboard.jsx'
import YourInsights from './insights/YourInsights.jsx'

/* What this screen shows, and what left it.

   design_handoff_your_insights (option 1a) replaced the eight-card "Your
   Tendencies" grid, and the three-tile KPI row above it, with one panel:
   four views on a left rail, a persistent habits sidebar, and a header of
   four KPIs that are about decisions rather than about shares. The whole of
   it is web/src/components/insights, and every number and every sentence on
   it comes off app.js section 11d2.

   The handoff's own case for the swap is that the grid reported positional
   shares and averages — what every competitor shows, and figures that
   converge on the population's own base rates the more mocks somebody runs.
   A reader who has run forty drafts learns that they take a running back in
   round one.

   NOTHING WAS DELETED. RecommendationEngine, MostDrafted, WeakestSpot,
   AvgRoundByPosition, DraftCapitalAllocation, WinPctTrend, NetAdpValue and
   PositionalWeaknessHeatmap are all still in web/src/components, complete
   and unrendered — the same state Header, Hero, RoomsGrid, NewMockPanel and
   phone/HomePhone are in, and the same rule this project followed through
   the root index.html migration: prove the replacement works before deleting
   what it replaces, and check the running site rather than the build log.
   Their imports left THIS file rather than being kept as dead ones, because
   an import nothing renders is a promise the screen no longer keeps.

   WhatToRunNext left with them, for a different reason: the rail's own "Run
   this next" card is the same control aimed at the same (format, seat), and
   two of them on one screen is the duplicate-affordance problem this file
   already records against the launcher it removed. describeRecommendation()
   and runRecommendation() are untouched and still shared with
   RecommendationEngine.

   MIN_MOCKS_FOR_ANALYTICS moved with the gate it guarded, into app.js as
   MIN_MOCKS_FOR_INSIGHTS, and is deliberately the same number: same reader,
   same question, and a second opinion about what "enough mocks" means is
   worth less than one answer both halves agree on. */

// What is left on this screen after the swap above: the way back, the
// in-progress band, the Your Insights panel and the history table. Every
// child is presentational — this component owns the one thing that has to
// live above all of them, which is knowing whether an in-progress draft or a
// history entry changed and needs a re-render.
/* Five props left with the launcher: onStartNew, problem, lobbySlot,
   onSetLobbySlot, onOpenSettings and onDraftWithFriends were all
   NewMockPanel's, and nothing else here read one. Dropped rather than
   left in the signature, because an unused prop is a promise this
   screen no longer keeps -- the next reader would look for the setup
   form it implies. */
export default function DraftLocker({ onRunAtSeat, roomActive, initialAnalyzeId, onBackToList }) {
  const engine = useEngine()
  useJukeTick(engine)
  // clearSave()/deleteHistoryDraft() are plain localStorage writes with no
  // juke:header event behind them (nothing else in app.js needs to hear
  // about either), so this screen doesn't get an automatic re-render from
  // the engine tick alone — forced locally instead, same as the previous
  // implementation did.
  const [, forceLocal] = useReducer((x) => x + 1, 0)
  // Which history entry's report is open, if any — analyzing a past draft
  // used to mean navigating to #/draft-room and mounting the entire live
  // Cockpit (board, player pool, Queue/Roster/Chat) underneath the insights
  // modal, with the Analysis tab rendering the same numbers a second time
  // beneath it. DraftInsightsDashboard is self-contained (engine/league/
  // mySlot/viewSlot/onClose, nothing else), so it can sit directly over the
  // Lobby instead — no route change, nothing else to mount.
  const [analyzingId, setAnalyzingId] = useState(null)
  // Which team's report the dashboard shows — yours on open, or another
  // seat's if a future caller wants that; kept separate from mySlot the
  // same way DraftRoom.jsx's own insightsSlot is. Only meaningful for the
  // live-recompute fallback path below; a frozen report only ever has full
  // detail for the drafter's own seat, so it ignores this entirely.
  const [insightsSlot, setInsightsSlot] = useState(0)
  // The frozen report for analyzingId, or null when analyzing a pre-freeze
  // entry that has to fall back to the live recompute — see analyze() and
  // DraftInsightsDashboard.jsx's own file comment on why the two disagree
  // and why that gap matters.
  const [historyReport, setHistoryReport] = useState(null)
  /* Open one report straight away, when a caller already knows which.

     MockDraftsPhone.jsx is that caller: on a phone the history list lives
     on its own screen, so tapping a row has to land on the report rather
     than on the dashboard the row is not part of. It goes through the
     identical analyze() below rather than reaching for openHistoryDraft()
     itself — the frozen-report-first path is the whole reason a reopened
     draft and the report it was graded with cannot disagree, and a second
     entry point that skipped it would silently reintroduce exactly that.

     ---- Two things about where this sits ----

     ABOVE `if (!engine) return null`, and that is not style. Placed below
     it, the hook ran on the renders where the engine had resolved and not
     on the ones before, so the hook COUNT changed between renders —
     React's "rendered more hooks than during the previous render", thrown
     on the first press of the button that mounts this component. Every
     hook in a component runs on every render or none of them do; an early
     return is a wall no hook may sit behind.

     And it fires once, tracked by a ref rather than by an empty dep array.
     `analyze` is a const assigned further down this function, so on the
     render where the engine is still null it is never assigned at all —
     an empty-dep effect would run exactly then, reach a binding in its
     temporal dead zone, and throw. Keyed on `engine` it runs again once
     there is one, and the ref is what stops it re-opening a report the
     reader has since closed. */
  const openedInitial = useRef(false)
  /* Whether the report on screen was opened FROM the phone's Mock Drafts
     list rather than from the dashboard's own table.

     Closing has to land where the reader came from, and those are two
     different places. Reported directly: open a finished mock from the
     phone list, close the report, and you arrive on the desktop-style
     "Draft Lobby" dashboard — a screen that was never on the way in.
     setAnalyzingId(null) alone can only ever fall back to this component's
     own table, because that is what this component renders; getting all
     the way back to the list means calling the caller's own exit. */
  const [fromList, setFromList] = useState(false)
  useEffect(() => {
    if (!engine || !initialAnalyzeId || openedInitial.current) return
    openedInitial.current = true
    setFromList(true)
    analyze(initialAnalyzeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, initialAnalyzeId])


  if (!engine) return null

  const inProgress = engine.inProgressSummary()
  const completed = engine.historyList()
  const league = engine.league()
  /* historyStats() left with the analytics grid: this screen no longer reads
     it, and the panel below asks the engine for its own report rather than
     being handed a second summary of the same locker. `league` stays because
     the frozen-report dashboard above still takes one. */

  const resume = () => { engine.resumeSavedDraft(); location.hash = '#/draft-room' }
  // engine.restart() — clearSave() plus goHome() — not clearSave() alone.
  // Reported directly: discard here, then start a new mock, and the new
  // board opened already holding the old draft's picks. clearSave() only
  // drops the localStorage save; it never touches the live state.picks or
  // board[i].drafted that a draft actually left behind on the page (the
  // chevron back to this screen doesn't clear them either — leaving a
  // draft mid-round is meant to be resumable, so nothing here resets that
  // state on its own). startDraft() -> buildBoard() does rebuild `board`
  // from scratch on the next mock, but it has never cleared state.picks
  // itself — it relies on whatever ended the previous draft having already
  // done that, which goHome() does and clearSave() alone does not. This is
  // the exact same "Discard draft" action the in-draft kebab menu already
  // gets right (DraftRoom.jsx's handleDiscard); this screen just hadn't
  // been calling it.
  const discard = () => { engine.restart(); forceLocal() }
  // Frozen report first — a plain localStorage read, no board rebuild, no
  // drift. Only an entry recorded before freezeReport() existed comes back
  // null, and only then does this fall back to the old path: rebuild
  // today's board and replay the picks onto it, live. See
  // DraftInsightsDashboard.jsx's own file comment for why the two can
  // disagree on the very same picks and why that gap was a real bug.
  const analyze = (id) => {
    const frozen = engine.historyReport(id)
    if (frozen) {
      setHistoryReport(frozen)
      setAnalyzingId(id)
      return
    }
    if (!engine.openHistoryDraft(id)) return
    setInsightsSlot(engine.mySlot())
    setHistoryReport(null)
    setAnalyzingId(id)
  }
  const deleteEntry = (id) => { engine.deleteHistoryDraft(id); forceLocal() }

  // A report replaces the whole screen while it's open, the same way
  // DraftRoom.jsx's own `view === 'insights'` replaces the board tab
  // instead of appending below it — this used to render *after* the
  // analytics and the full history table inside the same flex-1 scroll
  // region, so opening a report from any row of a long table left it
  // sitting below all of that, off the bottom of the screen. Reported
  // directly: users had to scroll to find it.
  //
  // onRunAnother does the extra local reset DraftRoom.jsx's own default
  // (bare engine.restart()) doesn't need: DraftRoom listens for the
  // juke:home event restart() fires and swaps its own view state, but
  // this screen has no equivalent listener, so without clearing
  // analyzingId here the dashboard kept trying to render a report
  // against the just-cleared board and silently returned null — see
  // DraftInsightsDashboard.jsx's own comment on this prop.
  if (analyzingId) {
    // historyReport set: nothing live was touched to get here (analyze()
    // took the frozen-report path), so closing just drops local state —
    // engine.closeHistoryDraft() only undoes what openHistoryDraft() did,
    // and that was never called this time.
    const closeAnalysis = () => {
      if (!historyReport) engine.closeHistoryDraft()
      setAnalyzingId(null)
      setHistoryReport(null)
      // Straight back to the list when that is where this came from, rather
      // than surfacing on the dashboard in between — see `fromList`. The
      // local state above is still cleared first, so a later return to this
      // component starts from its table rather than re-opening the report.
      if (fromList && onBackToList) { setFromList(false); onBackToList() }
    }
    return (
      <DraftInsightsDashboard
        engine={engine}
        league={league}
        mySlot={engine.mySlot()}
        viewSlot={insightsSlot}
        onViewSlot={setInsightsSlot}
        historyReport={historyReport ? historyReport.report : null}
        historyCompletedAt={historyReport ? historyReport.completedAt : null}
        onClose={closeAnalysis}
        onRunAnother={() => { closeAnalysis(); engine.restart() }}
        cameFromLocker
      />
    )
  }

  return (
    /* Two wrappers, because the ground has to be full-bleed and the content
       has to be a 1600px column.

       bg-slate-sunk, where every other screen in the Draft Room renders on
       bg-slate: the Your Insights panel below is bg-slate and its own inner
       surfaces are bg-slate-panel, so the page has to be the step under both
       or the panel has no edge to read against. Those three are the handoff's
       own three (#151C25 / #1E2733 / #232D3A) and this palette already had
       two of them exactly; slate-sunk is #161D26 against its #151C25, which
       is a difference nobody can see and a token nobody has to maintain. */
    <div className="min-h-full bg-slate-sunk">
      {/* min-h-full + flex-col, with the Locker table wrapper below taking
          flex-1: the table's own card stretches down to the bottom of the
          scroll container instead of stopping wherever its (often short) row
          list ends and leaving bare background beneath it. min-h-full rather
          than h-full so a long history — many rows, "Load 20 more" pressed a
          few times — is still free to grow taller than the viewport and let
          the real ancestor scroller (DraftRoom.jsx's own overflow-y-auto)
          take over, rather than being capped at 100% and clipping. */}
      <div className="mx-auto flex min-h-full max-w-[1600px] flex-col px-4 py-5 lg:px-8 lg:py-7">
        {/* Only when somebody arrived here from a screen that is still behind
            this one, which is what `onBackToList` being passed at all means.

            It used to carry `lg:hidden` as well, on the reasoning that at
            every width but a phone's this IS the screen and a back control on
            something you cannot go back from is the dead-control problem.
            That was true and stopped being true: design_handoff_v3_alive's
            screen c is the Draft Room's entry at EVERY width now
            (DraftRoomEntry), and this dashboard sits behind its "Your
            insights" button on a desktop exactly as it already did on a
            phone. Hiding the way out above `lg` left the desktop dashboard
            with no way back at all — the same dead-control rule, inverted:
            the control became necessary and stayed hidden. The condition that
            answers "is there something behind this" is the prop, and it
            always was. */}
        {onBackToList && (
          <button
            type="button"
            onClick={onBackToList}
            className="-ml-2 mb-2 flex items-center gap-1 self-start rounded-[10px] py-2 pl-2 pr-3 text-[14px] font-semibold text-white/70 transition-colors hover:text-white active:bg-white/[0.05]"
          >
            <ChevronLeft className="h-5 w-5" />
            Mock drafts
          </button>
        )}
        {/* The page heading, its eyebrow and the four KPIs are all inside the
            panel below — the handoff draws them as one header row with the KPI
            cards on its right, and a second "Your Insights" above it would be
            the same two words twice. What is left on this screen is the way
            back, the resume band and the record: none of those is analytics,
            and none of them was part of the swap. */}
        {inProgress && <InProgressBand draft={inProgress} onResume={resume} onDiscard={discard} />}

        <YourInsights engine={engine} roomActive={roomActive} onRunAtSeat={onRunAtSeat} />

        <div className="min-h-0 flex-1">
          {/* syncStatus, not a boolean: the table's own footer has to tell
              "in this browser only" from "in your account" from "signed in
              and failing to reach it," and only the engine knows the third
              one — see app.js's noteSyncResult(). Guarded here rather than
              in the table because syncStatus() is a newer bridge entry than
              this component and a cached app.js will not have it. */}
          <LockerTable
            entries={completed}
            onAnalyze={analyze}
            onDeleteConfirmed={deleteEntry}
            syncStatus={engine.syncStatus ? engine.syncStatus() : 'off'}
          />
        </div>
      </div>
    </div>
  )
}
