import { useState } from 'react'
import { ordinal, readGrade } from './v2data.js'
import { Kicker, Skeleton, Tween, useV2Data } from './v2ui.jsx'

/* Section 3 — the grade, as an instrument you can drive.

   ---- The threshold is the room's median, and that is not a styling choice ----

   The brief asks for meters that show "optimal versus deficient". Three of
   the four components are scaled 0–100 WITHIN the room (scaleAcross() is
   min-max), so any fixed line — 50, 70 — would be a claim about quality
   the number cannot make: somebody always scores 0 and somebody always
   scores 100, whatever happened. The one honest divider is the middle of
   the room, so that is where the colour changes. Roster construction is
   the absolute score among the four and is labelled as such.

   ---- The letter sits beside its rank, never beside a score out of 100 ----

   CLAUDE.md records measuring the letter against the school reading of a
   number beside it: 0 of 10 agreed. So the letter is paired with its
   finishing position and the weighted sum is shown only as the
   reconciliation the four parts visibly add up to. */

const PARTS = [
  { key: 'starters', label: 'Starter strength', note: 'points over par for the seat', tone: '#22D3EE' },
  { key: 'value', label: 'Draft value', note: 'picks taken after the board had them', tone: '#8B5CF6' },
  { key: 'build', label: 'Roster construction', note: 'absolute — starts at 100, named deductions', tone: '#94A3B8', absolute: true },
  { key: 'byes', label: 'Bye week safety', note: 'starters idle in the same week', tone: '#60A5FA' },
]

