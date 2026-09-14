/* One week of a connected league, in one shape whichever platform it came
   from — the matchup page's data layer.

   ---- Two sources, one vocabulary ----

   ESPN publishes the whole season on the snapshot (worker/matchups.js
   scheduleFromEspn): every pairing, both sides' final points for a played
   week, the winner ESPN states, byes, and where the regular season ends.
   Sleeper publishes no season schedule; its week comes one at a time off
   /sleeper/matchups (worker/sleeper.js leagueMatchups), with each starter's
   own points for a played week.

   Both are turned into a WEEK here:

     { provider, week, phase, playoff, bracketPending, games, noGame }
     game  = { key, sides: [side, side], winner: 0 | 1 | 'tie' | null, home }
     side  = { team, points, starters, bench }

   `phase` is final / live / upcoming. `winner` is the side index. On ESPN
   it is the winner ESPN states and never a comparison of points, which
   would call an unplayed 0-0 week a draw (schedule.js's rule). Sleeper
   states no winner at all, so a FINAL Sleeper week — and only a final one —
   is decided by its own points; a live week has no winner.

   `starters`/`bench` are the platform's own per-player points and exist
   only where the platform published them (a played Sleeper week). They are
   null on ESPN, whose per-player box score is not read — see the page.

   Imports only seasonPhase.js, so nothing here scores a player: every figure
   the page prices comes off the engine and strategyBoard.js, which the
   page calls. This file only says which week is which and who played whom. */

import { seasonPhase } from '../../../lib/seasonPhase.js'

/* #/league/matchup?week=N[&team=id] — the one address a matchup has.
   `team` is omitted for the reader's own team, so the link a reader shares
   of their own game is the short one. */
export function matchupHref(week, team, mine) {
  const q = []
  if (week) q.push('week=' + encodeURIComponent(String(week)))
  const id = team ? (team.rosterId !== null && team.rosterId !== undefined ? team.rosterId : team.ownerId) : null
  const mineId = mine ? (mine.rosterId !== null && mine.rosterId !== undefined ? mine.rosterId : mine.ownerId) : null
  if (id !== null && id !== undefined && String(id) !== String(mineId)) q.push('team=' + encodeURIComponent(String(id)))
  return '#/league/matchup' + (q.length ? '?' + q.join('&') : '')
}

/* V3App strips the query before routing, so the page reads it here. A week
   that is not a whole number from 1 to 22 is no week at all. */
export function readMatchupQuery(hash) {
  const q = String(hash || '').split('?')[1] || ''
  const p = new URLSearchParams(q)
  const w = Number(p.get('week'))
  return {
    week: Number.isInteger(w) && w >= 1 && w <= 22 ? w : null,
    team: p.get('team') ? String(p.get('team')).slice(0, 40) : null,
  }
}

function teamByOwner(snapshot, id) {
  return ((snapshot && snapshot.teams) || []).find((t) => String(t.ownerId) === String(id)) || null
}
function teamByRoster(snapshot, id) {
  return ((snapshot && snapshot.teams) || []).find((t) => Number(t.rosterId) === Number(id)) || null
}

export function sameTeam(a, b) {
  if (!a || !b) return false
  if (a.rosterId !== null && a.rosterId !== undefined && a.rosterId === b.rosterId) return true
  return !!a.ownerId && String(a.ownerId) === String(b.ownerId)
}

/* Which week the league is in, for phasing ESPN's schedule: 0 before a
   ball is thrown, Infinity once the season is over. */
function currentWeekOf(snapshot) {
  if (seasonPhase(snapshot) === 'complete') return Infinity
  return snapshot && Number(snapshot.week) > 0 ? Number(snapshot.week) : 0
}

export function phaseFor(week, current) {
  return week < current ? 'final' : week === current ? 'live' : 'upcoming'
}

/* The season's shape: where the regular season ends and how many weeks
   there are. ESPN reads it off its own schedule; Sleeper off the first
   week that has come back (every view carries it). `published` is how far
   the schedule actually runs — ESPN publishes a playoff week only once its
   bracket is set, so a schedule that stops at the regular season is a
   bracket not set yet rather than a season with no playoffs. */
