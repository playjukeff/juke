/* A player's week in every league the reader has connected, on his page.

   The same stat line is worth a different number in every league -- one
   Josh Allen game is 49.3 in a full PPR ESPN league, 43.82 in a half PPR
   one and 40.82 on CBS -- and the only honest source for each is that
   platform. So this reads each connected league's own snapshot (and, for
   CBS, its week) and prints what that platform credited him with, and who
   has him there. Nothing is recomputed: a league that has not published a
   figure for him this week says so rather than borrowing Juke's.

   The active league reads through the shared snapshot store; the others
   are read here, once per visit, held for the worker's own two minutes. */
import { useEffect, useMemo, useState } from 'react'
import { useLeagueFresh } from '../../v2/stores.js'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { boardTeam } from '../../../lib/gameSummary.js'
import { useSlate } from '../now/season.js'
import { Fig, Sheet, cx } from '../ui.jsx'
import { platformPoints } from './fantasy.js'

const HELD = new Map()   // leagueId -> { at, p }
const WINDOW_MS = 120000

function token() {
  const a = typeof window !== 'undefined' ? window.JukeAuth : null
  return a && a.isSignedIn && a.getToken ? Promise.resolve(a.getToken()).catch(() => null) : Promise.resolve(null)
}

function readLeague(lg) {
  const cur = HELD.get(lg.leagueId)
  if (cur && Date.now() - cur.at < WINDOW_MS) return cur.p
  const live = typeof window !== 'undefined' ? window.Live : null
  const p = token().then(async (t) => {
    if (!live || !live.leagueSnapshot) return null
    const res = await live.leagueSnapshot(lg.leagueId, lg.provider, t)
    const snap = res && res.ok ? res.snapshot : null
    if (!snap) return null
    let cbs = null
    if (lg.provider === 'cbs' && snap.week && live.leagueWeekActuals) {
      const w = await live.leagueWeekActuals(lg.leagueId, snap.week, 'cbs', t)
      cbs = w && w.ok ? w.week : null
    }
    return { snap, cbs }
  }).catch(() => null)
  HELD.set(lg.leagueId, { at: Date.now(), p })
  return p
}

function useEveryLeague() {
  const { status, leagues } = useLeagueFresh()
  const list = status === 'connected' ? leagues || [] : []
  const [rows, setRows] = useState({})
  const keyOf = list.map((l) => l.leagueId).join(',')
  useEffect(() => {
    let alive = true
    list.forEach((lg) => {
      readLeague(lg).then((r) => { if (alive) setRows((m) => ({ ...m, [lg.leagueId]: r || false })) })
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyOf])
  return { list, rows, connected: status === 'connected' }
}

export default function PlayerWeek({ player }) {
  const { list, rows, connected } = useEveryLeague()
  const games = useSlate(true)
  const game = useMemo(() => {
    if (!Array.isArray(games) || !player || !player.team) return null
    const t = String(player.team).toUpperCase()
    return games.find((g) => g && (boardTeam(g.away) === t || boardTeam(g.home) === t)) || null
  }, [games, player])
  if (!connected || !list.length) return null

  const id = String(player.id)
  const started = game && game.state !== 'pre'
  return (
    <Sheet code="This week in your leagues" aside={game && game.week ? `Week ${game.week}` : null} bodyClass="px-4 py-1 sm:px-5">
      {game ? (
        <a href={`#/games/${encodeURIComponent(game.id)}`} className="flex items-center justify-between gap-3 border-b border-v3-rule py-3 text-[14px] hover:text-v3-call focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
          <span className="font-semibold">{game.away} @ {game.home}</span>
          <span className="font-figure text-[13px] text-v3-ink2">{game.state === 'pre' ? game.detail : `${game.awayScore}–${game.homeScore} · ${game.detail}`} →</span>
        </a>
      ) : null}
      {list.map((lg, i) => {
        const r = rows[lg.leagueId]
        const snap = r && r.snap
        const week = snap ? Number(snap.week) : null
        const pts = snap ? platformPoints(snap, r.cbs, week) : null
        const v = pts && pts.has(id) ? pts.get(id) : null
        const team = snap ? (snap.teams || []).find((t) => (t.players || []).map(String).includes(id)) : null
        const mine = team && lg.ownerId && String(team.ownerId) === String(lg.ownerId)
        const starting = team && (team.starters || []).map(String).includes(id)
        const plat = platformFor(lg.provider).name
        return (
          <div key={lg.leagueId} className={cx('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-v3-rule/60 py-3 last:border-b-0', i === 0 && 'shadow-[inset_3px_0_0_rgb(var(--v3-call))] pl-3')}>
            <div className="min-w-0">
              <p className="truncate font-bold">{snap ? snap.name : lg.name}</p>
              <p className="truncate text-[13px] text-v3-ink2">
                {r === undefined ? 'Reading…' : !snap ? `${plat} did not answer` : team ? `${mine ? 'Your team' : team.teamName || team.name}${starting ? ' · starting' : ' · bench'}` : 'Free agent'}
              </p>
            </div>
            <div className="text-right">
              <Fig className="block text-[22px] font-extrabold leading-none">{v === null ? '—' : v.toFixed(2)}</Fig>
              <span className="font-figure text-[10px] font-bold uppercase tracking-[0.08em] text-v3-ink3">
                {v !== null ? `from ${plat}` : !snap ? '' : !team ? `${plat} scores rostered players` : started ? `no ${plat} figure yet` : 'not played yet'}
              </span>
            </div>
          </div>
        )
      })}
      <p className="py-2 text-[12px] leading-[1.5] text-v3-ink3">
        Each platform&apos;s own total for him this week. The highlighted league is the active one — it sets the fantasy points on the scores and game pages.
      </p>
    </Sheet>
  )
}

