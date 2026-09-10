/* Where a season ends up, from where it is now.
 *
 * Screen 05 asks for playoff and bye odds, and this file is the last entry
 * on the decision guide's own blocked list. CLAUDE.md said, correctly, that
 * it needs "a joint distribution over every remaining week and every other
 * team's schedule" — which is a Monte Carlo season simulation and was the
 * one thing here that could not be got at by re-reading a comment.
 *
 * Imports nothing, for `leagueStore.js`'s reason: `tests.yml` installs no
 * npm dependencies, and a number this confident had better be checkable
 * without a browser.
 *
 * ---- It does not invent a second model ----
 *
 * The per-matchup model is already shipped and measured: a team's week is
 * `teamWeek()`'s mean and standard deviation, and one matchup is the normal
 * difference `winRateAgainst()` computes. **The simulation is the
 * GENERATIVE form of that same model**, not a rival to it: it draws each
 * side's score from its own normal and compares them, so the marginal
 * probability of any single matchup is exactly the analytic one.
 *
 * That is an invariant rather than an intention, and
 * `scripts/test_season_sim.mjs` asserts it: simulate one matchup many
 * times, and the empirical win rate matches `winRateAgainst()`'s answer to
 * within sampling error. A second normal difference living in `web/src`
 * would be the written-down-twice failure with a probability in it — this
 * is the one shape that cannot drift from the original, because it IS the
 * original, sampled.
 *
 * Drawing scores rather than flipping the analytic coin also buys the thing
 * a Bernoulli draw cannot: **points for**, which is the standings' own
 * tiebreak. Seeding is decided on wins then points for (`standings.js`), so
 * a simulation that only tracked wins could not seed the table it is
 * simulating.
 *
 * ---- What it deliberately does not answer ----
 *
 * **Title odds.** Simulating the bracket needs reseeding rules, and the
 * shape of a championship week neither adapter publishes — a league running
 * a two-week final is not a thing this can see. Playoff and bye odds are
 * decided entirely by the regular season, which IS published in full, so
 * they are answerable and a title is not.
 *
 * **Anything for a Sleeper league.** It publishes no season schedule at all
 * (see `matchups.js`), and there is no remaining-fixture list to simulate.
 * `null`, and the screen draws nothing — the score strip's contract.
 */

/* Ten thousand seasons.
 *
 * Derived rather than picked: the standard error of a proportion is
 * sqrt(p(1-p)/n), worst at p = 0.5, so 10,000 puts it at 0.5 points — half
 * a point on a number printed as a whole one. A thousand would put it at
 * 1.6 points, which is visible jitter on a figure a reader checks weekly;
 * a hundred thousand buys 0.16 for ten times the work.
 *
 * Measured on a real ten-team league: see CLAUDE.md for the cost. */
export const SIMS = 10000

/* A season with nothing left to play has no distribution to sample. */
const UNPLAYED = 'UNDECIDED'

/* Deterministic, and that is not a detail.
 *
 * A reader who reloads must not see 61% become 58%. Sampling noise is real
 * — SIMS above is what bounds it — but it may not be VISIBLE, because a
 * number that moves when nothing happened is a number nobody can act on.
 * The same argument `PAR_SEEDS` already makes about the draft grade: the
 * answer has to be a property of the league rather than of the moment it
 * was asked.
 *
 * mulberry32, which is four lines and passes the tests a simulation like
 * this needs. `Math.random()` is what this must not be. */
