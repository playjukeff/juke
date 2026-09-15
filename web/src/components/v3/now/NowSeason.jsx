import { tierLabel } from '../../../lib/tiers.js'
import { LINE as PLATFORM_LINE } from '../../shell/leaguePlatforms.js'
import { Headline, Label, cx } from '../ui.jsx'
import { ConnectWayIn, Movers, SampleWeek, SeasonBand, Slate, StillDrafting } from './parts.jsx'
import { useMovers, useNextKickoffAt, useSlate } from './season.js'

/* Now, signed out, during the regular season.

   The preseason page sells a mock draft, and from week one a mock draft is
   the wrong thing to sell: nobody is drafting in October. What sells Juke
   from September to December is the week, so this page is the week.

     the band   which week of which season, and when the next game kicks off
     the hero   bring your league — connecting is the one primary action —
                beside the in-season tools working on the SAMPLE league:
                the matchup, the lineup call, the claim, the trade question,
                each figure the one its own tool opens on
     below      this week's slate off the score strip's own feed, and who
                moved (JukeEngine.playerMovers) when the engine says anybody
                did; either is simply absent when it has nothing to say
     last       the mock draft, still one press away, out of the hero

   ---- The fine print is the real ladder ----

   Connecting needs an account and a plan that connects a league
   (tiers.js's LEAGUE_CAP: Free connects none), and that plan is not on
   sale. The button still says what it is for — connecting is what the page
   is about — and the line under it says what connecting takes, rather than
   letting somebody find out at the end of a sign-up. */

export default function NowSeason({ season }) {
  const kickoffAt = useNextKickoffAt()
  const games = useSlate(true)
  const movers = useMovers(true)
  const week = season.week
  const both = !!(games && movers.length)
  return (
    <div className="grid gap-10">
      <SeasonBand season={season} kickoffAt={kickoffAt} />

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <div className="lg:sticky lg:top-[92px]">
          {/* data-hero-eyebrow: the first thing under the fixed header,
              which is what phone.spec.mjs measures the gap to. An attribute
              rather than the words, because the words are seasonal here and
              uppercased in CSS - the two ways that match has already broken.
              Its twin is on Now.jsx's own eyebrow. */}
          <Label data-hero-eyebrow>{['Now', week ? `week ${week}` : 'in season', season.season].filter(Boolean).join(' · ')}</Label>
          <Headline className="mt-3">{week ? `Week ${week} is here.` : 'The season is on.'} Bring your league.</Headline>
          <p className="mt-5 max-w-[46ch] text-[18px] leading-[1.55] text-v3-ink2">
            Juke reads your league and makes the week’s calls — who to start, who to claim, whether a trade is fair — each with the arithmetic printed beside it. This is what that looks like on a sample league, on tonight’s real players.
          </p>
          <div className="mt-7"><ConnectWayIn /></div>
          <p className="mt-4 max-w-[46ch] text-[13px] leading-[1.5] text-v3-ink3">
            Read-only: Juke never edits your league. {PLATFORM_LINE}. Connecting needs a free account and {tierLabel('pro')}, which is not on sale yet.
          </p>
        </div>
        <SampleWeek week={week} />
      </div>

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
    </div>
  )
}
