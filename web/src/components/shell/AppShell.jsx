import ShellHeader from './ShellHeader.jsx'
import RailNav from './RailNav.jsx'
import FloatingNavPill, { NAV_PILL_CLEARANCE } from '../phone/FloatingNavPill.jsx'

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
