import AppShell from './shell/AppShell.jsx'
import RoomIcon from './roomIcons.jsx'
import { useEffect, useState } from 'react'
import RoomShell from './shell/RoomShell.jsx'
import LockedPreview from './shell/LockedPreview.jsx'
import { useRooms } from '../hooks/useRooms.js'
import WaiverPreview from './rooms/WaiverPreview.jsx'
import TradePreview from './rooms/TradePreview.jsx'
import StrategyPreview from './rooms/StrategyPreview.jsx'
import WaiverRoomLive, { TABS as WAIVER_TABS } from './rooms/WaiverRoomLive.jsx'
import StrategyRoomLive, { TABS as STRATEGY_TABS } from './rooms/StrategyRoomLive.jsx'
import TradeRoomLive, { TABS as TRADE_TABS } from './rooms/TradeRoomLive.jsx'
import ProspectRoomLive, { TABS as PROSPECT_TABS } from './rooms/ProspectRoomLive.jsx'
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
const LIVE_ROOMS = {
  /* `{ Body, tabs }` rather than a bare component, because a room declares
     its own sections and the ONE RoomShell draws them — the handoff's first
     constraint, which a room rendering its own header would break at the
     first room that wanted a second tab.

     Only the sections that have real content are listed. Waiver's other six
     (Player Lab, FAAB Planner, Roster Gaps, Drop List, League Intel, News
     Wire) join as each is built; a tab that opens onto nothing is the dead
     control this project keeps finding. */
  waiver: {
    Body: WaiverRoomLive,
    tabs: WAIVER_TABS,
    sub: 'Every player nobody in your league owns, priced against replacement.',
    /* The bar's KPIs are the ROOM's, not the league's.

       They were computed here for every live room, so the Strategy Room
       drew "FAAB POOL $100" — a real number, on a screen where nobody is
       bidding. That is the right-value-wrong-column failure in the one
       place a reader glances at without reading: a KPI is a fact the room
       is about, and a room that shows another room's is quietly wrong
       rather than visibly broken. */
    stats: (snapshot) =>
      /* Absent for a league that runs waiver ORDER rather than a budget:
         `waiverBudget` is null there now, because ESPN populates a $100
         default whether or not the league bids. The room's own KPI strip
         says which system it runs; the bar staying quiet is the
         no-duplicate rule, not an omission. */
      snapshot && snapshot.waiverBudget
        ? [{ label: 'FAAB pool', value: `$${snapshot.waiverBudget}`, tone: 'text-flow-gold' }]
        : [],
  },
  trade: {
    Body: TradeRoomLive,
    tabs: TRADE_TABS,
    sub: 'Both rosters priced against replacement, before you send it.',
    /* Nothing. The bar's natural KPI here is the deal on screen, and that
       lives in the builder where the reader is looking — a duplicate of it
       in the chrome would be one number in two places, drifting the first
       time either moved. */
    stats: () => [],
  },
  strategy: {
    Body: StrategyRoomLive,
    tabs: STRATEGY_TABS,
    sub: 'What your lineup projects, and the one swap that changes it.',
    /* Nothing, and the reason CHANGED rather than the answer.

       This used to read "nothing yet ... the week's matchup margin needs
       the matchups fetch three of its tabs are also waiting on". That
       fetch landed with the schedule, and the room draws a real WIN
       PROBABILITY on its own strip now — so the sentence was a blocker
       describing a repository that had already moved, which is the fourth
       copy of that claim this project has had to correct in place.

       It still says nothing, for the reason the Trade entry above gives:
       the number is on screen where the reader is looking, and a second
       copy of it in the chrome is one fact in two places, drifting the
       first time either moves. */
    stats: () => [],
  },
}


/* Rooms whose real content needs no league at all.

   The three above each read a roster, so each is genuinely locked until
   somebody connects one. Prospect reads the board — players.js and
   stats.js, which every visitor already has — so a rookie is a rookie
   whoever you are. Gating it behind a connection it never consults would
   be a control that cannot act, which is the same failure as a tab
   unlocking onto nothing.

   Separate from LIVE_ROOMS rather than a flag on it, because `live` below
   dereferences `league.name` and asks the worker for a snapshot. A room
   with no league in scope must not travel that path. */
const OPEN_ROOMS = {
  prospect: {
    Body: ProspectRoomLive,
    tabs: PROSPECT_TABS,
    sub: 'Every first-year player on the board, ranked — and what Juke does not know about them.',
    title: 'Open',
    stats: [],
  },
}

