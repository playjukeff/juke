import { ordered, hasPlayed } from '../../lib/standings.js'
import { useMemo, useState } from 'react'
import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'
import { lineupRows } from '../rooms/strategyBoard.js'
import { teamWeek } from '../../lib/matchup.js'
import { seasonOdds, oddsFor, seedFor, SIMS } from '../../lib/seasonSim.js'
import { platformFor } from '../shell/leaguePlatforms.js'
import DraftCountdown from '../shell/DraftCountdown.jsx'
import { draftPhase } from '../../lib/countdown.js'
import KpiStrip from '../decision/KpiStrip.jsx'
import { signOf } from '../decision/tokens.js'

/* A connected league's real standings — moved here, unchanged, from the
   old League Room (rooms/LeagueRoomLive.jsx) when League graduated from a
   room into My League. Everything below is that component's own reasoning
   and still applies; only the file it lives in changed.

   ---- Why this was the room that went first ----

   Standings are a direct read. Sleeper's rosters carry wins, losses and
   points for, and its users carry the team names; joining them is the
   whole computation. Every other room needs Juke to have an opinion —
   what a claim is worth, whether an offer is fair, who to start — and an
   opinion needs designing. This is what connecting bought on day one
   rather than a label change, and it is still the only real per-league
   data My League can show until Waiver, Strategy and Trade have one of
   their own.

   ---- What is not here, and why it is absent rather than empty ----

   The handoff draws three segmented pills on this panel: Standings, Power,
   Chatter. Power is a ranking model nobody has specified and Chatter is
   league activity Sleeper does not expose in what we read. Drawing two
   pills that switch to nothing is the dead-control failure this project
   keeps finding, so there is one view and no pills at all.

   ---- The ordering is ours, and it has to be said out loud ----

   Sleeper returns rosters in roster_id order, which is the order teams
   were created and means nothing. Sorted here by wins then points for,
   which is the standard tiebreak and what every fantasy table does — but
   it is a choice, and a league whose own settings break ties differently
   would disagree with us. `division` and tiebreak settings are in the
   league object and unread; when a league that uses them turns up, this is
   the function that owes them an answer rather than the table quietly
   being wrong. Exported so MyLeagueScreen.jsx can derive the same team's
   rank and record for its own LeagueBar without a second sort. */
/* One team's roster, opened from its standings row.
 *
 * The ids have been on the snapshot since connect; what was missing was
 * anything to press. They come back in lineup order now -- QB, RB, RB, WR,
 * WR, TE, FLEX, DST, K -- because espn.js sorts by slot rather than passing
 * ESPN's own entry order through; see lineup.js's slotRank().
 *
 * Names come off the board, so a player the board does not carry draws his
 * id rather than vanishing: a roster silently one player short reads as a
 * thin team rather than a gap in the crosswalk. */
