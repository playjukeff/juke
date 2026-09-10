/* Every figure the v2 build draws, read off window.JukeEngine.

   Pure functions over the engine, and deliberately no React in here: the
   brief asked for a new LOOK, not a second opinion about football, so each
   reader below asks a bridge function that already exists (vorpUnder,
   jukeReadout, replacementGap, sampleGradedDraft, historyList) and never
   re-derives a number. Scoring written down twice is the failure CLAUDE.md
   records under the superflex bug; a redesign is exactly where it would
   sneak back in.

   Every reader answers null rather than throwing on a board that has not
   landed, so a component can treat null as "draw the skeleton". */

export const FORMATS = ['standard', 'half', 'ppr']
const LEAD = ['QB', 'RB', 'WR', 'TE']

/* One set of players, re-ranked under each format.

   Not the top eight of each format computed separately: rows would then
   appear and disappear between formats and the reorder animation would
   have nothing coherent to animate. HomeProof's own comment records the
   same finding, and that the set has to SPAN positions — the top eight by
   value over replacement is almost all running backs under standard, and
   a scoring toggle that only moves backs past backs demonstrates nothing
   about why rules matter. */
export function readBoard(engine, size = 8) {
  const board = engine.board()
  if (!board || !board.length || !engine.vorpUnder) return null

  const ranked = {}
  for (const f of FORMATS) {
    const table = engine.vorpUnder(f)
    ranked[f] = board
      .map((p) => ({ p, row: table[p.id] }))
      .filter((r) => r.row && r.row.vorp !== null && r.row.vorp !== undefined)
      .sort((a, b) => b.row.vorp - a.row.vorp)
      .map((r) => ({
        id: r.p.id,
        name: r.p.name,
        pos: r.p.pos,
        team: r.p.team,
        vorp: Math.round(r.row.vorp),
        pts: r.row.projPts === null ? null : Math.round(r.row.projPts),
      }))
  }
  if (!ranked.half.length) return null

  /* Two a position, not one and then the best of the rest.

     One-per-position plus "best remaining" was the first cut and measured
     on the 10 September board it drew FIVE running backs in eight rows —
     the rest of the board is backs, because RB replacement sits furthest
     below its top. A cross-position measure demonstrated mostly on one
     position demonstrates nothing, and the reorder a scoring toggle
     produces is precisely receivers climbing past backs. Two apiece is
     what lets that movement be seen. */
  const perPos = Math.max(1, Math.floor(size / LEAD.length))
  const seed = []
  for (const pos of LEAD) {
    for (const r of ranked.half.filter((x) => x.pos === pos).slice(0, perPos)) seed.push(r.id)
  }

  const byFormat = {}
  let max = 1
  for (const f of FORMATS) {
    const table = new Map(ranked[f].map((r) => [r.id, r]))
    byFormat[f] = seed.map((id) => table.get(id)).filter(Boolean).sort((a, b) => b.vorp - a.vorp)
    for (const r of byFormat[f]) max = Math.max(max, r.vorp)
  }
  // The move is against standard, the leanest table, so both PPR formats
  // show real movement and standard is flat by definition — the same
  // baseline HomeProof chose, for the same reason.
  const base = new Map(byFormat.standard.map((r, i) => [r.id, i]))
  for (const f of FORMATS) {
    byFormat[f] = byFormat[f].map((r, i) => ({ ...r, moved: base.has(r.id) ? base.get(r.id) - i : 0 }))
  }

  const league = engine.league()
  const names = engine.scoringNames ? engine.scoringNames() : {}
  const live = league && FORMATS.includes(league.scoring) ? league.scoring : 'half'
  return { byFormat, max, names, live }
}

/* The best player at each lead position, with the arithmetic behind his
   score. Chosen by the board — `overallScore()` — never by name, because a
   hard-coded name is wrong the first night somebody gets hurt. */
