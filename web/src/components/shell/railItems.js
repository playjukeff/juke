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
    /* #/history, not #/drafts.

       This pointed at the mock-draft archive for as long as there was
       no ledger to point at -- the phase 1 plan recorded that as a
       deliberate stand-in, because Juke Journey v3's History is the
       cross-room decision record and nothing wrote one. Something does
       now, so the rail names the thing it always meant.

       #/drafts is not orphaned by this: it is still the archive, still
       linked from the Draft Room's entry ('See all N drafts'), and
       still where a finished mock is read back. Two screens, two
       questions -- 'drafts I have run' and 'calls Juke made on my real
       roster'. */
    { key: 'history', label: 'History', glyph: '🗓', accent: '#00E5FF', href: '#/history' },
    /* You, because above 1024px there was no way to reach it at all.

       The phone pill has carried a You tab since it stopped being an
       action sheet; the rail never gained the matching item, and
       ShellHeader renders Log in / Sign up signed out and Clerk's own
       UserButton signed in -- whose menu offers Manage account and Sign
       out and nothing of Juke's. So #/you was reachable on a phone and
       reachable by typing the URL, and by nothing else on a desktop, at
       any auth state.

       That screen holds the connected-league list and the product's ONLY
       disconnect control. This project's fifth principle is that a
       control which cannot act must not be offered; a screen nobody can
       reach is the same failure with the whole surface inside it. */
    { key: 'you', label: 'You', glyph: '👤', accent: '#8A9BAA', href: '#/you' },
  ]
}

/* Which rail key the current hash lights, or null before the first tick.
   A room slug for any #/rooms/<slug>, and 'my-league' / 'history' / 'you'
   for their own routes. Null for everything else (the homepage) — the rail
   has no item for those and lighting none of them is correct. */
function activeFromHash(hash) {
  if (hash.startsWith('#/my-league')) return 'my-league'
  if (hash.startsWith('#/rooms/')) return hash.slice('#/rooms/'.length).split(/[/?]/)[0]
  if (hash.startsWith('#/history')) return 'history'
  if (hash.startsWith('#/you')) return 'you'
  /* The archive keeps lighting the same lamp. It is the rail's nearest
     item and the only one it could light -- an unlit rail on a screen
     the rail can reach reads as the nav having lost its place. */
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
