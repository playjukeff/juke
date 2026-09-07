import { useRooms } from '../hooks/useRooms.js'
import { useLeague } from '../hooks/useLeague.js'
import { LIVE_WHEN_CONNECTED } from './RoomPage.jsx'

/* The room cards, written once for the two screens that draw them: the
   Rooms lobby (#/rooms) and the homepage's own THE ROOMS section. The
   handoff draws the identical grid in both (2ag against 2bg, 3ag against
   3bg), and a second copy would drift the first time a card changed --
   which is the same rule ROOMS itself follows one layer down.

   Content is all read off ROOMS through window.JukeEngine.rooms(). This
   file decides layout and nothing else.

   ---- The Prospect Room ----

   The handoff's own lobby draws four locked rooms and never mentions
   Prospect; the app has advertised six since the homepage grid shipped.
   Dropping a room from the site is a product decision and a bigger one
   than adding a card, so all five locked rooms render and the grid takes
   a fifth cell rather than the mock's four.

   ---- Every card is a link, locked ones included ----

   The handoff's own interaction rule: "Locked card tap (guest) -> same
   room, showing the locked preview (not a modal)." A card that opens a
   dialog instead of the room answers a question the reader did not ask
   and takes away the preview that is the entire pitch. A room with no
   `slug` yet has no page to open and renders as a plain card. */

function LeadCard({ room, lgSpan }) {
  return (
    <a
      href={room.href || (room.slug ? `#/rooms/${room.slug}` : undefined)}
      className={
        /* Full width on a phone, an ordinary cell on a desktop. Both are the
           handoff's: every mobile screen gives the lead card
           `grid-column:1/-1` (2ag/2au/2bg/2bu) and no desktop screen does
           (3ag/3au/3bg/3bu). At two columns a wide lead is what makes the
           open room read as the one you can actually use; at three or five
           there is room to say that with the cyan wash alone. */
        'col-span-2 flex items-center gap-3.5 rounded-2xl border border-line-hairline p-4 transition-colors duration-150 hover:border-teal/40 sm:p-5 lg:flex-col lg:items-start lg:justify-between lg:gap-0 lg:min-h-[150px] ' +
        lgSpan
      }
      style={{ background: `linear-gradient(120deg, ${room.accent}1A, transparent 60%), #151920` }}
    >
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[18px]"
        style={{ background: '#0f2e34', color: room.accent }}
        aria-hidden="true"
      >
        {room.glyph}
      </span>
      <span className="min-w-0 flex-1 lg:flex-none">
        <span className="block font-mono text-[10px] tracking-[0.1em]" style={{ color: room.accent }}>
          FREE · {room.season.toUpperCase()}
        </span>
        <span className="mt-[3px] block font-display text-[22px] font-bold leading-[1.05] text-white">
          {room.name}
        </span>
        {/* The same two-line box the locked cards give their hook, and
            for the same reason: these blocks are bottom-anchored, so a card
            whose sub-line wraps to two pushes its own title up relative to
            one whose does not. Measured 3 Sep 2026 on the homepage's
            five-across strip at 1440 -- 246px cells, three hooks wrapping
            and two not, titles spread over 18px. `min-h` in em rather than
            px because the size steps 12 -> 13 at `sm` and em follows it. */}
        <span className="mt-0.5 block truncate text-[13px] leading-[1.35] text-ink-muted lg:mt-1 lg:line-clamp-2 lg:min-h-[2.7em] lg:whitespace-normal">
          {room.lead}
        </span>
      </span>
      {/* The chevron is the phone row's own affordance — a wide row with a
          tile, a name and nothing at the end reads as unfinished. A card in
          a grid does not need one, and none of the desktop screens draws
          it. */}
      <span className="shrink-0 text-ink-muted lg:hidden" aria-hidden="true">›</span>
    </a>
  )
}

function LockedCard({ room, wide = false, lgSpan }) {
  const inner = (
    <>
      <span
        className="grid h-10 w-10 place-items-center rounded-xl bg-flow-tile text-[18px] text-ink-muted"
        aria-hidden="true"
      >
        {room.glyph}
      </span>
      {/* Eyebrow, then title, then the hook -- the same three in the same
          order as LeadCard, because the two sit in one row and every card
          here anchors its text block to the BOTTOM (`justify-between` under
          a fixed min-height). Bottom-anchored blocks whose contents run in
          different orders land their titles at different heights: measured
          3 Sep 2026 on #/rooms at 1440, "The Draft Room" sat 30px below
          "Waiver Room" and "Trade Room" beside it. Nothing was wrong with
          either card on its own.

          Which means the margins and line-heights below have to match
          LeadCard's too, and a change to one of them is a change to both. */}
      <span>
        <span className="block font-mono text-[10px] tracking-[0.1em] text-ink-muted">
          <span aria-hidden="true">🔒</span> {room.season.toUpperCase()}
        </span>
        <span className="mt-[3px] block font-display text-[20px] font-bold leading-[1.05] text-white sm:text-[22px]">
          {room.name.replace(/^The /, '')}
        </span>
        {/* No `block` here: `line-clamp-*` works by setting
            `display:-webkit-box`, and a `block` in the same layer wins and
            silently leaves the clamp doing nothing -- confirmed on the
            built page, where the computed style read
            `-webkit-line-clamp: 2` beside `display: block` and the Waiver
            hook ran to three lines anyway.

            Three lines below `sm` and two above it, because that is what
            the card is actually wide enough for: at 375px a 2-col cell
            gives the hook ~144px and it wraps to three. The reserve is
            what keeps every title in a row on one baseline; the clamp is
            the guard for a hook longer than the reserve. */}
        <span className="mt-0.5 text-[12px] leading-[1.35] line-clamp-3 min-h-[4.05em] text-ink-muted sm:text-[13px] sm:line-clamp-2 sm:min-h-[2.7em] lg:mt-1">
          {room.hook}
        </span>
      </span>
    </>
  )

  const cls =
    'relative flex min-h-[124px] flex-col justify-between overflow-hidden rounded-2xl border border-line-hairline bg-[#151920] p-4 transition-colors duration-150 sm:min-h-[150px] sm:p-5 ' +
    lgSpan +
    // `wide` is the two-column phone rule and says nothing about desktop;
    // the desktop span arrives separately, so it may not carry an
    // `lg:col-span-1` of its own any more.
    (wide ? ' col-span-2' : '')

  if (!room.slug) return <div className={cls}>{inner}</div>
  return (
    <a href={`#/rooms/${room.slug}`} className={cls + ' hover:border-white/20'}>
      {inner}
    </a>
  )
}

