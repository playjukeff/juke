import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { POS_BADGE } from './draftRoomPositions.js'
import ShareBar from './ShareBar.jsx'

const ordinal = (n) => {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10]}`
}

// The dark-charcoal container every data section here sits in — 1px border
// that subtly glows on hover, matching the card treatment the rest of the
// draft room already uses (same slate-800 border, same teal accent).
const PANEL =
  'rounded-2xl border border-slate-rule bg-slate-panel/60 transition-all duration-300 ' +
  'hover:border-teal-400/40 hover:shadow-[0_0_18px_rgba(0,229,255,0.12)]'

/* Four horizontal bars on one 0-100 scale, replacing the four-axis radar a
   design review flagged directly: two near-equal values read very
   differently depending on which axis they land on, and a radar has no
   way to show the weights or prove the components sum to the composite.
   A bar does both. Same component order and labels Analysis's own bars
   use, same weakest-only-warning-colour rule (the other three stay a
   neutral teal whatever their own score is), so a reader moving between
   the two screens never has to relearn what a colour means.

   scored carries {total, startersScaled, valueScaled, buildScaled,
   byePenaltyScaled} — either analyseDraft()'s live per-team object or the
   same four fields lifted verbatim out of a frozen history report's
   standings row. Both shapes carry exactly these fields under exactly
   these names, so this component never needs to know which one it got. */
function ComponentBars({ scored, weights }) {
  /* scaled: true for the three components analyseDraft() actually runs
     through scaleAcross() (see app.js) — their 0-100 number is this specific
     room's floor and ceiling, min-max stretched, and means nothing outside
     it. Roster construction never goes through that transform (see
     CLAUDE.md's "Roster construction is the one component that is not
     scaled" section); its 0-100 is an absolute score computed the same way
     for every room. Reported directly: a 0 on a scaled component read as
     "this draft had zero value," when it only ever means "the worst of
     these N teams" — the "vs. room" / "own scale" tag below and the
     footnote at the bottom of this component exist to say which is which,
     right next to the number a reader is about to misread. */
  const bars = [
    { key: 'starters', label: 'Starter strength', pct: scored.startersScaled, weight: weights.starters, scaled: true },
    { key: 'value', label: 'Draft value', pct: scored.valueScaled, weight: weights.value, scaled: true },
    { key: 'build', label: 'Roster construction', pct: scored.buildScaled, weight: weights.build, scaled: false },
    { key: 'byes', label: 'Bye-week safety', pct: scored.byePenaltyScaled, weight: weights.byes, scaled: true },
  ]
  const weakest = bars.reduce((a, b) => (b.pct < a.pct ? b : a))

  return (
    <div>
      <div className="space-y-3">
        {bars.map((b) => {
          const isWeakest = b.key === weakest.key
          return (
            <div key={b.key}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold text-white/80">{b.label}</span>
                <span className="font-numeral text-ink-muted">
                  wt {Math.round(b.weight * 100)}% <span className="text-[10px]">· {b.scaled ? 'vs. room' : 'own scale'}</span>
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(2, Math.min(100, b.pct))}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    className={'h-full rounded-full ' + (isWeakest ? 'bg-rose-400' : 'bg-teal-400')}
                  />
                </div>
                <span className={'w-8 shrink-0 text-right font-numeral text-sm font-bold ' + (isWeakest ? 'text-rose-400' : 'text-teal-300')}>
                  {Math.round(b.pct)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {/* The components must visibly add up to the composite in the
          summary card above — scored.total itself, never a local recompute,
          so this can never drift a decimal from what that card shows. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-rule/70 pt-3 text-xs">
        <span className="font-semibold uppercase tracking-wide text-teal-300">Weighted sum</span>
        <span className="flex-1 font-numeral text-ink-muted">{bars.map((b) => (b.pct * b.weight).toFixed(1)).join(' + ')}</span>
        <span className="font-numeral text-sm font-bold text-teal-300">= {scored.total.toFixed(1)}</span>
      </div>
      {/* A weight is not a share of the outcome, and the two are far enough
          apart on roster construction to be worth saying once.

          A component moves your placing in proportion to its weight AND to how
          much it varies across the room. Three of these are scaled against the
          room, so they are stretched to fill 0-100 whatever happened and their
          spread sits near 30 by construction. Roster construction is its own
          raw score and spreads about 9, because most rosters really are built
          alike — so at the same 15% weight it decides less of the order than
          the label alone suggests. Measured: 5.1% of the finishing order
          against a printed 15%.

          The weight is not wrong and was deliberately left at 0.15. Raising it
          to the 0.37 that would buy 15% of the outcome makes roster
          construction the joint-largest weight in a grade whose whole premise
          is that starters are worth double, and it would manufacture
          separation the data does not contain — which is the thing MIN_SPAN
          exists to prevent, reached from the other side. See CLAUDE.md. */}
      <p className="mt-2 text-[10px] leading-relaxed text-ink-muted">
        A weight is how much a component counts, not how much it separates the room. Roster
        construction is scored on its own scale rather than against the other teams, so it varies
        less and shifts the order less than its weight alone suggests. On the three marked "vs.
        room," 0 and 100 are this room's floor and ceiling, not a verdict — someone always scores
        0 there and someone always scores 100, whatever actually happened in the draft.
      </p>
    </div>
  )
}

/* One roster row, plus the replacement-baseline bar for it. row is
   {slotLabel, name, pos, gap} — either derived live from a seated lineup and
   engine.replacementGap(), or lifted straight out of a frozen history
   report's own mine.lineup, which already carries the gap it was computed
   with at the moment the draft finished. The center line IS the baseline:
   teal grows right for value above a replacement starter, red grows left
   for below. K/DST read a dash, not a bar — the projection can't rank
   those positions (see CLAUDE.md), and drawing a red bar from a number we
   refuse to trust elsewhere would be the withholding-has-to-be-complete bug
   all over again. */
function VorpRow({ row, maxAbs }) {
  const { slotLabel, name, pos, gap } = row
  const width = gap !== null && maxAbs > 0 ? (Math.abs(gap) / maxAbs) * 100 : 0

  return (
    <div className="flex items-center gap-2">
      <span
        className={
          'w-11 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-bold ' +
          (name ? POS_BADGE[pos] || 'bg-white/10 text-white/50' : 'bg-white/5 text-ink-muted')
        }
      >
        {slotLabel}
      </span>
      <span className={'w-28 shrink-0 truncate text-xs sm:w-36 ' + (name ? 'font-medium text-white/85' : 'text-ink-muted')}>
        {name || 'Empty'}
      </span>

      <div className="relative h-4 min-w-0 flex-1">
        <span className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
        {name && gap !== null && (
          <motion.span
            initial={{ width: 0 }}
            animate={{ width: `${width / 2}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            className={
              'absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm ' +
              (gap >= 0
                ? 'left-1/2 bg-gradient-to-r from-teal-500/80 to-teal-300 shadow-[0_0_8px_rgba(0,229,255,0.35)]'
                : 'right-1/2 bg-gradient-to-l from-rose-600/80 to-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.35)]')
            }
          />
        )}
      </div>

      <span
        className={
          'w-12 shrink-0 text-right text-xs font-semibold tabular-nums ' +
          (gap === null || !name ? 'text-ink-muted' : gap >= 0 ? 'text-teal-300' : 'text-rose-400')
        }
      >
        {!name || gap === null ? '—' : (gap >= 0 ? '+' : '') + Math.round(gap)}
      </span>
    </div>
  )
}

