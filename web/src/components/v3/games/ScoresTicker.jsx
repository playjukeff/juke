/* The game-day ticker: a strip of the week's NFL games under the header,
   drawn only while a game is live or one kicks off within three hours. The
   rest of the week it draws nothing.

   Each chip is the game page's own chip (GameChip, shared with the strip at
   the top of #/games/<id>) and opens that game. A reader with a connected
   league gets one more chip at the front — their own matchup, inverted the
   way the game page marks the game you are on — and the games their
   starters are in sort first. Nothing on a game chip says which games those
   are; the order is the whole signal, by the owner's call.

   The slate comes off JukeEngine.primeScores(), the one-minute cache the
   kickoff pill already fills, so this costs no request of its own. It is
   null on the server and on the first client pass, which keeps it out of
   the prerender and so out of hydration. */
import { useEffect, useMemo, useState } from 'react'
import { useLeagueFresh, useSnapshotFresh } from '../../v2/stores.js'
import { myTeam } from '../../rooms/waiverBoard.js'
import { usePricing, useWeekSheet } from '../league/leagueData.js'
import { espnWeek, gameFor, sleeperWeekView } from '../league/matchupData.js'
import { useSleeperWeeks } from '../league/useSleeperWeeks.js'
import { boardTeam } from '../../../lib/gameSummary.js'
import { useSlate } from '../now/season.js'
import { cx } from '../ui.jsx'

const logo = (abbr) => `https://sleepercdn.com/images/team_logos/nfl/${boardTeam(abbr).toLowerCase()}.png`
const SOON_MS = 3 * 60 * 60 * 1000
const ORDER = { in: 0, pre: 1, post: 2 }

/* One game as a pill: both logos, the score over the clock (or the two
   clubs over the kickoff before it starts), the clock red while live. */
export function GameChip({ g, on = false }) {
  const scored = g.state !== 'pre'
  return (
    <a
      href={`#/games/${encodeURIComponent(g.id)}`}
      aria-current={on ? 'page' : undefined}
      aria-label={scored ? `${g.away} ${g.awayScore}, ${g.home} ${g.homeScore}, ${g.detail || ''}` : `${g.away} at ${g.home}, ${g.detail || ''}`}
      className={cx('flex min-h-[48px] shrink-0 items-center gap-2 rounded-full border px-3 font-figure text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call',
        on ? 'border-transparent bg-v3-ink text-v3-paper' : 'border-v3-rule bg-v3-sheet text-v3-ink hover:border-v3-ink3')}
    >
      <img src={logo(g.away)} alt="" width="22" height="22" className="h-[22px] w-[22px]" />
      <span className="grid leading-tight">
        {scored ? <span className="font-bold">{g.awayScore}–{g.homeScore}</span> : <span className="font-bold">{g.away} · {g.home}</span>}
        <span className={cx('text-[11px] uppercase', g.state === 'in' ? 'font-bold text-v3-cost' : on ? 'text-v3-paper/80' : 'text-v3-ink3')}>{g.detail || ''}</span>
      </span>
      <img src={logo(g.home)} alt="" width="22" height="22" className="h-[22px] w-[22px]" />
    </a>
  )
}

/* Game day: a game is live, or the next kicks off within three hours. */
export function isGameDay(games, now = Date.now()) {
  if (!Array.isArray(games)) return false
  return games.some((g) => g && (g.state === 'in' ||
    (g.state === 'pre' && g.kickoff && Date.parse(g.kickoff) - now <= SOON_MS && Date.parse(g.kickoff) - now > -SOON_MS)))
}

/* The reader's league, their team this week, and the clubs their starters
   play for. Mounted only on game day, so an ordinary page load does not
   read a snapshot for a strip it will not draw. */
