import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from '@clerk/clerk-react'
import JukeLogo from '../juke-logo/JukeLogo.jsx'
import { useAccountUiReady } from '../../hooks/useAccountUiReady.js'
import { CLERK_APPEARANCE } from '../../clerkConfig.js'
import KickoffPill from './KickoffPill.jsx'
import ConnectLeagueCta from './ConnectLeagueCta.jsx'
import LeagueSwitcher from './LeagueSwitcher.jsx'
import { useLeague } from '../../hooks/useLeague.js'

/* The sitewide header, guest and connected — design_handoff_v3_alive's
   "Global rules", screens 2ag/2au (mobile) and 3ag/3au (desktop).

   It replaces Header.jsx's marketing bar everywhere, which is the owner's
   call and worth stating plainly because it retires two things: the
   "How It Works" nav link and RoomsNavMenu's season-grouped dropdown. The
   handoff has neither — Rooms is a destination now, not a menu, so a
   dropdown listing the same six rooms one click earlier is a second copy
   of the screen it points at. How It Works moves to the footer and the You
   tab; the docs page itself is untouched.

   ---- Three things that are not styling ----

   **The wordmark is JukeLogo, not the handoff's own.** The handoff draws
   `JUKE` in Barlow Condensed 800 at +0.02em and sizes the mark into a
   28x28 square. The mark is 564x352 — CLAUDE.md's rule is that sizing it
   square squashes it — and the repo's wordmark has been Archivo 900 at
   -0.045em since the shark landed. Changing the wordmark's face is a brand
   decision rather than a layout one, so this defers to the component that
   already expresses the lockup correctly. That is the README's own
   "substitute only where an existing repo component already expresses the
   same thing" clause, used at the one place it most obviously applies.

   **The kickoff pill is here only above `sm`.** Below it the design puts
   the pill in the hero, on the eyebrow's own row (2ag/2au), not in the
   header — so it is `hidden sm:inline-flex` here and every mobile hero
   renders its own. One component, two homes, and the breakpoint is `sm`
   because that is the phone/desktop product split everywhere else in
   web/src (usePhoneWidth, FloatingNavPill's own `sm:hidden`); a third
   breakpoint here would be a second answer to the same question.

   **The connected chip says what is true.** The design draws a league
   switcher — a platform badge, "Dynasty Degens · Wk 3", a caret. Sleeper
   connect is real now, so the badge and the name are drawn from the
   connected league; the week and the caret are not, because nothing here
   knows a week and there is nothing to switch between until a second
   league can be connected. A signed-in user with no league gets the chip
   slot as the connect CTA it is really offering.

   This paragraph used to begin "there is no league connect in this project
   yet", which stopped being true and stayed on the page.

   ---- The desktop tab row is gone, and the rail is why ----

   Home / Drafts / Rooms lived here as three text links. Juke Journey v3's
   rail (AppShell.jsx's own RailNav, `lg:sticky` beside this header) covers
   Rooms and History directly and adds My League above them, so the same
   three destinations sitting in both places would be the identical
   sub-navigation drawn twice — the written-down-twice failure this project
   already has a name for, in a nav bar instead of a data table. Home stays
   reachable through the logo link a few lines down; nothing else in this
   header names a route any more. `active` is accepted and unused here for
   exactly that reason — AppShell still threads it through in case a future
   header treatment wants it, and a prop nothing reads is harmless where a
   second nav would not be. */

