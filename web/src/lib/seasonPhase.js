import { draftPhase } from './countdown.js'

/* Which of DRAFT / IN-SEASON a connected league is in, for My League's own
   week strip.

   This is not a new source of truth — draftPhase() still owns the draft's
   own countdown, and `week` is already on every snapshot LeagueRoomLive
   already reads. It only names the split the strip needs.

   ---- Why there is no PLAYOFFS or REVIEW here, and the handoff draws both ----

   Neither adapter tells us how many weeks a league's regular season runs,
   or when its championship is — `playoffTeams` says how many teams qualify,
   not which week that starts. Guessing (week 15, say) would be right for
   some leagues and confidently wrong for the rest, which is worse than not
   drawing it. So this returns 'in-season' for the whole post-draft period
   until that data exists, rather than a four-way split part of which would
   be invented — the same "absent, not empty" call MyLeagueScreen's own
   missing MoveCard section makes, one level down. */
export function seasonPhase(snapshot) {
  if (!snapshot) return 'unknown'
  if (snapshot.draftStatus === 'drafting') return 'draft'
  if (!snapshot.week) return 'draft'
  return 'in-season'
}
