import { useEffect, useState } from 'react'
import { Delta, Label, PosTag, cx } from '../../ui.jsx'
import { FOCUS } from '../kit.jsx'

/* The player drawer's seven research tabs, redrawn for v3 from the same
   bridge functions production's tab bodies read — jukeReadout(),
   draftFit(), projectionSummary(), projectionRecord(), usageFor(),
   gameLogFor(), Live.news() + newsItemView(), depthChartFor(). Each of those
   already formats every cell and makes every decision in app.js; nothing
   here computes a figure, it only lays out what came back. None of the
   production bodies needed embedding: each was a reading of one function,
   and redrawing a reading is cheap where re-deriving one is not.

   The sentences that carry the method (why a 0 is a floor and not a
   verdict, why a projection runs light on healthy players, why usage does
   not rank) are production's own, kept word for word where they are a
   claim about the data — they were measured, and a rewording is a chance to
   say something the measurement did not. */

const TABLE = 'w-full bg-v3-sheet text-[13px]'
const TH = 'whitespace-nowrap border-b border-v3-rule bg-v3-paper px-2.5 py-2 font-figure text-[11px] font-bold uppercase tracking-[0.08em] text-v3-ink3'
const TD = 'whitespace-nowrap border-b border-v3-rule px-2.5 py-2 font-figure tabular-nums'

function Empty({ children }) {
  return <p className="px-1 py-6 text-center text-[14px] text-v3-ink2">{children}</p>
}

function Box({ label, children, note, className = '' }) {
  return (
    <div className={cx('rounded-[4px] border border-v3-rule bg-v3-sheet px-3 py-2.5', className)}>
      <Label className="block text-[11px]">{label}</Label>
      <div className="mt-1 font-figure text-[20px] font-bold leading-tight tabular-nums text-v3-ink">{children}</div>
      {note && <p className="mt-0.5 text-[13px] leading-snug text-v3-ink2">{note}</p>}
    </div>
  )
}

function Meter({ name, score, label, why, caution }) {
  const filled = Math.round(score / 20)
  return (
    <div className="rounded-[4px] border border-v3-rule bg-v3-sheet p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-bold text-v3-ink">{name}</span>
        <span className={cx('font-figure text-[13px] font-bold', caution ? 'text-v3-warn' : 'text-v3-ink')}>{label}</span>
      </div>
      <div className="mt-2 flex gap-1" role="img" aria-label={`${name}: ${label}`}>
        {Array.from({ length: 5 }, (_, i) => <span key={i} className={cx('h-2 flex-1 rounded-[2px]', i < filled ? (caution ? 'bg-v3-warn' : 'bg-v3-ink') : 'bg-v3-well')} />)}
      </div>
      {why.length > 0 && <p className="mt-2 text-[13px] leading-relaxed text-v3-ink2">{why.join(' · ')}</p>}
    </div>
  )
}

