import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { POS_CHALK, CELL_INK, CELL_SUB } from '../../../draftRoomPositions.js'
import { DE } from '../../../v2/cockpit/cockpitData.js'
import { cx } from '../../ui.jsx'
import { FOCUS, Glyph } from '../kit.jsx'
import { SPRING, motion, playOn, useCalm } from '../../motion.jsx'

/* The board: one column per seat, one row per round, every pick where the
   snake put it, in the product's position chalk with CELL_INK on it.

   Every cell's address is DraftEngine's — overallOf() for which overall pick
   a seat holds in a round, pickCode() for its label, pickInRound() for which
   way a round runs — because the mirror lives inside those and a caller
   holding a round and a seat must never work it out again (CLAUDE.md, "A pick
   number is not a seat number").

   Your column is marked the way v3 marks a chosen thing: ink. An ink rule
   and its seat number on its head, a well tint down it. The live pick is a 2px ink ring
   — shape, not a second hue, separates the two when they coincide.

   The board follows the pick on the clock and stops the moment a person
   scrolls it — wheel, touch-drag or a key, never the `scroll` event, which a
   smooth programmatic scroll fires in a stream. The button re-arms it.

   ---- The motion, all of it after the fact ----

   The live pick's ring is one element that WALKS to the next cell (a shared
   layoutId), so the eye follows the clock round the snake the way Sleeper's
   clock chip crosses its grid — rather than one ring blinking out and
   another on. A pick that lands while you watch arrives with a small spring;
   the picks already on the board when it mounted are simply there. Neither
   touches a control: the cell is a button from its first frame. */

