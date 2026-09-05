import { useEffect, useRef } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'

// The phone draft room's one new interaction primitive: a sheet whose own
// HEIGHT is the state, not its position — the board sits fixed behind it
// (DraftBoardPeekPhone.jsx) and never scrolls or resizes itself, so revealing
// more of it is purely a matter of the sheet getting shorter. That's a
// different gesture from PlayerProfileModal.jsx's own mobile sheet, which
// drags on `y` to dismiss from one fixed height — this one never dismisses
// itself and has three resting heights instead of one, so a translateY
// approach doesn't fit: the header/tab bar this wraps has to stay pinned to
// the sheet's own top edge at every height, which is what animating
// `height` directly (via a motion value bound to inline style, not a CSS
// transition) gives for free.
//
// ---- The collapsed snap is chrome-only, and that is the point ----
//
// SHEET_SNAPS[0] was 188px, which left roughly a tab row plus two list rows
// showing. Reported directly against the reference app: swiping the sheet
// down there compresses it "to the bottom to allow full view of the board,"
// and 188px is not that — it is a shorter sheet still covering the last
// four rounds of a fourteen-round board, which is exactly the rounds a
// drafter swipes down to look at. 58px is the drag handle plus the tab row
// and nothing else: the sheet is still there, still says which tab it is
// on, still one swipe from coming back, and the board behind it is whole.
//
// It is a measurement rather than a round number — 9px of handle margin, a
// 5px handle, 6px under it, then the tab row's own 9+17+8+1. The safe-area
// inset is deliberately NOT in it: that is padding INSIDE the sheet (see
// the content wrapper below), so folding it in here would double-count the
// home indicator on the devices that have one and add dead space on the
// ones that do not.
export const SHEET_SNAPS = [58, 470, 700]
const SHEET_MIN = SHEET_SNAPS[0]
const SHEET_MAX = 720
// "Dragging" vs. "tapping the handle" is the one thing a bare onClick can't
// tell apart on a touch device — every tap fires a few pixels of pointer
// jitter first. 4px matches the design brief's own threshold.
const TAP_SLOP = 4

/* ---- Why release is not simply "nearest snap" -------------------------

   Nearest-snap-by-distance is what this did, and it is what made the sheet
   feel heavy. The snaps are 58 / 470 / 700, so the gap between collapsed
   and default is 412px: a perfectly decisive 84px swipe down from the
   default snap released 328px from collapsed and 84px from where it
   started, and went back where it came from. Measured, in a browser, doing
   exactly the gesture the reference app collapses on. The sheet was not
   ignoring small movements — it was ignoring most real ones, because
   "nearest" is the wrong question when the two candidates are 412px apart.

   Release therefore asks three questions in order, and each one exists for
   a gesture the one after it gets wrong:

   1. Was it FLICKED? Above FLING_V, the direction is the whole message and
      distance is irrelevant — a flick moves fast and not far by definition.
      One snap that way.
   2. Did it TRAVEL decisively? Past DRAG_STEP in one direction, the reader
      has committed even if they let go nowhere near the next snap. Land on
      the nearest snap, but never back on the one they started from: at
      minimum, one step in the direction they were going.
   3. Otherwise, nearest — which for a small movement is the snap it started
      from, so an accidental nudge springs back, which is right.

   Together these produce all three of the behaviours this was asked for
   without any of them being special-cased. A swipe down from default is one
   step down: the collapsed sheet and a whole board. A short swipe up from
   there is one step up, back to default. A long swipe up releases past the
   halfway point on its own and rule 3 alone would settle it at the tallest
   snap.

   Both thresholds are deliberately low. A deliberate drag ends with the
   finger slowing to a stop, so its release velocity is near zero however
   fast the middle of it was — there is no risk of catching one by accident
   with FLING_V, and a low bar is what makes a small casual swipe count.
   DRAG_STEP at 56px is just past the collapsed sheet's own height, which
   makes it comfortably more than a scroll-start wobble and comfortably
   less than any movement somebody made on purpose. */
const FLING_V = 550
const DRAG_STEP = 56

function nearestSnapIndex(h, snaps) {
  let best = 0
  let bestDist = Infinity
  snaps.forEach((s, i) => {
    const d = Math.abs(s - h)
    if (d < bestDist) { bestDist = d; best = i }
  })
  return best
}

