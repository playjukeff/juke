/* Who plays whom, and what it finished.
 *
 * The third of the league's own shapes, after its scoring and its lineup,
 * and the one three rooms were explicitly waiting on: RoomPage.jsx's own
 * comment records the Strategy Room's KPI bar as wanting "the week's
 * matchup margin, which needs the matchups fetch three of its tabs are also
 * waiting on".
 *
 * ---- It rides on the shared call, and that was measured ----
 *
 * ESPN stacks `view=` parameters on one request, so this needs no second
 * fetch and no second cache. Measured 9 September 2026 against a real
 * league: the snapshot's existing call is already 1163 KB upstream (mRoster
 * carries whole player objects), and adding mMatchupScore takes it to 1509
 * -- +30% on a request cached for 120s -- while the distilled schedule this
 * returns is about 1.4 KB on the wire.
 *
 * A separate route was the alternative and buys nothing here: it would
 * trade 346 KB of upstream, once every two minutes, for a second round trip
 * on the client and a second thing to cache and invalidate.
 *
 * ---- The whole season is published before a ball is thrown ----
 *
 * 70 matchups over 14 weeks, in the preseason, which is what makes this
 * worth having early: a reader can see week one's opponent before the
 * season starts.
 *
 * ---- ESPN's team projection and win probability are not carried HERE ----
 *
 * Both are on the payload -- `totalProjectedPoints` and `winProbability`.
 * This used to say they were dropped as "somebody else's opinion of a
 * question Juke answers itself", and that reasoning was overruled on 10
 * September 2026: a connected league has to show the projection its
 * platform shows, and Juke's own came out 14.5 points short of ESPN's on a
 * real week. See weekProjection() in espn.js.
 *
 * So ESPN's projection IS used now -- per PLAYER, off the roster entries,
 * where the rooms can sum it into exactly this team total and also price a
 * swap with it. Carrying the team total here as well would be the same
 * number twice with nothing to keep them agreeing. The win probability is
 * still Juke's own, computed from ESPN's projected means. What this file
 * keeps is what actually happened: points scored, and who won.
 *
 * A points total of 0 for a week nobody has played is not a score, so an
 * unplayed matchup reports null rather than a zero somebody could average.
 */

const UNPLAYED = "UNDECIDED";

function side(s) {
  if (!s) return null;
  const id = s.teamId;
  if (id === undefined || id === null) return null;
  const pts = Number(s.totalPoints);
  return {
    // String, matching the `ownerId` every other team-shaped field uses, so
    // a caller joins on one type rather than remembering which.
    teamId: String(id),
    // A week nobody has played scores 0, and 0 is not a result. Same rule
    // the pipeline applies to a 0 from any feed.
    points: Number.isFinite(pts) && pts > 0 ? pts : null,
  };
}

export function scheduleFromEspn(schedule) {
  if (!Array.isArray(schedule) || !schedule.length) return null;

  const rows = [];
  schedule.forEach((m) => {
    if (!m) return;
    const home = side(m.home);
    const away = side(m.away);
    // A bye — some league sizes produce one — has a home and no away. It is
    // a real week for that team and is kept, with the opponent as null.
    if (!home && !away) return;
    const week = Number(m.matchupPeriodId);
    if (!week) return;

    rows.push({
      week,
      home,
      away,
      /* ESPN says UNDECIDED before a result. Passed through rather than
         re-derived from the points, which would call a 0-0 unplayed week a
         draw. */
      winner: String(m.winner || UNPLAYED).toUpperCase(),
      // Regular season or not, so a screen can stop at the last real week.
      playoff: !!(m.playoffTierType && String(m.playoffTierType).toUpperCase() !== "NONE"),
    });
  });

  if (!rows.length) return null;
  rows.sort((a, b) => a.week - b.week);

  return {
    weeks: rows.reduce((n, r) => Math.max(n, r.week), 0),
    regularSeasonWeeks: rows.reduce((n, r) => (r.playoff ? n : Math.max(n, r.week)), 0),
    matchups: rows,
  };
}

/* Sleeper publishes no season schedule at all.
 *
 * Its matchups endpoint answers ONE week at a time -- /league/<id>/matchups/
 * <week> -- as a list of roster ids sharing a `matchup_id`, so a full season
 * is fourteen calls rather than a view on the one already being made. That
 * is a different feature with a different cost, not this one with a second
 * adapter, and pretending otherwise by fetching the current week alone would
 * give Sleeper leagues a schedule that cannot answer "who do I play next".
 *
 * So it answers null and every screen treats an absent schedule as a league
 * that has not told us -- which is what a Sleeper league genuinely is here
 * until that fetch is built. Named rather than omitted so the gap is visible
 * from the adapter rather than from an empty panel. */
export function scheduleFromSleeper() {
  return null;
}
