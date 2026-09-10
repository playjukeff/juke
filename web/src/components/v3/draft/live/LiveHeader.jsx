import JukeLogo from '../../../juke-logo/JukeLogo.jsx'
import { useClockTick } from '../../../v2/cockpit/useCockpit.js'
import { DE } from '../../../v2/cockpit/cockpitData.js'
import { Label, PosTag, cx } from '../../ui.jsx'
import { LAUNCH_HASH } from '../flow.js'
import { FOCUS, Glyph, Switch, fmtClock } from '../kit.jsx'

/* The top of the call sheet at the table: what pick it is, whose it is, how
   long is left, and the controls that change what happens next.

   What it reads is engine.headerInfo() — the exact branching the legacy
   header and production's cockpit header paint from — so whose turn it is,
   "your turn in N" and the urgent flag are computed once, in app.js. The
   pick code comes from DraftEngine.pickCode(), which owns the snake's
   mirror. The pick is the fact and the state is its label (CLAUDE.md, "The
   pick is the fact and the state is the label"). */

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

  if (header.over) return <span className="font-figure text-[13px] text-v3-ink2">{header.pickText}</span>
  if (!myTurn) {
    // Solo: a CPU has no countdown of its own, so the useful number is how
    // long until you are back — headerInfo()'s own "Your turn in".
    return (
      <div className={phone ? 'text-right' : ''}>
        <Label className="block text-[11px]">{info.rightLabel}</Label>
        <span className="block font-figure text-[26px] font-bold leading-none tabular-nums text-v3-ink">
          {info.rightValue}
          {info.rightLabel === 'Your turn in' && <span className="ml-1 font-figure text-[12px] font-medium text-v3-ink3">{Number(info.rightValue) === 1 ? 'pick' : 'picks'}</span>}
        </span>
      </div>
    )
  }
  if (!clockLength) {
    return (
      <div className={phone ? 'text-right' : ''}>
        <Label className="block text-[11px]">No pick clock</Label>
        <span className="block font-figure text-[13px] text-v3-ink2">Take your time</span>
      </div>
    )
  }
  const pct = Math.max(0, Math.min(1, timeLeft / clockLength))
  const caution = urgent || paused
  return (
    <div className={cx(phone ? 'w-[84px] text-right' : 'w-[140px]', caution && 'rounded-[4px] bg-v3-warnWash px-2 py-1')}>
      <div className={cx('flex items-baseline gap-2', phone && 'justify-end')}>
        {!phone && <Label className={cx('text-[11px]', caution && 'text-v3-warn')}>{paused ? 'Paused' : urgent ? 'Hurry' : 'Time left'}</Label>}
        <span className={cx('font-figure font-bold leading-none tabular-nums', phone ? 'text-[26px]' : 'text-[30px]', caution ? 'text-v3-warn' : 'text-v3-ink')}>{fmtClock(timeLeft)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-v3-well" role="img" aria-label={`${fmtClock(timeLeft)} of ${fmtClock(clockLength)} left${paused ? ', paused' : ''}`}>
        <div className={cx('h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none', caution ? 'bg-v3-warn' : 'bg-v3-ink')} style={{ width: `${pct * 100}%` }} />
      </div>
      {phone && paused && <span className="mt-0.5 block font-figure text-[11px] uppercase tracking-[0.1em] text-v3-warn">Paused</span>}
    </div>
  )
}

function CtrlButton({ label, onClick, pressed, children, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      {...rest}
      className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[6px] border transition-colors', FOCUS, pressed ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet text-v3-ink hover:border-v3-ink3')}
    >
      {children}
    </button>
  )
}

