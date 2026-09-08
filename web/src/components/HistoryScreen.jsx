import { useMemo, useState } from 'react'
import { SignUpButton, SignedOut } from '@clerk/clerk-react'
import AppShell from './shell/AppShell.jsx'
import VerdictBadge from './ledger/VerdictBadge.jsx'
import { matchesConfidence, matchesOutcome, CONFIDENCE_BUCKETS } from './ledger/verdicts.js'
import { useDecisions } from '../hooks/useDecisions.js'
import { useAccountUiReady } from '../hooks/useAccountUiReady.js'

/* #/history — Juke Journey v3's decision ledger.
 *
 * "Juke said -> you did -> reality -> verdict", which is the handoff's own
 * H1 and the four things a row holds.
 *
 * ---- This is not #/drafts, and the rail used to point there ----
 *
 * #/drafts (DraftsScreen.jsx) is the mock-draft archive: every draft you
 * have completed. This is the record of calls Juke made about a REAL
 * roster and whether they were right. The two were one rail item for as
 * long as there was no ledger to point at -- the phase 1 plan recorded
 * History as "the existing mock-draft archive, relabelled" precisely
 * because a real ledger had no data source. It has one now.
 *
 * They stay separate screens for the reason the tables stay separate: a
 * mock draft already has a home, and one fact in two places is the failure
 * this project is most arranged against. #/drafts keeps its own Start-less
 * archive; the Draft Room's entry keeps linking to it.
 *
 * ---- A guest sees an explanation, not sample rows ----
 *
 * MyLeagueDemo.jsx fills My League with real players and invented numbers
 * for a signed-out reader, and that is right there: the demo shows what
 * the product looks like WORKING, and a hero that says "a sample week" is
 * honest about it.
 *
 * A sample ledger is a different object. This screen's entire claim is
 * that it is a record you can check -- so filling it with decisions
 * somebody never made undermines the one thing it is for, and the reader
 * has no way to tell a demonstration from their own history once they sign
 * in and the two sit in the same layout. So a signed-out visitor gets the
 * shape of the screen, the vocabulary, and a sentence about what lands
 * here. Nothing that looks like a record.
 *
 * ---- Four states, all four drawn ----
 *
 * useDecisions() answers loading / none / ready / error, and "error" is
 * drawn rather than collapsed into "none" for the reason decisionStore's
 * own header gives: "no decisions yet" over an unreachable worker tells
 * somebody their record is empty when it is not, which on this screen is
 * the worst thing it could say.
 */

/* Same page size and the same reasoning as DraftsScreen: this screen IS
   the archive, so nothing may be unreachable from it, and rendering every
   row at once walks the filters off the top of the page. */
const PAGE_SIZE = 20

const OUTCOMES = ['All', 'Good call', 'Bad call', 'Pending', 'Other']

/* The `room` column stores a slug ('waiver'), which is right for a key and
   wrong for a pill -- a filter row reading "strategy trade waiver" beside
   "Good call" and "High >=75" reads as unfinished. Capitalised here rather
   than stored capitalised, so the value the grader selects on stays the
   one the rail and the route already use. */
function roomLabel(slug) {
  return slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : slug
}

function Chip({ label, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        'rounded-full border px-3.5 py-[7px] text-[13px] font-semibold transition-colors duration-150 ' +
        (on
          ? 'border-mint bg-flow-mintDark text-mint'
          : 'border-line-hairline text-voidInk-body hover:text-white')
      }
    >
      {label}
    </button>
  )
}

function Tile({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-[12px] border border-line-hairline bg-surface-card p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">{label}</div>
      <div className={'mt-1 font-display text-[24px] font-extrabold ' + tone}>{value}</div>
    </div>
  )
}

/* One row. `did` and `reality` are the two halves that arrive later than
   the recommendation -- a decision is written when Juke recommends, and
   only then acted on and graded -- so both fall back to a dash rather than
   an empty cell. A blank where a fact goes reads as a rendering fault; a
   dash reads as "not yet", which is what it is. */
