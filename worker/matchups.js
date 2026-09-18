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

/* ---- CBS, which publishes the same season in a different shape ----
 *
 * Measured against a real league on 16 September 2026, because the shape
 * was not knowable without a session and guessing it is what produced the
 * `roster_status` bug in this same adapter.
 *
 *   GET league/schedules?period=all
 *     body.schedule.periods[] = { id: "2", label: "Week 2",
 *                                 type: "Regular Season" | "Playoffs",
 *                                 start, end, matchups: [...] }
 *     matchup = { id, home_team: {...}, away_team: {...} }
 *     a PLAYED side  = { id, points: "89.3400", result: "W", record, name }
 *     an UNPLAYED side carries neither `points` nor `result` at all
 *
 * **`period=all` is what makes this one request rather than seventeen**,
 * and the bare call is not a smaller version of it -- it answers the
 * CURRENT period only. CLAUDE.md recorded this endpoint as "a full
 * schedule", which was true of the plural in `periods` and false of what it
 * returns: one entry. Corrected there.
 *
 * **Played is decided by `points` being present, never by its value.** An
 * unplayed side has no such key, and a real team really can score 0.0 in a
 * week everybody was on bye -- so `!points` would call a played week
 * unplayed. Same rule the pipeline applies to a 0 from any feed, reached
 * from the other side.
 *
 * **The winner is CBS's stated `result`, never a comparison of the
 * points.** Deriving it would call an unplayed 0-0 a draw, which is the
 * rule scheduleFromEspn() above already follows.
 *
 * **Points arrive as STRINGS** ("89.3400"). Converted once, here, at the
 * adapter boundary -- a string that reaches a room adds by concatenation
 * and produces a plausible-looking total nobody can reconcile.
 */

const CBS_PLAYOFF = "PLAYOFFS";

function cbsSide(t) {
  if (!t || t.id === undefined || t.id === null) return null;
  /* A vacant chair is a real slot in the fixture list and not a team. It
     keeps the row -- dropping it would renumber somebody's season, which is
     the bye rule one step along -- and carries no id to join on. */
  if (t.is_vacant) return null;
  /* `points` present means played. Its VALUE decides nothing: a genuine
     0.0 is a score, and an unplayed side has no key here at all. */
  const played = t.points !== undefined && t.points !== null && t.points !== "";
  const pts = played ? Number(t.points) : NaN;
  return {
    teamId: String(t.id),
    points: Number.isFinite(pts) ? pts : null,
    result: typeof t.result === "string" && t.result ? t.result.toUpperCase() : null,
  };
}

/* CBS states a result per SIDE ("W"/"L"/"T") and matchups.js speaks in
   winners ("HOME"/"AWAY"/"TIE"/"UNDECIDED"), so the two are translated
   rather than either being taught the other's vocabulary -- the same
   contract every adapter in this worker has with the rooms. */
function cbsWinner(home, away) {
  const h = home && home.result;
  const a = away && away.result;
  if (h === "T" || a === "T") return "TIE";
  if (h === "W" || a === "L") return "HOME";
  if (a === "W" || h === "L") return "AWAY";
  return UNPLAYED;
}

/* Takes the `schedule` object itself, matching scheduleFromEspn(), which
   is handed `league.schedule` rather than the whole league. */
export function scheduleFromCbs(sched) {
  const periods = sched && Array.isArray(sched.periods) ? sched.periods : null;
  if (!periods || !periods.length) return null;

  const rows = [];
  periods.forEach((p) => {
    if (!p) return;
    const week = Number(p.id);
    if (!week) return;
    const playoff = String(p.type || "").toUpperCase().includes(CBS_PLAYOFF);
    (Array.isArray(p.matchups) ? p.matchups : []).forEach((m) => {
      if (!m) return;
      const home = cbsSide(m.home_team);
      const away = cbsSide(m.away_team);
      if (!home && !away) return;
      rows.push({ week, home, away, winner: cbsWinner(home, away), playoff });
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

/* ---- Yahoo, which publishes the season once per TEAM ----
 *
 * `league/<key>/teams/matchups` answers every team's whole season in one
 * request, so every game arrives TWICE -- once from each side. yahoo.js
 * flattens Yahoo's nesting into plain rows and this deduplicates them on
 * (week, the two team ids), which is the one key both copies share.
 *
 * **Yahoo has no home and away.** A matchup lists two teams, in whichever
 * order the team being asked about puts them -- so the two copies of one
 * game disagree about who is first. The sides are ordered by team id here,
 * which makes `home` a stable label rather than a claim about a stadium,
 * and is the only way the dedupe can be exact.
 *
 * **The winner is Yahoo's `winner_team_key`, never the points**, for the
 * reason scheduleFromEspn() already gives: comparing points calls an
 * unplayed 0-0 week a draw. `is_tied` is Yahoo's own tie.
 *
 * **Played is the matchup's `status`.** `preevent` carries "0.00" on both
 * sides, which is not a score; `midevent` carries the points so far, the
 * same partial figure ESPN's `totalPoints` carries on a live Sunday; and
 * `postevent` is final, zero included -- a real team can score 0.00.
 *
 * NOT MEASURED against a real league yet -- see yahoo.js. */
export function scheduleFromYahoo(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;

  const games = new Map();
  for (const r of rows) {
    if (!r) continue;
    const week = Number(r.week);
    if (!week) continue;
    const sides = (Array.isArray(r.sides) ? r.sides : []).filter((s) => s && s.teamId);
    if (!sides.length) continue;
    sides.sort((a, b) => Number(a.teamId) - Number(b.teamId) || String(a.teamId).localeCompare(String(b.teamId)));
    const key = week + "|" + sides.map((s) => s.teamId).join("|");
    if (games.has(key)) continue;

    const status = String(r.status || "").toLowerCase();
    const scored = status === "postevent" || status === "midevent";
    const side = (s) => {
      if (!s) return null;
      const pts = Number(s.points);
      return {
        teamId: String(s.teamId),
        points: scored && s.points !== undefined && s.points !== null && s.points !== "" && Number.isFinite(pts) ? pts : null,
      };
    };
    const [a, b] = sides;
    let winner = UNPLAYED;
    if (status === "postevent") {
      if (r.isTied) winner = "TIE";
      else if (r.winnerTeamKey && a && a.teamKey === r.winnerTeamKey) winner = "HOME";
      else if (r.winnerTeamKey && b && b.teamKey === r.winnerTeamKey) winner = "AWAY";
    }

    games.set(key, {
      week,
      home: side(a),
      away: side(b || null),
      winner,
      // A consolation game is played after the regular season too, and a
      // screen stopping at the last real week has to stop before it.
      playoff: !!(r.isPlayoffs || r.isConsolation),
    });
  }

  const matchups = [...games.values()].sort((x, y) => x.week - y.week);
  if (!matchups.length) return null;
  return {
    weeks: matchups.reduce((n, r) => Math.max(n, r.week), 0),
    regularSeasonWeeks: matchups.reduce((n, r) => (r.playoff ? n : Math.max(n, r.week)), 0),
    matchups,
  };
}
