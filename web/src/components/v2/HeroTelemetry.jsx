import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { SignInButton, SignUpButton } from '@clerk/clerk-react'
import { useLeague } from '../../hooks/useLeague.js'
import { useSignedIn } from '../../hooks/useAuthState.js'
import { useAccountUiReady } from '../../hooks/useAccountUiReady.js'
import { platformFor } from '../shell/leaguePlatforms.js'
import KickoffPill from '../shell/KickoffPill.jsx'
import { freshnessLine } from '../dataFreshness.js'
import { FORMATS, readBoard, readLeagueShape, readLocker } from './v2data.js'
import {
  Arrow, GhostButton, Kicker, PosChip, Segmented, Skeleton, Tween, VoltButton,
  useReducedMotionPref, useV2Data,
} from './v2ui.jsx'

/* Section 1 — the live-wire telemetry board.

   The brief's 25 / 45 / 30 split, as a grid at lg and a stack below it,
   in the order a phone reader needs: what I can do right now (utility),
   what the board thinks (the leaderboard), then what an account adds. */

const SHORT = { standard: 'Std', half: 'Half', ppr: 'Full' }

// ---------------------------------------------------------------------------
// Left: utility
// ---------------------------------------------------------------------------

function LeaguePill() {
  const { status, league } = useLeague()
  if (status === 'loading') {
    return <div className="h-[44px] animate-pulse rounded-[12px] bg-white/[0.04]" aria-hidden="true" />
  }
  const connected = status === 'connected' && league
  const platform = connected ? platformFor(league.provider).name : null
  return (
    <div
      className="flex min-h-[44px] items-center gap-2.5 rounded-[12px] bg-v2-inset px-3 ring-1 ring-inset ring-white/[0.07]"
      aria-live="polite"
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${connected ? 'bg-v2-volt shadow-[0_0_0_3px_rgba(0,255,102,0.15)]' : status === 'error' ? 'bg-v2-warn' : 'bg-v2-ink3'}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-v2-ink">
        {connected ? league.name : status === 'error' ? "Couldn't check your league" : 'No league connected'}
      </span>
      {platform && <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink2">{platform}</span>}
    </div>
  )
}

function LeagueAction() {
  const { status } = useLeague()
  const signedIn = useSignedIn()
  const ready = useAccountUiReady()
  const label = status === 'connected' ? 'Switch or add league' : 'Connect a league'
  // Signed out, connecting starts with an account (the tier ladder puts the
  // first league on the Season Pass), so the honest button is sign-up.
  if (!signedIn && ready) {
    return (
      <SignUpButton mode="modal">
        <button type="button" className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-[10px] text-[13px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.12] transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt">
          {label}
        </button>
      </SignUpButton>
    )
  }
  return <GhostButton href="#/you" className="w-full">{label}</GhostButton>
}

function InProgress() {
  const [summary, setSummary] = useState(null)
  useEffect(() => {
    const engine = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!engine) return
    const read = () => {
      try { setSummary(engine.inProgressSummary ? engine.inProgressSummary() : null) } catch { setSummary(null) }
    }
    read()
    window.addEventListener('juke:data-loaded', read)
    return () => window.removeEventListener('juke:data-loaded', read)
  }, [])
  if (!summary) return null
  return (
    <a
      href="#/rooms/draft"
      className="group flex items-center justify-between gap-3 rounded-[12px] bg-v2-inset px-3 py-2.5 ring-1 ring-inset ring-white/[0.07] transition-colors hover:ring-white/[0.18]"
    >
      <span className="min-w-0">
        <Kicker tone="text-v2-warn">In progress</Kicker>
        <span className="mt-0.5 block truncate text-[13px] text-v2-ink">
          {summary.leagueType} · pick {summary.made + 1} of {summary.total}
        </span>
      </span>
      <span className="shrink-0 text-[13px] font-medium text-v2-ink2 group-hover:text-v2-ink">Resume</span>
    </a>
  )
}

