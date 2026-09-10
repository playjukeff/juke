/* The post-draft report, as data — two sources and one shape.

   Exactly DraftInsightsDashboard.jsx's split, and for its reason:

   - FROZEN: engine.historyReport(id) — the whole report computed by
     freezeReport() at the moment the draft finished, against the board it
     was played on. A reopened report must never be regraded against
     tonight's projections, or the locker's recorded grade and the report
     built from the identical picks disagree (a D+ in the table reading
     back as an A-). Full detail exists only for the drafter's own seat.
   - LIVE: the draft that just finished is still the one in memory, so the
     report reads engine.draftAnalysis() and friends directly, and any seat
     in the room can be opened.

   Nothing here grades anything; it arranges what the engine already
   decided. */

import { ordinal } from './cockpitData.js'

// Below ten points of lineup value a "miss" is inside the projection's own
// error (MAE 6.8) — the same floor the production report applies.
export const MISS_FLOOR = 10

export function readLiveReport(engine, viewSlot) {
  const analysis = engine.draftAnalysis()
  const mine = analysis && analysis[viewSlot]
  if (!mine) return null
  const league = engine.league()
  const mySlot = engine.mySlot()
  const winPcts = engine.winPctForRoom ? engine.winPctForRoom(analysis) : null
  const weights = engine.weights ? engine.weights() : engine.gradeWeights()

  // mine.lineup is bestLineup()'s own seating — the lineup starter strength
  // was scored on — never seatedLineup(), which fills the FLEX in draft
  // order and would credit a different player than the grade counted.
  const vorpRows = (mine.lineup || []).map((seat) => ({
    slotLabel: seat.slot,
    name: seat.player ? seat.player.name : null,
    pos: seat.player ? seat.player.pos : null,
    gap: seat.player ? engine.replacementGap(seat.player) : null,
  }))

  // K and D/ST sit out of the timeline for the reason the grade's value
  // component leaves them out: their ADP comes from longer drafts, so every
  // one reads as a reach.
  const forced = engine.forcedLate() || {}
  const timeline = (engine.picks() || [])
    .filter((p) => p.slot === viewSlot && !forced[p.player.pos])
    .sort((a, b) => a.overall - b.overall)
    .map((p) => ({ round: p.round, overall: p.overall, pos: p.player.pos, name: engine.shortName(p.player), gap: p.overall - p.player.overall }))

  const raw = engine.oneThatGotAway ? engine.oneThatGotAway(viewSlot) : null
  const missed = raw && raw.delta >= MISS_FLOOR
    ? {
        theirsName: raw.theirs.player.name,
        theirsTeamName: engine.teamLabel(raw.theirs.slot),
        theirsOverall: raw.theirs.overall,
        mineName: raw.mine.player.name,
        mineRound: raw.mine.round,
        mineOverall: raw.mine.overall,
        delta: raw.delta,
      }
    : null

  return {
    mode: 'live',
    mySlot,
    viewSlot,
    isMe: viewSlot === mySlot,
    teamName: engine.teamLabel(viewSlot),
    teams: league.teams,
    leagueText: engine.settingsText(league),
    dateText: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
    grade: mine.grade,
    rank: mine.rank,
    scored: mine,
    weights,
    value: mine.value,
    winPct: winPcts ? winPcts[viewSlot] : null,
    bargain: mine.bargain ? { name: mine.bargain.pick.player.name, pos: mine.bargain.pick.player.pos, gap: mine.bargain.gap } : null,
    reach: mine.reach ? { name: mine.reach.pick.player.name, pos: mine.reach.pick.player.pos, gap: mine.reach.gap } : null,
    vorpRows,
    timeline,
    missed,
    standings: analysis.slice().sort((a, b) => a.rank - b.rank).map((t) => ({
      slot: t.slot, rank: t.rank, grade: t.grade, teamName: engine.teamLabel(t.slot), isMine: t.slot === mySlot,
    })),
  }
}

export function readFrozenReport(frozen, summary) {
  const r = frozen.report
  const myRow = r.standings.find((t) => t.slot === r.mySlot)
  if (!myRow) return null
  const away = r.mine.oneThatGotAway
  return {
    mode: 'frozen',
    mySlot: r.mySlot,
    viewSlot: r.mySlot,
    isMe: true,
    teamName: myRow.teamName || 'Your Team',
    teams: summary ? summary.teams : r.standings.length,
    leagueText: summary ? summary.leagueType : `${r.standings.length} teams`,
    // The day the draft finished, never the day it is being read.
    dateText: new Date(frozen.completedAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
    grade: myRow.grade,
    rank: myRow.rank,
    scored: myRow,
    weights: r.weights,
    value: r.mine.value,
    winPct: myRow.winPct,
    bargain: r.mine.bargain,
    reach: r.mine.reach,
    vorpRows: r.mine.lineup.map((s) => ({ slotLabel: s.slotLabel, name: s.name, pos: s.pos, gap: s.vorpGap })),
    timeline: r.mine.timeline,
    missed: away && away.delta >= MISS_FLOOR ? away : null,
    standings: r.standings.slice().sort((a, b) => a.rank - b.rank).map((t) => ({
      slot: t.slot, rank: t.rank, grade: t.grade, teamName: t.teamName, isMine: t.slot === r.mySlot,
    })),
  }
}

export function missedSentence(rep) {
  const subject = rep.isMe ? 'you' : rep.teamName
  const poss = rep.isMe ? 'your' : 'their'
  const m = rep.missed
  if (!m) {
    return `Nothing got away. At every turn, nobody taken before ${poss} next pick would have improved ${poss} starting lineup by more than the projection can honestly measure.`
  }
  const gap = m.theirsOverall - m.mineOverall
  return `${m.theirsName} was still on the board when ${subject} took ${m.mineName} in round ${m.mineRound} — ${m.theirsTeamName} got him ${gap === 1 ? 'with the very next pick' : `${gap} picks later`}, and swapping him in would have made ${poss} starting lineup this much stronger.`
}

/* Everything the share card draws, from the same values the screen does —
   the card can never say something the screen does not. The shape is
   shareCard.js's, unchanged. No `total`: the card stopped drawing a score
   out of 100 under the letter, and the field left behind would invite it
   back. */
export function shareDataOf(rep) {
  return {
    teamName: rep.teamName,
    leagueText: rep.leagueText,
    dateText: rep.dateText,
    grade: rep.grade,
    rankText: ordinal(rep.rank),
    teams: rep.teams,
    components: rep.scored,
    bestValue: rep.bargain ? `${rep.bargain.name}${rep.bargain.gap > 0 ? ` · ${rep.bargain.gap} picks late` : ''}` : null,
    biggestReach: rep.reach ? `${rep.reach.name} · ${Math.abs(rep.reach.gap)} picks early` : null,
    winPct: rep.winPct,
    oneThatGotAwayText: missedSentence(rep),
    oneThatGotAwayDelta: rep.missed ? rep.missed.delta : null,
    vorpRows: rep.vorpRows,
    timeline: rep.timeline,
    standings: rep.standings.map((t) => ({ rank: t.rank, grade: t.grade, teamName: t.teamName, isMine: t.isMine })),
  }
}