function rng(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* A stable seed for one league at one point in its season.
 *
 * Derived from the league rather than handed in, so two components asking
 * the same question get the same answer — and it moves with the week, which
 * is right: the odds genuinely change when a game is played, and pinning
 * the seed across weeks would only hide that they had. */
export function seedFor(leagueId, week) {
  const s = String(leagueId || '') + ':' + String(week || 0)
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/* Box–Muller, one draw at a time.
 *
 * The second normal of each pair is deliberately thrown away rather than
 * cached. A cache makes the stream's state depend on how many draws a
 * caller has taken, so adding a team to a league would change every other
 * team's numbers — which is the "a variance of exactly zero means the
 * samples are the same sample" hazard from the other end: reproducible for
 * the wrong reason. Two uniforms per normal is cheap and the stream stays a
 * pure function of the seed and the draw count. */
function normal(next, mean, sd) {
  let u = next()
  // log(0) is -Infinity. One redraw, because a uniform is [0,1).
  while (u === 0) u = next()
  const r = Math.sqrt(-2 * Math.log(u))
  return mean + sd * r * Math.cos(2 * Math.PI * next())
}

/* How many teams get a first-round bye, or null when the bracket cannot be
   reconciled with the season that is published.
 *
 * Neither adapter reports a bye count. It IS derivable from a single-
 * elimination bracket — `2^ceil(log2(P))` seats, so `bracket - P` of them
 * are byes — and every platform here runs one.
 *
 * But a derivation is only worth printing if it can be CHECKED, so it is:
 * a bracket of `2^k` seats takes exactly `k` weeks to play, and the
 * schedule says how many playoff weeks there are. When the two disagree —
 * a two-week championship, a consolation round counted as playoff weeks,
 * anything this does not model — the bye number is refused and the playoff
 * odds beside it are unaffected.
 *
 * Refusing half an answer rather than the whole one is the same call
 * `waiver` already makes about a budget on an order league: the fact that
 * cannot be established is the one withheld. */
export function byeSeats(playoffTeams, playoffWeeks) {
  const p = Number(playoffTeams)
  const w = Number(playoffWeeks)
  if (!p || p < 2 || !w || w < 1) return null
  const rounds = Math.ceil(Math.log2(p))
  if (rounds !== w) return null
  return Math.pow(2, rounds) - p
}

/* The remaining regular-season fixtures, in the order they will be played.
 *
 * A game is remaining when its own winner is still UNDECIDED, rather than
 * when its week is in the future. That is `myGames()`'s rule and it is the
 * one that survives a snapshot taken mid-week: the week counter has already
 * moved while Sunday's games have not been decided.
 *
 * A bye — one side and no opponent — is a real week for that team and is
 * skipped here rather than dropped from the schedule, because nobody wins
 * it. Playoff fixtures are excluded: seeding is decided by the regular
 * season, which is the whole question. */
function remaining(schedule) {
  const rows = []
  ;(schedule.matchups || []).forEach((m) => {
    if (!m || m.playoff) return
    if (String(m.winner || UNPLAYED).toUpperCase() !== UNPLAYED) return
    if (!m.home || !m.away) return
    rows.push([String(m.home.teamId), String(m.away.teamId)])
  })
  return rows
}

/* Where the season ends up, ten thousand times.
 *
 * `strength` is a Map or plain object of teamId -> { mean, stdev }, which is
 * `teamWeek()`'s own output for that team's lineup. Everything else comes
 * off the snapshot.
 *
 * ---- One unprojectable roster refuses the whole table ----
 *
 * A team Juke cannot price is not a team that can be left out: every other
 * team plays it, so its absence would silently make somebody's schedule
 * easier. The odds are a JOINT distribution and a partial one is not a
 * smaller version of it, it is a different and wrong one.
 *
 * That is `teamWeek()`'s own rule about a starter with no projection, one
 * level up, and it fails the same way — plausibly. A nine-team simulation
 * of a ten-team league produces perfectly reasonable percentages.
 */
export function seasonOdds(input) {
  const o = input || {}
  const { schedule, teams, strength, playoffTeams } = o
  const sims = o.sims || SIMS

  if (!schedule || !Array.isArray(schedule.matchups) || !schedule.matchups.length) return null
  if (!Array.isArray(teams) || teams.length < 2) return null
  if (!strength) return null
  if (!schedule.regularSeasonWeeks) return null

  const get = (id) => (strength instanceof Map ? strength.get(String(id)) : strength[String(id)])

  const ids = teams.map((t) => String(t.ownerId))
  const index = new Map(ids.map((id, i) => [id, i]))

  // Every team, or none. See above.
  const mean = []
  const sd = []
  for (const id of ids) {
    const s = get(id)
    if (!s || !Number.isFinite(s.mean) || !Number.isFinite(s.stdev)) return null
    mean.push(s.mean)
    sd.push(s.stdev)
  }

  const games = remaining(schedule)
  const startWins = teams.map((t) => Number(t.wins) || 0)
  const startPf = teams.map((t) => Number(t.pointsFor) || 0)

  const cut = Number(playoffTeams) || 0
  const byes = byeSeats(playoffTeams, (schedule.weeks || 0) - schedule.regularSeasonWeeks)

  const next = rng(o.seed || 1)
  const n = ids.length
  const madePlayoffs = new Array(n).fill(0)
  const gotBye = new Array(n).fill(0)
  const winTotal = new Array(n).fill(0)
  const seedTotal = new Array(n).fill(0)

  const wins = new Array(n)
  const pf = new Array(n)
  const order = new Array(n)

  for (let s = 0; s < sims; s += 1) {
    for (let i = 0; i < n; i += 1) {
      wins[i] = startWins[i]
      pf[i] = startPf[i]
      order[i] = i
    }

    for (let g = 0; g < games.length; g += 1) {
      const a = index.get(games[g][0])
      const b = index.get(games[g][1])
      // A fixture naming a team the snapshot does not list. Skipped rather
      // than refused: it is a schedule that disagrees with its own league,
      // and dropping the game is the smaller wrong answer than dropping the
      // season.
      if (a === undefined || b === undefined) continue
      const sa = normal(next, mean[a], sd[a])
      const sb = normal(next, mean[b], sd[b])
      pf[a] += sa
      pf[b] += sb
      // Two continuous draws are never exactly equal, so there is no tie
      // branch to write. A real league's ties are already in `startWins`.
      if (sa > sb) wins[a] += 1
      else wins[b] += 1
    }

    /* The standings' own rule, not a second opinion: wins, then points for.
       `ordered()` sorts team objects and this sorts indices, which is the
       same comparison over the same two keys — a simulation seeded by one
       ordering and read by another would rank teams the table does not. */
    order.sort((x, y) => (wins[y] - wins[x]) || (pf[y] - pf[x]))

    for (let r = 0; r < n; r += 1) {
      const t = order[r]
      seedTotal[t] += r + 1
      if (cut && r < cut) madePlayoffs[t] += 1
      if (byes !== null && r < byes) gotBye[t] += 1
    }
    for (let i = 0; i < n; i += 1) winTotal[i] += wins[i]
  }

  return {
    sims,
    games: games.length,
    /* Null rather than 0 when the league does not say how many teams
       qualify, so a caller draws nothing instead of "0% to make it". */
    playoffTeams: cut || null,
    byeSeats: byes,
    teams: ids.map((id, i) => ({
      teamId: id,
      /* Every figure is a mean over the same seasons, so they are all
         answers about one distribution rather than four separate models. */
      playoffs: cut ? madePlayoffs[i] / sims : null,
      bye: byes === null ? null : byes === 0 ? 0 : gotBye[i] / sims,
      wins: winTotal[i] / sims,
      seed: seedTotal[i] / sims,
    })),
  }
}

/* One team's row, by owner. A convenience the screens want and a place to
   keep "which of these is mine" from being written out three times. */
export function oddsFor(odds, ownerId) {
  if (!odds || !ownerId) return null
  return odds.teams.find((t) => t.teamId === String(ownerId)) || null
}
