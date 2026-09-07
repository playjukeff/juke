import AppShell from './shell/AppShell.jsx'
import { useLeague, useLeagueSnapshot } from '../hooks/useLeague.js'
import { seasonPhase } from '../lib/seasonPhase.js'
import LeagueBar from './myleague/LeagueBar.jsx'
import WeekStrip from './myleague/WeekStrip.jsx'
import StandingsPanel from './myleague/StandingsPanel.jsx'
import MyLeagueDemo from './myleague/MyLeagueDemo.jsx'

/* #/my-league — the connected-league home. Absorbs the old League Room
   (#/rooms/league, rooms/LeagueRoomLive.jsx — its content lives on now as
   StandingsPanel.jsx) and sits above the five rooms in the rail rather
   than among them, per Juke Journey v3's own architecture.

   ---- Free/guest gets the whole of the demo, not a locked slice ----

   Free cannot connect a real league at all (confirmed product rule), so
   there is no "preview behind a blur" state here the way RoomPage.jsx
   gives the other rooms — MyLeagueDemo.jsx IS what Free and guest see,
   fully interactive, on sample data it announces as such.

   ---- What is missing, and left missing rather than invented ----

   A real connected league has no primary recommendation to show (no room
   writes one yet — Waiver/Strategy/Trade's real implementations are a
   later phase) and no per-week grading (there is no decision-history data
   source anywhere in the schema). Both are simply not rendered for a real
   league, the same "absent, not empty" rule the News tab and the old
   League Room's Power/Chatter pills already follow — a section nobody
   asked to wait for is worse as a permanently empty panel than as no
   panel at all. WeekStrip still draws for a real league, but with no
   marks and nothing clickable: see its own file for why. */

/* A fixed NFL week range rather than a league-specific one — neither
   Sleeper nor ESPN tells us how many weeks THIS league's regular season
   runs (`playoffTeams` is a count, not a week number), so a real-league
   week strip draws the calendar the sport actually has instead of guessing
   at a fantasy-specific one it does not know. */
const NFL_WEEKS = 18

function realWeeks(currentWeek) {
  const weeks = [{ key: 'draft', label: 'DRAFT' }]
  for (let n = 1; n <= NFL_WEEKS; n++) {
    const now = n === currentWeek
    weeks.push({ key: String(n), label: now ? `WEEK ${n} · NOW` : `W${n}`, disabled: n > currentWeek })
  }
  return weeks
}

// Every other top-level screen (YouScreen, DraftsScreen, RoomsLobby) leads
// with a mono eyebrow and one visible <h1> naming the screen; LeagueBar and
// MyLeagueDemo's own "Your Team" line carry the specific identity (which
// league, which team) but neither is a heading tag, so My League had none
// at all. Fixed text rather than the league's own name — that name is
// already said, more usefully, by LeagueBar's switcher and MyLeagueDemo's
// team line a few lines below this.
const TITLE = (
  <div className="mx-auto max-w-[1280px] px-5 pt-[22px] sm:px-10 sm:pt-10">
    <div className="mb-1.5 font-mono text-[11px] tracking-[0.1em] text-teal">
      <span className="mr-1.5" aria-hidden="true">🏟</span>
      MY LEAGUE
    </div>
    <h1 className="m-0 font-display text-[30px] font-extrabold uppercase italic text-white sm:text-[44px]">
      My League
    </h1>
  </div>
)

export default function MyLeagueScreen() {
  const { status, league } = useLeague()
  const connected = status === 'connected' && !!league

  const { snapshot, status: snapStatus, reason: snapReason } = useLeagueSnapshot(
    connected ? league.leagueId : null,
    connected ? league.provider : null,
  )

  if (status === 'loading') {
    return (
      <AppShell active="my-league">
        {TITLE}
        <div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-10">
          <p className="text-[14px] text-ink-muted">Loading…</p>
        </div>
      </AppShell>
    )
  }

  if (!connected) {
    return (
      <AppShell active="my-league">
        {TITLE}
        <MyLeagueDemo />
      </AppShell>
    )
  }

  const ready = snapStatus === 'ready' && !!snapshot
  const phase = ready ? seasonPhase(snapshot) : 'unknown'

  return (
    <AppShell active="my-league">
      {TITLE}
      <LeagueBar league={league} snapshot={snapshot} snapStatus={snapStatus} />
      {ready && phase === 'in-season' ? (
        <WeekStrip weeks={realWeeks(snapshot.week)} selected={String(snapshot.week)} />
      ) : null}
      <StandingsPanel league={league} snapshot={snapshot} status={snapStatus} reason={snapReason} />
    </AppShell>
  )
}
