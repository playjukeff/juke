import { useMemo, useRef, useState } from 'react'
import { retrySnapshot } from '../../../hooks/useLeague.js'
import { decisionsForWeek, weekMark } from '../../../hooks/useDecisions.js'
import { useDecisionsFresh as useDecisions, useLeagueFresh as useLeague, useSnapshotFresh as useLeagueSnapshot } from '../stores.js'
import { seasonPhase, underWay } from '../../../lib/seasonPhase.js'
import { ordered, hasPlayed } from '../../../lib/standings.js'
import { gameInWeek, myGames } from '../../../lib/schedule.js'
import { oddsFor, SIMS } from '../../../lib/seasonSim.js'
import { draftPhase } from '../../../lib/countdown.js'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { GhostButton, Kicker, Skeleton, Tween, VoltButton } from '../v2ui.jsx'
import { ordinal } from '../v2data.js'
import { CARD, DraftClock, KpiTile, Notice, PageHead, median, pct } from './parts.jsx'
import LeagueMenu from './LeagueMenu.jsx'
import LeagueDemo from './LeagueDemo.jsx'
import Standings from './Standings.jsx'
import { DraftReport, PastWeek, SeasonEnd, WeekStrip } from './WeekPanels.jsx'
import { useLeagueModel } from './useLeagueModel.js'

/* #/v2/league — the connected-league home, as a telemetry board.

   Same data and the same four states as production's MyLeagueScreen:
   leagueStore answers loading / none / connected / error, and "error" is
   drawn rather than collapsed into the demo — a failed read presenting as
   "you have no league" is the claim production was reported for making.
   The snapshot is the shared one (snapshotStore) and every number below
   is read off it or off a production module: standings.js for the order,
   seasonSim.js for the odds, schedule.js for results, decisionStore for
   the week marks. Nothing is re-derived. */

const PHASE_LABEL = { draft: 'Draft', 'in-season': 'In season', playoffs: 'Playoffs', complete: 'Season over' }

/* The league's own season length when its schedule publishes one (ESPN
   does, off playoffTierType); the NFL's eighteen weeks otherwise, which is
   production's fallback and never a guess at a fantasy calendar. The
   playoff marker sits where the regular season is READ to end. */
function realWeeks(snapshot, leagueId, decisions) {
  const s = snapshot.schedule
  const total = (s && s.weeks) || 18
  const regular = s && s.regularSeasonWeeks ? s.regularSeasonWeeks : null
  const current = snapshot.week
  const weeks = [{ key: 'draft', label: 'Draft' }]
  for (let n = 1; n <= total; n++) {
    if (regular && n === regular + 1) weeks.push({ key: 'po', label: 'Playoffs', divider: true })
    weeks.push({
      key: String(n),
      label: n === current ? `Wk ${n} · now` : `W${n}`,
      disabled: n > current,
      mark: weekMark(leagueId, n, decisions),
    })
  }
  return weeks
}

function Head({ league, snapshot, ready, loadingLine }) {
  const platform = platformFor(league.provider).name
  let lede = loadingLine
  if (ready) {
    const table = ordered(snapshot.teams || [])
    const me = league.ownerId ? table.find((t) => t.ownerId === league.ownerId) : null
    const rank = me && hasPlayed(table) ? table.indexOf(me) + 1 : null
    const phase = PHASE_LABEL[seasonPhase(snapshot)]
    lede = [
      phase,
      snapshot.week ? `Week ${snapshot.week}` : null,
      me ? `${me.teamName} ${me.wins}-${me.losses}${me.ties ? `-${me.ties}` : ''}` : null,
      rank ? `${ordinal(rank)} of ${table.length}` : null,
    ].filter(Boolean).join(' · ')
  }
  return (
    <PageHead
      kicker={`My league · ${platform} · read-only`}
      title={league.name}
      lede={lede}
      aside={<LeagueMenu />}
    />
  )
}

function Results({ games, week }) {
  if (!games) return null
  const played = games.filter((g) => g.result && g.week < (week || Infinity))
  if (!played.length) return null
  return (
    <ol className="mt-3 flex flex-wrap gap-1" aria-label="Results by week">
      {played.map((g) => (
        <li
          key={g.week}
          title={`Week ${g.week}: ${g.result === 'W' ? 'won' : g.result === 'L' ? 'lost' : 'tied'}`}
          className={`grid h-6 min-w-[24px] place-items-center rounded-[6px] px-1 font-mono text-[10px] font-semibold ring-1 ring-inset ${
            g.result === 'W' ? 'bg-white/[0.07] text-v2-ink ring-white/[0.12]' : g.result === 'L' ? 'bg-v2-loss/10 text-v2-loss ring-v2-loss/30' : 'text-v2-ink2 ring-white/[0.12]'
          }`}
        >
          {g.result}
        </li>
      ))}
    </ol>
  )
}

