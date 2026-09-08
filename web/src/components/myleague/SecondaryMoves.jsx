import Confidence from '../decision/Confidence.jsx'

/* The row of secondary moves beside the primary MoveCard — other rooms'
   next-best recommendations. Same "demo only for now" note as MoveCard.jsx:
   real content waits on Waiver, Strategy and Trade having something of
   their own to say. Each card is a real, independent navigation into the
   room it names — never a "promote this to primary" local reassignment —
   so it is an <a href>, the same whole-card-link pattern RoomsGridAlive.jsx
   already uses, rather than a div with nothing behind it.

   ---- Two things the decision system changed (P6, P8) ----

   The percentage in the corner is gone. `71%` in mint was a confidence a
   reader could not weigh — no sample, no error — and it was a value drawn
   in a brand-adjacent green, which is the one thing this system forbids
   outright. Three dots, filled where a signal agrees, says the same amount
   and cannot be mistaken for a measurement.

   And the 1280px column moved out. This used to be a full-bleed row of its
   own; it now sits inside My League's two-column body, and a component that
   re-centres itself inside a parent that has already centred it pads twice
   and reads as a misaligned block. The caller owns the column. */
export default function SecondaryMoves({ items }) {
  if (!items || !items.length) return null
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {items.map((it, i) => (
        <a
          key={it.title}
          href={it.slug ? `#/rooms/${it.slug}` : undefined}
          className="jd-rise jd-lift rounded-card border border-hairline bg-[#151920] p-4"
          style={{ '--i': i }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-plex text-label uppercase text-ink-label">
              {String(it.room || '').toUpperCase()}
            </span>
            {it.confidence ? (
              <Confidence agree={it.confidence.agree} signals={it.confidence.signals} />
            ) : null}
          </div>
          <div className="mt-1.5 text-[14px] font-semibold leading-snug text-white">{it.title}</div>
        </a>
      ))}
    </div>
  )
}
