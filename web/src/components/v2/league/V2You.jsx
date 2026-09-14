import { useEffect, useState } from 'react'
import { SignInButton, SignUpButton, useClerk, useUser } from '@clerk/clerk-react'
import { LINE as PLATFORM_LINE, LIVE_NAMES, platformFor } from '../../shell/leaguePlatforms.js'
import { leagueCap, tierLabel } from '../../../lib/tiers.js'
import { useAccountUiReady } from '../../../hooks/useAccountUiReady.js'
import { useSignedIn } from '../../../hooks/useAuthState.js'
import { useLeagueFresh as useLeague, useTierFresh as useTier } from '../stores.js'
import { readLocker } from '../v2data.js'
import { Arrow, Kicker, Skeleton, VoltButton, useV2Data } from '../v2ui.jsx'
import { CARD, ConnectButton, DraftClock, PageHead, PlatformBadge, STRONG_BTN, TEXT_BTN, INK_BTN, WELL } from './parts.jsx'

/* #/v2/you — the account: who is signed in, what plan it is on, which
   leagues it holds, what the locker has in it and whether it is syncing.

   Signed-in-ness is window.JukeAuth (useSignedIn), never Clerk's own hook:
   useUser()/useClerk() throw without a provider, and this build has no
   Clerk key. So the parts that genuinely need Clerk — the name and "member
   since", sign-in/up buttons, log out — are rendered only when
   useAccountUiReady() says a provider exists, and are simply absent
   otherwise rather than drawn as controls that cannot act.

   The leagues section is the phone's switcher as well as the desktop's
   manager, over the same store calls production's YouScreen makes:
   select() to use one, remove() to disconnect (two presses, the armed row
   naming the league), and the real connect dialog to add one. */

const SYNC = {
  ok: { tone: 'bg-v2-volt', text: 'Synced — your locker follows you to any browser you sign in on.' },
  off: { tone: 'bg-v2-ink3', text: 'Not synced yet this session. It happens on its own when this tab talks to your account.' },
  unauthorized: { tone: 'bg-v2-warn', text: 'Juke could not confirm your sign-in. Signing out and back in usually fixes it; your mocks are safe in this browser meanwhile.' },
  'store-failed': { tone: 'bg-v2-warn', text: 'Juke reached your account but could not save to it. That is our end, and nothing is lost here while it is sorted out.' },
  'id-taken': { tone: 'bg-v2-warn', text: 'One mock could not be added to your account — its id is already in use. Nothing is lost here, and later mocks sync as usual.' },
  offline: { tone: 'bg-v2-warn', text: 'Juke can’t reach your account right now. Your mocks will sync on their own once the connection is back.' },
}

function useSync() {
  const read = () => {
    const e = typeof window !== 'undefined' ? window.JukeEngine : null
    try { return e && e.syncStatus ? e.syncStatus() : 'off' } catch { return 'off' }
  }
  const [s, setS] = useState(read)
  useEffect(() => {
    const on = () => setS(read())
    on()
    window.addEventListener('juke:header', on)
    window.addEventListener('juke:auth', on)
    return () => {
      window.removeEventListener('juke:header', on)
      window.removeEventListener('juke:auth', on)
    }
  }, [])
  return s
}

function Section({ id, kicker, title, aside, children }) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <Kicker>{kicker}</Kicker>
          <h2 id={id} className="mt-1 font-telemetry text-[26px] font-bold uppercase italic leading-none text-v2-ink">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

/* Clerk's own user — only mounted when a provider exists. */
function ClerkIdentity({ mocks }) {
  const { user } = useUser()
  const name = (user && (user.firstName || user.username)) || 'You'
  const since = user && user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : null
  return <IdentityCard name={name} line={`${since ? `Member since ${since} · ` : ''}${mocks}`} />
}

function IdentityCard({ name, line }) {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[16px] bg-v2-raised font-telemetry text-[34px] font-extrabold italic text-v2-ink ring-1 ring-inset ring-white/[0.12]" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-telemetry text-[34px] font-bold uppercase italic leading-none text-v2-ink">{name}</span>
        <span className="mt-1.5 block truncate font-mono text-[12px] tabular-nums text-v2-ink2">{line}</span>
      </span>
    </div>
  )
}

function SignOut() {
  const clerk = useClerk()
  return (
    <button type="button" onClick={() => clerk.signOut()} className={`${TEXT_BTN} ring-1 ring-inset ring-white/[0.12]`}>
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true"><path d="M6.5 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.5M10 5l3 3-3 3M13 8H6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      Log out
    </button>
  )
}

