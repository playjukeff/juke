/* The five rooms, drawn.

   ---- Why this exists ----

   `ROOMS[].glyph` is a character, and CLAUDE.md records that as a
   deliberate choice: one array read by the legacy page (no bundler) and by
   React alike. That reasoning is about the ARRAY and it still holds — this
   module does not touch it.

   What it does not survive is `color`. RoomsGridAlive sets
   `style={{ color: room.accent }}` on the lead card's tile and
   `text-ink-muted` on a locked one, and **emoji ignore both**. So Waiver
   declares `#00E5FF` and renders orange, Strategy declares `#74E5CE` and
   renders gold, and a locked room that should be muted renders at full
   saturation — which made those three the loudest objects on an otherwise
   disciplined page, in the section answering "what else is there".

   The tell that this is a real defect rather than a taste argument is that
   the strip was internally inconsistent: Draft's ◎ and Trade's ⇄ are
   typographic characters, so they DO take the accent, while the three
   emoji beside them did not. Two of five obeying the colour system is not
   a system.

   ---- What these are ----

   One stroke weight (1.4), one cap and join style (round), one 20x20 box,
   `currentColor` throughout — so they inherit whatever the card already
   sets and need no per-card colour of their own. Keyed by `slug`, so a
   room with no icon here falls back to its `glyph` and nothing breaks the
   day a sixth room ships.

   Deliberately scoped to the homepage strip for now. RoomPage's hero and
   RailNav read the same `glyph` field and still render characters; adopting
   this there is an import and one line each, and it is a separate change
   because those two surfaces were not what was reviewed. */

function Svg({ children }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// Scouting: binoculars. Deliberately not a second concentric-circle mark —
// the Draft Room owns that shape, and two circular icons in one row of five
// is the same failure as five identical chips.
function IconProspect() {
  return (
    <Svg>
      <circle cx="6.1" cy="12.4" r="3.5" />
      <circle cx="13.9" cy="12.4" r="3.5" />
      <path d="M9.6 12.4h.8" />
      <path d="M6.1 8.9V5.4h2.1M13.9 8.9V5.4h-2.1" />
    </Svg>
  )
}

// The board: a target, which is what ◎ already was.
function IconDraftRoom() {
  return (
    <Svg>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="2.6" />
    </Svg>
  )
}

// The wire: a bolt, which is what ⚡ already was.
function IconWaiver() {
  return (
    <Svg>
      <path d="M11.4 2.6 4.6 11.4h4.1l-1.1 6 6.8-8.8h-4.1z" />
    </Svg>
  )
}

// A deal: two arrows passing, which is what ⇄ already was.
function IconTrade() {
  return (
    <Svg>
      <path d="M3.2 7.4h11.4l-3.1-3.1" />
      <path d="M16.8 12.6H5.4l3.1 3.1" />
    </Svg>
  )
}

// The week: a compass, which is what 🧭 already was.
function IconStrategy() {
  return (
    <Svg>
      <circle cx="10" cy="10" r="7.1" />
      <path d="m13.1 6.9-2.2 5.9-5.9 2.2 2.2-5.9z" />
    </Svg>
  )
}

export const ROOM_ICONS = {
  prospect: IconProspect,
  draft: IconDraftRoom,
  waiver: IconWaiver,
  trade: IconTrade,
  strategy: IconStrategy,
}

/* The tile's contents for one room: the drawn icon when there is one, the
   array's own character when there is not. A caller never branches. */
export default function RoomIcon({ room }) {
  const Icon = room && room.slug ? ROOM_ICONS[room.slug] : null
  if (Icon) return <Icon />
  return <>{room ? room.glyph : null}</>
}
