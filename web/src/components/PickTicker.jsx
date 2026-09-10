import { useMemo, useState } from 'react'

// Shares the ribbon with DraftCockpitHeader's own centre pill on the
// Players and Board tabs — both hide their pill wherever this mounts
// (DraftRoom.jsx's hidePill prop). Desktop only (lg:flex): below lg,
// PickClockBand already says all of this, and it's hidden itself at lg+
// for the identical reason in reverse.

// One flat loop over the picks from `fromRound` on, each turned into
// {round, slot} via DraftEngine.onTheClock() — never a hand-rolled snake
// mirror. Overall numbers are sequential regardless of which way a round
// runs, so walking forward from fromRound's first overall and asking the
// engine whose turn each one is is the only pass this needs.
function buildTicker(DE, league, fromRound) {
  const items = []
  if (!DE || !league || !league.teams || !league.rounds || fromRound > league.rounds) return items
  const total = DE.totalPicks(league)
  const startOverall = (fromRound - 1) * league.teams + 1
  let lastRound = null
  for (let o = startOverall; o <= total; o++) {
    const info = DE.onTheClock(league, o - 1)
    if (!info) break
    if (info.round !== lastRound) {
      items.push({ mark: true, key: 'mark-' + info.round, round: info.round, width: 44 })
      lastRound = info.round
    }
    items.push({ mark: false, key: 'pick-' + o, overall: o, round: info.round, slot: info.slot, width: 116 })
  }
  return items
}

// In a room, autopick is per-seat data the room already sends (room.js:
// `auto: chair.auto`) — real people picking for themselves are not auto,
// bots and anyone who has toggled their own autopilot on are. Off-room
// there is no such array: every seat but mine is a CPU by definition
// (always auto), and mine follows the one autopick flag DraftRoom already
// tracks (state.autoMe in a room, the local solo toggle off it).
function seatIsAuto(slot, mySlot, autopick, roomSeats) {
  if (roomSeats && roomSeats[slot]) return !!roomSeats[slot].auto
  return slot === mySlot ? !!autopick : true
}

/* Exported for DraftCockpitHeader, which had no digits at all on the two
   tabs this ticker does not mount under. One formatter, so the ribbon and
   the pill can never render the same second differently. */
