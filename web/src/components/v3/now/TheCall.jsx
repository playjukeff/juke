import { useEffect, useMemo, useState } from 'react'
import { FORMATS, LEAD, readCall, readSituation } from '../data.js'
import { Delta, Label, PosTag, Seg, Sheet, Skeleton, ValueBar, useEngineData } from '../ui.jsx'
import { CountUp } from '../motion.jsx'

/* Tonight's board: the situation band and "the call" — the preseason
   page's two pieces, moved out of Now.jsx unchanged so the signed-in pages
   can draw them too without importing the page that routes to them. */

const FORMAT_LABEL = { standard: 'Std', half: 'Half', ppr: 'Full' }

export function SituationBand() {
  const s = useEngineData(readSituation)
  if (!s) return <div className="h-[44px] animate-pulse rounded-[6px] bg-v3-well" aria-hidden="true" />
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-[6px] bg-v3-band px-4 py-2.5 font-figure text-[13px] text-v3-bandInk">
      <span className="font-bold uppercase tracking-[0.14em] text-white">Tonight&apos;s board</span>
      <span><CountUp value={s.players} className="font-figure font-bold tabular-nums text-white" /> players priced</span>
      {s.refreshed && <span>refreshed {s.refreshed}</span>}
      {s.scoring && <span>your mock is set to <span className="text-white">{s.scoring}</span></span>}
    </div>
  )
}

/* The decimals a figure already carries, so a count lands on the same text
   the figure would have printed at rest. */
function decimals(v) {
  const t = String(v)
  return t.includes('.') ? t.split('.')[1].length : 0
}

/* One side of the call: who, what the market and the points say about him.
   Change the position or the scoring and the figures tick from the last
   player's to the new one's — the lede's "watch it move", taken literally. */
function Side({ tag, p, winner, verdictLabel }) {
  return (
    <div className={winner ? 'flex flex-col gap-3 rounded-[6px] border border-v3-ink bg-v3-sheet p-4 shadow-[inset_0_0_0_1px_rgb(var(--v3-ink))]' : 'flex flex-col gap-3 rounded-[6px] border border-v3-rule bg-v3-paper p-4'}>
      <div className="flex items-center justify-between gap-2">
        <Label>{tag}</Label>
        {winner && <span className="rounded-[4px] bg-v3-band px-1.5 py-0.5 font-figure text-[12px] font-bold uppercase tracking-[0.12em] text-white">{verdictLabel}</span>}
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
        <div><dt><Label className="text-[12px]">ADP</Label></dt><dd className="mt-0.5 font-figure text-[18px] font-bold tabular-nums text-v3-ink"><CountUp value={typeof p.adp === 'number' ? p.adp : null} format={(v) => v.toFixed(decimals(p.adp))} /></dd></div>
        <div><dt><Label className="text-[12px]">Proj pts</Label></dt><dd className="mt-0.5 font-figure text-[18px] font-bold tabular-nums text-v3-ink"><CountUp value={typeof p.pts === 'number' ? p.pts : null} format={(v) => v.toFixed(decimals(p.pts))} /></dd></div>
        <div><dt><Label className="text-[12px]">Over repl.</Label></dt><dd className="mt-0.5 text-[18px]"><Delta value={p.vorp} count /></dd></div>
      </dl>
    </div>
  )
}

export function TheCall() {
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
          <p className="text-[18px] leading-[1.5] text-v3-ink">
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
                <div className="mt-1 font-figure text-[15px] text-v3-ink2"><CountUp value={typeof j.replacement === 'number' ? j.replacement : null} format={(v) => v.toFixed(decimals(j.replacement))} className="font-bold tabular-nums text-v3-ink" /> pts, the same line for both</div>
              ) : (
                <div className="mt-2 grid gap-1.5">
                  {[{ p: m, v: row.a }, { p: j, v: row.b }].map((x) => (
                    <div key={x.p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,9rem)_1fr_3.5rem]">
                      <span className="truncate text-[13px] text-v3-ink2">{x.p.name}</span>
                      <ValueBar value={x.v} max={max} tone="neutral" className="order-3 col-span-2 sm:order-none sm:col-span-1" />
                      <CountUp value={typeof x.v === 'number' ? x.v : null} format={(v) => v.toFixed(decimals(x.v))} className="text-right font-figure text-[15px] font-bold tabular-nums text-v3-ink" />
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
            <div className="mt-1 font-figure text-[15px] text-v3-ink2">
              {j.name.split(' ').slice(-1)[0]} <Delta value={j.vorp} count /> · {m.name.split(' ').slice(-1)[0]} <Delta value={m.vorp} count /> · difference <Delta value={call.gap} count />
            </div>
          </div>
        </li>
      </ol>
    </div>
  )
}
