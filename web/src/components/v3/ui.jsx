import { useRef } from 'react'
import { POS_CHALK, CELL_INK } from '../draftRoomPositions.js'
import { useV2Data } from '../v2/v2ui.jsx'
import { THEME_CHOICES, useV3Theme } from './theme.js'
import { BarFill, CountUp, PRESS, StreamText, useReveal } from './motion.jsx'

/* Juke v3 — "Call Sheet". The shared parts every v3 page is built from.

   ---- The one idea ----

   A coach's call sheet: one laminated card, organised by situation, every
   block headed by a solid band, every entry a call you could make with the
   reason printed beside it. Juke's whole claim is that a call comes with its
   arithmetic, so the sheet is the page and the band is the unit.

   ---- Four colours, four jobs, no overlap ----

     call  (#1F3FE0)  do this. The primary action of a view, and nothing else.
     ink   (#0C1422)  chosen. A selected tab, segment or row — state, not action.

     gain / cost      a value's direction. Never a button, never a heading.
     chalk            a position. The product's own POS_CHALK, the one hue
                      reference every screen reads, with CELL_INK on it.

   Those are the light values. Every colour is a --v3-* variable (index.css)
   with a dark value beside it, so no component names a hex: a class names
   the job and the theme picks the value. The two rules a new component has
   to keep: white text only on the band (dark in both themes), and a call
   button's text is text-v3-onCall, never white.

   Production spends teal on actions; v2 spent volt on actions AND on good
   numbers. v3 separates all four, so a colour on this page can only mean
   one thing. Contrast for every pair is in tailwind.config.js beside the
   tokens, measured on all three grounds.

   ---- What is borrowed, and why ----

   useEngineData is v2's useV2Data, re-exported rather than rewritten: it is
   not visual (it re-reads the engine on juke:data-loaded and juke:header
   behind a change key), and a second copy of that guard would drift. Nothing
   visual is taken from v2. */

export const useEngineData = useV2Data

export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

/* ---- The type scale ----

   Eight steps, and a new rule picks one of them rather than a number that
   looked right in the box it was written for:

     11  the LIVE DRAFT BOARD only, where 12 will not fit. Everywhere
         else it is retired: 110 instances across the content pages went
         to 12 on 17 September 2026, because 11px carrying meaning is
         below the floor a reader should be asked to work at and the tier
         had drifted rather than been chosen — Record had "ahead of 8 of
         9" at 12 and "lineup over repl." at 11 inside one card. It is
         kept on the board because those cells are a GRID sized around
         the label, so raising it there trades legibility for density on
         the one screen whose density is the product
     12  Label -- the standard uppercase label, and the commonest step here
     13  meta and secondary text: a caption, a sub-line, a note
     15  BODY. The default for anything a person reads a sentence of
     18  a lede, and the largest body step
     20  a block title (Headline size="block")
     24 / 28 / 34   figures, by how much room the number has earned
     clamp()  the two Headline steps, which scale with the viewport

   16px survives in exactly one place: a form FIELD, because iOS zooms the
   page in on any field smaller than that and does not zoom back out.
   style.css carries the same floor under `(pointer: coarse)`. Never shrink
   one, and a new field is 16.

   Measured 15 September 2026: v3 had 26 distinct sizes, and SIX of them
   (13, 14, 15, 16, 17, 18) were prose, spanning five pixels. Every one was
   defensible where it was written and the set was not -- which is exactly
   what style.css's own scale note already records about the legacy side,
   arrived at a second time from a clean start. 14, 17, 19, 26, 30, 32 and
   36 are gone (269 occurrences), prose is 13 / 15 / 18, and a page now
   renders 7 to 12 distinct sizes against 9 to 14.

   What is deliberately NOT collapsed: 22 and 24 both survive as figure
   steps, and the live draft keeps its own large display sizes (40 to 132)
   because a clock and a pick number on a board are sized to the board.

   ---- Which of the two faces a thing is set in ----

   font-figure (Inconsolata) is for a FIGURE or a CODE: a number, a pick,
   a clock, a team abbreviation, FINAL, a formula, a tracked-out label like
   the ones on a band. Those want one width per character so a column of
   them lines up, and they are read as marks rather than as sentences.

   font-sheet (Schibsted Grotesk) is the reading face, and it is the v3
   root's own default -- so PROSE gets it by writing no font class at all.
   A sub-line under a call ("points this week", "both sides priced over
   replacement"), a promise ("Read-only: Juke never edits your league"),
   anything that is a sentence: leave the face alone.

   The line is what the words ARE, not how small they are. Both faces are
   used at 12px, and a 12px sentence in a mono face is the harder of the
   two to read, not the more precise-looking one -- Inconsolata's x-height
   is smaller and its even widths remove the word-shapes a reader scans by.
   A mono face on prose is also one of the commonest tells of a generated
   page, which is the other half of why the split is worth keeping.

   Measured 15 September 2026: ten places had a sentence in the figure
   face, one of them (the League demo's read-only line) additionally set in
   tracked-out caps. The board's own codes -- "NE", "at", "FINAL", the
   college-and-club meta, every draft setting under its big number -- were
   correct throughout and are deliberately untouched. */

