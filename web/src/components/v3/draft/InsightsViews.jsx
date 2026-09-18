import { Delta, Label, PosTag, Sheet, ValueBar, cx } from '../ui.jsx'
import { FOCUS, signed } from './kit.jsx'

/* The four views of Your Insights, and the habits column, in the call-sheet
   idiom.

   Every figure and every sentence is a field on engine.insightsReport() or
   engine.insightsMock() (app.js section 11d2). Nothing is computed here
   beyond a bar's length from a share the engine already chose — the audit
   behind these numbers (best available at that slot, each alternative
   offered once, kickers and defenses valued but never recommended) is the
   engine's, not ours to restate.

   ---- Two series in a palette with no series colours ----

   v3 has four colour jobs and none of them is "a data series". So YOU and
   THE ROOM are told apart by SHAPE: you are a filled ink dot, the room a
   hollow ring; your column is ink, the room's median is an ink rule. Cost
   is cost, caution (a tier running out) is warn. That keeps every hue on the
   page meaning the one thing it means everywhere else in v3. */

const TONE_TEXT = { good: 'text-v3-gain', bad: 'text-v3-cost', warn: 'text-v3-warn', neutral: 'text-v3-ink2' }

export function Kpi({ kpi }) {
  return (
    <div className="min-w-0 rounded-[6px] border border-v3-rule bg-v3-sheet p-4">
      <Label className="block text-[12px]">{kpi.label}</Label>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        <span className="font-figure text-[28px] font-bold leading-none tabular-nums text-v3-ink">{kpi.value}</span>
        {kpi.delta && <span className={cx('font-figure text-[13px] font-semibold tabular-nums', (/[1-9]/.test(kpi.delta) && TONE_TEXT[kpi.tone]) || 'text-v3-ink2')}>{kpi.delta}</span>}
      </div>
      <p className="mt-1.5 text-[13px] leading-[1.45] text-v3-ink2">{kpi.note}</p>
    </div>
  )
}