function Kpis({ league, snapshot, odds }) {
  const table = ordered(snapshot.teams || [])
  const me = league.ownerId ? table.find((t) => t.ownerId === league.ownerId) : null
  if (!me || !hasPlayed(table)) return null
  const rank = table.indexOf(me) + 1
  const pfMed = median(table.map((t) => t.pointsFor || 0))
  const paMed = median(table.map((t) => t.pointsAgainst || 0))
  const pfD = (me.pointsFor || 0) - pfMed
  const paD = (me.pointsAgainst || 0) - paMed
  const mine = oddsFor(odds, me.ownerId)
  const games = myGames(snapshot.schedule, league.ownerId)

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {mine && typeof mine.playoffs === 'number' ? (
        <KpiTile
          label="Playoff odds"
          value={<><Tween value={Math.round(mine.playoffs * 100)} />%</>}
          note={`${ordinal(rank)} of ${table.length} now${odds.byeSeats && typeof mine.bye === 'number' ? `, a bye in ${pct(mine.bye)}` : ''}. ${SIMS.toLocaleString()} seasons from today’s projections.`}
        >
          <span className="relative mt-3 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded-full bg-v2-cyan/80" style={{ width: `${mine.playoffs * 100}%` }} />
          </span>
        </KpiTile>
      ) : (
        <KpiTile label="Standing" value={ordinal(rank)} note={`Of ${table.length}, on wins then points for.`} />
      )}
      <KpiTile
        label="Record"
        value={`${me.wins}-${me.losses}${me.ties ? `-${me.ties}` : ''}`}
        note="As your platform reports it."
      >
        <Results games={games} week={snapshot.week} />
      </KpiTile>
      <KpiTile
        label="Points for"
        value={<Tween value={me.pointsFor || 0} digits={1} />}
        delta={Math.round(pfD * 10) === 0 ? null : `${pfD > 0 ? '+' : '−'}${Math.abs(pfD).toFixed(1)}`}
        deltaTone={pfD > 0 ? 'text-v2-volt' : 'text-v2-loss'}
        note={`Against a league median of ${pfMed.toFixed(1)}.`}
      />
      <KpiTile
        label="Points against"
        value={<Tween value={me.pointsAgainst || 0} digits={1} />}
        delta={Math.round(paD * 10) === 0 ? null : `${paD > 0 ? '+' : '−'}${Math.abs(paD).toFixed(1)}`}
        deltaTone={paD > 0 ? 'text-v2-loss' : 'text-v2-volt'}
        note={`Against a league median of ${paMed.toFixed(1)}. Conceding more is the bad direction.`}
      />
    </div>
  )
}

function Facts({ snapshot, league }) {
  const platform = platformFor(league.provider).name
  const when = (ms) => {
    try {
      return new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    } catch {
      return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
    }
  }
  const rows = [
    ['Season', snapshot.season],
    ['Teams', snapshot.totalTeams],
    snapshot.week ? ['Week', snapshot.week] : null,
    snapshot.playoffTeams ? ['Playoff spots', snapshot.playoffTeams] : null,
    snapshot.schedule && snapshot.schedule.regularSeasonWeeks ? ['Regular season', `${snapshot.schedule.regularSeasonWeeks} weeks`] : null,
    snapshot.draftAt && snapshot.draftStatus !== 'complete' ? ['Draft', when(snapshot.draftAt)] : null,
  ].filter(Boolean)
  return (
    <aside className={`${CARD} p-5`} aria-labelledby="v2-facts">
      <Kicker>The league</Kicker>
      <h2 id="v2-facts" className="mt-1 break-words font-telemetry text-[26px] font-bold uppercase italic leading-none text-v2-ink">{snapshot.name}</h2>
      <dl className="mt-4 divide-y divide-white/[0.05]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-[13px] text-v2-ink3">{k}</dt>
            <dd className="text-right font-mono text-[13px] tabular-nums text-v2-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-white/[0.06] pt-3 text-[12px] leading-[1.5] text-v2-ink3">
        Read from {platform}. Juke never writes to your league.
      </p>
    </aside>
  )
}

