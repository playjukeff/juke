import { useEffect, useMemo, useRef, useState } from 'react'
import { retrySnapshot } from '../../../hooks/useLeague.js'
import { decisionsForWeek, weekMark } from '../../../hooks/useDecisions.js'
import { useDecisionsFresh, useLeagueFresh, useSnapshotFresh } from '../../v2/stores.js'
import { useLeagueModel } from '../../v2/league/useLeagueModel.js'
import { seasonPhase, underWay } from '../../../lib/seasonPhase.js'
import { gameInWeek, myGames, seasonSummary } from '../../../lib/schedule.js'
import { oddsFor, SIMS } from '../../../lib/seasonSim.js'
import { tradeWindow } from '../../../lib/tradeDeadline.js'
import { platformFor } from '../../shell/leaguePlatforms.js'
import {
  Delta, Fig, GoLink, Label, PageHead, QuietButton, Sheet, Skeleton, ValueBar, cx, ordinal,
} from '../ui.jsx'
import { findTeam, recordText, standing, teamHref } from './leagueData.js'
import {
  CouldNotRead, KpiGrid, LeagueSwitcher, ResultChip, Verdict, pct, useDraftPhase, whenText,
} from './parts.jsx'
import LeagueDemo from './LeagueDemo.jsx'
import { matchupHref } from './matchupData.js'
import { CountText, LAYOUT_ROW, motion } from '../motion.jsx'

/* #/league — production's My League, reorganised around one question:
   where is this season going, and how did it get here.

   ---- Top to bottom, the order a manager reads a season in ----

   The four numbers a manager checks (playoff odds with the bye in its note,
   record, points for and points against against the league's own median),
   then the season as a strip of weeks — each past week opens its result
   and the calls Juke logged in it — then the table with every team's
   playoff odds and the line, then the league's facts and its own draft.

   ---- Same data, same four states as production ----

   leagueStore answers loading / none / connected / error, and error is
   drawn rather than collapsed into the demo: a failed read presenting as
   "you have no league" is the claim production was reported for making.
   The table's order is standings.js, the odds are seasonSim.js fed exactly
   what production's StandingsPanel feeds it (v2's useLeagueModel), results
   are schedule.js, the week marks are the decision ledger. */

const PHASE_LABEL = { draft: 'Draft', 'in-season': 'In season', playoffs: 'Playoffs', complete: 'Season over' }

/* The league's own season length where its schedule publishes one; the
   NFL's eighteen weeks otherwise — production's fallback, never a guess at
   a fantasy calendar. The playoff divider sits where the regular season is
   READ to end. */
function seasonWeeks(snapshot, leagueId, decisions, games) {
  const s = snapshot.schedule
  const total = (s && s.weeks) || 18
  const regular = s && s.regularSeasonWeeks ? s.regularSeasonWeeks : null
  const byWeek = new Map((games || []).map((g) => [g.week, g]))
  const out = [{ key: 'draft', label: 'Draft' }]
  for (let n = 1; n <= total; n++) {
    if (regular && n === regular + 1) out.push({ key: 'po', divider: true })
    const g = byWeek.get(n)
    out.push({
      key: String(n),
      label: `W${n}`,
      now: n === snapshot.week,
      disabled: n > snapshot.week,
      result: g ? g.result : null,
      mark: weekMark(leagueId, n, decisions),
    })
  }
  return out
}

