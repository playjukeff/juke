import { useEffect, useMemo, useRef, useState } from 'react'
import { SignInButton, SignUpButton, useClerk, useUser } from '@clerk/clerk-react'
import ConnectLeagueModal from '../../shell/ConnectLeagueModal.jsx'
import { LINE as PLATFORM_LINE, LIVE_NAMES, platformFor } from '../../shell/leaguePlatforms.js'
import { noteLeagueConnected } from '../../../hooks/useLeague.js'
import { useAccountUiReady } from '../../../hooks/useAccountUiReady.js'
import { useSignedIn } from '../../../hooks/useAuthState.js'
import { draftPhase } from '../../../lib/countdown.js'
import { leagueCap, tierLabel } from '../../../lib/tiers.js'
import { useLeagueFresh, useTierFresh } from '../../v2/stores.js'
import { CallButton, GoLink, Headline, Icon, Label, PageHead, QuietButton, Sheet, Skeleton, ThemeChoice, ValueBar, cx, ordinal } from '../ui.jsx'
import { lockerStats, useLocker, useSyncStatus } from '../record/recordKit.js'
import { ArmedButton, DraftsWhere, Stat, XIcon } from '../record/recordParts.jsx'

/* Account — production's You screen, set on the call sheet.

   Who is signed in, which plan, which leagues Juke reads, what the locker
   holds and whether it is syncing. Every figure is a store's answer: the
   plan is the tier store, the leagues are the league store (through the
   race-safe wrappers), the locker is `historyList()`, and the sync line is
   `syncStatus()`. Nothing is sample.

   ---- Signed-in-ness is window.JukeAuth, never Clerk's hook ----

   useUser()/useClerk() throw without a provider, and a keyless build has
   none — so the three things that genuinely need Clerk (the name and
   "member since", the sign-in and sign-up buttons, and log out) mount only
   when useAccountUiReady() says a provider exists. Without one they are
   absent or plainly disabled with the reason beside them, never a control
   that looks live and does nothing.

   ---- The leagues are managed here, and nowhere else on a phone ----

   Use (select), Open (the League page), a two-press Disconnect that names
   the league, and "Add another league" through production's own connect
   dialog — the one flow that knows both platforms' middles and the tier
   cap. A switch or a disconnect goes through the league store, so every
   surface that reads it repaints on the same tick. */

/* A draft countdown in the sheet's own type. draftPhase() decides what can
   honestly be said — a completed draft, or none scheduled, says nothing —
   and it ticks once a second only while there is something to count. */
function LeagueClock({ league }) {
  const at = league && league.draftAt
  const status = league && league.draftStatus
  const [s, setS] = useState(() => draftPhase(at, status))
  useEffect(() => {
    setS(draftPhase(at, status))
    if (draftPhase(at, status).phase !== 'soon') return undefined
    const id = setInterval(() => setS(draftPhase(at, status)), 1000)
    return () => clearInterval(id)
  }, [at, status])
  if (s.phase === 'none' || s.phase === 'complete') return null
  const text = s.phase === 'drafting' ? 'Drafting now' : s.phase === 'late' ? 'Draft time has passed' : 'Drafts in'
  return (
    <span className={cx('mt-1.5 inline-flex items-center gap-1.5 font-figure text-[13px] font-semibold', s.phase === 'late' ? 'text-v3-warn' : 'text-v3-ink2')}>
      <Icon name="clock" className="h-4 w-4" />
      {text}{s.parts ? <span className="tabular-nums text-v3-ink">{s.parts.full}</span> : null}
    </span>
  )
}

/* Production's connect dialog behind a v3 trigger. Signed out there is no
   account to store a connection against, so the trigger opens sign-up
   instead (or says why it cannot, with no Clerk). At the tier's cap it
   opens on the dialog's own limit screen rather than letting somebody pick
   a platform and a league only to be told no at the end. */
function ConnectLeague({ primary = false, children }) {
  const ref = useRef(null)
  const { tier, status: tierStatus } = useTierFresh()
  const { leagues } = useLeagueFresh()
  const open = () => {
    if (tierStatus === 'ready' && leagues.length >= leagueCap(tier)) {
      ref.current?.openAtLimit(tier, leagueCap(tier))
      return
    }
    ref.current?.open()
  }
  return (
    <>
      {primary ? (
        <CallButton onClick={open}>{children}</CallButton>
      ) : (
        <button
          type="button"
          onClick={open}
          className="flex min-h-[56px] w-full items-center justify-between gap-3 border-t border-dashed border-v3-rule px-4 py-3 text-left transition-colors hover:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call sm:px-5"
        >
          {children}
        </button>
      )}
      <ConnectLeagueModal ref={ref} onConnected={noteLeagueConnected} />
    </>
  )
}