function Plan() {
  const { status, tier } = useTier()
  const { leagues, status: leagueStatus } = useLeague()
  if (status === 'loading') return <div className={`${WELL} h-[92px] animate-pulse`} aria-hidden="true" />
  const cap = leagueCap(tier)
  const used = leagueStatus === 'connected' ? leagues.length : 0
  return (
    <div className={`${WELL} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Kicker>Plan</Kicker>
        {status === 'error' ? <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-v2-warn">Could not check just now</span> : null}
      </div>
      <p className="mt-1.5 font-telemetry text-[30px] font-bold uppercase italic leading-none text-v2-ink">
        {status === 'error' && !tier ? '—' : tierLabel(tier)}
      </p>
      <p className="mt-2 font-mono text-[12px] tabular-nums text-v2-ink2">
        {cap === 0
          ? 'Free cannot connect a league — mock drafts are unlimited.'
          : `${used} of ${cap} ${cap === 1 ? 'league' : 'leagues'} connected`}
      </p>
      {cap > 0 ? (
        <span className="relative mt-2 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 rounded-full bg-v2-cyan/80" style={{ width: `${Math.min(100, (used / cap) * 100)}%` }} />
        </span>
      ) : null}
    </div>
  )
}

function Leagues() {
  const { status, leagues, league, select, remove, retry } = useLeague()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(null)
  const [arming, setArming] = useState(null)

  if (status === 'loading') return <div className={`${CARD} p-5`} aria-busy="true"><Skeleton lines={2} /></div>

  if (status === 'error') {
    return (
      <div className={`${CARD} p-5`} role="alert">
        <p className="text-[14px] leading-[1.55] text-v2-ink2">
          Could not reach your account just now, so this list may be incomplete. Nothing has been disconnected.
        </p>
        <button type="button" onClick={retry} className={`${INK_BTN} mt-2 -ml-2`}>Try again <Arrow className="h-3.5 w-3.5" /></button>
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
    <div className="space-y-2.5">
      {leagues.map((lg) => {
        const on = league && lg.provider === league.provider && lg.leagueId === league.leagueId
        const plat = platformFor(lg.provider)
        const armed = arming === keyOf(lg)
        return (
          <div key={keyOf(lg)} className={`flex flex-wrap items-center gap-x-3 gap-y-3 rounded-[18px] bg-v2-panel p-4 ring-1 ring-inset ${on ? 'ring-v2-cyan/40' : 'ring-white/[0.07]'}`}>
            <PlatformBadge provider={lg.provider} size="lg" />
            <span className="min-w-0 flex-1 basis-[180px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[15px] font-semibold text-v2-ink">{lg.name}</span>
                {on ? <span className="shrink-0 rounded-[5px] bg-v2-cyan/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-v2-cyan ring-1 ring-inset ring-v2-cyan/30">Active</span> : null}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[11px] uppercase tracking-[0.1em] text-v2-ink3">
                {plat.name}{lg.season ? ` · ${lg.season}` : ''}{lg.totalTeams ? ` · ${lg.totalTeams} teams` : ''} · read-only
              </span>
              <DraftClock league={lg} className="mt-2" />
            </span>
            {armed ? (
              <span className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <span className="mr-auto text-[12px] text-v2-ink2 sm:mr-1">Disconnect {lg.name}?</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(remove, lg)}
                  className="inline-flex min-h-[40px] items-center rounded-[10px] bg-v2-loss/10 px-3 text-[13px] font-semibold text-v2-loss ring-1 ring-inset ring-v2-loss/40 transition-colors hover:bg-v2-loss/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt disabled:cursor-wait"
                >
                  Disconnect
                </button>
                <button type="button" onClick={() => setArming(null)} className={TEXT_BTN}>Cancel</button>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                {on ? (
                  <a href="#/v2/league" className={`${INK_BTN} ring-1 ring-inset ring-white/[0.12]`}>Open <Arrow className="h-3.5 w-3.5" /></a>
                ) : (
                  <button type="button" disabled={busy} onClick={() => act(select, lg)} className={`${INK_BTN} ring-1 ring-inset ring-white/[0.12] disabled:cursor-wait`}>
                    Use this league
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setFailed(null); setArming(keyOf(lg)) }}
                  aria-label={`Disconnect ${lg.name}`}
                  className="grid h-10 w-10 place-items-center rounded-[10px] text-v2-ink3 transition-colors hover:bg-white/[0.04] hover:text-v2-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>
              </span>
            )}
          </div>
        )
      })}

      {failed ? (
        <p className="px-1 text-[12px] leading-[1.45] text-v2-loss" role="alert">
          {failed === 'not-connected' ? 'That league is no longer connected to this account.' : 'Could not reach your account just now. Nothing changed.'}
        </p>
      ) : null}

      <ConnectButton variant="row">
        <span className="flex min-w-0 items-center gap-2.5">
          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-v2-ink2" fill="none" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <span className="min-w-0">
            <span className="block font-medium">{leagues.length ? 'Add another league' : 'Add a league'}</span>
            <span className="block truncate font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">{PLATFORM_LINE}</span>
          </span>
        </span>
        <Arrow className="h-4 w-4 shrink-0 text-v2-ink3" />
      </ConnectButton>
    </div>
  )
}

function Locker({ locker, signedIn }) {
  const sync = useSync()
  const say = SYNC[sync] || SYNC.offline
  const count = locker ? locker.count : null
  const best = locker && locker.best
  const last = locker && locker.last
  return (
    <div className={`${CARD} p-5`}>
      {!locker ? <Skeleton lines={3} /> : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            {[
              ['Mocks', count],
              ['Best finish', best ? `${best.grade} · ${best.projectedRank}` : '—'],
              ['Last', last ? last.dateCompleted : '—'],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0 rounded-[10px] bg-v2-inset px-3 py-2.5 ring-1 ring-inset ring-white/[0.05]">
                <dt><Kicker>{k}</Kicker></dt>
                <dd className="mt-1 truncate font-telemetry text-[24px] font-bold leading-none text-v2-ink tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-start gap-2.5 text-[13px] leading-[1.5] text-v2-ink2">
            <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${signedIn ? say.tone : 'bg-v2-ink3'}`} aria-hidden="true" />
            {signedIn
              ? say.text
              : count
                ? `${count === 1 ? 'This mock lives' : 'These mocks live'} in this browser only. An account keeps ${count === 1 ? 'it' : 'them'} on every device.`
                : 'Nothing drafted yet. Mocks save in this browser, and to your account once you have one.'}
          </p>
          <a href="#/v2/drafts" className={`${INK_BTN} mt-2 -ml-2`}>Open the locker <Arrow className="h-3.5 w-3.5" /></a>
        </>
      )}
    </div>
  )
}

