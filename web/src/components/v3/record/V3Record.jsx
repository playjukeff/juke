import { useEffect, useMemo, useState } from 'react'
import { SignUpButton } from '@clerk/clerk-react'
import { CONFIDENCE_BUCKETS, VERDICTS, VERDICT_KEYS, confidenceLabel, matchesConfidence, matchesOutcome } from '../../ledger/verdicts.js'
import { useDecisionsFresh, useLeagueFresh } from '../../v2/stores.js'
import { useAccountUiReady } from '../../../hooks/useAccountUiReady.js'
import { useSignedIn } from '../../../hooks/useAuthState.js'
import { CallButton, Delta, GoLink, Headline, Icon, Label, PageHead, PosTag, QuietButton, Seg, Sheet, Skeleton, ValueBar, cx, ordinal } from '../ui.jsx'
import { callStats, hashQuery, lockerStats, replaceQuery, scrollPageTo, useLocker, useSyncStatus } from './recordKit.js'
import { ArmedButton, DraftsWhere, MoreFooter, Stat, VerdictMark, Where, XIcon, verdictOf } from './recordParts.jsx'

/* Record — the fifth of v3's places, and production's two archives in one.

   Production keeps the mock-draft archive (#/drafts) and the calls ledger
   (#/history) on two screens for a reason worth keeping: they are different
   kinds of entry. A draft is a whole room you drafted against, graded by
   where you finished in it. A call is one recommendation about a real
   roster, graded by what happened. So this page merges the PLACE and keeps
   the ROWS apart — each kind keeps its own row shape and its own grade
   vocabulary, and the filter (All / Drafts / Calls, mirrored in ?show=)
   chooses which to read. Neither kind is ever drawn in the other's words:
   a draft is its letter beside its finishing position ("B · 5th of 10"),
   never a /100; a call carries one of the ledger's nine verdicts.

   ---- Everything on it is real ----

   Drafts are `historyList()` — the one summary production's archive, Locker
   table and entry screen all read. Calls are the decision store, through
   the race-safe wrapper. Nothing on this page is sample content, and the
   empty calls state is the verdict vocabulary rather than invented rows:
   a record whose whole claim is that it can be checked cannot be
   demonstrated with calls nobody made (HistoryScreen's own reasoning).

   ---- All is an overview, the other two are the archive ----

   All shows the newest five of each with a way into the rest, so a locker of
   two hundred mocks cannot bury the calls under it. Drafts and Calls are the
   full lists, twenty at a time with "Show N more" — the rule production
   learned when the locker "grew forever". Summary figures are counted over
   everything and never over a filtered slice. */

const PAGE = 20
const PEEK = 5
const SHOWS = ['all', 'drafts', 'calls']
const OUTCOMES = ['All', 'Good call', 'Bad call', 'Pending', 'Other']

function readShow() {
  const s = hashQuery().get('show')
  return SHOWS.includes(s) ? s : 'all'
}

