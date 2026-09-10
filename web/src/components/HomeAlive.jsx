import { SignInButton, SignUpButton, SignedIn, SignedOut } from '@clerk/clerk-react'
import ConnectLeagueCta from './shell/ConnectLeagueCta.jsx'
import KickoffPill from './shell/KickoffPill.jsx'
import RoomsGridAlive from './RoomsGridAlive.jsx'
import HomeProof from './HomeProof.jsx'
import BoardPeek from './BoardPeek.jsx'
import { useAccountUiReady } from '../hooks/useAccountUiReady.js'
import { useLeague } from '../hooks/useLeague.js'
import { LINE as PLATFORM_LINE, LIVE_NAMES as PLATFORM_NAMES } from './shell/leaguePlatforms.js'

/* The homepage above the fold — design_handoff_v3_alive 2ag/3ag.

   One responsive tree at every width, where the homepage has had two since
   the mobile pass: a `sm:hidden` HomePhone and a `hidden sm:block` desktop
   page. That split was a real product decision at the time and this handoff
   reverses it for this screen specifically — 2ag and 3ag are the same
   content in two layouts, not two different screens, so a second copy would
   be the "written down twice" rule in markup with nothing bought for it.

   It also removes a cost Homepage.jsx's own comment already names: both
   trees were prerendered and both MOUNTED on every device, because
   CSS-hidden is still mounted. One tree mounts once.

   ---- What this replaces, and what is under it ----

   Replaces: Header (ShellHeader), Hero, RoomsGrid, and HomePhone's whole
   top half.

   Under it is the footer and nothing else. TakeAPick, ShowYourWorking and
   ClosingCta rendered here for one commit — kept on the reasoning that a
   mock which stops after one screenful is not the same claim as "delete the
   rest of the page" — and the owner has since taken all three off. So the
   page is the handoff's own shape now, which ends at the rooms grid, plus
   the footer, which was never optional: it holds the only links to the
   privacy policy and terms.

   All three components still exist unrendered in web/src/components (see
   Homepage.jsx, where the removal is recorded). Nothing here needs to know
   about them; this note exists because its previous version said they were
   still under this and that stopped being true. */

/* The hero's two icons, drawn.

   These were football and door emoji. The rooms strip below still carries
   the ROOMS `glyph` characters, and that is deliberate rather than half a
   job: CLAUDE.md records that choice — the glyph is a character so the
   legacy homepage and React can both read one array — so changing it is a
   decision about that array's consumers, not about this card. What was in
   scope is the hero, where the icons are local and answer to nothing else.

   One stroke weight, one cap style, sized to the 40px tile they sit in. */
