import { Fragment } from 'react'
import { formatClock } from './PickTicker.jsx'
import { motion } from 'framer-motion'
import { ChevronLeft, Clock, MoreHorizontal, Settings, Volume2, VolumeX } from 'lucide-react'
import JukeLogo from './juke-logo/JukeLogo.jsx'

// Players first — it's the default live-draft view now (DraftRoom.jsx),
// the ESPN-style screen most of a draft is actually spent on. Decide moved
// third rather than dropping to last: it still answers "what should I do
// right now," just no longer the first thing a manager sees.
//
// Insights, after Analysis: the two swap places with Decide across the
// draftIsOver edge below, so the tab count never changes, only which
// fourth tab occupies the slot Decide leaves behind. It used to be a
// `fixed inset-0` modal reached only through a floating pill over
// whichever tab was active — a real destination on this same bar needs
// neither, and DraftRoom.jsx already switches straight to it the moment a
// draft ends (see that file's draftIsOver effect).
//
// Labelled "Insights" here, not "Draft Insights" — every other label in
// this row is already one word, and "Draft" is the one piece of context
// this whole bar already supplies just by existing. The tab's own content
// still says "Draft Insights" in full, once, as its actual heading; this
// is the nav label, not the title, and the header's own width budget (see
// the file-level comment on the 62px bar) has never had room to spend on
// a word the bar itself already means.
const TABS = [
  { key: 'players', label: 'Players' },
  { key: 'board', label: 'Board' },
  { key: 'decide', label: 'Decide' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'insights', label: 'Insights' },
]

