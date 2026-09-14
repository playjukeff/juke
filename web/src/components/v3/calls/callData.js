/* Pure readers for v3's three call tools (lineup, wire, trade).

   Nothing here scores a player. Every point, every value over replacement
   and every probability comes off window.JukeEngine or the production room
   boards (rooms/strategyBoard.js, rooms/waiverBoard.js, rooms/tradeBoard.js)
   the tools import directly — this file only does the two jobs those boards
   do not:

     1. build the SAMPLE league a signed-out visitor sees, so the guest tool
        runs the exact same arithmetic on real players; and
     2. pick the one 1-for-1 deal the market calls even and the points do
        not, which is what the Trade tool opens with before a deal exists.

   Imports nothing, so it can be driven from a node REPL with a stub engine,
   the reason the room boards import nothing either. */

/* ---------------------------------------------------------------------------
   The sample league.

   Production's guest rooms blur a hand-written week ("Sarah's offer", a $12
   bid, a 58% win probability). v3 runs the tool itself instead, on a league
   that is invented and says so everywhere: every team is drafted by ADP off
   tonight's board, in snake order, shaped like the mock the visitor has set
   up (engine.league() — read, never written down again). Players, projections
   and every figure computed from them are real; the league is the one
   invented thing, and the page labels it SAMPLE.

   Lineups are set BY DRAFT ORDER — the earliest-drafted player at each slot
   starts — because that is how a real manager who has not looked this week
   sets a lineup, and it is exactly the mistake the Lineup tool exists to
   catch. Whether a swap exists is then the projection's call, not ours.

   No week, no budget, no deadline: those are facts about a league a visitor
   has not connected, and the tools already render each as absent. --------- */

const LINEUP_ORDER = ['QB', 'RB', 'WR', 'TE']
const FLEXABLE = ['RB', 'WR', 'TE']

export function sampleLeague(engine, opts = {}) {
  if (!engine || !engine.board) return null
  const board = engine.board()
  if (!board || !board.length) return null
  const lg = engine.league ? engine.league() : null
  const teams = lg && lg.teams >= 4 ? lg.teams : 10
  const rounds = lg && lg.rounds >= 8 ? lg.rounds : 14
  const st = (lg && lg.starters) || { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 }
  const flex = lg && typeof lg.flex === 'number' ? lg.flex : 1
  const sflex = lg && lg.superflex ? Number(lg.superflex) || 0 : 0
  let seat = 0
  try { seat = engine.mySlot ? Number(engine.mySlot()) || 0 : 0 } catch { seat = 0 }
  if (seat < 0 || seat >= teams) seat = 0

  // A copy, never the board itself: board order is an input to the CPU
  // wobble, and CLAUDE.md's rule is that nothing sorts it in place.
  const pool = board.filter((p) => p && !p.deep && typeof p.adp === 'number').slice().sort((a, b) => a.adp - b.adp)
  const cap = {
    QB: (st.QB || 0) + sflex + 1,
    RB: (st.RB || 0) + flex + 2,
    WR: (st.WR || 0) + flex + 2,
    TE: (st.TE || 0) + 1,
    K: st.K || 0,
    DST: st.DST || 0,
  }
  const kdRounds = (st.K || 0) + (st.DST || 0)

  const rosters = Array.from({ length: teams }, () => [])
  const taken = new Set()
  for (let r = 0; r < rounds; r++) {
    const order = r % 2 ? Array.from({ length: teams }, (_, i) => teams - 1 - i) : Array.from({ length: teams }, (_, i) => i)
    for (const t of order) {
      const have = (pos) => rosters[t].filter((p) => p.pos === pos).length
      const late = r >= rounds - kdRounds
      let pick = pool.find((p) => {
        if (taken.has(p.id)) return false
        if (p.pos === 'K' || p.pos === 'DST') return late && have(p.pos) < cap[p.pos]
        return have(p.pos) < (cap[p.pos] || 0)
      })
      if (!pick) pick = pool.find((p) => !taken.has(p.id) && p.pos !== 'K' && p.pos !== 'DST')
      if (!pick) continue
      taken.add(pick.id)
      rosters[t].push(pick)
    }
  }

  const teamsList = rosters.map((picks, i) => {
    const used = new Set()
    const starters = []
    const takeFirst = (ok, n) => {
      for (const p of picks) {
        if (n <= 0) break
        if (used.has(p.id) || !ok(p)) continue
        used.add(p.id)
        starters.push(String(p.id))
        n -= 1
      }
    }
    for (const pos of LINEUP_ORDER) takeFirst((p) => p.pos === pos, st[pos] || 0)
    takeFirst((p) => FLEXABLE.indexOf(p.pos) >= 0, flex)
    takeFirst((p) => LINEUP_ORDER.indexOf(p.pos) >= 0, sflex)
    takeFirst((p) => p.pos === 'K', st.K || 0)
    takeFirst((p) => p.pos === 'DST', st.DST || 0)
    return {
      rosterId: i + 1,
      ownerId: 'sample-' + (i + 1),
      teamName: `Sample team ${i + 1}`,
      players: picks.map((p) => String(p.id)),
      starters,
      wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
    }
  })

  /* Which chair is "yours". The mock's own seat, unless the caller asks for a
     chair where the tool has something to show — the Lineup tool asks for a
     roster whose draft-order lineup Juke would actually change, because a
     sample that says "nothing to do" teaches nothing about the tool. The
     band names the chair either way, so the choice is on screen. */
  if (typeof opts.prefer === 'function') {
    for (let i = 0; i < teams; i++) {
      const s = (seat + i) % teams
      let ok = false
      try { ok = !!opts.prefer(teamsList[s], { teams: teamsList }) } catch { ok = false }
      if (ok) { seat = s; break }
    }
  }
  const list = teamsList.map((t, i) => (i === seat ? { ...t, teamName: 'Your sample team' } : t))
  const me = list[seat]
  const them = list[(seat + 1) % teams]
  return {
    league: { leagueId: 'sample', provider: null, name: 'Sample league', totalTeams: teams, ownerId: me.ownerId },
    snapshot: {
      provider: null, leagueId: 'sample', name: 'Sample league', totalTeams: teams,
      week: null, rules: null, projections: null, status: null,
      waiver: null, waiverBudget: null, tradeDeadline: null,
      schedule: {
        weeks: 1,
        regularSeasonWeeks: 1,
        matchups: [{ week: 1, home: { teamId: me.ownerId, points: null }, away: { teamId: them.ownerId, points: null }, winner: 'UNDECIDED', playoff: false }],
      },
      teams: list,
    },
    seat: seat + 1,
    teams,
    rounds,
  }
}

