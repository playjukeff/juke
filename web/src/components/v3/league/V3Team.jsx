import { useMemo } from 'react'
import { retrySnapshot } from '../../../hooks/useLeague.js'
import { useLeagueFresh, useSnapshotFresh } from '../../v2/stores.js'
import { useLeagueModel } from '../../v2/league/useLeagueModel.js'
import { injurySeverity } from '../../rooms/strategyBoard.js'
import { rosterTotal, valueOf } from '../../rooms/tradeBoard.js'
import { myGames } from '../../../lib/schedule.js'
import { oddsFor, SIMS } from '../../../lib/seasonSim.js'
import { platformFor } from '../../shell/leaguePlatforms.js'
import {
  Delta, Fig, GoLink, Icon, Label, PageHead, PosTag, QuietButton, Sheet, Skeleton, cx, ordinal,
} from '../ui.jsx'
import { findTeam, recordText, standing, teamHref, teamWeekRows, usePricing } from './leagueData.js'
import { ConnectCall, CouldNotRead, InjuryChip, KpiGrid, ResultChip, pct } from './parts.jsx'
import { matchupHref } from './matchupData.js'

/* #/league/team/<id> — any team in a connected league.

   Production opened a team's roster in place under its standings row; v3
   gives it an address, so a rival can be read — and linked to from the
   matchup, the schedule and the draft report — the way the reader's own
   team is. <id> is the snapshot's rosterId (ownerId is accepted too, since
   that is what a schedule names a team by).

   ---- Two values per player, in two units, never added ----

   THIS WEEK is the league's own week scorer (leagueWeekPts(): the
   platform's projection, then Juke's weekly block, then the season average,
   bye zeroed) — the number a lineup is set on. SEASON is points over
   replacement (replacementGap(), through tradeBoard's valueOf) — the
   number a trade is priced in. Kickers and defenses get a week and a dash
   for the season, because Juke declines to rank them.

   The roster is read in lineup order — starters as the league fields them,
   then the bench — which is production's TeamRoster order and the reason
   tradeBoard.rosterValues() stopped sorting by value. */

function PlayerCell({ player, id }) {
  if (!player) {
    return <span className="text-[15px] text-v3-ink3">{id} · not on the board</span>
  }
  const sev = injurySeverity(player.inj)
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0">
        <a href={`#/players/${encodeURIComponent(String(player.id))}`} className="block truncate text-[15px] font-semibold text-v3-ink underline decoration-transparent underline-offset-4 hover:decoration-v3-ink focus-visible:decoration-v3-ink">
          {player.name}
        </a>
        <span className="block truncate font-figure text-[12px] uppercase tracking-[0.06em] text-v3-ink3">
          {player.team || 'FA'}{player.bye ? ` · bye ${player.bye}` : ''}{player.locked ? ' · game started' : ''}
        </span>
      </span>
      {sev ? <InjuryChip severity={sev} code={player.inj} /> : null}
    </span>
  )
}