/* Is this room's real content reachable by this reader, for any reason.

   One function rather than a second exported list, because three call
   sites ask this question — the lobby's open count, the homepage grid and
   this file — and a room that is open for a reason one of them has not
   heard of is the written-down-twice failure with a padlock on it: the
   lobby says locked and the room opens.

   It replaced an exported LIVE_WHEN_CONNECTED slug list, which answered
   the narrower "which rooms does a LEAGUE open" and was correct for as
   long as a league was the only thing that opened one. Prospect is the
   third category, and a list cannot carry a third answer without every
   caller learning about it. */
export function roomIsOpen(room, leagueStatus) {
  if (!room) return false
  if (room.live) return true
  if (OPEN_ROOMS[room.slug]) return true
  return leagueStatus === 'connected' && !!LIVE_ROOMS[room.slug]
}

/* WHY a room is shut, for the surfaces that have to tell somebody.

   `roomIsOpen()` answers whether, and a padlock with no stated condition
   is the question a reader is left holding — the homepage strip drew three
   of them and said nothing anywhere about what opens them.

   Two answers, and they are genuinely different promises: 'league' is a
   door the reader can open right now, 'building' is one nobody can. A
   surface that collapses them into "locked" either overpromises or
   undersells, and which one it does changes per room as rooms ship.

   A function beside roomIsOpen() rather than an exported list, for that
   function's own recorded reason: three call sites ask about this padlock,
   and a list means every one of them learns about a new category
   separately. Answers null when the room is open, so a caller can branch on
   truthiness without knowing the vocabulary. */
