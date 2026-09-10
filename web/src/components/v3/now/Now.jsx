import { useEffect, useMemo, useState } from 'react'
import { useLeagueFresh } from '../../v2/stores.js'
import { readLocker, readLeagueShape } from '../../v2/v2data.js'
import { FORMATS, LEAD, readCall, readSituation } from '../data.js'
import {
  CallButton, Delta, Fig, GoLink, Headline, Icon, Label, PosTag, QuietButton, Seg, Sheet, Skeleton,
  ValueBar, cx, ordinal, useEngineData,
} from '../ui.jsx'
import NowConnected from './NowConnected.jsx'

/* Now — the first of v3's five places.

   Connected, it is the week's call sheet (NowConnected). Signed out or with
   no league, it is this: what a priced call looks like, on tonight's board,
   and the three things a visitor can do about it. The page leads with a call
   rather than a pitch because the call IS the pitch — "the market takes him,
   the points take him, here is by how much" is the whole product in one
   block, and it is live. */

export default function Now() {
  const { status } = useLeagueFresh()
  if (status === 'connected') return <NowConnected />
  return <NowGuest />
}

const FORMAT_LABEL = { standard: 'Std', half: 'Half', ppr: 'Full' }

function SituationBand({ s }) {
  if (!s) return <div className="h-[44px] animate-pulse rounded-[6px] bg-v3-well" aria-hidden="true" />
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-[6px] bg-v3-band px-4 py-2.5 font-figure text-[13px] text-v3-bandInk">
      <span className="font-bold uppercase tracking-[0.14em] text-white">Tonight&apos;s board</span>
      <span><Fig className="font-bold text-white">{s.players}</Fig> players priced</span>
      {s.refreshed && <span>refreshed {s.refreshed}</span>}
      {s.scoring && <span>your mock is set to <span className="text-white">{s.scoring}</span></span>}
    </div>
  )
}

/* One side of the call: who, what the market and the points say about him. */
function Side({ tag, p, winner, verdictLabel }) {
  return (
    <div className={cx('flex flex-col gap-3 rounded-[6px] border p-4', winner ? 'border-v3-ink bg-v3-sheet shadow-[inset_0_0_0_1px_#0C1422]' : 'border-v3-rule bg-v3-paper')}>
      <div className="flex items-center justify-between gap-2">
        <Label>{tag}</Label>
        {winner && <span className="rounded-[4px] bg-v3-band px-1.5 py-0.5 font-figure text-[11px] font-bold uppercase tracking-[0.12em] text-white">{verdictLabel}</span>}
      </div>
      <div className="flex items-center gap-3">
        {p.photo ? (
          <img src={p.photo} alt="" width="48" height="48" loading="lazy" className="h-12 w-12 shrink-0 rounded-full bg-v3-well object-cover" data-drop-on-error="" />
        ) : (
          <span className="h-12 w-12 shrink-0 rounded-full bg-v3-well" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <div className="truncate text-[18px] font-extrabold leading-tight tracking-[-0.01em] text-v3-ink">{p.name}</div>
          <div className="mt-1 flex items-center gap-2"><PosTag pos={p.pos} /><span className="font-figure text-[13px] text-v3-ink2">{p.team || '—'}</span></div>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 border-t border-v3-rule pt-3">
        <div><dt><Label className="text-[11px]">ADP</Label></dt><dd className="mt-0.5 font-figure text-[18px] font-bold tabular-nums text-v3-ink">{p.adp}</dd></div>
        <div><dt><Label className="text-[11px]">Proj pts</Label></dt><dd className="mt-0.5 font-figure text-[18px] font-bold tabular-nums text-v3-ink">{p.pts}</dd></div>
        <div><dt><Label className="text-[11px]">Over repl.</Label></dt><dd className="mt-0.5 text-[18px]"><Delta value={p.vorp} /></dd></div>
      </dl>
    </div>
  )
}

function TheCall() {
  const situation = useEngineData(readSituation)
  const [pos, setPos] = useState('WR')
  const [format, setFormat] = useState(null)
  const fmt = format || (situation ? situation.scoringKey : 'half')
  // readCall depends on the chosen position and format, so it is read here
  // rather than through useEngineData's change key, which only knows about
  // the board and the league. The board is re-checked on data-loaded.
  const [boardReady, setBoardReady] = useState(false)
  useEffect(() => {
    const e = window.JukeEngine
    const ok = () => setBoardReady(!!(e && e.dataReady && e.dataReady()))
    ok()
    window.addEventListener('juke:data-loaded', ok)
    return () => window.removeEventListener('juke:data-loaded', ok)
  }, [])
  const call = useMemo(() => {
    const e = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!boardReady || !e) return null
    try { return readCall(e, pos, fmt) } catch { return null }
  }, [boardReady, pos, fmt])

  const posWord = { QB: 'quarterback', RB: 'running back', WR: 'receiver', TE: 'tight end' }[pos]

  return (
    <Sheet
      code={`The call · ${pos === 'TE' ? 'Tight end' : posWord.charAt(0).toUpperCase() + posWord.slice(1)}`}
      aside={`${FORMAT_LABEL[fmt]} PPR`.replace('Std PPR', 'Standard')}
      bodyClass="p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Seg label="Position" value={pos} onChange={setPos} options={LEAD.map((p) => ({ value: p, label: p }))} />
        <Seg label="Scoring" value={fmt} onChange={setFormat} options={FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))} />
      </div>

      {!call ? (
        <div className="mt-5"><Skeleton lines={6} /></div>
      ) : call.agree ? (
        <div className="mt-5 grid gap-4">
          <p className="text-[17px] leading-[1.5] text-v3-ink">
            At {posWord} under this scoring, the market and the points agree tonight: <strong>{call.market.name}</strong> first, <strong>{call.other.name}</strong> after him.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Side tag="Market and points" p={call.market} winner verdictLabel="Agreed" />
            <Side tag="Next" p={call.other} />
          </div>
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          <p className="text-[18px] leading-[1.45] text-v3-ink">
            The market drafts <strong>{call.market.name}</strong> first. The points take <strong>{call.juke.name}</strong> — by{' '}
            <Delta value={call.gap} className="text-[18px]" /> over a replaceable {posWord}.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Side tag="The market takes" p={call.market} />
            <Side tag="Juke takes" p={call.juke} winner verdictLabel="The call" />
          </div>
          <Arithmetic call={call} posWord={posWord} />
        </div>
      )}
    </Sheet>
  )
}

