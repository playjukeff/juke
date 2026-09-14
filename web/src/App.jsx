import V2App from './components/v2/V2App.jsx'
import V3App from './components/v3/V3App.jsx'
import { useHashRoute } from './hooks/useHashRoute.js'

/* The one tree #root renders, and the only place the two apps React owns
   are chosen between.

   v3 is the site. Its own route table (V3App.jsx) decides what each address
   inside it draws, so there is exactly one line here per app rather than one
   per screen — and every address the site used to answer to has already been
   rewritten to a v3 one by app.js's canonicalHash() before this renders.

   v2 stays reachable at #/v2 as the comparison record. It costs one branch
   and it is the only way to look at what was proposed beside what shipped.

   `v3` with no sub-path is the default AND the unresolved state, which is
   what keeps the prerender honest: scripts/prerender.mjs renders this with
   no window, useHashRoute() answers that there, and the client's hydration
   pass answers it too — so the markup matches and the real route lands one
   tick later. Anything that reads location during render puts React #418
   back. */
export default function App() {
  const { view, slug } = useHashRoute()

  if (view === 'v2') return <V2App sub={slug} />
  return <V3App sub={slug} />
}
