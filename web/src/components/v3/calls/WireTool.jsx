import { useEffect, useMemo, useState } from 'react'
import {
  demandByPosition, dropList, freeAgents, myTeam, rivalNeeds, rosterGaps,
} from '../../rooms/waiverBoard.js'
import { TABS as WAIVER_TABS } from '../../rooms/WaiverRoomLive.jsx'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { useEngine, useJukeTick } from '../../../hooks/useJukeEngine.js'
import { gapUnit, leagueGapOf } from '../../../lib/leagueGap.js'
import { useTierFresh } from '../../v2/stores.js'
import { Fig, GoLink, Icon, Label, PosTag, Seg, Sheet, ValueBar, HIT, cx } from '../ui.jsx'
import {
  CallHead, CouldNotRead, Empty, FactCell, GatedLabel, Loading, NoTeam, Note, PlayerRow, SampleTag,
  Signed, SituationBand, Step, StepBars, Steps, TierGate, playerHref, sampleBandItems, teamHref,
} from './callKit.jsx'

/* The Wire — production's Waiver Room, as the tool Now's waiver call opens.

   Every figure is production's: the wire is waiverBoard.js's freeAgents()
   over JukeEngine.replacementGap() (season points over replacement, K and
   DST refused), the gaps, the drop list and the rival reads are the same
   module's functions, and nothing here re-derives a value.

   ---- What production's six tabs became ----

   Lobby's KPIs are the "Your waivers" block; its Top targets and the
   Targets Board are one list with a Worth claiming / Everyone priced
   switch; Roster Gaps is "Points open by position", always on screen beside
   the list because it is what the call is made from; Drop List, News Wire
   and League Intel (behind the gate production's TABS declare) are the
   other views of the working surface. FAAB Planner and Player Lab stay
   absent for production's reasons: nothing reports what has been SPENT, and
   the player page already is the lab.

   ---- Never a "FAAB left" ----

   ESPN sends a $100 budget whether or not a league bids, so the snapshot's
   `waiver` flag decides which card is drawn, and the pool is called a pool:
   no adapter reports what anybody has spent. */

const BOARD_TARGETS = 40

// "12 over" / "15 below" — a replacement gap said in words, so a negative
// never reads as a hyphenated figure in a sentence.
function signedWord(n) {
  const r = Math.round(n)
  return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : '0'
}
function overText(n) {
  const r = Math.round(n)
  return r >= 0 ? `${r} over` : `${-r} below`
}
const intelGate = (WAIVER_TABS.find((t) => t.key === 'intel') || {}).gate || 'allaccess'

function WireRow({ rank, row, max }) {
  const p = row.player
  return (
    <li className="grid grid-cols-[1.75rem_auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-v3-rule py-2.5 last:border-b-0 sm:grid-cols-[1.75rem_auto_minmax(0,1fr)_7.5rem_4rem]">
      <Fig className="text-[12px] text-v3-ink3">{String(rank).padStart(2, '0')}</Fig>
      <PosTag pos={p.pos} />
      <span className="min-w-0">
        <a href={playerHref(p)} className={cx(HIT, 'block truncate text-[15px] font-semibold text-v3-ink hover:underline')}>{p.name}</a>
        <span className="block truncate font-figure text-[12px] text-v3-ink3">{p.team || 'FA'}{p.bye ? ` · bye ${p.bye}` : ''}</span>
      </span>
      {/* On a phone the bar takes its own full line rather than being
          dropped: the comparison is the point of a ranked list. */}
      <ValueBar value={Math.max(0, row.gap)} max={max} tone="gain" className="order-last col-span-4 sm:order-none sm:col-span-1" />
      <span className="text-right">
        <Signed value={row.gap} tone={Math.round(row.gap) > 0 ? 'gain' : 'quiet'} className="text-[15px]" />
      </span>
    </li>
  )
}

