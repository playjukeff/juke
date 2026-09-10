/* The Strategy Room's arithmetic: what your lineup is worth, and what one
 * swap would change.
 *
 * Imports nothing, for waiverBoard.js's reason and one sharper: this
 * module answers "start him, not him", which is the single most
 * consequential thing this product says to somebody in-season. It has to
 * be checkable without a browser.
 *
 * ---- What is NOT here, and it is three of the handoff's seven tabs ----
 *
 * Matchup, Scenarios and Opponent Intel all need Sleeper's
 * /league/<id>/matchups/<week>, which nothing in this project fetches — so
 * there is no opponent, no weekly projection for them, and no margin to
 * plan against. The handoff's own lobby line ("Gridiron Gang projects 108;
 * you project 114 as set, 120 with one swap") is two thirds unavailable
 * for the same reason.
 *
 * The half that IS available is the half about your own roster, and it is
 * the half a manager acts on: what you project as set, and what the best
 * legal swap adds. That is computed here and the rest is left out rather
 * than estimated.
 */

/* A week's scorer: the season-average one, with the bye taken out.
 *
 * Everything on this screen asks weekPts(player) and none of it passes a
 * week, so a starter on bye was contributing his ordinary average to a
 * number captioned "Points this week, as your lineup is set." He scores
 * zero that week, and the room already knows it -- injuryWatch() lists a
 * bye beside an injury on the ground that they are "the same problem on
 * the day: the slot is empty" -- so the total was disagreeing with the
 * panel underneath it.
 *
 * Zero rather than null, and the distinction is load-bearing:
 * projectedTotal() answers null if ANY row is null, so null would blank the
 * whole figure over a fact the room can state exactly. An empty slot scores
 * nothing, which is a number.
 *
 * It also makes bestSwaps() correct for free rather than by coincidence: a
 * bench player worth anything now outranks a starter worth zero, so "one
 * swap" finally says the thing a reader most needs in weeks 5 to 14.
 *
 * `week` may be null -- a snapshot taken before the season starts has no
 * week -- and then nobody is on bye rather than everybody being compared
 * against a week that does not exist. Same rule injuryWatch() follows. */
export function weekScorer(base, week) {
  if (typeof base !== 'function') return base
  return (player) => {
    if (!player) return null
    if (week && player.bye && player.bye === week) return 0
    return base(player)
  }
}

/* The league's own number first, and Juke's only where the league has none.
 *
 * A connected league has to show the projection its platform shows -- the
 * owner's requirement, stated as non-negotiable on 10 September 2026. The
 * snapshot now carries it (`projections`, from ESPN's `appliedTotal`; see
 * weekProjection() in worker/espn.js for why that is exact rather than an
 * opinion), and this is where a screen asks for it.
 *
 * ---- Only for the week it was stamped with ----
 *
 * `projections.week` has to equal the week being scored. ESPN's number for
 * week 1 is not an answer about week 2, and serving it would be the
 * right-value-wrong-column failure with a date on it -- the same rule
 * weekProjectionUnder() already follows for Juke's own weekly block.
 *
 * ---- The fallback is per player, not per lineup ----
 *
 * A starter the league has no number for -- a provider that sends none
 * (Sleeper, today), or one row the platform left out -- still gets Juke's
 * own projection rather than blanking the lineup. That makes a total that
 * mixes two sources possible, and that is strictly better than the
 * alternative: a null here is what projectedTotal() reads as "cannot
 * total", and a lineup that cannot be totalled over one missing row is the
 * wrong way to be honest about it. The provider is named on screen.
 *
 * Deliberately not the bye rule's job to override: the platform's number
 * for a player on bye IS the league's answer, and the fallback beneath it
 * already zeroes a bye through weekScorer(). */
export function platformScorer(base, projections, week) {
  const points = projections && week && Number(projections.week) === Number(week)
    ? projections.points
    : null
  if (!points || typeof points !== 'object') return base
  return (player) => {
    if (!player) return null
    const v = points[String(player.id)]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    return typeof base === 'function' ? base(player) : null
  }
}

/* The one weekly scorer every connected screen builds, so no two of them
 * can disagree about what a player is worth this week.
 *
 * There were three, and they disagreed. The Strategy Room scored the real
 * week with the bye taken out; the phone's More sheet and the rooms grid
 * scored the SEASON AVERAGE with no week at all -- so the "+X this week" on
 * a room tile was a different number from the swap the room itself
 * offered, for the same player, one tap apart. That is the written-down-
 * twice rule with a scorer in it, and it drifted the day the Strategy Room
 * learned about weeks and nothing else did.
 *
 * `engine` is passed in rather than read off window, for the reason this
 * file imports nothing: a suite can hand it a stub.
 *
 * In order of preference: the league's own projection for this week
 * (platformScorer), then Juke's weekly block for this week under the
 * league's own rules (weekProjectionUnder), then the season average under
 * those rules (projPerGameUnder) -- with a player on bye zeroed beneath the
 * league's number, never above it. */