function RosterTable({ team, pricing, snapshot }) {
  const { byId, gapOf, weekPts, week } = pricing
  const starting = new Set((team.starters || []).map(String))
  const ids = [
    ...(team.starters || []).map(String).filter((id) => id && id !== '0'),
    ...(team.players || []).map(String).filter((id) => !starting.has(id)),
  ]
  const wk = teamWeekRows(team, pricing, snapshot)
  const value = gapOf ? rosterTotal(team, byId, gapOf) : null

  if (!ids.length) {
    return (
      <Sheet code="Roster" aside="Empty">
        <p className="text-[15px] text-v3-ink2">No roster yet — this league has not drafted.</p>
      </Sheet>
    )
  }

  return (
    <Sheet code="Roster · lineup order" aside={week ? `Week ${week}` : null} bodyClass="p-0">
      <div className="overflow-x-auto">
        <table className="border-0 rounded-none w-full min-w-[330px] table-fixed border-collapse bg-v3-sheet text-left">
          <thead>
            <tr className="border-b border-v3-rule">
              <th scope="col" className="border-0 bg-v3-sheet w-[64px] py-2.5 pl-4 font-figure text-[12px] font-semibold uppercase tracking-[0.12em] text-v3-ink3 sm:pl-5">Slot</th>
              <th scope="col" className="border-0 bg-v3-sheet py-2.5 pr-2 font-figure text-[12px] font-semibold uppercase tracking-[0.12em] text-v3-ink3">Player</th>
              <th scope="col" className="border-0 bg-v3-sheet w-[76px] px-2 py-2.5 text-right font-figure text-[12px] font-semibold uppercase tracking-[0.12em] text-v3-ink3">This wk</th>
              <th scope="col" className="border-0 bg-v3-sheet w-[76px] py-2.5 pl-2 pr-4 text-right font-figure text-[12px] font-semibold uppercase tracking-[0.12em] text-v3-ink3 sm:w-[92px] sm:pr-5">Season</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id, n) => {
              const p = byId.get(id)
              const bench = !starting.has(id)
              // Once he has actually scored, that is the number this column
              // shows — never a projection a total elsewhere has moved past.
              const actual = p && p.actualPts
              const pts = typeof actual === 'number' && Number.isFinite(actual)
                ? actual
                : p && weekPts ? weekPts(p) : null
              const season = p ? valueOf(p, gapOf) : null
              return [
                bench && n > 0 && starting.has(ids[n - 1]) ? (
                  <tr key="bench-rule" aria-hidden="true"><td colSpan={4} className="border-0 bg-v3-paper px-4 py-1.5 font-figure text-[12px] font-bold uppercase tracking-[0.12em] text-v3-ink3 sm:px-5">Bench</td></tr>
                ) : null,
                <tr key={id + n} className="border-b border-v3-rule last:border-b-0">
                  <td className="border-0 py-2.5 pl-4 sm:pl-5">
                    {bench ? <span className="inline-flex h-[22px] min-w-[34px] items-center justify-center rounded-[4px] bg-v3-well px-1.5 font-figure text-[12px] font-bold text-v3-ink2">BN</span> : p ? <PosTag pos={p.pos} /> : <span className="font-figure text-[12px] text-v3-ink3">—</span>}
                  </td>
                  <td className="border-0 w-full max-w-0 py-2.5 pr-2">
                    <span className="flex items-center gap-2">
                      {bench && p ? <PosTag pos={p.pos} className="hidden sm:inline-flex" /> : null}
                      <PlayerCell player={p} id={id} />
                    </span>
                  </td>
                  <td className={cx('border-0 px-2 py-2.5 text-right font-figure text-[15px] tabular-nums', bench ? 'text-v3-ink2' : 'font-bold text-v3-ink')}>
                    {typeof pts === 'number' ? pts.toFixed(1) : '—'}
                  </td>
                  <td className="border-0 py-2.5 pl-2 pr-4 text-right sm:pr-5">
                    {season === null ? <span className="font-figure text-[15px] text-v3-ink3">—</span> : <Delta value={season} className="text-[15px]" />}
                  </td>
                </tr>,
              ]
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-v3-ink">
              <td className="border-0 py-3 pl-4 sm:pl-5" />
              <td className="border-0 py-3 pr-2 text-[15px] font-semibold text-v3-ink">
                Starters, as set{value ? <span className="block text-[12px] font-normal text-v3-ink3">Season: {value.priced} of {value.held} priced</span> : null}
              </td>
              <td className="border-0 px-2 py-3 text-right font-figure text-[15px] font-bold tabular-nums text-v3-ink">{wk.total === null ? '—' : wk.total.toFixed(1)}</td>
              <td className="border-0 py-3 pl-2 pr-4 text-right sm:pr-5">{value ? <Delta value={value.total} className="text-[15px]" /> : <span className="font-figure text-v3-ink3">—</span>}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="border-t border-v3-rule px-4 py-3 text-[13px] leading-[1.5] text-v3-ink3 sm:px-5">
        This week is points under {snapshot.rules ? 'your league’s scoring' : 'default scoring — your league’s rules could not be read'}{wk.source === 'all' ? `, ${platformFor(snapshot.provider).name}'s own projection` : wk.source === 'some' ? `, ${platformFor(snapshot.provider).name}'s projection where it has one` : ''}. Season is projected points over a replacement starter — the unit a trade is priced in. The two are never added. Kickers and defenses are not given a season value.
      </p>
    </Sheet>
  )
}

