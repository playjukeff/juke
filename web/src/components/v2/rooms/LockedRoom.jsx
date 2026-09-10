import { useRef } from 'react'
import { SignInButton, SignUpButton } from '@clerk/clerk-react'
import ConnectLeagueModal from '../../shell/ConnectLeagueModal.jsx'
import { LINE as PLATFORM_LINE } from '../../shell/leaguePlatforms.js'
import { useAccountUiReady } from '../../../hooks/useAccountUiReady.js'
import { useSignedIn } from '../../../hooks/useAuthState.js'
import { noteLeagueConnected } from '../../../hooks/useLeague.js'
import { useLeagueFresh as useLeague } from '../stores.js'
import { useTierFresh as useTier } from '../stores.js'
import { leagueCap, tierLabel } from '../../../lib/tiers.js'
import { readRoomPreviews } from '../v2data.js'
import { Arrow, GhostButton, Kicker, LockIcon, PosChip, Skeleton, VoltButton, useV2Data } from '../v2ui.jsx'

/* A guest's view of an in-season room: a sample of the room, obscured,
   beside the way in.

   ---- The sample is real players on tonight's board, in a typical league ----

   Production blurs a hand-made week (a $12 FAAB bid, a 58% win prob, a
   "Sarah" with an offer). This reads v2data.js's readRoomPreviews() instead
   — the rooms' own questions asked of the real board with a generic league
   standing in for yours — so nothing on it is invented, and the one
   invented half (the league) is named on the label that sits OUTSIDE the
   blur, where a reader and a screen reader can both see it.

   The obscured half is aria-hidden and inert, as production's is: blurred
   content is unreadable by construction, so it may not be read out or sit
   in the tab order in front of the controls this screen is for.

   ---- The way in depends on who is asking ----

   Production offers "Sign up & connect" to everybody, including somebody
   already signed in with no league — who then signs up for an account they
   have. Here a signed-out reader gets sign-up and log-in, and a signed-in
   one gets the connect dialog itself (production's ConnectLeagueModal,
   reused rather than restyled: it is a four-step flow shared with every
   other connect control on the site, and a second copy of it would be the
   written-down-twice failure with a dialog in it). The tier-limit branch is
   ConnectLeagueCta's, kept: a Free account is shown the limit screen rather
   than walked through a platform and a league to be told no at the end. */

const COPY = {
  waiver: {
    headline: 'See your real claims',
    kicker: 'Likely on the wire',
    lede: 'Connect your league and every player nobody in it owns is priced against your own roster, under your league’s own scoring.',
  },
  /* Not production's "Read your real offers": nothing here reads an offer
     (no feed carries a pending trade), so the headline promises what the
     connected room actually does. */
  trade: {
    headline: 'Price your real trades',
    kicker: 'A swap the market calls even',
    lede: 'Connect your league and both rosters are priced against replacement — the season swing for each side, before you send anything.',
  },
  strategy: {
    headline: 'Plan your real week',
    kicker: 'A start / sit the market calls a coin flip',
    lede: 'Connect your league and your lineup is projected for this week — your platform’s own numbers — with the one swap that changes it and your odds against this week’s opponent.',
  },
}

function WaiverSample({ pv }) {
  const max = Math.max(1, ...pv.wire.map((w) => Math.abs(w.gap)))
  return (
    <ol className="divide-y divide-white/[0.05] rounded-[12px] bg-v2-inset ring-1 ring-inset ring-white/[0.06]">
      {pv.wire.map((w) => (
        <li key={w.id} className="grid grid-cols-[36px_minmax(0,1fr)_52px] items-center gap-3 px-3 py-3 sm:grid-cols-[36px_minmax(0,1fr)_minmax(60px,30%)_52px]">
          <PosChip pos={w.pos} />
          <span className="min-w-0">
            <span className="block truncate text-[14px] text-v2-ink">{w.name}</span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">{w.team} · {w.pg ?? '—'} pts/gm</span>
          </span>
          <span className="relative hidden h-1.5 rounded-full bg-white/[0.06] sm:block">
            <span className={`absolute inset-y-0 left-0 rounded-full ${w.gap > 0 ? 'bg-v2-cyan' : 'bg-v2-loss'}`} style={{ width: `${Math.max(4, (Math.abs(w.gap) / max) * 100)}%` }} />
          </span>
          <span className={`text-right font-mono text-[13px] font-semibold tabular-nums ${w.gap > 0 ? 'text-v2-volt' : 'text-v2-loss'}`}>
            {w.gap > 0 ? '+' : '−'}{Math.abs(w.gap)}
          </span>
        </li>
      ))}
    </ol>
  )
}

