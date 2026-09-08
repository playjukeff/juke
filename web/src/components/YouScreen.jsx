import { useState } from 'react'
import { SignInButton, SignUpButton, SignedIn, SignedOut, useClerk, useUser } from '@clerk/clerk-react'
import AppShell from './shell/AppShell.jsx'
import ConnectLeagueCta from './shell/ConnectLeagueCta.jsx'
import DraftCountdown from './shell/DraftCountdown.jsx'
import { useLeague } from '../hooks/useLeague.js'
import { LINE as PLATFORM_LINE, LIVE_NAMES as PLATFORM_NAMES, platformFor } from './shell/leaguePlatforms.js'
import { useAccountUiReady } from '../hooks/useAccountUiReady.js'
import { useEngine, useJukeTick } from '../hooks/useJukeEngine.js'

/* #/you — design_handoff_v3_alive 2gg/2gu (mobile) and 3gg/3gu (desktop).

   The tab existed and the screen did not: FloatingNavPill's "You" opened an
   action sheet, which was the only surface on a phone that could reach
   sign-out at all. That sheet stays for now — this is where it was always
   going, and the two can converge once every route is on the new shell.

   ---- What is real and what is not ----

   Everything on the signed-in half comes from somewhere real. The name and
   "member since" are Clerk's own `user`, and the mock count is
   `historyList()` through the bridge — the same list the Locker draws. None
   of it is sample content, which is why this screen is buildable today
   while the connected rooms are not.

   CONNECTED LEAGUES is the exception and it draws the honest version: there
   is no league connect yet, so there is nothing to list and the section is
   its own empty state — the dashed "Add a league" row, and no card above
   it. A list with a fabricated "Dynasty Degens · synced 6 min ago" in it
   would be the one thing on this screen a reader would act on.

   ---- Appearance is not here, and that is deliberate ----

   The handoff draws an `Appearance ... Dark` row. The React app is
   dark-only — every surface in web/src is a fixed Tailwind hex, and the
   legacy `data-theme="light"` block only reaches style.css's own pages —
   so a control there would either do nothing or break every screen it
   claims to restyle. A row that cannot act is the dead-control failure
   this project has shipped more than once; it comes back with a light
   theme, not before it. */

const ROW =
  'flex items-center gap-3 border-b border-line-hairline py-3.5 text-[15px] text-voidInk-primary transition-colors duration-150'