export function readDeepDive(engine) {
  const board = engine.board()
  if (!board || !board.length || !engine.jukeReadout) return null

  const out = {}
  for (const pos of LEAD) {
    let best = null
    let bestScore = -1
    for (const p of board) {
      if (p.pos !== pos) continue
      const s = engine.overallScore(p)
      if (s !== null && s !== undefined && s > bestScore) { bestScore = s; best = p }
    }
    if (!best) continue
    const r = engine.jukeReadout(best)
    if (!r || r.score === null || r.gap === null || best.projPts === null) continue

    // The ladder: this position's top six by points over replacement. Ranks
    // look evenly spaced and the gaps between them are not, which is the
    // whole of "a rank is not a reason" drawn rather than said.
    const ladder = board
      .filter((p) => p.pos === pos)
      .map((p) => ({ id: p.id, name: p.name, team: p.team, gap: engine.replacementGap(p) }))
      .filter((x) => x.gap !== null && x.gap !== undefined)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 6)
      .map((x, i) => ({ ...x, gap: Math.round(x.gap), rank: i + 1 }))

    const proj = Math.round(best.projPts)
    out[pos] = {
      id: best.id,
      name: best.name,
      pos,
      team: best.team,
      marketRank: best.posRank,
      photo: engine.photoUrl ? engine.photoUrl(best) : '',
      score: r.score,
      label: r.label,
      proj,
      gap: r.gap,
      replacement: proj - r.gap,
      replacementRank: r.replacementRank,
      boardSize: r.boardSize,
      reason: r.reason,
      ladder,
    }
  }
  const order = LEAD.filter((p) => out[p])
  if (!order.length) return null
  // One scale across all four tabs, so switching from a quarterback to a
  // tight end changes the bar's length honestly rather than re-zooming it.
  const scaleMax = Math.max(...order.map((p) => out[p].proj))
  return { players: out, order, scaleMax }
}

/* A complete graded room — every seat — so the instrument can be driven.
   sampleGradedDraft() runs one full simulated draft under the live league
   and grades it; nothing here re-weights or re-scales anything. */
export function readGrade(engine) {
  if (!engine.sampleGradedDraft || !engine.gradeWeights) return null
  const room = engine.sampleGradedDraft()
  const weights = engine.gradeWeights()
  if (!room || !room.teamsRanked || !room.teamsRanked.length || !weights) return null

  const keys = ['starters', 'value', 'build', 'byes']
  const median = {}
  for (const k of keys) {
    const vals = room.teamsRanked.map((t) => t.components[k]).sort((a, b) => a - b)
    const mid = Math.floor(vals.length / 2)
    median[k] = vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2)
  }
  const league = engine.league()
  const names = engine.scoringNames ? engine.scoringNames() : {}
  return {
    teams: room.teams,
    rounds: room.rounds,
    format: league && names[league.scoring] ? names[league.scoring] : null,
    teamsRanked: room.teamsRanked,
    weights: Object.fromEntries(keys.map((k) => [k, weights[k]])),
    median,
  }
}

/* What the three league rooms would calculate, priced on tonight's board.

   These are the rooms' own questions asked of the board with a generic
   ten-team league standing in for yours — every player and every point is
   real, and the copy says "a typical league" wherever the league is the
   invented part. No FAAB figure appears anywhere: a budget is a fact about
   a league this build cannot see, and printing one would be inventing it. */
