import { useLeagueFresh, useTierFresh } from '../../v2/stores.js'
import { readLocker, readLeagueShape } from '../../v2/v2data.js'
import { useSignedIn } from '../../../hooks/useAuthState.js'
import { meetsTier } from '../../../lib/tiers.js'
import {
  CallButton, GoLink, Headline, Icon, Label, QuietButton, Sheet, Skeleton, ordinal, useEngineData,
} from '../ui.jsx'
import { CountUp, StreamText } from '../motion.jsx'
import SampleBoard from '../draft/SampleBoard.jsx'
import NowConnected from './NowConnected.jsx'
import NowSeason from './NowSeason.jsx'
import NowMember, { NowMemberLoading } from './NowMember.jsx'
import { SituationBand, TheCall } from './TheCall.jsx'
import { FreeLeagueNote, SeasonBand } from './parts.jsx'
import { bucketOf, useNextKickoffAt, useSeason } from './season.js'

export { SituationBand, TheCall }

/* Now — the first of v3's five places, and the one page that changes with
   who is reading it and when.

   ---- The matrix ----

   Three audiences (guest, a free account, a subscriber — Season Pass or
   Multi-League), crossed with whether Juke can read a league, crossed with
   where the NFL season is (seasonClock(): before it, week N, after it).
   Eighteen cells on paper, six pages in practice, because most cells
   collapse for a reason worth stating:

     any audience, league connected     NowConnected. The LEAGUE's own
                                        snapshot decides its phase — drafted
                                        or not, which week, season complete —
                                        and it outranks the NFL calendar,
                                        which only knows about the NFL. A
                                        free account can only get here with a
                                        league connected on a plan it has
                                        since left (Free connects none), so
                                        it collapses in too, with one quiet
                                        note about what its plan does not
                                        reach.
     guest, before the season          NowGuest: a priced call on tonight's
                                        board and a free mock. Unchanged.
     guest, after the season           NowGuest again, under a band saying
                                        the season is over: next year's draft
                                        is the one decision left, and the
                                        mock is how you practise it.
     guest, week N                      NowSeason: the week, not the draft.
                                        Bring your league is the action; the
                                        in-season tools work on a SAMPLE
                                        league beside it.
     signed in, no league               NowMember, one frame for all three
                                        phases: a welcome, the locker, and
                                        the plan's own next step — the Season
                                        Pass prompt for Free, connecting for a
                                        subscriber, nothing while the plan is
                                        still being read.

   Signed in and the league store has not answered: a skeleton, never the
   guest page — that page offers to connect a league somebody may already
   have. Unknown season renders the preseason pages (season.js says why). */

export default function Now() {
  const signedIn = useSignedIn()
  const { status: leagueStatus } = useLeagueFresh()
  const { status: tierStatus, tier, refresh: refreshTier } = useTierFresh()
  const season = useSeason()
  const bucket = bucketOf(season.phase)

  const audience = !signedIn ? 'guest'
    : tierStatus === 'ready' ? (meetsTier(tier, 'pro') ? 'sub' : 'free')
    : 'unknown'

  let page
  if (leagueStatus === 'connected') {
    page = <NowConnected plan={audience === 'free' ? <FreeLeagueNote /> : null} />
  } else if (audience === 'guest') {
    page = bucket === 'season' ? <NowSeason season={season} /> : <NowGuest season={season} post={bucket === 'post'} />
  } else if (leagueStatus === 'loading') {
    page = <NowMemberLoading />
  } else {
    page = <NowMember audience={audience} tier={tier} season={season} leagueStatus={leagueStatus} tierStatus={tierStatus} onRetryTier={refreshTier} />
  }
  // data-* for the verification harness and for anybody reading the DOM:
  // which cell of the matrix this is, stated rather than inferred.
  return (
    <div data-now-audience={leagueStatus === 'connected' ? 'league' : audience} data-now-phase={season.phase} data-now-source={season.source}>
      {page}
    </div>
  )
}

