import { useEffect, useState } from 'react'
import { drawShareCard, canvasToBlob } from '../../../shareCard.js'
import { Arrow, GhostButton, Kicker, PosChip, Skeleton, VoltButton } from '../v2ui.jsx'
import { ordinal, signedInt } from './cockpitData.js'
import { missedSentence, readFrozenReport, readLiveReport, shareDataOf } from './reportData.js'
import { useDraftVersion, useEngine } from './useCockpit.js'
import { FOCUS, Panel } from './parts.jsx'
import { IconCheck, IconCopy, IconDownload, IconShare } from './icons.jsx'
import { LAUNCH_HASH } from './flow.js'

/* The report, at #/v2/draft/report (optional ?id=<historyId>).

   Which draft it describes, in order:
   1. ?id= names a locker entry: its FROZEN report (engine.historyReport),
      never a regrade — see reportData.js for the bug that rule exists for.
      An entry recorded before reports were frozen has nothing to show
      here, and says so with a link to the classic locker, whose fallback
      replays the draft against tonight's board. That replay rewrites the
      live board and state, which this page will not do to somebody's
      unfinished draft sitting in memory.
   2. No id, and the draft that just finished is still in memory: LIVE,
      and any seat in the room can be opened.
   3. No id, nothing in memory (a reload): the newest locker entry, frozen.

   ---- The letter and the rank, never a score out of 100 ----

   CLAUDE.md measured it: the letter agreed with the school reading of a
   number beside it on 0 of 10 teams. So the letter stands with its
   finishing position, and the weighted total appears only where the four
   components visibly add up to it. */

function readId() {
  const q = (typeof location !== 'undefined' ? location.hash : '').split('?')[1] || ''
  return new URLSearchParams(q).get('id')
}

