/* The week-by-week strip under My League's bar — DRAFT, then a run of
   weeks, the current one marked. Genuinely new: nothing in this codebase
   drew a season-long week navigator before this (`draftPhase()` is the
   closest prior art and it is about one event, not a season).

   Deliberately dumb. It draws whatever `weeks` says and calls `onSelect`
   with a cell's `key` when pressed — it has no opinion about where the
   marks or the week count come from, because the two callers need
   different honesty here: MyLeagueDemo fabricates both freely (it says so
   in its own hero) and a real connected league has neither a grading data
   source nor a known season length yet (see seasonPhase.js), so its caller
   passes weeks with no `mark` and no `onSelect` at all.

   A cell with no `onSelect` renders as a `<span>`, never a `<button>` —
   the same "a control that cannot act must not merely fail; it must not
   be offered" rule this project applies everywhere else, here applied to
   the one thing a real week strip cannot yet do: show you what happened. */
export default function WeekStrip({ weeks, selected, onSelect }) {
  return (
    <div className="flex gap-0.5 overflow-x-auto border-b border-line-hairline px-5 sm:px-10">
      {weeks.map((w) => {
        const on = selected === w.key
        const clickable = !!onSelect && !w.disabled
        const cls =
          'flex-none whitespace-nowrap border-b-2 px-2.5 py-2.5 font-mono text-[11px] tracking-[0.06em] transition-colors duration-150 ' +
          (on
            ? 'border-teal text-white'
            : w.disabled
              ? 'border-transparent text-ink-muted/50'
              : 'border-transparent text-ink-muted hover:text-voidInk-primary')

        const content = (
          <>
            {w.label}
            {w.mark ? (
              <span
                className={'ml-1 ' + (w.mark === 'bad' ? 'text-flow-rose' : 'text-mint')}
                aria-label={w.mark === 'bad' ? 'had a bad call' : 'all good calls'}
              >
                {w.mark === 'bad' ? '✗' : '✓'}
              </span>
            ) : null}
          </>
        )

        if (!clickable) {
          return (
            <span key={w.key} aria-current={on ? 'step' : undefined} className={cls}>
              {content}
            </span>
          )
        }
        return (
          <button
            key={w.key}
            type="button"
            aria-current={on ? 'step' : undefined}
            onClick={() => onSelect(w.key)}
            className={cls + ' cursor-pointer'}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