function DraftBlock() {
  const shape = useEngineData(readLeagueShape)
  return (
    <Sheet code="Draft" aside="Free · no account" className="flex flex-col">
      <Headline as="h3" size="block">Run a mock against tonight&apos;s board</Headline>
      <StreamText as="p" text="Nine CPU managers drafting off real ADP. Graded the moment the last pick lands, and saved on this device." className="mt-2 text-[15px] leading-[1.55] text-v3-ink2" />
      <SampleBoard className="mt-4" />
      {shape ? (
        <dl className="mt-4 grid grid-cols-4 gap-2 rounded-[6px] bg-v3-paper p-3">
          {[['Teams', shape.teams], ['Rounds', shape.rounds], ['Seat', shape.seat ? ordinal(shape.seat) : '—'], ['Scoring', shape.format]].map(([k, v]) => (
            <div key={k} className="min-w-0"><dt><Label className="text-[11px]">{k}</Label></dt><dd className="mt-0.5 truncate font-figure text-[16px] font-bold text-v3-ink">{v}</dd></div>
          ))}
        </dl>
      ) : <div className="mt-4"><Skeleton lines={2} /></div>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <QuietButton href="#/v3/draft">Set up a mock <Icon name="arrow" className="h-4 w-4" /></QuietButton>
        <GoLink href="#/v3/draft/insights">Your insights</GoLink>
      </div>
    </Sheet>
  )
}

function LeagueBlock() {
  const { status } = useLeagueFresh()
  const items = [
    ['lineup', 'The lineup swap worth making this week, in points'],
    ['wire', 'The claim worth making, priced over replacement'],
    ['trade', 'Whether a trade is fair before you send it'],
    ['league', 'Standings with every team\'s playoff odds'],
  ]
  return (
    <Sheet code="Your league" aside="Sleeper · ESPN" className="flex flex-col">
      <Headline as="h3" size="block">Connect it and Now becomes your week</Headline>
      <ul className="mt-3 grid gap-2">
        {items.map(([icon, text]) => (
          <li key={icon} data-rise="" className="flex items-start gap-3 text-[15px] leading-[1.45] text-v3-ink2">
            <Icon name={icon} className="mt-0.5 h-5 w-5 shrink-0 text-v3-ink" />{text}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-[1.5] text-v3-ink3">Read-only. Juke never edits your league.</p>
      <div className="mt-5">
        <QuietButton href="#/v3/account">{status === 'error' ? 'Check your leagues' : 'Connect a league'}</QuietButton>
      </div>
    </Sheet>
  )
}

function RecordBlock() {
  const locker = useEngineData(readLocker)
  return (
    <Sheet code="Record" aside="On this device" className="flex flex-col">
      <Headline as="h3" size="block">Every draft you run, graded</Headline>
      {!locker ? <div className="mt-4"><Skeleton lines={3} /></div> : locker.count === 0 ? (
        <StreamText as="p" text="Nothing here yet. Your first mock lands here with a letter, where it finished in its room, and the four parts that add up to it." className="mt-2 text-[15px] leading-[1.55] text-v3-ink2" />
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-[6px] bg-v3-paper p-3"><dt><Label className="text-[11px]">Drafts</Label></dt><dd className="mt-0.5 font-figure text-[22px] font-bold tabular-nums text-v3-ink"><CountUp value={locker.count} /></dd></div>
          <div className="rounded-[6px] bg-v3-paper p-3"><dt><Label className="text-[11px]">Best finish</Label></dt><dd className="mt-0.5 font-figure text-[22px] font-bold text-v3-ink">{locker.best ? `${locker.best.grade} · ${locker.best.projectedRank}` : '—'}</dd></div>
        </dl>
      )}
      <div className="mt-auto pt-5"><GoLink href="#/v3/record">Open your record</GoLink></div>
    </Sheet>
  )
}

function NowGuest({ season, post = false }) {
  const kickoffAt = useNextKickoffAt()
  return (
    <div className="grid gap-10">
      {post ? <SeasonBand season={season} kickoffAt={kickoffAt} /> : <SituationBand />}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <div className="lg:sticky lg:top-[92px]">
          <Label>{post ? 'Juke · the season is over' : 'Juke · fantasy football, priced'}</Label>
          <Headline className="mt-3">Every call, with the math shown.</Headline>
          <p className="mt-5 max-w-[46ch] text-[18px] leading-[1.55] text-v3-ink2">
            {post ? 'The season is over, and next year’s draft is the one decision left. ' : ''}A rank tells you who goes first. Juke tells you by how much — in points over the player your league would start instead, under your scoring. Here is tonight&apos;s sharpest disagreement with the market. Change the position or the scoring and watch it move.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <CallButton href="#/v3/draft">Start a free mock draft <Icon name="arrow" className="h-4 w-4" /></CallButton>
            <QuietButton href="#/v3/players">Browse every player</QuietButton>
          </div>
          <p className="mt-4 font-figure text-[13px] text-v3-ink3">No account needed · runs in your browser</p>
        </div>
        <TheCall />
      </div>

      <section aria-labelledby="v3-desk" className="grid gap-5">
        <div className="flex items-end justify-between gap-4">
          <Headline as="h2" size="section" id="v3-desk">What you can do from here</Headline>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <DraftBlock />
          <LeagueBlock />
          <RecordBlock />
        </div>
      </section>
    </div>
  )
}
