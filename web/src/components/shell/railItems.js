import { useEffect, useState } from 'react'
import { useRooms } from '../../hooks/useRooms.js'

/* The rail's one list of destinations — desktop RailNav and the mobile
   MoreSheet both read this rather than each keeping its own idea of what
   the rail contains, the same rule useRooms() itself already follows one
   layer down for the room list this wraps.

   Three groups, joined with a divider marker rather than kept as three
   separate arrays passed around: My League is not a room — Juke Journey
   v3's own rail puts it above the five, not among them — and History
   currently points at the mock-draft archive (#/drafts). That is not the
   cross-room decision ledger the design describes; there is no data source
   for one yet (no room writes a graded decision anywhere), and a rail item
   promising it would be the dead-control failure this project keeps
   finding. #/drafts is real and working, so it is the honest answer today. */
export function useRailItems() {
  const rooms = useRooms()

  const roomItems = rooms.map((r) => ({
    key: r.slug,
    label: r.name.replace(/^The /, '').replace(/ Room$/, ''),
    glyph: r.glyph,
    accent: r.accent,
    href: r.href || `#/rooms/${r.slug}`,
  }))

  return [
    { key: 'my-league', label: 'My League', glyph: '🏟', accent: '#F7D9A8', href: '#/my-league' },
    { divider: true },
    ...roomItems,
    { divider: true },
    { key: 'history', label: 'History', glyph: '🗓', accent: '#00E5FF', href: '#/drafts' },
  ]
}

/* Which rail key the current hash lights, or null before the first tick.
   A room slug for any #/rooms/<slug>, 'my-league' and 'history' for their
   own routes, null for everything else (the homepage, #/you) — the rail
   has no item for those and lighting none of them is correct. */
function activeFromHash(hash) {
  if (hash.startsWith('#/my-league')) return 'my-league'
  if (hash.startsWith('#/rooms/')) return hash.slice('#/rooms/'.length).split(/[/?]/)[0]
  if (hash.startsWith('#/drafts')) return 'history'
  return null
}

/* Starts null on both sides of the hydration boundary, for the identical
   reason useHashRoute()'s own route state and FloatingNavPill's `active`
   do — seeding from location.hash in the initializer is what makes a
   prerendered pass and the client's first pass disagree, not what
   prevents it. */
export function useActiveRailKey() {
  const [key, setKey] = useState(null)

  useEffect(() => {
    const read = () => setKey(activeFromHash(location.hash))
    window.addEventListener('hashchange', read)
    read()
    return () => window.removeEventListener('hashchange', read)
  }, [])

  return key
}
