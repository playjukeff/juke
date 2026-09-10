import { useRef, useState } from 'react'
import { Kicker } from '../v2ui.jsx'
import { LAUNCH_HASH } from './flow.js'
import { useDialogFocus } from './useCockpit.js'
import { FOCUS } from './parts.jsx'
import { IconBack, IconClose, IconExternal, IconFlag, IconMute, IconPause, IconPlay, IconSound, IconTrash } from './icons.jsx'

/* The things you do TO the draft, as opposed to in it — production's
   DraftMenuOverlay, item for item where the item exists here:

   - Pause / resume the clock (engine.togglePause), offered only when there
     is a clock to pause.
   - End draft: engine.autoDraftRest() drafts every remaining pick — yours
     off your queue first — and the draft is recorded and graded like any
     finished one. The confirm says the number, because "End draft" alone
     does not tell anybody eighty picks are about to happen.
   - Sound, the same engine.toggleSound() the header's own button calls.
   - Leave: back to the launcher. The draft stays saved and resumes where
     it was — leaving is not discarding.
   - Delete draft: engine.restart() (clearSave + goHome), the destructive
     one, two presses.

   Draft settings and notification settings are not re-drawn here — a live
   draft's settings are fixed once it starts, and both screens are one tap
   away in the classic Draft Room, which this menu links to. */

export default function CockpitMenu({ engine, header, onClose, soundOn, onSound, phone }) {
  const panel = useRef(null)
  const [confirm, setConfirm] = useState(null)
  useDialogFocus(true, onClose, panel)
  const left = header.started ? header.total - header.picksMade : 0
  const canPause = header.started && !header.over && engine.clockLength() > 0

  const items = [
    canPause && {
      key: 'pause',
      label: header.paused ? 'Resume the clock' : 'Pause the clock',
      icon: header.paused ? IconPlay : IconPause,
      run: () => engine.togglePause(),
      keep: true,
    },
    header.started && !header.over && {
      key: 'end',
      label: 'End draft',
      hint: 'Draft the rest automatically',
      icon: IconFlag,
      confirm: `Draft the remaining ${left} pick${left === 1 ? '' : 's'} automatically and end this draft?`,
      run: () => engine.autoDraftRest(),
    },
    {
      key: 'sound',
      label: soundOn ? 'Mute pick sounds' : 'Unmute pick sounds',
      icon: soundOn ? IconSound : IconMute,
      run: onSound,
      keep: true,
    },
    {
      key: 'leave',
      label: 'Leave for now',
      hint: 'It stays saved and picks up where you left it',
      icon: IconBack,
      run: () => { location.hash = LAUNCH_HASH },
    },
    {
      key: 'classic',
      label: 'Open in the classic Draft Room',
      hint: 'Settings, notifications and chat live there',
      icon: IconExternal,
      run: () => { location.hash = '#/draft-room' },
    },
    header.started && {
      key: 'delete',
      label: 'Delete this draft',
      icon: IconTrash,
      danger: true,
      confirm: 'Delete this draft? Every pick so far is gone.',
      run: () => { engine.restart(); location.hash = LAUNCH_HASH },
    },
  ].filter(Boolean)

  const press = (it) => {
    if (it.confirm && confirm !== it.key) { setConfirm(it.key); return }
    it.run()
    if (!it.keep) onClose()
  }

  return (
    <div className="fixed inset-0 z-[85]" role="presentation">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Draft menu"
        className={
          phone
            ? 'absolute inset-x-0 bottom-0 rounded-t-[20px] bg-v2-panel p-3 ring-1 ring-inset ring-white/[0.1]'
            : 'absolute right-4 top-[80px] w-[340px] rounded-[16px] bg-v2-panel p-2 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/[0.1]'
        }
        style={phone ? { paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' } : undefined}
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <Kicker tone="text-v2-ink2">This draft</Kicker>
          <button type="button" onClick={onClose} aria-label="Close menu" className={`grid h-10 w-10 place-items-center rounded-[9px] text-v2-ink2 hover:text-v2-ink ${FOCUS}`}>
            <IconClose />
          </button>
        </div>
        <ul>
          {items.map((it) => {
            const armed = confirm === it.key
            const Icon = it.icon
            return (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() => press(it)}
                  className={`flex min-h-[48px] w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left ${FOCUS} ${
                    armed ? 'bg-v2-loss/10 ring-1 ring-inset ring-v2-loss/30' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${it.danger || armed ? 'text-v2-loss' : 'text-v2-ink2'}`} />
                  <span className="min-w-0">
                    <span className={`block text-[14px] font-medium ${it.danger ? 'text-v2-loss' : 'text-v2-ink'}`}>
                      {armed ? 'Press again to confirm' : it.label}
                    </span>
                    {(armed ? it.confirm : it.hint) && (
                      <span className="block text-[12px] text-v2-ink3">{armed ? it.confirm : it.hint}</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
