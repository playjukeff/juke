import { useMemo } from 'react'
import { myTeam } from '../../rooms/waiverBoard.js'
import {
  bestSwaps, benchRows, injuryWatch, leagueWeekPts, lineupRows,
  projectedTotal, projectionSource, withLiveStatus,
} from '../../rooms/strategyBoard.js'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { useEngine, useJukeTick } from '../../../hooks/useJukeEngine.js'
import { gameInWeek } from '../../../lib/schedule.js'
import { matchupRead, teamWeek } from '../../../lib/matchup.js'
import { Kicker, Tween } from '../v2ui.jsx'
import {
  Bar, BarRow, CouldNotRead, Empty, Footnote, KpiStrip, Loading, NoTeam, Panel, PlayerLine,
  StakeCard, TONE_TEXT,
} from './roomKit.jsx'

/* The Strategy Room, connected. The week is production's: the scorer is
   strategyBoard.js's leagueWeekPts() (the league's own projection first,
   Juke's weekly block under the league's rules second, the season average
   third, a bye zeroed), the opponent comes off lib/schedule.js, the spread
   off JukeEngine.weeklyCV() and the probability off
   JukeEngine.winProbability() — never a second normal difference here.

   Four sections, as production: Lobby, Lineup, Start/Sit Lab, Injury
   Watch. Matchup, Scenarios and Opponent Intel stay unlisted for
   production's reason — nobody has designed them against real data. */

function Pts({ value }) {
  // A dash, never a 0: a 0 here is a real and very different projection.
  if (value === null || value === undefined) return <span className="font-mono text-[13px] text-v2-ink3">—</span>
  return <span className="font-mono text-[15px] font-semibold tabular-nums text-v2-ink">{value.toFixed(1)}</span>
}

function InjuryMark({ row }) {
  const out = row.severity === 'out' || row.onBye
  return (
    <span className="shrink-0 text-right">
      <span className={`block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${out ? 'text-v2-loss' : 'text-v2-warn'}`}>
        {row.onBye ? 'BYE' : row.player.inj}
      </span>
      <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">
        {row.onBye ? 'not playing' : row.severity}
      </span>
    </span>
  )
}