export function seasonShape(snapshot, sleeperViews) {
  const s = snapshot && snapshot.schedule
  if (s && Array.isArray(s.matchups) && s.matchups.length) {
    return { regular: s.regularSeasonWeeks || null, last: s.weeks || null, published: s.weeks || null, source: 'espn' }
  }
  for (const v of Object.values(sleeperViews || {})) {
    if (v && v.view && v.view.regularSeasonWeeks) {
      return { regular: v.view.regularSeasonWeeks, last: v.view.weeks || null, published: v.view.weeks || null, source: 'sleeper' }
    }
  }
  return { regular: null, last: null, published: null, source: null }
}

/* ESPN's week, off the snapshot's schedule. */
export function espnWeek(snapshot, week) {
  const s = snapshot && snapshot.schedule
  if (!s || !Array.isArray(s.matchups)) return null
  const current = currentWeekOf(snapshot)
  const rows = s.matchups.filter((m) => Number(m.week) === Number(week))
  const games = []
  const noGame = []
  rows.forEach((m) => {
    if (m.home && m.away) {
      const winner = m.winner === 'HOME' ? 0 : m.winner === 'AWAY' ? 1 : m.winner === 'TIE' ? 'tie' : null
      games.push({
        key: `${week}:${m.home.teamId}:${m.away.teamId}`,
        home: true,
        sides: [
          { team: teamByOwner(snapshot, m.home.teamId), points: typeof m.home.points === 'number' ? m.home.points : null, starters: null, bench: null },
          { team: teamByOwner(snapshot, m.away.teamId), points: typeof m.away.points === 'number' ? m.away.points : null, starters: null, bench: null },
        ],
        winner,
        playoff: !!m.playoff,
      })
    } else {
      const only = m.home || m.away
      const t = only ? teamByOwner(snapshot, only.teamId) : null
      if (t) noGame.push(t)
    }
  })
  const regular = s.regularSeasonWeeks || null
  return {
    provider: 'espn',
    week,
    phase: phaseFor(week, current),
    playoff: regular ? week > regular : rows.some((r) => r.playoff),
    /* ESPN publishes a playoff week once its bracket is set, so a playoff
       week past the published schedule is one whose bracket is not. */
    bracketPending: !rows.length && !!regular && week > regular,
    games,
    noGame,
  }
}

/* Sleeper's week, off /sleeper/matchups. */
export function sleeperWeekView(snapshot, raw) {
  if (!raw) return null
  const games = (raw.games || []).map((g) => {
    const [a, b] = g.teams
    const final = raw.phase === 'final' && typeof a.points === 'number' && typeof b.points === 'number'
    const winner = !final ? null : a.points > b.points ? 0 : b.points > a.points ? 1 : 'tie'
    return {
      key: `${raw.week}:${g.matchupId}`,
      home: null,
      sides: g.teams.map((t) => ({
        team: teamByRoster(snapshot, t.rosterId),
        points: typeof t.points === 'number' ? t.points : null,
        starters: raw.phase === 'upcoming' ? null : t.starters || null,
        bench: raw.phase === 'upcoming' ? null : t.bench || null,
      })),
      winner,
      playoff: !!raw.playoff,
    }
  })
  return {
    provider: 'sleeper',
    week: raw.week,
    phase: raw.phase,
    playoff: !!raw.playoff,
    bracketPending: !!raw.bracketPending,
    games,
    noGame: (raw.noGame || []).map((id) => teamByRoster(snapshot, id)).filter(Boolean),
  }
}

/* One team's side of a week: its game, which side it is on, the opponent,
   and the result from its point of view. `bye` when the week has no game
   for it; null when the week says nothing about it at all. */
export function gameFor(view, team) {
  if (!view || !team) return null
  for (const g of view.games) {
    const i = g.sides.findIndex((s) => sameTeam(s.team, team))
    if (i < 0) continue
    const mine = g.sides[i]
    const theirs = g.sides[1 - i]
    const result = g.winner === null ? null : g.winner === 'tie' ? 'T' : g.winner === i ? 'W' : 'L'
    return { game: g, mine, theirs, result, home: g.home === null ? null : i === 0 }
  }
  if (view.noGame.some((t) => sameTeam(t, team))) return { bye: true }
  return null
}

/* A team's name short enough for a strip cell: the first word that is not
   an article, cut at eight characters. The full name is always the cell's
   accessible label and the page's heading. */
