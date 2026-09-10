import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { SignedOut, SignInButton, SignUpButton } from '@clerk/clerk-react'
import { ChevronRight, Lock, Play, Sparkles } from 'lucide-react'
import JukeLogo from '../juke-logo/JukeLogo.jsx'
import EarlyAccessModal from '../EarlyAccessModal.jsx'
import FloatingNavPill, { NAV_PILL_CLEARANCE } from './FloatingNavPill.jsx'
import { ROOM_ICON_BY_NAME, ROOM_SIGNUP_SOURCE, roomSignupCopy } from '../icons.jsx'
import { useAccountUiReady } from '../../hooks/useAccountUiReady.js'
import { useRooms } from '../../hooks/useRooms.js'
import { freshnessLine } from '../dataFreshness.js'
import { POS_CHALK, CELL_INK } from '../draftRoomPositions.js'

/* The phone homepage, and it is a different product from the desktop one.

   The marketing page reads top to bottom — a slogan, a headline, a
   paragraph, a live scoring demo, a proof section, a room grid, a closing
   band, a footer. That is 8,122px on a 390px screen, and it is the right
   shape for somebody who arrived from a link and is deciding whether Juke
   is worth trying. It is the wrong shape for the person this screen is
   actually for: somebody who has already decided, has the site on their
   home screen, and wants to start a draft.

   So this is a launcher rather than a pitch. What you can play, what you
   were in the middle of, what is coming — three answers, in the order
   somebody opening the app wants them, above the fold or one thumb-flick
   below it.

   ---- Everything here is real ----

   The rooms come from ROOMS through the engine, the resume band from
   inProgressSummary(), the player count and freshness from PLAYERS_META,
   the position colours from the same six the board fills a cell with. A
   launcher made of plausible-looking sample cards is the failure this
   project's own product-shot and door sections already argue against at
   length: it looks identical tonight and is wrong the first morning the
   pipeline moves.

   ---- Why "playful" is colour and motion and not illustration ----

   The reference app leads with a rendered 3D mascot. Juke has no such
   asset and drawing one is a design commission, not a code change — and
   this project's standing rule is that a picture is a file to rebuild
   every time the palette moves and is wrong the first time somebody
   forgets. What it does have is six saturated position colours and a real
   board, so the play here comes from those: a live colour-coded strip of
   what the board actually looks like, cards that press, and a hero that
   moves once on arrival.
*/

function useEngine() {
  const [engine, setEngine] = useState(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const read = () => { if (window.JukeEngine) setEngine(window.JukeEngine) }
    read()
    /* "juke:header" is the app's one "something changed, re-read the
       bridge" signal, and it is what tells this screen a draft was
       discarded or resumed in another tab. Cheaper than polling and it is
       the same channel DraftRoom.jsx's own useJukeTick already listens on. */
    window.addEventListener('juke:header', read)
    return () => window.removeEventListener('juke:header', read)
  }, [])
  return engine
}

/* The saved draft, if there is one.

   engine.inProgressSummary() is guarded on its own (CLAUDE.md records the
   cold-load ReferenceError that came of trusting a caller to check
   dataReady() first), so this can call it as soon as the bridge exists and
   simply gets null until the deferred data lands. The `tick` dependency is
   what makes it try again once it has. */
function useInProgress(engine, tick) {
  const [draft, setDraft] = useState(null)
  useEffect(() => {
    if (!engine) return
    try { setDraft(engine.inProgressSummary()) } catch { setDraft(null) }
  }, [engine, tick])
  return draft
}

/* A strip of the real board, colour-coded — the one genuinely playful
   thing on this screen and the one thing on it that could not be a
   picture. Six cells, the top of tonight's board, each in its position's
   own chalk fill with CELL_INK on it, which is exactly the pairing the
   draft room's own cells use — the same two maps, so this strip cannot
   drift into being a second opinion about what a running back looks like.

   It renders nothing at all until the board has landed rather than drawing
   placeholders: the score strip's own contract, and the reason is the same
   — a strip of grey rectangles that becomes a strip of names is a worse
   first paint than a strip that arrives whole. */
