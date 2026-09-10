import { POS_CHALK } from '../../draftRoomPositions.js'
import { Kicker, PosChip } from '../v2ui.jsx'

/* The four views of Your Insights, and the sidebar, drawn in telemetry.

   Every figure and every sentence here is a field on insightsReport() or
   insightsMock() (app.js section 11d2). Nothing is computed in this file
   beyond a bar's length from a share the engine already chose — production's
   insights/ components make the same promise, and the audit behind these
   numbers (best available at that slot, each alternative offered once,
   kickers and defenses valued but never recommended) is the engine's, not
   ours to restate.

   ---- The palette, in the v2 tokens ----

   YOU is v2 cyan and THE ROOM is v2 violet — the two data-series accents,
   never a position hue and never volt, because the "you" dot is a series
   and not a selection. COST is v2-loss, CAUTION v2-warn. Volt appears only
   on a positive swing (a value delta, the brief's one allowance) and on the
   selection. */

export const SERIES = {
  you: '#22D3EE',
  room: '#8B5CF6',
  cost: '#FF6B6B',
  warn: '#FFB547',
  quiet: '#7F8A9E',
  volt: '#00FF66',
}

// Every tone the engine emits, as a text class. `good` is a value moving
// the right way, which is the brief's one allowance for volt on a number.
export const TONE_TEXT = { good: 'text-v2-volt', bad: 'text-v2-loss', warn: 'text-v2-warn', neutral: 'text-v2-ink2' }
const TONE_MARK = { good: SERIES.you, bad: SERIES.cost, warn: SERIES.warn, neutral: SERIES.quiet }

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt'

function signed(n, digits = 1) {
  if (n === null || n === undefined) return '—'
  const s = Math.abs(n).toFixed(digits)
  return (n > 0 ? '+' : n < 0 ? '−' : '') + s
}

// ---------------------------------------------------------------------------
// 01 — what you left on the board
// ---------------------------------------------------------------------------

