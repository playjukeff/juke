import { useEffect, useState } from 'react'

/* Which app the hash names, and which page inside it.

   Two answers, not nine. v3 IS the site as of the cutover, so every address
   that is not v2's belongs to it and arrives as a sub-path V3App's own route
   table reads. There is no third branch and no list of production routes
   here, because there are no production routes any more — app.js's
   canonicalHash() rewrites every one of them to its v3 address before this
   hook ever sees a hash.

   ---- This is not a second router ----

   app.js's applyRoute() is still the only thing that decides which of the
   page's top-level containers is visible, and #root lives inside #view-home,
   which it now shows for everything. It is also the only place the
   old-address table lives: it runs in a parser-blocking classic script whose
   boot calls applyRoute() before this module executes, so the hash React
   reads is already canonical. Restating that table here to close a window
   that does not exist would be the same map in two files, drifting the first
   time either moved.

   ---- Why it starts null on both sides ----

   Same reason FloatingNavPill's `active` did, and it is the identical bug if
   it is written the obvious way. Seeding from location.hash in the
   initializer — even guarded with `typeof window === 'undefined'` — is what
   MAKES the two sides disagree: the prerender has no window and renders one
   tree, the client's first pass reads a real hash and renders another, and
   React fails hydration for the whole root. Null on the first pass matches
   the server exactly; the effect lands the real route one tick later.

   `null` therefore means "not resolved yet", and App treats it as v3 with no
   sub-path — Now, in its guest state, which is exactly what
   scripts/prerender.mjs writes. The two agree by construction.

   ---- The bare-anchor case ----

   A hash that does not start with `#/` is an in-page anchor, never a route —
   the same test app.js's own hashchange guard and canonicalHash() both use.
   It resolves to the default page and the browser's native scroll-to-anchor
   is left alone. */

export function parseHashRoute(hash) {
  if (!hash.startsWith('#/')) return { view: 'v3', slug: '' }
  const path = hash.slice(2).split('?')[0].replace(/\/+$/, '')
  // v2, the comparison record. One view with its own sub-route rather than
  // an entry per page, so the whole proposal is reachable from one prefix
  // and removable by deleting one line.
  if (path === 'v2' || path.startsWith('v2/')) return { view: 'v2', slug: path.slice(3) }
  return { view: 'v3', slug: path }
}

export function useHashRoute() {
  const [route, setRoute] = useState(null)

  useEffect(() => {
    const read = () => setRoute(parseHashRoute(location.hash))
    window.addEventListener('hashchange', read)
    read()
    return () => window.removeEventListener('hashchange', read)
  }, [])

  return route || { view: 'v3', slug: '' }
}
