/* Where in its season a connected league is, for My League's own week strip
   and bar.

   This is not a new source of truth — draftPhase() still owns the draft's
   own countdown, `week` is already on every snapshot LeagueRoomLive reads,
   and the schedule below is the one matchups.js publishes. It only names the
   splits the strip needs.

   ---- PLAYOFFS and COMPLETE exist now, and this file used to refuse them ----

   Corrected in place 9 September 2026. What stood here was:

     "Neither adapter tells us how many weeks a league's regular season runs,
      or when its championship is — `playoffTeams` says how many teams
      qualify, not which week that starts. Guessing (week 15, say) would be
      right for some leagues and confidently wrong for the rest."

   Every word of that was true of the data at the time and none of it is now.
   `scheduleFromEspn()` publishes `weeks` and `regularSeasonWeeks` off ESPN's
   own `playoffTierType`, so the boundary is READ rather than guessed — which
   was the whole objection. The refusal was right until the day the schedule
   landed, and a refusal nobody re-measures outlives its reason.

   ---- It still refuses where the data is still absent ----

   A Sleeper league has no schedule at all (matchups.js says why, at length),
   so `snapshot.schedule` is null and this answers 'in-season' for the entire
   post-draft period exactly as it always did. The split is per league rather
   than per product: the leagues that can be told apart are, and the ones that
   cannot are not guessed at.

   So a caller may not assume the four phases are exhaustive of any league.
   `underWay()` below is the question almost every caller actually has. */

export function seasonPhase(snapshot) {
  if (!snapshot) return 'unknown'
  if (snapshot.draftStatus === 'drafting') return 'draft'
  if (!snapshot.week) return 'draft'

  /* Read, never derived from a team's own games: the boundary is a property
     of the league's schedule, and reading it off one roster's fixtures would
     answer differently for a team with a bye in the last regular week. */
  const s = snapshot.schedule
  if (s && s.weeks) {
    // Past the last scheduled week at all. Checked before the playoff test
    // because a finished season is also past the regular one, and "over" is
    // the more specific of the two answers.
    if (snapshot.week > s.weeks) return 'complete'
    if (s.regularSeasonWeeks && snapshot.week > s.regularSeasonWeeks) return 'playoffs'
  }

  return 'in-season'
}

/* Is the season under way — anything after the draft, whatever else is true.
 *
 * **This exists because adding a phase silently breaks `=== 'in-season'`.**
 * MyLeagueScreen gated its whole week strip and past-week panel on that
 * exact comparison, so the first league to reach its own playoffs would have
 * had the strip disappear — no error, no log, just a screen that quietly
 * stopped offering the thing it is for, in the weeks a manager cares most.
 *
 * A positive test for ONE value of an enum is safe only while that value
 * cannot split. This one just did, which is the argument for asking the
 * question by name rather than by equality. */
export function underWay(phase) {
  return phase === 'in-season' || phase === 'playoffs' || phase === 'complete'
}
