import { POS_CHALK, CELL_INK } from '../draftRoomPositions.js'
import { STEEL, OXBLOOD, TONE_INK, YOU, delay } from './tokens.js'

/* View 03 — you against the room.

   One dumbbell per position: where you take it, where the other seats in the
   same rooms take it, and the pick at which that position's startable tier
   runs out. Every row shares one scale (round 1 at 0%, LAST_ROUND at 100%),
   which is the whole point of the layout — the tier markers only line up
   across rows if the axis does.

   "The room" is the CPU seats in your own mocks, and the header says so.
   That is a real control rather than a stand-in for one: same board, same
   ADP, same night, same rules. It is not other Juke accounts and this page
   never implies it is.

   The amber tick is absent on a row whose tier never emptied, and that is a
   fact rather than a gap: if there was still a startable kicker on the board
   when the draft ended, there is no pick after which taking one was late. */

const FIRST_ROUND = 1
const LAST_ROUND = 15
// The widest mark on the track is the 14px "you" dot, so the usable scale is
// inset by half of it at each end. Without that a position at the far right
// of the axis hangs 5px past the track and the row leaks out of a grid cell
// that can neither scroll nor ellipsise — measured at 375px, where the K row
// sits at 14.0 of 15.
const DOT = 14

function frac(round) {
  const clamped = Math.max(FIRST_ROUND, Math.min(LAST_ROUND, round))
  return (clamped - FIRST_ROUND) / (LAST_ROUND - FIRST_ROUND)
}

// A position on the inset scale, and a width measured on the same one, both
// as calc() so the inset survives whatever width the track ends up at.
function at(round) { return `calc(${DOT / 2}px + (100% - ${DOT}px) * ${frac(round)})` }
function span(a, b) { return `calc((100% - ${DOT}px) * ${Math.abs(frac(a) - frac(b)).toFixed(4)})` }

function Row({ row, i, hot, onHover, onOpen }) {
  const lo = Math.min(row.you, row.field)
  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => onHover(row.pos)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(row.pos)}
      onBlur={() => onHover(null)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      data-ins-rise
      style={delay(140 + i * 60)}
      className={
        'grid cursor-pointer grid-cols-[132px_minmax(0,1fr)] items-center gap-3 rounded-xl border-b border-white/[0.05] px-2.5 py-[13px] ' +
        'transition-colors duration-150 focus:outline-none sm:grid-cols-[128px_minmax(0,1fr)_170px] sm:gap-4 ' +
        (hot ? 'bg-white/[0.035]' : '')
      }
    >
      <div className="flex items-center gap-[9px]">
        <span
          className="shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-extrabold"
          style={{ background: POS_CHALK[row.pos], color: CELL_INK }}
        >
          {row.pos === 'DST' ? 'D/ST' : row.pos}
        </span>
        <span className="truncate text-[13.5px] text-ink">{row.name}</span>
      </div>

      <div className="relative h-[30px]">
        <span className="absolute left-0 right-0 top-[14px] h-0.5 bg-white/[0.06]" />
        {row.cliff !== null && (
          <span
            className="absolute top-1.5 h-[18px] w-0.5"
            style={{ left: at(row.cliff), background: '#E7AC4B' }}
            title={`The startable tier empties around round ${row.cliff.toFixed(1)}`}
          />
        )}
        <span
          data-ins-grow-x
          className="absolute top-[14px] h-0.5 rounded-full"
          style={{
            left: at(lo),
            width: span(row.you, row.field),
            background: row.late ? OXBLOOD : 'rgba(255,255,255,0.22)',
            ...delay(140 + i * 60),
          }}
        />
        <span
          data-ins-pop
          className="absolute top-[9px] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-slate-panel"
          style={{ left: at(row.field), background: STEEL, ...delay(300 + i * 60) }}
          title={`The room: round ${row.field.toFixed(1)}`}
        />
        <span
          data-ins-pop
          className="absolute top-2 h-[14px] w-[14px] -translate-x-1/2 rounded-full border-2 border-slate-panel"
          style={{ left: at(row.you), background: YOU, ...delay(360 + i * 60) }}
          title={`You: round ${row.you.toFixed(1)}`}
        />
      </div>

      <div className="col-span-2 text-right sm:col-span-1">
        <p className="font-plex text-[13px] font-semibold" style={{ color: TONE_INK[row.tone] }}>
          {(row.delta < 0 ? '−' : '+') + Math.abs(row.delta).toFixed(1)} rd
        </p>
        <p className="mt-[3px] text-[12px] text-ink-soft">{row.note}</p>
      </div>
    </div>
  )
}

export default function ViewField({ report, hover, onHover, onOpen }) {
  const rows = report.field.rows
  const hovered = hover ? rows.find((r) => r.pos === hover) : null
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* What the header does not already say. It used to open "Where you
            take each position against the other seats in the same rooms",
            which is the view's own sub-line reworded, rendered directly under
            it. What is left is the two things a reader cannot get from the
            chart: what the room is, and what the tick means. */}
        <p className="max-w-[620px] text-[13.5px] leading-[1.55] text-ink/80">
          The room is every other seat in the mocks you ran — same board, same ADP,
          same night. The tick is the pick at which that position&rsquo;s starting tier runs out; being
          right of it is being late.
        </p>
        <div className="flex shrink-0 flex-wrap gap-4 text-[12.5px] text-ink-soft">
          <span className="inline-flex items-center gap-[7px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: YOU }} />
            You
          </span>
          <span className="inline-flex items-center gap-[7px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STEEL }} />
            The room
          </span>
          <span className="inline-flex items-center gap-[7px]">
            <span className="h-3.5 w-0.5" style={{ background: '#E7AC4B' }} />
            Tier empties
          </span>
        </div>
      </div>

      <div className="mt-5">
        {rows.map((row, i) => (
          <Row
            key={row.pos}
            row={row}
            i={i}
            hot={hover === row.pos}
            onHover={onHover}
            onOpen={onOpen}
          />
        ))}
      </div>

      {/* One line, and on hover it becomes that row's own numbers rather than
          a tooltip: the reading a reader wants is a comparison of three
          values, and a comparison does not fit in a title attribute. */}
      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <p className="text-[13.5px] leading-[1.55] text-ink/80">
          {hovered
            ? `${hovered.name}: you at ${hovered.you.toFixed(1)}, the room at ${hovered.field.toFixed(1)}` +
              (hovered.cliff === null
                ? ', and the startable tier never emptied.'
                : `, the tier empties at ${hovered.cliff.toFixed(1)}.`)
            : report.fieldNote}
        </p>
      </div>
    </div>
  )
}
