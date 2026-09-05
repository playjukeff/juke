import { useMemo, useState } from 'react'
import { SignUpButton, SignedOut } from '@clerk/clerk-react'
import AppShell from './shell/AppShell.jsx'
import { PosTile } from './rooms/sampleParts.jsx'
import { useAccountUiReady } from '../hooks/useAccountUiReady.js'
import { useEngine, useJukeTick } from '../hooks/useJukeEngine.js'

/* #/drafts — design_handoff_v3_alive 2fg/2fu (mobile) and 3fg/3fu (desktop).

   The archive: every mock you have run, with filter pills over it. It is a
   different screen from the Draft Room's own entry (#/rooms/draft), which
   is where you start one — the handoff draws both and this build keeps them
   apart. What that costs is that this screen has no Start button on it, by
   design, which is why every "back to the locker" link in the app points at
   the entry rather than here: finishing a draft and wanting another is the
   flow that would otherwise dead-end.

   ---- Everything on it is real, and that is the whole point ----

   `historyList()` is the same summary the desktop Locker table and the
   phone Mock Drafts screen both read — one list, three renderings. Nothing
   here is sample content, so this screen was buildable the day accounts
   shipped.

   It reads the engine tick because `historySummary()` resolves a stored
   player NAME against the live board to get the position and the tile
   colour, and the board is empty until players.js lands. Read once on
   mount, every row comes back with a null position and draws a grey tile
   where its colour belongs — the names are right, because those are
   stored, and only the resolved fields are missing. Exactly the failure
   MockDraftsPhone's own comment records.

   ---- The filter pills ----

   The handoff's are All / {league} / Practice, and the middle one needs a
   connected league. Until there is one there are two real axes in the data:
   scoring format, which every entry carries, and nothing else. So the pills
   are All plus one per format actually present — derived from the list
   rather than a fixed three, so a locker holding only half-PPR drafts does
   not offer two pills that filter to nothing. A control that cannot change
   what is on screen is the dead-control failure this project keeps finding.
   The {league} pill arrives with league connect. */

/* How many rows land before "Show more".

   This screen IS the archive, so unlike the Draft Room's entry it does not
   hand off anywhere — every draft has to be reachable from here. What it
   must not do is render all two hundred at once (HISTORY_LIMIT), which is
   what "if someone runs a hundred we should not show every single one"
   asks for: the page grew by a row-height per draft and the filter pills
   at the top scrolled away from the rows they filter.

   20 rather than LockerTable's 8. That number is tied to its own
   NEEDS_CONTROLS_ABOVE — the point below which its search box and four
   filter pills have nothing to do — inside a fixed-height dashboard card.
   This is a full page whose entire job is the list, so the first screenful
   should be a screenful. The increment matches LockerTable's PAGE_SIZE,
   because "one more page" is the same gesture on both. */
const PAGE_SIZE = 20

