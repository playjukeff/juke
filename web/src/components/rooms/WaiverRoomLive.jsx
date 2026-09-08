import { useMemo } from 'react'
import { PosTile } from './sampleParts.jsx'
import { freeAgents, myTeam, rosterGaps } from './waiverBoard.js'
import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'

/* The Waiver Room, with a real league behind it.
 *
 * The first room in this handoff to draw connected data rather than a
 * blurred sample, and it is buildable now for one reason: a Sleeper roster
 * is a list of Sleeper player ids and players.js is keyed by the same ids.
 * So "who is available" is a set difference, and "what are they worth" is
 * the same replacementGap() the player sheet has always printed.
 *
 * ---- What this room does NOT claim ----
 *
 * The handoff's own lobby copy is "Every free agent is priced against your
 * roster, your matchup, and the nine managers bidding against you." Two
 * thirds of that is not true here and will not be until something fetches
 * it: nothing reads Sleeper's matchups endpoint, so there is no opponent
 * and no weekly projection, and nothing knows what anybody has spent, so
 * there is no read on who can outbid you. The copy below says what is
 * actually being done — priced against your roster — because a room that
 * overstates its inputs is the "right value, wrong column" failure with
 * marketing on top.
 *
 * `waiverBudget` IS real and comes straight off the league, so the bar
 * reports the budget and never a remaining balance. Sleeper does not tell
 * us what has been spent.
 *
 * ---- Tabs are declared, not rendered ----
 *
 * TABS is exported and RoomPage hands it to the one RoomShell, which is
 * the handoff's first constraint ("rooms pass config, never re-render
 * their own header"). Only the two sections that have real content are
 * listed. The other six — Player Lab, FAAB Planner, Roster Gaps, Drop
 * List, League Intel, News Wire — arrive as each is built, because a tab
 * that opens onto nothing is the dead control this project keeps finding.
 */

export const TABS = [
  { key: 'lobby', label: 'Lobby' },
  { key: 'targets', label: 'Targets Board' },
]

/* How many rows the Lobby previews before handing off to the full board.
   Five is what fits above the fold beside the roster-gap column at 1440
   without the reader scrolling to learn there is more. */
const LOBBY_TARGETS = 5
const BOARD_TARGETS = 40

function Gap({ value }) {
  const n = Math.round(value)
  return (
    <span className={'font-mono text-[15px] font-semibold ' + (n > 0 ? 'text-mint' : 'text-ink-muted')}>
      {n > 0 ? '+' : ''}
      {n}
    </span>
  )
}