function useHashId() {
  const [id, setId] = useState(readId)
  useEffect(() => {
    const on = () => setId(readId())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return id
}

function ShareRow({ rep }) {
  const [busy, setBusy] = useState(null)
  const [note, setNote] = useState({ key: null, text: '' })
  const flash = (key, text) => {
    setNote({ key, text })
    setTimeout(() => setNote({ key: null, text: '' }), 2400)
  }
  const makeBlob = async () => canvasToBlob(await drawShareCard(shareDataOf(rep)))
  const filename = () => 'juke-draft-' + rep.teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png'
  const run = async (key, fn) => {
    if (busy) return
    setBusy(key)
    try { await fn() } finally { setBusy(null) }
  }
  const nativeShare = async () => {
    try {
      const file = new File([await makeBlob()], filename(), { type: 'image/png' })
      if (navigator.canShare && !navigator.canShare({ files: [file] })) throw new Error('cannot share files')
      await navigator.share({ files: [file], title: 'My Juke draft grade' })
      flash('share', 'Shared')
    } catch (err) {
      if (err && err.name === 'AbortError') return
      flash('share', 'Sharing failed — try Copy or Download')
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': await makeBlob() })])
      flash('copy', 'Copied — paste it anywhere')
    } catch {
      flash('copy', 'Couldn’t copy — try Download')
    }
  }
  const download = async () => {
    try {
      const url = URL.createObjectURL(await makeBlob())
      const a = document.createElement('a')
      a.href = url
      a.download = filename()
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      flash('download', 'Saved')
    } catch {
      flash('download', 'Couldn’t render the card')
    }
  }
  // Each door shown only where the browser can open it — a share button
  // that quietly does nothing is the dead-control failure in a party hat.
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard && typeof window !== 'undefined' && !!window.ClipboardItem
  const btn = `inline-flex min-h-[44px] items-center gap-2 rounded-[10px] px-3.5 text-[13px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.12] hover:bg-white/[0.04] disabled:cursor-wait ${FOCUS}`
  const glyph = (key, Icon) => (note.key === key ? <IconCheck /> : <Icon />)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Kicker className="mr-1">Share this result</Kicker>
      {canShare && <button type="button" className={btn} aria-busy={busy === 'share'} onClick={() => run('share', nativeShare)}>{glyph('share', IconShare)} Share…</button>}
      {canCopy && <button type="button" className={btn} aria-busy={busy === 'copy'} onClick={() => run('copy', copy)}>{glyph('copy', IconCopy)} Copy image</button>}
      <button type="button" className={btn} aria-busy={busy === 'download'} onClick={() => run('download', download)}>{glyph('download', IconDownload)} Download PNG</button>
      <span role="status" className="text-[12px] text-v2-ink2">{note.text}</span>
    </div>
  )
}

/* A bar from a centre baseline: right for a gain, left for a cost. The
   VORP matrix and the value timeline share the shape so a reader learns it
   once. */
function CentreBar({ value, max, label }) {
  if (value === null || value === undefined) {
    return <span className="relative block h-3"><span className="absolute inset-y-0 left-1/2 w-px bg-white/15" /></span>
  }
  const w = max > 0 ? (Math.abs(value) / max) * 50 : 0
  return (
    <span className="relative block h-3" role="img" aria-label={label}>
      <span className="absolute inset-y-0 left-1/2 w-px bg-white/20" aria-hidden="true" />
      <span
        className={`absolute top-1/2 h-2 -translate-y-1/2 rounded-[3px] ${value >= 0 ? 'bg-v2-volt/80' : 'bg-v2-loss/80'}`}
        style={value >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
      />
    </span>
  )
}

const PARTS = [
  { key: 'starters', scoredKey: 'startersScaled', label: 'Starter strength', scaled: true },
  { key: 'value', scoredKey: 'valueScaled', label: 'Draft value', scaled: true },
  { key: 'build', scoredKey: 'buildScaled', label: 'Roster construction', scaled: false },
  { key: 'byes', scoredKey: 'byePenaltyScaled', label: 'Bye-week safety', scaled: true },
]

function Components({ rep }) {
  const bars = PARTS.map((p) => ({ ...p, pct: rep.scored[p.scoredKey], weight: rep.weights[p.key] }))
  const weakest = bars.reduce((a, b) => (b.pct < a.pct ? b : a))
  return (
    <Panel className="p-5">
      <h2 className="font-telemetry text-[22px] font-bold uppercase italic text-v2-ink">Team analysis</h2>
      <p className="mt-0.5 text-[13px] text-v2-ink2">The four parts of the grade and what each counts for</p>
      <ul className="mt-4 space-y-3.5">
        {bars.map((b) => {
          const low = b.key === weakest.key
          return (
            <li key={b.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-v2-ink">{b.label}{low && <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-v2-loss">weakest</span>}</span>
                <span className="font-mono text-[10px] text-v2-ink3">×{Math.round(b.weight * 100)}% · {b.scaled ? 'vs room' : 'own scale'}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${low ? 'bg-v2-loss' : 'bg-v2-ink2'}`} style={{ width: `${Math.max(2, Math.min(100, b.pct))}%` }} />
                </span>
                <span className={`w-12 shrink-0 text-right font-telemetry text-[22px] font-bold leading-none tabular-nums ${low ? 'text-v2-loss' : 'text-v2-ink'}`}>{b.pct.toFixed(1)}</span>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 rounded-[12px] bg-v2-inset px-3.5 py-3 ring-1 ring-inset ring-white/[0.06]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Kicker>Weighted sum</Kicker>
          <span className="font-mono text-[16px] font-semibold tabular-nums text-v2-ink">{rep.scored.total.toFixed(1)}</span>
        </div>
        <p className="mt-1 break-words font-mono text-[11px] tabular-nums text-v2-ink3">
          {bars.map((b) => (b.pct * b.weight).toFixed(1)).join(' + ')} = {rep.scored.total.toFixed(1)}
        </p>
      </div>
      <p className="mt-3 text-[12px] leading-[1.55] text-v2-ink3">
        A weight is how much a part counts, not how much it separates the room. On the three marked “vs room”, 0 and
        100 are this room’s floor and ceiling — somebody always scores each. Roster construction is its own 0–100,
        so it varies less and moves the order less than its weight alone suggests.
      </p>
    </Panel>
  )
}

function Vorp({ rep }) {
  const max = Math.max(1, ...rep.vorpRows.filter((r) => r.gap !== null).map((r) => Math.abs(r.gap)))
  return (
    <Panel className="p-5">
      <h2 className="font-telemetry text-[22px] font-bold uppercase italic text-v2-ink">VORP matrix</h2>
      <p className="mt-0.5 text-[13px] text-v2-ink2">Each starter against a replacement-level player at his position</p>
      <ul className="mt-4 space-y-1.5">
        {rep.vorpRows.map((r, i) => (
          <li key={i} className="grid grid-cols-[34px_minmax(0,1fr)_minmax(56px,28%)_40px] items-center gap-2 sm:grid-cols-[48px_minmax(0,1fr)_minmax(80px,38%)_48px] sm:gap-2.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-v2-ink2">{r.slotLabel === 'DST' ? 'D/ST' : r.slotLabel}</span>
            <span className="flex min-w-0 items-center gap-2">
              {/* The slot label already says the position; below sm the chip is the
                  space the name needs. */}
              {r.pos && <span className="hidden sm:inline-flex"><PosChip pos={r.pos} /></span>}
              <span className={`truncate text-[13px] ${r.name ? 'text-v2-ink' : 'italic text-v2-ink3'}`}>{r.name || 'Empty'}</span>
            </span>
            <CentreBar value={r.name ? r.gap : null} max={max} label={r.name && r.gap !== null ? `${r.name}: ${signedInt(r.gap)} over replacement` : undefined} />
            <span className={`text-right font-mono text-[12px] font-semibold tabular-nums ${!r.name || r.gap === null ? 'text-v2-ink3' : r.gap >= 0 ? 'text-v2-volt' : 'text-v2-loss'}`}>
              {!r.name || r.gap === null ? '—' : signedInt(r.gap)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] leading-[1.55] text-v2-ink3">
        Kickers and defenses show a dash: measured against three seasons of archived forecasts the projection ranks
        them no better than chance, so no bar is drawn from it. Their points still count toward starter strength —
        these rows add up to a little less than the grade uses.
      </p>
    </Panel>
  )
}

function Timeline({ rep }) {
  const max = Math.max(1, ...rep.timeline.map((t) => Math.abs(t.gap)))
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-telemetry text-[22px] font-bold uppercase italic text-v2-ink">Draft value timeline</h2>
          <p className="mt-0.5 text-[13px] text-v2-ink2">Where each pick landed against the board — right means he fell to {rep.isMe ? 'you' : 'them'}</p>
        </div>
        <Kicker className="shrink-0">Unit: picks</Kicker>
      </div>
      <ul className="mt-4 space-y-1.5">
        {rep.timeline.map((t, i) => (
          <li key={t.overall ?? i} className="grid grid-cols-[28px_34px_minmax(0,1fr)_minmax(56px,28%)_36px] items-center gap-1.5 sm:grid-cols-[30px_34px_minmax(0,1fr)_minmax(80px,38%)_40px] sm:gap-2">
            <span className="font-mono text-[10px] font-semibold text-v2-ink3">R{t.round}</span>
            <PosChip pos={t.pos} />
            <span className="truncate text-[13px] text-v2-ink">{t.name}</span>
            <CentreBar value={t.gap} max={max} label={`${t.name}: ${t.gap >= 0 ? `${t.gap} picks late` : `${Math.abs(t.gap)} picks early`}`} />
            <span className={`text-right font-mono text-[12px] font-semibold tabular-nums ${t.gap > 0 ? 'text-v2-volt' : t.gap < 0 ? 'text-v2-loss' : 'text-v2-ink3'}`}>{signedInt(t.gap)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] leading-[1.55] text-v2-ink3">Kickers and defenses sit this out — their ADP comes from longer drafts than this one, so every one reads as a reach.</p>
    </Panel>
  )
}

function Standings({ rep, onPick }) {
  return (
    <Panel className="p-5">
      <h2 className="font-telemetry text-[22px] font-bold uppercase italic text-v2-ink">Room standings</h2>
      <p className="mt-0.5 text-[13px] text-v2-ink2">{onPick ? 'Best to worst — open any team’s report' : 'Best to worst, as recorded'}</p>
      <ol className="mt-3">
        {rep.standings.map((t) => {
          const on = t.slot === rep.viewSlot
          const inner = (
            <>
              <span className="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums text-v2-ink3">{t.rank}</span>
              <span className={`min-w-0 flex-1 truncate text-[13px] ${t.isMine ? 'font-semibold text-v2-cyan' : 'text-v2-ink'}`}>{t.isMine ? 'Your team' : t.teamName}</span>
              <span className="w-9 shrink-0 text-center font-telemetry text-[20px] font-bold italic leading-none text-v2-ink">{t.grade}</span>
            </>
          )
          return (
            <li key={t.slot}>
              {onPick ? (
                <button type="button" onClick={() => onPick(t.slot)} aria-current={on ? 'true' : undefined} className={`flex min-h-[44px] w-full items-center gap-3 rounded-[9px] px-2 text-left ${FOCUS} ${on ? 'bg-white/[0.06] ring-1 ring-inset ring-white/[0.12]' : 'hover:bg-white/[0.03]'}`}>{inner}</button>
              ) : (
                <div className={`flex min-h-[44px] items-center gap-3 rounded-[9px] px-2 ${on ? 'bg-white/[0.06]' : ''}`}>{inner}</div>
              )}
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}

function Gate({ kicker, title, children, actions }) {
  return (
    <div className="max-w-[720px] py-10">
      <Kicker tone="text-v2-ink2">{kicker}</Kicker>
      <h1 className="mt-3 font-telemetry text-[clamp(2.8rem,6vw,5rem)] font-extrabold uppercase italic leading-[0.88] text-v2-ink">{title}</h1>
      <p className="mt-4 max-w-[60ch] text-[16px] leading-[1.55] text-v2-ink2">{children}</p>
      <div className="mt-7 flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}

export default function V2Report() {
  const engine = useEngine()
  const version = useDraftVersion(engine)
  const id = useHashId()
  const [viewSlot, setViewSlot] = useState(null)
  useEffect(() => { setViewSlot(null) }, [id])

  const ready = !!engine && engine.dataReady()
  if (!ready) {
    return <Panel className="p-6"><Skeleton lines={7} /></Panel>
  }

  let rep = null
  let gate = null
  const list = (() => { try { return engine.historyList() } catch { return [] } })()

  if (id) {
    const summary = list.find((e) => e.id === id)
    const frozen = engine.historyReport(id)
    if (frozen) rep = readFrozenReport(frozen, summary)
    else if (summary) {
      gate = (
        <Gate
          kicker={`From your locker · ${summary.dateCompleted}`}
          title="This one predates the frozen report."
          actions={<><VoltButton href={`#/rooms/draft?report=${encodeURIComponent(id)}`}>Open it in the classic locker <Arrow /></VoltButton><GhostButton href="#/v2/drafts">Back to the locker</GhostButton></>}
        >
          {summary.leagueType} from seat {summary.seat}, graded {summary.grade || '—'}{summary.rank ? ` · ${summary.projectedRank} of ${summary.teams}` : ''} when it finished. It was recorded
          before Juke kept each report frozen, so the full breakdown can only be rebuilt by replaying the draft against
          tonight’s board — which the classic locker does, and which would move its numbers from what was recorded.
        </Gate>
      )
    } else {
      gate = (
        <Gate kicker="Not in your locker" title="That draft isn’t here." actions={<><VoltButton href="#/v2/drafts">Open your locker <Arrow /></VoltButton><GhostButton href={LAUNCH_HASH}>Run a mock</GhostButton></>}>
          It may have been deleted, or it was saved in a different browser. Sign in and your locker follows you between devices.
        </Gate>
      )
    }
  } else {
    const liveOver = !!engine.headerInfo().started && engine.draftOver()
    if (liveOver) rep = readLiveReport(engine, viewSlot ?? engine.mySlot())
    else {
      const newest = list.find((e) => engine.historyReport(e.id))
      if (newest) rep = readFrozenReport(engine.historyReport(newest.id), newest)
      else {
        gate = (
          <Gate kicker="The report" title="No finished draft yet." actions={<VoltButton href={LAUNCH_HASH}>Start a mock draft <Arrow /></VoltButton>}>
            The report is what a mock turns into the moment its last pick lands: the grade, where you finished, the four
            parts that add up to it, and the one player who got away.
          </Gate>
        )
      }
    }
  }
  void version

  if (gate) return gate
  if (!rep) return <Panel className="p-6 text-[14px] text-v2-ink2">This report could not be read.</Panel>

  const live = rep.mode === 'live'
  const runAnother = () => {
    // The finished draft is already in the locker — recordHistory() fired
    // on the edge that ended it — so clearing the live save throws nothing
    // away. Only for the live draft: a frozen report has no live save of
    // its own, and clearing one would discard an unfinished draft instead.
    if (live && engine.draftOver()) engine.restart()
    location.hash = LAUNCH_HASH
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[760px]">
          <Kicker tone="text-v2-ink2">{live ? 'Draft complete' : 'From your locker'} · {rep.dateText}</Kicker>
          <h1 className="mt-3 font-telemetry text-[clamp(2.8rem,6vw,5rem)] font-extrabold uppercase italic leading-[0.88] text-v2-ink">
            {rep.isMe ? 'Your draft, graded.' : `${rep.teamName}, graded.`}
          </h1>
          <p className="mt-4 max-w-[60ch] text-[16px] leading-[1.55] text-v2-ink2">
            {rep.leagueText}. {live
              ? 'Graded against the board it was drafted on, and already saved to your locker.'
              : 'Exactly as it was graded the moment it finished — the board has moved since, and this report has not.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!rep.isMe && <GhostButton onClick={() => setViewSlot(rep.mySlot)}>Back to your team</GhostButton>}
          <VoltButton onClick={runAnother}>Run another mock <Arrow /></VoltButton>
          <GhostButton href="#/v2/drafts">Back to the locker</GhostButton>
        </div>
      </div>

      <Panel className="overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <div className="relative border-b border-white/[0.06] p-6 lg:border-b-0 lg:border-r">
            <span className="pointer-events-none absolute right-5 top-4 select-none font-telemetry text-[80px] font-extrabold italic leading-none text-white/[0.035]" aria-hidden="true">
              {rep.teams}T
            </span>
            <Kicker>Draft grade</Kicker>
            <span className="relative mt-2 block font-telemetry text-[150px] font-extrabold italic leading-[0.8] text-v2-ink">{rep.grade}</span>
            <span className="relative mt-3 block font-mono text-[15px] tabular-nums text-v2-ink">{ordinal(rep.rank)} of {rep.teams}</span>
            <span className="relative mt-1 block text-[12px] text-v2-ink3">The letter is the finishing position in this room.</span>
          </div>
          <div className="flex flex-col gap-5 p-6">
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-[12px] bg-v2-inset p-3.5 ring-1 ring-inset ring-white/[0.06]">
                <dt><Kicker>Net ADP value</Kicker></dt>
                <dd className={`mt-1 font-telemetry text-[32px] font-bold leading-none tabular-nums ${rep.value > 0 ? 'text-v2-volt' : rep.value < 0 ? 'text-v2-loss' : 'text-v2-ink'}`}>{signedInt(rep.value)}</dd>
                <span className="mt-1 block font-mono text-[10px] text-v2-ink3">picks, K and D/ST aside</span>
              </div>
              <div className="rounded-[12px] bg-v2-inset p-3.5 ring-1 ring-inset ring-white/[0.06]">
                <dt><Kicker>Projected win %</Kicker></dt>
                <dd className="mt-1 font-telemetry text-[32px] font-bold leading-none tabular-nums text-v2-ink">{typeof rep.winPct === 'number' ? `${Math.round(rep.winPct * 100)}%` : '—'}</dd>
                <span className="mt-1 block font-mono text-[10px] text-v2-ink3">vs this room, an estimate</span>
              </div>
              <div className="col-span-2 rounded-[12px] bg-v2-inset p-3.5 ring-1 ring-inset ring-white/[0.06]">
                <dt><Kicker>Best value</Kicker></dt>
                <dd className="mt-1 truncate text-[15px] font-semibold text-v2-ink">{rep.bargain ? rep.bargain.name : '—'}</dd>
                <span className="block font-mono text-[11px] text-v2-volt">{rep.bargain && rep.bargain.gap > 0 ? `${rep.bargain.gap} picks later than the board had him` : ''}</span>
                <dt className="mt-2.5"><Kicker>Biggest reach</Kicker></dt>
                <dd className="mt-1 truncate text-[15px] font-semibold text-v2-ink">{rep.reach ? rep.reach.name : 'None'}</dd>
                {rep.reach && <span className="block font-mono text-[11px] text-v2-loss">{Math.abs(rep.reach.gap)} picks early</span>}
              </div>
            </dl>
            <div className="border-t border-white/[0.06] pt-4">
              <ShareRow rep={rep} />
            </div>
          </div>
        </div>
      </Panel>

      <section aria-labelledby="v2-away" className="relative overflow-hidden rounded-[18px] bg-v2-panel p-5 ring-1 ring-inset ring-v2-violet/40">
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-v2-violet" aria-hidden="true" />
        <div className="flex flex-wrap items-center gap-5">
          <div className="min-w-0 flex-1 basis-[320px]">
            <h2 id="v2-away" className="font-telemetry text-[22px] font-bold uppercase italic text-v2-ink">The one that got away</h2>
            <p className="mt-1.5 max-w-[70ch] text-[14px] leading-[1.6] text-v2-ink2">{missedSentence(rep)}</p>
          </div>
          {rep.missed && (
            <div className="shrink-0 text-right">
              <span className="block font-telemetry text-[64px] font-extrabold italic leading-none tabular-nums text-v2-violet">+{Math.round(rep.missed.delta)}</span>
              <Kicker>lineup points forgone</Kicker>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Components rep={rep} />
        <Vorp rep={rep} />
        <Timeline rep={rep} />
        <Standings rep={rep} onPick={live ? setViewSlot : null} />
      </div>
    </div>
  )
}
