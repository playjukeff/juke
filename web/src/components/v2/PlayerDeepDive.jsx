import { useState } from 'react'
import { readDeepDive } from './v2data.js'
import { Kicker, PosChip, Segmented, Skeleton, Tween, posColor, useV2Data } from './v2ui.jsx'

/* Section 2 — one full-width player analytics container.

   The brief asks for three tracks: Projected Season, Replaceable Starter
   Delta and Value Over Replacement. The second and third are the same
   number under two names (the delta between a player and a replaceable
   starter IS value over replacement), and a panel that prints one number
   twice has told the reader it measured two things. So the three tracks
   are the three quantities that actually exist, drawn on one scale as a
   waterfall: what he projects, what any replaceable starter projects, and
   the gap between — which floats from the end of the second bar to the end
   of the first, so the arithmetic is visible rather than asserted. */

function Headshot({ src, name, pos }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')
  return (
    <span
      className="relative grid h-[88px] w-[88px] shrink-0 place-items-center overflow-hidden rounded-full bg-v2-raised"
      style={{ boxShadow: `0 0 0 2px ${posColor(pos)}55, 0 0 0 6px rgba(255,255,255,0.03)` }}
    >
      {!failed && src ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} loading="lazy" />
      ) : (
        <span className="font-telemetry text-[30px] font-bold text-v2-ink2">{initials}</span>
      )}
    </span>
  )
}

function Track({ label, sub, from = 0, to, max, tone, value, signed }) {
  const left = Math.max(0, (from / max) * 100)
  const width = Math.max(0.5, ((to - from) / max) * 100)
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[200px_minmax(0,1fr)_72px] sm:items-center sm:gap-4">
      <div>
        <span className="block text-[14px] font-medium text-v2-ink">{label}</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">{sub}</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-white/[0.05]">
        {/* Quarter ticks, so a bar can be read against something other
            than its neighbour. */}
        {[25, 50, 75].map((t) => (
          <span key={t} className="absolute inset-y-0 w-px bg-white/[0.06]" style={{ left: `${t}%` }} aria-hidden="true" />
        ))}
        <span
          className={`absolute inset-y-0 rounded-full transition-[left,width] duration-500 ease-out ${tone}`}
          style={{ left: `${left}%`, width: `${width}%` }}
        />
      </div>
      <Tween
        value={value}
        signed={signed}
        className={`text-left font-mono text-[18px] font-semibold sm:text-right ${signed ? 'text-v2-volt' : 'text-v2-ink'}`}
      />
    </div>
  )
}

