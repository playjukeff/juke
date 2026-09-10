import { motion } from 'framer-motion'
import { NavIcon } from '../roomIcons.jsx'
import { useRailItems, useActiveRailKey } from '../shell/railItems.js'
import { stakeLabel } from '../shell/roomStakes.js'
import { useRoomStakes } from '../../hooks/useRoomStakes.js'

/* The mobile overflow sheet — everything the desktop rail shows that does
   not fit in the four-tab pill (Home / My League / More / You). Same
   backdrop and slide-up motion as FloatingNavPill's own YouSheet, because
   the two are the same kind of control (a full-screen action sheet opened
   from the bottom nav) and a second, differently-tuned transition here
   would read as a different app for one tap.

   A link list rather than YouSheet's buttons, but each row still closes
   itself explicitly on click. This used to assume the hash change alone
   would unmount everything FloatingNavPill renders — true only when the
   destination is a different top-level view. Two rows here point at
   #/rooms/<slug>, and RoomPage.jsx's own comment says why that assumption
   fails for them: "this component does not unmount between" two room
   slugs, precisely so its hooks stay stable — so AppShell, FloatingNavPill
   and this sheet all survive a Waiver-to-Trade tap unchanged, and the
   sheet was left stuck open over the new room. onClose() on every row
   fixes it without depending on which transitions happen to remount and
   which don't, the same way YouSheet's own action rows already close
   themselves rather than trusting a side effect of what they do next.

   ---- Screen 20: what each room has at stake, on the row that opens it ----

   The decision guide asks this list to carry a per-room stake, and
   CLAUDE.md filed it under the screens the data cannot answer -- "no room
   writes one". Re-measured: two of the six DO, and have since their own
   boards were written. `rosterGaps()` is what the Waiver Room's own KPI
   sums into PTS OPEN and `bestSwaps()` is what the Strategy Room ranks its
   lineup on; nothing had ever asked either from outside a room.

   `roomStakes.js` is the shared source and `useRoomStakes()` the hook, and
   the reason the hook is called HERE rather than in `useRailItems()` is
   written at the top of it: a stake is a fact about rosters, so it costs an
   upstream call, and this sheet is mounted by a tap where the desktop rail
   is on screen at every width above `lg` on every route.

   **The four rooms that cannot answer draw nothing at all**, rather than a
   zero. A tile reading "+0" claims the room was asked and had nothing to
   say; Trade needs a partner chosen before `tradeSwing()` means anything,
   League is standings, and Prospect and Draft are not weekly. */
export default function MoreSheet({ onClose }) {
  const items = useRailItems()
  const active = useActiveRailKey()
  const stakes = useRoomStakes()

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/65 backdrop-blur-[2px] lg:hidden"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        className="mx-2 flex flex-col gap-2"
        style={{ marginBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-[18px] border border-line-hairline bg-surface-card">
          <div className="border-b border-line-hairline px-4 py-3">
            <span className="font-mono text-[11px] tracking-[0.14em] text-voidInk-muted">
              ALL ROOMS
            </span>
          </div>
          {items
            // My League already fits in the pill — it is the second tab,
            // by design (FloatingNavPill.jsx: "it earns a tap of its own
            // rather than living behind More") — so it is the one entry
            // in this shared list that does NOT belong in "everything
            // that does not fit". Left in, it was a real duplicate
            // rather than a redundant label: two controls on the same
            // screen going to the same place, one always visible and one
            // a tap away inside the other.
            .filter((item) => !item.divider && item.key !== 'my-league')
            .map((item) => {
              const on = active === item.key
              /* The unit is in the words -- "+8.4 this week" against "+31 on
                 the wire" -- because the two stakes are in DIFFERENT units
                 and a row printing both as "pts" would be the
                 right-value-wrong-column failure this project has shipped
                 once already in a standings table. `stakeLabel()` is the one
                 phrasing, so this row and the rooms grid cannot describe the
                 same number two ways. */
              const stake = stakeLabel(stakes[item.key])
              return (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={onClose}
                  aria-current={on ? 'page' : undefined}
                  className={
                    'flex w-full items-center gap-3 border-b border-line-hairline px-4 py-3.5 text-left text-[16px] font-semibold last:border-b-0 transition-colors active:bg-white/[0.05] ' +
                    (on ? 'text-mint' : 'text-voidInk-primary')
                  }
                >
                  <span
                    className={
                      'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[16px] ' +
                      (on ? 'bg-flow-mintDark text-mint' : 'bg-flow-tile text-ink-muted')
                    }
                    aria-hidden="true"
                  >
                    <NavIcon item={item} size={18} />
                  </span>
                  {item.label}
                  {/* P1. `cost` is the value colour, never teal -- the
                      magnitude is what a claim or a swap would gain and the
                      cost is that it has not been made, which is the sign
                      WaiverRoomLive's own stake card already prints it
                      under. */}
                  {stake ? (
                    <span className="ml-auto shrink-0 font-plex text-meta font-semibold tabular-nums text-cost">
                      {stake}
                    </span>
                  ) : null}
                </a>
              )
            })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-[18px] border border-line-hairline bg-surface-nav px-5 py-4 text-center text-[16px] font-bold text-white active:bg-white/[0.05]"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  )
}