export function OurRead({ engine, player }) {
  const r = engine.jukeReadout(player)
  if (r.score === null && !r.unranked) {
    return <Empty>No projection for this player yet, so there is nothing to score him on. The nightly data refresh fills this in for anyone Sleeper carries.</Empty>
  }
  const near = r.gap !== null && r.gap <= 0 && Math.abs(r.gap) <= 20
  const below = r.gap !== null && r.gap < 0 && Math.abs(r.gap) > 20
  const above = r.gap !== null && r.gap > 0
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[4px] border border-v3-rule bg-v3-sheet p-4">
        <div className="flex items-baseline justify-between gap-2">
          <Label>Juke score</Label>
          {r.unranked ? <span className="text-[15px] font-bold text-v3-ink2">Not rated</span> : (
            <span className="flex items-baseline gap-2">
              <span className="font-figure text-[36px] font-bold leading-none tabular-nums text-v3-ink">{r.score}</span>
              <span className="text-[13px] font-semibold text-v3-ink2">{r.label}</span>
            </span>
          )}
        </div>
        {r.unranked ? <p className="mt-2 text-[14px] leading-relaxed text-v3-ink2">{r.unrankedNote}</p> : (
          <>
            {near && (
              <p className="mt-2 text-[14px] leading-relaxed text-v3-ink2">
                <span className="font-bold text-v3-ink">About replacement level</span> — this is roughly what a freely available {player.pos} is worth, because startable {player.pos} territory runs to <span className="font-bold text-v3-ink">{r.replacementRank}</span> on this board. The projected points are real; a low score here means you can wait rather than spend a pick, not that the player is bad.
              </p>
            )}
            {below && (
              <p className="mt-2 text-[14px] leading-relaxed text-v3-ink2">
                <span className="font-bold text-v3-ink">Below replacement</span> — <Delta value={r.gap} /> points against a replacement starter, where startable {player.pos} territory begins at <span className="font-bold text-v3-ink">{r.replacementRank}</span> on this board. A score of 0 is a floor, not a verdict: about a third of the players who scored zero on one season&apos;s actuals were above replacement the next.
              </p>
            )}
            {above && (
              <p className="mt-2 text-[14px] leading-relaxed text-v3-ink2">
                <Delta value={r.gap} /> points above a replacement starter — startable {player.pos} territory begins at <span className="font-bold text-v3-ink">{r.replacementRank}</span> on this board.
              </p>
            )}
            <p className="mt-1.5 text-[13px] leading-relaxed text-v3-ink2">{r.reason}</p>
          </>
        )}
      </div>
      {r.deep && <p className="rounded-[4px] border border-v3-rule bg-v3-paper px-3 py-2 text-[13px] leading-relaxed text-v3-ink2"><span className="font-bold text-v3-ink">Deep board</span> — {r.deepNote}</p>}
      {r.upside !== null && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Meter name="Upside" score={r.upside} label={r.upsideLabel} why={r.upsideWhy} />
          <Meter name="Bust risk" score={r.bust} label={r.bustLabel} why={r.bustWhy} caution={r.bust >= 35} />
        </div>
      )}
      {r.priorScore !== null && r.priorSeason && (
        <p className="rounded-[4px] border border-v3-rule bg-v3-sheet px-3 py-2.5 text-[14px] text-v3-ink2">
          Scored <span className="font-figure font-bold text-v3-ink">{r.priorScore}</span> on {r.priorSeason} actuals
          {r.priorGames !== null && <span className="text-v3-ink3"> ({r.priorGames} game{r.priorGames === 1 ? '' : 's'})</span>}.
        </p>
      )}
      {!r.unranked && (
        <p className="text-[12px] leading-relaxed text-v3-ink3">
          The Juke score is projected points above the last startable player at this position in a {r.teams}-team league, as a share of the best such figure on the board. It is a ranking against the pool, not a rating of the player — somebody always scores 100, and most of the {r.boardSize} players here score nothing at all, because this league only ever starts {r.startersInPlay} of them at once.
        </p>
      )}
    </div>
  )
}

export function DraftFit({ fit, player }) {
  if (!fit) return <Empty>Draft fit appears once a draft is running — it measures this player against your roster and your next pick.</Empty>
  const { tierLeft, posLeft, picksAway, nextOverall, adp, have, atCap, startsNow, byeClash, bye, market, unranked } = fit
  const spots = (n) => `${n} spot${n === 1 ? '' : 's'}`
  const waitText = picksAway === null ? 'You have no picks left' : picksAway === 0 ? "You're on the clock now" : `${picksAway} picks until your next (${nextOverall} overall)`
  const survives = adp === null || picksAway === null || picksAway === 0 ? null : adp > nextOverall
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Box label="Left in his tier" note={`${posLeft} ${player.pos} left on the board`}><span className={tierLeft <= 2 ? 'text-v3-warn' : ''}>{tierLeft}</span></Box>
        <Box label="Your wait" note={waitText}>{picksAway === null ? '—' : picksAway === 0 ? 'Now' : picksAway}</Box>
        <Box label="Would he start?" note={startsNow ? 'He cracks your best lineup as it stands today' : 'Depth today — which is a normal pick, not a bad one'}>{startsNow ? 'Yes' : 'Bench'}</Box>
        <Box label={`${player.pos} you hold`} note={atCap ? 'At the limit for this position' : have === 0 ? 'None yet' : 'Room for another'}><span className={atCap ? 'text-v3-warn' : ''}>{have}</span></Box>
        <Box label="Bye week" note={!bye ? 'No bye recorded' : byeClash === 0 ? 'Nobody on your roster is out that week' : `${byeClash} already on your roster ${byeClash === 1 ? 'is' : 'are'} out that week`}>
          <span className={byeClash >= 1 ? 'text-v3-warn' : ''}>{bye ? `Wk ${bye}` : '—'}</span>
        </Box>
        {unranked ? (
          <Box label="Market" note={`We don't rank ${player.pos} — the projected order doesn't hold up against what actually happens`}>Not ranked</Box>
        ) : (
          <Box label="Market" note={market === 0 ? 'Drafted about where we rank him' : market > 0 ? `We rank him ${spots(market)} higher than the room does` : `The room rates him ${spots(Math.abs(market))} above where we do`}>
            {market === 0 ? 'Fair' : <Delta value={market} />}
          </Box>
        )}
      </div>
      {survives !== null && (
        <p className="rounded-[4px] border border-v3-rule bg-v3-paper px-3 py-2.5 text-[14px] leading-relaxed text-v3-ink2">
          His ADP is {adp.toFixed(1)} and your next pick is {nextOverall}. {survives ? 'On average he lasts that long — though ADP is an average, and no single draft looks like one.' : 'On average he is gone before then, so waiting is a real risk.'}
        </p>
      )}
    </div>
  )
}

