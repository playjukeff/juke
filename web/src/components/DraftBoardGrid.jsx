import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { POS_CHALK, POS_RAIL, CELL_INK, CELL_SUB, INJURY_META } from './draftRoomPositions.js'

// Real data only: `picks` is window.JukeEngine.picks() (state.picks itself,
// {overall, round, slot, player}), the same array the legacy board reads
// via `state.picks.find(p => p.round === r && p.slot === s)` — this just
// indexes it once into a map instead of re-scanning it per cell.
//
// Not memoized on `picks` itself: state.picks is mutated in place
// (Array.push in makePick()), so the array reference never changes and a
// useMemo keyed on it would freeze this map at whatever it was on first
// mount — every filled cell after that would silently render as empty.
// Rebuilding on every render is the same "render() redraws everything, no
// partial updates" trade this codebase already makes deliberately (see
// CLAUDE.md's Conventions section), and it costs nothing at ~280 entries.

/* adpGap()/adpText() used to live here, and the delta they drew is gone
   from the cell by name: the palette handoff removes it and puts the
   round's snake arrow in the slot it held. Worth recording why, because
   the number itself was correct and this is the second signal this cell
   has shed.

   A board cell is read at a glance, in a column, for one question — what
   went where. The delta answered a different one (was that pick good
   value), in a hue pair the board also spends on nothing else, on all 140
   cells at once. It was the last survivor of a version of this cell that
   carried a full-cell red/green value wash as well, and the argument that
   demoted the wash to a number applies again one step further down. Where
   value-versus-ADP still belongs is the player profile and the pool row,
   which both draw it, and neither is glanced at in a grid.

   Nothing else imported either function — checked before deleting rather
   than after — so this is a removal, not a hidden move. DraftRoom.jsx's
   own gap arithmetic near line 964 is its own copy for the ticker and is
   untouched. */

// Pick-order direction, per cell — every cell carries it, not just drafted
// ones (CLAUDE.md: "it was on drafted ones only" was itself a shipped
// bug — the turn matters most *before* a pick lands). Built only from
// DraftEngine, the one place the mirror is allowed to live, never
// re-derived here.
//
// Takes the whole `league`, not a team count. `round % 2 === 0` was the
// direction test and it is only right for a plain snake: a linear draft
// runs forward in every round and third-round reversal inverts the parity
// from round three on, so a board asked for a team count alone would draw
// confident arrows pointing the wrong way, on cells whose pick numbers
// were simultaneously correct. That is the seat-versus-pick-number bug
// exactly — two right numbers side by side disagreeing — so the answer
// comes from DraftEngine.reversedRound().
function boardArrow(DE, round, slot, league) {
  if (!DE) return null
  if (DE.pickInRound(round, slot, league) === league.teams) return 'down'
  return DE.reversedRound(round, league) ? 'left' : 'right'
}

/* One glyph, rotated - never three different characters. The down arrow is a
   vertical stem and the right arrow is a thin cross-stroke, so a face draws
   the first far heavier than the second: measured in the board's own font
   (Inter 600), down carries 2.5x the ink of right - 305 pixels against 122.
   Nothing in CSS repairs that, because it is the glyph and not the styling.
   A rotated right arrow is the same glyph at the same weight by construction,
   so all three directions match whatever face the board ends up in.

   aria-hidden because the direction is decoration here: the pick code and the
   overall number in the same cell already say where the pick sits. */
const ARROW_SPIN = { right: 'rotate(0deg)', down: 'rotate(90deg)', left: 'rotate(180deg)' }

/* The box has to be square, and that is the whole trick. A span wrapping the
   glyph is glyph-advance wide (7.8px) but line-height tall (13.5px), so
   rotating it 90 degrees about its centre produces a visual box of 13.5 x 7.8
   that spills outside the layout box the `right-1 top-0.5` anchor is
   positioning. Measured: the down arrow drew 2.9px further right and 2.9px
   lower than its neighbours - which reads as a wonky arrow long before
   anybody works out it is an alignment problem rather than a weight one.

   A square box with leading-none and the glyph centred inside it rotates
   symmetrically - but only once the box actually contains the glyph, and
   `line-height` is not what makes it. Measured on the phone board, 31 August
   2026: at `text-[14px]` the box is 14 x 14 and the glyph's own box is
   12.09 x 19, because the layout overflow of inline text is the face's
   ascent+descent (1.357em in Hanken Grotesk) rather than its line-height. So
   2.5px of it hangs out above and below every arrow - invisible while it is
   vertical, since the cell clips it - and rotating 90 degrees turns that into
   19px of width inside a 14px box. The down arrow therefore reached 3px past
   the right edge of the flex row it sits at the end of, which is one cell per
   round: the end-of-round pick is the only one whose arrow points down.

   That is what phone.spec.mjs's overflow sweep reads as a row that can
   neither scroll nor ellipsise, and it is right to. The tell that it is a
   real overflow rather than the subpixel rounding that sweep's own `slack`
   exists to forgive: the numbers do not move with the device pixel ratio at
   all - clientWidth 82 against scrollWidth 85 at dpr 1 and at dpr 3 alike.

   `overflow: hidden` is what makes the promise above true, and it costs
   nothing on screen. Clipping happens in the element's own coordinates before
   the transform, so the parent sees a 14 x 14 box whichever way the glyph is
   turned, and what gets clipped is ascent/descent whitespace rather than ink.
   Measured as a whole-viewport pixel diff with and without it: 0 differing
   pixels of 1170 x 1992 on the phone, and 0 of 2880 x 1800 on the desktop
   board at `lg:text-[16px]`, where all 140 arrows are on screen at once. The
   desktop run took a control pair first - two shots with nothing changed
   between them - because framer-motion drives the live cell's opacity pulse
   from JavaScript and it survives `animation: none`, so an uncontrolled diff
   reports 25,000 pixels of pulse and calls it a change.

   Widening the sweep's tolerance instead would have hidden a genuinely
   clipped short label somewhere else and fixed nothing here. */