function BoardTaste({ engine, tick }) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    if (!engine || !engine.dataReady || !engine.dataReady()) return
    const board = engine.board() || []
    setRows(board.slice(0, 6).map((p) => ({
      name: engine.shortName ? engine.shortName(p) : p.name,
      pos: p.pos,
      team: p.team,
    })))
  }, [engine, tick])

  if (!rows.length) return null

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {rows.map((r, i) => (
        <motion.div
          key={r.name}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.35 }}
          className="flex w-[112px] shrink-0 flex-col justify-between rounded-2xl px-3 py-2.5"
          style={{ backgroundColor: POS_CHALK[r.pos] || '#C9D1DA', color: CELL_INK }}
        >
          <span className="font-plex text-[10px] font-semibold tracking-tight opacity-70">
            {r.pos === 'DST' ? 'DEF' : r.pos} · {r.team}
          </span>
          <span className="mt-2 truncate text-meta font-bold leading-tight">{r.name}</span>
        </motion.div>
      ))}
    </div>
  )
}

function SectionTitle({ children, emoji }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 font-display text-[19px] font-bold uppercase italic tracking-[0.01em] text-white">
      {emoji && <span aria-hidden="true" className="not-italic">{emoji}</span>}
      {children}
    </h2>
  )
}

/* A game row — the reference app's own "PRACTICE DRAFT STRATEGY / Mock
   Draft / PLAY" shape. The whole row is the target, not just the pill:
   a 44px pill inside a 78px card means two thirds of the card looks
   pressable and is not, which is the dead-control problem in miniature. */
function GameRow({ icon, eyebrow, title, cta, href, onClick, locked, hero }) {
  const inner = (
    <>
      <span
        className={
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] ' +
          (locked ? 'bg-white/[0.05] text-white/35' : 'bg-teal-500/15 text-teal-300')
        }
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={'block font-plex text-[10px] font-semibold uppercase tracking-[0.1em] ' + (locked ? 'text-white/30' : 'text-teal-300/80')}>
          {eyebrow}
        </span>
        {/* 20px, not 21, and the CTA pill below is 11px rather than 12.
            Measured at 390px: "Draft With Friends" at 21px against a 12px
            "START" pill ellipsised to "Draft with fri…", which is the one
            thing a game row must not do — the title IS the game. Two
            points off the title and one off the pill buys 30px and the
            longest name this list can hold fits with room to spare. */}
        <span className={'mt-0.5 block truncate font-display text-[20px] font-bold ' + (locked ? 'text-white/45' : 'text-white')}>
          {title}
        </span>
      </span>
      <span
        className={
          'flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2 font-body text-[11px] font-bold uppercase tracking-[0.06em] ' +
          (locked ? 'border border-white/10 text-white/35' : 'border border-white/15 text-white')
        }
      >
        {locked && <Lock className="h-3 w-3" aria-hidden="true" />}
        {cta}
      </span>
    </>
  )
  const cls =
    'flex w-full items-center gap-3 rounded-[18px] border border-line-hairline bg-surface-card px-3.5 py-3.5 text-left transition-transform duration-150 active:scale-[0.985]'
  /* data-hero-cta on the one row that is this page's primary action, for
     the same reason the desktop hero's anchor carries it: sonar.spec.mjs
     hit-tests the page's main call to action to prove the boot overlay is
     really gone rather than merely invisible. It found that control by an
     attribute the marketing page owns, and the phone launcher carried
     none — so the check reported "the hero CTA rendered: false" on a page
     that was perfectly healthy. An attribute says what an element IS; a
     class or a label says what it currently looks like. */
  return href
    ? <a href={href} data-hero-cta={hero ? '' : undefined} className={cls}>{inner}</a>
    : <button type="button" onClick={onClick} data-hero-cta={hero ? '' : undefined} className={cls}>{inner}</button>
}

