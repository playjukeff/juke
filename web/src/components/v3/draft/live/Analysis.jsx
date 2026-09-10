import { readAnalysis } from '../../../v2/cockpit/cockpitData.js'
import { Headline, Label, PosTag, Sheet, cx, ordinal } from '../../ui.jsx'
import { FOCUS } from '../kit.jsx'

/* The grade so far, while the draft is still running.

   Every number is engine.analyseDraft() — the exact grade the report, the
   locker and the share card print — read fresh through cockpitData's
   readAnalysis(). The letter sits beside its finishing position and nowhere
   near a score out of 100; the weighted sum appears only as the
   reconciliation the four parts visibly add up to, which is the one place
   that number is allowed (CLAUDE.md, "A letter grade may not stand next to a
   score out of a hundred").

   A part whose raw figure is still tied across the room draws a dash rather
   than "+0 vs median": scaleAcross() maps a tie to 50 for everybody, and a
   marker there would assert a comparison that does not exist yet. */

const clamp = (v) => Math.max(0, Math.min(100, v))

function Band({ part }) {
  if (!part.measurable) {
    return (
      <div className="rounded-[4px] border border-v3-rule bg-v3-sheet p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-bold text-v3-ink">{part.label}</span>
          <span className="font-figure text-[12px] text-v3-ink3" title="Not enough of the room has drafted yet to compare this.">— vs room</span>
        </div>
        <p className="mt-1 text-[13px] text-v3-ink2">{part.detail}</p>
        <div className="mt-2.5 h-2.5 rounded-full bg-v3-well" />
      </div>
    )
  }
  const diff = Math.round(part.pct - part.median)
  return (
    <div className="rounded-[4px] border border-v3-rule bg-v3-sheet p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-bold text-v3-ink">{part.label}</span>
        <span className="flex items-baseline gap-2">
          <span className="font-figure text-[11px] text-v3-ink3">×{Math.round(part.weight * 100)}% · {part.scaled ? 'vs room' : 'own scale'}</span>
          <span className="font-figure text-[22px] font-bold leading-none tabular-nums text-v3-ink">{part.pct.toFixed(1)}</span>
        </span>
      </div>
      <p className="mt-0.5 text-[13px] text-v3-ink2">{part.detail}</p>
      {/* The bar is the part; the two ticks are the room's median and best.
          Overflow hidden so a marker at 100 cannot hang past the box
          (CLAUDE.md, "A component band's marker hangs 5px past its own box"). */}
      <div className="relative mt-2.5 h-3 overflow-hidden rounded-full bg-v3-well" role="img" aria-label={`${part.label} ${Math.round(part.pct)}; room median ${Math.round(part.median)}; room best ${Math.round(part.best)}`}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-v3-ink2" style={{ width: `${clamp(part.pct)}%` }} />
        <span className="absolute inset-y-0 w-[2px] bg-v3-ink" style={{ left: `calc(${clamp(part.median)}% - 1px)` }} aria-hidden="true" />
        <span className="absolute inset-y-0 w-px bg-v3-ink3" style={{ left: `calc(${clamp(part.best)}% - 1px)` }} aria-hidden="true" />
      </div>
      <div className="mt-1.5 flex justify-between gap-2 font-figure text-[12px] tabular-nums">
        <span className="text-v3-ink3">median {Math.round(part.median)} · best {Math.round(part.best)}</span>
        <span className={diff < 0 ? 'font-bold text-v3-cost' : diff > 0 ? 'font-bold text-v3-gain' : 'text-v3-ink3'}>{diff === 0 ? 'at the median' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} vs median`}</span>
      </div>
    </div>
  )
}

export default function Analysis({ engine, slot, onSlot, phone }) {
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
        <div className={cx('mx-auto max-w-[640px]', phone ? 'p-4' : 'p-8')}>
          <Label>Grade · after round 1</Label>
          <Headline as="h2" size="section" className="mt-2">Nothing to grade yet</Headline>
          <p className="mt-2 text-[15px] leading-[1.55] text-v3-ink2">
            Every part of the grade is measured against the rest of the room, so it needs one full round on the board. {a.made} of {a.teams} picks in — then it updates after every pick.
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-v3-well">
            <div className="h-full rounded-full bg-v3-ink transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.max(2, (a.made / a.teams) * 100)}%` }} />
          </div>
          <Sheet code="What gets graded" aside="the weights" className="mt-6" bodyClass="p-0">
            <ul className="divide-y divide-v3-rule">
              {rows.map(([label, weight, detail]) => (
                <li key={label} className="flex gap-3 px-4 py-3">
                  <span className="w-11 shrink-0 font-figure text-[15px] font-bold tabular-nums text-v3-ink">{weight != null ? `${Math.round(weight * 100)}%` : '—'}</span>
                  <span><span className="block text-[14px] font-bold text-v3-ink">{label}</span><span className="block text-[13px] text-v3-ink2">{detail}</span></span>
                </li>
              ))}
            </ul>
          </Sheet>
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
      <div className={cx('mx-auto flex max-w-[1120px] flex-col gap-4', phone ? 'p-3' : 'p-5')}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Label>{a.over ? 'Final grade' : 'Grade so far'} · {who}</Label>
            <div className="mt-1 flex items-end gap-4">
              <span className="font-sheet text-[80px] font-black leading-[0.82] tracking-[-0.04em] text-v3-ink">{a.grade}</span>
              <span className="pb-1 font-figure text-[16px] font-bold tabular-nums text-v3-ink">{ordinal(a.rank)} of {a.teams}</span>
            </div>
            <p className="mt-2 max-w-[62ch] text-[14px] text-v3-ink2">The letter is where this roster would finish in the room right now. It moves after every pick.</p>
          </div>
          <label>
            <span className="sr-only">Grade for</span>
            <select value={slot} onChange={(e) => onSlot(Number(e.target.value))} className={cx('h-11 rounded-[4px] border border-v3-rule bg-v3-sheet px-2.5 text-[16px] text-v3-ink sm:text-[14px]', FOCUS)}>
              {a.standings.slice().sort((x, y) => x.slot - y.slot).map((t) => <option key={t.slot} value={t.slot}>{t.slot === mySlot ? 'Your team' : t.name}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
              {a.parts.map((p) => <Band key={p.key} part={p} />)}
            </div>
            <Sheet code="How the four add up" aside={`weighted sum ${sum.toFixed(1)}`} bodyClass="p-4">
              <p className="break-words font-figure text-[13px] tabular-nums text-v3-ink">
                {contributions.map((c) => `${c.pct.toFixed(1)}×${Math.round(c.weight * 100)}%`).join(' + ')} = <span className="font-bold">{sum.toFixed(1)}</span>
              </p>
              <p className="mt-2 text-[13px] leading-[1.5] text-v3-ink2">
                A weight is how much a part counts, not how much it separates the room. Roster construction is its own 0–100 and varies less than the three scaled against the room, so it moves the order less than its weight suggests.
              </p>
            </Sheet>
            {mine && a.fix && (
              <Sheet code="Fix this first" aside="your costliest part, weighted" bodyClass="p-4">
                <p className="text-[15px] font-bold text-v3-ink">{a.fix.part.label}</p>
                <p className="mt-1 text-[13px] text-v3-ink2">At {Math.round(a.fix.part.pct)} it is {Math.round(a.fix.part.median - a.fix.part.pct)} below the room median, at {Math.round(a.fix.part.weight * 100)}% weight.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[4px] bg-v3-paper px-3 py-2.5">
                  <PosTag pos={a.fix.upgrade.player.pos} />
                  <span className="text-[14px] font-bold text-v3-ink">{a.fix.upgrade.player.name}</span>
                  <span className="font-figure text-[12px] text-v3-ink3">{a.fix.upgrade.player.team}{a.fix.upgrade.player.bye ? ` · bye ${a.fix.upgrade.player.bye}` : ''}</span>
                  <span className="ml-auto font-figure text-[14px] font-bold tabular-nums text-v3-gain">{Math.round(a.fix.part.pct)} → {a.fix.upgrade.after}</span>
                </div>
              </Sheet>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {(a.bargain || a.reach) && (
              <Sheet code="Value callouts" bodyClass="p-4">
                <dl className="space-y-2 text-[14px]">
                  {a.bargain && <div className="flex items-baseline justify-between gap-2"><dt className="text-v3-ink2">Best value</dt><dd className="min-w-0 truncate text-right font-semibold text-v3-ink">{a.bargain.name}{a.bargain.gap > 0 && <span className="ml-1.5 font-figure text-[12px] text-v3-gain">+{a.bargain.gap} late</span>}</dd></div>}
                  {a.reach && <div className="flex items-baseline justify-between gap-2"><dt className="text-v3-ink2">Biggest reach</dt><dd className="min-w-0 truncate text-right font-semibold text-v3-ink">{a.reach.name}<span className="ml-1.5 font-figure text-[12px] text-v3-cost">{Math.abs(a.reach.gap)} early</span></dd></div>}
                </dl>
              </Sheet>
            )}
            <Sheet code="The room, as it stands" aside="best to worst" bodyClass="p-2">
              <ol>
                {a.standings.map((t) => (
                  <li key={t.slot}>
                    <button type="button" onClick={() => onSlot(t.slot)} aria-current={t.slot === slot ? 'true' : undefined} className={cx('flex min-h-[44px] w-full items-center gap-2.5 rounded-[4px] px-2 text-left text-[14px]', FOCUS, t.slot === slot ? 'bg-v3-band text-white' : 'hover:bg-v3-paper')}>
                      <span className={cx('w-6 shrink-0 text-right font-figure text-[12px] tabular-nums', t.slot === slot ? 'text-v3-bandInk' : 'text-v3-ink3')}>{t.rank}</span>
                      <span className={cx('min-w-0 flex-1 truncate', t.slot === mySlot ? 'font-bold' : '', t.slot === slot ? 'text-white' : 'text-v3-ink')}>{t.slot === mySlot ? 'Your team' : t.name}</span>
                      <span className={cx('w-9 shrink-0 text-center font-sheet text-[18px] font-black', t.slot === slot ? 'text-white' : 'text-v3-ink')}>{t.grade}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </Sheet>
            <details className="group rounded-[6px] border border-v3-rule bg-v3-sheet [&_summary::-webkit-details-marker]:hidden">
              <summary className={cx('flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 px-4 text-[14px] font-bold text-v3-ink', FOCUS)}>
                How the grade is built
                <span className="font-figure text-[16px] text-v3-ink2 transition-transform group-open:rotate-45 motion-reduce:transition-none" aria-hidden="true">+</span>
              </summary>
              <p className="px-4 pb-4 text-[13px] leading-[1.6] text-v3-ink2">
                Starter strength ({Math.round(a.weights.starters * 100)}%) is projected points over replacement — {a.replacementText} in a league that starts {a.lineupText} — scored against par for your seat. Draft value ({Math.round(a.weights.value * 100)}%) is how far each pick fell past the board, kickers and defenses aside. Roster construction ({Math.round(a.weights.build * 100)}%) docks empty starting slots and missing cover. Bye safety ({Math.round(a.weights.byes * 100)}%) charges every week with more than two starters idle. Three of the four are scaled against this room, so 0 and 100 are its worst and best.
              </p>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}
