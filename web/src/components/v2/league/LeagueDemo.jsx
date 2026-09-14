import { useState } from 'react'
import { buildDemoData } from '../../myleague/demoData.js'
import { LINE as PLATFORM_LINE } from '../../shell/leaguePlatforms.js'
import { useSignedIn } from '../../../hooks/useAuthState.js'
import { Arrow, Kicker, PosChip, Skeleton, useV2Data } from '../v2ui.jsx'
import { CARD, ConnectButton, KpiTile, STRONG_BTN, WELL, verdictTone } from './parts.jsx'
import { WeekStrip } from './WeekPanels.jsx'
import { verdictFor } from '../../ledger/verdicts.js'

/* My League before a real one is connected — guest and Free alike.

   Production's demo (myleague/demoData.js), not a second one: the players
   are real names off tonight's board at fixed offsets, and every
   league-shaped figure — the record, the confidence, the deltas, the habit
   — is invented and labelled SAMPLE on the card that carries it, as well
   as in the banner. A demo that says so is a demonstration; one that does
   not is a fabrication. Links go to the v2 rooms rather than the live
   ones. */

const SAMPLE = 'Sample'

/* The demo's hrefs are the live routes; a v2 page links inside v2. */
function toV2(href) {
  if (!href) return '#/v2'
  if (href === '#/rooms/draft') return '#/v2/draft'
  return href.replace('#/rooms/', '#/v2/rooms/')
}

function readDemo(engine) {
  const board = engine.board()
  if (!board || !board.length) return null
  return buildDemoData(board)
}

function Dots({ agree, signals }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${agree} of ${signals} signals agree`}>
      {Array.from({ length: signals }).map((_, i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${i < agree ? 'bg-v2-ink' : 'ring-1 ring-inset ring-white/[0.3]'}`} aria-hidden="true" />
      ))}
    </span>
  )
}

function Confidence({ c }) {
  if (!c) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums text-v2-ink2">
      <Dots agree={c.agree} signals={c.signals} />
      <span>{c.agree} of {c.signals} agree</span>
      {c.error ? <span className="text-v2-ink3">{c.error}</span> : null}
      {c.sample ? <span className="text-v2-ink3">{c.sample}</span> : null}
    </div>
  )
}

function MoveCard({ move }) {
  const rows = (move.gap && move.gap.rows) || []
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), move.gap && move.gap.marker ? Math.abs(move.gap.marker.at) : 0, 1)
  return (
    <article className={`${CARD} relative overflow-hidden p-5 sm:p-6`}>
      <span className="absolute inset-y-0 left-0 w-[3px] bg-white/[0.35]" aria-hidden="true" />
      <div className="flex items-center justify-between gap-3">
        <Kicker tone="text-v2-ink2">The move · {move.room}</Kicker>
        <SampleTag />
      </div>
      <div className="mt-3 flex items-start gap-3">
        {move.pos ? <PosChip pos={move.pos} className="mt-1.5" /> : null}
        <h2 className="font-telemetry text-[clamp(1.9rem,3.4vw,2.6rem)] font-bold uppercase italic leading-[0.95] text-v2-ink">{move.title}</h2>
      </div>
      <div className="mt-3"><Confidence c={move.confidence} /></div>

      {rows.length ? (
        <div className={`${WELL} mt-5 p-4`}>
          <Kicker>The gap{move.gap.unit ? `, ${move.gap.unit}` : ''}</Kicker>
          <div className="mt-4 space-y-3">
            {rows.map((r, i) => (
              <div key={r.label} className="grid grid-cols-[76px_minmax(0,1fr)_48px] items-center gap-3">
                <span className="truncate text-[13px] text-v2-ink2">{r.label}</span>
                <span className="relative h-2.5 rounded-full bg-white/[0.05]">
                  <span className={`absolute inset-y-0 left-0 rounded-full ${r.sign === 'cost' ? 'bg-v2-loss/80' : 'bg-v2-cyan/80'}`} style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} />
                  {i === 0 && move.gap.marker ? (
                    <span className="absolute -bottom-1 -top-1 w-px bg-v2-ink" style={{ left: `${(Math.abs(move.gap.marker.at) / max) * 100}%` }} aria-hidden="true" />
                  ) : null}
                </span>
                <span className="text-right font-mono text-[13px] font-semibold tabular-nums text-v2-ink">{r.value > 0 ? '+' : ''}{r.value}</span>
              </div>
            ))}
          </div>
          {move.gap.marker ? (
            <p className="mt-3 flex items-center gap-2 text-[12px] text-v2-ink3">
              <span className="h-3 w-px bg-v2-ink" aria-hidden="true" /> {move.gap.marker.label}, {move.gap.marker.at} {move.gap.unit}
            </p>
          ) : null}
        </div>
      ) : null}

      {move.ctaLabel ? (
        <a href={toV2(`#/rooms/${move.slug}`)} className={`${STRONG_BTN} mt-5`}>
          {move.ctaLabel} <Arrow />
        </a>
      ) : null}
    </article>
  )
}

function SampleTag() {
  return (
    <span className="shrink-0 rounded-[5px] bg-v2-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-v2-warn ring-1 ring-inset ring-v2-warn/30">
      {SAMPLE}
    </span>
  )
}