function Meter({ part, value, median, weight }) {
  const above = value >= median
  const diff = Math.abs(value - median)
  return (
    <div className="rounded-[14px] bg-v2-inset p-4 ring-1 ring-inset ring-white/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[14px] font-semibold text-v2-ink">{part.label}</span>
          <span className="block truncate text-[12px] text-v2-ink3">{part.note}</span>
        </div>
        <span className="shrink-0 rounded-[6px] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-v2-ink2 ring-1 ring-inset ring-white/[0.08]">
          ×{Math.round(weight * 100)}%
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <Tween value={value} className="font-telemetry text-[40px] font-bold leading-none text-v2-ink" />
        <span className={`font-mono text-[11px] tabular-nums ${above ? 'text-v2-volt' : 'text-v2-warn'}`}>
          {diff === 0 ? 'at the room median' : `${above ? '▲' : '▼'} ${diff} ${above ? 'above' : 'below'} median`}
        </span>
      </div>

      {/* The dual track: warn to the left of the median, volt to the right,
          both at low opacity so the marker is what the eye lands on. */}
      <div className="relative mt-3 h-3 rounded-full" role="img" aria-label={`${part.label} ${value} of 100; room median ${median}`}>
        <span className="absolute inset-y-0 left-0 rounded-l-full bg-v2-warn/[0.18]" style={{ width: `${median}%` }} />
        <span className="absolute inset-y-0 right-0 rounded-r-full bg-v2-volt/[0.16]" style={{ width: `${100 - median}%` }} />
        <span className="absolute -top-1 bottom-[-4px] w-px bg-white/40" style={{ left: `${median}%` }} aria-hidden="true" />
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-v2-ground transition-[left] duration-500 ease-out"
          style={{ left: `${Math.max(2, Math.min(98, value))}%`, background: above ? '#00FF66' : '#FFB547' }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">
        <span>{part.absolute ? '0' : 'room low'}</span>
        <span>median {median}</span>
        <span>{part.absolute ? '100' : 'room high'}</span>
      </div>
    </div>
  )
}

export default function GradeInstrument() {
  const data = useV2Data(readGrade)
  // By seat index, not by finishing position: a graded room can tie (two
  // teams at 3rd is real), so a rank is not an identity.
  const [pick, setPick] = useState(null)

  if (!data) {
    return <div className="rounded-[20px] bg-v2-panel p-6 ring-1 ring-inset ring-white/[0.07]"><Skeleton lines={7} /></div>
  }

  const current = pick === null ? Math.ceil(data.teamsRanked.length / 2) - 1 : pick
  const team = data.teamsRanked[current] || data.teamsRanked[0]
  const contrib = PARTS.map((p) => ({ ...p, amount: team.components[p.key] * data.weights[p.key] }))
  const total = contrib.reduce((s, c) => s + c.amount, 0)

  return (
    <div className="overflow-hidden rounded-[20px] bg-v2-panel ring-1 ring-inset ring-white/[0.07]">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="relative flex flex-col gap-5 border-b border-white/[0.06] p-6 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between">
            <Kicker>Draft grade</Kicker>
            <span className="rounded-[6px] bg-v2-cyan/10 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-v2-cyan ring-1 ring-inset ring-v2-cyan/25">
              {data.teams}-team · {data.rounds}-round sim
            </span>
          </div>

          <div className="relative">
            {/* The settings as a watermark behind the letter, so the grade is
                never read without the room it was earned in. */}
            <span
              className="pointer-events-none absolute -top-2 right-0 select-none font-telemetry text-[88px] font-extrabold italic leading-none text-white/[0.035]"
              aria-hidden="true"
            >
              {data.teams}×{data.rounds}
            </span>
            <span className="relative block font-telemetry text-[140px] font-extrabold italic leading-[0.8] text-v2-ink">
              {team.grade}
            </span>
            <span className="relative mt-3 block font-mono text-[14px] tabular-nums text-v2-ink">
              {ordinal(team.rank)} of {data.teams}
            </span>
            <span className="relative mt-1 block text-[12px] text-v2-ink3">
              {data.format ? `${data.format} · ` : ''}every seat drafting to the same rule
            </span>
          </div>

          <div>
            <Kicker>Pick a finishing position</Kicker>
            <div role="group" aria-label="Finishing position" className="mt-2 grid grid-cols-5 gap-1.5">
              {data.teamsRanked.map((t, i) => {
                const on = i === current
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPick(i)}
                    className={`min-h-[40px] rounded-[8px] font-mono text-[12px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt ${
                      on ? 'bg-v2-volt font-semibold text-v2-voltInk' : 'bg-white/[0.03] text-v2-ink2 ring-1 ring-inset ring-white/[0.07] hover:text-v2-ink'
                    }`}
                  >
                    {t.rank}
                    <span className={`block text-[10px] ${on ? '' : 'text-v2-ink3'}`}>{t.grade}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5 p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PARTS.map((p) => (
              <Meter key={p.key} part={p} value={team.components[p.key]} median={data.median[p.key]} weight={data.weights[p.key]} />
            ))}
          </div>

          <div className="rounded-[14px] bg-v2-inset p-4 ring-1 ring-inset ring-white/[0.06]">
            <div className="flex items-baseline justify-between gap-3">
              <Kicker>How the four add up</Kicker>
              <span className="text-[13px] text-v2-ink2">
                Weighted sum <Tween value={total} digits={1} className="ml-1 font-mono text-[18px] font-semibold text-v2-ink" />
              </span>
            </div>
            <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-white/[0.04]" role="img" aria-label="Contribution of each component to the weighted sum">
              {contrib.map((c) => (
                <span
                  key={c.key}
                  className="h-full transition-[width] duration-500 ease-out first:rounded-l-full"
                  style={{ width: `${c.amount}%`, background: c.tone }}
                  title={`${c.label}: ${c.amount.toFixed(1)}`}
                />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              {contrib.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-[12px] text-v2-ink2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: c.tone }} aria-hidden="true" />
                  <span className="truncate">{c.label}</span>
                  <span className="ml-auto font-mono tabular-nums text-v2-ink">{c.amount.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>

          <details className="group text-[13px] text-v2-ink2 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-v2-ink2 hover:text-v2-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt">
              <span className="grid h-5 w-5 place-items-center rounded-full ring-1 ring-inset ring-white/[0.15] transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              Why 0 and 100 are the room, not a verdict
            </summary>
            <p className="mt-2 max-w-[70ch] leading-[1.6]">
              Starter strength, draft value and bye safety are positions inside this one simulated room —
              the best seat is 100 and the worst is 0 whatever actually happened. Roster construction is the
              one absolute score. A weight is how much a part counts, not how much it separates the room; the
              letter is your finishing position, which is why somebody always gets an A+.
            </p>
          </details>
        </div>
      </div>
    </div>
  )
}
