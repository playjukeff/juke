/* One NFL game, read off ESPN's own summary for it — the game page's data
   layer.

   ESPN's /summary?event=<id> answers everything the page draws in one
   request: the header (teams, score, status, network), the line score,
   leaders, team stats, the whole box score, the win-probability series and
   every drive with its plays. It is ~600 KB and this keeps the ~30 KB the
   page actually reads, so a live game polled every 30 seconds holds a small
   object in memory rather than the whole payload.

   Imports nothing, for leagueStore.js's reason: CI installs no npm
   dependencies, and scripts/test_game_summary.mjs drives this in bare Node.

   ---- What it deliberately does not do ----

   It never decides who a player IS. ESPN's names are matched to the board's
   by `normName()` in the page, and a name that does not match is simply not
   marked as anybody's — an unmarked row is a smaller failure than a row
   marked as the wrong person's. */

export const SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='

/* ESPN spells Washington WSH; Sleeper, and so the board, WAS. Every other
   club code agrees. Same shape as the pipeline's TEAM_ALIASES. */
const TEAM_ALIAS = { WSH: 'WAS' }
export function boardTeam(abbr) {
  const a = String(abbr || '').toUpperCase()
  return TEAM_ALIAS[a] || a
}

/* A name as a join key: lower case, no punctuation, no generational suffix.
   ESPN writes "James Cook III" and "Kenneth Walker III"; Sleeper stores
   neither suffix — the same fact worker/names.js encodes for ESPN leagues. */