function shortDate(at) {
  if (!at) return '—'
  return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/* ---- Where the record lives ---- */

function CallsWhere({ signedIn, leagueStatus }) {
  if (!signedIn) return <Where icon="cloud" title="With an account" text="Calls are made about a real roster, so they are kept against an account and a connected league." />
  if (leagueStatus !== 'connected') return <Where icon="cloud" title="With your account" text="Calls are written against a connected league, and this account has none yet." />
  return <Where icon="cloud" title="With your account" text="Every call is kept against your account, so it reads the same on any device." />
}

/* ---- The summary ---- */

function Summary({ locker, stats, calls, callsStatus, signedIn, sync, leagueStatus }) {
  const draftFigures = !locker.ready ? null : [
    { label: 'Drafts', value: stats.count, note: stats.count ? `${stats.formats} ${stats.formats === 1 ? 'format' : 'formats'} run` : 'None finished yet' },
    {
      label: 'Best finish',
      value: stats.best ? <>{stats.best.grade}<span className="ml-2 text-[15px] font-semibold text-v3-ink2">{ordinal(stats.best.rank)} of {stats.best.teams}</span></> : '—',
      note: stats.best ? stats.best.leagueType : 'Letter beside finishing position',
    },
    { label: 'Top half', value: stats.graded ? `${stats.topHalf} of ${stats.graded}` : '—', note: 'Finished in the top half of the room' },
    { label: 'Last draft', value: stats.last ? shortDate(stats.last.completedAt) : '—', note: stats.last ? stats.last.leagueType : 'Nothing yet' },
  ]
  const known = callsStatus === 'ready'
  const callFigures = [
    { label: 'Good calls', value: known ? calls.good : '—', note: known ? (calls.graded ? `Of ${calls.graded} graded` : 'Nothing graded yet') : 'No calls recorded' },
    { label: 'Bad calls', value: known ? calls.bad : '—', note: 'Calls the week went against' },
    { label: 'Pending', value: known ? calls.pending : '—', note: 'Written down, not yet gradeable' },
    { label: 'Hit rate', value: known && calls.rate !== null ? `${calls.rate}%` : '—', note: known && calls.graded ? 'Good calls of graded ones' : 'A rate over nothing is unknown' },
  ]
  return (
    <Sheet code="The record" aside="Counted over all of it" bodyClass="grid grid-cols-1 gap-8 p-4 sm:p-5 lg:grid-cols-2 lg:gap-10">
      <section aria-labelledby="rec-sum-drafts" className="min-w-0">
        <Headline as="h2" size="block" id="rec-sum-drafts">Mock drafts</Headline>
        <div className="mt-2"><DraftsWhere signedIn={signedIn} sync={sync} count={stats.count} /></div>
        {draftFigures ? (
          <dl className="mt-4 grid grid-cols-2 gap-2">{draftFigures.map((f) => <Stat key={f.label} {...f} />)}</dl>
        ) : <Skeleton lines={3} className="mt-4" />}
      </section>
      <section aria-labelledby="rec-sum-calls" className="min-w-0">
        <Headline as="h2" size="block" id="rec-sum-calls">Calls Juke gave you</Headline>
        <div className="mt-2"><CallsWhere signedIn={signedIn} leagueStatus={leagueStatus} /></div>
        {callsStatus === 'loading' ? <Skeleton lines={3} className="mt-4" /> : (
          <dl className="mt-4 grid grid-cols-2 gap-2">{callFigures.map((f) => <Stat key={f.label} {...f} />)}</dl>
        )}
      </section>
    </Sheet>
  )
}

/* ---- Drafts ---- */

function DraftRow({ e, onDelete }) {
  const hasFinish = e.rank && e.teams
  // Share of the room finished ahead of — first of ten fills the bar, last
  // leaves it empty — so a longer bar is better whatever the league size.
  const ahead = hasFinish && e.teams > 1 ? (e.teams - e.rank) / (e.teams - 1) : null
  const when = e.completedAt ? new Date(e.completedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : e.dateCompleted
  return (
    <li className="flex items-stretch border-t border-v3-rule first:border-t-0">
      <a
        href={`#/v3/draft/report?id=${encodeURIComponent(e.id)}`}
        className="grid min-w-0 flex-1 grid-cols-[72px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 py-3.5 pl-4 pr-1 transition-colors hover:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call sm:pl-5 lg:grid-cols-[92px_minmax(0,1.2fr)_minmax(0,1fr)_150px_120px]"
        aria-label={`${e.leagueType}, ${when}${e.grade ? `, graded ${e.grade}` : ''}${hasFinish ? `, ${ordinal(e.rank)} of ${e.teams}` : ''}. Open the report`}
      >
        {/* The letter beside its finishing position, never a /100: the
            letter IS the finishing position, read against the room. */}
        <span className="row-span-2 flex flex-col lg:row-span-1">
          <span className="font-sheet text-[30px] font-black leading-none tracking-[-0.03em] text-v3-ink">{e.grade || '—'}</span>
          <span className="mt-1 font-figure text-[13px] font-semibold tabular-nums text-v3-ink2">{hasFinish ? `${ordinal(e.rank)} of ${e.teams}` : 'Not graded'}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[16px] font-bold text-v3-ink">{e.leagueType}</span>
          <span className="mt-0.5 block truncate font-figure text-[13px] text-v3-ink3">{when} · seat {e.seat}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <Label as="span" className="shrink-0 text-[11px] lg:hidden">Rd 1</Label>
          {e.round1Pick ? (
            <>
              {e.round1PickPos ? <PosTag pos={e.round1PickPos} /> : null}
              <span className="truncate text-[14px] text-v3-ink2">{e.round1Pick}</span>
            </>
          ) : <span className="text-[14px] text-v3-ink3">—</span>}
        </span>
        <span className="hidden min-w-0 lg:block">
          <ValueBar value={ahead} max={1} tone="neutral" />
          <span className="mt-1 block font-figure text-[12px] text-v3-ink3">{!hasFinish ? '—' : e.rank === 1 ? 'ahead of the whole room' : e.rank === e.teams ? 'behind the whole room' : `ahead of ${e.teams - e.rank} of ${e.teams - 1}`}</span>
        </span>
        <span className="hidden text-right lg:block">
          <Delta value={e.rosterVorp} className="text-[16px]" />
          <span className="mt-0.5 block font-figure text-[11px] text-v3-ink3">lineup over repl.</span>
        </span>
      </a>
      <div className="flex items-center pr-2 sm:pr-3">
        <ArmedButton
          idle={<XIcon name="trash" className="h-[18px] w-[18px]" />}
          armedLabel="Delete?"
          ariaIdle={`Delete ${e.leagueType} from ${when}`}
          ariaArmed={`Press again to delete ${e.leagueType} from ${when}. This cannot be undone.`}
          onConfirm={onDelete}
        />
      </div>
    </li>
  )
}

function DraftsSection({ locker, mode, onSeeAll }) {
  const [shown, setShown] = useState(PAGE)
  const list = locker.list
  const limit = mode === 'peek' ? PEEK : shown
  const rows = list.slice(0, limit)

  const remove = (id) => {
    const e = window.JukeEngine
    if (e && e.deleteHistoryDraft) e.deleteHistoryDraft(id)
    locker.refresh()
  }

  return (
    <Sheet code="Mock drafts" aside={locker.ready ? `${list.length} finished · newest first` : ''} bodyClass="" aria-label="Mock drafts">
      {!locker.ready ? <div className="p-5"><Skeleton lines={5} /></div> : !list.length ? (
        <div className="flex flex-col items-start gap-4 p-5 sm:p-8">
          <Headline as="h3" size="block">No drafts yet</Headline>
          <p className="max-w-[56ch] text-[15px] leading-[1.55] text-v3-ink2">
            Run a mock against tonight&apos;s board and it lands here the moment the last pick does — the letter it earned, where it finished in its room, and the report behind both.
          </p>
          <CallButton href="#/v3/draft">Start a mock draft <Icon name="arrow" className="h-4 w-4" /></CallButton>
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-[92px_minmax(0,1.2fr)_minmax(0,1fr)_150px_120px] gap-x-4 border-b border-v3-rule py-2.5 pl-5 pr-[68px] lg:grid" aria-hidden="true">
            <Label className="text-[11px]">Grade</Label>
            <Label className="text-[11px]">Format</Label>
            <Label className="text-[11px]">Round 1</Label>
            <Label className="text-[11px]">Finish</Label>
            <Label className="text-right text-[11px]">Lineup</Label>
          </div>
          <ul>{rows.map((e) => <DraftRow key={e.id} e={e} onDelete={() => remove(e.id)} />)}</ul>
          {mode === 'peek' ? (
            list.length > PEEK ? (
              <div className="border-t border-v3-rule px-4 py-3 sm:px-5">
                <button type="button" onClick={onSeeAll} className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
                  See all {list.length} drafts <Icon name="arrow" className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null
          ) : (
            <MoreFooter shown={rows.length} total={list.length} step={PAGE} onMore={() => setShown((n) => n + PAGE)} noun="drafts" />
          )}
        </>
      )}
    </Sheet>
  )
}

/* ---- Calls ---- */

const STEPS = ['Juke said', 'You did', 'Reality', 'Verdict']

function Chain() {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="How a call reads">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-v3-rule bg-v3-sheet px-2 py-1 font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink">
            <span className="text-v3-ink3">{i + 1}</span>{s}
          </span>
          {i < STEPS.length - 1 ? <Icon name="arrow" className="h-3.5 w-3.5 text-v3-ink3" /> : null}
        </li>
      ))}
    </ol>
  )
}

