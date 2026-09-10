/* A player's status as his league's own platform reports it, right now.

   ---- Why the rooms stopped reading the board's `inj` ----

   Every injury the in-season rooms showed came from `players.js`, which the
   nightly pipeline writes at 11:00 UTC. So a player ruled out at 11:30 ET on
   a Sunday -- which is when NFL inactives are actually announced -- was not
   ruled out in Juke until Monday morning, and a player hurt on a Thursday
   night stayed "questionable" in the Strategy Room through the weekend's
   decisions. The owner asked for this to reflect real-time information at
   all times, and the board cannot: it is a daily file on purpose.

   Both platforms publish the answer on requests the snapshot already makes
   or can make for almost nothing -- ESPN on every roster entry
   (`injuryStatus`, and `lineupLocked`), Sleeper on every row of the weekly
   projection file it now reads for the league's own projection. So the
   snapshot carries it, and the rooms prefer it.

   ---- The league's platform, not a single source of truth ----

   They disagree. Measured on 10 September 2026, the morning after A.J.
   Brown left the opener in the third quarter: ESPN had him QUESTIONABLE,
   Sleeper had him Out. Neither is wrong about its own league -- a manager
   reads the designation their own app prints -- so an ESPN league shows
   ESPN's and a Sleeper league Sleeper's, the same rule the projection
   follows.

   ---- One vocabulary, the pipeline's ----

   The codes are the ones `build_players.py` already writes into `inj`, so
   everything that reads a board player's injury -- injurySeverity(),
   benched(), the Injury Watch -- reads a live one unchanged. The table is
   written in two languages and must not drift; worker/test-status.mjs reads
   INJURY_CODES out of build_players.py and asserts every entry here agrees,
   the way test_engine.py already does for normalise(). The ESPN spellings
   below are extra, because the pipeline never sees ESPN. */

export const INJURY_CODES = {
  // Mirrors build_players.py's INJURY_CODES exactly.
  "questionable": "Q", "doubtful": "D", "out": "O",
  "ir": "IR", "injured reserve": "IR",
  "pup": "PUP", "physically unable to perform": "PUP",
  "nfi": "NFI", "non football injury": "NFI",
  "sus": "SUS", "suspended": "SUS", "dnr": "DNR", "cov": "COV",
  // ESPN's own spellings. DAY_TO_DAY is ESPN's softer designation and is
  // read as questionable -- the only fact a lineup turns on is whether he
  // will be out there, and "day to day" does not say he will not be.
  "injury reserve": "IR", "injury_reserve": "IR",
  "suspension": "SUS", "day to day": "Q", "day_to_day": "Q", "probable": "Q",
};

/* ACTIVE and NORMAL are healthy, which is a real answer rather than a
   missing one -- the room must be able to tell "the platform says he is
   fine" from "the platform said nothing", or a player cleared on Sunday
   morning keeps last night's designation from the board. So a healthy
   player answers "" (the pipeline's own spelling of healthy) and only
   something unreadable answers null. */
const HEALTHY = new Set(["active", "normal", "healthy"]);

export function injuryCode(raw) {
  if (raw === null || raw === undefined) return null;
  const key = String(raw).trim().toLowerCase();
  if (!key) return "";
  if (HEALTHY.has(key)) return "";
  if (Object.prototype.hasOwnProperty.call(INJURY_CODES, key)) return INJURY_CODES[key];
  const spaced = key.replace(/_/g, " ");
  if (Object.prototype.hasOwnProperty.call(INJURY_CODES, spaced)) return INJURY_CODES[spaced];
  return null;
}