function PlatformMark({ provider }) {
  const p = platformFor(provider)
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[6px] border border-v3-rule bg-v3-well font-sheet text-[16px] font-black text-v3-ink" aria-hidden="true">
      {p.mark}
    </span>
  )
}

function Leagues() {
  const { status, leagues, league, select, remove, retry } = useLeagueFresh()
  const { tier, status: tierStatus } = useTierFresh()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(null)

  const act = async (fn, lg) => {
    setFailed(null)
    setBusy(true)
    const res = await fn(lg)
    setBusy(false)
    if (!res || !res.ok) setFailed((res && res.reason) || 'error')
  }

  const cap = tierStatus === 'ready' ? leagueCap(tier) : null
  const aside = status === 'connected' && cap ? `${leagues.length} of ${cap}` : status === 'connected' ? `${leagues.length} connected` : ''

  let body
  if (status === 'loading') {
    body = <div className="p-5"><Skeleton lines={3} /></div>
  } else if (status === 'error') {
    /* Never the empty list: `leagues` is empty when the read failed, and on
       the page somebody opens to manage their leagues that would say they
       have none. */
    body = (
      <div className="flex flex-col items-start gap-3 p-5" role="alert">
        <p className="text-[15px] leading-[1.55] text-v3-ink2">Could not reach your account just now, so this list may be incomplete. Nothing has been disconnected.</p>
        <QuietButton onClick={retry}>Try again</QuietButton>
      </div>
    )
  } else if (!leagues.length) {
    body = (
      <div className="flex flex-col items-start gap-4 p-5 sm:p-6">
        <Headline as="h3" size="block">No league connected yet</Headline>
        <p className="max-w-[56ch] text-[15px] leading-[1.55] text-v3-ink2">
          Connect one and Now becomes your week — the lineup swap, the claim worth making, the trade window — all read from your real roster. {LIVE_NAMES} today. Read-only: Juke never edits your league.
        </p>
        <ConnectLeague primary>Connect a league <Icon name="arrow" className="h-4 w-4" /></ConnectLeague>
        <Label className="normal-case tracking-[0.04em]">{PLATFORM_LINE}</Label>
      </div>
    )
  } else {
    body = (
      <>
        <ul>
          {leagues.map((lg) => {
            const on = league && lg.provider === league.provider && lg.leagueId === league.leagueId
            const plat = platformFor(lg.provider)
            return (
              <li key={lg.provider + ':' + lg.leagueId} className={cx('flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-v3-rule px-4 py-4 first:border-t-0 sm:px-5', on && 'bg-v3-paper')}>
                <PlatformMark provider={lg.provider} />
                <div className="min-w-0 flex-1 basis-[180px]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[16px] font-bold text-v3-ink">{lg.name}</span>
                    {on ? <span className="shrink-0 rounded-[4px] bg-v3-band px-1.5 py-0.5 font-figure text-[11px] font-bold uppercase tracking-[0.12em] text-white">In use</span> : null}
                  </div>
                  <div className="mt-0.5 truncate font-figure text-[13px] text-v3-ink3">
                    {plat.name}{lg.season ? ` · ${lg.season}` : ''}{lg.totalTeams ? ` · ${lg.totalTeams} teams` : ''} · read-only
                  </div>
                  <LeagueClock league={lg} />
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {on ? (
                    <QuietButton href="#/v3/league" className="min-h-[44px] px-4 text-[14px]">Open <Icon name="arrow" className="h-4 w-4" /></QuietButton>
                  ) : (
                    <QuietButton onClick={() => act(select, lg)} className="min-h-[44px] px-4 text-[14px]" aria-label={`Use ${lg.name}`}>Use</QuietButton>
                  )}
                  <ArmedButton
                    busy={busy}
                    idle="Disconnect"
                    armedLabel={`Disconnect ${lg.name}?`}
                    ariaIdle={`Disconnect ${lg.name}`}
                    ariaArmed={`Press again to disconnect ${lg.name}. You can connect it again later.`}
                    onConfirm={() => act(remove, lg)}
                    className="max-w-[240px] text-left"
                  />
                </div>
              </li>
            )
          })}
        </ul>
        {failed ? (
          <p className="border-t border-v3-rule px-4 py-3 text-[14px] text-v3-warn sm:px-5" role="alert">
            {failed === 'not-connected' ? 'That league is no longer connected to this account.' : 'Could not reach your account just now. Nothing changed.'}
          </p>
        ) : null}
        <ConnectLeague>
          <span className="flex min-w-0 items-center gap-3">
            <XIcon name="plus" className="h-5 w-5 shrink-0 text-v3-ink2" />
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-v3-ink">Add another league</span>
              <span className="block truncate font-figure text-[12px] text-v3-ink3">{PLATFORM_LINE}</span>
            </span>
          </span>
          <Icon name="arrow" className="h-4 w-4 shrink-0 text-v3-ink3" />
        </ConnectLeague>
      </>
    )
  }

  return (
    <Sheet code="Connected leagues" aside={aside} bodyClass="">
      {body}
    </Sheet>
  )
}

