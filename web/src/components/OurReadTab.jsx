/* The model explaining itself — the thing a projection feed will never
   show you about its own numbers. Ported from the legacy sheet's jukeNote()
   and meters rather than reasoned out again in JSX: engine.jukeReadout()
   makes every decision in app.js, where overallScore()/draftSignals()/
   replacementGap() already live.

   The Juke score's floor is the whole reason this tab is shaped the way it
   is. Around three fifths of the board clamps to exactly 0 — measured
   against three real completed seasons, the same share scored zero there
   as in the projection, so it is arithmetic about a fixed rank cut, not a
   broken model and not something to re-curve. What it is NOT is a verdict:
   of the players who scored zero on one season's actuals, about a third
   were above replacement the next. So a 0 never appears here as a bare
   number — it always carries the un-clamped gap that tells a receiver one
   point below replacement from one sixty below, and the sentence naming
   where startable territory actually begins. */

function Meter({ name, score, label, why, tone }) {
  const filled = Math.round(score / 20)
  return (
    <div className="rounded-lg border border-slate-rule bg-slate-sunk/50 p-2.5 lg:p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs lg:text-sm font-semibold text-white/80">{name}</span>
        <span className={'text-[11px] lg:text-sm font-semibold ' + tone}>{label}</span>
      </div>
      <div className="mt-1.5 lg:mt-2.5 flex gap-1 lg:gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={
              'h-1.5 lg:h-2.5 flex-1 rounded-sm ' +
              (i < filled ? tone.replace('text-', 'bg-') : 'bg-white/10')
            }
          />
        ))}
      </div>
      {why.length > 0 && (
        <p className="mt-1.5 lg:mt-2.5 text-[11px] lg:text-sm leading-relaxed text-ink-muted">{why.join(' · ')}</p>
      )}
    </div>
  )
}