export function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[.'’`-]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/* ESPN's win-probability entry names a play by id; the plays live inside
   drives. One pass builds the index both the chart and the feed read. */
function playIndex(drives) {
  const out = new Map()
  for (const d of drives) {
    for (const p of d.plays || []) {
      out.set(String(p.id), p)
    }
  }
  return out
}

function playOf(p) {
  return {
    id: String(p.id),
    text: String(p.text || '').trim(),
    period: p.period && num(p.period.number),
    clock: p.clock && p.clock.displayValue ? String(p.clock.displayValue) : null,
    down: p.start && p.start.downDistanceText ? String(p.start.downDistanceText).trim() : null,
    away: num(p.awayScore),
    home: num(p.homeScore),
    scoring: !!p.scoringPlay,
  }
}

/* The whole trim. Null for anything that is not a summary with two teams,
   so the page has one test for "ESPN gave us nothing usable". */
export function parseSummary(json) {
  const comp = json && json.header && json.header.competitions && json.header.competitions[0]
  if (!comp || !Array.isArray(comp.competitors)) return null
  const home = comp.competitors.find((c) => c.homeAway === 'home')
  const away = comp.competitors.find((c) => c.homeAway === 'away')
  if (!home || !away || !home.team || !away.team) return null

  const team = (c) => ({
    side: c.homeAway,
    id: String(c.team.id || ''),
    abbr: String(c.team.abbreviation || ''),
    name: String(c.team.name || c.team.displayName || ''),
    location: String(c.team.location || ''),
    // Club colours as ESPN states them; teamColors.js makes them legible.
    color: c.team.color ? String(c.team.color) : null,
    alternateColor: c.team.alternateColor ? String(c.team.alternateColor) : null,
    score: num(c.score),
    record: c.record && c.record[0] ? String(c.record[0].summary || c.record[0].displayValue || '') : null,
    lines: Array.isArray(c.linescores) ? c.linescores.map((l) => num(l.displayValue !== undefined ? l.displayValue : l.value)) : [],
    winner: !!c.winner,
  })

  const status = (comp.status && comp.status.type) || {}
  const drivesRaw = (json.drives && Array.isArray(json.drives.previous) ? json.drives.previous : [])
    .concat(json.drives && json.drives.current ? [json.drives.current] : [])
  const index = playIndex(drivesRaw)

  const box = {}
  for (const p of (json.boxscore && json.boxscore.players) || []) {
    const abbr = p.team && p.team.abbreviation
    if (!abbr) continue
    box[abbr] = (p.statistics || [])
      .filter((c) => Array.isArray(c.athletes) && c.athletes.length)
      .map((c) => ({
        name: String(c.name || ''),
        title: String(c.text || c.name || ''),
        labels: Array.isArray(c.labels) ? c.labels.map(String) : [],
        rows: c.athletes.map((a) => ({
          name: String((a.athlete && a.athlete.displayName) || ''),
          pos: a.athlete && a.athlete.position ? String(a.athlete.position.abbreviation || '') : '',
          stats: Array.isArray(a.stats) ? a.stats.map(String) : [],
        })),
      }))
  }

  const statTeams = (json.boxscore && json.boxscore.teams) || []
  const statsOf = (abbr) => {
    const t = statTeams.find((x) => x.team && x.team.abbreviation === abbr)
    return t ? Object.fromEntries((t.statistics || []).map((s) => [String(s.label), String(s.displayValue)])) : {}
  }
  const aStats = statsOf(away.team.abbreviation)
  const hStats = statsOf(home.team.abbreviation)
  const teamStats = Object.keys(aStats).filter((k) => k in hStats).map((k) => ({ label: k, away: aStats[k], home: hStats[k] }))

  const wp = (Array.isArray(json.winprobability) ? json.winprobability : [])
    .map((w) => {
      const v = num(w.homeWinPercentage)
      if (v === null) return null
      const p = index.get(String(w.playId))
      return { home: Math.max(0, Math.min(1, v)), play: p ? playOf(p) : null }
    })
    .filter(Boolean)

  // Newest first, which is how a reader follows a game.
  const drives = drivesRaw.slice().reverse().map((d) => ({
    id: String(d.id || ''),
    team: d.team ? String(d.team.abbreviation || '') : '',
    result: String(d.displayResult || d.result || ''),
    summary: String(d.description || ''),
    plays: (d.plays || []).slice().reverse().map(playOf),
  }))

  const leaders = []
  for (const block of json.leaders || []) {
    const abbr = block.team && block.team.abbreviation
    for (const cat of block.leaders || []) {
      const top = cat.leaders && cat.leaders[0]
      if (!top || !top.athlete) continue
      leaders.push({
        team: String(abbr || ''),
        category: String(cat.displayName || cat.name || ''),
        name: String(top.athlete.displayName || ''),
        pos: top.athlete.position ? String(top.athlete.position.abbreviation || '') : '',
        line: String(top.displayValue || ''),
      })
    }
  }

  const venue = json.gameInfo && json.gameInfo.venue
  const broadcast = (comp.broadcasts || [])[0]
  return {
    id: String((json.header && json.header.id) || comp.id || ''),
    week: json.header && json.header.week ? num(json.header.week) : null,
    date: comp.date || null,
    state: status.state || 'pre',                  // pre | in | post
    detail: String(status.shortDetail || status.detail || ''),
    network: broadcast && broadcast.media ? String(broadcast.media.shortName || '') : null,
    venue: venue ? { name: String(venue.fullName || ''), city: venue.address ? String(venue.address.city || '') : '' } : null,
    away: team(away),
    home: team(home),
    box,
    teamStats,
    wp,
    drives,
    leaders,
  }
}

/* ---- Fantasy points off a box-score line ----

   The box score says what happened in ESPN's words; a league pays in Juke's
   rule keys (app.js DEFAULT_RULES). This is the translation for the lines
   the box score actually carries. What it cannot see is named rather than
   guessed: two-point conversions and return touchdowns are not on these
   tables, and a kick is not banded by distance, so a kicker and a defense
   are not scored here at all — the page prints a dash for them. */
function at(labels, stats, label) {
  const i = labels.indexOf(label)
  return i < 0 ? null : stats[i]
}
function n0(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const SCORED_CATEGORIES = ['passing', 'rushing', 'receiving', 'fumbles']

export function linePoints(category, labels, stats, rules) {
  if (!rules) return null
  const r = (k) => n0(rules[k])
  switch (category) {
    case 'passing': {
      const [cmp, att] = String(at(labels, stats, 'C/ATT') || '0/0').split('/').map(n0)
      return n0(at(labels, stats, 'YDS')) * r('pass_yd') + n0(at(labels, stats, 'TD')) * r('pass_td') +
        n0(at(labels, stats, 'INT')) * r('pass_int') + cmp * r('pass_cmp') + att * r('pass_att')
    }
    case 'rushing':
      return n0(at(labels, stats, 'YDS')) * r('rush_yd') + n0(at(labels, stats, 'TD')) * r('rush_td') +
        n0(at(labels, stats, 'CAR')) * r('rush_att')
    case 'receiving':
      return n0(at(labels, stats, 'REC')) * r('rec') + n0(at(labels, stats, 'YDS')) * r('rec_yd') +
        n0(at(labels, stats, 'TD')) * r('rec_td')
    case 'fumbles':
      return n0(at(labels, stats, 'LOST')) * r('fum_lost')
    default:
      return null
  }
}

/* A player's whole game: every scored table he appears on, summed. Null
   when he is on none of them, which is not the same as zero. */
export function playerPoints(game, abbr, name, rules) {
  const cats = game && game.box && game.box[abbr]
  if (!cats || !rules) return null
  const key = normName(name)
  let total = null
  for (const c of cats) {
    if (!SCORED_CATEGORIES.includes(c.name)) continue
    const row = c.rows.find((r) => normName(r.name) === key)
    if (!row) continue
    total = (total || 0) + linePoints(c.name, c.labels, row.stats, rules)
  }
  return total === null ? null : Math.round(total * 100) / 100
}

/* A readable one-line summary of what a player did, off the same tables. */
export function playerLine(game, abbr, name) {
  const cats = game && game.box && game.box[abbr]
  if (!cats) return ''
  const key = normName(name)
  const out = []
  for (const c of cats) {
    const row = c.rows.find((r) => normName(r.name) === key)
    if (!row) continue
    const g = (l) => at(c.labels, row.stats, l)
    if (c.name === 'passing') out.push(`${g('C/ATT')} · ${g('YDS')} pass yds · ${g('TD')} TD${n0(g('INT')) ? ` · ${g('INT')} INT` : ''}`)
    else if (c.name === 'rushing') out.push(`${g('CAR')} car · ${g('YDS')} yds${n0(g('TD')) ? ` · ${g('TD')} TD` : ''}`)
    else if (c.name === 'receiving') out.push(`${g('REC')}/${g('TGTS')} rec · ${g('YDS')} yds${n0(g('TD')) ? ` · ${g('TD')} TD` : ''}`)
    else if (c.name === 'kicking') out.push(`${g('FG')} FG · ${g('XP')} XP`)
  }
  return out.join(' · ')
}

/* ESPN abbreviates a player in play text as "J.Cook" or "A.St. Brown". The
   feed marks a play as one of yours when that short form appears in it. */
export function playShortName(name) {
  const parts = String(name || '').replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/, '').split(' ').filter(Boolean)
  if (parts.length < 2) return null
  return `${parts[0][0]}.${parts.slice(1).join(' ')}`
}
