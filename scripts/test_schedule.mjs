/* A connected league's schedule, from the reader's side of it.
 *
 * `web/src/lib/schedule.js` imports nothing, so this runs with no npm
 * install — like every other node step in tests.yml.
 *
 * ---- This file had no suite at all, and screen 04 already ships on it ----
 *
 * `myGames()` and `gameInWeek()` have been drawing My League's past-week
 * result since the schedule landed, and nothing offline covered either. That
 * is the gap `seasonSummary()` walked into rather than one it created, so it
 * is closed here in the same pass: the two existing functions are asserted
 * first and the new one after.
 *
 * The cases that matter are all the ones where a week is NOT a played game —
 * a bye, an unplayed week, a league with no schedule at all. Every one of
 * them reads as a plausible zero if it is not refused, and a season of zeroes
 * averages into a points-per-week figure a reader would take literally.
 */

import { myGames, gameInWeek, seasonSummary } from "../web/src/lib/schedule.js";

const fails = [];
const note = [];
const check = (name, ok, detail) => {
  if (ok) note.push("ok  " + name);
  else fails.push(name + (detail ? "\n    " + detail : ""));
};
const is = (name, got, want) =>
  check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const ME = "me";

/* Four teams, so a week has a real median rather than one pair's average.
   Scores are chosen so the reader loses twice ABOVE the field's median and
   once below it — the split seasonSummary() exists to make, and a fixture
   where every loss fell the same way could not tell the two apart. */
const side = (id, points) => ({ teamId: id, points });
const SCHEDULE = {
  weeks: 4,
  regularSeasonWeeks: 4,
  matchups: [
    // W1: me 120 beats 90. Field: 120, 90, 80, 70 -> median 85.
    { week: 1, playoff: false, winner: "HOME", home: side(ME, 120), away: side("a", 90) },
    { week: 1, playoff: false, winner: "HOME", home: side("b", 80), away: side("c", 70) },

    // W2: me 110 LOSES to 115, and the field's median is 100 — above it.
    { week: 2, playoff: false, winner: "AWAY", home: side(ME, 110), away: side("a", 115) },
    { week: 2, playoff: false, winner: "HOME", home: side("b", 100), away: side("c", 60) },

    // W3: me 70 LOSES to 130, and the median is 95 — below it.
    { week: 3, playoff: false, winner: "AWAY", home: side(ME, 70), away: side("a", 130) },
    { week: 3, playoff: false, winner: "HOME", home: side("b", 100), away: side("c", 90) },

    // W4: me 105 LOSES to 106 by a point, median 100 — above it, and the
    // narrowest of the three.
    { week: 4, playoff: false, winner: "AWAY", home: side(ME, 105), away: side("a", 106) },
    { week: 4, playoff: false, winner: "HOME", home: side("b", 100), away: side("c", 40) },
  ],
};

// ---- myGames(): the projection ---------------------------------------------
{
  const g = myGames(SCHEDULE, ME);
  is("every week the reader plays comes back", g.length, 4);
  is("in week order", g.map((x) => x.week).join(","), "1,2,3,4");
  is("the opponent is the other side", g[0].opponentId, "a");
  is("the reader's own points are theirs", g[0].points, 120);
  is("and the opponent's are the opponent's", g[0].opponentPoints, 90);
  is("a home win reads W", g[0].result, "W");
  is("a home loss reads L", g[1].result, "L");
}

/* The result is read off the stated winner rather than by comparing points.
   An unplayed week is 0-0, and comparing would call it a draw. */
{
  const UNPLAYED = {
    matchups: [{ week: 1, winner: "UNDECIDED", home: side(ME, 0), away: side("a", 0) }],
  };
  is("an unplayed week has no result", myGames(UNPLAYED, ME)[0].result, null);
  is("and is never a tie", myGames(UNPLAYED, ME)[0].result === "T", false);
}

/* A bye is a week, not a missing one. Dropping the row would silently
   renumber somebody's season. */
{
  const BYE = {
    matchups: [{ week: 5, winner: "UNDECIDED", home: side(ME, 0), away: null }],
  };
  const g = myGames(BYE, ME);
  is("a bye is still a week", g.length, 1);
  is("with nobody on the other side", g[0].opponentId, null);
}

// ---- the refusals ----------------------------------------------------------
is("no schedule answers null", myGames(null, ME), null);
is("no owner answers null", myGames(SCHEDULE, null), null);
is("a schedule with no matchups answers null", myGames({ matchups: [] }, ME), null);
is("a team that plays nobody answers null", myGames(SCHEDULE, "nobody"), null);

// ---- gameInWeek() ----------------------------------------------------------
is("a named week comes back", gameInWeek(SCHEDULE, ME, 3).week, 3);
is("a week nobody plays is null", gameInWeek(SCHEDULE, ME, 9), null);
/* No week at all answers the FIRST game rather than nothing: the snapshot
   carries no week before the season starts, and "who do I open against" is
   the question a preseason reader actually has. */
is("no week answers the opener", gameInWeek(SCHEDULE, ME, null).week, 1);
is("and week 0 is the same case", gameInWeek(SCHEDULE, ME, 0).week, 1);

