import { useMemo } from 'react'
import { myTeam } from '../../rooms/waiverBoard.js'
import {
  bestSwaps, benchRows, injurySeverity, injuryWatch, leagueWeekPts, lineupRows,
  projectedTotal, projectionSource, withLiveActuals, withLiveStatus,
} from '../../rooms/strategyBoard.js'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { useEngine, useJukeTick } from '../../../hooks/useJukeEngine.js'
import { gameInWeek } from '../../../lib/schedule.js'
import { matchupRead, teamWeek } from '../../../lib/matchup.js'
import { Delta, Fig, GoLink, Label, PosTag, Sheet, ValueBar, cx , HIT } from '../ui.jsx'
import {
  CallHead, CouldNotRead, Empty, Loading, MarkedBar, NoTeam, Note, PlayerRow, Pts, SampleTag, SituationBand,
  StatusChip, Step, StepBars, Steps, playerHref, sampleBandItems, teamHref,
} from './callKit.jsx'
import { swappedRows } from './callData.js'
import { matchupHref } from '../league/matchupData.js'

/* The Lineup tool — production's Strategy Room, as the tool Now's lineup
   call opens.

   Every number is production's. The week's scorer is strategyBoard.js's
   leagueWeekPts() (the league's own projection first, Juke's weekly block
   under the league's rules second, the season average third, a bye zeroed);
   the platform's live designations are laid over the board by
   withLiveStatus(), so a locked player is never offered and never listed as
   might-not-play; the opponent comes off lib/schedule.js; the spread off
   JukeEngine.weeklyCV() and the probability off JukeEngine.winProbability().
   Nothing here is a second model.

   ---- What production's four tabs became ----

   Lobby, Lineup, Start/Sit Lab and Injury Watch are one page here, arranged
   by the decision rather than by the tab: the call (the one swap, with its
   arithmetic), the matchup it moves, then the working — the lineup as set
   and the bench, every swap worth making, and everybody who might not play.
   The four KPI cards are not a strip: each figure lives in the block it
   describes (projected total on the lineup, the swap on the call, the count
   on might-not-play, win probability on the matchup, best on the bench on
   the bench). */

function useLineupModel(league, snapshot) {
  const engine = useEngine()
  useJukeTick(engine)
  const boardReady = !!(engine && engine.dataReady && engine.dataReady())
  const board = boardReady ? engine.board() : []
  const boardById = useMemo(
    () => new Map(board.map((p) => [String(p.id), p])),
    // board.length, never board: the array is mutated in place and only its
    // length moves when players.js lands (CLAUDE.md on memo keys).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length]
  )
  const mine = myTeam(snapshot, league)
  const week = snapshot ? snapshot.week : null
  const byId = useMemo(
    () => withLiveActuals(withLiveStatus(boardById, snapshot && snapshot.status, week), snapshot && snapshot.actuals, week),
    [boardById, snapshot, week]
  )
  const leagueRules = snapshot && snapshot.rules ? snapshot.rules : null
  const weekPts = useMemo(() => leagueWeekPts(engine, snapshot), [engine, snapshot])

  const lineup = useMemo(() => lineupRows(mine, byId, weekPts), [mine, byId, weekPts])
  const bench = useMemo(() => benchRows(mine, byId, weekPts), [mine, byId, weekPts])
  const swaps = useMemo(() => bestSwaps(mine, byId, weekPts, week, 10), [mine, byId, weekPts, week])
  const total = useMemo(() => projectedTotal(mine, byId, weekPts), [mine, byId, weekPts])
  const game = useMemo(() => gameInWeek(snapshot && snapshot.schedule, league && league.ownerId, week), [snapshot, league, week])
  const opponent = useMemo(() => {
    if (!game || !game.opponentId || !snapshot) return null
    return (snapshot.teams || []).find((t) => t.ownerId === game.opponentId) || null
  }, [game, snapshot])
  const oppTotal = useMemo(() => (opponent ? projectedTotal(opponent, byId, weekPts) : null), [opponent, byId, weekPts])
  // boardReady in the deps, or this answers null for the life of a cold
  // load: engine never changes identity and weeklyCV() waits on dataReady().
  const cv = useMemo(() => (engine && engine.weeklyCV ? engine.weeklyCV(leagueRules) : null), [engine, leagueRules, boardReady])
  const oppLineup = useMemo(() => (opponent ? lineupRows(opponent, byId, weekPts) : []), [opponent, byId, weekPts])
  const mineWeek = useMemo(() => teamWeek(lineup, cv), [lineup, cv])
  const oppWeek = useMemo(() => teamWeek(oppLineup, cv), [oppLineup, cv])
  const winProb = useMemo(() => (engine && engine.winProbability ? engine.winProbability(mineWeek, oppWeek) : null), [engine, mineWeek, oppWeek])
  const best = swaps[0] || null
  // The same model read once more with the swap made. Only when the starter
  // being sat still projects: a bye or an OUT starter's row carries his
  // ordinary projection into the model, so "after" would understate the call.
  const winAfter = useMemo(() => {
    if (!best || best.replacing || !engine || !engine.winProbability) return null
    return engine.winProbability(teamWeek(swappedRows(lineup, best, weekPts), cv), oppWeek)
  }, [best, lineup, weekPts, cv, oppWeek, engine])
  const hurt = useMemo(() => injuryWatch(mine, byId, week), [mine, byId, week])

  return { engine, board, mine, week, lineup, bench, swaps, best, total, game, opponent, oppLineup, oppTotal, mineWeek, oppWeek, winProb, winAfter, hurt }
}