export function lockReason(room, leagueStatus) {
  if (!room || roomIsOpen(room, leagueStatus)) return null
  return LIVE_ROOMS[room.slug] ? 'league' : 'building'
}

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

  /* Not `!live && OPEN_ROOMS[slug]`: the two sets do not overlap, and
     writing it as a fallback would quietly make a room that joined both
     lists render whichever branch happened to be tested first. */
  const openRoom = !!(room && !room.live && OPEN_ROOMS[slug])

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

  /* Which section of a live room is open. Up here with the other hooks for
     this file's own documented reason -- three early returns below fire on
     some routes and not others, and this component does NOT unmount between
     #/rooms/waiver and #/rooms/trade, so a hook underneath them changes the
     hook count between two routes.

     Reset on the slug rather than seeded once: moving between rooms would
     otherwise open the second one on a tab key the first one owned, which
     resolves to no tab at all and draws an empty body under a bar with
     nothing selected. */
  const [tab, setTab] = useState('lobby')
  useEffect(() => { setTab('lobby') }, [slug])

  // #/rooms/league is retired, not merely stale — League graduated into
  // its own screen rather than being deleted, so it gets its own
  // destination instead of falling into the generic stale-slug bounce
  // below (which would land it on #/rooms with no explanation). Same
  // shape as app.js's own #/draft -> #/draft-room redirect (replace(),
  // never assign(), so the dead route cannot become a back-button trap),
  // but not the same query-string guarantee: app.js's redirect exists
  // specifically to carry a query embedded IN THE HASH — an invite is
  // "#/draft?room=ABC1" — across to the new route, which needed reading
  // location.hash directly because route() had already stripped it.
  // #/rooms/league never had an equivalent hash-borne parameter (grep
  // turns up nothing that ever built one), and useHashRoute.js's own
  // parseHashRoute() strips any "?..." off the hash before `slug` ever
  // reaches this component the same way route() does — so there is
  // nothing left here to recover even if this wanted to. What this DOES
  // carry, location.search, is the real URL's own query string (before
  // the "#"), which is a different and much rarer thing in a
  // hash-routed app — a UTM parameter on a shared link, say — kept for
  // the ordinary reason a redirect should not drop it, not because it
  // stands in for what app.js's redirect protects.
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

  /* What the shell's identity row says.

     A room with no connected league has no week and no platform, so it
     says what it actually is rather than inventing a "Week 6" the way the
     prototype's sample data can afford to. Once a room goes live the same
     three fields carry the real thing — which is why they are computed
     here and not written into PREVIEWS: the live and preview cases are one
     header with different values, not two headers. */
  const shell = live
    ? {
        title: snapshot && snapshot.week ? `Week ${snapshot.week}` : 'Connected',
        meta: [league.name, `${league.totalTeams} team`].filter(Boolean).join(' · '),
        /* Whatever the ROOM asks for, and only what the league told us.

           Waiver's is "FAAB pool" where the handoff's bar says "FAAB
           LEFT $34", and the difference is the whole point: `waiverBudget`
           is the season's budget, straight off league.settings, and
           nothing in either adapter reports what has been SPENT. "Left"
           would be a number this cannot compute presented as one it can,
           on the one figure a manager acts on before making a claim. */
        stats: (LIVE_ROOMS[slug].stats || (() => []))(snapshot),
      }
    : openRoom
      ? {
          /* An open room has no week and no league to name, so it says
             what it is instead of borrowing the preview's "sample data" —
             which would be false about a screen drawing the real board. */
          title: OPEN_ROOMS[slug].title,
          meta: `${room.season} · no league needed`,
          stats: OPEN_ROOMS[slug].stats,
        }
      : {
          title: 'Preview',
          meta: `${room.season} · sample data`,
          stats: [],
        }

  return (
    <AppShell active="rooms">
      <RoomShell
        room={room.name}
        title={shell.title}
        meta={shell.meta}
        stats={shell.stats}
        tabs={live ? LIVE_ROOMS[slug].tabs : openRoom ? OPEN_ROOMS[slug].tabs : []}
        active={tab}
        onTab={setTab}
        backHref="#/rooms"
        backLabel="Rooms"
      >
        {/* The room's own name is an H1 in the BODY, not in the bar —
            Juke Journey v3 draws it that way (screenshot 07) and the
            reason is structural: the bar is sticky and 52px, so a title
            that lived in it would be the only heading on the page and
            would scroll with the chrome rather than with the content it
            names. The accent survives here, on the eyebrow, which is the
            one place a room's identity colour can go without sitting
            under text. */}
        <div className="mx-auto max-w-[1280px] px-5 pt-6 sm:px-10 sm:pt-8">
          <div
            className="mb-1.5 font-mono text-[11px] tracking-[0.1em]"
            style={{ color: room.accent }}
          >
            <span className="mr-1.5 inline-flex align-[-2px]" aria-hidden="true"><RoomIcon room={room} size={13} /></span>
            {liveEyebrow ||
              (openRoom
                /* An open room may not call itself a preview, for the same
                   reason a connected one may not: the word tells a reader
                   to distrust content that is real. */
                ? `${room.season.toUpperCase()} · OPEN`
                : preview
                  ? preview.eyebrow
                  : `${room.season.toUpperCase()} · PREVIEW`)}
          </div>
          {/* uppercase italic, like every other H1 in the app.

              RoomsLobby, YouScreen, DraftsScreen and the homepage all render
              font-display extrabold uppercase italic; these four room routes
              alone rendered upright sentence case, so "The Waiver Room" came
              out in a different typographic voice from "THE ROOMS" one click
              behind it. The display idiom is the brand's only distinctive
              type asset, and dropping it on the routes a visitor reaches
              SECOND means their second impression contradicts their first. */}
          <h1 className="m-0 font-display text-[30px] font-extrabold uppercase italic text-white sm:text-[40px]">
            {room.name}
          </h1>
          <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-voidInk-body">
            {live
              /* Was 'Where every manager stands, read from your league.',
                 hardcoded when the League Room was the only live room and
                 wrong for every room that joins it — Waiver is not about
                 where managers stand. A room's own line, with the League
                 sentence gone with the room that owned it. */
              ? LIVE_ROOMS[slug].sub
              : openRoom
                ? OPEN_ROOMS[slug].sub
                : preview
                  ? preview.sub
                  : room.blurb}
          </p>
        </div>

        {/* P8: the body is keyed on the room AND the tab, so every entrance
            in it replays when either changes.

            A tab is a different set of facts about the same room, and the
            staggered arrival is most of how a reader is told that the panel
            they were reading has been replaced rather than edited. Keying on
            `slug` alone would replay on a route change and sit still on a tab
            change, which is the half nobody would notice was missing.

            The KPI strip itself is rendered by each room's own Body rather
            than being lifted into the hero above: only the body has the
            snapshot the numbers come out of, and passing four figures up
            through RoomPage so they can be drawn two elements higher is a
            second copy of a room's own data living in the shell. It lands in
            the same place on screen either way. */}
        <div key={slug + ':' + tab}>
        {live ? (
          (() => {
            const Live = LIVE_ROOMS[slug].Body
            return (
              <Live
                league={league}
                snapshot={snapshot}
                status={snapStatus}
                reason={snapReason}
                tab={tab}
              />
            )
          })()
        ) : openRoom ? (
          (() => {
            const Open = OPEN_ROOMS[slug].Body
            return <Open tab={tab} />
          })()
        ) : (
          <LockedPreview headline={preview ? preview.headline : `See your real ${slug} room`}>
            {Body ? <Body /> : null}
          </LockedPreview>
        )}
        </div>
      </RoomShell>
    </AppShell>
  )
}
