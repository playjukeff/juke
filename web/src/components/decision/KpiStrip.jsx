/* P4 / P1 — the strip of three or four numbers a room opens with.

   It replaces the loose run of "FAAB LEFT · CLAIMS RUN · HIT RATE" text
   every room hero grew its own version of. Four cards, one shape, and the
   shape is the argument: an accent rule that says what KIND of number this
   is, a mono label, the number itself with its delta on the same baseline,
   and one line saying what it is measured against.

   ---- The accent rule is the only thing that varies ----

   `cost` / `gain` / `evidence` / `stake`, and never teal. Teal is the brand
   and the action; a KPI is neither, and a cyan numeral is the single thing
   this system exists to stop. The rule is 20x3px because it has to be read
   as a category mark and not as a bar: a bar's LENGTH is a datum and this
   one's is not.

   ---- Why the delta sits on the value's baseline ----

   Two numbers stacked read as two facts. On one baseline, at a quarter of
   the size, in the sign colour, the delta reads as a qualifier of the value
   above it — which is what it is. The sign is a real U+2212 or +, never a
   hyphen: a hyphen at 12px in a mono face beside a minus sign elsewhere on
   the page is two different characters for one meaning.

   ---- Mobile ----

   A horizontal snap scroller rather than a 2x2 grid. Four KPIs stacked two
   deep is most of a phone screen before the thing they summarise, which is
   the same measurement the Your Insights header already records at 375px. */

import { KPI_ACCENT, signed } from './tokens.js'

export function KpiCard({ label, value, delta, deltaSign, note, accent = 'evidence', index = 0 }) {
  return (
    <div
      className="jd-rise jd-lift min-w-[150px] shrink-0 snap-start rounded-kpi border border-hairline bg-slate-panel px-[15px] py-[14px] sm:min-w-0 sm:shrink"
      style={{ '--i': index }}
    >
      <span className="block h-[3px] w-5 rounded-full" style={{ background: KPI_ACCENT[accent] }} />
      <p className="mt-2.5 font-plex text-label uppercase text-ink-label">{label}</p>
      <div className="mt-1.5 flex items-baseline">
        <span className="font-decision text-kpi text-ink">{value}</span>
        {delta ? (
          <span
            className={
              'ml-2 font-plex text-[12px] tabular-nums ' +
              (deltaSign === 'cost' ? 'text-cost' : deltaSign === 'gain' ? 'text-gain' : 'text-ink-soft')
            }
          >
            {signed(delta, deltaSign)}
          </span>
        ) : null}
      </div>
      {note ? <p className="mt-1 text-[12px] leading-snug text-ink-soft">{note}</p> : null}
    </div>
  )
}

export default function KpiStrip({ items = [], className = '' }) {
  if (!items.length) return null
  const cols = items.length >= 4 ? 'sm:grid-cols-4' : items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
  return (
    <div
      data-kpi-strip
      className={
        'no-scrollbar -mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1 ' +
        'sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0 ' +
        cols +
        (className ? ' ' + className : '')
      }
    >
      {items.map((k, i) => (
        <KpiCard key={k.label} {...k} index={i} />
      ))}
    </div>
  )
}
