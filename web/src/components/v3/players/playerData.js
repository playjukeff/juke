/* Readers for v3's Players place. Pure functions over window.JukeEngine,
   answering null rather than throwing before the board lands.

   Nothing here scores anybody. Projected points and points over replacement
   come from vorpUnder(format); a kicker's or a defense's points (which
   vorpUnder withholds along with their replacement figure) go through the
   engine's own pointsUnder() under the same rulesForFormat() table, which is
   exactly what vorpUnder does internally for everybody else. The Juke score
   is overallScore(), and it stays on the league's live scoring — see the
   note on `juke` below. */

import { INJURY_META } from '../../draftRoomPositions.js'

export const FORMATS = ['standard', 'half', 'ppr']
export const FORMAT_LABEL = { standard: 'Std', half: 'Half', ppr: 'Full' }
export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
// The two positions the app refuses to rank (UNRANKED_POSITIONS in app.js):
// three seasons of archived forecasts found their projected order no better
// than chance. They keep their projected points and lose every rating.
export const UNRANKED = ['K', 'DST']

export function posWord(pos) {
  return pos === 'DST' ? 'D/ST' : pos
}

/* The board is regenerated nightly and rescored whenever the scoring editor
   moves, so every memo in this place keys on this string rather than on the
   engine object (whose identity never changes — CLAUDE.md, "A memo keyed on
   engine can never see the board arrive"). */
export function boardKey(engine) {
  if (!engine || !engine.dataReady || !engine.dataReady()) return null
  const board = engine.board()
  const league = engine.league()
  if (!board || !league) return null
  let rules = 0
  let i = 1
  const table = league.rules || {}
  for (const k of Object.keys(table).sort()) {
    if (typeof table[k] === 'number') rules += table[k] * i
    i += 1
  }
  const starters = JSON.stringify(league.starters || {})
  return `${board.length}|${league.scoring}|${league.teams}|${starters}|${league.flex}|${league.superflex}|${rules.toFixed(4)}`
}

export function liveFormat(engine) {
  const league = engine && engine.league ? engine.league() : null
  return league && FORMATS.includes(league.scoring) ? league.scoring : 'half'
}

export function scoringName(engine, key) {
  const names = engine && engine.scoringNames ? engine.scoringNames() : {}
  return names[key] || key
}

export function injuryWord(code) {
  if (!code) return null
  const meta = INJURY_META[code]
  return meta ? meta.label : code
}

/* Sleeper stores height as a bare count of inches; this is app.js's own
   heightText() conversion, and nothing more. */
export function heightText(inches) {
  const n = Number(inches)
  if (!n || n < 40 || n > 90) return null
  return Math.floor(n / 12) + "'" + (n % 12) + '"'
}

/* The line under a player's name. app.js's bioLine() is not on the bridge
   (it returns HTML for the legacy sheet), so the same stored facts are laid
   out here in the same order — formatting, not a figure. A team defense is
   eleven people and gets the one line that is true of it. */
export function bioFacts(player, stat) {
  if (!player) return []
  if (player.pos === 'DST') return [`${player.team} team defense`]
  if (!stat) return []
  const bits = []
  if (stat.age) bits.push(`Age ${stat.age}`)
  const ht = heightText(stat.ht)
  if (ht) bits.push(ht)
  if (stat.wt) bits.push(`${stat.wt} lb`)
  if (stat.exp !== undefined && stat.exp !== null) bits.push(stat.exp === 0 ? 'Rookie' : `${stat.exp} yrs exp`)
  if (stat.col) bits.push(stat.col)
  if (stat.depth) bits.push(`${stat.depth}${stat.order ? ' #' + stat.order : ''}`)
  return bits
}

function tenureOf(stat) {
  if (!stat || stat.exp === undefined || stat.exp === null) return null
  return stat.exp === 0 ? 'rookie' : 'vet'
}

/* Every player on the board, priced under one scoring format.

   `pts` and `vorp` are the chosen format's. `posRk` is the projected rank at
   his position under that format: when the format IS the league's live one
   it is the engine's own projPosRank; otherwise it is the same ordering
   buildProjections() uses (projected points, best first, board order on a
   tie) applied to vorpUnder's points, so the two can never disagree about
   the live format. `juke` is overallScore(), which the engine only computes
   under the live scoring, and the page says so rather than re-deriving a
   share of the board's best under another table. */