/* ---------------------------------------------------------------------------
   The deal the market calls even.

   Two players the market (ADP) prices within a few picks of each other,
   one on the reader's roster and one on a rival's, whose value over
   replacement differs most in the reader's favour. That is the Trade tool's
   whole argument in one line: "ADP says even; the points say +22".

   Values are `gapOf` — JukeEngine.replacementGap, the same function the
   Trade Room prices with — so a kicker or a defense (null) is never offered,
   and a deep-bench player is skipped because no real draft has priced him,
   so his ADP says nothing about what the market thinks.

   Answers null rather than stretching the window until something turns up:
   a "market-even" deal three rounds apart is not one. ---------------------- */
export function marketEvenDeal(mine, rivals, byId, gapOf, windows = [3, 6]) {
  if (!mine || !rivals || !rivals.length || !byId || !gapOf) return null
  const priced = (team) => (team.players || [])
    .map((id) => byId.get(String(id)))
    .filter((p) => p && !p.deep && typeof p.adp === 'number')
    .map((p) => ({ player: p, value: gapOf(p) }))
    .filter((r) => typeof r.value === 'number')
  const mineRows = priced(mine)
  for (const w of windows) {
    let best = null
    for (const team of rivals) {
      for (const theirs of priced(team)) {
        for (const ours of mineRows) {
          const apart = Math.abs(theirs.player.adp - ours.player.adp)
          if (apart > w) continue
          const gain = theirs.value - ours.value
          if (gain <= 0) continue
          if (!best || gain > best.gain) best = { give: ours, get: theirs, team, gain, apart }
        }
      }
    }
    if (best) return best
  }
  return null
}

/* ---------------------------------------------------------------------------
   A deal handed in by address.

   Now can open the Trade tool on a specific question:
     #/calls/trade?with=<rosterId>&give=<id,id>&get=<id,id>
   V3App strips the query before routing, so it is read off the hash here.
   Ids that are not on the right roster are dropped rather than trusted. --- */
export function dealFromHash(hash) {
  const q = String(hash || '').split('?')[1]
  if (!q) return null
  const p = new URLSearchParams(q)
  const list = (k) => (p.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean)
  const withId = p.get('with')
  const give = list('give')
  const get = list('get')
  if (!withId && !give.length && !get.length) return null
  return { with: withId, give, get }
}

/* The lineup with one swap made, for pricing the matchup after the call.
   `rows` are lineupRows() output; the swapped-in row is scored by the same
   weekPts the room uses, so the two probabilities are one method read twice. */
export function swappedRows(rows, swap, weekPts) {
  if (!swap || !rows) return rows
  return rows.map((r) => {
    if (!r.player || String(r.player.id) !== String(swap.sit.id)) return r
    const pts = weekPts ? weekPts(swap.start) : null
    return { id: String(swap.start.id), player: swap.start, projPts: typeof pts === 'number' ? pts : null }
  })
}
