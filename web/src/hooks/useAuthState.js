import { useEffect, useLayoutEffect, useState } from 'react'
import { CLERK_PUBLISHABLE_KEY } from '../clerkConfig.js'

// Chosen once, at module scope: a hook may not be picked inside a component.
const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect

/* Whether anybody is signed in, read through window.JukeAuth rather than
   through Clerk's own useAuth().

   Clerk's hook is the obvious choice and it is the wrong one HERE for a
   reason that is structural rather than stylistic: useAuth() throws
   without a <ClerkProvider> ancestor, and main.jsx deliberately renders
   the whole app with no provider at all when VITE_CLERK_PUBLISHABLE_KEY
   is unset — a fresh clone, CI, and the Playwright build are all in that
   branch. A hook cannot be called conditionally, so a component that
   wants this fact and also has to render in a keyless build cannot reach
   for useAuth() at all.

   window.JukeAuth is the bridge AuthBridge.jsx already writes for app.js,
   and "juke:auth" the event it already fires on every change to it. Both
   are simply absent in a keyless build, which reads here as signed out —
   which is exactly what it is. Same "answer no to a missing binding"
   contract store.js uses for D1 and the two proxied keys.

   Read once on attach as well as on the event, for the reason
   useJukeTick() already documents: AuthBridge's first write can land
   before this listener exists. */
export function useSignedIn() {
  const [signedIn, setSignedIn] = useState(
    () => typeof window !== 'undefined' && !!(window.JukeAuth && window.JukeAuth.isSignedIn)
  )
  useEffect(() => {
    const read = () => setSignedIn(!!(window.JukeAuth && window.JukeAuth.isSignedIn))
    window.addEventListener('juke:auth', read)
    read()
    return () => window.removeEventListener('juke:auth', read)
  }, [])
  return signedIn
}

/* Has the question been ANSWERED yet — which is not the same as whether the
   answer is yes, and conflating the two is what put the logged-out
   marketing hero in front of signed-in readers for two or three seconds
   before it was replaced by their dashboard.

   Three states have to collapse into this one boolean, and each of the two
   that are not "Clerk has answered" is a real deployment:

   - NO KEY AT ALL. A fresh clone, CI, and every Playwright build render
     with no <ClerkProvider> and no AuthBridge, so window.JukeAuth is never
     written and nothing is ever coming. Resolved immediately, and signed
     out is the truth rather than a placeholder — the same "answer no to a
     missing binding" contract useSignedIn() already keeps. Without this
     the whole suite would wait on a skeleton for ever.

   - A KEY, AND CLERK NEVER ANSWERS. A blocked script, a DNS failure on the
     Frontend API (this project has had exactly that: a pk_live_ key
     against an unverified domain made the sign-in control vanish
     entirely). A page that waits for ever is worse than one that decides,
     so there is a ceiling, after which signed out is what gets rendered.
     4000ms: long enough that a slow connection is not cut off — Clerk
     resolved well inside it on every load measured here — and short enough
     that nobody reads a skeleton as a hung page.

   Rendering uses a LAYOUT effect, so the answer is in hand before the
   browser paints: read after paint, a reader sees one frame of the
   pre-hydration markup first, which is the swap this exists to remove. */
export function useAuthResolved() {
  /* It starts TRUE, and that is a hydration decision rather than an
     optimistic one. scripts/prerender.mjs renders this page on a server
     with no session at all, so the markup it ships is the signed-out one;
     a first client pass that rendered a skeleton instead would not match
     it, and React's answer to a mismatch is to throw away the server
     markup for the WHOLE root and rebuild it — the prerender's entire
     purpose, lost, which this project has already shipped once (#418).

     So pass one is byte-identical to the server, and the flip to "not
     answered yet" happens in a LAYOUT effect: after hydration, before the
     browser paints. The reader never sees the frame; the markup still
     matches. */
  const [resolved, setResolved] = useState(true)
  useIso(() => {
    if (!CLERK_PUBLISHABLE_KEY) return undefined
    const answered = () => !!(window.JukeAuth && window.JukeAuth.isLoaded)
    if (answered()) return undefined
    setResolved(false)
    const read = () => { if (answered()) setResolved(true) }
    window.addEventListener('juke:auth', read)
    const ceiling = setTimeout(() => setResolved(true), 4000)
    return () => { window.removeEventListener('juke:auth', read); clearTimeout(ceiling) }
  }, [])
  return resolved
}