/* The nine verdicts, off the ledger's own map. Real vocabulary rather than
   a sample record, so it is what an empty ledger can honestly show. */
function Vocabulary() {
  return (
    <div>
      <Label>Every verdict a call can carry</Label>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {VERDICT_KEYS.map((k) => (
          <li key={k} className="flex min-w-0 items-center gap-2"><VerdictMark verdict={k} /></li>
        ))}
      </ul>
    </div>
  )
}

function roomLabel(slug) {
  return slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : slug
}

function CallRow({ d }) {
  const when = Number(d.week) === 0 ? 'Draft' : `Wk ${d.week}`
  const band = confidenceLabel(d.confidence)
  const v = verdictOf(d.verdict)
  const cell = (label, text, strong) => (
    <div className="min-w-0">
      <Label as="span" className="text-[11px] lg:hidden">{label}</Label>
      <p className={cx('break-words', strong ? 'text-[15px] font-semibold leading-[1.4] text-v3-ink' : 'text-[14px] leading-[1.45] text-v3-ink2', !text && 'text-v3-ink3')}>{text || '—'}</p>
    </div>
  )
  return (
    <li className="grid grid-cols-1 gap-y-2.5 border-t border-v3-rule px-4 py-4 first:border-t-0 sm:px-5 lg:grid-cols-[150px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,210px)] lg:items-start lg:gap-x-5">
      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink2">
          {roomLabel(d.room || '—')} · {when}
          {band ? <span className="block text-v3-ink3">{band} confidence</span> : null}
        </span>
        <span className="lg:hidden"><VerdictMark verdict={v.key} /></span>
      </div>
      {cell('Juke said', d.said, true)}
      {cell('You did', d.did)}
      {cell('Reality', d.reality)}
      <div className="hidden lg:block lg:text-right"><VerdictMark verdict={v.key} /></div>
    </li>
  )
}