export default function Board({ engine, version, onOpen, phone }) {
  const de = DE()
  const scroller = useRef(null)
  const liveRef = useRef(null)
  const [follow, setFollow] = useState(true)
  const league = engine.league()
  const picks = engine.picks() || []
  const mySlot = engine.mySlot()
  const over = picks.length >= league.teams * league.rounds
  const liveOverall = over ? null : picks.length + 1
  const calm = useCalm()
  // Picks on the board when it mounted do not "land"; only later ones do.
  // The landing is played on the cell after the commit (native Web
  // Animations) rather than by making all 140 cells motion components: the
  // board re-renders on every pick, and a motion component per cell was a
  // cost on every one of them.
  const landedBefore = useRef(picks.length)
  const grid = useRef(null)
  useLayoutEffect(() => {
    const from = landedBefore.current
    landedBefore.current = picks.length
    if (calm || picks.length <= from || !grid.current) return
    for (let o = from + 1; o <= picks.length; o++) {
      const el = grid.current.querySelector(`[data-overall="${o}"]`)
      // SPRING.land's shape — one small overshoot — as keyframes.
      if (el) playOn(el, [
        { opacity: 0.35, transform: 'scale(0.84)', easing: 'cubic-bezier(0.33,0,0.2,1)' },
        { opacity: 1, transform: 'scale(1.03)', offset: 0.55, easing: 'ease-in-out' },
        { opacity: 1, transform: 'scale(1)' },
      ], { duration: 0.42, ease: 'linear' })
    }
  }, [picks.length, calm])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const release = () => setFollow(false)
    el.addEventListener('wheel', release, { passive: true })
    el.addEventListener('touchmove', release, { passive: true })
    el.addEventListener('keydown', release)
    return () => {
      el.removeEventListener('wheel', release)
      el.removeEventListener('touchmove', release)
      el.removeEventListener('keydown', release)
    }
  }, [])

  useEffect(() => {
    if (!follow) return
    const el = scroller.current
    const cell = liveRef.current
    if (!el || !cell) return
    // Rects differenced against the scroller's own, never offsetTop.
    const s = el.getBoundingClientRect()
    const c = cell.getBoundingClientRect()
    const top = el.scrollTop + (c.top - s.top) - (el.clientHeight - c.height) / 2
    const left = el.scrollLeft + (c.left - s.left) - (el.clientWidth - c.width) / 2
    if (Math.abs(top - el.scrollTop) < 4 && Math.abs(left - el.scrollLeft) < 4) return
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' })
  }, [version, follow])

  if (!de) return null
  const teams = Array.from({ length: league.teams }, (_, s) => s)
  const rounds = Array.from({ length: league.rounds }, (_, i) => i + 1)
  const cellW = phone ? 104 : 120

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} tabIndex={0} aria-label="Draft board" className={cx('min-h-0 flex-1 overflow-auto bg-v3-sheet', FOCUS)}>
        <table ref={grid} className="border-separate border-spacing-0 bg-v3-sheet">
          <thead className="sticky top-0 z-10">
            <tr>
              <th scope="col" className="sticky left-0 z-20 w-[46px] border-b border-r border-v3-rule bg-v3-sheet font-figure text-[12px] font-bold uppercase tracking-[0.1em] text-v3-ink3">Rd</th>
              {teams.map((s) => {
                const mine = s === mySlot
                const strip = engine.rosterStrip ? engine.rosterStrip(s) : []
                return (
                  <th key={s} scope="col" style={{ minWidth: cellW, maxWidth: cellW }} className={cx('relative border-b px-2 py-2 text-left align-bottom', mine ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet')}>
                    <span className={cx('block truncate font-figure text-[12px] font-bold uppercase tracking-[0.08em]', mine ? 'text-v3-bandInk' : 'text-v3-ink3')}>Seat {s + 1}</span>
                    <span className={cx('block truncate text-[13px] font-bold', mine ? 'text-white' : 'text-v3-ink')}>{mine ? 'Your team' : engine.teamLabel(s)}</span>
                    {!!strip.length && (
                      /* Wraps: six position counts do not fit a 104px phone
                         column, and the header is bottom-aligned with no
                         fixed height, so a second line costs the board
                         nothing where a cut count costs the reader a
                         position. phone.spec's own sweep has reported this
                         at over=9 on all ten columns. */
                      <span className={cx('mt-1 flex flex-wrap gap-x-1 gap-y-0.5 font-figure text-[12px] tabular-nums', mine ? 'text-v3-bandInk' : 'text-v3-ink3')} aria-label="Roster so far">
                        {strip.map((x) => <span key={x.pos} className={x.count ? (mine ? 'text-white' : 'text-v3-ink') : ''}>{x.pos === 'DST' ? 'D' : x.pos[0]}{x.count}</span>)}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => {
              const forward = de.pickInRound(r, 0, league) === 1
              return (
                <tr key={r}>
                  <th scope="row" className="sticky left-0 z-[1] border-b border-r border-v3-rule bg-v3-sheet px-1 text-center">
                    <span className="block font-figure text-[18px] font-bold leading-none text-v3-ink">{r}</span>
                    <span className="block font-figure text-[12px] text-v3-ink3" aria-label={forward ? 'runs left to right' : 'runs right to left'}>{forward ? '→' : '←'}</span>
                  </th>
                  {teams.map((s) => {
                    const overall = de.overallOf(r, s, league)
                    const pick = picks[overall - 1]
                    const live = overall === liveOverall
                    const mine = s === mySlot
                    const code = de.pickCode(overall, league)
                    const lastOfRound = de.pickInRound(r, s, league) === league.teams
                    const style = { minWidth: cellW, maxWidth: cellW }
                    const base = cx('relative h-[60px] border-b border-v3-rule p-1 align-top', mine && 'bg-v3-well')
                    if (pick) {
                      const fill = POS_CHALK[pick.player.pos] || '#D5DBE3'
                      return (
                        <td key={s} style={style} className={base}>
                          <button
                            type="button"
                            data-overall={overall}
                            onClick={() => onOpen(pick.player)}
                            title={`${code} · ${pick.player.name}`}
                            className={cx('flex h-full w-full flex-col justify-between overflow-hidden rounded-[4px] px-2 py-1 text-left hover:shadow-[inset_0_0_0_2px_rgba(22,32,46,0.4)]', FOCUS)}
                            style={{ background: fill, color: CELL_INK }}
                          >
                            <span className="block truncate text-[13px] font-bold leading-tight">{engine.shortName(pick.player)}</span>
                            <span className="flex items-center justify-between gap-1 font-figure text-[12px] leading-none" style={{ color: CELL_SUB }}>
                              <span className="truncate font-bold">{pick.player.pos === 'DST' ? 'D/ST' : pick.player.pos} · {pick.player.team || 'FA'}</span>
                              <span data-pick-code className="shrink-0 tabular-nums">{code}</span>
                            </span>
                          </button>
                        </td>
                      )
                    }
                    return (
                      <td key={s} style={style} className={base} ref={live ? liveRef : undefined}>
                        {live && (
                          <motion.span
                            layoutId="v3-live-ring"
                            transition={calm ? { duration: 0 } : SPRING.layout}
                            className="pointer-events-none absolute inset-1 z-[1] rounded-[4px] shadow-[inset_0_0_0_2px_rgb(var(--v3-ink))]"
                            aria-hidden="true"
                          />
                        )}
                        <div aria-current={live ? 'step' : undefined} className={cx('flex h-full flex-col justify-between rounded-[4px] px-2 py-1', live ? 'bg-v3-sheet' : 'border border-dashed border-v3-rule')}>
                          <span className="flex items-center justify-between font-figure text-[12px] tabular-nums">
                            <span data-pick-code className={live ? 'font-bold text-v3-ink' : 'text-v3-ink3'}>{code}</span>
                            <span className="text-v3-ink3" aria-hidden="true">{lastOfRound ? '↓' : forward ? '→' : '←'}</span>
                          </span>
                          {live
                            ? <span className="font-figure text-[12px] font-bold uppercase tracking-[0.1em] text-v3-ink">{mine ? 'Your pick' : 'On the clock'}</span>
                            : <span className="font-figure text-[12px] tabular-nums text-v3-ink3">#{overall}</span>}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!follow && !over && (
        <button type="button" onClick={() => setFollow(true)} className={cx('absolute bottom-3 right-3 z-20 inline-flex min-h-[44px] items-center gap-2 rounded-[6px] border border-v3-ink bg-v3-sheet px-3.5 text-[15px] font-semibold text-v3-ink shadow-[0_8px_24px_-12px_rgb(var(--v3-shade)/0.4)]', FOCUS)}>
          <Glyph name="target" className="h-4 w-4" /> Jump to the live pick
        </button>
      )}
    </div>
  )
}
