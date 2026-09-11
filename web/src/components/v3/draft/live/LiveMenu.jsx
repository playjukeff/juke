import { useRef, useState } from 'react'
import { useDialogFocus } from '../../../v2/draft/draftKit.jsx'
import { Label, ThemeChoice, cx } from '../../ui.jsx'
import { LAUNCH_HASH } from '../flow.js'
import { FOCUS, Glyph } from '../kit.jsx'

/* The things you do TO the draft, as opposed to in it — production's draft
   menu, item for item where the item exists here:

   - Pause / resume the clock (engine.togglePause), offered only when there
     is a clock to pause.
   - End draft: engine.autoDraftRest() drafts every remaining pick — yours
     off your queue first — and it is recorded and graded like any finished
     draft. The confirm says the number, because "End draft" alone does not
     tell anybody eighty picks are about to happen.
   - Sound, the same toggle the header's own button calls.
   - Leave: back to the launcher. The draft stays saved — leaving is not
     discarding.
   - The classic Draft Room, for the three things v3 does not redraw mid-draft:
     chat (a room's), notifications, and the settings screen.
   - Delete this draft: engine.restart(), the destructive one, two presses.
   - The theme. This screen is bare — no top bar — so the switch the rest of
     v3 keeps behind the sun or moon lives here instead. It changes nothing
     about the draft, which is why it is its own row and not a menu item. */

export default function LiveMenu({ engine, header, onClose, soundOn, onSound, phone }) {
  const panel = useRef(null)
  const closeRef = useRef(null)
  const [confirm, setConfirm] = useState(null)
  useDialogFocus(true, onClose, panel, closeRef)
  const left = header.started ? header.total - header.picksMade : 0
  const canPause = header.started && !header.over && engine.clockLength() > 0

  const items = [
    canPause && { key: 'pause', label: header.paused ? 'Resume the clock' : 'Pause the clock', icon: header.paused ? 'play' : 'pause', run: () => engine.togglePause(), keep: true },
    header.started && !header.over && {
      key: 'end',
      label: 'End draft',
      hint: 'Draft the rest automatically, then grade it',
      icon: 'flag',
      confirm: `Draft the remaining ${left} pick${left === 1 ? '' : 's'} automatically and end this draft?`,
      run: () => engine.autoDraftRest(),
    },
    { key: 'sound', label: soundOn ? 'Mute pick sounds' : 'Unmute pick sounds', icon: soundOn ? 'sound' : 'mute', run: onSound, keep: true },
    { key: 'leave', label: 'Leave for now', hint: 'It stays saved and picks up where you left it', icon: 'back', run: () => { location.hash = LAUNCH_HASH } },
    {
      key: 'classic',
      label: 'Open in the classic Draft Room',
      hint: 'Chat, notifications and draft settings live there',
      icon: 'external',
      run: () => { location.hash = '#/draft-room' },
    },
    header.started && { key: 'delete', label: 'Delete this draft', icon: 'trash', danger: true, confirm: 'Delete this draft? Every pick so far is gone.', run: () => { engine.restart(); location.hash = LAUNCH_HASH } },
  ].filter(Boolean)

  const press = (it) => {
    if (it.confirm && confirm !== it.key) { setConfirm(it.key); return }
    it.run()
    if (!it.keep) onClose()
  }

  return (
    <div className="fixed inset-0 z-[85]" role="presentation">
      <div className="absolute inset-0 bg-v3-shade/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Draft menu"
        tabIndex={-1}
        className={phone
          ? 'absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[6px] bg-v3-sheet shadow-[0_-12px_32px_-12px_rgb(var(--v3-shade)/0.3)]'
          : 'absolute right-4 top-[84px] w-[360px] overflow-hidden rounded-[6px] border border-v3-rule bg-v3-sheet shadow-[0_12px_32px_-12px_rgb(var(--v3-shade)/0.3)]'}
        style={phone ? { paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' } : undefined}
      >
        <div className="flex min-h-[40px] items-center justify-between gap-3 bg-v3-band pl-4 pr-1 text-white">
          <span className="font-figure text-[12px] font-bold uppercase tracking-[0.14em]">This draft</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close menu" className={cx('grid h-10 w-10 place-items-center rounded-[4px] text-white hover:bg-v3-bandSoft', FOCUS)}>
            <Glyph name="close" className="h-4 w-4" />
          </button>
        </div>
        <ul className="divide-y divide-v3-rule p-1">
          {items.map((it) => {
            const armed = confirm === it.key
            return (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() => press(it)}
                  className={cx('flex min-h-[52px] w-full items-center gap-3 rounded-[4px] px-3 py-2 text-left', FOCUS, armed ? 'bg-v3-warnWash' : 'hover:bg-v3-paper')}
                >
                  <Glyph name={it.icon} className={cx('h-5 w-5 shrink-0', it.danger || armed ? 'text-v3-warn' : 'text-v3-ink2')} />
                  <span className="min-w-0">
                    <span className={cx('block text-[15px] font-semibold', it.danger || armed ? 'text-v3-warn' : 'text-v3-ink')}>{armed ? 'Press again to confirm' : it.label}</span>
                    {(armed ? it.confirm : it.hint) && <span className="block text-[13px] text-v3-ink2">{armed ? it.confirm : it.hint}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v3-rule px-4 py-3">
          <Label>Theme</Label>
          <ThemeChoice />
        </div>
        <p className="border-t border-v3-rule px-4 py-2.5"><Label className="text-[11px]">Settings are fixed once a draft starts</Label></p>
      </div>
    </div>
  )
}
