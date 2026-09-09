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
 * ---- Mount this behind a gesture, never on every screen ----
 *
 * `useLeagueSnapshot()`'s own comment states the constraint this hook has
 * to live inside: the league's IDENTITY is wanted by the header on every
 * screen, its ROSTERS by one screen, and folding them together "would put
 * four upstream calls behind every page load to draw a chip that needs a
 * name". A stake is a fact about rosters, so the same sentence applies.
 *
 * So `MoreSheet` calls this and `useRailItems()` deliberately does not.
 * The sheet is mounted by a tap (`{moreOpen && <MoreSheet/>}`) and
 * unmounted on close, which means the fetch is paid for by the reader who
 * asked to see the list — where the desktop rail is on screen at every
 * width above `lg`, on every route, always.
 *
 * That is also why screen 16 (the rooms grid) is not wired here yet. It
 * would be a snapshot on the lobby's own page load rather than behind a
 * gesture, which is an architecture question this hook does not settle.
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