function Arrow({ dir, className }) {
  if (!dir) return null
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1em',
        height: '1em',
        lineHeight: 1,
        // Not decoration on the rule above - it is what enforces it. See the
        // note: without it the glyph's font box is taller than this box and
        // rotation turns that into width.
        overflow: 'hidden',
        transform: ARROW_SPIN[dir],
      }}
    >
      →
    </span>
  )
}

/* "Which one am I", answered structurally rather than by tinting. Two cyan
   rails run the full height of your column — through the header, through
   every drafted cell and, crucially, through every empty future one — and
   the column keeps exactly the same value as the rest of the board. The
   palette handoff's own name for the option is "seat bracket", and the
   bracket is the whole of it: no wash, no per-cell ring, no second colour
   inside the cells.

   This replaces a gold wash plus a gold border pair, and the swap is the
   one deliberate departure from CLAUDE.md's "Gold is identity" rule —
   scoped, on purpose, to this grid. Gold still means "yours" in PicksRail,
   PickTicker, ChatPanel, the Decide screen, the queue and the Entry seat
   board, and tailwind.config.js's `shadow-seat`/`.seat-wash` tokens are
   untouched. What changed is that the board's cells are chalk now: gold at
   7% alpha over a light pastel is not a tint anybody can see, and a #FFD166
   rule against #FBD5A8 (TE's fill) measures 1.15:1 — the mark would have
   survived as a name and died as a signal. Cyan is the one hue on this
   board that no chalk fill goes near.

   The cost is real and is not hidden: cyan already carries "on the clock"
   on this same grid, which is the exact "one colour, several jobs" failure
   gold was introduced to end. What keeps them apart here is that they are
   different shapes rather than different colours — the live pick is a
   filled, pulsing, 2px-bordered box occupying one cell, and the seat is a
   pair of hairlines fourteen rows tall that never fills anything. Inside
   your own column on your own turn both are drawn, nested, which is the
   same "two facts coincide, let both draw" call the legacy board already
   makes.

   An inset box-shadow, never a border: a border is inside the box under
   box-sizing: border-box, so it would eat 1-2px out of the card's own
   padding on the two columns nobody wants shifted, and every cell in the
   board would have to gain the same width to stay aligned. The shadow sits
   on the grid-cell wrapper rather than the pick card, which is what makes
   the rails continuous — they cross the 3px gutter between cards instead
   of stopping at each one, so fourteen cells read as one column.

   Two complete literal strings, one per width, never one assembled from
   fragments. draftRoomPositions.js's header names this exact trap and this
   function fell into it once already: Tailwind's JIT greps source for a
   whole class token, so a bracket value built by concatenation compiles to
   nothing at all — and React still renders the class name, so the only
   thing that ever noticed was a test reading getComputedStyle().boxShadow
   and getting back "none". 2px below lg because 1px reads as an artefact
   at phone density (the handoff says so, and it is right); 1px at lg+
   because at desktop density 2px reads as a border somebody drew. */
const SEAT_BRACKET =
  'shadow-[inset_2px_0_0_#00E5FF,inset_-2px_0_0_#00E5FF] ' +
  'lg:shadow-[inset_1px_0_0_#00E5FF,inset_-1px_0_0_#00E5FF]'

// The current pick keeps its own distinct box (the teal pulsing one below,
// with its own inline glow) rather than composing into SEAT_BRACKET above —
// "your column" and "the live pick" stay two readable facts instead of one
// cell trying to carry both. They share a hue now and deliberately not a
// shape; see the note on SEAT_BRACKET for why that is the thing keeping
// them apart.

// The dock-raise/lower chevron pair, on the board's own bottom-right corner
// rather than in DraftRoom.jsx as a sibling overlay — the board is the
// thing whose corner this sits on, and DraftLobby.jsx mounts this same
// component with no dock beneath it at all (trayPos/onTrayUp/onTrayDown all
// undefined there), so the pair only renders when a real dock is passed in.
function RaiseLowerButton({ onClick, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={
        'flex h-6 w-6 items-center justify-center rounded-full border transition-colors duration-150 ' +
        (disabled
          ? 'cursor-not-allowed border-slate-rule bg-slate-sunk/70 text-white/15'
          : 'border-slate-rule bg-slate-sunk/80 text-white/60 hover:border-teal-400/50 hover:text-teal-300')
      }
    >
      {children}
    </button>
  )
}

/* Put the live pick in the middle of the board's own scroller.

   Two things here are the hard-won rules this codebase already paid for
   once, on the legacy board, and they are just as true of this one.

   `offsetTop` is NOT a distance to the scroller. It is the distance to the
   nearest *positioned* ancestor, and nothing between a board cell and this
   scroll container is positioned — the legacy board read it anyway and sat
   about four rounds past the live pick, twitching every time anything above
   the board changed height. Two getBoundingClientRect() calls, differenced,
   are a real distance between two real boxes whatever is positioned in
   between. Do not "fix" a future version of this by adding `position:
   relative` to the scroller: that makes offsetTop correct today and
   silently wrong again the next time somebody changes positioning.

   And do not re-ask for a scroll you are already at. `behavior: smooth`
   starts an animation whether or not the target moved, so a caller that
   fires this on every render would restart one every few hundred
   milliseconds. 4px of slop is what turns "moves constantly" into "moves
   once, when asked."

   `bottomInset` is the third: the scroller's own box is not always the
   part of it a person can see. On a phone the board is `fixed ... bottom:
   0` and the draft sheet is drawn OVER its lower half, so centring in the
   scroller's own height put the live pick behind the sheet — measured at
   375x812 with the sheet at its default snap, the cell landed at y=444
   against a sheet whose top edge is y=342. The scroll was arithmetically
   perfect and the pick was invisible, which reads as "it did not scroll
   at all." Centre in the visible band instead; a caller with nothing over
   it passes nothing and gets the old behaviour exactly.

   Floored at the target's own height so a sheet taller than the board
   cannot invert the term and push the live pick off the top. */
