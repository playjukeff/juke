import { useRailItems, useActiveRailKey } from './railItems.js'

/* The desktop room switcher — Juke Journey v3's rail, replacing
   ShellHeader's old three-tab row above `lg`. AppShell renders this beside
   the header+content column rather than ShellHeader rendering it, because
   the rail spans the full viewport height and the header does not.

   Active state is mint, the same treatment FloatingNavPill already gives
   an active tab (a filled lozenge behind the glyph, mint label) — not each
   room's own accent, which is the room-CARD convention (RoomsGridAlive)
   and answers a different question. One flat "this is where you are" mark
   reads faster in a list than five different hues would.

   No dot indicator for "a room needs action" — the handoff draws one and
   there is nothing behind it yet: no room writes anything this could read
   to know it needs attention. It comes back the day one does. */
export default function RailNav() {
  const items = useRailItems()
  const active = useActiveRailKey()

  return (
    <aside className="hidden shrink-0 border-r border-line-hairline bg-surface-nav lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[84px] lg:flex-col lg:items-center lg:gap-1 lg:overflow-y-auto lg:py-4">
      {items.map((item, i) => {
        if (item.divider) {
          return <span key={'div' + i} aria-hidden="true" className="my-2 h-px w-8 shrink-0 bg-line-hairline" />
        }
        const on = active === item.key
        return (
          <a
            key={item.key}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className="flex w-[64px] shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center"
          >
            <span
              className={
                'grid h-10 w-10 place-items-center rounded-xl text-[18px] transition-colors duration-150 ' +
                (on ? 'bg-flow-mintDark text-mint' : 'bg-flow-tile text-ink-muted')
              }
              aria-hidden="true"
            >
              {item.glyph}
            </span>
            <span className={'text-[10px] font-semibold leading-tight ' + (on ? 'text-mint' : 'text-ink-muted')}>
              {item.label}
            </span>
          </a>
        )
      })}
    </aside>
  )
}
