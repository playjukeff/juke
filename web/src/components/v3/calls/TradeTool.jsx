import { useEffect, useMemo, useRef, useState } from 'react'
import { freeAgents, myTeam, rivalNeeds } from '../../rooms/waiverBoard.js'
import { rosterTotal, rosterValues, tradeSwing, valueBoard } from '../../rooms/tradeBoard.js'
import { TABS as TRADE_TABS } from '../../rooms/TradeRoomLive.jsx'
import { tradeWindow, msUntilDeadline } from '../../../lib/tradeDeadline.js'
import { countdownParts } from '../../../lib/countdown.js'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { useEngine, useJukeTick } from '../../../hooks/useJukeEngine.js'
import { gapUnit, leagueGapOf } from '../../../lib/leagueGap.js'
import { useTierFresh } from '../../v2/stores.js'
import { CallButton, Fig, Icon, Label, PosTag, QuietButton, Seg, Sheet, ValueBar, cx , HIT , TOUCH } from '../ui.jsx'
import {
  CallHead, CouldNotRead, Empty, FactCell, GatedLabel, Loading, NoTeam, Note, SampleTag, Signed,
  SituationBand, Step, StepBars, Steps, TierGate, playerHref, sampleBandItems, teamHref,
} from './callKit.jsx'
import { dealFromHash, marketEvenDeal } from './callData.js'

/* The Trade tool — production's Trade Room, as the tool a trade question on
   Now opens.

   Priced in SEASON points over replacement — tradeBoard.js's valueOf() over
   JukeEngine.replacementGap() — because a trade changes a roster for the rest
   of the season; the Lineup tool is the weekly one. tradeSwing() refuses a
   deal holding a kicker or a defense rather than counting him at zero, and
   this page says so. Rosters are in the league's own order (rosterValues()
   sorts nothing), and the Value Board is best first (valueBoard()).

   ---- It opens with a call even before a deal exists ----

   A trade question from Now arrives as ?with=&give=&get= and is loaded
   straight into the builder. With no question, the call is the one 1-for-1
   deal the market calls even and the points do not (callData.js's
   marketEvenDeal(), over the same replacementGap) — offered, not loaded:
   pressing the page's one cobalt button puts it in the builder.

   ---- What production's four tabs became ----

   Lobby's roster value is the facts strip; the builder is the working
   surface's first view with the call above it; Value Board and Rival Needs
   (behind the gate production's TABS declare) are the other two. Offers
   stays absent for production's reason: no feed carries a pending trade. */

const BOARD_ROWS = 40
const rivalsGate = (TRADE_TABS.find((t) => t.key === 'rivals') || {}).gate || 'allaccess'

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

/* Whether this league is still trading — production's four states off
   lib/tradeDeadline.js. `unknown` draws nothing: a room that cannot find
   out must say neither open nor shut. */
function TradeWindowStrip({ snapshot }) {
  const deadline = (snapshot && snapshot.tradeDeadline) || null
  const w = tradeWindow(deadline, { week: snapshot && snapshot.week })
  useMinuteTick(w.state === 'open' && w.at !== null)
  if (w.state === 'unknown') return null
  const shut = w.state === 'passed' || w.state === 'disabled'
  let head = 'Trading is open'
  let body = null
  if (w.state === 'disabled') {
    head = 'This league does not trade'
    body = 'Its settings have trading switched off, so nothing built here can be sent.'
  } else if (w.state === 'passed') {
    head = 'The trade deadline has passed'
    body = `${w.at !== null ? `It closed ${whenText(w.at) || 'earlier this season'}.` : `It closed after week ${w.week}.`} Your roster is still priced below, and nothing here can be sent.`
  } else {
    const left = w.at !== null ? countdownParts(msUntilDeadline(deadline)) : null
    body = left
      ? <>Closes in <Fig className="font-bold text-v3-ink">{left.compact}</Fig>{whenText(w.at) ? ` — ${whenText(w.at)}` : ''}.</>
      : w.week !== null ? `It closes after week ${w.week}.` : 'The deadline has not passed.'
  }
  return (
    <div
      data-trade-window={shut ? 'shut' : 'open'}
      className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[6px] border border-v3-rule bg-v3-sheet px-4 py-3', shut && 'border-l-[4px] border-l-v3-cost')}
    >
      <Label className={shut ? 'text-v3-cost' : 'text-v3-ink'}>{head}</Label>
      <span className="text-[14px] leading-[1.5] text-v3-ink2">{body}</span>
    </div>
  )
}