/* A small uppercase label in the figure face. The page's quietest type,
   never lighter than ink3 (5.2:1 on the darkest ground). */
/* Rest props are forwarded, so a caller can put an id or a data-* on a
   Label without wrapping it in a second element. That is what
   data-hero-eyebrow needs on both Now heroes: an attribute says what an
   element IS, and the alternative here was a wrapper span that exists only
   to carry one. */
/* `tier="page"` is the eyebrow ABOVE a page's h1, and it is the only place
   a Label is large. At 12px it read as a caption stuck to the headline — a
   thing to skip rather than the first line of the sentence the page is
   making. At 24/26 in the accent it is part of the composition, and it
   carries the orientation the headline does not.

   Deliberately NOT a change to the default. There are several hundred
   Labels in v3 and almost all are exactly what they should be: a quiet
   uppercase key beside a figure. Raising the tier globally would be
   shouting in every card on the site. */
const LABEL_TIER = {
  default: 'text-[12px] tracking-[0.12em] text-v3-ink3',
  page: 'text-[24px] leading-[1.1] tracking-[0.06em] text-v3-call sm:text-[26px]',
}
export function Label({ children, className = '', as: Tag = 'span', tier = 'default', ...rest }) {
  return (
    <Tag {...rest} className={cx('font-figure font-semibold uppercase', LABEL_TIER[tier] || LABEL_TIER.default, className)}>
      {children}
    </Tag>
  )
}

/* A figure. Every number on a v3 page goes through this or Delta, so every
   number is the same face and lines up in a column. */
export function Fig({ children, className = '' }) {
  return <span className={cx('font-figure tabular-nums', className)}>{children}</span>
}

/* A signed value, coloured by direction and never by whether it is good for
   the reader — that is the caller's job via `tone`, because "up" and "good"
   point opposite ways for points against. A dash for a missing value. */
export function Delta({ value, digits = 0, unit = '', tone, className = '', count = false }) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={cx('font-figure text-v3-ink3', className)}>—</span>
  }
  const n = Number(value)
  const rounded = Number(n.toFixed(digits))
  const t = tone || (rounded > 0 ? 'gain' : rounded < 0 ? 'cost' : 'even')
  const color = t === 'gain' ? 'text-v3-gain' : t === 'cost' ? 'text-v3-cost' : 'text-v3-ink'
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  // `count`: the magnitude ticks up under its FINAL sign and colour — the
  // direction is the fact, and it is never shown flipping on the way.
  return (
    <span className={cx('font-figure font-semibold tabular-nums', color, className)}>
      {sign}{count ? <CountUp value={Math.abs(rounded)} format={(v) => v.toFixed(digits)} /> : Math.abs(rounded).toFixed(digits)}{unit && <span className="ml-0.5 font-medium">{unit}</span>}
    </span>
  )
}

/* A position, in the product's own chalk with its own ink. Solid rather than
   a tint: v3 is light, and a chalk fill on white is the board's own cell. */
export function PosTag({ pos, className = '' }) {
  const bg = POS_CHALK[pos] || '#D5DBE3'
  return (
    <span
      className={cx('inline-flex h-[22px] min-w-[34px] shrink-0 items-center justify-center rounded-[4px] px-1.5 font-figure text-[12px] font-bold tracking-[0.04em]', className)}
      style={{ background: bg, color: CELL_INK }}
    >
      {pos === 'DST' ? 'D/ST' : pos}
    </span>
  )
}

/* The signature unit: a white sheet with a solid ink band across its top.
   `code` is the band's left text (what situation this block is), `aside` the
   right. A sheet without a band is allowed — `band={false}` — for the plain
   white panels a page needs between the called blocks. */
