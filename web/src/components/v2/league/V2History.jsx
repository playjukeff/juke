import { useMemo, useState } from 'react'
import { SignUpButton } from '@clerk/clerk-react'
import {
  CONFIDENCE_BUCKETS,
  VERDICTS,
  VERDICT_KEYS,
  confidenceLabel,
  matchesConfidence,
  matchesOutcome,
} from '../../ledger/verdicts.js'
import { useDecisionsFresh as useDecisions, useLeagueFresh as useLeague } from '../stores.js'
import { useAccountUiReady } from '../../../hooks/useAccountUiReady.js'
import { Arrow, GhostButton, Kicker, Segmented, Skeleton, Tween, VoltButton } from '../v2ui.jsx'
import { CARD, KpiTile, Notice, PageHead, VerdictChip, verdictTone } from './parts.jsx'

/* #/v2/history — the decision ledger. Juke said → you did → reality →
   verdict, one row per call a room made about a real roster.

   The same store and the same four states as production's HistoryScreen
   (decisionStore: loading / none / ready / error), and the same refusal:
   a signed-out visitor gets the shape of the screen and its vocabulary,
   never sample rows. A record whose whole claim is that it can be checked
   cannot be demonstrated with calls nobody made. Counts are over the whole
   ledger, never the filtered slice — a hit rate that moves when you press
   a filter is the filter's arithmetic, not a fact about your season. */

const PAGE = 20
const OUTCOMES = ['All', 'Good call', 'Bad call', 'Pending', 'Other']
const STEPS = ['Juke said', 'You did', 'Reality', 'Verdict']

function roomLabel(slug) {
  return slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : slug
}

function Chain() {
  return (
    <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="How a row reads">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className="rounded-[8px] bg-white/[0.04] px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-v2-ink ring-1 ring-inset ring-white/[0.1]">
            <span className="mr-1.5 text-v2-ink3">{String(i + 1).padStart(2, '0')}</span>{s}
          </span>
          {i < STEPS.length - 1 ? <Arrow className="h-3.5 w-3.5 text-v2-ink3" /> : null}
        </li>
      ))}
    </ol>
  )
}

/* The nine verdicts, read off the ledger's own map. Real vocabulary, not
   a sample record — so it is what an empty ledger can show honestly. */
