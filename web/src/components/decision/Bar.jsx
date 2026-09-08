/* P3 / P1 — the thing that replaces a key–value impact table.

   The rule the guide states and this component enforces: any list of numbers
   that share a unit becomes bars scaled to the list's own maximum. A column
   of figures makes a reader do the comparison; a column of bars has already
   done it. That is the whole of P3, and it is why `max` is a required prop
   rather than something each row works out for itself — rows scaled to
   different maxima are four charts stacked, which is worse than the table.

   ---- Three variants, one component ----

   * a plain fill, growing from the left, for a quantity with a direction or
     without one (`sign` decides the colour);
   * a zero axis, for a list that has both signs in it — two tracks meeting
     at a centre line, negatives growing from the right so a cost never
     travels through zero on its way out;
   * a marker, for the one number the bar is read against — a field median, a
     tier cliff, the pick you are on.

   ---- The marker is a line and a word, never a second bar ----

   A reference value drawn as a bar is a second datum competing with the
   first. It is 1px, it is `ink-muted`, and it carries its own label above
   it, because a marker nobody can name is a scratch on the chart.

   ---- Minimum width ----

   4% of the track, so a real but tiny value is visibly present. Zero draws
   nothing at all: an empty track and a `0` beside it is what "this cost you
   nothing" looks like, and a 4% stub in the cost colour is not. */

import { BAR_FILL, INK_MUTED, signed } from './tokens.js'

const MIN_PCT = 4

function pct(value, max) {
  if (!max) return 0
  const share = (Math.abs(value) / Math.abs(max)) * 100
  return share === 0 ? 0 : Math.max(MIN_PCT, Math.min(100, share))
}

/* The track and its fill, with no label and no numeral — the part every
   variant shares, and the part a caller embeds when it already has its own
   row (a queue row, a mobile list). */
export function Bar({ value, max, sign = 'evidence', marker, index = 0, zeroAxis = false, className = '' }) {
  const width = pct(value, max)
  const neg = zeroAxis && value < 0
  return (
    <span className={'relative block h-bar-track w-full rounded-full bg-slate-rule/60 ' + className}>
      {zeroAxis ? (
        <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px" style={{ background: INK_MUTED }} />
      ) : null}
      {width > 0 ? (
        <span
          className="jd-bar-fill absolute inset-y-0 rounded-full"
          data-side={neg ? 'neg' : undefined}
          style={{
            '--i': index,
            background: BAR_FILL[sign] || BAR_FILL.evidence,
            // On a zero axis each half owns 50% of the track, so a value at
            // the list's maximum reaches the end of its own side rather than
            // the end of the track.
            width: (zeroAxis ? width / 2 : width) + '%',
            left: zeroAxis ? (neg ? 'auto' : '50%') : 0,
            right: zeroAxis && neg ? '50%' : 'auto',
          }}
        />
      ) : null}
      {marker ? (
        <span
          className="pointer-events-none absolute -top-[3px] h-[13px] w-px"
          style={{ left: pct(marker.at, max) + '%', background: INK_MUTED }}
          title={marker.label}
        >
          <span className="absolute -top-[12px] left-1/2 -translate-x-1/2 whitespace-nowrap font-plex text-[9.5px] text-ink-muted">
            {marker.label}
          </span>
        </span>
      ) : null}
    </span>
  )
}

/* One row of a list: what it is, how big it is, and the number itself. The
   numeral column is fixed at 56px and tabular so the figures line up down
   the list — the one thing a bar chart takes away from a table and has to
   give back. */
export default function BarRow({
  label,
  value,
  max,
  sign,
  display,
  marker,
  index = 0,
  zeroAxis = false,
  onClick,
  title,
}) {
  const Row = onClick ? 'button' : 'div'
  const tone = sign === 'cost' ? 'text-cost' : sign === 'gain' ? 'text-gain' : 'text-ink'
  return (
    <Row
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={
        'jd-rise grid w-full grid-cols-[minmax(0,1fr)_1fr_56px] items-center gap-3 border-b border-divider py-2 text-left ' +
        (onClick ? 'transition-colors duration-hover hover:bg-white/[0.03]' : '')
      }
      style={{ '--i': index }}
    >
      <span className="truncate text-[13px] text-ink">{label}</span>
      <Bar value={value} max={max} sign={sign} marker={marker} index={index} zeroAxis={zeroAxis} />
      <span className={'text-right font-plex text-[12.5px] tabular-nums ' + tone}>
        {display !== undefined ? display : signed(value, sign)}
      </span>
    </Row>
  )
}