/**
 * Controlled on `snapIndex` (0/1/2 into SHEET_SNAPS) the same way any other
 * piece of DraftRoom state is — a composer opening can push the sheet to
 * its tallest snap (see ChatTabPhone.jsx) by changing the prop, exactly like
 * every other cross-component "open this" in this app.
 *
 * Uncontrolled *during* a drag: the live height lives on a framer-motion
 * motion value bound straight to `style.height`, so dragging never round-
 * trips through React state on every pointer-move frame. `onSnapIndexChange`
 * only fires once, on release, with the settled index.
 *
 * `maxHeight` is a ceiling under `SHEET_MAX`, and it exists because the
 * sheet is not the only fixed thing on screen. CockpitHeaderPhone sits at
 * `z-40`, above this sheet's own `z-30`, so a sheet tall enough to reach
 * behind the header does not just look wrong — the header physically
 * covers the drag handle and the tab row underneath it. On a device short
 * enough that `SHEET_SNAPS`' own 700px exceeds the room below the header
 * (measured: a 664px-tall viewport minus a 106px header leaves 558), that
 * happens on the ordinary path of expanding the sheet, and there is then
 * no way to shrink it back down or switch tabs at all — no error, nothing
 * in the console, just a control that looks reachable and is not. Capping
 * every height this component ever sets — the initial value, the snap
 * animations, and the live drag clamp — is what keeps the handle inside
 * the room the header actually leaves it, at every snap.
 */