export function Sheet({ code, aside, band = true, children, className = '', bodyClass = 'p-4 sm:p-5', as: Tag = 'section', codeAs: CodeTag = 'h2', rise = true, ...rest }) {
  // A Sheet rises once on ARRIVAL -- a route change plays the new page's
  // first viewport (motion.jsx useReveal). One in view on a cold load is
  // simply there, and so is one below the fold: sections do not rise as
  // they scroll past. `rise={false}` for a Sheet that is re-mounted as a
  // control changes, where a rise would read as a reload rather than an
  // arrival.
  const ref = useRef(null)
  useReveal(ref, { disabled: !rise })
  return (
    <Tag ref={ref} className={cx('overflow-hidden rounded-[6px] border border-v3-rule bg-v3-sheet', className)} {...rest}>
      {band && (code || aside) && (
        <div className="flex min-h-[38px] items-center justify-between gap-3 bg-v3-band px-4 text-white">
          {/* The band's code IS the section's heading — it was a span, so
              five pages carried one heading between them and nothing could
              be jumped to. The tag changes and the styling does not. */}
          <CodeTag className="min-w-0 truncate font-figure text-[12px] font-bold uppercase tracking-[0.14em]">{code}</CodeTag>
          {aside && <span className="shrink-0 font-figure text-[12px] uppercase tracking-[0.1em] text-v3-bandInk">{aside}</span>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </Tag>
  )
}

const BTN = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[6px] px-5 text-[15px] font-semibold ' + PRESS + ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call focus-visible:ring-offset-2 focus-visible:ring-offset-v3-paper disabled:cursor-not-allowed disabled:opacity-100'

/* The one primary action of a view. Cobalt, with its own ink: white in
   light (7.4:1) and near-black in dark (7.1:1). */
export function CallButton({ href, onClick, children, className = '', disabled = false, ...rest }) {
  const cls = cx(BTN, disabled ? 'bg-v3-well text-v3-ink3' : 'bg-v3-call text-v3-onCall hover:bg-v3-callDeep', className)
  if (href && !disabled) return <a href={href} className={cls} {...rest}>{children}</a>
  return <button type="button" onClick={onClick} disabled={disabled} className={cls} {...rest}>{children}</button>
}

/* Everything else a person can press. White, ink text, a rule border. */
export function QuietButton({ href, onClick, children, className = '', ...rest }) {
  const cls = cx(BTN, 'border border-v3-rule bg-v3-sheet text-v3-ink hover:border-v3-ink3 hover:bg-v3-paper', className)
  if (href) return <a href={href} className={cls} {...rest}>{children}</a>
  return <button type="button" onClick={onClick} className={cls} {...rest}>{children}</button>
}

/* An inline text link that goes somewhere. Ink with an underline, so it is
   never mistaken for the cobalt action.

   TOUCH is the 44px floor, and it only applies to a coarse pointer: this
   link is a 21px line of type, which is a fine mouse target and half a
   finger. Growing it for everybody would put 23px of dead space under every
   inline link on the page, so the rule is scoped the way style.css already
   scopes its 16px field rule -- a floor under the design on the devices that
   need it, and nothing at all on a desktop. */
export const TOUCH = '[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]'

/* HIT is TOUCH for a link inside a row, where the control cannot grow: a
   player's name sits on one line with his club on the next, so a 44px
   minimum would push the two apart and change the table. This leaves the
   type where it is and gives the finger a 44px-tall box over it, drawn by a
   pseudo-element so it costs no layout. Horizontally it is the link's own
   width, so it never reaches the row's other controls. */
export const HIT = "relative [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:inset-x-0 [@media(pointer:coarse)]:after:top-1/2 [@media(pointer:coarse)]:after:h-[44px] [@media(pointer:coarse)]:after:min-w-[44px] [@media(pointer:coarse)]:after:-translate-y-1/2 [@media(pointer:coarse)]:after:content-['']"

export function GoLink({ href, children, className = '' }) {
  return (
    <a href={href} className={cx(TOUCH, 'inline-flex items-center gap-1.5 text-[15px] font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink', className)}>
      {children} <Icon name="arrow" className="h-3.5 w-3.5" />
    </a>
  )
}

/* A segmented choice. The chosen option is INK, not cobalt: choosing is
   state, and cobalt is reserved for doing. aria-pressed on every option. */
export function Seg({ label, options, value, onChange, className = '' }) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex rounded-[6px] border border-v3-rule bg-v3-sheet p-[3px]', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              TOUCH,
              'min-h-[36px] rounded-[4px] px-3 font-figure text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call',
              on ? 'bg-v3-band text-white' : 'text-v3-ink2 hover:text-v3-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* Light, dark or the device's own setting, as a Seg. For the places with
   room to label a control: the Account page and the live draft's menu. The
   top bar carries the compact version (ThemeMenu in V3App), and all three
   read and write one store, so changing it anywhere changes it everywhere. */
export function ThemeChoice({ className = '' }) {
  const { choice, setChoice } = useV3Theme()
  return <Seg label="Theme" options={THEME_CHOICES} value={choice} onChange={setChoice} className={className} />
}

/* A headline. Sentence case, upright, heavy — the opposite of both earlier
   builds' italic caps. `size` picks a step on one scale. */
const H = { page: 'text-[clamp(2.5rem,5vw,4.875rem)] leading-[0.98]', section: 'text-[clamp(1.6rem,3vw,2.25rem)] leading-[1.05]', block: 'text-[20px] leading-[1.2]' }
export function Headline({ children, size = 'page', as: Tag = 'h1', className = '', ...rest }) {
  return (
    <Tag className={cx('font-sheet font-black tracking-[-0.025em] text-v3-ink [text-wrap:balance]', H[size], className)} {...rest}>
      {children}
    </Tag>
  )
}

/* The page opening every v3 page shares: a label, a headline, a lede, and an
   optional right-hand slot for the page's own action. */
/* The lede is written in live when it is a short plain sentence (motion.jsx
   StreamText: under ~25 words and no figures), and rises as a block when it
   is longer — never on a cold load, where it is simply there. A lede that IS
   data (a record, a rank, the arithmetic of a call) carries digits and so is
   never streamed. */
export function PageHead({ label, title, lede, action }) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-[860px]">
        {label && <Label tier="page" as="p">{label}</Label>}
        {/* 24ch holds the headline to about three lines at the top of its
            clamp — a team name is user-generated, and a long one must not
            push the first card off the screen. */}
        <Headline className={cx('max-w-[24ch] [text-wrap:balance]', label ? 'mt-3' : '')}>{title}</Headline>
        {lede && <StreamText as="p" text={lede} className="mt-4 max-w-[62ch] text-[18px] leading-[1.55] text-v3-ink2" />}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  )
}

export function Skeleton({ lines = 4, className = '' }) {
  return (
    <div className={cx('space-y-3', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded-[4px] bg-v3-well" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  )
}

/* A horizontal value bar. `max` is the scale the caller chose; a negative
   value draws leftward from a zero axis when `zero` is set. Colour follows
   the value's direction; `tone` overrides for a neutral quantity. */
export function ValueBar({ value, max, zero = false, tone, className = '' }) {
  if (value === null || value === undefined || !max) return <div className={cx('h-2 rounded-full bg-v3-well', className)} />
  const pct = Math.min(1, Math.abs(value) / max) * (zero ? 50 : 100)
  const t = tone || (value >= 0 ? 'gain' : 'cost')
  const fill = t === 'gain' ? 'bg-v3-gain' : t === 'cost' ? 'bg-v3-cost' : t === 'call' ? 'bg-v3-call' : 'bg-v3-ink2'
  const style = zero
    ? value >= 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }
    : { left: 0, width: `${pct}%` }
  // The fill grows from the axis it is measured from, on transform only, in
  // step with the figure beside it (motion.jsx BarFill).
  return (
    <div className={cx('relative h-2 overflow-hidden rounded-full bg-v3-well', className)}>
      {zero && <span className="absolute inset-y-0 left-1/2 w-px bg-v3-ink3" aria-hidden="true" />}
      <BarFill width={pct} origin={zero && value < 0 ? 'right' : 'left'} className={cx('absolute inset-y-0 rounded-full', fill)} style={style} />
    </div>
  )
}

/* Stroke icons, 1.6 stroke, currentColor. Never an emoji. */
const PATHS = {
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4',
  moon: 'M20.5 14.2A8.5 8.5 0 119.8 3.5a6.6 6.6 0 0010.7 10.7z',
  device: 'M3.5 5h17v11h-17zM8.5 20.5h7M12 16v4.5',
  now:'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 100 8 4 4 0 000-8z',
  league: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4a3 3 0 003 3M17 6h3a3 3 0 01-3 3',
  players: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 3.5a4 4 0 010 7M22 21a7 7 0 00-4-6.3',
  draft: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  record: 'M12 7v5l3 2M3 12a9 9 0 1018 0 9 9 0 00-18 0z',
  account: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3',
  check: 'M5 12.5l4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  lineup: 'M4 6h16M4 12h10M4 18h6M18 14l3 3-3 3',
  wire: 'M4 12h4l3-7 3 14 3-7h3',
  trade: 'M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  clock: 'M12 7v5l3 2M3 12a9 9 0 1018 0 9 9 0 00-18 0z',
  info: 'M12 16v-5M12 8h.01M3 12a9 9 0 1018 0 9 9 0 00-18 0z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
}
export function Icon({ name, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  )
}

export function ordinal(n) {
  const r = n % 100
  if (r >= 11 && r <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
}
