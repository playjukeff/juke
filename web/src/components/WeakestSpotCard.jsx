import AnalyticsCard from './AnalyticsCard.jsx'
import { POS_NAMES, POS_CHALK } from './draftRoomPositions.js'

// Row 2, col 1. Headline position plus the full per-position breakdown
// behind it (historyStats()'s weakestSpot + weakestSpotBreakdown in
// app.js, both windowed to the same last-ten mocks the other trend cards
// use) — not just the single worst number standing alone. Falls back to
// holeRounds' own longer sentence when a real, sampled round range backs
// one, same as before; the breakdown list renders either way, since it
// answers a different question ("how does every position compare") than
// holeRounds does ("which rounds specifically").
export default function WeakestSpotCard({ stats }) {
  if (!stats.weakestSpot) {
    return (
      <AnalyticsCard title="Weakest Spot">
        <p className="flex h-full items-center text-xs text-ink-muted">No real hole yet across your rosters.</p>
      </AnalyticsCard>
    )
  }

  const posName = POS_NAMES[stats.weakestSpot.pos] || stats.weakestSpot.pos
  const h = stats.holeRounds
  const breakdown = stats.weakestSpotBreakdown || []
  const maxCount = Math.max(1, ...breakdown.map((r) => r.count))

  return (
    <AnalyticsCard>
      <div className="flex h-full flex-col">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-300/90">Weakest Spot</p>
        <p className="mt-1 font-display text-[22px] font-bold text-white">{posName}</p>
        {h ? (
          <p className="mt-1.5 text-meta leading-[1.5] text-white/75">
            Below replacement in {stats.weakestSpot.pct}% of your last {breakdown[0] ? breakdown[0].total : ''} rosters — it isn't
            your first pick, it's rounds {h.startRound}–{h.endRound}, where you've taken a{' '}
            {(POS_NAMES[h.topOtherPos] || h.topOtherPos).toLowerCase()} {h.topOtherCount} of {h.total} times.
          </p>
        ) : (
          <p className="mt-1.5 text-meta leading-[1.5] text-white/75">
            Below replacement in {stats.weakestSpot.pct}% of your last {breakdown[0] ? breakdown[0].total : ''} rosters — the
            most consistent gap on your board.
          </p>
        )}

        {breakdown.length > 0 && (
          <div className="mt-3 flex flex-1 flex-col justify-center gap-1.5">
            {breakdown.map((row) => (
              <div key={row.pos} className="grid grid-cols-[26px_1fr_44px] items-center gap-2">
                <span className="text-[10px] font-bold text-white/50">{row.pos}</span>
                {/* POS_CHALK, not POS_SOLID. Nothing is written on this
                    bar — every label on the row sits outside it — so the
                    -700 step buys nothing here and costs the whole mark:
                    measured against this card's own track, the six solids
                    run 1.46:1 (DST) to 2.93:1 (TE), every one of them under
                    the 3:1 a non-text mark answers to. A DST bar was
                    effectively not drawn. The chalk fills clear 8.74 at
                    worst, and they are the same six colours the board's
                    cells now carry, so a position learned there is the same
                    colour here. */}
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(row.count / maxCount) * 100}%`, background: POS_CHALK[row.pos] || 'rgba(255,255,255,0.55)' }}
                  />
                </div>
                <span className="whitespace-nowrap text-right text-[10.5px] tabular-nums text-white/70">
                  {row.count} of {row.total}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-2 shrink-0 text-[10px] text-ink-muted">Mocks where the position finished below replacement</p>
      </div>
    </AnalyticsCard>
  )
}
