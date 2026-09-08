import { useMemo } from 'react'
import { PosTile } from './sampleParts.jsx'
import { myTeam } from './waiverBoard.js'
import {
  bestSwaps, benchRows, injuryWatch, lineupRows, projectedTotal,
} from './strategyBoard.js'
import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'

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
        <span className="font-mono text-[15px] font-semibold text-mint">
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
  const weekPts = engine ? engine.projPerGame : null

  const lineup = useMemo(() => lineupRows(mine, byId, weekPts), [mine, byId, weekPts])
  const bench = useMemo(() => benchRows(mine, byId, weekPts), [mine, byId, weekPts])
  const swaps = useMemo(
    () => bestSwaps(mine, byId, weekPts, week, 10),
    [mine, byId, weekPts, week]
  )
  const total = useMemo(() => projectedTotal(mine, byId, weekPts), [mine, byId, weekPts])
  const hurt = useMemo(() => injuryWatch(mine, byId, week), [mine, byId, week])

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
          {swaps.length ? (
            swaps.map((s) => <SwapLine key={s.sit.id + ':' + s.start.id} swap={s} />)
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
                        (row.severity === 'out' || row.onBye ? 'text-flow-rose' : 'text-flow-amber')
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
                        (row.severity === 'out' || row.onBye ? 'text-flow-rose' : 'text-flow-amber')
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
