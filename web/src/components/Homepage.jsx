import { useEffect, useRef, useState } from 'react'
import ShellHeader from './shell/ShellHeader.jsx'
import HomeAlive from './HomeAlive.jsx'
import JukeLogo from './juke-logo/JukeLogo.jsx'
import ComingSoonModal from './ComingSoonModal.jsx'
import EarlyAccessModal from './EarlyAccessModal.jsx'
import { ROOM_SIGNUP_SOURCE, roomSignupCopy } from './icons.jsx'
import { freshnessLine } from './dataFreshness.js'

/* METHOD is Juke's own real content: the how-it-works doc, plus the
   sections of it worth naming on their own.

   Every one of these lands on the same document, so what a label owes the
   reader is the SECTION it actually reaches. "How scoring works" was here
   and owed that twice over. It read as a near-twin of "How it works" one
   line above it — reported exactly that way — and it pointed at #s03,
   which is "The league, and everything that follows from it": teams,
   rounds, lineup, bench, with scoring one item in a list of settings.
   Somebody clicking it to learn how points are calculated got a summary of
   league defaults. Dropped rather than renamed, because the section is
   reachable by scrolling from the top link and the settings themselves
   live on the setup screen.

   "The draft grade" is #s06, which had no link to it at all — a whole
   section, on one of the app's headline features, that the footer never
   named.

   The top-level link stays and is not redundant with a nav item:
   ShellHeader went to three tabs and its own comment records How It Works
   moving here, and SiteNav is the retired header that survives on one
   screen. This is the only place it appears. */
const METHOD_LINKS = [
  { label: 'How it works', href: '/docs/draft-room-how-it-works.html' },
  { label: 'Data sources', href: '/docs/draft-room-how-it-works.html#s02' },
  { label: 'The draft grade', href: '/docs/draft-room-how-it-works.html#s06' },
  { label: 'VORP explained', href: '/docs/draft-room-how-it-works.html#s07' },
]

// Phase 0 of accounts turned Contact and Support into a real destination —
// an email address — so both left this file's "not live yet" family
// entirely. About Us and Careers had no such destination to turn into and
// are gone outright rather than left pointing at a ComingSoonModal that
// exists for lack of anything better to say.
const CONTACT_EMAIL = 'hello@jukeff.com'

const LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/docs/privacy.html' },
  { label: 'Terms of Service', href: '/docs/terms.html' },
]

// Real marks now, not mono-label placeholders — path data pulled straight
// from Simple Icons (simpleicons.org), whose SVG recreations are
// dedicated to the public domain (CC0 1.0; checked the project's own
// LICENSE.md), so redrawing them here isn't a copyright question.
//
// The trademarks the marks depict still belong to Meta/X Corp/Reddit, same
// as any logo — but using a platform's own mark to point at your own real
// profile on it ("follow us on X") is ordinary, widely-practiced nominative
// use. There's just no Juke account behind any of them yet, which is a
// "not live" problem, not a "not allowed" one, so they still open the same
// ComingSoonModal.
//
// LinkedIn and YouTube dropped per instruction, matching the reference
// footer's own four (Reddit, X, Facebook, Instagram) rather than the five
// this list started as.
const SOCIAL_LINKS = [
  {
    label: 'Facebook',
    path: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  },
  {
    label: 'Instagram',
    path: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  },
  {
    label: 'X',
    path: 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z',
  },
  {
    label: 'Reddit',
    path: 'M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z',
  },
]

function SocialIcon({ path }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

function useRooms() {
  const [rooms, setRooms] = useState([])
  useEffect(() => {
    const engine = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!engine) return
    setRooms(engine.rooms())
  }, [])
  return rooms
}