export function readIndex(engine, format) {
  const board = engine.board()
  if (!board || !board.length || !engine.vorpUnder) return null
  const table = engine.vorpUnder(format) || {}
  const rules = engine.rulesForFormat ? engine.rulesForFormat(format) : null
  const live = liveFormat(engine)

  const rows = board.map((p) => {
    const stat = engine.statOf ? engine.statOf(p) : null
    const t = table[p.id] || {}
    let pts = t.projPts === undefined ? null : t.projPts
    if (pts === null && UNRANKED.includes(p.pos) && rules && stat && stat.p && stat.p.gp > 0) {
      pts = engine.pointsUnder(stat.p, rules)
    }
    const juke = engine.overallScore ? engine.overallScore(p) : null
    return {
      id: String(p.id),
      name: p.name,
      pos: p.pos,
      team: p.team || '',
      bye: p.bye || null,
      adp: typeof p.adp === 'number' && Number.isFinite(p.adp) ? p.adp : null,
      overall: p.overall || null,
      marketRank: p.posRank || null,
      tier: p.tier || null,
      inj: p.inj || '',
      deep: !!p.deep,
      tenure: tenureOf(stat),
      pts: pts === null || pts === undefined ? null : pts,
      vorp: t.vorp === null || t.vorp === undefined ? null : t.vorp,
      juke: juke === null || juke === undefined ? null : Math.round(juke),
      posRk: null,
      photo: engine.photoUrl ? engine.photoUrl(p) : '',
      initials: engine.initials ? engine.initials(p.name) : '',
      _live: format === live ? p.projPosRank || null : undefined,
    }
  })

  // Kickers and defenses get no position rank: their projected ORDER is
  // what three seasons of backtesting refused, and withholding has to be
  // complete (CLAUDE.md) — a dash in the Juke column beside "K4" would
  // tell a reader to distrust an order and then argue from it.
  for (const pos of POSITIONS.filter((x) => !UNRANKED.includes(x))) {
    const ranked = rows.filter((r) => r.pos === pos && r.pts !== null)
    if (format === live) {
      for (const r of ranked) r.posRk = r._live
    } else {
      ranked.slice().sort((a, b) => b.pts - a.pts).forEach((r, i) => { r.posRk = i + 1 })
    }
  }
  for (const r of rows) delete r._live

  const teams = [...new Set(rows.map((r) => r.team).filter(Boolean))].sort()
  return { rows, teams, live, format, size: rows.length }
}

/* Severity order for the status column's sort: a player ruled out is the
   most urgent fact on a row, a healthy one the least. */
const INJ_ORDER = { O: 1, IR: 2, PUP: 3, NFI: 3, SUS: 4, D: 5, DNR: 6, COV: 6, Q: 7 }

export const SORTS = {
  adp: { label: 'ADP', dir: 'asc', read: (r) => r.adp },
  posRk: { label: 'Pos rank', dir: 'asc', read: (r) => r.posRk },
  pts: { label: 'Proj pts', dir: 'desc', read: (r) => r.pts },
  vorp: { label: 'Over repl.', dir: 'desc', read: (r) => r.vorp },
  juke: { label: 'Juke score', dir: 'desc', read: (r) => r.juke },
  bye: { label: 'Bye', dir: 'asc', read: (r) => r.bye },
  inj: { label: 'Status', dir: 'asc', read: (r) => (r.inj ? INJ_ORDER[r.inj] || 8 : null) },
  name: { label: 'Name', dir: 'asc', read: (r) => r.name },
}

/* Sorts a COPY — `board` is never sorted in place (CLAUDE.md: its order is
   an input to the CPU wobble). A missing number is not a small number:
   blanks go last in both directions. Ties fall back to board order. */
export function sortRows(rows, key, dir) {
  const spec = SORTS[key] || SORTS.adp
  const sign = dir === 'desc' ? -1 : 1
  return rows
    .map((r, i) => ({ r, i, v: spec.read(r) }))
    .sort((a, b) => {
      const an = a.v === null || a.v === undefined
      const bn = b.v === null || b.v === undefined
      if (an && bn) return a.i - b.i
      if (an) return 1
      if (bn) return -1
      if (typeof a.v === 'string') {
        const c = a.v.localeCompare(b.v)
        return c ? c * sign : a.i - b.i
      }
      if (a.v === b.v) return a.i - b.i
      return (a.v - b.v) * sign
    })
    .map((x) => x.r)
}

