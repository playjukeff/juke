import { useState } from 'react'
import AppShell from './shell/AppShell.jsx'
import { useLeague, useLeagueSnapshot } from '../hooks/useLeague.js'
import { seasonPhase, underWay } from '../lib/seasonPhase.js'
import LeagueBar from './myleague/LeagueBar.jsx'
import WeekStrip from './myleague/WeekStrip.jsx'
import StandingsPanel from './myleague/StandingsPanel.jsx'
import MyLeagueDemo from './myleague/MyLeagueDemo.jsx'
import PastWeekPanel from './myleague/PastWeekPanel.jsx'
import { gameInWeek } from '../lib/schedule.js'
import DraftReportPanel from './myleague/DraftReportPanel.jsx'
import { useDecisions, decisionsForWeek, weekMark } from '../hooks/useDecisions.js'

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

/* `mark` comes from the ledger now, where this passed none at all.
   WeekStrip's own header records why it had none: "a real connected league
   has neither a grading data source nor a known season length yet". It has
   the first of those — decisions.verdict, written by the grading job — and
   still not the second, which is why NFL_WEEKS above is unchanged and the
   strip still draws the calendar the sport has rather than one this league
   never told us about.

   weekMark() leaves an ungraded week unmarked rather than green; see its
   own note. So a week fills in as it is graded, and a strip with nothing
   graded looks exactly as it did before this change. */
function realWeeks(currentWeek, leagueId, decisions) {
  const weeks = [{ key: 'draft', label: 'DRAFT' }]
  for (let n = 1; n <= NFL_WEEKS; n++) {
    const now = n === currentWeek
    weeks.push({
      key: String(n),
      label: now ? `WEEK ${n} · NOW` : `W${n}`,
      disabled: n > currentWeek,
      mark: weekMark(leagueId, n, decisions),
    })
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
  const { status, league, retry } = useLeague()
  const { decisions } = useDecisions()
  /* null means "the current week", which is the resting state and cannot be
     seeded from the snapshot: the snapshot is not read yet on the first
     render, and a week number captured once would then be stale the moment
     the league moved on. The strip resolves its own selection below. */
  const [openWeek, setOpenWeek] = useState(null)
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

  /* Asked, and could not find out — which may NOT fall through to the demo
     below, and this is the screen where that mattered most.

     Reported 8 September 2026 with a screenshot: two connected leagues, an
     account on Multi-League, both rows sitting in D1 the whole time, and this
     page offering "Connect a real league" over sample data. The read was
     failing (GET /me/leagues was throwing a bare 500 — see staleLeague() in
     worker/draft-room.js), `leagues` was therefore empty, and `!connected`
     drew the guest experience. So a server-side crash presented as the
     product having forgotten the reader's leagues.

     HomeAlive's ConnectCard and YouScreen both already draw an honest state
     here, for the reason leagueStore.js's own header states — a state meaning
     "we could not find out" has to be renderable. This screen was the third
     reader of that hook and the only one still collapsing it into "none". The
     demo is what somebody with no league SHOULD see; showing it to somebody
     who has one is a claim, not a gap. */
  if (status === 'error') {
    return (
      <AppShell active="my-league">
        {TITLE}
        <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10">
          <div className="rounded-[18px] border border-line-hairline bg-[#151920] p-[18px] sm:rounded-[22px] sm:p-[26px]">
            <span className="font-mono text-[11px] tracking-[0.14em] text-ink-muted">MY LEAGUE</span>
            <div className="mt-2 font-display text-[22px] font-bold text-white sm:mt-2.5 sm:text-[28px]">
              Couldn&rsquo;t load your league
            </div>
            <p className="mb-3.5 mt-1.5 text-[14px] leading-[1.5] text-voidInk-body sm:mb-[18px] sm:mt-2 sm:text-[15px]">
              Nothing has been disconnected and your leagues are still on your account — we just
              could not reach it to read them. Mock drafts are unaffected and need no account.
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={retry}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-line-hairline px-5 py-3 text-[14px] font-bold text-white transition-colors duration-150 hover:border-teal/50"
              >
                Try again
              </button>
              <a
                href="#/rooms/draft"
                className="text-[12px] text-ink-muted underline-offset-2 hover:underline"
              >
                Start a mock draft
              </a>
            </div>
          </div>
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
  /* `underWay(phase)` rather than `phase === 'in-season'`. The strip and the
     past-week panel belong to the whole post-draft season, and seasonPhase()
     now splits that into in-season / playoffs / complete — so the equality
     this used to make would have taken the strip away in week 15, silently,
     in the weeks a manager looks at it most. */
  const inSeason = ready && underWay(phase)

  /* The strip is selectable now, which it was not: it had no onSelect at
     all, on the rule that a control which cannot act must not be offered.
     What it could not do was show you what happened in a past week, and
     that is exactly what the ledger supplies. */
  const currentKey = inSeason ? String(snapshot.week) : null
  const selectedKey = openWeek || currentKey
  const showingPast = inSeason && !!openWeek && openWeek !== currentKey
  const pastRows = showingPast
    ? decisionsForWeek(league.leagueId, openWeek === 'draft' ? 0 : Number(openWeek), decisions)
    : []

  /* The week's own result, for the panel that until now could only show the
     calls made in it. Both of these answer null all the way down — no
     schedule at all (Sleeper), no ownerId, a bye, the draft cell — and
     PastWeekPanel draws the block only when both scores are real numbers.

     Resolved here rather than inside the panel because the opponent is a row
     of `snapshot.teams` and the panel is handed rows rather than the
     snapshot; that is the same split StrategyRoomLive already makes, and it
     keeps the panel a thing that draws what it is given. */
  const pastGame =
    showingPast && openWeek !== 'draft'
      ? gameInWeek(snapshot && snapshot.schedule, league.ownerId, Number(openWeek))
      : null
  const pastOpponent =
    pastGame && pastGame.opponentId && snapshot
      ? (snapshot.teams || []).find((t) => t.ownerId === pastGame.opponentId) || null
      : null

  return (
    <AppShell active="my-league">
      {TITLE}
      <LeagueBar league={league} snapshot={snapshot} snapStatus={snapStatus} />
      {inSeason ? (
        <WeekStrip
          weeks={realWeeks(snapshot.week, league.leagueId, decisions)}
          selected={selectedKey}
          onSelect={(key) => setOpenWeek(key === currentKey ? null : key)}
        />
      ) : null}
      {showingPast ? (
        <PastWeekPanel
          weekKey={openWeek}
          rows={pastRows}
          game={pastGame}
          opponent={pastOpponent}
          onBack={() => setOpenWeek(null)}
        />
      ) : (
        <>
          <StandingsPanel league={league} snapshot={snapshot} status={snapStatus} reason={snapReason} />
          {/* Below the standings on purpose: the draft is how the season
              started and the table is how it is going, so the live fact
              leads. Draws nothing at all before a draft has run. */}
          <DraftReportPanel league={league} snapshot={snapshot} />
        </>
      )}
    </AppShell>
  )
}
