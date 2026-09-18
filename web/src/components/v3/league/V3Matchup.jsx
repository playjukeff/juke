import { useEffect, useMemo, useRef, useState } from 'react'
import { retrySnapshot } from '../../../hooks/useLeague.js'
import { useLeagueFresh, useSnapshotFresh } from '../../v2/stores.js'
import { myTeam } from '../../rooms/waiverBoard.js'
import {
  benchRows, injurySeverity, leagueWeekPts, lineupRows, projectedTotal, projectionSource,
} from '../../rooms/strategyBoard.js'
import { matchupRead, teamWeek } from '../../../lib/matchup.js'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { sampleLeague } from '../calls/callData.js'
import {
  Fig, GoLink, Label, PageHead, PosTag, QuietButton, Sheet, Skeleton, cx, ordinal,
  useEngineData,
 HIT} from '../ui.jsx'
import { CountUp } from '../motion.jsx'
import { findTeam, recordText, standing, teamHref, usePricing } from './leagueData.js'
import { ConnectCall, CouldNotRead, InjuryChip, SampleTag, WinBar, pct } from './parts.jsx'
import {
  espnWeek, gameFor, matchupHref, phaseFor, readMatchupQuery, sameTeam, seasonShape, shortName,
  shortTeam, sleeperWeekView, alignLineups,
} from './matchupData.js'
import { retrySleeperWeeks, useSleeperWeeks } from './useSleeperWeeks.js'
import { retryCbsWeek, useCbsWeek } from './useCbsWeek.js'

/* #/league/matchup?week=N[&team=id] — one matchup, any week, either side.

   ---- Why it lives under League, and is one page ----

   v3 is organised by decision, and "who do I play, and how did it go" is not
   a call — nothing on it asks the reader to act. It is the league's own
   calendar read from one team's side, which is what League is (standings,
   the schedule, every team's roster). So the canonical page is a League
   sub-page with an address per week and per team, the way Sleeper and ESPN
   both give every matchup one. Now keeps the week's game as a card — the
   question a manager opens the app with — and every other place that names
   a week links here rather than drawing a second copy: Now's matchup card
   and its "next up" list, the lineup tool's matchup sheet, League's week
   panel, and every row of a team's schedule. One page per matchup, many
   doors, and no two of them can disagree because only this one draws it.

   ---- Three states, and what each is allowed to say ----

   PAST: the final score and the result as the platform states them. Per
   player, only where the platform published its OWN points for that week —
   Sleeper does, on /sleeper/matchups; ESPN's box score is not read (its
   applied points reconcile with Juke's only about four weeks in five, so
   CLAUDE.md declined the feed), and today's roster is not shown as if it
   were that week's lineup.
   THIS WEEK: both lineups as set, priced by leagueWeekPts() — the league's
   own projection first — with the win probability, might-not-play flags and
   locked players, exactly as Now and the lineup tool price them.
   AHEAD: the opponent, their record, and a projection that says it is built
   from today's rosters: each starter's season average under the league's
   scoring with that week's byes at zero. Never presented as the platform's
   number, because the platform has not published one.

   Every figure comes off the snapshot, /sleeper/matchups or the engine. A
   missing value is a dash. Per-week probabilities are never added up. */

const PHASE_WORD = { final: 'Final', live: 'This week', upcoming: 'Ahead' }

