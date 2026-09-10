import { useEffect, useMemo, useState } from 'react'
import {
  demandByPosition, dropList, freeAgents, myTeam, rivalNeeds, rosterGaps,
} from '../../rooms/waiverBoard.js'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { useEngine, useJukeTick } from '../../../hooks/useJukeEngine.js'
import { Arrow, Kicker, VoltButton } from '../v2ui.jsx'
import {
  Bar, BarRow, CouldNotRead, Empty, Footnote, KpiStrip, Loading, NoTeam, Panel, PlayerLine,
  PosSquare, RunNextCard, StakeCard, TierGate, signedNum,
} from './roomKit.jsx'

/* The Waiver Room, connected. Every figure is production's: the wire is
   waiverBoard.js's freeAgents() over JukeEngine.replacementGap(), the gaps,
   the drop list and the rival reads are the same module's functions, and
   nothing here re-derives a value. What changed is the drawing.

   Same six sections as production (Lobby, Targets Board, Roster Gaps, Drop
   List, News Wire, League Intel behind Multi-League). FAAB Planner and
   Player Lab stay absent for production's own reasons: nothing reports what
   has been SPENT, and the player sheet already is the lab. */

const LOBBY_TARGETS = 5
const BOARD_TARGETS = 40

function TargetRow({ rank, row, max }) {
  const p = row.player
  const n = Math.round(row.gap)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0 border-b border-white/[0.05] py-2.5 last:border-b-0">
      <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-v2-ink3">{String(rank).padStart(2, '0')}</span>
      <PosSquare pos={p.pos} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-v2-ink">{p.name}</span>
        <span className="block truncate font-mono text-[11px] text-v2-ink3">
          {p.team || 'FA'}{p.bye ? ` · BYE ${p.bye}` : ''}
        </span>
      </span>
      {max > 0 && (
        // Wraps onto its own full-width line on a phone rather than being
        // dropped: the comparison is the point of a ranked list.
        <span className="order-last mt-1.5 w-full sm:order-none sm:mt-0 sm:w-[120px]">
          <Bar value={Math.max(0, row.gap)} max={max} tone="gain" />
        </span>
      )}
      <span className="w-[76px] shrink-0 text-right">
        {/* A player at or below replacement has not cost anybody anything —
            he is simply not worth claiming — so a non-positive gap takes the
            quiet ink rather than the loss colour. */}
        <span className={`block font-mono text-[15px] font-semibold tabular-nums ${n > 0 ? 'text-v2-volt' : 'text-v2-ink3'}`}>
          {n > 0 ? '+' : ''}{String(n).replace('-', '−')}
        </span>
        <span className="block whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.08em] text-v2-ink3">over repl.</span>
      </span>
    </div>
  )
}

/* Real headlines for the top of the wire, through the same /news route the
   player sheet uses. Asked by the PROVIDER's id (sourceId), never a name;
   no id means no news and no fallback. Every item goes through the bridge's
   newsItemView(), which is where the link is checked for http(s) — the
   production room reads item.url raw, and a feed's link is a claim. */