// The footer's closing line (design_handoff_mobile Prompt 2): "N players
// tracked · updated <relative time>". Neither half is invented. The count
// is board.length itself — CLAUDE.md is explicit that a player count has to
// be derived, never a literal like "225" quoted once and left to drift as
// the nightly pipeline changes the board. The "updated" half reads the real
// ?v= stamp off the page's own <script src="/app.js?v=YYYYMMDDHHMM">: that
// stamp is the UTC minute update-players.yml last actually changed the
// data (it only bumps it on a day the feeds moved), already the mechanism
// this whole app leans on for cache-busting — not a second, invented
// timestamp. Formatted relative to the reader's own clock, never printed as
// a raw UTC string, per the review item this line cites.
function useDataFreshness() {
  const [freshness, setFreshness] = useState(null)

  useEffect(() => {
    /* The same bug BoardPeek had, and it predates it here.

       freshnessLine() reads playersMeta(), which is deferred behind the
       cold-load reveal — so a single read at mount returns nothing and the
       footer's closing line has been rendering empty. It needs the event
       that says the board arrived, the same as every other engine read on
       this page. */
    const read = () => setFreshness(freshnessLine())
    read()
    window.addEventListener('juke:data-loaded', read)
    return () => window.removeEventListener('juke:data-loaded', read)
  }, [])

  return freshness
}

// One row per room: a real link for the one that's live, an EarlyAccessModal
// button for the other five — the same choice RoomsGrid.jsx's own roadmap
// rows make for exactly these five rooms elsewhere on this page, just
// reused here rather than re-decided. Listing all six (not just the live
// one) is the point of this pass: a reference footer whose own product-list
// column names everything the company offers, not just what's shipped.
/* Every room with a page is a link to it, live or locked.

   This used to send anything not `live` to an early-access signup modal,
   which was right while a locked room had nowhere to go. It now has
   somewhere: design_handoff_v3_alive gives all four in-season rooms a real
   page at #/rooms/<slug>, showing a blurred preview behind an unlock card.

   Leaving the modal here meant the same room behaved differently depending
   which link you pressed — the lobby card opened the room, the footer
   opened a dialog — which is the handoff's own interaction rule broken in
   the one place nobody looks: "Locked card tap (guest) -> same room,
   showing the locked preview (not a modal)." A dialog answers a question
   the reader did not ask and takes away the preview that is the pitch.

   The modal path stays for a room with no `slug`, which is a room with no
   page yet. There are none today; that is the branch that stops this
   silently 404ing the day one is added. */
function FooterRoomLink({ room, onSignup, className }) {
  const href = room.href || (room.slug ? `#/rooms/${room.slug}` : null)
  if (href) {
    return (
      <a href={href} className={className}>
        {room.name}
      </a>
    )
  }
  return (
    <button type="button" onClick={() => onSignup(room)} className={`${className} text-left`}>
      {room.name}
    </button>
  )
}

function FooterColumn({ title, children }) {
  return (
    <div className="flex flex-col gap-[11px]">
      <span className="font-numeral text-[10.5px] font-semibold tracking-[0.13em] text-voidInk-body">{title}</span>
      {children}
    </div>
  )
}

// The brand stack — logo, then socials, in that order — is identical on
// both breakpoints, so it gets its own component rather than being written
// out twice.
function FooterBrandStack({ onSocialClick, linkClass }) {
  return (
    <div className="flex flex-col items-start gap-5">
      {/* §11's footer repeat of the slogan — wrapped with the logo in its
          own div rather than joining the outer gap-5 flex column directly,
          since the spec's own 8px gap is specific to logo-to-slogan and
          would otherwise apply uniformly to every child in this stack
          (i.e. also pushing the socials row away from it). */}
      <div>
        <JukeLogo size={18} />
        <div className="mt-2 font-display text-[14px] font-extrabold italic uppercase tracking-[0.05em] text-[#7A808D]">
          Agility Through Analytics
        </div>
      </div>

      <div className="flex gap-2">
        {SOCIAL_LINKS.map((social) => (
          <button
            key={social.label}
            type="button"
            onClick={() => onSocialClick(social.label)}
            aria-label={social.label}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-line-hairline text-voidInk-muted transition-colors hover:border-teal-400/40 hover:text-white"
          >
            <SocialIcon path={social.path} />
          </button>
        ))}
      </div>

      {/* The one place the address appears, and it sits here because this
          is already the "reach us" cluster — the socials are the other way
          to do the same thing, and the two belong together rather than one
          being furniture and the other a column heading.

          It was under BOTH "Company" and "Legal" before, on the reasoning
          that Company is who to write to and Legal is who to write to about
          this page. Those two headings sit side by side about 150px apart
          in one row, so the same glance takes in both, and the argument
          would equally have justified a third copy under Method. Printing a
          plaintext address twice on a public page also doubles what a
          scraper collects for no extra reach.

          Shown rather than labelled "Contact", which is unchanged and
          deliberate: a bare mailto: does nothing visible on a machine with
          no mail client, and that was reported as "nothing happens when I
          click on either link in the footer". Somebody with a mail client
          still gets a compose window; everybody else can read it and copy
          it, which is what they were trying to do. */}
      <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass} title={`Email ${CONTACT_EMAIL}`}>
        {CONTACT_EMAIL}
      </a>
    </div>
  )
}

