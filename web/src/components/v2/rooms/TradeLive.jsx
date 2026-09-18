import { useEffect, useMemo, useState } from 'react'
import { freeAgents, myTeam, rivalNeeds } from '../../rooms/waiverBoard.js'
import { rosterTotal, rosterValues, tradeSwing, valueBoard } from '../../rooms/tradeBoard.js'
import { tradeWindow, msUntilDeadline } from '../../../lib/tradeDeadline.js'
import { countdownParts } from '../../../lib/countdown.js'
import { useEngine, useJukeTick } from '../../../hooks/useJukeEngine.js'
import { leagueGapOf } from '../../../lib/leagueGap.js'
import { Kicker, PosChip } from '../v2ui.jsx'
import {
  BarRow, CouldNotRead, Empty, Footnote, Loading, NoTeam, Panel, PosSquare, TierGate, signedNum,
} from './roomKit.jsx'

/* The Trade Room, connected. Priced in SEASON points over replacement —
   tradeBoard.js's valueOf() over JukeEngine.replacementGap() — because a
   trade changes a roster for the rest of the season; the Strategy Room is
   the weekly one. tradeSwing() refuses a deal holding a kicker or defense
   rather than counting him at zero, and this page says so.

   Four sections, as production: Lobby, Trade Builder, Value Board, Rival
   Needs behind Multi-League. Offers stays absent: nothing reads a pending
   trade, and no feed here can see one. */

const BOARD_ROWS = 40

// Zero takes neither sign colour: a dead-even deal gained nobody anything.
const toneOf = (n) => (n > 0 ? 'gain' : n < 0 ? 'cost' : 'evidence')

function Val({ value }) {
  // Unsigned ink: a player's value has no direction — he is worth what he
  // is worth to either side. Only the swing carries a sign colour.
  if (value === null || value === undefined) return <span className="font-mono text-[13px] text-v2-ink3" title="Juke does not rank kickers or defenses">—</span>
  const n = Math.round(value)
  return <span className={`font-mono text-[14px] font-semibold tabular-nums ${n >= 0 ? 'text-v2-ink' : 'text-v2-ink3'}`}>{signedNum(n)}</span>
}

function useMinuteTick(active) {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => bump((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [active])
}

function whenText(at) {
  try {
    return new Date(at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  } catch { return null }
}

/* Whether this league is still trading — production's TradeWindow, same
   four states off lib/tradeDeadline.js. `unknown` draws nothing: a room
   that cannot find out must say neither open nor shut. */
function TradeWindowStrip({ snapshot }) {
  const deadline = (snapshot && snapshot.tradeDeadline) || null
  const w = tradeWindow(deadline, { week: snapshot && snapshot.week })
  useMinuteTick(w.state === 'open' && w.at !== null)
  if (w.state === 'unknown') return null

  let tone = 'open'
  let head = 'Trading is open'
  let body = null
  if (w.state === 'disabled') {
    tone = 'shut'; head = 'This league does not trade'
    body = 'Its settings have trading switched off, so nothing built here can be sent.'
  } else if (w.state === 'passed') {
    tone = 'shut'; head = 'The trade deadline has passed'
    body = `${w.at !== null ? `It closed ${whenText(w.at) || 'earlier this season'}.` : `It closed after week ${w.week}.`} Your roster is still priced below, and nothing here can be sent.`
  } else {
    const left = w.at !== null ? countdownParts(msUntilDeadline(deadline)) : null
    body = left
      ? <>Closes in <span className="font-mono tabular-nums text-v2-ink">{left.compact}</span>{whenText(w.at) ? ` — ${whenText(w.at)}` : ''}.</>
      : w.week !== null ? `It closes after week ${w.week}.` : 'The deadline has not passed.'
  }
  return (
    <div
      data-trade-window={tone}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] bg-v2-panel px-4 py-3 ring-1 ring-inset ${tone === 'shut' ? 'ring-v2-loss/35' : 'ring-white/[0.07]'}`}
    >
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${tone === 'shut' ? 'bg-v2-loss' : 'bg-v2-cyan'}`} aria-hidden="true" />
        <span className={`font-mono text-[11px] font-semibold uppercase tracking-[0.14em] ${tone === 'shut' ? 'text-v2-loss' : 'text-v2-ink'}`}>{head}</span>
      </span>
      <span className="text-[13px] leading-[1.5] text-v2-ink2">{body}</span>
    </div>
  )
}