// Replaces DraftRoomStatusBar's role at both its call sites in
// DraftRoom.jsx — one component, a `preDraft` prop swapping the tab row
// for the pre-draft label, exactly the branch DraftRoomStatusBar already
// made. 62px per the Cockpit handoff, not the old h-14 (56px) — settled
// once here since the market ticker strip below it and the page's own
// top padding both have to move with it (see DraftRoom.jsx's own
// pt-[62px]/md:pt-[86px] comment).
//
// The chevron-back control isn't in the handoff's own header mockup —
// its Cockpit prototype treats the logo as the only way home. But the
// Finish handoff explicitly names "the chevron top-left" as one of the
// four exit doors, and this app already has one real, working
// destination for it (#/drafts, the locker) that a manager mid-draft
// still needs. Kept as its own control rather than removed on the
// strength of one prototype's omission.
//
// No live tabs pre-draft: the Entry screenshot shows the three tab
// labels even before a draft starts, but nothing behind Board or
// Analysis exists yet at that point, and a tab that looks pressable and
// does nothing is the exact "dead control" trap this handoff's own
// review caught elsewhere. Pre-draft keeps DraftRoomStatusBar's own
// label-slot precedent (the league problem, or "Choose your seat")
// instead.
export default function DraftCockpitHeader({
  preDraft,
  problem,
  startLabel,
  startLabelShort,
  waitingForHost,
  startDisabled,
  onStartDraft,
  cockpitTab,
  onSelectTab,
  round,
  overall,
  code,
  myTurn,
  urgent,
  over,
  clockLength,
  timeLeft,
  autopick,
  onToggleAutopick,
  onOpenMenu,
  soundOn,
  onToggleSound,
  // Set by the Board tab (and, later, Players): both mount PickTicker.jsx
  // directly under this bar, which repeats the round/pick/clock the centre
  // pill already shows. Only suppresses the live round/pick pill itself —
  // preDraft's own label and the "Draft complete" pill still need to show
  // somewhere, and neither tab that sets this ever mounts while either of
  // those two is the active state (the ribbon needs a live onClock/code to
  // draw at all).
  hidePill,
}) {
  const pct = clockLength ? Math.max(0, Math.min(100, (timeLeft / clockLength) * 100)) : 0
  const clock = clockLength && timeLeft != null ? formatClock(timeLeft) : null

  return (
    <Fragment>
      {/* Three grid tracks, not a flex row with two flex-1 spacers either
          side of the pill. Flex-1 spacers only centre content in the space
          *left over* after both side blocks — and those two blocks are not
          the same width (chevron+logo+tabs on the left runs to ~400px at
          lg, autopick+kebab on the right is under half that), so the pill
          sat visibly off-centre, measured 86px right of the bar's true
          centre at 1280px. `1fr auto 1fr` is the same fix CLAUDE.md already
          documents for the legacy `.shellbar`/`.appbar-inner` header doing
          the identical job: forcing the two outer tracks to equal width is
          what makes the middle one sit on the bar's real centre regardless
          of how much either side is carrying, rather than merely being
          centred between them.

          Two things had to be fixed, not one, and the first fix alone
          looked like it hadn't worked at all. minmax(0,1fr), not a bare
          1fr — a bare 1fr track defaults to minmax(auto,1fr), which floors
          the track at its own content's min-content size before the fr
          weights ever get a say. With the left block needing ~400px at lg
          and the right needing under 150, that floor bound asymmetrically:
          left claimed its whole minimum first, *then* the two shared what
          was left 1:1, so the tracks ended up unequal again, just less so
          — measured at 34px off-centre instead of 86. minmax(0,…) removes
          the content floor entirely, and DOES force the two tracks to the
          same width — measured 451.2px each afterwards, exactly equal.

          The pill still sat 34px off-centre with equal tracks either side
          of it, because a grid item's default alignment is stretch: the
          pill's own div (and the preDraft/over spans in the other two
          branches) had no width set, so each filled the *entire* middle
          track and then left-aligned its own content inside that
          stretched box — visually indistinguishable from never having
          been centred. justify-self-center on all three is the other
          half: it sizes each box to its own content instead of stretching
          it, so *that* box is what lands centred on the track, and its
          content with it.

          Five blocks want this bar and it is 62px tall, not wide: measured at
          their natural widths, chevron 28 + logo 95 + divider 1 + tabs 210 +
          the pick pill 313 at its widest + controls 158 is 805px of content,
          and seven 22px gaps and 48px of padding put the minimum at 1007. That
          is an lg bar. It had been overflowing every width below it - 916
          against 768, 685 against 640 - with the surplus running off the right
          edge, where the controls sat. So four things stand down below lg, in
          the order of what can wait, and every one of them is measured rather
          than guessed.

          The gaps are the first: 22px between eight blocks is 154px, more than
          the logo and the tabs together. 12px until lg rather than 22 until
          sm, and the 24px side padding holds at 16 with them. The worst case is
          not the one on screen while you check: "Pick 140" and a 14.10 clock is
          13px wider than the round-one pill at 375 and 38px wider at 768, and
          it is the one that has to fit. At 14px this cleared 768 and missed 375
          by a single pixel, which is the kind of margin that is not a margin -
          12 takes the phone to 368 against 375 and 768 to 746. */}
      <header
        className={
          'fixed inset-x-0 top-0 z-50 ' +
          /* This 62px bar is unconditional (every breakpoint) while
             preDraft — the seat-picker/entry screen is outside every one of
             the mobile redesign prompts, so its mobile header stays exactly
             what it already was rather than gaining a half-finished second
             treatment. Once a draft is live, this bar is lg+ only: the
             46px header just below takes over below lg, built for the
             ribbon+band stack those prompts add underneath it rather than
             this bar's own pick pill, which the ribbon replaces on Board
             and Players anyway (hidePill, above). */
          (preDraft ? 'grid ' : 'hidden lg:grid ') +
          'h-[62px] shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-white/[0.06] bg-slate-bar/90 px-4 backdrop-blur-md lg:px-6 xl:gap-[22px]'
        }
      >
        <div className="flex min-w-0 items-center gap-3 xl:gap-[22px]">
        <a
          href="#/rooms/draft"
          aria-label="Back to your draft locker"
          title="Back to your draft locker"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-rule bg-slate-sunk/60 text-white/50 transition-colors duration-150 hover:border-slate-rule hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </a>
        {/* The logo is the second thing to stand down and the easiest: the
            chevron immediately to its left already goes back, so this is the
            second way out of a bar that has room for one - the same call the
            legacy header made when it merged its mark and its chevron into a
            single control. 95px of lockup plus a 22px gap plus the divider and
            its gap is 140px, the largest single saving available here, and
            mark-only would have returned just 63 of it.

            ---- The concession is at xl now, and it used to be at lg ----

            All of that arithmetic was done for a bar that rendered at EVERY
            width. It is `hidden lg:grid` once a draft is live (the note on the
            className above says why), so `lg:block` stopped meaning "stand
            down when the bar is tight" and started meaning "whenever this bar
            exists at all" - the saving was being collected only at widths the
            bar no longer occupies.

            So at 1024, the narrowest width this bar now has, the left cell got
            345px and its contents wanted 463. Nothing up the tree clips it,
            checked rather than assumed, so the tab nav painted from 391 to 487
            straight over the centre cell - the pick pill, the one thing on the
            bar that says whose turn it is, on the two tabs that draw it.
            Measured on Decide: 96px of overlap at 1024, 58 at 1100, 18 at
            1180, gone by 1260. Players and Board never showed it because
            hidePill empties the centre column there, which is why this needed
            a per-tab sweep to find at all.

            It is a symmetric `1fr auto 1fr`, so the left cell can never exceed
            (bar - pill)/2 however much the right cell leaves unused - 149px of
            it at 1024. That is what makes a dead-centre pill and a left block
            wider than half the remainder mutually exclusive, and why the fix
            is a subtraction rather than a reflow.

            The cost is stated rather than hidden: between lg and xl this bar
            carries no wordmark, while the 46px header below lg does. Function
            beats brand on a bar that has run out of room, and the chevron is
            still the way home. preDraft keeps it at lg because that branch
            renders no nav at all - see `{!preDraft && (<nav` below - so it has
            the room. */}
        <a
          href="#/"
          aria-label="Juke home"
          className={'hidden shrink-0 ' + (preDraft ? 'lg:block' : 'xl:block')}
        >
          <JukeLogo size={19} surface="appbar" />
        </a>

        <div
          className={
            'hidden h-6 w-px shrink-0 bg-white/10 ' + (preDraft ? 'lg:block' : 'xl:block')
          }
        />

        {/* The tabs do not stand down between md and lg, and that is
            deliberate: `decide` swaps the whole content area, so a width that
            can reach this nav and nothing else is a width with no way off
            whichever view you are on. Only the gap gives, 20px to 12px below
            lg, which is 16px back.

            Below md this nav is hidden and MobileDraftTabBar.jsx is what
            answers for it - a bottom bar, lg:hidden, carrying Decide and Board
            beside the two PlayerHub tabs. Until that arrived, hiding this nav
            below md left the view opening on `decide` with no way out of it,
            and an earlier version of this comment said so and proposed the
            kebab menu. That is now fixed and fixed somewhere better, so the
            note is corrected rather than left standing. */}
        {!preDraft && (
          <nav className="hidden shrink-0 items-center gap-3 md:flex xl:gap-5">
            {/* Decide has nothing left to decide once the draft is over —
                DraftRoom.jsx already redirects off it on that edge, and a
                design review asked for the tab itself to disappear too
                rather than stay selectable onto a dead end. Insights is
                the mirror image: nothing to show before a draft is over
                (there is no report yet), so it stays out of the row until
                the same edge that retires Decide. */}
            {TABS.filter((t) => (over ? t.key !== 'decide' : t.key !== 'insights')).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => onSelectTab(t.key)}
                aria-pressed={cockpitTab === t.key}
                className={
                  'border-0 bg-transparent p-0 font-body text-xs font-bold uppercase tracking-[0.1em] transition-colors ' +
                  (cockpitTab === t.key ? 'text-teal-300' : 'text-white/50 hover:text-white/75')
                }
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}
        </div>

        {/* justify-self-center on all three branches — a grid item's
            default alignment is stretch, so without this each one filled
            the whole middle track (itself now correctly centred, per the
            comment on the header's own grid-cols above) and then
            left-aligned its own content inside that stretched box, which
            looked identical to the pill never having been centred at all.
            centering the box itself at its natural width is what actually
            lands the content on the bar's true centre. */}
        {preDraft ? (
          /* max-w + truncate, not truncate alone: justify-self-center sizes
             this box to its own content's natural width, so without a cap
             "truncate" never had anything to actually truncate — the span
             was always exactly as wide as "Nobody has picked yet" wanted to
             be, full stop. At 375px in a room, that's wide enough on its
             own to force the right-hand controls (Autopick+Sound+Gear+the
             Start/Waiting button, none of them shrinkable) out past their
             own track and visually over this text. The cap gives truncate
             something to bite against below lg, where the room for both
             sides is tightest. */
          <span
            className="min-w-0 max-w-6 justify-self-center truncate font-plex text-xs text-white/60 sm:max-w-[100px] lg:max-w-none"
            title={problem || undefined}
          >
            {problem || 'Nobody has picked yet'}
          </span>
        ) : over ? (
          <span className="inline-flex items-center gap-2 justify-self-center rounded-full bg-emerald-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-300">
            Draft complete
          </span>
        ) : hidePill ? (
          <span className="justify-self-center" />
        ) : (
          <div
            className={
              'flex items-center gap-1.5 justify-self-center rounded-full px-2 py-1.5 transition-colors duration-300 sm:gap-3.5 sm:px-3.5 ' +
              (myTurn
                ? urgent
                  ? 'bg-rose-500/20 shadow-[inset_0_0_0_1.5px_rgba(251,113,133,0.55)]'
                  : 'bg-teal-500/20 shadow-[inset_0_0_0_1.5px_rgba(0,229,255,0.55)]'
                : 'bg-white/[0.045]')
            }
          >
            <div className="flex flex-col gap-1">
              <span
                className={
                  'font-body text-[10px] font-bold uppercase tracking-[0.1em] ' +
                  (myTurn ? (urgent ? 'text-rose-400' : 'text-teal-300') : 'text-white/55')
                }
              >
                {/* xl, because "your turn" is the fourth thing on this pill
                    already saying so: it turns teal (rose when urgent), it
                    pulses, it grows a progress bar that exists on no other
                    turn, and this label goes teal with it. CLAUDE.md's own
                    note on the legacy header made this argument the other way
                    round - "by the time that sentence is readable the whole
                    header has turned blue" - so it is the redundant half, and
                    it is 70px of the pill's 313. The pick number underneath it
                    never gives; that one is the fact. */}
                {/* "Round N · " goes below sm and `Pick {overall}` stays, and
                    the split is between a fact that is duplicated here and one
                    that is not. The big number beside this is `code` -
                    pickCode(overall, teams), "3.05" - so it already carries the
                    round, and printing "Round 3" next to "3.05" spends 50px
                    saying it twice. `overall` is 25 in that same example and
                    appears nowhere else on the bar, so it is the half that
                    stays. */}
                <span className="hidden sm:inline">Round {round} · </span>Pick {overall}
                {/* The countdown, in digits, on the two tabs that had none.

                    hidePill is set by Board and Players because PickTicker
                    mounts under them and repeats this — so Decide and
                    Analysis fell through to the bar below, whose own
                    comment calls itself "the whole clock". A proportion
                    answers "roughly how much is left" and cannot answer
                    "forty seconds or four", which is the only reading that
                    changes what you do. The Decide tab exists to choose
                    under time pressure and was the tab that removed the
                    pressure from view.

                    Shown whenever a clock is running, not only on myTurn:
                    the bar renders only on your own turn, so on somebody
                    else's there was no time signal here at all. */}
                {clock != null && <span className="tabular-nums"> · {clock}</span>}
                {myTurn && <span className="hidden xl:inline"> · your turn</span>}
              </span>
              {/* This bar is the whole clock - the big number beside it is the
                  pick code, not a countdown - so it cannot go, but its width is
                  a proportion and carries nothing, and at 150px it was the
                  widest thing in this column and therefore the real floor under
                  the pill. 64px below sm was still that floor, and still too
                  wide: at 375px in a room, this pill (Autopick+Sound+Kebab
                  competing for the same row) measured a 22px overlap into the
                  right-hand controls even at 64px — a bug this comment's own
                  "the real floor" language had assumed away rather than
                  measured against the row it actually shares. 40px below sm. */}
              {myTurn && (
                <div className="h-[3px] w-8 overflow-hidden rounded-full bg-white/[0.12] sm:w-24 lg:w-[150px]">
                  <div
                    className={'h-full rounded-full ' + (urgent ? 'bg-rose-400' : 'bg-teal-400')}
                    style={{ width: pct + '%' }}
                  />
                </div>
              )}
            </div>
            <span
              className={
                /* 22px below sm, 26px below lg. Last and smallest of the four
                   steps, 4px this time, and the one to undo first if this bar
                   ever gets room back — it's the only lever left once the
                   progress bar and the pill's own padding had already given
                   up what they safely could, and this pill was still 10px
                   into Autopick/Sound/Kebab's own space at 375px. */
                'font-display text-[22px] font-bold leading-none tabular-nums sm:text-[26px] lg:text-[32px] ' +
                (myTurn ? (urgent ? 'text-rose-300' : 'text-teal-300') : 'text-white/70 text-base')
              }
            >
              {code}
            </span>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-0.5 justify-self-end sm:gap-2">
          {/* Nothing left to autopick once the draft is over — the toggle
              stayed fully lit and clickable on a finished board, which reads
              as a live control for a decision that no longer exists.
              pl-1.5 below sm, not the sm+ pl-3.5: that larger value exists
              to clear the "Autopick" label, which is itself hidden below
              sm — paying for a label's clearance with no label there was
              free width nobody was using, on the one bar where every pixel
              on the right side is already spoken for. */}
          <button
            type="button"
            onClick={onToggleAutopick}
            disabled={over}
            aria-pressed={autopick}
            title={over ? 'Draft complete' : undefined}
            className={
              'flex items-center gap-2.5 rounded-full bg-white/5 py-1.5 pl-1.5 pr-1.5 transition-colors duration-150 sm:pl-3.5 ' +
              (over ? 'cursor-not-allowed opacity-40' : 'hover:bg-white/[0.09]')
            }
          >
            <span className="hidden text-xs font-semibold text-white/70 sm:inline">Autopick</span>
            <span className={'relative block h-[18px] w-[34px] rounded-full transition-colors duration-200 ' + (autopick && !over ? 'bg-teal-500/70' : 'bg-white/[0.16]')}>
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white"
                style={{ left: autopick ? 18 : 2 }}
              />
            </span>
          </button>

          {/* Was a pill-switch buried on the settings modal's General tab,
              reachable only after a draft already existed to open settings
              on. A preference toggled mid-pick needs to be a tap away, not
              two screens deep — same reasoning Autopick already gets a
              header spot instead of living in a menu. Present in both
              modes, unlike the controls on either side of it: this is the
              one thing on this bar that isn't specific to before-the-draft
              or during-the-draft. Sized and styled identically to the
              gear/kebab buttons it now sits beside — one more 34px control
              plus its gap is the newest claim on this bar's already-tight
              budget (see the header's own comment above), so re-measure
              375/390/430px if anything here ever gets wider. */}
          <button
            type="button"
            onClick={onToggleSound}
            aria-pressed={soundOn}
            title={soundOn ? 'Turn draft sounds off' : 'Turn draft sounds on'}
            aria-label={soundOn ? 'Turn draft sounds off' : 'Turn draft sounds on'}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 transition-colors duration-150 hover:bg-white/[0.09] hover:text-white"
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {preDraft ? (
            <>
              {/* A separate control from Start — league shape is still
                  editable up until the real startDraft() call, same rule
                  DraftRoomStatusBar's own preDraft mode followed. Reuses
                  onOpenMenu: DraftRoom.jsx passes the same "open settings"
                  handler for both props pre-draft, since there's no menu
                  to open yet, only settings. */}
              <button
                type="button"
                onClick={onOpenMenu}
                title="Draft settings"
                aria-label="Draft settings"
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 transition-colors duration-150 hover:bg-white/[0.09] hover:text-white"
              >
                <Settings className="h-4 w-4" />
              </button>
              {waitingForHost ? (
                /* A guest can never press this — only the host starts the
                   room — so it never wore CTA styling honestly in the first
                   place; "Waiting for the host" in a gradient pill looks
                   exactly like a button you just haven't been allowed to
                   press yet, not one that isn't yours to press at all. That
                   was also the actual overflow fix: shortening the text
                   alone (down to "Waiting…") still left this row 74px over
                   budget at 375px once Autopick+Sound+Settings were
                   counted, because none of those three can shrink further
                   and the real cost was the pill's own padding, not its
                   words. A 34px status icon, matching Sound and Settings
                   exactly, both reads honestly and actually fits — at every
                   width, not just below lg, since the "can't press this"
                   fact doesn't change on a wider screen either. */
                <span
                  title="Waiting for the host to start"
                  aria-label="Waiting for the host to start"
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-white/5 text-white/40"
                >
                  <Clock className="h-4 w-4" />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onStartDraft}
                  disabled={startDisabled}
                  title={problem || undefined}
                  className={
                    'shrink-0 rounded-full px-1 py-2 text-xs font-semibold lg:px-5 lg:text-sm ' +
                    (startDisabled
                      ? 'cursor-not-allowed bg-white/5 text-white/25'
                      : 'bg-cta text-white shadow-glass transition-all duration-200 hover:scale-105 hover:shadow-[0_0_15px_rgba(0,229,255,0.4)]')
                  }
                >
                  {/* Same lever as "Round N ·" and "your turn" elsewhere on
                      this bar: shorten the text below the width it stops
                      fitting, rather than touch the control itself. See
                      startLabelShort's own comment in DraftRoom.jsx.
                      lg, not sm: measured with the sound icon in place,
                      "Start for everyone" plus Autopick's returning text
                      overflows by 43px at both 640 and 768 and only clears
                      at 1024, because nothing else in this row concedes
                      width until lg either (the logo, the tab nav, the
                      wider gaps all wait for the same breakpoint) — sm just
                      swaps which overflow you'd see. Only reached for solo
                      and the host now; waitingForHost above takes the
                      guest case out of this button entirely. */}
                  <span className="hidden lg:inline">{startLabel}</span>
                  <span className="lg:hidden">{startLabelShort}</span>
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenMenu}
              title="Draft options"
              aria-label="Draft options"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 transition-colors duration-150 hover:bg-white/[0.09] hover:text-white"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* The live-draft mobile header — chevron, lockup, Auto toggle, kebab
          — replacing the 62px bar's tab nav, pick pill and Autopick/Sound/
          kebab cluster with the four things that still have a job once the
          ribbon (PickTicker), the band (PickClockBand) and the bottom tab
          bar (MobileDraftTabBar) exist below it. !preDraft only — see the
          comment on the 62px header above for why the entry screen keeps
          its own unconditional bar rather than sharing this one.

          Not on Analysis: that view keeps its own mobile top bar
          (AnalysisTab.jsx), so DraftRoom.jsx never reaches this file for
          it below lg — see that component's own comment.

          Sound is here and the mockup's own header does not carry it. The
          desktop bar deliberately promoted Sound out of the kebab menu to
          an always-visible icon — DraftMenuOverlay.jsx's own comment says
          so, and says why: "a preference toggled mid-pick needs to be a
          tap away, not two screens deep." That reasoning is not specific
          to a wide screen, and the menu has had no Sound entry to fall
          back on since the icon replaced it — dropping the icon here too
          would make Sound unreachable on a phone entirely rather than
          moved. 46px has the width for a fifth control at this size, so
          kept rather than reintroducing a menu entry the desktop version
          already retired for a reason that still holds. */}
      {/* Every control below is a 44px hit box around a visibly smaller
          pill — the shared context's own floor ("Minimum tap target 44px
          on any layout below lg") applies here same as everywhere else in
          this redesign, and a 46px bar has no room to grow the chevron/
          sound/kebab circles themselves to 44px without the header reading
          as three oversized coins. This is the identical trick
          PlayerQueueSidebar.jsx's own queue star already uses — "26px
          wide, 44px tall tap area... on a control that's visually much
          smaller than that" — just applied on both axes here since these
          are circles rather than a narrow column's star. The Auto toggle
          is the one exception: it is not a circle, so growing its own
          height to 44px is just taller padding inside the same pill, not
          a visual size change worth hiding behind an inner span. */}
      {!preDraft && (
        <header className="fixed inset-x-0 top-0 z-50 flex h-[46px] shrink-0 items-center gap-1 border-b border-white/[0.06] bg-slate-bar px-1.5 lg:hidden">
          <a
            href="#/rooms/draft"
            aria-label="Back to your draft locker"
            title="Back to your draft locker"
            className="flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-rule bg-slate-sunk/60 text-white/50">
              <ChevronLeft className="h-4 w-4" />
            </span>
          </a>

          <a href="#/" aria-label="Juke home" className="flex h-11 min-w-0 flex-1 items-center">
            <JukeLogo size={19} surface="appbar" />
          </a>

          {/* Auto while there is anything left to auto-pick; a labelled way
              out once there is not.

              Over, this slot held a permanently disabled toggle at 40%
              opacity — a dead control taking the widest position on a
              46px bar, on the one screen where the reader has finished
              and is looking for the exit. The only other way back to the
              locker at that moment is the chevron on the far left, which
              is an unlabelled glyph, and the "Back to the locker" link at
              the bottom of the Insights report itself, which is the
              screen being left. Reported as needing a route out that is
              not the report. Same destination as the chevron, said in a
              word rather than drawn as an arrow. */}
          {over ? (
            <a
              href="#/rooms/draft"
              title="Back to your draft locker"
              className="flex h-11 shrink-0 items-center rounded-full bg-white/5 px-3 text-[11px] font-semibold text-white/70"
            >
              Locker
            </a>
          ) : (
            <button
              type="button"
              onClick={onToggleAutopick}
              aria-pressed={autopick}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/5 pl-2.5 pr-1.5"
            >
              <span className="text-[11px] font-semibold text-white/70">Auto</span>
              <span className={'relative block h-4 w-[30px] rounded-full transition-colors duration-200 ' + (autopick ? 'bg-teal-500/70' : 'bg-white/[0.16]')}>
                <motion.span
                  layout
                  transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                  className="absolute top-0.5 h-3 w-3 rounded-full bg-white"
                  style={{ left: autopick ? 16 : 2 }}
                />
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleSound}
            aria-pressed={soundOn}
            title={soundOn ? 'Turn draft sounds off' : 'Turn draft sounds on'}
            aria-label={soundOn ? 'Turn draft sounds off' : 'Turn draft sounds on'}
            className="flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/5 text-white/70">
              {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenMenu}
            title="Draft options"
            aria-label="Draft options"
            className="flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/5 text-white/70">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </span>
          </button>
        </header>
      )}
    </Fragment>
  )
}