function Row({ glyph, label, value, href, onClick }) {
  const body = (
    <>
      <span className="w-8 text-center" aria-hidden="true">{glyph}</span>
      <span className="flex-1 text-left">{label}</span>
      <span className="text-[13px] text-ink-muted" aria-hidden={!value}>
        {value || '›'}
      </span>
    </>
  )
  if (href) {
    return (
      <a href={href} className={ROW + ' hover:text-white'}>
        {body}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={ROW + ' w-full hover:text-white'}>
      {body}
    </button>
  )
}

function Section({ title, children }) {
  return (
    <div className="mt-[18px] sm:mt-7">
      <div className="mb-3 font-mono text-[11px] tracking-[0.14em] text-voidInk-primary">
        {title}
      </div>
      {children}
    </div>
  )
}

function GuestCard() {
  const ready = useAccountUiReady()

  const signup = (
    <button
      type="button"
      className="flex-1 whitespace-nowrap rounded-full px-3 py-3 text-[14px] font-bold text-surface-page transition-transform duration-150 hover:scale-[1.02]"
      style={{ background: 'linear-gradient(100deg,#44D4E2,#82A1F6)' }}
    >
      Sign up
    </button>
  )
  const login = (
    <button
      type="button"
      className="flex-1 whitespace-nowrap rounded-full border border-flow-pillEdge px-3 py-3 text-[14px] font-semibold text-voidInk-primary transition-colors duration-150 hover:border-white/30"
    >
      Log in
    </button>
  )

  return (
    <div className="rounded-[18px] border border-line-hairline bg-[#151920] p-[18px] text-center sm:max-w-[520px]">
      <img src="/juke-shark-mark.svg" alt="" className="mx-auto h-[72px] w-[72px] object-contain" />
      <div className="mt-1.5 font-display text-[22px] font-bold text-white">
        You&apos;re drafting as a guest
      </div>
      <p className="mb-3.5 mt-1.5 text-[14px] leading-[1.5] text-voidInk-body">
        An account keeps your mocks and lets you connect a league. {PLATFORM_NAMES} today, more
        to come.
      </p>
      <div className="flex gap-2">
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
    </div>
  )
}

function Identity() {
  const { user } = useUser()
  const engine = useEngine()
  useJukeTick(engine)

  /* The mock count reads the tick because `historyList()` goes through the
     bridge and the deferred data lands after mount — the same reason
     MockDraftsPhone's own rows do. Read once, this shows 0 on a cold load
     and never corrects itself. */
  const mocks = engine && engine.historyList ? engine.historyList().length : 0

  const name = (user && (user.firstName || user.username)) || 'You'
  const initial = name.slice(0, 1).toUpperCase()
  const since =
    user && user.createdAt
      ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      : null

  return (
    <div className="flex items-center gap-3.5">
      <span
        className="grid h-14 w-14 shrink-0 place-items-center rounded-full font-display text-[22px] font-extrabold text-surface-page"
        style={{ background: 'linear-gradient(135deg,#44D4E2,#82A1F6)' }}
        aria-hidden="true"
      >
        {initial}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-[24px] font-bold leading-none text-white">
          {name}
        </span>
        <span className="mt-[3px] block text-[13px] text-ink-muted">
          {since ? `Member since ${since} · ` : ''}
          {mocks} {mocks === 1 ? 'mock' : 'mocks'}
        </span>
      </span>
    </div>
  )
}

function SignOutRow() {
  const clerk = useClerk()
  return <Row glyph="↩" label="Log out" value=" " onClick={() => clerk.signOut()} />
}

/* The one section on this screen that is about a league rather than an
   account — and the phone's whole league switcher.

   It drew an "Add a league" row unconditionally, with a comment explaining
   that there was nothing connected to show above it. That stopped being
   true the day Sleeper connect shipped and the row went on asking anyway —
   a section headed CONNECTED LEAGUES that never listed one, on the screen
   whose whole job is to show what this account holds.

   The handoff's own card here is "Dynasty Degens · synced 6 min ago", and
   the "synced" half is still not ours to draw: nothing records when the
   league was last read. Season and team count are real and come back with
   the league itself, so those are what the row says.

   ---- "Still one league" is retired ----

   This comment used to end: "listLeagues() returns an array and useLeague()
   takes the first, so a second connect replaces rather than adds — which is
   why the ask below is only offered when there is nothing connected, rather
   than sitting under the row promising an addition that would quietly be a
   replacement."

   The first clause was true of the hook and never of the data: a second
   connect always added a row, and only the reading of it replaced anything.
   Corrected in place rather than left standing. Every connected league is
   listed now, the active one is marked and selectable, and "Add a league"
   sits under them permanently — it does add.

   ---- This is the phone's switcher, not a copy of the header's ----

   LeagueSwitcher is `sm:block`, so below 640px this section is the only
   way to change league. It is deliberately a different screen rather than
   a narrower menu: a menu is for a quick pivot and this is for managing —
   which is why disconnect lives here and nowhere else.

   ---- Disconnect confirms in place ----

   Two presses on the same row rather than a dialog. A `<dialog>` for one
   irreversible-ish action on a list row is more chrome than the action is
   worth, and `window.confirm` is a browser modal in an app that has none.
   The armed state names the league it will disconnect, because a row that
   just says "Sure?" is one mis-scroll away from removing the wrong one. */
function ConnectedLeagues() {
  const { status, leagues, league, select, remove, retry } = useLeague()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(null)
  const [arming, setArming] = useState(null)

  // Nothing at all until the answer is in: an "add a league" row that is
  // replaced by a league a beat later reads as the connection having only
  // just happened.
  if (status === 'loading') return null

  /* "error" may not fall through to the list below, and this is the case
     that makes the fourth state worth having on this screen specifically.
     `leagues` is empty when the read failed, so the list would render as
     nothing plus a connect row — which states, on the page somebody opens
     to manage their leagues, that they have none. That is a wrong claim
     rather than a missing one, and it is the loudest possible place to
     make it. */
  if (status === 'error') {
    return (
      <div className="rounded-[14px] border border-line-hairline px-4 py-3">
        <p className="text-[13px] leading-[1.5] text-voidInk-body">
          Could not reach your account just now, so this list may be incomplete. Nothing has been
          disconnected.
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-2 text-[13px] font-semibold text-teal"
        >
          Try again
        </button>
      </div>
    )
  }

  const keyOf = (lg) => lg.provider + ':' + lg.leagueId

  const act = async (fn, lg) => {
    setFailed(null)
    setBusy(true)
    const res = await fn(lg)
    setBusy(false)
    setArming(null)
    if (!res.ok) setFailed(res.reason || 'error')
  }

  return (
    <>
      {leagues.map((lg) => {
        const on = league && lg.provider === league.provider && lg.leagueId === league.leagueId
        const plat = platformFor(lg.provider)
        const armed = arming === keyOf(lg)
        return (
          <div
            key={keyOf(lg)}
            className={
              'flex w-full items-center gap-3 rounded-[14px] border px-4 py-3 text-left ' +
              (on ? 'border-teal/60' : 'border-line-hairline')
            }
          >
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-[13px] font-extrabold text-surface-page"
              style={{ background: '#00E5FF' }}
            >
              {plat.mark}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-voidInk-primary">
                {lg.name}
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-ink-muted">
                {plat.name}
                {lg.season ? ` · ${lg.season}` : ''}
                {lg.totalTeams ? ` · ${lg.totalTeams} teams` : ''}
                {' · read-only'}
              </span>
              {/* Its own line rather than appended to the one above: that
                  line truncates, and a countdown is the thing on this row
                  most likely to be the reason somebody opened the screen.
                  Renders nothing at all when there is no draft to count. */}
              <DraftCountdown league={lg} className="mt-1" />
            </span>

            {armed ? (
              /* The armed state replaces the row's actions rather than
                 sitting beside them, so there is no reachable "Open" or
                 "Use" while a disconnect is one press away. */
              <span className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(remove, lg)}
                  className="text-[13px] font-semibold text-flow-rose disabled:opacity-50"
                >
                  Disconnect
                </button>
                <button
                  type="button"
                  onClick={() => setArming(null)}
                  className="text-[13px] text-ink-muted"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-3">
                {on ? (
                  // #/my-league, not the retired #/rooms/league — that
                  // slug only ever existed to bounce here now
                  // (RoomPage.jsx), so linking it directly skips a
                  // pointless redirect hop on the one row a reader is
                  // most likely to press.
                  <a href="#/my-league" className="text-[13px] font-semibold text-teal">
                    Open
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(select, lg)}
                    className="text-[13px] font-semibold text-teal disabled:opacity-50"
                  >
                    Use
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setFailed(null); setArming(keyOf(lg)) }}
                  aria-label={`Disconnect ${lg.name}`}
                  className="text-[13px] text-ink-muted transition-colors hover:text-voidInk-primary"
                >
                  &times;
                </button>
              </span>
            )}
          </div>
        )
      })}

      {failed ? (
        <p className="px-1 text-[12px] leading-[1.4] text-flow-rose">
          {failed === 'not-connected'
            ? 'That league is no longer connected to this account.'
            : 'Could not reach your account just now. Nothing changed.'}
        </p>
      ) : null}

      {/* Offered whether or not something is connected, which is the half
          of this that changed: it adds rather than replaces. */}
      <ConnectLeagueCta variant="row">
        <span className="flex items-center gap-2.5">
          <span className="text-teal" aria-hidden="true">✨</span>
          {leagues.length ? 'Add another league' : 'Add a league'} &mdash; {PLATFORM_LINE}
        </span>
        <span className="text-ink-muted" aria-hidden="true">›</span>
      </ConnectLeagueCta>
    </>
  )
}