function TradeSample({ pv }) {
  const t = pv.trade
  if (!t) return null
  const Side = ({ tag, p }) => (
    <div className="rounded-[12px] bg-v2-inset p-3 ring-1 ring-inset ring-white/[0.06]">
      <Kicker>{tag}</Kicker>
      <div className="mt-2 flex items-center gap-2"><PosChip pos={p.pos} /><span className="font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">{p.team}</span></div>
      <span className="mt-1.5 block truncate text-[15px] font-semibold text-v2-ink">{p.name}</span>
      <span className="mt-1 block font-mono text-[11px] tabular-nums text-v2-ink2">ADP {p.adp} · {p.gap > 0 ? '+' : ''}{p.gap} over repl.</span>
    </div>
  )
  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Side tag="You send" p={t.give} />
        <Side tag="You get" p={t.get} />
      </div>
      <div className="mt-3 flex items-baseline justify-between rounded-[12px] bg-v2-inset px-4 py-3 ring-1 ring-inset ring-white/[0.06]">
        <span className="text-[13px] text-v2-ink2">Season swing for you</span>
        <span className="font-telemetry text-[36px] font-bold italic leading-none text-v2-volt">+{t.swing}</span>
      </div>
    </div>
  )
}

function StrategySample({ pv }) {
  const s = pv.sit
  if (!s) return null
  const max = Math.max(s.start.pg, s.bench.pg)
  const Row = ({ tag, p, on }) => (
    <div className="grid grid-cols-[52px_minmax(0,1fr)_44px] items-center gap-3 px-3 py-3 sm:grid-cols-[52px_minmax(0,1fr)_minmax(60px,34%)_44px]">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-v2-ink3">{tag}</span>
      <span className="min-w-0"><span className="block truncate text-[14px] text-v2-ink">{p.name}</span><span className="font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">WR · {p.team}</span></span>
      <span className="relative hidden h-1.5 rounded-full bg-white/[0.06] sm:block"><span className={`absolute inset-y-0 left-0 rounded-full ${on ? 'bg-v2-cyan' : 'bg-v2-ink3'}`} style={{ width: `${(p.pg / max) * 100}%` }} /></span>
      <span className="text-right font-mono text-[13px] tabular-nums text-v2-ink">{p.pg}</span>
    </div>
  )
  return (
    <div>
      <div className="divide-y divide-white/[0.05] rounded-[12px] bg-v2-inset ring-1 ring-inset ring-white/[0.06]">
        <Row tag="Start" p={s.start} on />
        <Row tag="Bench" p={s.bench} />
      </div>
      <div className="mt-3 flex items-baseline justify-between rounded-[12px] bg-v2-inset px-4 py-3 ring-1 ring-inset ring-white/[0.06]">
        <span className="text-[13px] text-v2-ink2">Projected edge, per game</span>
        <span className="font-telemetry text-[36px] font-bold italic leading-none text-v2-volt">+{s.diff}</span>
      </div>
    </div>
  )
}

/* The way in. Signed out: Clerk's own sign-up and log-in (inert without a
   key, the fallback every account surface here makes). Signed in: the real
   connect dialog, or its limit screen when the tier's cap is already met. */
