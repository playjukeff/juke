import { Kicker, PosChip } from '../v2ui.jsx'
import { ordinal, readAnalysis } from './cockpitData.js'
import { FOCUS, Panel } from './parts.jsx'

/* The grade so far, while the draft is still running.

   Every number is engine.analyseDraft() — the exact grade the report, the
   locker and the share card print — read fresh. The letter sits beside its
   finishing position and nowhere near a score out of 100 (CLAUDE.md, "A
   letter grade may not stand next to a score out of a hundred"); the
   weighted sum appears only as the reconciliation the four bars visibly add
   up to, which is the one place that number is allowed.

   A component whose raw figure is still tied across the room draws a dash,
   not "+0 vs median": scaleAcross() maps a tie to 50 for everybody, and a
   marker there would assert a comparison that does not exist yet. */

function Band({ part }) {
  const clamp = (v) => Math.max(0, Math.min(100, v))
  if (!part.measurable) {
    return (
      <div className="rounded-[12px] bg-v2-inset p-3.5 ring-1 ring-inset ring-white/[0.06]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold text-v2-ink">{part.label}</span>
          <span className="font-mono text-[11px] text-v2-ink3" title="Not enough of the room has drafted yet to compare this.">— vs room</span>
        </div>
        <p className="mt-1 text-[12px] text-v2-ink3">{part.detail}</p>
        <div className="mt-2.5 h-2 rounded-full bg-white/[0.05]" />
      </div>
    )
  }
  const diff = Math.round(part.pct - part.median)
  const below = diff < 0
  return (
    <div className="rounded-[12px] bg-v2-inset p-3.5 ring-1 ring-inset ring-white/[0.06]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-v2-ink">{part.label}</span>
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] text-v2-ink3">×{Math.round(part.weight * 100)}% · {part.scaled ? 'vs room' : 'own scale'}</span>
          <span className="font-telemetry text-[24px] font-bold leading-none tabular-nums text-v2-ink">{part.pct.toFixed(1)}</span>
        </span>
      </div>
      <p className="mt-0.5 text-[12px] text-v2-ink2">{part.detail}</p>
      <div className="relative mt-2.5 h-3 overflow-hidden rounded-full bg-white/[0.05]" role="img" aria-label={`${part.label} ${Math.round(part.pct)}; room median ${Math.round(part.median)}; room best ${Math.round(part.best)}`}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-v2-ink2/40" style={{ width: `${clamp(part.pct)}%` }} />
        <span className="absolute inset-y-0 w-px bg-white/50" style={{ left: `${clamp(part.median)}%` }} aria-hidden="true" />
        <span className="absolute inset-y-0 w-px bg-white/20" style={{ left: `${clamp(part.best)}%` }} aria-hidden="true" />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums">
        <span className="text-v2-ink3">median {Math.round(part.median)} · best {Math.round(part.best)}</span>
        <span className={below ? 'text-v2-loss' : diff > 0 ? 'text-v2-volt' : 'text-v2-ink3'}>{diff === 0 ? 'at the median' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} vs median`}</span>
      </div>
    </div>
  )
}

export default function AnalysisPanel({ engine, slot, onSlot, phone }) {
  const mySlot = engine.mySlot()
  const a = readAnalysis(engine, slot, slot === mySlot)

  if (!a.ready) {
    const w = a.weights || {}
    const rows = [
      ['Starter strength', w.starters, 'What your lineup projects, against par for your seat'],
      ['Draft value', w.value, 'Where you took them against where the board had them'],
      ['Roster construction', w.build, 'Empty starting slots, and cover at running back and receiver'],
      ['Bye week safety', w.byes, 'Starters idle in the same week — counted squared'],
    ]
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto max-w-[620px] ${phone ? 'p-4' : 'p-8'}`}>
          <Kicker tone="text-v2-ink2">Grade · after round 1</Kicker>
          <h2 className="mt-2 font-telemetry text-[34px] font-extrabold uppercase italic leading-[0.9] text-v2-ink">Nothing to grade yet</h2>
          <p className="mt-2 text-[14px] leading-[1.55] text-v2-ink2">
            Every part of the grade is measured against the rest of the room, so it needs one full round on the
            board. {a.made} of {a.teams} picks in — then it updates after every pick.
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-v2-cyan transition-[width] duration-300" style={{ width: `${Math.max(2, (a.made / a.teams) * 100)}%` }} />
          </div>
          <Kicker className="mt-7 block">What gets graded</Kicker>
          <ul className="mt-2 divide-y divide-white/[0.06]">
            {rows.map(([label, weight, detail]) => (
              <li key={label} className="flex gap-3 py-2.5">
                <span className="w-10 shrink-0 font-mono text-[13px] font-semibold tabular-nums text-v2-ink">{weight != null ? `${Math.round(weight * 100)}%` : '—'}</span>
                <span>
                  <span className="block text-[13px] font-semibold text-v2-ink">{label}</span>
                  <span className="block text-[12px] text-v2-ink2">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  const contributions = a.parts.map((p) => ({ ...p, amount: Number(p.pct.toFixed(1)) * p.weight }))
  const sum = contributions.reduce((s, c) => s + c.amount, 0)
  const mine = slot === mySlot
  const who = mine ? 'Your team' : engine.teamLabel(slot)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto flex max-w-[1120px] flex-col gap-4 ${phone ? 'p-3' : 'p-5'}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Kicker tone="text-v2-ink2">{a.over ? 'Final grade' : 'Grade so far'} · {who}</Kicker>
            <div className="mt-1 flex items-end gap-4">
              <span className="font-telemetry text-[88px] font-extrabold italic leading-[0.8] text-v2-ink">{a.grade}</span>
              <span className="pb-1 font-mono text-[14px] tabular-nums text-v2-ink">{ordinal(a.rank)} of {a.teams}</span>
            </div>
            <p className="mt-2 max-w-[62ch] text-[13px] text-v2-ink2">
              The letter is where this roster would finish in the room right now. It moves after every pick.
            </p>
          </div>
          <label>
            <span className="sr-only">Grade for</span>
            <select value={slot} onChange={(e) => onSlot(Number(e.target.value))} className={`h-10 rounded-[9px] bg-v2-inset px-2.5 text-[16px] text-v2-ink ring-1 ring-inset ring-white/[0.1] sm:text-[13px] ${FOCUS}`}>
              {a.standings.slice().sort((x, y) => x.slot - y.slot).map((t) => (
                <option key={t.slot} value={t.slot}>{t.slot === mySlot ? 'Your team' : t.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {a.parts.map((p) => <Band key={p.key} part={p} />)}
            </div>
            <Panel className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Kicker>How the four add up</Kicker>
                <span className="text-[13px] text-v2-ink2">Weighted sum <span className="ml-1 font-mono text-[16px] font-semibold tabular-nums text-v2-ink">{sum.toFixed(1)}</span></span>
              </div>
              <p className="mt-2 font-mono text-[11px] tabular-nums text-v2-ink3">
                {contributions.map((c) => `${c.pct.toFixed(1)}×${Math.round(c.weight * 100)}%`).join(' + ')} = {sum.toFixed(1)}
              </p>
              <p className="mt-2 text-[12px] leading-[1.5] text-v2-ink3">
                A weight is how much a part counts, not how much it separates the room. Roster construction is its own
                0–100 and varies less than the three scaled against the room, so it moves the order less than its weight suggests.
              </p>
            </Panel>
            {mine && a.fix && (
              <Panel className="p-4">
                <Kicker tone="text-v2-ink">Fix this first</Kicker>
                <p className="mt-1.5 text-[14px] font-semibold text-v2-ink">{a.fix.part.label} — your costliest part, weighted</p>
                <p className="mt-1 text-[12px] text-v2-ink2">
                  At {Math.round(a.fix.part.pct)} it is {Math.round(a.fix.part.median - a.fix.part.pct)} below the room median, at {Math.round(a.fix.part.weight * 100)}% weight.
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[10px] bg-v2-inset px-3 py-2 ring-1 ring-inset ring-white/[0.06]">
                  <PosChip pos={a.fix.upgrade.player.pos} />
                  <span className="text-[13px] font-semibold text-v2-ink">{a.fix.upgrade.player.name}</span>
                  <span className="font-mono text-[10px] text-v2-ink3">{a.fix.upgrade.player.team}{a.fix.upgrade.player.bye ? ` · bye ${a.fix.upgrade.player.bye}` : ''}</span>
                  <span className="ml-auto font-mono text-[13px] font-semibold tabular-nums text-v2-volt">{Math.round(a.fix.part.pct)} → {a.fix.upgrade.after}</span>
                </div>
              </Panel>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {(a.bargain || a.reach) && (
              <Panel className="p-4">
                <Kicker tone="text-v2-ink2">Value callouts</Kicker>
                <ul className="mt-2 space-y-1.5 text-[13px]">
                  {a.bargain && (
                    <li className="flex items-baseline justify-between gap-2"><span className="text-v2-ink2">Best value</span><span className="truncate text-v2-ink">{a.bargain.name}{a.bargain.gap > 0 && <span className="ml-1.5 font-mono text-[11px] text-v2-volt">+{a.bargain.gap} late</span>}</span></li>
                  )}
                  {a.reach && (
                    <li className="flex items-baseline justify-between gap-2"><span className="text-v2-ink2">Biggest reach</span><span className="truncate text-v2-ink">{a.reach.name}<span className="ml-1.5 font-mono text-[11px] text-v2-loss">{Math.abs(a.reach.gap)} early</span></span></li>
                  )}
                </ul>
              </Panel>
            )}
            <Panel className="p-4">
              <Kicker tone="text-v2-ink2">The room, as it stands</Kicker>
              <ol className="mt-2">
                {a.standings.map((t) => (
                  <li key={t.slot}>
                    <button
                      type="button"
                      onClick={() => onSlot(t.slot)}
                      aria-current={t.slot === slot ? 'true' : undefined}
                      className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] ${FOCUS} ${t.slot === slot ? 'bg-white/[0.06] ring-1 ring-inset ring-white/[0.1]' : 'hover:bg-white/[0.03]'}`}
                    >
                      <span className="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums text-v2-ink3">{t.rank}</span>
                      <span className={`min-w-0 flex-1 truncate ${t.slot === mySlot ? 'font-semibold text-v2-cyan' : 'text-v2-ink'}`}>{t.slot === mySlot ? 'Your team' : t.name}</span>
                      <span className="w-9 shrink-0 text-center font-telemetry text-[18px] font-bold italic text-v2-ink">{t.grade}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </Panel>
            <details className="group rounded-[12px] bg-v2-inset ring-1 ring-inset ring-white/[0.06] [&_summary::-webkit-details-marker]:hidden">
              <summary className={`flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-4 text-[13px] font-medium text-v2-ink ${FOCUS}`}>
                How the grade is built
                <span className="grid h-5 w-5 place-items-center rounded-full text-v2-ink2 ring-1 ring-inset ring-white/[0.15] transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="px-4 pb-4 text-[12px] leading-[1.6] text-v2-ink2">
                Starter strength ({Math.round(a.weights.starters * 100)}%) is projected points over replacement — {a.replacementText} in a
                league that starts {a.lineupText} — scored against par for your seat. Draft value ({Math.round(a.weights.value * 100)}%) is how far
                each pick fell past the board, kickers and defenses aside. Roster construction ({Math.round(a.weights.build * 100)}%) docks empty
                starting slots and missing cover. Bye safety ({Math.round(a.weights.byes * 100)}%) charges every week with more than two starters
                idle. Three of the four are scaled against this room, so 0 and 100 are its worst and best.
              </p>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}
