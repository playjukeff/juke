import { verdictFor } from './verdicts.js'

/* One verdict, as a badge: glyph, label, tone.
 *
 * Juke Journey v3 lists this among the primitives "used everywhere", and
 * it genuinely is -- the History screen's rows, My League's past-week
 * body, and eventually a room's own recorded decision all draw the same
 * mark. Written once so the nine states cannot disagree across three
 * screens, which is the failure mode a badge has: it renders either way,
 * so nothing catches it.
 *
 * The label is not abbreviated on narrow screens. "Insufficient evidence"
 * is the longest at 21 characters, and a verdict truncated to "Insufficie…"
 * is a judgement the reader has to guess at -- so the badge wraps out of
 * the row on a phone rather than clipping, which is what `whitespace-nowrap`
 * on the text plus a wrapping parent gives.
 */
export default function VerdictBadge({ verdict, className = '' }) {
  const v = verdictFor(verdict)
  return (
    <span
      className={
        'inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-md border border-line-hairline ' +
        'bg-surface-card px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] ' +
        v.tone +
        (className ? ' ' + className : '')
      }
      /* The glyph is decoration on top of a label that already says the
         same thing, so it is hidden from a screen reader rather than read
         out as "check mark good call". */
    >
      <span aria-hidden="true">{v.glyph}</span>
      {v.label}
    </span>
  )
}
