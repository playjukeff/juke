import { retryLeagues } from '../../../hooks/useLeague.js'
import { tierLabel } from '../../../lib/tiers.js'
import { CallButton, GoLink, Headline, Icon, Label, QuietButton, Sheet, cx } from '../ui.jsx'
import { ConnectCall } from '../league/parts.jsx'
import { TheCall, SituationBand } from './TheCall.jsx'
import {
  LockerCard, Movers, PassCard, SampleWeek, SeasonBand, Slate, StillDrafting, Welcome, useLockerSummary,
} from './parts.jsx'
import { bucketOf, useMovers, useNextKickoffAt, useSlate } from './season.js'

/* Now, signed in, with no league Juke can read.

   Two audiences and one that is not known yet:

     free     a welcome, their own locker, and an honest prompt towards the
              plan that would put a league on this page — the prompt is the
              page's one cobalt action in season (a mock has stopped being
              the thing to do) and a quiet card before it
     sub      paying for a league Juke has not been given: connecting it is
              the one primary action, in every phase
     unknown  signed in, and the plan could not be read yet (or at all).
              No prompt either way — selling Season Pass to somebody who
              may already be paying for it is the flash a gate must never
              make — and no guess at the plan's name

   ---- Why the NFL phase decides this page and not a connected one ----

   With no league the NFL calendar is the only clock there is: in the
   preseason the draft is the decision, in season the week is, and once
   the season is over next year's draft is again. The page's own layout is
   one frame for all three — a welcome and its action on the left, the
   one thing worth a glance on the right — so the three read as the same
   place at different times of year rather than three products. */

function Lede({ audience, bucket, week, season, plan }) {
  const pro = tierLabel('pro')
  if (audience === 'free') {
    if (bucket === 'season') return <>Week {week} is on. {pro} puts your league on this page — the matchup, the lineup swap, the claim — with the arithmetic printed beside each.</>
    if (bucket === 'post') return <>{season ? `The ${season} season is over.` : 'The season is over.'} Next year’s draft is the one decision left, and it is the one you can practise tonight.</>
    return <>Tonight’s board is priced and your next mock is one press away. When your league drafts, {pro} is what puts it on this page.</>
  }
  if (audience === 'sub') {
    if (bucket === 'season') return <>Week {week} is on and your {plan} has no league to read yet. Connect it and this page becomes week {week}: the matchup, the lineup swap, the claim.</>
    if (bucket === 'post') return <>The season is over and your {plan} has no league to read. Connect it now and this page is ready the day it drafts.</>
    return <>Your {plan} has no league to read yet. Connect it and this page counts down to your draft, then becomes your week.</>
  }
  if (bucket === 'season') return <>Week {week} is on. Your mocks and your record are below.</>
  return <>Tonight’s board is priced and your next mock is one press away.</>
}

function MockButton({ primary, inProgress }) {
  const label = inProgress ? 'Resume your mock' : 'Run a mock'
  return primary
    ? <CallButton href="#/draft">{label} <Icon name="arrow" className="h-4 w-4" /></CallButton>
    : <QuietButton href="#/draft">{label}</QuietButton>
}