export function ViewLeft({ report, mock, selectedId, hover, onHover, onSelect }) {
  if (!mock) return null
  const H = 104
  const shown = report.bars.find((b) => b.id === (hover || selectedId))
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Kicker>Points left on the board, per mock</Kicker>
        <span className="flex items-center gap-2 text-[12px] text-v2-ink2">
          <span className="h-px w-5" style={{ background: SERIES.room }} aria-hidden="true" />
          The room&apos;s median from the same seats
          <span className="font-mono font-semibold tabular-nums" style={{ color: SERIES.room }}>{report.fieldMedian ?? '—'}</span>
        </span>
      </div>

      {/* One button per mock. The fill says which side of the room's median
          a draft landed; the lit column is the one audited below. */}
      <div className="relative mt-4" style={{ height: H + 22 }} onMouseLeave={() => onHover(null)}>
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
                className={`relative flex min-w-0 flex-1 flex-col justify-end rounded-t-[6px] pb-[22px] transition-colors ${focusRing} ${on || hot ? 'bg-white/[0.05]' : ''}`}
              >
                <span
                  className="block rounded-t-[3px] transition-[height] duration-500 ease-out"
                  style={{
                    height: Math.max(4, b.share * H),
                    background: b.aboveRoom ? SERIES.cost : SERIES.quiet,
                    opacity: on || hot ? 1 : 0.62,
                  }}
                />
                <span className={`absolute inset-x-0 bottom-1 text-center font-mono text-[10px] tabular-nums ${on ? 'text-v2-ink' : 'text-v2-ink3'}`}>{b.n}</span>
                {on && <span className="absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-v2-volt" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
        {/* The median, painted over the columns — which bar clears it is the
            whole reading, and a line hidden behind every bar that does is a
            line you only see where it does not matter. */}
        {report.fieldShare !== null && (
          <span
            className="pointer-events-none absolute inset-x-0 z-10 h-px"
            style={{ bottom: 22 + report.fieldShare * H, background: SERIES.room }}
            aria-hidden="true"
          />
        )}
      </div>
      <p className="mt-2 min-h-[1.5em] font-mono text-[11px] tabular-nums text-v2-ink3">{shown ? shown.title : ''}</p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-white/[0.06] pt-4">
        <div className="min-w-0">
          <Kicker>Pick by pick · {mock.label}</Kicker>
          <p className="mt-1.5 max-w-[60ch] text-[13px] leading-[1.55] text-v2-ink2">
            Every pick against the best value still on the board at that slot, each alternative counted once.
            Zero means you took the top of the board.
          </p>
        </div>
        <div className="text-right">
          <span className="block font-telemetry text-[44px] font-bold italic leading-none tabular-nums text-v2-loss">−{mock.total}</span>
          <Kicker>Left on the board</Kicker>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-[12px] bg-v2-inset ring-1 ring-inset ring-white/[0.06]">
        <div className="hidden grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)_140px_56px] gap-3 border-b border-white/[0.06] px-3 py-2 sm:grid">
          {['Slot', 'Your pick', 'Best available', 'Left', 'Win %'].map((h, i) => (
            <Kicker key={h} className={i >= 3 ? 'text-right' : ''}>{h}</Kicker>
          ))}
        </div>
        <ul className="divide-y divide-white/[0.04]">
          {mock.picks.map((p) => {
            const cost = p.delta > 0
            const noWin = !p.best || p.winDelta === null
            return (
              <li key={p.code + p.you.name} data-pick-row className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)_140px_56px]">
                <span className="font-mono text-[12px] tabular-nums text-v2-ink3">{p.code}</span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <PosChip pos={p.you.pos} className="shrink-0" />
                    <span className={`truncate text-[13px] text-v2-ink ${cost ? 'font-semibold' : ''}`}>{p.you.name}</span>
                  </span>
                  {/* On a phone the best-available column folds under the
                      pick rather than vanishing — five columns in 330px is
                      three ellipsised to nothing, and "over whom" is the
                      whole point of the row. */}
                  <span className="mt-0.5 block truncate text-[11px] text-v2-ink3 sm:hidden">
                    {p.best ? <>over <span style={{ color: POS_CHALK[p.best.pos] }}>{p.best.name}</span></> : 'top of the board'}
                  </span>
                </span>
                <span className="hidden min-w-0 items-center gap-1.5 sm:flex" data-pick-best={p.best ? p.best.pos : 'none'}>
                  {p.best ? (
                    <>
                      <span className="shrink-0 font-mono text-[10px] text-v2-ink3">over</span>
                      <span className="truncate text-[12px]" style={{ color: POS_CHALK[p.best.pos] }}>{p.best.name}</span>
                    </>
                  ) : <span className="text-[12px] text-v2-ink3">— top of the board</span>}
                </span>
                <span className="flex items-center justify-end gap-2">
                  <span className="relative hidden h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06] sm:block">
                    {cost && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(3, p.share * 100)}%`, background: SERIES.cost }} />}
                  </span>
                  <span className={`w-10 text-right font-mono text-[12px] font-semibold tabular-nums ${cost ? 'text-v2-loss' : 'text-v2-ink3'}`}>{cost ? `−${p.delta}` : '0'}</span>
                </span>
                {/* The win column answers one question: what the alternative
                    would have done to projected win %. No alternative, or a
                    swap that would empty a starting slot, has no answer — a
                    dash, never the runner-up figure the engine also carries. */}
                <span
                  data-pick-win
                  title={!p.best ? 'You took the top of the board here' : p.winDelta === null ? 'Not priceable: the swap would leave a starting slot empty' : 'Projected win % if you had taken the alternative instead'}
                  className={`col-start-3 text-right font-mono text-[11px] tabular-nums sm:col-start-auto sm:text-[12px] ${noWin ? 'text-v2-ink3' : p.winDelta < 0 ? 'text-v2-loss' : 'text-v2-volt'}`}
                >
                  {noWin ? '—' : signed(p.winDelta)}
                  <span className="text-v2-ink3 sm:hidden"> win</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 02 — which picks actually mattered
// ---------------------------------------------------------------------------

export function ViewLeverage({ mock, onOpen }) {
  if (!mock) return null
  const max = Math.max(1, ...mock.forks.map((f) => Math.abs(f.winDelta)))
  return (
    <div>
      <p className="max-w-[70ch] text-[14px] leading-[1.55] text-v2-ink2">{mock.forkIntro}</p>
      {mock.forks.length ? (
        <ul className="mt-4 space-y-2.5">
          {mock.forks.map((f) => {
            const w = (Math.abs(f.winDelta) / max) * 46
            return (
              <li key={f.code + f.title}>
                <button
                  type="button"
                  onClick={onOpen}
                  className={`w-full rounded-[14px] p-4 text-left ring-1 ring-inset transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 ${focusRing} ${
                    f.good ? 'bg-v2-volt/[0.05] ring-v2-volt/25' : 'bg-v2-inset ring-white/[0.07] hover:ring-white/[0.16]'
                  }`}
                >
                  <span className="flex items-start justify-between gap-4">
                    <span className="min-w-0">
                      <Kicker>{f.code} · {f.mockLabel}</Kicker>
                      <span className="mt-1.5 block font-telemetry text-[22px] font-bold uppercase italic leading-[1] text-v2-ink sm:text-[24px]">{f.title}</span>
                      <span className="mt-1.5 block text-[13px] leading-[1.5] text-v2-ink2">{f.note}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block font-telemetry text-[32px] font-bold italic leading-none tabular-nums ${f.good ? 'text-v2-volt' : 'text-v2-loss'}`}>{signed(f.winDelta)}</span>
                      <Kicker>Win % swing</Kicker>
                    </span>
                  </span>
                  {/* Zero is the centre line: a regret grows left, a good call
                      grows right, and the origin is what keeps a cost from
                      reading as a gain for one frame. */}
                  <span className="relative mt-3 block h-6" aria-hidden="true">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-white/[0.16]" />
                    <span
                      className="absolute top-[7px] h-2.5 rounded-[3px]"
                      style={{ left: f.good ? '50%' : `${50 - w}%`, width: `${w}%`, background: f.good ? SERIES.volt : SERIES.cost }}
                    />
                  </span>
                  <span className="mt-1 block text-center font-mono text-[10px] uppercase tracking-[0.08em] text-v2-ink3">{f.axisNote}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-5 rounded-[14px] bg-v2-inset p-4 text-[14px] leading-[1.55] text-v2-ink2 ring-1 ring-inset ring-white/[0.07]">
          Nothing in this mock is worth relitigating. Pick another one from the bars on <span className="text-v2-ink">What you left on the board</span> to audit a draft that was closer.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 03 — you against the room
// ---------------------------------------------------------------------------

const DOT = 14
export function ViewField({ report, hover, onHover, onOpen }) {
  const rows = report.field.rows
  // One axis for every row, so the tier ticks line up across positions —
  // the whole point of the layout. It runs from round 1 to the latest value
  // any row actually needs, never shorter than a fourteen-round draft.
  const hi = Math.max(14, Math.ceil(Math.max(...rows.flatMap((r) => [r.you, r.field, r.cliff ?? 0]))))
  const frac = (x) => (Math.max(1, Math.min(hi, x)) - 1) / (hi - 1)
  const at = (x) => `calc(${DOT / 2}px + (100% - ${DOT}px) * ${frac(x)})`
  const span = (a, b) => `calc((100% - ${DOT}px) * ${Math.abs(frac(a) - frac(b)).toFixed(4)})`
  const hovered = hover ? rows.find((r) => r.pos === hover) : null

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[62ch] text-[14px] leading-[1.55] text-v2-ink2">
          The room is every other seat in the mocks you ran — same board, same ADP, same night. The tick is the
          pick at which that position&apos;s starting tier runs out; right of it is late.
        </p>
        <div className="flex shrink-0 flex-wrap gap-4 text-[12px] text-v2-ink2">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES.you }} />You</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES.room }} />The room</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-0.5" style={{ background: SERIES.warn }} />Tier empties</span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-2.5 sm:grid-cols-[120px_minmax(0,1fr)_150px]" aria-hidden="true">
        <span />
        <span className="flex justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3"><span>Rd 1</span><span>Rd {hi}</span></span>
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
              className={`grid w-full grid-cols-[96px_minmax(0,1fr)] items-center gap-3 rounded-[10px] border-b border-white/[0.05] px-2.5 py-3 text-left transition-colors sm:grid-cols-[120px_minmax(0,1fr)_150px] ${focusRing} ${hover === r.pos ? 'bg-white/[0.035]' : ''}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <PosChip pos={r.pos} className="shrink-0" />
                <span className="truncate text-[13px] text-v2-ink">{r.name}</span>
              </span>
              <span className="relative block h-[28px]">
                <span className="absolute inset-x-0 top-[13px] h-0.5 bg-white/[0.06]" />
                {r.cliff !== null && <span className="absolute top-1 h-5 w-0.5" style={{ left: at(r.cliff), background: SERIES.warn }} />}
                <span
                  className="absolute top-[13px] h-0.5 rounded-full"
                  style={{ left: at(Math.min(r.you, r.field)), width: span(r.you, r.field), background: r.late ? SERIES.cost : 'rgba(255,255,255,0.22)' }}
                />
                <span className="absolute top-[8px] h-3 w-3 -translate-x-1/2 rounded-full ring-2 ring-v2-panel" style={{ left: at(r.field), background: SERIES.room }} />
                <span className="absolute top-[7px] h-[14px] w-[14px] -translate-x-1/2 rounded-full ring-2 ring-v2-panel" style={{ left: at(r.you), background: SERIES.you }} />
              </span>
              <span className="col-span-2 flex items-baseline justify-end gap-2 sm:col-span-1 sm:block sm:text-right">
                <span className={`font-mono text-[12px] font-semibold tabular-nums ${TONE_TEXT[r.tone]}`}>{signed(r.delta)} rd</span>
                <span className="text-[12px] text-v2-ink3 sm:mt-0.5 sm:block">{r.note}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-white/[0.06] pt-4 text-[14px] leading-[1.55] text-v2-ink2" aria-live="polite">
        {hovered
          ? `${hovered.name}: you at ${hovered.you.toFixed(1)}, the room at ${hovered.field.toFixed(1)}` +
            (hovered.cliff === null ? ', and the startable tier never emptied.' : `, the tier empties at ${hovered.cliff.toFixed(1)}.`)
          : report.fieldNote}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 04 — what these mocks can prove
// ---------------------------------------------------------------------------

function cellClass(n) {
  if (n === 0) return 'bg-white/[0.02] text-v2-ink3 ring-white/[0.06]'
  if (n >= 3) return 'bg-v2-cyan/[0.2] text-v2-ink ring-v2-cyan/50'
  return 'bg-v2-cyan/[0.07] text-v2-ink ring-v2-cyan/25'
}

export function ViewTrust({ report, onRun, roomActive }) {
  const cov = report.coverage
  const sample = report.sample
  const bad = sample.tone === 'bad'
  return (
    <div>
      <p className="max-w-[70ch] text-[14px] leading-[1.55] text-v2-ink2">
        {report.mocks} mocks is not {report.mocks} data points. {cov.sampled} of {cov.total} seat-and-format cells
        have any data at all, and what repeats between your own drafts costs some of the rest.
      </p>

      <div className="mt-5">
        <Kicker>Mocks per seat and format</Kicker>
        {/* Scrolls sideways rather than shrinking its cells: the count IS the
            cell, and a 20px square with a digit in it is neither of the two
            legal answers to an overflow. */}
        <div className="mt-2.5 overflow-x-auto pb-1">
          {/* Divs rather than a <table>: style.css's bare `table`/`th` rules
              reach into React and drew a white frame and a header fill here.
              role="table" keeps it readable as a grid to assistive tech. */}
          <div role="table" aria-label="Mocks per seat and format" className="inline-flex min-w-max flex-col gap-1">
            <div role="row" className="flex gap-1">
              <span role="columnheader" className="w-[104px] shrink-0"><span className="sr-only">Format</span></span>
              {Array.from({ length: cov.seats }, (_, i) => (
                <span key={i} role="columnheader" className="w-10 shrink-0 text-center font-mono text-[10px] text-v2-ink3">{i + 1}</span>
              ))}
            </div>
            {cov.rows.map((row) => (
              <div key={row.key} role="row" className="flex items-center gap-1">
                <span role="rowheader" className="w-[104px] shrink-0 truncate pr-2 text-[12px] font-medium text-v2-ink">{row.format}</span>
                {row.counts.map((n, ci) => (
                  <span
                    key={ci}
                    role="cell"
                    title={`${row.format} · seat ${ci + 1} · ${n === 0 ? 'no mocks' : `${n} mock${n > 1 ? 's' : ''}`}${row.teams[ci] && row.teams[ci].length ? ` · ${row.teams[ci].join('/')}-team` : ''}`}
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-[8px] font-mono text-[12px] font-semibold tabular-nums ring-1 ring-inset ${cellClass(n)}`}
                  >
                    {n === 0 ? '·' : n}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[12px] leading-[1.5] text-v2-ink3">
          Empty cells are guesses, not reads. A seat you have never drafted from tells you nothing about drafting from it.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0">
          <Kicker>{report.experiments.length === 1 ? 'One mock' : 'Mocks'} that would tighten the read</Kicker>
          <ul className="mt-2.5 space-y-2">
            {report.experiments.map((e) => (
              <li key={e.key}>
                <button
                  type="button"
                  onClick={() => onRun(e.scoring, e.seat)}
                  disabled={roomActive}
                  className={`w-full rounded-[12px] bg-v2-inset p-3.5 text-left ring-1 ring-inset ring-white/[0.07] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:ring-white/[0.16] ${focusRing} disabled:cursor-not-allowed disabled:hover:translate-y-0`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-semibold text-v2-ink">{e.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-v2-cyan">{e.tag}</span>
                  </span>
                  <span className="mt-1 block text-[12px] leading-[1.5] text-v2-ink2">{e.note}</span>
                  {/* What the press does, beside what the card advises: the
                      title prescribes "three mocks" and the button starts one. */}
                  <span className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-v2-ink">
                    {roomActive ? 'Not available in a room' : e.runLabel}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={`rounded-[12px] p-4 ring-1 ring-inset ${bad ? 'bg-v2-loss/[0.06] ring-v2-loss/30' : 'bg-v2-cyan/[0.05] ring-v2-cyan/25'}`}>
          <Kicker tone={bad ? 'text-v2-loss' : 'text-v2-cyan'}>Sample correlation</Kicker>
          <p className="mt-2 text-[14px] leading-[1.5] text-v2-ink">{sample.line}</p>
          <p className="mt-2 text-[12px] leading-[1.5] text-v2-ink2">{sample.sub}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`About ${Math.round(sample.effective)} effective drafts of ${sample.mocks}`}>
            <span className="block h-full rounded-full" style={{ width: `${Math.round((sample.effective / sample.mocks) * 100)}%`, background: bad ? SERIES.cost : SERIES.you }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The sidebar — the costliest habit, the two behind it, how rosters fail
// ---------------------------------------------------------------------------

/* The habit card is a raised panel with a caution rule, where production's is
   a light gold card. v2 has one ground family and no light surface, and the
   thing the card is for — "this is the one to fix" — is carried by its
   position at the top of the column and its warn rule, not by a colour
   change of the whole surface. Its launch is the same runNext() the rail's
   card uses, drawn quieter so the page keeps one volt button. */
export function Sidebar({ report, roomActive, onRun, onOpenHabit }) {
  const [top, ...rest] = report.habits
  const next = rest.slice(0, 2)
  const run = report.runNext
  return (
    <aside className="flex w-full min-w-0 shrink-0 flex-col gap-3 xl:w-[300px]" aria-label="Your habits">
      {top && (
        <div className="relative overflow-hidden rounded-[16px] bg-v2-raised p-5 ring-1 ring-inset ring-v2-warn/35">
          <span className="absolute inset-y-0 left-0 w-[3px] bg-v2-warn" aria-hidden="true" />
          <Kicker tone="text-v2-warn">Costliest habit · {top.frequency}</Kicker>
          <p className="mt-2 font-telemetry text-[28px] font-bold uppercase italic leading-[0.95] text-v2-ink">{top.title}</p>
          <p className="mt-2.5 text-[13px] leading-[1.55] text-v2-ink2">{top.evidence}</p>
          <dl className="mt-3.5 grid grid-cols-2 gap-2">
            <div className="rounded-[10px] bg-black/25 px-3 py-2 ring-1 ring-inset ring-white/[0.06]">
              <dt><Kicker>Cost</Kicker></dt>
              <dd className="mt-1 font-telemetry text-[24px] font-bold leading-none tabular-nums text-v2-loss">−{Math.round(top.costPoints)} pts</dd>
            </div>
            <div className="rounded-[10px] bg-black/25 px-3 py-2 ring-1 ring-inset ring-white/[0.06]">
              <dt><Kicker>Win %</Kicker></dt>
              <dd className={`mt-1 font-telemetry text-[24px] font-bold leading-none tabular-nums ${top.winPct < 0 ? 'text-v2-loss' : 'text-v2-ink'}`}>{signed(top.winPct)}</dd>
            </div>
          </dl>
          {run && (
            <button
              type="button"
              onClick={() => onRun(run.scoring, run.seat)}
              disabled={roomActive}
              className={`mt-3.5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[11px] bg-v2-ink px-4 text-[13px] font-semibold text-v2-ground transition-transform hover:-translate-y-px ${focusRing} disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-v2-ink3 disabled:hover:translate-y-0`}
            >
              {roomActive ? 'Not available in a room' : run.label}
            </button>
          )}
        </div>
      )}

      {next.length > 0 && (
        <div className="rounded-[16px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07]">
          <Kicker>Other habits worth fixing</Kicker>
          <ul className="mt-2">
            {next.map((h) => (
              <li key={h.pos}>
                <button type="button" onClick={onOpenHabit} className={`w-full border-t border-white/[0.06] py-2.5 text-left first:border-t-0 ${focusRing}`}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[14px] font-semibold text-v2-ink">{h.short}</span>
                    <span className="shrink-0 font-mono text-[12px] tabular-nums text-v2-loss">−{Math.round(h.costPoints)} pts</span>
                  </span>
                  <span className="mt-1 block text-[12px] leading-[1.5] text-v2-ink2">{h.evidence}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-[16px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07]">
        <Kicker>How these rosters fail</Kicker>
        <ul className="mt-2">
          {report.failures.map((f) => (
            <li key={f.key} className="flex items-start gap-3 border-t border-white/[0.06] py-2.5 first:border-t-0">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_MARK[f.tone] }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-v2-ink">{f.title}</span>
                <span className="mt-0.5 block text-[12px] leading-[1.5] text-v2-ink3">{f.note}</span>
              </span>
              <span className={`shrink-0 font-mono text-[13px] font-semibold tabular-nums ${f.tone === 'bad' ? 'text-v2-loss' : f.tone === 'warn' ? 'text-v2-warn' : 'text-v2-ink'}`}>{f.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
