import { useMemo, useRef, useState } from 'react'
import { Search, ChevronDown, ChevronRight, MoreHorizontal, HardDrive, CloudAlert, CloudCheck } from 'lucide-react'
import EarlyAccessModal from './EarlyAccessModal.jsx'
import { POS_BADGE } from './draftRoomPositions.js'
import { SignUpButton } from '@clerk/clerk-react'
import { useSignedIn } from '../hooks/useAuthState.js'
import { useAccountUiReady } from '../hooks/useAccountUiReady.js'

const FORMAT_FILTERS = [
  { key: 'all', label: 'All formats' },
  { key: 'ppr', label: 'Full PPR' },
  { key: 'half', label: 'Half PPR' },
  { key: 'standard', label: 'Standard' },
]

const SORTS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'grade', label: 'Best grade' },
  { key: 'finish', label: 'Best finish' },
]

// Thirds of the draft order, not individual seat numbers — a dropdown of
// every seat 1 through N is a lot of chrome for a question that's really
// "front, middle or back," and it's the same bucketing historyStats()'s
// own seatSplit already uses for "what to run next," so the two agree on
// what "early" and "late" mean rather than drawing the line twice.
const SEAT_FILTERS = [
  { key: 'all', label: 'All seats' },
  { key: 'early', label: 'Early' },
  { key: 'middle', label: 'Middle' },
  { key: 'late', label: 'Late' },
]
function seatBucket(entry) {
  if (!entry.teams) return null
  const frac = entry.seat / entry.teams
  return frac <= 1 / 3 ? 'early' : frac > 2 / 3 ? 'late' : 'middle'
}

const DATE_FILTERS = [
  { key: 'all', label: 'All time' },
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
]

const PAGE_SIZE = 20

// Below this many rows, every one of them is already on screen at once —
// the default visibleCount below is this same number — so a search box,
// four format-filter pills and a sort dropdown have nothing to do yet.
// Six columns of headers plus that whole control row was a lot of chrome
// standing over one or two entries. Chosen to match visibleCount rather
// than some other number: the exact point this component already treats
// as "everything fits without scrolling or paging."
const NEEDS_CONTROLS_ABOVE = 8

// Shared by the format rule and the finish bar, per the handoff — two
// different formulas on the same two numbers, not two names for one.
function finishColor(rank, teams) {
  if (!rank || !teams) return 'rgba(255,255,255,0.3)'
  const frac = rank / teams
  return frac <= 0.25 ? '#00E5FF' : frac <= 0.5 ? 'rgba(255,255,255,0.5)' : '#FB7185'
}

function gradeColor(grade) {
  if (!grade) return 'rgba(255,255,255,0.5)'
  if (grade.startsWith('A')) return '#66F0FF'
  if (grade.startsWith('B')) return 'rgba(255,255,255,0.92)'
  return '#FB7185'
}

// Mobile grade tile — teal for a bargeable grade (C and above), red below
// it. A different split from gradeColor() above on purpose: gradeColor()
// answers "is this an A/B" (for the desktop table's plain-text grade,
// where C reads neutral white), the tile answers "is this a result I'd
// want to see again" (where C joins the good half). gradeRank() below is
// the one ordered list of every grade string this file already keeps —
// reused for the cutoff rather than a second hand-picked one.
function tileTone(grade) {
  if (!grade) {
    return { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.14)', text: 'rgba(255,255,255,0.5)' }
  }
  const passing = gradeRank(grade) <= gradeRank('C−')
  return passing
    ? { bg: 'rgba(0,229,255,0.08)', border: 'rgba(0,229,255,0.35)', text: '#66F0FF' }
    : { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.35)', text: '#FB7185' }
}