function centreOnLive(scroller, cell, bottomInset = 0) {
  if (!scroller || !cell) return
  /* A CSS-hidden board is still a mounted board. Below lg the Board tab's
     own segmented control hides this grid with `hidden` rather than
     unmounting it, and a display:none scroller measures 0 by 0 — every
     term below then works out to 0, and a "centre" would quietly scroll a
     board nobody is looking at back to its top-left corner. Harmless in
     the end (the next pick re-centres it once it is visible again) and
     still a scroll nobody asked for, on an element that cannot be seen. */
  if (!scroller.clientWidth && !scroller.clientHeight) return
  const box = scroller.getBoundingClientRect()
  const target = cell.getBoundingClientRect()
  const visibleH = Math.max(target.height, box.height - bottomInset)
  const left = scroller.scrollLeft + (target.left - box.left) - (box.width - target.width) / 2
  const top = scroller.scrollTop + (target.top - box.top) - (visibleH - target.height) / 2
  const x = Math.max(0, Math.min(left, scroller.scrollWidth - scroller.clientWidth))
  const y = Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight))
  if (Math.abs(x - scroller.scrollLeft) < 4 && Math.abs(y - scroller.scrollTop) < 4) return
  scroller.scrollTo({ left: x, top: y, behavior: 'smooth' })
}