function Connected({ league }) {
  const { decisions } = useDecisions()
  const [openWeek, setOpenWeek] = useState(null)
  const stripRef = useRef(null)
  const { snapshot, status: snapStatus, reason } = useLeagueSnapshot(league.leagueId, league.provider)
  const ready = snapStatus === 'ready' && !!snapshot
  const model = useLeagueModel(league, ready ? snapshot : null)
  const platform = platformFor(league.provider).name

  const weeks = useMemo(
    () => (ready && underWay(seasonPhase(snapshot)) ? realWeeks(snapshot, league.leagueId, decisions) : null),
    [ready, snapshot, league.leagueId, decisions]
  )

  if (!ready) {
    return (
      <>
        <Head league={league} loadingLine={snapStatus === 'loading' ? `Reading ${league.name} from ${platform}…` : null} />
        <div className="mt-10">
          {snapStatus === 'loading' ? (
            <div className={`${CARD} p-6`} aria-busy="true"><Skeleton lines={7} /></div>
          ) : (
            <Notice
              tone="error"
              title={reason === 'not-found' ? 'That league is no longer readable' : reason === 'private' ? 'That league is not public any more' : `Could not reach ${platform}`}
              body={
                reason === 'not-found'
                  ? `${platform} does not return this league any more. It may have been deleted, or the season rolled over — reconnect it from the You page.`
                  : reason === 'private'
                    ? 'ESPN will only let Juke read a public league. Open League Settings in ESPN and set visibility to public.'
                    : `Your standings are on ${platform} and it did not answer. Nothing is wrong with your league; try again in a moment.`
              }
            >
              <VoltButton size="md" onClick={() => retrySnapshot(league.leagueId, league.provider)}>Try again</VoltButton>
              {reason === 'not-found' ? <GhostButton href="#/v2/you">Manage leagues</GhostButton> : null}
            </Notice>
          )}
        </div>
      </>
    )
  }

  const phase = seasonPhase(snapshot)
  const currentKey = weeks ? String(snapshot.week) : null
  const selectedKey = openWeek || currentKey
  const showingPast = !!weeks && !!openWeek && openWeek !== currentKey
  const pastRows = showingPast ? decisionsForWeek(league.leagueId, openWeek === 'draft' ? 0 : Number(openWeek), decisions) : []
  const pastGame = showingPast && openWeek !== 'draft' ? gameInWeek(snapshot.schedule, league.ownerId, Number(openWeek)) : null
  const pastOpponent = pastGame && pastGame.opponentId ? (snapshot.teams || []).find((t) => t.ownerId === pastGame.opponentId) || null : null
  const draft = draftPhase(snapshot.draftAt, snapshot.draftStatus)
  const banner = draft.phase === 'soon' || draft.phase === 'drafting' || draft.phase === 'late'

  return (
    <>
      <Head league={league} snapshot={snapshot} ready />

      <div className="mt-8 space-y-5">
        {banner ? (
          <div className={`${CARD} flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5`} role="status">
            <DraftClock league={snapshot} />
            <span className="text-[14px] leading-[1.5] text-v2-ink2">
              {draft.phase === 'drafting'
                ? 'Your draft is running now — rosters fill here as picks land.'
                : draft.phase === 'late'
                  ? 'The scheduled draft time has passed. Rosters appear here once it runs.'
                  : 'Rosters are empty until your league drafts. Everything else here is live.'}
            </span>
          </div>
        ) : null}

        <Kpis league={league} snapshot={snapshot} odds={model.odds} />

        {weeks ? (
          <div ref={stripRef}>
            <WeekStrip
              weeks={weeks}
              selected={selectedKey}
              onSelect={(key) => setOpenWeek(key === currentKey ? null : key)}
              label="Weeks of the season"
            />
          </div>
        ) : null}

        {showingPast ? (
          <PastWeek weekKey={openWeek} rows={pastRows} game={pastGame} opponent={pastOpponent} onBack={() => setOpenWeek(null)} />
        ) : (
          <>
            {phase === 'complete' ? (
              <SeasonEnd
                league={league}
                snapshot={snapshot}
                onWeeks={weeks ? () => { setOpenWeek('1'); stripRef.current && stripRef.current.scrollIntoView({ block: 'center' }) } : null}
              />
            ) : null}
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Standings snapshot={snapshot} ownerId={league.ownerId || null} odds={model.odds} byId={model.byId} />
              <Facts snapshot={snapshot} league={league} />
            </div>
            <DraftReport league={league} snapshot={snapshot} ready={model.ready} />
          </>
        )}
      </div>
    </>
  )
}

export default function V2MyLeague() {
  const { status, league, retry } = useLeague()

  if (status === 'loading') {
    return (
      <>
        <PageHead kicker="My league" title="My League" lede="Checking which league is yours…" />
        <div className={`${CARD} mt-10 p-6`} aria-busy="true"><Skeleton lines={6} /></div>
      </>
    )
  }

  if (status === 'error') {
    return (
      <>
        <PageHead kicker="My league" title="My League" />
        <div className="mt-10">
          <Notice
            tone="error"
            title="Couldn’t load your league"
            body="Nothing has been disconnected and your leagues are still on your account — this page could not reach it to read them. Mock drafts are unaffected and need no account."
          >
            <VoltButton size="md" onClick={retry}>Try again</VoltButton>
            <GhostButton href="#/v2/draft">Start a mock draft</GhostButton>
          </Notice>
        </div>
      </>
    )
  }

  if (status !== 'connected' || !league) {
    return (
      <>
        <PageHead
          kicker="My league · sample"
          title="My League"
          lede="Standings, playoff odds and every call Juke makes on your roster — read from your real league, never written to it. Until one is connected, this is a sample league on tonight’s real players."
        />
        <LeagueDemo />
      </>
    )
  }

  return <Connected key={league.provider + ':' + league.leagueId} league={league} />
}
