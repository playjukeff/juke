import { useMemo } from 'react'
import { useEngine, useJukeTick } from './useJukeEngine.js'
import { useLeague, useLeagueSnapshot } from './useLeague.js'
import { roomStakes } from '../components/shell/roomStakes.js'

/* What each room has at stake, assembled for a caller outside any room.
 *
 * `roomStakes.js` beside it is the arithmetic and imports nothing; this is
 * the React half — the same split `leagueStore.js`/`useLeague.js` already
 * has, and for the same reason: everything worth testing runs in CI with
 * no npm install, and only the subscription needs React.
 *
 * ---- This used to say "mount it behind a gesture, never on every screen" ----
 *
 * The constraint was real and it was about a per-component fetch.
 * `useLeagueSnapshot()` held its answer in component state, so the cost of
 * a stake was one upstream call per mounted caller — which is why that
 * hook's own comment refused to fold rosters in with the league's identity
 * ("four upstream calls behind every page load to draw a chip that needs a
 * name"), and why `MoreSheet` called this while `useRailItems()` did not:
 * the sheet is mounted by a tap and the desktop rail is on screen at every
 * width above `lg`, on every route, always.
 *
 * **`web/src/lib/snapshotStore.js` is that constraint removed rather than
 * broken.** The answer is held once, keyed on the league, fresh for the two
 * minutes the worker's own cache is good for — so N callers cost one
 * request, not N. Screen 16 (the rooms grid) is wired now for exactly that
 * reason: CLAUDE.md recorded it as blocked on WHERE THE SNAPSHOT IS
 * FETCHED, and it was.
 *
 * `useRailItems()` still does not carry a stake, and the reason has changed
 * from cost to design: a nav rail is a list of destinations, and putting a
 * value on two of its seven rows is a different question from the one the
 * guide asks. It is no longer expensive, merely undecided.
 */
export function useRoomStakes() {
  const { league } = useLeague()
  const { snapshot } = useLeagueSnapshot(
    league ? league.leagueId : null,
    league ? league.provider : null,
  )

  const engine = useEngine()
  /* The board is empty until players.js lands, and every figure below is
     nothing without it. useJukeTick TAKES the engine and re-renders on
     `juke:header` — calling it bare attaches no listener at all, which is
     the mistake WaiverRoomLive's own comment records paying for. */
  useJukeTick(engine)

  const board = engine && engine.dataReady && engine.dataReady() ? engine.board() : []
  const gapOf = engine ? engine.replacementGap : null

  /* `board.length` in the deps and `board` deliberately not: the array is
     mutated in place and never replaced, so a dep on it never fires. What
     moves exactly once is its length, 0 to several hundred, the moment the
     deferred data lands. */
  const byId = useMemo(
    () => new Map(board.map((p) => [String(p.id), p])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length]
  )

  /* Under THIS LEAGUE's rules rather than the Draft Room's, which is what
     the Strategy Room already pays for: `projPerGame()` reads a `projPts`
     scored with `league.rules` — whatever the reader last set for a MOCK —
     so a real full-PPR league read through a half-PPR default understated
     a week by a measured 13.3 points. Falls back when the league sends no
     rules, since the previous number beats none. */
  const rules = snapshot && snapshot.rules ? snapshot.rules : null
  const weekPts = useMemo(() => {
    if (!engine) return null
    if (!rules) return engine.projPerGame
    return (player) => engine.projPerGameUnder(player, rules)
  }, [engine, rules])

  const week = snapshot ? snapshot.week : null

  return useMemo(
    () => roomStakes({ snapshot, league, byId, gapOf, weekPts, week }),
    [snapshot, league, byId, gapOf, weekPts, week]
  )
}