export default function Homepage() {
  const rooms = useRooms()
  const freshness = useDataFreshness()
  const modalRef = useRef(null)
  const earlyAccessRef = useRef(null)

  const openComingSoon = (label, body) => modalRef.current?.open(`${label} is coming soon`, body)
  const openSocial = (label) => openComingSoon(label, `Juke isn't on ${label} yet — check back once it is.`)
  // ROOM_SIGNUP_SOURCE/roomSignupCopy (icons.jsx) are the same lookup
  // RoomsGrid.jsx's roadmap list and RoomsNavMenu.jsx's dropdown rows use,
  // so these footer links, that grid and that dropdown all tag the
  // identical five rooms with the identical source string.
  const openRoom = (room) => earlyAccessRef.current?.open(roomSignupCopy(room), ROOM_SIGNUP_SOURCE[room.name])

  const roomLinkClass = 'flex min-h-[44px] items-center text-sm text-voidInk-body transition-colors hover:text-white lg:min-h-0 lg:text-[13px]'

  return (
    <>
      {/* ---- Two homepages, chosen by CSS rather than by a media-query
          hook, and the reason is hydration ----

          scripts/prerender.mjs writes real server-rendered markup into
          #root and main.jsx hydrates onto it. A width-dependent BRANCH
          cannot survive that: the server has no window, so it renders the
          desktop tree, and a phone's first client render would disagree —
          React patches the mismatch by re-rendering the subtree, which on
          a phone means one visible frame of desktop layout before the
          phone one replaces it. That flash is exactly what the prerender
          exists to prevent.

          So both trees are prerendered and `sm:hidden` / `hidden sm:block`
          picks. The cost is real and is worth naming: the desktop tree
          MOUNTS on a phone (CSS-hidden is still mounted — the rule
          useMinWidth's own comment exists for), so its effects run and its
          engine reads happen on the device least able to afford them. That
          is the same work today's homepage already does on a phone, so
          nothing gets slower; it simply does not get faster. If it ever
          needs to, the fix is to prerender two documents, not to move this
          back to a hook. */}
      {/* One tree at every width now — see HomeAlive.jsx. The two-tree
          split this used to carry (a sm:hidden HomePhone and a hidden
          sm:block desktop page) was the mobile pass's own product decision
          and design_handoff_v3_alive reverses it for this screen: 2ag and
          3ag are one set of content in two layouts, not two screens. That
          also ends the cost the comment above describes, since there is no
          longer a second tree mounting invisibly on every device. */}
      <div className="min-h-screen overflow-x-hidden bg-surface-page font-body text-voidInk-primary">
      <ShellHeader active="home" />

      <main>
        <HomeAlive />

        {/* TakeAPick, ShowYourWorking and ClosingCta used to render here,
            desktop-only, and the owner has taken them off the page. The
            homepage is what design_handoff_v3_alive draws and then the
            footer, which is the handoff's own shape plus the one thing it
            omits (the footer holds the only links to the privacy policy and
            terms, so it was never optional).

            **Deprecated, not deleted.** All three components are still in
            web/src/components, still complete, still importing cleanly —
            they are simply not rendered, which is the same state Header,
            Hero, RoomsGrid and phone/HomePhone are in after this handoff
            replaced them. Bringing any of them back is re-adding an import
            and a line here; there is nothing to reconstruct.

            Worth knowing what leaves with them, because it is not only
            layout. ShowYourWorking is this project's "Claim and proof"
            section — three claims down the page with the thing each one
            claims running beside it, on live board data — and it is the
            only place the product's own numbers are shown being computed.
            TakeAPick is the interactive third-round demo. CLAUDE.md has a
            section on each; both are still accurate about the components,
            which still exist. */}
      </main>

      {/* ---------- Footer, restructured after a real competitor's (Sleeper's)
          own footer ---------- Logo, then socials, stacked top-left;
          everything else in equal-width columns to the right —
          Rooms/Method/Legal.

          Three columns, not the reference footer's four. That shape was
          taken from Sleeper's (Available-on/Company/Resources/Play) and it
          works there because all four hold a set. Ours held two real ones
          and then a "Company" column whose entire contents was one email
          address, with the same address repeated under Legal beside two
          documents. A heading promises a set; one item under it is what
          made the footer read as unfinished, rather than anything about the
          address itself. About Us and Careers had gone earlier for having
          nowhere to point, which is what left it at one.

          So Company goes, Legal is two legal documents again, and the
          address appears once — in the brand stack, next to the socials,
          which is where the other way of reaching a person already was.
          gap-x-10/gap-y-12 on both breakpoints is the one spacing scale for
          the whole footer, rather than a different hand-picked value per
          section, which is what "evenly spaced" actually means here: every
          gap between every pair of sections is the same number, not just
          visually close. */}
      <footer className="mt-[72px] border-t border-line-hairline bg-surface-nav">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-10 py-14 lg:grid lg:grid-cols-4 lg:gap-x-10 lg:gap-y-12">
          <FooterBrandStack onSocialClick={openSocial} linkClass={roomLinkClass} />

          <FooterColumn title="The Rooms">
            {rooms.map((room) => (
              <FooterRoomLink key={room.name} room={room} onSignup={openRoom} className={roomLinkClass} />
            ))}
          </FooterColumn>

          <FooterColumn title="Method">
            {METHOD_LINKS.map((link) => (
              <a key={link.label} href={link.href} className={roomLinkClass}>
                {link.label}
              </a>
            ))}
          </FooterColumn>

          <FooterColumn title="Legal">
            {LEGAL_LINKS.map((link) => (
              <a key={link.label} href={link.href} className={roomLinkClass}>
                {link.label}
              </a>
            ))}
          </FooterColumn>
        </div>

        <ComingSoonModal ref={modalRef} />
        <EarlyAccessModal ref={earlyAccessRef} />

        {/* The legal/copyright row — a single centred line, matching the
            reference footer's own bottom bar, plus the one Juke-specific
            trust line (what a solo draft does and doesn't send anywhere)
            that has no equivalent in a reference built for a different
            product, kept because it's true and worth keeping rather than
            cut to match a shape that has no room for it. */}
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-3 border-t border-line-divider px-10 py-6 text-center">
          <p className="max-w-[560px] text-[13px] text-voidInk-muted">
            A solo mock draft runs entirely in your browser — nothing you draft is sent anywhere.
            Drafting with your league uses a server, just for that room.
          </p>
          <span className="font-numeral tabular-nums text-xs font-medium text-voidInk-muted">&copy; 2026 Juke. All rights reserved.</span>
        </div>

        {/* The footer's one static closing line — see useDataFreshness()
            above for where both numbers actually come from. Renders
            nothing until window.JukeEngine has answered (same
            fails-by-disappearing contract as the score strip), rather than
            a placeholder that would flash a wrong count for one frame. */}
        {freshness && (
          <div className="mx-auto max-w-[1200px] px-10 pb-6 text-center">
            <p className="font-numeral tabular-nums text-xs font-medium text-voidInk-muted">{freshness}</p>
          </div>
        )}
      </footer>
      </div>
    </>
  )
}
