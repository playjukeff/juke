import { SignInButton, SignUpButton } from '@clerk/clerk-react'
import { IconLock } from '../roomIcons.jsx'
import { useAccountUiReady } from '../../hooks/useAccountUiReady.js'
import { LINE as PLATFORM_LINE } from './leaguePlatforms.js'

/* A guest's view of an in-season room: real sample content, blurred, under
   an unlock card. design_handoff_v3_alive's "Guest rooms are locked
   previews".

   The interaction rule from the handoff is the part worth stating, because
   the obvious implementation gets it backwards: **a locked room card opens
   the room**, and the room draws this. It is not a modal in front of the
   lobby. A guest who taps Waiver Room should land on the Waiver Room and
   see what it is; a dialog that intercepts the tap answers a question they
   did not ask and takes the preview away, which is the thing being sold.

   ---- Two things about the blur ----

   `filter: blur()` on the wrapper, `aria-hidden` and `inert` on it too.
   Blurred sample content is decoration: it is unreadable by construction,
   so exposing it to a screen reader reads out a roster nobody can see, and
   leaving it focusable puts every sample row in the tab order in front of
   the two controls that are the entire point of the screen.

   And it is `overflow-hidden` with the overlay `absolute inset-0` rather
   than a fixed height, so a room whose sample content is longer than the
   viewport does not scroll a reader past the unlock card into more blur.

   ---- The read-only line is a promise, so it had to be decided ----

   The handoff draws it on every desktop locked card ("Connecting is
   read-only. Juke never edits your league.") and its own Strategy Room
   simultaneously offers "Apply both calls", which the README describes as
   writing the lineup back to the connected platform. Both cannot be true.
   Settled read-only: Juke only ever reads a league, and Strategy's Apply
   deep-links into the platform rather than writing. So the line ships as
   written, and it is the constraint the connect integration is built
   under rather than a caption somebody can quietly contradict later.

   It shows at every width, where the handoff shows it on desktop only.
   A claim about what happens to somebody's league data is worth two lines
   of 12px type on the screen most people will actually read it on.

   ---- The CTA copy is fixed by the handoff and it matters ----

   "Sign up & connect", never "Connect with Sleeper". Every connect route
   goes through account creation first, and the platform list is named
   underneath as a list — the handoff's own global rule, and the reason is
   that platform-exclusive language on the button promises a flow this
   product does not have (there is no per-platform entry point; there is one
   sign-up and then a chooser).

   **The chooser that sentence describes did not exist until 5 September
   2026**, which is what made the list under the button a claim rather than
   a roadmap: four platforms named, one built, and the dialog opening
   straight onto a Sleeper username. It exists now (ConnectLeagueModal's
   first step) and the list is the shared line, which says which of the
   four is live. Both halves had to move — a chooser alone would still have
   been captioned with four working integrations. */

export default function LockedPreview({
  headline,
  platforms = PLATFORM_LINE,
  children,
}) {
  const ready = useAccountUiReady()

  const signup = (
    <button
      type="button"
      className="flex-1 whitespace-nowrap rounded-full px-2 py-3 text-[14px] font-bold text-surface-page transition-transform duration-150 hover:scale-[1.02] sm:px-4"
      style={{ background: 'linear-gradient(100deg,#44D4E2,#82A1F6)' }}
    >
      Sign up &amp; connect
    </button>
  )
  const login = (
    <button
      type="button"
      className="flex-1 whitespace-nowrap rounded-full border border-flow-pillEdge px-2 py-3 text-[14px] font-semibold text-voidInk-primary transition-colors duration-150 hover:border-white/30 sm:px-4"
    >
      Log in
    </button>
  )

  return (
    <div className="relative min-h-[420px] overflow-hidden px-5 pt-2 sm:px-10 sm:pt-4">
      <div className="mx-auto max-w-[1280px]">
        <div
          aria-hidden="true"
          inert=""
          className="blur-[1.5px] opacity-70 sm:blur-[2px] sm:opacity-60"
        >
          {children}
        </div>
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center p-6"
        style={{ background: 'linear-gradient(180deg,rgba(13,15,21,.2),rgba(13,15,21,.92) 55%)' }}
      >
        <div className="w-full max-w-[420px] rounded-[18px] border border-line-hairline bg-[#151920] px-[18px] py-5 text-center sm:max-w-[460px] sm:rounded-[22px] sm:px-6 sm:py-7">
          <span className="inline-flex justify-center text-ink-muted" role="img" aria-label="Locked"><IconLock size={28} /></span>
          <div className="mt-2 font-display text-[22px] font-bold text-white sm:text-[26px]">
            {headline}
          </div>
          <p className="mx-auto mt-1.5 max-w-[38ch] text-[13px] leading-[1.4] text-voidInk-body">
            Connecting is read-only. Juke never edits your league.
          </p>
          <span className="mt-1 block text-[12px] text-ink-muted sm:text-[13px]">{platforms}</span>
          {/* Not 50/50. "Sign up & connect" is four words against "Log in"'s
              two, so equal columns wrap the primary control on a 375px
              screen while the secondary carries dead space either side.
              Weighted 3:2, which fits both on one line at the narrowest
              width this ships at — measured, not guessed. */}
          <div className="mt-3.5 flex gap-2 [&>*:first-child]:flex-[3] [&>*:last-child]:flex-[2]">
            {ready ? (
              <>
                <SignUpButton mode="modal">{signup}</SignUpButton>
                <SignInButton mode="modal">{login}</SignInButton>
              </>
            ) : (
              <>{signup}{login}</>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
