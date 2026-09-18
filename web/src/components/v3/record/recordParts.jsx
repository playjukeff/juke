import { useEffect, useRef, useState } from 'react'
import { VERDICTS } from '../../ledger/verdicts.js'
import { Label, cx } from '../ui.jsx'
import { SYNC_TEXT } from './recordKit.js'

/* Parts the Record, Account and Method pages share and ui.jsx does not
   carry. Written here rather than added to ui.jsx, which belongs to the
   shell; each is the v3 idiom (rule borders, figure face, the four colour
   jobs) and nothing else. */

/* Stroke icons ui.jsx does not have, drawn to the same 1.6 stroke. */
const MORE = {
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  plus: 'M12 5v14M5 12h14',
  logout: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  chevron: 'M6 9l6 6 6-6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  warn: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  device: 'M4 5h16v11H4zM2 19h20',
  cloud: 'M7 18a5 5 0 01-.6-10A6 6 0 0118 9a4.5 4.5 0 01-1 9z',
}
export function XIcon({ name, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={MORE[name] || ''} />
    </svg>
  )
}

/* One summary figure: a label, the number, and what it is counted over.
   The paper-inset shape Now's own record block uses, so the two pages draw
   the same fact the same way. */
export function Stat({ label, value, note, className = '' }) {
  return (
    <div className={cx('min-w-0 rounded-[6px] bg-v3-paper p-3 sm:p-4', className)}>
      <dt><Label className="text-[12px]">{label}</Label></dt>
      <dd className="mt-1 truncate font-figure text-[24px] font-bold leading-tight tabular-nums text-v3-ink sm:text-[28px]">{value}</dd>
      {note ? <p className="mt-1 text-[13px] leading-[1.4] text-v3-ink3">{note}</p> : null}
    </div>
  )
}

/* The nine verdicts in v3's own colour jobs. The vocabulary — which glyph,
   which label — is the ledger's (VERDICTS), read rather than restated; only
   the colour is this build's, because the production map names production
   tokens. Direction goes to gain/cost, a verdict that is neither right nor
   wrong but "look again" goes to warn, and the rest are plain ink. */
const TONE = {
  good: 'bg-v3-gainWash text-v3-gain',
  bad: 'bg-v3-costWash text-v3-cost',
  incon: 'bg-v3-warnWash text-v3-warn',
  changed: 'bg-v3-warnWash text-v3-warn',
  recchanged: 'bg-v3-warnWash text-v3-warn',
}
export function verdictOf(key) {
  const k = VERDICTS[key] ? key : 'pending'
  return { key: k, ...VERDICTS[k], cls: TONE[k] || 'bg-v3-well text-v3-ink2' }
}
export function VerdictMark({ verdict, className = '' }) {
  const v = verdictOf(verdict)
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 py-1 text-[13px] font-semibold', v.cls, className)}>
      <span className="w-3.5 text-center font-figure" aria-hidden="true">{v.glyph}</span>
      {v.label}
    </span>
  )
}

/* Two presses, armed in place, naming the thing. The pattern production
   uses for every irreversible row action (the archive's delete, the You
   screen's disconnect), with the same four-second window. Armed is a
   CAUTION, so it is warn — never cost, which is a value's direction. The
   armed label names what goes, because a row in a list is one mis-scroll
   from being the wrong one. */
export function ArmedButton({ idle, armedLabel, ariaIdle, ariaArmed, onConfirm, busy = false, className = '' }) {
  const [armed, setArmed] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (armed) { clearTimeout(timer.current); setArmed(false); onConfirm(); return }
        setArmed(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setArmed(false), 4000)
      }}
      aria-label={armed ? ariaArmed : ariaIdle}
      className={cx(
        'inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call disabled:cursor-wait',
        armed ? 'bg-v3-warnWash text-v3-warn' : 'text-v3-ink3 hover:bg-v3-well hover:text-v3-ink',
        className,
      )}
    >
      {armed ? armedLabel : idle}
    </button>
  )
}

/* "Showing 20 of 47 · Show 20 more" — the footer production's archive and
   Locker table both use. The button's number is what the press does, so
   the last press reads "Show 7 more", and it is not drawn at all when there
   is nothing left to show. */
export function MoreFooter({ shown, total, step, onMore, noun = '' }) {
  if (!total) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v3-rule px-4 py-3 sm:px-5">
      <Label as="span" className="normal-case tracking-[0.04em]">Showing {shown} of {total}{noun ? ` ${noun}` : ''}</Label>
      {shown < total ? (
        <button
          type="button"
          onClick={onMore}
          className="inline-flex min-h-[44px] items-center rounded-[6px] border border-v3-rule bg-v3-sheet px-4 text-[15px] font-semibold text-v3-ink transition-colors hover:border-v3-ink3 hover:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call"
        >
          Show {Math.min(step, total - shown)} more
        </button>
      ) : null}
    </div>
  )
}

/* Where the record lives: this device, or the account — syncStatus() in
   the page's own words. Warn only when something is actually wrong. */
export function Where({ icon, title, text, warn }) {
  return (
    <p className={cx('flex items-start gap-2.5 text-[15px] leading-[1.5]', warn ? 'text-v3-warn' : 'text-v3-ink2')}>
      <XIcon name={warn ? 'warn' : icon} className="mt-[2px] h-[18px] w-[18px] shrink-0" />
      <span><strong className={cx('font-semibold', warn ? 'text-v3-warn' : 'text-v3-ink')}>{title}.</strong> {text}</span>
    </p>
  )
}

export function DraftsWhere({ signedIn, sync, count }) {
  if (!signedIn) {
    return (
      <Where
        icon="device"
        title="On this device"
        text={count
          ? `${count === 1 ? 'This draft lives' : 'These drafts live'} in this browser only. An account keeps ${count === 1 ? 'it' : 'them'} on every device.`
          : 'Mocks save in this browser, and to your account once you have one.'}
      />
    )
  }
  const s = SYNC_TEXT[sync] || SYNC_TEXT.offline
  return <Where icon={sync === 'ok' ? 'cloud' : 'device'} title={s.short} text={s.text} warn={s.warn} />
}