export default function NowMember({ audience, tier, season, leagueStatus, tierStatus, onRetryTier }) {
  const bucket = bucketOf(season.phase)
  const inSeason = bucket === 'season'
  const week = season.week
  const kickoffAt = useNextKickoffAt()
  const locker = useLockerSummary()
  const games = useSlate(inSeason)
  const movers = useMovers(inSeason)
  const plan = audience === 'sub' ? tierLabel(tier) : audience === 'free' ? tierLabel('free') : null
  const leagueFailed = leagueStatus === 'error'

  const where = inSeason ? (week ? `week ${week}` : 'in season') : bucket === 'post' ? 'the season is over' : null
  const label = ['Now', plan ? `${plan} plan` : null, where].filter(Boolean).join(' · ')

  /* The one primary action, by audience and phase — never two. */
  let actions
  if (audience === 'sub') {
    actions = leagueFailed ? (
      <QuietButton onClick={retryLeagues}>Check your leagues again</QuietButton>
    ) : (
      <>
        <ConnectCall primary label="Connect your league" />
        {!inSeason ? <MockButton primary={false} inProgress={!!locker.inProgress} /> : null}
      </>
    )
  } else if (audience === 'free') {
    actions = inSeason
      ? <MockButton primary={false} inProgress={!!locker.inProgress} />
      : (
        <>
          <MockButton primary inProgress={!!locker.inProgress} />
          <span className="self-center"><GoLink href="#/draft/insights">Your insights</GoLink></span>
        </>
      )
  } else {
    actions = inSeason
      ? <QuietButton href="#/account">Account and leagues</QuietButton>
      : <MockButton primary inProgress={!!locker.inProgress} />
  }

  let right
  if (inSeason) right = audience === 'free' ? <PassCard week={week} primary inSeason /> : <SampleWeek week={week} code={audience === 'sub' ? 'What Now becomes · sample' : 'Sample week · what Now shows'} />
  else right = <LockerCard summary={locker} />

  const both = !!(games && movers.length)

  return (
    <div className="grid gap-10">
      {inSeason || bucket === 'post' ? <SeasonBand season={season} kickoffAt={kickoffAt} /> : <SituationBand />}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <div>
          <Label>{label}</Label>
          <Headline className="mt-3"><Welcome /></Headline>
          <p className="mt-5 max-w-[46ch] text-[18px] leading-[1.55] text-v3-ink2">
            <Lede audience={audience} bucket={bucket} week={week} season={season.season} plan={plan} />
          </p>
          <div className="mt-7 flex flex-wrap gap-3">{actions}</div>
          {leagueFailed ? (
            <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.5] text-v3-ink2" role="alert">Juke could not check whether you have a league connected, so it is not going to guess and ask you to connect one you may already have.</p>
          ) : null}
          {audience === 'unknown' && tierStatus === 'error' ? (
            <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.5] text-v3-ink2" role="status">
              Juke could not read your plan just now.{' '}
              <button type="button" onClick={onRetryTier} className="inline-flex min-h-[44px] items-center font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">Try again</button>
            </p>
          ) : null}
          {inSeason && audience !== 'free' ? (
            <div className="mt-8 max-w-[520px]"><LockerCard summary={locker} compact /></div>
          ) : null}
        </div>
        {right}
      </div>

      {inSeason ? (
        <>
          {audience === 'free' ? (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <SampleWeek week={week} />
              <LockerCard summary={locker} compact />
            </div>
          ) : null}
          {games || movers.length ? (
            <section aria-labelledby="v3-now-week" className="grid gap-5">
              <h2 id="v3-now-week" className="sr-only">This week in the NFL</h2>
              <div className={cx('grid grid-cols-1 items-start gap-4', both && 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]')}>
                <Slate games={games} kickoffAt={kickoffAt} />
                <Movers rows={movers} week={week} />
              </div>
            </section>
          ) : null}
          <StillDrafting />
        </>
      ) : (
        <section aria-labelledby="v3-now-board" className="grid gap-5">
          <Headline as="h2" size="section" id="v3-now-board">Tonight’s sharpest call</Headline>
          {audience === 'free' ? (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <TheCall />
              <PassCard />
            </div>
          ) : (
            <TheCall />
          )}
        </section>
      )}
    </div>
  )
}

/* Signed in, and the league store has not answered yet. The page's own
   frame with nothing in it — never the guest page, which would offer to
   connect a league somebody may already have. */
export function NowMemberLoading() {
  return (
    <div className="grid gap-10" aria-busy="true">
      <div className="h-[44px] animate-pulse rounded-[6px] bg-v3-well" />
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <div className="grid gap-4">
          <div className="h-4 w-40 animate-pulse rounded-[4px] bg-v3-well" />
          <div className="h-16 w-4/5 animate-pulse rounded-[6px] bg-v3-well" />
          <div className="h-20 w-full animate-pulse rounded-[6px] bg-v3-well" />
        </div>
        <Sheet band={false}><div className="h-48 animate-pulse rounded-[4px] bg-v3-well" /></Sheet>
      </div>
      <p className="font-figure text-[13px] uppercase tracking-[0.1em] text-v3-ink3">Checking which league is yours…</p>
    </div>
  )
}
