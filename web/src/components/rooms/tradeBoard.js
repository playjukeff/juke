/* What a trade is worth, on both sides.
 *
 * Imports nothing, for the reason waiverBoard and strategyBoard do — and
 * this one has the highest stakes of the three: a trade is irreversible
 * once accepted, so the arithmetic that says "this is a win" has to be
 * checkable outside a browser nobody can log into.
 *
 * ---- Season value here, weekly value in Strategy, and that is the point ----
 *
 * The Strategy Room asks a WEEKLY question (start him this Sunday) and
 * uses per-game projections. A trade changes your roster for the rest of
 * the season, so it is priced in season points over replacement — which
 * is what ROOMS' own blurb for this room already promises: "both rosters
 * valued against replacement, with the rest-of-season swing for each side
 * shown before you send it."
 *
 * Using one unit in both rooms would be wrong in one of them. Naming which
 * is which here is what stops the next person unifying them.
 *
 * ---- What is NOT here ----
 *
 * Offers. Sleeper's pending trades live in /league/<id>/transactions/<week>
 * and nothing in this project fetches it, so there is no inbox to read.
 * The room lists the tabs it can fill.
 */

/* One player's trade value: points over replacement, across the season.
 *
 * `gapOf` is JukeEngine.replacementGap, passed in rather than imported.
 * It answers null for a kicker and a defense, and that refusal carries
 * through here unchanged — the app declines to rank those two anywhere,
 * so it will not price them in a trade either. Withholding has to be
 * complete, which is the same call the waiver board and the drop list
 * already make in both directions. */
export function valueOf(player, gapOf) {
  if (!player || !gapOf) return null
  const gap = gapOf(player)
  return typeof gap === 'number' ? gap : null
}

/* Every player one team holds, best first, with the unpriceable ones kept
 * and marked rather than dropped.
 *
 * This differs from the waiver board on purpose. There, an unranked player
 * is DROPPED, because a targets list is a recommendation and an unranked
 * player at the bottom of it still reads as "worse than the one above".
 * Here the list is a ROSTER — leaving somebody off it would be telling a
 * reader they do not own a player they do own, which is a worse error
 * than showing a dash. */
export function rosterValues(team, byId, gapOf) {
  if (!team || !byId) return []
  const rows = (team.players || [])
    .map(String)
    .map((id) => {
      const player = byId.get(id)
      return player ? { player, value: valueOf(player, gapOf) } : null
    })
    .filter(Boolean)
  rows.sort((a, b) => {
    // Priceable players first, then by value. A dash sorts to the bottom
    // rather than to the top, which is where a null would land untreated.
    if (a.value === null && b.value === null) return 0
    if (a.value === null) return 1
    if (b.value === null) return -1
    return b.value - a.value
  })
  return rows
}

/* What a roster is worth in total.
 *
 * Unpriceable players contribute nothing and are COUNTED, so a caller can
 * say "of 14 players, 12 are priced". Silently summing 12 and calling it a
 * roster's value would be the partial-total failure projectedTotal()
 * already refuses in the Strategy Room, and it matters more here: two
 * rosters with different numbers of kickers would not be comparable. */
export function rosterTotal(team, byId, gapOf) {
  const rows = rosterValues(team, byId, gapOf)
  let total = 0
  let priced = 0
  for (const row of rows) {
    if (row.value === null) continue
    total += row.value
    priced += 1
  }
  return { total, priced, held: rows.length }
}

/* The swing, for both sides.
 *
 * `give` and `get` are arrays of board players. Each side's swing is what
 * they receive minus what they send, so a fair trade is two numbers near
 * zero and a lopsided one is two numbers that are large and opposite.
 *
 * ---- An unpriceable player makes the whole trade unpriceable ----
 *
 * Not "worth zero". A kicker in a trade is a real asset the app has
 * declined to rank, so including him at 0 would report a swing that is
 * confidently wrong in a known direction — the side receiving him is
 * undervalued by exactly as much as the app refuses to say. `priced` is
 * false and the room says it cannot call this one, which is the same
 * refusal the Juke score makes rather than printing a number it does not
 * believe. */
export function tradeSwing(give, get, gapOf) {
  const out = { give: 0, get: 0, you: 0, them: 0, priced: true }
  for (const player of give || []) {
    const v = valueOf(player, gapOf)
    if (v === null) { out.priced = false; continue }
    out.give += v
  }
  for (const player of get || []) {
    const v = valueOf(player, gapOf)
    if (v === null) { out.priced = false; continue }
    out.get += v
  }
  out.you = out.get - out.give
  out.them = out.give - out.get
  return out
}

/* Every rostered player in the league, best first, with who owns him.
 *
 * The Value Board: what a trade conversation actually opens with. Free
 * agents are deliberately absent — this is a board of things that can be
 * traded FOR, and an unowned player is a waiver claim, which is another
 * room and one that already exists. */
export function valueBoard(snapshot, byId, gapOf, limit) {
  const teams = (snapshot && snapshot.teams) || []
  const rows = []
  for (const team of teams) {
    for (const id of team.players || []) {
      const player = byId ? byId.get(String(id)) : null
      if (!player) continue
      const value = valueOf(player, gapOf)
      if (value === null) continue
      rows.push({ player, value, team })
    }
  }
  rows.sort((a, b) => b.value - a.value)
  return limit ? rows.slice(0, limit) : rows
}
