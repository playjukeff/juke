import { useEffect, useMemo, useState } from 'react'
import { PosTile } from './sampleParts.jsx'
import {
  demandByPosition, dropList, freeAgents, myTeam, rivalNeeds, rosterGaps,
} from './waiverBoard.js'
import UpgradeGate from '../shell/UpgradeGate.jsx'
import KpiStrip from '../decision/KpiStrip.jsx'
import BarRow, { Bar } from '../decision/Bar.jsx'
import StakeCard from '../decision/StakeCard.jsx'
import RunNextCard from '../decision/RunNextCard.jsx'
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
  { key: 'gaps', label: 'Roster Gaps' },
  { key: 'drops', label: 'Drop List' },
  { key: 'news', label: 'News Wire' },
  { key: 'intel', label: 'League Intel', gate: 'allaccess' },
]

/* ---- The two of the handoff's eight that are NOT here ----
 *
 * `faab` (FAAB Planner, Season Pass) is the one this room genuinely
 * cannot build. It plans a budget against what has been SPENT, and
 * neither adapter reports that — `waiverBudget` is the season's pool and
 * nothing else. A gated tab that unlocked onto an invented spend would be
 * the dead control one tier up, and charging for it would be worse.
 *
 * `player` (Player Lab) is a different kind of absence: PlayerProfileModal
 * already IS that screen, and wiring a target row to open it is a change
 * to this room's rows rather than a seventh tab. It arrives with that.
 *
 * `intel` IS here and gated, which is the point: the handoff's rule is
 * that every tier sees the next tier's feature set, and a tier system with
 * nothing behind it is a badge. */

/* How many rows the Lobby previews before handing off to the full board.
   Five is what fits above the fold beside the roster-gap column at 1440
   without the reader scrolling to learn there is more. */
const LOBBY_TARGETS = 5
const BOARD_TARGETS = 40

/* P1. `text-mint` was a marketing state mark on the void ground doing duty
   as this room's positive; `gain` is the sign colour, measured on
   slate.panel, and it is the same green every other room now prints a
   positive in. A zero or a negative takes the muted ink rather than `cost`:
   a wire player at or below replacement has not COST anybody anything, he
   is simply not worth claiming, and colouring him as a loss would be a
   direction the number does not have. */
function Gap({ value }) {
  const n = Math.round(value)
  return (
    <span className={'font-plex text-[15px] font-semibold tabular-nums ' + (n > 0 ? 'text-gain' : 'text-ink-muted')}>
      {n > 0 ? '+' : ''}
      {n}
    </span>
  )
}

/* P3. The row keeps its numeral and gains a 100px bar scaled to the best
   gap on the list it is part of.

   A ranked list of "over replacement" figures is exactly the shared-unit
   column the guide says becomes bars: 34, 31, 28, 12, 9 down a page is five
   numbers a reader subtracts by eye, and the same five as lengths is one
   glance. The numeral stays because the bar cannot say 34, which is the
   thing a manager types into a bid. */