export default function OurReadTab({ engine, player }) {
  const r = engine.jukeReadout(player)

  // No projection at all — nothing to score him on, said plainly rather
  // than scored as a zero. Same rule as a missing season being blank.
  if (r.score === null && !r.unranked) {
    return (
      <p className="px-1 py-6 text-center text-sm leading-relaxed text-ink-muted">
        No projection for this player yet, so there is nothing to score him on. The nightly data
        refresh fills this in for anyone Sleeper carries.
      </p>
    )
  }

  /* Three bands, not two. A gap of exactly 0 is the case that reads worst
     as a bare score — Justin Herbert projects 338 points and lands here
     because he is QB11 in a league that starts ten quarterbacks — so it
     belongs with "about replacement level", not with the genuinely
     positive gaps. 20 points is roughly three games across a season:
     inside that band either way, the honest sentence is "you can wait". */
  const nearReplacement = r.gap !== null && r.gap <= 0 && Math.abs(r.gap) <= 20
  const belowReplacement = r.gap !== null && r.gap < 0 && Math.abs(r.gap) > 20
  const aboveReplacement = r.gap !== null && r.gap > 0
  const scoreTone =
    r.score === null ? 'text-ink-muted' : r.score >= 55 ? 'text-teal-300' : r.score >= 18 ? 'text-white/80' : 'text-white/50'

  return (
    <div className="flex flex-col gap-3 lg:gap-5">
      {/* The score itself, with its own name beside it — never a bare
          number. "Juke score" everywhere, per the one-number-one-name
          rule; this is the same figure the queue's Value column shows. */}
      <div className="rounded-lg border border-slate-rule bg-slate-sunk/50 p-3 lg:p-6">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs lg:text-base font-semibold uppercase tracking-wide text-white/50">Juke score</span>
          {r.unranked ? (
            <span className="text-sm lg:text-lg font-bold text-ink-muted">Not rated</span>
          ) : (
            <span className="flex items-baseline gap-2 lg:gap-3">
              <span className={'font-display text-2xl lg:text-5xl font-bold ' + scoreTone}>{r.score}</span>
              <span className="text-[11px] lg:text-base font-semibold text-ink-muted">{r.label}</span>
            </span>
          )}
        </div>

        {r.unranked ? (
          <p className="mt-2 lg:mt-3 text-[11px] lg:text-sm leading-relaxed text-ink-muted">{r.unrankedNote}</p>
        ) : (
          <>
            {/* The clamped-zero explanation. This is the line that stops a
                0 reading as "worthless": it names the floor and gives the
                distance to it, which is the only thing separating two
                players who both score 0. */}
            {/* A near-replacement player at a shallow position is the case
                that reads worst as a bare 0 — Justin Herbert projects 338
                points and scores 0 because he is QB11 in a league that
                starts ten quarterbacks. That is scarcity, not a low
                opinion of him, and it needs saying in those words rather
                than the generic below-replacement note. 20 points is
                roughly three games' difference over a season: inside it,
                the honest sentence is "you can wait". */}
            {nearReplacement && (
              <p className="mt-2 lg:mt-3 text-[11px] lg:text-sm leading-relaxed text-amber-300/80">
                <span className="font-semibold">About replacement level</span> — this is roughly what a
                freely available {player.pos} is worth, because startable {player.pos} territory runs to{' '}
                <span className="font-semibold">{r.replacementRank}</span> on this board. The projected
                points are real; a low score here means you can wait rather than spend a pick, not that
                the player is bad.
              </p>
            )}
            {belowReplacement && (
              <p className="mt-2 lg:mt-3 text-[11px] lg:text-sm leading-relaxed text-amber-300/80">
                <span className="font-semibold">Below replacement</span> — {Math.abs(r.gap)} points under a
                replacement starter, where startable {player.pos} territory begins at{' '}
                <span className="font-semibold">{r.replacementRank}</span> on this board. A score of 0 is a
                floor, not a verdict: about a third of the players who scored zero on one season's actuals
                were above replacement the next.
              </p>
            )}
            {aboveReplacement && (
              <p className="mt-2 lg:mt-3 text-[11px] lg:text-sm leading-relaxed text-teal-300/80">
                <span className="font-semibold">+{r.gap} points</span> above a replacement starter — startable{' '}
                {player.pos} territory begins at{' '}
                <span className="font-semibold">{r.replacementRank}</span> on this board.
              </p>
            )}
            <p className="mt-1.5 lg:mt-2 text-[11px] lg:text-sm leading-relaxed text-ink-muted">{r.reason}</p>
          </>
        )}
      </div>

      {/* Deep-bench players (extend_deep_bench() in build_players.py) keep
          their score — there's no three-season finding that the ranking is
          wrong the way there is for K/DST, only the fact that no real
          draft has ever priced this player. So this is a note beside the
          score above, not a swap of it. */}
      {r.deep && (
        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 lg:px-4 lg:py-3 text-[11px] lg:text-sm leading-relaxed text-ink-muted">
          <span className="font-semibold text-white/70">Deep board</span> — {r.deepNote}
        </p>
      )}

      {r.upside !== null && (
        <div className="grid grid-cols-2 gap-2 lg:gap-4">
          <Meter
            name="Room to grow"
            score={r.upside}
            label={r.upsideLabel}
            why={r.upsideWhy}
            tone={r.upside >= 55 ? 'text-teal-300' : 'text-white/60'}
          />
          <Meter
            name="Bust risk"
            score={r.bust}
            label={r.bustLabel}
            why={r.bustWhy}
            tone={r.bust >= 55 ? 'text-rose-400' : r.bust >= 35 ? 'text-amber-300' : 'text-white/60'}
          />
        </div>
      )}

      {/* What we said last season against what he did — the one number on
          this card that can be checked rather than believed. A missing
          season is blank, never zero. */}
      {r.priorScore !== null && r.priorSeason && (
        <div className="rounded-lg border border-slate-rule bg-slate-sunk/50 p-2.5 lg:p-4">
          <p className="text-[11px] lg:text-sm leading-relaxed text-white/50">
            Scored <span className="font-semibold text-white/80">{r.priorScore}</span> on {r.priorSeason}{' '}
            actuals
            {r.priorGames !== null && (
              <span className="text-ink-muted">
                {' '}
                ({r.priorGames} game{r.priorGames === 1 ? '' : 's'})
              </span>
            )}
            .
          </p>
        </div>
      )}

      {!r.unranked && (
        <p className="text-[10px] lg:text-xs leading-relaxed text-ink-muted">
          The Juke score is projected points above the last startable player at this position in a{' '}
          {r.teams}-team league, as a share of the best such figure on the board. It is a ranking against
          the pool, not a rating of the player — somebody always scores 100, and most of the {r.boardSize}{' '}
          players here score nothing at all, because this league only ever starts {r.startersInPlay} of them
          at once. One model's opinion, not a consensus of analysts.
        </p>
      )}
    </div>
  )
}