// "2 days ago" for the mobile card's meta line. app.js's historySummary()
// now carries entry.completedAt (a raw epoch) alongside its own pre-
// formatted entry.dateCompleted string, for the same reason the seat/
// pickPosition fields sit side by side there: turning an already-localized
// date string back into a Date to do arithmetic on it has no clean way to
// undo the other's formatting. Same three-step scale (min/hr/day) as
// Ticker.jsx's own timeAgo(), reimplemented rather than shared because that
// one parses a pipeline-log timestamp string, not a bare epoch number — a
// different input shape, not a second opinion on how to phrase "ago".
function relativeAgo(ms) {
  if (typeof ms !== 'number') return null
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function Row({ entry, onAnalyze, onDeleteRequest, menuOpen, onToggleMenu }) {
  const teams = entry.teams
  const fillPct = entry.rank && teams ? Math.max(0, Math.min(100, (1 - (entry.rank - 1) / teams) * 100)) : 0
  const accent = finishColor(entry.rank, teams)
  const tone = tileTone(entry.grade)
  const ago = relativeAgo(entry.completedAt)

  return (
    <>
      {/* Desktop: the eight-column data grid, unchanged — hidden lg:grid
          rather than a bare `grid` now that a second, mobile-only layout
          exists below it for the same entry. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onAnalyze(entry.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAnalyze(entry.id) } }}
        className="hidden cursor-pointer grid-cols-[minmax(0,2.1fr)_64px_62px_104px_minmax(0,1.5fr)_92px_96px_40px] items-center gap-[14px] border-b border-white/[0.04] px-5 py-[13px] transition-colors duration-150 hover:bg-teal-400/[0.045] lg:grid"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-[26px] w-[3px] shrink-0 rounded-full" style={{ background: accent }} />
          <span className="truncate text-sm font-semibold text-white">{entry.leagueType}</span>
        </div>

        <span className="text-sm tabular-nums text-white/60">{entry.seat}</span>

        <span className="font-display text-[19px] font-bold" style={{ color: gradeColor(entry.grade) }}>
          {entry.grade || '—'}
        </span>

        <div className="flex items-center gap-2">
          <span className="w-[30px] shrink-0 text-sm font-semibold tabular-nums text-white/90">
            {entry.projectedRank}
          </span>
          <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full" style={{ width: `${fillPct}%`, background: accent }} />
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2.5">
          {entry.round1Pick ? (
            <>
              {/* Same avatar construction the player queue and profile
                  drawer already use: initials sit underneath as text, the
                  real photo is an absolutely-positioned <img> over them
                  that removes itself on a 404 (a player who's since left
                  the pool, or a photo sleepercdn doesn't have) — never a
                  broken-image icon, just the initials showing through. */}
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-sunk text-[10px] font-bold text-ink-soft">
                {entry.round1PickInitials}
                {entry.round1PickPhoto && (
                  <img
                    src={entry.round1PickPhoto}
                    alt=""
                    loading="lazy"
                    onError={(e) => e.currentTarget.remove()}
                    className={'absolute inset-0 h-full w-full ' + (entry.round1PickPos === 'DST' ? 'object-contain p-1' : 'object-cover')}
                  />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-white/85">{entry.round1Pick}</p>
                {entry.round1PickPos && (
                  <span className={'mt-0.5 inline-block rounded px-1 py-px text-[9px] font-bold leading-tight ' + (POS_BADGE[entry.round1PickPos] || 'bg-white/10 text-white/50')}>
                    {entry.round1PickPos}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className="text-sm text-ink-muted">—</span>
          )}
        </div>

        <span className="text-right text-sm font-medium tabular-nums text-white/70">
          {typeof entry.rosterVorp === 'number'
            ? `${entry.rosterVorp >= 0 ? '+' : ''}${entry.rosterVorp.toFixed(1)}`
            : '—'}
        </span>

        <span className="text-right text-xs tabular-nums text-white/50">{entry.dateCompleted}</span>

        <div className="relative justify-self-end">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleMenu(entry.id) }}
            className="flex h-6 w-6 items-center justify-center rounded text-white/50 transition-colors hover:text-white"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-7 z-10 w-40 overflow-hidden rounded-lg border border-white/10 bg-slate-panel shadow-lg"
            >
              <button
                type="button"
                onClick={() => { onAnalyze(entry.id); onToggleMenu(null) }}
                className="block w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5"
              >
                Analyze draft
              </button>
              <div className="border-t border-white/10" />
              <button
                type="button"
                onClick={() => { onDeleteRequest(entry.id); onToggleMenu(null) }}
                className="block w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-white/5"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: a 52px grade tile, the format as title, seat/order/recency
          beneath, chevron. No kebab menu here — the mockup's row has no
          delete affordance, so a tap goes straight to Analyze rather than
          growing a second interaction the design doesn't show; deleting a
          mock from a phone still works from the desktop table. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onAnalyze(entry.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAnalyze(entry.id) } }}
        className="flex cursor-pointer items-center gap-3.5 border-b border-white/[0.04] px-4 py-3.5 transition-colors duration-150 hover:bg-teal-400/[0.045] lg:hidden"
      >
        <div
          className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-xl border"
          style={{ background: tone.bg, borderColor: tone.border }}
        >
          <span className="font-display text-[19px] font-black leading-none" style={{ color: tone.text }}>
            {entry.grade || '—'}
          </span>
          <span className="mt-1 font-plex text-[11px] tabular-nums text-white/55">
            {entry.rank && teams ? `${entry.rank}/${teams}` : '—'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-white">{entry.leagueType}</p>
          <p className="mt-0.5 truncate font-plex text-[11.5px] text-white/50">
            Seat {entry.seat} · snake{ago ? ` · ${ago}` : ''}
          </p>
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
      </div>
    </>
  )
}

