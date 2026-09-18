import { useState } from 'react'
import { Icon, Label, TOUCH, cx } from '../ui.jsx'
import { injuryWord } from './playerData.js'

/* Parts the Players place needs that ui.jsx does not carry. Presentation
   only; every figure they print is handed in. Local on purpose — ui.jsx is
   the shared system and is not this area's to extend. */

/* A headshot, or the player's initials on the well when the CDN has no
   picture (or refuses to serve one). A defense's "photo" is its club logo,
   so it is contained rather than cropped. */
export function PlayerFace({ photo, initials, pos, size = 40, fluid = false, className = '' }) {
  const [broken, setBroken] = useState(false)
  const px = `${size}px`
  // `fluid`: the caller sizes the circle (and its initials) with classes,
  // so one face can be one size on a phone and another at a desk.
  return (
    <span
      className={cx('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-v3-well font-figure font-bold text-v3-ink2', className)}
      style={fluid ? undefined : { width: px, height: px, fontSize: Math.max(11, Math.round(size * 0.3)) }}
      aria-hidden="true"
    >
      {initials}
      {photo && !broken && (
        <img
          src={photo}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setBroken(true)}
          className={cx('absolute inset-0 h-full w-full', pos === 'DST' ? 'object-contain p-[12%]' : 'object-cover')}
        />
      )}
    </span>
  )
}

/* An injury designation. Caution, so v3-warn — never cost, which is a
   value's direction. The code is what fits a row; the word is what a
   screen reader and a tooltip get, and what the page prints in full. */
export function InjuryTag({ code, full = false, className = '' }) {
  if (!code) return null
  const word = injuryWord(code)
  return (
    <span
      title={word}
      aria-label={`Injury designation: ${word}`}
      className={cx('inline-flex h-[22px] shrink-0 items-center rounded-[4px] bg-v3-warnWash px-1.5 font-figure text-[12px] font-bold uppercase tracking-[0.06em] text-v3-warn', className)}
    >
      {full ? word : code}
    </span>
  )
}

/* Past real ADP: no draft has ever taken this player, and the board orders
   him by Sleeper's own depth order instead (extend_deep_bench()). The same
   fact production marks with a DEEP badge. */
export function DeepTag({ className = '' }) {
  return (
    <span
      title="Past real ADP — no draft has ever taken this player"
      className={cx('inline-flex h-[22px] shrink-0 items-center rounded-[4px] border border-v3-rule bg-v3-sheet px-1.5 font-figure text-[12px] font-bold uppercase tracking-[0.1em] text-v3-ink3', className)}
    >
      Deep
    </span>
  )
}

export function RookieTag({ className = '' }) {
  return (
    <span className={cx('inline-flex h-[22px] shrink-0 items-center rounded-[4px] border border-v3-rule bg-v3-sheet px-1.5 font-figure text-[12px] font-bold uppercase tracking-[0.1em] text-v3-ink2', className)}>
      Rookie
    </span>
  )
}

/* What he has already scored today, in your connected league — a fact
   about the clock, not a value with a direction, so it takes a neutral
   chip rather than gain/cost. Nothing else on this row (proj pts, ROS pts,
   season pts) is this number; it exists only while his game is being
   played and says nothing about any of the three columns beside it. */
export function LiveTag({ points, className = '' }) {
  if (typeof points !== 'number' || !Number.isFinite(points)) return null
  return (
    <span
      title="Already scored in your connected league, as of the last refresh"
      className={cx('inline-flex h-[22px] shrink-0 items-center gap-1 rounded-[4px] bg-v3-well px-1.5 font-figure text-[12px] font-bold uppercase tracking-[0.1em] text-v3-ink2', className)}
    >
      Live {points.toFixed(1)}
    </span>
  )
}

/* Tenure — who is on the list by how long they have been in the league
   (A10). It used to be two controls for one concept: an "Every player /
   Rookies" pair of tabs floating beside the intro, and an All / Rookies /
   Vets group in the filter panel a few pixels below it. Now it is one, and
   it lives with the other filters.

   Rookies is the rookie view rather than a filter on this table, because
   that view already IS the rookie list, with more on it: what is on file
   for each first-year player and the class still in college. So on the
   index, All and Vets filter in place and Rookies is a link; on the rookie
   view, Rookies is where you are and All and Vets are links back, which
   carry the choice with them through the index's own saved preferences.
   Links where the choice is an address, buttons where it is a filter —
   same look either way. */
