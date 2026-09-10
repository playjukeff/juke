import { useEffect, useState } from 'react'

/* Which screen the hash names, for the routes React owns inside #view-home.

   This is not a second router. app.js's applyRoute() is still the only
   thing that decides which of the page's top-level views is visible, and
   #root lives inside #view-home — which applyRoute() shows for everything
   except #/draft-room and #/drafts. So every route here is one that leaves
   #view-home up, and this hook only chooses what App renders inside it.

   ---- Why it starts null on both sides ----

   Same reason FloatingNavPill's `active` does, and it is the identical bug
   if it is written the obvious way. Seeding from location.hash in the
   initializer — even guarded with `typeof window === 'undefined'` — is what
   MAKES the two sides disagree: the prerender has no window and renders the
   home tree, the client's first pass reads a real hash and renders the
   rooms tree, and React fails hydration for the whole root. Null on the
   first pass matches the server exactly; the effect lands the real route
   one tick later.

   `null` therefore means "not resolved yet", and App treats it as home —
   which is what the prerender writes, so the two agree by construction.

   ---- The bare-anchor case ----

   `#rooms` (a scroll anchor on the homepage) and `#/rooms` (this route) are
   one character apart and mean different things. Anything not starting with
   `#/` is an anchor, never a route — the same test app.js's own hashchange
   guard already uses — so it resolves to home and the browser's native
   scroll-to-anchor is left alone. */

export function parseHashRoute(hash) {
  if (!hash.startsWith('#/')) return { view: 'home', slug: null }
  const path = hash.slice(2).split('?')[0].replace(/\/+$/, '')
  if (path === 'rooms') return { view: 'rooms', slug: null }
  if (path.startsWith('rooms/')) return { view: 'room', slug: path.slice('rooms/'.length) }
  if (path === 'my-league') return { view: 'my-league', slug: null }
  if (path === 'you') return { view: 'you', slug: null }
  if (path === 'drafts') return { view: 'drafts', slug: null }
  if (path === 'history') return { view: 'history', slug: null }
  // The v2 comparison build. One view with its own sub-route rather than
  // three entries here, so the whole proposal is reachable from one prefix
  // and removable by deleting one line.
  if (path === 'v2' || path.startsWith('v2/')) return { view: 'v2', slug: path.slice(3) }
  // v3, the full-autonomy proposal. Same shape and the same reason.
  if (path === 'v3' || path.startsWith('v3/')) return { view: 'v3', slug: path.slice(3) }
  return { view: 'home', slug: null }
}

export function useHashRoute() {
  const [route, setRoute] = useState(null)

  useEffect(() => {
    const read = () => setRoute(parseHashRoute(location.hash))
    window.addEventListener('hashchange', read)
    read()
    return () => window.removeEventListener('hashchange', read)
  }, [])

  return route || { view: 'home', slug: null }
}
