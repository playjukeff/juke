import VerdictBadge from '../ledger/VerdictBadge.jsx'
import BarRow from '../decision/Bar.jsx'

/* What one past week decided — the body that replaces the standings when a
 * reader presses a week on My League's strip.
 *
 * Juke Journey v3: "Clicking a past week replaces the body with that week's
 * graded decisions." Before the ledger there was nothing to replace it
 * with, which is why WeekStrip shipped with no `onSelect` at all.
 *
 * ---- DRAFT is a pointer, not a panel ----
 *
 * The strip's first cell is the draft, and a draft's picks are not in this
 * table: they live in `draft_history` and always have, because a mock draft
 * already had a home and one fact in two places is the failure this project
 * is most arranged against. So pressing DRAFT says where the record is and
 * links to it, rather than drawing an empty week that would read as "your
 * draft recorded nothing".
 *
 * ---- The week's own result, which this panel could not draw until now ----
 *
 * The decision guide's screen 04 asks for "Lost by 9" as a red cost bar
 * against the alternative, and it was filed as unbuildable: nothing fetched
 * a league's schedule, so a past week had graded calls in it and no score.
 * `lib/schedule.js` landed with the matchups work and `gameInWeek()` answers
 * exactly this — your points, the opponent's, and the result ESPN states.
 *
 * **Two bars on ONE max, and the headline carries the margin.** Two totals
 * in a column make a reader do the subtraction, so the bars do it — but a
 * zero-based scale is honest about proportion rather than loud about
 * difference: nine points on a 105-point week is eight per cent of the
 * track, and it looks like it. That is the truthful picture of a close game
 * and it is why the number is stated in words above them, in the sign
 * colour, rather than left for the eye to measure.
 *
 * A marker on your own row at the opponent's score was the obvious way to
 * make the gap loud, and it is the mistake this system already fixed once
 * in the Analysis panel: a mark whose only job is to restate the value of
 * the row underneath it is one encoding too many. The second bar IS the
 * opponent.
 *
 * The winner is read off `result` rather than by comparing the two numbers,
 * because `schedule.js` decides that from the winner ESPN states — a rule
 * that matters for an unplayed 0-0 week, which comparing would call a draw.
 * This panel only ever draws a past week, so that case is not reachable
 * here; reading the field anyway is what keeps the two from disagreeing if
 * it ever becomes reachable.
 *
 * **Absent, not zero.** A Sleeper league has no schedule at all today, and a
 * bye week has no opponent — both answer null and the block is simply not
 * drawn, rather than a 0-0 scoreline implying a game nobody played.
 *
 * ---- An ungraded week is not an empty one ----
 *
 * A decision is written when Juke makes the call and graded only after the
 * week is over, so a week that has just happened is full of rows with no
 * verdict. That is the normal case rather than an edge, and the summary
 * line counts what is graded rather than implying the rest went well.
 */
export default function PastWeekPanel({ weekKey, rows, game, opponent, onBack }) {
  const isDraft = weekKey === 'draft'
  const good = rows.filter((r) => r.verdict === 'good').length
  const bad = rows.filter((r) => r.verdict === 'bad').length
  const ungraded = rows.length - good - bad

  const summary = rows.length
    ? [
        good ? `${good} good` : null,
        bad ? `${bad} bad` : null,
        ungraded ? `${ungraded} not yet graded` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'No decisions recorded'

  /* Both halves have to be real numbers before this is a scoreline. A game
     that has not been played carries nulls, and `Math.max` over a null is 0
     — which would draw two full-width bars against a maximum of nothing. */
  const scored =
    !isDraft && game && typeof game.points === 'number' && typeof game.opponentPoints === 'number'
  const max = scored ? Math.max(game.points, game.opponentPoints, 1) : 0
  const margin = scored ? game.points - game.opponentPoints : null
  const them = (opponent && opponent.teamName) || 'Your opponent'

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-teal">
            {isDraft ? 'Draft' : `Week ${weekKey}`}
          </div>
          <div className="mt-1 text-[15px] font-semibold text-white">
            {isDraft ? 'Your draft is in the archive' : summary}
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-line-hairline px-3.5 py-[7px] text-meta font-semibold text-voidInk-body transition-colors duration-150 hover:text-white"
        >
          Back to this week
        </button>
      </div>

      {/* Above the decisions, because the result is what the week was and the
          calls are why. Its own card rather than a line in the header: the
          header is one line of summary and this is two bars and a verdict. */}
      {scored ? (
        <div className="mb-4 rounded-[14px] border border-line-hairline bg-surface-card px-4 py-4 sm:px-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-label">
              {game.playoff ? 'Playoff week' : 'The week'}
            </span>
            <span
              className={
                'font-decision text-[20px] font-extrabold leading-none ' +
                (game.result === 'W' ? 'text-gain' : game.result === 'L' ? 'text-cost' : 'text-ink')
              }
            >
              {game.result === 'W'
                ? `Won by ${Math.abs(margin).toFixed(1)}`
                : game.result === 'L'
                  ? `Lost by ${Math.abs(margin).toFixed(1)}`
                  : `Tied at ${game.points.toFixed(1)}`}
            </span>
          </div>
          {/* One max across both rows. Scaled apart they would be two charts
              and the margin — the only thing this card is for — would be
              unreadable. */}
          <BarRow
            index={0}
            label="You"
            value={game.points}
            max={max}
            sign={game.result === 'L' ? 'cost' : 'gain'}
            display={game.points.toFixed(1)}
          />
          <BarRow
            index={1}
            label={them}
            value={game.opponentPoints}
            max={max}
            sign="evidence"
            display={game.opponentPoints.toFixed(1)}
          />
        </div>
      ) : null}

      {isDraft ? (
        <div className="rounded-[14px] border border-line-hairline bg-surface-card p-6 text-meta leading-relaxed text-voidInk-body">
          Draft picks are kept with the draft that made them, not in the decision
          ledger — so every board you have run, with its grade and its report, is
          on{' '}
          <a href="#/drafts" className="font-semibold text-mint">
            your drafts
          </a>
          .
        </div>
      ) : rows.length ? (
        <div className="rounded-[14px] border border-line-hairline bg-surface-card px-4 sm:px-6">
          {rows.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-3 border-b border-line-hairline py-3.5 last:border-b-0"
            >
              <span className="w-full font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted sm:w-auto">
                {(d.room || '').toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">
                {d.said || '—'}
              </span>
              <span className="min-w-0 truncate text-meta text-voidInk-body">{d.did || '—'}</span>
              <VerdictBadge verdict={d.verdict} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[14px] border border-line-hairline bg-surface-card p-6 text-center text-meta text-ink-muted">
          Nothing was recorded in this week.
        </div>
      )}
    </div>
  )
}
