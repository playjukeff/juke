import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'
import { SampleCard, AccentCard, Bar, PosTile } from './sampleParts.jsx'

/* design_handoff_v3_alive 2hg/3hg — the week, planned.

   Matchup odds, two start/sit calls, and what is coming. Players off the
   live board; the probabilities, the projections and the deltas are the
   sample.

   ---- The bye week is the one number that is real ----

   `bye` is on every board row, from the pipeline, so "BYE x3" can be
   counted rather than asserted: it is how many of these four players are
   actually off in the week the tile names. That matters more than it looks
   — it is the one cell on this screen a reader could check against their
   own roster and find wrong, and the whole point of the card is that the
   bye week is the thing you did not see coming.

   The week numbers themselves follow from it. Rather than the handoff's
   fixed WK 4/5/6, the three tiles start at the earliest week these players
   are actually on bye and walk back two, so the third tile is always the
   one with the byes in it. On a board where nobody in the sample has a bye
   (impossible in practice, every team has one) it falls back to 4/5/6. */

export default function StrategyPreview() {
  const engine = useEngine()
  useJukeTick(engine)

  const board = engine && engine.board ? engine.board() : []
  if (board.length < 60) return null

  const skill = board.filter((p) => ['RB', 'WR', 'TE'].indexOf(p.pos) >= 0)
  const start = skill[18]
  const overPlayer = skill[31]
  const sit = skill.filter((p) => p.pos === 'TE')[4]
  const forPlayer = skill.filter((p) => p.pos === 'TE')[7]
  if (!start || !overPlayer || !sit || !forPlayer) return null

  const four = [start, overPlayer, sit, forPlayer]
  const byes = four.map((p) => p.bye).filter(Boolean)
  const worst = byes.length ? Math.max(...byes) : 6
  const weeks = [worst - 2, worst - 1, worst]
  const byeCount = byes.filter((b) => b === worst).length

  const Call = ({ verb, player, other, reason, delta }) => (
    <SampleCard className="mt-2 flex items-center gap-3 !py-3.5">
      <PosTile pos={player.pos} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-white">
          {verb} {player.name}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-ink-muted">
          {other} · {reason}
        </span>
      </span>
      {/* A weekly points delta is a gain, not the rail's state colour. */}
      <span className="shrink-0 font-mono text-[10px] text-gain">{delta}</span>
    </SampleCard>
  )

  /* Two columns on desktop, one on a phone — the handoff's own split
     (3hg against 2hg), not a width-driven reflow of the same stack. What
     goes right is the card that answers a different question: the matchup
     and the two calls are THIS week, and Next 3 Weeks is the thing you
     would otherwise have to scroll past them to find. */
  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <div>
      <SampleCard>
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold text-white">Week 3 · vs. Sarah</span>
          {/* `evidence`, deliberately not `gain`. A win probability has no
              direction -- 58% is not a gain of anything, it is a quantity,
              and colouring it as good would make the same number read as
              bad at 42 when it is the identical kind of fact. */}
          <span className="font-mono text-[10px] tracking-[0.1em] text-evidence">WIN PROB 58%</span>
        </div>
        {/* No centre tick: 50% on a win-probability bar is a real
            midpoint, but the bar is already labelled with both
            projections underneath it and a second reference mark reads as
            a target. The fairness bar wants one; this does not. */}
        <Bar pct={58} from="#44D4E2" to="#74E5CE" />
        <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-muted">
          <span>YOU 124.6 PROJ</span>
          <span>SARAH 118.9 PROJ</span>
        </div>
      </SampleCard>

      <div className="mt-3 font-mono text-[10px] tracking-[0.14em] text-ink-muted">
        START / SIT · 2 CALLS
      </div>
      <Call
        verb="Start"
        player={start}
        other={`over ${overPlayer.name}`}
        reason={`${start.team} draws a soft outside matchup`}
        delta="+3.2"
      />
      <Call
        verb="Sit"
        player={sit}
        other={`for ${forPlayer.name}`}
        reason={`${forPlayer.team} red-zone looks trending up`}
        delta="+1.9"
      />
      </div>

      <div className="lg:mt-0 lg:[&>div]:mt-0">
      <AccentCard accent="#74E5CE" wash="#0f2a2a" eyebrow="NEXT 3 WEEKS">
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {[
            { wk: weeks[0], who: '@ Marcus', odds: '52%' },
            { wk: weeks[1], who: 'vs. Dev', odds: '67%' },
            { wk: weeks[2], who: `BYE ×${byeCount}`, odds: null },
          ].map((t) => (
            <div key={t.wk} className="rounded-xl bg-surface-page p-2.5">
              <span className="block font-mono text-[9px] tracking-[0.1em] text-ink-muted">
                WK {t.wk}
              </span>
              <span className="mt-1 block text-[13px] font-semibold text-white">{t.who}</span>
              <span
                className="mt-0.5 block font-mono text-[11px]"
                style={{ color: t.odds ? '#74E5CE' : '#F7A8A8' }}
              >
                {t.odds || '—'}
              </span>
            </div>
          ))}
        </div>
      </AccentCard>
      </div>
    </div>
  )
}
