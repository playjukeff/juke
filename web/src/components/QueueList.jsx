import { X } from 'lucide-react'
import { POS_BADGE } from './draftRoomPositions.js'
import { Bar } from './decision/Bar.jsx'

// Extracted out of DraftLogDock so the desktop column and the mobile dock
// can each wrap it in their own chrome without the queue-row markup living
// in two places — see DraftLogDock.jsx's own comment on why there are two
// wrappers around one set of tab content.
//
// survivalOf is optional — the Cockpit's not-your-turn state wants an odds
// column on this exact list ("your queue, while you wait"), and passing a
// function here draws it rather than forking a second queue-row component
// for one extra column. Omitted (both original callers, DraftRoom.jsx and
// PlayerHub.jsx), the row renders exactly as it always did.
/* ---- P3: the value left in each queued player, as a bar ----

   The queue is a PLAN, and the two controls on every row are up and down.
   So the question the row has to answer is "is this one above that one",
   and until now it answered it with a name and nothing else -- the reader
   had to hold four players' worth in their head to reorder three of them.

   `replacementGap()` is the figure: projected points above a replacement
   starter at the position, which is the unit the player sheet, the Juke
   score and the Insights VORP matrix all already report in. Scaled to the
   queue's OWN maximum rather than the board's, because the comparison a
   reader is making here is between these five players and not between one
   of them and Ja'Marr Chase.

   ---- It goes under the name, not beside it ----

   The guide asks for `w-[60px]` in the row. Measured against the real
   column: rank, badge, survival, three icon buttons and a Draft button
   leave about 48px for the name in the 330px desktop queue, so a 60px
   sibling would take the name below "J. Gib...". Under the name it is the
   full width of the one cell that flexes, which is 60-90px in the same
   column and grows on a phone rather than squeezing the name.

   ---- A kicker draws NOTHING, not an empty track ----

   `replacementGap()` refuses UNRANKED_POSITIONS, and an empty track is a
   scale with nothing on it, which reads as zero. Zero is a claim about a
   kicker's worth that this app deliberately does not make. The spacer
   keeps the row's height so a queue holding one defense is not one row
   shorter than the others for a reason nobody can see. */
export default function QueueList({ players, myTurn, engine, survivalOf }) {
  // Guarded the way every bridge read here is: a cached app.js is a real
  // state, and a queue with no bars is a queue rather than an exception.
  const gapOf = (p) => {
    if (!engine || !engine.replacementGap) return null
    const g = engine.replacementGap(p)
    return typeof g === 'number' && isFinite(g) ? g : null
  }
  const gapMax = players.reduce((m, p) => Math.max(m, Math.abs(gapOf(p) || 0)), 0)

  if (players.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs leading-relaxed text-ink-muted">
        Star a player in the list to line them up here — this is your own plan, and
        it's what gets drafted for you if the clock runs out while you're away.
      </p>
    )
  }

  return players.map((p, i) => (
    <div
      key={p.name}
      className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-rule bg-slate-sunk/50 px-2.5 py-2"
    >
      <span className="w-3.5 shrink-0 text-center text-[10px] text-ink-muted">{i + 1}</span>
      <span
        className={
          'shrink-0 rounded px-1 text-[9px] font-bold ' +
          (POS_BADGE[p.pos] || 'bg-white/10 text-white/50')
        }
      >
        {p.pos}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-white/90">{p.name}</span>
        {gapOf(p) === null ? (
          <span aria-hidden="true" className="mt-1 block h-bar-track" />
        ) : (
          <Bar
            className="mt-1"
            value={gapOf(p)}
            max={gapMax}
            sign="evidence"
            index={i}
          />
        )}
      </span>
      {survivalOf && (
        <span className="shrink-0 font-numeral text-[10px] tabular-nums text-white/50">
          {(() => {
            const s = survivalOf(p)
            return s == null ? '—' : Math.round(s * 100) + '%'
          })()}
        </span>
      )}
      <button
        type="button"
        onClick={() => engine.queueMove(p.name, -1)}
        disabled={i === 0}
        className="shrink-0 text-[11px] text-white/40 hover:text-white/70 disabled:opacity-20"
      >
        &uarr;
      </button>
      <button
        type="button"
        onClick={() => engine.queueMove(p.name, 1)}
        disabled={i === players.length - 1}
        className="shrink-0 text-[11px] text-white/40 hover:text-white/70 disabled:opacity-20"
      >
        &darr;
      </button>
      <button
        type="button"
        onClick={() => engine.queueToggle(p.name)}
        title="Remove from your queue"
        className="shrink-0 text-ink-muted hover:text-rose-400"
      >
        <X className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => engine.draftPlayer(p)}
        disabled={!myTurn}
        className={
          'shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold transition-colors duration-150 ' +
          (myTurn
            ? 'bg-gradient-to-r from-[#00E5FF] to-[#7B1FA2] text-white'
            : 'cursor-not-allowed bg-white/5 text-white/25')
        }
      >
        Draft
      </button>
    </div>
  ))
}
