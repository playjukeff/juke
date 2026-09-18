/* #/games/<espnEventId> — one NFL game.

   Everything on the page is ESPN's summary for that game, trimmed by
   lib/gameSummary.js. The one thing Juke adds is the reader's own stake: a
   connected reader whose starters are in this game sees them in a banner
   under the score, their rows marked in the box score, and their plays
   marked in the chart and the drive feed. Nothing else on the page is about
   them — one section and two marks, never a second copy of the banner.

   The stake is drawn only for the league's CURRENT week. The box score is
   read against today's roster, and a game from week 1 read against a
   roster that has changed since would put points under players who were
   not started then. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLeagueFresh, useSnapshotFresh } from '../../v2/stores.js'
import { myTeam } from '../../rooms/waiverBoard.js'
import { usePricing, useWeekSheet } from '../league/leagueData.js'
import { gameFor, sleeperWeekView } from '../league/matchupData.js'
import { useSleeperWeeks } from '../league/useSleeperWeeks.js'
import {
  SUMMARY_URL, SCORED_CATEGORIES, boardTeam, linePoints, normName, parseSummary, playShortName, playerLine, playerPoints,
} from '../../../lib/gameSummary.js'
import { Fig, GoLink, Label, PosTag, QuietButton, Sheet, Skeleton, cx } from '../ui.jsx'
import { useMinWidth } from '../../../hooks/useBreakpoint.js'
import { useV3Theme } from '../theme.js'
import { gameColors } from '../../../lib/teamColors.js'
import { useSlate } from '../now/season.js'
import { GameChip } from './ScoresTicker.jsx'
import Crumbs, { longDate } from './Crumbs.jsx'
import { findOnBoard, sourceText, useFantasy } from './fantasy.js'
import { leagueWeekPts, injurySeverity } from '../../rooms/strategyBoard.js'
import { InjuryChip } from '../league/parts.jsx'

/* ---- Data ---- */

const LIVE_POLL = 30000
// One answer per game, shared by every mount and kept for the poll window,
// so leaving and coming back inside it costs nothing.
const cache = new Map()

