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

   This started scoped to the homepage strip, with a note that RoomPage's
   hero and RailNav still rendered characters and adopting it there was "an
   import and one line each". The polish pass took that line up: the rail,
   the More sheet, every room hero, the lobby's door and all three lock
   marks draw from here now, so one surface cannot show a drawn icon beside
   another showing an emoji of the same room.

   The three non-room rail items (My League, History, You) take Lucide,
   because FloatingNavPill already chose Lucide's Trophy and User for two
   of them -- a third drawn family for the rail would be the failure this
   file exists to end. Lucide is drawn at strokeWidth 1.4 and 20px so its
   weight sits with the room icons rather than beside them. */
import { History, Trophy, User } from 'lucide-react'

function Svg({ children, size }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={'shrink-0 ' + (size ? '' : 'h-5 w-5')}
      style={size ? { width: size, height: size } : undefined}
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
function IconProspect({ size }) {
  return (
    <Svg size={size}>
      <circle cx="6.1" cy="12.4" r="3.5" />
      <circle cx="13.9" cy="12.4" r="3.5" />
      <path d="M9.6 12.4h.8" />
      <path d="M6.1 8.9V5.4h2.1M13.9 8.9V5.4h-2.1" />
    </Svg>
  )
}

// The board: a target, which is what ◎ already was.
function IconDraftRoom({ size }) {
  return (
    <Svg size={size}>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="2.6" />
    </Svg>
  )
}

// The wire: a bolt, which is what ⚡ already was.
function IconWaiver({ size }) {
  return (
    <Svg size={size}>
      <path d="M11.4 2.6 4.6 11.4h4.1l-1.1 6 6.8-8.8h-4.1z" />
    </Svg>
  )
}

// A deal: two arrows passing, which is what ⇄ already was.
function IconTrade({ size }) {
  return (
    <Svg size={size}>
      <path d="M3.2 7.4h11.4l-3.1-3.1" />
      <path d="M16.8 12.6H5.4l3.1 3.1" />
    </Svg>
  )
}

// The week: a compass, which is what 🧭 already was.
function IconStrategy({ size }) {
  return (
    <Svg size={size}>
      <circle cx="10" cy="10" r="7.1" />
      <path d="m13.1 6.9-2.2 5.9-5.9 2.2 2.2-5.9z" />
    </Svg>
  )
}

// A door: the lobby's eyebrow, which was the one warm-hued emoji on a page
// otherwise drawn in one stroke, and could not take the eyebrow's teal.
function IconDoor({ size }) {
  return (
    <Svg size={size}>
      <rect x="5.2" y="3" width="9.6" height="14" rx="1.2" />
      <path d="M3.2 17h13.6" />
      <circle cx="12.3" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  )
}

// The padlock, once. It was an inline 12-unit SVG in RoomsGridAlive and an
// emoji at 26-28px in the lobby's connect bar and LockedPreview -- three
// locks, two families, one of them ignoring `color`.
export function IconLock({ size }) {
  return (
    <Svg size={size}>
      <path d="M6.5 8.6V6a3.5 3.5 0 0 1 7 0v2.6" />
      <rect x="4.4" y="8.6" width="11.2" height="8.2" rx="1.8" />
    </Svg>
  )
}

export { IconDoor }

/* The three sports on the Draft Room's entry, in the same 20-unit box and
   1.4 stroke as the rooms. They were emoji, which craft-floor bans as an
   icon system, and Lucide draws none of the three -- so they are authored
   here rather than borrowed, because a fourth stroke weight on one chip
   row would be the failure this file exists to end. Each is the ball's
   own tell and nothing more: the football's lace, the basketball's seams,
   the baseball's two stitch arcs. */
function IconFootball({ size }) {
  return (
    <Svg size={size}>
      <path d="M3.2 16.8c-1.2-1.2-1-6.3 3.4-10.7S15.6 2 16.8 3.2s1 6.3-3.4 10.7S4.4 18 3.2 16.8Z" />
      <path d="M7.2 12.8l5.6-5.6M8.6 8.8l1.2 1.2M10.4 7l1.2 1.2M8.8 12.2l1.2 1.2M11 10l1.2 1.2" />
    </Svg>
  )
}
function IconBasketball({ size }) {
  return (
    <Svg size={size}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 2.8v14.4M2.8 10h14.4M4.9 4.9c2.2 2 3.3 3.7 3.3 5.1s-1.1 3.1-3.3 5.1M15.1 4.9c-2.2 2-3.3 3.7-3.3 5.1s1.1 3.1 3.3 5.1" />
    </Svg>
  )
}
function IconBaseball({ size }) {
  return (
    <Svg size={size}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M5.4 4.2c1.8 1.6 2.7 3.5 2.7 5.8s-.9 4.2-2.7 5.8M14.6 4.2c-1.8 1.6-2.7 3.5-2.7 5.8s.9 4.2 2.7 5.8" />
      <path d="M6.4 6.6l1.1.5M6.1 9.2l1.2.2M6.4 12.1l1.1-.4M13.6 6.6l-1.1.5M13.9 9.2l-1.2.2M13.6 12.1l-1.1-.4" />
    </Svg>
  )
}
export const SPORT_ICONS = { nfl: IconFootball, nba: IconBasketball, mlb: IconBaseball }

export const ROOM_ICONS = {
  prospect: IconProspect,
  draft: IconDraftRoom,
  waiver: IconWaiver,
  trade: IconTrade,
  strategy: IconStrategy,
}

/* The tile's contents for one room: the drawn icon when there is one, the
   array's own character when there is not. A caller never branches. */
export default function RoomIcon({ room, size }) {
  const Icon = room && room.slug ? ROOM_ICONS[room.slug] : null
  if (Icon) return <Icon size={size} />
  return <>{room ? room.glyph : null}</>
}

const LUCIDE_NAV = { 'my-league': Trophy, history: History, you: User }

/* One rail item's mark: a room's own drawn icon, Lucide for the three
   non-rooms, the array's character only for a key nothing here knows. */
export function NavIcon({ item, size }) {
  const Room = item && item.key ? ROOM_ICONS[item.key] : null
  if (Room) return <Room size={size} />
  const L = item && item.key ? LUCIDE_NAV[item.key] : null
  if (L) return <L size={size || 20} strokeWidth={1.4} aria-hidden="true" />
  return <>{item ? item.glyph : null}</>
}