/* Below 10 points of replacement value, a "miss" is inside the forecast's
   own error — the 2026 projection runs at MAE 6.8 against actuals (see
   CLAUDE.md's Juke score section) — so accusing a pick over a single-digit
   delta would be reading precision into a number that doesn't carry it.
   Above it, the miss is worth saying out loud. */
const MISS_FLOOR = 10

// One centered-baseline bar, shared shape with the VORP rows: teal grows
// right for a pick that fell to you, red grows left for a reach — the same
// signed gap (pick number minus board rank) the grade's value component
// counts, in the same convention its callouts already print. row is
// {round, pos, name, gap} — the short name is resolved once, at the moment
// the row is built (live, via engine.shortName(); frozen, at the moment the
// draft completed), never re-derived here.
function TimelineRow({ row, maxAbs }) {
  const { round, pos, name, gap } = row
  const width = maxAbs > 0 ? (Math.abs(gap) / maxAbs) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-[10px] font-bold text-ink-muted">R{round}</span>
      <span
        className={
          'w-9 shrink-0 rounded px-1 py-0.5 text-center text-[9px] font-bold ' +
          (POS_BADGE[pos] || 'bg-white/10 text-white/50')
        }
      >
        {pos}
      </span>
      <span className="w-24 shrink-0 truncate text-xs font-medium text-white/85 sm:w-28">{name}</span>
      <div className="relative h-4 min-w-0 flex-1">
        <span className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
        <motion.span
          initial={{ width: 0 }}
          animate={{ width: `${width / 2}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          className={
            'absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm ' +
            (gap >= 0
              ? 'left-1/2 bg-gradient-to-r from-teal-500/80 to-teal-300 shadow-[0_0_8px_rgba(0,229,255,0.35)]'
              : 'right-1/2 bg-gradient-to-l from-rose-600/80 to-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.35)]')
          }
        />
      </div>
      <span
        className={
          'w-10 shrink-0 text-right text-xs font-semibold tabular-nums ' +
          (gap >= 0 ? 'text-teal-300' : 'text-rose-400')
        }
      >
        {(gap >= 0 ? '+' : '') + gap}
      </span>
    </div>
  )
}

// The "Draft Insights" tab — DraftRoom.jsx switches the view here itself
// the moment a draft concludes (see its draftIsOver effect) rather than
// waiting for a click, same reasoning as before: this is the most
// valuable screen in the app, so it must never be more than one press
// away from a finished board. Was a `fixed inset-0` modal reached only
// through a floating reopen pill; both are gone; a real tab on the same
// bar as Players/Board/Analysis needs neither.
//
// Two data sources, not one. historyReport is a frozen snapshot out of
// app.js's freezeReport() — the whole grade, every component, the VORP
// matrix, the value timeline and the one-that-got-away, computed once at
// the exact moment the draft finished and never recomputed. Without it
// (DraftRoom.jsx's live tab, and any Locker entry recorded before this
// existed) the dashboard falls back to engine.draftAnalysis() and friends,
// live against whatever board is loaded right now.
//
// That distinction exists because of a real bug: openHistoryDraft()
// rebuilds `board` from *today's* live projections and ADP before replaying
// a saved draft's picks onto it, so a report reopened from the Locker used
// to regrade the same 14 picks against data that had moved since the draft
// was actually played — a D+ in the Locker table (already frozen, see
// recordHistory()) reading back as an A- in the report built from the
// identical picks. Freezing only the raw per-team components and re-running
// today's *formula* would not have fixed it either: WEIGHTS, MIN_SPAN and
// GRADE_SCALE have each been retuned more than once in this file's own
// history (see CLAUDE.md's grade section), so only the fully computed
// output — post-scaling, post-weights, post-grade-lookup — is immune to the
// formula moving out from under an old report. See app.js's freezeReport().
//
// Full per-team detail (the VORP matrix, the value timeline, the one that
// got away) is frozen only for the drafter's own team — a roster-sized
// chunk of data per team, and nobody has asked to inspect a CPU seat's
// report after the fact. Every other team in a frozen report carries only
// the lightweight row the standings and the share card's room comparison
// need: rank, grade, total and the four scaled components. So a history
// report never offers to switch to another team's report — there is
// nothing full to switch to — and viewSlot/onViewSlot/mySlot are unused in
// that mode; effMySlot/effViewSlot below are what the JSX actually reads,
// and both pin to the drafter's own seat when historyReport is present.
//
// onRunAnother/cameFromLocker: this component has two call sites with two
// different "where am I" answers, and both used to be papered over with
// one hardcoded behavior that was only ever right for one of them.
//
// - DraftRoom.jsx mounts this as a real tab (view === 'insights') the
//   moment a live draft ends: engine.restart() there does exactly what
//   "Run another mock" should — DraftRoom itself listens for the
//   juke:home event restart() fires and swaps its own `started` flag back
//   to the pre-draft screen. onRunAnother defaults to that bridge call
//   unmodified, so this call site's behavior is unchanged.
// - DraftLocker.jsx mounts this directly over the Lobby to review a saved
//   history entry (no live DraftRoom view-state involved at all), so
//   engine.restart() alone had nothing local to reset: the Locker's own
//   analyzingId state stayed truthy, this component kept trying to render
//   a report against the now-cleared board, mine came back falsy, and the
//   whole panel silently disappeared into nothing — reported as "nothing
//   happens." DraftLocker passes its own onRunAnother that also clears
//   analyzingId, so the screen falls back to the launcher instead.
//
// cameFromLocker suppresses "Back to the locker": that pill's only job is
// getting back to the Locker, which is meaningless (and was reported as
// exactly that) when the Locker is already the screen underneath.
export default function DraftInsightsDashboard({
  engine, league, mySlot, viewSlot, onViewSlot, onClose, onRunAnother,
  cameFromLocker = false, historyReport = null, historyCompletedAt = null,
}) {
  const isHistory = !!historyReport

  // The same two actions AnalysisTab.jsx promotes to the top of its own
  // screen, for the identical reason: DraftRoom.jsx lands here first the
  // moment a draft ends, so whichever report a manager sees first has to
  // be the one that offers "what next" rather than making them go find
  // the other tab for it. engine.restart() is the exact bridge
  // AnalysisTab.jsx and DraftMenuOverlay's own kebab menu already share —
  // never a second reset. Close/Discard are not repeated here: there is
  // no modal left to close, and the kebab menu already reaches Discard/
  // Leave the room from every tab, this one included.
  const handleRunAnother = onRunAnother || (() => engine.restart())

  // The real component weights (50/25/15/10) — bridged in live mode, so
  // this can never quote a stale percentage after WEIGHTS moves in app.js;
  // lifted verbatim off the frozen report otherwise, for the identical
  // reason the grade itself is frozen rather than recomputed. Same
  // fallback AnalysisTab.jsx uses for the same reason.
  const weights = isHistory
    ? historyReport.weights
    : (engine.weights ? engine.weights() : { starters: 0.5, value: 0.25, build: 0.15, byes: 0.1 })

  let scored, standings, value, bargain, reach, vorpRows, maxAbs, timeline, tlMax, missed, teamName, winPct
  let effMySlot, effViewSlot, onStandingsClick, dateText

  if (isHistory) {
    effMySlot = historyReport.mySlot
    effViewSlot = historyReport.mySlot
    onStandingsClick = null

    standings = historyReport.standings.slice().sort((a, b) => a.rank - b.rank)
    const myRow = historyReport.standings.find((t) => t.slot === historyReport.mySlot)
    scored = myRow
    teamName = myRow ? myRow.teamName : 'Your Team'
    winPct = myRow ? myRow.winPct : null

    value = historyReport.mine.value
    bargain = historyReport.mine.bargain
    reach = historyReport.mine.reach

    vorpRows = historyReport.mine.lineup.map((s) => ({ slotLabel: s.slotLabel, name: s.name, pos: s.pos, gap: s.vorpGap }))
    maxAbs = Math.max(1, ...vorpRows.filter((r) => r.gap !== null).map((r) => Math.abs(r.gap)))

    timeline = historyReport.mine.timeline
    tlMax = Math.max(1, ...timeline.map((t) => Math.abs(t.gap)))

    const away = historyReport.mine.oneThatGotAway
    missed = away && away.delta >= MISS_FLOOR ? away : null

    // The date the draft actually finished, not the date the report is
    // being viewed on — a report opened months later must not claim to
    // have been played today.
    dateText = new Date(historyCompletedAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  } else {
    const analysis = engine.draftAnalysis()
    const mine = analysis && analysis[viewSlot]
    if (!mine) return null

    effMySlot = mySlot
    effViewSlot = viewSlot
    onStandingsClick = onViewSlot

    scored = mine
    teamName = engine.teamLabel(viewSlot)

    // Net ADP value is mine.value itself — analyseTeam()'s own unclamped
    // pick-number-minus-board-rank sum, never a second computation of the
    // same gap. Projected win % has no equivalent already sitting on the
    // analysis object, so it's the one figure here that asks the bridge for
    // something new — see the file comment above projectedWinPctForRoom() in
    // app.js for what it can and can't honestly claim.
    const winPcts = engine.winPctForRoom ? engine.winPctForRoom(analysis) : null
    winPct = winPcts ? winPcts[viewSlot] : null

    /* mine.lineup, not engine.seatedLineup(viewSlot) — the two disagree on
       purpose and this panel needs the one seatedLineup() isn't.
       seatedLineup() fills FLEX with the first eligible player in *draft
       order*; mine.lineup is bestLineup()'s own output, already sitting on
       the analysis object, which fills it by aboveReplacement — the exact
       fix CLAUDE.md documents for the historical FLEX bug ("sorts by
       posRank, never aboveReplacement... a within-position measure cannot
       answer a between-position question"). analyseTeam()'s starter-strength
       score is computed from this same bestLineup() result, so reading
       seatedLineup() here instead means this panel's VORP matrix can credit
       a different player as the FLEX starter than the score two inches above
       it just counted — the same mismatch AnalysisTab.jsx's own file comment
       already warns against. No bench here either way; this panel only ever
       showed starters. */
    const seats = mine.lineup || []
    vorpRows = seats.map((seat) => ({
      slotLabel: seat.slot,
      name: seat.player ? seat.player.name : null,
      pos: seat.player ? seat.player.pos : null,
      gap: seat.player ? engine.replacementGap(seat.player) : null,
    }))
    maxAbs = Math.max(1, ...vorpRows.filter((r) => r.gap !== null).map((r) => Math.abs(r.gap)))

    /* mine.bargain itself, not gated on gap > 0 here — analyseTeam() (app.js)
       already picks whichever judged pick has the *highest* gap, positive or
       not, and never nulls it the way reach is (reach is nulled at gap >= 0,
       bargain never is). AnalysisTab.jsx and the legacy panel it matches both
       show "Best value" unconditionally on the same rule; gating it here too
       meant a team whose best pick still landed at-or-before its own board
       rank showed the card on one screen and not the other, for identical
       data. The gap sign still has to be checked before the label calls it
       "picks late", though — that part of AnalysisTab's rule is real. */
    value = mine.value
    bargain = mine.bargain ? { name: mine.bargain.pick.player.name, pos: mine.bargain.pick.player.pos, gap: mine.bargain.gap } : null
    reach = mine.reach ? { name: mine.reach.pick.player.name, pos: mine.reach.pick.player.pos, gap: mine.reach.gap } : null

    const picks = engine.picks() || []
    // FORCED_LATE is a lookup object ({ K: true, DST: true }), not a list —
    // the same shape freelyChosen() in app.js tests it with.
    const forced = engine.forcedLate() || {}
    const teamPicks = picks.filter((p) => p.slot === viewSlot).slice().sort((a, b) => a.overall - b.overall)

    /* The value timeline leaves out the two positions a fall past ADP says
       nothing about — the same FORCED_LATE exclusion the grade's value
       component applies, and for the same documented reason: kicker and
       defense ADP is drawn from drafts longer than these, so every one of
       them reads as a reach. Naming a kicker the worst pick was a real bug
       once; it does not come back through a new panel. */
    timeline = teamPicks
      .filter((p) => !forced[p.player.pos])
      .map((p) => ({ round: p.round, overall: p.overall, pos: p.player.pos, name: engine.shortName(p.player), gap: p.overall - p.player.overall }))
    tlMax = Math.max(1, ...timeline.map((t) => Math.abs(t.gap)))

    /* The one that got away: at each of this team's turns, the player somebody
       else took before their next turn who would have improved this lineup most.

       The scan used to live here and compared two bare replacementGap()
       readings — his against the pick actually made — which is a claim about
       the player pool with no reference to the roster it is advising. A team
       holding two elite tight ends was told it had missed a third; the
       subtraction was right and the advice was unusable, because he could never
       have started. engine.oneThatGotAway() runs the same window scan as a
       substitution through bestLineup(), beside the grade it belongs to, so a
       player who would not crack this lineup scores 0 and cannot be named.

       Still gated on MISS_FLOOR here: the delta is projected points on both
       sides of the change, which is the unit that floor was always written in. */
    const rawMissed = engine.oneThatGotAway ? engine.oneThatGotAway(viewSlot) : null
    missed = rawMissed && rawMissed.delta >= MISS_FLOOR
      ? {
          theirsName: rawMissed.theirs.player.name,
          theirsTeamName: engine.teamLabel(rawMissed.theirs.slot),
          theirsOverall: rawMissed.theirs.overall,
          mineName: rawMissed.mine.player.name,
          mineRound: rawMissed.mine.round,
          mineOverall: rawMissed.mine.overall,
          delta: rawMissed.delta,
        }
      : null

    standings = analysis.slice().sort((a, b) => a.rank - b.rank)
    dateText = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const isMe = effViewSlot === effMySlot
  // "you took" / "Bijan Mustard took"; "your pick" / "their pick".
  const subject = isMe ? 'you' : teamName
  const poss = isMe ? 'your' : 'their'

  // Everything the share card draws, assembled from the same values the
  // summary card above renders — the card can never say something the
  // screen does not.
  // Plain-text twin of the styled "One That Got Away" paragraph rendered
  // below — same convention as bestValue/biggestReach just above: the JSX
  // carries bold spans a canvas can't draw, so the share card gets its own
  // formatting of the identical facts (missed/subject/poss), not a second
  // opinion about what happened.
  const oneThatGotAwayText = missed
    ? `${missed.theirsName} was still on the board when ${subject} took ${missed.mineName} in round ` +
      `${missed.mineRound} — ${missed.theirsTeamName} got him ` +
      `${missed.theirsOverall - missed.mineOverall === 1 ? 'with the very next pick' : `${missed.theirsOverall - missed.mineOverall} picks later`}` +
      `, and swapping him in would have made ${poss} starting lineup this much stronger.`
    : `Nothing got away. At every turn, nobody taken before ${poss} next pick would have improved ${poss} ` +
      'starting lineup by more than the projection can honestly measure — that is the mark of a draft with no real regrets in it.'

  const shareData = {
    teamName,
    leagueText: engine.settingsText(league),
    dateText,
    grade: scored.grade,
    rankText: ordinal(scored.rank),
    teams: league.teams,
    // No `total`. The card drew it as "x / 100 weighted score" under the
    // grade and no longer does; leaving the field here would be an invitation
    // to put the line back without the reasoning that took it out.
    components: scored,
    bestValue: bargain
      ? `${bargain.name}${bargain.gap > 0 ? ` · ${bargain.gap} picks late` : ''}`
      : null,
    biggestReach: reach ? `${reach.name} · ${Math.abs(reach.gap)} picks early` : null,
    // Shown on screen a few lines below (next to Net ADP value), and until
    // now dropped here with nothing saying why — this wasn't a deliberate
    // omission the way `total` above is. shareCard.js guards it the same
    // `typeof === 'number'` way the JSX render does, so a draft with no
    // room-wide win-probability model draws no line rather than "NaN%".
    winPct,
    // Everything below this line is what makes the card the whole report
    // rather than the old fixed 630px teaser — see shareCard.js's own file
    // comment on why Share/Copy/Download all drew that same short card and
    // why that was reported as a bug rather than a feature.
    oneThatGotAwayText,
    oneThatGotAwayDelta: missed ? missed.delta : null,
    vorpRows,
    timeline,
    standings: standings.map((t) => ({
      rank: t.rank,
      grade: t.grade,
      teamName: t.teamName || engine.teamLabel(t.slot),
      isMine: t.slot === effMySlot,
    })),
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate pb-64">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-5 px-4 py-8 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400">Draft complete</p>
            <h1 className="font-display text-2xl font-bold text-white">
              Draft Insights <span className="text-ink-muted">·</span>{' '}
              <span className={isMe ? 'text-teal-300' : 'text-[#B784E0]'}>{teamName}</span>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* "Back to your team" is real navigation (this report can be
                showing someone else's team, via a board header click or a
                standings row below), not an exit action. Never renders in
                history mode: effViewSlot pins to effMySlot there, so isMe
                is always true. */}
            {!isMe && (
              <button
                type="button"
                onClick={() => onViewSlot(mySlot)}
                className="flex min-h-[44px] items-center rounded-full border border-teal-400/40 px-3 py-1.5 text-xs font-semibold text-teal-300 transition-colors duration-150 hover:border-teal-400 hover:bg-teal-400/10 lg:min-h-0"
              >
                Back to your team
              </button>
            )}
            {/* onClose is real dismissal, unlike "Back to your team" above.
                Used to be reasoned away here as "this is a tab, not a
                modal, so there is nothing to dismiss" — true only for
                DraftRoom.jsx's live tab, which sits in a tab bar a reader
                can click away from. DraftLocker.jsx replaces the whole
                Lobby screen with this component instead, with no tab bar
                underneath it, and "View the full board" (the only close
                affordance) sits at the very bottom of a long, scrollable
                report. Reported directly: reaching it meant a browser
                back-button rather than anything in the app. Wired to the
                same onClose both call sites already pass — DraftRoom.jsx's
                own "View the full board" button lower down and this one
                do the identical thing there too, just from the top. */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close report"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/50 transition-colors duration-150 hover:border-white/30 hover:text-white lg:h-8 lg:w-8"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Summary card — the grade, large and glowing, in the two brand
            accents, with the rank beside it because the letter is handed out
            for finishing position: a grade without its rank invites the reader
            to take a room-relative ranking as an absolute verdict.

            The weighted total used to sit under the rank and no longer does.
            "A" over "69 / 100" asks a reader to hold two incompatible scales
            at once, and the familiar one wins — measured across a room, the
            letter agreed with the school reading of the number beneath it on
            0 of 10 teams. The rank says the same thing the letter does, in
            words nobody can misread. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          // sm:flex-wrap so the full-width ShareBar at the end of the card
          // breaks onto its own line under the grade and the callouts,
          // instead of being squeezed into the row as a third column.
          className={PANEL + ' flex flex-col items-center gap-4 p-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-8'}
        >
          <div className="flex items-center gap-5">
            {/* Plain ink, not the CTA gradient clipped to the glyph.

                Measured on this panel's own ground: the #00E5FF stop is
                9.05:1 and the #7B1FA2 stop is 1.70:1, so the letter ran
                from legible to invisible across itself and the tail of
                every glyph sat under the 3:1 a 72px character answers to.
                CLAUDE.md's rule about gradients is stated for stops rather
                than for the colour a box happens to reach — "every stop
                must clear it on its own, do not tie the requirement to a
                stop percentage" — and bg-clip-text is that rule's worst
                case, because the reader sees every stop at once.

                It is also the action gradient drawing a VALUE, which the
                same file forbids ("teal is the brand and the action, and it
                is never a value"). AnalysisTab's own composite already
                settled this for the identical pair: "the composite is a
                score out of a hundred and the grade is a letter. Neither is
                a gain or a cost, so both take plain ink." Same letter, same
                answer, so the two panels cannot disagree. */}
            <span className="font-display text-7xl font-black leading-none text-ink sm:text-8xl">
              {scored.grade}
            </span>
            <div>
              <p className="font-display text-xl font-bold text-white">
                {ordinal(scored.rank)} <span className="text-ink-muted">of {league.teams}</span>
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/50">
                <span>
                  Net ADP value{' '}
                  <span className={'font-semibold ' + (value >= 0 ? 'text-teal-300' : 'text-rose-400')}>
                    {value >= 0 ? '+' : ''}{Math.round(value)}
                  </span>
                </span>
                {typeof winPct === 'number' && (
                  <span>
                    Projected win % <span className="font-semibold text-teal-300">{Math.round(winPct * 100)}%</span>
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-xs sm:text-right">
            {bargain && (
              <p className="text-white/60">
                <span className="font-semibold uppercase tracking-wide text-teal-400">Best value</span>{' '}
                {bargain.name}
                {bargain.gap > 0 && <span className="text-ink-muted"> · {bargain.gap} picks late</span>}
              </p>
            )}
            {reach && (
              <p className="text-white/60">
                <span className="font-semibold uppercase tracking-wide text-rose-400">Biggest reach</span>{' '}
                {reach.name} <span className="text-ink-muted">· {Math.abs(reach.gap)} picks early</span>
              </p>
            )}
          </div>

          <ShareBar shareData={shareData} />
        </motion.div>

        {/* The same two actions AnalysisTab.jsx promotes to the top of its
            own screen, and for the same reason — DraftRoom.jsx lands on
            this tab first the moment a draft ends, so this is the report
            most likely to be the only one somebody sees before deciding
            what's next. */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleRunAnother}
            className="rounded-full bg-gradient-to-r from-[#00E5FF] to-[#7B1FA2] px-4 py-2 text-xs font-bold text-white shadow-glass transition-transform duration-150 hover:scale-[1.02]"
          >
            Run another mock
          </button>
          {!cameFromLocker && (
            <a
              href="#/rooms/draft"
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/60 transition-colors duration-150 hover:border-teal-400/60 hover:text-teal-300"
            >
              Back to the locker
            </a>
          )}
        </div>

        {/* Sliding doors — the single biggest value upgrade that left the
            board between two of your turns. It is the strongest analytic in
            the product and the thing most likely to trigger another mock,
            so it gets a treatment nothing else on this screen has: its own
            accent colour (the same purple the missed player's own name
            already carries below) rather than the shared teal PANEL border,
            and its own number pulled out at scale rather than folded into
            the sentence where a reader has to go looking for it. When
            nothing clears MISS_FLOOR the panel says so in the positive,
            because that is a checkable claim about this draft, not an
            empty box — and the number is dropped rather than shown as a
            hollow zero, since there is no "amount forgone" to report. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="rounded-2xl border-2 border-[#B784E0]/40 bg-gradient-to-br from-[#B784E0]/[0.07] to-transparent p-5 transition-all duration-300 hover:border-[#B784E0]/70 hover:shadow-[0_0_20px_rgba(183,132,224,0.18)]"
        >
          <div className="flex flex-wrap items-center gap-5">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[#B784E0]">
                The One That Got Away
              </h2>
              {missed ? (
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  <span className="font-semibold text-[#B784E0]">{missed.theirsName}</span>{' '}
                  was still on the board when {subject} took {missed.mineName} in round{' '}
                  {missed.mineRound} — {missed.theirsTeamName} got him{' '}
                  {missed.theirsOverall - missed.mineOverall === 1
                    ? 'with the very next pick'
                    : `${missed.theirsOverall - missed.mineOverall} picks later`}
                  , and swapping him in would have made {poss} starting lineup this much stronger.
                </p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  Nothing got away. At every turn, nobody taken before {poss} next pick would have improved{' '}
                  {poss} starting lineup by more than the projection can honestly measure — that is the mark
                  of a draft with no real regrets in it.
                </p>
              )}
            </div>
            {missed && (
              <div className="shrink-0 text-right">
                <div className="font-display text-4xl font-black leading-none text-[#B784E0] sm:text-5xl">
                  +{Math.round(missed.delta)}
                </div>
                <div className="mt-1.5 font-numeral text-[9.5px] font-semibold uppercase tracking-wide text-ink-muted">
                  lineup points forgone
                </div>
              </div>
            )}
          </div>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-2">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className={PANEL + ' p-5'}
          >
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/80">Team analysis</h2>
            <p className="mb-3 mt-0.5 text-xs text-ink-muted">The four grade components, scaled against the room</p>
            <ComponentBars scored={scored} weights={weights} />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className={PANEL + ' p-5'}
          >
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/80">VORP matrix</h2>
            <p className="mb-3 mt-0.5 text-xs text-ink-muted">
              Each starter against a replacement-level player at his position
            </p>
            <div className="flex flex-col gap-1.5">
              {vorpRows.map((row, i) => (
                <VorpRow key={i} row={row} maxAbs={maxAbs} />
              ))}
            </div>
            {/* The last clause is not decoration. Starter strength is a sum of
                the same points these rows print, so a reader can now add this
                panel up and check it — which they could not while the grade
                counted ADP rank places and this counted points. The two
                positions dashed here still go into that sum (5 to 29 points a
                team, measured across a room), and a footnote that stopped at
                "no bar is drawn" would leave the panel implying they were
                excluded. Dashing them is a refusal to *rank* them, which is
                what the backtest actually condemned; it was never a claim that
                their points did not happen. */}
            <p className="mt-3 text-[10px] leading-relaxed text-ink-muted">
              Kickers and defenses show a dash: measured against three seasons of archived forecasts the
              projection ranks them no better than chance, so no bar is drawn from it. Their points still
              count toward starter strength — the rows above will add up to a little less than the grade uses.
            </p>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className={PANEL + ' p-5'}
          >
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/80">Draft value timeline</h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Where each pick landed against the board's rank — right means he fell to {isMe ? 'you' : 'them'}
                </p>
              </div>
              <span className="shrink-0 font-numeral text-[9.5px] font-semibold uppercase tracking-wide text-ink-muted">Unit: picks</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {timeline.map((row, i) => (
                <TimelineRow key={row.overall != null ? row.overall : i} row={row} maxAbs={tlMax} />
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-ink-muted">
              Kickers and defenses sit this out too — their ADP comes from longer drafts than this one,
              so every one of them reads as a reach whenever you take him.
            </p>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
            className={PANEL + ' p-5'}
          >
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/80">Room standings</h2>
            {/* The score column is gone from between the rank and the letter.
                CLAUDE.md's standings rule was that whatever sits there has to
                be the weighted total, because a column showing anything else
                makes a strictly-ranked table look broken — and it once showed
                starter strength and did exactly that. Removing the column
                honours the same rule from the other side: the row is ordered
                by rank and labelled by a letter that means rank, so there is
                nothing left for a third number to disagree with. */}
            <p className="mb-3 mt-0.5 text-xs text-ink-muted">
              {onStandingsClick ? 'Best to worst — click any team to view their report' : 'Best to worst'}
            </p>
            <div className="flex flex-col gap-1">
              {/* Each row is the switcher for this whole dashboard in live
                  mode: the viewed team carries the ring, your own row keeps
                  its teal name so "where am I" survives while reading
                  somebody else's report. A frozen history report only ever
                  has full detail for the drafter's own team (see this file's
                  own comment above), so there's nothing to switch to — rows
                  render as plain text there instead of a control. */}
              {standings.map((t) => {
                const Row = onStandingsClick ? 'button' : 'div'
                const rowClass =
                  'flex min-h-[44px] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors duration-150 lg:min-h-0 ' +
                  (t.slot === effViewSlot
                    ? 'border border-teal-400/40 bg-teal-500/10 font-semibold text-white'
                    : 'text-white/60' + (onStandingsClick ? ' hover:bg-white/5 hover:text-white' : ''))
                return (
                  <Row
                    key={t.slot}
                    type={onStandingsClick ? 'button' : undefined}
                    onClick={onStandingsClick ? () => onStandingsClick(t.slot) : undefined}
                    className={rowClass}
                  >
                    <span className="w-5 shrink-0 text-right tabular-nums text-ink-muted">{t.rank}</span>
                    <span className={'min-w-0 flex-1 truncate ' + (t.slot === effMySlot ? 'text-teal-300' : '')}>
                      {t.teamName || engine.teamLabel(t.slot)}
                    </span>
                    <span
                      className={
                        'w-8 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold ' +
                        (t.slot === effViewSlot ? 'bg-teal-400/20 text-teal-300' : 'bg-white/5 text-white/50')
                      }
                    >
                      {t.grade}
                    </span>
                  </Row>
                )
              })}
            </div>
          </motion.section>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mx-auto flex min-h-[44px] items-center rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-white/60 transition-colors duration-200 hover:border-teal-400/60 hover:text-teal-300 lg:min-h-0"
        >
          View the full board
        </button>
      </div>
    </div>
  )
}
