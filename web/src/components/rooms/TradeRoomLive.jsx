import { useMemo, useState } from 'react'
import { PosTile } from './sampleParts.jsx'
import BarRow from '../decision/Bar.jsx'
import { signed } from '../decision/tokens.js'
import { myTeam, rivalNeeds } from './waiverBoard.js'
import { freeAgents } from './waiverBoard.js'
import { rosterTotal, rosterValues, tradeSwing, valueBoard } from './tradeBoard.js'
import UpgradeGate from '../shell/UpgradeGate.jsx'
import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'

/* The Trade Room, with a real league behind it.
 *
 * Four of the handoff's five tabs. The missing one is Offers, which reads
 * Sleeper's pending trades out of /league/<id>/transactions/<week> — not
 * fetched, so there is no inbox and the tab is not listed.
 *
 * ---- Season value here, weekly value in the Strategy Room ----
 *
 * A trade changes your roster for the rest of the season, so it is priced
 * in season points over replacement — which is what ROOMS' own blurb for
 * this room already promises. The Strategy Room asks a weekly question and
 * uses per-game. Using one unit in both would be wrong in one of them, and
 * tradeBoard.js names which is which so nobody unifies them later.
 */

export const TABS = [
  { key: 'lobby', label: 'Lobby' },
  { key: 'builder', label: 'Trade Builder' },
  { key: 'values', label: 'Value Board' },
  { key: 'rivals', label: 'Rival Needs', gate: 'allaccess' },
]

const BOARD_ROWS = 40

