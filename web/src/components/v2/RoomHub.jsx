import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRooms } from '../../hooks/useRooms.js'
import { readRoomPreviews } from './v2data.js'
import { Arrow, GhostButton, Kicker, LockIcon, PosChip, Skeleton, VoltButton, useReducedMotionPref, useV2Data } from './v2ui.jsx'

/* Section 4 — the five rooms as one hub, mid-page.

   Two are open to everybody and say so; three read a connected league and
   are drawn as premium, each carrying a live line computed on tonight's
   board. Pressing a premium room opens a drawer with the fuller preview
   and the way in — which is the real room page, because that page carries
   the real unlock flow and a second one here would be a second answer to
   one question.

   Every preview names its league as "a typical N-team league". The players
   and the points are real; the league is the invented half, and saying so
   is what separates a demo from a fabrication. No FAAB figure appears: a
   budget is a fact about a league this page cannot see. */

const FREE = { draft: 'Unlimited', prospect: 'Free' }
const PREMIUM = ['waiver', 'trade', 'strategy']

function RoomIcon({ slug, className = 'h-5 w-5' }) {
  const p = { stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {slug === 'draft' && (<><circle cx="10" cy="10" r="7" {...p} /><circle cx="10" cy="10" r="3.5" {...p} /><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" {...p} /></>)}
      {slug === 'prospect' && (<><path d="M3 12l9-5 1.5 3-9 5z" {...p} /><path d="M12.5 7.5l3-1.7 1.4 2.6-3 1.7M7 14.2 6 18M9 13l1.5 5" {...p} /></>)}
      {slug === 'waiver' && <path d="M11 2 4.5 11H10l-1 7 6.5-9H10z" {...p} />}
      {slug === 'trade' && <path d="M4 7h11l-3-3M16 13H5l3 3" {...p} />}
      {slug === 'strategy' && (<><circle cx="10" cy="10" r="7.5" {...p} /><path d="m12.8 7.2-1.6 4-4 1.6 1.6-4z" {...p} /></>)}
    </svg>
  )
}

function premiumLine(slug, pv) {
  if (!pv) return null
  if (slug === 'waiver' && pv.wire[0]) {
    const w = pv.wire[0]
    return { label: 'Top of a typical wire', value: `${w.name}`, stat: w.pg !== null ? `${w.pg} pts/gm` : '' }
  }
  if (slug === 'trade' && pv.trade) {
    return { label: 'Market-even swap', value: `${pv.trade.give.name.split(' ').slice(-1)[0]} → ${pv.trade.get.name.split(' ').slice(-1)[0]}`, stat: `+${pv.trade.swing} pts` }
  }
  if (slug === 'strategy' && pv.sit) {
    return { label: 'Start / sit tonight', value: `Start ${pv.sit.start.name.split(' ').slice(-1)[0]}`, stat: `+${pv.sit.diff} pts/wk` }
  }
  return null
}

function freeFacts(slug, pv) {
  if (!pv) return []
  if (slug === 'draft') {
    return [`${pv.boardSize} players`, pv.teamRange ? `${pv.teamRange} teams` : null, 'Std · Half · Full PPR', 'Graded on finish'].filter(Boolean)
  }
  return ['Every incoming rookie', 'Priced over replacement', 'No league needed']
}

function FreeCard({ room, expanded, preview }) {
  const href = room.href || `#/rooms/${room.slug}`
  const facts = freeFacts(room.slug, preview)
  return (
    <a
      href={href}
      className="group relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-[18px] bg-v2-panel p-5 ring-1 ring-inset ring-white/[0.08] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:ring-white/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-white/[0.04] text-v2-ink ring-1 ring-inset ring-white/[0.08]">
          <RoomIcon slug={room.slug} />
        </span>
        <span className="rounded-full bg-v2-volt/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-v2-volt ring-1 ring-inset ring-v2-volt/30">
          {FREE[room.slug]}
        </span>
      </div>
      <div>
        <Kicker>{room.season}</Kicker>
        <h3 className="mt-1.5 font-telemetry text-[34px] font-bold uppercase italic leading-[0.92] text-v2-ink">{room.name}</h3>
        <p className="mt-2 max-w-[48ch] text-[14px] leading-[1.55] text-v2-ink2">{expanded ? room.blurb : room.lead}</p>
        {facts.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <li key={f} className="rounded-[7px] bg-white/[0.035] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink2 ring-1 ring-inset ring-white/[0.07]">{f}</li>
            ))}
          </ul>
        )}
      </div>
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-v2-ink">
        {room.slug === 'draft' ? 'Start a mock draft' : 'Open the room'}
        <Arrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  )
}