export function leagueWeekPts(engine, snapshot) {
  if (!engine) return null
  const rules = snapshot && snapshot.rules ? snapshot.rules : null
  const week = snapshot ? snapshot.week : null
  const average = rules && engine.projPerGameUnder
    ? (player) => engine.projPerGameUnder(player, rules)
    : engine.projPerGame
  const forWeek = (player) => {
    if (!engine.weekProjectionUnder) return average(player)
    const own = engine.weekProjectionUnder(player, rules, week)
    return own === null || own === undefined ? average(player) : own
  }
  return platformScorer(weekScorer(forWeek, week), snapshot && snapshot.projections, week)
}

/* Which source a lineup's numbers came from, so a screen can say so.
 *
 * `all` when every scored row is the league's own number, `some` when the
 * fallback filled a gap, `none` when the league sent nothing for the week.
 * A screen that mixes two sources without saying which is the "claims a
 * backup it does not have" failure with a projection in it. */
export function projectionSource(rows, projections, week) {
  const points = projections && week && Number(projections.week) === Number(week)
    ? projections.points
    : null
  if (!points) return 'none'
  const scored = (rows || []).filter((r) => r && r.player)
  if (!scored.length) return 'none'
  const hits = scored.filter((r) => typeof points[String(r.player.id)] === 'number').length
  if (hits === scored.length) return 'all'
  return hits ? 'some' : 'none'
}

/* Every starter, with what the projection says.
 *
 * `starters` is Sleeper's own array and its ORDER is the league's roster
 * slots — but the slot NAMES come from league.roster_positions, which the
 * snapshot does not carry. So a row knows the player's own position and
 * not which slot he is filling, which is exactly the limitation swaps()
 * below is built around.
 *
 * A starter the board has never heard of still gets a row, with a null
 * projection. Dropping him would silently shorten a lineup and make the
 * total below look like a smaller roster rather than an incomplete one. */
export function lineupRows(team, byId, weekPts) {
  if (!team) return []
  return (team.starters || [])
    .map(String)
    // Sleeper pads an unfilled slot with "0". That is an empty slot, not a
    // player, and it must not become a row with a missing name.
    .filter((id) => id && id !== '0')
    .map((id) => {
      const player = byId ? byId.get(id) : null
      const pts = player && weekPts ? weekPts(player) : null
      return { id, player: player || null, projPts: typeof pts === 'number' ? pts : null }
    })
}

/* The bench: rostered and not starting. */
export function benchRows(team, byId, weekPts) {
  if (!team) return []
  const starting = new Set((team.starters || []).map(String))
  return (team.players || [])
    .map(String)
    .filter((id) => !starting.has(id))
    .map((id) => {
      const player = byId ? byId.get(id) : null
      const pts = player && weekPts ? weekPts(player) : null
      return { id, player: player || null, projPts: typeof pts === 'number' ? pts : null }
    })
    .filter((row) => !!row.player)
}

/* Which injury codes mean "not playing" and which mean "we do not know".
 *
 * Sleeper's own values, as they appear in players.js: Q, PUP, IR, DNR, O,
 * SUS. Split two ways rather than ranked six ways, because a finer
 * ordering would be an opinion this project has not measured — and the
 * only thing a lineup decision turns on is whether he will be out there. */
const OUT_CODES = ['O', 'IR', 'PUP', 'SUS', 'DNR']

export function injurySeverity(code) {
  if (!code) return null
  if (OUT_CODES.indexOf(code) >= 0) return 'out'
  return 'questionable'
}

/* Will this player be on the field at all?
 *
 * A bye and a ruled-out designation are the same fact for a lineup: the
 * slot scores nothing. Used on both sides of a swap and meaning opposite
 * things — never START one of these, and always consider swapping one OUT.
 */
function benched(player, week) {
  if (!player) return false
  if (week && Number(player.bye) === Number(week)) return true
  return injurySeverity(player.inj) === 'out'
}

