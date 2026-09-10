import { verdictFor } from '../ledger/verdicts.js'

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
          /* min-h-[44px] with centred content: the chips measured 39px,
             and this strip is dragged sideways on a phone, where a
             mis-tap selects the wrong week rather than doing nothing. */
          'inline-flex min-h-[44px] min-w-[44px] flex-none items-center justify-center whitespace-nowrap border-b-2 px-2.5 py-2.5 font-mono text-[11px] tracking-[0.06em] transition-colors duration-150 ' +
          /* Three ranks, and none of them below the floor.

             A week with nothing to show was `text-ink-muted/50`, which
             composites to 2.52:1 -- and the exemption that would have
             covered it does not apply here: WCAG excuses an INACTIVE
             COMPONENT, and a week the strip cannot open renders as a
             <span> a few lines below rather than a disabled <button>. That
             makes it plain text, and plain text has no exemption.

             Dimming further was never the only way to say "not yet". The
             recession is re-ranked instead: the reachable weeks move UP to
             `ink-soft`, so the unreachable ones can sit at full
             `ink-muted` -- still visibly the quietest thing in the strip,
             and 4.87:1 rather than 2.52. Alpha is where this project's
             contrast now fails, and it fails because it is invisible to
             any sweep that reads `color`. */
          (on
            ? 'border-teal text-white'
            : w.disabled
              ? 'border-transparent text-ink-muted'
              : 'border-transparent text-ink-soft hover:text-voidInk-primary')

        const content = (
          <>
            {w.label}
            {w.mark ? (
              /* The tone comes off VERDICTS rather than being typed here.
                 This tick was `text-mint` and the ledger's own good-call
                 badge is `text-gain`, which is one fact in two colours on
                 two screens a click apart -- the drift that map exists to
                 prevent, in the file that was not reading it. */
              <span
                className={'ml-1 ' + verdictFor(w.mark).tone}
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