function NewsWire({ rows, engine }) {
  const [items, setItems] = useState([])
  const [state, setState] = useState('loading')

  useEffect(() => {
    let alive = true
    const live = typeof window !== 'undefined' ? window.Live : null
    const asked = engine
      ? rows.map((row) => ({ row, theirId: engine.sourceId ? engine.sourceId(row.player, 'tank') : null })).filter((a) => !!a.theirId)
      : []
    if (!live || !live.news || !asked.length) { setState('none'); return () => { alive = false } }
    setState('loading')
    Promise.all(asked.map(({ row, theirId }) => live.news(theirId).then((res) => ({ row, res })).catch(() => ({ row, res: null }))))
      .then((all) => {
        if (!alive) return
        const out = []
        for (const { row, res } of all) {
          if (!res || res.configured === false) continue
          for (const raw of (res.items || []).slice(0, 2)) {
            const item = engine.newsItemView ? engine.newsItemView(raw) : null
            if (item) out.push({ player: row.player, item })
          }
        }
        setItems(out)
        setState(out.length ? 'ready' : 'none')
      })
      .catch(() => { if (alive) setState('none') })
    return () => { alive = false }
  }, [rows, engine])

  return (
    <Panel title="News wire" action={<Kicker>Top of your wire</Kicker>}>
      {state === 'loading' ? (
        <div className="py-4" role="status" aria-label="Loading headlines"><div className="h-24 animate-pulse rounded-md bg-white/[0.04]" /></div>
      ) : state === 'none' ? (
        <Empty>Nothing on the wire&rsquo;s top names right now.</Empty>
      ) : (
        <ul>
          {items.map(({ player, item }, i) => (
            <li key={player.id + ':' + i} className="border-b border-white/[0.05] last:border-b-0">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
              >
                <PosSquare pos={player.pos} />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3">
                    {player.name}{item.source ? ` · ${item.source}` : ''}
                  </span>
                  <span className="mt-0.5 block text-[14px] font-medium leading-snug text-v2-ink group-hover:underline">{item.title}</span>
                </span>
                <Arrow className="mt-1 h-3.5 w-3.5 shrink-0 text-v2-ink3" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <Footnote>Headlines link to their source. Juke links and never republishes.</Footnote>
    </Panel>
  )
}

export default function WaiverLive({ league, snapshot, status, reason, tab, setTab, onRetry }) {
  const engine = useEngine()
  useJukeTick(engine)

  const board = engine && engine.dataReady && engine.dataReady() ? engine.board() : []
  const gapOf = engine ? engine.replacementGap : null

  // board.length, never board: the array is mutated in place, so only its
  // length moves when players.js lands — see CLAUDE.md on memo keys.
  const available = useMemo(
    () => freeAgents(board, snapshot, gapOf, BOARD_TARGETS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length, snapshot, gapOf]
  )
  const mine = myTeam(snapshot, league)
  const byId = useMemo(
    () => new Map(board.map((p) => [String(p.id), p])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length]
  )
  const allGaps = useMemo(() => (mine ? rosterGaps(mine, byId, available, gapOf) : []), [mine, byId, available, gapOf])
  const drops = useMemo(() => (mine ? dropList(mine, byId, gapOf, 20) : []), [mine, byId, gapOf])
  const rivals = useMemo(() => rivalNeeds(snapshot, mine, byId, available, gapOf), [snapshot, mine, byId, available, gapOf])
  const demand = useMemo(() => demandByPosition(rivals), [rivals])
  const newsRows = useMemo(() => available.slice(0, 8), [available])

  if (status === 'loading' || (status === 'ready' && !board.length)) return <Loading />
  if (status !== 'ready' || !snapshot) return <CouldNotRead reason={reason} onRetry={onRetry} />

  const targets = available.filter((row) => row.gap > 0)
  const wireMax = available.length ? Math.max(...available.map((r) => Math.max(0, r.gap))) : 0
  const dropMax = drops.length ? Math.max(...drops.map((r) => Math.max(0, r.gap))) : 0
  const gapMax = allGaps.length ? Math.max(...allGaps.map((g) => g.improvement)) : 0
  const posNames = (engine && engine.posNames && engine.posNames()) || {}
  const ptsOpen = allGaps.reduce((sum, g) => sum + g.improvement, 0)
  const bestClaim = allGaps[0] || null

  // Whichever waiver system the league actually runs: ESPN sends a $100
  // budget whether or not a league bids, so the flag decides, not the number.
  const waiver = snapshot.waiver || null
  const platformName = platformFor(league && league.provider).name
  const isFaab = waiver ? waiver.type === 'faab' : !!snapshot.waiverBudget

  const kpis = [
    isFaab
      ? { label: 'FAAB pool', value: snapshot.waiverBudget ? '$' + snapshot.waiverBudget : '—', tone: 'evidence', note: `The season’s budget. ${platformName} does not report what you have spent.` }
      : { label: 'Waivers', value: 'Order', tone: 'evidence', note: waiver && waiver.resetsOrder === false ? 'A claim moves you to the back, and the order never resets.' : 'Claims run on waiver order, not on a budget.' },
    { label: 'Worth claiming', value: String(targets.length), tone: 'evidence', note: `Of ${available.length} rankable on the wire, above replacement.` },
    { label: 'Best claim', value: bestClaim ? '+' + Math.round(bestClaim.improvement) : '—', tone: bestClaim ? 'gain' : 'evidence', note: bestClaim ? `${bestClaim.best.player.name} over your best ${bestClaim.pos}.` : 'Nothing on the wire beats what you hold.' },
    { label: 'Points open', value: ptsOpen > 0 ? String(Math.round(ptsOpen)) : '0', tone: ptsOpen > 0 ? 'cost' : 'evidence', note: 'Across every position a claim would improve.' },
  ]

  const toBoard = (
    <button
      type="button"
      onClick={() => setTab('targets')}
      className="inline-flex min-h-[32px] items-center gap-1 rounded-[8px] px-2 font-mono text-[11px] font-semibold text-v2-ink2 hover:text-v2-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
    >
      {available.length} available <Arrow className="h-3.5 w-3.5" />
    </button>
  )

  if (tab === 'gaps') {
    if (!mine) return <NoTeam teams={snapshot.totalTeams} what="see this" />
    return (
      <Panel title="Where the wire beats your roster">
        {allGaps.length ? allGaps.map((g) => (
          <BarRow
            key={g.pos}
            label={g.best.player.name}
            sub={g.held === null ? `you hold nobody rankable at ${g.pos}` : `your best ${g.pos} is ${Math.round(g.held)} over replacement`}
            value={g.improvement}
            max={gapMax}
            tone="gain"
            display={signedNum(g.improvement)}
          />
        )) : <Empty>Nothing on the wire beats what you already hold, at any position.</Empty>}
      </Panel>
    )
  }

  if (tab === 'drops') {
    if (!mine) return <NoTeam teams={snapshot.totalTeams} what="see this" />
    return (
      <Panel title="Your bench, worst first">
        {drops.length
          ? drops.map((row, i) => <TargetRow key={row.player.id} rank={i + 1} row={row} max={dropMax} />)
          : <Empty>Nobody on your bench is rankable — in most leagues that means a bench of kickers, defenses and players with no projection, and those are not cut decisions Juke will make for you.</Empty>}
        <Footnote>
          Starters are not listed, whatever the projection says: benching one is a start/sit question. Kickers and
          defenses are not either — Juke declines to rank those two, so it will not rank them to cut them.
        </Footnote>
      </Panel>
    )
  }

  if (tab === 'news') return <NewsWire rows={newsRows} engine={engine} />

  if (tab === 'intel') {
    return (
      <TierGate need="allaccess" title="See what every rival needs">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Panel title="What your rivals are thin at">
            {rivals.length ? rivals.map((row) => (
              <div key={row.team.rosterId} className="border-b border-white/[0.05] py-3 last:border-b-0">
                <div className="text-[14px] font-medium text-v2-ink">{row.team.teamName}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {row.gaps.map((g) => (
                    <span key={g.pos} className="inline-flex items-center gap-1.5 rounded-[7px] bg-v2-inset px-2 py-1 font-mono text-[11px] text-v2-ink2 ring-1 ring-inset ring-white/[0.07]">
                      {g.pos} <span className="tabular-nums text-v2-ink">+{Math.round(g.improvement)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )) : <Empty>No rival has a hole the wire can fill this week.</Empty>}
          </Panel>
          <Panel title="Who you bid against">
            {demand.length ? demand.map((d) => (
              <PlayerLine
                key={d.pos}
                pos={d.pos}
                name={`${d.count} ${d.count === 1 ? 'rival needs' : 'rivals need'} a ${d.pos}`}
                right={<span className="font-mono text-[15px] font-semibold tabular-nums text-v2-ink">{d.count}</span>}
              />
            )) : <Empty>Nobody is bidding.</Empty>}
          </Panel>
        </div>
      </TierGate>
    )
  }

  if (tab === 'targets') {
    return (
      <Panel title="The wire, best first" action={<Kicker>{available.length} priced</Kicker>}>
        {available.length
          ? available.map((row, i) => <TargetRow key={row.player.id} rank={i + 1} row={row} max={wireMax} />)
          : <Empty>Nobody on the wire is projected above replacement. In a league this deep that is the normal state, not an error.</Empty>}
      </Panel>
    )
  }

  return (
    <div className="space-y-5">
      <KpiStrip items={kpis} />
      <p className="max-w-[68ch] text-[15px] leading-[1.55] text-v2-ink2">
        {snapshot.name} is synced.{' '}
        {available.length ? `${available.length} players are unowned and rankable` : 'Nobody unowned is rankable'}, scored under
        your league&rsquo;s own rules.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Top targets" action={toBoard}>
          {targets.length ? (
            targets.slice(0, LOBBY_TARGETS).map((row, i) => <TargetRow key={row.player.id} rank={i + 1} row={row} max={wireMax} />)
          ) : (
            // The true state of a deep league's wire most weeks: the full
            // board is one press away for a bye-week fill.
            <Empty>
              Nobody on the wire is worth more than a replacement-level starter this week. That is the normal state of a{' '}
              {snapshot.totalTeams}-team league, not an error.
            </Empty>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          {bestClaim && (
            <StakeCard
              eyebrow="Costing you most"
              title={`No ${(posNames[bestClaim.pos] || bestClaim.pos).toLowerCase()} on your roster is worth what the wire has`}
              cost={`+${Math.round(bestClaim.improvement)} pts open`}
            >
              {bestClaim.best.player.name} is {Math.round(bestClaim.best.gap)} over replacement.{' '}
              {bestClaim.held === null ? `You hold nobody rankable at ${bestClaim.pos}.` : `Your best ${bestClaim.pos} is ${Math.round(bestClaim.held)}.`}
            </StakeCard>
          )}

          <Panel title="Where a claim would help">
            {mine ? (
              allGaps.length ? allGaps.slice(0, 3).map((g) => (
                <BarRow
                  key={g.pos}
                  label={`${g.best.player.name} · over your best ${g.pos}`}
                  value={g.improvement}
                  max={gapMax}
                  tone="gain"
                  display={signedNum(g.improvement)}
                />
              )) : <Empty>Nothing on the wire beats what you already hold at any position.</Empty>
            ) : (
              <Empty>Reconnect this league to see which of your own positions a claim would improve.</Empty>
            )}
          </Panel>

          {!targets.length && (
            <RunNextCard
              eyebrow="Nothing here this week"
              title="The Prospect Room"
              action={<VoltButton href="#/v2/rooms/prospect" size="md">Open the Prospect Room <Arrow /></VoltButton>}
            >
              Your wire has nobody worth a starting slot. Next year&rsquo;s class is where the next real add comes from.
            </RunNextCard>
          )}
        </div>
      </div>
    </div>
  )
}