function Plan() {
  const { status, tier } = useTierFresh()
  const { status: leagueStatus, leagues } = useLeagueFresh()
  const cap = leagueCap(tier)
  const used = leagueStatus === 'connected' ? leagues.length : 0
  return (
    <Sheet code="Plan" aside={status === 'error' ? 'Could not check' : ''}>
      {status === 'loading' ? <Skeleton lines={2} /> : (
        <>
          <p className="font-sheet text-[28px] font-black leading-none tracking-[-0.02em] text-v3-ink">{status === 'error' && !tier ? '—' : tierLabel(tier)}</p>
          {cap === 0 ? (
            <p className="mt-3 text-[15px] leading-[1.5] text-v3-ink2">Free cannot connect a league. Mock drafts are unlimited on every plan.</p>
          ) : (
            <>
              <p className="mt-3 font-figure text-[14px] text-v3-ink2"><span className="font-bold text-v3-ink">{used}</span> of {cap} {cap === 1 ? 'league slot' : 'league slots'} in use</p>
              <ValueBar value={used} max={cap} tone="neutral" className="mt-2" />
            </>
          )}
        </>
      )}
    </Sheet>
  )
}

function Locker({ signedIn }) {
  const locker = useLocker()
  const sync = useSyncStatus()
  const s = useMemo(() => lockerStats(locker.list), [locker.list])
  return (
    <Sheet code="Your drafts" aside={signedIn ? 'Locker' : 'This browser'}>
      {!locker.ready ? <Skeleton lines={3} /> : (
        <>
          <dl className="grid grid-cols-2 gap-2">
            <Stat label="Mocks" value={s.count} />
            <Stat
              label="Best finish"
              value={s.best ? <>{s.best.grade}<span className="ml-2 text-[15px] font-semibold text-v3-ink2">{ordinal(s.best.rank)} of {s.best.teams}</span></> : '—'}
            />
          </dl>
          <div className="mt-4"><DraftsWhere signedIn={signedIn} sync={sync} count={s.count} /></div>
          <div className="mt-4"><GoLink href="#/v3/record?show=drafts">Open your record</GoLink></div>
        </>
      )}
    </Sheet>
  )
}