export default function DraftBoardGrid({ league, picks, mySlot, onClock, teamLabelOf, onTeamClick, shortNameOf, onClaimSeat, seats, onSelectPlayer, trayPos, onTrayUp, onTrayDown, scrollToLiveSignal, followLive = false, bottomInset = 0 }) {
  const scrollerRef = useRef(null)
  const liveCellRef = useRef(null)
  /* Whether the board is currently tracking the live pick. A ref, not
     state: nothing renders differently for it, and the gesture listeners
     below have to read and write the latest value from a closure that is
     set up once. */
  const followingRef = useRef(true)

  /* ---- Following the live pick ----

     The board follows by default and stops the moment a person scrolls it
     themselves; the crosshair is how they get back. Reported from a real
     mobile draft with auto-pick on: the board simply never moved, so
     watching your own draft happen meant dragging the grid down a round at
     a time.

     Auto-follow IS a bug this project has shipped and removed once, on the
     legacy board — it pulled a reader back to the live pick two or three
     times a second for as long as they kept trying to look elsewhere — and
     the fix there was never "stop following", it was `boardFollow`: follow
     until a person says otherwise. That is what this is, and the two rules
     that made it work there are both kept.

     **The gesture list may not include `scroll`.** A smooth programmatic
     scroll fires a stream of scroll events, so a board that disengaged on
     `scroll` would disengage on its own animation and follow exactly one
     pick. Only events a person produces count.

     **And `pointerdown` is deliberately not one of them either**, which is
     where this differs from the legacy board. Every cell on this grid is
     clickable — tapping a name opens the player sheet — so a pointerdown
     listener would treat reading a player as "I want to look elsewhere"
     and quietly stop following. `touchmove` is the touch gesture that
     actually means scrolling; a tap never fires it. */
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || !followLive) return
    const release = () => { followingRef.current = false }
    /* And the way back that needs no control at all: scrolling the live
       pick back into view IS "done looking." The legacy board took the
       same line, and it is the reason `scroll` can be listened to here
       while it may not be listened to above — this only ever RE-enables
       following, so a programmatic smooth scroll re-arming the thing that
       started it is a no-op rather than a feedback loop. It is also what
       makes following safe on the desktop board, which has no crosshair
       of its own to press. */
    const regain = () => {
      if (followingRef.current) return
      const cell = liveCellRef.current
      if (!cell) return
      const box = scroller.getBoundingClientRect()
      const target = cell.getBoundingClientRect()
      // The same visible band centreOnLive() uses, for the same reason: a
      // cell behind the sheet is inside the scroller's box and is not in
      // view, and treating it as in view re-arms following against a
      // reader who cannot see the thing being followed.
      const visible =
        target.top >= box.top && target.bottom <= box.bottom - bottomInset &&
        target.left >= box.left && target.right <= box.right
      if (visible) followingRef.current = true
    }
    scroller.addEventListener('wheel', release, { passive: true })
    scroller.addEventListener('touchmove', release, { passive: true })
    scroller.addEventListener('keydown', release)
    scroller.addEventListener('scroll', regain, { passive: true })
    return () => {
      scroller.removeEventListener('wheel', release)
      scroller.removeEventListener('touchmove', release)
      scroller.removeEventListener('keydown', release)
      scroller.removeEventListener('scroll', regain)
    }
  }, [followLive, bottomInset])

  /* Keyed on where the live pick IS, not on picks.length, so this also
     fires the one time that matters most and does not change the count:
     the first paint of a resumed draft. centreOnLive() returns early
     inside 4px, so a re-run that finds the board already centred costs
     nothing and starts no animation. */
  const liveKey = onClock ? onClock.round + '-' + onClock.slot : ''
  useEffect(() => {
    if (!followLive || !followingRef.current) return
    centreOnLive(scrollerRef.current, liveCellRef.current, bottomInset)
  }, [followLive, liveKey, bottomInset])

  /* Driven by a counter the caller increments, not by a ref handed up or a
     window event. A counter is the smallest thing that can express "the
     crosshair was pressed again" — pressing it twice in a row has to scroll
     twice, and a boolean cannot say that. It also keeps this a plain prop:
     a window event would scroll every board that happened to be mounted,
     and a forwarded imperative handle would have to be threaded through
     DraftBoardPeekPhone and DraftRoomPhone to reach the header.

     Deliberately skipped on the first render (signal 0 / undefined): a
     caller that has never pressed it must not have the board jump on
     mount.

     It re-arms following as well as scrolling once. The crosshair's whole
     job is "put me back on the live pick", and a version that scrolled
     there and then let the next pick drift away again answers half of it. */
  useEffect(() => {
    if (!scrollToLiveSignal) return
    followingRef.current = true
    centreOnLive(scrollerRef.current, liveCellRef.current, bottomInset)
    // bottomInset deliberately out of the dependency list: this fires on a
    // press, and re-running it because the sheet moved would scroll the
    // board every time somebody dragged the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToLiveSignal])

  const byCell = new Map()
  picks.forEach((p) => byCell.set(p.round + '-' + p.slot, p))

  const DE = typeof window !== 'undefined' ? window.DraftEngine : null
  const teams = league.teams
  const rounds = league.rounds
  /* Two column rules, but both now carry a real floor — the difference
     between them is only the floor's size and the header rail's width.
     colsWide used to be minmax(0, 1fr): no floor at all, specifically so
     ten teams could share the window with no horizontal scroll. Measured
     at a real 1103px desktop width, that traded away the thing it was
     supposed to protect — a player name needs roughly 110-170px to read,
     and 0-floor columns render every card as a position badge and a
     clipped initial. An unreadable board is worse than a scrollable one,
     and Sleeper's own board — the thing this split layout was already
     benchmarked against — scrolls rather than compresses. 120px is under
     what a long name wants at the widest league sizes, which is exactly
     why the horizontal scroll stays: this is a floor, not a fit. */
  /* 36px gutter below lg, not 64 and not the 30px this used to be either.
     A round number is one or two digits and the rail is sticky, so it is
     permanently on screen. 36+108 is the mobile board pass's own pair
     (see the seat column note below) — both moved together so a ten-team
     board lands on exactly 1116px, the acceptance check's own number,
     rather than the two floors being tuned independently and drifting
     apart. Desktop keeps its own pair below, untouched.

     Fixed 108px below lg, not minmax(108px, 1fr). The floor is the right
     shape for desktop — see the note on colsWide below — but combined
     with this grid's own min-w-max it resolves to max-content, and a
     board of real player names came out well past what a fixed track
     gives. On a width where you can see three columns at once, how far
     the board runs is the cost that matters, and 108px is the mobile
     board pass's own measured floor for the longest name it has to hold
     at this row height. */
  const cols = `36px repeat(${teams}, 108px)`
  const colsWide = `56px repeat(${teams}, minmax(120px, 1fr))`
  /* Explicit rows, not another auto-rows floor: the header keeps its own
     natural (avatar + name) height, and every round after it is exactly
     46px below lg, 50px at lg+ — a fixed size, never a minimum. The old
     auto-rows-[minmax(34px,auto)] let a round's height come from its
     tallest cell's own content, which is exactly the thing a fixed-height
     design needs to stop being possible; naming every track here removes
     the question rather than narrowing it. 46, not the 56 this used to
     be: the mobile board pass's own row height, paired with the smaller
     108px column and 24px seat avatar below so the whole header/row
     stack shrinks together rather than the columns narrowing under rows
     still sized for the wider ones. */
  const rowsTemplate = `auto repeat(${rounds}, 46px)`
  const rowsWide = `auto repeat(${rounds}, 50px)`

  return (
    // w-full h-full, not a flex-basis of its own: DraftRoom.jsx now wraps
    // this in a div that carries the mobileView show/hide and, at lg+, the
    // real lg:flex-[7] against the queue's lg:flex-[3] — this just fills
    // whatever that wrapper gives it, on both sides of the breakpoint,
    // rather than trying to size itself against the row a second time.
    // overflow-x-auto/overflow-y-auto: the grid itself is min-w-max (every
    // column at its real width, never squashed), so on a phone it's always
    // wider than the viewport — this box is what scrolls, both directions,
    // with touch.
    <div className="relative flex h-full min-h-[240px] w-full flex-1 flex-col overflow-hidden border-b border-slate-rule bg-slate lg:border-b-0 lg:border-r">
      {/* The legend is gone, and so is the row it sat in. It read
         "FILL = POSITION" beside six chalk pills, and it was answering a
         question the board had already stopped asking: the cell says
         "RB · DET" in its own second line, the pool below it carries a
         position chip on every row, and the filter chips above that are
         the same six letters again. Nothing on this screen was relying on
         the ribbon to decode a colour — a reader who cannot tell the
         pink cells from the green ones can read the two letters inside
         them, which is exactly why the letters stayed when the position
         badge chip came out.

         What it cost was real estate at the top of the board, permanently,
         on the one panel whose whole value is how many rounds it can show
         at once. It was 33px — most of a round.

         Historically it carried three keys (the six hues, a red/green
         "value vs ADP" scale, and a gold "you" swatch) and shed them one
         at a time as the things they decoded left the cell or became
         self-evident. This is the last of the three, removed for the same
         reason as the second: a marker that explains itself needs no
         caption, and a caption that outlives its subject is furniture.

         LEGEND_POSITIONS is gone with it — nothing else read it, and an
         unused export of the position order is exactly the sort of thing
         a later pass wires back in without the reasoning that took it
         out. POS_CHALK/POS_RAIL keep the order they always had.

         The mobile redesign's own `hideLegend` prop went with it too —
         there is nothing left for it to hide, on any caller, including
         the phone board-peek that used to pass it. */}

      {/* The one scroll container, both axes — everything above this point
          is shrink-0 chrome that never scrolls with it, so there is exactly
          one scrollbar on this screen rather than a nested one fighting an
          outer page scroll. flex-1 min-h-0 is what makes it claim exactly
          the remaining height rather than growing to its content. */}
      <div ref={scrollerRef} className="no-scrollbar-below-lg min-h-0 w-full flex-1 overflow-x-auto overflow-y-auto">
      {/* pb-[7rem+tab bar] below lg: PlayerHub's sheet is fixed over the
          bottom edge there and would otherwise cover the last couple of
          rounds when scrolled all the way down. The 7rem (112px, pb-28's own
          value) is the sheet's own collapsed height; the +58px+safe-area on
          top of it is new with this pass, matching PlayerHub.jsx's own shift
          off true bottom-0 to make room for MobileDraftTabBar.jsx sitting
          underneath it — both track the same offset, so if one moves the
          other has to. lg:pb-0 because at lg+ every panel is in normal flow
          and nothing floats over this. */}
      {/* The two column rules reach CSS as custom properties so the
          breakpoint can pick between them — a `style` prop cannot carry a
          media query, and this is one grid with two shapes rather than two
          grids. min-w-max stays true at lg+ now too: it's what makes the
          grid actually claim its natural (floor-respecting) width instead
          of shrinking to fit the container, which is what forces this
          wrapper's own overflow-x-auto to engage instead of the columns
          quietly going back to 0. Dropping to lg:min-w-0 was the earlier,
          rejected shape — see the comment on colsWide above.

          grid-template-rows replaces the old auto-rows floor (see
          rowsTemplate above): the header row sizes to its own content and
          every round is exactly 50px, never a minimum a tall cell could
          push past. */}
      {/* bottomInset becomes real scroll room, not just a centring offset,
          and without it following quietly stops working half way down the
          board. On a phone the sheet covers 470px of a 686px board, so the
          visible band is about 217px — four and a half rounds — and the
          board's own scroll range is the same 217. Measured on a live
          14-round draft: the live pick tracks perfectly to round 7 and
          then pins at the bottom of the scroller with rounds 8 to 14
          permanently behind the sheet, because there is no further to
          scroll. Padding the grid by exactly what is covering it gives
          every round somewhere to go.

          Inline, so it overrides the class rather than adding to it — the
          `pb-[calc(...)]` beside it was sized for the flush tab bar that
          used to sit under this and is the smaller of the two whenever a
          sheet is present. Zero when no caller passes one, which is every
          board but the phone's. */}
      <div
        className="grid min-w-max pb-[calc(7rem+58px+env(safe-area-inset-bottom))] lg:pb-0 [grid-template-columns:var(--cols)] lg:[grid-template-columns:var(--cols-wide)] [grid-template-rows:var(--rows)] lg:[grid-template-rows:var(--rows-wide)]"
        style={{
          '--cols': cols, '--cols-wide': colsWide, '--rows': rowsTemplate, '--rows-wide': rowsWide,
          ...(bottomInset ? { paddingBottom: bottomInset } : null),
        }}
      >
        {/* header row */}
        <div className="sticky left-0 top-0 z-20 flex items-center justify-center border-b border-r border-slate-rule bg-slate-panel/95 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          Rd
        </div>
        {/* A real <button> only while there's somewhere for the click to
            go — DraftRoom passes onTeamClick once the draft is over, when
            every team has a full Insights report to open. Before that the
            header is the same inert label it always was, per the
            dead-control rule: nothing may look pressable and do nothing. */}
        {/* Before a draft, a column header is a chair rather than a label.
            Claiming one is how you pick where you sit - the same gesture in a
            room and on your own, because a seat is a seat. `seats` comes
            from the room when there is one; off-room the only owned seat is
            yours. */}
        {onClaimSeat ? Array.from({ length: teams }, (_, s) => {
          /* Occupancy is `taken`, never the name. A manager who has not typed
             one still occupies the chair, and reading the name instead drew
             their seat as free - so the lobby invited a guest to click a chair
             somebody was already sitting in, and the room refused with nothing
             on screen to explain it. The room already sends both facts
             separately; this was throwing one of them away.

             `you` comes from the room too rather than being derived from
             mySlot, because the room is the thing that decides where you sit. */
          const chair = seats ? seats[s] : null
          const mine = chair ? !!chair.you : s === mySlot
          const taken = chair ? !!chair.taken && !chair.you : false
          const who = chair && chair.name ? chair.name : null
          return (
            <div
              key={'hd-' + s}
              className="sticky top-0 z-10 flex flex-col items-center gap-1 border-b border-r border-slate-rule bg-slate-panel/95 px-1 py-1.5"
            >
              <button
                type="button"
                onClick={() => onClaimSeat(s)}
                disabled={taken}
                title={mine ? 'This is your seat' : taken ? (who || 'Another manager') + ' has this seat' : 'Take seat ' + (s + 1)}
                className={
                  'w-full truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors duration-150 ' +
                  (mine
                    ? 'bg-teal-500 text-obsidian'
                    : taken
                      ? 'cursor-not-allowed bg-white/5 text-white/30'
                      : 'bg-white/10 text-white/60 hover:bg-teal-500/20 hover:text-teal-300')
                }
              >
                {mine ? 'You' : taken ? 'Taken' : 'Claim'}
              </button>
              {/* `mine`, not another call to teamLabelOf(s) — that asks
                  engine.teamLabel(), which compares against the *committed*
                  state.mySlot and only updates once startDraft() actually
                  runs. Before that, mySlot here is the lobby's own live
                  selection (lobbySlot in DraftRoom.jsx), so the button above
                  already reads the right seat — the label was the one still
                  asking the stale source, which is why it stuck to whichever
                  seat was mine before you clicked a different chair. */}
              <span
                className="w-full truncate text-center text-[11px] font-semibold text-white/50"
                title={who || (mine ? 'Your Team' : teamLabelOf(s))}
              >
                {who || (mine ? 'Your Team' : teamLabelOf(s))}
              </span>
            </div>
          )
        }) : Array.from({ length: teams }, (_, s) => {
          /* The Juke mark, not the team's initials, and the palette
             handoff is explicit about it: same slot, same centring, a
             15px-tall gradient mark at lg+ and 13px below it.

             It is worth being honest that this trades information away.
             A "BM" chip said something about *this* column that the mark
             cannot — the mark is identical in all ten. What it buys is
             that the header stops being a row of coloured monograms
             competing with the six-hue quilt directly under it, and the
             team name (which was always the fact the chip was standing in
             for) becomes the only thing in the header saying who this is.
             A name truncated at two lines still says more than two
             letters ever did.

             A plain <img>, not JukeLogo.jsx: the handoff asks for the
             gradient body with no colour overrides, which is precisely
             what that component's `mono`/silhouette machinery exists to
             take away, and it swaps itself to a silhouette below 28px —
             a width every one of these lands under. Sourced from
             /juke-shark-mark.svg, which is design package 02's own mark and
             is ground-independent — the -void variant this used to name was
             a cut-out baked for #070A0D, and there is no longer a per-ground
             file to pick between (see JukeLogo.jsx).
             aria-hidden because the name beside it already identifies the
             column; the mark here is a badge, not a label. */
          const isMine = s === mySlot
          const onClockHere = !!onClock && onClock.slot === s
          const label = isMine ? 'YOU' : teamLabelOf(s)
          const content = (
            <>
              <img
                src="/juke-shark-mark.svg"
                alt=""
                aria-hidden="true"
                className="h-[13px] w-auto shrink-0 lg:h-[15px]"
              />
              {/* Two lines below lg, one with an ellipsis above it. A
                  120px column cannot hold "Bone-Thugs-N-Montgomery" on one
                  line at any size worth reading, and the room's team names
                  are most of its personality — so the phone spends a second
                  9.5px line on them rather than a smaller single line.
                  overflow-wrap:anywhere is what lets a long unbroken run
                  like that one split at all; line-clamp caps it at two and
                  ellipsises the rest. Desktop keeps the single truncated
                  line its wider columns can afford.

                  #66F0FF (teal-300) for your own seat, where this used to
                  be gold — the second half of the seat bracket, and the
                  half that survives a column being scrolled past its own
                  rails. Measured 11.81:1 on the header's own bar ground. */}
              <span
                className={
                  'w-full text-center text-[10px] font-semibold leading-[1.15] [overflow-wrap:anywhere] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] overflow-hidden ' +
                  'lg:block lg:truncate lg:text-[11px] lg:leading-normal ' +
                  (isMine ? 'text-teal-300' : 'text-white/60')
                }
              >
                {label}
              </span>
              {/* Live state, and only live state: the pill says you are on
                  the clock *now*, so it comes and goes while the brackets
                  and the cyan name stay put. Two different questions —
                  "which column is mine" is permanent, "is it my turn" is
                  not — and giving the permanent one a badge that blinks
                  is how a reader stops trusting either.

                  lg+ only. It does not fit a 108px phone column, and it
                  does not need to: DraftCockpitHeader already carries the
                  full on-the-clock state beside the countdown, which is
                  where a phone reader is looking anyway. Below lg the
                  column gets a 6px cyan dot instead — present/absent is
                  the whole of what the pill communicates at that size, and
                  a dot can say it in the space there is. #06222A on the
                  pill measures 10.75:1. */}
              {onClockHere && isMine && (
                <>
                  <span
                    className="font-plex hidden shrink-0 rounded-full px-[7px] py-[2px] text-[8px] font-semibold uppercase tracking-[0.1em] leading-[1.4] lg:inline-block"
                    style={{ backgroundColor: '#00E5FF', color: '#06222A' }}
                  >
                    On the clock
                  </span>
                  {/* The dot carries the label rather than an sr-only
                      sibling: whichever of the two is hidden is
                      display:none, and a display:none element is not
                      announced — so exactly one of them speaks at any
                      width, and a third always-present copy would make the
                      desktop header say it twice. */}
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500 lg:hidden"
                    role="img"
                    aria-label="On the clock"
                  />
                </>
              )}
            </>
          )
          /* The bracket starts here, not at round 1. A rail that begins
             under the header reads as a marked *block of picks*; one that
             starts at the header reads as a marked *column*, which is the
             thing being marked. The handoff says "header row included" for
             the same reason. */
          const headCls =
            'sticky top-0 z-10 flex flex-col items-center justify-center gap-1 border-b border-r border-slate-rule bg-slate-panel/95 px-1.5 py-1.5 ' +
            (isMine ? SEAT_BRACKET : '')
          return onTeamClick ? (
            <button
              key={'hd-' + s}
              type="button"
              onClick={() => onTeamClick(s)}
              className={headCls + ' transition-colors duration-150 hover:bg-teal-500/10'}
              title={'View ' + teamLabelOf(s) + "'s draft insights"}
            >
              {content}
            </button>
          ) : (
            <div
              key={'hd-' + s}
              className={headCls}
              title={teamLabelOf(s)}
            >
              {content}
            </div>
          )
        })}

        {Array.from({ length: rounds }, (_, ri) => {
          const round = ri + 1
          return (
            <div key={'row-' + round} className="contents">
              <div className="sticky left-0 z-10 flex items-center justify-center border-b border-r border-slate-rule bg-slate-panel/95 text-xs font-semibold text-ink-muted">
                {round}
              </div>
              {Array.from({ length: teams }, (_, s) => {
                const pick = byCell.get(round + '-' + s)
                const isCurrent = !!onClock && onClock.round === round && onClock.slot === s
                const isMine = s === mySlot
                const overall = DE ? DE.overallOf(round, s, league) : null
                // The label for a pick that has landed. Always via
                // DraftEngine.pickCode() — the snake mirror lives there and
                // nowhere else (CLAUDE.md: a pick number is not a seat
                // number, and half the board agrees with the wrong answer).
                const code = pick && DE ? DE.pickCode(pick.overall, league) : null
                const arrow = boardArrow(DE, round, s, league)
                return (
                  <div
                    key={round + '-' + s}
                    /* p-[3px], not p-0.5: the handoff's own 3px card
                       margin, and it is what the seat bracket needs to
                       read as a rail beside the card rather than a border
                       on it. border-slate-rule/70 stays in the class list
                       whatever else this cell carries — it is how both
                       board specs find a real cell. */
                    /* The crosshair centres on this element, so the ref
                       goes on the grid cell rather than on the card inside
                       it — centreOnLive() differences two rects and the
                       cell is the box the board's own geometry is built
                       from. */
                    ref={isCurrent ? liveCellRef : undefined}
                    className={'h-[46px] lg:h-[50px] box-border border-b border-r border-slate-rule/70 p-[3px] ' + (isMine ? SEAT_BRACKET : '')}
                    /* The hit area is the whole grid cell, not the card
                       inside it. The 3px margin that makes the seat
                       bracket read as a rail also takes the card to 39px
                       tall on a phone, which is under the 44px a thumb
                       wants — and the gutter it opens up is dead space
                       sitting directly between two tappable things. On
                       the wrapper the target is the full 46px and the
                       gutters belong to whichever cell they sit inside.
                       Only when there is a pick to open: an empty cell
                       stays inert rather than becoming a control that
                       looks identical and does nothing. */
                    onClick={pick && onSelectPlayer ? () => onSelectPlayer(pick.player) : undefined}
                  >
                    {pick ? (
                      // layoutId matches the same player's row in
                      // PlayerQueueSidebar.jsx — while both are mounted
                      // (the instant a real pick lands: the sidebar row
                      // exiting, this cell appearing), Framer Motion
                      // computes the shared FLIP transition between them
                      // on its own, so the card visibly moves from the
                      // queue into its cell rather than just popping in.
                      //
                      /* A matte pastel chalk card with dark ink on it, and
                         a 5px saturated rail down its left edge. This is
                         the fourth answer this cell has had and the first
                         that inverts it — the three before were all dark
                         surfaces arguing about how much hue to let through
                         (a full-saturation block, a bare 3px rail on
                         charcoal, then that rail over a 14% wash of its own
                         colour). draftRoomPositions.js carries the full
                         record beside POS_CHALK.

                         What changes with the inversion is that the rail
                         finally works. Two earlier looks called a rail
                         "nearly invisible at working zoom" and both were
                         right about the ground they measured it on: a
                         saturated rule against near-black is a rule against
                         near-black. The same rule against a pastel of its
                         own hue is a real edge — and it now has a second
                         job, telling two chalk fills apart at a glance when
                         the fills themselves are deliberately close in
                         value.

                         Inline style rather than utility classes for the
                         usual reason: POS_CHALK/POS_RAIL are hex maps, and a
                         class built by interpolating a hex never appears as
                         a whole token for Tailwind's JIT to find, so it
                         compiles to nothing, silently. The 1px
                         rgba(0,0,0,0.05) border is the handoff's own — not
                         a visible edge, but what stops a light card on a
                         dark ground from looking like it is glowing at its
                         corners.

                         An unknown position falls back to a neutral light
                         card rather than to no card at all: the map is
                         complete for every position the board can draft, but
                         a cell rendering as bare dark ground would read as
                         an empty pick, which is a lie. */
                      <motion.div
                        layoutId={'player-' + (pick.player.id || pick.player.name)}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        style={{
                          backgroundColor: POS_CHALK[pick.player.pos] || '#C2CCD7',
                          border: '1px solid rgba(0,0,0,0.05)',
                          color: CELL_INK,
                        }}
                        // h-full alone is enough now: the row itself is a
                        // fixed 50px (rowsTemplate above) rather than a
                        // minmax floor, so every card fills the identical
                        // track regardless of its own content — there is no
                        // longer a shorter round for the grid to shrink
                        // toward (the legacy board's "two row heights" bug).
                        // box-border restates border-box explicitly (Tailwind
                        // Preflight already sets it globally) because an
                        // explicit height and this card's own padding are
                        // exactly where content-box and border-box disagree.
                        // overflow-hidden is what keeps the rail inside the
                        // rounded corner rather than squaring it off.
                        className="relative flex h-full box-border cursor-pointer flex-col justify-center gap-[3px] overflow-hidden rounded-lg py-[6px] pl-[10px] pr-[7px] lg:rounded-[7px] lg:py-[7px] lg:pl-[12px] lg:pr-[9px]"
                      >
                        {/* The rail. Absolutely positioned and full height
                            rather than a border-left, because a border is
                            inside the box and would eat its width out of the
                            padding the text is measured against — and
                            because the left padding above (12px desktop,
                            10px mobile) is deliberately wider than the rail,
                            so the name clears it rather than sitting on it.
                            4px below lg, 5px at lg+: the handoff's own pair,
                            and the same reasoning as the seat bracket's 2/1
                            — a phone needs more physical width to read the
                            same mark. */}
                        <span
                          aria-hidden="true"
                          className="absolute bottom-0 left-0 top-0 w-[4px] lg:w-[5px]"
                          style={{ backgroundColor: POS_RAIL[pick.player.pos] || '#4E6377' }}
                        />
                        {/* Line 1 — name, then the pick code. */}
                        <div className="flex items-center justify-between gap-1 leading-none">
                          {/* "J. Gibbs", not "Jahmyr Gibbs". A full name in
                              a ~132px column truncated 133 of 140 times.
                              shortName() is the engine's own function, the
                              same one the hero shot uses and for the same
                              reason: an initial plus a surname reads as a
                              person where a surname alone reads as a row in
                              a table. Never re-derived here. */}
                          {/* 12px/600 below lg against desktop's 13px/700 —
                              the handoff's own pair. The mobile step down is
                              what makes a 108px column hold the names it was
                              sized for: at 13px, five of twenty-five real
                              cards ellipsised, "J. Smith-Njigba" among them,
                              which is the exact name that width was measured
                              against. */}
                          <p className="min-w-0 truncate text-[12px] font-semibold lg:text-meta lg:font-bold" title={pick.player.name}>
                            {shortNameOf ? shortNameOf(pick.player) : pick.player.name}
                          </p>
                          {/* data-pick-code, not the font class it happens to
                              carry. board-card.spec.mjs used to find these by
                              `span.font-plex`, on the strength of a comment
                              saying that class named nothing else on a card —
                              true until the position abbreviation on the line
                              below became mono too, which doubled the count
                              and reported 86 codes against 43 picks. An
                              attribute says what an element IS. */}
                          {code && (
                            <span data-pick-code className="shrink-0 font-plex text-[10px]" style={{ color: CELL_SUB }}>
                              {code}
                            </span>
                          )}
                        </div>
                        {/* Line 2 — POS · TEAM, and the snake arrow on the
                            far side. The position used to be a coloured badge
                            chip here; it is plain mono text now because the
                            cell itself is the position, at full card size,
                            and a second coloured chip saying the same thing
                            inside it is exactly the redundancy the fill was
                            adopted to remove. What the letters still do is
                            name the colour for anybody who cannot separate
                            two pastels — which is why they stay rather than
                            going the way of the badge entirely.

                            The ADP delta used to sit on the right of this
                            line. The arrow has it now. */}
                        <div className="flex items-center justify-between gap-1 leading-none" style={{ color: CELL_SUB }}>
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="truncate font-plex text-[10px] tracking-[0.06em]">
                              {pick.player.pos} · {pick.player.team}
                            </span>
                            {/* A dot, not a chip — the cell has no room for a
                                labelled badge on top of everything else here,
                                but "hurt" is worth a glance even at this
                                size. Full status is one click away on the
                                profile.

                                INJURY_META's `chalk` value, never its `dot`
                                class: `dot` is a -400 step drawn for a dark
                                cell and measures 1.55:1 on QB's own fill —
                                the same hue family, which is precisely where
                                it would vanish. */}
                            {INJURY_META[pick.player.inj] && (
                              <span
                                className="h-[5px] w-[5px] shrink-0 rounded-full"
                                style={{ backgroundColor: INJURY_META[pick.player.inj].chalk }}
                                title={INJURY_META[pick.player.inj].label}
                              />
                            )}
                          </span>
                          {/* 16px/700 at lg+, 14px below — the handoff's own
                              sizes, and far bigger than the 9px this used to
                              be, because the arrow is now the whole of what
                              the right of this line says rather than one of
                              two things sharing it.

                              Three directions, not the handoff's two. Its
                              rule is `round % 2` — odd rounds point right,
                              even rounds left — which is correct for every
                              cell but one per round, and the one it misses is
                              the turn itself. The end-of-round pick is where
                              the order stops and comes back, it is why the
                              ends of the room pick twice in a row, and
                              CLAUDE.md records the down arrow as the one
                              thing on the board the pick numbers do not say
                              on sight. boardArrow() keeps deriving it from
                              DraftEngine.pickInRound(), the one place the
                              snake mirror is allowed to live; the parity the
                              handoff asks for falls out of that for every
                              cell it describes. */}
                          <Arrow dir={arrow} className="shrink-0 text-[14px] font-bold lg:text-[16px]" />
                        </div>
                      </motion.div>
                    ) : isCurrent ? (
                      <motion.div
                        animate={{ opacity: [1, 0.75, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                        className="relative flex h-full box-border items-center justify-center rounded-lg border-2 border-teal-400 lg:rounded-[7px] bg-teal-500/20 text-[10px] font-bold uppercase tracking-wide text-teal-300"
                      >
                        {overall != null && (
                          <span className="absolute left-1 top-0.5 text-[10px] font-normal normal-case text-teal-300">{overall}</span>
                        )}
                        On the clock
                        <Arrow dir={arrow} className="absolute right-1 top-0.5 text-[9px] font-normal normal-case text-teal-300" />
                      </motion.div>
                    ) : (
                      <div className="relative h-full box-border rounded-lg border border-dashed border-slate-rule lg:rounded-[7px]">
                        {/* One value for one element. Gold measured fine
                            here (13.4:1 on near-black; the "gold never
                            paints type" rule is about light surfaces) but it
                            was saying a second time what the column's own
                            gold outline already says, in the one place a
                            reader is trying to read a number.

                            The value itself was #7C8A99 and had to move when
                            the board's ground did — this is the case that
                            proves a number tuned against near-black does not
                            survive the trip to slate. Measured: #7C8A99 is
                            5.48:1 on obsidian and 4.27:1 on #1E2733, which is
                            under the bar at 10px, and this number is the sole
                            content of its cell so it cannot be the dimmest
                            thing on screen. Nothing about the colour was
                            wrong; the ground under it moved.

                            It is `ink-soft` now rather than a third hardcoded
                            hex, and one step brighter than the `ink-muted`
                            the mobile tab bar's inactive label takes — which
                            is not an inconsistency, it is the ground. This
                            cell can carry the gold identity wash, and a wash
                            lightens what is under the type: measured, the
                            same `ink-muted` reads 5.28:1 on a bare cell, 4.48
                            on a gold one and 3.94 where a value tint sits
                            under the gold too. `ink-soft` clears 4.5 on all
                            three. `ink-muted` is safe on a plain ground and
                            not on a washed one, which is the rule to carry
                            forward rather than either number. */}
                        {overall != null && (
                          <span className="absolute left-1 top-0.5 text-[10px] text-ink-soft">
                            {overall}
                          </span>
                        )}
                        {/* white/40, not /20: the arrow is a mark and answers to
                            3:1, and at /20 it measured 1.91 on the sunk cell --
                            140 of them, one per empty cell, the snake drawn in
                            a tone nobody could read. The live cell's own corner
                            marks above take full teal-300 for the same reason:
                            the cell pulses to 0.75 and /75 on top of that
                            pulse dipped under 4.5 on every other frame. */}
                        <Arrow dir={arrow} className="absolute right-1 top-0.5 text-[9px] text-white/40" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      </div>

      {/* right-[14px] bottom-[12px], matching the handoff exactly — this
          sits over the board's own scroll container, not the dock, so it
          stays reachable however tall the dock currently is. Each end
          disables and dims rather than disappearing, which is what tells a
          reader the range has an end at all (CLAUDE.md's own two-button
          precedent for this exact control, one per direction rather than a
          single button that wraps around). */}
      {trayPos && (onTrayUp || onTrayDown) && (
        <div className="absolute bottom-3 right-3.5 z-40 hidden flex-col gap-1 lg:flex">
          <RaiseLowerButton
            onClick={onTrayUp}
            disabled={trayPos === 'raised'}
            title={trayPos === 'raised' ? 'The pool is already raised' : 'Raise the pool'}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </RaiseLowerButton>
          <RaiseLowerButton
            onClick={onTrayDown}
            disabled={trayPos === 'hidden'}
            title={trayPos === 'hidden' ? 'The pool is already closed' : 'Lower the pool'}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </RaiseLowerButton>
        </div>
      )}
    </div>
  )
}