function Schedule({ team, snapshot, mine }) {
  const games = myGames(snapshot.schedule, team.ownerId)
  const teams = snapshot.teams || []
  if (!games) {
    return (
      <Sheet code="Schedule" aside="Not published">
        <p className="text-[15px] leading-[1.55] text-v3-ink2">{platformFor(snapshot.provider).name} does not publish a season schedule on the snapshot, so there is no schedule here. It publishes each week's pairing on its own, and the matchup page reads them.</p>
        <div className="mt-4"><GoLink href={matchupHref(snapshot.week, team, mine)}>{snapshot.week ? `Week ${snapshot.week}'s matchup, and every week` : 'The matchup page'}</GoLink></div>
      </Sheet>
    )
  }
  return (
    <Sheet code="Schedule" aside={snapshot.schedule.regularSeasonWeeks ? `${snapshot.schedule.regularSeasonWeeks}-week regular season` : null} bodyClass="p-0">
      <ol>
        {games.map((g) => {
          const opp = g.opponentId ? teams.find((t) => String(t.ownerId) === String(g.opponentId)) : null
          const now = g.week === snapshot.week
          return (
            <li key={g.week} className={cx('grid min-h-[48px] grid-cols-[44px_28px_minmax(0,1fr)_auto] items-center gap-2 border-b border-v3-rule px-4 last:border-b-0 sm:px-5', now ? 'bg-v3-paper shadow-[inset_3px_0_0_rgb(var(--v3-ink))]' : '')}>
              <a href={matchupHref(g.week, team, mine)} aria-label={`Week ${g.week} matchup`} className="inline-flex min-h-[44px] items-center font-figure text-[13px] text-v3-ink2 underline decoration-v3-rule underline-offset-4 hover:text-v3-ink hover:decoration-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">W{g.week}</a>
              <span className="text-[13px] text-v3-ink3">{opp ? (g.home ? 'vs' : 'at') : ''}</span>
              <span className="min-w-0 truncate text-[15px]">
                {opp ? <a href={teamHref(opp)} className="font-semibold text-v3-ink underline decoration-transparent underline-offset-4 hover:decoration-v3-ink">{opp.teamName}</a> : <span className="text-v3-ink3">Bye</span>}
                {g.playoff ? <span className="ml-2 font-figure text-[12px] uppercase tracking-[0.1em] text-v3-ink3">playoff</span> : null}
                {now ? <span className="ml-2 font-figure text-[12px] font-bold uppercase tracking-[0.1em] text-v3-ink">now</span> : null}
              </span>
              <span className="flex items-center gap-2">
                {typeof g.points === 'number' && typeof g.opponentPoints === 'number' && g.result ? (
                  <Fig className="text-[13px] text-v3-ink2">{g.points.toFixed(1)}–{g.opponentPoints.toFixed(1)}</Fig>
                ) : null}
                {g.result ? <ResultChip result={g.result} /> : null}
              </span>
            </li>
          )
        })}
      </ol>
    </Sheet>
  )
}

