/* #/scores -- every NFL game of a week, and the league table beside it.
   Scores / NFL.

   The current week is the shared one-minute scoreboard the ticker and the
   homepage already read; any other week is ESPN's own scoreboard for that
   week (JukeEngine.scoresForWeek), asked for when its tab is pressed. The
   week rides on the address (?week=N) so a game page's "All scores" lands
   back on the week it came from. */
import { useEffect, useMemo, useState } from 'react'
import { boardTeam } from '../../../lib/gameSummary.js'
import { useSlate } from '../now/season.js'
import { Label, Sheet, Skeleton, cx } from '../ui.jsx'
import Crumbs from './Crumbs.jsx'
import { GameCard, byDay, useBoardById } from './WeekGames.jsx'

const logo = (abbr) => `https://sleepercdn.com/images/team_logos/nfl/${boardTeam(abbr).toLowerCase()}.png`
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1)

function readWeek() {
  const q = typeof window !== 'undefined' ? window.location.hash.split('?')[1] || '' : ''
  const w = Number(new URLSearchParams(q).get('week'))
  return Number.isInteger(w) && w >= 1 && w <= 18 ? w : null
}

function useWeekGames(week, current, currentGames) {
  const [held, setHeld] = useState({})
  useEffect(() => {
    if (!week || week === current) return undefined
    let alive = true
    const e = window.JukeEngine
    if (!e || !e.scoresForWeek) return undefined
    setHeld((m) => (m[week] ? m : { ...m, [week]: 'loading' }))
    Promise.resolve(e.scoresForWeek(week)).then((r) => { if (alive) setHeld((m) => ({ ...m, [week]: r ? r.games : 'error' })) })
    return () => { alive = false }
  }, [week, current])
  if (!week || week === current) return currentGames
  return held[week] || 'loading'
}

function useStandings() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    const e = window.JukeEngine
    const read = () => { if (e && e.nflStandings) Promise.resolve(e.nflStandings()).then((r) => { if (alive) setRows(r || false) }) }
    read()
    const id = setInterval(read, 5 * 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  return rows
}

function Standings() {
  const confs = useStandings()
  const [view, setView] = useState('ALL')
  const rows = useMemo(() => {
    if (!confs) return []
    const all = view === 'ALL' ? confs.flatMap((c) => c.teams) : ((confs.find((c) => c.name === view) || {}).teams || [])
    return all.slice().sort((a, b) => (Number(b.pct) - Number(a.pct)) || (b.w - a.w) || ((b.pf - b.pa) - (a.pf - a.pa)) || String(a.abbr).localeCompare(b.abbr))
  }, [confs, view])
  return (
    <Sheet code="Standings" aside="ESPN" bodyClass="">
      <div role="tablist" aria-label="Conference" className="flex gap-1 border-b border-v3-rule p-2">
        {['ALL', 'AFC', 'NFC'].map((k) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
            className={cx('min-h-[36px] flex-1 rounded-full text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call', view === k ? 'bg-v3-ink text-v3-paper' : 'text-v3-ink2 hover:text-v3-ink')}>
            {k === 'ALL' ? 'All' : k}
          </button>
        ))}
      </div>
      {confs === null ? <div className="p-4"><Skeleton lines={10} /></div> : confs === false ? (
        <p className="p-4 text-[14px] text-v3-ink2">ESPN did not answer for the standings. They come back on their own.</p>
      ) : (
        <table className="w-full bg-v3-sheet font-figure text-[14px] tabular-nums [&_th]:border-0 [&_th]:bg-transparent [&_td]:border-b-0">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.1em] text-v3-ink3">
              <th className="py-2 pl-4 text-left font-semibold">#</th>
              <th className="py-2 text-left font-semibold">Team</th>
              <th className="py-2 text-right font-semibold">W</th>
              <th className="py-2 text-right font-semibold">L</th>
              <th className="py-2 text-right font-semibold">T</th>
              <th className="py-2 pr-4 text-right font-semibold">Pct</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.abbr} className="border-t border-v3-rule/60">
                <td className="py-2 pl-4 text-v3-ink3">{i + 1}</td>
                <td className="py-2"><span className="flex items-center gap-2 font-sheet font-semibold"><img src={logo(t.abbr)} alt="" width="20" height="20" loading="lazy" className="h-5 w-5" />{t.abbr}</span></td>
                <td className="py-2 text-right">{t.w}</td>
                <td className="py-2 text-right">{t.l}</td>
                <td className="py-2 text-right">{t.t}</td>
                <td className="py-2 pr-4 text-right">{t.pct || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Sheet>
  )
}

export default function V3Scores() {
  const slate = useSlate(true)
  const current = Array.isArray(slate) && slate[0] && slate[0].week ? Number(slate[0].week) : null
  const [week, setWeek] = useState(readWeek)
  useEffect(() => {
    const on = () => setWeek(readWeek())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const shown = week || current
  const games = useWeekGames(shown, current, slate)
  const { fx, byId } = useBoardById()
  const days = useMemo(() => (Array.isArray(games) ? byDay(games) : []), [games])
  const pick = (w) => { window.location.hash = w === current ? '#/scores' : `#/scores?week=${w}` }

  return (
    <div className="grid gap-6">
      <Crumbs items={[{ label: 'Scores', href: '#/scores' }, { label: 'NFL' }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[clamp(32px,5vw,48px)] font-black leading-[1.02] tracking-[-0.02em]">NFL scores</h1>
        {fx.ready ? <Label>Your starters from {fx.label}</Label> : null}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-5">
          <div role="tablist" aria-label="Week" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
            {WEEKS.map((w) => (
              <button key={w} type="button" role="tab" aria-selected={shown === w} onClick={() => pick(w)}
                className={cx('min-h-[44px] shrink-0 rounded-[6px] border px-3.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call',
                  shown === w ? 'border-v3-ink3 bg-v3-sheet text-v3-ink' : 'border-transparent text-v3-ink3 hover:text-v3-ink')}>
                <span className="block text-[14px] font-bold">Week {w}</span>
                {w === current ? <span className="block font-figure text-[10px] uppercase tracking-[0.1em] text-v3-call">This week</span> : null}
              </button>
            ))}
          </div>
          {games === 'loading' || games === null ? <Sheet band={false}><Skeleton lines={8} /></Sheet>
            : games === 'error' ? <p className="text-[15px] text-v3-ink2">ESPN did not answer for week {shown}. Try another week, or this one again in a minute.</p>
            : days.map((d) => (
              <div key={d.key} className="grid gap-2">
                <Label>{d.label}</Label>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {d.rows.map((g) => <GameCard key={g.id} g={g} fx={fx} byId={byId} detail showYours={shown === current} />)}
                </div>
              </div>
            ))}
          {fx.ready && shown !== current ? <p className="text-[12px] text-v3-ink3">Your starters are this week&apos;s lineup; another week&apos;s points are on its game pages.</p> : null}
        </div>
        <Standings />
      </div>
    </div>
  )
}

