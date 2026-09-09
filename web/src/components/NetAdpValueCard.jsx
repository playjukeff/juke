import AnalyticsCard from './AnalyticsCard.jsx'
import { STEEL, OXBLOOD } from './insights/tokens.js'

// The card's own fixed slot count — historyStats() already windows
// netAdpValueHistory to the same ten in app.js, so this is naming that
// number rather than choosing a second one. Slots beyond the real entries
// render transparent rather than the row simply being narrower: the layout
// stays the same width from a user's first mock through their tenth, and a
// bar only ever *appears* in a slot, it never resizes the ones beside it.
const SLOT_COUNT = 10

// One column per mock — steel blue growing up from the centre line for a
// bargain, oxblood growing down for a reach. Neither hue names a POSITION
// (draftRoomPositions.js owns that vocabulary), so both are free to carry
// "positive"/"negative" here without colliding with an existing rule.
// Oxblood instead of the heatmap's alarm red on purpose — a reach here is
// an ordinary outcome, not the kind of real problem the heatmap's red is
// flagging, and borrowing that colour for it would overstate that; #BE6153
// is a muted oxblood, not #F87171.
//
// The pair moved to insights/tokens.js when the Your Insights panel turned
// out to want exactly these two hexes for exactly these two meanings — the
// room, and what a decision cost. Imported rather than re-typed there: two
// copies of a data-series colour drift the first time either is retuned, and
// nothing would say so. This card is unrendered today (DraftLocker.jsx's own
// note on what left that screen) and the import is what keeps it correct
// rather than merely present.
// flex-1 rather than a fixed pixel width: a fixed width is what "tucked to
// the left" in a wide card actually was — ten bars each claiming exactly
// 5px left the other 90% of the card as bare background. flex-1 makes
// every slot claim an equal share of whatever width the card actually has,
// real or empty. top/bottom/height as percentages are safe here (relative
// to this element's own height); a percentage margin is not (the CSS spec
// resolves margin-top/bottom percentages against the containing block's
// WIDTH, not its height), which is why this is built with absolute
// positioning rather than a margin-based flex trick.
function Bar({ entry, index, maxAbs }) {
  if (!entry) {
    return <div className="h-full min-w-[6px] flex-1" title={`Mock ${index + 1}: not run yet`} />
  }
  const pct = maxAbs > 0 ? (Math.abs(entry.value) / maxAbs) * 48 : 0
  const positive = entry.value >= 0
  return (
    <div
      className="relative h-full min-w-[6px] flex-1"
      title={`Mock ${index + 1}: ${entry.value >= 0 ? '+' : ''}${Math.round(entry.value)} picks ${entry.vsPar ? 'vs. par for your seat' : 'vs. board rank'}`}
    >
      <div
        className="absolute left-0 right-0 rounded-[1px]"
        style={{
          background: positive ? STEEL : OXBLOOD,
          ...(positive ? { bottom: '50%', height: `${pct}%` } : { top: '50%', height: `${pct}%` }),
        }}
      />
    </div>
  )
}

/* Row 3, col 1 — one bar per mock, historyStats()'s netAdpValueHistory.

   Measured against par for the seat, not raw. Raw, this chart could not come
   out positive for most people and then reported that as a record: an owner
   drafting from seat 1 read "you beat ADP in 0 of 10 mocks". Three measured
   reasons, none of them about drafting — the first pick is capped at zero
   because nothing ranks below 1, need-based drafting reaches by construction
   (the app schedules those reaches itself), and the room does not sum to zero,
   coming out −41 to −44 across ten rooms. Seat is most of the rest: mean raw
   value by chair ran −28 … +15, a 43-point spread on where you sat, against
   +2 … +5 once par is subtracted. See historyStats() in app.js.

   Positive now means you beat what a consensus drafter would have got from
   your chair; negative means you fell short of it. `vsPar` on each entry says
   whether par was actually available, so an entry too old to carry its own
   league shape still draws — labelled as the raw figure it is rather than
   silently mixed in as though it were comparable.

   **The "you beat ADP in N of M mocks" line is gone rather than re-pointed at
   par, and that is deliberate.** Par is unbiased — measured, the gap between
   par and the mean raw figure is −1 at ten teams and +1 at twelve — but the
   distribution around it is bimodal, not symmetric, so a count against zero
   still under-reads. Twelve seat-1 mocks came out −14, −14, −13, −13, −13,
   −13, −10, −6, −3, +25, +26, +31: mean −1, median −11.5, and only 3 of 12
   above the line. The split is whether that seat's *final* pick landed on a
   skill player near the rank cutoff, which counts and is worth twenty-odd, or
   on a kicker or defence, which FORCED_LATE drops entirely. That is an
   accounting artefact of the metric, not a fact about the drafting, and a
   count against zero reports it as one. The average is the honest summary of
   a distribution shaped like that; the bars show the spread it came from. */
export default function NetAdpValueCard({ stats }) {
  const entries = stats.netAdpValueHistory
  if (!entries || !entries.length) {
    return (
      <AnalyticsCard title="Net ADP Value" sub="Against par for your seat, per mock">
        <p className="flex h-full items-center text-xs text-ink-muted">Not enough mocks yet.</p>
      </AnalyticsCard>
    )
  }

  const maxAbs = Math.max(1, ...entries.map((e) => Math.abs(e.value)))
  const agg = stats.avgNetAdpValue
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => entries[i] || null)
  // Any entry old enough to predate a stored league shape has no par, so the
  // card says what it is actually showing rather than claiming par for a
  // mixture. Every entry written since carries one.
  const anyRaw = entries.some((e) => !e.vsPar)

  return (
    <AnalyticsCard
      title="Net ADP Value"
      sub={anyRaw ? 'Sum of (actual pick − ADP), per mock' : 'Against par for your seat, per mock'}
      right={
        typeof agg === 'number' ? (
          <span
            className="font-display text-sm font-bold tabular-nums"
            style={{ color: agg >= 0 ? STEEL : OXBLOOD }}
          >
            {agg >= 0 ? '+' : ''}{Math.round(agg)}
          </span>
        ) : null
      }
    >
      <div className="flex h-full flex-col">
        <div className="relative flex min-h-[80px] flex-1 items-stretch gap-[3px]">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/15" />
          {slots.map((e, i) => <Bar key={e ? e.id : 'ghost' + i} entry={e} index={i} maxAbs={maxAbs} />)}
        </div>
        <p className="mt-1.5 shrink-0 text-[10px] text-ink-muted">
          {anyRaw
            ? 'Against the board’s own rank. Older mocks predate the par baseline.'
            : 'Par is what a consensus drafter gets from your chair. Zero is on pace.'}
        </p>
      </div>
    </AnalyticsCard>
  )
}