function IconDraft({ tone }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M4.2 15.8c-1-3.6-.2-8 2.6-10.8C9.6 2.2 14 1.4 17.6 2.4c1 3.6.2 8-2.6 10.8-2.8 2.8-7.2 3.6-10.8 2.6Z"
        stroke={tone}
        strokeWidth="1.4"
      />
      <path
        d="M7.6 12.4 12.4 7.6M9.1 9.4l1.5 1.5M11 7.5l1.5 1.5M7.2 11.3l1.5 1.5"
        stroke={tone}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* A link, not an arrow into a bracket.

   The first version of this drew the arrow-into-a-bracket, which is the
   universal SIGN-IN glyph — on a card that is not sign-in, that says
   "bring your league", and that navigates to the room catalogue. The emoji
   it replaced was a door: vague, but not actively wrong. Replacing a
   generic mark with a specific and incorrect one is worse than leaving the
   generic mark, and the critique scored it exactly that way.

   Two interlocking links is the established mark for joining an external
   account to a product, which is what this card does. */
function IconConnect({ tone }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M8.4 11.6a3.4 3.4 0 0 1 0-4.8l2.4-2.4a3.4 3.4 0 0 1 4.8 4.8l-1.1 1.1"
        stroke={tone}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M11.6 8.4a3.4 3.4 0 0 1 0 4.8l-2.4 2.4a3.4 3.4 0 0 1-4.8-4.8l1.1-1.1"
        stroke={tone}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Card({ gradient, eyebrow, eyebrowColor, title, sub, glyph, href, dataHeroCta }) {
  const style = gradient
    ? { background: 'linear-gradient(100deg,#44D4E2,#82A1F6)' }
    : { background: '#151920', border: '1px solid #252930' }

  return (
    <a
      href={href}
      data-hero-cta={dataHeroCta ? '' : undefined}
      className="flex min-h-[150px] flex-col justify-between rounded-[18px] p-4 transition-transform duration-150 hover:scale-[1.01] sm:min-h-[170px] sm:rounded-[20px] sm:p-[22px]"
      style={style}
    >
      {/* A drawn tile, not an emoji.

          These were 🏈 and 🚪 at 30px, which made three icon languages on
          one page — emoji here, emoji in the rooms strip, drawn SVG in the
          header — and put the most recognisable generated-content tell
          there is on the product's first screen. This is the same 40px
          rounded tile RoomsGridAlive already gives every room card, so the
          hero and the strip below it now speak one language. */}
      <span
        className="grid h-10 w-10 place-items-center rounded-xl"
        style={gradient ? { background: 'rgba(11,14,20,0.14)' } : { background: '#0f2e34' }}
        aria-hidden="true"
      >
        {glyph}
      </span>
      <span>
        {/* 11px, not 9.

            These two eyebrows were the smallest type on the page — 9px at
            375, measured, on the two cards the whole page exists to get
            somebody to press. That is under the 10px floor even for
            smallprint, and these are not smallprint: "PRACTICE" and
            "BRING YOUR LEAGUE" are what tell a reader which card is which
            before they read the title.

            The tracking comes down with the size rather than staying at
            0.12em. Tracked caps buy legibility at small sizes by separating
            letterforms, but the cost is width, and "BRING YOUR LEAGUE" is
            17 characters in a 162px card at 375. Holding 0.12em while
            growing the type is what would push it to two lines; 0.08em
            spends the gain on the size instead, which is the half that
            actually helps somebody read it. */}
        <span
          className="block font-mono text-[11px] tracking-[0.08em] sm:tracking-[0.12em]"
          style={{ color: eyebrowColor }}
        >
          {eyebrow}
        </span>
        <span
          className="mt-1 block font-display text-[22px] font-extrabold leading-none sm:text-[28px]"
          style={{ color: gradient ? '#0D0F15' : '#fff' }}
        >
          {title}
        </span>
        {/* Two lines reserved, because these cards bottom-anchor.

            Measured at 1440: both cards top at y=482 and are both 178px
            tall with identical padding — and their titles sat 20px apart,
            at 586 against 566. `justify-between` pins the text block to the
            floor, so the Connect card's caption wrapping to two lines
            (39px against 20px) floated everything above it upward. Nothing
            was wrong with either card alone; they only disagree side by
            side, which is the one way anybody actually sees them.

            Reserved in `em` rather than px so it follows the 12px -> 13px
            step, and 4.5em below `sm` because a 163px card at 375 takes
            three lines for the platform line. Same fix RoomsGridAlive
            already uses on its hook, for the same reason. */}
        <span
          className="mt-1 block min-h-[4.5em] text-[12px] leading-[1.5] sm:min-h-[3em] sm:text-meta"
          style={{ color: gradient ? '#14343d' : '#8A9BAA' }}
        >
          {sub}
        </span>
      </span>
    </a>
  )
}

/* 3ag's three-up strip. These are the only three sentences on the page
   that say what the product does rather than what it costs, and the last
   is the same read-only promise the locked rooms make — which is exactly
   the reassurance a "connect your league" ask needs, so both right-hand
   cards carry it rather than only the guest one. Desktop only: 2ag has no
   equivalent and a phone reaches the same claims by scrolling. */
function TrustStrip() {
  return (
    <div className="mt-[22px] hidden grid-cols-3 gap-3.5 border-t border-line-hairline pt-[18px] sm:grid">
      {[
        ['One call per room', 'Draft, waivers, trades, lineups. No feeds.'],
        ['Every number, shown', 'Points over replacement, and the arithmetic behind it.'],
        ['Any platform', 'Read-only connect. We never touch your league.'],
      ].map(([title, body]) => (
        <span key={title}>
          <span className="block text-[14px] font-semibold text-white">{title}</span>
          <span className="mt-[3px] block text-meta leading-[1.4] text-ink-muted">{body}</span>
        </span>
      ))}
    </div>
  )
}

/* What 3au's "Your Next Move" card becomes when there is no league to read.

   The handoff draws a decided move there — "Claim Rico Dowdle", +6.2 over
   replacement, $12 of FAAB, confidence High — and every one of those
   numbers comes from a league this app cannot see. Rather than invent them
   or leave the slot empty, the card keeps its position and its job (the
   one thing this screen is asking you to do next) and says the thing that
   is actually true: the league is not connected, and connecting is the
   move. It becomes the real card the day there is a league behind it.

   The mocks already sync, which is why this replaces the account card
   rather than sitting beside it — signed in, "keep your drafts on every
   device" is a promise already kept.

   ---- And it stops asking once there is one ----

   The card went on saying "Connect your league" to somebody who had just
   connected one, because nothing here read the league. It does now, and
   `status` is checked rather than `league` for the reason useLeague's own
   comment gives: "we have not asked yet" and "there is none" are different
   questions, and only one of them should draw an ask. Drawing the connect
   card during the first tick would flash it at a reader who has a league
   — the same wrong-then-right the header's chip already avoids. */
function ConnectCard() {
  const { status, league, retry } = useLeague()

  // Neither card until the answer is in. This one occupies the slot the
  // handoff gives to a decided move, so a wrong guess here is the loudest
  // thing on the screen for as long as it is up.
  //
  // "loading" is the only state that draws nothing, and it is brief by
  // construction. It used to cover failures too, which is what made this
  // whole column flash on load and then vanish for good — see the write-up
  // at the top of useLeague.js.
  if (status === 'loading') return null

  /* Asked, and could not find out. Deliberately NOT the Connect card
     below: offering Connect to somebody who already has a league would
     have them reconnect one they never disconnected, which is the reason
     this state exists rather than collapsing into "none". So it says what
     happened and offers the only action that can help.

     It retries itself three times before this is ever seen, and again
     whenever the tab comes back, so anybody looking at this has a real
     problem rather than a blip. */
  if (status === 'error') {
    return (
      <div data-league-card className="rounded-[18px] border border-line-hairline bg-[#151920] p-[18px] sm:rounded-[22px] sm:p-[26px]">
        <span className="font-mono text-[11px] tracking-[0.14em] text-ink-muted">YOUR LEAGUE</span>
        <div className="mt-2 font-display text-[22px] font-bold text-white sm:mt-2.5 sm:text-[28px]">
          Couldn&rsquo;t check your league
        </div>
        <p className="mb-3.5 mt-1.5 text-[14px] leading-[1.5] text-voidInk-body sm:mb-[18px] sm:mt-2">
          Your account is fine and nothing has been disconnected — we just could not reach it to
          find out which league is yours. Mock drafts are unaffected and need no account.
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
            className="text-meta text-ink-muted underline-offset-2 hover:underline"
          >
            Start a mock draft
          </a>
        </div>
        <TrustStrip />
      </div>
    )
  }

  if (status === 'connected' && league) {
    return (
      <div data-league-card className="rounded-[18px] border border-line-hairline bg-[#151920] p-[18px] sm:rounded-[22px] sm:p-[26px]">
        <span className="font-mono text-[11px] tracking-[0.14em] text-teal">YOUR LEAGUE</span>
        <div className="mt-2 truncate font-display text-[22px] font-bold text-white sm:mt-2.5 sm:text-[28px]">
          {league.name}
        </div>
        <p className="mb-3.5 mt-1.5 text-[14px] leading-[1.5] text-voidInk-body sm:mb-[18px] sm:mt-2">
          {league.season ? `${league.season} · ` : ''}
          {league.totalTeams ? `${league.totalTeams} teams · ` : ''}
          read-only. My League reads it today; Waiver, Trade and Strategy open as they are
          built.
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <a
            href="#/my-league"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full px-5 py-3 text-[14px] font-bold text-surface-page transition-transform duration-150 hover:scale-[1.02]"
            style={{ background: 'linear-gradient(100deg,#44D4E2,#82A1F6)' }}
          >
            Open My League
          </a>
          <a href="#/you" className="text-meta text-ink-muted underline-offset-2 hover:underline">
            Manage
          </a>
        </div>
        <TrustStrip />
      </div>
    )
  }

  return (
    <div data-league-card className="rounded-[18px] border border-line-hairline bg-[#151920] p-[18px] sm:rounded-[22px] sm:p-[26px]">
      <span className="font-mono text-[11px] tracking-[0.14em] text-teal">YOUR NEXT MOVE</span>
      <div className="mt-2 font-display text-[22px] font-bold text-white sm:mt-2.5 sm:text-[28px]">
        Connect your league
      </div>
      <p className="mb-3.5 mt-1.5 text-[14px] leading-[1.5] text-voidInk-body sm:mb-[18px] sm:mt-2">
        One connect opens My League — your real standings, read the moment it lands. Waiver,
        Trade and Strategy open as they are built.
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        <ConnectLeagueCta variant="gradient" />
        <span className="text-meta text-ink-muted">{PLATFORM_LINE}</span>
      </div>
      <TrustStrip />
    </div>
  )
}

function AccountCard() {
  const ready = useAccountUiReady()

  const signup = (
    <button
      type="button"
      className="flex-1 whitespace-nowrap rounded-full px-3 py-3 text-[14px] font-bold text-surface-page transition-transform duration-150 hover:scale-[1.02] sm:px-5"
      style={{ background: 'linear-gradient(100deg,#44D4E2,#82A1F6)' }}
    >
      Sign up
    </button>
  )
  const login = (
    <button
      type="button"
      className="flex-1 whitespace-nowrap rounded-full border border-flow-pillEdge px-3 py-3 text-[14px] font-semibold text-voidInk-primary transition-colors duration-150 hover:border-white/30 sm:px-5"
    >
      Log in
    </button>
  )

  const card = (
    <div className="rounded-[18px] border border-line-hairline bg-[#151920] p-[18px] sm:rounded-[22px] sm:p-[26px]">
      {/* The OPTIONAL eyebrow is gone, for two reasons that point the
          same way. It made the largest object on the right half announce
          its own dispensability, and an eyebrow above a heading is a label
          the heading already carries. The honesty it was doing is not
          lost: the body still says mocks run fine without an account, and
          the hero's own caption still says "Free · no account needed". */}
      <div className="font-display text-[22px] font-bold text-white sm:text-[28px]">
        Keep your drafts on every device
      </div>
      <p className="mb-3.5 mt-1.5 text-[14px] leading-[1.5] text-voidInk-body sm:mb-[18px] sm:mt-2">
        An account saves your mocks and unlocks league connect — {PLATFORM_NAMES} today, more
        to come. Mocks still run fine without one.
      </p>
      <div className="flex gap-2 sm:gap-2.5">
        {ready ? (
          <>
            <SignUpButton mode="modal">{signup}</SignUpButton>
            <SignInButton mode="modal">{login}</SignInButton>
          </>
        ) : (
          <>
            {signup}
            {login}
          </>
        )}
      </div>

      <TrustStrip />
    </div>
  )

  /* Signed in there is nothing left to offer: the mocks already sync. The
     whole card goes rather than the buttons alone, which is the rule
     HomePhone's own account card already follows — a card whose entire
     purpose is two controls has nothing to say without them. Without a
     Clerk key there is no SignedOut to render inside, so the card stands
     on its own and simply opens nothing, the same fallback every other
     account surface here makes. */
  if (!ready) return card
  return <SignedOut>{card}</SignedOut>
}

export default function HomeAlive() {
  /* Read here rather than inside the footer line's own branch: <SignedOut>
     throws without a ClerkProvider ancestor, and main.jsx renders no
     provider at all in a keyless build. A keyless clone therefore shows the
     line unconditionally, which is correct for it — nobody can be signed in
     there. Same shape as AccountCard above. */
  const ready = useAccountUiReady()

  /* The hero's second card names the connected league rather than going on
     advertising a connect. One read, shared with every other useLeague()
     on the page — see that hook's own note on why it is one request and
     one answer now rather than one per component. */
  const { status: leagueStatus, league: connectedLeague } = useLeague()

  /* Signed out only, and the reason is that it stops being true: "no
     account needed" is a promise to somebody deciding whether to make one,
     and it reads as a shrug to somebody who already has. Built here rather
     than inline because it sits inside the rooms header row below, and
     <SignedOut> throws without a ClerkProvider ancestor — main.jsx renders
     none in a keyless build, where showing it unconditionally is correct
     since nobody can be signed in there. */
  const deviceLineText = (
    <span className="font-mono text-[10px] tracking-[0.14em] text-voidInk-muted">
      FREE · NO ACCOUNT NEEDED · RUNS IN YOUR BROWSER
    </span>
  )
  const deviceLine = ready ? <SignedOut>{deviceLineText}</SignedOut> : deviceLineText

  return (
    <div className="relative overflow-hidden pb-6 pt-[22px] sm:pb-14 sm:pt-10">
      {/* The watermark is the mark itself at 12%, not a background image:
          one file, already in web/public, already the one copy of the
          geometry every icon in the project is generated from. */}
      <img
        src="/juke-shark-mark.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-[90px] -top-[30px] w-[260px] object-contain opacity-[0.12] sm:-right-[160px] sm:-top-20 sm:w-[620px]"
      />

      {/* px lives INSIDE the max-width, not on the full-bleed wrapper
          above. Outside it the column comes out the full 1280 and starts
          40px left of ShellHeader's own content, which is measurable
          (measured 3 Sep 2026 at 1440: hero H1 at x=73 against a wordmark
          at 113) and reads as the header being inset rather than the page
          being wide. Every other screen — ShellHeader, RoomsLobby,
          DraftsScreen, YouScreen — has always put it inside; this one and
          RoomHero were the two that did not.

          The wrapper stays full-bleed so the watermark still bleeds to the
          viewport edge. Its own offsets carry the 20/40px the wrapper gave
          up, so it lands exactly where it did. */}
      <div className="relative mx-auto max-w-[1280px] px-5 sm:px-10">
        <div className="lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-12">
          <div>
            {/* gap-2 below `sm`, not gap-3. Measured at 375px: the eyebrow
                is 194 and the pill 136, which with a 12px gap comes to 342
                in a 335px row — seven pixels over, clipped silently by this
                block's own `overflow-hidden` and therefore invisible to the
                page-level overflow sweep. The handoff's own row is drawn at
                390px (350 usable), where it fits; 375 is a real device it
                does not. Four pixels here and four off the pill's padding
                is what buys it back. */}
            {/* flex-wrap, and it is a safety net rather than a layout.

                At today's copy and today's countdown this is one row, which
                is what the design draws. What wrap buys is the failure mode
                when it is not: the hero has `overflow-hidden`, so a row that
                is too wide is CLIPPED and reports no page overflow at all —
                KickoffPill's own note below already records that exact trap,
                found the first time this row ran out of room. Wrapping is
                the repair the truncation rule actually asks for: an element
                that overflows must be able to scroll, ellipsise, or break.

                The countdown is not a fixed width — `4D 20:57` becomes
                `10D 23:59` twice a season — so a row tuned to the pill in
                front of you is a row that clips itself in six days. */}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 sm:gap-x-3">
              {/* whitespace-nowrap because a flex item shrinks below its own
                  content by default, and this one has room.

                  The size step below `sm` is the display face's, and the
                  numbers moved with it. Barlow Condensed set this at 194px
                  of a 335px row with the pill taking ~132 beside it — nine
                  pixels of slack, which is what the note under KickoffPill
                  is about. Gabarito is a third wider (see CLAUDE.md's own
                  measurement) and put the identical string at **243px**, so
                  the pill went off the right edge of a 375px phone and the
                  hero quietly clipped it.

                  11px at 0.07em brings it to 191 and the row fits again. It
                  is a real step down from the design's 13, and it is the
                  cheaper of the two honest answers: the other is to give the
                  pill its own line, which costs 28px of vertical above the
                  headline on the one screen where that is most expensive. */}
              {/* data-hero-eyebrow marks the first thing under the header,
                  which is what phone.spec.mjs measures the gap to. An
                  attribute rather than a text or element match, because
                  that check has now been broken twice by the copy's casing
                  and once by the element changing from a span to a p —
                  none of which is what it is testing. */}
              <span
                data-hero-eyebrow
                className="whitespace-nowrap font-display text-[11px] font-bold italic tracking-[0.07em] text-mint sm:text-[14px] sm:tracking-[0.12em]"
              >
                AGILITY THROUGH ANALYTICS
              </span>
              {/* ShellHeader carries this above `sm`; here below it. See
                  that file's own note on the two homes. */}
              <KickoffPill className="sm:hidden" />
            </div>

            {/* Fluid, not four hard steps, because the failure was a rag rather
                than a size.

                At 88px the H1 measured 634x317 in a 634px column — four
                rendered lines reading KNOW THE / MOVE / BEFORE YOUR /
                LEAGUE., with MOVE orphaned mid-phrase. "KNOW THE MOVE"
                simply does not fit the column at 88 or at 80; measured, 76
                is the largest size that holds it on one line, and the whole
                headline then falls to three lines.

                But 76 only has 23px of slack at 1440, and the `lg` column
                narrows to about 493px at 1024 — so a single `lg:` step
                would wrap again at the bottom of its own breakpoint. The
                clamp scales with the viewport instead: measured 3 lines
                everywhere from 1024 up, where the step version was 4.

                50px on a phone, and that is a floor rather than a
                preference. The column is 335px there and "KNOW THE MOVE"
                needs roughly 40px type to fit it on one line, which is too
                small for the first thing anybody reads. So the phone keeps
                four lines and gets 180px of height instead of 243 — a
                quarter of the viewport back, on the screen where that
                matters most. */}
              <h1 className="mt-3.5 font-display text-[clamp(3.125rem,5.4vw,4.75rem)] font-extrabold uppercase italic leading-[0.9] text-white sm:mt-4">
              {/* The space is real, not decorative. `<br />` yields no
                  character, so the accessible name came out
                  "Know the movebefore your league." and some assistive
                  tech announces it that way. A space before the break
                  costs nothing visually and fixes the string. */}
              Know the move{' '}
              <br />
              <span className="text-mint">before your league.</span>
            </h1>

            {/* 16px on a phone, which is the ordinary web body floor rather than
                a preference. This is the page's primary prose, and the pass that
                collapsed a 15px step into 14 pushed it the wrong way -- fewer
                sizes is not the goal, roles that carry different jobs is. Card
                copy stays at 14: a two-up grid is the denser role the floor
                allows an exception for, and the hero subhead is not. */}
            <p className="mt-3.5 max-w-[44ch] text-[16px] leading-[1.45] text-voidInk-body sm:mt-[22px] sm:text-[18px] sm:leading-[1.5]">
              {/* PLATFORM_NAMES, never "any major platform".

                  Two of four platforms are built, and the Connect card 200px
                  below has always said so -- so the headline claim was
                  corrected by an 11px caption further down the page, which
                  this file's own comment at the caption already described as
                  its job. A caption is a footnote, not a correction, and
                  being caught overclaiming once costs the credit the next
                  3,000px of proof is trying to earn -- on the page whose
                  whole thesis is that adjectives are not evidence.

                  Derived rather than typed, for leaguePlatforms.js's own
                  reason: "Sleeper today, more to come" was still on this
                  page the day ESPN shipped. */}
              Plug in your league from {PLATFORM_NAMES}. Juke tracks who&apos;s rising, who&apos;s
              fading, and which room to handle it in.
            </p>

            <div className="mt-5 grid max-w-[560px] grid-cols-2 gap-2.5 sm:mt-7 sm:gap-3">
              {/* data-hero-cta: sonar.spec.mjs hit-tests this to tell an
                  overlay that has really gone from one that is merely
                  transparent. It goes on the primary action, which on this
                  page is the gradient card rather than a button — the
                  marker follows the job, not the element. Losing it is
                  what the mobile pass already recorded once: splitting a
                  page orphans every attribute only one half of it
                  carries, and the failure reads as a missing element
                  rather than a missing marker. */}
              <Card
                gradient
                dataHeroCta
                glyph={<IconDraft tone="#0D2E36" />}
                eyebrow="PRACTICE"
                eyebrowColor="#14343d"
                title="Mock Draft"
                sub="Free · no account needed"
                href="#/rooms/draft"
              />
              {/* Connect goes to the rooms rather than straight at a
                  sign-up modal: the handoff's own global rule is that
                  every connect route goes through account creation first,
                  so the honest destination for somebody without a league
                  is the place that shows what connecting buys.

                  Once there IS one it goes to My League and says which
                  league, rather than continuing to advertise a connect
                  that has already happened — #/my-league directly, not
                  the retired #/rooms/league, which only ever existed to
                  bounce here (RoomPage.jsx's own comment: "League
                  graduated into its own screen"). `sub` was a bare list
                  of four platforms and is the shared line now — three of
                  those four are not built, and a caption that reads as
                  four working integrations is what this whole change is
                  about. */}
              <Card
                glyph={<IconConnect tone="#00E5FF" />}
                eyebrow={leagueStatus === 'connected' && connectedLeague ? 'YOUR LEAGUE' : 'BRING YOUR LEAGUE'}
                eyebrowColor="#00E5FF"
                title={leagueStatus === 'connected' && connectedLeague ? connectedLeague.name : 'Connect'}
                sub={leagueStatus === 'connected' && connectedLeague ? 'Connected · read-only' : PLATFORM_LINE}
                href={leagueStatus === 'connected' && connectedLeague ? '#/my-league' : '#/rooms'}
              />
            </div>

            {/* The read-only promise, at every width, next to the ask.

                It lived only in TrustStrip, which is `hidden sm:grid` — so
                measured across the entire 375px page text, "read-only"
                occurred 0 times and "never touch your league" occurred 0
                times. The page asks for a league connection three times and
                on the device most visitors use it never said what it does
                with one. PRODUCT.md names read-only as a promise, and
                TrustStrip's own comment claimed "a phone reaches the same
                claims by scrolling", which was checked and is false.

                Here rather than inside the Connect card's caption: that
                caption already carries the platform line, which is what
                corrects the subhead's "any major platform" 200px above, and
                a third line in one card of a two-card grid is also what
                pushes the two titles out of alignment. A row under both
                cards belongs to the ask without belonging to one card. */}
            <p className="mt-2.5 max-w-[560px] font-mono text-[11px] uppercase tracking-[0.1em] text-voidInk-muted">
              Read-only &middot; Juke never edits your league
            </p>

            {/* ?friends=1, not bare #/rooms/draft.

                This row was the fifth link on the page pointing at the
                same place as the Mock Draft card 40px above it, and it is
                the one whose words promise something the other four do
                not. Landing on the identical screen makes the sentence
                read as a restatement of the card rather than a second
                door, and the multiplayer flow behind it is a row the
                reader then has to go and find. DraftRoom.jsx reads the
                parameter and opens DraftWithFriendsModal on arrival. */}
            <a
              href="#/rooms/draft?friends=1"
              className="mt-2.5 flex max-w-[560px] items-center justify-between gap-3 rounded-[14px] border border-dashed border-flow-pillEdge px-4 py-3 text-[14px] text-voidInk-primary transition-colors duration-150 hover:border-teal/50 sm:px-[18px] sm:py-3.5"
            >
              <span className="flex items-center gap-2.5">
                Or draft with friends — same board, real managers
              </span>
              <span className="text-ink-muted" aria-hidden="true">
                ›
              </span>
            </a>
          </div>

          <div className="mt-[18px] space-y-3 lg:mt-9">
            {/* The board leads this column now.

                Measured on the built page: this half was empty from y=517
                to y=916 and the loudest thing in it was a card labelled
                OPTIONAL, while the one asset no competitor has did not
                appear until y=916 — below the fold, after the visitor had
                already decided whether to keep reading. BoardPeek puts
                five real players and five checkable numbers on the first
                screen and fills the void the watermark was sitting behind
                rather than filling.

                Above the account ask rather than below it, because the
                page's own binding promise is that a solo mock needs
                neither. Reading order is now: what this knows, then what
                an account would add. */}
            <BoardPeek />

            {/* 3ag puts the account card here and 3au puts the decision
                card. Same slot, same job — "the one thing to do next" —
                and which one is true depends on whether there is an
                account yet. */}
            {!ready ? (
              <AccountCard />
            ) : (
              <>
                <SignedOut>
                  <AccountCard />
                </SignedOut>
                <SignedIn>
                  <ConnectCard />
                </SignedIn>
              </>
            )}
          </div>
        </div>

        {/* The page's argument, between the offer and the rooms.

            It sits here rather than under RoomsGridAlive because the rooms
            are the answer to "what else is there", which is a question
            somebody only has after they believe the first screen. Proof
            before catalogue. */}
        <HomeProof />

        <div className="mt-[26px] sm:mt-12">
          {/* The device line sits on this row, right-aligned against the
              section label — 3ag puts it there, not at the foot of the
              page where this build had it. `justify-between` with a
              baseline alignment is the handoff's own rule. */}
          {/* Wraps below `sm`, and that is a fix rather than a tidy-up.

              Measured at 375: "THE ROOMS" wrapped to two lines ending at
              x=76 and the device line wrapped to two starting at x=88 —
              twelve pixels between two wrapped blocks in a
              `justify-between` baseline row, which reads as a collision
              because it is one. Neither string can shrink (both are
              tracked mono caps), so the row cannot hold them side by side
              at this width and should stop trying. The device line takes
              its own line on a phone and rejoins the baseline at `sm`. */}
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5 sm:mb-3.5 sm:flex-nowrap">
            <span className="font-mono text-[11px] tracking-[0.14em] text-voidInk-primary">
              THE ROOMS
            </span>
            {deviceLine}
          </div>
          {/* Five across on a desktop, not the lobby's three: 3ag/3au
              draw this section as one `repeat(5,1fr)` strip. */}
          <RoomsGridAlive columns="home" />
        </div>

        {/* A closing action, because the page had none.

            ClosingCta was removed with the two proof sections, so the last
            interactive thing before the footer was a padlocked room card
            and the final line was a data-provenance note. Peak-end says the
            ending shapes memory out of proportion to its length, and this
            one ended on absence — five rooms, three of them locked, then
            copyright.

            It repeats the hero's own action rather than introducing a new
            one: by this point the reader has seen four pairs of arithmetic,
            and the honest ask is the same one the page opened with. The
            line under it is the binding promise from PRODUCT.md, which is
            also the answer to the objection three padlocks just raised —
            most of this needs nothing from you. */}
        <div className="mt-12 border-t border-line-hairline pt-8 text-center sm:mt-16 sm:pt-10">
          <a
            href="#/rooms/draft"
            className="inline-flex min-h-[44px] items-center rounded-full px-7 text-[14px] font-semibold text-[#0D0F15] transition-transform duration-150 hover:scale-[1.02]"
            style={{ background: 'linear-gradient(100deg,#44D4E2,#82A1F6)' }}
          >
            Start a mock draft
          </a>
          <p className="mt-3.5 font-mono text-[11px] uppercase tracking-[0.12em] text-voidInk-muted">
            Free · no account · runs in your browser
          </p>
        </div>

      </div>
    </div>
  )
}
