import { useEffect, useMemo, useRef } from 'react'
import { verdictFor } from '../../ledger/verdicts.js'
import { seasonSummary } from '../../../lib/schedule.js'
import { Arrow, Kicker, VoltButton } from '../v2ui.jsx'
import { CARD, TEXT_BTN, VerdictChip, WELL, verdictTone } from './parts.jsx'
import { ordinal } from '../v2data.js'

/* The season's calendar and what each past week holds.

   ---- The strip ----

   DRAFT, then every week, the current one marked NOW. A week that has not
   happened is a <span>, never a disabled <button> — a control that cannot
   act must not be offered. Marks come from the ledger's weekMark(): an
   ungraded week carries none, one bad call marks a week bad. */
export function WeekStrip({ weeks, selected, onSelect, label = 'Weeks' }) {
  /* On a phone the current week sits past the edge of a strip that starts
     at DRAFT, so a reader would not see which week is now. The strip
     scrolls itself (never the page) to keep the selected cell in view. */
  const navRef = useRef(null)
  useEffect(() => {
    const nav = navRef.current
    const cell = nav && nav.querySelector('[data-week-on="true"]')
    if (!nav || !cell) return
    const n = nav.getBoundingClientRect()
    const c = cell.getBoundingClientRect()
    if (c.left < n.left || c.right > n.right) nav.scrollLeft += c.left - n.left - (n.width - c.width) / 2
  }, [selected])
  return (
    <nav ref={navRef} aria-label={label} className="overflow-x-auto">
      <ol className="flex min-w-max items-stretch gap-1 border-b border-white/[0.07]">
        {weeks.map((w) => {
          if (w.divider) {
            return (
              <li key={w.key} className="flex items-center px-1.5" aria-hidden="true">
                <span className="rounded-[5px] bg-v2-cyan/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-v2-cyan">{w.label}</span>
              </li>
            )
          }
          const on = selected === w.key
          const clickable = !!onSelect && !w.disabled
          const mark = w.mark ? verdictFor(w.mark === 'bad' ? 'bad' : 'good') : null
          const inner = (
            <>
              <span className="tabular-nums">{w.label}</span>
              {mark ? (
                <span className={`ml-1 ${verdictTone(w.mark === 'bad' ? 'bad' : 'good')}`} aria-label={w.mark === 'bad' ? 'had a bad call' : 'all graded calls good'}>
                  {mark.glyph}
                </span>
              ) : null}
            </>
          )
          const cls = `relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center whitespace-nowrap px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
            on ? 'text-v2-ink' : w.disabled ? 'text-v2-ink3' : 'text-v2-ink2 hover:text-v2-ink'
          }`
          const bar = on ? <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-v2-volt" aria-hidden="true" /> : null
          return (
            <li key={w.key} className="flex" data-week-on={on ? 'true' : undefined}>
              {clickable ? (
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSelect(w.key)}
                  className={`${cls} rounded-t-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v2-volt`}
                >
                  {inner}{bar}
                </button>
              ) : (
                <span className={cls} aria-current={on ? 'step' : undefined}>{inner}{bar}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* One past week: the result, then the calls made in it.

   Both scores have to be real numbers before this is a scoreline — a bye
   has no opponent and a Sleeper league has no schedule, and a 0-0 line
   would imply a game nobody played. Two bars on ONE max, and the margin
   in words, because a nine-point game on a 105-point week is honestly a
   short difference. The winner is ESPN's stated result, never a
   comparison of the two numbers. */
export function PastWeek({ weekKey, rows, game, opponent, onBack }) {
  const isDraft = weekKey === 'draft'
  const good = rows.filter((r) => r.verdict === 'good').length
  const bad = rows.filter((r) => r.verdict === 'bad').length
  const ungraded = rows.length - good - bad
  const summary = rows.length
    ? [good ? `${good} good` : null, bad ? `${bad} bad` : null, ungraded ? `${ungraded} not yet graded` : null].filter(Boolean).join(' · ')
    : 'No decisions recorded'

  const scored = !isDraft && game && typeof game.points === 'number' && typeof game.opponentPoints === 'number'
  const max = scored ? Math.max(game.points, game.opponentPoints, 1) : 1
  const margin = scored ? game.points - game.opponentPoints : null
  const them = (opponent && opponent.teamName) || 'Your opponent'
  const tone = scored ? (game.result === 'W' ? 'text-v2-volt' : game.result === 'L' ? 'text-v2-loss' : 'text-v2-ink') : ''

  return (
    <section aria-labelledby="v2-pastweek" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Kicker tone="text-v2-ink2">{isDraft ? 'Draft' : `Week ${weekKey}`}</Kicker>
          <h2 id="v2-pastweek" className="mt-1 font-telemetry text-[34px] font-bold uppercase italic leading-none text-v2-ink">
            {isDraft ? 'Your draft is in the archive' : summary}
          </h2>
        </div>
        <button type="button" onClick={onBack} className={`${TEXT_BTN} ring-1 ring-inset ring-white/[0.12]`}>
          <Arrow className="h-3.5 w-3.5 rotate-180" /> Back to this week
        </button>
      </div>

      {scored ? (
        <div className={`${CARD} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Kicker>{game.playoff ? 'Playoff week' : 'The result'}</Kicker>
            <span className={`font-telemetry text-[40px] font-bold italic leading-none tabular-nums ${tone}`}>
              {game.result === 'W' ? `Won by ${Math.abs(margin).toFixed(1)}` : game.result === 'L' ? `Lost by ${Math.abs(margin).toFixed(1)}` : `Tied at ${game.points.toFixed(1)}`}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {[
              { name: 'You', value: game.points, fill: game.result === 'L' ? 'bg-v2-loss/80' : 'bg-v2-volt/80' },
              { name: them, value: game.opponentPoints, fill: 'bg-v2-ink3/70' },
            ].map((r) => (
              <div key={r.name} className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_56px] items-center gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_64px]">
                <span className="truncate text-[14px] text-v2-ink">{r.name}</span>
                <span className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <span className={`absolute inset-y-0 left-0 rounded-full ${r.fill}`} style={{ width: `${(r.value / max) * 100}%` }} />
                </span>
                <span className="text-right font-mono text-[14px] font-semibold tabular-nums text-v2-ink">{r.value.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isDraft ? (
        <div className={`${CARD} p-5 text-[14px] leading-[1.6] text-v2-ink2 sm:p-6`}>
          Draft picks are kept with the draft that made them, not in the decision ledger — every board you
          have run, with its grade and its report, is in{' '}
          <a href="#/v2/drafts" className="font-semibold text-v2-ink underline decoration-white/30 underline-offset-2 hover:decoration-white">your locker</a>.
        </div>
      ) : rows.length ? (
        <ul className={`${CARD} divide-y divide-white/[0.05] px-4 sm:px-5`}>
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3.5">
              <Kicker className="w-full sm:w-[90px]">{(d.room || '—').toUpperCase()}</Kicker>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-v2-ink">{d.said || '—'}</span>
              <span className="min-w-0 truncate text-[13px] text-v2-ink2">{d.did || '—'}</span>
              <VerdictChip verdict={d.verdict} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={`${CARD} p-6 text-center text-[14px] text-v2-ink3`}>Nothing was recorded in this week.</div>
      )}
    </section>
  )
}

/* The season, closed out — drawn only when seasonPhase() says complete,
   and only on a league whose schedule can say so. Every number is exact
   off the schedule (seasonSummary()); the one worth the arithmetic is how
   many losses came in a week you still beat the league's median. No
   "costliest habit": that needs graded decisions nothing writes yet. */
export function SeasonEnd({ league, snapshot, onWeeks }) {
  const summary = useMemo(() => seasonSummary(snapshot && snapshot.schedule, league && league.ownerId), [snapshot, league])
  if (!summary) return null
  const record = `${summary.won}-${summary.lost}${summary.tied ? '-' + summary.tied : ''}`
  const diff = Math.round((summary.pointsFor - summary.pointsAgainst) * 10) / 10
  const drawn = summary.unlucky > 0 && summary.unlucky >= summary.outplayed
  const title = drawn
    ? `${summary.unlucky} of your ${summary.lost} losses outscored the league`
    : summary.lost > 0
      ? `${summary.outplayed} of your ${summary.lost} losses were under the league’s own week`
      : `${record}, and nothing to answer for`

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" data-season-end>
      <div className={`${CARD} p-5 sm:p-6`}>
        <Kicker tone="text-v2-warn">The season, closed out</Kicker>
        <h2 className="mt-2 font-telemetry text-[32px] font-bold uppercase italic leading-[0.95] text-v2-ink">{title}</h2>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-telemetry text-[48px] font-bold leading-none tabular-nums text-v2-ink">{record}</span>
          <span className={`font-mono text-[14px] font-semibold tabular-nums ${diff < 0 ? 'text-v2-loss' : 'text-v2-volt'}`}>
            {diff < 0 ? '−' : '+'}{Math.abs(diff).toFixed(1)} pts for vs against
          </span>
        </div>
        <p className="mt-3 max-w-[60ch] text-[14px] leading-[1.6] text-v2-ink2">
          {summary.pointsFor.toFixed(1)} for and {summary.pointsAgainst.toFixed(1)} against, over {summary.played} weeks.
          {summary.narrowest ? ` The closest was week ${summary.narrowest.week}, by ${summary.narrowest.margin.toFixed(1)}.` : ''}
        </p>
        {onWeeks ? (
          <button type="button" onClick={onWeeks} className={`${TEXT_BTN} mt-3 -ml-2`}>
            Read the week-by-week <Arrow className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className={`${CARD} flex flex-col justify-between gap-4 p-5 sm:p-6`}>
        <div>
          <Kicker>Run this next</Kicker>
          <h3 className="mt-2 font-telemetry text-[28px] font-bold uppercase italic leading-[0.95] text-v2-ink">
            Mock a {snapshot.totalTeams}-team board before next year
          </h3>
          <p className="mt-2 text-[14px] leading-[1.55] text-v2-ink2">
            The draft is the one decision a whole season runs on, and the only one you can practice.
          </p>
        </div>
        <VoltButton href="#/v2/draft" size="md">Open the Draft Room <Arrow /></VoltButton>
      </div>
    </section>
  )
}

/* The league's own draft, graded by the engine that grades a mock —
   leagueDraftReport() swaps two pointers and mutates nothing, so reading it
   while a mock runs cannot disturb the mock. Absent (no capture, no lineup,
   or a draft type whose par the engine does not model) draws nothing. */
export function DraftReport({ league, snapshot, ready }) {
  const report = useMemo(() => {
    const engine = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!ready || !engine || !engine.leagueDraftReport || !snapshot || !snapshot.draft) return null
    try {
      return engine.leagueDraftReport({
        draft: snapshot.draft,
        lineup: snapshot.lineup,
        rules: snapshot.rules,
        teams: snapshot.teams,
        ownerId: league && league.ownerId,
      })
    } catch {
      return null
    }
  }, [snapshot, league, ready])

  if (!report || report.unsupported) return null
  const seats = [...report.seats].sort((a, b) => (a.rank || 99) - (b.rank || 99))
  const mine = seats.find((s) => s.mine) || null

  return (
    <section aria-labelledby="v2-draftreport" className={`${CARD} overflow-hidden`}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] p-4 sm:p-5">
        <div>
          <Kicker>{report.counted} picks · {report.shape.teams} teams · {report.shape.rounds} rounds</Kicker>
          <h2 id="v2-draftreport" className="mt-1 font-telemetry text-[26px] font-bold uppercase italic leading-none text-v2-ink">Your league&apos;s draft, graded</h2>
        </div>
        {mine ? (
          <div className="flex items-baseline gap-2">
            <span className="font-telemetry text-[48px] font-extrabold italic leading-none text-v2-ink">{mine.grade}</span>
            {mine.rank ? <span className="font-mono text-[13px] tabular-nums text-v2-ink2">{ordinal(mine.rank)} of {seats.length}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse bg-v2-panel text-left">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['Finish', 'Team', 'Grade'].map((h, i) => (
                <th key={h} scope="col" className={`px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-v2-ink3 sm:px-5 ${i === 2 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seats.map((s) => (
              <tr key={s.teamId} className={`border-b border-white/[0.04] ${s.mine ? 'bg-v2-cyan/[0.05]' : ''}`}>
                <td className="px-4 py-2.5 font-mono text-[13px] tabular-nums text-v2-ink2 sm:px-5">{s.rank ? `${ordinal(s.rank)} of ${seats.length}` : '—'}</td>
                <td className="px-4 py-2.5 sm:px-5">
                  <span className="block truncate text-[14px] text-v2-ink">{s.name}{s.mine ? ' · You' : ''}</span>
                  {s.manager ? <span className="block truncate text-[12px] text-v2-ink3">{s.manager}</span> : null}
                </td>
                <td className="px-4 py-2.5 text-right font-telemetry text-[22px] font-bold italic text-v2-ink sm:px-5">{s.grade || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`${WELL} m-4 px-3 py-2.5 text-[12px] leading-[1.5] text-v2-ink3 sm:m-5`}>
        {report.scored === 'league'
          ? 'Graded under your league’s own scoring and lineup.'
          : 'Graded on default scoring — your league’s rules could not be read.'}
        {report.unplaceable
          ? ` ${report.unplaceable} pick${report.unplaceable === 1 ? '' : 's'} could not be priced and ${report.unplaceable === 1 ? 'is' : 'are'} left out.`
          : ''}
      </p>
    </section>
  )
}