function relativeAge(at) {
  if (!at) return ''
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function Row({ entry, onOpen, onDelete }) {
  return (
    <div className="flex items-center gap-3.5 border-b border-line-hairline py-3.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
      >
        {/* A stored draft whose round-one pick no longer resolves against
            today's board has no position — DST's neutral fill stands in
            rather than a guessed colour, which is the same call
            historySummary() itself makes by answering null. */}
        <PosTile pos={entry.round1PickPos || 'DST'} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-white">
            {entry.leagueType}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-ink-muted">
            Seat {entry.seat}
            {entry.round1Pick ? ` · ${entry.round1Pick}` : ''}
            {entry.grade ? ` · ${entry.grade}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-[10px] tracking-[0.1em] text-flow-blue">
            COMPLETE
          </span>
          <span className="block text-[12px] text-ink-muted">
            {relativeAge(entry.completedAt)}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${entry.leagueType}`}
        className="shrink-0 px-1 text-ink-muted transition-colors duration-150 hover:text-flow-rose"
      >
        <span aria-hidden="true">🗑</span>
      </button>
    </div>
  )
}

function DeviceNote() {
  const ready = useAccountUiReady()

  /* Signed out only. "Saved on this device only" is a true and useful
     warning to somebody with no account and a lie to somebody whose drafts
     are already syncing — the same rule the homepage's own "no account
     needed" line follows. */
  const note = (
    <div className="mb-3.5 flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-flow-pillEdge px-4 py-3 text-[13px] text-voidInk-body">
      <span>Saved on this device only</span>
      {ready ? (
        <SignUpButton mode="modal">
          <button type="button" className="font-semibold text-mint">
            Sign up to sync
          </button>
        </SignUpButton>
      ) : (
        <span className="font-semibold text-mint">Sign up to sync</span>
      )}
    </div>
  )

  if (!ready) return note
  return <SignedOut>{note}</SignedOut>
}

export default function DraftsScreen() {
  const engine = useEngine()
  const tick = useJukeTick(engine)
  const [filter, setFilter] = useState('ALL')
  // Reset by every control that changes what `shown` contains, the same way
  // LockerTable's own visibleCount is — paging is a position in one list,
  // and a filter change makes it a different list.
  const [shownCount, setShownCount] = useState(PAGE_SIZE)
  // Deleting an entry is a localStorage rewrite and broadcasts nothing, so
  // there is no "juke:header" to ride — the same local bump the Locker's own
  // delete already uses.
  const [bump, setBump] = useState(0)

  const list = useMemo(() => {
    if (!engine || !engine.historyList) return []
    try {
      return engine.historyList() || []
    } catch {
      return []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, tick, bump])

  const formats = useMemo(() => {
    const seen = []
    list.forEach((e) => {
      if (e.scoring && seen.indexOf(e.scoring) < 0) seen.push(e.scoring)
    })
    return seen
  }, [list])

  const shown = filter === 'ALL' ? list : list.filter((e) => e.scoring === filter)
  const visible = shown.slice(0, shownCount)

  const label = (key) => {
    const match = list.find((e) => e.scoring === key)
    // The formatted name off the entry itself rather than a second lookup
    // table of scoring keys, which is the league shape written down twice.
    return match ? match.leagueType.replace(/^\d+-Team\s+/, '') : key
  }

  return (
    <AppShell active="drafts">
      <div className="mx-auto max-w-[1280px] px-5 pt-[22px] sm:px-10 sm:pt-10">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
          {/* Glyph in a mono eyebrow rather than inline beside the
              title -- see RoomsLobby.jsx for why all three of these
              screens moved to RoomHero's shape. */}
          <div>
            <div className="mb-1.5 font-mono text-[11px] tracking-[0.1em] text-teal">
              <span className="mr-1.5" aria-hidden="true">🗓</span>
              {list.length} COMPLETED
            </div>
            <h1 className="m-0 font-display text-[30px] font-extrabold uppercase italic text-white sm:text-[44px]">
              Your Drafts
            </h1>
          </div>

          {formats.length > 1 ? (
            <div className="flex gap-2">
              {['ALL'].concat(formats).map((key) => {
                const on = filter === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setFilter(key); setShownCount(PAGE_SIZE) }}
                    aria-pressed={on}
                    className={
                      'rounded-full border px-3.5 py-[7px] text-[13px] font-semibold transition-colors duration-150 ' +
                      (on
                        ? 'border-mint bg-flow-mintDark text-mint'
                        : 'border-line-hairline text-voidInk-body hover:text-white')
                    }
                  >
                    {key === 'ALL' ? 'All' : label(key)}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <div className="sm:max-w-[860px]">
          <DeviceNote />

          {shown.length ? (
            visible.map((e) => (
              <Row
                key={e.id}
                entry={e}
                onOpen={() => {
                  /* The entry's own frozen report, through the same path
                     the Locker uses. Not a re-grade: a reopened draft and
                     the grade it was recorded with must not disagree. */
                  location.hash = `#/rooms/draft?report=${encodeURIComponent(e.id)}`
                }}
                onDelete={() => {
                  if (engine && engine.deleteHistoryDraft) engine.deleteHistoryDraft(e.id)
                  setBump((n) => n + 1)
                }}
              />
            ))
          ) : null}

          {/* LockerTable's own footer shape — a position line beside the
              button — rather than a second one invented here. The two are
              the same list paged the same way, and "Showing 20 of 47" is
              the half that says how deep you are once the eyebrow's total
              has scrolled off the top.

              The button's number is what the press actually does, so the
              last press reads "Show 7 more" rather than promising twenty
              and delivering seven. It only renders when there are more,
              because a Show-more over a list that is already all of it is
              a control that cannot change what is on screen. */}
          {shownCount < shown.length && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="font-numeral text-[12px] tabular-nums text-ink-muted">
                Showing {visible.length} of {shown.length}
              </span>
              <button
                type="button"
                onClick={() => setShownCount((n) => n + PAGE_SIZE)}
                className="rounded-full border border-line-hairline px-4 py-2 text-[13px] font-semibold text-voidInk-body transition-colors duration-150 hover:border-mint hover:text-mint"
              >
                Show {Math.min(PAGE_SIZE, shown.length - shownCount)} more
              </button>
            </div>
          )}

          {shown.length ? null : (
            <div className="rounded-[18px] border border-line-hairline bg-[#151920] p-6 text-center">
              <div className="font-display text-[22px] font-bold text-white">
                {list.length ? 'Nothing in that format yet' : 'No drafts yet'}
              </div>
              <p className="mx-auto mt-1.5 max-w-[40ch] text-[14px] leading-[1.5] text-voidInk-body">
                {list.length
                  ? 'Every draft you run is kept here. Try another filter.'
                  : 'Run a mock and it lands here — the board, your roster and the grade it earned.'}
              </p>
              <a
                href="#/rooms/draft"
                className="mt-4 inline-flex rounded-full px-5 py-3 text-[14px] font-bold text-surface-page transition-transform duration-150 hover:scale-[1.02]"
                style={{ background: 'linear-gradient(100deg,#44D4E2,#82A1F6)' }}
              >
                Start a mock draft
              </a>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