export default function LiveHeader({ engine, header, phone, autopick, onAutopick, soundOn, onSound, onMenu, menuOpen }) {
  const myTurn = !!header.myTurn
  const canPause = !header.over && engine.clockLength() > 0
  const paused = !!header.paused
  const stateLabel = header.over ? 'Draft complete' : myTurn ? 'On the clock · your pick' : `${header.onClockName || 'CPU'} is picking`
  // A 3px rule across the top: ink while it is yours, caution once it is
  // urgent. The resting state (a CPU on the clock) is the plain bar.
  const rule = header.over ? 'bg-v3-rule' : header.urgent ? 'bg-v3-warn' : myTurn ? 'bg-v3-ink' : 'bg-v3-rule'

  if (phone) {
    return (
      <header className="relative z-20 shrink-0 border-b border-v3-rule bg-v3-sheet" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <span className={cx('absolute inset-x-0 top-0 h-[3px]', rule)} aria-hidden="true" />
        <div className="flex h-[62px] items-center gap-2 px-2.5">
          <a href={LAUNCH_HASH} aria-label="Leave the draft — it stays saved" className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[6px] text-v3-ink hover:bg-v3-well', FOCUS)}>
            <Glyph name="back" className="h-5 w-5" />
          </a>
          <div className="min-w-0 flex-1">
            {/* The phone line is a third the width, so the state says the
                short thing: whose pick, without the "on the clock" preamble
                the clock beside it already says. */}
            <span className={cx('block truncate font-figure text-[11px] font-bold uppercase tracking-[0.12em]', myTurn ? 'text-v3-ink' : 'text-v3-ink3')}>{header.over ? 'Draft complete' : myTurn ? 'Your pick' : header.onClockName || 'CPU'}</span>
            <span className="flex items-baseline gap-2">
              <span className="font-figure text-[28px] font-extrabold leading-none tabular-nums text-v3-ink">{header.over ? 'Final' : header.code || '—'}</span>
              {header.round && <span className="truncate font-figure text-[12px] tabular-nums text-v3-ink3">Rd {header.round}/{header.rounds}</span>}
            </span>
          </div>
          <ClockReadout engine={engine} header={header} phone />
          <CtrlButton label="Draft menu" onClick={onMenu} aria-haspopup="dialog" aria-expanded={menuOpen}><Glyph name="dots" className="h-5 w-5" /></CtrlButton>
        </div>
        {!header.over && (
          <div className="flex items-center justify-between gap-2 border-t border-v3-rule px-3">
            <span className="truncate font-figure text-[12px] tabular-nums text-v3-ink2">Pick {header.overall} of {header.total}</span>
            <Switch checked={autopick} onChange={onAutopick} label="Autopick" />
          </div>
        )}
      </header>
    )
  }

  return (
    <header className="relative z-20 shrink-0 border-b border-v3-rule bg-v3-sheet">
      <span className={cx('absolute inset-x-0 top-0 h-[3px]', rule)} aria-hidden="true" />
      <div className="grid h-[76px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4 xl:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <a href={LAUNCH_HASH} title="Leave the draft — it stays saved and picks up where you left it" className={cx('inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[6px] border border-v3-rule bg-v3-sheet px-3 text-[14px] font-semibold text-v3-ink hover:border-v3-ink3', FOCUS)}>
            <Glyph name="back" className="h-4 w-4" /> Leave
          </a>
          <span className="hidden shrink-0 xl:block"><JukeLogo size={16} onLight color="#0C1422" /></span>
          <div className="min-w-0">
            <Label className="block">The Draft Room · v3</Label>
            <span className="block truncate font-figure text-[13px] text-v3-ink2">{header.leagueSummary}</span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <span className={cx('block font-figure text-[12px] font-bold uppercase tracking-[0.12em]', myTurn ? 'text-v3-ink' : 'text-v3-ink3')}>{stateLabel}</span>
            <span className="block font-figure text-[13px] tabular-nums text-v3-ink2">
              {header.over ? `${header.total} picks made` : `Round ${header.round} of ${header.rounds} · pick ${header.overall} of ${header.total}`}
            </span>
          </div>
          <span className="font-figure text-[44px] font-extrabold leading-none tabular-nums text-v3-ink" aria-label={header.code ? `Pick ${header.code}` : undefined}>
            {header.over ? 'Final' : header.code}
          </span>
          <ClockReadout engine={engine} header={header} />
        </div>

        <div className="flex items-center justify-end gap-1.5">
          {!header.over && <Switch checked={autopick} onChange={onAutopick} label="Autopick" />}
          {canPause && (
            <CtrlButton label={paused ? 'Resume the clock' : 'Pause the clock'} pressed={paused} onClick={() => engine.togglePause()}>
              <Glyph name={paused ? 'play' : 'pause'} className="h-4 w-4" />
            </CtrlButton>
          )}
          <CtrlButton label={soundOn ? 'Mute pick sounds' : 'Unmute pick sounds'} pressed={soundOn} onClick={onSound}>
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
export function PickRibbon({ engine, header }) {
  const de = DE()
  if (!de || header.over) return null
  const league = engine.league()
  const picks = engine.picks() || []
  const mySlot = engine.mySlot()
  const total = league.teams * league.rounds
  const cells = []
  for (let o = Math.max(1, header.overall - 3); o <= Math.min(total, header.overall + 8); o++) {
    const made = picks[o - 1]
    const info = de.onTheClock(league, o - 1)
    const slot = made ? made.slot : info ? info.slot : null
    cells.push({ o, made, slot, code: de.pickCode(o, league), mine: slot === mySlot, current: o === header.overall })
  }
  return (
    <div className="flex h-[52px] shrink-0 items-stretch overflow-x-auto bg-v3-band text-white [scrollbar-width:none]" aria-label="Pick order">
      {cells.map((c) => (
        <div key={c.o} aria-current={c.current ? 'step' : undefined} className={cx('relative flex min-w-[140px] shrink-0 flex-col justify-center border-r border-v3-bandSoft px-3', c.current && 'bg-v3-bandSoft')}>
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
