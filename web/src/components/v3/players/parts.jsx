import { useEffect, useRef, useState } from 'react'
import { Icon, Label, TOUCH, cx, useDialogFocus } from '../ui.jsx'
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
/* `scroll` makes the row one line that scrolls sideways instead of wrapping.
   Seven position chips wrap to two rows at 390px, and two rows of chips
   above a list is the list starting a chip-row lower for a control most
   readers leave on ALL. A scroller is what the overflow sweep already
   accepts as a legitimate answer to "wider than its box" — the condition is
   that it can scroll OR ellipsise, and this can.

   It does NOT bleed past its container's padding, and the first cut did.
   `-mx-4 px-4` makes the row 32px wider than the box it sits in, and a
   scroller only excuses ITS OWN overflow — every ancestor then overflows
   too, with no scroller of its own. no-sideways-leak.spec.mjs reported
   exactly that: three elements, the outermost over by 111px. The bleed was
   worth a nicety and cost the page the condition this project states as a
   rule, so it is gone. */
export function Chips({ label, options, value, onChange, scroll = false, className = '' }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        scroll ? 'no-scrollbar flex flex-nowrap gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible' : 'flex flex-wrap gap-1.5',
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[6px] border px-3 font-figure text-[13px] font-bold uppercase tracking-[0.06em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call',
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
      {/* Two lines rather than one truncated one. The strip's own caption
          note records 105px a cell at 375px, which is about seventeen
          characters -- and what shipped in it was "High · rest of se…", a
          caption cut in the middle of the horizon it exists to name. A
          clamp at two keeps the worst case bounded (the cells are a grid
          row, so the tallest sets the height for all five) while letting a
          caption that carries real arithmetic land whole. */}
      {sub && <dd className="mt-1 line-clamp-2 text-[12px] leading-[1.35] text-v3-ink3">{sub}</dd>}
    </div>
  )
}

/* ---- The filter sheet ----

   The five controls a reader changes rarely, off the list rather than
   stacked above it. Measured 19 September 2026: the Players control block
   was 514px on a 390px screen and the four things a reader came for were
   under all of it.

   NOT called `Sheet`. That name is v3's CARD — a white panel with a solid
   band — and a second, unrelated `Sheet` is the `.home` / `.avatar` /
   `initials()` collision with a component instead of a class. `FilterSheet`
   says which of the two it is.

   Here rather than in ui.jsx for kit.jsx's own stated reason: one place
   needs it. It moves up the moment a second does, and `useDialogFocus`
   already made that trip.

   ---- What it is careful about ----

   The ceiling is `dvh`, not `vh`, and the panel is capped rather than
   sized. A phone browser's URL bar shrinks the viewport as you scroll, and
   the draft room's own bottom sheet shipped a bug where the header then
   covered the drag handle by up to 31px — see CLAUDE.md's "The ceiling
   moves, and nothing re-clamped the sheet to it". `dvh` tracks that
   viewport, `max-height` lets a short sheet stay short, and the body is the
   only thing that scrolls, so the grab handle and the header can never be
   pushed under the app's own.

   It renders NOTHING until it is open. Not CSS-hidden: a dialog in the
   prerendered markup that the client then mounts differently is React #418,
   and this app has paid for that once already. Open/closed is the only
   state, false on both sides of hydration, and the phone-only decision is
   made in CSS by the caller. */
export function FilterSheet({ open, onClose, title, count, children }) {
  const panel = useRef(null)
  const closeRef = useRef(null)
  useDialogFocus(open, onClose, panel, closeRef)

  /* The page behind does not scroll while the sheet is over it. Restored to
     whatever it was rather than to '' — a hard reset would fight any other
     owner of the property, which is how a scroll lock leaves a page stuck. */
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" data-filter-sheet>
      <button type="button" aria-label="Close filters" onClick={onClose} className="absolute inset-0 bg-v3-shade/60 backdrop-blur-[2px]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex max-h-[86dvh] w-full flex-col rounded-t-[14px] border border-v3-rule bg-v3-sheet shadow-[0_-18px_40px_rgb(var(--v3-shade)/0.35)] focus:outline-none sm:max-w-[440px] sm:rounded-[10px]"
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-v3-rule sm:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-v3-rule px-4 py-3">
          <h2 className="font-figure text-[12px] font-bold uppercase tracking-[0.12em] text-v3-ink3">
            {title}{count ? <span className="ml-2 text-v3-ink2">· {count} set</span> : null}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={cx(TOUCH, '-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-[6px] text-v3-ink2 hover:text-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call')}
          >
            <span className="sr-only">Close filters</span>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {/* The only scroller. pb for the home indicator on a phone. */}
        <div className="grid min-h-0 gap-4 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">{children}</div>
      </div>
    </div>
  )
}

/* The band's way in. On the band, so white-on-band rather than the page's
   inks, and it carries the count for the same reason the fold it replaces
   did: shut is still informative. */
export function FilterButton({ onClick, count, controls, expanded, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={count ? `Filters, ${count} set` : 'Filters'}
      data-filters-open
      className={cx(
        TOUCH,
        'inline-flex min-h-[32px] items-center gap-1.5 rounded-[6px] border border-white/25 px-2.5 font-figure text-[12px] font-bold uppercase tracking-[0.08em] text-white transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
      {/* The word is for a screen reader only. The band has 358px and three
          things wanting it, and spelling "FILTERS" out cost the band's own
          code its last six characters — "REST OF SEASON · HA…", which is
          the summary failing at the one job this arrangement gives it. A
          filter glyph with a count beside it is the same control and the
          same affordance, and it is what every app this was measured
          against uses. */}
      <span className="sr-only">Filters</span>
      {count ? <span aria-hidden="true" className="font-bold">{count}</span> : null}
    </button>
  )
}