function Vocabulary() {
  return (
    <div className={`${CARD} mt-4 p-5 sm:p-6`}>
      <Kicker>Every verdict a call can carry</Kicker>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {VERDICT_KEYS.map((k) => (
          <li key={k} className="flex items-center gap-2.5 rounded-[10px] bg-v2-inset px-3 py-2 ring-1 ring-inset ring-white/[0.05]">
            <span className={`w-4 text-center font-mono text-[14px] ${verdictTone(k)}`} aria-hidden="true">{VERDICTS[k].glyph}</span>
            <span className="text-[13px] text-v2-ink">{VERDICTS[k].label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Row({ d }) {
  const when = Number(d.week) === 0 ? 'Draft' : `Wk ${d.week}`
  const band = confidenceLabel(d.confidence)
  const cell = (label, text, strong) => (
    <div className={`min-w-0 ${strong ? 'col-span-2 lg:col-span-1' : ''}`}>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3 lg:hidden">{label}</span>
      <div className={`truncate ${strong ? 'text-[15px] font-semibold text-v2-ink' : 'text-[14px] text-v2-ink2'}`}>{text || '—'}</div>
    </div>
  )
  return (
    <li className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-white/[0.05] px-4 py-3.5 last:border-b-0 sm:px-5 lg:grid-cols-[170px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_200px] lg:items-center lg:gap-4">
      <div className="col-span-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-v2-ink2 lg:col-span-1">
        {(d.room || '—').toUpperCase()} <span className="text-v2-ink3">·</span> {when}
        {band ? <span className="text-v2-ink3"> · {band}</span> : null}
      </div>
      {cell('Juke said', d.said, true)}
      {cell('You did', d.did)}
      {cell('Reality', d.reality)}
      <div className="col-span-2 lg:col-span-1 lg:text-right"><VerdictChip verdict={d.verdict} /></div>
    </li>
  )
}

function Filters({ rooms, room, setRoom, outcome, setOutcome, confidence, setConfidence }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      {rooms.length > 1 ? (
        <div className="max-w-full overflow-x-auto"><div className="w-max">
          <Segmented
            label="Room"
            size="sm"
            options={[{ value: 'All', label: 'All rooms' }].concat(rooms.map((r) => ({ value: r, label: roomLabel(r) })))}
            value={room}
            onChange={setRoom}
          />
        </div></div>
      ) : null}
      <div className="max-w-full overflow-x-auto"><div className="w-max">
        <Segmented label="Outcome" size="sm" options={OUTCOMES.map((o) => ({ value: o, label: o }))} value={outcome} onChange={setOutcome} />
      </div></div>
      <div className="max-w-full overflow-x-auto"><div className="w-max">
        <Segmented label="Confidence" size="sm" options={CONFIDENCE_BUCKETS.map((o) => ({ value: o, label: o }))} value={confidence} onChange={setConfidence} />
      </div></div>
    </div>
  )
}

function Ledger({ decisions }) {
  const [room, setRoom] = useState('All')
  const [outcome, setOutcome] = useState('All')
  const [confidence, setConfidence] = useState('All')
  const [shown, setShown] = useState(PAGE)

  const rooms = useMemo(() => {
    const seen = []
    decisions.forEach((d) => { if (d.room && seen.indexOf(d.room) < 0) seen.push(d.room) })
    return seen.sort()
  }, [decisions])

  const filtered = useMemo(
    () => decisions.filter((d) => (room === 'All' || d.room === room) && matchesOutcome(outcome, d.verdict) && matchesConfidence(confidence, d.confidence)),
    [decisions, room, outcome, confidence]
  )

  const stats = useMemo(() => {
    const good = decisions.filter((d) => d.verdict === 'good').length
    const bad = decisions.filter((d) => d.verdict === 'bad').length
    const pending = decisions.filter((d) => !d.verdict || d.verdict === 'pending' || !VERDICTS[d.verdict]).length
    const graded = good + bad
    return { total: decisions.length, good, bad, pending, other: decisions.length - good - bad - pending, graded, rate: graded ? Math.round((good / graded) * 100) : null }
  }, [decisions])

  const reset = (fn) => (v) => { fn(v); setShown(PAGE) }
  const page = filtered.slice(0, shown)
  const seg = (n) => (stats.total ? `${(n / stats.total) * 100}%` : '0%')

  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Good calls" value={<Tween value={stats.good} />} note={stats.graded ? `Of ${stats.graded} graded so far.` : 'Nothing graded yet.'} />
        <KpiTile label="Bad calls" value={<Tween value={stats.bad} />} note="Calls the week went against." />
        <KpiTile label="Pending" value={<Tween value={stats.pending} />} note="Written down, not yet gradeable." />
        <KpiTile
          label="Hit rate"
          value={stats.rate === null ? '—' : <><Tween value={stats.rate} />%</>}
          note={stats.graded ? 'Good calls as a share of graded ones.' : 'A rate over nothing is unknown, not zero.'}
        />
      </div>

      <div className={`${CARD} mt-3 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Kicker>The whole ledger · {stats.total} recorded</Kicker>
          <span className="font-mono text-[11px] tabular-nums text-v2-ink3">
            {stats.good} good · {stats.bad} bad · {stats.pending} pending{stats.other ? ` · ${stats.other} other` : ''}
          </span>
        </div>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/[0.05]" role="img" aria-label={`${stats.good} good, ${stats.bad} bad, ${stats.pending} pending, ${stats.other} other`}>
          <span className="h-full bg-v2-volt/80" style={{ width: seg(stats.good) }} />
          <span className="h-full bg-v2-loss/80" style={{ width: seg(stats.bad) }} />
          <span className="h-full bg-v2-warn/70" style={{ width: seg(stats.other) }} />
          <span className="h-full bg-white/[0.14]" style={{ width: seg(stats.pending) }} />
        </div>
      </div>

      <div className="mt-6">
        <Filters rooms={rooms} room={room} setRoom={reset(setRoom)} outcome={outcome} setOutcome={reset(setOutcome)} confidence={confidence} setConfidence={reset(setConfidence)} />
      </div>

      <section className={`${CARD} mt-4 overflow-hidden`} aria-label="Decisions">
        <div className="hidden grid-cols-[170px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_200px] gap-4 border-b border-white/[0.07] px-5 py-2.5 lg:grid" aria-hidden="true">
          <Kicker>Room · week</Kicker>
          {STEPS.map((s, i) => <Kicker key={s} className={i === STEPS.length - 1 ? 'text-right' : ''}>{s}</Kicker>)}
        </div>
        {page.length ? (
          <ul>{page.map((d) => <Row key={d.id} d={d} />)}</ul>
        ) : (
          <p className="px-5 py-12 text-center text-[14px] text-v2-ink3">No decisions match these filters.</p>
        )}
      </section>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[11px] tabular-nums text-v2-ink3">Showing {page.length} of {filtered.length}</span>
        {filtered.length > page.length ? (
          <GhostButton onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, filtered.length - page.length)} more</GhostButton>
        ) : null}
      </div>
    </>
  )
}

export default function V2History() {
  const { status, decisions, reason, retry } = useDecisions()
  const { status: leagueStatus } = useLeague()
  const accountReady = useAccountUiReady()

  const recorded = status === 'ready' ? ` · ${decisions.length} recorded` : status === 'none' && reason !== 'signed-out' ? ' · 0 recorded' : ''
  const head = (
    <>
      <PageHead
        kicker={`Decision ledger${recorded}`}
        title="Every call, on the record."
        lede="Each call the in-season rooms make about your roster is written down with what you actually did and what happened next — so the advice can be checked rather than taken on trust."
      />
      <Chain />
    </>
  )

  if (status === 'loading') {
    return <>{head}<div className={`${CARD} mt-8 p-6`} aria-busy="true"><Skeleton lines={5} /></div></>
  }

  if (status === 'error') {
    return (
      <>
        {head}
        <div className="mt-8">
          <Notice
            tone="error"
            title="We could not reach your history"
            body={reason === 'unauthorized'
              ? 'Your session could not be verified. Signing in again usually fixes it.'
              : 'Your decisions are safe — this page just could not read them. Nothing has been lost.'}
          >
            <VoltButton size="md" onClick={retry}>Try again</VoltButton>
          </Notice>
        </div>
      </>
    )
  }

  if (status === 'none' && reason === 'signed-out') {
    const signup = <VoltButton size="md">Create an account <Arrow /></VoltButton>
    return (
      <>
        {head}
        <div className="mt-8">
          <Notice
            title="Your record starts when you connect a league"
            body="Every call Juke makes in the Waiver, Trade, Strategy and Prospect rooms lands here with what you did and what happened next. There is nothing to show yet, and a sample would defeat the point — this is the one screen that has to be yours."
          >
            {accountReady ? <SignUpButton mode="modal">{signup}</SignUpButton> : signup}
            <GhostButton href="#/v2/league">See a sample league</GhostButton>
          </Notice>
          <Vocabulary />
        </div>
      </>
    )
  }

  if (status === 'none') {
    return (
      <>
        {head}
        <div className="mt-8">
          <Notice
            title="No decisions recorded yet"
            body={leagueStatus === 'connected'
              ? 'The in-season rooms write here as they make calls on your roster. Nothing has been recorded against your league so far.'
              : 'The in-season rooms write here as they make calls on a connected roster — and there is no league on this account yet.'}
          >
            <GhostButton href={leagueStatus === 'connected' ? '#/v2/rooms' : '#/v2/league'}>
              {leagueStatus === 'connected' ? 'Open the rooms' : 'Go to My League'} <Arrow />
            </GhostButton>
          </Notice>
          <Vocabulary />
        </div>
      </>
    )
  }

  return <>{head}<Ledger decisions={decisions} /></>
}
