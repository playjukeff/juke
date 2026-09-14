import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { drawShareCard, canvasToBlob } from '../../../shareCard.js'
import { missedSentence, readFrozenReport, readLiveReport, shareDataOf } from '../../v2/cockpit/reportData.js'
import { useDraftVersion, useEngine } from '../../v2/cockpit/useCockpit.js'
import { CallButton, Delta, Fig, Label, PageHead, PosTag, QuietButton, Sheet, Skeleton, ValueBar, cx, ordinal } from '../ui.jsx'
import { LAUNCH_HASH, RECORD_HASH } from './flow.js'
import { FOCUS, Glyph } from './kit.jsx'
import { CountUp, DUR, EASE, cancelAll, playOn, useEntrance } from '../motion.jsx'

/* The report, at #/draft/report (optional ?id=<historyId>).

   Which draft it describes, in order:
   1. ?id= names a locker entry: its FROZEN report (engine.historyReport),
      never a regrade. A reopened report regraded against tonight's board
      would disagree with the grade the locker recorded for the same picks.
      An entry recorded before reports were frozen has nothing to show here
      and says so, with a link to the classic locker, whose fallback replays
      the draft — a replay that rewrites the live board and state, which
      this page will not do to an unfinished draft sitting in memory.
   2. No id, and the draft that just finished is still in memory: LIVE, and
      any seat in the room can be opened.
   3. No id, nothing in memory (a reload): the newest locker entry, frozen.

   Nothing here grades anything; reportData.js arranges what the engine
   already decided, and the share card is drawn by production's shareCard.js
   from the same values the page shows — so the card can never say what the
   screen does not. The letter stands beside its finishing position, never
   beside a score out of 100; the weighted total appears only where the four
   parts visibly add up to it. */

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
  const flash = (key, text) => { setNote({ key, text }); setTimeout(() => setNote({ key: null, text: '' }), 2600) }
  const makeBlob = async () => canvasToBlob(await drawShareCard(shareDataOf(rep)))
  const filename = () => 'juke-draft-' + rep.teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png'
  const run = async (key, fn) => { if (busy) return; setBusy(key); try { await fn() } finally { setBusy(null) } }
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
    try { await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': await makeBlob() })]); flash('copy', 'Copied — paste it anywhere') }
    catch { flash('copy', 'Couldn’t copy — try Download') }
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
    } catch { flash('download', 'Couldn’t render the card') }
  }
  // Each door shown only where the browser can open it — a share button that
  // quietly does nothing is the dead-control failure.
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard && typeof window !== 'undefined' && !!window.ClipboardItem
  const glyph = (key, icon) => <Glyph name={note.key === key ? 'check' : icon} className="h-4 w-4" />
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label className="mr-1">Share this result</Label>
      {canShare && <QuietButton aria-busy={busy === 'share'} onClick={() => run('share', nativeShare)}>{glyph('share', 'share')} Share…</QuietButton>}
      {canCopy && <QuietButton aria-busy={busy === 'copy'} onClick={() => run('copy', copy)}>{glyph('copy', 'copy')} Copy image</QuietButton>}
      <QuietButton aria-busy={busy === 'download'} onClick={() => run('download', download)}>{glyph('download', 'download')} Download PNG</QuietButton>
      <span role="status" className="text-[13px] text-v3-ink2">{note.text}</span>
    </div>
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
    <Sheet code="The four parts" aside="and what each counts for">
      <ul className="space-y-4">
        {bars.map((b) => {
          const low = b.key === weakest.key
          return (
            <li key={b.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-bold text-v3-ink">{b.label}{low && <span className="ml-2 rounded-[3px] bg-v3-warnWash px-1.5 py-0.5 font-figure text-[11px] font-bold uppercase tracking-[0.08em] text-v3-warn">weakest</span>}</span>
                <span className="font-figure text-[12px] text-v3-ink3">×{Math.round(b.weight * 100)}% · {b.scaled ? 'vs room' : 'own scale'}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <ValueBar value={Math.max(0.5, Math.min(100, b.pct))} max={100} tone="neutral" className="h-2.5 min-w-0 flex-1" />
                <CountUp value={b.pct} format={(v) => v.toFixed(1)} className="w-14 shrink-0 text-right font-figure text-[20px] font-bold tabular-nums text-v3-ink" />
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 rounded-[4px] bg-v3-paper px-3.5 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Label>Weighted sum</Label>
          <CountUp value={rep.scored.total} format={(v) => v.toFixed(1)} className="font-figure text-[18px] font-bold tabular-nums text-v3-ink" />
        </div>
        <p className="mt-1 break-words font-figure text-[12px] tabular-nums text-v3-ink2">
          {bars.map((b) => (b.pct * b.weight).toFixed(1)).join(' + ')} = {rep.scored.total.toFixed(1)}
        </p>
      </div>
      <p className="mt-3 text-[13px] leading-[1.55] text-v3-ink2">
        A weight is how much a part counts, not how much it separates the room. On the three marked “vs room”, 0 and 100 are this room’s floor and ceiling — somebody always scores each. Roster construction is its own 0–100, so it varies less and moves the order less than its weight alone suggests. The sum orders the room; the letter is where you finished in it.
      </p>
    </Sheet>
  )
}

function Vorp({ rep }) {
  const max = Math.max(1, ...rep.vorpRows.filter((r) => r.gap !== null).map((r) => Math.abs(r.gap)))
  return (
    <Sheet code="VORP matrix" aside="starters against replacement">
      <ul className="space-y-2">
        {rep.vorpRows.map((r, i) => (
          <li key={i} className="grid grid-cols-[40px_minmax(0,1fr)_minmax(56px,30%)_44px] items-center gap-2 sm:grid-cols-[48px_minmax(0,1fr)_minmax(80px,36%)_48px] sm:gap-2.5">
            <span className="font-figure text-[12px] font-bold uppercase tracking-[0.06em] text-v3-ink">{r.slotLabel === 'DST' ? 'D/ST' : r.slotLabel}</span>
            <span className="flex min-w-0 items-center gap-2">
              {r.pos && <span className="hidden sm:inline-flex"><PosTag pos={r.pos} /></span>}
              <span className={cx('truncate text-[14px]', r.name ? 'text-v3-ink' : 'text-v3-ink3')}>{r.name || 'Empty'}</span>
            </span>
            {r.name && r.gap !== null ? <ValueBar value={r.gap} max={max} zero /> : <span className="relative block h-2"><span className="absolute inset-y-0 left-1/2 w-px bg-v3-ink3" /></span>}
            <span className="text-right text-[13px]">{!r.name || r.gap === null ? <span className="font-figure text-v3-ink3">—</span> : <Delta value={r.gap} />}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-[1.55] text-v3-ink2">
        Kickers and defenses show a dash: measured against three seasons of archived forecasts the projection ranks them no better than chance, so no bar is drawn from it. Their points still count toward starter strength — these rows add up to a little less than the grade uses.
      </p>
    </Sheet>
  )
}

function Timeline({ rep }) {
  const max = Math.max(1, ...rep.timeline.map((t) => Math.abs(t.gap)))
  return (
    <Sheet code="Value timeline" aside="unit: picks">
      <p className="mb-3 text-[14px] text-v3-ink2">Where each pick landed against the board — right means he fell to {rep.isMe ? 'you' : 'them'}.</p>
      <ul className="space-y-2">
        {rep.timeline.map((t, i) => (
          <li key={t.overall ?? i} className="grid grid-cols-[30px_40px_minmax(0,1fr)_minmax(56px,30%)_40px] items-center gap-1.5 sm:grid-cols-[32px_40px_minmax(0,1fr)_minmax(80px,36%)_44px] sm:gap-2">
            <span className="font-figure text-[12px] font-bold text-v3-ink3">R{t.round}</span>
            <PosTag pos={t.pos} />
            <span className="truncate text-[14px] text-v3-ink">{t.name}</span>
            <span role="img" aria-label={`${t.name}: ${t.gap >= 0 ? `${t.gap} picks late` : `${Math.abs(t.gap)} picks early`}`}><ValueBar value={t.gap} max={max} zero /></span>
            <span className="text-right text-[13px]"><Delta value={t.gap} /></span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-[1.55] text-v3-ink2">Kickers and defenses sit this out — their ADP comes from longer drafts than this one, so every one reads as a reach.</p>
    </Sheet>
  )
}

function Standings({ rep, onPick }) {
  return (
    <Sheet code="Room standings" aside={onPick ? 'open any team' : 'as recorded'} bodyClass="p-2">
      <ol>
        {rep.standings.map((t) => {
          const on = t.slot === rep.viewSlot
          const inner = (
            <>
              <span className={cx('w-6 shrink-0 text-right font-figure text-[12px] tabular-nums', on ? 'text-v3-bandInk' : 'text-v3-ink3')}>{t.rank}</span>
              <span className={cx('min-w-0 flex-1 truncate text-[14px]', t.isMine && 'font-bold', on ? 'text-white' : 'text-v3-ink')}>{t.isMine ? 'Your team' : t.teamName}</span>
              <span className={cx('w-9 shrink-0 text-center font-sheet text-[20px] font-black leading-none', on ? 'text-white' : 'text-v3-ink')}>{t.grade}</span>
            </>
          )
          const cls = cx('flex min-h-[44px] w-full items-center gap-3 rounded-[4px] px-2 text-left', on ? 'bg-v3-band' : '')
          return (
            <li key={t.slot} data-rise="">
              {onPick
                ? <button type="button" onClick={() => onPick(t.slot)} aria-current={on ? 'true' : undefined} className={cx(cls, FOCUS, !on && 'hover:bg-v3-paper')}>{inner}</button>
                : <div className={cls}>{inner}</div>}
            </li>
          )
        })}
      </ol>
    </Sheet>
  )
}

/* The one set piece v3 allows itself: the letter landing, with where it
   finished. Sleeper's CHOPPED slams in after the list has had its say;
   here the letter lands first — heavy, from a little above, with the one
   overshoot on the site — and its finishing position slides in beside it,
   because the letter IS the finishing position and the two are one fact.
   Never beside a score out of a hundred; the figures under it count up on
   their own (CountUp), and the four parts fill as they are scrolled to.

   It plays when the report is arrived at — the draft just ended, or it was
   opened from the record — and never on a cold load, where the letter is
   simply there.

   Its own component, not a hook in V3Report: the entrance is decided once,
   at mount, and V3Report's first render is usually an early return (the
   engine or the board not in hand yet), so a hook up there measured an
   element that did not exist and settled on "rest" for good. This mounts
   with the letter. */
function GradeFace({ grade, rank, teams }) {
  const gradeBox = useRef(null)
  const letterRef = useRef(null)
  const finishRef = useRef(null)
  const phase = useEntrance(gradeBox)
  useLayoutEffect(() => {
    if (phase !== 'play') return undefined
    const letter = letterRef.current
    const finish = finishRef.current
    if (!letter || !finish) return undefined
    // The landing spring (SPRING.land's shape: one overshoot, then a small
    // recoil) written as keyframes, on native Web Animations: fill
    // 'backwards' holds each first frame through its delay and nothing is
    // left on the letter when it lands.
    const running = [
      playOn(letter, [{ opacity: 0 }, { opacity: 1 }], { duration: 0.16, ease: 'linear' }),
      playOn(letter, [
        { transform: 'translateY(-10px) scale(1.34)', easing: 'cubic-bezier(0.33,0,0.2,1)' },
        { transform: 'translateY(1px) scale(0.965)', offset: 0.5, easing: 'cubic-bezier(0.4,0,0.4,1)' },
        { transform: 'translateY(0px) scale(1.008)', offset: 0.78, easing: 'ease-in-out' },
        { transform: 'translateY(0px) scale(1)' },
      ], { duration: 0.6, ease: 'linear' }),
      playOn(finish, [{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'translateX(0px)' }], { duration: DUR.land, ease: EASE.out, delay: 0.28 }),
    ]
    return () => cancelAll(running)
  }, [phase])
  return (
    <div ref={gradeBox} className="flex flex-wrap items-end gap-x-5 gap-y-3">
      <span ref={letterRef} className="inline-block origin-bottom-left font-sheet text-[132px] font-black leading-[0.78] tracking-[-0.05em] text-v3-ink" aria-label={`Grade ${grade}`}>{grade}</span>
      <span ref={finishRef} className="inline-block pb-2">
        <Fig className="block whitespace-nowrap text-[24px] font-bold text-v3-ink">{ordinal(rank)} of {teams}</Fig>
        <Label className="mt-1 block whitespace-nowrap text-[11px]">finish in this room</Label>
      </span>
    </div>
  )
}

function Gate({ label, title, children, actions }) {
  return (
    <div className="grid grid-cols-1 gap-7 py-6">
      <PageHead label={label} title={title} lede={children} />
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}

export default function V3Report() {
  const engine = useEngine()
  const version = useDraftVersion(engine)
  const id = useHashId()
  const [viewSlot, setViewSlot] = useState(null)
  useEffect(() => { setViewSlot(null) }, [id])

  const ready = !!engine && engine.dataReady()
  if (!ready) return <Sheet code="The report" aside="reading your board"><Skeleton lines={7} /></Sheet>
  void version

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
          label={`From your record · ${summary.dateCompleted}`}
          title="This one predates the frozen report."
          /* This offered "Open it in the classic locker" at
             #/rooms/draft?report=<id> until the cutover, and that address now
             canonicalises to #/draft/report?id=<id> — THIS screen. So the one
             action on the card returned to the card, which is the dead-control
             failure with a loop in it: it renders, it contrasts, it throws
             nothing, and pressing it appears to do nothing at all.

             The classic locker is unreachable from every address now, so the
             action cannot be honoured and is not offered. The copy says what
             is true instead — the grade and rank recorded that night are real
             and are shown; the full breakdown is what predates the freeze. */
          actions={<CallButton href={RECORD_HASH}>Back to your record <Glyph name="arrow" className="h-4 w-4" /></CallButton>}
        >
          {`${summary.leagueType} from seat ${summary.seat}, graded ${summary.grade || '—'}${summary.rank ? ` · ${summary.projectedRank} of ${summary.teams}` : ''} when it finished. That grade is what was recorded on the night. The full breakdown is not: it was kept before Juke froze each report, and rebuilding it would mean replaying the draft against tonight’s board, which would move its numbers away from what actually happened.`}
        </Gate>
      )
    } else {
      gate = (
        <Gate label="Not in your record" title="That draft isn’t here." actions={<><CallButton href={RECORD_HASH}>Open your record <Glyph name="arrow" className="h-4 w-4" /></CallButton><QuietButton href={LAUNCH_HASH}>Run a mock</QuietButton></>}>
          It may have been deleted, or it was saved in a different browser. Sign in and your record follows you between devices.
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
          <Gate label="The report" title="No finished draft yet." actions={<CallButton href={LAUNCH_HASH}>Start a mock draft <Glyph name="arrow" className="h-4 w-4" /></CallButton>}>
            The report is what a mock turns into the moment its last pick lands: the grade, where you finished, the four parts that add up to it, and the one player who got away.
          </Gate>
        )
      }
    }
  }

  if (gate) return gate
  if (!rep) return <Sheet code="The report"><p className="text-[15px] text-v3-ink2">This report could not be read.</p></Sheet>

  const live = rep.mode === 'live'
  const runAnother = () => {
    // The finished draft is already in the locker — recordHistory() fired on
    // the edge that ended it — so clearing the live save throws nothing
    // away. Only for the live draft: a frozen report has no save of its own,
    // and clearing one would discard an unfinished draft instead.
    if (live && engine.draftOver()) engine.restart()
    location.hash = LAUNCH_HASH
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHead
        label={`${live ? 'Draft complete' : 'From your record'} · ${rep.dateText}`}
        title={rep.isMe ? 'Your draft, graded.' : `${rep.teamName}, graded.`}
        lede={`${rep.leagueText}. ${live ? 'Graded against the board it was drafted on, and already saved to your record.' : 'Exactly as it was graded the moment it finished — the board has moved since, and this report has not.'}`}
        action={
          <>
            {!rep.isMe && <QuietButton onClick={() => setViewSlot(rep.mySlot)}>Back to your team</QuietButton>}
            <CallButton onClick={runAnother}>Run another mock <Glyph name="arrow" className="h-4 w-4" /></CallButton>
            <QuietButton href={RECORD_HASH}>Your record</QuietButton>
          </>
        }
      />

      <Sheet code="The grade" aside={`${rep.teams} teams · ${rep.isMe ? 'your seat' : rep.teamName}`} bodyClass="p-0" rise={false}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="border-b border-v3-rule p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <GradeFace grade={rep.grade} rank={rep.rank} teams={rep.teams} />
            <p className="mt-4 text-[14px] leading-[1.5] text-v3-ink2">The letter is the finishing position in this room. It is not a score out of a hundred, and none is printed beside it.</p>
          </div>
          <div className="flex flex-col gap-5 p-5 sm:p-6">
            <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-[4px] bg-v3-paper p-3">
                <dt><Label className="text-[11px]">Net ADP value</Label></dt>
                <dd className="mt-1 text-[28px] leading-none"><Delta value={rep.value} count /></dd>
                <dd className="mt-1 text-[12px] text-v3-ink3">picks, K and D/ST aside</dd>
              </div>
              <div className="rounded-[4px] bg-v3-paper p-3">
                <dt><Label className="text-[11px]">Projected win %</Label></dt>
                <dd className="mt-1 font-figure text-[28px] font-bold leading-none tabular-nums text-v3-ink"><CountUp value={typeof rep.winPct === 'number' ? rep.winPct * 100 : null} format={(v) => `${Math.round(v)}%`} /></dd>
                <dd className="mt-1 text-[12px] text-v3-ink3">vs this room, an estimate</dd>
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-2">
                <div className="min-w-0 rounded-[4px] bg-v3-paper p-3">
                  <dt><Label className="text-[11px]">Best value</Label></dt>
                  <dd className="mt-1 truncate text-[15px] font-bold text-v3-ink">{rep.bargain ? rep.bargain.name : '—'}</dd>
                  {rep.bargain && rep.bargain.gap > 0 && <dd className="mt-0.5 text-[12px]"><Delta value={rep.bargain.gap} /> <span className="text-v3-ink3">picks late</span></dd>}
                </div>
                <div className="min-w-0 rounded-[4px] bg-v3-paper p-3">
                  <dt><Label className="text-[11px]">Biggest reach</Label></dt>
                  <dd className="mt-1 truncate text-[15px] font-bold text-v3-ink">{rep.reach ? rep.reach.name : 'None'}</dd>
                  {rep.reach && <dd className="mt-0.5 text-[12px]"><Delta value={-Math.abs(rep.reach.gap)} /> <span className="text-v3-ink3">picks early</span></dd>}
                </div>
              </div>
            </dl>
            <div className="border-t border-v3-rule pt-4"><ShareRow rep={rep} /></div>
          </div>
        </div>
      </Sheet>

      <Sheet code="The one that got away" aside={rep.missed ? 'points forgone' : 'none'}>
        <div className="flex flex-wrap items-center gap-5">
          <p className="min-w-0 flex-1 basis-[320px] text-[16px] leading-[1.6] text-v3-ink">{missedSentence(rep)}</p>
          {rep.missed && (
            <div className="shrink-0 text-right">
              <span className="block text-[52px] leading-none"><Delta value={-Math.round(rep.missed.delta)} count /></span>
              <Label className="text-[11px]">starting lineup points</Label>
            </div>
          )}
        </div>
      </Sheet>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Components rep={rep} />
        <Vorp rep={rep} />
        <Timeline rep={rep} />
        <Standings rep={rep} onPick={live ? setViewSlot : null} />
      </div>
    </div>
  )
}
