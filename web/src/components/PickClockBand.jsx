import { useRef } from 'react'

// Pinned above the tab strip's own content, on every mobile draft-room tab
// — the one thing worth knowing regardless of whether you're looking at
// Decide, Board, Analysis or Players right now. lg:hidden: desktop already
// says all of this inside DraftCockpitHeader's own row (and, on Players,
// PickTicker's own ribbon), at a width where a second copy of the same
// facts would just be redundant furniture.
//
// Every value here is a prop DraftRoom.jsx already computed for
// DraftCockpitHeader — onClock/overall/code/myTurn/urgent/timeLeft/
// clockLength — plus nextOverall/nextPicks, lifted out of
// DraftDecideScreen.jsx this same pass so this band and that screen can
// never disagree about "how many picks away." Nothing here is recomputed
// from the engine a second time.
function formatClock(seconds) {
  if (seconds == null) return '—:—'
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function PickClockBand({
  code,
  myTurn,
  urgent,
  timeLeft,
  clockLength,
  nextOverall,
  nextPicks,
  overall,
  league,
  onClock,
  teamLabelOf,
  // The grab handle's own collapse state — lifted to DraftRoom.jsx rather
  // than owned here, because collapsing this band also has to hide
  // PlayersTab.jsx's autopick ribbon directly beneath it (Players screen's
  // own structure), which is a sibling component this one has no reach
  // into on its own.
  collapsed,
  onSetCollapsed,
}) {
  const picksAway = nextOverall != null && overall != null ? nextOverall - overall : null
  const nextCode = nextPicks && nextPicks.length > 0
    ? (window.DraftEngine ? window.DraftEngine.pickCode(nextPicks[0], league) : nextPicks[0])
    : null
  const pct = clockLength ? Math.max(0, Math.min(100, (timeLeft / clockLength) * 100)) : 0
  const label = myTurn
    ? `ON THE CLOCK · YOUR PICK${code ? ' ' + code : ''}`
    : `ON THE CLOCK · ${onClock && teamLabelOf ? teamLabelOf(onClock.slot).toUpperCase() : ''}`

  /* Swipe the handle up and this band (and PlayersTab's autopick ribbon
     alongside it) stand down, handing their height back to whichever list
     is on screen; swipe down and they return. A tap does the same thing,
     so the gesture is never the only way in. 14px of travel is the
     threshold — anything shorter reads as a tap rather than a drag that
     undershot. Touch and pointer both, so it works the same on an actual
     phone and in a mouse-driven browser preview. */
  const grabY = useRef(null)
  const onGrabStart = (e) => { grabY.current = e.touches ? e.touches[0].clientY : e.clientY }
  const onGrabEnd = (e) => {
    const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY
    const dy = grabY.current == null ? 0 : y - grabY.current
    grabY.current = null
    if (dy < -14) onSetCollapsed(true)
    else if (dy > 14) onSetCollapsed(false)
    else onSetCollapsed(!collapsed)
  }

  return (
    <div className="lg:hidden">
      {!collapsed && (
        <div
          className={
            'flex flex-col gap-1.5 border-b px-4 py-2 ' +
            (myTurn
              ? 'border-teal-400/20 bg-teal-500/[0.08]'
              : urgent
                ? 'border-rose-400/25 bg-rose-500/[0.08]'
                : 'border-white/[0.06] bg-white/[0.02]')
          }
        >
          <div className="flex items-center gap-2">
            <span
              className={
                'h-[7px] w-[7px] shrink-0 rounded-full ' +
                (myTurn ? 'animate-pulse bg-teal-300' : urgent ? 'animate-pulse bg-rose-400' : 'bg-white/30')
              }
            />
            <span className={'min-w-0 flex-1 truncate font-plex text-[11px] font-bold tracking-[0.07em] ' + (myTurn ? 'text-teal-200' : urgent ? 'text-rose-300' : 'text-white/55')}>
              {label}
            </span>
            <span className={'shrink-0 font-display text-[25px] font-bold tabular-nums leading-none ' + (urgent ? 'text-rose-300' : myTurn ? 'text-teal-200' : 'text-white/70')}>
              {clockLength > 0 ? formatClock(timeLeft) : '—:—'}
            </span>
          </div>

          <span className="block h-[3px] w-full overflow-hidden rounded-full bg-white/[0.12]">
            <span
              className={'block h-full rounded-full ' + (urgent ? 'bg-rose-400' : myTurn ? 'bg-teal-400' : 'bg-white/35')}
              style={{ width: pct + '%' }}
            />
          </span>

          {nextCode && (
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-muted">Next</span>
              <span className="min-w-0 flex-1 truncate font-plex text-[11px] text-ink">{nextCode}</span>
              {picksAway != null && picksAway > 0 && (
                <span className="shrink-0 font-plex text-[10px] text-ink-muted">
                  {picksAway} pick{picksAway === 1 ? '' : 's'} away
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div
        onTouchStart={onGrabStart}
        onTouchEnd={onGrabEnd}
        onPointerDown={onGrabStart}
        onPointerUp={onGrabEnd}
        title={collapsed ? 'Swipe down for the clock' : 'Swipe up for more of the list'}
        className="flex h-5 cursor-grab items-center justify-center gap-2 border-b border-slate-rule bg-slate-sunk/70"
        style={{ touchAction: 'none' }}
      >
        <span className="h-1 w-[38px] shrink-0 rounded-full bg-[#4B5866]" />
        {collapsed && (
          <span className="truncate font-plex text-[9px] tracking-[0.08em] text-ink-muted">
            {myTurn ? 'YOUR PICK' : ''} {code || '—'} · {clockLength > 0 ? formatClock(timeLeft) : '—:—'}
          </span>
        )}
      </div>
    </div>
  )
}