export default function BottomSheet({ snapIndex, onSnapIndexChange, header, children, className, maxHeight }) {
  const ceiling = maxHeight ? Math.min(SHEET_MAX, maxHeight) : SHEET_MAX
  const snaps = SHEET_SNAPS.map((s) => Math.min(s, ceiling))

  const height = useMotionValue(snaps[snapIndex])
  // The height the drag started from — offset.y is relative to the drag's
  // own start, not to the sheet, so the live height has to be computed as
  // "where we started minus how far up/down the pointer has moved" rather
  // than accumulated delta-by-delta (accumulating would drift under
  // framer's own sub-pixel rounding over a long drag).
  const dragStartH = useRef(snaps[snapIndex])
  const draggedPastSlop = useRef(false)
  const controlsRef = useRef(null)
  // Whether a finger is on the handle right now. Only the ceiling effect
  // below reads it: every other path here already knows, because it is one
  // of the drag handlers.
  const dragging = useRef(false)
  // The snap this drag began from. `snapIndex` itself is a prop closed over
  // by the handler of whichever render armed it, which is the right value
  // here today only because a drag never writes to it mid-gesture — but a
  // flick is defined as "one step from where this gesture started," and
  // reading that off a prop is exactly the stale-closure shape the settings
  // modal's own seat-swap comment already documents as a real bug. A ref is
  // current at release time whatever else re-rendered meanwhile.
  const startIndex = useRef(snapIndex)

  // Settle on a snap, carrying the gesture's own release velocity into the
  // spring rather than starting a fresh one from zero. Without this the
  // sheet visibly stops dead at the moment of release and then re-animates,
  // which is the single biggest difference between a sheet that feels
  // attached to the finger and one that feels like it is playing a
  // transition at you.
  const settle = (index, velocity) => {
    controlsRef.current?.stop()
    controlsRef.current = animate(height, snaps[index], {
      type: 'spring',
      stiffness: 460,
      damping: 44,
      // A drag up shrinks offset.y and GROWS height, so the sign flips.
      velocity: velocity ? -velocity : 0,
    })
  }

  // A prop-driven snap change (composer opening, tap-to-cycle already
  // reported up) animates in; nothing here fights a drag in progress
  // because this only runs when snapIndex itself changes, and a drag never
  // writes to that prop until release.
  useEffect(() => {
    settle(snapIndex, 0)
    return () => controlsRef.current?.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapIndex])

  /* ---- The ceiling is not fixed for the life of the sheet ----

     `maxHeight` moves mid-draft, and nothing re-ran the settle above for
     it: that effect watches `snapIndex`, which has not changed. So the
     motion value kept a height taller than the room now left, the sheet's
     top edge stayed where it was, and the header — `z-40`, over this
     sheet's `z-30` — covered the difference. Which is the exact failure
     the maxHeight note above describes, arriving from the one direction
     that note did not cover: the ceiling was only ever honoured at mount
     and at a snap change, never when it MOVED.

     Two things move it. CockpitHeaderPhone grows by AUTOPICK_RIBBON_H the
     moment auto-pick goes on, and the viewport itself changes height when
     a phone browser's URL bar shows or hides, or the device rotates.

     Reported from an iPhone SE: auto-pick switched on in the Queue tab,
     and then no way to swipe the sheet back down, because the ribbon was
     sitting on the handle. Measured at 375x553 with the ribbon on, the
     sheet stayed 447px against a ceiling that had dropped to 439 and the
     header covered the top 8px of it — the handle's whole top margin, with
     the "Turn off" button directly above what was left, so a downward
     swipe starts on the ribbon rather than on the sheet. At 390x664 — the
     one phone the suite profiles — there is 80px of slack and it cannot
     happen at all, which is why nothing caught it.

     Re-settling rather than clamping `height` directly is what makes it
     symmetric: turning auto-pick off hands the room back and the sheet
     grows into it again, instead of staying short for the rest of the
     draft. And it is skipped mid-drag, because a ceiling change during a
     gesture would yank the sheet out from under the finger — `handleDrag`
     already clamps to the live ceiling on every frame, so the drag is
     honouring it anyway, and `handleDragEnd` settles onto the new snaps. */
  useEffect(() => {
    if (dragging.current) return
    settle(snapIndex, 0)
    return () => controlsRef.current?.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceiling])

  const handleDragStart = () => {
    dragging.current = true
    controlsRef.current?.stop()
    dragStartH.current = height.get()
    startIndex.current = snapIndex
    draggedPastSlop.current = false
  }

  const handleDrag = (_, info) => {
    if (Math.abs(info.offset.y) > TAP_SLOP) draggedPastSlop.current = true
    // Dragging the handle up (negative offset.y) grows the sheet.
    const next = Math.min(ceiling, Math.max(SHEET_MIN, dragStartH.current - info.offset.y))
    height.set(next)
  }

  const handleDragEnd = (_, info) => {
    dragging.current = false
    if (!draggedPastSlop.current) {
      // A tap: cycle forward regardless of where the drag jitter left the
      // height, so a tap always means "one step on," never "wherever a
      // few stray pixels of touch noise happened to land."
      const next = (snapIndex + 1) % snaps.length
      onSnapIndexChange(next)
      settle(next, 0)
      return
    }

    const v = info.velocity.y
    const from = startIndex.current
    // Positive = the sheet grew = the finger went up. One name for the
    // direction, so the flick branch and the travel branch cannot disagree
    // about which way "one step" is.
    const grew = height.get() - dragStartH.current
    const dir = (Math.abs(v) > FLING_V ? (v < 0 ? 1 : -1) : (grew > 0 ? 1 : -1))
    // Clamped rather than wrapped: a flick down from the collapsed sheet
    // means "stay out of the way," and wrapping round to the tallest snap
    // would be the most disruptive possible reading of it.
    const stepped = Math.max(0, Math.min(snaps.length - 1, from + dir))

    let next
    if (Math.abs(v) > FLING_V) {
      next = stepped
    } else if (Math.abs(grew) > DRAG_STEP) {
      // Nearest, but never back where it started — see rule 2 above.
      const nearest = nearestSnapIndex(height.get(), snaps)
      next = nearest === from ? stepped : nearest
    } else {
      next = nearestSnapIndex(height.get(), snaps)
    }
    onSnapIndexChange(next)
    settle(next, v)
  }

  return (
    <motion.div
      style={{ height }}
      className={
        'fixed inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[20px] border-t border-slate-rule bg-slate-bar shadow-[0_-18px_40px_rgba(0,0,0,0.45)] ' +
        (className || '')
      }
    >
      {/* The handle is the whole drag surface — content below scrolls on
          its own, and giving the whole sheet `drag="y"` would fight that
          scroll gesture on every list the sheet ever holds. touch-none on
          just this row is what stops the browser starting a page scroll
          on iOS Safari before framer's own pointer handling gets a look at
          it (see PlayerProfileModal.jsx's identical `touch-none` on the
          drag surface for the same reason).

          dragMomentum={false} because this component runs its own settle:
          framer's momentum would carry the height past the release point
          and then the spring would pull it back, which reads as a bounce
          nobody asked for on a sheet whose resting heights are fixed. */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0}
        dragMomentum={false}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        className="flex shrink-0 cursor-grab touch-none flex-col items-center justify-center active:cursor-grabbing"
      >
        <div className="h-[5px] w-11 rounded-full bg-slate-rule" style={{ marginTop: 9, marginBottom: 6 }} />
        {header}
      </motion.div>

      {/* pb on the CONTENT, not on the sheet, and not folded into
          SHEET_SNAPS[0] — see that constant's own note. At the collapsed
          snap this wrapper has no height to speak of anyway, so the inset
          costs nothing there and keeps the last row of a list clear of the
          home indicator at every other snap. */}
      <div className="min-h-0 flex-1" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>{children}</div>
    </motion.div>
  )
}