function Ladder({ ladder, pos, currentId }) {
  const top = ladder[0] ? ladder[0].gap : 1
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Kicker>The ladder · {pos}1 to {pos}{ladder.length}</Kicker>
        <span className="text-[12px] text-v2-ink3">Ranks look evenly spaced. The points are not.</span>
      </div>
      <ol className="mt-3 space-y-1.5">
        {ladder.map((r, i) => {
          const step = i === 0 ? null : ladder[i - 1].gap - r.gap
          const me = r.id === currentId
          return (
            <li
              key={r.id}
              className={`grid grid-cols-[34px_minmax(0,1fr)_minmax(60px,40%)_44px_48px] items-center gap-2.5 rounded-[8px] px-2 py-1.5 ${me ? 'bg-white/[0.05] ring-1 ring-inset ring-white/[0.1]' : ''}`}
            >
              <span className="font-mono text-[11px] tabular-nums text-v2-ink3">{pos}{r.rank}</span>
              <span className={`truncate text-[13px] ${me ? 'font-semibold text-v2-ink' : 'text-v2-ink2'}`}>{r.name}</span>
              <span className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                <span
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.max(2, (Math.max(0, r.gap) / top) * 100)}%`, background: `${posColor(pos)}` , opacity: me ? 1 : 0.55 }}
                />
              </span>
              <span className="text-right font-mono text-[12px] tabular-nums text-v2-ink">+{r.gap}</span>
              <span className={`text-right font-mono text-[11px] tabular-nums ${step === null ? 'text-v2-ink3' : step >= 10 ? 'text-v2-loss' : 'text-v2-ink3'}`}>
                {step === null ? '—' : `−${step}`}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-[12px] leading-[1.5] text-v2-ink3">
        Right-hand column: points lost stepping down one rank. A step of ten or more is marked — that is
        where waiting a round costs you.
      </p>
    </div>
  )
}

export default function PlayerDeepDive() {
  const data = useV2Data(readDeepDive)
  const [pos, setPos] = useState(null)
  const active = pos || (data && data.order.includes('RB') ? 'RB' : data && data.order[0])
  const p = data && active ? data.players[active] : null

  return (
    <div className="overflow-hidden rounded-[20px] bg-v2-panel ring-1 ring-inset ring-white/[0.07]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <Kicker>Player analytics · the best at each position tonight</Kicker>
        {data && (
          <Segmented
            label="Position"
            size="sm"
            value={active}
            onChange={setPos}
            options={data.order.map((x) => ({ value: x, label: x }))}
          />
        )}
      </div>

      {!p ? (
        <div className="p-6"><Skeleton lines={6} /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          {/* Left: the profile badge */}
          <div className="relative border-b border-white/[0.06] p-6 lg:border-b-0 lg:border-r">
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{ background: `radial-gradient(80% 60% at 20% 10%, ${posColor(p.pos)}1f, transparent 70%)` }}
              aria-hidden="true"
            />
            <div className="relative flex items-center gap-4">
              <Headshot key={p.id} src={p.photo} name={p.name} pos={p.pos} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <PosChip pos={p.pos} />
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-v2-ink2">{p.team}</span>
                </div>
                <h3 className="mt-1.5 font-telemetry text-[30px] font-bold uppercase italic leading-[0.95] text-v2-ink">
                  {p.name}
                </h3>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3">
                  Market rank {p.pos}{p.marketRank}
                </span>
              </div>
            </div>

            <div className="relative mt-7 flex items-end gap-4">
              <span className="font-telemetry text-[120px] font-extrabold italic leading-[0.78] text-v2-ink tabular-nums">
                <Tween value={p.score} />
              </span>
              <div className="pb-2">
                <Kicker tone="text-v2-ink2">Juke score</Kicker>
                <span className="mt-1 block text-[15px] font-semibold text-v2-ink">{p.label}</span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">out of 100</span>
              </div>
            </div>
            <p className="relative mt-4 text-[13px] leading-[1.55] text-v2-ink2">
              100 is the most value on tonight&apos;s board. Every other score is a share of it — so this is
              a ranking against {p.boardSize} players, not a rating of one.
            </p>
          </div>

          {/* Right: the grading grid */}
          <div className="flex flex-col gap-7 p-6">
            <div className="space-y-5">
              <Track label="Projected season" sub={`${p.name.split(' ').slice(-1)[0]}, under your scoring`} to={p.proj} max={data.scaleMax} tone="bg-v2-ink/80" value={p.proj} />
              <Track label="A replaceable starter" sub={`${p.replacementRank} — the last one a league starts`} to={p.replacement} max={data.scaleMax} tone="bg-v2-ink3/70" value={p.replacement} />
              <Track label="Value over replacement" sub="What he adds that the waiver wire cannot" from={p.replacement} to={p.proj} max={data.scaleMax} tone="bg-v2-volt shadow-[0_0_14px_rgba(0,255,102,0.45)]" value={p.gap} signed />
            </div>

            <div className="h-px bg-white/[0.06]" />

            <Ladder ladder={p.ladder} pos={p.pos} currentId={p.id} />

            <details className="group rounded-[12px] bg-v2-inset ring-1 ring-inset ring-white/[0.07] [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14px] font-medium text-v2-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt">
                How the Juke score is built
                <span className="grid h-6 w-6 place-items-center rounded-full text-v2-ink2 ring-1 ring-inset ring-white/[0.12] transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <ol className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
                {[
                  ['01', 'Score the line', 'Every player’s projected stat line, priced under your league’s own rules — 49 of them, all editable.'],
                  ['02', 'Subtract a starter', `Take away what the ${p.replacementRank} projects: the last player at his position a league like yours actually starts.`],
                  ['03', 'Share of the best', 'Divide by the most value anyone has tonight. The leader is 100; kickers and defenses are withheld, because their order is no better than chance.'],
                ].map(([n, t, b]) => (
                  <li key={n} className="rounded-[10px] bg-white/[0.025] p-3">
                    <span className="font-mono text-[10px] text-v2-ink3">{n}</span>
                    <span className="mt-1 block text-[13px] font-semibold text-v2-ink">{t}</span>
                    <span className="mt-1 block text-[12px] leading-[1.5] text-v2-ink2">{b}</span>
                  </li>
                ))}
              </ol>
              <a href="/docs/draft-room-how-it-works.html#s07" className="block px-4 pb-4 text-[12px] font-medium text-v2-ink2 underline-offset-2 hover:text-v2-ink hover:underline">
                Read the full method
              </a>
            </details>
          </div>
        </div>
      )}
    </div>
  )
}
