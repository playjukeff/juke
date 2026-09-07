import { platformFor } from '../shell/leaguePlatforms.js'
import DraftCountdown from '../shell/DraftCountdown.jsx'
import { draftPhase } from '../../lib/countdown.js'

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
export function ordered(teams) {
  return [...teams].sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor))
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
  /* Which platform this league came from, by name. platformFor() rather
     than a ternary on `provider`, because that is the one list, and a
     third platform should be a row in it rather than an edit here. */
  const platform = platformFor(league && league.provider).name

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

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-10 pt-2 sm:px-10 sm:pt-4">
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
            return (
              <div
                key={t.rosterId ?? `${t.teamName}-${i}`}
                className="grid grid-cols-[22px_1fr_auto_auto] items-center gap-2.5 border-b border-line-hairline py-[11px] last:border-b-0"
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
                  style={{ color: i < 2 ? '#74E5CE' : '#8A9BAA' }}
                >
                  {i + 1}
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