export default function HomePhone() {
  const engine = useEngine()
  const [tick, setTick] = useState(0)
  const rooms = useRooms()
  const modalRef = useRef(null)
  const inProgress = useInProgress(engine, tick)
  const [freshness, setFreshness] = useState(null)
  const accountUiReady = useAccountUiReady()

  useEffect(() => {
    setFreshness(freshnessLine())
    /* One retry after the deferred data window rather than a poll.
       players.js/stats.js land via requestIdleCallback (see app.js's boot),
       so PLAYERS_META can genuinely not exist yet on the first pass — and
       the freshness line's own contract is to render nothing rather than a
       wrong count, so without this it renders nothing for the whole visit. */
    const id = setTimeout(() => { setFreshness(freshnessLine()); setTick((n) => n + 1) }, 900)
    return () => clearTimeout(id)
  }, [engine])

  const openRoom = (room) =>
    modalRef.current?.open(roomSignupCopy(room), ROOM_SIGNUP_SOURCE[room.name])

  const liveRoom = rooms.find((r) => r.live)
  const soon = rooms.filter((r) => !r.live)

  return (
    <div className="min-h-screen bg-surface-page font-body text-voidInk-primary">
      {/* Compact bar. Not the desktop Header — that one is a nav with four
          links, a rooms dropdown and a sign-up CTA, which is a site's
          header. This screen has a nav pill at the bottom, so the top only
          has to say where you are. */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line-hairline bg-surface-nav/90 px-4 py-3 backdrop-blur-xl">
        <JukeLogo size={20} />
        <span className="flex-1" />
        <a
          href="#/drafts"
          className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 font-body text-meta font-bold text-[#0B0D12] transition-transform active:scale-95"
        >
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          Play
        </a>
      </header>

      <main className="px-4 pt-5" style={{ paddingBottom: NAV_PILL_CLEARANCE }}>
        {/* The hero. Two lines, no paragraph — the desktop page's own
            sentence about waivers and trades being in build is a pitch, and
            somebody who opened the app from their home screen has read it
            or does not need it. The Rooms section below says the same thing
            by showing five locked doors, which is the honest version. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          {/* data-hero-eyebrow: the same kind of hook as data-start-draft.
              phone.spec.mjs measures the gap between the fixed header and
              the first thing under it, and it found that first thing by
              matching the slogan's own words — which broke the moment there
              were two homepages and the phone's eyebrow was a <p> with an
              icon in it rather than a bare <span>. The property under test
              has nothing to do with the words. */}
          <p data-hero-eyebrow className="flex items-center gap-1.5 font-display text-meta font-extrabold uppercase italic tracking-[0.06em] text-mint">
            <Sparkles className="h-3.5 w-3.5 not-italic" aria-hidden="true" />
            Agility through analytics
          </p>
          <h1 className="mt-2 font-display text-[42px] font-extrabold italic uppercase leading-[0.92] tracking-normal">
            <span className="text-white">Start a</span>
            <br />
            <span className="text-mint">mock draft.</span>
          </h1>
        </motion.div>

        {/* The board, tonight, in the colours the draft room actually uses. */}
        <div className="mt-5">
          <BoardTaste engine={engine} tick={tick} />
        </div>

        {/* Pick up where you left off, and only when there is something to
            pick up. Above the games list on purpose: an unfinished draft is
            a more urgent ask than a new one, the same order DraftLocker's
            own InProgressBand already takes over its "what to run next"
            card. */}
        {inProgress && (
          <a
            href="#/drafts"
            className="mt-6 flex items-center gap-3 rounded-[18px] border border-teal-400/30 bg-teal-500/[0.07] px-4 py-3.5 transition-transform active:scale-[0.985]"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-plex text-[10px] font-semibold uppercase tracking-[0.1em] text-teal-300">
                In progress
              </span>
              <span className="mt-0.5 block truncate text-[15px] font-bold text-white">
                {inProgress.teams}-team {inProgress.scoring} · round {inProgress.round}
              </span>
              <span className="mt-0.5 block text-[12px] text-voidInk-muted">
                {inProgress.made} of {inProgress.total} picks made · you pick {inProgress.pickPosition}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-teal-300" aria-hidden="true" />
          </a>
        )}

        <div className="mt-7">
          <SectionTitle emoji="🏈">Draft games</SectionTitle>
          <div className="flex flex-col gap-2.5">
            <GameRow
              icon={<Play className="h-5 w-5 fill-current" />}
              eyebrow="Practice draft strategy"
              title="Mock Draft"
              cta="Play"
              href="#/drafts"
              hero
            />
            {/* Drafting with friends is real and already built — creating a
                room is a live feature — but it is a link row here rather
                than a second GameRow, for two reasons that both turned up
                by looking rather than by reasoning.

                It goes to the same #/drafts as the row above it, and two
                cards of identical weight pointing at one destination reads
                as a bug. And "Draft With Friends" does not fit a GameRow:
                measured at 390px it wanted 208px of the 184 the title has
                between a 48px icon and the CTA pill, so it ellipsised to
                "Draft With Fri…" — and the title IS the game, so a game
                row that truncates it is the one thing this shape must not
                do. A full-width row has the whole width and no such
                problem. */}
            <a
              href="#/drafts"
              className="flex items-center gap-2 rounded-[18px] border border-dashed border-line-hairline px-3.5 py-3 transition-transform duration-150 active:scale-[0.985]"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-teal-300" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-voidInk-body">
                Or draft with friends &mdash; same board, real managers
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/35" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* Accounts, on a phone. Until this card existed there was no way
            to sign up or log in below `sm` at all: every AccountButtons
            call site (Header, LobbyBar, MobileNavSheet) sits inside
            Homepage.jsx's `hidden sm:block` half, so the whole feature
            shipped to desktop only. That is the breakpoint-split hazard
            CLAUDE.md already names for data-hero-cta — "splitting a page by
            breakpoint orphans every attribute only one half of it carries"
            — reached with a feature instead of a test marker.

            A card in the flow rather than two more controls in the top bar,
            and that is a measurement rather than a preference: the bar
            holds the wordmark and Play, and logo + Play + Log in + Sign up
            comes to ~370px of content on a 390px screen — no slack at all,
            and an overflow outright at 360. Dropping Play to make room was
            the other option and it is backwards for this product: Play is
            what a signed-out visitor is here for, which is the same thing
            the "FREE · NO ACCOUNT NEEDED" line below promises.

            Which is also why the copy leads with what an account is *for*
            rather than with "Sign up". This page tells you two screens
            further down that no account is needed, and that is true — a
            solo mock still runs without one. An account buys exactly what
            app.js's cross-device sync does (SAVE_KEY and the locker
            mirrored to /me/draft and /me/history), so the card says that
            and nothing more. A bare Sign Up button here would read as a
            gate on a page whose whole pitch is that there isn't one.

            Signed in it disappears entirely — the FloatingNavPill's own
            "You" tab is where a signed-in person's account lives, so a card
            still selling the account to somebody who has one would be the
            dead-control problem in a new place. */}
        {accountUiReady && (
          <SignedOut>
            <div className="mt-7 rounded-[18px] border border-line-hairline bg-surface-card px-3.5 py-4">
              <p className="font-plex text-[10px] font-semibold uppercase tracking-[0.1em] text-teal-300">
                Optional
              </p>
              <p className="mt-1 font-display text-[19px] font-bold leading-tight text-white">
                Keep your drafts on every device
              </p>
              <p className="mt-1 text-meta leading-snug text-voidInk-body">
                An account saves the draft you have going and every report in your
                locker, so they follow you from your phone to your desk. Mocks still
                run fine without one.
              </p>
              {/* h-11 is §9's tap-target floor, the same 44px the nav pill's
                  own rows keep — and unlike the desktop nav there is width
                  to spare here, so both buttons take an equal half rather
                  than sizing to their labels. Sign up stays the loud one. */}
              <div className="mt-3.5 flex gap-2.5">
                <SignUpButton mode="modal">
                  <button
                    type="button"
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-gradient-to-r from-[#22d3ee] to-[#a78bfa] text-[15px] font-bold text-white transition-transform duration-150 active:scale-[0.97]"
                  >
                    Sign up
                  </button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-line-hairline text-[15px] font-semibold text-voidInk-body transition-colors duration-150 active:border-white/30"
                  >
                    Log in
                  </button>
                </SignInButton>
              </div>
            </div>
          </SignedOut>
        )}

        <div className="mt-7" id="rooms">
          <SectionTitle emoji="🚪">The Rooms</SectionTitle>

          {liveRoom && (
            <a
              href={liveRoom.href}
              className="mb-2.5 flex items-center gap-3 rounded-[18px] border border-line-hairline bg-gradient-to-br from-[rgba(0,229,255,0.10)] to-[rgba(123,31,162,0.10)] px-3.5 py-3.5 transition-transform active:scale-[0.985]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-teal-500/15 text-teal-300" aria-hidden="true">
                {(() => { const I = ROOM_ICON_BY_NAME[liveRoom.name]; return I ? <I className="h-6 w-6" /> : null })()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="h-[6px] w-[6px] rounded-full bg-teal-400" aria-hidden="true" />
                  {/* "Free Access", not "Live" — the same label the desktop
                      RoomsGrid and the Rooms dropdown carry for this same
                      room, and for the same reason: every other room now
                      wears a Juke Pro / All-Access tag, so what distinguishes
                      this one is not that it works but that it costs
                      nothing. This row was the last place still saying
                      "Live", which is exactly the drift the shared
                      ROOM_TIER data was introduced to stop, surviving in the
                      half of the homepage that data never reached. */}
                  <span className="font-plex text-[10px] font-semibold uppercase tracking-[0.1em] text-teal-300">
                    Free Access · {liveRoom.season}
                  </span>
                </span>
                <span className="mt-0.5 block truncate font-display text-[21px] font-bold text-white">{liveRoom.name}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-voidInk-body">{liveRoom.lead}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-white/40" aria-hidden="true" />
            </a>
          )}

          {/* A locked door rather than a greyed-out card. Five things
              missing is the worst available framing of a roadmap; five
              doors you have not opened yet is the same fact told properly,
              and nothing here overclaims — `season` comes straight from
              ROOMS. */}
          <div className="grid grid-cols-2 gap-2.5">
            {soon.map((room, i) => {
              const Icon = ROOM_ICON_BY_NAME[room.name]
              return (
                <motion.button
                  key={room.name}
                  type="button"
                  onClick={() => openRoom(room)}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ delay: 0.04 * i, duration: 0.3 }}
                  className="flex flex-col items-start rounded-[18px] border border-line-hairline bg-surface-card px-3.5 py-3.5 text-left transition-transform duration-150 active:scale-[0.985]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white/[0.05] text-white/40" aria-hidden="true">
                    {Icon ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                  </span>
                  <span className="mt-2.5 font-display text-[16px] font-bold leading-tight text-white/80">
                    {room.name.replace(/^The\s+/, '')}
                  </span>
                  <span className="mt-1 flex items-center gap-1 font-plex text-[10px] font-semibold uppercase tracking-[0.08em] text-voidInk-muted">
                    <Lock className="h-[10px] w-[10px]" aria-hidden="true" />
                    {room.season}
                  </span>
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* The one line of small print that earns its place on a launcher:
            what the board is made of and when it last moved. Both numbers
            are derived — see dataFreshness.js on why a literal count would
            be stale within a day. */}
        {freshness && (
          <p className="mt-7 text-center font-numeral text-[12px] tabular-nums text-voidInk-muted">
            {freshness}
          </p>
        )}
        {/* The free/no-account claim, which this page did not make at all
            until a parity check went looking for it. The desktop page has
            carried it since the rebrand ("Free Draft Room · No Account
            Needed") and it is one of the two things a visitor most wants to
            know — a launcher that omits it is not being concise, it is
            leaving out a reason to press the button. The browser half is
            Juke's own, and true: a solo mock, signed out, sends nothing
            anywhere.

            "NO ACCOUNT NEEDED", not "NO ACCOUNT" — which is what this said
            until accounts shipped, and which stopped being true while
            sitting three cards below one offering to make you one. The
            promise a visitor cares about is that nothing is being asked of
            them, and that is still exactly true; the flat version now reads
            as a claim about the product that the same screen contradicts. */}
        {/* Each claim is its own nowrap span so the line breaks BETWEEN
            them rather than through one. At 375px the three no longer fit
            on one line ("NO ACCOUNT" became "NO ACCOUNT NEEDED"), and the
            default break put "RUNS IN YOUR / BROWSER" across two lines,
            which reads as a typo rather than as a list. */}
        <p className="mt-1.5 text-center font-plex text-[11px] tracking-[0.08em] text-voidInk-muted">
          <span className="whitespace-nowrap">FREE</span>{' '}&middot;{' '}
          <span className="whitespace-nowrap">NO ACCOUNT NEEDED</span>{' '}&middot;{' '}
          <span className="whitespace-nowrap">RUNS IN YOUR BROWSER</span>
        </p>
        <div className="mt-4 flex justify-center gap-4">
          <a href="/docs/draft-room-how-it-works.html" className="text-[12px] text-voidInk-body underline-offset-2 hover:underline">How it works</a>
          <a href="/docs/privacy.html" className="text-[12px] text-voidInk-body underline-offset-2 hover:underline">Privacy</a>
          <a href="/docs/terms.html" className="text-[12px] text-voidInk-body underline-offset-2 hover:underline">Terms</a>
        </div>
      </main>

      <EarlyAccessModal ref={modalRef} />
      <FloatingNavPill />
    </div>
  )
}