// Delete is a toast-with-undo, not an immediate removal — it's one level
// down in a menu now (per the handoff, precisely so it's no longer sitting
// beside the row's primary action), and a menu click is more likely to be
// mis-hit than a dedicated button was, so an undo window matters more here
// than it would have on the old card layout.
const UNDO_MS = 5000

/* The strip under the table, and it says three different things because
   there are three genuinely different situations under it.

   It used to say one: "these live in this browser only... sign up to keep
   it," unconditionally, with a button opening the early-access dialog.
   That was true and it was the strongest argument on the page — right up
   until accounts shipped and started actually syncing the locker, at
   which point it was telling signed-in people to sign up for something
   they already had, in front of rows that were already backed up.
   Reported with a screenshot of exactly that.

   The third state is the one worth keeping past this fix. "Signed in" and
   "signed in and actually reaching the account" are not the same fact,
   and the whole sync path answers a failure with a falsy value rather
   than an error (see app.js's noteSyncResult) — so a browser writing to
   nowhere looked identical to one that was working, on both devices, and
   that is the shape the "my phone's draft never reached my laptop" report
   took. A page that claims a backup it does not have is worse than one
   that claims nothing, so the error state says so plainly rather than
   softening it into the local-only line. */
// One class string for both triggers below: which of them renders is a
// question about whether Clerk is available, never about how the control
// should look.
const SIGNUP_BTN =
  'shrink-0 rounded-lg bg-teal-400 px-[18px] py-2.5 text-xs font-bold uppercase tracking-wide text-obsidian transition-colors hover:bg-teal-300'