/* `columns` is the one thing the two hosts disagree about, and they really
   do: the homepage draws its rooms as a single five-across strip
   (3ag/3au, `repeat(5,1fr)`) and the lobby as a three-column grid
   (3bg/3bu, `repeat(3,1fr)`). Below `lg` both are two columns. A prop
   rather than two components, because everything else about a card is
   identical and a second copy would drift. */
/* `per` is how many cards read as a row; `cls`/`span` are how that is
   drawn. The lobby's three-across is drawn on SIX tracks rather than
   three, which is the whole of this change: three does not divide by two,
   so a final row of two cards cannot be stretched to fill it, and six can.

   Five rooms on three columns is 3 + 2 and leaves a third of a row empty
   -- measured 4 Sep 2026 at 1440, a 404px hole beside the last two cards,
   with the full-width unlock bar directly under it making a notch of the
   page. That reads as a card that failed to load rather than as the end of
   a list, which is the same sentence the two-column rule below already
   makes about a lone card.

   Six rooms divide evenly and none of this fires, so it takes itself out
   of the way the day the Prospect Room comes back. */
const GRID = {
  home: { cls: 'lg:grid-cols-5', span: 'lg:col-span-1', per: 5 },
  lobby: { cls: 'lg:grid-cols-6', span: 'lg:col-span-2', per: 3 },
}

export default function RoomsGridAlive({ columns = 'lobby' }) {
  const rooms = useRooms()
  /* Which rooms this reader can walk into, which is not the same question
     as which rooms are built. `live` is the second one, and `opensForMe`
     exists for the gap between them: League Room used to render real
     standings for a connected reader (RoomPage's LIVE_ROOMS) while this
     grid drew a padlock on it regardless, so the lobby said locked about a
     room that opened. League graduated into My League and left LIVE_ROOMS
     empty, but the gap it exposed can reopen the moment any of Waiver,
     Trade or Strategy gets a real connected body — so this stays rather
     than being simplified back to `r.live` alone. LIVE_WHEN_CONNECTED is
     that map's own key list rather than a second copy of it. */
  const { status } = useLeague()
  const opensForMe = (r) =>
    r.live || (status === 'connected' && LIVE_WHEN_CONNECTED.includes(r.slug))
  const lead = rooms.filter(opensForMe)
  const locked = rooms.filter((r) => !opensForMe(r))
  const grid = GRID[columns] || GRID.lobby

  /* How many cards land in the desktop grid's final row, and what those
     ones span instead.

     Only the lobby can divide, because only it is drawn on more tracks
     than it shows columns. Two survivors take three tracks each and fill
     the row. ONE is centred rather than stretched: a single card 1200px
     wide beside four 392px ones is a worse answer than the hole it
     replaces, and centring says "end of the list" without pretending the
     card is more important than the others. */
  const tail = grid.per === 3 ? rooms.length % 3 : 0
  const tailFrom = rooms.length - tail
  const spanFor = (i) => {
    if (!tail || i < tailFrom) return grid.span
    return tail === 2 ? 'lg:col-span-3' : 'lg:col-span-2 lg:col-start-3'
  }

  /* The same problem one breakpoint down, and it needs its own answer
     because the grids are different: below `lg` there are two columns and
     no spare tracks to divide, so an odd locked count leaves the last card
     alone in its row and the only fix is to let it span both.

     This used to end "three columns divide five as 3+2, which needs no
     help", which was the claim `spanFor` above now exists to contradict --
     3+2 leaves a third of a row empty and that is exactly the hole being
     closed. Corrected here rather than left standing. */
  const oddOut = locked.length % 2 === 1

  return (
    <div className={'grid grid-cols-2 gap-2.5 lg:gap-3 ' + grid.cls}>
      {lead.map((r, i) => (
        <LeadCard key={r.name} room={r} lgSpan={spanFor(i)} />
      ))}
      {locked.map((r, i) => (
        <LockedCard
          key={r.name}
          room={r}
          wide={oddOut && i === locked.length - 1}
          lgSpan={spanFor(lead.length + i)}
        />
      ))}
    </div>
  )
}
