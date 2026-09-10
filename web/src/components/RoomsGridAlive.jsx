import { useRooms } from '../hooks/useRooms.js'
import { useLeague } from '../hooks/useLeague.js'
import { useRoomStakes } from '../hooks/useRoomStakes.js'
import { stakeLabel } from './shell/roomStakes.js'
import { roomIsOpen, lockReason } from './RoomPage.jsx'
import RoomIcon, { IconLock } from './roomIcons.jsx'

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

function LeadCard({ room, lgSpan, stake }) {
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
        <RoomIcon room={room} />
      </span>
      <span className="min-w-0 flex-1 lg:flex-none">
        {/* Screen 16: what this room has at stake, ON THE EYEBROW ROW rather
            than on a line of its own.

            That placement is the whole care here. These blocks are
            bottom-anchored under a fixed min-height, so a card that gained a
            fourth line would push its own title up relative to the cards
            beside it — which is the defect measured on this exact grid on 3
            September 2026, where "The Draft Room" sat 30px below "Waiver
            Room" for the same reason. Only two of the five rooms can answer,
            so a new line would misalign precisely the row it is trying to
            inform. Measured after this change: title tops identical across
            every card in the row, at 375 and at 1440.

            `font-plex` at the eyebrow's own size for the same reason —
            10px against 10px, so the line box cannot grow. The digits are
            what wants the mono, which is what `tabular-nums` is for.

            P1: `cost`, never the room's accent and never teal. The
            magnitude is what a claim or a swap would GAIN and the cost is
            that it has not been made — the sign `WaiverRoomLive`'s own
            stake card already prints it under, and the sign `roomStakes.js`
            hands out rather than letting each caller choose. */}
        <span className="flex items-baseline justify-between gap-2 font-mono text-[10px] tracking-[0.1em]">
          <span className="truncate" style={{ color: room.accent }}>
            FREE · {room.season.toUpperCase()}
          </span>
          {stake ? (
            <span className="shrink-0 font-plex font-semibold tracking-normal tabular-nums text-cost">
              {stake}
            </span>
          ) : null}
        </span>
        {/* Same size and same reserve as LockedCard's title, because the
            five cards sit in ONE row and their text blocks are all
            bottom-anchored. At 22px against the locked cards' 20px the two
            reserves resolve to different heights (46.2 vs 42), so the row
            still stepped even with both reserving two lines. The lead
            card's prominence comes from its accent eyebrow and accent-tinted
            tile, which is a stronger signal than two pixels of type.

            This grid is shared with the Rooms lobby, so the alignment fix
            lands on both screens. */}
        <span className="mt-[3px] block min-h-[2.1em] font-display text-[20px] font-bold leading-[1.05] text-white">
          {room.name}
        </span>
        {/* The same two-line box the locked cards give their hook, and
            for the same reason: these blocks are bottom-anchored, so a card
            whose sub-line wraps to two pushes its own title up relative to
            one whose does not. Measured 3 Sep 2026 on the homepage's
            five-across strip at 1440 -- 246px cells, three hooks wrapping
            and two not, titles spread over 18px. `min-h` in em rather than
            px because the size steps 12 -> 13 at `sm` and em follows it. */}
        <span className="mt-0.5 block truncate text-meta leading-[1.35] text-ink-muted lg:mt-1 lg:line-clamp-2 lg:min-h-[2.7em] lg:whitespace-normal">
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

/* "The Waiver Room, The Trade Room and The Strategy Room" — and the same
   sentence with one or two of them, because which rooms are locked changes
   as rooms ship and the copy has to survive that without being rewritten. */
function nameList(rooms) {
  const names = rooms.map((r) => r.name)
  if (names.length <= 1) return names[0] || ''
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
}

function LockedCard({ room, wide = false, lgSpan }) {
  const inner = (
    <>
      <span
        className="grid h-10 w-10 place-items-center rounded-xl bg-flow-tile text-[18px] text-ink-muted"
        aria-hidden="true"
      >
        <RoomIcon room={room} />
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
        {/* The lock is drawn and it is announced.

            It was `<span aria-hidden="true">🔒</span>`, so with
            aria-hidden content stripped the card read "IN-SEASON Waiver
            Room Preview: 4 claims worth making this week" and nothing in
            it said locked — three of the five cards in this row led
            somewhere the reader was never warned about. An emoji is also
            not an icon system; this is the one stroke weight the rest of
            the row uses. */}
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-ink-muted">
          <IconLock size={12} />
          <span className="sr-only">Locked. </span>
          {room.season.toUpperCase()}
        </span>
        {/* The article stays. PRODUCT.md is explicit that a room is a
            proper name taking "The", and stripping it here put two
            spellings of the same room within one screenful — the strip
            read "The Draft Room / Waiver Room / Trade Room" while the
            footer 200px below listed all five with it. Confirmed in the
            accessibility tree, card named "Waiver Room" against footer
            link "The Waiver Room".

            text-[20px] at every width rather than stepping up to 22:
            "The Strategy Room" needs the extra line at 246px and the
            card already reserves a two-line box below the title, so the
            bottom-anchored baseline is unaffected. */}
        {/* Two lines reserved, for the reason the hero cards now do it.

            "The Prospect Room" wraps in a 246px card and the other four do
            not — measured, a 46px title against 21-23px, which put card
            one's eyebrow 23-25px above the rest of its own row. These
            blocks are bottom-anchored under a fixed min-height, so a title
            that takes a second line lifts everything above it. */}
        <span className="mt-[3px] block min-h-[2.1em] font-display text-[20px] font-bold leading-[1.05] text-white">
          {room.name}
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
        <span className="mt-0.5 text-[12px] leading-[1.35] line-clamp-3 min-h-[4.05em] text-ink-muted sm:text-meta sm:line-clamp-2 sm:min-h-[2.7em] lg:mt-1">
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

   This used to end "six rooms divide evenly and none of this fires, so it
   takes itself out of the way the day the Prospect Room comes back" --
   written while Prospect was still retired, on the assumption its return
   would be the only thing to change the count. It came back in the same
   phase League left the room grid for its own screen, so the total never
   reached six -- it is five today exactly as it was before, and `tail`
   fires on every load rather than sitting dormant. Corrected here rather
   than left standing, the same rule this file already follows for the
   claim just above it. */
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
     room that opened. League graduated into My League — and the rest of
     this sentence used to say that left LIVE_ROOMS empty, which stopped
     being true the moment Waiver, Trade and Strategy got real connected
     bodies. It holds all three today, so `opensForMe` is load-bearing
     rather than defensive: without it this grid would padlock three rooms
     a connected reader can walk into. (That stale clause was read as fact
     in a review and reported as "connecting unlocks none of them", which
     is exactly what a confident comment costs.) Prospect then made it a
     three-way question (open to everybody, open with a league, locked), so
     the answer is roomIsOpen() rather than a slug list every caller has to
     keep in step. */
  const { status } = useLeague()
  /* What each room has at stake, for the two of five that can answer.

     This is screen 16, and what unblocked it is not new data: `roomStakes()`
     has been the shared source since screen 20 shipped, and CLAUDE.md
     recorded 16 as waiting on WHERE THE SNAPSHOT IS FETCHED rather than on
     anything missing. A per-component fetch would have made this grid — which
     draws on `#/rooms` AND on the homepage — pay for a snapshot the room page
     then paid for again, which is the objection `useLeagueSnapshot`'s own
     comment raised against four calls a page load.

     `snapshotStore.js` is that answer: one request per league per two
     minutes however many components ask, so the grid costs nothing a reader
     was not already going to spend on the room they open next. Nothing else
     about the hook changed.

     Guests and the four rooms that cannot answer draw nothing at all rather
     than a zero, which is `roomStakes.js`'s own rule: a tile reading "+0"
     claims the room was asked and had nothing to say. */
  const stakes = useRoomStakes()
  const opensForMe = (r) => roomIsOpen(r, status)
  const lead = rooms.filter(opensForMe)
  const locked = rooms.filter((r) => !opensForMe(r))

  /* What opens the padlocks, in the reader's own words, derived.

     The homepage strip drew three locked cards and said nothing about what
     opens them — an unexplained gate on a pre-launch page reads as a
     paywall nobody can price. The lobby one click away does say it; this
     surface never did.

     Built from lockReason() rather than written as a sentence, because a
     sentence is what goes stale: this file's own comment above claimed
     LIVE_ROOMS was empty long after it held three rooms. Derived, the line
     cannot say "connect a league" about a room no league opens. */
  const needLeague = locked.filter((r) => lockReason(r, status) === 'league')
  const beingBuilt = locked.filter((r) => lockReason(r, status) === 'building')
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
  /* The spare tracks go to the FIRST card, not the last two.

     With five rooms on six tracks, three to a row, the old rule stretched
     the final two cards to three tracks each -- and the final two are
     Trade and Strategy, both locked. Measured on the lobby: row-one cards
     392px, row-two 594px, so the two largest cards on the routing screen
     were padlocks and the flagship Draft Room was one of the small ones. A
     grid tells the reader what matters by how big it draws things, and
     this one said the opposite of the truth.

     Giving both spare tracks to the Draft Room fills the same rows with no
     hole -- 2 + 4 or 4 + 2 across the first, 2 + 2 + 2 across the second.
     It is found by slug and not by index, because ROOMS runs in season
     order and the Prospect Room sits in front of it: the first cut of this
     handed the wide card to index 0 and drew a 794px Prospect Room beside
     a 392px Draft Room, which is the same wrong answer with a different
     padlock. Only a card in the first row can take it without opening a
     hole, so a flagship that ever lands past the third card falls back to
     the first. The one-card tail keeps its centring: with four spare
     tracks there is no split that both leads with the flagship and leaves
     no hole, and centring the last card still says "end of the list". */
  const flagship = (() => {
    const i = lead.findIndex((r) => r.slug === 'draft')
    return i >= 0 && i < 3 ? i : 0
  })()
  const spanFor = (i) => {
    if (!tail) return grid.span
    if (tail === 2) return i === flagship ? 'lg:col-span-4' : grid.span
    return i < tailFrom ? grid.span : 'lg:col-span-2 lg:col-start-3'
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
    <>
      <div className={'grid grid-cols-2 gap-2.5 lg:gap-3 ' + grid.cls}>
        {lead.map((r, i) => (
          <LeadCard
            key={r.name}
            room={r}
            lgSpan={spanFor(i)}
            /* The unit is in the WORDS — "+8.4 this week" against "+31 on the
               wire" — because the two stakes are in different units and a tile
               printing both as "pts" would be the right-value-wrong-column
               failure this project has shipped once in a standings table.
               `stakeLabel()` is the one phrasing, shared with the phone's More
               sheet, so the two surfaces cannot describe one number two ways. */
            stake={stakeLabel(stakes[r.slug])}
          />
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

      {/* The homepage only. The lobby states this in its own SubCopy, and
          two components saying it is the failure this file keeps naming. */}
      {columns === 'home' && (needLeague.length > 0 || beingBuilt.length > 0) && (
        <p className="mt-3.5 text-meta leading-[1.5] text-voidInk-muted">
          {needLeague.length > 0 && (
            <>
              {nameList(needLeague)} open{needLeague.length === 1 ? 's' : ''} when you connect a
              league — read-only, and it stays that way.
            </>
          )}
          {needLeague.length > 0 && beingBuilt.length > 0 ? ' ' : null}
          {beingBuilt.length > 0 && (
            <>
              {nameList(beingBuilt)} open{beingBuilt.length === 1 ? 's' : ''} as{' '}
              {beingBuilt.length === 1 ? 'it is' : 'they are'} built.
            </>
          )}
        </p>
      )}
    </>
  )
}