function TeamRoster({ team }) {
  const engine = useEngine()
  useJukeTick(engine)

  const ready = engine && engine.dataReady && engine.dataReady()
  const byId = ready ? new Map(engine.board().map((p) => [String(p.id), p])) : new Map()
  const starting = new Set((team.starters || []).map(String))
  // Starters first, in the order the league fields them, then the bench.
  const ids = [
    ...(team.starters || []),
    ...(team.players || []).filter((id) => !starting.has(String(id))),
  ]

  if (!ids.length) {
    return (
      <p className="px-1 pb-3 text-[12px] text-ink-muted">
        No roster yet — this league has not drafted.
      </p>
    )
  }

  return (
    <ul className="pb-2.5">
      {ids.map((id, n) => {
        const p = byId.get(String(id))
        const bench = !starting.has(String(id))
        return (
          <li
            key={String(id) + n}
            className="flex items-baseline gap-2 py-[3px] text-[12px]"
          >
            <span className="w-9 shrink-0 font-mono text-ink-label">
              {bench ? 'BN' : (p && p.pos) || '—'}
            </span>
            <span className={bench ? 'text-ink-muted' : 'text-ink'}>
              {p ? p.name : String(id)}
            </span>
            {p && p.team ? (
              <span className="text-[11px] text-ink-muted">{p.team}</span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/* Both live in web/src/lib/standings.js now, so a node suite can drive
   them without a browser -- the move countdown.js already made. Re-exported
   here because LeagueBar and MyLeagueScreen import them from this file and
   there is no reason to churn their imports. */
export { ordered, hasPlayed } from '../../lib/standings.js'

/* 1st / 2nd / 3rd. LeagueBar carries its own copy for its own line and the
   two are four lines apart in a directory; this one is here because the
   strip below is here, and merging them is a change to LeagueBar's
   signature for two characters of output. Worth noticing if a third
   appears. */
function ordinalSuffix(n) {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return 'th'
  return { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'
}

/* A whole percent, and never a decimal place.

   SIMS puts the standard error at half a point, so a tenth is a digit the
   simulation cannot support -- and a figure sharper than the thing behind
   it is this project's own standing complaint about the Juke score. 0 and
   100 are real answers here rather than rounding: a season with nothing
   left to play has already decided every seat. */
function pct(p) {
  return typeof p === 'number' ? `${Math.round(p * 100)}%` : '--'
}

/* The draft's date and time, in the reader's own timezone.

   `toLocaleString` with no locale argument, which is the browser's — a
   draft at 00:30 UTC is the evening before on the US east coast, and
   printing UTC to somebody who is going to be sitting at that draft is a
   number they have to convert in their head. The timeZoneName is included
   for the same reason: it says which clock this is, so a manager travelling
   is not misled by a time that quietly followed them.

   Fails to the raw ISO string rather than throwing. Intl options are not
   uniformly supported, and a badly formatted date beside a working
   countdown is a far smaller problem than a room that will not render. */
function draftWhen(ms) {
  try {
    return new Date(ms).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })
  } catch (err) {
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  }
}

export default function StandingsPanel({ league, snapshot, status, reason }) {
  /* Every hook this component has is here, in front of the three early
     returns below, and that is load-bearing rather than tidiness.

     `useState` used to sit under them, so a mount at `status: 'loading'`
     called no hooks and the render after the snapshot landed called one --
     which is React throwing "rendered more hooks than during the previous
     render" on the ordinary path this screen takes every time it opens.
     MyLeagueScreen does not gate on `snapStatus`; it hands it straight
     through, so the transition is not an edge case, it is the only way in.
     Same rule DraftLocker's own effect already records: an early return is
     a wall no hook may sit behind. */
  const engine = useEngine()
  useJukeTick(engine)
  const [openTeam, setOpenTeam] = useState(null)

  /* Which platform this league came from, by name. platformFor() rather
     than a ternary on `provider`, because that is the one list, and a
     third platform should be a row in it rather than an edit here. */
  const platform = platformFor(league && league.provider).name

  /* ---- Screen 05's own half: where this season ends up ----------------
   *
   * The last entry on the decision guide's blocked list, and the one that
   * was genuinely blocked rather than merely unre-measured. 08 asks who
   * wins THIS week, which is one normal difference between two lineups
   * that both exist; this asks where a team FINISHES, which is a joint
   * distribution over every remaining week and every other team's
   * schedule. `seasonSim.js` is that, and it is the generative form of the
   * same model the Strategy Room reads rather than a second opinion --
   * see its own header.
   *
   * Every input is one this screen already had. The rosters and the
   * schedule ride on the snapshot; the per-position weekly spread is
   * `weeklyCV()`, memoised in app.js because it costs 19ms a call; and
   * `weekPts` is projPerGameUnder the league's OWN scoring, which is the
   * correction that was worth 13.3 points a week to the Strategy Room's
   * total and is worth the same here to every team's mean.
   *
   * Memoised because it is 10,000 seasons. Measured at 74ms for a
   * ten-team league, which is nothing once and is a stutter on every tick
   * of a screen that re-renders on the engine's own heartbeat. */
  const boardReady = !!(engine && engine.dataReady && engine.dataReady())
  const board = boardReady ? engine.board() : []
  const byId = useMemo(
    () => new Map(board.map((p) => [String(p.id), p])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length]
  )
  const leagueRules = snapshot && snapshot.rules ? snapshot.rules : null
  const weekPts = useMemo(() => {
    if (!engine) return null
    if (!leagueRules) return engine.projPerGame
    return (player) => engine.projPerGameUnder(player, leagueRules)
  }, [engine, leagueRules])
  /* `boardReady` is in the dependency list and it is the whole reason this
     memo answers at all.

     `useEngine()` hands back `window.JukeEngine` itself, so `engine` is one
     stable object for the life of the page -- and `weeklyCV` is guarded on
     `dataReady()`, answering null until the deferred `stats.js` lands. So a
     memo keyed on `[engine, leagueRules]` alone computes null on the first
     render and never recomputes: nothing in its deps ever changes again.
     This screen mounts before the board every time (the snapshot fetch
     starts on the render the league id arrives on), so that is not an edge
     case, it is the only path. Measured: the strip drew STANDING rather
     than PLAYOFF ODDS on a league whose odds the module computes perfectly
     from the same inputs a moment later.

     The same shape as `byId` keying on `board.length` two lines up, and the
     same failure `useLeagueSnapshot()` already had from the other end -- a
     value that is right once it is late and never becomes right. */
  const cv = useMemo(
    () => (engine && engine.weeklyCV ? engine.weeklyCV(leagueRules) : null),
    [engine, leagueRules, boardReady]
  )
  const odds = useMemo(() => {
    if (!snapshot || !weekPts || !cv) return null
    /* Every team's lineup priced the same way the reader's own is, which
       is what makes the answer a joint distribution rather than one team
       measured against nine blanks. `teamWeek()` refuses a lineup it
       cannot price and `seasonOdds()` refuses the whole table when any one
       team comes back null -- deliberately not repaired here, because a
       nine-team simulation of a ten-team league produces percentages that
       add up and are wrong. */
    const strength = {}
    for (const t of snapshot.teams || []) {
      strength[String(t.ownerId)] = teamWeek(lineupRows(t, byId, weekPts), cv)
    }
    return seasonOdds({
      schedule: snapshot.schedule,
      teams: snapshot.teams,
      strength,
      playoffTeams: snapshot.playoffTeams,
      seed: seedFor(league && league.leagueId, snapshot.week),
    })
  }, [snapshot, byId, weekPts, cv, league])

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-10">
        <p className="text-[14px] text-ink-muted">Reading {league.name}…</p>
      </div>
    )
  }

  if (status === 'error' || !snapshot) {
    /* Says which failure it was, because the two want different things
       from the reader. `not-found` means the league is gone or was
       renamed out from under the connection — worth reconnecting.
       Anything else is worth waiting out. */
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-10">
        <div className="rounded-2xl border border-line-hairline bg-[#151920] p-6">
          <div className="font-display text-[20px] font-bold text-white">
            {reason === 'not-found'
              ? 'That league is no longer readable'
              : reason === 'private'
                ? 'That league is not public any more'
                : `Could not reach ${platform}`}
          </div>
          <p className="mt-1.5 max-w-[52ch] text-[14px] leading-[1.5] text-voidInk-body">
            {reason === 'not-found'
              ? `${platform} does not return this league any more. It may have been deleted, or the season rolled over — reconnect it from the You screen.`
              : reason === 'private'
                ? 'ESPN will only let Juke read a public league. Open League Settings in ESPN and set visibility to public.'
                : `Your standings are on ${platform} and it did not answer. Nothing is wrong with your league; try again in a moment.`}
          </p>
        </div>
      </div>
    )
  }

  const table = ordered(snapshot.teams)
  const mine = league.ownerId || null

  /* Read off the SNAPSHOT, not the connected-league cache.

     Both carry it, and they can disagree by up to an hour — the cache is
     refreshed on a TTL so the You screen and the switcher can draw without
     a round trip. This screen has just fetched the league itself, so it
     holds the newer answer and there is no reason to draw the older one. */
  const draft = draftPhase(snapshot.draftAt, snapshot.draftStatus)

  /* Why every row reads 0-0.

     This is the whole reason the countdown was built: a connected league
     before its draft is ten teams with empty rosters and no record, and
     without a word of explanation that reads as Juke having failed to read
     the league rather than as a league that has not started. Reported
     exactly that way.

     Not drawn once the draft is complete — by then the table is the
     explanation — nor when there is no draft scheduled, where the honest
     answer is that we do not know and a banner saying so is noise on every
     load. */
  const banner = draft.phase === 'soon' || draft.phase === 'drafting' || draft.phase === 'late'

  /* P4. The four numbers a connected league can actually answer for.

     MyLeagueDemo has shown a guest a KPI strip since the decision system
     landed and the CONNECTED screen had none, which is the wrong way round
     -- the reader with a real league was getting less of the product than
     the reader looking at a sample of it.

     The guide's own screen 05 asks for seed, win probability and bye odds,
     and this comment used to say the last two were blocked -- because
     "seasonPhase.js refuses to name a playoff week" and "a win probability
     needs the matchup fetch". Both sentences were about a repository that
     had already moved: `scheduleFromEspn()` publishes `regularSeasonWeeks`
     off ESPN's own playoffTierType, and the matchup fetch landed with it.
     Corrected in place rather than left standing, which is the rule this
     project keeps having to apply to its own blockers.

     What was really missing was a simulator, and `seasonSim.js` is it. So
     the strip leads with the playoff odds when a league can answer for them
     -- see the card below for why that displaces the standing rather than
     joining it -- and falls back to the standing when it cannot. Points
     against is what a league really does report and it answers a question
     of the same shape -- how much of your record is you.

     The median is the league's own, not a constant, so the delta says
     "against these nine teams" rather than against a number from nowhere.
     Absent, not zero, before a league has played: `pointsFor` is 0 for
     everybody until the season starts, and a "+0.0 vs median" on ten rows
     of zeros is a real number answering a question nobody asked. */
  /* This file already knew — it hid the KPIs on exactly this condition —
     and simply never applied it to the rank column, which went on numbering
     ten teams 1..10 off a sort whose every key was 0. Now one answer,
     shared. */
  const played = hasPlayed(table)
  const me = mine ? table.find((t) => t.ownerId === mine) : null
  const myRank = me ? table.indexOf(me) + 1 : null
  const medianOf = (nums) => {
    const s = nums.slice().sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  }
  const pfMedian = table.length ? medianOf(table.map((t) => t.pointsFor)) : 0
  const paMedian = table.length ? medianOf(table.map((t) => t.pointsAgainst || 0)) : 0
  const pfDelta = me ? me.pointsFor - pfMedian : 0
  const paDelta = me ? (me.pointsAgainst || 0) - paMedian : 0

  /* The reader's own row of the simulation, or null on every league that
     cannot answer: no schedule at all (Sleeper publishes none), no
     `playoffTeams`, a roster the board cannot price, or a regular season
     with nothing left to play. */
  const myOdds = me ? oddsFor(odds, me.ownerId) : null

  /* Playoff odds DISPLACE the standing rather than joining it, and the
     reason is that the strip is four cards and its own component says so.

     The standing is the one card on it a reader can already get from two
     inches lower down: the table draws a rank column and highlights their
     own row. So it is the card with the least to lose, and it loses
     nothing at all -- the rank moves into this card's note, where it reads
     as the thing the percentage is measured FROM. Same call the Strategy
     Room's own strip makes when a matchup exists.

     The bye rides in the note rather than taking a fifth card. It is a
     BETTER playoff outcome rather than a separate one, so it qualifies
     this number in the way a delta qualifies a value, and `byeSeats()`
     answers null for a bracket it cannot reconcile with the published
     playoff weeks and 0 for one that simply has no byes -- neither of
     which is a fact worth a sentence. */
  /* And the note is the framing this number may not be shown without.

     A percentage on a card is read as a fact about the season. It is a
     fact about the PROJECTIONS -- ten thousand seasons played out from
     what the board thinks every roster is worth this week, which is a
     forecast with its own measured error and no knowledge of an injury
     that has not happened. `projectedWinPctForRoom()`'s own method note
     makes the same demand of the same family of model. */
  const oddsNote = () => {
    const from = `${myRank}${ordinalSuffix(myRank)} of ${table.length} now`
    const bye = myOdds && odds.byeSeats ? `, a bye in ${pct(myOdds.bye)}` : ''
    return `${from}${bye}. ${SIMS.toLocaleString()} seasons from today's projections.`
  }

  const kpis = me && played
    ? [
        myOdds
          ? {
              label: 'Playoff odds',
              value: pct(myOdds.playoffs),
              /* `evidence`, never gain or cost. A probability is a
                 quantity with no direction in it -- 61% is not a gain of
                 anything -- which is the same call the Strategy Room's
                 own even-matchup band makes and the same one `signOf()`
                 makes about zero. */
              accent: 'evidence',
              note: oddsNote(),
            }
          : {
              label: 'Standing',
              value: `${myRank}${ordinalSuffix(myRank)}`,
              accent: 'evidence',
              note: `Of ${table.length}, on wins then points for.`,
            },
        {
          label: 'Record',
          value: `${me.wins}-${me.losses}${me.ties ? `-${me.ties}` : ''}`,
          accent: 'evidence',
          note: 'As your platform reports it.',
        },
        {
          label: 'Points for',
          value: me.pointsFor.toFixed(1),
          delta: Math.abs(pfDelta).toFixed(1),
          deltaSign: signOf(Math.round(pfDelta * 10)) || undefined,
          accent: pfDelta >= 0 ? 'gain' : 'cost',
          note: `Against a league median of ${pfMedian.toFixed(1)}.`,
        },
        {
          label: 'Points against',
          value: (me.pointsAgainst || 0).toFixed(1),
          /* Pre-signed, and this is the one card on the strip that has to
             be.

             `signed()` prepends a minus for `sign: 'cost'`, which is right
             everywhere the magnitude IS the cost -- a habit costing 4.1
             points a week. Points against is the case where the two part
             company: conceding 10.8 more than the league is bad AND the
             number went UP, so the plain call printed "−10.8" for a
             value that is 10.8 above the median. A sign that says the
             number fell when it rose is a wrong fact, not a styling
             choice.

             `signed()` passes a string that already carries a real sign
             straight through -- its own comment says so -- so the
             direction is written here and `deltaSign` is left to do the
             only other thing it does, which is choose the colour. */
          delta: (paDelta >= 0 ? '+' : '−') + Math.abs(paDelta).toFixed(1),
          deltaSign: paDelta > 0 ? 'cost' : paDelta < 0 ? 'gain' : undefined,
          accent: paDelta > 0 ? 'cost' : 'gain',
          note: `Against a league median of ${paMedian.toFixed(1)}.`,
        },
      ]
    : []

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-10 pt-2 sm:px-10 sm:pt-4">
      <KpiStrip items={kpis} className="mb-3" />
      {banner ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[14px] border border-line-hairline bg-[#151920] px-4 py-3">
          <DraftCountdown league={snapshot} variant="chip" />
          <span className="text-[13px] leading-[1.45] text-voidInk-body">
            {draft.phase === 'drafting'
              ? 'Your draft is running now — rosters fill here as picks land.'
              : draft.phase === 'late'
                ? 'The scheduled draft time has passed. Rosters appear here once it runs.'
                : 'Rosters are empty until your league drafts. Everything else here is live.'}
          </span>
        </div>
      ) : null}
      <div className="lg:grid lg:grid-cols-[1.4fr_0.6fr] lg:items-start lg:gap-4">
        <div className="overflow-hidden rounded-[18px] border border-line-hairline bg-[#151920] px-4 pb-1 pt-1.5">
          {table.map((t, i) => {
            const you = mine && t.ownerId === mine
            const open = openTeam === t.ownerId
            return (
              <div
                key={t.rosterId ?? `${t.teamName}-${i}`}
                className="border-b border-line-hairline last:border-b-0"
              >
              {/* A row is a control now. Reported as "can't click on my
                  team's name (or any team names)" — and it was not that the
                  handler was broken, there was never one: the row was a
                  <div>. The rosters it opens have been on the snapshot all
                  along, which is what made the absence invisible. A button
                  rather than a link because it opens something in place
                  rather than going anywhere. */}
              <button
                type="button"
                onClick={() => setOpenTeam(open ? null : t.ownerId)}
                aria-expanded={open}
                className="grid w-full grid-cols-[22px_1fr_auto_auto] items-center gap-2.5 py-[11px] text-left"
                style={
                  you
                    ? {
                        background: 'linear-gradient(90deg, rgba(0,229,255,.08), transparent)',
                        margin: '0 -8px',
                        padding: '11px 8px',
                        borderRadius: 10,
                      }
                    : undefined
                }
              >
                {/* Ranks 1-2 in mint, which is the handoff's own mark for
                    the top of a table rather than a podium of three. */}
                <span
                  className="font-mono text-[12px]"
                  style={{ color: played && i < 2 ? '#74E5CE' : '#8A9BAA' }}
                >
                  {/* A dash, not a position, until somebody has played.
                      See hasPlayed(). */}
                  {played ? i + 1 : '·'}
                </span>
                <span className="min-w-0">
                  <span
                    className="block truncate text-[14px] font-semibold"
                    style={{ color: you ? '#00E5FF' : '#fff' }}
                  >
                    {you ? 'You · ' : ''}
                    {t.teamName}
                  </span>
                  {/* The manager under the team name, and only when it is
                      not the same string — a manager who never renamed
                      their team would otherwise get it twice. */}
                  {t.manager && t.manager !== t.teamName ? (
                    <span className="mt-0.5 block truncate text-[12px] text-ink-muted">
                      {t.manager}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-[12px] text-voidInk-primary">
                  {t.wins}-{t.losses}
                  {t.ties ? `-${t.ties}` : ''}
                </span>
                <span className="min-w-[52px] text-right font-mono text-[12px] text-ink-muted">
                  {t.pointsFor.toFixed(1)}
                </span>
              </button>
              {open ? <TeamRoster team={t} /> : null}
              </div>
            )
          })}
        </div>

        <div className="mt-3 rounded-[18px] border border-line-hairline bg-[#151920] p-[18px] lg:mt-0">
          <span className="font-mono text-[10px] tracking-[0.14em] text-flow-gold">THE LEAGUE</span>
          <div className="mt-2 font-display text-[22px] font-bold text-white">{snapshot.name}</div>
          <dl className="mt-3 flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Season</dt>
              <dd className="text-voidInk-primary">{snapshot.season}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Teams</dt>
              <dd className="text-voidInk-primary">{snapshot.totalTeams}</dd>
            </div>
            {snapshot.week ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Week</dt>
                <dd className="text-voidInk-primary">{snapshot.week}</dd>
              </div>
            ) : null}
            {snapshot.playoffTeams ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Playoff spots</dt>
                <dd className="text-voidInk-primary">{snapshot.playoffTeams}</dd>
              </div>
            ) : null}
            {/* The date itself, which the countdown above deliberately does
                not say: "3D 04:12:09" answers how long and never when, and
                the when is what somebody puts in a calendar. */}
            {snapshot.draftAt && snapshot.draftStatus !== 'complete' ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Draft</dt>
                <dd className="text-right text-voidInk-primary">{draftWhen(snapshot.draftAt)}</dd>
              </div>
            ) : null}
          </dl>
          {/* Read-only is the promise the connect flow made; repeating it
              on the one screen that shows real league data is where it is
              worth the two lines. */}
          <p className="mt-3.5 border-t border-line-hairline pt-3 text-[12px] leading-[1.45] text-ink-muted">
            Read from {platform}. Juke never writes to your league.
          </p>
        </div>
      </div>
    </div>
  )
}
