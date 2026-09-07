/* The row of secondary moves beside the primary MoveCard — other rooms'
   next-best recommendations. Same "demo only for now" note as MoveCard.jsx:
   real content waits on Waiver, Strategy and Trade having something of
   their own to say. */
export default function SecondaryMoves({ items }) {
  if (!items || !items.length) return null
  return (
    <div className="mx-auto mt-2.5 grid max-w-[1280px] gap-2.5 px-5 sm:grid-cols-2 sm:px-10 lg:grid-cols-3">
      {items.map((it) => (
        <div key={it.title} className="rounded-2xl border border-line-hairline bg-[#151920] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] tracking-[0.1em] text-ink-muted">
              {String(it.room || '').toUpperCase()}
            </span>
            <span className="font-mono text-[11px] text-mint">{it.conf}%</span>
          </div>
          <div className="mt-1.5 text-[14px] font-semibold leading-snug text-white">{it.title}</div>
        </div>
      ))}
    </div>
  )
}
