import { useMemo } from 'react'
import { PosTile } from './sampleParts.jsx'
import { myTeam } from './waiverBoard.js'
import {
  bestSwaps, benchRows, injuryWatch, lineupRows, projectedTotal,
} from './strategyBoard.js'
import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'
import KpiStrip from '../decision/KpiStrip.jsx'
import BarRow from '../decision/Bar.jsx'
import StakeCard from '../decision/StakeCard.jsx'

/* The Strategy Room, with a real league behind it.
 *
 * ---- Four of the handoff's seven tabs, and the three missing share a
 *      single cause ----
 *
 * Matchup, Scenarios and Opponent Intel all need
 * /league/<id>/matchups/<week>, which nothing in this project fetches. No
 * opponent, no weekly projection for them, no margin to plan against. They
 * are not listed rather than listed-and-empty, and the two of them that
 * are gated (Scenarios at Season Pass, Opponent Intel at Multi-League)
 * would additionally be charging for a tab that unlocks onto nothing —
 * which is the FAAB Planner problem one room along.
 *
 * That single missing fetch is the highest-value thing anybody could add
 * to this room, and it is worth saying here rather than in a plan
 * somewhere: three of seven tabs are behind it.
 *
 * What IS here is the half about your own roster, which is the half a
 * manager acts on: what the lineup projects as set, the best legal swap,
 * and who might not play.
 */

export const TABS = [
  { key: 'lobby', label: 'Lobby' },
  { key: 'lineup', label: 'Lineup' },
  { key: 'lab', label: 'Start/Sit Lab' },
  { key: 'injury', label: 'Injury Watch' },
]

function Pts({ value }) {
  if (value === null || value === undefined) {
    // A dash, never a 0 — the "treat a missing number as missing" rule, on
    // a screen where a 0 is a real and very different projection.
    return <span className="font-mono text-[13px] text-ink-muted">—</span>
  }
  return <span className="font-mono text-[15px] font-semibold text-white">{value.toFixed(1)}</span>
}

function Panel({ title, action, children }) {
  return (
    <section className="rounded-[14px] border border-line-hairline bg-surface-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-hairline px-4 py-3 sm:px-5">
        <h2 className="m-0 font-display text-[17px] font-bold text-white">{title}</h2>
        {action}
      </div>
      <div className="px-4 sm:px-5">{children}</div>
    </section>
  )
}

function PlayerLine({ player, note, right, dim }) {
  return (
    <div className="flex items-center gap-3 border-b border-line-hairline py-2.5 last:border-b-0">
      <PosTile pos={player ? player.pos : 'DST'} size={30} />
      <span className="min-w-0 flex-1">
        <span
          className={
            'block truncate text-[14px] font-semibold ' + (dim ? 'text-ink-muted' : 'text-white')
          }
        >
          {player ? player.name : 'Empty slot'}
        </span>
        {note ? (
          <span className="block truncate font-mono text-[11px] text-ink-muted">{note}</span>
        ) : null}
      </span>
      {right}
    </div>
  )
}

function SwapLine({ swap }) {
  return (
    <div className="flex items-center gap-3 border-b border-line-hairline py-3 last:border-b-0">
      <PosTile pos={swap.start.pos} size={30} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-white">
          Start {swap.start.name}
        </span>
        <span className="block truncate font-mono text-[11px] text-ink-muted">
          over {swap.sit.name}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {/* `gain`, not mint. Mint is the rail's "you are here" and the
            room-card accent; a swap worth +3.1 a week is a value, and a
            value colour that also means "this is the selected tab" is the
            drift the decision palette exists to end. */}
        <span className="font-mono text-[15px] font-semibold text-gain">
          +{swap.gain.toFixed(1)}
        </span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          {swap.replacing ? 'slot scores 0' : 'per week'}
        </span>
      </span>
    </div>
  )
}