function DecisionRow({ decision }) {
  const when = decision.week === 0 ? 'Draft' : `Wk ${decision.week}`
  return (
    /* 190px, not 150. The meta line is "STRATEGY · WK 4 · 68%" at 11px
       mono with 0.1em tracking, which measures past 150 and wrapped the
       confidence onto its own line on exactly the rows that carry one --
       so two of five rows were a different height than the rest for no
       reason a reader could see. */
    <div className="grid grid-cols-1 gap-2 border-b border-line-hairline py-3.5 lg:grid-cols-[190px_1fr_1fr_1fr_auto] lg:items-center lg:gap-4">
      <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
        {(decision.room || '').toUpperCase()} · {when}
        {typeof decision.confidence === 'number' ? ` · ${decision.confidence}%` : ''}
      </div>
      <div className="min-w-0">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted lg:hidden">
          Juke said
        </span>
        <div className="truncate text-[15px] font-semibold text-white">{decision.said || '—'}</div>
      </div>
      <div className="min-w-0">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted lg:hidden">
          You did
        </span>
        <div className="truncate text-[13px] text-voidInk-body">{decision.did || '—'}</div>
      </div>
      <div className="min-w-0">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted lg:hidden">
          Reality
        </span>
        <div className="truncate text-[13px] text-voidInk-body">{decision.reality || '—'}</div>
      </div>
      <VerdictBadge verdict={decision.verdict} />
    </div>
  )
}

function Shell({ eyebrow, children }) {
  return (
    <AppShell active="history">
      <div className="mx-auto max-w-[1280px] px-5 pt-[22px] sm:px-10 sm:pt-10">
        <div className="mb-1.5 font-mono text-[11px] tracking-[0.1em] text-teal">
          <span className="mr-1.5" aria-hidden="true">🗓</span>
          {eyebrow}
        </div>
        <h1 className="m-0 mb-6 font-display text-[24px] font-extrabold text-white sm:text-[30px]">
          Juke said <span className="text-ink-muted">→</span> you did{' '}
          <span className="text-ink-muted">→</span> reality{' '}
          <span className="text-ink-muted">→</span> verdict
        </h1>
        {children}
      </div>
    </AppShell>
  )
}

