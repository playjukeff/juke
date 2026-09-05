import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, ChevronLeft, ChevronRight, Lock, Play, Settings, Trash2, Users } from 'lucide-react'
import { NAV_PILL_CLEARANCE } from './phone/FloatingNavPill.jsx'
import PracticeScenarios from './PracticeScenarios.jsx'
import { POS_CHALK, CELL_INK } from './draftRoomPositions.js'

/* The Draft Room's own entry — what #/rooms/draft is, at every width.

   design_handoff_v3_alive's screen c (2cg/2cu mobile, 3cg/3cu desktop).
   Most of this screen was already here: it was built from an earlier
   iteration of the same design and already carried the hero, the board-
   corner tiles, the sport pills, the gradient start CTA and the actions
   under it. What changed is who gets it.

   It was phone-only, and the desktop Lobby was DraftLocker's analytics
   dashboard — a real product split, argued in this file's own comment and
   correct at the time. The handoff reverses it: 3cg is this same launcher
   at 1280px, and the dashboard is one press away behind "Your insights",
   which is exactly where a phone already had it. So the split goes, the
   component becomes responsive, and it moves out of phone/ because that
   directory means "a different screen from its desktop counterpart" and
   this is no longer one.

   The desktop layout is the handoff's: the actions in the left column and
   your mock drafts in a right rail, rather than the phone's one column
   with the list under everything. Below `lg` nothing about it changes.

   What follows is the original note, still true of the phone.

   The Mock Drafts screen — what #/rooms/draft is on a phone.

   The desktop Lobby is a real analytics dashboard: three KPI tiles, a
   twelve-cell tendencies grid, a recommendation engine, a positional
   weakness heatmap and a full history table. That is the right screen for
   somebody sitting at a desk between drafts, and it is emphatically the
   wrong one on a 390px phone, where all twelve cells stack into one column
   and the button the screen exists to offer ends up somewhere past the
   fourth chart.

   So the phone gets the launcher: what you can start, what you were in the
   middle of, and what you have already run. Nothing is deleted — the
   dashboard is untouched at every width above `sm`, and the analytics are
   one press away from here through the chart button in the header, which
   opens the identical DraftLocker the desktop shows.

   ---- Every row is real ----

   engine.historyList() is the same summary the desktop LockerTable reads,
   engine.inProgressSummary() the same save the resume band reads, and the
   position pip on each row is the round-one pick's own matte colour. There
   is no sample content on this screen at all: a fresh visitor sees an empty
   state that says so.
*/

/* "4d", "now", "3w" — the reference app's own right-hand column, and the
   reason it is here rather than in dataFreshness.js is that this is a
   different question with a different answer shape. timeAgo() answers "how
   stale is the board" in a sentence ("17 hrs ago"); this answers "when was
   this draft" in the two or three characters a list row has room for. One
   of them wraps in a 44px column and the other does not. */