export default function LeagueDemo() {
  const data = useV2Data(readDemo)
  const signedIn = useSignedIn()
  const [week, setWeek] = useState('6')

  if (!data) {
    return <div className={`${CARD} mt-10 p-6`}><Skeleton lines={6} /></div>
  }

  const weekDecisions = data.decisionsByWeek[week] || []
  const weekLabel = week === 'draft' ? 'Draft' : `Week ${week}`

  return (
    <div className="mt-8 space-y-5">
      <div className="flex flex-col gap-4 rounded-[18px] bg-v2-warn/[0.05] p-5 ring-1 ring-inset ring-v2-warn/25 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-v2-warn">
            <span className="h-1.5 w-1.5 rounded-full bg-v2-warn" aria-hidden="true" /> Demo league · sample data
          </span>
          <p className="mt-2 max-w-[62ch] text-[15px] leading-[1.55] text-v2-ink">
            {data.leagueName}, {data.meta}. The players are tonight&apos;s real board; the record, the calls and
            every delta are invented to show the screen working.
          </p>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-v2-ink3">
            {PLATFORM_LINE} · read-only, Juke never edits your league
          </p>
        </div>
        <ConnectButton variant="volt" label="Connect a real league" signedOutLabel="Sign up & connect" className="shrink-0">
          {signedIn ? <>Connect a real league <Arrow /></> : <>Sign up &amp; connect <Arrow /></>}
        </ConnectButton>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <Kicker>Sample team</Kicker>
          <p className="mt-1 truncate font-telemetry text-[30px] font-bold uppercase italic leading-none text-v2-ink">{data.teamName}</p>
        </div>
        <p className="font-mono text-[12px] tabular-nums text-v2-ink2">{data.leagueName} · {data.record} · {data.standing}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.kpis.map((k) => {
          const d = k.delta ? `${k.deltaSign === 'cost' ? '−' : '+'}${k.delta}` : null
          const tone = k.deltaSign === 'cost' ? 'text-v2-loss' : 'text-v2-volt'
          return <KpiTile key={k.label} label={k.label} value={k.value} delta={d} deltaTone={tone} note={k.note} tag={SAMPLE} />
        })}
      </div>

      <WeekStrip weeks={data.weeks} selected={week} onSelect={setWeek} label="Sample weeks" />

      {/* One column on a phone, and the ORDER changes with it rather than
          just the width: the habit that keeps costing belongs directly under
          the move, which is where production's own phone layout puts it. The
          two column wrappers are `display: contents` below lg, so their
          children join one flex column and take the order given here. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="contents lg:block lg:space-y-4">
          {data.move ? <div className="order-1"><MoveCard move={data.move} /></div> : null}
          {data.secondary.length ? (
            <div className="order-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.secondary.map((it) => (
                <a
                  key={it.title}
                  href={toV2(`#/rooms/${it.slug}`)}
                  className={`${CARD} group block p-4 transition-colors hover:ring-white/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <Kicker>{it.room}</Kicker>
                    {it.confidence ? <Dots agree={it.confidence.agree} signals={it.confidence.signals} /> : null}
                  </span>
                  <span className="mt-2 block text-[15px] font-semibold leading-snug text-v2-ink">{it.title}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-[12px] text-v2-ink2 group-hover:text-v2-ink">
                    Open the {it.room} Room <Arrow className="h-3.5 w-3.5" />
                  </span>
                </a>
              ))}
            </div>
          ) : null}

          <div className={`${CARD} order-4 p-4 sm:p-5`}>
            <div className="flex items-center justify-between gap-2">
              <Kicker tone="text-v2-ink2">{weekLabel} · graded calls</Kicker>
              <SampleTag />
            </div>
            {weekDecisions.length ? (
              <ul className="mt-3 divide-y divide-white/[0.05]">
                {weekDecisions.map((d, i) => {
                  const v = verdictFor(d.verdict)
                  return (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                      <span className="min-w-0 text-v2-ink">{d.said} <span className="text-v2-ink3">→</span> {d.did}</span>
                      <span className={`font-mono text-[12px] font-semibold uppercase tracking-[0.08em] ${verdictTone(d.verdict)}`}>{v.glyph} {v.label}</span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-3 text-[14px] text-v2-ink3">Nothing graded for {weekLabel.toLowerCase()}.</p>
            )}
          </div>
        </div>

        <div className="contents lg:block lg:space-y-4">
          {data.habit ? (
            <article className={`${CARD} order-2 p-5`}>
              <div className="flex items-center justify-between gap-2">
                <Kicker tone="text-v2-warn">Costing you most</Kicker>
                <SampleTag />
              </div>
              <h3 className="mt-2 font-telemetry text-[28px] font-bold uppercase italic leading-[0.95] text-v2-ink">{data.habit.title}</h3>
              <p className="mt-3 flex flex-wrap items-baseline gap-x-3 font-telemetry text-[32px] font-bold italic leading-none tabular-nums">
                <span className="text-v2-loss">{data.habit.cost}</span>
                {data.habit.gain ? <span className="text-v2-volt">{data.habit.gain}</span> : null}
              </p>
              <p className="mt-3 text-[14px] leading-[1.55] text-v2-ink2">{data.habit.body}</p>
              <a href={toV2(data.habit.action.href)} className={`${STRONG_BTN} mt-4 w-full`}>{data.habit.action.label}</a>
            </article>
          ) : null}
          {data.runNext ? (
            <article className={`${CARD} order-5 p-5`}>
              <div className="flex items-center justify-between gap-2">
                <Kicker>Run this next</Kicker>
                <SampleTag />
              </div>
              <h3 className="mt-2 font-telemetry text-[26px] font-bold uppercase italic leading-[0.95] text-v2-ink">{data.runNext.title}</h3>
              <p className="mt-2 text-[14px] leading-[1.55] text-v2-ink2">{data.runNext.body}</p>
              <a
                href={toV2(data.runNext.action.href)}
                className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[11px] text-[14px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.14] transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
              >
                {data.runNext.action.label} <Arrow />
              </a>
            </article>
          ) : null}
        </div>
      </div>
    </div>
  )
}
