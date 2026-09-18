/* The NFL week as game cards, grouped by the day they kick off -- the
   homepage's "This week in the NFL" and the rows of the scores page.

   A card is one game: both clubs with their records (or the score), when
   and where it is shown. The whole card opens the game. Deliberately no
   per-reader rows: a card with your starters in it grew taller than its
   neighbours in the same row, and the game page is where they live. */
import { useMemo } from 'react'
import { boardTeam } from '../../../lib/gameSummary.js'
import { useSlate } from '../now/season.js'
import { Fig, GoLink, Label, cx } from '../ui.jsx'

const logo = (abbr) => `https://sleepercdn.com/images/team_logos/nfl/${boardTeam(abbr).toLowerCase()}.png`
const ORDER = { in: 0, pre: 1, post: 2 }

export function dayLabel(t, week) {
  const wk = week ? ` · Wk ${week}` : ''
  if (!Number.isFinite(t)) return 'Time TBD' + wk
  const d = new Date(t)
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(d) - start(new Date())) / 86400000)
  const base = diff === 0 ? 'Today' : diff === -1 ? 'Yesterday' : diff === 1 ? 'Tomorrow'
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  return base + wk
}

/* Games grouped by day in the reader's zone, earliest day first, and inside
   a day live, then next up, then final, then by kickoff. */
export function byDay(games) {
  const m = new Map()
  for (const g of games || []) {
    if (!g || !g.id) continue
    const t = Date.parse(g.kickoff || '')
    const key = Number.isFinite(t) ? new Date(t).toDateString() : 'tbd'
    if (!m.has(key)) m.set(key, { key, t: Number.isFinite(t) ? t : Infinity, rows: [] })
    m.get(key).rows.push(g)
  }
  return [...m.values()].sort((a, b) => a.t - b.t).map((d) => ({
    ...d,
    label: dayLabel(d.t, d.rows[0] && d.rows[0].week),
    rows: d.rows.sort((a, b) => (ORDER[a.state] ?? 3) - (ORDER[b.state] ?? 3) || (Date.parse(a.kickoff) || 0) - (Date.parse(b.kickoff) || 0)),
  }))
}

const kickTime = (iso) => {
  const t = Date.parse(iso || '')
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''
}

function TeamRow({ abbr, name, rec, score, state, lost }) {
  return (
    <div className="grid h-9 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5">
      <img src={logo(abbr)} alt="" width="28" height="28" loading="lazy" className="h-7 w-7" />
      <span className={cx('truncate font-semibold', lost && 'text-v3-ink3')}>{name || abbr}</span>
      {state === 'pre'
        ? <Fig className="text-[13px] text-v3-ink3">{rec || ''}</Fig>
        : <Fig className={cx('text-[22px] font-extrabold', lost && 'text-v3-ink3')}>{score ?? '—'}</Fig>}
    </div>
  )
}

export function GameCard({ g, detail = false }) {
  const post = g.state === 'post'
  const a = Number(g.awayScore), h = Number(g.homeScore)
  const lead = (g.leaders || []).slice(0, detail ? 3 : 2)
  return (
    <div className="relative grid gap-3 rounded-[8px] border border-v3-rule bg-v3-sheet p-3.5 transition-colors hover:border-v3-ink3 focus-within:border-v3-ink3">
      <a href={`#/games/${encodeURIComponent(g.id)}`} aria-label={`${g.awayName || g.away} at ${g.homeName || g.home}, game details`} className="absolute inset-0 rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call" />
      <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(92px,auto)] gap-3.5">
        <div>
          <TeamRow abbr={g.away} name={g.awayName} rec={g.awayRec} score={g.awayScore} state={g.state} lost={post && a < h} />
          <TeamRow abbr={g.home} name={g.homeName} rec={g.homeRec} score={g.homeScore} state={g.state} lost={post && h < a} />
        </div>
        <span className="bg-v3-rule" aria-hidden="true" />
        <div className="font-figure text-[12px] leading-[1.45]">
          {g.state === 'in' ? (
            <p className="font-bold uppercase text-v3-cost"><span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-v3-cost align-middle motion-reduce:animate-none" aria-hidden="true" />{g.detail}</p>
          ) : post ? (
            <p className="font-bold uppercase text-v3-ink">{g.detail || 'Final'}</p>
          ) : (
            <>
              <p className="font-bold uppercase text-v3-ink">{new Date(Date.parse(g.kickoff)).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })}</p>
              <p className="text-v3-ink2">{kickTime(g.kickoff)}</p>
            </>
          )}
          {g.network ? <p className="text-v3-ink3">{g.network}</p> : null}
          {detail && g.note ? <p className="text-v3-ink3">{g.note}</p> : null}
        </div>
      </div>
      {detail && g.venue ? <p className="text-[13px] text-v3-ink3">{g.venue}{g.city ? ` · ${g.city}` : ''}</p> : null}
      {detail && lead.length ? (
        <div className="grid gap-1 border-t border-v3-rule pt-2.5">
          <Label>{g.state === 'pre' ? 'Key players · season' : 'Stat leaders'}</Label>
          {lead.map((l, i) => (
            <p key={i} className="flex min-w-0 items-baseline gap-2 text-[13px]">
              <span className="shrink-0 font-semibold">{l.name}</span>
              <span className="truncate font-figure text-[12px] text-v3-ink3">{l.team ? `${l.team} · ` : ''}{l.line}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* The homepage's section: this week's games, every day of them. */
export default function WeekGames() {
  const games = useSlate(true)
  const days = useMemo(() => byDay(games), [games])
  if (!days.length) return null
  const n = days.reduce((t, d) => t + d.rows.length, 0)
  const live = days.reduce((t, d) => t + d.rows.filter((g) => g.state === 'in').length, 0)
  return (
    <section aria-labelledby="v3-now-nfl" className="grid gap-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="v3-now-nfl" className="text-[22px] font-black tracking-[-0.01em]">This week in the NFL</h2>
        <Label>{live ? `${live} live · ` : ''}{n} games</Label>
        <span className="ml-auto"><GoLink href="#/scores">All scores &amp; standings</GoLink></span>
      </div>
      {days.map((d) => (
        <div key={d.key} className="grid gap-2">
          <Label>{d.label}</Label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {d.rows.map((g) => <GameCard key={g.id} g={g} />)}
          </div>
        </div>
      ))}
    </section>
  )
}

