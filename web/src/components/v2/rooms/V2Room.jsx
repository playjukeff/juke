import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { roomIsOpen, lockReason } from '../../RoomPage.jsx'
import { TABS as WAIVER_TABS } from '../../rooms/WaiverRoomLive.jsx'
import { TABS as TRADE_TABS } from '../../rooms/TradeRoomLive.jsx'
import { TABS as STRATEGY_TABS } from '../../rooms/StrategyRoomLive.jsx'
import { TABS as PROSPECT_TABS } from '../../rooms/ProspectRoomLive.jsx'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { useRooms } from '../../../hooks/useRooms.js'
import { retryLeagues, retrySnapshot } from '../../../hooks/useLeague.js'
import { useLeagueFresh as useLeague, useSnapshotFresh as useLeagueSnapshot } from '../stores.js'
import { useTierFresh as useTier } from '../stores.js'
import { meetsTier, tierLabel } from '../../../lib/tiers.js'
import { Arrow, Kicker, LockIcon, useReducedMotionPref } from '../v2ui.jsx'
import { Loading, RoomIcon } from './roomKit.jsx'
import LockedRoom from './LockedRoom.jsx'
import WaiverLive from './WaiverLive.jsx'
import TradeLive from './TradeLive.jsx'
import StrategyLive from './StrategyLive.jsx'
import ProspectRoom from './ProspectRoom.jsx'

/* #/v2/rooms/<slug> — every room, one page.

   ---- Who may see what is production's answer, asked, never restated ----

   RoomPage.jsx decides it with two exported functions, and this page asks
   them rather than keeping a third list of which rooms a league opens:

     roomIsOpen(room, 'none')          open with no league at all -> Prospect
     lockReason(room, 'none') 'league' opened by a connected league -> Waiver,
                                       Trade, Strategy (LIVE_ROOMS)
     lockReason(room, 'none') 'building' nothing behind it yet

   So a room that joins LIVE_ROOMS or OPEN_ROOMS in production changes here
   with no edit. What IS written down here is which v2 body draws which
   slug, and the tab list comes off each production room's own TABS export
   — the one place a room declares its sections.

   ---- Four states per league room, not two ----

   Production draws the locked preview whenever the league status is not
   'connected' — which flashes the lock at a connected reader on the first
   tick, and draws "sign up" over an unreachable worker. Here 'loading' is
   a skeleton, 'error' says it could not check and offers the retry, 'none'
   is the locked preview, 'connected' is the room. */

const BODIES = { waiver: WaiverLive, trade: TradeLive, strategy: StrategyLive }
const TABS = { waiver: WAIVER_TABS, trade: TRADE_TABS, strategy: STRATEGY_TABS, prospect: PROSPECT_TABS }
const LEDE = {
  waiver: 'Every player nobody in your league owns, priced against replacement.',
  trade: 'Both rosters priced against replacement, before you send it.',
  strategy: 'What your lineup projects, and the one swap that changes it.',
  prospect: 'Every first-year player on the board, ranked — and what Juke does not know about them.',
}

function Redirect({ to, label }) {
  // replace(), never assign(): the old address must not become a
  // back-button trap — the same call production makes for #/draft.
  useEffect(() => {
    if (typeof window !== 'undefined') location.replace(location.pathname + location.search + to)
  }, [to])
  return (
    <div className="grid min-h-[40vh] place-items-center text-center" role="status">
      <a href={to} className="inline-flex items-center gap-1.5 text-[15px] text-v2-ink2 hover:text-v2-ink">
        {label} <Arrow />
      </a>
    </div>
  )
}

function NotFound({ slug, count }) {
  return (
    <div className="grid min-h-[50vh] place-items-center text-center">
      <div className="max-w-[540px]">
        <Kicker tone="text-v2-ink2">404 · no such room</Kicker>
        <h1 className="mt-3 font-telemetry text-[clamp(2.8rem,6vw,5rem)] font-extrabold uppercase italic leading-[0.88] text-v2-ink">
          That room isn&rsquo;t on the floor plan.
        </h1>
        <p className="mt-4 text-[16px] leading-[1.55] text-v2-ink2">
          There is no room called <span className="font-mono text-v2-ink">{slug}</span>. The {count} that exist are one click away.
        </p>
        <a
          href="#/v2/rooms"
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-[10px] bg-v2-volt px-4 text-[14px] font-semibold text-v2-voltInk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt focus-visible:ring-offset-2 focus-visible:ring-offset-v2-ground"
        >
          See every room <Arrow />
        </a>
      </div>
    </div>
  )
}