function Ledger({ decisions }) {
  const [room, setRoom] = useState('All')
  const [outcome, setOutcome] = useState('All')
  const [confidence, setConfidence] = useState('All')
  const [shown, setShown] = useState(PAGE)

  /* Rooms are derived from the ledger, never listed: four of the six rooms
     write nothing today, and a fixed list would offer pills that filter to
     nothing — a control that cannot change what is on screen. */
  const rooms = useMemo(() => {
    const seen = []
    decisions.forEach((d) => { if (d.room && seen.indexOf(d.room) < 0) seen.push(d.room) })
    return seen.sort()
  }, [decisions])

  const filtered = useMemo(
    () => decisions.filter((d) => (room === 'All' || d.room === room) && matchesOutcome(outcome, d.verdict) && matchesConfidence(confidence, d.confidence)),
    [decisions, room, outcome, confidence],
  )
  const reset = (fn) => (v) => { fn(v); setShown(PAGE) }
  const page = filtered.slice(0, shown)
  const wrap = (node) => <div className="max-w-full overflow-x-auto"><div className="w-max pb-0.5">{node}</div></div>

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-v3-rule px-4 py-3.5 sm:px-5">
        {rooms.length > 1 ? (
          <div className="min-w-0 max-w-full"><Label as="span" className="mb-1.5 block text-[11px]">Room</Label>
            {wrap(<Seg label="Room" value={room} onChange={reset(setRoom)} options={[{ value: 'All', label: 'All' }].concat(rooms.map((r) => ({ value: r, label: roomLabel(r) })))} />)}
          </div>
        ) : null}
        <div className="min-w-0 max-w-full"><Label as="span" className="mb-1.5 block text-[11px]">Outcome</Label>
          {wrap(<Seg label="Outcome" value={outcome} onChange={reset(setOutcome)} options={OUTCOMES.map((o) => ({ value: o, label: o }))} />)}
        </div>
        <div className="min-w-0 max-w-full"><Label as="span" className="mb-1.5 block text-[11px]">Confidence</Label>
          {wrap(<Seg label="Confidence" value={confidence} onChange={reset(setConfidence)} options={CONFIDENCE_BUCKETS.map((o) => ({ value: o, label: o }))} />)}
        </div>
      </div>
      <div className="hidden grid-cols-[150px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,210px)] gap-x-5 border-b border-v3-rule px-5 py-2.5 lg:grid" aria-hidden="true">
        <Label className="text-[11px]">Room · week</Label>
        {STEPS.map((s, i) => <Label key={s} className={cx('text-[11px]', i === STEPS.length - 1 && 'text-right')}>{s}</Label>)}
      </div>
      {page.length ? <ul>{page.map((d) => <CallRow key={d.id} d={d} />)}</ul> : (
        <p className="px-5 py-10 text-center text-[15px] text-v3-ink3">No calls match these filters.</p>
      )}
      <MoreFooter shown={page.length} total={filtered.length} step={PAGE} onMore={() => setShown((n) => n + PAGE)} noun="calls" />
    </>
  )
}