export function fold(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/* A tenure filter keeps a player with no years-of-experience on file in BOTH
   pools — the rule league.playerPool already follows (CLAUDE.md): a team
   defense is neither a rookie nor a veteran, and missing is not evidence. */
export function filterRows(rows, { q, pos, team, tenure }) {
  const needle = fold(q).trim()
  return rows.filter((r) => {
    if (pos && pos !== 'ALL' && r.pos !== pos) return false
    if (team && team !== 'ALL' && r.team !== team) return false
    if (tenure === 'rookie' && r.tenure === 'vet') return false
    if (tenure === 'vet' && r.tenure === 'rookie') return false
    if (needle && !fold(r.name).includes(needle)) return false
    return true
  })
}

/* One player, found by the Sleeper id in the address (a defense's id is its
   club, e.g. SEA). Every section is the engine's own reading; this only
   gathers them so the page renders from one object. */
export function readPlayer(engine, id) {
  const board = engine.board()
  if (!board || !board.length) return null
  const want = String(id || '')
  const player = board.find((p) => String(p.id) === want)
  if (!player) return { missing: true, id: want }
  const stat = engine.statOf ? engine.statOf(player) : null

  // Every scoring format at once, for the "under each scoring" strip.
  const byFormat = FORMATS.map((f) => {
    const t = (engine.vorpUnder(f) || {})[player.id] || {}
    let pts = t.projPts === undefined ? null : t.projPts
    if (pts === null && UNRANKED.includes(player.pos) && stat && stat.p && stat.p.gp > 0 && engine.rulesForFormat) {
      pts = engine.pointsUnder(stat.p, engine.rulesForFormat(f))
    }
    return { format: f, pts, vorp: t.vorp === undefined ? null : t.vorp }
  })

  // Every stored season, rescored through pointsUnder() under each preset —
  // the phone profile's own History table, the one place production drew a
  // career as a table. A season with no games is left out, never zeroed.
  const seasons = []
  if (stat && stat.s && engine.rulesForFormat && engine.pointsUnder) {
    const rules = Object.fromEntries(FORMATS.map((f) => [f, engine.rulesForFormat(f)]))
    for (const year of Object.keys(stat.s).sort().reverse()) {
      const block = stat.s[year]
      if (!block || !(block.gp > 0)) continue
      seasons.push({
        year,
        // A defense's season is one aggregate row stamped gp:1 — not a
        // games count, the trap perGame() exists for.
        games: player.pos === 'DST' ? null : block.gp,
        pts: Object.fromEntries(FORMATS.map((f) => [f, engine.pointsUnder(block, rules[f])])),
      })
    }
  }

  return {
    player,
    stat,
    bio: bioFacts(player, stat),
    readout: engine.jukeReadout ? engine.jukeReadout(player) : null,
    summary: engine.projectionSummary ? engine.projectionSummary(player) : null,
    record: engine.projectionRecord ? engine.projectionRecord(player) : null,
    usage: engine.usageFor ? engine.usageFor(player) : null,
    prospect: engine.prospectFor ? engine.prospectFor(player) : null,
    teamRanks: engine.teamRanksFor ? engine.teamRanksFor(player.team) : null,
    teamRanksMeta: engine.teamRanksMeta ? engine.teamRanksMeta() : null,
    photo: engine.photoUrl ? engine.photoUrl(player) : '',
    initials: engine.initials ? engine.initials(player.name) : '',
    byFormat,
    seasons,
    live: liveFormat(engine),
    scoring: scoringName(engine, engine.league().scoring),
  }
}

/* Name → board player, for linking the names a depth chart hands back (it
   returns names rather than ids). Team is checked too, so one Josh Allen
   can never link to the other. */
export function findByName(engine, name, team) {
  const board = engine && engine.board ? engine.board() : null
  if (!board) return null
  return board.find((p) => p.name === name && (!team || p.team === team)) || null
}