function PremiumCard({ room, preview, onOpen, expanded }) {
  const line = premiumLine(room.slug, preview)
  return (
    <button
      type="button"
      onClick={(e) => onOpen(room, e.currentTarget)}
      aria-haspopup="dialog"
      className="group relative h-full rounded-[18px] bg-[linear-gradient(135deg,rgba(0,255,102,0.55),rgba(34,211,238,0.35)_40%,rgba(139,92,246,0.5))] p-px text-left transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt focus-visible:ring-offset-2 focus-visible:ring-offset-v2-ground"
    >
      <span className="flex h-full flex-col gap-5 rounded-[17px] bg-[linear-gradient(180deg,#141A27,#0F1420)] p-5">
        <span className="flex items-start justify-between gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-white/[0.04] text-v2-ink ring-1 ring-inset ring-white/[0.08]">
            <RoomIcon slug={room.slug} />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-v2-ink2 ring-1 ring-inset ring-white/[0.12]">
            <LockIcon className="h-3 w-3" /> Season Pass
          </span>
        </span>
        <span>
          <Kicker>{room.season}</Kicker>
          <span className="mt-1.5 block font-telemetry text-[28px] font-bold uppercase italic leading-[0.92] text-v2-ink">{room.name}</span>
          <span className="mt-1.5 block text-[13px] leading-[1.5] text-v2-ink2">{expanded ? room.blurb : room.lead}</span>
        </span>
        <span className="mt-auto block rounded-[12px] bg-black/25 px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]">
          {line ? (
            <>
              <span className="flex items-center gap-1.5">
                {/* 12px box for a 6px dot: animate-ping scales to 2x, so the
                    ring needs the room or it spills past its own box. */}
                <span className="relative grid h-3 w-3 place-items-center" aria-hidden="true">
                  <span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-v2-volt opacity-50 motion-reduce:hidden" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-v2-volt" />
                </span>
                <Kicker>{line.label} · live</Kicker>
              </span>
              <span className="mt-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-[14px] font-medium text-v2-ink">{line.value}</span>
                <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-v2-volt">{line.stat}</span>
              </span>
            </>
          ) : (
            <span className="block h-9 animate-pulse rounded bg-white/[0.04]" />
          )}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-v2-ink">
          Preview the room <Arrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </button>
  )
}

function Analyzing({ label }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-v2-inset px-4 py-3 ring-1 ring-inset ring-white/[0.06]" role="status">
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <span className="absolute inset-y-0 w-1/3 animate-[v2scan_0.9s_ease-in-out_infinite] rounded-full bg-v2-volt/70" />
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-v2-ink2">{label}</span>
      <style>{'@keyframes v2scan{0%{left:-33%}100%{left:100%}}'}</style>
    </div>
  )
}

const DRAWER_COPY = {
  waiver: {
    scanning: 'Pricing the wire…',
    title: 'Win the wire',
    does: ['Ranks every free agent in your league by points over your weakest starter.', 'Reads whether your league bids FAAB or runs a waiver order, and advises in that system.', 'Sums how many points your lineup is leaving on the wire this week.'],
  },
  trade: {
    scanning: 'Pricing both rosters…',
    title: 'Price the deal',
    does: ['Values both rosters against replacement, with the rest-of-season swing for each side.', 'Knows your trade deadline, from your own league’s settings.', 'Shows the swing before you send the offer, not after.'],
  },
  strategy: {
    scanning: 'Projecting the week…',
    title: 'Set the lineup',
    does: ['Your league’s own projection for each starter this week, under its own scoring.', 'The one swap worth making, and the win probability either way.', 'Who is out, from your platform’s live designations.'],
  },
}

