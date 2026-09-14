import { useState } from 'react'
import { buildDemoData } from '../../myleague/demoData.js'
import { LINE as PLATFORM_LINE } from '../../shell/leaguePlatforms.js'
import { Headline, Icon, Label, PosTag, Sheet, Skeleton, ValueBar, cx, useEngineData , TOUCH } from '../ui.jsx'
import { ConnectCall, KpiGrid, SampleTag, Verdict } from './parts.jsx'
import { LIFT } from '../motion.jsx'

/* League before a real one is connected — guest and Free alike.

   Production's own demo (myleague/demoData.js), not a second one: the
   players are real names off tonight's board at fixed offsets, and every
   league-shaped figure — the record, the calls, the deltas, the habit — is
   invented and tagged SAMPLE on the sheet that carries it, as well as in
   the banner. A demo that says so is a demonstration; one that does not is
   a fabrication. Links go to v3's own tools rather than the live rooms. */

function toV3(href) {
  if (!href) return '#/'
  if (href === '#/rooms/draft') return '#/draft'
  if (href === '#/rooms/strategy') return '#/calls/lineup'
  if (href === '#/rooms/waiver') return '#/calls/wire'
  if (href === '#/rooms/trade') return '#/calls/trade'
  return '#/'
}
const SLUG_TO = { waiver: '#/calls/wire', strategy: '#/calls/lineup', trade: '#/calls/trade' }

function readDemo(engine) {
  const board = engine.board()
  if (!board || !board.length) return null
  return buildDemoData(board)
}

/* Signals that agree, as dots — never a bare percentage, which looks like a
   confidence and carries no sample. */
function Dots({ c }) {
  if (!c) return null
  return (
    <span className="inline-flex items-center gap-2 font-figure text-[12px] text-v3-ink2">
      <span className="inline-flex gap-1" aria-hidden="true">
        {Array.from({ length: c.signals }).map((_, i) => (
          <span key={i} className={cx('h-2 w-2 rounded-full', i < c.agree ? 'bg-v3-ink' : 'border border-v3-ink3')} />
        ))}
      </span>
      {c.agree} of {c.signals} agree{c.error ? ` · ${c.error}` : ''}{c.sample ? ` · ${c.sample}` : ''}
    </span>
  )
}

