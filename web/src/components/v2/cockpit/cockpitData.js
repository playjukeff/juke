/* Every figure the cockpit draws, read off window.JukeEngine.

   The same contract v2data.js states for the homepage: pure functions over
   the bridge, no React, and never a second opinion about football. Each
   reader below asks a function app.js already exposes — headerInfo(),
   suggestions(), survivalProbability(), analyseDraft(), seatedLineup(),
   draftFit(), tierRemaining() — and shapes the answer for drawing. The
   player pool's filter and sort are DraftRoom.jsx's own, restated here
   because they are a view over the board rather than a measurement of it:
   every value they order by is read through the same readers the cells
   draw from, so a sort can never disagree with what is on screen. */

import { SORT_DEFAULT_DIR } from '../../playerColumns.js'

export { SORT_DEFAULT_DIR }

export const LEAD = ['QB', 'RB', 'WR', 'TE']
export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
export const POS_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST']

export function DE() {
  return typeof window !== 'undefined' ? window.DraftEngine : null
}

export function ordinal(n) {
  const r = n % 100
  if (r >= 11 && r <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
}

export function signedInt(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const r = Math.round(v)
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}`
}

/* ---- The header ---- */

export function readHeader(engine) {
  const h = engine.headerInfo()
  if (!h.started) return { started: false }
  const de = DE()
  const league = engine.league()
  const picks = engine.picks() || []
  const overall = picks.length + 1
  const onClock = !h.over && de ? de.onTheClock(league, picks.length) : null
  return {
    ...h,
    teams: league.teams,
    rounds: league.rounds,
    total: league.teams * league.rounds,
    picksMade: picks.length,
    overall,
    round: onClock ? onClock.round : null,
    code: onClock && de ? de.pickCode(overall, league) : null,
    onClockSlot: onClock ? onClock.slot : null,
    onClockName: onClock ? engine.teamLabel(onClock.slot) : null,
    paused: !!engine.paused(),
    clockLength: engine.clockLength(),
  }
}

/* "If you wait" means past THIS pick — the off-by-one DraftRoom.jsx lifted
   into one place after it cost a design-review round. When it is your turn,
   nextPicksFor(mySlot, n)[0] is the pick you are on right now. */
export function readNextPicks(engine, myTurn) {
  const slot = engine.mySlot()
  const upcoming = engine.nextPicksFor(slot, 6) || []
  const ahead = myTurn ? upcoming.slice(1) : upcoming
  return { nextOverall: ahead[0] ?? null, nextPicks: ahead.slice(0, 4) }
}

/* ---- The player pool ---- */

export function readersFor(engine, season, nextOverall) {
  const league = engine.league()
  const rules = engine.rulesForFormat(league.scoring)
  const priorYear = engine.priorSeason ? engine.priorSeason() : null
  const pointsProjected = (p) => {
    const stat = engine.statOf(p)
    if (!stat || !stat.p) return null
    return engine.pointsUnder(stat.p, rules)
  }
  const vorpProjected = (p) => engine.replacementGap(p)
  const prior = season === 'prior'
  return {
    priorYear,
    pointsFor: prior ? (p) => (p.priorPts === undefined ? null : p.priorPts) : pointsProjected,
    vorpFor: prior ? () => null : vorpProjected,
    valueFor: (p) => engine.overallScore(p),
    survivalFor: (p) => engine.survivalProbability(p, nextOverall),
    projOf: (p) => {
      const s = engine.statOf(p)
      if (prior) {
        const line = priorYear && s && s.s ? s.s[priorYear] : null
        return line && line.gp > 0 ? line : null
      }
      return s && s.p ? s.p : null
    },
    pointsProjected,
  }
}

export function teamsOnBoard(board) {
  return [...new Set(board.map((p) => p.team).filter(Boolean))].sort()
}

export function filterAndSort(engine, board, f, readers) {
  const flex = engine.flexPositions() || []
  const q = (f.search || '').trim().toLowerCase()
  const list = board
    .filter((p) => f.showDrafted || !p.drafted)
    .filter((p) => (f.pos === 'ALL' ? true : f.pos === 'FLEX' ? flex.includes(p.pos) : p.pos === f.pos))
    .filter((p) => {
      if (f.tenure === 'all') return true
      const exp = engine.statOf(p)?.exp
      return f.tenure === 'rookie' ? exp === 0 : exp !== undefined && exp > 0
    })
    .filter((p) => f.team === 'ALL' || p.team === f.team)
    .filter((p) => !q || p.name.toLowerCase().includes(q))

  if (f.sortBy === 'board') return list.sort((a, b) => a.overall - b.overall)
  const reader =
    f.sortBy === 'adp' ? (p) => p.adp
      : f.sortBy === 'pts' ? readers.pointsFor
        : f.sortBy === 'vorp' ? readers.vorpFor
          : f.sortBy === 'juke' ? readers.valueFor
            : f.sortBy === 'tier' ? (p) => p.tier
              : f.sortBy === 'lasts' ? readers.survivalFor
                : (p) => { const proj = readers.projOf(p); const v = proj ? proj[f.sortBy] : null; return v || null }
  // A missing number is not a small number: blanks go last both ways.
  return list.sort((a, b) => {
    const av = reader(a)
    const bv = reader(b)
    const am = av == null || Number.isNaN(av)
    const bm = bv == null || Number.isNaN(bv)
    if (am && bm) return a.overall - b.overall
    if (am) return 1
    if (bm) return -1
    return f.sortDir === 'asc' ? av - bv : bv - av
  })
}

/* Per-position, per-tier average points over the WHOLE board — a tier's own
   quality does not change as it empties. What the pool's tier divider names
   as "the next tier projects N fewer". Same readers as the PTS column. */
export function tierAverages(board, pointsFor) {
  const out = {}
  LEAD.forEach((pos) => {
    const byTier = {}
    board.filter((p) => p.pos === pos && p.tier != null).forEach((p) => {
      const pts = pointsFor(p)
      if (pts == null) return
      if (!byTier[p.tier]) byTier[p.tier] = { sum: 0, n: 0 }
      byTier[p.tier].sum += pts
      byTier[p.tier].n += 1
    })
    out[pos] = Object.fromEntries(Object.entries(byTier).map(([t, { sum, n }]) => [t, sum / n]))
  })
  return out
}

/* Rows for the pool, with the two dividers DraftRoom's table draws: a tier
   cliff (board order, one position) and "real ADP ends here" (board order,
   any filter). Outside board order either one would claim a boundary the
   sort has scattered. */
export function withDividers(engine, players, f, tierAvg) {
  const showTier = f.sortBy === 'board' && LEAD.includes(f.pos)
  const showDeep = f.sortBy === 'board'
  if (!showTier && !showDeep) return players.map((p) => ({ type: 'player', key: p.id || p.name, player: p }))
  const rows = []
  const lastAt = {}
  let deepShown = !showDeep
  players.forEach((p) => {
    if (showTier && !p.drafted && LEAD.includes(p.pos) && p.tier != null) {
      const last = lastAt[p.pos]
      if (last && p.tier > last.tier) {
        const avgs = tierAvg[p.pos] || {}
        const a = avgs[last.tier]
        const b = avgs[last.tier + 1]
        rows.push({
          type: 'tier',
          key: `tier-${p.pos}-${last.tier}`,
          pos: p.pos,
          tier: last.tier,
          remaining: engine.tierRemaining(last),
          drop: a != null && b != null ? Math.round(a - b) : null,
        })
      }
      lastAt[p.pos] = p
    }
    if (!deepShown && p.deep) {
      rows.push({ type: 'deep', key: 'deep-start' })
      deepShown = true
    }
    rows.push({ type: 'player', key: p.id || p.name, player: p })
  })
  return rows
}

/* ---- Roster ---- */

export function readRoster(engine, slot) {
  const lineup = engine.seatedLineup(slot)
  const league = engine.league()
  const bench = []
  for (let i = 0; i < league.bench; i++) bench.push(lineup.bench[i] || null)
  // Past the bench count only when the roster genuinely holds more (it
  // cannot in a legal draft, but a shown roster must never hide a player).
  for (let i = league.bench; i < lineup.bench.length; i++) bench.push(lineup.bench[i])
  return { seats: lineup.seats, bench }
}

/* ---- Decide ---- */

// The lines below which "scarce" and "safe" stop meaning anything — the same
// two DraftDecideScreen.jsx uses, so the two screens cannot label one
// candidate two ways.
export const BAD_VORP = -30
export const AT_RISK = 0.4

export function readDecide(engine, nextOverall) {
  const raw = engine.suggestions('ALL').slice(0, 3)
  const candidates = raw.map((player) => ({
    player,
    vorp: engine.replacementGap(player),
    tierLeft: engine.tierRemaining(player),
    juke: engine.overallScore(player),
    survival: engine.survivalProbability(player, nextOverall),
    fit: engine.draftFit(player),
  }))

  // "Safest wait" goes to whichever of the two lower cards is MORE likely to
  // survive to your next pick — the number its own "if you wait" line
  // prints — and either label is demoted when it would contradict itself.
  let labels = ['Juke’s pick', 'Scarcest', 'Safest wait']
  if (candidates.length === 3) {
    const s1 = candidates[1].survival ?? -1
    const s2 = candidates[2].survival ?? -1
    const safer = s2 > s1 ? 2 : 1
    labels = ['Juke’s pick']
    labels[safer === 1 ? 2 : 1] = 'Scarcest'
    labels[safer] = 'Safest wait'
  }
  labels = labels.map((label, i) => {
    const c = candidates[i]
    if (!c) return label
    if (label === 'Scarcest' && c.vorp != null && c.vorp < BAD_VORP) return 'Also available'
    if (label === 'Safest wait' && ((c.survival != null && c.survival < AT_RISK) || (c.vorp != null && c.vorp < BAD_VORP))) return 'Also available'
    return label
  })
  candidates.forEach((c, i) => { c.label = labels[i] })

  const board = engine.board()
  const counts = engine.filterCounts()

  const tierLadder = LEAD.map((pos) => {
    const posBoard = board.filter((p) => p.pos === pos)
    const tier1 = posBoard.filter((p) => p.tier === 1)
    const remaining = tier1.length ? engine.tierRemaining(tier1[0]) : 0
    const tier2 = posBoard.filter((p) => p.tier === 2)
    let drop = null
    if (tier1.length && tier2.length) {
      const avg = (list) => list.reduce((s, p) => s + (p.projPts || 0), 0) / list.length
      drop = Math.round(avg(tier1) - avg(tier2))
    }
    return { pos, total: tier1.length, remaining, drop }
  })

  // Who is still here at your next pick: the players whose board rank sits
  // nearest it, where the uncertainty actually lives.
  const survivors = nextOverall == null ? [] : board
    .filter((p) => !p.drafted)
    .slice()
    .sort((a, b) => Math.abs(a.overall - nextOverall) - Math.abs(b.overall - nextOverall))
    .slice(0, 6)
    .sort((a, b) => a.overall - b.overall)
    .map((p) => ({ player: p, survival: engine.survivalProbability(p, nextOverall), vorp: engine.replacementGap(p) }))

  // The run: which position the last six picks leaned on, and how many
  // starters' worth of talent is left there.
  const picks = engine.picks() || []
  const last6 = picks.slice(-6)
  const posCounts = {}
  last6.forEach((p) => { posCounts[p.player.pos] = (posCounts[p.player.pos] || 0) + 1 })
  let runPos = null
  let runCount = 0
  Object.entries(posCounts).forEach(([pos, n]) => { if (n > runCount) { runCount = n; runPos = pos } })
  const runDepth = runPos ? engine.positionDepthRemaining(runPos) : null

  const needs = POSITIONS.map((pos) => ({ pos, ...(counts ? counts[pos] : { have: 0, need: 0, text: '0' }) }))

  return { candidates, tierLadder, survivors, run: runCount >= 3 ? { pos: runPos, count: runCount, depth: runDepth } : null, needs, counts }
}

/* What each card forgoes: the board's best at your most pressing OTHER need,
   and whether the market says he lasts. DraftDecideScreen's own question,
   asked of the same two bridged reads. */
export function whatItCosts(engine, player, counts, nextOverall) {
  if (!counts) return null
  const short = LEAD.filter((pos) => pos !== player.pos && counts[pos] && counts[pos].short)
  if (!short.length) return 'Nothing — every other starting slot is already filled.'
  short.sort((a, b) => (counts[b].need - counts[b].have) - (counts[a].need - counts[a].have))
  const need = short[0]
  const best = engine.board()
    .filter((p) => !p.drafted && p.pos === need)
    .map((p) => ({ p, gap: engine.replacementGap(p) }))
    .filter((x) => x.gap != null)
    .sort((a, b) => b.gap - a.gap)[0]
  if (!best) return `Nothing left at ${need} worth comparing against.`
  const s = nextOverall != null ? engine.survivalProbability(best.p, nextOverall) : null
  if (s == null) return `The board’s best ${need} is ${best.p.name} (${signedInt(best.gap)} VORP) — no market read on whether he lasts.`
  const pct = Math.round(s * 100)
  return s < AT_RISK
    ? `The board’s best ${need}, ${best.p.name} (${signedInt(best.gap)}), is unlikely to last — ${pct}% he is there at your next pick.`
    : `The board’s best ${need}, ${best.p.name} (${signedInt(best.gap)}), should still be around — ${pct}% he lasts to your next pick.`
}

export function reasonFor(c) {
  if (c.label === 'Scarcest') {
    return c.tierLeft != null ? `Only ${c.tierLeft} left in his tier — the run won’t wait.` : 'Thin at his position — the run won’t wait.'
  }
  if (c.label === 'Safest wait') return 'Deepest of the three — the least urgent pick here.'
  if (c.label === 'Also available') {
    if (c.survival != null && c.survival < AT_RISK) return 'Likely gone before your next pick — but not the best of the three.'
    if (c.vorp != null && c.vorp < BAD_VORP) return 'Below the tier worth rushing for — depth, not a starter.'
    return 'No urgency behind him — steady bench value whenever you need it.'
  }
  return c.fit && c.fit.startsNow ? 'Best value for a slot you still need to fill.' : 'Best value still on the board.'
}

export function survivalWord(s, actionable) {
  if (s == null) return { label: 'No market read', tone: 'text-v2-ink3' }
  if (s < 0.2) return { label: actionable ? 'Take him now' : 'Likely gone', tone: 'text-v2-loss' }
  if (s < 0.65) return { label: 'Coin flip', tone: 'text-v2-warn' }
  return { label: 'Safe to wait', tone: 'text-v2-ink' }
}

/* ---- Analysis (mid-draft) ---- */

const RAW_KEY = { starters: 'startersVsPar', value: 'valueVsPar', build: 'build', byes: 'byePenalty' }
const RAW_EPSILON = { starters: 1, value: 1, build: 0.5, byes: 0.5 }
const SCALED_KEY = { starters: 'startersScaled', value: 'valueScaled', build: 'buildScaled', byes: 'byePenaltyScaled' }

function median(nums) {
  const s = nums.slice().sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function readAnalysis(engine, slot, withFix = true) {
  const league = engine.league()
  const picks = engine.picks() || []
  const weights = engine.weights ? engine.weights() : engine.gradeWeights()
  if (picks.length < league.teams) {
    return { ready: false, made: picks.length, teams: league.teams, weights }
  }
  const all = engine.analyseDraft()
  const me = all[slot]
  if (!me) return { ready: false, made: picks.length, teams: league.teams, weights }

  // Whether a component's RAW figure has started to differ across the room.
  // A tied room scales every team to 50, and "+0 vs median" would claim a
  // comparison that does not exist yet — AnalysisTab's own rule.
  const measurable = (key) => {
    const vals = all.map((t) => t[RAW_KEY[key]])
    return Math.max(...vals) - Math.min(...vals) > RAW_EPSILON[key]
  }
  const parts = [
    { key: 'starters', label: 'Starter strength', detail: engine.parText(me), scaled: true },
    { key: 'value', label: 'Draft value', detail: engine.parValueText(me), scaled: true },
    { key: 'build', label: 'Roster construction', detail: engine.buildText(me), scaled: false },
    { key: 'byes', label: 'Bye week safety', detail: engine.byeSummary(me.badWeeks), scaled: true },
  ].map((p) => {
    const vals = all.map((t) => t[SCALED_KEY[p.key]])
    const pct = me[SCALED_KEY[p.key]]
    const med = median(vals)
    const ok = measurable(p.key)
    return { ...p, pct, weight: weights[p.key], median: med, best: Math.max(...vals), measurable: ok, cost: ok ? weights[p.key] * Math.max(0, med - pct) : 0 }
  })
  const worst = parts.reduce((a, c) => (c.cost > a.cost ? c : a))
  // bestUpgrade() simulates a pick per available player, so it is asked only
  // for the drafter's own seat — the one a "fix this first" can advise.
  const upgrade = withFix && worst.cost > 0 ? engine.bestUpgrade(slot, worst.key) : null
  const standings = all.slice().sort((a, b) => a.rank - b.rank).map((t) => ({ slot: t.slot, rank: t.rank, grade: t.grade, name: engine.teamLabel(t.slot) }))
  return {
    ready: true,
    over: engine.draftOver(),
    teams: league.teams,
    grade: me.grade,
    rank: me.rank,
    total: me.total,
    parts,
    weights,
    fix: upgrade && upgrade.after > Math.round(worst.pct) ? { part: worst, upgrade } : null,
    bargain: me.bargain ? { name: me.bargain.pick.player.name, gap: me.bargain.gap } : null,
    reach: me.reach ? { name: me.reach.pick.player.name, gap: me.reach.gap } : null,
    standings,
    replacementText: engine.replacementText(),
    lineupText: engine.lineupText(),
  }
}
