import VerdictBadge from '../ledger/VerdictBadge.jsx'

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
 * ---- An ungraded week is not an empty one ----
 *
 * A decision is written when Juke makes the call and graded only after the
 * week is over, so a week that has just happened is full of rows with no
 * verdict. That is the normal case rather than an edge, and the summary
 * line counts what is graded rather than implying the rest went well.
 */
export default function PastWeekPanel({ weekKey, rows, onBack }) {
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
          className="rounded-full border border-line-hairline px-3.5 py-[7px] text-[13px] font-semibold text-voidInk-body transition-colors duration-150 hover:text-white"
        >
          Back to this week
        </button>
      </div>

      {isDraft ? (
        <div className="rounded-[14px] border border-line-hairline bg-surface-card p-6 text-[13px] leading-relaxed text-voidInk-body">
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
              <span className="min-w-0 truncate text-[13px] text-voidInk-body">{d.did || '—'}</span>
              <VerdictBadge verdict={d.verdict} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[14px] border border-line-hairline bg-surface-card p-6 text-center text-[13px] text-ink-muted">
          Nothing was recorded in this week.
        </div>
      )}
    </div>
  )
}