export function readRoomPreviews(engine) {
  const board = engine.board()
  if (!board || !board.length) return null
  const league = engine.league()
  const drafted = (league ? league.teams * league.rounds : 140)
  const perGame = (p) => (p.projPts === null ? null : p.projPts / 17)

  // Waiver: who a typical league leaves on the wire. Board order is ADP
  // order, so everything past the last pick of a full draft went undrafted.
  const wire = board
    .slice(drafted)
    .filter((p) => p.projPts !== null && ['RB', 'WR', 'TE', 'QB'].includes(p.pos))
    .map((p) => ({ id: p.id, name: p.name, pos: p.pos, team: p.team, gap: engine.replacementGap(p), pg: perGame(p) }))
    .filter((x) => x.gap !== null && x.gap !== undefined)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5)
    .map((x) => ({ ...x, gap: Math.round(x.gap), pg: x.pg === null ? null : Math.round(x.pg * 10) / 10 }))

  // Trade: the market-fair swap that is not. Two players the market prices
  // within three picks of each other, at different positions, whose value
  // over replacement differs the most. This is the question the Trade Room
  // exists for — ADP says even, the points say otherwise.
  const top = board.slice(0, 72).filter((p) => p.projPts !== null && LEAD.includes(p.pos))
  let trade = null
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i]
      const b = top[j]
      if (a.pos === b.pos || Math.abs(a.adp - b.adp) > 3) continue
      const ga = engine.replacementGap(a)
      const gb = engine.replacementGap(b)
      if (ga === null || gb === null) continue
      const swing = Math.abs(ga - gb)
      if (!trade || swing > trade.swing) {
        const [hi, lo] = ga >= gb ? [a, b] : [b, a]
        trade = {
          swing,
          give: { name: lo.name, pos: lo.pos, team: lo.team, adp: Math.round(lo.adp * 10) / 10, gap: Math.round(ga >= gb ? gb : ga) },
          get: { name: hi.name, pos: hi.pos, team: hi.team, adp: Math.round(hi.adp * 10) / 10, gap: Math.round(ga >= gb ? ga : gb) },
        }
      }
    }
  }
  if (trade) trade.swing = Math.round(trade.swing)

  // Strategy: a start/sit the market cannot see. Two receivers drafted
  // back to back whose weekly projections differ most — a lineup decision
  // that ADP would call a coin flip.
  const wrs = board.filter((p) => p.pos === 'WR' && p.projPts !== null).slice(12, 44)
  let sit = null
  for (let i = 0; i + 1 < wrs.length; i++) {
    const a = wrs[i]
    const b = wrs[i + 1]
    const d = Math.abs(perGame(a) - perGame(b))
    if (!sit || d > sit.diff) {
      const [start, bench] = perGame(a) >= perGame(b) ? [a, b] : [b, a]
      sit = {
        diff: d,
        start: { name: start.name, team: start.team, pg: Math.round(perGame(start) * 10) / 10 },
        bench: { name: bench.name, team: bench.team, pg: Math.round(perGame(bench) * 10) / 10 },
      }
    }
  }
  if (sit) sit.diff = Math.round(sit.diff * 10) / 10

  // The Draft Room's own facts, for its card: read, not written down.
  let teamRange = null
  try {
    const counts = engine.teamCounts ? engine.teamCounts() : null
    if (counts && counts.length) teamRange = `${Math.min(...counts)}–${Math.max(...counts)}`
  } catch { teamRange = null }

  return { wire, trade, sit, drafted, teams: league ? league.teams : 10, boardSize: board.length, teamRange }
}

/* What "Start free mock draft" will actually start. Read off the one live
   `league`, which is what startDraft() uses — a summary written here
   rather than read would be the league shape written down twice. */
export function readLeagueShape(engine) {
  const league = engine.league()
  if (!league) return null
  const names = engine.scoringNames ? engine.scoringNames() : {}
  const s = league.starters || {}
  const slots = []
  for (const pos of ['QB', 'RB', 'WR', 'TE']) if (s[pos]) slots.push(s[pos] > 1 ? `${s[pos]}${pos}` : pos)
  if (league.flex) slots.push(league.flex > 1 ? `${league.flex}FLEX` : 'FLEX')
  if (league.superflex) slots.push('SFLEX')
  for (const pos of ['K', 'DST']) if (s[pos]) slots.push(pos)
  let seat = null
  try { seat = engine.mySlot ? engine.mySlot() + 1 : null } catch { seat = null }
  return {
    teams: league.teams,
    rounds: league.rounds,
    format: names[league.scoring] || league.scoring,
    lineup: slots.join(' · '),
    seat,
  }
}

/* The locker, summarised for the account card. historyList() is already
   newest-first; `grade` is absent on entries recorded before it was saved,
   which is left absent rather than filled. */
export function readLocker(engine) {
  let list = []
  try { list = engine.historyList ? engine.historyList() : [] } catch { list = [] }
  const graded = list.filter((e) => e.grade && e.rank)
  const best = graded.length ? graded.slice().sort((a, b) => a.rank / a.teams - b.rank / b.teams)[0] : null
  return { count: list.length, last: list[0] || null, best, list }
}

export function ordinal(n) {
  const r = n % 100
  if (r >= 11 && r <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
}