function WeekCell({ w, on, onSelect }) {
  const cls = cx(
    'relative inline-flex min-h-[44px] min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[4px] px-2 font-figure text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors',
    on ? 'bg-v3-band text-white' : w.disabled ? 'text-v3-ink3' : 'text-v3-ink hover:bg-v3-paper',
  )
  const mark = w.mark ? <span className={cx('text-[12px] leading-none', on ? 'text-white' : w.mark === 'bad' ? 'text-v3-cost' : 'text-v3-gain')} aria-label={w.mark === 'bad' ? 'had a bad call' : 'all good calls'}>{w.mark === 'bad' ? '✕' : '✓'}</span> : null
  if (w.disabled) return <span className={cls}>{w.label}{mark}</span>
  return <button type="button" aria-pressed={on} onClick={() => onSelect(w.key)} className={cx(cls, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call')}>{w.label}{mark}</button>
}

export default function LeagueDemo() {
  const data = useEngineData(readDemo)
  const [week, setWeek] = useState('6')
  if (!data) return <Sheet band={false} className="mt-10"><Skeleton lines={6} /></Sheet>

  const decisions = data.decisionsByWeek[week] || []
  const weekLabel = week === 'draft' ? 'Draft' : `Week ${week}`
  const move = data.move
  const rows = (move && move.gap && move.gap.rows) || []
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), move && move.gap && move.gap.marker ? move.gap.marker.at : 0, 1)

  return (
    <div className="mt-10 grid gap-8">
      <div className="flex flex-col gap-5 rounded-[6px] border border-v3-rule bg-v3-sheet p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><SampleTag /><Label>Demo league</Label></div>
          <p className="mt-2 max-w-[64ch] text-[16px] leading-[1.55] text-v3-ink">
            {data.leagueName}, {data.meta}. The players are tonight&apos;s real board; the record, the calls and every delta are invented to show the page working.
          </p>
          <p className="mt-1.5 font-figure text-[12px] uppercase tracking-[0.08em] text-v3-ink3">{PLATFORM_LINE} · read-only, Juke never edits your league</p>
        </div>
        <ConnectCall primary className="shrink-0" label="Connect a real league" />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <Label>Sample team</Label>
          <Headline as="h2" size="section" className="mt-1">{data.teamName}</Headline>
        </div>
        <p className="font-figure text-[14px] text-v3-ink2">{data.leagueName} · {data.record} · {data.standing}</p>
      </div>

      <KpiGrid
        items={data.kpis.map((k) => ({
          label: k.label,
          value: k.value,
          tag: <SampleTag />,
          delta: k.delta ? <span className={cx('font-figure text-[14px] font-semibold', k.deltaSign === 'cost' ? 'text-v3-cost' : 'text-v3-gain')}>{k.deltaSign === 'cost' ? '−' : '+'}{k.delta}</span> : null,
          note: k.note,
        }))}
      />

      <Sheet code="Week by week" aside="Sample" bodyClass="p-3 sm:p-4">
        <nav aria-label="Sample weeks" className="overflow-x-auto">
          <div className="flex min-w-max gap-1">
            {data.weeks.map((w) => <WeekCell key={w.key} w={w} on={week === w.key} onSelect={setWeek} />)}
          </div>
        </nav>
        <div className="mt-3 border-t border-v3-rule px-1 pt-3">
          <Label>{weekLabel} · calls logged</Label>
          {decisions.length ? (
            <ul className="mt-2 grid">
              {decisions.map((d, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-v3-rule py-2.5 text-[15px] last:border-b-0">
                  <span className="min-w-0 text-v3-ink">{d.said} <span className="text-v3-ink3">→</span> {d.did}</span>
                  <Verdict verdict={d.verdict} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[15px] text-v3-ink2">Nothing logged for {weekLabel.toLowerCase()}.</p>
          )}
        </div>
      </Sheet>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4">
          {move ? (
            <Sheet code={`The move · ${move.room}`} aside="Sample">
              <div className="flex items-start gap-3">
                {move.pos ? <PosTag pos={move.pos} className="mt-1.5" /> : null}
                <Headline as="h3" size="block" className="text-[24px]">{move.title}</Headline>
              </div>
              <div className="mt-3"><Dots c={move.confidence} /></div>
              {rows.length ? (
                <div className="mt-5 rounded-[6px] bg-v3-paper p-4">
                  <Label>The gap{move.gap.unit ? `, ${move.gap.unit}` : ''}</Label>
                  <div className="mt-3 grid gap-2.5">
                    {rows.map((r) => (
                      <div key={r.label} className="grid grid-cols-[88px_minmax(0,1fr)_48px] items-center gap-3">
                        <span className="truncate text-[14px] text-v3-ink2">{r.label}</span>
                        <ValueBar value={r.value} max={max} tone={r.sign === 'cost' ? 'cost' : 'gain'} />
                        <span className="text-right font-figure text-[14px] font-bold text-v3-ink">{r.value > 0 ? '+' : ''}{r.value}</span>
                      </div>
                    ))}
                  </div>
                  {move.gap.marker ? <p className="mt-2 text-[13px] text-v3-ink3">{move.gap.marker.label}: {move.gap.marker.at} {move.gap.unit}</p> : null}
                </div>
              ) : null}
              <a href={SLUG_TO[move.slug] || '#/'} className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-[6px] border border-v3-rule px-5 text-[15px] font-semibold text-v3-ink hover:border-v3-ink3 hover:bg-v3-paper">
                Open the tool <Icon name="arrow" className="h-4 w-4" />
              </a>
            </Sheet>
          ) : null}
          {data.secondary.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.secondary.map((it) => (
                <a key={it.title} href={SLUG_TO[it.slug] || '#/'} className={cx('group block rounded-[6px] border border-v3-rule bg-v3-sheet p-4 hover:border-v3-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call', LIFT)}>
                  <span className="flex items-center justify-between gap-2"><Label>{it.room}</Label><SampleTag /></span>
                  <span className="mt-2 block text-[15px] font-semibold leading-snug text-v3-ink">{it.title}</span>
                  <span className="mt-2"><Dots c={it.confidence} /></span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div className="grid gap-4">
          {data.habit ? (
            <Sheet code="Costing you most" aside="Sample">
              <Headline as="h3" size="block">{data.habit.title}</Headline>
              <p className="mt-3 flex flex-wrap items-baseline gap-x-3 font-figure text-[26px] font-bold leading-none">
                <span className="text-v3-cost">{data.habit.cost}</span>
                {data.habit.gain ? <span className="text-v3-gain">{data.habit.gain}</span> : null}
              </p>
              <p className="mt-3 text-[15px] leading-[1.55] text-v3-ink2">{data.habit.body}</p>
              <a href={toV3(data.habit.action.href)} className={cx(TOUCH, 'mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink')}>
                Open the lineup tool <Icon name="arrow" className="h-3.5 w-3.5" />
              </a>
            </Sheet>
          ) : null}
          {data.runNext ? (
            <Sheet code="Run this next" aside="Sample">
              <Headline as="h3" size="block">{data.runNext.title}</Headline>
              <p className="mt-2 text-[15px] leading-[1.55] text-v3-ink2">{data.runNext.body}</p>
              <a href={toV3(data.runNext.action.href)} className={cx(TOUCH, 'mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink')}>
                Set up a mock <Icon name="arrow" className="h-3.5 w-3.5" />
              </a>
            </Sheet>
          ) : null}
        </div>
      </div>
    </div>
  )
}