/* The room's section switcher. Buttons with aria-pressed, 44px tall, volt
   only under the selected one. A gated section says which tier opens it,
   loud (warn, with a lock) while this reader is below it and quiet once
   they are not — the same fact either way, which is what production's
   always-drawn badge says. */
function Sections({ tabs, active, onChange, tier }) {
  if (!tabs || tabs.length < 2) return null
  return (
    <nav aria-label="Room sections" className="overflow-x-auto border-b border-white/[0.07]">
      <div className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const on = t.key === active
          const shut = t.gate && !meetsTier(tier, t.gate)
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(t.key)}
              className={`relative inline-flex min-h-[46px] items-center gap-2 whitespace-nowrap rounded-t-[8px] px-3 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v2-volt ${on ? 'text-v2-ink' : 'text-v2-ink2 hover:text-v2-ink'}`}
            >
              {t.label}
              {t.gate && (
                <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${shut ? 'text-v2-warn' : 'text-v2-ink3'}`}>
                  {shut && <LockIcon className="h-3 w-3" />}{tierLabel(t.gate)}
                </span>
              )}
              {on && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-v2-volt" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function Head({ room, eyebrow, lede, meta }) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-[760px]">
        <a
          href="#/v2/rooms"
          className="-ml-1 inline-flex min-h-[32px] items-center gap-1 rounded-[6px] px-1 font-mono text-[11px] uppercase tracking-[0.12em] text-v2-ink3 hover:text-v2-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
        >
          <Arrow className="h-3.5 w-3.5 rotate-180" /> The rooms
        </a>
        <div className="mt-3 flex items-center gap-2">
          {/* The room's own hue lives here and nowhere else: a mark with no
              text on it. Volt stays the action colour. */}
          <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-white/[0.04] ring-1 ring-inset ring-white/[0.08]">
            <RoomIcon slug={room.slug} className="h-4 w-4" style={{ color: room.accent }} />
          </span>
          <Kicker tone="text-v2-ink2">{eyebrow}</Kicker>
        </div>
        <h1 className="mt-3 font-telemetry text-[clamp(2.8rem,6vw,5rem)] font-extrabold uppercase italic leading-[0.88] text-v2-ink">
          {room.name}
        </h1>
        <p className="mt-4 max-w-[60ch] text-[16px] leading-[1.55] text-v2-ink2">{lede}</p>
      </div>
      {meta && meta.length > 0 && (
        <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-3 rounded-[14px] bg-v2-panel px-4 py-3 ring-1 ring-inset ring-white/[0.07] sm:grid-cols-4 lg:grid-cols-2">
          {meta.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt><Kicker>{k}</Kicker></dt>
              <dd className="mt-0.5 truncate text-[14px] font-medium text-v2-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function Frame({ room, eyebrow, lede, meta, tabs, tab, setTab, tier, children }) {
  const reduce = useReducedMotionPref()
  return (
    <div>
      <Head room={room} eyebrow={eyebrow} lede={lede} meta={meta} />
      <div className="mt-8">
        <Sections tabs={tabs} active={tab} onChange={setTab} tier={tier} />
      </div>
      {/* Keyed on the section so the panel that replaced the last one says
          so by arriving, rather than looking edited in place. */}
      <motion.div
        key={tab}
        className="mt-6"
        initial={{ opacity: 0, y: reduce ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.22, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </div>
  )
}

/* One room. Keyed on the slug by its parent, so moving between rooms never
   opens the second on a section key the first one owned. */
function Room({ room, league, leagueStatus, tier, snap }) {
  const [tab, setTab] = useState('lobby')
  const slug = room.slug
  const tabs = TABS[slug] || []

  const openNoLeague = !room.live && roomIsOpen(room, 'none')
  const byLeague = lockReason(room, 'none') === 'league'
  const live = byLeague && leagueStatus === 'connected' && !!league

  if (openNoLeague) {
    return (
      <Frame
        room={room}
        eyebrow={`${room.season} · open · no league needed`}
        lede={LEDE[slug] || room.blurb}
        meta={[['Access', 'Free'], ['Source', 'Tonight’s board']]}
        tabs={tabs}
        tab={tab}
        setTab={setTab}
        tier={tier}
      >
        {slug === 'prospect' ? <ProspectRoom tab={tab} setTab={setTab} /> : null}
      </Frame>
    )
  }

  if (live && BODIES[slug]) {
    const Body = BODIES[slug]
    const platform = platformFor(league.provider).name
    const s = snap.snapshot
    const eyebrow = [league.name, `${league.totalTeams} teams`].concat(s && s.week ? [`week ${s.week}`] : []).join(' · ')
    return (
      <Frame
        room={room}
        eyebrow={eyebrow}
        lede={LEDE[slug] || room.blurb}
        meta={[
          ['League', league.name],
          ['Platform', platform],
          ['Week', s && s.week ? String(s.week) : '—'],
          ['Plan', tier ? tierLabel(tier) : '—'],
        ]}
        tabs={tabs}
        tab={tab}
        setTab={setTab}
        tier={tier}
      >
        <Body
          league={league}
          snapshot={s}
          status={snap.status}
          reason={snap.reason}
          tab={tab}
          setTab={setTab}
          onRetry={() => retrySnapshot(league.leagueId, league.provider)}
        />
      </Frame>
    )
  }

  const guestHead = (children) => (
    <div>
      <Head room={room} eyebrow={`${room.season} · preview`} lede={LEDE[slug] || room.blurb} />
      <div className="mt-8">{children}</div>
    </div>
  )

  if (byLeague && leagueStatus === 'loading') return guestHead(<Loading />)

  if (byLeague && leagueStatus === 'error') {
    return guestHead(
      <div className="rounded-[18px] bg-v2-panel px-6 py-10 text-center ring-1 ring-inset ring-white/[0.07]" role="alert">
        <p className="font-telemetry text-[26px] font-bold uppercase italic leading-none text-v2-ink">We could not check your league</p>
        <p className="mx-auto mt-3 max-w-[52ch] text-[14px] leading-[1.55] text-v2-ink2">
          Juke could not find out whether you have a league connected, so it is not going to guess and ask you to
          connect one you may already have.
        </p>
        <button
          type="button"
          onClick={retryLeagues}
          className="mt-5 inline-flex min-h-[44px] items-center rounded-[10px] px-4 text-[13px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.14] hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
        >
          Try again
        </button>
      </div>
    )
  }

  if (byLeague) return guestHead(<LockedRoom room={room} tabs={tabs} />)

  // A room with nothing behind it yet: honest and visibly unfinished,
  // rather than a 404 for a link the lobby offers.
  return guestHead(
    <div className="rounded-[18px] bg-v2-panel px-6 py-12 text-center ring-1 ring-inset ring-white/[0.07]">
      <p className="font-telemetry text-[26px] font-bold uppercase italic leading-none text-v2-ink">Being built</p>
      <p className="mx-auto mt-3 max-w-[48ch] text-[14px] leading-[1.55] text-v2-ink2">{room.blurb}</p>
    </div>
  )
}

export default function V2Room({ slug }) {
  const rooms = useRooms()
  const { status: leagueStatus, league } = useLeague()
  const { tier } = useTier()
  const room = rooms.find((r) => r.slug === slug) || null
  const liveable = !!(room && lockReason(room, 'none') === 'league' && leagueStatus === 'connected' && league)

  // Above every return: the snapshot is asked for here, once, and a null id
  // asks for nothing — so a room that is never live never touches the worker.
  const snap = useLeagueSnapshot(liveable ? league.leagueId : null, liveable ? league.provider : null)

  // The Draft Room lives at the v2 draft launcher; the League Room
  // graduated into My League. Both are redirects, not dead ends.
  if (slug === 'draft') return <Redirect to="#/v2/draft" label="Opening the Draft Room" />
  if (slug === 'league') return <Redirect to="#/v2/league" label="The League Room is My League now" />

  if (!rooms.length) return <Loading />
  if (!room) return <NotFound slug={slug} count={rooms.length} />
  if (room.live) return <Redirect to="#/v2/draft" label={`Opening ${room.name}`} />

  return <Room key={slug} room={room} league={league} leagueStatus={leagueStatus} tier={tier} snap={snap} />
}
