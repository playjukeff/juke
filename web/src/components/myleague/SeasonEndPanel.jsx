import { useMemo } from 'react'
import StakeCard from '../decision/StakeCard.jsx'
import RunNextCard from '../decision/RunNextCard.jsx'
import { seasonSummary } from '../../lib/schedule.js'

/* Screen 12: My League, once the season is over.
 *
 * It draws only when `seasonPhase()` says `complete`, which is a state this
 * app could not name until the schedule landed — CLAUDE.md listed screen 12
 * under the screens the data cannot answer, and the entry is now struck
 * through in its own file. So what was blocked is unblocked, and what is
 * built here is the part the data supports.
 *
 * ---- What the guide asks for and this deliberately does not draw ----
 *
 * "Stake card = season's costliest HABIT." A habit is a decision repeated,
 * and grading one needs the decision ledger's `verdict`, which nothing
 * writes: no room records a decision and there is no grader. The Draft
 * Room's own habits come off `insightsReport()`, which replays MOCK DRAFTS —
 * a different subject entirely, and pointing it at a season would be a
 * figure about one thing labelled as another.
 *
 * So the stake card names the season instead, off the schedule, and every
 * number on it is exact. A KPI strip is the most confident furniture on a
 * page and this is its light-surface cousin; the same rule applies.
 *
 * ---- The one number worth the arithmetic ----
 *
 * How many losses came in a week the reader still outscored the league's
 * median. That is the fact a record cannot show and the one a manager most
 * wants at the end of a season: a 6-8 team that beat the field in four of
 * its eight losses had a schedule rather than a problem.
 *
 * It needs no threshold, which is why it is the split rather than "close
 * losses" — a margin band wants a number somebody chose by eye, and this
 * project's own rule is that such a number is one nobody can check. See
 * `seasonSummary()`'s own note.
 */

/* The stake card takes a cost and a gain, and a finished season only ever
   has the first. `gain` is left undefined rather than passed a zero: a
   zero is a measurement and this is an absence, which is the same rule the
   pipeline applies to a 0 from any feed. */
export default function SeasonEndPanel({ league, snapshot }) {
  const summary = useMemo(
    () => seasonSummary(snapshot && snapshot.schedule, league && league.ownerId),
    [snapshot, league]
  )

  // Sleeper publishes no schedule at all, so this is the common case rather
  // than the edge one, and it draws nothing rather than an empty frame.
  if (!summary) return null

  const record = `${summary.won}-${summary.lost}${summary.tied ? '-' + summary.tied : ''}`
  const diff = Math.round((summary.pointsFor - summary.pointsAgainst) * 10) / 10

  /* The headline is whichever half of the season is the more useful thing to
     say, decided by the data rather than fixed: a manager who lost mostly
     above the median has a different season from one who did not, and one
     sentence cannot be true of both. */
  const drawn = summary.unlucky > 0 && summary.unlucky >= summary.outplayed
  const title = drawn
    ? `${summary.unlucky} of your ${summary.lost} losses outscored the league`
    : summary.lost > 0
      ? `${summary.outplayed} of your ${summary.lost} losses were under the league's own week`
      : `${record}, and nothing to answer for`

  return (
    <section className="mx-auto max-w-[1280px] px-5 pb-6 sm:px-10" data-season-end>
      <div className="grid gap-4 lg:grid-cols-2">
        <StakeCard
          eyebrow="The season, closed out"
          title={title}
          /* Points conceded over points scored. Pre-signed at the call site,
             because this is the case `signed()`'s own comment names: the
             magnitude is not the cost, the DIRECTION is, and a plain call
             would print a minus on a season that finished ahead. */
          cost={
            diff < 0
              ? `−${Math.abs(diff).toFixed(1)} pts`
              : `+${diff.toFixed(1)} pts`
          }
          action={{
            label: 'Read the week-by-week',
            onClick: () => {
              window.location.hash = '#/rooms/league'
            },
          }}
        >
          {record} on {summary.pointsFor.toFixed(1)} for and{' '}
          {summary.pointsAgainst.toFixed(1)} against, over {summary.played} weeks.
          {summary.narrowest
            ? ` The closest was week ${summary.narrowest.week}, by ${summary.narrowest.margin.toFixed(1)}.`
            : ''}
        </StakeCard>

        {/* P7. A season that is over has no move left in it, so the one
            honest action is the next one — and a mock at this league's own
            shape is a real, pressable thing rather than a card describing a
            feature. `practiceScenarios.js` already builds the same offer
            from history on the Draft Room's own entry; this is a route to
            that screen rather than a second copy of the control, which is
            the distinction the duplicate-affordance rule actually draws. */}
        <RunNextCard
          title={`Mock a ${snapshot.totalTeams}-team board before next year`}
          action={{ label: 'Open the Draft Room', href: '#/rooms/draft' }}
          index={1}
        >
          The draft is the one decision a whole season runs on, and it is the
          only one you can practise. Your league's own shape is what the room
          defaults to.
        </RunNextCard>
      </div>
    </section>
  )
}
