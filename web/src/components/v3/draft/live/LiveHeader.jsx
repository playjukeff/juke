import { useClockTick } from '../../../v2/cockpit/useCockpit.js'
import { DE } from '../../../v2/cockpit/cockpitData.js'
import { Label, PosTag, cx } from '../../ui.jsx'
import { LAUNCH_HASH } from '../flow.js'
import { FOCUS, Glyph, Switch, fmtClock } from '../kit.jsx'
import { leaveRoom, sendBlocker } from './room.js'
import { DUR, EASE, PRESS, motion, useCalm, useFlip } from '../../motion.jsx'
import { useRef } from 'react'

/* The top of the room: what pick it is, whose, how long is left, and the
   controls that change what happens next.

   It reads engine.headerInfo() — the exact branching production's header
   paints from — so whose turn it is, "your turn in N" and the urgent flag
   are computed once, in app.js. The pick code is DraftEngine.pickCode(),
   which owns the snake's mirror. The pick is the fact and the state is its
   label (CLAUDE.md).

   ---- Flex, not a centred grid ----

   Production's cockpit bar was a `1fr auto 1fr` grid, and at 1024 its left
   cell could never exceed half of what the centre left over — the nav
   painted over the pick pill (CLAUDE.md, "The concession that fired where
   the bar was not"). This bar is a row: the left block shrinks and
   truncates, the pick block never does, the controls keep their size. Pause
   and sound join the row from xl; below it they live in the menu, where
   they have always also been. */

function ClockReadout({ engine, header, phone }) {
  // The one part of the bar that moves every second, and the only part
  // that re-renders on every tick.
  useClockTick(engine)
  const info = engine.headerInfo()
  const timeLeft = engine.timeLeft()
  const clockLength = engine.clockLength()
  const myTurn = !!info.myTurn
  const urgent = !!info.urgent
  const paused = !!engine.paused()

  if (header.over) return null
  if (!myTurn) {
    // Solo: a CPU has no countdown of its own, so the useful number is how
    // long until you are back — headerInfo()'s own "Your turn in".
    const n = Number(info.rightValue)
    return (
      <div className={cx('shrink-0', phone ? 'text-right' : '')}>
        <Label className="block text-[11px]">{info.rightLabel === 'Your turn in' ? 'You’re up in' : info.rightLabel}</Label>
        <span className={cx('block font-figure font-bold leading-none tabular-nums text-v3-ink', phone ? 'text-[24px]' : 'text-[28px]')}>
          {info.rightValue}
          {info.rightLabel === 'Your turn in' && <span className="ml-1 font-figure text-[12px] font-medium text-v3-ink3">{n === 1 ? 'pick' : 'picks'}</span>}
        </span>
      </div>
    )
  }
  if (!clockLength) {
    return (
      <div className={cx('shrink-0', phone ? 'text-right' : '')}>
        <Label className="block text-[11px]">No clock</Label>
        <span className="block font-figure text-[13px] text-v3-ink2">Take your time</span>
      </div>
    )
  }
  const caution = urgent || paused
  return (
    <div role="timer" aria-label={`${fmtClock(timeLeft)} left${paused ? ', paused' : ''}`} className={cx('shrink-0 rounded-[4px] px-2 py-1', phone ? 'text-right' : '', caution ? 'bg-v3-warnWash' : '')}>
      <Label className={cx('block text-[11px]', caution && 'text-v3-warn')}>{paused ? 'Paused' : urgent ? 'Hurry' : 'Time left'}</Label>
      <span className={cx('block font-figure font-bold leading-none tabular-nums', phone ? 'text-[26px]' : 'text-[30px]', caution ? 'text-v3-warn' : 'text-v3-ink')}>{fmtClock(timeLeft)}</span>
    </div>
  )
}

function CtrlButton({ label, onClick, pressed, children, className = '', ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      {...rest}
      className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[6px] border', PRESS, FOCUS, pressed ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet text-v3-ink hover:border-v3-ink3', className)}
    >
      {children}
    </button>
  )
}

/* The 3px rule across the top of the bar. When whose-turn-it-is changes it
   DRAWS across, left to right, rather than simply changing colour — the
   state change moves, and the resting bar stays still. */
function StateRule({ rule }) {
  const calm = useCalm()
  const first = useRef(rule)
  const everMoved = useRef(false)
  if (rule !== first.current) everMoved.current = true
  const moved = everMoved.current
  return (
    <motion.span
      key={rule}
      initial={moved && !calm ? { scaleX: 0 } : false}
      animate={{ scaleX: 1 }}
      transition={{ duration: DUR.enter, ease: EASE.out }}
      style={{ originX: 0 }}
      className={cx('absolute inset-x-0 top-0 h-[3px]', rule)}
      aria-hidden="true"
    />
  )
}