function WaiverPreview({ pv }) {
  return (
    <div>
      <Kicker>Likely on the wire in a typical {pv.teams}-team league</Kicker>
      <ol className="mt-3 divide-y divide-white/[0.05] rounded-[12px] bg-v2-inset ring-1 ring-inset ring-white/[0.06]">
        {pv.wire.map((w) => (
          <li key={w.id} className="grid grid-cols-[34px_minmax(0,1fr)_64px_56px] items-center gap-3 px-3 py-2.5">
            <PosChip pos={w.pos} />
            <span className="min-w-0">
              <span className="block truncate text-[14px] text-v2-ink">{w.name}</span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">{w.team}</span>
            </span>
            <span className="text-right font-mono text-[12px] tabular-nums text-v2-ink2">{w.pg ?? '—'}/gm</span>
            <span className={`text-right font-mono text-[13px] font-semibold tabular-nums ${w.gap > 0 ? 'text-v2-volt' : 'text-v2-loss'}`}>
              {w.gap > 0 ? '+' : '−'}{Math.abs(w.gap)}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[12px] leading-[1.5] text-v2-ink3">
        Last column: season points against a replaceable starter. Below zero is normal for the wire — the room
        asks the sharper question, which is whether he beats <em>your</em> weakest starter.
      </p>
    </div>
  )
}

function TradePreview({ pv }) {
  const t = pv.trade
  if (!t) return null
  const Side = ({ tag, p }) => (
    <div className="rounded-[12px] bg-v2-inset p-3 ring-1 ring-inset ring-white/[0.06]">
      <Kicker>{tag}</Kicker>
      <div className="mt-2 flex items-center gap-2"><PosChip pos={p.pos} /><span className="font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">{p.team}</span></div>
      <span className="mt-1.5 block text-[15px] font-semibold leading-snug text-v2-ink">{p.name}</span>
      <dl className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px]">
        <dt className="text-v2-ink3">ADP</dt><dd className="text-right tabular-nums text-v2-ink">{p.adp}</dd>
        <dt className="text-v2-ink3">Over repl.</dt><dd className="text-right tabular-nums text-v2-ink">{p.gap > 0 ? '+' : ''}{p.gap}</dd>
      </dl>
    </div>
  )
  return (
    <div>
      <Kicker>A swap the market calls even</Kicker>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Side tag="You send" p={t.give} />
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.04] text-v2-ink2 ring-1 ring-inset ring-white/[0.1]"><RoomIcon slug="trade" className="h-4 w-4" /></span>
        <Side tag="You get" p={t.get} />
      </div>
      <div className="mt-3 flex items-baseline justify-between rounded-[12px] bg-v2-volt/[0.07] px-4 py-3 ring-1 ring-inset ring-v2-volt/25">
        <span className="text-[13px] text-v2-ink2">Season swing for you</span>
        <span className="font-telemetry text-[34px] font-bold italic leading-none text-v2-volt">+{t.swing} pts</span>
      </div>
      <p className="mt-2 text-[12px] leading-[1.5] text-v2-ink3">
        Drafted within three picks of each other. ADP says even; points over replacement say otherwise.
      </p>
    </div>
  )
}

function StrategyPreview({ pv }) {
  const s = pv.sit
  if (!s) return null
  const max = Math.max(s.start.pg, s.bench.pg)
  const Row = ({ tag, p, on }) => (
    <div className="grid grid-cols-[64px_minmax(0,1fr)_minmax(80px,40%)_48px] items-center gap-3 px-3 py-3">
      <span className={`font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${on ? 'text-v2-volt' : 'text-v2-ink3'}`}>{tag}</span>
      <span className="min-w-0"><span className="block truncate text-[14px] text-v2-ink">{p.name}</span><span className="font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">WR · {p.team}</span></span>
      <span className="relative h-2 overflow-hidden rounded-full bg-white/[0.05]"><span className={`absolute inset-y-0 left-0 rounded-full ${on ? 'bg-v2-volt' : 'bg-v2-ink3/60'}`} style={{ width: `${(p.pg / max) * 100}%` }} /></span>
      <span className="text-right font-mono text-[13px] tabular-nums text-v2-ink">{p.pg}</span>
    </div>
  )
  return (
    <div>
      <Kicker>A start / sit the market calls a coin flip</Kicker>
      <div className="mt-3 divide-y divide-white/[0.05] rounded-[12px] bg-v2-inset ring-1 ring-inset ring-white/[0.06]">
        <Row tag="Start" p={s.start} on />
        <Row tag="Bench" p={s.bench} />
      </div>
      <div className="mt-3 flex items-baseline justify-between rounded-[12px] bg-v2-volt/[0.07] px-4 py-3 ring-1 ring-inset ring-v2-volt/25">
        <span className="text-[13px] text-v2-ink2">Projected edge, per game</span>
        <span className="font-telemetry text-[34px] font-bold italic leading-none text-v2-volt">+{s.diff}</span>
      </div>
      <p className="mt-2 text-[12px] leading-[1.5] text-v2-ink3">
        Two receivers drafted back to back, priced as a season average. Connected, the room reads your
        league&apos;s own projection for this exact week.
      </p>
    </div>
  )
}

function RoomDrawer({ room, preview, onClose }) {
  const closeRef = useRef(null)
  const reduce = useReducedMotionPref()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(false)
    const t = setTimeout(() => setReady(true), reduce ? 0 : 900)
    return () => clearTimeout(t)
  }, [room, reduce])

  useEffect(() => {
    if (!room) return
    closeRef.current && closeRef.current.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [room, onClose])

  const copy = room ? DRAWER_COPY[room.slug] : null

  return (
    <AnimatePresence>
      {room && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="v2-drawer-title"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[500px] flex-col bg-v2-panel shadow-[-24px_0_60px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.08]"
            initial={{ x: reduce ? 0 : '100%' }} animate={{ x: 0 }} exit={{ x: reduce ? 0 : '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-white/[0.04] text-v2-ink ring-1 ring-inset ring-white/[0.08]">
                  <RoomIcon slug={room.slug} />
                </span>
                <div>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-v2-ink2">
                    <LockIcon className="h-3 w-3" /> Season Pass · live preview
                  </span>
                  <h2 id="v2-drawer-title" className="font-telemetry text-[30px] font-bold uppercase italic leading-none text-v2-ink">{room.name}</h2>
                </div>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close preview"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-v2-ink2 ring-1 ring-inset ring-white/[0.1] hover:text-v2-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <p className="text-[15px] leading-[1.55] text-v2-ink2">{room.blurb}</p>
              {!ready || !preview ? (
                <>
                  <Analyzing label={copy.scanning} />
                  <Skeleton lines={4} />
                </>
              ) : (
                <motion.div initial={{ opacity: 0, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                  {room.slug === 'waiver' && <WaiverPreview pv={preview} />}
                  {room.slug === 'trade' && <TradePreview pv={preview} />}
                  {room.slug === 'strategy' && <StrategyPreview pv={preview} />}
                </motion.div>
              )}

              <div>
                <Kicker>With your league connected</Kicker>
                <ul className="mt-2 space-y-2">
                  {copy.does.map((d) => (
                    <li key={d} className="flex gap-2.5 text-[14px] leading-[1.5] text-v2-ink2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-v2-volt" aria-hidden="true" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-2.5 border-t border-white/[0.07] p-5">
              <VoltButton href={`#/rooms/${room.slug}`} className="w-full">
                Sync your league · Season Pass <Arrow />
              </VoltButton>
              <GhostButton href="#/rooms/draft" className="w-full">Start a free mock instead</GhostButton>
              <p className="text-center font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3">
                Read-only · Juke never edits your league
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

export default function RoomHub({ expanded = false }) {
  const rooms = useRooms()
  const preview = useV2Data(readRoomPreviews)
  const [open, setOpen] = useState(null)
  const trigger = useRef(null)

  const onOpen = (room, el) => { trigger.current = el; setOpen(room) }
  const onClose = () => {
    setOpen(null)
    // Focus goes back to the card that opened it, so a keyboard reader
    // is not dropped at the top of the document.
    requestAnimationFrame(() => trigger.current && trigger.current.focus())
  }

  if (!rooms.length) return <div className="rounded-[20px] bg-v2-panel p-6 ring-1 ring-inset ring-white/[0.07]"><Skeleton lines={4} /></div>

  const free = ['draft', 'prospect'].map((s) => rooms.find((r) => r.slug === s)).filter(Boolean)
  const premium = PREMIUM.map((s) => rooms.find((r) => r.slug === s)).filter(Boolean)

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {free.map((r) => <FreeCard key={r.slug} room={r} expanded={expanded} preview={preview} />)}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {premium.map((r) => <PremiumCard key={r.slug} room={r} preview={preview} onOpen={onOpen} expanded={expanded} />)}
      </div>
      <RoomDrawer room={open} preview={preview} onClose={onClose} />
    </>
  )
}