function CallsSection({ dec, mode, onSeeAll, signedIn, leagueStatus }) {
  const ready = useAccountUiReady()
  const { status, decisions, reason, retry } = dec
  const count = status === 'ready' ? decisions.length : 0

  let body
  if (status === 'loading') {
    body = <div className="p-5"><Skeleton lines={4} /></div>
  } else if (status === 'error') {
    body = (
      <div className="flex flex-col items-start gap-4 p-5 sm:p-8" role="alert">
        <Headline as="h3" size="block">We could not reach your calls</Headline>
        <p className="max-w-[60ch] text-[15px] leading-[1.55] text-v3-ink2">
          {reason === 'unauthorized'
            ? 'Your session could not be verified. Signing in again usually fixes it.'
            : 'Your calls are safe — this page just could not read them. Nothing has been lost.'}
        </p>
        <QuietButton onClick={retry}>Try again</QuietButton>
      </div>
    )
  } else if (status === 'none') {
    const signedOut = reason === 'signed-out' || !signedIn
    const cta = signedOut
      ? (ready
        ? <SignUpButton mode="modal"><QuietButton>Create an account</QuietButton></SignUpButton>
        : <QuietButton href="#/v3/account">What an account adds</QuietButton>)
      : leagueStatus === 'connected'
        ? <GoLink href="#/v3">See this week&apos;s calls</GoLink>
        : <QuietButton href="#/v3/account">Connect a league</QuietButton>
    body = (
      <div className="grid gap-6 p-5 sm:p-8">
        <div className="flex max-w-[64ch] flex-col items-start gap-3">
          <Headline as="h3" size="block">{signedOut ? 'Your calls start when you connect a league' : 'No calls recorded yet'}</Headline>
          <p className="text-[15px] leading-[1.55] text-v3-ink2">
            {signedOut
              ? 'Every call Juke makes about your real roster — the claim, the swap, the trade — is written down here with what you did and what happened next, so the advice can be checked rather than taken on trust. There is nothing to show yet, and a sample would defeat the point.'
              : leagueStatus === 'connected'
                ? 'Calls land here as Juke makes them on your roster. Nothing has been recorded against your league so far.'
                : 'Calls are made about a connected roster, and there is no league on this account yet.'}
          </p>
          {cta}
        </div>
        <Vocabulary />
      </div>
    )
  } else if (mode === 'peek') {
    body = (
      <>
        <ul>{decisions.slice(0, PEEK).map((d) => <CallRow key={d.id} d={d} />)}</ul>
        {decisions.length > PEEK ? (
          <div className="border-t border-v3-rule px-4 py-3 sm:px-5">
            <button type="button" onClick={onSeeAll} className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
              See all {decisions.length} calls, with filters <Icon name="arrow" className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </>
    )
  } else {
    body = <Ledger decisions={decisions} />
  }

  return (
    <Sheet code="Calls" aside={status === 'ready' ? `${count} recorded` : ''} bodyClass="" aria-label="Calls">
      {status === 'ready' ? <div className="border-b border-v3-rule px-4 py-3.5 sm:px-5"><Chain /></div> : null}
      {body}
    </Sheet>
  )
}

/* ---- The page ---- */

export default function V3Record() {
  const locker = useLocker()
  const dec = useDecisionsFresh()
  const { status: leagueStatus } = useLeagueFresh()
  const signedIn = useSignedIn()
  const sync = useSyncStatus()
  const [show, setShowState] = useState(readShow)

  // A link to #/v3/record?show=calls from elsewhere while this page is open
  // arrives as a hashchange, not a remount.
  useEffect(() => {
    const on = () => setShowState(readShow())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const setShow = (next) => {
    setShowState(next)
    replaceQuery(next === 'all' ? {} : { show: next })
  }
  const seeAll = (next) => {
    setShow(next)
    requestAnimationFrame(() => {
      const el = document.getElementById('rec-lists')
      const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
      if (el) scrollPageTo(el, !reduce)
    })
  }

  const stats = useMemo(() => lockerStats(locker.list), [locker.list])
  const calls = useMemo(() => callStats(dec.status === 'ready' ? dec.decisions : [], VERDICTS), [dec.status, dec.decisions])

  const options = [
    { value: 'all', label: 'All' },
    { value: 'drafts', label: locker.ready ? `Drafts ${locker.list.length}` : 'Drafts' },
    { value: 'calls', label: dec.status === 'ready' ? `Calls ${dec.decisions.length}` : 'Calls' },
  ]

  return (
    <div className="grid gap-8 sm:gap-10">
      <PageHead
        label="Record"
        title="Every draft and every call, graded."
        lede="The mocks you have finished, each with the letter it earned beside where it finished in its room — and the calls Juke made on your real roster: what it said, what you did, what happened, and whether it was right."
        action={locker.ready && locker.list.length ? <CallButton href="#/v3/draft">Run another mock <Icon name="arrow" className="h-4 w-4" /></CallButton> : null}
      />

      <Summary locker={locker} stats={stats} calls={calls} callsStatus={dec.status} signedIn={signedIn} sync={sync} leagueStatus={leagueStatus} />

      <div id="rec-lists" className="grid scroll-mt-4 gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Label as="span">Show</Label>
          <div className="max-w-full overflow-x-auto"><div className="w-max"><Seg label="Show" value={show} onChange={setShow} options={options} /></div></div>
        </div>
        {show !== 'calls' ? <DraftsSection locker={locker} mode={show === 'all' ? 'peek' : 'full'} onSeeAll={() => seeAll('drafts')} /> : null}
        {show !== 'drafts' ? <CallsSection dec={dec} mode={show === 'all' ? 'peek' : 'full'} onSeeAll={() => seeAll('calls')} signedIn={signedIn} leagueStatus={leagueStatus} /> : null}
      </div>
    </div>
  )
}