function shortAgo(ms) {
  if (!ms) return ''
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000))
  if (mins < 2) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks}w`
  return `${Math.round(days / 30)}mo`
}

/* The sports chips under the header. Football is the only one Juke has —
   the pipeline is NFL end to end — and the other three are listed, dimmed
   and locked for the same reason DRAFT_TYPES lists auction: a row showing
   one sport where the category has four tells a visitor the product has
   not thought past one. What it must not do is imply they are coming: the
   chips open the same early-access dialog every other unbuilt thing in
   this app does, rather than carrying a "soon" badge nothing stands
   behind. */
const SPORTS = [
  { key: 'nfl', label: 'Football', emoji: '🏈', live: true },
  { key: 'nba', label: 'Basketball', emoji: '🏀', live: false },
  { key: 'mlb', label: 'Baseball', emoji: '⚾', live: false },
  /* Retired, not deleted, for the same reason the Prospect Room is:
     design_handoff_v3_alive draws three sports on this screen and only
     three, at both breakpoints and in both auth states (2cg/2cu/3cg/3cu
     are Football, Basketball, Baseball). Soccer arrived with the mobile
     pass. Drop `retired` to bring it back. */
  { key: 'epl', label: 'Soccer', emoji: '⚽', live: false, retired: true },
]

/* How many finished drafts this screen shows before handing off to the
   archive.

   This screen is the Draft Room's ENTRY — the thing it exists to offer is
   the Start button at the top of the other column — and "Your mock drafts"
   here is context for it, not the record. Rendering every entry made the
   record and the context the same list: HISTORY_LIMIT is 200, so somebody
   who has run a hundred mocks got a hundred rows under a button they came
   here to press, and the screen grew by one row-height every time they
   drafted.

   #/drafts is the archive and already has the filters, the count and the
   nothing-else-on-it to be one. So this list stops at five and says how
   many there really are, which is the same split the route itself already
   makes — see DraftsScreen.jsx's own note on why the two screens are apart.

   One number rather than one per breakpoint. The desktop rail is taller
   than five rows fill, and a slightly short column is a smaller cost than
   a second count to keep in step with this one — the "See all N" line
   below counts the whole locker either way, so a breakpoint-dependent cut
   would make that sentence true at one width and wrong at the other. */
const RECENT_SHOWN = 5

function StatusPill({ status }) {
  const live = status === 'PRE-DRAFT'
  return (
    <span className={'font-plex text-[10px] font-bold uppercase tracking-[0.08em] ' + (live ? 'text-teal-300' : 'text-[#6E8CC4]')}>
      {status}
    </span>
  )
}

export default function DraftRoomEntry({
  engine, tick, problem, inProgress, onStartNew, onResume, onDiscard,
  onOpenSettings, onOpenAnalytics, onDraftWithFriends, onAnalyze, onDelete,
  onSignupSport, onLaunchScenario, roomActive,
}) {
  const [history, setHistory] = useState([])
  const [confirmDelete, setConfirmDelete] = useState(null)

  /* `tick` is in the dependency list and it is load-bearing rather than
     defensive. historySummary() resolves each entry's round-one pick
     against the LIVE board — that is how a stored name becomes a position
     and a headshot — and the board is empty until players.js lands, which
     is deferred (requestIdleCallback, not a blocking script). Read once on
     mount, every row came back with a null position and drew a grey dash
     where its position colour belongs: the names were right, because those
     are stored, and only the resolved fields were missing. Found by
     looking at the screen rather than by anything failing. */
  useEffect(() => {
    if (!engine) return
    try { setHistory(engine.historyList() || []) } catch { setHistory([]) }
  }, [engine, inProgress, tick])

  const rosterLine = engine ? engine.settingsText(engine.league()) : ''

  return (
    <div className="flex min-h-full flex-col bg-surface-page">
      {/* The hero block. A back chevron, the title, one line of what this
          screen is — and no illustration, because Juke has no rendered
          mascot and drawing one is a design commission rather than a code
          change. What stands in its place is a real thing: the board's own
          position colours, arranged as the corner of a draft board. It is
          six divs, it costs nothing, and it cannot go stale. */}
      <div className="relative mx-auto w-full max-w-[1280px] overflow-hidden px-4 pb-5 pt-3 lg:px-10 lg:pb-8 lg:pt-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-6 h-[220px] w-[220px] opacity-[0.55]"
          style={{ background: 'radial-gradient(circle at 60% 40%, rgba(0,229,255,0.16), transparent 68%)' }}
        />

        <div className="relative flex items-start">
          <div className="min-w-0 flex-1">
            {/* #/rooms, and it says so above `sm`.

                It pointed at #/ with an aria-label of "Back to home",
                which was wrong twice: the Draft Room is reached from the
                Rooms lobby, and 3cg/3cu draw this control as "< Rooms"
                (2cg has the bare chevron, hence the label's breakpoint).
                Home is already one tab away in the header; a back control
                that skips the level it came from is not a back control.

                Same shape RoomHero gives the other four rooms, so all five
                now go back to the same place by the same affordance. */}
            <a
              href="#/rooms"
              className="-ml-2 mb-1 inline-flex h-10 items-center gap-1.5 rounded-[10px] pr-2 text-voidInk-body transition-colors duration-150 hover:text-white"
            >
              <ChevronLeft className="h-6 w-6 shrink-0" />
              <span className="hidden text-[17px] sm:inline">Rooms</span>
            </a>
            {/* 44 -> 64 at `sm`, which is RoomHero's own pair.

                This screen is The Draft Room's entry -- a room, reached
                from the rooms lobby by the same back chevron as the other
                four -- and it was the one H1 in the app with no responsive
                step at all: 38px flat. On a desktop that made the only
                room anybody can actually use the QUIETEST title on the
                site, below #/you's 44, while the four locked rooms beside
                it carried 64. On a phone it was the loudest of the three
                list screens. The ordering flipped between breakpoints,
                which is the tell that it was not on the ladder at all.

                Measured before changing it: the ladder is 30/44/54/64/72/
                88 and 38 is on none of its rungs. */}
            <h1 className="font-display text-[44px] font-extrabold italic uppercase leading-[0.94] tracking-normal text-white sm:text-[64px]">
              Mock Drafts
            </h1>
            {/* 24ch was measured against a 38px title and holds the line
                to two on a phone, which is right there. Under 64px it
                orphans "teams" on a line of its own with most of a 1200px
                column unused. RoomHero's own sub-copy runs to 62ch; this
                one only needs enough to stop wrapping at all. */}
            <p className="mt-1.5 max-w-[24ch] text-[14px] leading-snug text-voidInk-body sm:mt-2 sm:max-w-[40ch] sm:text-[16px]">
              Practice drafting your fantasy teams
            </p>
          </div>

          {/* Four cells of a board, in the six real hues. Rotated slightly
              so it reads as an object rather than as a UI element that
              failed to line up. */}
          <div
            aria-hidden="true"
            className="relative ml-2 mt-6 grid shrink-0 grid-cols-2 gap-1.5"
            style={{ transform: 'rotate(-6deg)' }}
          >
            {['RB', 'WR', 'QB', 'TE'].map((pos, i) => (
              <motion.span
                key={pos}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.06 * i, type: 'spring', stiffness: 300, damping: 22 }}
                className="flex h-[42px] w-[46px] items-end justify-start rounded-[10px] px-1.5 pb-1 font-plex text-[10px] font-bold"
                style={{ backgroundColor: POS_CHALK[pos], color: CELL_INK }}
              >
                {pos}
              </motion.span>
            ))}
          </div>
        </div>

        {/* The sports row. */}
        <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4">
          {SPORTS.filter((s) => !s.retired).map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={s.live}
              onClick={() => (s.live ? null : onSignupSport(s.label))}
              className={
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-semibold ' +
                (s.live
                  ? 'border-teal-400/50 bg-teal-500/10 text-teal-300'
                  : 'border-line-hairline text-voidInk-muted')
              }
            >
              <span aria-hidden="true">{s.emoji}</span>
              {s.label}
              {!s.live && <Lock className="h-3 w-3" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>

      {/* Everything below the hero sits on a raised, rounded panel — the
          reference screen's own shape, and it does a real job here: it is
          the seam between "what this screen is" and "your stuff," which is
          otherwise two lists of rows running together. */}
      {/* The raised, rounded panel is the phone's seam between "what this
          screen is" and "your stuff" — two lists of rows that would
          otherwise run together in one column. At `lg` the two are side by
          side and there is no seam to draw, so the panel flattens onto the
          page ground the way the handoff's own desktop screen does. */}
      <div
        className="min-h-0 flex-1 rounded-t-[26px] bg-surface-card px-4 pb-6 pt-5 lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-0"
        style={{ paddingBottom: NAV_PILL_CLEARANCE }}
      >
      <div className="mx-auto w-full max-w-[1280px] lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-10 lg:px-10">
      <div>
        {/* The start action, and the settings that decide what it starts.
            The gear is here rather than in a header bar because the two
            belong together: the line under the button IS the settings, so
            pressing the thing that describes them is how you change them. */}
        {/* data-start-draft / aria-label: hooks the phone suite anchors on.
            This screen's label ("Start a mock draft") is the fourth name
            this one button has had across the app, and every rename has
            failed a test about something else — phone.spec.mjs still
            carries a regex of every previous one. An attribute says what
            the control IS rather than what it currently reads. */}
        <button
          type="button"
          onClick={onStartNew}
          data-start-draft
          disabled={!!problem}
          className="flex w-full items-center gap-3 rounded-[18px] px-4 py-4 text-left transition-transform duration-150 active:scale-[0.985] disabled:opacity-50"
          style={{ background: 'linear-gradient(100deg, #44D4E2, #82A1F6)' }}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0B0D12]/15 text-[#0B0D12]" aria-hidden="true">
            <Play className="h-5 w-5 fill-current" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[21px] font-bold text-[#0B0D12]">Start a mock draft</span>
            <span className="mt-0.5 block truncate text-[12px] font-semibold text-[#0B0D12]/70">{rosterLine}</span>
          </span>
        </button>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Draft settings"
            className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-line-hairline py-2.5 text-[13px] font-semibold text-voidInk-body active:bg-white/[0.04]"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Draft settings
          </button>
          {/* The dashboard, one press away rather than deleted. This is the
              whole reason the phone can afford a simple screen: nothing
              built for the desktop Lobby becomes unreachable, it just stops
              being the first thing a phone shows. */}
          <button
            type="button"
            onClick={onOpenAnalytics}
            className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-line-hairline py-2.5 text-[13px] font-semibold text-voidInk-body active:bg-white/[0.04]"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Your insights
          </button>
        </div>

        {/* ---- Draft with friends ----

            It was missing from this screen entirely, and the path that
            leads here is exactly the one that needed it: HomePhone's own
            "Or draft with friends — same board, real managers" row links
            to #/drafts, which on a phone IS this screen. So the one
            advertised route to multiplayer landed on a launcher with no
            multiplayer on it. Reported in those words.

            Everything behind it already worked at this width — the same
            DraftWithFriendsModal and RoomPanel the desktop Lobby opens,
            which DraftRoom.jsx already renders for both branches — so
            this is the control that was missing rather than the feature.

            Its own full-width row rather than a third button beside the
            pair above: "Draft with friends" does not fit a third of a
            390px row (HomePhone's own note measures the same string
            wanting 208px), and it is a different KIND of action from the
            two under it anyway — those change what the button above
            starts, this starts something else. */}
        <button
          type="button"
          onClick={onDraftWithFriends}
          className="mt-2 flex w-full items-center gap-2.5 rounded-[14px] border border-dashed border-line-hairline px-3.5 py-3 text-left active:bg-white/[0.04]"
        >
          <Users className="h-4 w-4 shrink-0 text-teal-300" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-[13px] font-semibold text-voidInk-body">
            {roomActive ? 'Your draft room — invite or enter' : 'Draft with friends'}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-white/35" aria-hidden="true" />
        </button>

        {problem && (
          <p className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[12px] leading-relaxed text-rose-200/90">
            {problem}
          </p>
        )}

        {/* ---- Practice a scenario ----

            design_handoff_practice_scenarios, option 1c: four preset drafts
            that launch with their settings already chosen. It goes here,
            directly under "Draft with friends", because that is where the
            handoff puts it and because that is where the column runs out —
            at 1280px this screen was four controls and then roughly 500px
            of nothing, with the mock-drafts list sitting in the other
            column.

            Deliberately below the actions rather than above them. This is
            depth for somebody who has already decided to draft; the Start
            button above it is still the thing the screen exists to offer,
            and four cards in front of it would be four ways to bury one
            primary action. Same reasoning the player sheet's own tab strip
            follows on a phone. */}
        <PracticeScenarios engine={engine} tick={tick} onLaunch={onLaunchScenario} />

      </div>

      <div>
        {/* lg:mt-0 — the 28px that separates this from the actions above it
            in one column is dead space beside them in two. */}
        <p className="mb-3 mt-7 font-plex text-[11px] font-bold uppercase tracking-[0.11em] text-voidInk-muted lg:mt-0">
          Your mock drafts
        </p>

        {!inProgress && !history.length ? (
          <div className="rounded-[18px] border border-dashed border-line-hairline px-5 py-8 text-center">
            <p className="text-[14px] leading-relaxed text-voidInk-body">
              No mocks yet. Start one above &mdash; it runs entirely in your browser and takes a few minutes.
            </p>
          </div>
        ) : (
          <>
          <ul className="flex flex-col">
            {/* The unfinished one first, and it is the only row with two
                actions on it. A draft you are in the middle of is a more
                urgent ask than one you finished last week, which is the
                same order the desktop Lobby's own InProgressBand takes over
                its history table. */}
            {inProgress && (
              <li className="flex items-center gap-3 border-b border-line-divider py-3.5">
                <button
                  type="button"
                  onClick={onResume}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-teal-500/15 text-teal-300" aria-hidden="true">
                    <Play className="h-[18px] w-[18px] fill-current" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-white">
                      {inProgress.teams}-team {inProgress.scoring} {inProgress.leagueType ? '' : 'snake'}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-voidInk-muted">
                      Round {inProgress.round} &middot; {inProgress.made} of {inProgress.total} picks
                    </span>
                  </span>
                  {/* Inside the button, not beside it. The status and the
                      age are the right-hand half of a row whose left half
                      is pressable, and a row where two thirds of the width
                      responds and the rest does not is the dead-control
                      problem at row scale — you press the part your thumb
                      landed on and nothing happens. Only the delete button
                      stays outside, because it does something else. */}
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <StatusPill status="PRE-DRAFT" />
                    <span className="font-numeral text-[11px] tabular-nums text-voidInk-muted">
                      {shortAgo(inProgress.startedAt)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onDiscard}
                  aria-label="Discard this draft"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-voidInk-muted active:text-rose-400"
                >
                  <Trash2 className="h-[17px] w-[17px]" />
                </button>
              </li>
            )}

            {history.slice(0, RECENT_SHOWN).map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 border-b border-line-divider py-3.5 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onAnalyze(entry.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  {/* The round-one pick's own position colour, as the row's
                      icon. It is the one fact about a finished draft that
                      fits in 40px and says something — every other column
                      the desktop table carries is a number that needs a
                      header to mean anything. */}
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] font-plex text-[11px] font-bold"
                    style={{
                      backgroundColor: entry.round1PickPos ? POS_CHALK[entry.round1PickPos] : 'rgba(255,255,255,0.06)',
                      color: entry.round1PickPos ? CELL_INK : 'rgba(255,255,255,0.35)',
                    }}
                    aria-hidden="true"
                  >
                    {entry.round1PickPos === 'DST' ? 'DEF' : entry.round1PickPos || '—'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-white">{entry.leagueType}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-voidInk-muted">
                      Seat {entry.seat}
                      {entry.round1Pick ? ` · ${entry.round1Pick}` : ''}
                      {entry.grade ? ` · ${entry.grade}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <StatusPill status="COMPLETE" />
                    <span className="font-numeral text-[11px] tabular-nums text-voidInk-muted">
                      {shortAgo(entry.completedAt)}
                    </span>
                  </span>
                </button>
                {/* Two taps, in place, rather than a confirm dialog — the
                    same shape the draft menu's own destructive rows use, and
                    the reason is the same: a dialog for a row action puts a
                    modal over a list to ask about one line of it. */}
                <button
                  type="button"
                  onClick={() => {
                    if (confirmDelete !== entry.id) {
                      setConfirmDelete(entry.id)
                      setTimeout(() => setConfirmDelete((id) => (id === entry.id ? null : id)), 4000)
                      return
                    }
                    setConfirmDelete(null)
                    onDelete(entry.id)
                  }}
                  aria-label={confirmDelete === entry.id ? 'Tap again to delete' : 'Delete this draft'}
                  className={
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ' +
                    (confirmDelete === entry.id ? 'bg-rose-500/15 text-rose-400' : 'text-voidInk-muted')
                  }
                >
                  <Trash2 className="h-[17px] w-[17px]" />
                </button>
              </li>
            ))}
          </ul>

          {/* The way to the rest of them, and it only appears when there
              ARE more — a permanent "see all" over a list that is already
              all of it is a control that cannot change what is on screen,
              which is the dead-control failure this project keeps finding.

              It carries the real total rather than reading "See all",
              because the number is the whole reason the list above it
              stops: without it, five rows and a link read as five drafts. */}
          {history.length > RECENT_SHOWN && (
            <a
              href="#/drafts"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-[14px] border border-line-hairline py-2.5 text-[13px] font-semibold text-voidInk-body active:bg-white/[0.04]"
            >
              See all {history.length} drafts
              <ChevronRight className="h-4 w-4 shrink-0 text-white/35" aria-hidden="true" />
            </a>
          )}
          </>
        )}
      </div>
      </div>
      </div>
    </div>
  )
}