function MockShape() {
  const shape = useV2Data(readLeagueShape)
  if (!shape) return null
  const cells = [
    ['Teams', shape.teams],
    ['Rounds', shape.rounds],
    ['Seat', shape.seat || '—'],
  ]
  return (
    <div className="rounded-[12px] bg-v2-inset p-3 ring-1 ring-inset ring-white/[0.07]">
      <div className="flex items-center justify-between">
        <Kicker>Your mock</Kicker>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink2">{shape.format}</span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-1.5">
        {cells.map(([k, v]) => (
          <div key={k} className="rounded-[8px] bg-white/[0.03] px-2 py-1.5 text-center">
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3">{k}</dt>
            <dd className="font-telemetry text-[22px] font-bold leading-none text-v2-ink tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.08em] text-v2-ink3">
        {shape.lineup}
      </p>
    </div>
  )
}

function Utility() {
  return (
    <div className="flex h-full flex-col gap-3 rounded-[18px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07] sm:p-5">
      <Kicker>Your league</Kicker>
      <LeaguePill />
      <LeagueAction />

      <div className="my-1 h-px bg-white/[0.07]" />

      <VoltButton href="#/rooms/draft" className="w-full">
        Start free mock draft
        <Arrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </VoltButton>
      <p className="-mt-1 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-v2-ink3">
        No account needed · runs in your browser
      </p>
      <InProgress />
      <MockShape />
      <a
        href="#/rooms/draft?friends=1"
        className="flex min-h-[40px] items-center justify-between rounded-[10px] px-1 text-[13px] text-v2-ink2 transition-colors hover:text-v2-ink"
      >
        Draft with friends — one board, real managers
        <Arrow className="h-3.5 w-3.5" />
      </a>
      <div className="mt-auto pt-1">
        <KickoffPill />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Centre: tonight's board
// ---------------------------------------------------------------------------

function MoveMark({ moved }) {
  if (!moved) return <span className="w-6 text-center font-mono text-[10px] text-v2-ink3">·</span>
  const up = moved > 0
  return (
    <span className={`w-6 text-center font-mono text-[10px] tabular-nums ${up ? 'text-v2-volt' : 'text-v2-loss'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(moved)}
      <span className="sr-only">{up ? ' places up' : ' places down'} against standard scoring</span>
    </span>
  )
}

function Leaderboard() {
  const data = useV2Data(readBoard)
  const reduce = useReducedMotionPref()
  const [format, setFormat] = useState(null)
  const [fresh, setFresh] = useState(null)
  useEffect(() => {
    const read = () => setFresh(freshnessLine())
    read()
    window.addEventListener('juke:data-loaded', read)
    return () => window.removeEventListener('juke:data-loaded', read)
  }, [])

  const active = format || (data && data.live) || 'half'
  const rows = data ? data.byFormat[active] : null
  const names = (data && data.names) || {}

  return (
    <section
      aria-labelledby="v2-board-title"
      className="relative flex h-full flex-col overflow-hidden rounded-[18px] bg-v2-panel ring-1 ring-inset ring-white/[0.07]"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] px-4 pb-3.5 pt-4 sm:px-5">
        <div>
          <Kicker>Tonight&apos;s board · live</Kicker>
          <h2 id="v2-board-title" className="mt-1 font-telemetry text-[26px] font-bold uppercase italic leading-none tracking-[0.01em] text-v2-ink">
            Value over replacement
          </h2>
        </div>
        <Segmented
          label="Scoring format"
          size="sm"
          value={active}
          onChange={setFormat}
          options={FORMATS.map((f) => ({ value: f, label: SHORT[f] }))}
        />
      </div>

      <div className="grid grid-cols-[18px_24px_minmax(0,1fr)_52px_minmax(76px,34%)] items-center gap-x-2.5 px-4 pb-1.5 pt-3 sm:px-5">
        <Kicker className="text-center">#</Kicker>
        <span />
        <Kicker>Player</Kicker>
        <Kicker className="text-right">Proj</Kicker>
        <Kicker className="text-right">Over repl.</Kicker>
      </div>

      <div className="flex-1 px-2 pb-2 sm:px-3">
        {rows ? (
          <ol>
            {rows.map((r, i) => (
              <motion.li
                key={r.id}
                layout={!reduce}
                transition={{ type: 'spring', stiffness: 460, damping: 38 }}
                className="grid grid-cols-[18px_24px_minmax(0,1fr)_52px_minmax(76px,34%)] items-center gap-x-2.5 rounded-[10px] px-2 py-2 transition-colors hover:bg-white/[0.03] sm:py-2.5"
              >
                <span className="text-center font-mono text-[12px] tabular-nums text-v2-ink3">{i + 1}</span>
                <MoveMark moved={r.moved} />
                <span className="flex min-w-0 items-center gap-2.5">
                  <PosChip pos={r.pos} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-v2-ink">{r.name}</span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">{r.team}</span>
                  </span>
                </span>
                <Tween value={r.pts} className="text-right font-mono text-[12px] text-v2-ink2" />
                <span className="flex items-center gap-2">
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-v2-volt/80 transition-[width] duration-500 ease-out"
                      style={{ width: `${Math.max(2, (r.vorp / data.max) * 100)}%` }}
                    />
                  </span>
                  <Tween value={r.vorp} signed className="w-[42px] text-right font-mono text-[14px] font-semibold text-v2-volt" />
                </span>
              </motion.li>
            ))}
          </ol>
        ) : (
          <div className="px-2 py-2"><Skeleton lines={8} /></div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-3 sm:px-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3">
          {names[active] || ''} · pts over a replaceable starter{fresh ? ` · ${fresh}` : ''}
        </span>
        <a href="#/rooms/draft" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-v2-ink2 transition-colors hover:text-v2-ink">
          Draft against this board <Arrow className="h-3.5 w-3.5" />
        </a>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Right: account center
// ---------------------------------------------------------------------------

function AccountCenter() {
  const signedIn = useSignedIn()
  const ready = useAccountUiReady()
  const locker = useV2Data(readLocker)
  const [sync, setSync] = useState('off')
  useEffect(() => {
    const engine = typeof window !== 'undefined' ? window.JukeEngine : null
    const read = () => { try { setSync(engine && engine.syncStatus ? engine.syncStatus() : 'off') } catch { setSync('off') } }
    read()
    window.addEventListener('juke:header', read)
    return () => window.removeEventListener('juke:header', read)
  }, [])

  const count = locker ? locker.count : null
  const best = locker && locker.best
  const last = locker && locker.last

  const signup = (
    <button type="button" className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[11px] bg-v2-ink px-4 text-[14px] font-semibold text-v2-ground transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt">
      Create free account
    </button>
  )
  const login = (
    <button type="button" className="inline-flex min-h-[44px] items-center justify-center rounded-[11px] px-4 text-[14px] font-medium text-v2-ink2 transition-colors hover:text-v2-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt">
      Log in
    </button>
  )

  return (
    <div className="relative h-full">
      {/* The glow is what gives glass something to be glass over. Without a
          lit backdrop a backdrop-blur on #0B0F19 blurs nothing and the card
          reads as a flat grey box. */}
      <div className="pointer-events-none absolute -inset-y-4 inset-x-0 -z-10 rounded-[28px] bg-[radial-gradient(60%_50%_at_70%_20%,rgba(139,92,246,0.28),transparent_70%),radial-gradient(50%_45%_at_20%_90%,rgba(34,211,238,0.18),transparent_70%)] blur-xl" aria-hidden="true" />
      <div className="flex h-full flex-col gap-4 rounded-[18px] bg-white/[0.045] p-5 ring-1 ring-inset ring-white/[0.12] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <Kicker>Account center</Kicker>
          <span className={`font-mono text-[10px] uppercase tracking-[0.12em] ${signedIn && sync === 'ok' ? 'text-v2-volt' : 'text-v2-ink3'}`}>
            {signedIn ? (sync === 'ok' ? '● Synced' : sync === 'error' ? 'Sync paused' : 'Signed in') : 'Local only'}
          </span>
        </div>

        <div className="flex items-end gap-3">
          <span className="font-telemetry text-[64px] font-bold italic leading-[0.8] text-v2-ink tabular-nums">
            {count === null ? '—' : count}
          </span>
          <span className="pb-1 text-[14px] leading-snug text-v2-ink2">
            mock draft{count === 1 ? '' : 's'}
            <br />
            {signedIn ? 'in your synced locker' : 'saved in this browser'}
          </span>
        </div>

        <p className="text-[14px] leading-[1.55] text-v2-ink2">
          {signedIn
            ? 'Every mock you finish is graded and kept on every device you sign in on.'
            : count
              ? 'Create a free account to sync your draft history and analytics across devices.'
              : 'Your first mock saves here automatically — no account. Create one to keep it on every device.'}
        </p>

        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-[12px] bg-black/20 px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]">
            <dt><Kicker>Best finish</Kicker></dt>
            <dd className="mt-1 font-mono text-[14px] tabular-nums text-v2-ink">
              {best ? `${best.grade} · ${best.projectedRank} of ${best.teams}` : '—'}
            </dd>
          </div>
          <div className="rounded-[12px] bg-black/20 px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]">
            <dt><Kicker>Last draft</Kicker></dt>
            <dd className="mt-1 truncate font-mono text-[14px] tabular-nums text-v2-ink">{last ? last.dateCompleted : '—'}</dd>
          </div>
        </dl>

        {locker && locker.list.length > 0 && (
          <div>
            <Kicker>Recent</Kicker>
            <ul className="mt-2 divide-y divide-white/[0.05] rounded-[12px] bg-black/20 ring-1 ring-inset ring-white/[0.06]">
              {locker.list.slice(0, 3).map((e) => (
                <li key={e.id}>
                  <a
                    href={`#/rooms/draft?report=${encodeURIComponent(e.id)}`}
                    className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="font-telemetry text-[20px] font-bold italic leading-none text-v2-ink">{e.grade || '—'}</span>
                    <span className="min-w-0 truncate text-[12px] text-v2-ink2">{e.leagueType} · seat {e.seat}</span>
                    <span className="font-mono text-[10px] tabular-nums text-v2-ink3">{e.rank ? `${e.projectedRank}/${e.teams}` : ''}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto flex items-center gap-2">
          {signedIn ? (
            <a href="#/v2/drafts" className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[11px] bg-v2-ink px-4 text-[14px] font-semibold text-v2-ground transition-transform hover:-translate-y-px">
              Open your locker <Arrow />
            </a>
          ) : ready ? (
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
    </div>
  )
}

export default function HeroTelemetry() {
  return (
    <section className="relative">
      <div className="max-w-[900px]">
        <Kicker tone="text-v2-ink2">Agility through analytics</Kicker>
        <h1 className="mt-3 font-telemetry text-[clamp(3rem,7.4vw,6.2rem)] font-extrabold uppercase italic leading-[0.86] tracking-[-0.005em] text-v2-ink">
          Know the move{' '}
          <br className="hidden sm:block" />
          <span className="text-v2-ink2">before your league.</span>
        </h1>
        <p className="mt-4 max-w-[58ch] text-[16px] leading-[1.55] text-v2-ink2 sm:text-[17px]">
          Every player priced in points over a replaceable starter, under your league&apos;s own
          scoring — rebuilt from raw stats every night, with the arithmetic shown.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:mt-10 lg:grid-cols-[minmax(0,25fr)_minmax(0,45fr)_minmax(0,30fr)] lg:items-stretch">
        <Utility />
        <Leaderboard />
        <AccountCenter />
      </div>
    </section>
  )
}