export default function V3Team({ teamId }) {
  const { status, league } = useLeagueFresh()
  const connected = status === 'connected' && !!league
  const { snapshot, status: snapStatus, reason } = useSnapshotFresh(connected ? league.leagueId : null, connected ? league.provider : null)
  const ready = snapStatus === 'ready' && !!snapshot
  const pricing = usePricing(ready ? snapshot : null)
  const model = useLeagueModel(league, ready ? snapshot : null)
  const team = useMemo(() => (ready ? findTeam(snapshot, decodeURIComponent(teamId || '')) : null), [ready, snapshot, teamId])
  const back = <QuietButton href="#/league"><Icon name="back" className="h-4 w-4" /> League</QuietButton>

  if (status === 'loading' || (connected && (snapStatus === 'loading' || snapStatus === 'none'))) {
    return (
      <div className="grid gap-section">
        <PageHead label="League · team" title="Reading the team…" action={back} />
        <Sheet band={false} aria-busy="true"><Skeleton lines={8} /></Sheet>
      </div>
    )
  }
  if (!connected) {
    return (
      <div className="grid gap-section">
        <PageHead label="League · team" title="Team pages are for a connected league." lede="Every team in your league gets a page — its roster priced this week and for the season, its record and its schedule. Connect a league and they open from the standings." action={<>{back}<ConnectCall primary /></>} />
      </div>
    )
  }
  const platform = platformFor(league.provider).name
  if (!ready) {
    return (
      <div className="grid gap-section">
        <PageHead label="League · team" title={league.name} action={back} />
        <CouldNotRead reason={reason} platform={platform} onRetry={() => retrySnapshot(league.leagueId, league.provider)} />
      </div>
    )
  }
  if (!team) {
    return (
      <div className="grid gap-section">
        <PageHead label={`League · ${snapshot.name}`} title="No team by that address." lede={`${snapshot.name} has ${(snapshot.teams || []).length} teams and none of them answers to “${teamId}”. Every team opens from the standings.`} action={back} />
      </div>
    )
  }

  const st = standing(snapshot, team.ownerId)
  const mine = league.ownerId && String(team.ownerId) === String(league.ownerId)
  const odds = oddsFor(model.odds, team.ownerId)
  const wk = teamWeekRows(team, pricing, snapshot)
  const played = (myGames(snapshot.schedule, team.ownerId) || []).filter((g) => g.result)
  const pfD = st.pfMedian === null ? null : (team.pointsFor || 0) - st.pfMedian
  const others = (snapshot.teams || []).filter((t) => t !== team)

  const lede = [
    team.manager && team.manager !== team.teamName ? team.manager : null,
    recordText(team),
    st.rank ? `${ordinal(st.rank)} of ${st.table.length}` : 'no games yet',
    odds && typeof odds.playoffs === 'number' ? `${pct(odds.playoffs)} to make the playoffs` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="grid gap-8">
      <PageHead label={`League · ${snapshot.name}${mine ? ' · your team' : ''}`} title={team.teamName} lede={lede} action={back} />

      <KpiGrid
        items={[
          { label: 'Record', value: recordText(team), note: st.rank ? `${ordinal(st.rank)} of ${st.table.length}, on wins then points for.` : 'No games played yet.', children: played.length ? <div className="mt-3 flex flex-wrap gap-1">{played.map((g) => <ResultChip key={g.week} result={g.result} />)}</div> : null },
          { label: 'Points for', value: (team.pointsFor || 0).toFixed(1), delta: st.played && pfD !== null ? <Delta value={pfD} digits={1} className="text-[15px]" /> : null, note: st.played ? `Against a league median of ${st.pfMedian.toFixed(1)}.` : 'Nothing scored yet.' },
          { label: `Week ${snapshot.week || ''} projected`.trim(), value: wk.total === null ? '—' : wk.total.toFixed(1), note: wk.total === null ? 'A starter has no projection, so there is no total.' : snapshot.rules ? 'As this lineup is set, under the league’s scoring.' : 'As this lineup is set, on default scoring — the league’s rules could not be read.' },
          { label: 'Playoff odds', value: odds && typeof odds.playoffs === 'number' ? pct(odds.playoffs) : '—', note: odds && typeof odds.playoffs === 'number' ? `${SIMS.toLocaleString()} seasons from today’s projections${model.odds && model.odds.byeSeats && typeof odds.bye === 'number' ? `; a bye in ${pct(odds.bye)}` : ''}.` : 'Only for a league with a published schedule and every roster priced.' },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <RosterTable team={team} pricing={pricing} snapshot={snapshot} />
        <div className="grid gap-4">
          <Schedule team={team} snapshot={snapshot} mine={(snapshot.teams || []).find((t) => league.ownerId && String(t.ownerId) === String(league.ownerId)) || null} />
          <Sheet band={false}>
            <Label>Every team in {snapshot.name}</Label>
            <ul className="mt-3 flex flex-wrap gap-2">
              {others.map((t) => (
                <li key={t.rosterId ?? t.ownerId}>
                  <a href={teamHref(t)} className="inline-flex min-h-[40px] items-center rounded-[6px] border border-v3-rule px-3 text-[15px] font-medium text-v3-ink hover:border-v3-ink3 hover:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
                    {t.teamName}{league.ownerId && String(t.ownerId) === String(league.ownerId) ? ' · you' : ''}
                  </a>
                </li>
              ))}
            </ul>
          </Sheet>
        </div>
      </div>
    </div>
  )
}
