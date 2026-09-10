import { useRef, useState } from 'react'
import { Bot, User } from 'lucide-react'

/* Draft order, and it is two different features wearing one heading.

   In a ROOM it is the host arranging real people, and the room is the thing
   that decides — engine.swapSeats() is the only door, so a reorder is sent
   as the swaps it is made of rather than as a new array.

   SOLO it is one question with one answer: which chair is yours. The other
   nine are computer teams drafting to the same rule, so permuting them
   changes nothing anybody can observe — a shuffle of the whole list would
   be a lie dressed as a feature. So Randomize moves one seat, and tapping a
   row takes that seat, both through engine.randomizeOrder()/setMySlot(),
   which refuse in a room for exactly this reason.

   This used to be a "Seats" tab whose solo branch was a read-only list with
   a paragraph explaining that there was nothing to do — a dead control with
   an apology attached. It is the real thing now in both modes; only what
   "order" means changes.
*/

// Pick a seat up, then put it down on another — the same two taps the legacy
// order list used, and the reason is touch: a drag needs a pointer that can
// hover and a target that does not scroll under it, and this list scrolls.
// Tapping the held seat again puts it back down, which is the only way out
// of a tap you did not mean.
export default function DraftOrder({ engine, league, mySlot, started, onChange }) {
  const [held, setHeld] = useState(null)
  /* The ref is what the click reads; the state is only what draws the
     highlight. An onClick closes over the `held` of its own render, so two
     clicks inside one frame both see null and the second picks a seat up
     instead of swapping. A ref is current at click time whatever the speed. */
  const heldRef = useRef(null)
  const hold = (i) => { heldRef.current = i; setHeld(i) }

  const room = engine.room()
  const seats = room && room.seats ? room.seats : null
  const isHost = !!engine.isHost()

  /* Deliberately NOT the settings screen's own `locked`. That one is about
     the league's SHAPE — the lineup, the scoring, the team count — which is
     fixed the moment a room exists because every client has to agree on the
     board the CPU wobble reads. Draft order is not the board: the room lets
     a host swap seats for as long as its status is "lobby", and
     Room.swapSeats says so itself. Collapsing the two locked the host out of
     the one thing this section is for. Two rules that happen to overlap are
     still two rules. */
  const canOrder = seats ? isHost && !started : !started

  const hint = started
    ? 'The draft has started, so the order is fixed.'
    : seats
      ? isHost
        ? held === null
          ? 'Tap a seat to pick it up, then tap another to swap them.'
          : 'Now tap the seat to swap it with — or tap it again to put it back.'
        : 'Only the host can set the draft order.'
      : 'Tap a draft position to take it. The other chairs are computer teams, so the order between them changes nothing.'

  const randomize = () => {
    if (seats) {
      /* Fisher-Yates, sent as the swaps it is made of, because swapSeats is
         the only thing the room exposes and the room is the thing that
         decides. At most teams-1 messages — twenty-three at the largest
         league — well inside the forty-per-ten-seconds a socket is allowed. */
      const n = league.teams
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        if (i !== j) engine.swapSeats(i, j)
      }
      hold(null)
    } else {
      engine.randomizeOrder()
    }
    onChange()
  }

  const rows = seats
    ? seats.map((chair, i) => ({
        slot: i,
        you: !!chair.you,
        name: chair.you ? 'You' : chair.name || (chair.taken ? 'A manager' : 'Open'),
        open: !chair.taken,
      }))
    /* engine.draftOrder() rather than a loop over league.teams here — it is
       the engine that knows which seat is committed, what a CPU chair is
       called and which overall pick each one holds first, and all three of
       those have been got wrong in this app before by a component deciding
       them for itself. */
    : engine.draftOrder().map((r) => ({ slot: r.slot, you: r.you, name: r.name, firstPick: r.firstPick, open: false }))

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[42ch] flex-1 text-meta leading-snug text-ink-muted">{hint}</p>
        {canOrder && (
          <button
            type="button"
            onClick={randomize}
            className="shrink-0 rounded-full border border-teal-400/60 px-4 py-2 font-body text-[12px] font-bold uppercase tracking-[0.06em] text-teal-300 transition-colors duration-150 active:bg-teal-500/15"
          >
            Randomize
          </button>
        )}
      </div>

      <ol className="flex flex-col">
        {rows.map((r) => {
          const isHeld = held === r.slot
          const press = () => {
            if (!canOrder) return
            if (seats) {
              const current = heldRef.current
              if (current === null) { hold(r.slot); return }
              if (current !== r.slot) engine.swapSeats(current, r.slot)
              hold(null)
            } else {
              engine.setMySlot(r.slot)
            }
            onChange()
          }
          return (
            <li key={r.slot}>
              <button
                type="button"
                disabled={!canOrder}
                onClick={press}
                className={
                  'flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors duration-150 ' +
                  (isHeld ? 'bg-teal-500/15 ring-1 ring-inset ring-teal-400/50' : '') +
                  (canOrder ? ' active:bg-white/[0.04]' : ' cursor-default')
                }
              >
                <span className="w-6 shrink-0 text-right font-display text-[15px] font-bold tabular-nums text-ink-muted">
                  {r.slot + 1}
                </span>
                {/* A robot for a computer team, a person for a human seat —
                    the one thing this list is actually for on a phone, where
                    a name alone at 15px does not separate "me" from "CPU 7"
                    at a glance. */}
                <span
                  className={
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full ' +
                    (r.you ? 'bg-[#FFD166] text-obsidian' : 'bg-slate-rule text-white/70')
                  }
                  aria-hidden="true"
                >
                  {r.you ? <User className="h-[18px] w-[18px]" /> : <Bot className="h-[18px] w-[18px]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={'block truncate text-[15px] font-semibold ' + (r.you ? 'text-teal-300' : 'text-ink')}>
                    {r.name}
                  </span>
                  <span className="block text-[12px] text-ink-muted">
                    Draft position #{r.slot + 1}
                    {r.firstPick ? ` · first pick ${r.firstPick} overall` : ''}
                  </span>
                </span>
                {/* An empty chair is a real state in a room that has not
                    filled up, and it is not the same as a manager who has
                    not named themselves. */}
                {r.open && <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-muted">Open</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