// 01 — what you left on the board
export function ViewLeft({ report, mock, selectedId, hover, onHover, onSelect }) {
  if (!mock) return null
  const H = 110
  const shown = report.bars.find((b) => b.id === (hover || selectedId))
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Label>Points left on the board, per mock</Label>
        <span className="flex items-center gap-2 text-[13px] text-v3-ink2">
          <span className="h-[2px] w-5 bg-v3-ink" aria-hidden="true" />
          The room’s median from the same seats <span className="font-figure font-bold tabular-nums text-v3-ink">{report.fieldMedian ?? '—'}</span>
        </span>
      </div>
      <div className="relative mt-4" style={{ height: H + 24 }} onMouseLeave={() => onHover(null)}>
        <div className="absolute inset-0 flex gap-1 sm:gap-1.5" role="group" aria-label="Mocks, oldest to newest">
          {report.bars.map((b) => {
            const on = b.id === selectedId
            const hot = b.id === hover
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={on}
                aria-label={b.title}
                onMouseEnter={() => onHover(b.id)}
                onFocus={() => onHover(b.id)}
                onBlur={() => onHover(null)}
                onClick={() => onSelect(b.id)}
                className={cx('relative flex min-w-0 flex-1 flex-col justify-end rounded-t-[4px] pb-[24px]', FOCUS, on || hot ? 'bg-v3-well' : '')}
              >
                {/* Above the room's median is a cost; at or under it, plain
                    ink. Selection is the ink rule under the column, never a
                    lighter bar — opacity is not a way to say "not chosen". */}
                <span className={cx('block rounded-t-[2px]', b.aboveRoom ? 'bg-v3-cost' : 'bg-v3-ink3')} style={{ height: Math.max(4, b.share * H) }} />
                <span className={cx('absolute inset-x-0 bottom-1 text-center font-figure text-[12px] tabular-nums', on ? 'font-bold text-v3-ink' : 'text-v3-ink3')}>{b.n}</span>
                {on && <span className="absolute inset-x-1 bottom-0 h-[3px] bg-v3-ink" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
        {/* The median, painted over the columns — which bar clears it is the
            whole reading of the chart. */}
        {report.fieldShare !== null && <span className="pointer-events-none absolute inset-x-0 z-10 h-[2px] bg-v3-ink" style={{ bottom: 24 + report.fieldShare * H }} aria-hidden="true" />}
      </div>
      <p className="mt-2 min-h-[1.5em] font-figure text-[12px] tabular-nums text-v3-ink2">{shown ? shown.title : ''}</p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-v3-rule pt-4">
        <div className="min-w-0">
          <Label>Pick by pick · {mock.label}</Label>
          <p className="mt-1.5 max-w-[60ch] text-[15px] leading-[1.55] text-v3-ink2">Every pick against the best value still on the board at that slot, each alternative counted once. Zero means you took the top of the board.</p>
        </div>
        <div className="text-right">
          <span className="block text-[40px] leading-none"><Delta value={-mock.total} /></span>
          <Label className="text-[12px]">Left on the board</Label>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-[4px] border border-v3-rule">
        <div className="hidden grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)_140px_60px] gap-3 border-b border-v3-rule bg-v3-paper px-3 py-2 sm:grid">
          {['Slot', 'Your pick', 'Best available', 'Left', 'Win %'].map((h, i) => <Label key={h} className={cx('text-[12px]', i >= 3 && 'text-right')}>{h}</Label>)}
        </div>
        <ul className="divide-y divide-v3-rule bg-v3-sheet">
          {mock.picks.map((p) => {
            const cost = p.delta > 0
            const noWin = !p.best || p.winDelta === null
            return (
              <li key={p.code + p.you.name} data-pick-row className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)_140px_60px]">
                <span className="font-figure text-[12px] font-bold tabular-nums text-v3-ink3">{p.code}</span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2"><PosTag pos={p.you.pos} /><span className={cx('truncate text-[15px] text-v3-ink', cost && 'font-bold')}>{p.you.name}</span></span>
                  {/* On a phone the best-available column folds under the pick
                      rather than vanishing — "over whom" is the whole point. */}
                  <span className="mt-0.5 block truncate text-[12px] text-v3-ink2 sm:hidden">{p.best ? <>over <span className="font-semibold text-v3-ink">{p.best.name}</span> ({p.best.pos === 'DST' ? 'D/ST' : p.best.pos})</> : 'top of the board'}</span>
                </span>
                <span className="hidden min-w-0 items-center gap-1.5 sm:flex" data-pick-best={p.best ? p.best.pos : 'none'}>
                  {p.best ? <><span className="shrink-0 font-figure text-[12px] text-v3-ink3">over</span><PosTag pos={p.best.pos} /><span className="truncate text-[13px] text-v3-ink">{p.best.name}</span></> : <span className="text-[13px] text-v3-ink3">— top of the board</span>}
                </span>
                <span className="flex items-center justify-end gap-2">
                  <span className="hidden flex-1 sm:block">{cost ? <ValueBar value={Math.max(0.03, p.share)} max={1} tone="cost" /> : <ValueBar value={null} />}</span>
                  <span className="w-10 text-right text-[13px]">{cost ? <Delta value={-p.delta} /> : <span className="font-figure text-v3-ink3">0</span>}</span>
                </span>
                {/* One question: what the alternative would have done to
                    projected win %. No alternative, or a swap that empties a
                    starting slot, has no answer — a dash. */}
                <span data-pick-win title={!p.best ? 'You took the top of the board here' : p.winDelta === null ? 'Not priceable: the swap would leave a starting slot empty' : 'Projected win % if you had taken the alternative instead'} className="col-start-3 text-right text-[12px] sm:col-start-auto sm:text-[13px]">
                  {noWin ? <span className="font-figure text-v3-ink3">—</span> : <Delta value={p.winDelta} digits={1} />}
                  <span className="font-figure text-v3-ink3 sm:hidden"> win</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// 02 — which picks actually mattered
export function ViewLeverage({ mock, onOpen }) {
  if (!mock) return null
  const max = Math.max(1, ...mock.forks.map((f) => Math.abs(f.winDelta)))
  return (
    <div>
      <p className="max-w-[70ch] text-[15px] leading-[1.55] text-v3-ink2">{mock.forkIntro}</p>
      {mock.forks.length ? (
        <ul className="mt-4 space-y-2.5">
          {mock.forks.map((f) => (
            <li key={f.code + f.title}>
              <button type="button" onClick={onOpen} className={cx('w-full rounded-[4px] border border-v3-rule bg-v3-sheet p-4 text-left hover:border-v3-ink', FOCUS)}>
                <span className="flex items-start justify-between gap-4">
                  <span className="min-w-0">
                    <Label className="text-[12px]">{f.code} · {f.mockLabel}</Label>
                    <span className="mt-1.5 block text-[18px] font-extrabold leading-tight text-v3-ink">{f.title}</span>
                    <span className="mt-1.5 block text-[15px] leading-[1.5] text-v3-ink2">{f.note}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[28px] leading-none"><Delta value={f.winDelta} digits={1} /></span>
                    <Label className="text-[12px]">Win % swing</Label>
                  </span>
                </span>
                {/* Zero is the centre line: a regret grows left, a good call right. */}
                <ValueBar value={f.winDelta} max={max} zero className="mt-3 h-2.5" />
                <span className="mt-1.5 block text-center font-figure text-[12px] uppercase tracking-[0.08em] text-v3-ink3">{f.axisNote}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-[4px] border border-v3-rule bg-v3-paper p-4 text-[15px] leading-[1.55] text-v3-ink2">
          Nothing in this mock is worth relitigating. Pick another one from the bars on <span className="font-semibold text-v3-ink">What you left on the board</span> to audit a draft that was closer.
        </p>
      )}
    </div>
  )
}

// 03 — you against the room
const DOT = 14
export function ViewField({ report, hover, onHover, onOpen }) {
  const rows = report.field.rows
  const hi = Math.max(14, Math.ceil(Math.max(...rows.flatMap((r) => [r.you, r.field, r.cliff ?? 0]))))
  const frac = (x) => (Math.max(1, Math.min(hi, x)) - 1) / (hi - 1)
  // Inset by half a dot so the widest mark cannot hang past the track
  // (CLAUDE.md, "The dumbbell scale is inset by half a dot").
  const at = (x) => `calc(${DOT / 2}px + (100% - ${DOT}px) * ${frac(x)})`
  const span = (a, b) => `calc((100% - ${DOT}px) * ${Math.abs(frac(a) - frac(b)).toFixed(4)})`
  const hovered = hover ? rows.find((r) => r.pos === hover) : null
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[62ch] text-[15px] leading-[1.55] text-v3-ink2">The room is every other seat in the mocks you ran — same board, same ADP, same night. The tick is the pick at which that position’s starting tier runs out; right of it is late.</p>
        <div className="flex shrink-0 flex-wrap gap-4 text-[13px] text-v3-ink2">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-v3-ink" />You</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-v3-ink2 bg-v3-sheet" />The room</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-0.5 bg-v3-warn" />Tier empties</span>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-[56px_minmax(0,1fr)] gap-3 px-2.5 sm:grid-cols-[164px_minmax(0,1fr)_160px]" aria-hidden="true">
        <span />
        <span className="flex justify-between font-figure text-[12px] uppercase tracking-[0.1em] text-v3-ink3"><span>Rd 1</span><span>Rd {hi}</span></span>
      </div>
      <ul className="mt-1">
        {rows.map((r) => (
          <li key={r.pos}>
            <button
              type="button"
              onMouseEnter={() => onHover(r.pos)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(r.pos)}
              onBlur={() => onHover(null)}
              onClick={onOpen}
              aria-label={`${r.name}: you at round ${r.you.toFixed(1)}, the room at ${r.field.toFixed(1)}${r.cliff === null ? ', tier never emptied' : `, tier empties at ${r.cliff.toFixed(1)}`}. ${r.note}.`}
              className={cx('grid w-full grid-cols-[56px_minmax(0,1fr)] items-center gap-3 rounded-[4px] border-b border-v3-rule px-2.5 py-3 text-left sm:grid-cols-[164px_minmax(0,1fr)_160px]', FOCUS, hover === r.pos && 'bg-v3-paper')}
            >
              <span className="flex min-w-0 items-center gap-2"><PosTag pos={r.pos} /><span className="hidden break-words [overflow-wrap:anywhere] text-[15px] text-v3-ink sm:inline">{r.name}</span></span>
              <span className="relative block h-[28px]">
                <span className="absolute inset-x-0 top-[13px] h-0.5 bg-v3-well" />
                {r.cliff !== null && <span className="absolute top-1 h-5 w-0.5 bg-v3-warn" style={{ left: at(r.cliff) }} />}
                <span className={cx('absolute top-[13px] h-0.5', r.late ? 'bg-v3-cost' : 'bg-v3-ink3')} style={{ left: at(Math.min(r.you, r.field)), width: span(r.you, r.field) }} />
                <span className="absolute top-[8px] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-v3-ink2 bg-v3-sheet" style={{ left: at(r.field) }} />
                <span className="absolute top-[7px] h-[14px] w-[14px] -translate-x-1/2 rounded-full border-2 border-v3-sheet bg-v3-ink" style={{ left: at(r.you) }} />
              </span>
              <span className="col-span-2 flex items-baseline justify-end gap-2 sm:col-span-1 sm:block sm:text-right">
                <span className={cx('font-figure text-[13px] font-bold tabular-nums', TONE_TEXT[r.tone])}>{signed(r.delta, 1)} rd</span>
                <span className="text-[13px] text-v3-ink2 sm:mt-0.5 sm:block">{r.note}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-v3-rule pt-4 text-[15px] leading-[1.55] text-v3-ink2" aria-live="polite">
        {hovered
          ? `${hovered.name}: you at ${hovered.you.toFixed(1)}, the room at ${hovered.field.toFixed(1)}` + (hovered.cliff === null ? ', and the startable tier never emptied.' : `, the tier empties at ${hovered.cliff.toFixed(1)}.`)
          : report.fieldNote}
      </p>
    </div>
  )
}

// 04 — what these mocks can prove
function cellClass(n) {
  if (n === 0) return 'border-dashed border-v3-rule bg-v3-sheet text-v3-ink3'
  if (n >= 3) return 'border-v3-ink2 bg-v3-ink2 text-v3-sheet'
  return 'border-v3-rule bg-v3-well text-v3-ink'
}

export function ViewTrust({ report, onRun, roomActive }) {
  const cov = report.coverage
  const sample = report.sample
  const bad = sample.tone === 'bad'
  return (
    <div>
      <p className="max-w-[70ch] text-[15px] leading-[1.55] text-v3-ink2">{report.mocks} mocks is not {report.mocks} data points. {cov.sampled} of {cov.total} seat-and-format cells have any data at all, and what repeats between your own drafts costs some of the rest.</p>
      <div className="mt-5">
        <Label>Mocks per seat and format</Label>
        {/* Scrolls sideways rather than shrinking its cells: the count IS the
            cell. Divs rather than a <table>, which style.css reaches into. */}
        <div className="mt-2.5 overflow-x-auto pb-1">
          <div role="table" aria-label="Mocks per seat and format" className="inline-flex min-w-max flex-col gap-1">
            <div role="row" className="flex gap-1">
              <span role="columnheader" className="w-[110px] shrink-0"><span className="sr-only">Format</span></span>
              {Array.from({ length: cov.seats }, (_, i) => <span key={i} role="columnheader" className="w-10 shrink-0 text-center font-figure text-[12px] text-v3-ink3">{i + 1}</span>)}
            </div>
            {cov.rows.map((row) => (
              <div key={row.key} role="row" className="flex items-center gap-1">
                <span role="rowheader" className="w-[110px] shrink-0 truncate pr-2 text-[13px] font-semibold text-v3-ink">{row.format}</span>
                {row.counts.map((n, ci) => (
                  <span key={ci} role="cell" title={`${row.format} · seat ${ci + 1} · ${n === 0 ? 'no mocks' : `${n} mock${n > 1 ? 's' : ''}`}${row.teams[ci] && row.teams[ci].length ? ` · ${row.teams[ci].join('/')}-team` : ''}`} className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-[4px] border font-figure text-[13px] font-bold tabular-nums', cellClass(n))}>
                    {n === 0 ? '·' : n}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[13px] leading-[1.5] text-v3-ink2">Empty cells are guesses, not reads. A seat you have never drafted from tells you nothing about drafting from it.</p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0">
          <Label>{report.experiments.length === 1 ? 'One mock' : 'Mocks'} that would tighten the read</Label>
          <ul className="mt-2.5 space-y-2">
            {report.experiments.map((e) => (
              <li key={e.key}>
                <button type="button" onClick={() => onRun(e.scoring, e.seat)} disabled={roomActive} className={cx('w-full rounded-[4px] border border-v3-rule bg-v3-sheet p-3.5 text-left hover:border-v3-ink disabled:cursor-not-allowed disabled:bg-v3-paper', FOCUS)}>
                  <span className="flex items-baseline justify-between gap-3"><span className="text-[15px] font-bold text-v3-ink">{e.title}</span><span className="shrink-0 font-figure text-[12px] font-bold text-v3-ink2">{e.tag}</span></span>
                  <span className="mt-1 block text-[13px] leading-[1.5] text-v3-ink2">{e.note}</span>
                  {/* What the press does, beside what the card advises: the
                      title prescribes "three mocks" and the button starts one. */}
                  <span className="mt-2 inline-flex items-center gap-1 font-figure text-[12px] font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4">{roomActive ? 'Not available in a room' : e.runLabel}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <Sheet code="Sample correlation" aside={`${Math.round(sample.effective)} of ${sample.mocks} effective`} className={bad ? 'border-v3-warn/40' : ''} bodyClass={cx('p-4', bad && 'bg-v3-warnWash')}>
          <p className={cx('text-[15px] leading-[1.5]', bad ? 'text-v3-warn' : 'text-v3-ink')}>{sample.line}</p>
          <p className="mt-2 text-[13px] leading-[1.5] text-v3-ink2">{sample.sub}</p>
          <div className="mt-3" role="img" aria-label={`About ${Math.round(sample.effective)} effective drafts of ${sample.mocks}`}>
            <ValueBar value={sample.effective} max={sample.mocks} tone="neutral" />
          </div>
        </Sheet>
      </div>
    </div>
  )
}

/* The habits column — the costliest habit, the two behind it, and how these
   rosters fail. The habit card's launch is the same runAt() the rail's "Run
   this next" uses, drawn quiet so the page keeps one cobalt button. */
export function Habits({ report, roomActive, onRun, onOpenHabit }) {
  const [top, ...rest] = report.habits
  const next = rest.slice(0, 2)
  const run = report.runNext
  return (
    <aside className="flex w-full min-w-0 shrink-0 flex-col gap-4 xl:w-[310px]" aria-label="Your habits">
      {top && (
        <Sheet code="Costliest habit" aside={top.frequency}>
          <p className="text-[20px] font-extrabold leading-[1.2] tracking-[-0.01em] text-v3-ink">{top.title}</p>
          <p className="mt-2.5 text-[15px] leading-[1.55] text-v3-ink2">{top.evidence}</p>
          <dl className="mt-3.5 grid grid-cols-2 gap-2">
            <div className="rounded-[4px] bg-v3-paper px-3 py-2"><dt><Label className="text-[12px]">Cost</Label></dt><dd className="mt-1 text-[22px] leading-none"><Delta value={-Math.round(top.costPoints)} unit="pts" /></dd></div>
            <div className="rounded-[4px] bg-v3-paper px-3 py-2"><dt><Label className="text-[12px]">Win %</Label></dt><dd className="mt-1 text-[22px] leading-none"><Delta value={top.winPct} digits={1} /></dd></div>
          </dl>
          {run && (
            <button type="button" onClick={() => onRun(run.scoring, run.seat)} disabled={roomActive} className={cx('mt-3.5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[6px] border border-v3-ink bg-v3-sheet px-4 text-[15px] font-semibold text-v3-ink hover:bg-v3-band hover:text-white disabled:cursor-not-allowed disabled:border-v3-rule disabled:bg-v3-well disabled:text-v3-ink3', FOCUS)}>
              {roomActive ? 'Not available in a room' : run.label}
            </button>
          )}
        </Sheet>
      )}
      {next.length > 0 && (
        <Sheet code="Other habits worth fixing" bodyClass="px-4 py-1">
          <ul>
            {next.map((h) => (
              <li key={h.pos}>
                <button type="button" onClick={onOpenHabit} className={cx('w-full border-t border-v3-rule py-3 text-left first:border-t-0', FOCUS)}>
                  <span className="flex items-baseline justify-between gap-3"><span className="min-w-0 text-[15px] font-bold text-v3-ink">{h.short}</span><span className="shrink-0 text-[13px]"><Delta value={-Math.round(h.costPoints)} unit="pts" /></span></span>
                  <span className="mt-1 block text-[13px] leading-[1.5] text-v3-ink2">{h.evidence}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      <Sheet code="How these rosters fail" bodyClass="px-4 py-1">
        <ul>
          {report.failures.map((f) => (
            <li key={f.key} className="flex items-start gap-3 border-t border-v3-rule py-3 first:border-t-0">
              <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-v3-ink">{f.title}</span><span className="mt-0.5 block text-[13px] leading-[1.5] text-v3-ink2">{f.note}</span></span>
              <span className={cx('shrink-0 font-figure text-[15px] font-bold tabular-nums', f.tone === 'bad' ? 'text-v3-cost' : f.tone === 'warn' ? 'text-v3-warn' : 'text-v3-ink')}>{f.value}</span>
            </li>
          ))}
        </ul>
      </Sheet>
    </aside>
  )
}