function noteFor(row, platformName) {
  if (!row.player) return 'Not on Juke’s board, so he cannot be priced'
  const p = row.player
  // A locked player with no actual yet just started — the platform's own
  // score for him has not landed. Locked AND scored is the fact worth
  // saying, so it replaces the bare "locked" note rather than sitting
  // beside it.
  const playedNote = typeof p.actualPts === 'number'
    ? `already scored: ${p.actualPts.toFixed(1)}`
    : p.locked ? 'locked — his game has started' : null
  return [p.team || 'FA', p.bye ? `bye ${p.bye}` : null, playedNote].filter(Boolean).join(' · ')
}

// The figure a row shows: what he has already scored once his game has
// kicked off, else the projection exactly as before.
function pointsFor(row) {
  const actual = row.player && row.player.actualPts
  return typeof actual === 'number' ? actual : row.projPts
}

// A small, neutral chip — not a gain or a cost, a fact about the clock.
function LiveMark() {
  return (
    <span className="rounded-[4px] bg-v3-well px-1.5 py-0.5 font-figure text-[10px] font-bold uppercase tracking-[0.1em] text-v3-ink2">
      Live
    </span>
  )
}

export default function LineupTool({ league, snapshot, status, reason, onRetry, sample = false, sampleInfo = null, action = null }) {
  const m = useLineupModel(league, snapshot)
  const { board, mine, week, lineup, bench, swaps, best, total, game, opponent, oppLineup, oppTotal, mineWeek, oppWeek, winProb, winAfter, hurt } = m

  const platformName = sample ? 'Juke' : platformFor(league && league.provider).name
  const label = sample ? 'Sample call · the lineup' : `Now · the lineup call${league && league.name ? ` · ${league.name}` : ''}`
  const band = sample
    ? <SituationBand sample items={sampleBandItems(sampleInfo, 'lineups set in draft order')} />
    : (
      <SituationBand
        lead="The lineup"
        items={[
          league && league.name,
          platformName,
          snapshot && snapshot.week ? `week ${snapshot.week}` : 'preseason',
          snapshot && snapshot.totalTeams ? `${snapshot.totalTeams} teams` : null,
        ]}
      />
    )
  const shell = (title, lede, body) => (
    <div className="grid gap-8">
      <CallHead label={label} title={title} lede={lede} action={action} band={band} />
      {body}
    </div>
  )

  if (status === 'loading' || (status === 'ready' && !board.length)) return shell('The lineup call.', 'Reading your league…', <Loading />)
  if (status !== 'ready' || !snapshot) return shell('The lineup call.', null, <CouldNotRead reason={reason} onRetry={onRetry} />)
  if (!mine) return shell('The lineup call.', null, <NoTeam teams={snapshot.totalTeams} what="see your lineup" />)
  const source = projectionSource(lineup, snapshot.projections, week)
  const unit = sample ? 'points a game' : 'points this week'
  const read = matchupRead(winProb)
  const readTone = read === 'favoured' ? 'gain' : read === 'behind' ? 'cost' : 'neutral'
  const margin = total === null || oppTotal === null ? null : total - oppTotal
  const swapMax = swaps.length ? Math.max(...swaps.map((s) => s.gain)) : 0
  const hurtStarters = hurt.filter((r) => r.starting).length
  const benchSorted = bench.slice().sort((a, b) => (b.projPts || 0) - (a.projPts || 0))
  const benchBest = benchSorted.length && benchSorted[0].projPts !== null ? benchSorted[0].projPts : null
  // How much of the total below is already-scored rather than projected —
  // said out loud so a blended number never reads as a plain projection it
  // no longer is.
  const scoredCount = lineup.filter((r) => r.player && typeof r.player.actualPts === 'number').length
  const oppScoredCount = (oppLineup || []).filter((r) => r.player && typeof r.player.actualPts === 'number').length
  const liveCoverageLine = scoredCount
    ? ` ${scoredCount} of ${lineup.length} starter${lineup.length === 1 ? '' : 's'} ${scoredCount === 1 ? 'has' : 'have'} already played — ${scoredCount === 1 ? 'that is his' : 'those are their'} actual points, not a projection.`
    : ''
  const statusAt = snapshot.status && Number(snapshot.status.week) === Number(week) ? snapshot.status.at : null
  const liveNote = statusAt
    ? `Designations from ${platformName}, as of ${new Date(statusAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Anybody whose game has kicked off is left off — he has no decision left in him.`
    : sample
      ? 'Designations from tonight’s board. On your league they come from your platform, live.'
      : null
  const sourceLine = total === null
    ? 'A starter has no projection, so there is no total to quote. The swaps still hold.'
    : sample
      ? 'Each player’s season projection, per game, under the scoring your mock is set to.'
      : source === 'all'
        ? `${platformName}’s own projection for week ${week}, under your league’s scoring.`
        : source === 'some'
          ? `${platformName}’s projection where it has one, Juke’s for the rest.`
          : `Juke’s projection for this week, under your league’s own scoring.`

  // The starter being sat, as his row reads, and as he will actually score:
  // a bye or an OUT starter scores nothing, whatever his row projects. The
  // swap's gain is measured against the second; so is the lineup "after".
  const sitRow = best ? lineup.find((r) => r.player && String(r.player.id) === String(best.sit.id)) : null
  const sitRowPts = sitRow && typeof sitRow.projPts === 'number' ? sitRow.projPts : 0
  const sitPts = best ? (best.replacing ? 0 : sitRowPts) : null
  const startPts = best ? best.gain + sitPts : null
  const nowTotal = best && total !== null ? total - (best.replacing ? sitRowPts : 0) : total
  const after = best && nowTotal !== null ? nowTotal + best.gain : null

  const title = best ? `Start ${best.start.name} over ${best.sit.name}.` : 'Your lineup is already the best one.'
  const lede = best
    ? `${signedText(best.gain)} ${unit}${after !== null ? (best.replacing ? ` — ${best.sit.name} scores nothing, so your lineup as set really projects ${nowTotal.toFixed(1)}; with the swap, ${after.toFixed(1)}` : ` — your lineup goes from ${total.toFixed(1)} to ${after.toFixed(1)}`) : ''}${opponent ? `, against ${opponent.teamName}’s ${oppTotal !== null ? oppTotal.toFixed(1) : 'unpriced lineup'}` : ''}.${hurt.length ? ` ${hurt.length} on your roster may not play.` : ''}`
    : `${total !== null ? `It projects ${total.toFixed(1)} ${unit} as set` : 'Some starters have no projection'}${opponent && oppTotal !== null ? `, against ${opponent.teamName}’s ${oppTotal.toFixed(1)}` : ''}. Nothing on the bench beats a starter at his own position.`

  return shell(title, lede, (
    <div className="grid gap-6">
      {/* One grid rather than two stacked ones. The call and the
          matchup were a row of their own, and a call with nothing to do
          is a short card beside a tall one — a band of empty ground
          across the middle of the page while the working sat below it.
          Merged, each column runs continuously and any difference in
          length lands at the foot of the page where it costs nothing. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="grid gap-6">
          <Sheet code="The call · Start / sit" aside={sample ? <SampleTag /> : unit}>
            {best ? (
              <div className="grid gap-5">
                <p className="text-[18px] leading-[1.45] text-v3-ink">
                  Start <a href={playerHref(best.start)} className={cx(HIT, 'font-bold underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink')}>{best.start.name}</a> over{' '}
                  <a href={playerHref(best.sit)} className={cx(HIT, 'font-bold underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink')}>{best.sit.name}</a> —{' '}
                  <Delta value={best.gain} digits={1} className="text-[18px]" /> {unit}.
                </p>
                <Steps>
                  <Step n={1} what={`Project both ${best.start.pos === 'DST' ? 'defenses' : best.start.pos + 's'}`} sub={sample ? 'per game, from the season projection' : 'this week, under your league’s scoring'}>
                    <StepBars
                      max={Math.max(startPts, sitPts, 1)}
                      rows={[
                        { label: `${best.sit.name} (starting)`, value: sitPts, tone: 'neutral' },
                        { label: `${best.start.name} (bench)`, value: startPts, tone: 'neutral' },
                      ]}
                    />
                  </Step>
                  <Step
                    n={2}
                    what={best.replacing ? `${best.sit.name} scores nothing` : 'Same position, so the swap is certainly legal'}
                    sub={best.replacing
                      ? (week && Number(best.sit.bye) === Number(week) ? `he is on bye in week ${week}` : 'he is ruled out')
                      : `a FLEX may allow more, but ${sample ? 'a league' : platformName} does not say which slot is one`}
                  />
                  <Step n={3} what={after !== null ? `${best.replacing ? `Counting ${best.sit.name} at 0, your` : 'Your'} lineup goes from ${nowTotal.toFixed(1)} to ${after.toFixed(1)}` : 'The gap is the call'} sub={winAfter !== null && winProb !== null ? `win probability ${Math.round(winProb * 100)}% → ${Math.round(winAfter * 100)}%` : null}>
                    <p className="font-figure text-[15px] text-v3-ink2">
                      {startPts.toFixed(1)} − {sitPts.toFixed(1)} = <Delta value={best.gain} digits={1} />
                    </p>
                  </Step>
                  {/* Only when the swap is INTO a flagged player, and then it is
                      the condition the gain above is silently assuming. The
                      number is breakEvenPlayOdds() in strategyBoard.js — this
                      draws it and does not decide it. */}
                  {best.needsToPlay !== null && (
                    <Step
                      n={4}
                      what={`This one is a bet on ${best.start.name} playing`}
                      sub={`${platformName} has him ${best.start.inj === 'D' ? 'doubtful' : 'questionable'}, and the slot scores nothing if he sits`}
                    >
                      <p className="font-figure text-[15px] text-v3-ink2">
                        {sitPts.toFixed(1)} ÷ {startPts.toFixed(1)} = worth it at about{' '}
                        <Fig className="font-bold text-v3-ink">{Math.round(best.needsToPlay * 100)}%</Fig> to play
                      </p>
                    </Step>
                  )}
                </Steps>
              </div>
            ) : (
              <div className="grid gap-3">
                <p className="text-[18px] leading-[1.45] text-v3-ink">
                  Nothing on your bench beats a starter at his own position — this lineup is the best one Juke can prove from this roster.
                </p>
                <p className="text-[15px] leading-[1.55] text-v3-ink2">
                  {total !== null ? <>It projects <Fig className="font-bold text-v3-ink">{total.toFixed(1)}</Fig> {unit} as set.</> : 'Some starters have no projection, so there is no total to quote.'}
                  {benchBest !== null && <> Your best bench player projects <Fig className="font-bold text-v3-ink">{benchBest.toFixed(1)}</Fig>.</>}
                </p>
              </div>
            )}
          </Sheet>
          <Sheet code="Your lineup, as set" aside={total === null ? 'not all projected' : `${total.toFixed(1)} ${sample ? 'pts / gm' : scoredCount ? 'so far' : 'proj'}`} bodyClass="px-4 pb-4 pt-1 sm:px-5">
            {lineup.length ? (
              <ul>
                {lineup.map((row) => (
                  <PlayerRow
                    key={row.id}
                    player={row.player}
                    pos={row.player ? row.player.pos : 'DST'}
                    dim={!row.player}
                    name={row.player ? row.player.name : 'Unknown player'}
                    meta={noteFor(row, platformName)}
                    right={
                      <span className="flex items-center gap-3">
                        {row.player && typeof row.player.actualPts === 'number' ? <LiveMark /> : null}
                        {row.player && row.player.inj ? (
                          <span className={cx('rounded-[4px] px-1.5 py-0.5 font-figure text-[11px] font-bold uppercase', injurySeverity(row.player.inj) === 'out' ? 'bg-v3-costWash text-v3-cost' : 'bg-v3-warnWash text-v3-warn')}>{row.player.inj}</span>
                        ) : null}
                        <Pts value={pointsFor(row)} />
                      </span>
                    }
                  />
                ))}
              </ul>
            ) : <Empty>No lineup is set for this week yet.</Empty>}
            <Note>{sourceLine}{liveCoverageLine}</Note>
          </Sheet>

          <Sheet code="Bench" aside={benchBest !== null ? `best ${benchBest.toFixed(1)}` : `${bench.length} players`} bodyClass="px-4 pb-4 pt-1 sm:px-5">
            {benchSorted.length ? (
              <ul>
                {benchSorted.map((row) => (
                  <PlayerRow
                    key={row.id}
                    player={row.player}
                    meta={noteFor(row, platformName)}
                    right={
                      <span className="flex items-center gap-3">
                        {row.player && typeof row.player.actualPts === 'number' ? <LiveMark /> : null}
                        <Pts value={pointsFor(row)} />
                      </span>
                    }
                  />
                ))}
              </ul>
            ) : <Empty>Nobody on the bench.</Empty>}
          </Sheet>
        </div>

        <div className="grid gap-6">
          <MatchupSheet
            sample={sample}
            week={week}
            game={game}
            opponent={opponent}
            total={total}
            oppTotal={oppTotal}
            margin={margin}
            winProb={winProb}
            readTone={readTone}
            mineWeek={mineWeek}
            oppWeek={oppWeek}
            scoredCount={scoredCount}
            oppScoredCount={oppScoredCount}
            provider={league && league.provider}
          />
          <Sheet code="Every swap worth making" aside={unit} bodyClass="px-4 pb-4 pt-1 sm:px-5">
            {swaps.length ? (
              <ul>
                {swaps.map((s) => (
                  <li key={s.sit.id + ':' + s.start.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-v3-rule py-2.5 last:border-b-0">
                    <PosTag pos={s.start.pos} />
                    <span className="min-w-0">
                      <a href={playerHref(s.start)} className={cx(HIT, 'block truncate text-[15px] font-semibold text-v3-ink hover:underline')}>Start {s.start.name}</a>
                      <span className="block truncate text-[12px] text-v3-ink3">over {s.sit.name}{s.replacing ? ' · that slot scores 0 as set' : ''}</span>
                    </span>
                    <Delta value={s.gain} digits={1} className="text-[15px]" />
                    <ValueBar value={s.gain} max={swapMax} tone="gain" className="col-span-3" />
                  </li>
                ))}
              </ul>
            ) : <Empty>Your lineup is already the best one Juke can build from this roster.</Empty>}
            <Note>
              Same position only. A FLEX may well allow more, but {sample ? 'a league’s snapshot' : platformName} does not tell Juke which of your slots is one — so these are the swaps that are certainly legal rather than the ones that might be.
            </Note>
          </Sheet>

          <Sheet code={week ? `Might not play · week ${week}` : 'Might not play'} aside={hurt.length ? `${hurt.length} · ${hurtStarters} starting` : 'nobody'} bodyClass="px-4 pb-4 pt-1 sm:px-5">
            {hurt.length ? (
              <ul>
                {hurt.map((row) => (
                  <PlayerRow key={row.player.id} player={row.player} meta={row.starting ? 'in your lineup' : 'on your bench'} right={<StatusChip row={row} />} />
                ))}
              </ul>
            ) : <Empty>Nobody on your roster carries an injury designation or a bye this week.</Empty>}
            {liveNote && <Note>{liveNote}</Note>}
          </Sheet>
        </div>
      </div>
    </div>
  ))
}