/* One player you can put in the deal. A real toggle — a button with
   aria-pressed — so a screen reader says what it is. */
function PickRow({ row, on, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`flex min-h-[48px] w-full items-center gap-3 border-b border-white/[0.05] px-1 py-2 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v2-volt ${on ? 'bg-v2-volt/[0.06]' : 'hover:bg-white/[0.025]'}`}
    >
      <span
        aria-hidden="true"
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] ring-1 ring-inset ${on ? 'bg-v2-volt text-v2-voltInk ring-v2-volt' : 'ring-white/[0.2]'}`}
      >
        {on && (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none"><path d="M2.5 6.2 5 8.5l4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </span>
      <PosSquare pos={row.player.pos} />
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-v2-ink">{row.player.name}</span>
      <Val value={row.value} />
    </button>
  )
}

export default function TradeLive({ league, snapshot, status, reason, tab, onRetry }) {
  const engine = useEngine()
  useJukeTick(engine)

  const board = engine && engine.dataReady && engine.dataReady() ? engine.board() : []
  const gapOf = useMemo(() => leagueGapOf(engine, snapshot), [engine, snapshot])
  const byId = useMemo(
    () => new Map(board.map((p) => [String(p.id), p])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length]
  )
  const mine = myTeam(snapshot, league)
  const rivals = useMemo(
    () => ((snapshot && snapshot.teams) || []).filter((t) => !mine || t.rosterId !== mine.rosterId),
    [snapshot, mine]
  )

  const [partnerId, setPartnerId] = useState(null)
  const [give, setGive] = useState([])
  const [get, setGet] = useState([])

  const partner = useMemo(
    () => rivals.find((t) => String(t.rosterId) === String(partnerId)) || rivals[0] || null,
    [rivals, partnerId]
  )
  const myRows = useMemo(() => rosterValues(mine, byId, gapOf), [mine, byId, gapOf])
  const theirRows = useMemo(() => rosterValues(partner, byId, gapOf), [partner, byId, gapOf])
  const swing = useMemo(() => {
    const giving = give.map((id) => byId.get(String(id))).filter(Boolean)
    const getting = get.map((id) => byId.get(String(id))).filter(Boolean)
    return tradeSwing(giving, getting, gapOf)
  }, [give, get, byId, gapOf])
  const values = useMemo(() => valueBoard(snapshot, byId, gapOf, BOARD_ROWS), [snapshot, byId, gapOf])
  const needs = useMemo(() => {
    if (!snapshot || !board.length) return []
    return rivalNeeds(snapshot, mine, byId, freeAgents(board, snapshot, gapOf, 60), gapOf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, mine, byId, gapOf, board.length])

  if (status === 'loading' || (status === 'ready' && !board.length)) return <Loading />
  if (status !== 'ready' || !snapshot) return <CouldNotRead reason={reason} onRetry={onRetry} />

  if (tab === 'values') {
    const valueMax = values.length ? Math.max(...values.map((r) => Math.abs(r.value))) : 0
    return (
      <Panel title="Every rostered player, by value" action={<Kicker>Season pts over replacement</Kicker>}>
        {values.map((row, i) => (
          <div key={row.player.id} className="flex flex-wrap items-center gap-x-3 border-b border-white/[0.05] py-2.5 last:border-b-0">
            <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-v2-ink3">{String(i + 1).padStart(2, '0')}</span>
            <PosSquare pos={row.player.pos} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-v2-ink">{row.player.name}</span>
              <span className="block truncate font-mono text-[11px] text-v2-ink3">{row.team.teamName}{mine && row.team.rosterId === mine.rosterId ? ' · yours' : ''}</span>
            </span>
            <span className="order-last mt-1.5 w-full sm:order-none sm:mt-0 sm:w-[120px]" aria-hidden="true">
              <span className="relative block h-1.5 w-full rounded-full bg-white/[0.06]">
                <span className="absolute inset-y-0 left-0 rounded-full bg-v2-cyan/70" style={{ width: `${valueMax && row.value > 0 ? Math.max(4, (row.value / valueMax) * 100) : 0}%` }} />
              </span>
            </span>
            <span className="w-14 shrink-0 text-right"><Val value={row.value} /></span>
          </div>
        ))}
        <Footnote>
          Kickers and defenses are not here. Juke declines to rank those two anywhere — three seasons of backtesting
          found their projected order no better than chance — so it will not price them in a trade either.
        </Footnote>
      </Panel>
    )
  }

  if (tab === 'rivals') {
    return (
      <TierGate need="allaccess" title="Know what every rival is short of">
        <Panel title="What each rival needs">
          {needs.length ? needs.map((row) => (
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
          )) : <Empty>No rival has a hole worth trading into.</Empty>}
        </Panel>
      </TierGate>
    )
  }

  if (!mine) return <NoTeam teams={snapshot.totalTeams} what="build a trade" />

  const toggle = (list, setter) => (id) => setter(list.indexOf(id) >= 0 ? list.filter((x) => x !== id) : list.concat(id))
  // Both bars against the larger of the two: `them` is exactly `-you`, so
  // each scaled to its own value would draw one chart that cannot say
  // anything. Floored at 1 so a dead-even deal divides by something.
  const swingMax = Math.max(Math.abs(swing.you), Math.abs(swing.them), 1)
  const empty = !give.length && !get.length
  const verdict = !swing.priced
    ? { text: 'Juke will not call this one', cls: 'text-v2-ink3' }
    : empty
      ? { text: 'Pick players on both sides', cls: 'text-v2-ink3' }
      : Math.abs(swing.you) < 5
        ? { text: 'Close to even', cls: 'text-v2-ink2' }
        : swing.you > 0
          ? { text: 'This favors you', cls: 'text-v2-volt' }
          : { text: 'This favors them', cls: 'text-v2-loss' }

  const builder = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px_minmax(0,1fr)]">
      {/* Below lg the swing panel sits between two fifteen-row rosters, so a
          reader ticking players in "You get" cannot see what the deal is
          doing. This strip rides under the site header and says it — the
          same number as the panel, never a second calculation. */}
      {!empty && (
        <div className="sticky top-[68px] z-20 flex items-center justify-between gap-3 rounded-[12px] bg-v2-raised/95 px-4 py-2.5 ring-1 ring-inset ring-white/[0.12] backdrop-blur lg:hidden" aria-hidden="true">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3">Swing for you</span>
          <span className={`font-telemetry text-[26px] font-bold italic leading-none tabular-nums ${swing.priced ? (swing.you > 0 ? 'text-v2-volt' : swing.you < 0 ? 'text-v2-loss' : 'text-v2-ink') : 'text-v2-ink3'}`}>
            {swing.priced ? signedNum(swing.you) : '—'}
          </span>
          <span className={`text-[12px] font-semibold ${verdict.cls}`}>{verdict.text}</span>
        </div>
      )}
      <Panel title="You send" action={<span className="truncate font-mono text-[11px] text-v2-ink3">{mine.teamName}</span>}>
        <div className="-mx-1">
          {myRows.map((row) => (
            <PickRow key={row.player.id} row={row} on={give.indexOf(row.player.id) >= 0} onToggle={() => toggle(give, setGive)(row.player.id)} />
          ))}
        </div>
      </Panel>

      <div className="flex flex-col gap-4 lg:order-none">
        <section className="rounded-[18px] bg-v2-panel p-5 ring-1 ring-inset ring-white/[0.07] lg:sticky lg:top-20" aria-live="polite">
          <Kicker>The swing</Kicker>
          {swing.priced ? (
            <>
              <p className={`mt-2 font-telemetry text-[64px] font-extrabold italic leading-none tabular-nums ${swing.you > 0 ? 'text-v2-volt' : swing.you < 0 ? 'text-v2-loss' : 'text-v2-ink'}`}>
                {signedNum(swing.you)}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3">For you, over the season</p>
              {/* Two sides of one zero-sum deal on a shared zero axis: what
                  you gain is exactly what they lose. */}
              <div className="mt-3">
                <BarRow label="You" value={swing.you} max={swingMax} zeroAxis tone={toneOf(swing.you)} display={signedNum(swing.you)} />
                <BarRow label={partner ? partner.teamName : 'Them'} value={swing.them} max={swingMax} zeroAxis tone={toneOf(swing.them)} display={signedNum(swing.them)} />
              </div>
            </>
          ) : (
            <p className="mt-2 font-telemetry text-[64px] font-extrabold italic leading-none text-v2-ink3">—</p>
          )}
          <p className={`mt-3 text-[14px] font-semibold ${verdict.cls}`}>{verdict.text}</p>
          {!swing.priced && (
            <p className="mt-2 text-[12px] leading-[1.55] text-v2-ink3">
              This deal includes a kicker or a defense. Juke does not rank those two, so it will not put a number on a
              trade containing one rather than guess at it.
            </p>
          )}
          {!empty && (
            <button
              type="button"
              onClick={() => { setGive([]); setGet([]) }}
              className="mt-4 inline-flex min-h-[40px] items-center rounded-[10px] px-3 text-[12px] font-medium text-v2-ink2 ring-1 ring-inset ring-white/[0.12] hover:text-v2-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
            >
              Clear the deal
            </button>
          )}
        </section>

        <section className="rounded-[18px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07]">
          <Kicker>Trading with</Kicker>
          <div role="group" aria-label="Trade partner" className="mt-2 flex flex-wrap gap-1.5">
            {rivals.map((t) => {
              const on = !!partner && t.rosterId === partner.rosterId
              return (
                <button
                  key={t.rosterId}
                  type="button"
                  aria-pressed={on}
                  onClick={() => { setPartnerId(t.rosterId); setGet([]) }}
                  className={`min-h-[40px] max-w-full truncate rounded-[10px] px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt ${
                    on ? 'bg-v2-volt text-v2-voltInk' : 'text-v2-ink2 ring-1 ring-inset ring-white/[0.1] hover:text-v2-ink'
                  }`}
                >
                  {t.teamName}
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <Panel title="You get" action={<span className="truncate font-mono text-[11px] text-v2-ink3">{partner ? partner.teamName : '—'}</span>}>
        {theirRows.length ? (
          <div className="-mx-1">
            {theirRows.map((row) => (
              <PickRow key={row.player.id} row={row} on={get.indexOf(row.player.id) >= 0} onToggle={() => toggle(get, setGet)(row.player.id)} />
            ))}
          </div>
        ) : <Empty>Pick a manager to trade with.</Empty>}
      </Panel>
    </div>
  )

  if (tab === 'builder') {
    return (
      <div className="space-y-4">
        <TradeWindowStrip snapshot={snapshot} />
        {builder}
      </div>
    )
  }

  const mineTotal = rosterTotal(mine, byId, gapOf)
  const shut = tradeWindow(snapshot.tradeDeadline, { week: snapshot.week }).state
  const top = myRows.filter((r) => r.value !== null).slice().sort((a, b) => b.value - a.value)[0]

  return (
    <div className="space-y-4">
      <TradeWindowStrip snapshot={snapshot} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-[14px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07]">
          <Kicker>Your roster, over replacement</Kicker>
          <p className="mt-2 font-telemetry text-[40px] font-bold leading-none tabular-nums text-v2-ink">{signedNum(mineTotal.total)}</p>
          <p className="mt-2 text-[12px] leading-[1.5] text-v2-ink2">
            Across {mineTotal.priced} of {mineTotal.held} players
            {mineTotal.held > mineTotal.priced ? ' — the rest are kickers and defenses, which Juke does not rank.' : '.'}
          </p>
        </div>
        <div className="rounded-[14px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07]">
          <Kicker>Your most tradeable</Kicker>
          {top ? (
            <>
              <p className="mt-2 flex items-center gap-2"><PosChip pos={top.player.pos} /><span className="truncate text-[16px] font-semibold text-v2-ink">{top.player.name}</span></p>
              <p className="mt-2 font-mono text-[12px] tabular-nums text-v2-ink2">{signedNum(top.value)} over replacement</p>
            </>
          ) : <p className="mt-2 text-[13px] text-v2-ink2">Nobody on your roster is priced.</p>}
        </div>
        <div className="rounded-[14px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07]">
          <Kicker>Managers to trade with</Kicker>
          <p className="mt-2 font-telemetry text-[40px] font-bold leading-none tabular-nums text-v2-ink">{rivals.length}</p>
          <p className="mt-2 text-[12px] leading-[1.5] text-v2-ink2">
            {shut === 'passed' || shut === 'disabled'
              ? 'Both sides of any deal are still priced below.'
              : 'Build a deal below and both sides are priced before you send it.'}
          </p>
        </div>
      </div>
      {builder}
    </div>
  )
}