/* What one swap would add.
 *
 * ---- Same position only, and that is a correctness constraint ----
 *
 * A FLEX slot can take a back or a receiver, so a bench receiver may well
 * be a legal swap for a starting back. We cannot know: the slot names live
 * in league.roster_positions and the snapshot does not carry them, so the
 * only swap this can PROVE is legal is one where the two players share a
 * position — if he can start at RB, so can the other RB.
 *
 * Suggesting an illegal swap is the worst failure available here, because
 * a manager would go and try to make it. So the rule is the conservative
 * one, and the room says so rather than quietly under-reporting.
 *
 * A player with no projection is not comparable and is skipped on both
 * sides — the "treat a missing number as missing" rule, where treating it
 * as zero would recommend benching anybody the board has not projected. */
export function swaps(team, byId, weekPts, week) {
  const starters = lineupRows(team, byId, weekPts).filter((r) => r.player && r.projPts !== null)
  const bench = benchRows(team, byId, weekPts).filter((r) => r.projPts !== null)
  const out = []
  for (const sit of starters) {
    for (const start of bench) {
      if (start.player.pos !== sit.player.pos) continue
      /* Never recommend somebody who will not be on the field.
         Found by driving the room: it offered Ja'Marr Chase over Jordan
         Addison in week 6, and Chase was on bye. A start/sit call for a
         player who is not playing is worse than no call — the reader
         acts on it, and the slot scores nothing.

         The SIT side is deliberately not filtered the same way: a
         starter who is on bye or out is exactly who you want swapped
         OUT, and hiding those rows would remove the most useful
         recommendations on the screen. */
      if (week && Number(start.player.bye) === Number(week)) continue
      if (injurySeverity(start.player.inj) === 'out') continue

      /* A starter who is on bye or ruled out will score ZERO, whatever
         his projection says — so the comparison is against nothing, not
         against his season form. Without this the room stays silent on
         the single most obvious lineup error there is: an unbeatable
         player sitting in a slot that cannot score, because his
         projection still beats every healthy alternative on the bench.
         Caught by a test written for the opposite case. */
      const sitPts = benched(sit.player, week) ? 0 : sit.projPts
      const gain = start.projPts - sitPts
      if (gain > 0) out.push({ start: start.player, sit: sit.player, gain, replacing: sitPts === 0 })
    }
  }
  out.sort((a, b) => b.gain - a.gain)
  return out
}

/* The best swap per starter, so one weak starter does not fill the list.
 *
 * swaps() returns every legal pair, which for a bench of three backs and a
 * weak starting back is three rows saying the same thing. A reader wants
 * one line per decision. */
export function bestSwaps(team, byId, weekPts, week, limit) {
  const seen = new Set()
  const out = []
  for (const swap of swaps(team, byId, weekPts, week)) {
    const key = swap.sit.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push(swap)
  }
  return limit ? out.slice(0, limit) : out
}

/* What the lineup projects as set.
 *
 * Null rather than a partial sum when any starter is unprojected. A total
 * that quietly omitted a player would read as a lineup worth less than it
 * is, and this number's whole job is being compared against another one —
 * which is the "a right number in the wrong column" failure with a
 * decision attached.
 *
 * An empty lineup is null too, not 0: nothing has been set, which is a
 * different fact from a lineup worth nothing. */
export function projectedTotal(team, byId, weekPts) {
  const rows = lineupRows(team, byId, weekPts)
  if (!rows.length) return null
  let total = 0
  for (const row of rows) {
    if (row.projPts === null) return null
    total += row.projPts
  }
  return total
}


/* Everybody on the roster who might not play, starters first.
 *
 * A bye is in here alongside an injury because they are the same problem
 * on the day: the slot is empty. It is separated in the row so a reader is
 * never told somebody is hurt when he is on bye.
 *
 * `week` may be null — a snapshot taken before the season starts has no
 * week — and then no bye is reported rather than every player being
 * compared against a week that does not exist. */
export function injuryWatch(team, byId, week) {
  if (!team) return []
  const starting = new Set((team.starters || []).map(String))
  const rows = []
  for (const id of team.players || []) {
    const key = String(id)
    const player = byId ? byId.get(key) : null
    if (!player) continue
    const severity = injurySeverity(player.inj)
    const onBye = !!week && Number(player.bye) === Number(week)
    if (!severity && !onBye) continue
    rows.push({ player, severity, onBye, starting: starting.has(key) })
  }
  /* Starters first, then the ones who are definitely out — a questionable
     bench player is not a decision and should not sit above a starter who
     is on bye. */
  const rank = (r) => (r.starting ? 0 : 2) + (r.severity === 'out' || r.onBye ? 0 : 1)
  rows.sort((a, b) => rank(a) - rank(b))
  return rows
}