function Val({ value }) {
  if (value === null || value === undefined) {
    return <span className="font-plex text-[13px] text-ink-muted">—</span>
  }
  const n = Math.round(value)
  /* Unsigned ink, not a sign colour. A player's trade value is a quantity
     without a direction -- he is worth what he is worth, to either side --
     and colouring it green would make every row on the value board read as
     a gain to somebody. The sign colours are for the swing, which is the
     one number on this screen that actually has a direction. */
  return (
    <span className={'font-plex text-[15px] font-semibold tabular-nums ' + (n >= 0 ? 'text-ink' : 'text-ink-muted')}>
      {n > 0 ? '+' : ''}
      {n}
    </span>
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

/* One selectable player. A button rather than a row with an onClick,
   because it is a real control and a screen reader should say so. */
function PickRow({ row, on, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={
        'flex w-full items-center gap-3 border-b border-line-hairline py-2.5 text-left last:border-b-0 ' +
        (on ? 'opacity-100' : 'opacity-80 hover:opacity-100')
      }
    >
      <span
        aria-hidden="true"
        className={
          'flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border text-[10px] ' +
          (on ? 'border-teal bg-teal text-obsidian' : 'border-line-hairline')
        }
      >
        {on ? '✓' : ''}
      </span>
      <PosTile pos={row.player.pos} size={28} />
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">
        {row.player.name}
      </span>
      <Val value={row.value} />
    </button>
  )
}

export default function TradeRoomLive({ league, snapshot, status, reason, tab }) {
  const engine = useEngine()
  useJukeTick(engine)

  const board = engine && engine.dataReady && engine.dataReady() ? engine.board() : []
  const gapOf = engine ? engine.replacementGap : null

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

  const values = useMemo(
    () => valueBoard(snapshot, byId, gapOf, BOARD_ROWS),
    [snapshot, byId, gapOf]
  )

  const needs = useMemo(() => {
    if (!snapshot || !board.length) return []
    const available = freeAgents(board, snapshot, gapOf, 60)
    return rivalNeeds(snapshot, mine, byId, available, gapOf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, mine, byId, gapOf, board.length])

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

  if (tab === 'values') {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <Panel
          title="Every rostered player, by value"
          action={<span className="font-mono text-[11px] text-ink-muted">over replacement</span>}
        >
          {values.map((row, i) => (
            <div
              key={row.player.id}
              className="flex items-center gap-3 border-b border-line-hairline py-2.5 last:border-b-0"
            >
              <span className="w-6 shrink-0 font-mono text-[11px] text-ink-muted">
                {String(i + 1).padStart(2, '0')}
              </span>
              <PosTile pos={row.player.pos} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-white">
                  {row.player.name}
                </span>
                <span className="block truncate font-mono text-[11px] text-ink-muted">
                  {row.team.teamName}
                </span>
              </span>
              <Val value={row.value} />
            </div>
          ))}
          <p className="border-t border-line-hairline py-3 text-[12px] leading-relaxed text-ink-muted">
            Kickers and defenses are not here. Juke declines to rank those two anywhere — three
            seasons of backtesting found their projected order no better than chance — so it will
            not price them in a trade either.
          </p>
        </Panel>
      </div>
    )
  }

  if (tab === 'rivals') {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <UpgradeGate need="allaccess" title="Know what every rival is short of">
          <Panel title="What each rival needs">
            {needs.length ? (
              needs.map((row) => (
                <div
                  key={row.team.rosterId}
                  className="border-b border-line-hairline py-3 last:border-b-0"
                >
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
                No rival has a hole worth trading into.
              </div>
            )}
          </Panel>
        </UpgradeGate>
      </div>
    )
  }

  if (!mine) {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
        <div className="rounded-[14px] border border-line-hairline bg-surface-card p-8 text-center text-[13px] text-ink-muted">
          Reconnect this league to build a trade — Juke does not know which of the{' '}
          {snapshot.totalTeams} rosters is yours.
        </div>
      </div>
    )
  }

  const toggle = (setter, list) => (id) =>
    setter(list.indexOf(id) >= 0 ? list.filter((x) => x !== id) : list.concat(id))

  /* Both bars against the larger of the two, so the pair is symmetric --
     which it must be, because the two numbers ARE symmetric: `them` is
     exactly `-you`. Scaling each to its own value would draw two bars of
     identical length pointing opposite ways whatever the deal was, which is
     a chart that cannot say anything. Floored at 1 so a dead-even trade
     divides by something. */
  const swingMax = Math.max(Math.abs(swing.you), Math.abs(swing.them), 1)

  const verdict = !swing.priced
    ? { text: 'Juke will not call this one', tone: 'text-ink-muted' }
    : Math.abs(swing.you) < 5
      ? { text: 'Close to even', tone: 'text-voidInk-body' }
      : swing.you > 0
        // The swing number a line above is already `gain`/`cost`; this
        // sentence is the same fact in words and was mint/rose, so one
        // trade said one thing in two palettes an inch apart.
        ? { text: 'This favours you', tone: 'text-gain' }
        : { text: 'This favours them', tone: 'text-cost' }

  const builder = (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px_1fr]">
      <Panel
        title="You send"
        action={<span className="font-mono text-[11px] text-ink-muted">{mine.teamName}</span>}
      >
        {myRows.map((row) => (
          <PickRow
            key={row.player.id}
            row={row}
            on={give.indexOf(row.player.id) >= 0}
            onToggle={() => toggle(setGive, give)(row.player.id)}
          />
        ))}
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel title="The swing">
          <div className="py-4 text-center">
            {swing.priced ? (
              <>
                <div
                  className={
                    'font-decision text-[34px] font-extrabold ' +
                    (swing.you > 0 ? 'text-gain' : swing.you < 0 ? 'text-cost' : 'text-ink')
                  }
                >
                  {signed(Math.round(swing.you))}
                </div>
                <div className="font-plex text-label uppercase text-ink-label">
                  for you, over the season
                </div>

                {/* P1 / P3. The two sides of one deal on a zero axis.

                    A single signed number says which way the trade goes and
                    nothing about how far, and "over the season" is a unit a
                    reader has no feel for until something else is drawn in
                    it. Two bars sharing a centre line and a scale say the
                    size and the direction at once, and they say the second
                    thing a trade screen has to: that the swing is
                    zero-sum -- what you gain is exactly what they lose.

                    A zero axis specifically, not two bars from the left. A
                    negative fill growing left-to-right travels THROUGH the
                    centre line on its way out and reads, for a third of a
                    second, as a gain; the Bar primitive's own note records
                    why the origin flips on the negative side. */}
                <div className="mt-4 text-left">
                  <BarRow
                    index={0}
                    label="You"
                    value={swing.you}
                    max={swingMax}
                    zeroAxis
                    sign={swing.you < 0 ? 'cost' : 'gain'}
                    display={signed(Math.round(swing.you))}
                  />
                  <BarRow
                    index={1}
                    label={partner ? partner.teamName : 'Them'}
                    value={swing.them}
                    max={swingMax}
                    zeroAxis
                    sign={swing.them < 0 ? 'cost' : 'gain'}
                    display={signed(Math.round(swing.them))}
                  />
                </div>
              </>
            ) : (
              /* A kicker or a defense is in the deal. Counting him at zero
                 would report a swing confidently wrong in a known
                 direction, so the room says it cannot call it. */
              <div className="font-display text-[22px] font-bold text-ink-muted">—</div>
            )}
            <div className={'mt-2 text-[13px] font-semibold ' + verdict.tone}>{verdict.text}</div>
          </div>
          {!swing.priced ? (
            <p className="border-t border-line-hairline py-3 text-[12px] leading-relaxed text-ink-muted">
              This deal includes a kicker or a defense. Juke does not rank those two, so it will not
              put a number on a trade containing one rather than guess at it.
            </p>
          ) : null}
        </Panel>

        {/* The partner picker sits between the two rosters, which is where
            the eye already is when the right-hand list is wrong. */}
        <Panel title="Trading with">
          <div className="flex flex-wrap gap-1.5 py-3">
            {rivals.map((t) => {
              const on = partner && t.rosterId === partner.rosterId
              return (
                <button
                  key={t.rosterId}
                  type="button"
                  aria-pressed={on}
                  onClick={() => { setPartnerId(t.rosterId); setGet([]) }}
                  className={
                    'rounded-full border px-2.5 py-1 text-[12px] font-semibold ' +
                    (on
                      ? 'border-mint bg-flow-mintDark text-mint'
                      : 'border-line-hairline text-voidInk-body hover:text-white')
                  }
                >
                  {t.teamName}
                </button>
              )
            })}
          </div>
        </Panel>
      </div>

      <Panel
        title="You get"
        action={
          <span className="font-mono text-[11px] text-ink-muted">
            {partner ? partner.teamName : '—'}
          </span>
        }
      >
        {theirRows.length ? (
          theirRows.map((row) => (
            <PickRow
              key={row.player.id}
              row={row}
              on={get.indexOf(row.player.id) >= 0}
              onToggle={() => toggle(setGet, get)(row.player.id)}
            />
          ))
        ) : (
          <div className="py-10 text-center text-[13px] text-ink-muted">
            Pick a manager to trade with.
          </div>
        )}
      </Panel>
    </div>
  )

  if (tab === 'builder') {
    return <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">{builder}</div>
  }

  const mineTotal = rosterTotal(mine, byId, gapOf)

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
      <p className="mb-5 max-w-[68ch] text-[15px] leading-relaxed text-voidInk-body">
        Your roster is worth {Math.round(mineTotal.total)} over replacement across{' '}
        {mineTotal.priced} of {mineTotal.held} players
        {mineTotal.held > mineTotal.priced
          ? ' — the rest are kickers and defenses, which Juke does not rank.'
          : '.'}{' '}
        Build a deal below and both sides are priced before you send it.
      </p>
      {builder}
    </div>
  )
}