function useMyWeek() {
  const { league, status: ls } = useLeagueFresh()
  const connected = ls === 'connected' && league
  const { snapshot, status } = useSnapshotFresh(connected ? league.leagueId : null, connected ? league.provider : null)
  const ready = !!connected && status === 'ready' && !!snapshot
  const pricing = usePricing(ready ? snapshot : null)
  const sheet = useWeekSheet(connected ? league : null, ready ? snapshot : null)
  const week = ready ? Number(snapshot.week) || null : null
  const hasSchedule = ready && !!(snapshot.schedule && Array.isArray(snapshot.schedule.matchups) && snapshot.schedule.matchups.length)
  const sleeperOn = ready && !hasSchedule && (league.provider || 'sleeper') === 'sleeper' && !!week
  const sw = useSleeperWeeks(sleeperOn ? league.leagueId : null, sleeperOn ? [week] : [], sleeperOn ? week : null)

  return useMemo(() => {
    if (!ready || !week) return null
    const mine = myTeam(snapshot, league)
    if (!mine) return null
    const view = hasSchedule ? espnWeek(snapshot, week) : (sw[week] && sw[week].view ? sleeperWeekView(snapshot, sw[week].view) : null)
    const g = view ? gameFor(view, mine) : null
    const starterClubs = ((mine.starters) || [])
      .map((id) => pricing.byId && pricing.byId.get(String(id)))
      .filter(Boolean)
      .map((p) => String(p.team || '').toUpperCase())
    const clubs = new Set(starterClubs)
    // Points once the platform has any; its projection before that.
    const live = g && g.mine && g.theirs && (g.mine.points || g.theirs.points)
    const opp = g && g.theirs && g.theirs.team ? g.theirs.team : (sheet && sheet.opponent) || null
    return {
      league: snapshot.name || '',
      oppName: opp ? opp.teamName || opp.name || 'Opponent' : null,
      bye: !!(g && g.bye),
      mePts: live ? g.mine.points : sheet ? sheet.total : null,
      oppPts: live ? g.theirs.points : sheet ? sheet.oppTotal : null,
      projected: !live,
      clubs,
      starterClubs,
    }
  }, [ready, week, snapshot, league, hasSchedule, sw, pricing.byId, sheet])
}

/* "Today", "Yesterday", "Tomorrow", otherwise "Sun · Sep 20". */
function dayLabel(t) {
  if (!Number.isFinite(t)) return 'Time TBD'
  const d = new Date(t)
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(d) - start(new Date())) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'short' }) + ' · ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const fmt = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : '—')

function Ticker({ games }) {
  const me = useMyWeek()
  /* The games grouped by the day they kick off, in the reader's own zone,
     each day under a small label with a rule between days — the way a
     scoreboard reads a week. Inside a day: yours first, then live, next,
     final. */
  const days = useMemo(() => {
    const mineOf = (g) => (me && me.clubs && (me.clubs.has(boardTeam(g.away)) || me.clubs.has(boardTeam(g.home))) ? 0 : 1)
    const groups = new Map()
    for (const g of games) {
      if (!g || !g.id) continue
      const t = g.kickoff ? Date.parse(g.kickoff) : NaN
      const key = Number.isFinite(t) ? new Date(t).toDateString() : 'tbd'
      if (!groups.has(key)) groups.set(key, { key, t: Number.isFinite(t) ? t : Infinity, rows: [] })
      groups.get(key).rows.push(g)
    }
    return [...groups.values()]
      .sort((a, b) => a.t - b.t)
      .map((d) => ({ ...d, label: dayLabel(d.t), rows: d.rows.sort((a, b) => mineOf(a) - mineOf(b) || (ORDER[a.state] ?? 3) - (ORDER[b.state] ?? 3) || (Date.parse(a.kickoff) || 0) - (Date.parse(b.kickoff) || 0)) }))
  }, [games, me])
  // Starters whose game has not finished. A club on bye has no game on the
  // slate, so its players are not counted as still to play.
  const open = new Set()
  for (const g of games) if (g && g.state !== 'post') { open.add(boardTeam(g.away)); open.add(boardTeam(g.home)) }
  const toPlay = me ? me.starterClubs.filter((c) => open.has(c)).length : 0

  return (
    <div className="border-t border-v3-rule">
      <nav aria-label="This week's games" className="mx-auto flex max-w-[1320px] gap-3 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:px-8">
        {me && me.oppName && !me.bye && (<section aria-label="Your matchup" className="flex shrink-0 flex-col gap-1.5"><span className="font-figure text-[11px] font-semibold uppercase tracking-[0.12em] text-v3-ink3">Your matchup</span>
          <a
            href="#/league/matchup"
            className="flex min-h-[48px] shrink-0 items-center rounded-full bg-v3-ink px-4 font-figure text-[13px] text-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call"
          >
            <span className="grid leading-tight">
              <span className="font-bold">You {fmt(me.mePts)} – {fmt(me.oppPts)} {me.oppName}</span>
              <span className="text-[11px] uppercase text-v3-paper/80">
                {me.league}{me.projected ? ' · projected' : ''}{toPlay ? ` · ${toPlay} of yours to play` : ''}
              </span>
            </span>
          </a>
        </section>)}
        {days.map((d, i) => (
          <section key={d.key} aria-label={d.label} className={cx('flex shrink-0 flex-col gap-1.5', (i > 0 || (me && me.oppName && !me.bye)) && 'border-l border-v3-rule pl-3')}>
            <span className="font-figure text-[11px] font-semibold uppercase tracking-[0.12em] text-v3-ink3">{d.label}</span>
            <div className="flex gap-2">
              {d.rows.map((g) => <GameChip key={g.id} g={g} />)}
            </div>
          </section>
        ))}
      </nav>
    </div>
  )
}

export default function ScoresTicker() {
  const games = useSlate(true)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])
  if (!isGameDay(games, now)) return null
  return <Ticker games={games} />
}