function useMatchupQuery() {
  const read = () => readMatchupQuery(typeof window !== 'undefined' ? window.location.hash : '')
  const [q, setQ] = useState(read)
  useEffect(() => {
    const on = () => setQ(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return q
}

/* ---------------------------------------------------------------------------
   The week strip.

   A row of links, one per week — a link rather than a button because every
   week is an address (deep link, Back, share). Past weeks carry the result,
   this week is marked, weeks ahead carry the opponent; a bye says so; the
   playoffs sit behind a divider. aria-current="page" on the week shown.

   Keyboard: one tab stop (the week shown), then the arrow keys, Home and
   End move along the strip and Enter opens a week — the roving pattern a
   tab strip uses, because eighteen tab stops in a row is a trap. */
function WeekStrip({ items, selected, label }) {
  const navRef = useRef(null)
  useEffect(() => {
    const nav = navRef.current
    const cell = nav && nav.querySelector('[aria-current="page"]')
    if (!nav || !cell) return
    const n = nav.getBoundingClientRect()
    const c = cell.getBoundingClientRect()
    if (c.left < n.left || c.right > n.right) nav.scrollLeft += c.left - n.left - (n.width - c.width) / 2
  }, [selected, items.length])
  const onKey = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    const links = [...navRef.current.querySelectorAll('a[data-week]')]
    if (!links.length) return
    e.preventDefault()
    const at = links.indexOf(document.activeElement)
    const from = at < 0 ? links.findIndex((l) => l.getAttribute('aria-current') === 'page') : at
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1
      : e.key === 'ArrowRight' ? Math.min(links.length - 1, from + 1) : Math.max(0, from - 1)
    links[next].focus()
  }
  return (
    <nav ref={navRef} aria-label={label} onKeyDown={onKey} className="overflow-x-auto">
      <ol className="flex min-w-max items-stretch gap-1 p-0.5">
        {items.map((w) => {
          if (w.divider) {
            return (
              <li key={w.key} className="flex items-center px-1" aria-hidden="true">
                <span className="rounded-[4px] bg-v3-well px-1.5 py-1 font-figure text-[12px] font-bold uppercase tracking-[0.12em] text-v3-ink2">Playoffs</span>
              </li>
            )
          }
          if (w.note) {
            return (
              <li key={w.key} className="flex min-h-[56px] max-w-[160px] items-center px-2 font-figure text-[12px] leading-tight text-v3-ink2">{w.note}</li>
            )
          }
          const on = w.week === selected
          const subTone = on ? 'text-white' : w.tone === 'W' ? 'text-v3-gain' : w.tone === 'L' ? 'text-v3-cost' : 'text-v3-ink2'
          return (
            <li key={w.key}>
              <a
                href={w.href}
                data-week={w.week}
                tabIndex={on ? 0 : -1}
                aria-current={on ? 'page' : undefined}
                aria-label={w.aria}
                className={cx(
                  'relative flex min-h-[56px] min-w-[64px] max-w-[104px] flex-col items-center justify-center gap-0.5 rounded-[4px] px-2 font-figure uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call',
                  on ? 'bg-v3-band text-white' : 'text-v3-ink hover:bg-v3-paper',
                  w.now && !on ? 'shadow-[inset_0_-3px_0_rgb(var(--v3-ink))]' : '',
                )}
              >
                <span className="relative text-[12px] font-semibold tracking-[0.06em]">W{w.week}{w.now && w.sub !== 'Now' ? <span className="ml-1">· now</span> : null}</span>
                <span className={cx('relative max-w-full truncate text-[12px] font-bold normal-case tracking-normal', subTone)}>{w.sub || '—'}</span>
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* The strip's cells, from one team's side. `weekView(w)` answers the week in
   the shared shape (null while a Sleeper week is still loading). */
function stripItems({ total, regular, current, focus, mine, weekView, tailNote }) {
  const out = []
  for (let w = 1; w <= total; w++) {
    if (regular && w === regular + 1) out.push({ key: 'po', divider: true })
    const v = weekView(w)
    const g = v ? gameFor(v, focus) : null
    let sub = ''
    let tone = null
    let aria = `Week ${w}`
    if (v && v.bracketPending) { sub = 'TBD'; aria += ', playoff bracket not set' }
    else if (g && g.bye) { sub = 'Bye'; aria += ', no game' }
    else if (g && g.result) {
      sub = g.result; tone = g.result
      aria += `, ${g.result === 'W' ? 'won' : g.result === 'L' ? 'lost' : 'tied'} against ${g.theirs.team ? g.theirs.team.teamName : 'an opponent'}`
    } else if (g && w === current) { sub = 'Now'; aria += `, this week, against ${g.theirs.team ? g.theirs.team.teamName : 'an opponent'}` }
    else if (g) { sub = g.theirs.team ? shortTeam(g.theirs.team.teamName) : '—'; aria += `, against ${g.theirs.team ? g.theirs.team.teamName : 'an opponent'}` }
    else if (w === current) sub = 'Now'
    if (w === current && !(g && !g.bye && !g.result)) aria += ', this week'
    out.push({ key: String(w), week: w, now: w === current, sub, tone, aria, href: matchupHref(w, focus, mine) })
  }
  if (tailNote) out.push({ key: 'tail', note: tailNote })
  return out
}

/* ---------------------------------------------------------------------------
   The two lineups, side by side: a table, because it is one — slot by slot,
   the reader's player on the left and the opponent's mirrored on the right,
   points meeting in the middle. */

function flagsOf(player, week, isCurrent) {
  if (!player) return {}
  const severity = injurySeverity(player.inj)
  const scored = typeof player.actualPts === 'number' && Number.isFinite(player.actualPts) ? player.actualPts : null
  return {
    severity,
    code: player.inj || null,
    bye: !!week && Number(player.bye) === Number(week),
    locked: isCurrent && player.locked === true,
    scored,
  }
}

function NameCell({ row, align, week, isCurrent }) {
  if (!row) return <td className="border-0 py-2" />
  const p = row.player
  const f = flagsOf(p, week, isCurrent)
  const right = align === 'right'
  return (
    <td className={cx('border-0 w-full max-w-0 py-2', right ? 'pl-2 pr-3 sm:pl-3 sm:pr-5' : 'pl-3 pr-2 sm:pl-5 sm:pr-3')}>
      <span className={cx('flex min-w-0 items-center gap-2', right && 'flex-row-reverse text-right')}>
        {p ? <PosTag pos={p.pos} className="hidden sm:inline-flex" /> : null}
        <span className="min-w-0">
          {p ? (
            <a href={`#/players/${encodeURIComponent(String(p.id))}`} className={cx(HIT, 'block truncate text-[15px] font-semibold text-v3-ink underline decoration-transparent underline-offset-4 hover:decoration-v3-ink focus-visible:decoration-v3-ink sm:text-[15px]')}>
              <span className="sm:hidden">{shortName(p)}</span><span className="hidden sm:inline">{p.name}</span>
            </a>
          ) : (
            <span className="block truncate text-[15px] text-v3-ink3">{row.empty ? 'Empty slot' : 'Not on Juke’s board'}</span>
          )}
          <span className={cx('mt-0.5 flex min-w-0 flex-wrap items-center gap-1 font-figure text-[12px] uppercase tracking-[0.06em] text-v3-ink3', right && 'justify-end')}>
            {p ? <span className="sm:hidden">{p.pos === 'DST' ? 'D/ST' : p.pos}</span> : null}
            {p && p.team ? <span>{p.team}</span> : null}
            {f.scored !== null ? <span className="text-v3-ink2">· already scored: {f.scored.toFixed(1)}</span> : f.locked ? <span className="text-v3-ink2">· started</span> : null}
            {f.bye ? <InjuryChip onBye /> : f.severity ? <InjuryChip severity={f.severity} code={f.code} /> : null}
          </span>
        </span>
      </span>
    </td>
  )
}

function PtsCell({ value, strong, align }) {
  return (
    <td className={cx('border-0 py-2 font-figure text-[15px] tabular-nums sm:text-[15px]', align === 'right' ? 'border-l border-v3-rule pl-2 text-left' : 'pr-2 text-right', strong ? 'font-bold text-v3-ink' : 'text-v3-ink2')}>
      {typeof value === 'number' ? value.toFixed(1) : <span className="text-v3-ink3">—</span>}
    </td>
  )
}

function LineupTable({ left, right, leftTeam, rightTeam, week, isCurrent, caption, totals, unit, slots }) {
  // Starters pair slot by slot (alignLineups); a bench has no slots and pairs
  // by row. `slots` is the snapshot's lineup, or false for a bench.
  const rows = slots !== false
    ? alignLineups(left, right, slots)
    : Array.from({ length: Math.max(left.length, right ? right.length : 0) }, (_, i) => [left[i] || null, right ? right[i] || null : null])
  return (
    <div className="overflow-x-auto">
      <table className="border-0 rounded-none w-full min-w-[330px] table-fixed border-collapse bg-v3-sheet text-left">
        <caption className="sr-only">{caption}</caption>
        <colgroup><col /><col className="w-[56px] sm:w-[72px]" /><col className="w-[56px] sm:w-[72px]" /><col /></colgroup>
        <thead>
          <tr className="border-b border-v3-rule">
            <th scope="col" className="border-0 bg-v3-sheet py-2.5 pl-3 pr-2 font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3 sm:pl-5"><span className="block break-words [overflow-wrap:anywhere]">{leftTeam ? leftTeam.teamName : '—'}</span></th>
            <th scope="col" className="border-0 bg-v3-sheet py-2.5 pr-2 text-right font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3">{unit}</th>
            <th scope="col" className="border-0 bg-v3-sheet border-l border-v3-rule py-2.5 pl-2 text-left font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3">{right ? unit : ''}</th>
            <th scope="col" className="border-0 bg-v3-sheet py-2.5 pl-2 pr-3 text-right font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3 sm:pr-5"><span className="block break-words [overflow-wrap:anywhere]">{rightTeam ? rightTeam.teamName : ''}</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b], i) => (
            <tr key={i} className="border-b border-v3-rule last:border-b-0">
              <NameCell row={a} align="left" week={week} isCurrent={isCurrent} />
              <PtsCell value={a ? a.pts : null} strong align="left" />
              <PtsCell value={b ? b.pts : null} strong align="right" />
              <NameCell row={b} align="right" week={week} isCurrent={isCurrent} />
            </tr>
          ))}
        </tbody>
        {totals ? (
          <tfoot>
            <tr className="border-t-2 border-v3-ink">
              <td className="border-0 py-3 pl-3 pr-2 text-[15px] font-semibold text-v3-ink sm:pl-5">{totals.label}</td>
              <td className="border-0 py-3 pr-2 text-right font-figure text-[15px] font-bold tabular-nums text-v3-ink">{typeof totals.left === 'number' ? totals.left.toFixed(1) : '—'}</td>
              <td className="border-0 py-3 pl-2 text-left font-figure text-[15px] font-bold tabular-nums text-v3-ink">{right ? (typeof totals.right === 'number' ? totals.right.toFixed(1) : '—') : ''}</td>
              <td className="border-0 py-3 pl-2 pr-3 sm:pr-5" />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}

/* ---------------------------------------------------------------------------
   The head of the matchup: both teams, their records, the score or the
   projection, and the result or the probability. */

function TeamBlock({ team, value, valueLabel, align, standingOf, you, link = true, recordNow = false }) {
  const right = align === 'right'
  const st = team ? standingOf(team) : null
  return (
    <div className={cx('min-w-0', right && 'text-right')}>
      <div className={cx('flex min-w-0 items-center gap-2', right && 'flex-row-reverse')}>
        {team && link ? (
          <a href={teamHref(team)} className="min-w-0 break-words [overflow-wrap:anywhere] text-[18px] font-extrabold tracking-[-0.01em] text-v3-ink underline decoration-transparent underline-offset-4 hover:decoration-v3-ink focus-visible:decoration-v3-ink sm:text-[20px]">{team.teamName}</a>
        ) : team ? <span className="min-w-0 break-words [overflow-wrap:anywhere] text-[18px] font-extrabold tracking-[-0.01em] text-v3-ink sm:text-[20px]">{team.teamName}</span>
          : <span className="text-[18px] font-extrabold text-v3-ink3 sm:text-[20px]">—</span>}
        {you ? <span className="shrink-0 rounded-[4px] bg-v3-band px-1.5 py-0.5 font-figure text-[12px] font-bold uppercase tracking-[0.1em] text-white">You</span> : null}
      </div>
      <p className="mt-1 font-figure text-[13px] text-v3-ink2">
        {recordNow ? 'Now ' : ''}{team ? recordText(team) : '—'}{st && st.rank ? ` · ${ordinal(st.rank)}` : ''}
      </p>
      <div className={cx('mt-3 flex items-baseline gap-2', right && 'justify-end')}>
        {typeof value === 'number'
          ? <CountUp value={value} format={(v) => v.toFixed(1)} className="font-figure text-[28px] font-bold leading-none tabular-nums text-v3-ink sm:text-[40px]" />
          : <span className="font-figure text-[28px] font-bold leading-none text-v3-ink3 sm:text-[40px]">—</span>}
      </div>
      <p className="mt-1 font-figure text-[12px] uppercase tracking-[0.08em] text-v3-ink3">{valueLabel}</p>
    </div>
  )
}

function ProbabilityBlock({ winProb, read, meanA, sd, framing }) {
  if (winProb === null || winProb === undefined) {
    return <p className="text-[15px] leading-[1.5] text-v3-ink2">{framing.none}</p>
  }
  const word = read === 'favoured' ? 'Favored' : read === 'behind' ? 'Behind' : 'Close'
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <Label>Win probability</Label>
        <span className={cx('font-figure text-[28px] font-bold tabular-nums', read === 'favoured' ? 'text-v3-gain' : read === 'behind' ? 'text-v3-cost' : 'text-v3-ink')}>
          {pct(winProb)} <span className="text-[15px] font-semibold uppercase tracking-[0.08em]">{word}</span>
        </span>
      </div>
      <WinBar p={winProb} read={read} className="mt-1" />
      <p className="mt-2.5 text-[13px] leading-[1.5] text-v3-ink2">
        {typeof sd === 'number' ? <>Each lineup swings about <Fig className="font-bold text-v3-ink">{Math.round(sd)}</Fig> points a week. </> : null}{framing.what}
      </p>
    </>
  )
}

/* ---------------------------------------------------------------------------
   Every game in the week — the league's scoreboard. */

function Scoreboard({ view, week, focus, mine, scoreOf, unitLabel, sample = false, code }) {
  if (!view) return null
  const games = view.games
  return (
    <Sheet code={code || `Every game · week ${week}`} aside={sample ? <SampleTag /> : view.bracketPending ? 'Bracket not set' : unitLabel} bodyClass="p-0" rise={false}>
      {games.length ? (
        <ul>
          {games.map((g) => {
            /* Whichever side is being read on this page goes on the left,
               matching the head-to-head card and the lineup table above —
               a game's own home/away (ESPN) or roster-id (Sleeper) order has
               no reason to agree with that, and for the reader's OWN row it
               read as a different game from the one above it. Every other
               row keeps its natural order: there is no "yours" to anchor a
               neutral third-party game by. */
            const flip = !!(focus && g.sides[1] && sameTeam(g.sides[1].team, focus))
            const a = flip ? g.sides[1] : g.sides[0]
            const b = flip ? g.sides[0] : g.sides[1]
            const sa = scoreOf(a, g)
            const sb = scoreOf(b, g)
            const on = g.sides.some((s) => sameTeam(s.team, focus))
            const yours = g.sides.some((s) => sameTeam(s.team, mine))
            const Row = sample ? 'div' : 'a'
            const aWon = flip ? g.winner === 1 : g.winner === 0
            const bWon = flip ? g.winner === 0 : g.winner === 1
            return (
              <li key={g.key} className="border-b border-v3-rule last:border-b-0">
                <Row
                  {...(sample ? {} : { href: matchupHref(week, a.team, mine), 'aria-current': on ? 'true' : undefined })}
                  className={cx('grid min-h-[56px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2 sm:gap-4 sm:px-5', !sample && 'transition-colors hover:bg-v3-paper focus-visible:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call', on ? 'bg-v3-paper shadow-[inset_3px_0_0_rgb(var(--v3-ink))]' : '')}
                >
                  <span className="min-w-0">
                    <span className={cx('block break-words [overflow-wrap:anywhere] text-[15px] sm:text-[15px]', aWon ? 'font-bold text-v3-ink' : 'font-semibold text-v3-ink')}>{a.team ? a.team.teamName : '—'}</span>
                    <span className="block truncate font-figure text-[12px] text-v3-ink3">{a.team ? recordText(a.team) : ''}{yours && sameTeam(a.team, mine) ? ' · you' : ''}</span>
                  </span>
                  <span className="flex items-center gap-2 font-figure text-[15px] tabular-nums">
                    <span className={aWon ? 'font-bold text-v3-ink' : 'text-v3-ink2'}>{typeof sa === 'number' ? sa.toFixed(1) : '—'}</span>
                    <span className="text-v3-ink3" aria-hidden="true">–</span>
                    <span className={bWon ? 'font-bold text-v3-ink' : 'text-v3-ink2'}>{typeof sb === 'number' ? sb.toFixed(1) : '—'}</span>
                  </span>
                  <span className="min-w-0 text-right">
                    <span className={cx('block break-words [overflow-wrap:anywhere] text-[15px] sm:text-[15px]', bWon ? 'font-bold text-v3-ink' : 'font-semibold text-v3-ink')}>{b.team ? b.team.teamName : '—'}</span>
                    <span className="block truncate font-figure text-[12px] text-v3-ink3">{b.team ? recordText(b.team) : ''}{yours && sameTeam(b.team, mine) ? ' · you' : ''}</span>
                  </span>
                </Row>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-4 py-4 text-[15px] leading-[1.55] text-v3-ink2 sm:px-5">
          {view.bracketPending ? 'The playoff pairings are set by the bracket once the regular season ends.' : 'No pairings are published for this week yet.'}
        </p>
      )}
      {view.noGame.length ? (
        <p className="border-t border-v3-rule px-4 py-3 text-[13px] leading-[1.5] text-v3-ink2 sm:px-5">
          No game this week: {view.noGame.map((t) => t.teamName).join(', ')}{view.playoff ? ' — a first-round bye, or out of the playoffs.' : '.'}
        </p>
      ) : null}
    </Sheet>
  )
}

/* ---------------------------------------------------------------------------
   Connected. */

function ConnectedMatchup({ league, q }) {
  const { snapshot, status, reason } = useSnapshotFresh(league.leagueId, league.provider)
  const ready = status === 'ready' && !!snapshot
  const pricing = usePricing(ready ? snapshot : null)
  const platform = platformFor(league.provider).name
  const hasSchedule = ready && !!(snapshot.schedule && Array.isArray(snapshot.schedule.matchups) && snapshot.schedule.matchups.length)
  const current = ready && Number(snapshot.week) > 0 ? Number(snapshot.week) : null
  const week = q.week || current || 1

  /* Sleeper's weeks, a request each: the one being looked at first, then —
     once any has told us the season's shape — every week the strip draws. */
  const sleeperOn = ready && !hasSchedule
  const [shapeWeeks, setShapeWeeks] = useState(null)
  const wanted = sleeperOn
    ? (shapeWeeks ? Array.from({ length: shapeWeeks }, (_, i) => i + 1) : [week, current].filter(Boolean))
    : []
  const sw = useSleeperWeeks(sleeperOn ? league.leagueId : null, wanted, week)
  const shape = ready ? seasonShape(snapshot, sw) : { regular: null, last: null, published: null }
  useEffect(() => {
    if (sleeperOn && shape.last && shape.last !== shapeWeeks) setShapeWeeks(shape.last)
  }, [sleeperOn, shape.last, shapeWeeks])

  const weekView = (w) => {
    if (!ready) return null
    if (hasSchedule) return espnWeek(snapshot, w)
    const e = sw[w]
    return e && e.view ? sleeperWeekView(snapshot, e.view) : null
  }
  /* CBS's per-player points and that week's lineups, for the week being
     looked at. ESPN publishes its own on the snapshot and Sleeper's are a
     different fetch again, so this asks for one provider and answers `off`
     for the rest. */
  const cbsWeek = useCbsWeek(ready ? league.leagueId : null, league.provider, week)

  /* The schedule says who played whom and what it finished; the box score
     says who was started and what each of them scored. Laid over rather
     than merged into the adapter, because they are two requests with two
     freshness windows and only one of them is on the snapshot. */
  const raw = weekView(week)
  const view = withCbsLineups(raw, cbsWeek.view)
  const sleeperEntry = sleeperOn ? sw[week] : null

  const mine = ready ? myTeam(snapshot, league) : null
  const asked = ready && q.team ? findTeam(snapshot, q.team) : null
  const focus = asked || mine || (view && view.games[0] ? view.games[0].sides[0].team : null)
  const head = (title, lede, extra) => (
    <PageHead
      label={`League · matchup${ready && snapshot.name ? ` · ${snapshot.name}` : ''}`}
      title={title}
      lede={lede}
      action={<>{extra}<QuietButton href="#/league">League</QuietButton></>}
    />
  )

  if (!ready) {
    if (status === 'loading' || status === 'none') {
      return (
        <div className="grid gap-8">
          {head('The matchup.', `Reading ${league.name} from ${platform}…`)}
          <Sheet band={false} aria-busy="true"><Skeleton lines={8} /></Sheet>
        </div>
      )
    }
    return (
      <div className="grid gap-8">
        {head('The matchup.', null)}
        <CouldNotRead reason={reason} platform={platform} onRetry={() => retrySnapshot(league.leagueId, league.provider)} />
      </div>
    )
  }

  if (q.team && !asked) {
    return (
      <div className="grid gap-8">
        {head('No team by that address.', `${snapshot.name} has ${(snapshot.teams || []).length} teams and none of them answers to “${q.team}”.`)}
        <div><GoLink href={matchupHref(week, null)}>Your own matchup, week {week}</GoLink></div>
      </div>
    )
  }

  return (
    <MatchupBody
      league={league} snapshot={snapshot} pricing={pricing} platform={platform}
      week={week} current={current} view={view} weekView={weekView} shape={shape}
      focus={focus} mine={mine} hasSchedule={hasSchedule} sleeperEntry={sleeperEntry}
      cbsWeek={cbsWeek} head={head}
    />
  )
}

/* The schedule's sides, with the week's box score laid over them.
 *
 * `espnWeek()` fills `starters`/`bench` with null, because ESPN's own
 * box score is not read — so for CBS those are the two fields this
 * supplies, keyed by CBS's own team id, which is what `rosterId` carries.
 *
 * A side the box score has nothing for keeps its nulls rather than
 * getting an empty array: the panel treats an empty lineup as one it
 * could read and found nobody in, and this is one it could not read.
 *
 * Laid over rather than merged in the adapter because the two are
 * different requests with different windows — the schedule rides on the
 * snapshot and this is a call per week somebody opens.
 */
function withCbsLineups(view, wk) {
  if (!view || !wk || !wk.teams) return view
  const of = (side) => {
    const id = side && side.team && side.team.rosterId
    const t = id === null || id === undefined ? null : wk.teams[String(id)]
    if (!t) return side
    return Object.assign({}, side, { starters: t.starters, bench: t.bench })
  }
  return Object.assign({}, view, {
    games: (view.games || []).map((g) => Object.assign({}, g, { sides: (g.sides || []).map(of) })),
  })
}

function MatchupBody({ league, snapshot, pricing, platform, week, current, view, weekView, shape, focus, mine, hasSchedule, sleeperEntry, cbsWeek, head }) {
  const { engine, ready: boardReady } = pricing
  const seasonDone = shape.last && current && current > shape.last
  const phase = view ? view.phase : current ? phaseFor(week, current) : 'upcoming'
  const isCurrent = phase === 'live'
  const g = view ? gameFor(view, focus) : null
  const opp = g && !g.bye ? g.theirs.team : null
  const standingOf = (t) => {
    const st = standing(snapshot, t.ownerId)
    return st.me ? { rank: st.rank } : null
  }

  /* The scorer for the week shown: this week's is the rooms' own (the
     league's projection first, live designations laid over); any other
     week is today's rosters under the season average with that week's
     byes at zero, off the nightly board. */
  const scorer = useMemo(() => {
    if (!boardReady || !engine) return null
    if (week === current) return { weekPts: pricing.weekPts, byId: pricing.byId }
    return {
      weekPts: leagueWeekPts(engine, { ...snapshot, week, projections: null, status: null }),
      byId: pricing.boardById,
    }
  }, [boardReady, engine, week, current, snapshot, pricing.weekPts, pricing.byId, pricing.boardById])

  const priced = phase !== 'final' && scorer
  /* The same branch teamWeek()/projectedTotal() already take: once a
     player has actually scored, that is the number his row shows — never
     the stale projection beside a total that has moved past it. */
  const ptsFor = (r) => {
    const actual = r.player && r.player.actualPts
    return typeof actual === 'number' && Number.isFinite(actual) ? actual : r.projPts
  }
  const rowsFor = (team) => (priced && team ? lineupRows(team, scorer.byId, scorer.weekPts).map((r) => ({ id: r.id, player: r.player, pts: ptsFor(r) })) : [])
  const leftRows = rowsFor(focus)
  const rightRows = opp ? rowsFor(opp) : null
  const totalL = priced && focus ? projectedTotal(focus, scorer.byId, scorer.weekPts) : null
  const totalR = priced && opp ? projectedTotal(opp, scorer.byId, scorer.weekPts) : null
  // How many starters on each side are already-scored rather than
  // projected — said out loud so the blended total never reads as a plain
  // projection it no longer is.
  const scoredCount = leftRows.filter((r) => r.player && typeof r.player.actualPts === 'number').length
  const oppScoredCount = (rightRows || []).filter((r) => r.player && typeof r.player.actualPts === 'number').length
  const cv = pricing.cv
  const wA = priced ? teamWeek(lineupRows(focus, scorer.byId, scorer.weekPts), cv) : null
  const wB = priced && opp ? teamWeek(lineupRows(opp, scorer.byId, scorer.weekPts), cv) : null
  const winProb = wA && wB && engine && engine.winProbability ? engine.winProbability(wA, wB) : null
  const read = matchupRead(winProb)
  const source = isCurrent ? projectionSource(lineupRows(focus, scorer ? scorer.byId : null, scorer ? scorer.weekPts : null), snapshot.projections, week) : 'none'

  /* The platform's own per-player points for a played week, where it
     published them (Sleeper). */
  const board = pricing.boardById
  const scored = (side) => (side && side.starters ? side.starters.map((s) => ({ id: s.id || 'empty', player: s.id ? board.get(String(s.id)) || null : null, empty: !s.id, pts: s.points })) : null)
  const scoredBench = (side) => (side && side.bench ? side.bench.map((s) => ({ id: s.id, player: board.get(String(s.id)) || null, pts: s.points })) : null)

  /* ---- The strip ---- */
  const total = hasSchedule
    ? Math.max(shape.last || 0, current && !seasonDone ? current : 0, 1)
    : Math.max(shape.last || 18, current && !seasonDone ? current : 0)
  const tailNote = hasSchedule && shape.regular && shape.last === shape.regular && !seasonDone
    ? `Playoffs · bracket set after week ${shape.regular}`
    : null
  const items = stripItems({ total, regular: shape.regular, current, focus, mine, weekView, tailNote })
  const sleeperFailed = !hasSchedule && sleeperEntry && sleeperEntry.status === 'error'
  /* Sleeper's weeks and everybody else's fail differently, and the copy
     here described Sleeper's mechanics for all of them.

     Sleeper publishes its pairings a week at a time and Juke asks for each
     one, so a failure there is one week's request that did not land, and
     `retrySleeperWeeks` is the control that can act on it. ESPN and CBS
     publish a whole season ON THE SNAPSHOT, so a missing schedule there is
     the snapshot's own read failing -- a different fetch, with a different
     retry.

     The page said CBS "publishes a league's pairings one week at a time",
     which CBS's own season page disproves, and wired its Try again to a
     fetch that was not the one that failed.

     Third instance of the hardcoded-platform bug in one night. The check
     CLAUDE.md prescribes is to grep for the previous platform's name; what
     it misses is copy that names no platform and asserts a BEHAVIOUR only
     one platform has. */
  const weeksUnread = !hasSchedule && league.provider !== 'sleeper'
  const stripCaption = !hasSchedule && !shape.last
    ? (weeksUnread
        ? `${platform}'s schedule could not be read, so these are the NFL's eighteen weeks and carry no results.`
        : sleeperFailed ? `${platform}'s weekly pairings could not be read, so these are the NFL's eighteen weeks and carry no results.` : `Reading ${platform}'s weeks…`)
    : shape.regular ? `${shape.regular}-week regular season${shape.last && shape.last > shape.regular ? `, playoffs to week ${shape.last}` : ''}.` : null

  /* ---- Words ---- */
  const focusName = focus ? focus.teamName : 'This team'
  const isMine = sameTeam(focus, mine)
  let title
  let lede
  if (!focus) { title = `Week ${week}.`; lede = `Juke cannot tell which of the ${(snapshot.teams || []).length} teams is yours, so this week opens on the first game.` }
  else if (view && view.bracketPending) { title = `Week ${week}: the bracket is not set.`; lede = `Week ${week} is a playoff week, and its pairings are decided when the regular season ends.` }
  else if (g && g.bye) { title = `Week ${week}: ${focusName} has no game.`; lede = view && view.playoff ? 'A first-round bye, or out of the playoffs.' : 'A bye week.' }
  else if (g && g.result) {
    const a = g.mine.points
    const b = g.theirs.points
    const score = typeof a === 'number' && typeof b === 'number' ? `, ${a.toFixed(1)}–${b.toFixed(1)}` : ''
    title = g.result === 'W' ? `${focusName} beat ${opp ? opp.teamName : 'their opponent'}${score}.` : g.result === 'L' ? `${focusName} lost to ${opp ? opp.teamName : 'their opponent'}${score}.` : `${focusName} tied ${opp ? opp.teamName : 'their opponent'}${score}.`
    lede = `Week ${week}${view && view.playoff ? ', a playoff week' : ''}. ${view && view.provider === 'sleeper' ? `The final score as ${platform} states it; ${platform} names no winner, so the result is read off its final points.` : `The score and the result as ${platform} states them.`}`
  } else if (g) {
    title = `Week ${week}: ${focusName} vs ${opp ? opp.teamName : 'TBD'}.`
    lede = phase === 'final'
      ? `${platform} has not published a result for week ${week} yet.`
      : isCurrent
      ? `This week. ${totalL !== null ? `${focusName} projects ${totalL.toFixed(1)}` : 'Not every starter has a projection'}${totalR !== null ? `; ${opp.teamName}, ${totalR.toFixed(1)}` : ''}.`
      : `${week - (current || 0)} ${week - (current || 0) === 1 ? 'week' : 'weeks'} ahead, priced from today's rosters.`
  } else if (!hasSchedule && sleeperEntry && sleeperEntry.status === 'loading') {
    title = `Week ${week}.`; lede = `Reading ${platform}'s week ${week}…`
  } else {
    title = `Week ${week}.`
    lede = weeksUnread
      ? `${platform}'s schedule could not be read, so this week has no opponent beside it.`
      : !hasSchedule
      ? `${platform}'s pairing for week ${week} could not be read.`
      : `${snapshot.name}'s schedule has no game for ${focusName} in week ${week}.`
  }
  const backToMine = mine && focus && !isMine
    ? <QuietButton href={matchupHref(week, mine, mine)}>Your matchup</QuietButton>
    : null

  /* ---- The head's two numbers ---- */
  const valueA = phase === 'final' && g && !g.bye ? g.mine.points : totalL
  const valueB = phase === 'final' && g && !g.bye ? g.theirs.points : totalR
  const valueLabel = phase === 'final'
    ? (g && typeof g.mine.points === 'number' ? 'Final' : 'No score published')
    : isCurrent ? (scoredCount || oppScoredCount ? 'Live' : 'Projected') : 'Projected · today’s rosters'

  const scoreOf = (side) => {
    if (phase === 'final') return side.points
    if (!scorer || !side.team) return null
    return projectedTotal(side.team, scorer.byId, scorer.weekPts)
  }
  const liveSoFar = isCurrent && g && !g.bye && (typeof g.mine.points === 'number' && typeof g.theirs.points === 'number') && (g.mine.points > 0 || g.theirs.points > 0)

  /* ---- The lineup sheet, per state ---- */
  let lineups = null
  if (g && !g.bye && phase === 'final') {
    const a = scored(g.mine)
    const b = scored(g.theirs)
    if (a && b) {
      const benchA = scoredBench(g.mine) || []
      const benchB = scoredBench(g.theirs) || []
      lineups = (
        <Sheet code="Lineups · as played" aside={`${platform}'s points`} bodyClass="p-0" rise={false}>
          <LineupTable left={a} right={b} leftTeam={focus} rightTeam={opp} week={week} isCurrent={false} unit="Pts" slots={snapshot.lineup} caption={`Week ${week} lineups as played, with ${platform}'s points per player`} totals={{ label: 'Starters', left: g.mine.points, right: g.theirs.points }} />
          {benchA.length || benchB.length ? (
            <details className="border-t border-v3-rule">
              <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-3 font-figure text-[12px] font-bold uppercase tracking-[0.12em] text-v3-ink2 hover:text-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call sm:px-5 [&::-webkit-details-marker]:hidden">
                Bench <span className="text-v3-ink3">{benchA.length} · {benchB.length}</span>
              </summary>
              <LineupTable left={benchA} right={benchB} leftTeam={focus} rightTeam={opp} week={week} isCurrent={false} unit="Pts" slots={false} caption={`Week ${week} benches`} />
            </details>
          ) : null}
          <p className="border-t border-v3-rule px-3 py-3 text-[13px] leading-[1.5] text-v3-ink3 sm:px-5">Points per player are {platform}’s own for week {week}, as its box score shows them — not Juke’s recount.</p>
        </Sheet>
      )
    } else {
      lineups = (
        <Sheet code="Lineups · as played" aside={cbsWeek && cbsWeek.status === 'loading' ? 'Reading' : 'Not read'}>
          <p className="text-[15px] leading-[1.55] text-v3-ink2">
            {league.provider === 'espn'
              ? `${platform}'s per-player box score for a played week is not read, so the final above is the whole of what ${platform} tells Juke about week ${week}. Juke's own recount of a played week agrees with ${platform}'s about four weeks in five, which is not good enough to print beside it, and today's rosters are not that week's lineups — so neither is shown in its place.`
              /* Yahoo's box score is not read at all yet -- nothing asked
                 for it -- so the sentence may not say it "could not be
                 read", which is CBS's failure branch below and claims an
                 attempt that never happened. */
              : league.provider === 'yahoo'
                ? `${platform}'s per-player box score for a played week is not read yet, so the final above is the whole of what ${platform} tells Juke about week ${week}. Today's rosters are not that week's lineups, so they are not shown in its place.`
              : cbsWeek && cbsWeek.status === 'loading'
                ? `Reading ${platform}'s box score for week ${week}…`
                : cbsWeek && cbsWeek.status === 'ready'
                  /* NOT "nobody has played it yet". The route answers an
                     empty week for two reasons it cannot tell apart: a
                     week nobody has played, and a week whose per-player
                     points Juke could not find. `league/stats` turned out
                     to be the FREE-AGENT pool -- 369 rows, all of them
                     free agents -- so the second case is the live one and
                     this sentence was telling a reader their played week
                     had not happened. A message may not claim the more
                     specific of two causes it cannot distinguish. */
                  ? `Juke could not read ${platform}'s per-player points for week ${week}. The final above is what its schedule states.`
                  : `${platform}'s box score for week ${week} could not be read. The final above is what its schedule states.`}
          </p>
          {cbsWeek && cbsWeek.status === 'error' ? (
            <div className="mt-4"><QuietButton onClick={() => retryCbsWeek(league.leagueId)}>Try again</QuietButton></div>
          ) : null}
        </Sheet>
      )
    }
  } else if (g && !g.bye && priced) {
    const benchA = benchRows(focus, scorer.byId, scorer.weekPts).sort((x, y) => (y.projPts || 0) - (x.projPts || 0)).map((r) => ({ id: r.id, player: r.player, pts: ptsFor(r) }))
    const benchB = opp ? benchRows(opp, scorer.byId, scorer.weekPts).sort((x, y) => (y.projPts || 0) - (x.projPts || 0)).map((r) => ({ id: r.id, player: r.player, pts: ptsFor(r) })) : []
    const anyScored = isCurrent && (scoredCount || oppScoredCount)
    const note = isCurrent
      ? (source === 'all' ? `${platform}'s projection for week ${week}, under your league's scoring.` : source === 'some' ? `${platform}'s projection where it has one, Juke's for the rest.` : snapshot.rules ? "Juke's projection for this week, under your league's own scoring." : "Juke's projection — your league's scoring could not be read, so default rules.")
      : `Projected from today's rosters and designations: each starter's season average under ${snapshot.rules ? "your league's" : 'default'} scoring, with week ${week} byes at zero. Not ${platform}'s number — it has not published one for week ${week}.`
    const liveNote = anyScored
      ? ` ${scoredCount} of ${focusName}'s and ${oppScoredCount} of ${opp ? opp.teamName : 'their'} starters have already played — those rows show ${platform}'s actual points, not a projection.`
      : ''
    const unit = anyScored ? 'Pts' : 'Proj'
    const totalsLabel = anyScored ? 'So far' : 'Projected'
    lineups = (
      <Sheet code={isCurrent ? 'Lineups · as set' : 'Lineups · today’s rosters'} aside={isCurrent ? 'Points this week' : `Projected · week ${week}`} bodyClass="p-0" rise={false}>
        {leftRows.length ? (
          <LineupTable left={leftRows} right={rightRows} leftTeam={focus} rightTeam={opp} week={week} isCurrent={isCurrent} unit={unit} slots={snapshot.lineup} caption={`Week ${week} lineups, ${anyScored ? 'priced' : 'projected'}`} totals={{ label: totalsLabel, left: totalL, right: totalR }} />
        ) : <p className="px-4 py-4 text-[15px] text-v3-ink2 sm:px-5">No lineup is set for this week yet.</p>}
        {benchA.length || benchB.length ? (
          <details className="border-t border-v3-rule">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-3 font-figure text-[12px] font-bold uppercase tracking-[0.12em] text-v3-ink2 hover:text-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call sm:px-5 [&::-webkit-details-marker]:hidden">
              Bench <span className="text-v3-ink3">{benchA.length} · {benchB.length}</span>
            </summary>
            <LineupTable left={benchA} right={opp ? benchB : null} leftTeam={focus} rightTeam={opp} week={week} isCurrent={isCurrent} unit={unit} slots={false} caption={`Week ${week} benches, ${anyScored ? 'priced' : 'projected'}`} />
          </details>
        ) : null}
        <p className="border-t border-v3-rule px-3 py-3 text-[13px] leading-[1.5] text-v3-ink3 sm:px-5">
          {note}{liveNote}{isCurrent ? ' Anybody whose game has kicked off is marked started; his slot can no longer change.' : ''}
        </p>
      </Sheet>
    )
  } else if (g && !g.bye && !scorer) {
    lineups = <Sheet band={false} aria-busy="true"><Skeleton lines={8} /></Sheet>
  } else if (!view && week === current && focus && scorer && leftRows.length) {
    /* The week's pairing could not be read (a worker without the route,
       or Sleeper not answering): the snapshot still holds this team's
       lineup as set, so that half is drawn and the other half is not
       guessed at. */
    lineups = (
      <Sheet code={`${focusName} · as set`} aside="Points this week" bodyClass="p-0" rise={false}>
        <LineupTable left={leftRows} right={null} leftTeam={focus} rightTeam={null} week={week} isCurrent unit="Proj" slots={snapshot.lineup} caption={`${focusName}'s week ${week} lineup, projected`} totals={{ label: 'Projected', left: totalL, right: null }} />
        <p className="border-t border-v3-rule px-3 py-3 text-[13px] leading-[1.5] text-v3-ink3 sm:px-5">
          {source === 'all' ? `${platform}'s projection for week ${week}` : source === 'some' ? `${platform}'s projection where it has one, Juke's for the rest` : "Juke's projection for this week"}, under {snapshot.rules ? "your league's" : 'default'} scoring. The opponent's side needs the pairing above.
        </p>
      </Sheet>
    )
  }

  const loadingWeek = !hasSchedule && sleeperEntry && sleeperEntry.status === 'loading' && !view

  return (
    <div className="grid gap-8">
      {head(title, lede, backToMine)}

      <Sheet code="The season, week by week" aside={isMine || !focus ? null : `${focusName}’s weeks`} bodyClass="p-3 sm:p-4">
        <WeekStrip items={items} selected={week} label={`Weeks of ${focusName}'s season`} />
        {stripCaption ? <p className="mt-2 px-1 text-[13px] leading-[1.5] text-v3-ink3">{stripCaption}{sleeperFailed || weeksUnread ? <> <button type="button" onClick={() => (weeksUnread ? retrySnapshot(league.leagueId, league.provider) : retrySleeperWeeks(league.leagueId))} className="font-semibold text-v3-ink underline decoration-v3-rule underline-offset-4 hover:decoration-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">Try again</button></> : null}</p> : null}
      </Sheet>

      {loadingWeek ? <Sheet band={false} aria-busy="true"><Skeleton lines={8} /></Sheet> : null}

      {!loadingWeek && (sleeperFailed || weeksUnread) && !view ? (
        <Sheet code={`Week ${week}`} aside="Could not read" role="status">
          <p className="text-[15px] leading-[1.55] text-v3-ink2">
            {weeksUnread
              ? `${platform} publishes this league's whole season and Juke could not read it — the rest of the snapshot came through, so this is the schedule alone. Nothing about your league is wrong.`
              : <>{platform} publishes a league's pairings one week at a time, and Juke could not read week {week}'s — {sleeperEntry.reason === 'not-found' ? `${platform} does not return this league any more.` : `the route that reads it may not be on this worker yet, or ${platform} did not answer.`} Nothing about your league is wrong.</>}
          </p>
          {week === current && focus && scorer ? (
            <p className="mt-3 text-[15px] leading-[1.55] text-v3-ink2">
              What the snapshot still holds is {isMine ? 'your' : `${focusName}'s`} own lineup as set, below.
            </p>
          ) : null}
          {/* Each retry aims at the fetch that failed. A season provider's
              schedule rides on the SNAPSHOT, so retrying Sleeper's per-week
              route here would be a control that presses nothing. */}
          <div className="mt-4">
            <QuietButton onClick={() => (weeksUnread
              ? retrySnapshot(league.leagueId, league.provider)
              : retrySleeperWeeks(league.leagueId))}>Try again</QuietButton>
          </div>
        </Sheet>
      ) : null}

      {view && g && !g.bye && !view.bracketPending ? (
        <Sheet code={`Week ${week} · ${PHASE_WORD[phase]}${view.playoff ? ' · playoffs' : ''}`} aside={g.home === null ? null : g.home ? 'Home' : 'Away'} rise={false}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 sm:gap-8">
            <TeamBlock team={focus} value={valueA} valueLabel={valueLabel} align="left" standingOf={standingOf} you={isMine} recordNow={phase === 'final'} />
            <div className="pt-2 text-center font-figure text-[12px] font-bold uppercase tracking-[0.12em] text-v3-ink3">{phase === 'final' ? (g.result ? 'Final' : '—') : 'vs'}</div>
            <TeamBlock team={opp} value={valueB} valueLabel={valueLabel} align="right" standingOf={standingOf} you={sameTeam(opp, mine)} recordNow={phase === 'final'} />
          </div>
          <div className="mt-5 border-t border-v3-rule pt-4">
            {phase === 'final' ? (
              <p className={cx('text-[18px] font-extrabold', g.result === 'W' ? 'text-v3-gain' : g.result === 'L' ? 'text-v3-cost' : 'text-v3-ink')}>
                {g.result && typeof g.mine.points === 'number' && typeof g.theirs.points === 'number'
                  ? g.result === 'W' ? `Won by ${(g.mine.points - g.theirs.points).toFixed(1)}` : g.result === 'L' ? `Lost by ${(g.theirs.points - g.mine.points).toFixed(1)}` : `Tied at ${g.mine.points.toFixed(1)}`
                  : `No result published for week ${week}.`}
              </p>
            ) : (
              <ProbabilityBlock
                winProb={winProb}
                read={read}
                sd={wA ? wA.stdev : null}
                framing={{
                  none: totalL === null || totalR === null
                    ? 'No win probability: a starter on one side has no projection, and Juke only prices a matchup when both lineups can be.'
                    : 'No win probability yet: the weekly spread it needs is measured once the board has loaded.',
                  what: isCurrent
                    ? (scoredCount || oppScoredCount
                        ? `A scoring-strength estimate from two lineups, narrowing as games are played — ${scoredCount} of ${focusName}'s and ${oppScoredCount} of ${opp ? opp.teamName : 'theirs'} have already scored.`
                        : 'A scoring-strength estimate from two projected lineups — not a simulated week.')
                    : `A scoring-strength estimate from today's two rosters, ${week - (current || 0)} ${week - (current || 0) === 1 ? 'week' : 'weeks'} out — rosters and injuries will change before then.`,
                }}
              />
            )}
            {liveSoFar ? (
              <p className="mt-3 font-figure text-[13px] text-v3-ink2">
                Live on {platform}: <Fig className="font-bold text-v3-ink">{g.mine.points.toFixed(1)}</Fig> – <Fig className="font-bold text-v3-ink">{g.theirs.points.toFixed(1)}</Fig> so far, as games finish.
              </p>
            ) : null}
          </div>
        </Sheet>
      ) : null}

      {view && g && g.bye ? (
        <Sheet code={`Week ${week}`} aside="No game">
          <p className="text-[15px] leading-[1.55] text-v3-ink2">{focusName} has no opponent in week {week}{view.playoff ? ' — a first-round bye, or out of the playoffs' : ''}. Every game in the week is below.</p>
        </Sheet>
      ) : null}

      {view && !g && !view.bracketPending && focus ? (
        <Sheet code={`Week ${week}`} aside="No game">
          <p className="text-[15px] leading-[1.55] text-v3-ink2">{snapshot.name}'s schedule has no game for {focusName} in week {week}.</p>
        </Sheet>
      ) : null}

      {lineups}

      {view ? (
        <Scoreboard
          view={view}
          week={week}
          focus={focus}
          mine={mine}
          scoreOf={scoreOf}
          unitLabel={phase === 'final' ? 'Final' : isCurrent ? (scoredCount || oppScoredCount ? 'Live' : 'Projected') : 'Projected · today’s rosters'}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-1">
        {isCurrent && isMine ? <GoLink href="#/calls/lineup">Work the lineup call</GoLink> : null}
        {focus ? <GoLink href={teamHref(focus)}>{isMine ? 'Your' : `${focusName}’s`} roster and schedule</GoLink> : null}
        <GoLink href="#/league">Standings</GoLink>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Signed out, or no league: the page on a SAMPLE league — the same league
   the calls' guest tools draft off tonight's board (callData.js
   sampleLeague), every figure computed and the league the one invented
   thing, labelled on every sheet. */

function GuestMatchup() {
  const sample = useEngineData((engine) => sampleLeague(engine))
  const engine = typeof window !== 'undefined' ? window.JukeEngine : null
  const priced = useMemo(() => {
    if (!sample || !engine) return null
    const snap = sample.snapshot
    const byId = new Map(engine.board().map((p) => [String(p.id), p]))
    const weekPts = leagueWeekPts(engine, snap)
    const cv = engine.weeklyCV ? engine.weeklyCV(null) : null
    const me = snap.teams.find((t) => t.ownerId === sample.league.ownerId)
    const others = snap.teams.filter((t) => t !== me)
    const them = snap.teams[(snap.teams.indexOf(me) + 1) % snap.teams.length]
    const rest = others.filter((t) => t !== them)
    const pairs = [[me, them]]
    for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]])
    const view = {
      provider: null, week: 1, phase: 'live', playoff: false, bracketPending: false,
      games: pairs.map(([a, b]) => ({ key: a.ownerId, home: null, winner: null, sides: [{ team: a, points: null }, { team: b, points: null }] })),
      noGame: rest.length % 2 ? [rest[rest.length - 1]] : [],
    }
    const rows = (t) => lineupRows(t, byId, weekPts).map((r) => ({ id: r.id, player: r.player, pts: r.projPts }))
    const wA = teamWeek(lineupRows(me, byId, weekPts), cv)
    const wB = teamWeek(lineupRows(them, byId, weekPts), cv)
    const winProb = wA && wB && engine.winProbability ? engine.winProbability(wA, wB) : null
    return {
      snap, me, them, view, byId, weekPts, winProb, wA,
      left: rows(me), right: rows(them),
      totalL: projectedTotal(me, byId, weekPts), totalR: projectedTotal(them, byId, weekPts),
    }
  }, [sample, engine])

  const headEl = (
    <PageHead
      label="League · matchup · sample"
      title="Every week of your season, one matchup at a time."
      lede="Last week's result with every starter's points, this week's two lineups side by side with the win probability, and who is next. Until a league is connected, this is a sample week on tonight's real players."
      action={<><ConnectCall primary /><QuietButton href="#/league">League</QuietButton></>}
    />
  )
  if (!priced) {
    return <div className="grid gap-8">{headEl}<Sheet band={false} aria-busy="true"><Skeleton lines={8} /></Sheet></div>
  }
  const { me, them, view, byId, weekPts, winProb, wA, left, right, totalL, totalR } = priced
  const read = matchupRead(winProb)
  return (
    <div className="grid gap-8">
      {headEl}
      <Sheet code="Sample · this week" aside={<SampleTag />}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 sm:gap-8">
          <TeamBlock team={me} link={false} value={totalL} valueLabel="Per game" align="left" standingOf={() => null} you />
          <div className="pt-2 text-center font-figure text-[12px] font-bold uppercase tracking-[0.12em] text-v3-ink3">vs</div>
          <TeamBlock team={them} link={false} value={totalR} valueLabel="Per game" align="right" standingOf={() => null} />
        </div>
        <div className="mt-5 border-t border-v3-rule pt-4">
          <ProbabilityBlock
            winProb={winProb}
            read={read}
            sd={wA ? wA.stdev : null}
            framing={{ none: 'No win probability: a starter on one side has no projection.', what: 'A scoring-strength estimate from two sample lineups — each drafted by ADP off tonight’s board and set in draft order.' }}
          />
        </div>
        <p className="mt-4 text-[13px] leading-[1.5] text-v3-ink3">The records read 0-0 because the sample league has played no games. On your league a strip of weeks sits above this sheet and runs the whole season: results behind you, this week marked, opponents ahead.</p>
      </Sheet>
      <Sheet code="Sample · lineups" aside={<SampleTag />} bodyClass="p-0" rise={false}>
        <LineupTable left={left} right={right} leftTeam={me} rightTeam={them} week={null} isCurrent={false} unit="Proj" slots={null} caption="Sample lineups, projected per game" totals={{ label: 'Projected', left: totalL, right: totalR }} />
        <p className="border-t border-v3-rule px-3 py-3 text-[13px] leading-[1.5] text-v3-ink3 sm:px-5">Each player's season projection, per game, under the scoring your mock is set to. On your league it is your platform's own projection for the week.</p>
      </Sheet>
      <Scoreboard
        view={view}
        week={1}
        focus={me}
        mine={me}
        sample
        code="Sample · every game"
        scoreOf={(side) => projectedTotal(side.team, byId, weekPts)}
      />
    </div>
  )
}

export default function V3Matchup() {
  const q = useMatchupQuery()
  const { status, league, retry } = useLeagueFresh()

  if (status === 'loading') {
    return (
      <div className="grid gap-8">
        <PageHead label="League · matchup" title="The matchup." lede="Checking which league is yours…" />
        <Sheet band={false} aria-busy="true"><Skeleton lines={6} /></Sheet>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="grid gap-8">
        <PageHead label="League · matchup" title="The matchup." />
        <Sheet code="Could not load your leagues" role="alert">
          <p className="max-w-[62ch] text-[15px] leading-[1.55] text-v3-ink2">Nothing has been disconnected — this page could not reach your account to read which league is yours.</p>
          <div className="mt-4"><QuietButton onClick={retry}>Try again</QuietButton></div>
        </Sheet>
      </div>
    )
  }
  if (status !== 'connected' || !league) return <GuestMatchup />
  return <ConnectedMatchup key={league.provider + ':' + league.leagueId} league={league} q={q} />
}