export default function LiveHeader({ engine, header, phone, room = null, autopick, onAutopick, soundOn, onSound, onMenu, menuOpen }) {
  const myTurn = !!header.myTurn
  /* The clock in a room is the room's, and pausing it is the host's — the
     room refuses it from anybody else (room.js's pause()), so a button that
     is offered and then silently ignored is the dead-control failure with a
     draft behind it. Offered when it can act, and never otherwise. */
  const canPause = !header.over && engine.clockLength() > 0 && (!room || room.isHost)
  const blocked = room ? sendBlocker(room) : null
  const paused = !!header.paused
  // A 3px rule across the top: ink while it is yours, caution once it is
  // urgent. The resting state (a CPU on the clock) is the plain bar.
  const rule = header.over ? 'bg-v3-rule' : header.urgent ? 'bg-v3-warn' : myTurn ? 'bg-v3-ink' : 'bg-v3-rule'
  const state = header.over ? 'Draft complete' : myTurn ? 'Your pick' : `${header.onClockName || 'CPU'} picking`

  if (phone) {
    return (
      <header className="relative z-20 shrink-0 border-b border-v3-rule bg-v3-sheet" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <StateRule rule={rule} />
        <div className="flex h-[60px] items-center gap-2 px-2">
          {room ? (
            <button type="button" onClick={() => leaveRoom(engine)} data-leave-room aria-label="Leave the room — your seat is drafted for until you come back" className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[6px] text-v3-ink hover:bg-v3-well', FOCUS)}>
              <Glyph name="back" className="h-5 w-5" />
            </button>
          ) : (
            <a href={LAUNCH_HASH} aria-label="Leave the draft — it stays saved" className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[6px] text-v3-ink hover:bg-v3-well', FOCUS)}>
              <Glyph name="back" className="h-5 w-5" />
            </a>
          )}
          <div className="min-w-0 flex-1">
            <span className={cx('block truncate font-figure text-[11px] font-bold uppercase tracking-[0.12em]', myTurn ? 'text-v3-ink' : 'text-v3-ink3')}>{state}</span>
            <span className="flex items-baseline gap-2">
              <span className="font-figure text-[28px] font-extrabold leading-none tabular-nums text-v3-ink">{header.over ? 'Final' : header.code || '—'}</span>
              {header.round && <span className="truncate font-figure text-[12px] tabular-nums text-v3-ink3">Rd {header.round}/{header.rounds}</span>}
            </span>
          </div>
          <ClockReadout engine={engine} header={header} phone />
          <CtrlButton label="Draft menu" onClick={onMenu} aria-haspopup="dialog" aria-expanded={menuOpen}><Glyph name="dots" className="h-5 w-5" /></CtrlButton>
        </div>
      </header>
    )
  }

  return (
    <header className="relative z-20 shrink-0 border-b border-v3-rule bg-v3-sheet">
      <StateRule rule={rule} />
      <div className="flex h-[68px] items-center gap-4 px-4 xl:gap-6 xl:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {room ? (
            /* Leaving the SCREEN leaves the ROOM: the chair goes to the CPU
               so the draft keeps moving without you, and the invite link
               brings you back to the same seat. A link that only changed the
               hash would leave a socket open on a screen nobody is on. */
            <button type="button" onClick={() => leaveRoom(engine)} data-leave-room title="Leave the room — your seat is drafted for until you come back" className={cx('inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[6px] border border-v3-rule bg-v3-sheet px-3 text-[14px] font-semibold text-v3-ink hover:border-v3-ink3', FOCUS)}>
              <Glyph name="back" className="h-4 w-4" /> Leave
            </button>
          ) : (
            <a href={LAUNCH_HASH} title="Leave the draft — it stays saved and picks up where you left it" className={cx('inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[6px] border border-v3-rule bg-v3-sheet px-3 text-[14px] font-semibold text-v3-ink hover:border-v3-ink3', FOCUS)}>
              <Glyph name="back" className="h-4 w-4" /> Leave
            </a>
          )}
          <div className="min-w-0">
            <Label className="block truncate">{room ? (room.hostName ? `${room.hostName}'s room` : 'Draft room') : 'The Draft Room'}</Label>
            <span className="block truncate font-figure text-[13px] text-v3-ink2">
              {room ? `${room.taken} of ${room.seats.length} managers · ${header.leagueSummary}` : header.leagueSummary}
            </span>
          </div>
          {blocked && (
            /* A socket that has dropped is the normal path, not a fault: the
               room is still there and the seat is still held. Said, because
               every control that sends is refusing while this is up. */
            <span role="status" className="hidden shrink-0 items-center gap-1.5 rounded-[4px] bg-v3-warnWash px-2 py-1 font-figure text-[12px] font-semibold text-v3-warn lg:inline-flex">
              <Glyph name="alert" className="h-3.5 w-3.5" /> {blocked}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <span className={cx('block font-figure text-[12px] font-bold uppercase tracking-[0.12em]', myTurn ? 'text-v3-ink' : 'text-v3-ink3')}>{state}</span>
            <span className="block font-figure text-[13px] tabular-nums text-v3-ink2">
              {header.over ? `${header.total} picks made` : `Rd ${header.round} of ${header.rounds} · #${header.overall} of ${header.total}`}
            </span>
          </div>
          <span className="font-figure text-[40px] font-extrabold leading-none tabular-nums text-v3-ink" aria-label={header.code ? `Pick ${header.code}` : undefined}>
            {header.over ? 'Final' : header.code}
          </span>
          <ClockReadout engine={engine} header={header} />
        </div>

        <div className="flex flex-1 items-center justify-end gap-1.5">
          {!header.over && <Switch checked={autopick} onChange={onAutopick} label="Autopick" />}
          {canPause && (
            <CtrlButton label={paused ? 'Resume the clock' : 'Pause the clock'} pressed={paused} onClick={() => engine.togglePause()} className="hidden xl:grid">
              <Glyph name={paused ? 'play' : 'pause'} className="h-4 w-4" />
            </CtrlButton>
          )}
          <CtrlButton label={soundOn ? 'Mute pick sounds' : 'Unmute pick sounds'} pressed={soundOn} onClick={onSound} className="hidden xl:grid">
            <Glyph name={soundOn ? 'sound' : 'mute'} className="h-5 w-5" />
          </CtrlButton>
          <CtrlButton label="Draft menu" onClick={onMenu} aria-haspopup="dialog" aria-expanded={menuOpen}><Glyph name="dots" className="h-5 w-5" /></CtrlButton>
        </div>
      </div>
    </header>
  )
}

