import { useMemo } from 'react'
import { PosTile } from './sampleParts.jsx'
import { myTeam } from './waiverBoard.js'
import {
  bestSwaps, benchRows, injuryWatch, lineupRows, projectedTotal,
  weekScorer,
} from './strategyBoard.js'
import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'
import { gameInWeek } from '../../lib/schedule.js'
import { matchupRead, teamWeek } from '../../lib/matchup.js'
import KpiStrip from '../decision/KpiStrip.jsx'
import BarRow, { Bar } from '../decision/Bar.jsx'
import StakeCard from '../decision/StakeCard.jsx'

/* The Strategy Room, with a real league behind it.
 *
 * ---- Four of the handoff's seven tabs, and what used to block the other
 *      three no longer does ----
 *
 * This comment said Matchup, Scenarios and Opponent Intel all needed
 * /league/<id>/matchups/<week>, "which nothing in this project fetches",
 * and called that the highest-value thing anybody could add. **It was
 * added, and this file went on saying otherwise for weeks** — `oppTotal`
 * nine lines below was reading it while the sentence above still denied
 * it. A blocker in a comment goes stale exactly as silently as one in
 * CLAUDE.md, and re-reading one costs two minutes.
 *
 * So the schedule is here (`gameInWeek`), the opponent's own projected
 * total is here, the margin is here, and the win probability is here. The
 * three tabs are still unlisted, and now for a smaller and more honest
 * reason: each is a screen nobody has designed against real data yet,
 * rather than a fetch nobody has made. A tab that opens onto nothing is
 * the dead control this project keeps finding — and the two that are gated
 * (Scenarios at Season Pass, Opponent Intel at Multi-League) would be
 * charging for it.
 *
 * What IS here is your own roster and the week in front of it: what the
 * lineup projects as set, who you play and by how much, how likely that is
 * to be enough, the best legal swap, and who might not play.
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
    return <span className="font-mono text-meta text-ink-muted">—</span>
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
        <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
          {swap.replacing ? 'slot scores 0' : 'per week'}
        </span>
      </span>
    </div>
  )
}

export default function StrategyRoomLive({ league, snapshot, status, reason, tab }) {
  const engine = useEngine()
  useJukeTick(engine)

  const boardReady = !!(engine && engine.dataReady && engine.dataReady())
  const board = boardReady ? engine.board() : []

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
    const base = leagueRules
      ? (player) => engine.projPerGameUnder(player, leagueRules)
      : engine.projPerGame
    /* Wrapped rather than inlined so the rule is reachable from
       scripts/test_strategy_board.mjs, which supplies its own weekPts and
       would never see a closure built in here. */
    return weekScorer(base, week)
  }, [engine, leagueRules, week])

  const lineup = useMemo(() => lineupRows(mine, byId, weekPts), [mine, byId, weekPts])
  const bench = useMemo(() => benchRows(mine, byId, weekPts), [mine, byId, weekPts])
  const swaps = useMemo(
    () => bestSwaps(mine, byId, weekPts, week, 10),
    [mine, byId, weekPts, week]
  )
  const total = useMemo(() => projectedTotal(mine, byId, weekPts), [mine, byId, weekPts])

  /* Who you actually play, and by how much.
     
     RoomPage.jsx recorded this room's KPI bar as wanting "the week's
     matchup margin, which needs the matchups fetch three of its tabs are
     also waiting on" -- this is that fetch arriving.

     The opponent's total goes through the SAME projectedTotal() under the
     same weekPts, so the margin is two readings of one method rather than
     Juke's number against ESPN's. ESPN publishes its own projection and win
     probability and both are deliberately dropped on the way through the
     worker; see matchups.js.

     `week` is null before the season starts and gameInWeek() answers the
     opening fixture then, because "who do I open against" is the question a
     preseason reader has. */
  const game = useMemo(
    () => gameInWeek(snapshot && snapshot.schedule, league && league.ownerId, week),
    [snapshot, league, week]
  )
  const opponent = useMemo(() => {
    if (!game || !game.opponentId || !snapshot) return null
    return (snapshot.teams || []).find((t) => t.ownerId === game.opponentId) || null
  }, [game, snapshot])
  const oppTotal = useMemo(
    () => (opponent ? projectedTotal(opponent, byId, weekPts) : null),
    [opponent, byId, weekPts]
  )
  /* Null unless BOTH sides project, which is projectedTotal()'s own rule
     one level up: a margin against a partially-projected opponent reads as
     a lead that is really a gap in the data. */
  const margin = total === null || oppTotal === null ? null : total - oppTotal

  /* The win probability, which this room has been able to answer since the
     schedule landed and did not.

     This file's own header and its Start/Sit Lab comment BOTH still said
     "nothing fetches an opponent's projection", written before #215, while
     `oppTotal` nine lines up was already reading one. A blocker in a
     comment goes stale exactly as silently as one in CLAUDE.md, and this
     file carried two of them. Both are corrected in place rather than left
     standing.

     A margin is a point estimate and a probability is a distribution, so
     what is added is the SPREAD. `weeklyCV()` is the measured swing per
     position, under this league's own rules; `teamWeek()` turns a lineup's
     rows into a mean and a standard deviation; and the model that puts
     those together is `winProbability()` on the bridge — the same
     `winRateAgainst()` the Draft Room's own projected win % uses, rather
     than a second normal difference in web/src that could drift from it by
     a fraction of a point with nothing to say so.

     `weeklyCV()` walks every stored weekly log on the board and is memoised
     in app.js for it (19.3ms a call, measured); the memo here is so a
     re-render does not re-key it. */
  /* `boardReady` in the deps, and without it this memo answered null for
     the life of every cold load of this room.

     `useEngine()` returns `window.JukeEngine` itself, so `engine` is one
     object that never changes identity, and `weeklyCV` is guarded on
     `dataReady()` -- it answers null until the deferred `stats.js` lands.
     Keyed on `[engine, leagueRules]` the memo therefore computed null on
     the first render and had nothing left that could ever invalidate it.

     And this room mounts before the board every time: RoomPage fetches the
     snapshot on the render the league id arrives on, which CLAUDE.md
     already records as routinely earlier than `players.js`. So the win
     probability this file exists to draw fell back to BEST ON THE BENCH on
     every cold load, and appeared only if the reader happened to navigate
     away and back. Measured exactly that way -- first mount BENCH,
     remounted WIN PROB -- which is what named the cause rather than the
     symptom.

     The same shape as `byId` keying on `board.length` above it. */
  const cv = useMemo(
    () => (engine && engine.weeklyCV ? engine.weeklyCV(leagueRules) : null),
    [engine, leagueRules, boardReady]
  )
  const oppLineup = useMemo(
    () => (opponent ? lineupRows(opponent, byId, weekPts) : []),
    [opponent, byId, weekPts]
  )
  const mineWeek = useMemo(() => teamWeek(lineup, cv), [lineup, cv])
  const oppWeek = useMemo(() => teamWeek(oppLineup, cv), [oppLineup, cv])
  /* Null unless BOTH sides price, which is `margin`'s own rule one line up:
     a probability against a partially-projected opponent reads as an edge
     that is really a gap in the data. */
  const winProb = useMemo(
    () => (engine && engine.winProbability ? engine.winProbability(mineWeek, oppWeek) : null),
    [engine, mineWeek, oppWeek]
  )
  const read = matchupRead(winProb)
  const hurt = useMemo(() => injuryWatch(mine, byId, week), [mine, byId, week])
  const swapMax = swaps.length ? Math.max(...swaps.map((s) => s.gain)) : 0
  const starting = lineup.filter((r) => r.player).length
  const hurtStarters = hurt.filter((r) => r.starting).length
  const benchBest = bench.reduce((m, r) => Math.max(m, r.projPts || 0), 0)

  /* P4. Four numbers this room can actually answer for, and no more.

     This comment used to end "a win probability invented from one roster is
     a number a reader would act on, so there is none" -- correct when it
     was written and false from the day the schedule landed. It is the
     fourth card now, and it displaces "Best on the bench" rather than
     joining it: that one is a raw figure with no decision attached, and
     "One swap" beside it already answers the bench question with the
     decision included.

     **It displaces it only when there IS a matchup.** Before week one, on a
     bye, and on every Sleeper league -- which publishes no season schedule
     at all -- the bench number comes back, because a strip that drops to
     three cards on the leagues that cannot answer says less than one that
     shows what it has. */
  const kpis = [
    {
      label: 'Projected',
      value: total === null ? '—' : total.toFixed(1),
      accent: 'evidence',
      note: total === null ? 'A starter has no projection.' : 'Points this week, as your lineup is set.',
    },
    {
      /* No delta, and the reason is that it was the same number twice.

         `value` and `delta` both read `swaps[0].gain`, so the card printed
         "+6.9 +6.9" -- and KpiCard's own header says what a delta is FOR:
         it sits on the value's baseline at a quarter of the size so it
         reads as a QUALIFIER of the number above it. A qualifier that
         restates its own subject is the `me.build + " / 100"` caption
         again, which this project already fixed once by making the second
         line name what the first one cost.

         There is nothing to qualify it with here. The value is already the
         gain, already signed, already accented -- what the swap actually
         IS belongs to the note and to the rows below, which name it.

         `evidence` rather than `gain` when there is no swap: a zero is a
         quantity with no direction in it, which is the call `signOf()`
         makes and the same one the win-probability band's `close` makes
         two cards along. A gain-coloured rule over "0" says a lineup with
         nothing to gain gained something. */
      label: 'One swap',
      value: swaps.length ? `+${swaps[0].gain.toFixed(1)}` : '0',
      accent: swaps.length ? 'gain' : 'evidence',
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
    winProb === null
      ? {
          label: 'Best on the bench',
          value: benchBest ? benchBest.toFixed(1) : '—',
          accent: 'evidence',
          note: starting ? `Against ${starting} slots you have filled.` : 'Nothing is set yet.',
        }
      : {
          label: 'Win probability',
          value: `${Math.round(winProb * 100)}%`,
          /* P1. The sign is the direction the number points for the reader,
             which is what `read` decides -- and `close` takes neither
             colour, because a coin toss is not a gain and colouring it as
             one would be the room having an opinion it does not hold. */
          accent: read === 'favoured' ? 'gain' : read === 'behind' ? 'cost' : 'evidence',
          note: `Against ${opponent.teamName}, from both lineups as they are set.`,
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
          <p className="mx-auto mt-2 max-w-[52ch] text-meta leading-relaxed text-voidInk-body">
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
        <div className="rounded-[14px] border border-line-hairline bg-surface-card p-8 text-center text-meta text-ink-muted">
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
          {opponent ? (
            <>
              {' · '}
              {game.home ? 'vs' : 'at'} {opponent.teamName}
              {margin === null ? null : (
                <span className={margin >= 0 ? ' text-gain' : ' text-cost'}>
                  {' '}{margin >= 0 ? '+' : ''}{margin.toFixed(1)}
                </span>
              )}
            </>
          ) : null}
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
        <div className="py-10 text-center text-meta text-ink-muted">
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
              <div className="py-10 text-center text-meta text-ink-muted">Nobody on the bench.</div>
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
 
              No field marker, and the reason changed under this comment.
              It read "nothing fetches an opponent's projection", which
              stopped being true when the schedule landed: the snapshot
              carries every team's roster, so a league-median swap IS
              computable now — price each of the other nine benches against
              its own lineup and take the middle.

              What it costs is nine more `bestSwaps()` runs per render of a
              tab that already runs one, and what it buys is a number
              nobody has yet decided how to read: a median swap is large in
              a league where everybody has set a bad lineup, which says
              more about the league than about this roster. So it is
              unbuilt rather than blocked, which is a different sentence
              and the honest one. */}
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
            <div className="py-10 text-center text-meta text-ink-muted">
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
                        'font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ' +
                        (row.severity === 'out' || row.onBye ? 'text-cost' : 'text-flow-amber')
                      }
                    >
                      {row.onBye ? 'BYE' : row.player.inj}
                    </span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                      {row.onBye ? 'not playing' : row.severity}
                    </span>
                  </span>
                }
              />
            ))
          ) : (
            <div className="py-10 text-center text-meta text-ink-muted">
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

      {/* P3. The bar the guide asks for, and the field marker is EVEN.

          A win probability is the one quantity in this app whose reference
          value is not measured from anything -- it is 50%, by construction,
          and a bar without it drawn is a length a reader has to compare
          against a number they are holding in their head. Which side of the
          line the fill ends is the whole reading.

          The percentage stays beside it because the bar cannot say 58, and
          the sentence under it is the framing this number may not be shown
          without: it is a scoring-strength estimate off two projected
          lineups, not a simulated week. `projectedWinPctForRoom()`'s own
          method note in app.js makes the same demand of the same model. */}
      {winProb === null ? null : (
        <section className="mb-5 rounded-[14px] border border-line-hairline bg-surface-card px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="font-plex text-label uppercase tracking-[0.12em] text-ink-label">
              This week {game.home ? 'vs' : 'at'} {opponent.teamName}
            </span>
            <span
              className={
                'font-plex text-[15px] font-semibold tabular-nums ' +
                (read === 'favoured' ? 'text-gain' : read === 'behind' ? 'text-cost' : 'text-ink')
              }
            >
              {Math.round(winProb * 100)}%
            </span>
          </div>
          <div className="mt-4">
            <Bar
              value={winProb}
              max={1}
              sign={read === 'favoured' ? 'gain' : read === 'behind' ? 'cost' : 'evidence'}
              marker={{ at: 0.5, label: 'even' }}
            />
          </div>
          <p className="m-0 mt-2 text-[12px] leading-snug text-ink-soft">
            {mineWeek.mean.toFixed(1)} against {oppWeek.mean.toFixed(1)} projected, and each
            lineup swings about {Math.round(mineWeek.stdev)} points a week. A scoring-strength
            estimate from two projected lineups — not a simulated week.
          </p>
        </section>
      )}
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
              <div className="py-8 text-center text-meta text-ink-muted">
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
              <div className="py-8 text-center text-meta text-ink-muted">
                Everybody is available.
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