export const PLAYERS_PREFS = 'juke.v3.players'
const TENURE_OPTS = [
  { value: 'all', label: 'All' },
  { value: 'rookie', label: 'Rookies' },
  { value: 'vet', label: 'Vets' },
]
function presetTenure(t) {
  try {
    const raw = sessionStorage.getItem(PLAYERS_PREFS)
    const p = raw ? JSON.parse(raw) : {}
    sessionStorage.setItem(PLAYERS_PREFS, JSON.stringify({ ...p, tenure: t }))
  } catch { /* private mode: the index opens on All, which is still right */ }
}
export function TenureControl({ current, onChange }) {
  const onRookies = current === 'rookie'
  const seg = (on) => cx(
    TOUCH,
    'inline-flex min-h-[36px] items-center rounded-[4px] px-3 font-figure text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call',
    on ? 'bg-v3-band text-white' : 'text-v3-ink2 hover:text-v3-ink',
  )
  return (
    <div role="group" aria-label="Tenure" className="inline-flex rounded-[6px] border border-v3-rule bg-v3-sheet p-[3px]">
      {TENURE_OPTS.map((o) => {
        const on = o.value === current
        if (o.value === 'rookie') {
          return <a key={o.value} href="#/players/rookies" aria-current={on ? 'page' : undefined} className={seg(on)}>{o.label}</a>
        }
        if (onRookies) {
          return <a key={o.value} href="#/players" onClick={() => presetTenure(o.value)} className={seg(false)}>{o.label}</a>
        }
        return <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)} className={seg(on)}>{o.label}</button>
      })}
    </div>
  )
}

/* A row of toggle chips — positions, mostly. Chosen is ink (state), never
   cobalt (action). 44px targets. */
export function Chips({ label, options, value, onChange, className = '' }) {
  return (
    <div role="group" aria-label={label} className={cx('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] border px-3 font-figure text-[13px] font-bold uppercase tracking-[0.06em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call',
              on ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet text-v3-ink2 hover:border-v3-ink3 hover:text-v3-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* A labelled native select. 16px text so iOS does not zoom on focus
   (CLAUDE.md: every field is 16px on a touch screen). */
export function SelectField({ id, label, value, onChange, children, className = '' }) {
  return (
    <label htmlFor={id} className={cx('relative grid gap-1', className)}>
      <Label>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] w-full cursor-pointer appearance-none rounded-[6px] border border-v3-rule bg-v3-sheet pl-3 pr-9 font-figure text-[13px] font-semibold uppercase tracking-[0.06em] text-v3-ink transition-colors duration-150 hover:border-v3-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call [@media(pointer:coarse)]:text-[16px]"
      >
        {children}
      </select>
      <Icon name="arrow" className="pointer-events-none absolute bottom-[14px] right-3 h-4 w-4 rotate-90 text-v3-ink2" />
    </label>
  )
}

/* A 0–100 reading on five segments, filled in ink — a neutral quantity,
   so neither gain nor cost. The label beside it is the engine's own word. */
export function Meter({ value }) {
  const filled = value === null || value === undefined ? 0 : Math.round(value / 20)
  return (
    <div className="flex gap-1" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={cx('h-2 flex-1 rounded-[2px]', i < filled ? 'bg-v3-ink2' : 'bg-v3-well')} />
      ))}
    </div>
  )
}

/* One figure with its name above it, for the strips that summarise a page.
   `tone` is the caller's, for the rare value whose direction means
   something. */
export function FigCell({ label, children, sub, className = '' }) {
  return (
    <div className={cx('min-w-0', className)}>
      <dt><Label className="text-[12px]">{label}</Label></dt>
      <dd className="mt-1 font-figure text-[22px] font-bold leading-none tabular-nums text-v3-ink">{children}</dd>
      {sub && <dd className="mt-1 truncate text-[12px] text-v3-ink3">{sub}</dd>}
    </div>
  )
}