function GuestAuth() {
  const ready = useAccountUiReady()

  // Both controls are text-first and only one is loud: white pill for Sign
  // up, plain text for Log in. Two equally weighted controls in one row is
  // the "one primary action" rule this project has held since the rebrand,
  // and the handoff draws it the same way.
  const login = (
    <button
      type="button"
      className="inline-flex h-11 items-center rounded-full px-2 text-[14px] font-semibold text-voidInk-primary transition-colors duration-150 hover:text-white sm:h-9"
    >
      Log in
    </button>
  )
  const signup = (
    <button
      type="button"
      className="inline-flex h-11 items-center rounded-full bg-white px-4 text-[14px] font-bold text-surface-page transition-transform duration-150 hover:scale-[1.03] sm:h-9 sm:px-[18px]"
    >
      Sign up
    </button>
  )

  // No key configured, or the first client pass — both triggers still draw
  // and simply open nothing yet. A row with a hole in it reads as broken;
  // this is the same fallback AccountButtons already makes.
  if (!ready) return <>{login}{signup}</>

  return (
    <>
      <SignInButton mode="modal">{login}</SignInButton>
      <SignUpButton mode="modal">{signup}</SignUpButton>
    </>
  )
}

/* What stands in the league chip's place before one is connected.

   ---- "No caret yet" is retired, and the argument that made it right ----

   This comment used to say the handoff's caret was deliberately not drawn,
   because "there is nothing to switch between until a second league can be
   connected — an affordance for a menu that does not open is the dead
   control this project keeps finding." That was correct about a dead
   control and wrong about the premise: a second league could always be
   connected. connected_leagues has been keyed
   (clerk_id, provider, league_id) since 0005, listLeagues() has always
   returned every row, and useLeague() took `[0]` — so the app held several
   and drew one. The missing thing was the menu, not the data.

   Corrected in place rather than left standing, which is the rule this
   project follows for prose that has stopped being true. The caret is real
   now and LeagueSwitcher owns it.

   ---- What is left here ----

   The connected half moved. This is the case where there is nothing to
   switch between at all: a Connect call to action, which is a different
   control doing a different job rather than a state of the switcher.

   Four states rather than two, which is why this reads `status` and not
   just `league`: "loading" draws nothing at all, because a chip reading
   "Connect a league" for one tick on every page load tells somebody who
   HAS one that they have been disconnected. Nothing, then the truth,
   beats the wrong thing followed by the right one. */

function LeagueChip() {
  const { status } = useLeague()

  /* Only "none" draws. "loading" and "error" both draw nothing, and the
     `!==` is what makes that true for free — offering Connect to somebody
     whose league we simply could not verify is the same wrong claim as
     offering it for a beat on every load, so the state added on 6
     September 2026 needed no change here.

     This is the one surface where drawing nothing on an error is right
     rather than a bug: a header chip has no room to explain itself, and
     ConnectCard on the same page is where that explanation lives. */
  if (status !== 'none') return null

  return (
    <ConnectLeagueCta variant="chip">
      <span
        className="grid h-[18px] w-[18px] place-items-center rounded font-display text-[11px] font-extrabold text-surface-page"
        style={{ background: '#00E5FF' }}
      >
        +
      </span>
      Connect a league
    </ConnectLeagueCta>
  )
}

export default function ShellHeader({ active = null }) {
  const ready = useAccountUiReady()

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-surface-page/90 backdrop-blur-md">
      <div className="mx-auto flex h-[57px] max-w-[1280px] items-center justify-between gap-3 px-5 sm:h-[68px] sm:px-10">
        <div className="flex min-w-0 items-center gap-9">
          <a href="#/" className="shrink-0" aria-label="Juke — home">
            <JukeLogo size={22} />
          </a>
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:gap-3.5">
          <KickoffPill className="hidden sm:inline-flex" />

          {!ready ? (
            <GuestAuth />
          ) : (
            <>
              <SignedOut>
                <GuestAuth />
              </SignedOut>
              <SignedIn>
                <LeagueSwitcher />
                <LeagueChip />
                {/* Clerk's own avatar rather than the handoff's gradient
                    circle, and the reason is sign-out: UserButton's menu is
                    the only place Clerk offers it, and on a phone this and
                    the You tab are the only two surfaces that can reach it.
                    A decorative circle here would leave a signed-in user
                    with no way out on desktop at all. */}
                <UserButton appearance={CLERK_APPEARANCE} />
              </SignedIn>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
