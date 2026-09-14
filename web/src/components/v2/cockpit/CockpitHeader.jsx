import JukeLogo from '../../juke-logo/JukeLogo.jsx'
import { Kicker } from '../v2ui.jsx'
import { LAUNCH_HASH } from './flow.js'
import { useClockTick } from './useCockpit.js'
import { FOCUS, IconButton, Switch, fmtClock } from './parts.jsx'
import { IconBack, IconDots, IconMute, IconPause, IconPlay, IconSound } from './icons.jsx'

/* The pick, the clock and the controls that change what happens next.

   What it reads is engine.headerInfo() — the exact branching the legacy
   header and production's DraftCockpitHeader both paint from — so whose
   turn it is, "your turn in N" and the urgent flag are computed once, in
   app.js, and never re-derived here. The pick code comes from
   DraftEngine.pickCode(), which owns the snake's mirror.

   ---- The pick is the fact, the state is the label ----

   CLAUDE.md records the bar that led with "You're on the clock!" at 16px
   and buried the pick under it: by the time the sentence is readable the
   colour has said it. So the pick code is the display numeral and the
   state is a mono label above it, in both states. */

function ClockReadout({ engine, header, phone }) {
  // The one part of this bar that moves every second, and the only part
  // that re-renders on every tick.
  useClockTick(engine)
  const timeLeft = engine.timeLeft()
  const clockLength = engine.clockLength()
  const info = engine.headerInfo()
  const myTurn = !!info.myTurn
  const urgent = !!info.urgent
  const paused = !!engine.paused()

  if (header.over) {
    return <span className="font-mono text-[12px] text-v2-ink2">{header.pickText}</span>
  }
  if (!myTurn) {
    // Solo: a CPU has no countdown of its own, so the useful number is how
    // long until you are back — headerInfo()'s own "Your turn in".
    return (
      <div className={phone ? 'text-right' : ''}>
        <Kicker>{info.rightLabel}</Kicker>
        <span className="mt-0.5 block font-telemetry text-[26px] font-bold leading-none tabular-nums text-v2-ink">
          {info.rightValue}
          {info.rightLabel === 'Your turn in' && <span className="ml-1 font-mono text-[11px] font-medium text-v2-ink3">{Number(info.rightValue) === 1 ? 'pick' : 'picks'}</span>}
        </span>
      </div>
    )
  }
  if (!clockLength) {
    return (
      <div className={phone ? 'text-right' : ''}>
        <Kicker>No pick clock</Kicker>
        <span className="mt-0.5 block font-mono text-[12px] text-v2-ink2">Take your time</span>
      </div>
    )
  }
  const pct = Math.max(0, Math.min(1, timeLeft / clockLength))
  return (
    <div className={phone ? 'w-[76px] text-right' : 'w-[132px]'}>
      <div className={`flex items-baseline gap-2 ${phone ? 'justify-end' : ''}`}>
        {!phone && <Kicker tone={paused ? 'text-v2-warn' : urgent ? 'text-v2-loss' : 'text-v2-ink3'}>{paused ? 'Paused' : 'Time left'}</Kicker>}
        <span
          className={`font-telemetry font-bold leading-none tabular-nums ${phone ? 'text-[26px]' : 'text-[30px]'} ${urgent ? 'text-v2-loss' : paused ? 'text-v2-warn' : 'text-v2-ink'}`}
          aria-live="off"
        >
          {fmtClock(timeLeft)}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]" role="img" aria-label={`${fmtClock(timeLeft)} of ${fmtClock(clockLength)} left`}>
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none ${urgent ? 'bg-v2-loss' : paused ? 'bg-v2-warn' : 'bg-v2-cyan'}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      {phone && paused && <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-v2-warn">Paused</span>}
    </div>
  )
}