// ---- seasonSummary(): the record -------------------------------------------
{
  const s = seasonSummary(SCHEDULE, ME);
  is("every played week counts", s.played, 4);
  is("the wins", s.won, 1);
  is("the losses", s.lost, 3);
  is("no ties here", s.tied, 0);
  is("points for add up", s.pointsFor, 405); // 120 + 110 + 70 + 105
  is("points against too", s.pointsAgainst, 441); // 90 + 115 + 130 + 106
}

/* The split this function exists for, and the reason it needs no threshold.
   Two losses came in weeks the reader still beat the league's median; one
   did not. A "close loss" rule would have needed a margin somebody chose. */
{
  const s = seasonSummary(SCHEDULE, ME);
  is("losses above the week's median are the draw", s.unlucky, 2);
  is("and the ones below it are not", s.outplayed, 1);
  check(
    "the two account for every loss here",
    s.unlucky + s.outplayed === s.lost,
    `${s.unlucky} + ${s.outplayed} against ${s.lost}`
  );
}

/* The narrowest loss is a fact rather than a band, so it is reported as the
   week and the margin and left for a screen to phrase. */
{
  const s = seasonSummary(SCHEDULE, ME);
  is("the narrowest loss is found", s.narrowest.week, 4);
  check("and its margin", Math.abs(s.narrowest.margin - 1) < 1e-9, `got ${s.narrowest.margin}`);
}

/* A tie is neither a win nor a loss and cannot be an unlucky one. Folding it
   either way would put a thumb on a record that already states it. */
{
  const TIED = {
    matchups: [
      { week: 1, winner: "TIE", home: side(ME, 100), away: side("a", 100) },
      { week: 1, winner: "HOME", home: side("b", 90), away: side("c", 80) },
    ],
  };
  const s = seasonSummary(TIED, ME);
  is("a tie is counted as a tie", s.tied, 1);
  is("and not as a loss", s.lost, 0);
  is("so it is in neither half of the split", s.unlucky + s.outplayed, 0);
}

/* An unplayed season is no season. A schedule published before week one is
   the common case — ESPN publishes all fourteen weeks in the preseason — and
   reporting 0-0 with 0 points would be a record nobody has. */
{
  const FUTURE = {
    matchups: [
      { week: 1, winner: "UNDECIDED", home: side(ME, 0), away: side("a", 0) },
      { week: 2, winner: "UNDECIDED", home: side(ME, 0), away: side("a", 0) },
    ],
  };
  is("a season nobody has played answers null", seasonSummary(FUTURE, ME), null);
}

/* Half a season played is a real half-season, and the unplayed weeks are
   simply not in it. */
{
  const HALF = {
    matchups: [
      { week: 1, winner: "HOME", home: side(ME, 120), away: side("a", 90) },
      { week: 1, winner: "HOME", home: side("b", 80), away: side("c", 70) },
      { week: 2, winner: "UNDECIDED", home: side(ME, 0), away: side("a", 0) },
    ],
  };
  const s = seasonSummary(HALF, ME);
  is("only the played weeks count", s.played, 1);
  is("and the unplayed one adds no points", s.pointsFor, 120);
}

is("no schedule has no season", seasonSummary(null, ME), null);
is("nor does a team nobody plays", seasonSummary(SCHEDULE, "nobody"), null);

/* The boundary, which the first version of this suite did not cover.
 *
 * Found by mutating `>` to `>=` and watching every assertion still pass — so
 * a loss landing exactly ON the median was a case nobody had decided, and
 * either answer would have shipped. It is `outplayed`: matching the field is
 * not beating it, and `unlucky` is the claim that a better week still lost.
 *
 * An even-sized league makes this trivially reachable rather than exotic —
 * the median is the average of the two middle scores, so any week where two
 * teams tie in the middle puts somebody exactly on it. */
{
  const ON_MEDIAN = {
    matchups: [
      // Field 90, 100, 100, 110 -> median 100. The reader scores exactly it.
      { week: 1, winner: "AWAY", home: side(ME, 100), away: side("a", 110) },
      { week: 1, winner: "HOME", home: side("b", 100), away: side("c", 90) },
    ],
  };
  const s = seasonSummary(ON_MEDIAN, ME);
  is("a loss exactly on the median is not the draw", s.unlucky, 0);
  is("it is the other half", s.outplayed, 1);
}

/* A league of one matchup a week still has a median — its own two scores —
   which is what makes this work at any league size rather than only where
   there are enough teams for a "field". */
{
  const TWO = {
    matchups: [{ week: 1, winner: "AWAY", home: side(ME, 99), away: side("a", 101) }],
  };
  const s = seasonSummary(TWO, ME);
  is("a two-team week still has a median", s.lost, 1);
  // Median of [99, 101] is 100, and 99 is below it.
  is("and the reader was under it", s.outplayed, 1);
  is("so it was not the draw", s.unlucky, 0);
}

console.log(note.join("\n"));
if (fails.length) {
  console.error(`\nFAIL ${fails.length}\n  x ` + fails.join("\n  x "));
  process.exit(1);
}
console.log(`\nOK — ${note.length} checks on the schedule`);
