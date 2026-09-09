import { useEffect } from 'react'
import ShellHeader from './ShellHeader.jsx'
import RailNav from './RailNav.jsx'
import FloatingNavPill, { NAV_PILL_CLEARANCE } from '../phone/FloatingNavPill.jsx'

/* Bricolage Grotesque, fetched when an APP route opens and never before.

   `font-decision` is the decision system's display face and it is used by
   the app side only -- the rooms, My League, the ledger. No marketing page
   draws it, so a <link rel=preload> in index.html would pull 41KB on the
   homepage for a face that page never shows. index.html's two existing
   preloads are already at fetchpriority="low" because they were measured
   pulling 49KB past the one stylesheet the first paint waits on, and a third
   unconditional one would spend that measurement.

   AppShell rather than RoomShell, which is where this went first: My League
   is not a room, it sits ABOVE the five in the rail, and it draws the Move
   card and the stake card in this face. The boundary that actually matches
   the face's use is "an app screen", and this component is that boundary by
   construction -- it is the thing every app screen is wrapped in.

   Module scope rather than a ref, because moving between two app routes
   unmounts and remounts this and a ref would append a second <link> each
   time. The browser would serve the second from cache; the tag would still
   accumulate. */
let facePreloaded = false

function useDecisionFace() {
  useEffect(() => {
    if (facePreloaded || typeof document === 'undefined') return
    facePreloaded = true
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'font'
    link.type = 'font/woff2'
    link.crossOrigin = 'anonymous'
    link.href = '/fonts/bricolage-grotesque-variable-latin.woff2'
    document.head.appendChild(link)
  }, [])
}

/* Rail, header, content, bottom nav — the pieces every screen in
   design_handoff_v3_alive / Juke Journey v3 has, wrapped once so no screen
   can be built without them.

   That is the whole reason it exists rather than each screen importing
   these itself. The nav is mounted per-screen in this app (HomePhone and
   DraftRoom each render their own), which works and has exactly one
   failure mode: a new screen forgets it and ships with no way off itself
   on a phone. Every screen this handoff adds goes through here instead.

   It deliberately does NOT become the mount point for the two that already
   exist. DraftRoom renders the pill on #/rooms/draft (its own Lobby route)
   and on #/draft-room, and applyRoute() hides #view-home for both — which
   is where this component lives — so hoisting the nav here would take it
   off the Lobby entirely. Two mount points that both work beat one that is
   right for the screens it can reach and wrong for the one it cannot.

   ---- The rail is a flex sibling, not a fixed overlay ----

   RailNav is `lg:sticky` inside this row rather than `fixed`, so the
   header+content column next to it is a plain flex-1 child and needs no
   hand-measured left padding to avoid the rail overlapping it — the same
   reason NAV_PILL_CLEARANCE exists for the *bottom* nav is what this
   avoids needing for the *side* one.

   `pad` is opt-out for a screen that manages its own bottom clearance
   (a room page pads below the locked preview, not around it). */

export default function AppShell({ active = null, pad = true, children }) {
  useDecisionFace()
  return (
    <div className="lg:flex lg:items-stretch">
      <RailNav />
      <div className="min-w-0 flex-1">
        <ShellHeader active={active} />
        <div style={pad ? { paddingBottom: NAV_PILL_CLEARANCE } : undefined}>{children}</div>
      </div>
      <FloatingNavPill />
    </div>
  )
}