export default function StrategyLive({ league, snapshot, status, reason, tab, onRetry }) {
  const engine = useEngine()
  useJukeTick(engine)

  const boardReady = !!(engine && engine.dataReady && engine.dataReady())
  const board = boardReady ? engine.board() : []
  const boardById = useMemo(
    () => new Map(board.map((p) => [String(p.id), p])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length]
  )
  const mine = myTeam(snapshot, league)
  const week = snapshot ? snapshot.week : null

  // The platform's live designations over the nightly board, on a copy.
  const byId = useMemo(() => withLiveStatus(boardById, snapshot && snapshot.status, week), [boardById, snapshot, week])
  const leagueRules = snapshot && snapshot.rules ? snapshot.rules : null
  const weekPts = useMemo(() => leagueWeekPts(engine, snapshot), [engine, snapshot])

  const lineup = useMemo(() => lineupRows(mine, byId, weekPts), [mine, byId, weekPts])
  const bench = useMemo(() => benchRows(mine, byId, weekPts), [mine, byId, weekPts])
  const swaps = useMemo(() => bestSwaps(mine, byId, weekPts, week, 10), [mine, byId, weekPts, week])
  const total = useMemo(() => projectedTotal(mine, byId, weekPts), [mine, byId, weekPts])
  const source = projectionSource(lineup, snapshot && snapshot.projections, week)
  const platformName = platformFor(league && league.provider).name

  const game = useMemo(() => gameInWeek(snapshot && snapshot.schedule, league && league.ownerId, week), [snapshot, league, week])
  const opponent = useMemo(() => {
    if (!game || !game.opponentId || !snapshot) return null
    return (snapshot.teams || []).find((t) => t.ownerId === game.opponentId) || null
  }, [game, snapshot])
  const oppTotal = useMemo(() => (opponent ? projectedTotal(opponent, byId, weekPts) : null), [opponent, byId, weekPts])
  const margin = total === null || oppTotal === null ? null : total - oppTotal

  // boardReady in the deps, or this memo answers null for the life of a
  // cold load: engine never changes identity and weeklyCV() is guarded on
  // dataReady() — CLAUDE.md, "a memo keyed on engine can never see the board".
  const cv = useMemo(() => (engine && engine.weeklyCV ? engine.weeklyCV(leagueRules) : null), [engine, leagueRules, boardReady])
  const oppLineup = useMemo(() => (opponent ? lineupRows(opponent, byId, weekPts) : []), [opponent, byId, weekPts])
  const mineWeek = useMemo(() => teamWeek(lineup, cv), [lineup, cv])
  const oppWeek = useMemo(() => teamWeek(oppLineup, cv), [oppLineup, cv])
  const winProb = useMemo(() => (engine && engine.winProbability ? engine.winProbability(mineWeek, oppWeek) : null), [engine, mineWeek, oppWeek])
  const read = matchupRead(winProb)
  const hurt = useMemo(() => injuryWatch(mine, byId, week), [mine, byId, week])

  if (status === 'loading' || (status === 'ready' && !board.length)) return <Loading />
  if (status !== 'ready' || !snapshot) return <CouldNotRead reason={reason} onRetry={onRetry} />
  if (!mine) return <NoTeam teams={snapshot.totalTeams} what="see your lineup" />

  const statusAt = snapshot.status && Number(snapshot.status.week) === Number(week) ? snapshot.status.at : null
  const liveNote = statusAt
    ? `Designations from ${platformName}, as of ${new Date(statusAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Anybody whose game has kicked off is left off.`
    : null
  const swapMax = swaps.length ? Math.max(...swaps.map((s) => s.gain)) : 0
  const starting = lineup.filter((r) => r.player).length
  const hurtStarters = hurt.filter((r) => r.starting).length
  const benchBest = bench.reduce((m, r) => Math.max(m, r.projPts || 0), 0)
  const readTone = read === 'favoured' ? 'gain' : read === 'behind' ? 'cost' : 'evidence'
  const best = swaps[0]

  const kpis = [
    {
      label: 'Projected',
      value: total === null ? '—' : total.toFixed(1),
      tone: 'evidence',
      note: total === null
        ? 'A starter has no projection.'
        : source === 'all'
          ? `${platformName}'s projection for week ${week}, as your lineup is set.`
          : source === 'some'
            ? `${platformName}'s projection where it has one, Juke's for the rest.`
            : 'Points this week, as your lineup is set.',
    },
    {
      label: 'One swap',
      value: swaps.length ? `+${swaps[0].gain.toFixed(1)}` : '0',
      tone: swaps.length ? 'gain' : 'evidence',
      note: swaps.length ? 'The best legal same-position swap.' : 'Your lineup is already the best one.',
    },
    {
      label: 'Might not play',
      value: String(hurt.length),
      tone: hurtStarters ? 'cost' : 'evidence',
      note: hurtStarters ? `${hurtStarters} of them ${hurtStarters === 1 ? 'is' : 'are'} in your lineup.` : 'None of them is starting.',
    },
    // The fourth card is the matchup only when there IS one — before week
    // one, on a bye, and on every Sleeper league it is the bench instead.
    winProb === null
      ? { label: 'Best on the bench', value: benchBest ? benchBest.toFixed(1) : '—', tone: 'evidence', note: starting ? `Against ${starting} slots you have filled.` : 'Nothing is set yet.' }
      : { label: 'Win probability', value: `${Math.round(winProb * 100)}%`, tone: readTone, note: `Against ${opponent.teamName}, from both lineups as they are set.` },
  ]

  const lineupPanel = (
    <Panel
      title="Your lineup, as set"
      action={
        <span className="font-mono text-[11px] tabular-nums text-v2-ink3">
          {total === null ? 'not all projected' : `${total.toFixed(1)} proj / wk`}
          {opponent && (
            <>
              {' · '}{game.home ? 'vs' : 'at'} {opponent.teamName}
              {margin !== null && (
                <span className={margin >= 0 ? 'text-v2-volt' : 'text-v2-loss'}> {margin >= 0 ? '+' : '−'}{Math.abs(margin).toFixed(1)}</span>
              )}
            </>
          )}
        </span>
      }
    >
      {lineup.length ? lineup.map((row) => (
        <PlayerLine
          key={row.id}
          pos={row.player ? row.player.pos : 'DST'}
          name={row.player ? row.player.name : 'Empty slot'}
          dim={!row.player}
          note={row.player
            ? [row.player.team, row.player.bye ? `BYE ${row.player.bye}` : null, row.player.locked ? 'LOCKED' : null].filter(Boolean).join(' · ')
            : `${platformName} has no player in this slot`}
          right={<Pts value={row.projPts} />}
        />
      )) : <Empty>No lineup is set for this week yet.</Empty>}
    </Panel>
  )

  if (tab === 'lineup') {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {lineupPanel}
        <Panel title="Your bench">
          {bench.length ? bench.slice().sort((a, b) => (b.projPts || 0) - (a.projPts || 0)).map((row) => (
            <PlayerLine key={row.id} pos={row.player.pos} name={row.player.name} note={row.player.team} right={<Pts value={row.projPts} />} />
          )) : <Empty>Nobody on the bench.</Empty>}
        </Panel>
      </div>
    )
  }

  if (tab === 'lab') {
    return (
      <Panel title="Every swap worth making" action={<Kicker>Points a week</Kicker>}>
        {swaps.length ? swaps.map((s) => (
          <BarRow
            key={s.sit.id + ':' + s.start.id}
            label={`Start ${s.start.name}`}
            sub={`over ${s.sit.name}${s.replacing ? ' · that slot scores 0 as set' : ''}`}
            value={s.gain}
            max={swapMax}
            tone="gain"
            display={`+${s.gain.toFixed(1)}`}
          />
        )) : <Empty>Your lineup is already the best one Juke can build from this roster.</Empty>}
        <Footnote>
          Same position only. A FLEX may well allow more, but {platformName} does not tell Juke which of your slots is
          one — so these are the swaps that are certainly legal rather than the ones that might be.
        </Footnote>
      </Panel>
    )
  }

  if (tab === 'injury') {
    return (
      <Panel title={week ? `Who might not play in week ${week}` : 'Who might not play'}>
        {hurt.length ? hurt.map((row) => (
          <PlayerLine key={row.player.id} pos={row.player.pos} name={row.player.name} note={row.starting ? 'starting' : 'bench'} right={<InjuryMark row={row} />} />
        )) : <Empty>Nobody on your roster carries an injury designation or a bye this week.</Empty>}
        {liveNote && <Footnote>{liveNote}</Footnote>}
      </Panel>
    )
  }

  return (
    <div className="space-y-5">
      <KpiStrip items={kpis} />

      {winProb !== null && (
        <section className="rounded-[18px] bg-v2-panel p-5 ring-1 ring-inset ring-white/[0.07]" aria-label="Win probability">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <Kicker>This week {game.home ? 'vs' : 'at'} {opponent.teamName}</Kicker>
              <p className="mt-1 font-mono text-[12px] tabular-nums text-v2-ink2">
                You {mineWeek.mean.toFixed(1)} · them {oppWeek.mean.toFixed(1)} projected
              </p>
            </div>
            <span className={`font-telemetry text-[56px] font-extrabold italic leading-none tabular-nums ${TONE_TEXT[readTone]}`}>
              <Tween value={Math.round(winProb * 100)} />%
            </span>
          </div>
          <div className="mt-7">
            {/* The marker is EVEN: 50% by construction, the one reference on
                this page that is not measured from anything. */}
            <Bar value={winProb} max={1} tone="evidence" marker={{ at: 0.5, label: 'even' }} />
          </div>
          <p className="mt-3 text-[12px] leading-[1.55] text-v2-ink3">
            Each lineup swings about {Math.round(mineWeek.stdev)} points a week. A scoring-strength estimate from two
            projected lineups — not a simulated week.
          </p>
        </section>
      )}

      <p className="max-w-[68ch] text-[15px] leading-[1.55] text-v2-ink2">
        {total === null
          ? 'Some of your starters have no projection, so there is no total to quote — the swaps below still hold.'
          : `You project ${total.toFixed(1)} points this week as set`}
        {total !== null && best ? `, and ${(total + best.gain).toFixed(1)} with one swap.` : total !== null ? '.' : ''}
        {hurt.length ? ` ${hurt.length} ${hurt.length === 1 ? 'player' : 'players'} on your roster may not play.` : ''}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {lineupPanel}
        <div className="flex flex-col gap-4">
          {best && (
            <StakeCard
              eyebrow="On your bench, not in your lineup"
              title={`${best.start.name} outprojects ${best.sit.name} at ${best.start.pos}`}
              cost={`−${best.gain.toFixed(1)} pts/wk`}
            >
              Leaving the lineup as set costs that every week.{' '}
              {best.replacing
                ? 'That slot scores nothing at all as it stands.'
                : total === null
                  ? 'Same position, so the swap is certainly legal.'
                  : `${(total + best.gain).toFixed(1)} instead of ${total.toFixed(1)}.`}
            </StakeCard>
          )}
          <Panel title="The swap">
            {best ? (
              <PlayerLine
                pos={best.start.pos}
                name={`Start ${best.start.name}`}
                note={`over ${best.sit.name}`}
                right={
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-[15px] font-semibold tabular-nums text-v2-volt">+{best.gain.toFixed(1)}</span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">{best.replacing ? 'slot scores 0' : 'per week'}</span>
                  </span>
                }
              />
            ) : <Empty>Nothing on your bench beats a starter at its own position.</Empty>}
          </Panel>
          <Panel title="Might not play">
            {hurt.length ? hurt.slice(0, 4).map((row) => (
              <PlayerLine key={row.player.id} pos={row.player.pos} name={row.player.name} note={row.starting ? 'starting' : 'bench'} right={<InjuryMark row={row} />} />
            )) : <Empty>Everybody is available.</Empty>}
            {liveNote && <Footnote>{liveNote}</Footnote>}
          </Panel>
        </div>
      </div>
    </div>
  )
}