export default function StrategyRoomLive({ league, snapshot, status, reason, tab }) {
  const engine = useEngine()
  useJukeTick(engine)

  const board = engine && engine.dataReady && engine.dataReady() ? engine.board() : []

  const byId = useMemo(
    () => new Map(board.map((p) => [String(p.id), p])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length]
  )

  const mine = myTeam(snapshot, league)
  const week = snapshot ? snapshot.week : null

  /* WEEKLY points, not season. `projPts` on a board row is a season total,
     and summing four starters' season projections and printing it as "you
     project 808.0" reads as a weekly score out by a factor of seventeen —
     with the swaps built on it offering season-long differences as a
     one-week call. projPerGame() does the division in app.js, where
     projGames() knows that a team defense is one aggregate row stamped
     gp:1 and must not be divided by seventeen. */
  /* And under THIS LEAGUE's rules, not the Draft Room's.

     projPerGame() reads a projPts scored with league.rules -- the table the
     reader last set for a MOCK draft -- so a real full-PPR league read
     through a half-PPR default understated this total by a measured 13.3
     points a week, and bestSwaps() ranked the lineup with the same rules,
     pricing reception-heavy players below touchdown-heavy ones. The number
     was the smaller half of that.

     useMemo because every figure on this screen is memoised on weekPts: a
     fresh closure per render would rebuild all four on every tick. Falls
     back to projPerGame when the league sends no rules -- an older worker,
     a provider without them -- since drawing the previous number beats
     drawing none. */
  const leagueRules = snapshot && snapshot.rules ? snapshot.rules : null
  const weekPts = useMemo(() => {
    if (!engine) return null
    if (!leagueRules) return engine.projPerGame
    return (player) => engine.projPerGameUnder(player, leagueRules)
  }, [engine, leagueRules])

  const lineup = useMemo(() => lineupRows(mine, byId, weekPts), [mine, byId, weekPts])
  const bench = useMemo(() => benchRows(mine, byId, weekPts), [mine, byId, weekPts])
  const swaps = useMemo(
    () => bestSwaps(mine, byId, weekPts, week, 10),
    [mine, byId, weekPts, week]
  )
  const total = useMemo(() => projectedTotal(mine, byId, weekPts), [mine, byId, weekPts])
  const hurt = useMemo(() => injuryWatch(mine, byId, week), [mine, byId, week])
  const swapMax = swaps.length ? Math.max(...swaps.map((s) => s.gain)) : 0
  const starting = lineup.filter((r) => r.player).length
  const hurtStarters = hurt.filter((r) => r.starting).length
  const benchBest = bench.reduce((m, r) => Math.max(m, r.projPts || 0), 0)

  /* P4. Four numbers this room can actually answer for, and no more.
 
     The guide's own header for this screen asks for a win probability and
     a field marker beside it. Both need the opponent, and nothing here
     fetches /league/<id>/matchups/<week> -- the single missing call this
     file's own header already records as costing three of seven tabs. A
     win probability invented from one roster is a number a reader would
     act on, so there is none. */
  const kpis = [
    {
      label: 'Projected',
      value: total === null ? '—' : total.toFixed(1),
      accent: 'evidence',
      note: total === null ? 'A starter has no projection.' : 'Points this week, as your lineup is set.',
    },
    {
      label: 'One swap',
      value: swaps.length ? `+${swaps[0].gain.toFixed(1)}` : '0',
      delta: swaps.length ? swaps[0].gain.toFixed(1) : null,
      deltaSign: 'gain',
      accent: 'gain',
      note: swaps.length ? 'The best legal same-position swap.' : 'Your lineup is already the best one.',
    },
    {
      label: 'Might not play',
      value: hurt.length,
      accent: hurtStarters ? 'cost' : 'evidence',
      note: hurtStarters
        ? `${hurtStarters} of them ${hurtStarters === 1 ? 'is' : 'are'} in your lineup.`
        : 'None of them is starting.',
    },
    {
      label: 'Best on the bench',
      value: benchBest ? benchBest.toFixed(1) : '—',
      accent: 'evidence',
      note: starting ? `Against ${starting} slots you have filled.` : 'Nothing is set yet.',
    },
  ]

  if (status === 'loading' || (status === 'ready' && !board.length)) {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10">
        <div className="h-[160px] animate-pulse rounded-[14px] border border-line-hairline bg-surface-card" />
      </div>
    )
  }

  if (status !== 'ready' || !snapshot) {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10">
        <div className="rounded-[14px] border border-line-hairline bg-surface-card p-6 text-center">
          <div className="text-[15px] font-semibold text-white">We could not read your league</div>
          <p className="mx-auto mt-2 max-w-[52ch] text-[13px] leading-relaxed text-voidInk-body">
            {reason === 'not-found'
              ? 'That league no longer answers. It may have been deleted, or made private.'
              : 'Nothing is wrong with your roster — this page just could not fetch it.'}
          </p>
        </div>
      </div>
    )
  }

  if (!mine) {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <div className="rounded-[14px] border border-line-hairline bg-surface-card p-8 text-center text-[13px] text-ink-muted">
          Reconnect this league to see your lineup — Juke does not know which of the{' '}
          {snapshot.totalTeams} rosters is yours.
        </div>
      </div>
    )
  }

  const lineupPanel = (
    <Panel
      title="Your lineup, as set"
      action={
        <span className="font-mono text-[11px] text-ink-muted">
          {total === null ? 'not all projected' : `${total.toFixed(1)} proj / wk`}
        </span>
      }
    >
      {lineup.length ? (
        lineup.map((row) => (
          <PlayerLine
            key={row.id}
            player={row.player}
            dim={!row.player}
            note={
              row.player
                ? [row.player.team, row.player.bye ? `BYE ${row.player.bye}` : null]
                    .filter(Boolean)
                    .join(' · ')
                : 'Sleeper has no player in this slot'
            }
            right={<Pts value={row.projPts} />}
          />
        ))
      ) : (
        <div className="py-10 text-center text-[13px] text-ink-muted">
          No lineup is set for this week yet.
        </div>
      )}
    </Panel>
  )

  if (tab === 'lineup') {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          {lineupPanel}
          <Panel title="Your bench">
            {bench.length ? (
              bench
                .slice()
                .sort((a, b) => (b.projPts || 0) - (a.projPts || 0))
                .map((row) => (
                  <PlayerLine
                    key={row.id}
                    player={row.player}
                    note={row.player.team}
                    right={<Pts value={row.projPts} />}
                  />
                ))
            ) : (
              <div className="py-10 text-center text-[13px] text-ink-muted">Nobody on the bench.</div>
            )}
          </Panel>
        </div>
      </div>
    )
  }

  if (tab === 'lab') {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <Panel title="Every swap worth making">
          {/* P3. Ten rows, one unit (points a week), one scale. This was ten
              figures in a column and a reader had to do the comparison the
              list exists to make for them -- which is the whole of P3, and
              this tab is its clearest case in the app: the rows are already
              sorted by the number, so the bars say how far apart the top of
              the list is from the bottom of it, which the sort cannot.
 
              No field marker. The guide asks for one and there is nothing
              to draw it at: a league median swap would need every other
              roster's bench priced against its own lineup, and nothing
              fetches an opponent's projection -- the same missing matchups
              call that costs this room three of its seven tabs. */}
          {swaps.length ? (
            swaps.map((s, i) => (
              <BarRow
                key={s.sit.id + ':' + s.start.id}
                index={i}
                label={`${s.start.name} over ${s.sit.name}`}
                value={s.gain}
                max={swapMax}
                sign="gain"
                display={`+${s.gain.toFixed(1)}`}
                title={s.replacing ? 'The slot scores 0 as set' : 'Points a week'}
              />
            ))
          ) : (
            <div className="py-10 text-center text-[13px] text-ink-muted">
              Your lineup is already the best one Juke can build from this roster.
            </div>
          )}
          <p className="border-t border-line-hairline py-3 text-[12px] leading-relaxed text-ink-muted">
            Same position only. A FLEX may well allow more, but Sleeper does not tell Juke which of
            your slots is one — so these are the swaps that are certainly legal rather than the ones
            that might be.
          </p>
        </Panel>
      </div>
    )
  }

  if (tab === 'injury') {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <Panel title={week ? `Who might not play in week ${week}` : 'Who might not play'}>
          {hurt.length ? (
            hurt.map((row) => (
              <PlayerLine
                key={row.player.id}
                player={row.player}
                note={row.starting ? 'starting' : 'bench'}
                right={
                  <span className="shrink-0 text-right">
                    <span
                      className={
                        'font-mono text-[11px] font-semibold uppercase tracking-[0.06em] ' +
                        (row.severity === 'out' || row.onBye ? 'text-cost' : 'text-flow-amber')
                      }
                    >
                      {row.onBye ? 'BYE' : row.player.inj}
                    </span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                      {row.onBye ? 'not playing' : row.severity}
                    </span>
                  </span>
                }
              />
            ))
          ) : (
            <div className="py-10 text-center text-[13px] text-ink-muted">
              Nobody on your roster carries an injury designation or a bye this week.
            </div>
          )}
        </Panel>
      </div>
    )
  }

  const best = swaps[0]
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
      <KpiStrip items={kpis} className="mb-5" />
      <p className="mb-5 max-w-[68ch] text-[15px] leading-relaxed text-voidInk-body">
        {total === null
          ? 'Some of your starters have no projection, so there is no total to quote — the swaps below still hold.'
          : `You project ${total.toFixed(1)} points this week as set`}
        {total !== null && best ? `, and ${(total + best.gain).toFixed(1)} with one swap.` : total !== null ? '.' : ''}
        {hurt.length
          ? ` ${hurt.length} ${hurt.length === 1 ? 'player' : 'players'} on your roster may not play.`
          : ''}
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {lineupPanel}
        <div className="flex flex-col gap-4">
          {/* P2. One light card, and it is the points sitting on your bench
              rather than in your lineup -- the one thing on this screen that
              is costing something right now and can be fixed before kickoff.
 
              Absent when there is no swap to make, rather than drawn saying
              so: a stake card with nothing at stake is the loudest thing on
              the page saying nothing, and "your lineup is already the best
              one" is good news that belongs in the panel below. */}
          {best ? (
            <StakeCard
              eyebrow="On your bench, not in your lineup"
              title={`${best.start.name} outprojects ${best.sit.name} at ${best.start.pos}`}
              cost={`−${best.gain.toFixed(1)} pts/wk`}
            >
              {/* The panel below prints the same number as +3.1 and this
                  card prints it as -3.1, two inches apart, which is one
                  fact from two sides rather than two facts -- so the
                  sentence says which side this is. */}
              Leaving the lineup as set costs that every week.{' '}
              {best.replacing
                ? 'That slot scores nothing at all as it stands.'
                : total === null
                ? 'Same position, so the swap is certainly legal.'
                : `${(total + best.gain).toFixed(1)} instead of ${total.toFixed(1)}.`}
            </StakeCard>
          ) : null}

          <Panel title="The swap">
            {best ? (
              <SwapLine swap={best} />
            ) : (
              <div className="py-8 text-center text-[13px] text-ink-muted">
                Nothing on your bench beats a starter at its own position.
              </div>
            )}
          </Panel>
          <Panel title="Might not play">
            {hurt.length ? (
              hurt.slice(0, 4).map((row) => (
                <PlayerLine
                  key={row.player.id}
                  player={row.player}
                  note={row.starting ? 'starting' : 'bench'}
                  right={
                    <span
                      className={
                        'font-mono text-[11px] font-semibold uppercase ' +
                        (row.severity === 'out' || row.onBye ? 'text-cost' : 'text-flow-amber')
                      }
                    >
                      {row.onBye ? 'BYE' : row.player.inj}
                    </span>
                  }
                />
              ))
            ) : (
              <div className="py-8 text-center text-[13px] text-ink-muted">
                Everybody is available.
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
