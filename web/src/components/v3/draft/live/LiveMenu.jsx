import { useRef, useState } from 'react'
import { useNotificationPrefs } from '../../../../hooks/useDraftNotifications.js'
import { Label, PosTag, ThemeChoice, cx } from '../../ui.jsx'
import { LAUNCH_HASH } from '../flow.js'
import { FOCUS, Glyph, Switch, fmtClock, useDialogFocus } from '../kit.jsx'
import { inviteUrl, leaveRoom } from './room.js'

/* The things you do TO the draft, as opposed to in it — production's draft
   menu, item for item, with the three it used to hand to the classic room
   now drawn here:

   - Pause / resume (engine.togglePause), offered only with a clock.
   - Autopick, the same switch the header and the phone dock carry.
   - Take back my last pick (engine.undo()): rolls the board back to your
     own last pick. Solo only — a room has no shared undo, and this whole
     page hands rooms to the classic room anyway. Offered only once you have
     made a pick: with none, undo would pop CPU picks back to pick one with
     nothing to restart the CPU.
   - End draft: engine.autoDraftRest(), then graded like any finished draft.
     The confirm says the count, because "End draft" alone does not tell
     anybody eighty picks are about to happen.
   - Sound; notifications (production's own useDraftNotifications — a real
     browser notification when your turn arrives in a background tab, with
     the three permission states said rather than assumed).
   - This draft's settings, read-only: production locks them once a draft
     starts, so this shows them rather than offering controls that refuse.
   - Keyboard shortcuts.
   - Leave (the draft stays saved) and Delete (two presses).
   - The theme. The room is bare — no top bar — so the switch the rest of
     v3 keeps behind the sun or moon lives here. */

export const SHORTCUTS = [
  ['c', 'Jump to the call — Enter then drafts it on your turn'],
  ['/', 'Search the player pool'],
  ['p', 'Player pool'],
  ['b', 'Draft board'],
  ['g', 'Grade so far'],
  ['t', 'Your team (phone layout)'],
  ['m', 'This menu'],
  ['?', 'These shortcuts'],
  ['Esc', 'Close a sheet or this menu'],
]

function Row({ icon, label, hint, onClick, armed, danger, right, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('flex min-h-[52px] w-full items-center gap-3 rounded-[4px] px-3 py-2 text-left', FOCUS, armed ? 'bg-v3-warnWash' : 'hover:bg-v3-paper')}
      {...rest}
    >
      <Glyph name={icon} className={cx('h-5 w-5 shrink-0', danger || armed ? 'text-v3-warn' : 'text-v3-ink2')} />
      <span className="min-w-0 flex-1">
        <span className={cx('block text-[15px] font-semibold', danger || armed ? 'text-v3-warn' : 'text-v3-ink')}>{label}</span>
        {hint && <span className="block text-[13px] leading-snug text-v3-ink2">{hint}</span>}
      </span>
      {right}
    </button>
  )
}

function Notifications() {
  const { prefs, permission, supported, setAllow } = useNotificationPrefs()
  const on = !!prefs.allow && permission === 'granted'
  const hint = !supported
    ? 'This browser cannot show notifications here. On an iPhone they work once Juke is added to your home screen.'
    : permission === 'denied'
      ? 'Blocked in your browser’s settings for this site — Juke cannot turn it back on from here.'
      : on ? 'Only when this tab is in the background — never while you are looking at it.'
        : 'A notification when your pick comes round and this tab is in the background.'
  return (
    <div className="flex min-h-[52px] items-center gap-3 rounded-[4px] px-3 py-2">
      <Glyph name="bell" className="h-5 w-5 shrink-0 text-v3-ink2" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-v3-ink">Tell me when I’m up</span>
        <span className="block text-[13px] leading-snug text-v3-ink2">{hint}</span>
      </span>
      {supported && permission !== 'denied' && <Switch hideLabel label="Tell me when I'm up" checked={on} onChange={(v) => setAllow(v)} />}
    </div>
  )
}