export function Projections({ summary, record }) {
  if (!summary) return <Empty>No projection stored for this player yet.</Empty>
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Box label="Points">{summary.points}</Box>
        <Box label="Per game">{summary.perGame}</Box>
        <Box label="Pos rank">{summary.posRank || '—'}</Box>
        <Box label="vs ADP">{summary.vsAdp === null ? '—' : <Delta value={summary.vsAdp} />}</Box>
      </div>
      {summary.stats.length > 0 && (
        <div>
          <Label className="block">Projected stat line</Label>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {summary.stats.map((s) => (
              <div key={s.label} className="rounded-[4px] bg-v3-paper px-2 py-1.5 text-center">
                <p className="font-figure text-[11px] font-bold uppercase tracking-[0.08em] text-v3-ink3">{s.label}</p>
                <p className="font-figure text-[15px] font-bold tabular-nums text-v3-ink">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {record && record.length > 0 && (
        <div>
          <Label className="block">Our record on him</Label>
          <div className="mt-2 overflow-x-auto rounded-[4px] border border-v3-rule">
            <table className={TABLE}>
              <thead><tr>{['Year', 'We said', 'He got', 'Diff', 'GP'].map((h, i) => <th key={h} className={cx(TH, i ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
              <tbody>
                {record.map((r) => (
                  <tr key={r.year}>
                    <td className={cx(TD, 'text-v3-ink2')}>{r.year}</td>
                    <td className={cx(TD, 'text-right text-v3-ink2')}>{Math.round(r.proj)}</td>
                    <td className={cx(TD, 'text-right font-bold text-v3-ink')}>{Math.round(r.act)}</td>
                    <td className={cx(TD, 'text-right')}><Delta value={r.diff} /></td>
                    <td className={cx(TD, 'text-right text-v3-ink3')}>{r.games === null ? '—' : r.games}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-v3-ink2">A projection is an expected value that prices in injury risk, so it runs about 20 points light on anyone who stays fit — most healthy seasons beat it. Read the difference beside games played.</p>
        </div>
      )}
    </div>
  )
}

export function Usage({ usage }) {
  if (!usage) return <Empty>No usage data for this player.</Empty>
  return (
    <div className="flex flex-col gap-3">
      <Label className="block">How he was used</Label>
      <div className="overflow-x-auto rounded-[4px] border border-v3-rule">
        <table className={TABLE}>
          <thead><tr><th className={cx(TH, 'text-left')}>Year</th>{usage.head.map((h) => <th key={h} className={cx(TH, 'text-right')}>{h}</th>)}<th className={cx(TH, 'text-right')}>GP</th></tr></thead>
          <tbody>
            {usage.rows.map((r) => (
              <tr key={r.year}>
                <td className={cx(TD, 'text-v3-ink2')}>{r.year}</td>
                {r.cells.map((c, i) => <td key={usage.head[i]} className={cx(TD, 'text-right text-v3-ink')}>{c === null ? '—' : c}</td>)}
                <td className={cx(TD, 'text-right text-v3-ink3')}>{r.games === null ? '—' : r.games}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {usage.hasShare && <p className="text-[13px] leading-snug text-v3-ink2">Share is of his team’s whole season, not of the games he played — read it next to GP. A negative air-yards share is real: a screen pass is caught behind the line.</p>}
      {usage.hasModel && <p className="text-[13px] leading-snug text-v3-ink2">xFP is what an average player would have scored from the same opportunities, per the ffverse expected-points model, and ±xFP is how far he beat or trailed that. Both are under the model’s own scoring — the scoring editor does not move them.</p>}
      <p className="text-[13px] leading-snug text-v3-ink3">These explain a season rather than rank a player. Nothing here feeds the Juke score, the suggestions or the CPU — measured against points per game, usage predicted next season no better.</p>
    </div>
  )
}

export function GameLogs({ engine, player }) {
  const [picked, setPicked] = useState(null)
  const log = engine.gameLogFor(player, picked)
  if (!log.year) return <Empty>No week-by-week logs stored for this player.</Empty>
  return (
    <div className="flex flex-col gap-3">
      {log.years.length > 1 && (
        <div role="group" aria-label="Season" className="flex flex-wrap gap-1.5">
          {log.years.map((y) => (
            <button key={y} type="button" aria-pressed={y === log.year} onClick={() => setPicked(y)} className={cx('min-h-[40px] rounded-[4px] border px-3 font-figure text-[13px] font-bold', FOCUS, y === log.year ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet text-v3-ink2 hover:text-v3-ink')}>{y}</button>
          ))}
        </div>
      )}
      <p className="font-figure text-[13px] text-v3-ink2">{log.year} week by week · {log.perGameAvg} per game played</p>
      <div className="overflow-x-auto rounded-[4px] border border-v3-rule">
        <table className={cx(TABLE, 'min-w-max')}>
          <thead><tr>{log.head.map((h) => <th key={h} className={cx(TH, 'text-left')}>{h}</th>)}</tr></thead>
          <tbody>
            {log.rows.map((row, i) => (
              <tr key={i}>
                {row.cells.map((v, j) => (
                  <td key={j} className={cx(TD, row.blank ? 'text-v3-ink3' : j === 1 && row.tone === 'hi' ? 'font-bold text-v3-gain' : j === 1 && row.tone === 'lo' ? 'text-v3-cost' : 'text-v3-ink')}>{v === null ? '—' : v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* No id, no news — never a name search, never league-wide headlines under
   this name. Which player an answer belongs to is checked when it LANDS. */
export function News({ engine, player }) {
  const [items, setItems] = useState(null)
  useEffect(() => {
    setItems(null)
    const theirId = engine.sourceId(player, 'tank')
    if (!theirId || typeof window === 'undefined' || !window.Live || !window.Live.news) { setItems([]); return }
    let stale = false
    window.Live.news(theirId)
      .then((data) => { if (!stale) setItems(((data && data.items) || []).map(engine.newsItemView).filter(Boolean)) })
      .catch(() => { if (!stale) setItems([]) })
    return () => { stale = true }
  }, [engine, player.id, player.name])
  if (items === null) return null
  if (!items.length) return <Empty>No recent headlines for this player.</Empty>
  return (
    <div className="flex flex-col gap-2">
      {items.map((n) => (
        <a key={n.url} href={n.url} target="_blank" rel="noopener noreferrer" className={cx('rounded-[4px] border border-v3-rule bg-v3-sheet p-3 hover:border-v3-ink', FOCUS)}>
          <p className="text-[15px] font-bold text-v3-ink">{n.title}</p>
          {n.summary && <p className="mt-1 text-[13px] leading-relaxed text-v3-ink2">{n.summary}</p>}
          <p className="mt-1.5 font-figure text-[11px] uppercase tracking-[0.08em] text-v3-ink3">{n.source}{n.when ? ` · ${n.when}` : ''}</p>
        </a>
      ))}
      <p className="text-[13px] leading-relaxed text-v3-ink3">Headlines from our news provider, linked rather than reproduced. Juke does not write these and does not endorse them.</p>
    </div>
  )
}

export function Depth({ engine, player }) {
  const groups = engine.depthChartFor(player)
  if (!groups) return <Empty>No depth chart data for {player.team}.</Empty>
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.group}>
          <Label className="block">{g.group}</Label>
          <div className="mt-2 flex flex-col gap-1">
            {g.players.map((p) => (
              <div key={p.name} className={cx('flex items-center gap-2.5 rounded-[4px] border px-3 py-2 text-[14px]', p.isSelf ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet')}>
                <span className={cx('w-4 shrink-0 text-center font-figure text-[12px]', p.isSelf ? 'text-v3-bandInk' : 'text-v3-ink3')}>{p.order || '–'}</span>
                <PosTag pos={p.pos} />
                <span className={cx('min-w-0 flex-1 truncate', p.isSelf ? 'font-bold text-white' : 'text-v3-ink')}>{p.name}</span>
                <span className={cx('shrink-0 font-figure text-[12px]', p.isSelf ? 'text-v3-bandInk' : 'text-v3-ink3')}>ADP {p.adp.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[13px] leading-relaxed text-v3-ink3">Only players inside the draftable pool appear here, so this is the fantasy-relevant depth chart rather than the full roster.</p>
    </div>
  )
}