function Settings({ withSignOut }) {
  const links = [
    { href: '#/v2/draft', label: 'Default draft settings', note: 'League size, scoring, clock and seat' },
    { href: '#/v2/method', label: 'How it works', note: 'Every figure, and how it is made' },
    { href: '#/v2/method/privacy', label: 'Privacy', note: 'What is stored, and where' },
    { href: '#/v2/method/terms', label: 'Terms', note: null },
  ]
  return (
    <div className={`${CARD} overflow-hidden`}>
      <ul className="divide-y divide-white/[0.05]">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} className="flex min-h-[56px] items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v2-volt">
              <span className="min-w-0">
                <span className="block text-[15px] text-v2-ink">{l.label}</span>
                {l.note ? <span className="block truncate text-[12px] text-v2-ink3">{l.note}</span> : null}
              </span>
              <Arrow className="h-4 w-4 shrink-0 text-v2-ink3" />
            </a>
          </li>
        ))}
      </ul>
      {withSignOut ? <div className="border-t border-white/[0.06] px-3 py-3"><SignOut /></div> : null}
    </div>
  )
}

export default function V2You() {
  const ready = useAccountUiReady()
  const signedIn = useSignedIn()
  const locker = useV2Data(readLocker)
  const mocks = locker ? `${locker.count} ${locker.count === 1 ? 'mock' : 'mocks'}` : '— mocks'

  if (!signedIn) {
    const signup = <VoltButton size="md" className="flex-1">Create free account <Arrow /></VoltButton>
    const login = <button type="button" className={`${STRONG_BTN} flex-1`}>Log in</button>
    return (
      <>
        <PageHead kicker="Account · guest" title="You" lede="You are drafting as a guest. Everything in a mock works without an account — an account is what carries it between devices and lets you connect a real league." />
        <div className="mt-10 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className={`${CARD} p-5 sm:p-6`}>
              <Kicker>What an account adds</Kicker>
              <ul className="mt-3 space-y-2.5">
                {[
                  'Your locker, synced to every browser you sign in on.',
                  `A connected league — ${LIVE_NAMES} today, more to come. Read-only; Juke never edits it.`,
                  'The in-season rooms and the decision ledger, reading your real roster.',
                ].map((t) => (
                  <li key={t} className="flex gap-2.5 text-[14px] leading-[1.5] text-v2-ink2">
                    <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-v2-ink2" aria-hidden="true" />{t}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
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
            <Section id="v2-you-locker" kicker="This browser" title="Your locker">
              <Locker locker={locker} signedIn={false} />
            </Section>
          </div>
          <Section id="v2-you-settings" kicker="Settings" title="Everything else">
            <Settings withSignOut={false} />
          </Section>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHead kicker="Account · signed in" title="You" />
      <div className={`${CARD} mt-8 flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between`}>
        {ready ? <ClerkIdentity mocks={mocks} /> : <IdentityCard name="Your account" line={mocks} />}
        <div className="w-full lg:w-[340px]"><Plan /></div>
      </div>
      <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Section id="v2-you-leagues" kicker="Connected leagues" title="Your leagues">
          <Leagues />
        </Section>
        <div className="space-y-8">
          <Section id="v2-you-locker" kicker="Mock drafts" title="Your locker">
            <Locker locker={locker} signedIn />
          </Section>
          <Section id="v2-you-settings" kicker="Settings" title="Everything else">
            <Settings withSignOut={ready} />
          </Section>
        </div>
      </div>
    </>
  )
}