function SettingsPage({ engine }) {
  const league = engine.league()
  const lineup = engine.lineup()
  const names = engine.scoringNames ? engine.scoringNames() : {}
  const order = engine.draftOrder ? engine.draftOrder() : []
  const clock = engine.clockLength()
  const slots = []
  if (lineup) {
    for (const pos of ['QB', 'RB', 'WR', 'TE']) if (lineup.starters[pos]) slots.push({ pos, n: lineup.starters[pos] })
    if (lineup.flex) slots.push({ pos: 'FLEX', n: lineup.flex })
    if (lineup.superflex) slots.push({ pos: 'SFLEX', n: lineup.superflex })
    for (const pos of ['K', 'DST']) if (lineup.starters[pos]) slots.push({ pos, n: lineup.starters[pos] })
    slots.push({ pos: 'BN', n: lineup.bench })
  }
  return (
    <div className="space-y-4 px-4 py-4">
      <p className="text-[14px] leading-[1.5] text-v3-ink2">Fixed once a draft starts, the way production locks them. Change the next mock’s shape from the launcher.</p>
      <dl className="grid grid-cols-2 gap-2">
        {[
          ['Scoring', names[league.scoring] || league.scoring],
          ['Teams', league.teams],
          ['Rounds', league.rounds],
          ['Clock', clock ? fmtClock(clock) : 'None'],
          ['Draft type', `${league.draftType === 'linear' ? 'Linear' : 'Snake'}${league.thirdRoundReversal && league.draftType === 'snake' ? ' · 3RR' : ''}`],
          ['CPU autopick', league.cpuAutopick === false ? 'Off' : 'On'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[4px] bg-v3-paper px-3 py-2">
            <dt><Label className="text-[11px]">{k}</Label></dt>
            <dd className="mt-0.5 truncate font-figure text-[15px] font-bold text-v3-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <Label className="block">Starting lineup</Label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {slots.map((s) => (
            <span key={s.pos} className="inline-flex items-center gap-1.5">
              {['FLEX', 'SFLEX', 'BN'].includes(s.pos)
                ? <span className="inline-grid h-[22px] min-w-[34px] place-items-center rounded-[4px] border border-v3-rule bg-v3-well px-1.5 font-figure text-[12px] font-bold text-v3-ink">{s.pos === 'SFLEX' ? 'SF' : s.pos}</span>
                : <PosTag pos={s.pos} />}
              <span className="font-figure text-[13px] tabular-nums text-v3-ink2">×{s.n}</span>
            </span>
          ))}
        </div>
      </div>
      {!!order.length && (
        <div>
          <Label className="block">Draft order</Label>
          <ol className="mt-2 divide-y divide-v3-rule overflow-hidden rounded-[4px] border border-v3-rule">
            {order.map((r) => (
              <li key={r.slot} className={cx('flex min-h-[40px] items-center gap-3 px-3 py-1.5', r.you ? 'bg-v3-band text-white' : 'bg-v3-sheet')}>
                <span className={cx('w-6 shrink-0 text-right font-figure text-[13px] font-bold tabular-nums', r.you ? 'text-white' : 'text-v3-ink3')}>{r.slot + 1}</span>
                <span className={cx('min-w-0 flex-1 truncate text-[14px]', r.you ? 'font-bold text-white' : 'text-v3-ink')}>{r.you ? 'You' : r.name}</span>
                {r.firstPick && <span className={cx('shrink-0 font-figure text-[12px]', r.you ? 'text-v3-bandInk' : 'text-v3-ink3')}>first pick #{r.firstPick}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function ShortcutsPage() {
  return (
    <div className="px-4 py-4">
      <p className="text-[14px] leading-[1.5] text-v3-ink2">Single keys, ignored while you are typing in a field. Every one of them has a button too.</p>
      <dl className="mt-3 divide-y divide-v3-rule rounded-[4px] border border-v3-rule">
        {SHORTCUTS.map(([k, what]) => (
          <div key={k} className="flex min-h-[44px] items-center gap-3 px-3 py-1.5">
            <dt className="w-12 shrink-0"><kbd className="inline-grid h-7 min-w-[28px] place-items-center rounded-[4px] border border-v3-rule bg-v3-paper px-1.5 font-figure text-[13px] font-bold text-v3-ink">{k}</kbd></dt>
            <dd className="text-[14px] text-v3-ink">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/* Who is in the room, from the one place a phone can reach it mid-draft —
   the header has no space for a seat list and the lobby is behind you. The
   invite is here too, because the commonest reason to want it is that
   somebody has not arrived yet and the draft has already begun. */
function RoomPage({ engine, room }) {
  const [copied, setCopied] = useState(false)
  const url = inviteUrl(room.code)
  return (
    <div className="space-y-4 px-4 py-4">
      <p className="text-[14px] leading-[1.5] text-v3-ink2">
        {room.taken} of {room.seats.length} seats are managers; the rest are drafted by {room.isHost ? 'this browser' : "the host's browser"}.
        {room.away ? ` ${room.away} ${room.away === 1 ? 'manager has' : 'managers have'} dropped — their seats are being drafted for until they are back.` : ''}
      </p>
      <ol className="divide-y divide-v3-rule overflow-hidden rounded-[4px] border border-v3-rule">
        {room.seats.map((chair, i) => (
          <li key={i} className={cx('flex min-h-[40px] items-center gap-3 px-3 py-1.5', chair.you ? 'bg-v3-band text-white' : 'bg-v3-sheet')}>
            <span className={cx('w-5 shrink-0 text-right font-figure text-[13px] font-bold tabular-nums', chair.you ? 'text-white' : 'text-v3-ink3')}>{i + 1}</span>
            <span className={cx('min-w-0 flex-1 truncate text-[14px]', chair.you ? 'font-bold text-white' : 'text-v3-ink')}>
              {chair.you ? 'You' : chair.taken ? (chair.name || 'Manager') : 'CPU'}
            </span>
            {chair.taken && chair.auto && <span className={cx('shrink-0 font-figure text-[11px] uppercase tracking-[0.08em]', chair.you ? 'text-v3-bandInk' : 'text-v3-warn')}>away</span>}
          </li>
        ))}
      </ol>
      <div>
        <Label className="block">The invite</Label>
        <div className="mt-2 flex gap-2">
          <input readOnly value={url} data-invite-link onFocus={(e) => e.target.select()} className={cx('min-h-[44px] min-w-0 flex-1 rounded-[4px] border border-v3-rule bg-v3-paper px-3 font-figure text-[16px] text-v3-ink2', FOCUS)} aria-label="Invite link" />
          <button type="button" onClick={() => { navigator.clipboard.writeText(url).then(() => setCopied(true), () => setCopied(false)) }} className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[4px] border border-v3-rule bg-v3-sheet text-v3-ink', FOCUS)} aria-label="Copy the invite link">
            <Glyph name={copied ? 'check' : 'copy'} className="h-4 w-4" />
          </button>
        </div>
        <p role="status" className="mt-1 h-4 text-[12px] text-v3-ink3">{copied ? 'Copied.' : ''}</p>
      </div>
    </div>
  )
}

export default function LiveMenu({ engine, header, room = null, blocked = null, onClose, soundOn, onSound, autopick, onAutopick, onUndo, phone, startPage = 'main' }) {
  const panel = useRef(null)
  const closeRef = useRef(null)
  const [confirm, setConfirm] = useState(null)
  const [page, setPage] = useState(startPage)
  useDialogFocus(true, onClose, panel, closeRef)
  const left = header.started ? header.total - header.picksMade : 0
  // The host's, in a room — room.js refuses it from anybody else, and a
  // control that cannot act must not be offered.
  const canPause = header.started && !header.over && engine.clockLength() > 0 && (!room || room.isHost) && !blocked
  const mySlot = engine.mySlot()
  const madeOne = (engine.picks() || []).some((p) => p.slot === mySlot)
  const canUndo = header.started && !header.over && !engine.hasRoom() && madeOne

  const press = (key, run, { keep = false, confirmText = null } = {}) => {
    if (confirmText && confirm !== key) { setConfirm(key); return }
    run()
    setConfirm(null)
    if (!keep) onClose()
  }
  const armedHint = (key, text, hint) => (confirm === key ? text : hint)

  const title = page === 'settings' ? 'This draft' : page === 'keys' ? 'Keyboard' : page === 'room' ? 'The room' : 'Draft menu'

  return (
    <div className="fixed inset-0 z-[85]" role="presentation">
      <div className="absolute inset-0 bg-v3-shade/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={phone
          ? 'absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[6px] bg-v3-sheet shadow-[0_-12px_32px_-12px_rgb(var(--v3-shade)/0.3)]'
          : 'absolute right-4 top-[76px] flex max-h-[calc(100dvh-92px)] w-[380px] flex-col overflow-hidden rounded-[6px] border border-v3-rule bg-v3-sheet shadow-[0_12px_32px_-12px_rgb(var(--v3-shade)/0.3)]'}
        style={phone ? { paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' } : undefined}
      >
        <div className="flex min-h-[40px] shrink-0 items-center justify-between gap-3 bg-v3-band pl-1 pr-1 text-white">
          <span className="flex min-w-0 items-center gap-1">
            {page !== 'main' && (
              <button type="button" onClick={() => setPage('main')} aria-label="Back to the draft menu" className={cx('grid h-10 w-10 place-items-center rounded-[4px] text-white hover:bg-v3-bandSoft', FOCUS)}>
                <Glyph name="back" className="h-4 w-4" />
              </button>
            )}
            <span className={cx('font-figure text-[12px] font-bold uppercase tracking-[0.14em]', page === 'main' && 'pl-3')}>{title}</span>
          </span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close menu" className={cx('grid h-10 w-10 place-items-center rounded-[4px] text-white hover:bg-v3-bandSoft', FOCUS)}>
            <Glyph name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {page === 'settings' ? <SettingsPage engine={engine} />
            : page === 'keys' ? <ShortcutsPage />
              : page === 'room' && room ? <RoomPage engine={engine} room={room} />
                : (
                <>
                  <div className="divide-y divide-v3-rule p-1">
                    {room && <Row icon="users" label="The room" hint={`${room.taken} of ${room.seats.length} seats · invite link`} onClick={() => setPage('room')} right={<Glyph name="chevRight" className="h-4 w-4 shrink-0 text-v3-ink3" />} />}
                    {canPause && <Row icon={header.paused ? 'play' : 'pause'} label={header.paused ? 'Resume the clock' : 'Pause the clock'} onClick={() => press('pause', () => engine.togglePause(), { keep: true })} />}
                    {header.started && !header.over && (
                      <div className="flex min-h-[52px] items-center gap-3 rounded-[4px] px-3 py-2">
                        <Glyph name="cpu" className="h-5 w-5 shrink-0 text-v3-ink2" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-v3-ink">Autopick</span>
                          <span className="block text-[13px] leading-snug text-v3-ink2">Juke drafts your picks — your queue first, then what a CPU in your seat would take.</span>
                        </span>
                        <Switch hideLabel label="Autopick" checked={autopick} onChange={onAutopick} />
                      </div>
                    )}
                    {canUndo && (
                      <Row
                        icon="undo"
                        armed={confirm === 'undo'}
                        label={confirm === 'undo' ? 'Press again to take it back' : 'Take back my last pick'}
                        hint={armedHint('undo', 'The board rolls back to your last pick, and every pick since goes back into the pool.', 'Solo only — the board rolls back to your own last pick')}
                        onClick={() => press('undo', onUndo, { confirmText: 'undo' })}
                      />
                    )}
                    {/* "The rest" in a room is nine other people's teams, so
                        there is nothing here for this button to end. */}
                    {header.started && !header.over && !room && (
                      <Row
                        icon="flag"
                        armed={confirm === 'end'}
                        label={confirm === 'end' ? 'Press again to confirm' : 'End draft'}
                        hint={armedHint('end', `Draft the remaining ${left} pick${left === 1 ? '' : 's'} automatically and end this draft?`, 'Draft the rest automatically, then grade it')}
                        onClick={() => press('end', () => engine.autoDraftRest(), { confirmText: 'end' })}
                      />
                    )}
                    <Row icon={soundOn ? 'sound' : 'mute'} label={soundOn ? 'Mute pick sounds' : 'Unmute pick sounds'} onClick={() => press('sound', onSound, { keep: true })} />
                    <Notifications />
                    <Row icon="sliders" label="This draft’s settings" hint="Scoring, lineup, clock and draft order" onClick={() => setPage('settings')} right={<Glyph name="chevRight" className="h-4 w-4 shrink-0 text-v3-ink3" />} />
                    <Row icon="keys" label="Keyboard shortcuts" hint="Press ? any time" onClick={() => setPage('keys')} right={<Glyph name="chevRight" className="h-4 w-4 shrink-0 text-v3-ink3" />} />
                    {room ? (
                      <Row icon="back" label="Leave the room" hint="Your seat is drafted for until you come back — the invite link returns you to it" onClick={() => press('leaveroom', () => leaveRoom(engine))} />
                    ) : (
                      <Row icon="back" label="Leave for now" hint="It stays saved and picks up where you left it" onClick={() => press('leave', () => { location.hash = LAUNCH_HASH })} />
                    )}
                    {/* Deleting is a local act on a local save. A shared
                        draft is nine other people's too, and there is no
                        message that ends one. */}
                    {header.started && !room && (
                      <Row
                        icon="trash"
                        danger
                        armed={confirm === 'delete'}
                        label={confirm === 'delete' ? 'Press again to delete' : 'Delete this draft'}
                        hint={confirm === 'delete' ? 'Every pick so far is gone, and it is not recorded.' : null}
                        onClick={() => press('delete', () => { engine.restart(); location.hash = LAUNCH_HASH }, { confirmText: 'delete' })}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v3-rule px-4 py-3">
                    <Label>Theme</Label>
                    <ThemeChoice />
                  </div>
                </>
              )}
        </div>
      </div>
    </div>
  )
}