function useGame(id) {
  const [state, setState] = useState(() => {
    const hit = cache.get(id)
    return hit ? { status: 'ready', game: hit.game } : { status: 'loading', game: null }
  })
  useEffect(() => {
    if (!/^\d{5,12}$/.test(String(id || ''))) { setState({ status: 'bad', game: null }); return undefined }
    let alive = true
    let timer = null
    const load = () => {
      const hit = cache.get(id)
      if (hit && Date.now() - hit.at < LIVE_POLL - 1000) {
        setState({ status: 'ready', game: hit.game })
        schedule(hit.game)
        return
      }
      fetch(SUMMARY_URL + encodeURIComponent(id), { mode: 'cors' })
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
        .then((json) => {
          const game = parseSummary(json)
          if (!alive) return
          if (!game) { setState((s) => (s.game ? s : { status: 'error', game: null })); return }
          cache.set(id, { at: Date.now(), game })
          setState({ status: 'ready', game })
          schedule(game)
        })
        // A failed refresh keeps the game already on screen; only a first
        // read that fails says so.
        .catch(() => { if (alive) setState((s) => (s.game ? s : { status: 'error', game: null })) })
    }
    // Only a game in progress changes, so only a game in progress polls.
    const schedule = (game) => {
      clearTimeout(timer)
      if (game && game.state === 'in' && alive) timer = setTimeout(load, LIVE_POLL)
    }
    load()
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [id])
  return state
}

/* The reader's stake in this game: their starters in it, their opponent's,
   and the scoring rules to price the box score with. */
function useStake(game) {
  const { league } = useLeagueFresh()
  const { snapshot, status } = useSnapshotFresh(league ? league.leagueId : null, league ? league.provider : null)
  const ready = status === 'ready' && !!snapshot
  const pricing = usePricing(ready ? snapshot : null)
  const sheet = useWeekSheet(league, ready ? snapshot : null)
  const sleeperOn = ready && league && (league.provider || 'sleeper') === 'sleeper' &&
    !(snapshot.schedule && snapshot.schedule.matchups && snapshot.schedule.matchups.length) && Number(snapshot.week) > 0
  const sw = useSleeperWeeks(sleeperOn ? league.leagueId : null, sleeperOn ? [Number(snapshot.week)] : [], sleeperOn ? Number(snapshot.week) : null)
  const engine = typeof window !== 'undefined' ? window.JukeEngine : null

  return useMemo(() => {
    const fallback = engine && engine.rulesForFormat ? engine.rulesForFormat('half') : null
    // The week's scorer and who owns whom, for the page's "In your league"
    // block. A guest gets Juke's own projection and no owners.
    const guestWeek = engine ? leagueWeekPts(engine, game ? { week: game.week } : null) : null
    const base = { league: null, rules: fallback, scoring: 'Juke default', mine: [], theirs: [], opponent: null, reason: null, weekPts: guestWeek, owners: new Map(), mineTeam: null }
    if (!game || !league || !ready) return base
    const rules = (engine && engine.rulesFromLeague && engine.rulesFromLeague(snapshot.rules)) || fallback
    const scoring = engine && engine.rulesFromLeague && engine.rulesFromLeague(snapshot.rules) ? 'Your league' : 'Juke default'
    const mineTeam = myTeam(snapshot, league)
    const owners = new Map()
    for (const t of snapshot.teams || []) {
      for (const id of t.players || []) owners.set(String(id), { name: t.teamName || t.name || 'A team', mine: !!mineTeam && t === mineTeam })
    }
    const sameWeek = !!game.week && Number(snapshot.week) === Number(game.week)
    const out = { ...base, league: snapshot.name || league.name, rules, scoring, owners, mineTeam, weekPts: sameWeek && pricing.weekPts ? pricing.weekPts : guestWeek }
    if (!sameWeek) return { ...out, reason: 'week' }

    let opponent = sheet && sheet.opponent ? sheet.opponent : null
    if (!opponent && sleeperOn) {
      const e = sw[Number(snapshot.week)]
      const g = e && e.view && mineTeam ? gameFor(sleeperWeekView(snapshot, e.view), mineTeam) : null
      opponent = g && g.theirs ? g.theirs.team : null
    }
    const clubs = new Set([boardTeam(game.away.abbr), boardTeam(game.home.abbr)])
    const inGame = (team) => ((team && team.starters) || [])
      .map((id) => pricing.byId.get(String(id)))
      .filter((p) => p && clubs.has(String(p.team || '').toUpperCase()))
      .map((p) => {
        const abbr = boardTeam(game.away.abbr) === String(p.team).toUpperCase() ? game.away.abbr : game.home.abbr
        const kd = p.pos === 'K' || p.pos === 'DST'
        return {
          id: String(p.id), name: p.name, pos: p.pos, abbr, key: normName(p.name), kd,
          points: kd ? null : playerPoints(game, abbr, p.name, rules),
          line: kd ? '' : playerLine(game, abbr, p.name),
        }
      })
    return { ...out, mine: inGame(mineTeam), theirs: inGame(opponent), opponent }
  }, [game, league, ready, snapshot, sheet, sleeperOn, sw, pricing.byId, engine])
}

/* ---- Small pieces ---- */

const logo = (abbr) => `https://sleepercdn.com/images/team_logos/nfl/${boardTeam(abbr).toLowerCase()}.png`
const pts = (v) => (v === null || v === undefined ? '—' : v.toFixed(1))
const pts2 = (x) => (x ? x.v.toFixed(2) : '—')

/* A player's page, remembering the game he was opened from so that page
   can offer the way back. */
export const playerHref = (id, gameId) => `#/players/${encodeURIComponent(id)}${gameId ? `?from=${encodeURIComponent(gameId)}` : ''}`
function PlayerName({ id, gameId, children, className }) {
  if (!id) return <span className={className}>{children}</span>
  return <a href={playerHref(id, gameId)} className={cx('hover:text-v3-call hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call', className)}>{children}</a>
}

function kickoffText(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}

function Badge({ kind }) {
  return kind === 'mine'
    ? <span className="ml-2 inline-flex shrink-0 rounded-[3px] bg-v3-call px-1.5 font-figure text-[11px] font-bold tracking-[0.1em] text-v3-onCall">YOURS</span>
    : <span className="ml-2 inline-flex shrink-0 rounded-[3px] border border-v3-ink3 px-1.5 font-figure text-[11px] font-bold tracking-[0.1em] text-v3-ink3">OPP</span>
}

/* ---- Hero ---- */

function Side({ team, align, lost }) {
  return (
    <div className={cx('flex min-w-0 items-center gap-3 sm:gap-4', align === 'right' ? 'justify-end' : 'justify-start')}>
      {align === 'right' ? (
        <div className="min-w-0 text-right">
          <p className="truncate text-[22px] font-extrabold leading-none sm:text-[30px]"><span className="sm:hidden">{team.abbr}</span><span className="hidden sm:inline">{team.name}</span></p>
          <p className="mt-1 font-figure text-[13px] text-v3-ink3">{team.record || ''}</p>
        </div>
      ) : null}
      <img src={logo(team.abbr)} alt="" width="56" height="56" className="h-10 w-10 shrink-0 sm:h-14 sm:w-14" />
      {align !== 'right' ? (
        <div className="min-w-0">
          <p className="truncate text-[22px] font-extrabold leading-none sm:text-[30px]"><span className="sm:hidden">{team.abbr}</span><span className="hidden sm:inline">{team.name}</span></p>
          <p className="mt-1 font-figure text-[13px] text-v3-ink3">{team.record || ''}</p>
        </div>
      ) : null}
    </div>
  )
}

function Hero({ game }) {
  const played = game.state !== 'pre'
  const aLost = game.state === 'post' && game.home.score > game.away.score
  const hLost = game.state === 'post' && game.away.score > game.home.score
  const last = game.wp.length ? game.wp[game.wp.length - 1].home : null
  return (
    <section aria-label="Score" className="grid gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-8">
        <div className="flex items-center justify-end gap-3 sm:gap-6">
          <Side team={game.away} align="right" />
          {played ? <Fig className={cx('text-[40px] font-extrabold leading-none sm:text-[60px]', aLost && 'text-v3-ink3')}>{game.away.score}</Fig> : null}
        </div>
        <div className="text-center">
          <p className={cx('font-figure text-[15px] font-bold uppercase tracking-[0.08em]', game.state === 'in' ? 'text-v3-cost' : 'text-v3-ink')}>
            {game.state === 'in' ? <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-v3-cost align-middle motion-reduce:animate-none" aria-hidden="true" /> : null}
            {game.state === 'pre' ? kickoffText(game.date) : game.detail}
          </p>
          {game.network ? <p className="mt-1 font-figure text-[13px] text-v3-ink3">{game.network}</p> : null}
        </div>
        <div className="flex items-center justify-start gap-3 sm:gap-6">
          {played ? <Fig className={cx('text-[40px] font-extrabold leading-none sm:text-[60px]', hLost && 'text-v3-ink3')}>{game.home.score}</Fig> : null}
          <Side team={game.home} align="left" />
        </div>
      </div>
      {last !== null ? (
        <div>
          <div className="flex h-[6px] overflow-hidden rounded-full bg-v3-well" role="img" aria-label={`Win probability: ${game.away.abbr} ${Math.round((1 - last) * 100)}%, ${game.home.abbr} ${Math.round(last * 100)}%`}>
            <div className="bg-v3-away" style={{ width: `${(1 - last) * 100}%` }} />
            <div className="flex-1 bg-v3-home" />
          </div>
          <div className="mt-1 flex justify-between font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3">
            <span>{game.away.abbr} {Math.round((1 - last) * 100)}% to win</span>
            <span>{game.home.abbr} {Math.round(last * 100)}%</span>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/* ---- The stake ---- */

function StakePlayer({ p, opp, fx, gameId }) {
  const x = p.kd ? null : fx.pointsFor(p.id, p.points)
  return (
    <div className={cx('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-v3-call/20 px-4 py-3 sm:px-5', opp && 'opacity-90')}>
      <p className="flex min-w-0 items-center gap-2 font-bold">
        {opp ? <span className="font-figure text-[11px] font-bold tracking-[0.1em] text-v3-ink3">OPP</span> : <PosTag pos={p.pos} />}
        <PlayerName id={p.id} gameId={gameId} className="truncate">{p.name}</PlayerName>
      </p>
      <div className="row-span-2 text-right">
        <Fig className="block text-[26px] font-extrabold leading-none">{pts2(x)}</Fig>
        {x ? <span className="font-figure text-[10px] font-bold uppercase tracking-[0.08em] text-v3-ink3">{sourceText(x)}</span> : null}
      </div>
      <p className="truncate font-figure text-[13px] text-v3-ink2">{p.kd ? 'Kickers and defenses are not scored off the box score' : p.line || 'No stats yet'}</p>
    </div>
  )
}

function StakeBanner({ stake, game, fx }) {
  const { mine, theirs, opponent } = stake
  if (!mine.length && !theirs.length) return null
  const sum = (rows) => rows.reduce((a, p) => { const x = p.kd ? null : fx.pointsFor(p.id, p.points); return a + (x ? x.v : 0) }, 0)
  const ms = sum(mine)
  const ts = sum(theirs)
  const oppName = opponent ? opponent.teamName || opponent.name || 'Your opponent' : null
  const net = ms - ts
  return (
    <section aria-labelledby="v3-game-stake" className="grid overflow-hidden rounded-[8px] border border-v3-call/60 bg-v3-callWash/60 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
      <div className="grid content-center gap-0.5 border-b border-v3-call/30 px-5 py-4 lg:border-b-0 lg:border-r">
        <Label className="text-v3-call" id="v3-game-stake">Your stake</Label>
        <p className="text-[20px] font-black">{stake.league}</p>
        {oppName ? <Label>vs {oppName}</Label> : null}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {mine.length ? mine.map((p) => <StakePlayer key={p.id} p={p} fx={fx} gameId={game.id} />) : (
          <p className="col-span-full border-b border-v3-call/20 px-5 py-3 text-[14px] text-v3-ink2">None of your starters are in this game.</p>
        )}
        {theirs.length ? theirs.map((p) => <StakePlayer key={p.id} p={p} opp fx={fx} gameId={game.id} />) : (
          <p className="col-span-full px-5 py-3 text-[14px] text-v3-ink2">
            {oppName ? `${oppName} has no one in this game. Everything here is yours.` : 'No opponent this week, so nothing here counts against you.'}
          </p>
        )}
      </div>
      <div className="grid content-center gap-0.5 border-t border-v3-call/30 px-5 py-4 text-right lg:border-l lg:border-t-0">
        <Label>{theirs.length ? 'Net from this game' : mine.length ? 'You gain here' : 'They gain here'}</Label>
        <p className={cx('font-figure text-[30px] font-extrabold', net > 0 ? 'text-v3-gain' : net < 0 ? 'text-v3-cost' : 'text-v3-ink')}>
          {net > 0 ? '+' : net < 0 ? '−' : ''}{Math.abs(net).toFixed(1)}
        </p>
        <Label>{theirs.length && mine.length ? `${ms.toFixed(1)} – ${ts.toFixed(1)}` : 'unopposed'}</Label>
      </div>
      <p className="col-span-full border-t border-v3-call/30 px-5 py-2 text-[12px] leading-[1.5] text-v3-ink3">
        {fx.platform ? `A figure marked “from ${fx.platform}” is ${fx.platform}’s own total for that player; one marked “Juke calc” is ESPN’s box score scored under your league’s rules until ${fx.platform} publishes its number` : 'Scored under Juke’s default rules from ESPN’s box score'}{game.state === 'in' ? ', updating every 30 seconds' : ''}.
      </p>
    </section>
  )
}

/* ---- Left column ---- */

function LineScore({ game }) {
  const n = Math.max(game.away.lines.length, game.home.lines.length, 4)
  const cols = Array.from({ length: n }, (_, i) => (i < 4 ? String(i + 1) : 'OT'))
  return (
    <Sheet code="Scoring" bodyClass="px-4 py-3 sm:px-5">
      <table className="w-full bg-v3-sheet font-figure text-[14px] tabular-nums [&_th]:border-0 [&_th]:bg-transparent [&_td]:border-b-0">
        <thead><tr className="text-[12px] uppercase tracking-[0.08em] text-v3-ink3"><th className="py-1.5 text-left font-semibold">Team</th>{cols.map((c, i) => <th key={i} className="py-1.5 text-right font-semibold">{c}</th>)}<th className="py-1.5 text-right font-semibold">T</th></tr></thead>
        <tbody>
          {[game.away, game.home].map((t) => (
            <tr key={t.abbr} className="border-t border-v3-rule">
              <td className="py-2 font-sheet font-semibold">{t.abbr}</td>
              {cols.map((_, i) => <td key={i} className="py-2 text-right">{t.lines[i] ?? '—'}</td>)}
              <td className="py-2 text-right font-bold">{t.score ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Sheet>
  )
}

/* Everybody who touched the ball, ranked by what the reader's league paid
   for it: the platform's own figure for a rostered player, Juke's
   calculation under the league's rules for everyone else, each labelled.
   ESPN's own "leaders" are stat leaders -- yards -- which is not the same
   list on a fantasy site: the passer with the most yards is not the player
   who scored the most points. */
export function gamePlayers(game, fx) {
  const out = new Map()
  for (const side of [game.away, game.home]) {
    for (const c of game.box[side.abbr] || []) {
      if (!SCORED_CATEGORIES.includes(c.name)) continue
      for (const row of c.rows) {
        const k = `${side.abbr}|${normName(row.name)}`
        const e = out.get(k) || { abbr: side.abbr, name: row.name, calc: 0, line: playerLine(game, side.abbr, row.name) }
        e.calc += linePoints(c.name, c.labels, row.stats, fx.rules) || 0
        out.set(k, e)
      }
    }
  }
  return [...out.values()].map((e) => {
    const bp = findOnBoard(fx.index, e.abbr, e.name)
    const id = bp ? String(bp.id) : null
    return { ...e, id, pos: bp ? bp.pos : null, owner: id ? fx.owners.get(id) || null : null, x: fx.pointsFor(id, e.calc) }
  }).filter((e) => e.x).sort((a, b) => b.x.v - a.x.v)
}

function Leaders({ game, fx }) {
  const rows = useMemo(() => (game.state === 'pre' ? [] : gamePlayers(game, fx).slice(0, 6)), [game, fx])
  if (!rows.length) return null
  return (
    <Sheet code="Fantasy leaders" aside={fx.label} bodyClass="px-4 py-1 sm:px-5">
      {rows.map((e) => (
        <div key={`${e.abbr}|${e.name}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-v3-rule/60 py-2.5 last:border-b-0">
          <div className="min-w-0">
            <p className="flex min-w-0 items-center font-bold">
              <PlayerName id={e.id} gameId={game.id} className="truncate">{e.name}</PlayerName>
              {e.owner && e.owner.mine ? <Badge kind="mine" /> : null}
            </p>
            {e.owner && !e.owner.mine ? <p className="truncate font-figure text-[11px] font-semibold text-v3-ink2">{e.owner.opp ? 'Your opponent · ' : ''}{e.owner.name}</p> : null}
            <p className="truncate font-figure text-[12px] text-v3-ink3">{e.pos ? `${e.pos} · ` : ''}{e.abbr} · {e.line}</p>
          </div>
          <div className="text-right">
            <Fig className="block text-[19px] font-extrabold leading-none">{pts2(e.x)}</Fig>
            <span className="font-figure text-[10px] font-bold uppercase tracking-[0.08em] text-v3-ink3">{sourceText(e.x)}</span>
          </div>
        </div>
      ))}
    </Sheet>
  )
}

const STAT_ROWS = ['Total Yards', '1st Downs', 'Passing', 'Rushing', '3rd down efficiency', 'Turnovers', 'Penalties', 'Possession']
function TeamStats({ game }) {
  const rows = STAT_ROWS.map((k) => game.teamStats.find((s) => s.label === k)).filter(Boolean)
  if (!rows.length) return null
  const val = (v) => {
    const m = /^(\d+):(\d+)$/.exec(v)
    return m ? Number(m[1]) * 60 + Number(m[2]) : parseFloat(v) || 0
  }
  return (
    <Sheet code="Team stats" aside={<><span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-v3-away align-middle" />{game.away.abbr} · <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-v3-home align-middle" />{game.home.abbr}</>} bodyClass="grid gap-3 px-4 py-4 sm:px-5">
      {rows.map((r) => {
        const a = val(r.away)
        const h = val(r.home)
        const m = Math.max(a, h) || 1
        return (
          <div key={r.label}>
            <Label as="p" className="text-center">{r.label}</Label>
            <div className="mt-1 grid grid-cols-[52px_1fr_1fr_52px] items-center gap-1.5 font-figure text-[14px]">
              <span>{r.away}</span>
              <span className="h-[6px] justify-self-end rounded-full bg-v3-away" style={{ width: `${(a / m) * 100}%` }} />
              <span className="h-[6px] rounded-full bg-v3-home" style={{ width: `${(h / m) * 100}%` }} />
              <span className="text-right">{r.home}</span>
            </div>
          </div>
        )
      })}
    </Sheet>
  )
}

/* ---- Win probability, interactive ----

   Every point is a play: hover, drag a finger, or step with the arrow keys,
   and the card says when it was, the score, who was favoured and what
   happened. Scoring plays are dots; the ones with one of your players in
   them are larger and cobalt. */
function WinChart({ game, isMine }) {
  const X = game.wp
  const [cur, setCur] = useState(null)
  const svgRef = useRef(null)
  if (X.length < 2) return null
  const W = 640, H = 260, L = 38, R = 12, T = 16, B = 30
  const n = X.length
  const x = (i) => L + (i / (n - 1)) * (W - L - R)
  const y = (v) => T + (1 - v) * (H - T - B)
  const midY = y(0.5)
  const d = X.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.home).toFixed(1)}`).join(' ')
  const area = `${d} L ${x(n - 1)} ${midY} L ${x(0)} ${midY} Z`
  const quarters = []
  X.forEach((p, i) => {
    const q = p.play && p.play.period
    if (q && (!quarters.length || quarters[quarters.length - 1].q !== q)) quarters.push({ q, i })
  })
  const pick = (clientX) => {
    const r = svgRef.current.getBoundingClientRect()
    const vx = ((clientX - r.left) / r.width) * W
    setCur(Math.max(0, Math.min(n - 1, Math.round(((vx - L) / (W - L - R)) * (n - 1)))))
  }
  const p = cur === null ? null : X[cur]
  const fav = p ? (p.home >= 0.5 ? game.home : game.away) : null
  const favPct = p ? Math.round((p.home >= 0.5 ? p.home : 1 - p.home) * 100) : null
  const leftPct = cur === null ? 0 : (x(cur) / W) * 100
  return (
    <Sheet code="Win probability" aside="Hover or drag · ← → to step" bodyClass="pb-3">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full cursor-crosshair touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call"
          tabIndex={0}
          role="img"
          aria-label={`${game.home.name} win probability through the game. Use the arrow keys to step through plays.`}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={() => setCur(null)}
          onFocus={() => setCur((c) => (c === null ? n - 1 : c))}
          onBlur={() => setCur(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') { setCur((c) => Math.min(n - 1, (c ?? n - 1) + 1)); e.preventDefault() }
            if (e.key === 'ArrowLeft') { setCur((c) => Math.max(0, (c ?? n - 1) - 1)); e.preventDefault() }
          }}
        >
          <defs>
            <clipPath id="v3wp-top"><rect x="0" y="0" width={W} height={midY} /></clipPath>
            <clipPath id="v3wp-bot"><rect x="0" y={midY} width={W} height={H} /></clipPath>
          </defs>
          {[1, 0.75, 0.25, 0].map((v) => <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-v3-rule" strokeOpacity="0.5" />)}
          <line x1={L} x2={W - R} y1={midY} y2={midY} className="stroke-v3-rule" strokeDasharray="4 4" />
          <text x={L - 6} y={y(1) + 4} textAnchor="end" className="fill-v3-ink2 font-figure" fontSize="11">{game.home.abbr}</text>
          <text x={L - 6} y={midY + 4} textAnchor="end" className="fill-v3-ink3 font-figure" fontSize="11">50%</text>
          <text x={L - 6} y={y(0) + 4} textAnchor="end" className="fill-v3-ink2 font-figure" fontSize="11">{game.away.abbr}</text>
          {quarters.map((o) => (
            <g key={o.q}>
              <line x1={x(o.i)} x2={x(o.i)} y1={T} y2={H - B} className="stroke-v3-rule" strokeOpacity="0.6" />
              <text x={x(o.i) + 4} y={H - B + 16} className="fill-v3-ink3 font-figure" fontSize="11">{o.q > 4 ? 'OT' : `Q${o.q}`}</text>
            </g>
          ))}
          <path d={area} className="fill-v3-home" fillOpacity="0.16" clipPath="url(#v3wp-top)" />
          <path d={area} className="fill-v3-away" fillOpacity="0.16" clipPath="url(#v3wp-bot)" />
          <path d={d} fill="none" className="stroke-v3-home" strokeWidth="2.2" clipPath="url(#v3wp-top)" />
          <path d={d} fill="none" className="stroke-v3-away" strokeWidth="2.2" clipPath="url(#v3wp-bot)" />
          {X.map((q, i) => (q.play && q.play.scoring ? (
            <circle key={i} cx={x(i)} cy={y(q.home)} r={isMine(q.play.text) ? 5.5 : 3.5} className={cx(isMine(q.play.text) ? 'fill-v3-call' : 'fill-v3-ink', 'stroke-v3-sheet')} strokeWidth="1.5" />
          ) : null))}
          {p ? (
            <g>
              <line x1={x(cur)} x2={x(cur)} y1={T} y2={H - B} className="stroke-v3-ink" strokeWidth="1" />
              <circle cx={x(cur)} cy={y(p.home)} r="5" className={cx(p.home >= 0.5 ? 'fill-v3-home' : 'fill-v3-away', 'stroke-v3-sheet')} strokeWidth="2" />
            </g>
          ) : null}
        </svg>
        {p ? (
          <div
            className="pointer-events-none absolute top-2 w-[250px] max-w-[70%] rounded-[6px] border border-v3-rule bg-v3-paper px-3 py-2.5 shadow-v3-raised"
            style={leftPct > 50 ? { right: `calc(${100 - leftPct}% + 10px)` } : { left: `calc(${leftPct}% + 10px)` }}
            aria-live="polite"
          >
            <div className="flex justify-between gap-2 font-figure text-[12px] font-semibold uppercase tracking-[0.08em] text-v3-ink3">
              <span>{p.play && p.play.period ? `${p.play.period > 4 ? 'OT' : `Q${p.play.period}`} · ${p.play.clock || ''}` : 'Kickoff'}</span>
              <span className="text-v3-ink">{game.away.abbr} {p.play && p.play.away !== null ? p.play.away : 0} – {p.play && p.play.home !== null ? p.play.home : 0} {game.home.abbr}</span>
            </div>
            <p className="my-1 flex items-center gap-2 font-figure text-[22px] font-extrabold"><span aria-hidden="true" className={cx('h-3 w-3 rounded-full', p.home >= 0.5 ? 'bg-v3-home' : 'bg-v3-away')} />{fav.abbr} {favPct}%</p>
            <p className={cx('text-[13px] leading-[1.4] text-v3-ink2', p.play && isMine(p.play.text) && 'border-l-[3px] border-v3-call pl-2')}>{(p.play && p.play.text) || '—'}</p>
          </div>
        ) : null}
      </div>
      <p className="px-4 pt-1 font-figure text-[12px] text-v3-ink3 sm:px-5">ESPN’s model. Dots are scoring plays{isMine.any ? '; cobalt dots involve your players' : ''}.</p>
    </Sheet>
  )
}

/* ---- Box score ---- */

function BoxScore({ game, marks, rules, scoring, fx }) {
  const [side, setSide] = useState(game.away.abbr)
  const cats = game.box[side] || []
  return (
    <Sheet code="Box score" aside={`FPTS · ${scoring}, this line only`} bodyClass="">
      <div role="tablist" aria-label="Team" className="flex gap-2 border-b border-v3-rule px-4 py-3 sm:px-5">
        {[game.away, game.home].map((t) => (
          <button
            key={t.abbr}
            type="button"
            role="tab"
            aria-selected={side === t.abbr}
            onClick={() => setSide(t.abbr)}
            className={cx('min-h-[40px] rounded-full border px-4 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call',
              side === t.abbr ? 'border-transparent bg-v3-ink text-v3-paper' : 'border-v3-rule text-v3-ink2 hover:text-v3-ink')}
          >
            {t.location ? `${t.location} ${t.name}` : t.name}
          </button>
        ))}
      </div>
      {cats.length ? cats.map((c) => {
        const scored = SCORED_CATEGORIES.includes(c.name) && c.name !== 'fumbles'
        return (
          <div key={c.name} className="overflow-x-auto px-4 pb-1 pt-3 sm:px-5">
            <table className="w-full min-w-[480px] bg-v3-sheet font-figure text-[14px] tabular-nums [&_th]:border-0 [&_th]:bg-transparent [&_td]:border-b-0">
              <thead>
                <tr className="text-[12px] uppercase tracking-[0.06em] text-v3-ink3">
                  <th className="py-1.5 text-left font-semibold">{c.title}</th>
                  {c.labels.map((l) => <th key={l} className="px-1.5 py-1.5 text-right font-semibold">{l}</th>)}
                  {scored ? <th className="py-1.5 pl-1.5 text-right font-semibold">FPTS</th> : null}
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r, i) => {
                  const mark = marks.get(`${side}|${normName(r.name)}`)
                  return (
                    <tr key={i} className={cx('border-t border-v3-rule', mark === 'mine' && 'bg-v3-call/15', mark === 'theirs' && 'bg-v3-ink/[0.04]')}>
                      <td className={cx('py-2 pr-2 font-sheet font-semibold', mark === 'mine' && 'shadow-[inset_3px_0_0_rgb(var(--v3-call))] pl-2')}>
                        <span className="inline-flex items-center whitespace-nowrap"><PlayerName id={(findOnBoard(fx.index, side, r.name) || {}).id} gameId={game.id}>{r.name}</PlayerName>{mark ? <Badge kind={mark} /> : null}</span>
                      </td>
                      {r.stats.map((v, j) => <td key={j} className="px-1.5 py-2 text-right">{v}</td>)}
                      {scored ? <td className="py-2 pl-1.5 text-right font-bold text-v3-call">{pts(linePoints(c.name, c.labels, r.stats, rules))}</td> : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      }) : <p className="px-5 py-4 text-[15px] text-v3-ink2">{game.state === 'pre' ? 'The box score fills in once the game kicks off.' : 'ESPN has no box score for this game yet.'}</p>}
      <div className="h-3" />
    </Sheet>
  )
}

/* ---- Drives ---- */

const DRIVES_SHOWN = 6
function Drives({ game, isMine }) {
  const [all, setAll] = useState(false)
  if (!game.drives.length) return null
  const shown = all ? game.drives : game.drives.slice(0, DRIVES_SHOWN)
  return (
    <Sheet code="Drives" aside="Latest first" bodyClass="">
      {shown.map((d) => (
        <div key={d.id} className="border-t border-v3-rule px-4 py-3 first:border-t-0 sm:px-5">
          <p className="flex items-center gap-2 font-bold">
            <img src={logo(d.team)} alt="" width="18" height="18" className="h-[18px] w-[18px]" />
            {d.team} · <span className={/touchdown/i.test(d.result) ? 'text-v3-gain' : ''}>{d.result || 'In progress'}</span>
          </p>
          {d.summary ? <p className="font-figure text-[12px] text-v3-ink3">{d.summary}</p> : null}
          {d.plays.slice(0, 4).map((pl) => (
            <div key={pl.id} className={cx('mt-2 grid grid-cols-[64px_minmax(0,1fr)] gap-2 text-[14px] text-v3-ink2', isMine(pl.text) && '-mx-4 bg-v3-call/15 px-4 py-1.5 shadow-[inset_3px_0_0_rgb(var(--v3-call))] sm:-mx-5 sm:px-5')}>
              <span className="font-figure text-[12px] text-v3-ink3">{pl.period ? `${pl.period > 4 ? 'OT' : `Q${pl.period}`} ${pl.clock || ''}` : ''}</span>
              <span>{pl.text}{pl.down ? <span className="block font-figure text-[12px] text-v3-ink3">{pl.down}</span> : null}</span>
            </div>
          ))}
        </div>
      ))}
      {game.drives.length > DRIVES_SHOWN && !all ? (
        <button type="button" onClick={() => setAll(true)} className="flex min-h-[48px] w-full items-center justify-center border-t border-v3-rule text-[15px] font-semibold hover:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call">
          All {game.drives.length} drives
        </button>
      ) : null}
    </Sheet>
  )
}

/* ---- Other games, as Sleeper's strip does it ----

   The week's slate off the same scoreboard the header's kickoff pill reads,
   the game on screen first and ringed. Scrolls sideways; a game without an
   event id (a stale cached scoreboard) is left out rather than drawn dead. */
function GameStrip({ currentId }) {
  const games = useSlate(true)
  const rows = useMemo(() => {
    if (!Array.isArray(games)) return []
    const order = { in: 0, pre: 1, post: 2 }
    return games.filter((g) => g && g.id)
      .slice()
      .sort((a, b) => (String(a.id) === String(currentId) ? -1 : String(b.id) === String(currentId) ? 1 : 0) || (order[a.state] ?? 3) - (order[b.state] ?? 3))
  }, [games, currentId])
  if (rows.length < 2) return null
  return (
    <nav aria-label="Other games this week" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8">
      {rows.map((g) => <GameChip key={g.id} g={g} on={String(g.id) === String(currentId)} />)}
    </nav>
  )
}

/* The phone's hero: each club's abbreviation set huge and faint in its own
   colour behind the name, the way Sleeper does it -- the one place the page
   spends colour on identity rather than on a mark. */
function HeroPhone({ game }) {
  const played = game.state !== 'pre'
  const last = game.wp.length ? game.wp[game.wp.length - 1].home : null
  const side = (t, right) => (
    <div className={cx('relative min-h-[88px] overflow-hidden', right ? 'text-right' : '')}>
      <span aria-hidden="true" className={cx('pointer-events-none absolute top-1/2 -translate-y-1/2 select-none font-black italic leading-none opacity-30', right ? '-right-2 text-v3-home' : '-left-2 text-v3-away')} style={{ fontSize: 58 }}>{t.abbr}</span>
      <div className="relative pt-4">
        <p className="text-[22px] font-extrabold leading-none">{t.name}</p>
        <p className="mt-1 font-figure text-[13px] text-v3-ink2">{t.record || ''}</p>
      </div>
    </div>
  )
  return (
    <section aria-label="Score" className="grid gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        {side(game.away, false)}
        <div className="grid justify-items-center gap-0.5 text-center">
          {played ? (
            <p className="font-figure text-[34px] font-extrabold leading-none">
              <span className={cx(game.state === 'post' && game.home.score > game.away.score && 'text-v3-ink3')}>{game.away.score}</span>
              <span className="mx-1 text-v3-ink3">–</span>
              <span className={cx(game.state === 'post' && game.away.score > game.home.score && 'text-v3-ink3')}>{game.home.score}</span>
            </p>
          ) : null}
          <p className={cx('font-figure text-[13px] font-bold uppercase tracking-[0.06em]', game.state === 'in' ? 'text-v3-cost' : 'text-v3-ink2')}>
            {game.state === 'pre' ? kickoffText(game.date) : game.detail}
          </p>
          {game.network ? <p className="font-figure text-[12px] text-v3-ink3">{game.network}</p> : null}
        </div>
        {side(game.home, true)}
      </div>
      {last !== null ? (
        <p className="flex justify-between font-figure text-[12px] font-semibold uppercase tracking-[0.1em]">
          <span className="text-v3-ink2"><span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-v3-away align-middle" />{game.away.abbr} {Math.round((1 - last) * 100)}%</span>
          <span className="text-v3-ink3">to win</span>
          <span className="text-v3-ink2"><span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-v3-home align-middle" />{game.home.abbr} {Math.round(last * 100)}%</span>
        </p>
      ) : null}
    </section>
  )
}

/* ---- In your league ----

   Sleeper's fantasy view of a game: both clubs' fantasy-relevant players
   side by side by position, each with the week's projection and -- once the
   game has started -- what the box score has scored them. For a connected
   reader, whose fantasy team holds each one; for a guest, just the figures.
   Players are the board's, so a practice-squad body the board does not
   carry is not listed. */
const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
const POS_DEPTH = { QB: 1, RB: 3, WR: 4, TE: 2, K: 1, DST: 1 }

function useClubPlayers(game, stake) {
  const engine = typeof window !== 'undefined' ? window.JukeEngine : null
  return useMemo(() => {
    if (!game || !engine || !engine.board) return null
    const board = engine.board()
    if (!board || !board.length) return null
    const clubs = { [boardTeam(game.away.abbr)]: game.away.abbr, [boardTeam(game.home.abbr)]: game.home.abbr }
    const proj = (p) => { try { const v = stake.weekPts ? stake.weekPts(p) : null; return Number.isFinite(v) ? v : null } catch { return null } }
    const rows = board.filter((p) => clubs[String(p.team || '').toUpperCase()] && POS_ORDER.includes(p.pos)).map((p) => {
      const abbr = clubs[String(p.team).toUpperCase()]
      const kd = p.pos === 'K' || p.pos === 'DST'
      const owner = stake.owners.get(String(p.id)) || null
      return {
        id: String(p.id), name: p.name, pos: p.pos, abbr, inj: p.inj || '', owner,
        proj: proj(p),
        actual: game.state === 'pre' || kd ? null : playerPoints(game, abbr, p.name, stake.rules),
      }
    })
    const out = []
    for (const pos of POS_ORDER) {
      const pick = (abbr) => rows.filter((r) => r.pos === pos && r.abbr === abbr)
        .sort((a, b) => (!!b.owner - !!a.owner) || (b.proj ?? -1) - (a.proj ?? -1))
        .filter((r, i) => i < POS_DEPTH[pos] || (r.owner && r.owner.mine))
      const away = pick(game.away.abbr)
      const home = pick(game.home.abbr)
      if (away.length || home.length) out.push({ pos, away, home })
    }
    return { groups: out, all: rows }
  }, [game, engine, stake])
}

function LeagueCell({ r, right, started, fx, gameId }) {
  if (!r) return <div />
  const x = started ? fx.pointsFor(r.id, r.actual) : null
  return (
    <div className={cx('min-w-0 py-2', right && 'text-right')}>
      {r.owner ? (
        <p className={cx('truncate font-figure text-[11px] font-semibold', r.owner.mine ? 'text-v3-call' : 'text-v3-ink3')}>{r.owner.mine ? 'Your team' : r.owner.name}</p>
      ) : null}
      <p className={cx('truncate font-bold', r.owner && r.owner.mine && 'text-v3-call')}><PlayerName id={r.id} gameId={gameId}>{r.name}</PlayerName></p>
      <p className="font-figure text-[12px] text-v3-ink3">{r.pos === 'DST' ? 'D/ST' : r.pos} · {r.abbr}</p>
      <p className="font-figure text-[13px] text-v3-ink2">
        {started ? <><span className="text-[16px] font-extrabold text-v3-ink" title={sourceText(x)}>{pts2(x)}</span> <span className="text-v3-ink3">/ {pts(r.proj)} proj</span></> : <>{pts(r.proj)} <span className="text-v3-ink3">proj</span></>}
      </p>
    </div>
  )
}

function InYourLeague({ game, stake, clubs, fx }) {
  if (!clubs || !clubs.groups.length) return null
  const started = game.state !== 'pre'
  return (
    <Sheet code={stake.league ? `In ${stake.league}` : 'Fantasy view'} aside={started ? 'Scored / projected' : 'Projected this week'} bodyClass="px-4 pb-2 sm:px-5">
      <div className="flex justify-between pt-3 font-figure text-[12px] font-bold uppercase tracking-[0.1em]">
        <span className="text-v3-ink2"><span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-v3-away align-middle" />{game.away.abbr}</span>
        <span className="text-v3-ink2"><span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-v3-home align-middle" />{game.home.abbr}</span>
      </div>
      {clubs.groups.map((g) => (
        <div key={g.pos}>
          <div className="my-2 flex items-center gap-3">
            <span className="h-px flex-1 bg-v3-rule" />
            <PosTag pos={g.pos} />
            <span className="h-px flex-1 bg-v3-rule" />
          </div>
          {Array.from({ length: Math.max(g.away.length, g.home.length) }, (_, i) => (
            <div key={i} className="grid grid-cols-2 gap-4 border-b border-v3-rule/60 last:border-b-0">
              <LeagueCell r={g.away[i]} started={started} fx={fx} gameId={game.id} />
              <LeagueCell r={g.home[i]} right started={started} fx={fx} gameId={game.id} />
            </div>
          ))}
        </div>
      ))}
      <p className="py-2 text-[12px] text-v3-ink3">
        {stake.league ? 'Owners from your league’s rosters. ' : 'Connect a league to see who owns each player. '}
        Projections are {stake.scoring === 'Your league' ? 'under your league’s rules' : 'Juke’s default scoring'}; kickers and defenses are not scored off the box score.
      </p>
    </Sheet>
  )
}

function Injuries({ game, clubs }) {
  const [side, setSide] = useState(game.away.abbr)
  if (!clubs) return null
  const hurt = clubs.all.filter((r) => r.inj && injurySeverity(r.inj))
  if (!hurt.length) return null
  const rows = hurt.filter((r) => r.abbr === side)
  return (
    <Sheet code="Injury report" aside="Fantasy players only" bodyClass="">
      <div role="tablist" aria-label="Team" className="flex gap-2 border-b border-v3-rule px-4 py-3 sm:px-5">
        {[game.away, game.home].map((t) => (
          <button key={t.abbr} type="button" role="tab" aria-selected={side === t.abbr} onClick={() => setSide(t.abbr)}
            className={cx('min-h-[40px] rounded-full border px-4 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call', side === t.abbr ? 'border-transparent bg-v3-ink text-v3-paper' : 'border-v3-rule text-v3-ink2')}>
            {t.name}
          </button>
        ))}
      </div>
      {rows.length ? rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 border-b border-v3-rule px-4 py-2.5 last:border-b-0 sm:px-5">
          <p className="min-w-0 truncate font-semibold">{r.name} <span className="font-figure text-[12px] font-normal text-v3-ink3">{r.pos === 'DST' ? 'D/ST' : r.pos}</span></p>
          <InjuryChip severity={injurySeverity(r.inj)} code={r.inj} />
        </div>
      )) : <p className="px-5 py-3 text-[14px] text-v3-ink2">No designations on this side.</p>}
    </Sheet>
  )
}

function GameInfo({ game }) {
  return (
    <Sheet band={false} bodyClass="grid gap-1 px-4 py-3 text-[14px] text-v3-ink2 sm:px-5">
      <p>{kickoffText(game.date)}</p>
      {game.venue ? <p>{game.venue.name}{game.venue.city ? `, ${game.venue.city}` : ''}</p> : null}
      {game.network ? <p>{game.network}</p> : null}
    </Sheet>
  )
}

/* The phone's three views of one game, as Sleeper splits feed from stats. */
const PHONE_TABS = [
  { key: 'plays', label: 'Plays' },
  { key: 'stats', label: 'Stats' },
  { key: 'box', label: 'Box score' },
]
function PhoneTabs({ tab, setTab }) {
  return (
    <div role="tablist" aria-label="Game views" className="grid grid-cols-3 gap-1 rounded-full border border-v3-rule bg-v3-sheet p-1">
      {PHONE_TABS.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
          className={cx('min-h-[44px] rounded-full text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call', tab === t.key ? 'bg-v3-ink text-v3-paper' : 'text-v3-ink2')}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

/* ---- Page ---- */

export default function V3Game({ gameId }) {
  const { status, game } = useGame(gameId)
  const stake = useStake(game)
  const clubs = useClubPlayers(game, stake)
  const fx = useFantasy(game ? game.week : null)
  const wide = useMinWidth(768)
  const { resolved } = useV3Theme()
  const colors = useMemo(() => (game ? gameColors(game.away, game.home, resolved === 'light' ? 'light' : 'dark') : null), [game, resolved])
  const [tab, setTab] = useState('plays')

  const marks = useMemo(() => {
    const m = new Map()
    if (!game) return m
    stake.theirs.forEach((p) => m.set(`${p.abbr}|${p.key}`, 'theirs'))
    stake.mine.forEach((p) => m.set(`${p.abbr}|${p.key}`, 'mine'))
    return m
  }, [game, stake])
  const isMine = useMemo(() => {
    const shorts = stake.mine.filter((p) => !p.kd).map((p) => playShortName(p.name)).filter(Boolean)
    const f = (text) => !!text && shorts.some((s) => text.includes(s))
    f.any = shorts.length > 0
    return f
  }, [stake])

  if (status === 'bad') {
    return (
      <div className="grid gap-6">
        <p className="text-[28px] font-black">No game at that address.</p>
        <div><GoLink href="#/">Back to Now</GoLink></div>
      </div>
    )
  }
  if (!game) {
    return status === 'error' ? (
      <div className="grid gap-4">
        <p className="text-[28px] font-black">ESPN did not answer for this game.</p>
        <p className="text-[15px] text-v3-ink2">Its scoreboard is where every figure on this page comes from. Try again in a minute.</p>
        <div><QuietButton href="#/">Back to Now</QuietButton></div>
      </div>
    ) : (
      <div className="grid gap-6" aria-busy="true">
        <div className="h-[92px] animate-pulse rounded-[6px] bg-v3-well" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><Sheet band={false}><Skeleton lines={6} /></Sheet><Sheet band={false}><Skeleton lines={6} /></Sheet><Sheet band={false}><Skeleton lines={6} /></Sheet></div>
      </div>
    )
  }

  // The two clubs' colours, set once on the page root so every chart line,
  // stat bar and watermark below reads them through the --v3-away/--v3-home
  // tokens without being told whose colours they are.
  const vars = colors ? { '--v3-away': colors.away, '--v3-home': colors.home } : undefined
  const crumbs = (
    <Crumbs
      items={[{ label: 'Scores', href: '#/scores' }, { label: 'NFL', href: '#/scores' }, { label: `${game.away.abbr} @ ${game.home.abbr} · ${longDate(game.date)}` }]}
      back={{ label: 'All scores', href: game.week ? `#/scores?week=${game.week}` : '#/scores' }}
    />
  )

  if (!wide) {
    return (
      <div className="grid gap-5" style={vars}>
        <GameStrip currentId={game.id} />
        {crumbs}
        <h1 className="sr-only">{game.away.name} at {game.home.name}</h1>
        <HeroPhone game={game} />
        <WinChart game={game} isMine={isMine} />
        <StakeBanner stake={stake} game={game} fx={fx} />
        <PhoneTabs tab={tab} setTab={setTab} />
        {tab === 'plays' ? <Drives game={game} isMine={isMine} /> : null}
        {tab === 'stats' ? (
          <div className="grid gap-5">
            <InYourLeague game={game} stake={stake} clubs={clubs} fx={fx} />
            <Leaders game={game} fx={fx} />
            <TeamStats game={game} />
            <LineScore game={game} />
            <Injuries game={game} clubs={clubs} />
            <GameInfo game={game} />
          </div>
        ) : null}
        {tab === 'box' ? <BoxScore game={game} marks={marks} rules={stake.rules} scoring={stake.scoring} fx={fx} /> : null}
      </div>
    )
  }

  return (
    <div className="grid gap-6" style={vars}>
      <GameStrip currentId={game.id} />
      {crumbs}
      <h1 className="sr-only">{game.away.name} at {game.home.name}</h1>
      <Hero game={game} />
      <StakeBanner stake={stake} game={game} fx={fx} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <div className="grid gap-5">
          <LineScore game={game} />
          <Leaders game={game} fx={fx} />
          <TeamStats game={game} />
          <Injuries game={game} clubs={clubs} />
          <GameInfo game={game} />
        </div>
        <div className="grid min-w-0 gap-5">
          <WinChart game={game} isMine={isMine} />
          <InYourLeague game={game} stake={stake} clubs={clubs} fx={fx} />
          <BoxScore game={game} marks={marks} rules={stake.rules} scoring={stake.scoring} fx={fx} />
        </div>
        <div className="grid gap-5">
          <Drives game={game} isMine={isMine} />
        </div>
      </div>
      <p className="font-figure text-[12px] text-v3-ink3">Every figure on this page is ESPN’s{game.state === 'in' ? ', refreshed every 30 seconds while the game is live' : ''}.</p>
    </div>
  )
}