export function formatClock(seconds) {
  if (seconds == null) return '—:—'
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function cellClass(item) {
  if (item.isNext) return 'bg-[rgba(255,209,102,0.11)] shadow-[inset_0_-3px_0_0_#FFD166]'
  if (item.mine) return 'bg-[rgba(255,209,102,0.05)] shadow-[inset_0_-2px_0_0_rgba(255,209,102,0.5)]'
  return ''
}

/* The cell above already carries the seat's mark -- the wash and the
   gold underline -- so the name does not repeat it in a colour that is
   1.4:1 on a light card and under 3:1 on this one. Gold is never type. */
function nameClass(item) {
  if (item.isNext) return 'font-bold text-ink'
  if (item.mine) return 'text-ink'
  return 'text-white/70'
}

export default function PickTicker({ league, onClock, overall, mySlot, myTurn, urgent, code, timeLeft, clockLength, teamLabelOf, autopick, roomSeats }) {
  const DE = typeof window !== 'undefined' ? window.DraftEngine : null
  const round = onClock ? onClock.round : null
  const pct = clockLength ? Math.max(0, Math.min(100, (timeLeft / clockLength) * 100)) : 0

  /* Anchored once per mount, not recomputed on every render — "since the
     ribbon's first rendered pick" only means something if the window it's
     measured against holds still. Players and Board each mount their own
     instance, so switching tabs re-anchors to wherever the draft is at
     that moment; a mounted instance never re-anchors itself. The window
     itself runs to the end of the draft rather than stopping four rounds
     out, so a trackpad scroll can still reach round 14 even once the
     auto-advance has slid past what fits on screen by default. */
  const [baseRound] = useState(round || 1)
  const [baseOverall] = useState(overall)

  const items = useMemo(
    () => buildTicker(DE, league, baseRound + 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [DE, league.teams, league.rounds, baseRound]
  )

  /* The ribbon holds no scrollbar of its own — it advances. Every pick
     that lands consumes one chip off the front, and the strip translates
     by that chip's own width so the next thing the ticker points at is
     always the leftmost thing in view. Marks are 44px, chips 116px.

     Measured from itemsStartOverall — the first overall pick that
     actually appears in items[] — not from baseOverall (the mount pick).
     items[] starts at baseRound + 1 (buildTicker, above) and carries
     nothing for baseRound itself, but baseOverall can sit anywhere inside
     baseRound. Counting from baseOverall meant every pick still left in
     the mount round got credited against items[] before that round's own
     picks had happened: mount at round 1 pick 1 in a 10-team league, and
     the instant round 2 begins, overall - baseOverall is already 10 — the
     eat-loop below spent all 10 of round 2's own chips (plus its own
     round-3 marker) before a single round-2 pick had actually landed,
     leaving the ribbon parked on round 3 the moment round 2 started.
     Self-correcting only because switching tabs remounts and re-anchors —
     anyone who stayed on one tab through a round boundary saw the ribbon
     sitting a full round ahead of the real draft. Clamped at 0 by
     Math.max: while overall is still inside baseRound, itemsStartOverall
     hasn't been reached yet, so nothing in items[] should read as eaten. */
  const itemsStartOverall = baseRound * league.teams + 1
  const consumed = Math.max(0, (overall ?? baseOverall) - itemsStartOverall)
  let shift = 0
  let i = 0
  let eaten = 0
  while (i < items.length && eaten < consumed) {
    shift += items[i].width
    if (!items[i].mark) eaten++
    i++
  }
  // A bare round marker left dangling at the front (the picks it introduces
  // already consumed) reads as a label for nothing — consume it too.
  while (i < items.length && items[i].mark) { shift += items[i].width; i++ }
  const consumedTo = i

  let seenMine = 0
  const styled = items.map((item, idx) => {
    if (item.mark) return item
    const mine = item.slot === mySlot
    let isNext = false
    if (mine && idx >= consumedTo) {
      seenMine++
      isNext = seenMine === 1
    }
    return { ...item, mine, isNext, auto: seatIsAuto(item.slot, mySlot, autopick, roomSeats) }
  })

  return (
    <div className="hidden shrink-0 items-stretch overflow-hidden border-b border-slate-rule bg-slate-bar lg:flex" style={{ height: 58 }}>
      <div className="flex shrink-0 flex-col justify-center gap-0.5 border-r border-slate-rule px-[18px]">
        <span className="whitespace-nowrap font-plex text-[9.5px] font-semibold tracking-[0.12em] text-ink-muted">
          RND {round ?? '—'} OF {league.rounds}
        </span>
        <span className={'font-display text-[25px] font-bold leading-none tabular-nums ' + (myTurn && urgent ? 'text-rose-300' : 'text-teal-300')}>
          {clockLength > 0 ? formatClock(timeLeft) : '—:—'}
        </span>
      </div>

      <div className={'flex shrink-0 items-center gap-3.5 border-r border-slate-rule px-[18px] ' + (myTurn ? 'bg-teal-400/[0.07]' : 'bg-white/[0.02]')}>
        {/* A glow, not just the opacity pulse animate-pulse already gave
            it — the dot and label were the correct color the whole time
            but sat flat next to everything else on this bar competing for
            attention (the countdown clock, the urgent-round pick code).
            The glow only fires for myTurn; the off-turn dot stays exactly
            as understated as it should. */}
        <span
          className={
            'h-2 w-2 shrink-0 animate-pulse rounded-full ' +
            (myTurn
              ? urgent
                ? 'bg-rose-400 shadow-[0_0_9px_2px_rgba(251,113,133,0.7)]'
                : 'bg-teal-300 shadow-[0_0_9px_2px_rgba(51,234,255,0.7)]'
              : 'bg-white/30')
          }
        />
        <div className="flex flex-col gap-[3px]">
          <span
            className={
              'whitespace-nowrap font-plex text-[10px] font-bold tracking-[0.1em] ' +
              (myTurn ? (urgent ? 'text-rose-300' : 'text-teal-300') : 'text-white/55')
            }
            style={
              myTurn
                ? { textShadow: urgent ? '0 0 10px rgba(251,113,133,0.5)' : '0 0 10px rgba(51,234,255,0.5)' }
                : undefined
            }
          >
            {myTurn ? 'ON THE CLOCK · YOUR PICK' : 'ON THE CLOCK · ' + (onClock ? teamLabelOf(onClock.slot).toUpperCase() : '')}
          </span>
          <span className="block h-[3px] w-[150px] overflow-hidden rounded-full bg-white/[0.12]">
            <span
              className={'block h-full rounded-full ' + (myTurn ? (urgent ? 'bg-rose-400' : 'bg-teal-400') : 'bg-white/35')}
              style={{ width: pct + '%' }}
            />
          </span>
        </div>
        <span
          className={
            'font-display text-[32px] font-bold leading-none tabular-nums ' +
            (myTurn ? (urgent ? 'text-rose-300' : 'text-teal-300') : 'text-white/70')
          }
        >
          {code || '—'}
        </span>
      </div>

      {/* data-ticker: index.css hides this one scrollbar (scoped to the
          attribute, not a global rule) while leaving the element itself
          genuinely scrollable — trackpad/wheel reach the far rounds the
          auto-advance hasn't slid to yet. */}
      <div data-ticker className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden">
        <div
          className="flex items-stretch"
          style={{ transform: `translateX(-${shift}px)`, transition: 'transform 480ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          {styled.map((item) =>
            item.mark ? (
              <div
                key={item.key}
                className="flex w-11 shrink-0 flex-col items-center justify-center gap-0.5 border-x border-slate-rule bg-slate-sunk/70"
              >
                <span className="font-plex text-[9px] font-bold tracking-[0.1em] text-ink-muted">RND</span>
                <span className="font-display text-lg font-bold leading-none text-ink-soft">{item.round}</span>
              </div>
            ) : (
              <div
                key={item.key}
                className={'flex w-[116px] shrink-0 flex-col justify-center gap-[3px] border-r border-slate-rule/60 px-3 ' + cellClass(item)}
              >
                <span className="flex items-center gap-1.5">
                  <span className={'font-plex text-[9.5px] font-semibold ' + (item.mine ? 'text-ink-soft' : 'text-ink-muted')}>
                    {DE ? DE.pickCode(item.overall, league) : item.overall}
                  </span>
                  {item.auto && (
                    <span className="rounded px-1 py-px font-plex text-[8px] font-bold tracking-[0.08em] bg-amber-400/[0.14] text-amber-300">
                      AUTO
                    </span>
                  )}
                </span>
                <span className={'truncate text-[11.5px] font-semibold ' + nameClass(item)}>
                  {item.isNext ? 'Your next pick' : item.mine ? 'Your pick' : teamLabelOf(item.slot)}
                </span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