function Links({ signOut }) {
  const rows = [
    { href: '#/v3/method/how-it-works', label: 'How Juke calls it', note: 'Every figure, and how it is made', icon: 'info' },
    { href: '#/v3/method/privacy', label: 'Privacy', note: 'What is stored, and where', icon: 'doc' },
    { href: '#/v3/method/terms', label: 'Terms', note: 'The small print', icon: 'doc' },
    { href: '#/v3/draft', label: 'Default draft settings', note: 'League size, scoring, clock and seat', icon: 'settings' },
  ]
  return (
    <Sheet code="Method and small print" bodyClass="">
      <ul>
        {rows.map((r) => (
          <li key={r.href} className="border-t border-v3-rule first:border-t-0">
            <a href={r.href} className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call sm:px-5">
              {r.icon === 'doc' ? <XIcon name="doc" className="h-5 w-5 shrink-0 text-v3-ink2" /> : <Icon name={r.icon} className="h-5 w-5 shrink-0 text-v3-ink2" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-v3-ink">{r.label}</span>
                <span className="block truncate text-[13px] text-v3-ink3">{r.note}</span>
              </span>
              <Icon name="arrow" className="h-4 w-4 shrink-0 text-v3-ink3" />
            </a>
          </li>
        ))}
      </ul>
      {signOut ? <div className="border-t border-v3-rule px-4 py-3 sm:px-5">{signOut}</div> : null}
    </Sheet>
  )
}

/* Light, dark, or whatever the device is set to. Kept in this browser
   rather than on the account — it is how this screen looks, not a fact
   about you, and the aside says so rather than implying it follows you. */
function Appearance() {
  return (
    <Sheet code="Appearance" aside="This browser">
      <ThemeChoice />
      <p className="mt-3 text-[14px] leading-[1.5] text-v3-ink2">
        System follows your device's own setting, so a phone that goes dark at night takes the sheet with it. The same switch sits behind the sun or moon in the top bar.
      </p>
    </Sheet>
  )
}

/* Clerk's own user — mounted only when a provider exists. */
function ClerkName() {
  const { user } = useUser()
  return <>{(user && (user.firstName || user.username)) || 'Your account'}</>
}
function ClerkSince() {
  const { user } = useUser()
  if (!user || !user.createdAt) return null
  return <> Member since {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}.</>
}
function SignOut() {
  const clerk = useClerk()
  return (
    <button type="button" onClick={() => clerk.signOut()} className="inline-flex min-h-[44px] items-center gap-2 rounded-[6px] px-2 text-[15px] font-semibold text-v3-ink hover:bg-v3-well focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
      <XIcon name="logout" className="h-5 w-5" /> Log out
    </button>
  )
}

function SignedInAccount({ ready }) {
  return (
    <div className="grid gap-8 sm:gap-10">
      <PageHead
        label="Account · signed in"
        title={ready ? <ClerkName /> : 'Your account'}
        lede={<>Your plan, the leagues Juke reads, and where your drafts are kept.{ready ? <ClerkSince /> : null}</>}
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-8">
        <div className="grid min-w-0 gap-6">
          <Leagues />
          <Locker signedIn />
        </div>
        <div className="grid min-w-0 gap-6">
          <Plan />
          <Appearance />
          <Links signOut={ready ? <SignOut /> : null} />
        </div>
      </div>
    </div>
  )
}

function GuestAccount({ ready }) {
  const adds = [
    { icon: 'draft', text: 'Your drafts, synced to every browser you sign in on — not just this one.' },
    { icon: 'league', text: `A connected league — ${LIVE_NAMES} today, more to come. Read-only; Juke never edits it.` },
    { icon: 'now', text: 'Now becomes your week: the lineup swap, the claim, the trade window, and every call kept on the record.' },
  ]
  const signup = <CallButton>Create a free account <Icon name="arrow" className="h-4 w-4" /></CallButton>
  const login = <QuietButton>Log in</QuietButton>
  return (
    <div className="grid gap-8 sm:gap-10">
      <PageHead
        label="Account · guest"
        title="You're drafting as a guest."
        lede="Everything in a mock works without an account. An account is what carries your drafts between devices and lets Juke read a real league."
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-8">
        <div className="grid min-w-0 gap-6">
          <Sheet code="What an account adds" aside="Free">
          <ul className="grid gap-3">
            {adds.map((a) => (
              <li key={a.icon} className="flex items-start gap-3 text-[16px] leading-[1.5] text-v3-ink2">
                <Icon name={a.icon} className="mt-0.5 h-5 w-5 shrink-0 text-v3-ink" />{a.text}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            {ready ? (
              <>
                <SignUpButton mode="modal">{signup}</SignUpButton>
                <SignInButton mode="modal">{login}</SignInButton>
              </>
            ) : (
              <CallButton disabled>Create a free account</CallButton>
            )}
          </div>
          {!ready ? (
            <p className="mt-3 text-[14px] leading-[1.5] text-v3-ink3">Sign-in is not set up on this build, so accounts cannot be created here. Everything else on the site works without one.</p>
          ) : null}
          </Sheet>
          <Locker signedIn={false} />
        </div>
        <div className="grid min-w-0 gap-6">
          <Appearance />
          <Links />
        </div>
      </div>
    </div>
  )
}

export default function V3Account() {
  const ready = useAccountUiReady()
  const signedIn = useSignedIn()
  return signedIn ? <SignedInAccount ready={ready} /> : <GuestAccount ready={ready} />
}
