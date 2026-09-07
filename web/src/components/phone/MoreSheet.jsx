import { motion } from 'framer-motion'
import { useRailItems, useActiveRailKey } from '../shell/railItems.js'

/* The mobile overflow sheet — everything the desktop rail shows that does
   not fit in the four-tab pill (Home / My League / More / You). Same
   backdrop and slide-up motion as FloatingNavPill's own YouSheet, because
   the two are the same kind of control (a full-screen action sheet opened
   from the bottom nav) and a second, differently-tuned transition here
   would read as a different app for one tap.

   A link list rather than YouSheet's buttons: every row here goes
   somewhere, nothing here performs an action, so `<a href>` is the honest
   element and needs no onClick to close itself — the hash change unmounts
   this component along with everything else FloatingNavPill renders for
   the old route. */
export default function MoreSheet({ onClose }) {
  const items = useRailItems()
  const active = useActiveRailKey()

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/65 backdrop-blur-[2px] sm:hidden"
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
            .filter((item) => !item.divider)
            .map((item) => {
              const on = active === item.key
              return (
                <a
                  key={item.key}
                  href={item.href}
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
                    {item.glyph}
                  </span>
                  {item.label}
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
