import { useEffect, useRef, useState } from 'react'
import { INJURY_META } from '../../draftRoomPositions.js'
import { Label, cx } from '../ui.jsx'
import { PRESS, SPRING, motion } from '../motion.jsx'

/* Focus for the live room's dialogs — the menu, the Call sheet, the player
   drawer — which can stack: a phone opens a player FROM the Call sheet.

   v2's useDialogFocus answers Esc with stopPropagation() on a window
   listener, which stops nothing registered on the same window, so one Esc
   closed every open dialog at once. Here the dialogs form a stack and only
   the one on top handles Esc and the Tab trap; the one beneath takes over
   when it closes, and focus goes back to whatever opened each. */
const dialogStack = []
export function useDialogFocus(open, onClose, panelRef, initialRef) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return undefined
    const me = {}
    dialogStack.push(me)
    const opener = document.activeElement
    const t = setTimeout(() => {
      const el = (initialRef && initialRef.current) || panelRef.current
      if (el && el.focus) el.focus()
    }, 0)
    const onKey = (e) => {
      if (dialogStack[dialogStack.length - 1] !== me) return
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return }
      if (e.key !== 'Tab' || !panelRef.current) return
      const f = [...panelRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter((n) => n.offsetParent !== null)
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (!panelRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); return }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      const i = dialogStack.indexOf(me)
      if (i >= 0) dialogStack.splice(i, 1)
      if (opener && opener.focus && document.contains(opener)) requestAnimationFrame(() => opener.focus())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}

/* The draft area's own small parts, in the call-sheet idiom. Presentation
   only — every figure any of the four draft pages prints is asked of
   window.JukeEngine. These live here rather than in ui.jsx because only the
   draft pages need them (a switch, a stepper, a queue star, a row-rank
   Draft button, extra stroke glyphs); ui.jsx is not ours to edit.

   The colour rules are ui.jsx's, restated where they bite:
     cobalt  the ONE primary action of a view — the Draft button on Juke's
             pick when it is your turn, Start on the launcher. A row's Draft
             button is ink outline, because two hundred cobalt buttons is
             wallpaper that out-shouts the one that is the recommendation.
     ink     chosen: a pressed option, the selected tab, your seat.
     warn    caution: a refusal, an urgent clock, an injury, a likely-gone.
     gain/cost  a value's direction, only ever through <Delta>. */

export const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call focus-visible:ring-offset-1 focus-visible:ring-offset-v3-sheet'

const PATHS = {
  play: 'M8 5.5v13l10-6.5z',
  pause: 'M8.5 5.5v13M15.5 5.5v13',
  sound: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11',
  mute: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c.7-3.4 3.1-5.2 6-5.2s5.3 1.8 6 5.2M16 4.5a3.3 3.3 0 010 6.2M18 14.8c1.7.7 2.8 2.4 3.2 5',
  chart: 'M4 20h16M7 20v-7M12 20V6M17 20v-10',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8',
  shuffle: 'M3.5 7h4c3.6 0 4.8 10 8.4 10h4.6M17.5 13.5l3 3.5-3 3M3.5 17h4c1.4 0 2.4-1.4 3.2-3.4M13.4 10.4C14.3 8.4 15.3 7 16.8 7h3.7M17.5 4l3 3-3 3',
  cpu: 'M7 7h10v10H7zM10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5',
  person: 'M12 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM5 20c1-3.6 3.7-5.5 7-5.5s6 1.9 7 5.5',
  plus: 'M12 5.5v13M5.5 12h13',
  minus: 'M5.5 12h13',
  chevDown: 'M6 9.5l6 6 6-6',
  chevUp: 'M6 14.5l6-6 6 6',
  chevRight: 'M9.5 6l6 6-6 6',
  undo: 'M9 14.5L4.5 10 9 5.5M4.5 10h9.5a5.5 5.5 0 010 11H11',
  bell: 'M6.5 16.5V11a5.5 5.5 0 0111 0v5.5l1.5 1.5h-14zM10 20.5a2 2 0 004 0',
  keys: 'M3.5 7h17v10h-17zM7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17.5 10.5h.01M8 14h8',
  sliders: 'M5 20v-6.5M5 9.5V4M12 20v-8.5M12 7.5V4M19 20v-4.5M19 11.5V4M3 13.5h4M10 7.5h4M17 15.5h4',
  alert: 'M12 4l9 16H3zM12 10v4.5M12 17.5v.2',
  flag: 'M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11',
  external: 'M13.5 4.5H19.5V10.5M19.5 4.5l-8 8M17 14v5H5V7h5',
  target: 'M12 20a8 8 0 100-16 8 8 0 000 16zM12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M2 12h3M19 12h3',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
  compass: 'M12 21a9 9 0 100-18 9 9 0 000 18zM15.5 8.5l-2 5-5 2 2-5z',
  up: 'M6 14.5l6-6 6 6',
  down: 'M6 9.5l6 6 6-6',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4',
  download: 'M12 4v11.5M7 11l5 5 5-5M4.5 19.5h15',
  share: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M5 12.5V20h14v-7.5',
  bookmark: 'M6.5 4h11v16.5L12 16l-5.5 4.5z',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M19 12H5M11 6l-6 6 6 6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
}