/* Real headlines for the top of the wire, through the same /news route the
   player page uses. Asked by the PROVIDER's id (sourceId), never by a name;
   no id means no news and no fallback. Every item goes through the bridge's
   newsItemView(), which is where the link is checked for http(s). */
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
    <Sheet code="News on the wire" aside="Top of your wire" bodyClass="px-4 pb-4 pt-1 sm:px-5">
      {state === 'loading' ? (
        <div className="py-4" role="status" aria-label="Loading headlines"><div className="h-24 animate-pulse rounded-[4px] bg-v3-well" /></div>
      ) : state === 'none' ? (
        <Empty>Nothing on the wire’s top names right now.</Empty>
      ) : (
        <ul>
          {items.map(({ player, item }, i) => (
            <li key={player.id + ':' + i} className="border-b border-v3-rule last:border-b-0">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
                <PosTag pos={player.pos} />
                <span className="min-w-0">
                  <span className="block truncate font-figure text-[12px] uppercase tracking-[0.08em] text-v3-ink3">{player.name}{item.source ? ` · ${item.source}` : ''}</span>
                  <span className="mt-0.5 block text-[15px] font-semibold leading-snug text-v3-ink group-hover:underline">{item.title}</span>
                </span>
                <Icon name="arrow" className="mt-1 h-4 w-4 text-v3-ink3" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <Note>Headlines link to their source. Juke links and never republishes.</Note>
    </Sheet>
  )
}

export default function WireTool({ league, snapshot, status, reason, onRetry, sample = false, sampleInfo = null, action = null }) {
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

  // board.length, never board: mutated in place, only its length moves when
  // players.js lands — CLAUDE.md's memo-key rule.
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

  const targets = available.filter((row) => row.gap > 0)
  const [view, setView] = useState('wire')
  const [scope, setScope] = useState(null)

  const platformName = sample ? 'Your platform' : platformFor(league && league.provider).name
  const label = sample ? 'Sample call · the wire' : `Now · the waiver call${league && league.name ? ` · ${league.name}` : ''}`
  const band = sample
    ? <SituationBand sample items={sampleBandItems(sampleInfo, 'everyone past the last pick is on the wire')} />
    : (
      <SituationBand
        lead="The wire"
        items={[
          league && league.name,
          platformName,
          snapshot && snapshot.week ? `week ${snapshot.week}` : 'preseason',
          unit.long,
        ]}
      />
    )
  const shell = (title, lede, body) => (
    <div className="grid gap-8">
      <CallHead label={label} title={title} lede={lede} action={action} band={band} />
      {body}
    </div>
  )

  if (status === 'loading' || (status === 'ready' && !board.length)) return shell('The waiver call.', 'Reading your league…', <Loading />)
  if (status !== 'ready' || !snapshot) return shell('The waiver call.', null, <CouldNotRead reason={reason} onRetry={onRetry} />)

  const wireMax = available.length ? Math.max(1, ...available.map((r) => Math.max(0, r.gap))) : 1
  const dropMax = drops.length ? Math.max(1, ...drops.map((r) => Math.max(0, r.gap))) : 1
  const gapMax = allGaps.length ? Math.max(...allGaps.map((g) => g.improvement)) : 1
  const posNames = (engine && engine.posNames && engine.posNames()) || {}
  const ptsOpen = allGaps.reduce((sum, g) => sum + g.improvement, 0)
  const best = allGaps[0] || null
  const drop = drops[0] || null
  const waiver = snapshot.waiver || null
  const isFaab = waiver ? waiver.type === 'faab' : !!snapshot.waiverBudget
  const posWord = (pos) => (posNames[pos] || pos).toLowerCase()

  // The title is the call. Three honest answers: a claim that closes a gap,
  // a wire with value on it that beats nothing you hold, or an empty wire.
  const title = !mine
    ? 'The waiver call.'
    : best
      ? `Claim ${best.best.player.name}.`
      : targets.length
        ? 'Nobody on the wire beats what you hold.'
        : 'Nobody on your wire is worth a starting slot.'
  const lede = !mine
    ? null
    : best
      ? `+${Math.round(best.improvement)} ${unit.word} points over your best ${best.pos}: he is ${overText(best.best.gap)} a replaceable ${posWord(best.pos)}, ${best.held === null ? `and you hold nobody rankable at ${best.pos}` : `and your best is ${overText(best.held)}`}.${ptsOpen > best.improvement ? ` ${Math.round(ptsOpen)} points are open across every position a claim would improve.` : ''}`
      : targets.length
        ? `${targets.length} players on the wire are above replacement, and none is worth more than the player you already start at his position.`
        : `Nobody unowned is worth more than a replacement-level starter. In a ${snapshot.totalTeams}-team league that is the normal state, not an error.`

  const scopeNow = scope || (targets.length ? 'targets' : 'all')
  const wireRows = scopeNow === 'targets' ? targets : available

  const tabs = [
    { value: 'wire', label: 'The wire' },
    { value: 'drops', label: 'Drop list' },
    { value: 'news', label: 'News' },
    { value: 'intel', label: <GatedLabel text="League intel" gate={intelGate} tier={tier} /> },
  ]

  return shell(title, lede, (
    <div className="grid gap-6">
      {!mine ? <NoTeam teams={snapshot.totalTeams} what="price a claim against your roster" /> : null}

      {/* ---- The call ---- */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {mine ? (
          <Sheet code="The call · Waiver claim" aside={sample ? <SampleTag /> : unit.short}>
            {best ? (
              <div className="grid gap-5">
                <p className="text-[18px] leading-[1.45] text-v3-ink">
                  Claim <a href={playerHref(best.best.player)} className="font-bold underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink">{best.best.player.name}</a>{' '}
                  — <Signed value={best.improvement} tone="gain" className="text-[18px]" /> over the best {best.pos} you hold.
                </p>
                <Steps>
                  <Step n={1} what={`Price the wire’s best ${posWord(best.pos)}`} sub={sample ? `${unit.word} points over a replaceable starter` : `${unit.word} points over a replaceable starter, under your league’s scoring`}>
                    <StepBars
                      digits={0}
                      max={Math.max(best.best.gap, best.held || 0, 1)}
                      rows={[
                        { label: `${best.best.player.name} (wire)`, value: best.best.gap, tone: 'gain', signed: true },
                        { label: best.held === null ? `Your best ${best.pos}: nobody rankable` : `Your best ${best.pos}`, value: best.held, tone: 'neutral', signed: true },
                      ]}
                    />
                  </Step>
                  <Step n={2} what={`The claim closes ${Math.round(best.improvement)} points`} sub={best.held === null ? 'you hold nobody rankable there, so all of it' : `${signedWord(best.best.gap)} − (${signedWord(best.held)})`} />
                  <Step
                    n={3}
                    what={drop ? `If you need the spot: ${drop.player.name}` : 'The roster spot'}
                    sub={drop ? `your least valuable bench player, ${overText(drop.gap)} replacement` : 'nobody on your bench is rankable, so the cut is yours to make'}
                  />
                </Steps>
              </div>
            ) : (
              <div className="grid gap-4">
                <p className="text-[18px] leading-[1.45] text-v3-ink">
                  {targets.length
                    ? <>Nothing on the wire beats what you already start. The best available is <a href={playerHref(targets[0].player)} className="font-bold underline decoration-v3-rule decoration-2 underline-offset-4">{targets[0].player.name}</a>, <Signed value={targets[0].gap} tone="gain" /> over replacement.</>
                    : <>Nobody on the wire is worth a starting slot this week.</>}
                </p>
                {!targets.length && (
                  <div className="rounded-[6px] bg-v3-paper p-4">
                    <Label>Run next</Label>
                    <p className="mt-1.5 text-[15px] leading-[1.55] text-v3-ink2">Next year’s class is where the next real add comes from. Every first-year player on the board, ranked.</p>
                    <div className="mt-3"><GoLink href="#/players/rookies">Open the rookies</GoLink></div>
                  </div>
                )}
              </div>
            )}
          </Sheet>
        ) : null}

        <div className="grid gap-6">
          <Sheet code="Your waivers" aside={sample ? <SampleTag /> : platformName}>
            <dl className="grid grid-cols-2 gap-2">
              {sample ? (
                <FactCell label="Budget or order" value="—" note="Read from your league once it is connected. Never invented." />
              ) : isFaab ? (
                <FactCell label="FAAB pool" value={snapshot.waiverBudget ? `$${snapshot.waiverBudget}` : '—'} note={`The season’s budget. ${platformName} does not report what you have spent.`} />
              ) : (
                <FactCell label="Waivers" value="Order" note={waiver && waiver.resetsOrder === false ? 'A claim moves you to the back, and the order never resets.' : 'Claims run on waiver order, not on a budget.'} />
              )}
              <FactCell label="Worth claiming" value={String(targets.length)} note={`Of ${available.length} rankable on the wire.`} />
              <FactCell label="Best claim" value={best ? `+${Math.round(best.improvement)}` : '—'} tone={best ? 'gain' : null} note={best ? `${best.best.player.name} over your best ${best.pos}.` : 'Nothing beats what you hold.'} />
              <FactCell label="Points open" value={ptsOpen > 0 ? String(Math.round(ptsOpen)) : '0'} tone={ptsOpen > 0 ? 'cost' : null} note="Across every position a claim would improve." />
            </dl>
          </Sheet>

          {mine ? (
            <Sheet code="Points open by position" aside={unit.short} bodyClass="px-4 pb-4 pt-1 sm:px-5">
              {allGaps.length ? (
                <ul>
                  {allGaps.map((g) => (
                    <li key={g.pos} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-v3-rule py-2.5 last:border-b-0">
                      <PosTag pos={g.pos} />
                      <span className="min-w-0">
                        <a href={playerHref(g.best.player)} className={cx(HIT, 'block truncate text-[15px] font-semibold text-v3-ink hover:underline')}>{g.best.player.name}</a>
                        <span className="block truncate font-figure text-[12px] text-v3-ink3">{g.held === null ? `you hold nobody rankable at ${g.pos}` : `your best ${g.pos} is ${overText(g.held)} repl.`}</span>
                      </span>
                      <Signed value={g.improvement} tone="gain" className="text-[15px]" />
                      <ValueBar value={g.improvement} max={gapMax} tone="gain" className="col-span-3" />
                    </li>
                  ))}
                </ul>
              ) : <Empty>Nothing on the wire beats what you already hold, at any position.</Empty>}
            </Sheet>
          ) : null}
        </div>
      </div>

      {/* ---- The working ---- */}
      <section aria-label="The working" className="grid gap-4">
        <div className="overflow-x-auto">
          <Seg label="Wire views" value={view} onChange={setView} options={tabs} className="min-w-max" />
        </div>

        {view === 'wire' && (
          <Sheet
            code={scopeNow === 'targets' ? 'Worth claiming, best first' : 'The wire, best first'}
            aside={`${wireRows.length} of ${available.length} priced`}
            bodyClass="px-4 pb-4 pt-3 sm:px-5"
          >
            <Seg
              label="Which players"
              value={scopeNow}
              onChange={setScope}
              options={[{ value: 'targets', label: `Worth claiming · ${targets.length}` }, { value: 'all', label: `Everyone priced · ${available.length}` }]}
            />
            {wireRows.length ? (
              <ul className="mt-2">
                {wireRows.map((row, i) => <WireRow key={row.player.id} rank={i + 1} row={row} max={wireMax} />)}
              </ul>
            ) : (
              <Empty>
                {scopeNow === 'targets'
                  ? 'Nobody on the wire is projected above replacement. The whole priced wire is one press away for a bye-week fill.'
                  : 'Nobody unowned is rankable on tonight’s board.'}
              </Empty>
            )}
            <Note>A kicker or a defense is never on this list: Juke declines to rank those two anywhere, so it will not recommend claiming one.</Note>
          </Sheet>
        )}

        {view === 'drops' && (
          mine ? (
            <Sheet code="Your bench, worst first" aside={unit.gap} bodyClass="px-4 pb-4 pt-1 sm:px-5">
              {drops.length ? (
                <ul>{drops.map((row, i) => <WireRow key={row.player.id} rank={i + 1} row={row} max={dropMax} />)}</ul>
              ) : <Empty>Nobody on your bench is rankable — in most leagues that means kickers, defenses and players with no projection, and those are not cut decisions Juke will make for you.</Empty>}
              <Note>Starters are not listed, whatever the projection says: benching one is a start/sit question. Kickers and defenses are not either — Juke declines to rank those two, so it will not rank them to cut them.</Note>
            </Sheet>
          ) : <NoTeam teams={snapshot.totalTeams} what="see your drop list" />
        )}

        {view === 'news' && <NewsWire rows={newsRows} engine={engine} />}

        {view === 'intel' && (
          <TierGate need={intelGate} title="See what every rival needs">
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <Sheet code="What your rivals are thin at" aside={unit.short} bodyClass="px-4 pb-4 pt-1 sm:px-5">
                {rivals.length ? (
                  <ul>
                    {rivals.map((row) => (
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
                ) : <Empty>No rival has a hole the wire can fill this week.</Empty>}
              </Sheet>
              <Sheet code="Who you bid against" aside="rivals per position" bodyClass="px-4 pb-4 pt-1 sm:px-5">
                {demand.length ? (
                  <ul>
                    {demand.map((d) => (
                      <li key={d.pos} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-v3-rule py-2.5 last:border-b-0">
                        <PosTag pos={d.pos} />
                        <span className="text-[15px] text-v3-ink2">{d.count === 1 ? '1 rival needs' : `${d.count} rivals need`} a {d.pos}</span>
                        <Fig className="text-[15px] font-bold text-v3-ink">{d.count}</Fig>
                      </li>
                    ))}
                  </ul>
                ) : <Empty>Nobody is bidding.</Empty>}
              </Sheet>
            </div>
          </TierGate>
        )}
      </section>
    </div>
  ))
}

