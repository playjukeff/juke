import { useEffect, useRef, useState } from 'react'
import { posColor } from '../v2ui.jsx'
import { DE } from './cockpitData.js'
import { FOCUS } from './parts.jsx'
import { IconTarget } from './icons.jsx'

/* The board: one column per seat, one row per round, every pick where the
   snake put it.

   Every cell's address is DraftEngine's — overallOf() for which overall pick
   a seat holds in a round and pickCode() for its label — because the mirror
   lives inside those two and a caller holding a round and a seat must never
   work it out again (CLAUDE.md, "A pick number is not a seat number").
   Which way a round runs is asked the same way: pickInRound(round, seat 0)
   is 1 in a forward round and the team count in a reversed one, which is
   true of linear and third-round-reversal drafts too.

   ---- Following the live pick ----

   The board follows the pick on the clock, and stops the moment a person
   scrolls it — wheel, touch-drag or a key, never the `scroll` event, which
   a smooth programmatic scroll fires in a stream and would release the
   follow on its own animation. The crosshair button re-arms it. Same rules
   as production's followLive, and for the reasons CLAUDE.md records. */

export default function DraftBoard({ engine, version, onOpen, phone }) {
  const de = DE()
  const scroller = useRef(null)
  const liveRef = useRef(null)
  const [follow, setFollow] = useState(true)
  const league = engine.league()
  const picks = engine.picks() || []
  const mySlot = engine.mySlot()
  const over = picks.length >= league.teams * league.rounds
  const liveOverall = over ? null : picks.length + 1

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
    // Rects differenced against the scroller's own, never offsetTop, which
    // measures to the nearest positioned ancestor rather than the scroller.
    const s = el.getBoundingClientRect()
    const c = cell.getBoundingClientRect()
    const top = el.scrollTop + (c.top - s.top) - (el.clientHeight - c.height) / 2
    const left = el.scrollLeft + (c.left - s.left) - (el.clientWidth - c.width) / 2
    if (Math.abs(top - el.scrollTop) < 4 && Math.abs(left - el.scrollLeft) < 4) return
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' })
  }, [version, follow])

  if (!de) return null

  const teams = []
  for (let s = 0; s < league.teams; s++) teams.push(s)
  const rounds = []
  for (let r = 1; r <= league.rounds; r++) rounds.push(r)
  const cellW = phone ? 104 : 118

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} tabIndex={0} aria-label="Draft board" className={`min-h-0 flex-1 overflow-auto ${FOCUS}`}>
        <table className="border-separate border-spacing-0 bg-v2-panel">
          <thead className="sticky top-0 z-10">
            <tr>
              <th scope="col" className="sticky left-0 z-20 w-[44px] border-b border-r border-white/[0.07] bg-v2-panel font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-v2-ink3">Rd</th>
              {teams.map((s) => {
                const mine = s === mySlot
                const strip = engine.rosterStrip ? engine.rosterStrip(s) : []
                return (
                  <th key={s} scope="col" style={{ minWidth: cellW, maxWidth: cellW }} className={`relative border-b border-white/[0.07] px-2 py-2 text-left align-bottom ${mine ? 'bg-v2-cyan/[0.07]' : 'bg-v2-panel'}`}>
                    {mine && <span className="absolute inset-x-2 top-0 h-[2px] rounded-full bg-v2-cyan" aria-hidden="true" />}
                    <span className={`block truncate font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${mine ? 'text-v2-cyan' : 'text-v2-ink3'}`}>{mine ? 'You' : `Seat ${s + 1}`}</span>
                    <span className="block truncate text-[12px] font-semibold text-v2-ink">{mine ? 'Your team' : engine.teamLabel(s)}</span>
                    {!!strip.length && (
                      <span className="mt-1 flex gap-1 font-mono text-[10px] tabular-nums text-v2-ink3" aria-label="Roster so far">
                        {strip.map((x) => (
                          <span key={x.pos} className={x.count ? 'text-v2-ink2' : ''}>{x.pos === 'DST' ? 'D' : x.pos[0]}{x.count}</span>
                        ))}
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
                  <th scope="row" className="sticky left-0 z-[1] border-r border-white/[0.07] bg-v2-panel px-1 text-center">
                    <span className="block font-telemetry text-[18px] font-bold leading-none text-v2-ink2">{r}</span>
                    <span className="block font-mono text-[10px] text-v2-ink3" aria-label={forward ? 'runs left to right' : 'runs right to left'}>{forward ? '→' : '←'}</span>
                  </th>
                  {teams.map((s) => {
                    const overall = de.overallOf(r, s, league)
                    const pick = picks[overall - 1]
                    const live = overall === liveOverall
                    const mine = s === mySlot
                    const code = de.pickCode(overall, league)
                    const lastOfRound = de.pickInRound(r, s, league) === league.teams
                    const style = { minWidth: cellW, maxWidth: cellW }
                    const base = `relative h-[58px] border-b border-white/[0.04] p-1 align-top ${mine ? 'bg-v2-cyan/[0.035]' : ''}`
                    if (pick) {
                      const c = posColor(pick.player.pos)
                      return (
                        <td key={s} style={style} className={base}>
                          <button
                            type="button"
                            onClick={() => onOpen(pick.player)}
                            className={`flex h-full w-full flex-col justify-between overflow-hidden rounded-[7px] py-1 pl-2.5 pr-1.5 text-left transition-[filter] hover:brightness-125 ${FOCUS}`}
                            style={{ background: `${c}24`, boxShadow: `inset 3px 0 0 ${c}` }}
                            title={`${code} · ${pick.player.name}`}
                          >
                            <span className="block truncate text-[12px] font-semibold leading-tight text-v2-ink">{engine.shortName(pick.player)}</span>
                            <span className="flex items-center justify-between gap-1 font-mono text-[10px] leading-none">
                              <span className="truncate" style={{ color: c }}>{pick.player.pos}<span className="text-v2-ink2"> · {pick.player.team || 'FA'}</span></span>
                              <span className="shrink-0 tabular-nums text-v2-ink2">{code}</span>
                            </span>
                          </button>
                        </td>
                      )
                    }
                    return (
                      <td key={s} style={style} className={base} ref={live ? liveRef : undefined}>
                        <div
                          className={`flex h-full flex-col justify-between rounded-[7px] px-2 py-1 ${
                            live ? 'bg-v2-cyan/[0.1] ring-2 ring-inset ring-v2-cyan' : 'ring-1 ring-inset ring-white/[0.06]'
                          }`}
                          aria-current={live ? 'step' : undefined}
                        >
                          <span className="flex items-center justify-between font-mono text-[10px] tabular-nums">
                            <span className={live ? 'font-semibold text-v2-ink' : 'text-v2-ink3'}>{code}</span>
                            <span className="text-v2-ink3" aria-hidden="true">{lastOfRound ? '↓' : forward ? '→' : '←'}</span>
                          </span>
                          {live ? (
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-v2-cyan">{mine ? 'Your pick' : 'On the clock'}</span>
                          ) : (
                            <span className="font-mono text-[10px] tabular-nums text-v2-ink3">#{overall}</span>
                          )}
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
        <button
          type="button"
          onClick={() => setFollow(true)}
          className={`absolute bottom-3 right-3 z-20 inline-flex min-h-[44px] items-center gap-2 rounded-[10px] bg-v2-raised px-3.5 text-[13px] font-medium text-v2-ink shadow-lg ring-1 ring-inset ring-white/[0.14] ${FOCUS}`}
        >
          <IconTarget /> Jump to the live pick
        </button>
      )}
    </div>
  )
}