export function Glyph({ name, className = 'h-5 w-5', filled = false }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  )
}

export function signed(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const r = Number(Number(n).toFixed(digits))
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(digits)}`
}

export function fmtClock(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—'
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* A refusal or caution, said in words beside whatever it stops. */
export function Problem({ text, className = '' }) {
  if (!text) return null
  return (
    <p role="status" className={cx('flex gap-2 rounded-[4px] border border-v3-warn/40 bg-v3-warnWash px-3 py-2.5 text-[14px] leading-[1.5] text-v3-warn', className)}>
      <Glyph name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </p>
  )
}

/* A switch, because flipping it changes what happens next. Ink when on —
   on is a chosen state, not an action. 44px of hit area. */
export function Switch({ checked, onChange, label, disabled, hideLabel = false, className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={hideLabel ? label : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('inline-flex min-h-[44px] items-center gap-2.5 rounded-[6px] px-1.5 text-v3-ink disabled:cursor-not-allowed disabled:text-v3-ink3', FOCUS, className)}
    >
      {!hideLabel && <span className="font-figure text-[12px] font-semibold uppercase tracking-[0.1em]">{label}</span>}
      <span className={cx('relative h-[24px] w-[42px] shrink-0 rounded-full border transition-colors', checked ? 'border-v3-band bg-v3-band' : 'border-v3-rule bg-v3-well')} aria-hidden="true">
        {/* The knob springs across on transform (motion.jsx SPRING.toggle);
            reduced motion puts it straight there. */}
        <motion.span
          initial={false}
          animate={{ x: checked ? 18 : 0 }}
          transition={SPRING.toggle}
          className={cx('absolute left-[3px] top-[3px] h-4 w-4 rounded-full', checked ? 'bg-white' : 'bg-v3-ink3')}
        />
      </span>
    </button>
  )
}

export function Stepper({ label, value, onAdd, onRemove, disabled, max = 9 }) {
  const btn = cx('grid h-10 w-10 place-items-center rounded-[4px] border border-v3-rule bg-v3-sheet text-v3-ink hover:border-v3-ink3 disabled:cursor-not-allowed disabled:bg-v3-well disabled:text-v3-ink3', FOCUS)
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <button type="button" onClick={onRemove} disabled={disabled || value <= 0} aria-label={`One fewer ${label}`} className={btn}>
        <Glyph name="minus" className="h-4 w-4" />
      </button>
      <span className="w-8 text-center font-figure text-[20px] font-bold tabular-nums text-v3-ink" aria-live="polite">{value}</span>
      <button type="button" onClick={onAdd} disabled={disabled || value >= max} aria-label={`One more ${label}`} className={btn}>
        <Glyph name="plus" className="h-4 w-4" />
      </button>
    </span>
  )
}

/* A row of options where one is chosen. Scrolls sideways rather than wraps:
   team counts and clock lengths are scales, and a wrapped scale reads as two
   groups. An unavailable option is dashed and says why when pressed. */
export function Choices({ label, options, value, onChange, disabled, onUnavailable, wide = false }) {
  return (
    <div role="group" aria-label={label} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
      {options.map((o) => {
        const on = o.key === value
        const off = o.available === false
        return (
          <button
            key={String(o.key)}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => (off ? onUnavailable && onUnavailable(o) : onChange(o.key))}
            className={cx(
              'flex min-h-[44px] shrink-0 flex-col items-center justify-center rounded-[4px] border px-3 font-figure text-[13px] font-semibold uppercase tracking-[0.05em] tabular-nums transition-colors disabled:cursor-not-allowed',
              FOCUS,
              wide ? 'min-w-[96px] flex-1' : 'min-w-[48px]',
              on ? 'border-v3-band bg-v3-band text-white'
                : off ? 'border-dashed border-v3-rule bg-v3-sheet text-v3-ink3'
                  : 'border-v3-rule bg-v3-sheet text-v3-ink2 hover:border-v3-ink3 hover:text-v3-ink',
            )}
          >
            <span>{o.label}</span>
            {o.sub && <span className={cx('mt-0.5 text-[11px] font-medium normal-case tracking-normal', on ? 'text-v3-bandInk' : 'text-v3-ink3')}>{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Headshot({ src, name, size = 32 }) {
  const [failed, setFailed] = useState(false)
  const text = (name || '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('')
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-v3-well font-figure text-[11px] font-semibold text-v3-ink2"
      style={{ width: size, height: size }}
    >
      {!failed && src ? (
        <img src={src} alt="" loading="lazy" width={size} height={size} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : text}
    </span>
  )
}

/* An injury designation in the pipeline's own codes. Caution, never a
   position hue — a Q beside a rose QB chip has to read as a different fact. */
export function InjuryTag({ code }) {
  const meta = code ? INJURY_META[code] : null
  if (!meta) return null
  return (
    <span title={meta.label} aria-label={meta.label} className="inline-grid h-[20px] min-w-[22px] shrink-0 place-items-center rounded-[3px] border border-v3-warn/40 bg-v3-warnWash px-1 font-figure text-[11px] font-bold text-v3-warn">
      {code}
    </span>
  )
}

export function DeepTag() {
  return (
    <span title="No real draft has ever taken this player — ranked by Sleeper's own depth order." className="inline-grid h-[20px] shrink-0 place-items-center rounded-[3px] border border-v3-rule bg-v3-well px-1 font-figure text-[11px] font-semibold uppercase tracking-[0.06em] text-v3-ink2">
      Deep
    </span>
  )
}

/* The queue star. Filled ink when the player is in your queue. */
export function StarButton({ on, onClick, name, className = 'h-10 w-10' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!on}
      aria-label={on ? `Remove ${name} from your queue` : `Add ${name} to your queue`}
      title={on ? 'In your queue' : 'Add to queue'}
      className={cx('grid shrink-0 place-items-center rounded-[4px] transition-colors', FOCUS, className, on ? 'text-v3-ink' : 'text-v3-ink3 hover:text-v3-ink')}
    >
      <Glyph name="star" className="h-[18px] w-[18px]" filled={!!on} />
    </button>
  )
}

/* The Draft button, in its two ranks. `call` is cobalt — the one the view is
   asking for. `row` is ink outline. Disabled carries its reason in a title
   and in the accessible name, rather than as a grey nobody reads. */
export function DraftButton({ onClick, disabled, reason, rank = 'row', size = 'md', label = 'Draft', who = '', className = '', ...rest }) {
  const dims = size === 'sm' ? 'min-h-[36px] px-3 text-[13px]' : size === 'lg' ? 'min-h-[48px] px-5 text-[15px]' : 'min-h-[40px] px-4 text-[14px]'
  const live = rank === 'call'
    ? 'bg-v3-call text-v3-onCall hover:bg-v3-callDeep'
    : 'border border-v3-ink bg-v3-sheet text-v3-ink hover:bg-v3-band hover:text-white'
  // `who` names the player when the visible label cannot (a phone's "Draft"),
  // so a screen reader hears whom the button drafts, not just the verb.
  const spoken = `${label}${who && !label.includes(who) ? ` ${who}` : ''}`
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? reason : undefined}
      aria-label={disabled && reason ? `${spoken} — ${reason}` : who ? spoken : undefined}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-[4px] font-semibold', PRESS, dims, FOCUS, disabled ? 'cursor-not-allowed border border-v3-rule bg-v3-well text-v3-ink3' : live, className)}
      {...rest}
    >
      {label}
    </button>
  )
}

/* A labelled figure: the call sheet's smallest unit of fact. */
export function Stat({ label, children, sub, className = '' }) {
  return (
    <div className={cx('min-w-0 rounded-[4px] bg-v3-paper p-3', className)}>
      <dt><Label className="text-[11px]">{label}</Label></dt>
      <dd className="mt-1 font-figure text-[20px] font-bold leading-none tabular-nums text-v3-ink">{children}</dd>
      {sub && <dd className="mt-1 truncate text-[12px] text-v3-ink3">{sub}</dd>}
    </div>
  )
}