export default function CockpitHeader({ engine, header, phone, autopick, onAutopick, soundOn, onSound, onMenu, menuOpen }) {
  const myTurn = !!header.myTurn
  const urgent = !!header.urgent
  const canPause = !header.over && engine.clockLength() > 0
  const paused = !!header.paused

  const stateLabel = header.over
    ? 'Draft complete'
    : myTurn
      ? 'On the clock · your pick'
      : `${header.onClockName || 'CPU'} is picking`

  // A 2px rule across the top: cyan while it is yours, loss once it is
  // urgent. The rest of the bar stays the page's own ground — the resting
  // state (a CPU on the clock) must look like every other screen.
  const rule = header.over ? 'bg-white/[0.08]' : urgent ? 'bg-v2-loss' : myTurn ? 'bg-v2-cyan' : 'bg-white/[0.08]'

  if (phone) {
    return (
      <header className="relative z-20 shrink-0 border-b border-white/[0.07] bg-v2-ground/95 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <span className={`absolute inset-x-0 top-0 h-[2px] ${rule}`} aria-hidden="true" />
        <div className="flex h-[60px] items-center gap-2 px-2.5">
          <a href={LAUNCH_HASH} aria-label="Leave the draft — it stays saved" className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-v2-ink2 hover:text-v2-ink ${FOCUS}`}>
            <IconBack className="h-5 w-5" />
          </a>
          <div className="min-w-0 flex-1">
            <span className={`block truncate font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${myTurn ? 'text-v2-cyan' : 'text-v2-ink3'}`}>{stateLabel}</span>
            <span className="flex items-baseline gap-2">
              <span className="font-telemetry text-[28px] font-extrabold italic leading-none tabular-nums text-v2-ink">{header.code || '—'}</span>
              {header.round && <span className="truncate font-mono text-[10px] tabular-nums text-v2-ink3">RD {header.round}/{header.rounds}</span>}
            </span>
          </div>
          <ClockReadout engine={engine} header={header} phone />
          <button
            type="button"
            onClick={onMenu}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-label="Draft menu"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-v2-ink2 ring-1 ring-inset ring-white/[0.1] ${FOCUS}`}
          >
            <IconDots className="h-5 w-5" />
          </button>
        </div>
        {!header.over && (
          <div className="flex items-center justify-between gap-2 border-t border-white/[0.05] px-3 py-0.5">
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">
              Pick {header.overall} of {header.total}
            </span>
            <Switch checked={autopick} onChange={onAutopick} label="Autopick" />
          </div>
        )}
      </header>
    )
  }

  return (
    <header className="relative z-20 shrink-0 border-b border-white/[0.07] bg-v2-ground/95 backdrop-blur-xl">
      <span className={`absolute inset-x-0 top-0 h-[2px] ${rule}`} aria-hidden="true" />
      <div className="grid h-[72px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4 xl:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <a
            href={LAUNCH_HASH}
            title="Leave the draft — it stays saved, and picks up where you left it"
            className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium text-v2-ink2 ring-1 ring-inset ring-white/[0.1] hover:text-v2-ink ${FOCUS}`}
          >
            <IconBack /> Leave
          </a>
          <span className="hidden shrink-0 xl:block"><JukeLogo size={16} /></span>
          <div className="min-w-0">
            <Kicker tone="text-v2-ink2">The Draft Room</Kicker>
            <span className="block truncate font-mono text-[11px] text-v2-ink3">{header.leagueSummary}</span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <span className={`block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${header.over ? 'text-v2-ink2' : myTurn ? 'text-v2-cyan' : 'text-v2-ink3'}`}>{stateLabel}</span>
            <span className="block font-mono text-[11px] tabular-nums text-v2-ink3">
              {header.over ? `${header.total} picks made` : `Round ${header.round} of ${header.rounds} · pick ${header.overall} of ${header.total}`}
            </span>
          </div>
          <span className="font-telemetry text-[44px] font-extrabold italic leading-none tabular-nums text-v2-ink" aria-label={header.code ? `Pick ${header.code}` : undefined}>
            {header.over ? 'Final' : header.code}
          </span>
          <ClockReadout engine={engine} header={header} />
        </div>

        <div className="flex items-center justify-end gap-1.5">
          {!header.over && <Switch checked={autopick} onChange={onAutopick} label="Autopick" />}
          {canPause && (
            <IconButton label={paused ? 'Resume the clock' : 'Pause the clock'} pressed={paused} onClick={() => engine.togglePause()}>
              {paused ? <IconPlay /> : <IconPause />}
            </IconButton>
          )}
          <IconButton label={soundOn ? 'Mute pick sounds' : 'Unmute pick sounds'} pressed={soundOn} onClick={onSound}>
            {soundOn ? <IconSound /> : <IconMute />}
          </IconButton>
          <IconButton label="Draft menu" onClick={onMenu} aria-haspopup="dialog" aria-expanded={menuOpen}>
            <IconDots className="h-5 w-5" />
          </IconButton>
        </div>
      </div>
    </header>
  )
}