/* One player you can put in the deal: a real toggle (aria-pressed) and,
   beside it, the way to his page — a link may not sit inside a button. */
function PickRow({ row, on, onToggle }) {
  return (
    <li className="flex items-stretch border-b border-v3-rule last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className={cx('flex min-h-[48px] min-w-0 flex-1 items-center gap-3 px-1 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call', on ? 'bg-v3-paper' : 'hover:bg-v3-paper')}
      >
        <span aria-hidden="true" className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border', on ? 'border-v3-band bg-v3-band text-white' : 'border-v3-ink3 bg-v3-sheet')}>
          {on && <Icon name="check" className="h-3.5 w-3.5" />}
        </span>
        <PosTag pos={row.player.pos} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-v3-ink">{row.player.name}</span>
        <Signed value={row.value} tone={row.value === null ? null : Math.round(row.value) >= 0 ? null : 'quiet'} className="text-[15px]" />
      </button>
      <a href={playerHref(row.player)} aria-label={`Open ${row.player.name}`} className={cx(TOUCH, 'grid w-10 shrink-0 place-items-center text-v3-ink3 hover:text-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call')}>
        <Icon name="arrow" className="h-4 w-4" />
      </a>
    </li>
  )
}

export default function TradeTool({ league, snapshot, status, reason, onRetry, sample = false, sampleInfo = null, action = null }) {
  const engine = useEngine()
  useJukeTick(engine)
  const { tier } = useTierFresh()
  const board = engine && engine.dataReady && engine.dataReady() ? engine.board() : []
  // Priced under THIS league's scoring and shape, not the Draft Room's.
  const gapOf = useMemo(() => leagueGapOf(engine, snapshot), [engine, snapshot])
  /* And the words beside every one of those figures. NOT memoised: what
     the number is changes the day the season starts, and a caption frozen
     on the render before that would name the wrong horizon for as long as
     the tab stayed open. */
  const unit = gapUnit(engine)
  const byId = useMemo(
    () => new Map(board.map((p) => [String(p.id), p])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length]
  )
  const mine = myTeam(snapshot, league)
  const rivals = useMemo(() => ((snapshot && snapshot.teams) || []).filter((t) => !mine || t.rosterId !== mine.rosterId), [snapshot, mine])

  const [partnerId, setPartnerId] = useState(null)
  const [give, setGive] = useState([])
  const [get, setGet] = useState([])
  const [view, setView] = useState('build')

  const partner = useMemo(() => rivals.find((t) => String(t.rosterId) === String(partnerId)) || rivals[0] || null, [rivals, partnerId])
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
  const suggestion = useMemo(() => marketEvenDeal(mine, rivals, byId, gapOf), [mine, rivals, byId, gapOf])

  // A question handed in by address is loaded once, and only ids that are
  // really on the right roster are kept.
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current || sample || !mine || !rivals.length || !byId.size) return
    const q = dealFromHash(typeof window !== 'undefined' ? window.location.hash : '')
    loaded.current = true
    if (!q) return
    const team = rivals.find((t) => String(t.rosterId) === String(q.with)) || null
    const onMine = new Set((mine.players || []).map(String))
    if (team) setPartnerId(team.rosterId)
    const onTheirs = new Set(((team || rivals[0]).players || []).map(String))
    setGive(q.give.filter((id) => onMine.has(String(id))))
    setGet(q.get.filter((id) => onTheirs.has(String(id))))
  }, [sample, mine, rivals, byId])

  const platformName = sample ? 'Your platform' : platformFor(league && league.provider).name
  const label = sample ? 'Sample call · the trade' : `Now · the trade question${league && league.name ? ` · ${league.name}` : ''}`
  const band = sample
    ? <SituationBand sample items={sampleBandItems(sampleInfo, 'rosters drafted by ADP')} />
    : (
      <SituationBand
        lead="The trade"
        items={[league && league.name, platformName, snapshot && snapshot.week ? `week ${snapshot.week}` : 'preseason', unit.long]}
      />
    )
  const shell = (title, lede, body, act = action) => (
    <div className="grid gap-8">
      <CallHead label={label} title={title} lede={lede} action={act} band={band} />
      {body}
    </div>
  )

  if (status === 'loading' || (status === 'ready' && !board.length)) return shell('The trade question.', 'Reading your league…', <Loading />)
  if (status !== 'ready' || !snapshot) return shell('The trade question.', null, <CouldNotRead reason={reason} onRetry={onRetry} />)
  if (!mine) return shell('The trade question.', null, <NoTeam teams={snapshot.totalTeams} what="build a trade" />)

  const toggle = (list, setter) => (id) => setter(list.indexOf(id) >= 0 ? list.filter((x) => x !== id) : list.concat(id))
  const empty = !give.length && !get.length
  const swingMax = Math.max(Math.abs(swing.you), Math.abs(swing.them), 1)
  const verdict = !swing.priced
    ? 'Juke will not call this one'
    : empty
      ? 'Pick players on both sides'
      : Math.abs(swing.you) < 5
        ? 'Close to even'
        : swing.you > 0 ? 'This favours you' : 'This favours them'
  const mineTotal = rosterTotal(mine, byId, gapOf)
  const win = tradeWindow(snapshot.tradeDeadline, { week: snapshot.week }).state
  const top = myRows.filter((r) => r.value !== null).slice().sort((a, b) => b.value - a.value)[0] || null
  const giving = give.map((id) => byId.get(String(id))).filter(Boolean)
  const getting = get.map((id) => byId.get(String(id))).filter(Boolean)
  const clear = () => { setGive([]); setGet([]) }
  const loadSuggestion = () => {
    if (!suggestion) return
    setPartnerId(suggestion.team.rosterId)
    setGive([suggestion.give.player.id])
    setGet([suggestion.get.player.id])
    setView('build')
  }

  const title = !empty && swing.priced
    ? Math.abs(swing.you) < 5
      ? 'This deal is close to even.'
      : swing.you > 0 ? `This deal favours you by ${Math.round(swing.you)}.` : `This deal favours them by ${Math.round(-swing.you)}.`
    : !empty ? 'Juke will not call this one.'
      : suggestion ? `Ask for ${suggestion.get.player.name}.` : 'Price a trade before you send it.'
  const lede = !empty
    ? swing.priced
      ? `${unit.long[0].toUpperCase()}${unit.long.slice(1)}: you get ${signedWhole(swing.get)} and send ${signedWhole(swing.give)}, so the swing is ${signedWhole(swing.you)} for you and ${signedWhole(swing.them)} for ${partner ? partner.teamName : 'them'}.`
      : 'This deal includes a kicker or a defense. Juke does not rank those two, so it will not put a number on a trade containing one rather than guess at it.'
    : suggestion
      ? `Your ${suggestion.give.player.name} for ${suggestion.team.teamName}’s ${suggestion.get.player.name}: the market prices them ${suggestion.apart.toFixed(1)} picks apart, the points ${Math.round(suggestion.gain)} ${unit.word} points apart — for you.`
      : 'Pick a manager and players on both sides; both are priced against replacement before you send anything.'
  // The page's one cobalt action: load the market-even deal. Only while the
  // builder is empty, and never on the sample page, whose action is the way in.
  const pageAction = sample ? action : empty && suggestion ? <CallButton onClick={loadSuggestion}>Price this deal <Icon name="arrow" className="h-4 w-4" /></CallButton> : null

  const callSheet = (
    <Sheet code="The call · Trade" aside={sample ? <SampleTag /> : unit.short} aria-live="polite">
      {!empty ? (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Label>Swing for you, over the season</Label>
              <p className="mt-1 text-[16px] font-semibold text-v3-ink">{verdict}</p>
            </div>
            {swing.priced
              ? <Signed value={swing.you} tone={Math.round(swing.you) > 0 ? 'gain' : Math.round(swing.you) < 0 ? 'cost' : null} className="text-[56px] font-extrabold leading-none" />
              : <span className="font-figure text-[56px] font-extrabold leading-none text-v3-ink3">—</span>}
          </div>
          {swing.priced ? (
            <Steps>
              <Step n={1} what="Price both sides" sub={`${unit.word} points over a replaceable starter, summed`}>
                <StepBars
                  digits={0}
                  max={Math.max(Math.abs(swing.give), Math.abs(swing.get), 1)}
                  rows={[
                    { label: `You send${giving.length ? ': ' + giving.map((p) => p.name).join(', ') : ' nobody'}`, value: swing.give, tone: 'neutral', signed: true },
                    { label: `You get${getting.length ? ': ' + getting.map((p) => p.name).join(', ') : ' nobody'}`, value: swing.get, tone: 'neutral', signed: true },
                  ]}
                />
              </Step>
              <Step n={2} what="The swing is the difference, and it is zero-sum" sub="what you gain is exactly what they lose">
                <div className="grid gap-2">
                  {[{ who: 'You', v: swing.you }, { who: partner ? partner.teamName : 'Them', v: swing.them }].map((s) => (
                    <div key={s.who} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,10rem)_1fr_4rem]">
                      <span className="truncate text-[13px] text-v3-ink2">{s.who}</span>
                      <ValueBar value={s.v} max={swingMax} zero tone={Math.round(s.v) > 0 ? 'gain' : Math.round(s.v) < 0 ? 'cost' : 'neutral'} className="order-3 col-span-2 sm:order-none sm:col-span-1" />
                      <Signed value={s.v} tone={Math.round(s.v) > 0 ? 'gain' : Math.round(s.v) < 0 ? 'cost' : null} className="text-right text-[14px]" />
                    </div>
                  ))}
                </div>
              </Step>
            </Steps>
          ) : (
            <Note>This deal includes a kicker or a defense. Juke does not rank those two, so it will not put a number on a trade containing one rather than guess at it.</Note>
          )}
          <div className="flex flex-wrap gap-2">
            <QuietButton onClick={clear}>Clear the deal</QuietButton>
            {win === 'passed' || win === 'disabled' ? <span className="self-center text-[13px] text-v3-ink2">Priced, but this league is not trading.</span> : null}
          </div>
        </div>
      ) : suggestion ? (
        <div className="grid gap-5">
          <p className="text-[18px] leading-[1.45] text-v3-ink">
            A deal the market calls even: your <a href={playerHref(suggestion.give.player)} className={cx(HIT, 'font-bold underline decoration-v3-rule decoration-2 underline-offset-4')}>{suggestion.give.player.name}</a> for{' '}
            <a href={playerHref(suggestion.get.player)} className={cx(HIT, 'font-bold underline decoration-v3-rule decoration-2 underline-offset-4')}>{suggestion.get.player.name}</a>.
          </p>
          <Steps>
            <Step n={1} what="The market prices them the same" sub={`ADP ${suggestion.give.player.adp.toFixed(1)} against ${suggestion.get.player.adp.toFixed(1)}, ${suggestion.apart.toFixed(1)} picks apart`} />
            <Step n={2} what="The points do not" sub={`${unit.word} points over a replaceable starter`}>
              <StepBars
                digits={0}
                max={Math.max(Math.abs(suggestion.give.value), Math.abs(suggestion.get.value), 1)}
                rows={[
                  { label: `${suggestion.give.player.name} (yours)`, value: suggestion.give.value, tone: 'neutral', signed: true },
                  { label: `${suggestion.get.player.name} (${suggestion.team.teamName})`, value: suggestion.get.value, tone: 'neutral', signed: true },
                ]}
              />
            </Step>
            <Step n={3} what={`The swing is ${signedWhole(suggestion.gain)} for you`} sub="load it into the builder to change either side" />
          </Steps>
          {sample ? <div><QuietButton onClick={loadSuggestion}>Load this deal <Icon name="arrow" className="h-4 w-4" /></QuietButton></div> : null}
        </div>
      ) : (
        <Empty>Nobody on your roster and a rival’s is priced within six picks of each other and apart on the points. Pick a manager and build a deal below.</Empty>
      )}
    </Sheet>
  )

  const builder = (
    <div className="grid gap-4">
      {!empty && (
        // Rides under the header while you pick, so the swing is never off
        // screen — the same number as the call above, never a second sum.
        <div className="sticky top-[68px] z-20 flex min-h-[48px] items-center justify-between gap-3 rounded-[6px] bg-v3-band px-4 py-2 text-white" aria-hidden="true">
          <span className="font-figure text-[12px] font-bold uppercase tracking-[0.12em] text-v3-bandInk">Swing for you</span>
          <span className="font-figure text-[22px] font-extrabold tabular-nums">{swing.priced ? signedWhole(swing.you) : '—'}</span>
          <span className="hidden text-[13px] font-semibold text-white sm:inline">{verdict}</span>
        </div>
      )}
      <Sheet code="Trading with" aside={partner ? `${partner.teamName}` : '—'}>
        <div role="group" aria-label="Trade partner" className="flex flex-wrap gap-1.5">
          {rivals.map((t) => {
            const on = !!partner && t.rosterId === partner.rosterId
            return (
              <button
                key={t.rosterId}
                type="button"
                aria-pressed={on}
                onClick={() => { setPartnerId(t.rosterId); setGet([]) }}
                className={cx('min-h-[44px] max-w-full truncate rounded-[6px] border px-3 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call', on ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet text-v3-ink2 hover:border-v3-ink3 hover:text-v3-ink')}
              >
                {t.teamName}
              </button>
            )
          })}
        </div>
      </Sheet>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <Sheet code="You send" aside={mine.teamName} bodyClass="px-3 pb-2 pt-1 sm:px-4">
          <ul>
            {myRows.map((row) => (
              <PickRow key={row.player.id} row={row} on={give.indexOf(row.player.id) >= 0} onToggle={() => toggle(give, setGive)(row.player.id)} />
            ))}
          </ul>
        </Sheet>
        <Sheet code="You get" aside={partner ? partner.teamName : '—'} bodyClass="px-3 pb-2 pt-1 sm:px-4">
          {theirRows.length ? (
            <ul>
              {theirRows.map((row) => (
                <PickRow key={row.player.id} row={row} on={get.indexOf(row.player.id) >= 0} onToggle={() => toggle(get, setGet)(row.player.id)} />
              ))}
            </ul>
          ) : <Empty>Pick a manager to trade with.</Empty>}
          {partner && teamHref(partner) && !sample ? (
            <div className="border-t border-v3-rule px-1 py-3">
              <a href={teamHref(partner)} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink">
                {partner.teamName}’s team page <Icon name="arrow" className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : null}
        </Sheet>
      </div>
      <p className="text-[13px] leading-[1.55] text-v3-ink2">
        A dash is a kicker or a defense — Juke does not rank those two, so a deal holding one is not called. Rosters are in {sample ? 'the league’s' : platformName + '’s'} own order: starters as the league fields them, then the bench.
      </p>
    </div>
  )

  const valueMax = values.length ? Math.max(1, ...values.map((r) => Math.max(0, r.value))) : 1

  return shell(title, lede, (
    <div className="grid gap-6">
      <TradeWindowStrip snapshot={snapshot} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {callSheet}
        <Sheet code="Your roster" aside={sample ? <SampleTag /> : mine.teamName}>
          <dl className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <FactCell label="Worth, over repl." value={signedWhole(mineTotal.total)} note={`Across ${mineTotal.priced} of ${mineTotal.held} players${mineTotal.held > mineTotal.priced ? ' — the rest are kickers and defenses, which Juke does not rank' : ''}.`} />
            <FactCell label="Most tradeable" value={top ? signedWhole(top.value) : '—'} note={top ? top.player.name : 'Nobody on your roster is priced.'} />
            <FactCell label="Managers" value={String(rivals.length)} note={win === 'passed' || win === 'disabled' ? 'Every deal is still priced, and none can be sent.' : 'Build a deal and both sides are priced before you send it.'} />
            <FactCell label="In the deal" value={`${give.length} for ${get.length}`} note={empty ? 'Nothing picked yet.' : verdict + '.'} />
          </dl>
        </Sheet>
      </div>

      <section aria-label="The working" className="grid gap-4">
        <div className="overflow-x-auto">
          <Seg
            label="Trade views"
            value={view}
            onChange={setView}
            className="min-w-max"
            options={[
              { value: 'build', label: 'Build a deal' },
              { value: 'values', label: 'Value board' },
              { value: 'rivals', label: <GatedLabel text="Rival needs" gate={rivalsGate} tier={tier} /> },
            ]}
          />
        </div>

        {view === 'build' && builder}

        {view === 'values' && (
          <Sheet code="Every rostered player, by value" aside={unit.gap} bodyClass="px-4 pb-4 pt-1 sm:px-5">
            <ul>
              {values.map((row, i) => (
                <li key={row.player.id} className="grid grid-cols-[1.75rem_auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-v3-rule py-2.5 last:border-b-0 sm:grid-cols-[1.75rem_auto_minmax(0,1fr)_7.5rem_4rem]">
                  <Fig className="text-[12px] text-v3-ink3">{String(i + 1).padStart(2, '0')}</Fig>
                  <PosTag pos={row.player.pos} />
                  <span className="min-w-0">
                    <a href={playerHref(row.player)} className={cx(HIT, 'block truncate text-[15px] font-semibold text-v3-ink hover:underline')}>{row.player.name}</a>
                    {teamHref(row.team) && !sample ? (
                      <a href={teamHref(row.team)} className="block truncate font-figure text-[12px] text-v3-ink3 hover:text-v3-ink hover:underline">{row.team.teamName}{row.team.rosterId === mine.rosterId ? ' · yours' : ''}</a>
                    ) : <span className="block truncate font-figure text-[12px] text-v3-ink3">{row.team.teamName}{row.team.rosterId === mine.rosterId ? ' · yours' : ''}</span>}
                  </span>
                  <ValueBar value={Math.max(0, row.value)} max={valueMax} tone="neutral" className="order-last col-span-4 sm:order-none sm:col-span-1" />
                  <span className="text-right"><Signed value={row.value} className="text-[15px]" /></span>
                </li>
              ))}
            </ul>
            <Note>Kickers and defenses are not here. Juke declines to rank those two anywhere — three seasons of backtesting found their projected order no better than chance — so it will not price them in a trade either.</Note>
          </Sheet>
        )}

        {view === 'rivals' && (
          <TierGate need={rivalsGate} title="Know what every rival is short of">
            <Sheet code="What each rival needs" aside={`${unit.short} the wire would add`} bodyClass="px-4 pb-4 pt-1 sm:px-5">
              {needs.length ? (
                <ul>
                  {needs.map((row) => (
                    <li key={row.team.rosterId} className="border-b border-v3-rule py-3 last:border-b-0">
                      {teamHref(row.team) && !sample ? (
                        <a href={teamHref(row.team)} className="text-[15px] font-semibold text-v3-ink hover:underline">{row.team.teamName}</a>
                      ) : <span className="text-[15px] font-semibold text-v3-ink">{row.team.teamName}</span>}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {row.gaps.map((g) => (
                          <span key={g.pos} className="inline-flex items-center gap-1.5 rounded-[4px] bg-v3-paper px-1.5 py-1">
                            <PosTag pos={g.pos} className="h-[20px] min-w-[30px]" />
                            <Signed value={g.improvement} tone="gain" className="text-[13px]" />
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <Empty>No rival has a hole worth trading into.</Empty>}
            </Sheet>
          </TierGate>
        )}
      </section>
    </div>
  ), pageAction)
}

function signedWhole(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const r = Math.round(n)
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : '0'
}
