import AppShell from './shell/AppShell.jsx'
import RoomHero from './shell/RoomHero.jsx'
import LockedPreview from './shell/LockedPreview.jsx'
import { useRooms } from '../hooks/useRooms.js'
import WaiverPreview from './rooms/WaiverPreview.jsx'
import TradePreview from './rooms/TradePreview.jsx'
import StrategyPreview from './rooms/StrategyPreview.jsx'
import { useLeague, useLeagueSnapshot } from '../hooks/useLeague.js'

/* #/rooms/<slug> — one page for every room, guest state.

   The three in-season rooms below are locked previews
   (design_handoff_v3_alive's d/e/h; League left this table when it
   graduated into its own screen, see the redirect further down); the
   Draft Room is open and redirects to the place it already lives; Prospect
   has none yet. What differs per room is the hero's accent and copy and
   which sample content sits under the blur, so that is all this table
   holds.

   A room with no preview built yet renders the hero and the unlock card
   with nothing behind it — honest, and visibly unfinished, rather than a
   404 for a link the lobby is already offering. */

const PREVIEWS = {
  waiver: {
    eyebrow: 'IN-SEASON · PREVIEW',
    sub: 'A sample week. Connect your league and these become your bench and your budget.',
    headline: 'See your real claims',
    Body: WaiverPreview,
  },
  trade: {
    eyebrow: 'IN-SEASON · PREVIEW',
    sub: 'Paste any offer, or let Juke read the ones in your league inbox.',
    headline: 'Read your real offers',
    Body: TradePreview,
  },
  strategy: {
    eyebrow: 'IN-SEASON · PREVIEW',
    sub: "Your week, planned: start/sit calls, matchup odds and what's coming.",
    headline: 'Plan your real week',
    Body: StrategyPreview,
  },
}

/* Which rooms have something real behind a connected league. None today —
   League was the one entry and it left this file for MyLeagueScreen.jsx.
   Kept as a map rather than deleted outright, because that is what makes
   Waiver, Trade and Strategy joining it, as each is built, a single line
   rather than a new `if`. */
const LIVE_ROOMS = {}

/* The same list, as slugs, for anything that needs to know WHICH rooms a
   connected league opens without needing the component that draws them.

   Exported rather than restated: the Rooms lobby draws a padlock on every
   room whose `live` flag is false, and `live` means "this room is built
   for everyone" — not "you can open it". Those were the same question
   until Sleeper connect shipped, and now they are not: League is live for
   a connected reader and locked for everybody else. A second hand-written
   list of which rooms that covers is the written-down-twice failure with a
   padlock on it, and it fails silently — the lobby says locked, the room
   opens. */
export const LIVE_WHEN_CONNECTED = Object.keys(LIVE_ROOMS)

export default function RoomPage({ slug }) {
  const rooms = useRooms()
  const { status, league } = useLeague()
  const room = rooms.find((r) => r.slug === slug)

  /* A connected league turns the lock off for the rooms that can use it.

     Only League today: standings are a direct read of what Sleeper already
     returns, where Waiver, Trade and Strategy each need Juke to have an
     opinion that has not been designed yet. Those stay locked previews
     with a connected league exactly as without one, which is honest — the
     preview says "a sample week" and that is still what it is.

     `status` is checked rather than `league`, because "we have not asked
     yet" and "there is none" are different and only one of them should
     draw a lock. Showing the locked preview during the first tick would
     flash it at somebody who has connected. */
  const live = !!(room && !room.live && status === 'connected' && league && LIVE_ROOMS[slug])

  /* Read HERE, above every early return below, and that placement is the
     whole reason this is computed before the guards rather than after
     them: three of those returns fire on some routes and not others, so a
     hook underneath them changes the hook COUNT between #/rooms/draft and
     #/rooms/waiver — and this component does not unmount between the two.
     That is the same "an early return is a wall no hook may sit behind"
     failure DraftLocker already hit once.

     The snapshot is read at this level rather than inside the live room
     because the hero above it needs the week and React data goes down. It
     is also one call instead of two: the room used to fetch this itself,
     so lifting it to draw an honest eyebrow would otherwise have meant
     asking the worker for the same league twice per page load. The hook
     no-ops on a null id, which is what makes the call safe on every room
     that is never live. */
  const { snapshot, status: snapStatus, reason: snapReason } = useLeagueSnapshot(
    live ? league.leagueId : null,
    live ? league.provider : null,
  )

  // #/rooms/league is retired, not merely stale — League graduated into
  // its own screen rather than being deleted, so it gets its own
  // destination instead of falling into the generic stale-slug bounce
  // below (which would land it on #/rooms with no explanation). Same
  // shape as app.js's own #/draft -> #/draft-room redirect, and carries
  // the query string for the identical reason that one does.
  if (slug === 'league') {
    if (typeof window !== 'undefined') {
      location.replace(location.pathname + location.search + '#/my-league')
    }
    return null
  }

  // The lobby only links slugs that exist, so this is a hand-typed or stale
  // URL. Send it to the lobby rather than rendering a room-shaped shell with
  // no room in it — replace() so the bad address does not become a
  // back-button trap, the same call applyRoute() makes for #/draft.
  if (rooms.length && !room) {
    if (typeof window !== 'undefined') {
      location.replace(location.pathname + location.search + '#/rooms')
    }
    return null
  }
  if (!room) return null

  /* The Draft Room is open and is not a preview. DraftRoom.jsx owns this
     exact route (its `draftsActive` branch) and renders into
     #draftroom-root, while applyRoute() hides #view-home — which is where
     this component lives — so there is nothing to draw and nowhere to draw
     it. Null rather than a redirect: redirecting would bounce a reader off
     the address the room genuinely lives at. */
  if (room.live) return null

  const preview = PREVIEWS[slug]
  const Body = preview && preview.Body

  /* A connected room may not call itself a preview.

     `PREVIEWS` copy is written to SELL the room -- "IN-SEASON · PREVIEW"
     over "a sample week" -- and every word of it is wrong once real
     standings are under it. It tells a reader to distrust numbers that are
     their own, which is the same failure this project already records
     about withholding: a sheet that prints a dash and then argues from the
     number is worse than either. The league sub-copy was wrong twice over,
     promising power ranks the live room deliberately does not draw.

     The week is added only once the snapshot has landed, so the line never
     states a week it does not know. */
  const liveEyebrow = live
    ? [league.name.toUpperCase(), `${league.totalTeams} TEAMS`]
        .concat(snapshot && snapshot.week ? [`WEEK ${snapshot.week}`] : [])
        .join(' · ')
    : null

  return (
    <AppShell active="rooms">
      <RoomHero
        accent={room.accent}
        glyph={room.glyph}
        eyebrow={liveEyebrow || (preview ? preview.eyebrow : `${room.season.toUpperCase()} · PREVIEW`)}
        title={room.name.replace(/^The /, '')}
      >
        {live
          ? 'Where every manager stands, read from your league.'
          : preview
            ? preview.sub
            : room.blurb}
      </RoomHero>
      {live ? (
        (() => {
          const Live = LIVE_ROOMS[slug]
          return (
            <Live league={league} snapshot={snapshot} status={snapStatus} reason={snapReason} />
          )
        })()
      ) : (
        <LockedPreview headline={preview ? preview.headline : `See your real ${slug} room`}>
          {Body ? <Body /> : null}
        </LockedPreview>
      )}
    </AppShell>
  )
}
