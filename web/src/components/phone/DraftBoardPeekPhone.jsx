import { POS_CHALK } from '../draftRoomPositions.js'
import DraftBoardGrid from '../DraftBoardGrid.jsx'

// The board behind the phone sheet. README section 2 draws this as a
// scroll-free repeat(4,1fr) grid — but that shape only exists in the
// prototype because the prototype never has to hold a real 24-team,
// 20-round board. DraftBoardGrid already renders the real thing at
// exactly this width (its own `cols`/`rowsTemplate` are the "mobile board
// pass's own pair," measured for a narrow phone column, not invented
// here), with real position rails, the real cyan "your seat" bracket, and
// the same FLIP transition into a drafted cell the desktop board gets.
// Reusing it — scrollable, not scroll-free — is the deliberate adaptation:
// a fixed-height no-scroll grid is a real correctness bug the moment a
// league runs more than a handful of rounds, where the prototype's mock
// data never had to.
//
// followLive: the board tracks the live pick until the reader scrolls it
// themselves, and the header's crosshair puts it back — see
// DraftBoardGrid's own note. On a phone the board is several screens tall
// and wider than the viewport, so without it an auto-picked draft happens
// entirely off-screen; that is exactly what was reported.
//
// What IS new here is the strip above it: not a "fill = position" colour
// legend — DraftBoardGrid dropped its own built-in one entirely once the
// cell, the pool row and the filter chips all started saying what a fill
// means — but the roster-need pills the README's seat strip actually
// specifies. `engine.filterCounts()` already computes exactly this for the
// Players tab's own filter chips (have/need/text, one call, never a second
// tally — see that function's own comment on why the decision lives
// engine-side).
//
// POS_CHALK, not POS_SOLID, for the dot: it carries no text and its label
// sits beside it rather than on it, which is exactly the "dot" case
// draftRoomPositions.js's own header names for POS_CHALK. POS_SOLID's -700
// step is picked to survive white text and disappears against this strip's
// dark bg-slate-panel — DST's slate-700 (#334155) is barely a shade off the
// panel itself (#232D3A).
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']

export default function DraftBoardPeekPhone({ engine, league, picks, mySlot, onClock, onSelectPlayer, headerH, scrollToLiveSignal, bottomInset }) {
  const counts = engine.filterCounts()

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col" style={{ top: headerH }}>
      {/* A readout, not a row of chips.

          This drew each position as a bordered pill -- the identical shape
          the Players tab's FILTER chips take, ~250px below it in the sheet
          on the same 390px screen. Two rows of "RB 0/2" pills, one inert
          and one a control, with nothing to tell them apart: the top one
          gets tapped, and nothing happens. A pill promises a press. What
          this row is is a status line, so it reads as one -- a mono
          label, then dot-and-count with no border to promise anything. */}
      <div className="flex shrink-0 items-center gap-3.5 overflow-x-auto px-3 pb-2 pt-2.5 [scrollbar-width:none]">
        <span className="shrink-0 font-mono text-[9px] tracking-[0.12em] text-ink-muted" aria-hidden="true">
          NEED
        </span>
        {POSITIONS.map((pos) => {
          const c = counts ? counts[pos] : null
          return (
            <span
              key={pos}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"
            >
              <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: POS_CHALK[pos] }} aria-hidden="true" />
              <span className="font-body text-[11px] font-semibold text-ink-soft">
                {pos === 'DST' ? 'DEF' : pos} {c ? c.text : '—'}
              </span>
            </span>
          )
        })}
      </div>

      <div className="min-h-0 flex-1">
        <DraftBoardGrid
          league={league}
          picks={picks}
          mySlot={mySlot}
          onClock={onClock}
          teamLabelOf={(slot) => engine.teamLabel(slot)}
          shortNameOf={engine.shortName}
          onSelectPlayer={onSelectPlayer}
          scrollToLiveSignal={scrollToLiveSignal}
          followLive
          bottomInset={bottomInset}
        />
      </div>
    </div>
  )
}