function TargetRow({ rank, row }) {
  const p = row.player
  return (
    <div className="flex items-center gap-3 border-b border-line-hairline py-2.5 last:border-b-0">
      <span className="w-6 shrink-0 font-mono text-[11px] text-ink-muted">
        {String(rank).padStart(2, '0')}
      </span>
      <PosTile pos={p.pos} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-white">{p.name}</span>
        <span className="block truncate font-mono text-[11px] text-ink-muted">
          {p.team || 'FA'}
          {p.bye ? ` · BYE ${p.bye}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <Gap value={row.gap} />
        <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          over repl.
        </span>
      </span>
    </div>
  )
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

export default function WaiverRoomLive({ league, snapshot, status, reason, tab }) {
  const engine = useEngine()
  /* `board` is empty until players.js lands (deferred, not blocking), and
     this room is nothing without it. useJukeTick TAKES the engine and
     returns nothing — it forces a re-render on `juke:header`. Calling it
     bare, as this did first, attaches no listener at all and the room
     renders an empty wire for ever. */
  useJukeTick(engine)

  const board = engine && engine.dataReady && engine.dataReady() ? engine.board() : []
  const gapOf = engine ? engine.replacementGap : null

  /* `board.length` is in the deps and `board` is not, deliberately.

     The array is mutated in place and never replaced — CLAUDE.md records
     that as the reason `board` is useless as a memo key — so a dep on the
     array itself would never fire. What DOES change exactly once is its
     length, 0 to several hundred, the moment players.js lands. Without it
     this memo runs on the render where `snapshot` arrives, which is
     routinely BEFORE the board does, caches an empty result and never
     recomputes: a connected league showing "0 available" over a full wire.

     That is PlayersTabPhone's bug, which this file's own neighbour already
     paid for, reproduced here and caught by driving the room rather than by
     reading it. */
  const available = useMemo(
    () => freeAgents(board, snapshot, gapOf, BOARD_TARGETS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length, snapshot, gapOf]
  )

  const mine = myTeam(snapshot, league)

  const gaps = useMemo(() => {
    if (!mine || !board.length) return []
    const byId = new Map(board.map((p) => [String(p.id), p]))
    return rosterGaps(mine, byId, available, gapOf).slice(0, 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.length, mine, available, gapOf])

  if (status === 'loading') {
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

  /* The board has not landed. Not an error and not an empty wire: saying
     "no free agents" here would be a claim about the reader's league made
     on the strength of a script that has not arrived. */
  if (!board.length) {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10">
        <div className="h-[160px] animate-pulse rounded-[14px] border border-line-hairline bg-surface-card" />
      </div>
    )
  }

  /* A "target" is somebody who would actually improve a roster, so the
     Lobby's panel takes only the positive gaps.

     Found by driving the room against a league where the top 150 are all
     owned: the wire's best remaining player was a tight end at exactly 0
     over replacement and the panel happily listed four more at -1, -6 and
     -9 under the heading "Top targets". Every number was right and the
     heading was a recommendation the arithmetic did not support — the
     "right value, wrong column" failure, on the one screen whose entire
     job is telling somebody what to claim.

     The full board below keeps them, and should: a ranked wire is an
     inventory, and the least-bad tight end is a real thing to want in a
     bye week. It is titled as one rather than as a list of targets. */
  const targets = available.filter((row) => row.gap > 0)

  const fullBoard = (
    <a href="#/rooms/waiver" className="font-mono text-[11px] font-semibold text-mint">
      {available.length} available
    </a>
  )

  if (tab === 'targets') {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <Panel title="The wire, best first" action={fullBoard}>
          {available.length ? (
            available.map((row, i) => <TargetRow key={row.player.id} rank={i + 1} row={row} />)
          ) : (
            <div className="py-8 text-center text-[13px] text-ink-muted">
              Nobody on the wire is projected above replacement. In a league this deep that is
              the normal state, not an error.
            </div>
          )}
        </Panel>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
      <p className="mb-5 max-w-[68ch] text-[15px] leading-relaxed text-voidInk-body">
        {snapshot.name} is synced.{' '}
        {available.length
          ? `${available.length} players are unowned and rankable`
          : 'Nobody unowned is rankable'}
        , scored under your league&rsquo;s own rules.
        {snapshot.waiverBudget ? ` FAAB runs $${snapshot.waiverBudget} a season.` : ''}
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel title="Top targets" action={fullBoard}>
          {targets.length ? (
            targets.slice(0, LOBBY_TARGETS).map((row, i) => (
              <TargetRow key={row.player.id} rank={i + 1} row={row} />
            ))
          ) : (
            /* The true state of a deep league's wire in most weeks, and
               saying so is the product working rather than failing. The
               full board is still one press away for a bye-week fill. */
            <div className="py-8 text-center text-[13px] text-ink-muted">
              Nobody on the wire is worth more than a replacement-level starter this week.
              That is the normal state of a {snapshot.totalTeams}-team league, not an error.
            </div>
          )}
        </Panel>

        <Panel title="Where a claim would help">
          {mine ? (
            gaps.length ? (
              gaps.map((g) => (
                <div
                  key={g.pos}
                  className="flex items-center gap-3 border-b border-line-hairline py-3 last:border-b-0"
                >
                  <PosTile pos={g.pos} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-white">
                      {g.best.player.name}
                    </span>
                    <span className="block font-mono text-[11px] text-ink-muted">
                      {g.held === null
                        ? 'you hold nobody rankable here'
                        : `over your best ${g.pos}`}
                    </span>
                  </span>
                  <Gap value={g.improvement} />
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-[13px] text-ink-muted">
                Nothing on the wire beats what you already hold at any position.
              </div>
            )
          ) : (
            /* No ownerId on the connection, so there is no "your team" —
               and pricing a claim against an arbitrary roster would be
               worse than not pricing it. */
            <div className="py-8 text-center text-[13px] text-ink-muted">
              Reconnect this league to see which of your own positions a claim would improve.
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