function StorageNote({ count, signedIn, syncStatus, earlyAccessRef }) {
  // Whether Clerk can be rendered at all — see that hook's own comment for
  // the two independent ways it answers false (no key; not mounted yet).
  const accountUiReady = useAccountUiReady()
  // "These 1 mock live in this browser only" was what the old single
  // template produced for a locker with one entry in it, and one entry is
  // exactly what a first-time visitor has. The determiner and the verb
  // have to agree with the count as well as the noun does.
  const one = count === 1
  const these = one ? 'This' : 'These'
  const mocks = `${count} mock${one ? '' : 's'}`
  const live = one ? 'lives' : 'live'
  const are = one ? 'is' : 'are'

  /* Three different faults used to share one sentence, and it was the
     sentence a reader could do least with. They have three different
     answers — sign in again, the account's storage is not set up, the
     network is gone — and telling them apart took a console probe against
     a live session. The engine keeps the reason now (app.js's
     noteSyncResult); this is where it becomes something to act on.

     The prose lives here rather than travelling up with the reason: a
     second copy of it in app.js would be the "written down twice" rule
     with the copy furthest from the reader winning. */
  if (signedIn && syncStatus !== 'ok' && syncStatus !== 'off') {
    const SAY = {
      unauthorized: {
        // Deliberately not "your session expired", which is a guess. This
        // is true of an expired session and of a worker with no
        // CLERK_SECRET_KEY, and signing in again is the right first move
        // either way.
        what: 'Juke could not confirm your sign-in',
        next: `Signing out and back in usually fixes it. ${one ? 'This mock is' : 'These are'} safe here meanwhile.`,
      },
      'store-failed': {
        // The one case where the reader is not the person who can fix it,
        // and saying so is better than implying they should retry.
        what: "Juke reached your account but couldn't save to it",
        next: 'That is our end, not yours, and nothing is lost here while it is sorted out.',
      },
      'id-taken': {
        // The one reason here that will not clear on its own, so it must
        // not borrow offline's "they will sync once the connection is
        // back" — the connection is fine and the retry is the thing that
        // cannot work. recordHistory() mints the id, so a fresh mock gets
        // a fresh one and syncs normally; only this entry is stuck.
        what: `Juke could not add ${one ? 'this mock' : 'one of these mocks'} to your account`,
        next: 'Its id is already in use. Nothing is lost here, and later mocks will sync as usual.',
      },
      offline: {
        what: "Juke can't reach your account right now",
        next: `${one ? 'It' : 'They'} will sync on ${one ? 'its' : 'their'} own once the connection is back.`,
      },
    }
    const say = SAY[syncStatus] || SAY.offline
    return (
      <div className="flex flex-wrap items-center gap-4 border-t border-amber-400/20 bg-amber-400/[0.04] px-5 py-[13px]">
        <CloudAlert className="h-[15px] w-[15px] shrink-0 text-amber-300" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/80">
          {say.what} &mdash; {these.toLowerCase()} {mocks} {are} in <b>this browser only</b> for now.{' '}
          {say.next}
        </p>
      </div>
    )
  }

  if (signedIn) {
    return (
      <div className="flex flex-wrap items-center gap-4 border-t border-teal-400/[0.15] bg-teal-400/[0.03] px-5 py-[13px]">
        <CloudCheck className="h-[15px] w-[15px] shrink-0 text-teal-300" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/80">
          {these} {mocks} {are} saved to <b>your account</b>. {one ? 'It follows' : 'They follow'} you to
          any browser you sign in on.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-teal-400/[0.15] bg-teal-400/[0.03] px-5 py-[13px]">
      <HardDrive className="h-[15px] w-[15px] shrink-0 text-teal-300" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/80">
        {these} {mocks} {live} in <b>this browser only</b>. Clear your history and the
        locker and your tendencies go with {one ? 'it' : 'them'}.
      </p>
      {/* A real sign-up, not the waitlist form this used to open.

          The old handler said "leave an email and we'll tell you when they
          can live in an account instead", which was honest right up until
          accounts shipped — after which it was a control promising to
          notify somebody about a thing they could have done by pressing
          it. Same dead-control fix the phone nav's own You tab already
          took for the identical stale sentence.

          The EarlyAccessModal fallback stays for the one case that is
          still true: a checkout with no publishable key, where Clerk
          cannot render and a button that throws is worse than a button
          that collects an email. */}
      {accountUiReady ? (
        <SignUpButton mode="modal">
          <button type="button" className={SIGNUP_BTN}>Sign up to keep it</button>
        </SignUpButton>
      ) : (
        <button
          type="button"
          onClick={() =>
            earlyAccessRef.current?.open(
              'Your mocks live in this browser today. Leave an email and we will tell you when ' +
                'accounts are open here.',
              'locker'
            )
          }
          className={SIGNUP_BTN}
        >
          Sign up to keep it
        </button>
      )}
    </div>
  )
}

export default function LockerTable({ entries, onAnalyze, onDeleteConfirmed, syncStatus = 'off' }) {
  const signedIn = useSignedIn()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [seatFilter, setSeatFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [visibleCount, setVisibleCount] = useState(8)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [pending, setPending] = useState(null) // { id, entry }
  const pendingTimer = useRef(null)
  const earlyAccessRef = useRef(null)

  // Takes the id directly rather than reading `pending` from closure — a
  // setTimeout callback scheduled inside requestDelete() closes over
  // whatever `pending` was AT SCHEDULE TIME, which is still null (the
  // setPending() call below hasn't flushed to a re-render yet when the
  // timer is created). Reading `pending` here instead of taking `id` as a
  // parameter always sees that stale null and silently no-ops five seconds
  // later — a real bug caught by actually waiting out the undo window
  // rather than assuming the timer works. The `cur.id === id` check guards
  // the rare case where undo() or a second delete already cleared/replaced
  // pending before this fires.
  const finalizeById = (id) => {
    onDeleteConfirmed(id)
    setPending((cur) => (cur && cur.id === id ? null : cur))
  }

  const requestDelete = (id) => {
    // Only one pending deletion at a time — a second delete while the first
    // is still undoable finalizes the first immediately rather than
    // stacking toasts for a genuinely rare double-delete.
    if (pending) finalizeById(pending.id)
    if (pendingTimer.current) clearTimeout(pendingTimer.current)
    const entry = entries.find((e) => e.id === id)
    setPending({ id, entry })
    pendingTimer.current = setTimeout(() => finalizeById(id), UNDO_MS)
  }

  const undo = () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current)
    setPending(null)
  }

  const filtered = useMemo(() => {
    let list = entries.filter((e) => !pending || e.id !== pending.id)
    if (filter !== 'all') list = list.filter((e) => e.leagueType.toLowerCase().includes(
      filter === 'ppr' ? 'full ppr' : filter === 'half' ? 'half ppr' : 'standard'
    ))
    if (seatFilter !== 'all') list = list.filter((e) => seatBucket(e) === seatFilter)
    if (dateFilter !== 'all') {
      const cutoff = Date.now() - Number(dateFilter) * 86400000
      list = list.filter((e) => typeof e.completedAt === 'number' && e.completedAt >= cutoff)
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((e) =>
        e.leagueType.toLowerCase().includes(q) || (e.round1Pick || '').toLowerCase().includes(q)
      )
    }
    const sorted = list.slice()
    if (sort === 'oldest') sorted.reverse()
    else if (sort === 'grade') sorted.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade))
    else if (sort === 'finish') sorted.sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity))
    // 'newest' is entries' own order — historyList() already returns
    // newest-first, matching recordHistory()'s unshift().
    return sorted
  }, [entries, filter, seatFilter, dateFilter, query, sort, pending])

  const visible = filtered.slice(0, visibleCount)

  // Below NEEDS_CONTROLS_ABOVE, search/filter/sort would only ever act on
  // rows already fully visible below — real controls with nothing to
  // control. The state and the filtering logic above still run either way,
  // so a search typed before this threshold (there's no way to, with the
  // box hidden, but a stale query lingering under it) never leaves the list
  // showing something the header doesn't explain.
  const showControls = entries.length > NEEDS_CONTROLS_ABOVE

  return (
    // h-full + flex-col so this card can be handed a real height by
    // DraftLocker's own flex-1 wrapper and stretch to fill it — see the
    // comment there. The rows block below is the flex-1 child that absorbs
    // the extra space; the summary/"Load more" footer stays a normal
    // sibling after it, so it settles at the bottom of a tall card instead
    // of hugging the last row with a gap of bare background beneath it.
    // The ground is an inline style rather than a class only because it
    // always was; it is slate-panel at the same alpha the charcoal it
    // replaced carried. Worth knowing that an inline colour is invisible to
    // a class-name sweep — this one survived a repo-wide pass over every
    // bg-* utility and turned up only by reading computed styles off the
    // running page.
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/[0.08]" style={{ background: 'rgba(35,45,58,0.5)' }}>
      <div className="flex flex-wrap items-center gap-4 border-b border-white/[0.06] px-5 py-4">
        <h2 className="font-display text-[23px] font-bold text-white">The Locker</h2>

        {showControls && (
          <>
            {/* w-full below sm: the fixed 226px this has always been is
                already tight for its own placeholder text at that width
                (pre-existing, not something this pass changed) — on a
                375px phone it clips mid-word ("Search by player or forr"),
                since text-overflow here is the default clip, not ellipsis.
                There's no room pressure on a narrow screen the way there is
                on desktop next to five other controls, so it can simply be
                as wide as the row and stop needing to be tight at all. */}
            <div className="flex w-full items-center gap-2 rounded-lg border border-white/[0.08] bg-slate-sunk/60 px-3 py-[7px] sm:w-[226px]">
              <Search className="h-3.5 w-3.5 shrink-0 text-white/50" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setVisibleCount(8) }}
                placeholder="Search by player or format"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none"
              />
            </div>

            <div className="flex gap-[3px] rounded-full bg-white/5 p-[3px]">
              {FORMAT_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => { setFilter(f.key); setVisibleCount(8) }}
                  className={
                    'rounded-full px-[13px] py-1.5 text-xs font-semibold transition-colors ' +
                    (filter === f.key ? 'bg-teal-400/[0.16] text-teal-300' : 'text-white/55 hover:text-white')
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex gap-[3px] rounded-full bg-white/5 p-[3px]">
              {SEAT_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => { setSeatFilter(f.key); setVisibleCount(8) }}
                  className={
                    'rounded-full px-[13px] py-1.5 text-xs font-semibold transition-colors ' +
                    (seatFilter === f.key ? 'bg-teal-400/[0.16] text-teal-300' : 'text-white/55 hover:text-white')
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <select
                value={dateFilter}
                onChange={(e) => { setDateFilter(e.target.value); setVisibleCount(8) }}
                className="appearance-none rounded-lg border border-white/[0.08] bg-slate-sunk/60 py-[7px] pl-3 pr-8 text-sm font-medium text-white/80 focus:outline-none"
              >
                {DATE_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-white/50">Sort</span>
              <div className="relative">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="appearance-none rounded-lg border border-white/[0.08] bg-slate-sunk/60 py-[7px] pl-3 pr-8 text-sm font-medium text-white/80 focus:outline-none"
                >
                  {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
              </div>
            </div>
          </>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-[46px] text-center">
          <p className="font-display text-[19px] font-bold text-white/80">No mocks yet</p>
          <p className="mt-1.5 text-sm text-white/50">
            Finish one and it lands here with its grade, your seat and every pick.
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1">
            {/* hidden lg:grid: the eight-column header has nothing to head
                below lg, where Row() renders cards instead of grid cells. */}
            <div className="hidden grid-cols-[minmax(0,2.1fr)_64px_62px_104px_minmax(0,1.5fr)_92px_96px_40px] gap-[14px] border-b border-white/[0.06] bg-slate-sunk/40 px-5 py-[9px] lg:grid">
              {['Format', 'Seat', 'Grade', 'Proj. finish', 'First pick'].map((h) => (
                <span key={h} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/50">{h}</span>
              ))}
              <span className="text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/50">Roster VORP</span>
              <span className="text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-white/50">Completed</span>
              <span />
            </div>

            {visible.map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                onAnalyze={onAnalyze}
                onDeleteRequest={requestDelete}
                menuOpen={menuOpenId === entry.id}
                onToggleMenu={(id) => setMenuOpenId((cur) => (cur === id ? null : id))}
              />
            ))}
          </div>

          <div className="flex items-center justify-between px-5 py-[14px]">
            <span className="text-xs tabular-nums text-white/50">
              Showing {visible.length} of {filtered.length}
            </span>
            {visibleCount < filtered.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/75 transition-colors hover:border-teal-400/45 hover:text-teal-300"
              >
                Load 20 more
              </button>
            )}
          </div>

          <StorageNote count={entries.length} signedIn={signedIn} syncStatus={syncStatus} earlyAccessRef={earlyAccessRef} />
        </>
      )}

      <EarlyAccessModal ref={earlyAccessRef} />

      {pending && (
        // bottom offset clears MobileAppTabBar's own fixed 58px + safe-area
        // footprint below lg — the same reserved amount DraftRoom.jsx's
        // scroll container already pads for, read here instead of guessed,
        // so the toast doesn't surface behind the tab bar it would otherwise
        // sit under.
        <div
          className="fixed bottom-[calc(58px+env(safe-area-inset-bottom)+16px)] left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full border border-white/10 bg-slate-panel px-5 py-3 shadow-lg lg:bottom-6"
        >
          <span className="text-sm text-white/80">Draft removed</span>
          <button type="button" onClick={undo} className="text-sm font-semibold text-teal-300 hover:text-teal-200">
            Undo
          </button>
        </div>
      )}
    </div>
  )
}

const GRADE_ORDER = ['A+', 'A', 'A−', 'B+', 'B', 'B−', 'C+', 'C', 'C−', 'D+', 'D', 'D−', 'F+', 'F']
function gradeRank(grade) {
  const i = GRADE_ORDER.indexOf(grade)
  return i === -1 ? GRADE_ORDER.length : i
}