/* The arithmetic behind the call, as the three steps it actually is. Numbered
   because it is a sequence: a projection, a baseline, the difference. */
function Arithmetic({ call, posWord }) {
  const j = call.juke
  const m = call.market
  const max = Math.max(j.pts, m.pts, 1)
  return (
    <div className="rounded-[6px] border border-v3-rule bg-v3-paper p-4">
      <Label>How the call is made</Label>
      <ol className="mt-3 grid gap-3">
        {[
          { n: 1, what: 'Project the season', sub: 'under this scoring, from raw stats', a: m.pts, b: j.pts, fmt: (v) => v },
          { n: 2, what: `Find the replaceable ${posWord}`, sub: 'the last one a league this size starts', a: m.replacement, b: j.replacement, fmt: (v) => v, same: true },
        ].map((row) => (
          <li key={row.n} className="grid grid-cols-[28px_1fr] gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-v3-band font-figure text-[13px] font-bold text-white">{row.n}</span>
            <div>
              <div className="text-[15px] font-bold text-v3-ink">{row.what} <span className="font-normal text-v3-ink2">— {row.sub}</span></div>
              {row.same ? (
                <div className="mt-1 font-figure text-[14px] text-v3-ink2"><Fig className="font-bold text-v3-ink">{j.replacement}</Fig> pts, the same line for both</div>
              ) : (
                <div className="mt-2 grid gap-1.5">
                  {[{ p: m, v: row.a }, { p: j, v: row.b }].map((x) => (
                    <div key={x.p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,9rem)_1fr_3.5rem]">
                      <span className="truncate text-[13px] text-v3-ink2">{x.p.name}</span>
                      <ValueBar value={x.v} max={max} tone="neutral" className="order-3 col-span-2 sm:order-none sm:col-span-1" />
                      <Fig className="text-right text-[14px] font-bold text-v3-ink">{x.v}</Fig>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
        <li className="grid grid-cols-[28px_1fr] gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-v3-band font-figure text-[13px] font-bold text-white">3</span>
          <div>
            <div className="text-[15px] font-bold text-v3-ink">The gap over that line is the call</div>
            <div className="mt-1 font-figure text-[14px] text-v3-ink2">
              {j.name.split(' ').slice(-1)[0]} <Delta value={j.vorp} /> · {m.name.split(' ').slice(-1)[0]} <Delta value={m.vorp} /> · difference <Delta value={call.gap} />
            </div>
          </div>
        </li>
      </ol>
    </div>
  )
}

function DraftBlock() {
  const shape = useEngineData(readLeagueShape)
  return (
    <Sheet code="Draft" aside="Free · no account" className="flex flex-col">
      <Headline as="h3" size="block">Run a mock against tonight&apos;s board</Headline>
      <p className="mt-2 text-[15px] leading-[1.55] text-v3-ink2">Nine CPU managers drafting off real ADP. Graded the moment the last pick lands, and saved on this device.</p>
      {shape ? (
        <dl className="mt-4 grid grid-cols-4 gap-2 rounded-[6px] bg-v3-paper p-3">
          {[['Teams', shape.teams], ['Rounds', shape.rounds], ['Seat', shape.seat ? ordinal(shape.seat) : '—'], ['Scoring', shape.format]].map(([k, v]) => (
            <div key={k} className="min-w-0"><dt><Label className="text-[11px]">{k}</Label></dt><dd className="mt-0.5 truncate font-figure text-[16px] font-bold text-v3-ink">{v}</dd></div>
          ))}
        </dl>
      ) : <div className="mt-4"><Skeleton lines={2} /></div>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <QuietButton href="#/v3/draft">Set up a mock <Icon name="arrow" className="h-4 w-4" /></QuietButton>
        <GoLink href="#/v3/draft/insights">Your insights</GoLink>
      </div>
    </Sheet>
  )
}

function LeagueBlock() {
  const { status } = useLeagueFresh()
  const items = [
    ['lineup', 'The lineup swap worth making this week, in points'],
    ['wire', 'The claim worth making, priced over replacement'],
    ['trade', 'Whether a trade is fair before you send it'],
    ['league', 'Standings with every team\'s playoff odds'],
  ]
  return (
    <Sheet code="Your league" aside="Sleeper · ESPN" className="flex flex-col">
      <Headline as="h3" size="block">Connect it and Now becomes your week</Headline>
      <ul className="mt-3 grid gap-2">
        {items.map(([icon, text]) => (
          <li key={icon} className="flex items-start gap-3 text-[15px] leading-[1.45] text-v3-ink2">
            <Icon name={icon} className="mt-0.5 h-5 w-5 shrink-0 text-v3-ink" />{text}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-[1.5] text-v3-ink3">Read-only. Juke never edits your league.</p>
      <div className="mt-5">
        <QuietButton href="#/v3/account">{status === 'error' ? 'Check your leagues' : 'Connect a league'}</QuietButton>
      </div>
    </Sheet>
  )
}

function RecordBlock() {
  const locker = useEngineData(readLocker)
  return (
    <Sheet code="Record" aside="On this device" className="flex flex-col">
      <Headline as="h3" size="block">Every draft you run, graded</Headline>
      {!locker ? <div className="mt-4"><Skeleton lines={3} /></div> : locker.count === 0 ? (
        <p className="mt-2 text-[15px] leading-[1.55] text-v3-ink2">Nothing here yet. Your first mock lands here with a letter, where it finished in its room, and the four parts that add up to it.</p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-[6px] bg-v3-paper p-3"><dt><Label className="text-[11px]">Drafts</Label></dt><dd className="mt-0.5 font-figure text-[22px] font-bold text-v3-ink">{locker.count}</dd></div>
          <div className="rounded-[6px] bg-v3-paper p-3"><dt><Label className="text-[11px]">Best finish</Label></dt><dd className="mt-0.5 font-figure text-[22px] font-bold text-v3-ink">{locker.best ? `${locker.best.grade} · ${locker.best.projectedRank}` : '—'}</dd></div>
        </dl>
      )}
      <div className="mt-auto pt-5"><GoLink href="#/v3/record">Open your record</GoLink></div>
    </Sheet>
  )
}

function NowGuest() {
  const situation = useEngineData(readSituation)
  return (
    <div className="grid gap-10">
      <SituationBand s={situation} />
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <div className="lg:sticky lg:top-[92px]">
          <Label>Juke · fantasy football, priced</Label>
          <Headline className="mt-3">Every call, with the math shown.</Headline>
          <p className="mt-5 max-w-[46ch] text-[18px] leading-[1.55] text-v3-ink2">
            A rank tells you who goes first. Juke tells you by how much — in points over the player your league would start instead, under your scoring. Here is tonight&apos;s sharpest disagreement with the market. Change the position or the scoring and watch it move.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <CallButton href="#/v3/draft">Start a free mock draft <Icon name="arrow" className="h-4 w-4" /></CallButton>
            <QuietButton href="#/v3/players">Browse every player</QuietButton>
          </div>
          <p className="mt-4 font-figure text-[13px] text-v3-ink3">No account needed · runs in your browser</p>
        </div>
        <TheCall />
      </div>

      <section aria-labelledby="v3-desk" className="grid gap-5">
        <div className="flex items-end justify-between gap-4">
          <Headline as="h2" size="section" id="v3-desk">What you can do from here</Headline>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <DraftBlock />
          <LeagueBlock />
          <RecordBlock />
        </div>
      </section>
    </div>
  )
}
