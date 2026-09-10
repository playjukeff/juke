import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import ScoringDemoCard from './ScoringDemoCard.jsx'

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background glow, per the brief — an ellipse behind the text
          column rather than a full-bleed band, so it reads as depth on the
          void background rather than a second surface. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-44 left-1/2 h-[620px] w-[1100px] -translate-x-[30%]"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(34,211,238,0.11), rgba(123,31,162,0.05) 45%, transparent 70%)',
        }}
      />

      {/* pt is responsive, and it has to be. 72px is the desktop rhythm and it
          was unconditional, so a 375px phone inherited a padding scaled for a
          1200px column: measured, that put the eyebrow 71px under a 57px
          header where artboard 1a puts it at 36. Not the 149px the phone spec
          was originally written against, but past what it allows, and past it
          for the same reason — a vertical measurement that stands in for
          desktop proportion has to be as responsive as the proportion is.
          36px on a phone, the artboard's own figure; 72 from lg up, unchanged. */}
      <div className="relative mx-auto grid max-w-[1200px] gap-[72px] px-10 pb-0 pt-9 lg:pt-[72px] lg:grid-cols-[1.05fr_1fr] lg:items-center">
        {/* min-w-0: a CSS grid item's default min-width is auto, not 0, so
            without this a wide-enough descendant visually spills past this
            column's actual track instead of being constrained to it — the
            grid track itself still reports the right width, only an
            unbounded child's rendered content ignores it. Originally caught
            via PhaseRail's own mobile scroll row (its overflow-x-auto had
            nothing bounded to scroll within); that component moved to
            RoomsGrid.jsx in the homepage cosmetic revision (§8), but the fix
            belongs on the grid item regardless of what's inside it, so it
            stays as a standing guard against the same failure recurring. */}
        <motion.div
          className="min-w-0"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Homepage cosmetic revision §11 — was a mint pill with a
              pulsing dot, the same visual language as the "Live" status
              badge elsewhere on the page, so it read as a status
              indicator ("this is live/on") rather than a tagline. Now a
              typographic slogan: a short rule, then the words in
              font-display (the handoff's own allowance — "if production
              already ships an italic display face, keep it") rather than
              a pill. No pill, no dot, and margin-
              bottom on this element (not margin-top on the h1 below it)
              is what now owns the gap between the two. */}
          <div className="flex items-center gap-[14px] mb-[22px]">
            <span className="h-px w-8 shrink-0" style={{ background: '#3E9886' }} />
            {/* data-hero-eyebrow — see HomePhone.jsx's copy of this note. */}
            <span data-hero-eyebrow className="font-display text-[19px] font-extrabold italic uppercase tracking-[0.03em] text-mint">
              Agility Through Analytics
            </span>
          </div>

          {/* One headline at every width, in font-display.
              The phone used to get its own 39px Archivo 900 sentence; the
              revised handoff retires it for the reason its own note gives —
              Archivo is the wordmark's face, and every section header on
              this page is font-display, so a display headline in a second
              face is the odd one out rather than the phone-specific choice
              it looked like.

              46px/700 at 1.04 below sm is the handoff's own value. sm and
              above keep exactly the sizes and the 800 weight they already
              had, so this is a change to the phone and to nothing else —
              the earlier note about 64px being a ~1440px capture still
              holds for the steps above.

              A condensed face is what makes 46px fit 390px at all: "Master
              the draft." at 39px Archivo was already close to the padding,
              and this is seven points larger. */}
          <h1 className="text-balance font-display text-[clamp(42px,5.4vw,76px)] font-extrabold italic leading-[0.94] tracking-[-0.005em]">
            <span className="text-white">Master the Draft.</span>
            <br />
            <span className="text-mint">Dominate the Season.</span>
          </h1>

          {/* One paragraph at both widths.

              These were two entirely different sentences at one point —
              phone and desktop each had their own — which is a different
              message about the product depending on the width of the window
              it is read in. Reported from the live site as exactly that, and
              unified to one sentence, read at every width, for that reason.

              The second sentence used to name Juke Pro and Juke All-Access
              as unlockable tiers directly. Phase 0 has no purchase behind
              either name — the rooms are in build, not for sale — so
              stating them as something a visitor could "unlock" today would
              be a claim the product can't back. The badges themselves stay
              exactly where they are on the Rooms cards below: those read as
              roadmap labels rather than an offer, which is the distinction
              this sentence couldn't make. Price still lives only in the
              mono line under the CTA pair. */}
          <p className="mt-4 max-w-[520px] text-pretty text-[19px] leading-[1.5] text-voidInk-body lg:mt-6">
            Test your strategy in the Draft Room completely free. Waivers, trades and week-to-week tools are in
            build.
          </p>

          {/* Two stacked 54px CTAs, mobile only. The secondary is "Explore
              The Rooms" pointing at #rooms — desktop's own pair, rather than
              the "See how it works" → #proof this used to carry. Both are
              live destinations on this page; what decided it is that the
              hero's job here is to hand the reader the brand's shape (one
              room live, five coming) rather than to re-explain the method
              the section directly below is already the proof of.

              The primary is "Enter the Draft Room", which is now the only
              CTA string on the page — Header.jsx's sticky bar and
              ClosingCta.jsx's band say it too. ClosingCta's own comment
              already required the band and the hero to be identical at
              every width; that rule is unchanged, all three strings just
              moved together. */}
          <div className="mt-8 flex flex-col gap-3 lg:hidden">
            {/* data-hero-cta is what Header.jsx's sticky bottom bar watches,
                so it can stand down while this button is on screen rather than
                floating the same CTA over it. A data attribute rather than an
                id: there are two of these (this one and desktop's below) and
                only one is ever rendered, so an id would be a lie at one width
                or a duplicate at both. */}
            <a
              href="#/drafts"
              data-hero-cta=""
              className="flex h-[54px] w-full items-center justify-center rounded-full text-[17px] font-bold text-[#0B0D12]
                         transition-all duration-200 active:scale-[0.98]"
              style={{
                background: 'linear-gradient(100deg, #44D4E2, #82A1F6)',
                boxShadow: '0 10px 34px -14px rgba(63,177,234,0.7)',
              }}
            >
              Enter the Draft Room
            </a>
            <a
              href="#rooms"
              className="flex h-[54px] w-full items-center justify-center rounded-full border border-white/20 text-base font-bold text-white
                         transition-colors duration-200 hover:border-teal-400/60 hover:text-teal-300"
            >
              Explore The Rooms
            </a>
          </div>

          <div className="mt-9 hidden flex-wrap items-center gap-[26px] lg:flex">
            {/* #/drafts (the Lobby), not #/draft-room or the legacy
                #/draft — see the comment on ROOMS in app.js. This is the
                product's actual "start" button, so a link straight into
                the live Cockpit here was the most direct way a manager
                landed back on a stale finished draft instead of a fresh
                choice. */}
            {/* Marked too, though only the phone's sticky bar reads it. Both
                hero CTAs carry it because exactly one of the two is ever
                rendered, and marking only one means anything looking for "the
                hero's CTA" finds a display:none element at the other width —
                which reports a zero box and hit-tests at the page origin. */}
            <a
              href="#/drafts"
              data-hero-cta=""
              className="rounded-full px-[34px] py-[17px] text-[17px] font-bold text-[#0B0D12]
                         transition-all duration-200 hover:scale-105"
              style={{
                background: 'linear-gradient(100deg, #44D4E2, #82A1F6)',
                boxShadow: '0 10px 34px -14px rgba(63,177,234,0.7)',
              }}
            >
              Enter the Draft Room
            </a>
            <a
              href="#rooms"
              className="group inline-flex items-center gap-2 text-base font-semibold text-[#E6E8EB] transition-colors hover:text-mint"
            >
              Explore The Rooms
              <ChevronRight className="h-4 w-4 text-teal-400 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>

          {/* Where the price went, on both breakpoints. It is true, it is
              worth saying, and it is no longer the first thing read — which
              is the whole of the change: a mono caption under the action
              rather than the eyebrow above the headline, or (on desktop
              until now) the opening words of the paragraph.

              It sits outside both CTA blocks deliberately. The handoff only
              specifies it for the phone, and writing it there would have left
              desktop with no price claim at all once its paragraph stopped
              leading with one — which is the same divergence this pass exists
              to close, introduced from the other direction.

              Not a tap target, so exempt from the 44px floor; 11.5px is the
              handoff's own value and sits on the type floor for mono. */}
          <p className="mt-3 text-center font-plex text-[12px] tracking-[0.1em] text-voidInk-muted lg:mt-5 lg:text-left">
            Free Draft Room &bull; No Account Needed
          </p>
        </motion.div>

        {/* Not rotated, not floating — squared and aligned as a real second
            grid column, unlike the tilted card this replaced. The brief is
            explicit about this being deliberate: a denser, more structured
            page reads calmer without a tilted panel drawing the eye first.

            This used to be a static, non-interactive "Live board" list —
            five rows of names nobody could touch. A design review pointed
            out that the one genuinely interactive proof on the page (the
            PPR toggle below) was buried a full scroll down while the hero
            showed a picture of a board instead of the real thing. Swapped
            for the same live demo rather than removed outright: max-w-md
            (was max-w-sm) because six ranked rows want a little more room
            than five static ones did. */}
        <motion.div
          className="relative mx-auto w-full max-w-md"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <ScoringDemoCard />
        </motion.div>
      </div>
    </section>
  )
}