export default function YouScreen() {
  const ready = useAccountUiReady()

  const settings = (
    <Section title="SETTINGS">
      <Row glyph="⚙" label="Default draft settings" href="#/rooms/draft" />
      <Row glyph="❔" label="How it works" href="/docs/draft-room-how-it-works.html" />
      <Row glyph="📄" label="Privacy" href="/docs/privacy.html" />
      <Row glyph="📄" label="Terms" href="/docs/terms.html" />
    </Section>
  )

  return (
    <AppShell active="you">
      <div className="mx-auto max-w-[1280px] px-5 pt-[22px] sm:px-10 sm:pt-10">
        {/* Glyph in a mono eyebrow rather than inline beside the title
            -- see RoomsLobby.jsx. A fixed string here because this screen
            has no count worth deriving; the room pages' eyebrows are
            context, and "ACCOUNT" is this screen's. */}
        <div className="mb-3.5">
          <div className="mb-1.5 font-mono text-[11px] tracking-[0.1em] text-teal">
            <span className="mr-1.5" aria-hidden="true">👤</span>
            ACCOUNT
          </div>
          <h1 className="m-0 font-display text-[30px] font-extrabold uppercase italic text-white sm:text-[44px]">
            You
          </h1>
        </div>

        <div className="sm:max-w-[520px]">
          {!ready ? (
            <>
              <GuestCard />
              {settings}
            </>
          ) : (
            <>
              <SignedOut>
                <GuestCard />
                {settings}
              </SignedOut>
              <SignedIn>
                <Identity />

                <Section title="CONNECTED LEAGUES">
                  <ConnectedLeagues />
                </Section>

                <Section title="SETTINGS">
                  <Row glyph="⚙" label="Default draft settings" href="#/rooms/draft" />
                  <Row glyph="❔" label="How it works" href="/docs/draft-room-how-it-works.html" />
                  <Row glyph="📄" label="Privacy" href="/docs/privacy.html" />
                  <Row glyph="📄" label="Terms" href="/docs/terms.html" />
                  <SignOutRow />
                </Section>
              </SignedIn>
            </>
          )}
        </div>
      </div>
    </AppShell>
  )
}