function WeekStrip({ weeks, selected, onSelect }) {
  const navRef = useRef(null)
  /* On a phone the current week sits past the edge of a strip that starts
     at the draft; the strip scrolls itself (never the page) to keep the
     chosen cell in view. */
  useEffect(() => {
    const nav = navRef.current
    const cell = nav && nav.querySelector('[data-on="true"]')
    if (!nav || !cell) return
    const n = nav.getBoundingClientRect()
    const c = cell.getBoundingClientRect()
    if (c.left < n.left || c.right > n.right) nav.scrollLeft += c.left - n.left - (n.width - c.width) / 2
  }, [selected])
  return (
    <nav ref={navRef} aria-label="Weeks of the season" className="overflow-x-auto">
      <ol className="flex min-w-max items-stretch gap-1">
        {weeks.map((w) => {
          if (w.divider) {
            return (
              <li key={w.key} className="flex items-center px-1" aria-hidden="true">
                <span className="rounded-[4px] bg-v3-well px-1.5 py-1 font-figure text-[11px] font-bold uppercase tracking-[0.12em] text-v3-ink2">Playoffs</span>
              </li>
            )
          }
          const on = selected === w.key
          const cls = cx(
            'flex min-h-[52px] min-w-[48px] flex-col items-center justify-center gap-1 rounded-[4px] px-2 font-figure text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors',
            on ? 'bg-v3-band text-white' : w.disabled ? 'text-v3-ink3' : 'text-v3-ink hover:bg-v3-paper',
            w.now && !on ? 'shadow-[inset_0_-3px_0_rgb(var(--v3-ink))]' : '',
          )
          const inner = (
            <>
              <span>{w.now ? `W${w.key} · now` : w.label}</span>
              {w.result ? (
                <span className={cx('text-[11px] font-bold', on ? 'text-white' : w.result === 'W' ? 'text-v3-gain' : w.result === 'L' ? 'text-v3-cost' : 'text-v3-ink2')}>
                  {w.result}{w.mark ? (w.mark === 'bad' ? ' ✕' : ' ✓') : ''}
                </span>
              ) : w.mark ? <span className={cx('text-[11px]', on ? 'text-white' : w.mark === 'bad' ? 'text-v3-cost' : 'text-v3-gain')}>{w.mark === 'bad' ? '✕' : '✓'}</span> : null}
            </>
          )
          return (
            <li key={w.key} data-on={on ? 'true' : undefined}>
              {w.disabled ? (
                <span className={cls}>{inner}</span>
              ) : (
                <button type="button" aria-pressed={on} aria-current={w.now ? 'date' : undefined} onClick={() => onSelect(w.key)} className={cx(cls, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call')}>
                  {inner}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* What one week holds: its result as two bars on ONE max (scaled apart the
   margin — the only thing the card is for — would be unreadable), and the
   calls Juke logged in it with their verdicts. The winner is read from the
   platform's stated result, never by comparing the points. */
function WeekPanel({ weekKey, league, snapshot, decisions }) {
  if (weekKey === 'draft') {
    return (
      <p className="text-[15px] leading-[1.55] text-v3-ink2">
        Draft picks live with the draft that made them rather than in the call ledger. Your league&apos;s own draft is graded further down this page; every mock you have run is in <a href="#/record" className="font-semibold text-v3-ink underline decoration-v3-rule underline-offset-4 hover:decoration-v3-ink">your record</a>.
      </p>
    )
  }
  const n = Number(weekKey)
  const game = gameInWeek(snapshot.schedule, league.ownerId, n)
  const opp = game && game.opponentId ? (snapshot.teams || []).find((t) => String(t.ownerId) === String(game.opponentId)) : null
  const rows = decisionsForWeek(league.leagueId, n, decisions)
  const scored = game && typeof game.points === 'number' && typeof game.opponentPoints === 'number' && game.result
  const max = scored ? Math.max(game.points, game.opponentPoints, 1) : 0
  const margin = scored ? game.points - game.opponentPoints : null
  const isNow = n === snapshot.week
  const good = rows.filter((r) => r.verdict === 'good').length
  const bad = rows.filter((r) => r.verdict === 'bad').length
  const pending = rows.length - good - bad

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <Label>Week {n} · {isNow ? 'this week' : game && game.playoff ? 'playoff week' : 'result'}</Label>
        {scored ? (
          <>
            <p className={cx('mt-2 text-[20px] font-extrabold', game.result === 'W' ? 'text-v3-gain' : game.result === 'L' ? 'text-v3-cost' : 'text-v3-ink')}>
              {game.result === 'W' ? `Won by ${Math.abs(margin).toFixed(1)}` : game.result === 'L' ? `Lost by ${Math.abs(margin).toFixed(1)}` : `Tied at ${game.points.toFixed(1)}`}
            </p>
            <div className="mt-3 grid gap-2">
              {[{ name: 'You', v: game.points }, { name: opp ? opp.teamName : 'Opponent', v: game.opponentPoints, team: opp }].map((r) => (
                <div key={r.name} className="grid grid-cols-[minmax(0,8rem)_1fr_3.5rem] items-center gap-3">
                  {r.team ? <a href={teamHref(r.team)} className="truncate text-[14px] font-semibold text-v3-ink underline decoration-v3-rule underline-offset-4 hover:decoration-v3-ink">{r.name}</a> : <span className="truncate text-[14px] font-semibold text-v3-ink">{r.name}</span>}
                  <ValueBar value={r.v} max={max} tone="neutral" />
                  <Fig className="text-right text-[14px] font-bold text-v3-ink">{r.v.toFixed(1)}</Fig>
                </div>
              ))}
            </div>
          </>
        ) : isNow ? (
          <p className="mt-2 text-[15px] leading-[1.55] text-v3-ink2">
            {opp ? <>This week you play <a href={teamHref(opp)} className="font-semibold text-v3-ink underline decoration-v3-rule underline-offset-4 hover:decoration-v3-ink">{opp.teamName}</a>. </> : game ? 'A bye week. ' : ''}
            The matchup, the swap and the claim are on <a href="#/" className="font-semibold text-v3-ink underline decoration-v3-rule underline-offset-4 hover:decoration-v3-ink">this week&apos;s call sheet</a>.
          </p>
        ) : (
          <p className="mt-2 text-[15px] text-v3-ink2">{game ? (opp ? 'No score published for this week yet.' : 'A bye week — no game.') : `${platformFor(league.provider).name} publishes no season schedule on the snapshot; the matchup page reads its pairings a week at a time.`}</p>
        )}
        <div className="mt-4"><GoLink href={matchupHref(n)}>{isNow ? 'This week’s matchup' : `Week ${n}’s matchup`}</GoLink></div>
      </div>
      <div>
        <Label>Calls logged{rows.length ? ` · ${[good && `${good} good`, bad && `${bad} bad`, pending && `${pending} not yet graded`].filter(Boolean).join(' · ')}` : ''}</Label>
        {rows.length ? (
          <ul className="mt-2 grid">
            {rows.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-v3-rule py-2.5 last:border-b-0">
                <span className="font-figure text-[11px] font-bold uppercase tracking-[0.1em] text-v3-ink3">{d.room || 'call'}</span>
                <span className="min-w-0 flex-1 text-[15px] text-v3-ink">{d.said || '—'} <span className="text-v3-ink3">→ {d.did || '—'}</span></span>
                <Verdict verdict={d.verdict} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[15px] leading-[1.55] text-v3-ink2">No calls were logged in week {n}. A call is recorded when Juke makes it and graded after the week is played.</p>
        )}
      </div>
    </div>
  )
}

function SeasonNumbers({ league, snapshot, odds, games }) {
  const st = standing(snapshot, league.ownerId)
  const me = st.me
  if (!me || !st.played) return null
  const pfD = (me.pointsFor || 0) - st.pfMedian
  const paD = (me.pointsAgainst || 0) - st.paMedian
  const mine = oddsFor(odds, me.ownerId)
  const played = (games || []).filter((g) => g.result)
  const items = [
    mine && typeof mine.playoffs === 'number'
      ? {
          label: 'Playoff odds',
          value: pct(mine.playoffs),
          note: `${ordinal(st.rank)} of ${st.table.length} now${odds.byeSeats && typeof mine.bye === 'number' ? `, a bye in ${pct(mine.bye)}` : ''}. ${SIMS.toLocaleString()} seasons from today’s projections.`,
          children: <ValueBar value={mine.playoffs} max={1} tone="neutral" className="mt-3" />,
        }
      : { label: 'Standing', value: ordinal(st.rank), note: `Of ${st.table.length}, on wins then points for.` },
    {
      label: 'Record',
      value: recordText(me),
      note: 'As your platform reports it.',
      children: played.length ? <div className="mt-3 flex flex-wrap gap-1">{played.map((g) => <ResultChip key={g.week} result={g.result} />)}</div> : null,
    },
    {
      label: 'Points for',
      value: (me.pointsFor || 0).toFixed(1),
      delta: <Delta value={pfD} digits={1} className="text-[15px]" />,
      note: `Against a league median of ${st.pfMedian.toFixed(1)}.`,
    },
    {
      label: 'Points against',
      value: (me.pointsAgainst || 0).toFixed(1),
      /* Signed by direction here, coloured by meaning: conceding more than
         the league is bad AND the number went up, so the sign says + and
         the colour says cost. Production printed "−10.8" for a value 10.8
         above the median once; CLAUDE.md's rule is to write it here. */
      delta: <Delta value={paD} digits={1} tone={paD > 0 ? 'cost' : paD < 0 ? 'gain' : 'even'} className="text-[15px]" />,
      note: `Against a league median of ${st.paMedian.toFixed(1)}. Conceding more is the bad direction.`,
    },
  ]
  return <KpiGrid items={items} />
}

function Standings({ snapshot, ownerId, odds }) {
  const st = standing(snapshot, ownerId)
  const cut = st.played && snapshot.playoffTeams && snapshot.playoffTeams < st.table.length ? snapshot.playoffTeams : null
  const hasOdds = !!(odds && odds.playoffTeams)
  /* Which teams moved more than one place since the last reading: those are
     the story, so they slide ABOVE the rows they pass (the others only step
     aside by one). Read from the previous render's order. */
  const lastOrder = useRef(null)
  const rowKey = (t, i) => t.rosterId ?? t.ownerId ?? i
  const prev = lastOrder.current
  const jumped = new Set()
  if (prev) st.table.forEach((t, i) => { const was = prev.get(rowKey(t, i)); if (was !== undefined && Math.abs(was - i) > 1) jumped.add(rowKey(t, i)) })
  useEffect(() => { lastOrder.current = new Map(st.table.map((t, i) => [rowKey(t, i), i])) })
  return (
    <Sheet code="Standings" aside="Wins, then points for" bodyClass="p-0">
      <div className="overflow-x-auto">
        <table className="border-0 rounded-none w-full min-w-[330px] table-fixed border-collapse bg-v3-sheet text-left">
          <thead>
            <tr className="border-b border-v3-rule">
              <th scope="col" className="border-0 bg-v3-sheet w-8 py-2.5 pl-3 pr-0 font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3 sm:w-12 sm:pl-5">#</th>
              <th scope="col" className="border-0 bg-v3-sheet py-2.5 pl-1 pr-2 font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3">Team</th>
              <th scope="col" className="border-0 bg-v3-sheet w-[44px] px-1 py-2.5 text-right font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3 sm:w-[60px] sm:px-2">W-L</th>
              <th scope="col" className="border-0 bg-v3-sheet w-[50px] px-1 py-2.5 text-right font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3 sm:w-[72px] sm:px-2">PF</th>
              <th scope="col" className={cx('border-0 bg-v3-sheet py-2.5 pl-1 text-right font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3 sm:pl-2', hasOdds ? 'w-[50px] pr-1 sm:w-[72px] sm:pr-2' : 'w-[60px] pr-3 sm:w-[84px] sm:pr-5')}>PA</th>
              {hasOdds ? <th scope="col" className="border-0 bg-v3-sheet w-[56px] py-2.5 pl-1 pr-3 text-right font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3 sm:w-[168px] sm:pl-2 sm:pr-5"><span className="sm:hidden" aria-hidden="true">Odds</span><span className="sr-only sm:not-sr-only">Playoffs</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {/* flatMap, not map: each team's row and the playoff line are
                siblings in ONE keyed list. Returned as a nested array, React
                keyed every row by its index in the table, so a team that
                moved was a new row — nothing to slide, and every cell in it
                re-mounted. */}
            {st.table.flatMap((t, i) => {
              const you = ownerId && String(t.ownerId) === String(ownerId)
              const o = hasOdds ? oddsFor(odds, t.ownerId) : null
              const p = o ? o.playoffs : null
              return [
                cut && i === cut ? (
                  <tr key={`cut-${i}`} aria-hidden="true">
                    <td colSpan={hasOdds ? 6 : 5} className="border-0 px-4 py-1.5 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="h-px flex-1 border-t-2 border-dashed border-v3-ink3" />
                        <span className="font-figure text-[11px] font-bold uppercase tracking-[0.12em] text-v3-ink2">Playoff line · top {cut} today</span>
                        <span className="h-px flex-1 border-t-2 border-dashed border-v3-ink3" />
                      </div>
                    </td>
                  </tr>
                ) : null,
                /* A team that moves in the table slides to its new place
                   rather than the rows swapping under the reader's eye —
                   the table is a ranking, and a rank is where you are
                   relative to everybody else. Keyed on the roster, so the
                   row is the team and not the slot. */
                <motion.tr {...LAYOUT_ROW} key={rowKey(t, i)} data-team-row={rowKey(t, i)} className={cx('border-b border-v3-rule last:border-b-0 [&>td]:bg-inherit', you ? 'bg-v3-paper shadow-[inset_3px_0_0_rgb(var(--v3-ink))]' : 'bg-v3-sheet', jumped.has(rowKey(t, i)) && 'relative z-[2]')}>
                  <td className="border-0 py-3 pl-3 pr-0 font-figure text-[14px] tabular-nums text-v3-ink2 sm:pl-5">{st.played ? i + 1 : '—'}</td>
                  <td className="border-0 max-w-0 py-3 pl-1 pr-2">
                    <span className="flex min-w-0 items-center gap-2 overflow-hidden">
                      <a href={teamHref(t)} className="min-w-0 truncate text-[15px] font-semibold text-v3-ink underline decoration-transparent underline-offset-4 hover:decoration-v3-ink focus-visible:decoration-v3-ink">{t.teamName}</a>
                      {you ? <span className="shrink-0 rounded-[4px] bg-v3-band px-1.5 py-0.5 font-figure text-[11px] font-bold uppercase tracking-[0.1em] text-white">You</span> : null}
                    </span>
                    {t.manager && t.manager !== t.teamName ? <span className="mt-0.5 block truncate text-[13px] text-v3-ink3">{t.manager}</span> : null}
                  </td>
                  <td className="border-0 px-1 py-3 text-right font-figure text-[14px] tabular-nums text-v3-ink sm:px-2">{recordText(t)}</td>
                  <td className="border-0 px-1 py-3 text-right font-figure text-[14px] tabular-nums text-v3-ink2 sm:px-2">{(t.pointsFor || 0).toFixed(1)}</td>
                  <td className={cx('border-0 py-3 pl-1 text-right font-figure text-[14px] tabular-nums text-v3-ink2 sm:pl-2', hasOdds ? 'pr-1 sm:pr-2' : 'pr-3 sm:pr-5')}>{(t.pointsAgainst || 0).toFixed(1)}</td>
                  {hasOdds ? (
                    <td className="border-0 py-3 pl-1 pr-3 sm:pl-2 sm:pr-5">
                      <span className="flex items-center justify-end gap-2">
                        <ValueBar value={p} max={1} tone="neutral" className="hidden w-[96px] sm:block" />
                        <CountText text={pct(p)} className="text-right font-figure text-[14px] font-bold tabular-nums text-v3-ink" />
                      </span>
                    </td>
                  ) : null}
                </motion.tr>,
              ]
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-v3-rule px-4 py-3 text-[13px] leading-[1.5] text-v3-ink3 sm:px-5">
        {st.played ? 'Wins, then points for — Juke’s tiebreak, which a league with its own may not share.' : 'No games played yet, so there is no order — the rank is a dash rather than the order the platform lists its teams in.'}
        {hasOdds ? ` Playoffs: ${SIMS.toLocaleString()} seasons from today’s projections.` : ''} Every team opens its own page.
      </p>
    </Sheet>
  )
}

function DisconnectButton({ league }) {
  const { remove } = useLeagueFresh()
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => { if (!armed) return undefined; const id = setTimeout(() => setArmed(false), 6000); return () => clearTimeout(id) }, [armed])
  const press = async () => {
    if (!armed) { setArmed(true); setFailed(false); return }
    setBusy(true)
    const res = await remove(league)
    setBusy(false)
    setArmed(false)
    if (!res.ok) setFailed(true)
  }
  return (
    <div>
      <button
        type="button"
        onClick={press}
        disabled={busy}
        className={cx('inline-flex min-h-[44px] items-center rounded-[6px] border px-4 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call', armed ? 'border-v3-cost bg-v3-costWash text-v3-cost' : 'border-v3-rule text-v3-ink2 hover:text-v3-ink')}
      >
        {busy ? 'Disconnecting…' : armed ? `Press again to disconnect ${league.name}` : 'Disconnect this league'}
      </button>
      {failed ? <p className="mt-2 text-[13px] text-v3-cost" role="alert">Could not disconnect just now — the league is still connected.</p> : null}
    </div>
  )
}

function Facts({ league, snapshot }) {
  const platform = platformFor(league.provider).name
  const w = tradeWindow(snapshot.tradeDeadline, { week: snapshot.week })
  const waiver = snapshot.waiver || null
  const rows = [
    ['Season', snapshot.season],
    ['Teams', snapshot.totalTeams],
    snapshot.week ? ['Week', snapshot.week] : null,
    snapshot.playoffTeams ? ['Playoff spots', snapshot.playoffTeams] : null,
    snapshot.schedule && snapshot.schedule.regularSeasonWeeks ? ['Regular season', `${snapshot.schedule.regularSeasonWeeks} weeks`] : null,
    waiver ? ['Waivers', waiver.type === 'faab' ? `FAAB · $${waiver.budget || snapshot.waiverBudget || '—'}` : 'Order'] : null,
    w.state === 'open' ? ['Trade deadline', w.at ? whenText(w.at, false) : `After week ${w.week}`] : w.state === 'passed' ? ['Trade deadline', 'Passed'] : w.state === 'disabled' ? ['Trading', 'Off'] : null,
    snapshot.draftAt && snapshot.draftStatus !== 'complete' ? ['Draft', whenText(snapshot.draftAt)] : null,
  ].filter(Boolean)
  return (
    <Sheet code="The league" aside={platform}>
      <p className="text-[20px] font-extrabold tracking-[-0.01em] text-v3-ink">{snapshot.name || league.name}</p>
      <dl className="mt-3 divide-y divide-v3-rule">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-[14px] text-v3-ink2">{k}</dt>
            <dd className="text-right font-figure text-[14px] font-semibold tabular-nums text-v3-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-v3-rule pt-3 text-[13px] leading-[1.5] text-v3-ink3">Read from {platform}. Juke never writes to your league.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <DisconnectButton league={league} />
      </div>
    </Sheet>
  )
}

function DraftBanner({ snapshot }) {
  const d = useDraftPhase(snapshot.draftAt, snapshot.draftStatus)
  if (d.phase !== 'soon' && d.phase !== 'drafting' && d.phase !== 'late') return null
  return (
    <Sheet code={d.phase === 'drafting' ? 'Drafting now' : d.phase === 'late' ? 'Draft time passed' : 'Draft'} aside={snapshot.draftAt ? whenText(snapshot.draftAt) : null} role="status">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
        {d.parts ? <span className="font-figure text-[34px] font-bold leading-none tabular-nums text-v3-ink">{d.parts.full}</span> : null}
        <p className="text-[15px] leading-[1.55] text-v3-ink2">
          {d.phase === 'drafting'
            ? 'Your draft is running now — rosters fill here once your platform publishes it.'
            : d.phase === 'late'
              ? 'The scheduled time has passed. Rosters appear here once the draft runs.'
              : 'Rosters are empty until your league drafts. Everything else here is live.'}
        </p>
      </div>
    </Sheet>
  )
}

/* Screen 12's reachable half: the season itself, off the schedule, every
   figure exact. The habit card production's guide asks for needs graded
   decisions nothing writes yet, so it is absent rather than invented. */
function SeasonEnd({ league, snapshot }) {
  const s = useMemo(() => seasonSummary(snapshot.schedule, league.ownerId), [snapshot, league])
  if (!s) return null
  const record = `${s.won}-${s.lost}${s.tied ? '-' + s.tied : ''}`
  const diff = s.pointsFor - s.pointsAgainst
  const drawn = s.unlucky > 0 && s.unlucky >= s.outplayed
  const title = drawn
    ? `${s.unlucky} of your ${s.lost} losses outscored the league`
    : s.lost > 0 ? `${s.outplayed} of your ${s.lost} losses were under the league’s own week` : `${record}, and nothing to answer for`
  return (
    <Sheet code="The season, closed out" aside={record}>
      <p className="text-[22px] font-extrabold leading-tight tracking-[-0.01em] text-v3-ink">{title}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[15px] text-v3-ink2">
        <Fig className="text-v3-ink">{s.pointsFor.toFixed(1)}</Fig> for, <Fig className="text-v3-ink">{s.pointsAgainst.toFixed(1)}</Fig> against over {s.played} weeks —
        <Delta value={diff} digits={1} /> net.
        {s.narrowest ? ` The closest loss was week ${s.narrowest.week}, by ${s.narrowest.margin.toFixed(1)}.` : ''}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <QuietButton href="#/draft">Mock a {snapshot.totalTeams}-team board for next year</QuietButton>
      </div>
    </Sheet>
  )
}

/* The league's own draft, graded by the same engine that grades a mock —
   leagueDraftReport() swaps two pointers and mutates nothing, so a mock in
   progress cannot be disturbed. A letter sits beside its finishing place,
   never beside a number out of a hundred. Absent when there is no draft or
   the draft type's seat maths is not modelled. */
function DraftReport({ league, snapshot, ready }) {
  const report = useMemo(() => {
    const e = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!ready || !e || !e.leagueDraftReport || !snapshot.draft) return null
    try {
      return e.leagueDraftReport({ draft: snapshot.draft, lineup: snapshot.lineup, rules: snapshot.rules, teams: snapshot.teams, ownerId: league.ownerId })
    } catch {
      return null
    }
  }, [ready, snapshot, league])
  if (!report || report.unsupported || !report.seats) return null
  const seats = [...report.seats].sort((a, b) => (a.rank || 99) - (b.rank || 99))
  const mine = seats.find((s) => s.mine)
  return (
    <Sheet code="Your league’s draft, graded" aside={`${report.counted} picks`} bodyClass="p-0">
      {mine ? (
        <p className="px-4 pt-4 text-[15px] text-v3-ink2 sm:px-5">
          You graded <span className="font-figure text-[18px] font-bold text-v3-ink">{mine.grade}{mine.rank ? ` · ${ordinal(mine.rank)} of ${seats.length}` : ''}</span>
        </p>
      ) : null}
      <div className="mt-2 overflow-x-auto">
        <table className="border-0 rounded-none w-full bg-v3-sheet text-left">
          <tbody>
            {seats.map((s) => {
              const team = findTeam(snapshot, s.teamId)
              return (
                <tr key={s.teamId} className={cx('border-t border-v3-rule', s.mine ? 'bg-v3-paper shadow-[inset_3px_0_0_rgb(var(--v3-ink))]' : '')}>
                  <td className="border-0 max-w-0 px-4 py-2.5 sm:px-5">
                    {team ? <a href={teamHref(team)} className="block truncate text-[14px] font-semibold text-v3-ink underline decoration-transparent underline-offset-4 hover:decoration-v3-ink">{s.name}</a> : <span className="block truncate text-[14px] font-semibold text-v3-ink">{s.name}</span>}
                  </td>
                  <td className="border-0 whitespace-nowrap px-4 py-2.5 text-right font-figure text-[14px] font-bold text-v3-ink sm:px-5">
                    {s.grade || '—'}{s.rank ? <span className="font-medium text-v3-ink2"> · {ordinal(s.rank)}</span> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-v3-rule px-4 py-3 text-[13px] leading-[1.5] text-v3-ink3 sm:px-5">
        {report.scored === 'league' ? 'Graded under your league’s own scoring and lineup.' : 'Graded on default scoring — your league’s rules could not be read.'}
        {report.unplaceable ? ` ${report.unplaceable} pick${report.unplaceable === 1 ? '' : 's'} could not be priced and ${report.unplaceable === 1 ? 'is' : 'are'} left out.` : ''}
      </p>
    </Sheet>
  )
}

function Connected({ league }) {
  const { decisions } = useDecisionsFresh()
  const { snapshot, status, reason } = useSnapshotFresh(league.leagueId, league.provider)
  const ready = status === 'ready' && !!snapshot
  const model = useLeagueModel(league, ready ? snapshot : null)
  const [openWeek, setOpenWeek] = useState(null)
  const platform = platformFor(league.provider).name

  const games = useMemo(() => (ready ? myGames(snapshot.schedule, league.ownerId) : null), [ready, snapshot, league])
  const weeks = useMemo(
    () => (ready && underWay(seasonPhase(snapshot)) ? seasonWeeks(snapshot, league.leagueId, decisions, games) : null),
    [ready, snapshot, league.leagueId, decisions, games]
  )

  let lede = null
  if (ready) {
    const st = standing(snapshot, league.ownerId)
    lede = [
      PHASE_LABEL[seasonPhase(snapshot)],
      snapshot.week ? `Week ${snapshot.week}` : null,
      st.me ? `${st.me.teamName} ${recordText(st.me)}` : null,
      st.rank ? `${ordinal(st.rank)} of ${st.table.length}` : null,
    ].filter(Boolean).join(' · ')
  } else if (status === 'loading') lede = `Reading ${league.name} from ${platform}…`

  const head = <PageHead label={`League · ${platform} · read-only`} title={ready ? snapshot.name || league.name : league.name} lede={lede} action={<LeagueSwitcher />} />

  if (!ready) {
    return (
      <div className="grid gap-10">
        {head}
        {status === 'loading' || status === 'none'
          ? <Sheet band={false} aria-busy="true"><Skeleton lines={8} /></Sheet>
          : <CouldNotRead reason={reason} platform={platform} onRetry={() => retrySnapshot(league.leagueId, league.provider)}><QuietButton href="#/account">Manage leagues</QuietButton></CouldNotRead>}
      </div>
    )
  }

  const phase = seasonPhase(snapshot)
  /* The resting cell is this week — or, once the season has run past its
     last scheduled week, the last week that has a result, so the panel
     never opens onto a week the strip does not draw. */
  const restKey = weeks
    ? (weeks.some((w) => w.key === String(snapshot.week))
      ? String(snapshot.week)
      : ([...weeks].reverse().find((w) => w.result) || { key: 'draft' }).key)
    : null
  const selected = openWeek || restKey

  return (
    <div className="grid gap-8">
      {head}
      <DraftBanner snapshot={snapshot} />
      {phase === 'complete' ? <SeasonEnd league={league} snapshot={snapshot} /> : null}
      <SeasonNumbers league={league} snapshot={snapshot} odds={model.odds} games={games} />

      {weeks ? (
        <Sheet code="Week by week" aside={snapshot.schedule && snapshot.schedule.regularSeasonWeeks ? `${snapshot.schedule.regularSeasonWeeks}-week regular season` : null} bodyClass="p-3 sm:p-4">
          <WeekStrip weeks={weeks} selected={selected} onSelect={(k) => setOpenWeek(k)} />
          <div className="mt-3 border-t border-v3-rule px-1 pt-4 sm:px-2">
            <WeekPanel weekKey={selected} league={league} snapshot={snapshot} decisions={decisions} />
          </div>
        </Sheet>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Standings snapshot={snapshot} ownerId={league.ownerId || null} odds={model.odds} />
        <div className="grid gap-4">
          <Facts league={league} snapshot={snapshot} />
          <DraftReport league={league} snapshot={snapshot} ready={model.ready} />
          <div className="flex flex-wrap items-center gap-3 px-1">
            <GoLink href="#/">This week&apos;s call sheet</GoLink>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function V3League() {
  const { status, league, retry } = useLeagueFresh()

  if (status === 'loading') {
    return (
      <div className="grid gap-10">
        <PageHead label="League" title="League" lede="Checking which league is yours…" />
        <Sheet band={false} aria-busy="true"><Skeleton lines={6} /></Sheet>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="grid gap-10">
        <PageHead label="League" title="League" />
        <Sheet code="Could not load your leagues" role="alert">
          <p className="max-w-[62ch] text-[15px] leading-[1.55] text-v3-ink2">
            Nothing has been disconnected and your leagues are still on your account — this page could not reach it to read them. Mock drafts are unaffected and need no account.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <QuietButton onClick={retry}>Try again</QuietButton>
            <QuietButton href="#/draft">Start a mock draft</QuietButton>
          </div>
        </Sheet>
      </div>
    )
  }

  if (status !== 'connected' || !league) {
    return (
      <div>
        <PageHead
          label="League · sample"
          title="Your league, read and priced."
          lede="Standings with every team’s playoff odds, the season week by week, and every call Juke makes on your roster — read from your real league, never written to it. Until one is connected, this is a sample league on tonight’s real players."
        />
        <LeagueDemo />
      </div>
    )
  }

  return <Connected key={league.provider + ':' + league.leagueId} league={league} />
}