function TargetRow({ rank, row, max, index = 0 }) {
  const p = row.player
  return (
    <div
      className="jd-rise flex items-center gap-3 border-b border-line-hairline py-2.5 last:border-b-0"
      style={{ '--i': index }}
    >
      <span className="w-6 shrink-0 font-plex text-[11px] text-ink-muted">
        {String(rank).padStart(2, '0')}
      </span>
      <PosTile pos={p.pos} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-white">{p.name}</span>
        <span className="block truncate font-plex text-[11px] text-ink-muted">
          {p.team || 'FA'}
          {p.bye ? ` · BYE ${p.bye}` : ''}
        </span>
      </span>
      {max > 0 ? (
        <span className="hidden w-[100px] shrink-0 sm:block">
          <Bar value={Math.max(0, row.gap)} max={max} sign="gain" index={index} />
        </span>
      ) : null}
      <span className="w-14 shrink-0 text-right">
        <Gap value={row.gap} />
        <span className="block font-plex text-[10px] uppercase tracking-[0.08em] text-ink-muted">
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

/* The News Wire: real headlines for the players actually on the wire.
 *
 * Through the same /news route the player sheet uses, and under the same
 * rules its own section already establishes and which are worth restating
 * because they are easy to lose in a new caller:
 *
 *   * we LINK, never republish. A headline, its source and an outbound
 *     link — reproducing a body is what a licence buys.
 *   * `configured: false` draws nothing at all. "Not wired up" and
 *     "nothing today" are different facts, and a section nobody asked to
 *     wait for is worse as a permanently empty panel than as no panel.
 *   * it fails by disappearing. Never throws, never blocks a render.
 *
 * One request per player, bounded by the caller to the top of the wire —
 * the route caches for fifteen minutes and the provider's free tier is a
 * thousand calls a month, which a room that swept the whole board would
 * spend in a sitting.
 */
function NewsWire({ rows, engine }) {
  const [items, setItems] = useState([])
  const [state, setState] = useState('loading')

  useEffect(() => {
    let alive = true
    const live = typeof window !== 'undefined' ? window.Live : null
    /* The PROVIDER's id, never the Sleeper one.

       `x` on a stats record holds this player's id at other sources, built
       nightly by the pipeline's own crosswalk, and sourceId() is how you
       ask for it — which is what LatestNewsTab already does. Passing a
       Sleeper id here, as this did first, asks Tank01 for a key it does
       not use: at best nothing comes back, and the failure this project
       actually warns about is worse than nothing, because somebody else's
       news under a player's name is the one outcome worse than an empty
       panel.

       No id means no news and no fallback — not a name search, not
       league-wide headlines dressed as his. A player the crosswalk could
       not place is simply skipped. */
    const asked = engine
      ? rows
          .map((row) => ({ row, theirId: engine.sourceId ? engine.sourceId(row.player, 'tank') : null }))
          .filter((a) => !!a.theirId)
      : []
    if (!live || !live.news || !asked.length) {
      setState('none')
      return () => { alive = false }
    }
    setState('loading')
    Promise.all(
      asked.map(({ row, theirId }) =>
        live
          .news(theirId)
          .then((res) => ({ row, res }))
          .catch(() => ({ row, res: null }))
      )
    )
      .then((all) => {
        if (!alive) return
        const out = []
        for (const { row, res } of all) {
          if (!res || res.configured === false) continue
          for (const item of (res.items || []).slice(0, 2)) {
            out.push({ player: row.player, item })
          }
        }
        setItems(out)
        setState(out.length ? 'ready' : 'none')
      })
      .catch(() => { if (alive) setState('none') })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, engine])

  /* Absent, not empty — the news tab's own rule on the player sheet. A
     panel that permanently says "no headlines" is worse than no panel, and
     an unconfigured provider is indistinguishable from a quiet week. */
  if (state === 'none') {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <Panel title="News wire">
          <div className="py-10 text-center text-[13px] text-ink-muted">
            Nothing on the wire&rsquo;s top names right now.
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
      <Panel title="News wire">
        {state === 'loading' ? (
          <div className="h-[120px] animate-pulse" />
        ) : (
          items.map(({ player, item }, i) => (
            <a
              key={player.id + ':' + i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 border-b border-line-hairline py-3 last:border-b-0"
            >
              <PosTile pos={player.pos} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                  {player.name}
                  {item.source ? ` · ${item.source}` : ''}
                </span>
                <span className="mt-0.5 block text-[14px] font-semibold leading-snug text-white">
                  {item.title}
                </span>
              </span>
            </a>
          ))
        )}
      </Panel>
    </div>
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

  /* One id->row map for every derivation below, built once per board
     change rather than per panel: rosterGaps, dropList and rivalNeeds all
     want it, and rivalNeeds calls rosterGaps once per rival. */
  const byId = useMemo(
    () => new Map(board.map((p) => [String(p.id), p])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length]
  )

  const allGaps = useMemo(
    () => (mine ? rosterGaps(mine, byId, available, gapOf) : []),
    [mine, byId, available, gapOf]
  )
  const gaps = allGaps.slice(0, 3)

  const drops = useMemo(
    () => (mine ? dropList(mine, byId, gapOf, 20) : []),
    [mine, byId, gapOf]
  )

  const rivals = useMemo(
    () => rivalNeeds(snapshot, mine, byId, available, gapOf),
    [snapshot, mine, byId, available, gapOf]
  )
  const demand = useMemo(() => demandByPosition(rivals), [rivals])

  // Somebody who would actually improve a roster -- see the note further
  // down, beside the panel this feeds.
  const targets = available.filter((row) => row.gap > 0)

  /* One scale per list, so a bar on the Targets board and a bar on the Drop
     list are not silently drawn against different maxima. Rows scaled to
     different denominators are two charts stacked, which is the failure P3
     exists to prevent rather than an implementation detail. */
  const wireMax = available.length ? Math.max(...available.map((r) => Math.max(0, r.gap))) : 0
  const dropMax = drops.length ? Math.max(...drops.map((r) => Math.max(0, r.gap))) : 0
  const gapMax = allGaps.length ? Math.max(...allGaps.map((g) => g.improvement)) : 0

  /* The stake card's headline is a sentence, so it needs the noun rather
     than the chip -- and the nouns come off the engine rather than being
     written down a third time. app.js's POS_NAMES_LONG is the copy that
     writes prose and draftRoomPositions.js is React's; a literal here would
     be the one that drifts, because nothing on this screen would notice.

     Guarded: `posNames` is a newer bridge entry than this component and a
     cached app.js will not have it, which is the same guard every other
     newer entry gets at its call site. */
  const posNames = (engine && engine.posNames && engine.posNames()) || {}

  /* P4. The four numbers this room opens with, and two of the handoff's own
     four are not among them.

     It asks for FAAB LEFT, CLAIMS RUN, HIT RATE and PTS OPEN. Neither
     adapter reports what has been SPENT -- this file's own header already
     records that, and `waiverBudget` is the season's pool -- so "FAAB left"
     would be the pool relabelled as a balance, wrong by however much the
     reader has already bid. And nothing anywhere records a claim, so there
     is no count to run and no hits to rate. A KPI strip is the most
     confident furniture on a page; filling two of its four cards with
     numbers nobody computed is the worst available place to invent one.

     What is real: the pool, how much of the wire is worth anything at all,
     the single best claim, and how many points the reader's own lineup is
     leaving on the wire. The last is what the room is for, so it takes the
     `cost` accent -- points open are points not claimed. */
  const ptsOpen = allGaps.reduce((sum, g) => sum + g.improvement, 0)
  const bestClaim = allGaps[0] || null

  const kpis = [
    {
      label: 'FAAB pool',
      value: snapshot && snapshot.waiverBudget ? '$' + snapshot.waiverBudget : '\u2014',
      note:
        snapshot && snapshot.waiverBudget
          ? 'The season\u2019s budget. Sleeper does not report what you have spent.'
          : 'This league does not run FAAB.',
      accent: 'evidence',
    },
    {
      label: 'Worth claiming',
      value: String(targets.length),
      note: `Of ${available.length} rankable on the wire, above replacement.`,
      accent: 'evidence',
    },
    {
      label: 'Best claim',
      value: bestClaim ? '+' + Math.round(bestClaim.improvement) : '\u2014',
      note: bestClaim
        ? `${bestClaim.best.player.name} over your best ${bestClaim.pos}.`
        : 'Nothing on the wire beats what you hold.',
      accent: 'gain',
    },
    {
      label: 'Points open',
      value: ptsOpen > 0 ? String(Math.round(ptsOpen)) : '0',
      note: 'Across every position a claim would improve.',
      accent: 'cost',
    },
  ]

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

  /* (`targets` is derived beside `available` above, so the KPI strip and
     the Lobby's panel read one filter rather than two.)

     A "target" is somebody who would actually improve a roster, so the
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

  const fullBoard = (
    <a href="#/rooms/waiver" className="font-mono text-[11px] font-semibold text-mint">
      {available.length} available
    </a>
  )

  /* A roster with no `ownerId` on the connection has no "your team", and
     three of these tabs are about the reader's own roster specifically.
     One sentence rather than three empty panels — and it names the fix,
     because "reconnect" is something a reader can actually do. */
  const noTeam = (
    <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
      <div className="rounded-[14px] border border-line-hairline bg-surface-card p-8 text-center text-[13px] text-ink-muted">
        Reconnect this league to see this — Juke does not know which of the{' '}
        {snapshot.totalTeams} rosters is yours.
      </div>
    </div>
  )

  if (tab === 'gaps') {
    if (!mine) return noTeam
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <Panel title="Where the wire beats your roster">
          {allGaps.length ? (
            allGaps.map((g) => (
              <div
                key={g.pos}
                className="flex items-center gap-3 border-b border-line-hairline py-3 last:border-b-0"
              >
                <PosTile pos={g.pos} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-white">
                    {g.best.player.name}
                  </span>
                  <span className="block font-mono text-[11px] text-ink-muted">
                    {g.held === null
                      ? 'you hold nobody rankable at this position'
                      : `your best ${g.pos} is ${Math.round(g.held)} over replacement`}
                  </span>
                </span>
                <Gap value={g.improvement} />
              </div>
            ))
          ) : (
            <div className="py-10 text-center text-[13px] text-ink-muted">
              Nothing on the wire beats what you already hold, at any position.
            </div>
          )}
        </Panel>
      </div>
    )
  }

  if (tab === 'drops') {
    if (!mine) return noTeam
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <Panel title="Your bench, worst first">
          {drops.length ? (
            drops.map((row, i) => (
              <TargetRow key={row.player.id} rank={i + 1} row={row} max={dropMax} index={i} />
            ))
          ) : (
            <div className="py-10 text-center text-[13px] text-ink-muted">
              Nobody on your bench is rankable — which in most leagues means a bench of kickers,
              defenses and players with no projection, and those are not cut decisions Juke will
              make for you.
            </div>
          )}
          <p className="border-t border-line-hairline py-3 text-[12px] leading-relaxed text-ink-muted">
            Starters are not listed, whatever the projection says: benching one is a start/sit
            question. Kickers and defenses are not either — Juke declines to rank those two, so it
            will not rank them to cut them.
          </p>
        </Panel>
      </div>
    )
  }

  if (tab === 'news') {
    return <NewsWire rows={available.slice(0, 8)} engine={engine} />
  }

  if (tab === 'intel') {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <UpgradeGate need="allaccess" title="See what every rival needs">
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <Panel title="What your rivals are thin at">
              {rivals.length ? (
                rivals.map((row) => (
                  <div key={row.team.rosterId} className="border-b border-line-hairline py-3 last:border-b-0">
                    <div className="text-[14px] font-semibold text-white">{row.team.teamName}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {row.gaps.map((g) => (
                        <span
                          key={g.pos}
                          className="rounded-full border border-line-hairline px-2.5 py-1 font-mono text-[11px] text-ink-muted"
                        >
                          {g.pos} +{Math.round(g.improvement)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center text-[13px] text-ink-muted">
                  No rival has a hole the wire can fill this week.
                </div>
              )}
            </Panel>
            <Panel title="Who you are bidding against">
              {demand.length ? (
                demand.map((d) => (
                  <div
                    key={d.pos}
                    className="flex items-center gap-3 border-b border-line-hairline py-3 last:border-b-0"
                  >
                    <PosTile pos={d.pos} size={30} />
                    <span className="flex-1 text-[13px] text-voidInk-body">
                      {d.count} {d.count === 1 ? 'rival needs' : 'rivals need'} a {d.pos}
                    </span>
                    <span className="font-mono text-[15px] font-semibold text-white">{d.count}</span>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center text-[13px] text-ink-muted">Nobody is bidding.</div>
              )}
            </Panel>
          </div>
        </UpgradeGate>
      </div>
    )
  }

  if (tab === 'targets') {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <Panel title="The wire, best first" action={fullBoard}>
          {available.length ? (
            available.map((row, i) => (
              <TargetRow key={row.player.id} rank={i + 1} row={row} max={wireMax} index={i} />
            ))
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
      {/* P4. The strip goes first, directly under the room's own H1, which
          is where the handoff draws it. It is rendered here rather than
          passed up to RoomPage's hero because only this component holds the
          snapshot the four numbers come out of -- see RoomPage's own note. */}
      <KpiStrip items={kpis} className="mb-5" />

      <p className="mb-5 max-w-[68ch] text-[15px] leading-relaxed text-voidInk-body">
        {snapshot.name} is synced.{' '}
        {available.length
          ? `${available.length} players are unowned and rankable`
          : 'Nobody unowned is rankable'}
        , scored under your league&rsquo;s own rules.
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel title="Top targets" action={fullBoard}>
          {targets.length ? (
            targets.slice(0, LOBBY_TARGETS).map((row, i) => (
              <TargetRow key={row.player.id} rank={i + 1} row={row} max={wireMax} index={i} />
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

        <div className="flex flex-col gap-4">
          {/* P2. The one light card on this route, and it is the claim that
              closes most of the gap.

              It is the top of the sidebar rather than a fourth panel down
              the page because it is the answer: everything else in this
              room is the working. Absent when there is no team to price a
              claim against, rather than drawn empty -- a stake card with no
              stake in it is the loudest thing on the page saying nothing. */}
          {/* P7. A room with nothing on its wire is a room with nothing to
              do IN it, and that is the state this screen spends most of the
              year in -- the panel below already says so in its own words.
              The guide files this under "Waiver, offseason", and there is
              no offseason FLAG to hang it on: neither adapter reports when
              a season ends, which is the same missing field seasonPhase.js
              already refuses to guess a playoff week from. An empty wire is
              the reachable version of the same condition, and it is the one
              a reader is actually looking at when the advice is "go and
              look at next year's rookies instead".
 
              Below the stake card, not instead of it: when both are there,
              the stake is this week and this is what to do when there is
              nothing left of this week to do. */}
          {bestClaim ? (
            <StakeCard
              eyebrow="Costing you most"
              title={`No ${(posNames[bestClaim.pos] || bestClaim.pos).toLowerCase()} on your roster is worth what the wire has`}
              cost={`+${Math.round(bestClaim.improvement)} pts open`}
            >
              {bestClaim.best.player.name} is {Math.round(bestClaim.best.gap)} over replacement.{' '}
              {bestClaim.held === null
                ? `You hold nobody rankable at ${bestClaim.pos}.`
                : `Your best ${bestClaim.pos} is ${Math.round(bestClaim.held)}.`}
            </StakeCard>
          ) : null}

          <Panel title="Where a claim would help">
            {mine ? (
              gaps.length ? (
                /* P3. Three positions, one unit, one scale -- which is the
                   shared-unit list the guide says becomes bars. The label
                   carries the player and the position he beats, because a
                   bar with only a position on it says where the gap is and
                   not what closes it. */
                gaps.map((g, i) => (
                  <BarRow
                    key={g.pos}
                    index={i}
                    label={`${g.best.player.name} \u00b7 over your best ${g.pos}`}
                    value={g.improvement}
                    max={gapMax}
                    sign="gain"
                    display={`+${Math.round(g.improvement)}`}
                    title={
                      g.held === null
                        ? `You hold nobody rankable at ${g.pos}`
                        : `Your best ${g.pos} is ${Math.round(g.held)} over replacement`
                    }
                  />
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

          {targets.length ? null : (
            <RunNextCard
              eyebrow="Nothing here this week"
              title="The Prospect Room"
              action={{ label: 'Open the Prospect Room', href: '#/rooms/prospect' }}
            >
              Your wire has nobody worth a starting slot. Next year&rsquo;s class is where the
              next real add comes from.
            </RunNextCard>
          )}
        </div>
      </div>
    </div>
  )
}
