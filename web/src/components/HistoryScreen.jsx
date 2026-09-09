import { useMemo, useState } from 'react'
import { SignUpButton, SignedOut } from '@clerk/clerk-react'
import AppShell from './shell/AppShell.jsx'
import VerdictBadge from './ledger/VerdictBadge.jsx'
import KpiStrip from './decision/KpiStrip.jsx'
import {
  confidenceLabel,
  matchesConfidence,
  matchesOutcome,
  CONFIDENCE_BUCKETS,
} from './ledger/verdicts.js'
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

/* One filter tab, drawn the way the rail beside it draws a room.
 *
 * The guide asks for "filters -> rail-style tabs", and the difference is
 * narrower than it sounds: this was already mint-on-mintDark when on. What
 * it was not was a LOZENGE -- it carried an outline in both states, so a
 * row of nine of them read as nine equal controls with one tinted, where
 * RailNav reads as a filled marker sitting in a row of grounds. Same two
 * colours, same radius, and the off state is `flow.tile` rather than a
 * border, which is what makes the on state the only edge in the row.
 *
 * `aria-pressed` stays rather than becoming `aria-current`: the rail's
 * items are links to a place and these are toggles over a list, which is
 * a different thing however alike they look. */
function Chip({ label, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        'rounded-xl px-3.5 py-[7px] text-[13px] font-semibold transition-colors duration-150 ' +
        (on ? 'bg-flow-mintDark text-mint' : 'bg-flow-tile text-ink-muted hover:text-white')
      }
    >
      {label}
    </button>
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
    /* 190px, not 150. The meta line is "STRATEGY · WK 4 · HIGH" at 11px
       mono with 0.1em tracking, which measures past 150 and wrapped the
       confidence onto its own line on exactly the rows that carry one --
       so two of five rows were a different height than the rest for no
       reason a reader could see. It read "· 68%" when that was measured
       and the band that replaced it is wider, so the column has less slack
       than it did rather than more. */
    <div className="grid grid-cols-1 gap-2 border-b border-line-hairline py-3.5 lg:grid-cols-[190px_1fr_1fr_1fr_auto] lg:items-center lg:gap-4">
      <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
        {(decision.room || '').toUpperCase()} · {when}
        {/* The band, not the number. A bare percentage on a row is the one
            thing the decision system's global rules name outright, and the
            usual replacement -- <Confidence> -- cannot be drawn here: it
            shows signals, error and sample, and a decision record carries
            none of the three. `confidenceLabel()` reads the same thresholds
            the filter above this list already sorts on, so the row and the
            filter cannot disagree about which band it is in. */}
        {confidenceLabel(decision.confidence)
          ? ` · ${confidenceLabel(decision.confidence)}`
          : ''}
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
      graded,
    }
  }, [decisions])

  /* P4. The five tiles become four KPI cards, and two of the guide's own
     four are not among them.
 
     It asks for hits, misses, inconclusive and NET PTS. Net points needs a
     decision to carry what its call was worth, and nothing writes one: the
     `decisions` table stores the record whole in `data`, no room writes a
     decision at all yet, and there is no grader -- `verdict` is the only
     thing grading will ever set. A KPI strip is the most confident
     furniture on a page and this one's whole subject is a record you can
     check, so a made-up total here would be the worst available place in
     the product to invent a number. It arrives with the grader.
 
     "Inconclusive" gives its card to PENDING for a smaller reason, and one
     the store already states: a decision is written when it is made and
     graded only after the week is over, so ungraded is the state this
     ledger spends most of its life in. Inconclusive is one of five verdicts
     behind the "Other" filter and a reader can reach it there; pending is
     most of the list and had nowhere else to be counted.
 
     Every count is over the WHOLE ledger and never the filtered slice --
     see the note on `stats` above, which is why they are read off it. */
  const kpis = useMemo(
    () => [
      {
        label: 'Good calls',
        value: stats.good,
        accent: 'gain',
        note: stats.graded ? `Of ${stats.graded} graded so far.` : 'Nothing graded yet.',
      },
      {
        label: 'Bad calls',
        value: stats.bad,
        accent: 'cost',
        note: 'Calls the week went against.',
      },
      {
        label: 'Pending',
        value: stats.pending,
        accent: 'evidence',
        note: 'Written down, not yet gradeable.',
      },
      {
        label: 'Hit rate',
        value: stats.rate,
        accent: 'evidence',
        note: stats.graded
          ? 'Good calls as a share of graded ones.'
          : 'A rate over nothing is unknown, not zero.',
      },
    ],
    [stats]
  )

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
      {/* gap-6 between groups against gap-1 within one. With the outlined
          pill gone every tab is a filled lozenge, so the only thing left
          telling three filter groups apart is the space between them --
          and two of the three open with a chip reading "All". */}
      <div className="mb-3.5 flex flex-wrap gap-x-6 gap-y-2">
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

      {/* "Recorded" is not a fifth card: the eyebrow above already reads
          "DECISION HISTORY · N RECORDED", and a strip of five under a
          four-column grid leaves one card alone on its own row. */}
      <KpiStrip items={kpis} className="mb-4" />

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
