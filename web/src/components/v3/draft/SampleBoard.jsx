import { useEffect, useRef, useState } from 'react'
import { CELL_INK, POS_CHALK } from '../../draftRoomPositions.js'
import { DE } from '../../v2/cockpit/cockpitData.js'
import { SampleTag } from '../league/parts.jsx'
import { Label, cx, useEngineData } from '../ui.jsx'
import { EASE, LAYOUT_ROW, PRESS, SPRING, motion, useMotionOK } from '../motion.jsx'
import { FOCUS, Glyph } from './kit.jsx'

/* The product, playing itself — v3's reading of Sleeper's "try out a mock
   draft" grid, where the board fills pick by pick while a clock chip walks
   along it.

   ---- Where the picks come from ----

   engine.shotPicks(): five real rounds of a real snake draft on tonight's
   board, every seat valuing the players the way the draft room's own advice
   does (ADP, need, injury risk, the model). It is the same generator that
   draws production's hero shot, read rather than re-implemented, so the
   sample quarterback goes in the third round and the good tight ends in the
   fourth for the same reason they do in a real room. Nothing here writes to
   the engine: shotPicks() keeps its own taken/have and never touches
   board[].drafted or state.picks.

   ---- What makes it honest ----

   SAMPLE on it, in the warn wash, and a caption that says what it is. The
   seat addresses are DraftEngine.pickInfo()/pickCode() — the snake's mirror
   lives there, never here.

   ---- What makes it bearable ----

   It plays once, when it is on screen, and stops at a full board; it pauses
   whenever it scrolls away or the tab is hidden, and it has a Pause/Play
   button, because anything that moves for more than five seconds owes the
   reader a way to stop it. Reduced motion shows the finished board. */

// shotPicks() drafts SHOT_TEAMS seats (app.js); ten, and the rounds follow
// from how many picks came back rather than being written down again.
const TEAMS = 10
const PICK_MS = 240

function readShot(engine) {
  if (!engine.shotPicks) return null
  const picks = engine.shotPicks()
  if (!picks || !picks.length) return null
  return {
    picks: picks.map((p) => ({ name: p.name, short: engine.shortName ? engine.shortName(p) : p.name, pos: p.pos, team: p.team || 'FA' })),
  }
}

function useOnScreen(ref) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return undefined }
    const io = new IntersectionObserver((e) => setOn(e.some((x) => x.isIntersecting)), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return on
}

function usePageVisible() {
  const [v, setV] = useState(() => (typeof document === 'undefined' ? true : !document.hidden))
  useEffect(() => {
    const on = () => setV(!document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return v
}

export default function SampleBoard({ className = '' }) {
  const data = useEngineData(readShot)
  const ok = useMotionOK()
  const box = useRef(null)
  const onScreen = useOnScreen(box)
  const visible = usePageVisible()
  const [n, setN] = useState(0)
  const [held, setHeld] = useState(false)
  const de = DE()
  const total = data ? data.picks.length : 0
  const rounds = Math.ceil(total / TEAMS)
  const done = total > 0 && n >= total

  // Reduced motion: the finished board, and nothing moving.
  useEffect(() => { if (!ok && total) setN(total) }, [ok, total])

  const running = ok && onScreen && visible && !held && total > 0 && !done
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => setN((x) => Math.min(total, x + 1)), PICK_MS)
    return () => clearInterval(id)
  }, [running, total])

  if (!data || !de) return null

  const cellOf = (overall) => {
    const info = de.pickInfo(overall, TEAMS)
    return info ? { col: info.slot + 1, row: info.round } : null
  }
  const clock = !done ? cellOf(n + 1) : null
  const last = n > 0 ? data.picks[n - 1] : null
  const lastCode = n > 0 ? de.pickCode(n, TEAMS) : null

  const control = !ok ? null : done ? (
    <button type="button" onClick={() => { setHeld(false); setN(0) }} className={cx('inline-flex min-h-[44px] items-center gap-1.5 rounded-[4px] px-2 font-figure text-[12px] font-semibold uppercase tracking-[0.08em] text-v3-ink2 hover:text-v3-ink', PRESS, FOCUS)}>
      <Glyph name="undo" className="h-4 w-4" /> Watch again
    </button>
  ) : (
    <button type="button" onClick={() => setHeld((h) => !h)} aria-pressed={held} className={cx('inline-flex min-h-[44px] items-center gap-1.5 rounded-[4px] px-2 font-figure text-[12px] font-semibold uppercase tracking-[0.08em] text-v3-ink2 hover:text-v3-ink', PRESS, FOCUS)}>
      <Glyph name={held ? 'play' : 'pause'} className="h-4 w-4" filled={held} /> {held ? 'Play' : 'Pause'}
    </button>
  )

  return (
    <div ref={box} className={cx('rounded-[6px] border border-v3-rule bg-v3-paper p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <SampleTag />
          <Label className="truncate text-[11px]">A draft playing itself</Label>
        </span>
        {control}
      </div>
      <div
        role="img"
        aria-label={`A sample draft: ${TEAMS} CPU seats taking tonight's board over ${rounds} rounds, the way the draft room's own advice would.`}
        className="relative mt-2 grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${TEAMS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rounds}, 26px)` }}
      >
        {data.picks.map((p, i) => {
          const at = cellOf(i + 1)
          if (!at) return null
          const place = { gridColumnStart: at.col, gridRowStart: at.row }
          if (i >= n) {
            return <span key={i} aria-hidden="true" style={place} className="rounded-[3px] border border-dashed border-v3-rule" />
          }
          // The pick that just landed arrives; every earlier one is simply
          // there, so a remount (or a replay's first frame) moves nothing.
          const fresh = ok && i === n - 1
          return (
            <motion.span
              key={i}
              aria-hidden="true"
              initial={fresh ? { opacity: 0, scale: 0.72 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={SPRING.land}
              style={{ ...place, background: POS_CHALK[p.pos] || '#D5DBE3', color: CELL_INK }}
              className="grid place-items-center rounded-[3px] font-figure text-[11px] font-bold leading-none"
            >
              {p.pos === 'DST' ? 'D' : p.pos}
            </motion.span>
          )
        })}
        {/* The clock chip: the next pick's cell, ringed in ink — the live
            draft's own "on the clock" mark — and it walks the snake. */}
        {clock && (
          <motion.span
            {...LAYOUT_ROW}
            aria-hidden="true"
            style={{ gridColumnStart: clock.col, gridRowStart: clock.row }}
            className="pointer-events-none rounded-[3px] bg-v3-sheet shadow-[inset_0_0_0_2px_rgb(var(--v3-ink))]"
          />
        )}
      </div>
      <p className="mt-2 flex min-h-[20px] min-w-0 items-center gap-2 font-figure text-[12px] tabular-nums text-v3-ink2" aria-hidden="true">
        {last ? (
          <motion.span key={n} initial={ok ? { opacity: 0, y: 4 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE.out }} className="min-w-0 truncate">
            <span className="font-bold text-v3-ink">{lastCode}</span> · {last.short} · {last.pos === 'DST' ? 'D/ST' : last.pos}, {last.team}
          </motion.span>
        ) : <span className="text-v3-ink3">On the clock: pick 1.01</span>}
      </p>
    </div>
  )
}
