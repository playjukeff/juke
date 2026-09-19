/* The scores ticker: the current NFL week's games under the header, all
   week. The slate is ESPN's default scoreboard, whose weeks run Wednesday
   to Tuesday — so on Wednesday the strip rolls over to the next week's
   games on its own. It draws nothing when there is no slate (the
   offseason, or ESPN unreachable).

   Each chip is the game page's own chip (GameChip, shared with the strip at
   the top of #/games/<id>) and opens that game, and the games a reader's
   starters are in sort first. Nothing on a game chip says which games those
   are; the order is the whole signal, by the owner's call.

   THE READER'S OWN FANTASY MATCHUP IS NOT ON THIS STRIP. It was, as one
   wide pill at the front carrying both team names and both projections,
   and the owner's call is that the strip is for the NFL slate: on a phone
   that pill was the whole width of the header and the games it exists to
   show were off the right-hand edge. The matchup has three addresses of its
   own — the call sheet's card, the League page, and #/league/matchup —
   and the connected league still decides the ORDER here, which is what it
   is worth on a strip this narrow.

   The slate comes off JukeEngine.primeScores(), the one-minute cache the
   kickoff pill already fills, so this costs no request of its own. It is
   null on the server and on the first client pass, which keeps it out of
   the prerender and so out of hydration. */
import { useMemo } from 'react'
import { useLeagueFresh, useSnapshotFresh } from '../../v2/stores.js'
import { myTeam } from '../../rooms/waiverBoard.js'
import { usePricing } from '../league/leagueData.js'
import { boardTeam } from '../../../lib/gameSummary.js'
import { useSlate } from '../now/season.js'
import { cx } from '../ui.jsx'

const logo = (abbr) => `https://sleepercdn.com/images/team_logos/nfl/${boardTeam(abbr).toLowerCase()}.png`
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


/* The clubs a reader's starters play for, which is the whole of what a
   connected league is worth to this strip: the games those clubs are in
   sort first.

   It read the week's pairing too, for the matchup pill that used to sit at
   the front — the schedule, the opponent, both projections, and a
   useSleeperWeeks() fetch of its own on a Sleeper league. All of that went
   with the pill; nothing here asks for anything the snapshot does not
   already carry. */
function useMyClubs() {
  const { league, status: ls } = useLeagueFresh()
  const connected = ls === 'connected' && league
  const { snapshot, status } = useSnapshotFresh(connected ? league.leagueId : null, connected ? league.provider : null)
  const ready = !!connected && status === 'ready' && !!snapshot
  const pricing = usePricing(ready ? snapshot : null)

  return useMemo(() => {
    if (!ready) return null
    const mine = myTeam(snapshot, league)
    if (!mine) return null
    // Just the set. `starterClubs` rode along beside it for the pill's
    // "8 still to play" count, and a field nothing reads is an invitation
    // to put the thing that read it back without the reasoning.
    return new Set((mine.starters || [])
      .map((id) => pricing.byId && pricing.byId.get(String(id)))
      .filter(Boolean)
      .map((p) => String(p.team || '').toUpperCase()))
  }, [ready, snapshot, league, pricing.byId])
}

/* "Today", "Yesterday", "Tomorrow", otherwise "Sep 20", then the week:
   "Yesterday · Wk 2". */
function dayLabel(t, week) {
  const wk = week ? ` · Wk ${week}` : ''
  return dayOnly(t) + wk
}
function dayOnly(t) {
  if (!Number.isFinite(t)) return 'Time TBD'
  const d = new Date(t)
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(d) - start(new Date())) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Ticker({ games }) {
  const me = useMyClubs()
  /* The games grouped by the day they kick off, in the reader's own zone,
     each day under a small label with a rule between days — the way a
     scoreboard reads a week. Inside a day: yours first, then live, next,
     final. */
  const days = useMemo(() => {
    const mineOf = (g) => (me && (me.has(boardTeam(g.away)) || me.has(boardTeam(g.home))) ? 0 : 1)
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
      .map((d) => ({ ...d, label: dayLabel(d.t, d.rows[0] && d.rows[0].week), rows: d.rows.sort((a, b) => mineOf(a) - mineOf(b) || (ORDER[a.state] ?? 3) - (ORDER[b.state] ?? 3) || (Date.parse(a.kickoff) || 0) - (Date.parse(b.kickoff) || 0)) }))
  }, [games, me])

  return (
    <div className="border-t border-v3-rule">
      <nav aria-label="This week's games" className="mx-auto flex max-w-[1320px] gap-3 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:px-8">
        {/* Every game of the week, and the standings, a press away. */}
        <section aria-label="All NFL scores" className="flex shrink-0 flex-col gap-1.5">
          <span aria-hidden="true" className="font-figure text-[11px] font-semibold uppercase tracking-[0.12em] text-transparent">.</span>
          <a href="#/scores" className="flex min-h-[48px] flex-col items-center justify-center rounded-[10px] border border-v3-rule bg-v3-sheet px-3.5 font-figure text-[12px] font-extrabold leading-[1.1] tracking-[0.08em] text-v3-ink hover:border-v3-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
            <span>ALL</span><span>NFL</span>
          </a>
        </section>
        {days.map((d, i) => (
          <section key={d.key} aria-label={d.label} className={cx('flex shrink-0 flex-col gap-1.5', 'border-l border-v3-rule pl-3')}>
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
  if (!Array.isArray(games) || !games.some((g) => g && g.id)) return null
  return <Ticker games={games} />
}