function WayIn() {
  const ready = useAccountUiReady()
  const signedIn = useSignedIn()
  const { tier, status: tierStatus } = useTier()
  const { leagues } = useLeague()
  const modal = useRef(null)

  if (!signedIn) {
    const signup = <VoltButton className="w-full">Sign up &amp; connect <Arrow /></VoltButton>
    const login = <GhostButton className="w-full">Log in</GhostButton>
    return (
      <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-[3fr_2fr]">
        {ready ? <SignUpButton mode="modal">{signup}</SignUpButton> : signup}
        {ready ? <SignInButton mode="modal">{login}</SignInButton> : login}
      </div>
    )
  }

  const open = () => {
    if (tierStatus === 'ready' && leagues.length >= leagueCap(tier)) {
      modal.current && modal.current.openAtLimit(tier, leagueCap(tier))
      return
    }
    modal.current && modal.current.open()
  }
  return (
    <>
      <VoltButton onClick={open} className="w-full">Connect a league <Arrow /></VoltButton>
      {tierStatus === 'ready' && leagueCap(tier) === 0 && (
        <p className="mt-2 text-[12px] leading-[1.5] text-v2-ink3">Your {tierLabel(tier)} plan connects no leagues — the dialog says what does.</p>
      )}
      <ConnectLeagueModal ref={modal} onConnected={(league) => noteLeagueConnected(league)} />
    </>
  )
}

export default function LockedRoom({ room, tabs }) {
  const pv = useV2Data(readRoomPreviews)
  const copy = COPY[room.slug] || { headline: `See your real ${room.slug} room`, kicker: 'A sample', lede: room.blurb }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <section aria-labelledby="v2-sample-label" className="order-2 overflow-hidden rounded-[18px] bg-v2-panel ring-1 ring-inset ring-white/[0.07] lg:order-1">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <span id="v2-sample-label" className="inline-flex items-center gap-2">
            <span className="rounded-[5px] bg-v2-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-v2-warn ring-1 ring-inset ring-v2-warn/30">Sample</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink2">
              A typical {pv ? pv.teams : 10}-team league · tonight&rsquo;s real board
            </span>
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3">Not your league</span>
        </div>
        <div className="relative">
          <div aria-hidden="true" inert="" className="pointer-events-none select-none p-4 blur-[1.5px] sm:p-5">
            <div className="mb-4 flex gap-4 overflow-hidden border-b border-white/[0.06] pb-2">
              {tabs.map((t, i) => (
                <span key={t.key} className={`whitespace-nowrap text-[13px] ${i === 0 ? 'text-v2-ink' : 'text-v2-ink3'}`}>{t.label}</span>
              ))}
            </div>
            <Kicker>{copy.kicker}</Kicker>
            <div className="mt-3">
              {!pv ? <Skeleton lines={5} /> : room.slug === 'waiver' ? <WaiverSample pv={pv} /> : room.slug === 'trade' ? <TradeSample pv={pv} /> : room.slug === 'strategy' ? <StrategySample pv={pv} /> : <Skeleton lines={5} />}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-v2-panel" aria-hidden="true" />
        </div>
      </section>

      <aside className="order-1 rounded-[18px] bg-v2-raised p-5 ring-1 ring-inset ring-white/[0.1] sm:p-6 lg:sticky lg:top-24 lg:order-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-v2-ink2">
          <LockIcon className="h-3 w-3" /> Needs your league
        </span>
        <h2 className="mt-2 font-telemetry text-[34px] font-extrabold uppercase italic leading-[0.92] text-v2-ink">{copy.headline}</h2>
        <p className="mt-3 text-[14px] leading-[1.55] text-v2-ink2">{copy.lede}</p>

        <div className="mt-5"><WayIn /></div>

        <p className="mt-4 text-[13px] leading-[1.5] text-v2-ink">Connecting is read-only. Juke never edits your league.</p>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-v2-ink3">{PLATFORM_LINE}</p>

        <div className="mt-5 border-t border-white/[0.07] pt-4">
          <Kicker>Inside the room</Kicker>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <li key={t.key} className="inline-flex items-center gap-1.5 rounded-[7px] bg-v2-inset px-2 py-1 text-[12px] text-v2-ink2 ring-1 ring-inset ring-white/[0.07]">
                {t.label}
                {t.gate && <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-v2-warn">· {tierLabel(t.gate)}</span>}
              </li>
            ))}
          </ul>
        </div>

        <a href="#/v2/draft" className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-v2-ink2 hover:text-v2-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt">
          Or run a free mock draft — no league needed <Arrow className="h-3.5 w-3.5" />
        </a>
      </aside>
    </div>
  )
}