/* The ribbon: the situation band. The last few picks, the one on the clock,
   the next few — each cell's code from DraftEngine.pickCode(), each owner
   from teamLabel(). White on the ink band; your chairs are underlined. */
/* The ribbon ADVANCES: each cell is keyed on its overall pick, so when a
   pick lands the strip slides one cell left (a layout move) instead of every
   cell repainting in place, and the cell arriving at the right edge fades
   in. The window is the same thirteen picks either way. By hand (useFlip on
   the x axis), not a motion component per cell: this re-renders on every
   pick. */
const RIBBON_ENTER = { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: DUR.micro, ease: 'linear' } }
export function PickRibbon({ engine, header }) {
  const de = DE()
  const calm = useCalm()
  const strip = useRef(null)
  useFlip(strip, { axis: 'x', limit: 16, disabled: calm, enter: RIBBON_ENTER })
  if (!de || header.over) return null
  const league = engine.league()
  const picks = engine.picks() || []
  const mySlot = engine.mySlot()
  const total = league.teams * league.rounds
  const cells = []
  for (let o = Math.max(1, header.overall - 3); o <= Math.min(total, header.overall + 9); o++) {
    const made = picks[o - 1]
    const info = de.onTheClock(league, o - 1)
    const slot = made ? made.slot : info ? info.slot : null
    cells.push({ o, made, slot, code: de.pickCode(o, league), mine: slot === mySlot, current: o === header.overall })
  }
  return (
    <div ref={strip} className="flex h-[50px] shrink-0 items-stretch overflow-x-auto bg-v3-band text-white [scrollbar-width:none]" aria-label="Pick order">
      {cells.map((c) => (
        <div
          key={c.o}
          data-flip={c.o}
          aria-current={c.current ? 'step' : undefined}
          className={cx('relative flex min-w-[132px] shrink-0 flex-col justify-center border-r border-v3-bandSoft px-3', c.current && 'bg-v3-bandSoft')}
        >
          {c.mine && <span className="absolute inset-x-3 bottom-0 h-[3px] bg-white" aria-hidden="true" />}
          <span className="flex items-center gap-1.5 font-figure text-[11px] font-bold tabular-nums tracking-[0.08em]">
            <span className={c.current ? 'text-white' : 'text-v3-bandInk'}>{c.code}</span>
            {c.current && <span className="text-white">· ON THE CLOCK</span>}
            {c.mine && !c.current && <span className="text-white">· YOU</span>}
          </span>
          {c.made ? (
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <PosTag pos={c.made.player.pos} className="!h-[18px] !min-w-[28px] !text-[11px]" />
              <span className="truncate text-[13px] text-white">{engine.shortName(c.made.player)}</span>
            </span>
          ) : (
            <span className={cx('mt-0.5 truncate text-[13px]', c.mine ? 'font-bold text-white' : 'text-v3-bandInk')}>{c.slot === null ? '—' : c.mine ? 'Your pick' : engine.teamLabel(c.slot)}</span>
          )}
        </div>
      ))}
    </div>
  )
}