export function shortTeam(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean)
  const i = Math.max(0, words.findIndex((x) => !/^(the|a|an)$/i.test(x)))
  // A short first word ("My", "Da") says nothing on its own; take two.
  const w = (words[i] || '').length <= 3 && words[i + 1] ? words[i] + ' ' + words[i + 1] : words[i] || ''
  return w.length > 9 ? w.slice(0, 8) + '…' : w
}

/* "J. Allen" for a person, the club as it is for a defense. */
export function shortName(player) {
  if (!player) return ''
  const name = String(player.name || '')
  if (player.pos === 'DST') return name.replace(/\s+Defense$/i, '')
  const parts = name.split(/\s+/)
  if (parts.length < 2) return name
  return parts[0][0] + '. ' + parts.slice(1).join(' ')
}

/* ---- Two lineups, paired slot by slot ----
   A starters list is in lineup order, but an empty slot is dropped before
   it gets here (Sleeper pads one with "0", which lineupRows() filters, and
   ESPN leaves it out), so pairing the two sides by row number shifts every
   row after a gap: a defense ends up across from a kicker. So each side is
   placed into the league's own slots first — app.js's SLOT_ORDER, which is
   also the order both adapters sort starters into — and the two are paired
   by slot. Dedicated slots fill before FLEX and SFLEX, so a third back is the
   flex rather than stealing a receiver's row. With no lineup on the snapshot
   the template is as many of each position as either side starts. */
const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SFLEX', 'DST', 'K']
const SLOT_FILLS = { FLEX: ['RB', 'WR', 'TE'], SFLEX: ['QB', 'RB', 'WR', 'TE'] }

export function slotTemplate(lineup, sides) {
  const t = []
  const push = (slot, n) => { for (let i = 0; i < (Number(n) || 0); i++) t.push(slot) }
  if (lineup && lineup.starters) {
    SLOT_ORDER.forEach((slot) => push(slot, slot === 'FLEX' ? lineup.flex : slot === 'SFLEX' ? lineup.superflex : lineup.starters[slot]))
    if (t.length) return t
  }
  // No lineup on the snapshot: infer one. A skill position gets the slots
  // BOTH sides fill (the smaller count) and whatever either side starts
  // beyond that is flex, so a flex back pairs with a flex receiver; QB, D/ST
  // and K take as many as either side starts.
  const present = sides.filter((rows) => rows && rows.length)
  const count = (rows, pos) => rows.filter((r) => r && r.player && r.player.pos === pos).length
  const most = (pos) => Math.max(0, ...present.map((rows) => count(rows, pos)))
  const skill = ['RB', 'WR', 'TE']
  const dedicated = Object.fromEntries(skill.map((pos) => [pos, Math.min(...present.map((rows) => count(rows, pos)))]))
  const flex = Math.max(0, ...present.map((rows) => skill.reduce((n, pos) => n + count(rows, pos) - dedicated[pos], 0)))
  push('QB', most('QB'))
  skill.forEach((pos) => push(pos, present.length ? dedicated[pos] : 0))
  push('FLEX', flex)
  push('DST', most('DST'))
  push('K', most('K'))
  return t
}

export function placeInSlots(rows, template) {
  const out = template.map(() => null)
  const used = new Set()
  const take = (fits) => {
    const i = rows.findIndex((r, j) => !used.has(j) && r && r.player && fits(r.player.pos))
    if (i < 0) return null
    used.add(i)
    return rows[i]
  }
  template.forEach((slot, k) => { if (!SLOT_FILLS[slot]) out[k] = take((pos) => pos === slot) })
  template.forEach((slot, k) => { if (SLOT_FILLS[slot]) out[k] = take((pos) => SLOT_FILLS[slot].includes(pos)) })
  // Whoever fits no slot (a player not on Juke's board, a stated empty slot)
  // takes the first open one, and past the template if there is none.
  rows.forEach((r, j) => {
    if (!r || used.has(j)) return
    const k = out.indexOf(null)
    if (k >= 0) out[k] = r
    else out.push(r)
  })
  return out
}

export function alignLineups(left, right, lineup) {
  const template = slotTemplate(lineup, [left, right || []])
  const a = placeInSlots(left || [], template)
  const b = right ? placeInSlots(right, template) : null
  const n = Math.max(a.length, b ? b.length : 0)
  const rows = Array.from({ length: n }, (_, i) => [a[i] || null, b ? b[i] || null : null])
  // A slot neither side fills is not a row.
  return rows.filter(([x, y]) => x || y)
}
