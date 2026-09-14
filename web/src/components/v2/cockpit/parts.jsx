import { useState } from 'react'
import { INJURY_META } from '../../draftRoomPositions.js'
import { PosChip, posColor } from '../v2ui.jsx'

/* Small, shared pieces of the cockpit. Presentation only. */

export const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt'

export function Headshot({ src, name, pos, size = 32, initials }) {
  const [failed, setFailed] = useState(false)
  const text = initials || (name || '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('')
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-v2-raised font-mono text-[10px] font-semibold text-v2-ink2"
      style={{ width: size, height: size, boxShadow: pos ? `0 0 0 1.5px ${posColor(pos)}66` : undefined }}
    >
      {!failed && src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className={'h-full w-full ' + (pos === 'DST' ? 'object-contain p-1' : 'object-cover')}
        />
      ) : (
        text
      )}
    </span>
  )
}

/* An injury designation in the pipeline's own codes. Its tone is the loss
   or warn token, never a position hue — a Q beside a rose QB chip has to
   read as a different kind of fact. */
export function InjuryTag({ code }) {
  const meta = code ? INJURY_META[code] : null
  if (!meta) return null
  const serious = code === 'O' || code === 'IR' || code === 'D'
  return (
    <span
      title={meta.label}
      className={`inline-grid h-[18px] min-w-[20px] place-items-center rounded-[4px] px-1 font-mono text-[10px] font-semibold ring-1 ring-inset ${
        serious ? 'bg-v2-loss/10 text-v2-loss ring-v2-loss/30' : 'bg-v2-warn/10 text-v2-warn ring-v2-warn/30'
      }`}
    >
      {code}
    </span>
  )
}

export function DeepTag() {
  return (
    <span
      title="No real draft has ever taken this player — ranked by Sleeper's own depth order."
      className="inline-grid h-[18px] place-items-center rounded-[4px] bg-white/[0.04] px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-v2-ink3 ring-1 ring-inset ring-white/[0.1]"
    >
      Deep
    </span>
  )
}

export { PosChip }

/* A switch, not a checkbox: flipping it changes what the draft does next,
   so it announces its state as on/off. 44px of hit area around a smaller
   visual track. */
export function Switch({ checked, onChange, label, disabled, compact }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={compact ? label : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`group inline-flex min-h-[44px] items-center gap-2.5 rounded-[10px] px-2 text-[12px] font-medium transition-colors ${FOCUS} ${
        disabled ? 'cursor-not-allowed text-v2-ink3' : 'text-v2-ink2 hover:text-v2-ink'
      }`}
    >
      {!compact && <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]">{label}</span>}
      <span
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full ring-1 ring-inset transition-colors ${
          checked ? 'bg-v2-volt ring-v2-volt' : 'bg-white/[0.06] ring-white/[0.14]'
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-[3px] h-4 w-4 rounded-full transition-[left] duration-150 ${checked ? 'left-[19px] bg-v2-voltInk' : 'left-[3px] bg-v2-ink2'}`}
        />
      </span>
    </button>
  )
}

export function IconButton({ label, onClick, children, pressed, disabled, className = '', ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      {...rest}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-v2-ink2 ring-1 ring-inset ring-white/[0.1] transition-colors hover:bg-white/[0.04] hover:text-v2-ink disabled:cursor-not-allowed disabled:text-v2-ink3 disabled:hover:bg-transparent ${FOCUS} ${className}`}
    >
      {children}
    </button>
  )
}

/* The Draft button, in two ranks.

   `primary` is volt: the one thing a view is asking for — Juke's pick on
   your turn, the lead card on Decide. `row` is an ink outline for the
   button repeated on every player in a list: two hundred volt buttons is
   wallpaper, and it would out-shout the one that is actually the
   recommendation. The split is by rank, not by whether it does something —
   CLAUDE.md's own `.draft-btn` argument, carried over.

   Disabled carries its reason in a title rather than a grey nobody reads. */
export function DraftButton({ onClick, disabled, reason, size = 'md', variant = 'row', className = '', label = 'Draft' }) {
  const dims = size === 'sm' ? 'min-h-[34px] px-3 text-[12px]' : size === 'lg' ? 'min-h-[48px] px-5 text-[15px]' : 'min-h-[40px] px-4 text-[13px]'
  const live =
    variant === 'primary'
      ? 'bg-v2-volt text-v2-voltInk shadow-[0_0_0_1px_rgba(0,255,102,0.3),0_6px_20px_-8px_rgba(0,255,102,0.6)] hover:-translate-y-px active:translate-y-0'
      : 'text-v2-ink ring-1 ring-inset ring-white/[0.2] hover:bg-white/[0.06] hover:ring-white/[0.34]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? reason : undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-[9px] font-semibold transition-[transform,background-color] duration-150 ${dims} ${FOCUS} ${
        disabled ? 'cursor-not-allowed text-v2-ink3 ring-1 ring-inset ring-white/[0.07]' : live
      } ${className}`}
    >
      {label}
    </button>
  )
}

export function StarButton({ on, onClick, name, size = 'h-9 w-9' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from your queue` : `Add ${name} to your queue`}
      title={on ? 'In your queue' : 'Add to queue'}
      className={`grid ${size} shrink-0 place-items-center rounded-[8px] transition-colors ${FOCUS} ${
        // Cyan is "yours" across the cockpit — your column on the board,
        // your queue — so a starred player reads as one of your marks
        // rather than as a caution (warn) or a selection (volt).
        on ? 'text-v2-cyan' : 'text-v2-ink3 hover:text-v2-ink'
      }`}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M8 1.9l1.85 3.77 4.15.6-3 2.93.7 4.13L8 11.4l-3.7 1.93.7-4.13-3-2.93 4.15-.6z" />
      </svg>
    </button>
  )
}

export function Panel({ children, className = '', as: As = 'section', ...rest }) {
  return (
    <As className={`rounded-[18px] bg-v2-panel ring-1 ring-inset ring-white/[0.07] ${className}`} {...rest}>
      {children}
    </As>
  )
}

export function fmtClock(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—'
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
