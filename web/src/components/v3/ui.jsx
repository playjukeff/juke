import { POS_CHALK, CELL_INK } from '../draftRoomPositions.js'
import { useV2Data } from '../v2/v2ui.jsx'

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

/* A small uppercase label in the figure face. The page's quietest type,
   never lighter than ink3 (5.2:1 on the darkest ground). */
export function Label({ children, className = '', as: Tag = 'span' }) {
  return (
    <Tag className={cx('font-figure text-[12px] font-semibold uppercase tracking-[0.12em] text-v3-ink3', className)}>
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
export function Delta({ value, digits = 0, unit = '', tone, className = '' }) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={cx('font-figure text-v3-ink3', className)}>—</span>
  }
  const n = Number(value)
  const rounded = Number(n.toFixed(digits))
  const t = tone || (rounded > 0 ? 'gain' : rounded < 0 ? 'cost' : 'even')
  const color = t === 'gain' ? 'text-v3-gain' : t === 'cost' ? 'text-v3-cost' : 'text-v3-ink'
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  return (
    <span className={cx('font-figure font-semibold tabular-nums', color, className)}>
      {sign}{Math.abs(rounded).toFixed(digits)}{unit && <span className="ml-0.5 font-medium">{unit}</span>}
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
export function Sheet({ code, aside, band = true, children, className = '', bodyClass = 'p-4 sm:p-5', as: Tag = 'section', ...rest }) {
  return (
    <Tag className={cx('overflow-hidden rounded-[6px] border border-v3-rule bg-v3-sheet', className)} {...rest}>
      {band && (code || aside) && (
        <div className="flex min-h-[38px] items-center justify-between gap-3 bg-v3-band px-4 text-white">
          <span className="min-w-0 truncate font-figure text-[12px] font-bold uppercase tracking-[0.14em]">{code}</span>
          {aside && <span className="shrink-0 font-figure text-[12px] uppercase tracking-[0.1em] text-v3-bandInk">{aside}</span>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </Tag>
  )
}

const BTN = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[6px] px-5 text-[15px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call focus-visible:ring-offset-2 focus-visible:ring-offset-v3-paper disabled:cursor-not-allowed disabled:opacity-100'

/* The one primary action of a view. Cobalt, white text (7.4:1). */
export function CallButton({ href, onClick, children, className = '', disabled = false, ...rest }) {
  const cls = cx(BTN, disabled ? 'bg-v3-well text-v3-ink3' : 'bg-v3-call text-white hover:bg-v3-callDeep', className)
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
   never mistaken for the cobalt action. */
export function GoLink({ href, children, className = '' }) {
  return (
    <a href={href} className={cx('inline-flex items-center gap-1.5 text-[14px] font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink', className)}>
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
              'min-h-[34px] rounded-[4px] px-3 font-figure text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call',
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

/* A headline. Sentence case, upright, heavy — the opposite of both earlier
   builds' italic caps. `size` picks a step on one scale. */
const H = { page: 'text-[clamp(2.4rem,5.2vw,4.25rem)] leading-[0.98]', section: 'text-[clamp(1.6rem,3vw,2.25rem)] leading-[1.05]', block: 'text-[20px] leading-[1.2]' }
export function Headline({ children, size = 'page', as: Tag = 'h1', className = '', ...rest }) {
  return (
    <Tag className={cx('font-sheet font-black tracking-[-0.025em] text-v3-ink [text-wrap:balance]', H[size], className)} {...rest}>
      {children}
    </Tag>
  )
}

/* The page opening every v3 page shares: a label, a headline, a lede, and an
   optional right-hand slot for the page's own action. */
export function PageHead({ label, title, lede, action }) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-[760px]">
        {label && <Label>{label}</Label>}
        <Headline className="mt-2">{title}</Headline>
        {lede && <p className="mt-4 max-w-[62ch] text-[17px] leading-[1.55] text-v3-ink2">{lede}</p>}
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
  return (
    <div className={cx('relative h-2 overflow-hidden rounded-full bg-v3-well', className)}>
      {zero && <span className="absolute inset-y-0 left-1/2 w-px bg-v3-ink3" aria-hidden="true" />}
      <span className={cx('absolute inset-y-0 rounded-full', fill)} style={style} />
    </div>
  )
}

/* Stroke icons, 1.6 stroke, currentColor. Never an emoji. */
const PATHS = {
  now: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 100 8 4 4 0 000-8z',
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
