/* Who is actually available in a connected league, and what they are worth.
 *
 * The Waiver Room's whole claim is "these are the best players nobody in
 * your league owns", and both halves of that are real: a Sleeper roster is
 * a list of Sleeper player ids, and `players.js`/`stats.js` are keyed by
 * the same ids — which is the identity `leagueSnapshot()`'s own comment
 * calls "the whole reason a connected league is worth anything here".
 *
 * ---- Why this is a plain module and not a hook ----
 *
 * The same reason leagueStore.js and decisionStore.js are: it imports
 * nothing, so CI can run it with no npm install, and every surface that
 * renders it sits inside Clerk's <SignedIn> where a keyless build draws
 * the signed-out fallback instead. The arithmetic here decides what a
 * manager is told to claim — it is the last thing that should only be
 * checkable by looking at a screen nobody can reach.
 */

/* Every player id somebody in this league holds.
 *
 * `players` rather than `starters`: a benched player is still owned, and a
 * targets board that offered somebody else's bench would be worse than
 * useless. Built as a Set because the alternative is a linear scan per
 * board row per render, and the board is several hundred rows long. */
export function rosteredIds(snapshot) {
  const held = new Set()
  const teams = (snapshot && snapshot.teams) || []
  for (const team of teams) {
    for (const id of team.players || []) held.add(String(id))
  }
  return held
}

/* Which team is the reader's.
 *
 * `ownerId` is stored on the connection at connect time and comes back on
 * every listLeagues(), so this needs no extra call. Answers null rather
 * than guessing: a league connected before ownerId was recorded, or one
 * where the manager's roster has since been removed, has no "your team" —
 * and a room that picked an arbitrary roster would price every claim
 * against a stranger's bench. */
export function myTeam(snapshot, league) {
  if (!snapshot || !league || !league.ownerId) return null
  const teams = snapshot.teams || []
  for (const team of teams) {
    if (team.ownerId && String(team.ownerId) === String(league.ownerId)) return team
  }
  return null
}

/* The free agents, best first.
 *
 * `gapOf` is JukeEngine.replacementGap — passed in rather than imported,
 * because this module has no bridge and should not grow one. It answers
 * null for a player with no projection AND for a kicker or a defense,
 * which is deliberate on both counts: three seasons of backtesting found
 * the projected order for those two no better than chance, so a targets
 * board that ranked them would be selling a number the app itself
 * withholds everywhere else.
 *
 * Those players are dropped rather than sorted last. A waiver board is a
 * recommendation, not an inventory — an unranked player at the bottom of a
 * ranked list still reads as "worse than the one above him", which is
 * exactly the claim the refusal exists to avoid making. */
export function freeAgents(board, snapshot, gapOf, limit) {
  if (!Array.isArray(board) || !board.length || !snapshot) return []
  const held = rosteredIds(snapshot)
  const out = []
  for (const player of board) {
    if (!player || !player.id) continue
    if (held.has(String(player.id))) continue
    const gap = gapOf ? gapOf(player) : null
    if (gap === null || gap === undefined) continue
    out.push({ player, gap })
  }
  out.sort((a, b) => b.gap - a.gap)
  return limit ? out.slice(0, limit) : out
}

/* What the reader's own roster is thin at.
 *
 * A position is a gap when the best player held at it is worth less than
 * the best free agent at it — which is the only definition that answers
 * the question the room is for ("would a claim actually improve me"). A
 * roster-count rule would say a team with four running backs is fine when
 * all four are below replacement, and that is the failure the draft
 * grade's own cover component was rewritten once already to stop making.
 *
 * `byId` is a lookup from Sleeper id to board row, built by the caller
 * once per render rather than per position. */
export function rosterGaps(team, byId, available, gapOf) {
  if (!team || !byId) return []
  const bestHeld = new Map()
  for (const id of team.players || []) {
    const player = byId.get(String(id))
    if (!player) continue
    const gap = gapOf ? gapOf(player) : null
    if (gap === null || gap === undefined) continue
    const prev = bestHeld.get(player.pos)
    if (prev === undefined || gap > prev) bestHeld.set(player.pos, gap)
  }

  const bestFree = new Map()
  for (const row of available) {
    const pos = row.player.pos
    if (!bestFree.has(pos)) bestFree.set(pos, row)
  }

  const gaps = []
  for (const [pos, row] of bestFree) {
    // A position the reader holds nobody rankable at is the widest gap
    // there is, not a missing value — `held` stays null and the caller
    // says so rather than printing a subtraction against zero.
    const held = bestHeld.has(pos) ? bestHeld.get(pos) : null
    const improvement = held === null ? row.gap : row.gap - held
    if (improvement > 0) gaps.push({ pos, held, best: row, improvement })
  }
  gaps.sort((a, b) => b.improvement - a.improvement)
  return gaps
}