function Notice({ title, body, action }) {
  return (
    <div className="rounded-[14px] border border-line-hairline bg-surface-card p-7 text-center">
      <div className="text-[15px] font-semibold text-white">{title}</div>
      <p className="mx-auto mt-2 max-w-[52ch] text-[13px] leading-relaxed text-voidInk-body">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export default function HistoryScreen() {
  const { status, decisions, reason, retry } = useDecisions()
  const accountReady = useAccountUiReady()
  const [room, setRoom] = useState('All')
  const [outcome, setOutcome] = useState('All')
  const [confidence, setConfidence] = useState('All')
  const [shown, setShown] = useState(PAGE_SIZE)

  /* Room pills are derived from the ledger rather than listed.

     The handoff hardcodes All / Draft / Waiver / Strategy / Trade /
     Prospect. Four of those six rooms write nothing today and the fifth
     (Draft) writes to draft_history and never to this table, so a fixed
     list would offer five pills that filter to nothing -- the dead-control
     failure DraftsScreen's own pills already avoid the same way. Derived,
     a room appears here the day it starts recording. */
  const rooms = useMemo(() => {
    const seen = []
    decisions.forEach((d) => {
      if (d.room && seen.indexOf(d.room) < 0) seen.push(d.room)
    })
    return seen.sort()
  }, [decisions])

  const filtered = useMemo(
    () =>
      decisions.filter(
        (d) =>
          (room === 'All' || d.room === room) &&
          matchesOutcome(outcome, d.verdict) &&
          matchesConfidence(confidence, d.confidence)
      ),
    [decisions, room, outcome, confidence]
  )

  /* Counted over the WHOLE ledger, never the filtered slice. A hit rate
     that moves when you press a filter is not a hit rate -- it is the
     filter's own arithmetic, and a reader would take it for a fact about
     their season. */
  const stats = useMemo(() => {
    const good = decisions.filter((d) => d.verdict === 'good').length
    const bad = decisions.filter((d) => d.verdict === 'bad').length
    const graded = good + bad
    return {
      total: decisions.length,
      good,
      bad,
      pending: decisions.filter((d) => !d.verdict || d.verdict === 'pending').length,
      // A rate over nothing is not 0%, it is unknown -- the same rule
      // perGame() already follows about dividing by a fallback.
      rate: graded ? Math.round((good / graded) * 100) + '%' : '—',
    }
  }, [decisions])

  if (status === 'loading') {
    return (
      <Shell eyebrow="DECISION HISTORY">
        <div className="h-[120px] animate-pulse rounded-[14px] border border-line-hairline bg-surface-card" />
      </Shell>
    )
  }

  if (status === 'error') {
    return (
      <Shell eyebrow="DECISION HISTORY">
        <Notice
          title="We could not reach your history"
          body={
            reason === 'unauthorized'
              ? 'Your session could not be verified. Signing in again usually fixes it.'
              : 'Your decisions are safe — this page just could not read them. Nothing has been lost.'
          }
          action={
            <button
              type="button"
              onClick={retry}
              className="rounded-full border border-mint px-4 py-2 text-[13px] font-semibold text-mint"
            >
              Try again
            </button>
          }
        />
      </Shell>
    )
  }

  if (status === 'none' && reason === 'signed-out') {
    return (
      <Shell eyebrow="DECISION HISTORY">
        <Notice
          title="Your record starts when you connect a league"
          body={
            'Every call Juke makes in the Waiver, Trade, Strategy and Prospect rooms is written down here ' +
            'with what you actually did and what happened next — so the advice can be checked rather than ' +
            'taken on trust. There is nothing to show yet, and a sample would defeat the point.'
          }
          action={
            accountReady ? (
              <SignedOut>
                <SignUpButton mode="modal">
                  <button
                    type="button"
                    className="rounded-full bg-teal px-4 py-2 text-[13px] font-bold text-obsidian"
                  >
                    Create an account
                  </button>
                </SignUpButton>
              </SignedOut>
            ) : null
          }
        />
      </Shell>
    )
  }

  if (status === 'none') {
    return (
      <Shell eyebrow="DECISION HISTORY · 0 RECORDED">
        <Notice
          title="No decisions recorded yet"
          body={
            'The in-season rooms write here as they make calls on your roster. Nothing has been recorded ' +
            'against your league so far.'
          }
        />
      </Shell>
    )
  }

  const page = filtered.slice(0, shown)
  const reset = (fn) => (value) => { fn(value); setShown(PAGE_SIZE) }

  return (
    <Shell eyebrow={`DECISION HISTORY · ${stats.total} RECORDED`}>
      <div className="mb-3.5 flex flex-wrap gap-4">
        {rooms.length > 1 ? (
          <div role="group" aria-label="Room" className="flex flex-wrap gap-1">
            {['All'].concat(rooms).map((key) => (
              <Chip
                key={key}
                label={key === 'All' ? 'All rooms' : roomLabel(key)}
                on={room === key}
                onClick={() => reset(setRoom)(key)}
              />
            ))}
          </div>
        ) : null}
        <div role="group" aria-label="Outcome" className="flex flex-wrap gap-1">
          {OUTCOMES.map((key) => (
            <Chip key={key} label={key} on={outcome === key} onClick={() => reset(setOutcome)(key)} />
          ))}
        </div>
        <div role="group" aria-label="Confidence" className="flex flex-wrap gap-1">
          {CONFIDENCE_BUCKETS.map((key) => (
            <Chip key={key} label={key} on={confidence === key} onClick={() => reset(setConfidence)(key)} />
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Recorded" value={stats.total} />
        <Tile label="Good calls" value={stats.good} tone="text-mint" />
        <Tile label="Bad calls" value={stats.bad} tone="text-flow-rose" />
        <Tile label="Pending" value={stats.pending} tone="text-ink-soft" />
        <Tile label="Hit rate" value={stats.rate} />
      </div>

      <section className="rounded-[14px] border border-line-hairline bg-surface-card px-4 sm:px-6">
        {page.length ? (
          page.map((d) => <DecisionRow key={d.id} decision={d} />)
        ) : (
          <div className="py-10 text-center text-[13px] text-ink-muted">
            No decisions match these filters.
          </div>
        )}
      </section>

      {filtered.length > page.length ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-[13px] text-voidInk-body">
          <span>
            Showing {page.length} of {filtered.length}
          </span>
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            className="rounded-full border border-line-hairline px-4 py-2 font-semibold text-white"
          >
            Show {Math.min(PAGE_SIZE, filtered.length - page.length)} more
          </button>
        </div>
      ) : null}
    </Shell>
  )
}
