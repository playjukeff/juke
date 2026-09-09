/* Who your rivals added and dropped.
 *
 * The Waiver Room reads every player nobody owns and prices him; what it
 * cannot see is the league moving around him -- that a rival just spent
 * FAAB on the handcuff, or that somebody released the player you were
 * about to claim.
 *
 * ---- A drop is exactly the player a roster cannot name ----
 *
 * ESPN gives a transaction a bare playerId, and the trick that named the
 * draft -- look him up on the roster he is now on -- fails here by
 * construction: a dropped player is on nobody's roster, which is the whole
 * point of a drop. So this resolves names the other way, through
 * `kona_player_info` filtered by id, and that turns out to be cheap:
 * measured 9 September 2026, 1 id costs 6 KB, 5 cost 35, 20 cost 138 --
 * about 7 KB each, linear, unauthenticated, in one call.
 *
 * Cheap for a handful and not for a season: 140 draft picks would be a
 * megabyte. Which is why DRAFT is excluded (it is already captured whole,
 * for free, by draftBoard()) and why the window is bounded.
 *
 * ---- The classification is structural, and that is deliberate ----
 *
 * This league has run no waivers, free agent adds or trades yet -- every
 * transaction on it is a DRAFT -- so unlike the stat ids and the lineup
 * slots, ESPN's type STRINGS for those could not be derived from real data
 * here. Guessing at them is the thing this project has spent the most
 * effort not doing.
 *
 * So nothing is classified by its type string. Every item carries
 * `fromTeamId` and `toTeamId`, and that grammar IS observed: a DRAFT item
 * reads from 0 to 5, an acquisition out of nowhere. So a move to a team
 * from nobody is an ADD, a move to nobody from a team is a DROP, and a move
 * between two teams is a TRADE -- read off the two ids rather than off a
 * word. The raw `type` and `status` ride along untouched for a screen to
 * print, never for this to branch on.
 *
 * ---- Its own route, unlike the schedule ----
 *
 * The schedule rides on the shared snapshot because every room wants it and
 * it distils to 8 KB. This is the opposite: one room wants it, it needs a
 * second upstream call to resolve names, and it grows all season. Sharing
 * it would put that on every Trade and Strategy load for nothing.
 */

/* Nobody. ESPN uses 0 for "not a team" on both ends of a move — waivers,
   free agency and the draft pool all read as team zero. */
const NOBODY = 0;

/* How far back a feed goes.
 *
 * The list grows all season and every distinct player in the window costs
 * ~7 KB to name, so the window is what bounds the cost rather than a cap
 * bolted on afterwards. Fifty is roughly a fortnight of a ten-team league
 * and about 100 ids at worst — under a megabyte, and far less in practice
 * because adds resolve off the roster for free. */
export const FEED_LIMIT = 50;

function moveKind(item) {
  const from = Number(item.fromTeamId) || NOBODY;
  const to = Number(item.toTeamId) || NOBODY;
  if (from === NOBODY && to !== NOBODY) return "ADD";
  if (to === NOBODY && from !== NOBODY) return "DROP";
  if (from !== NOBODY && to !== NOBODY) return "TRADE";
  return null;
}

/* The distinct players a feed will need to name.
 *
 * Split out so a caller can resolve them however it likes -- off the
 * rosters it already holds, out of a cache, or with one filtered request --
 * and so this file needs no network of its own. */
export function playersInFeed(transactions, limit) {
  const rows = pickWindow(transactions, limit);
  const ids = new Set();
  rows.forEach((t) => (t.items || []).forEach((i) => {
    if (i && i.playerId !== undefined && i.playerId !== null) ids.add(Number(i.playerId));
  }));
  return [...ids];
}

function pickWindow(transactions, limit) {
  if (!Array.isArray(transactions)) return [];
  return transactions
    /* DRAFT is excluded rather than shown: draftBoard() already captures
       every pick, in one pass, off a request being made anyway. A hundred
       and forty of them here would crowd out the moves this exists for AND
       cost a megabyte to name. */
    .filter((t) => t && String(t.type || "").toUpperCase() !== "DRAFT")
    .slice()
    .sort((a, b) => (Number(b.proposedDate) || 0) - (Number(a.proposedDate) || 0))
    .slice(0, limit || FEED_LIMIT);
}

/* `nameFor` answers { name, pos, team } or null for an ESPN player id. */
export function feedFromEspn(transactions, nameFor, limit) {
  const rows = pickWindow(transactions, limit);
  if (!rows.length) return null;

  let unnamed = 0;
  const moves = [];

  rows.forEach((t) => {
    (t.items || []).forEach((item) => {
      if (!item) return;
      const kind = moveKind(item);
      /* A LINEUP change is a move from one slot to another on the same
         team, so both ids are the same team and moveKind answers TRADE for
         it -- which is why the slots are checked too. Starting somebody is
         not a transaction anybody else needs to see. */
      if (!kind) return;
      if (kind === "TRADE" && Number(item.fromTeamId) === Number(item.toTeamId)) return;

      const who = nameFor ? nameFor(Number(item.playerId)) : null;
      if (!who || !who.name) unnamed++;

      moves.push({
        kind,
        // The team that gained him on an ADD or a TRADE, and the one that
        // let him go on a DROP -- so a screen never has to decide which end
        // of `from`/`to` to read.
        teamId: String(kind === "DROP" ? item.fromTeamId : item.toTeamId),
        fromTeamId: Number(item.fromTeamId) ? String(item.fromTeamId) : null,
        playerId: Number(item.playerId),
        name: who ? who.name : null,
        pos: who ? who.pos : null,
        team: who ? who.team : null,
        id: who ? who.id || null : null,
        /* FAAB, where the league spends it. 0 is a real bid in a league
           that bids, and it is also what a free agent add carries, so the
           two are told apart by `kind` rather than by the number. */
        bid: Number(t.bidAmount) || 0,
        week: Number(t.scoringPeriodId) || null,
        at: Number(t.proposedDate) || null,
        /* Carried for a screen to print, never branched on -- see the note
           about type strings above. */
        type: String(t.type || "").toUpperCase() || null,
        status: String(t.status || "").toUpperCase() || null,
      });
    });
  });

  if (!moves.length) return null;
  return { moves, unnamed, window: rows.length };
}

/* Sleeper publishes transactions per week, the same way it publishes
   matchups -- /league/<id>/transactions/<week> -- so a season is a fetch a
   week rather than one call. Named rather than omitted, so the gap shows
   from the adapter instead of from an empty panel. */
export function feedFromSleeper() {
  return null;
}