function signedText(n) {
  const r = Number(n).toFixed(1)
  return n > 0 ? `+${r}` : n < 0 ? `−${r.replace('-', '')}` : r
}

/* Who you play and how likely the lineup as set is to be enough.
   The bar's reference is EVEN — 50% by construction, and the only mark on
   these pages not measured from anything. */
function MatchupSheet({ sample, week, game, opponent, total, oppTotal, margin, winProb, readTone, mineWeek, oppWeek, scoredCount = 0, oppScoredCount = 0, provider }) {
  const oppLink = opponent && teamHref(opponent) && !sample
    ? <a href={teamHref(opponent)} className="font-bold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink">{opponent.teamName}</a>
    : opponent ? <span className="font-bold text-v3-ink">{opponent.teamName}</span> : null
  const code = sample ? 'The matchup · sample' : week ? `The matchup · week ${week}` : 'The matchup'

  if (!opponent) {
    const why = !game && provider === 'sleeper'
      ? 'Sleeper publishes no season schedule, so there is no opponent to price against.'
      : game && !game.opponentId
        ? 'You are on a bye this week.'
        : 'No game on the schedule for this week.'
    return (
      <Sheet code={code} aside="No opponent">
        <p className="text-[15px] leading-[1.55] text-v3-ink2">{why}</p>
        {!sample ? <div className="mt-4"><GoLink href={matchupHref(week)}>{!game && provider === 'sleeper' ? 'The pairing, on the matchup page' : 'Every game this week'}</GoLink></div> : null}
      </Sheet>
    )
  }

  const pct = winProb === null ? null : Math.round(winProb * 100)
  const color = readTone === 'gain' ? 'text-v3-gain' : readTone === 'cost' ? 'text-v3-cost' : 'text-v3-ink'
  return (
    <Sheet code={code} aside={sample ? <SampleTag /> : `${game.home ? 'vs' : 'at'} ${opponent.teamName}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Label>Win probability</Label>
          <p className="mt-1 text-[15px] text-v3-ink2">{game.home ? 'vs' : 'at'} {oppLink}</p>
        </div>
        <Fig className={cx('text-[56px] font-extrabold leading-none', color)}>{pct === null ? '—' : `${pct}%`}</Fig>
      </div>
      {pct !== null ? (
        <MarkedBar
          className="mt-4"
          value={winProb}
          max={1}
          tone={readTone}
          marker={{ at: 0.5, label: 'Even' }}
          label={`Win probability ${pct} percent against ${opponent.teamName}`}
        />
      ) : null}
      <dl className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-[6px] bg-v3-paper p-3"><dt><Label className="text-[11px]">You</Label></dt><dd className="mt-1"><Pts value={total} /></dd></div>
        <div className="rounded-[6px] bg-v3-paper p-3"><dt><Label className="text-[11px]">Them</Label></dt><dd className="mt-1"><Pts value={oppTotal} /></dd></div>
        <div className="rounded-[6px] bg-v3-paper p-3"><dt><Label className="text-[11px]">Margin</Label></dt><dd className="mt-1"><Delta value={margin} digits={1} className="text-[15px]" /></dd></div>
      </dl>
      <p className="mt-4 text-[13px] leading-[1.55] text-v3-ink2">
        {pct !== null && mineWeek
          ? (
            <>
              Each lineup swings about <Fig className="font-bold text-v3-ink">{Math.round(mineWeek.stdev)}</Fig> points a week
              {scoredCount || oppScoredCount
                ? <>, narrowing as games are played — <Fig className="font-bold text-v3-ink">{scoredCount}</Fig> of yours and <Fig className="font-bold text-v3-ink">{oppScoredCount}</Fig> of theirs have already scored.</>
                : '. A scoring-strength estimate from two projected lineups — not a simulated week.'}
            </>
          )
          : 'Both lineups need a projection for every starter before the odds can be priced.'}
      </p>
      {!sample ? <div className="mt-4"><GoLink href={matchupHref(game.week)}>Both lineups, side by side</GoLink></div> : null}
    </Sheet>
  )
}
