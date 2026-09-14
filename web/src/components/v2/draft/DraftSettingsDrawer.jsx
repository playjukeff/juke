import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Kicker, PosChip, useReducedMotionPref } from '../v2ui.jsx'
import { Icon, safe, useDialogFocus } from './draftKit.jsx'

/* Draft settings, as a drawer off the launcher.

   Production's DraftSettingsModal re-drawn in the telemetry language, and
   nothing else. Every control writes through the same bridge call that
   modal uses — setLeague(), setMySlot(), randomizeOrder(), swapSeats(),
   setClockLength(), setScoringRule(), resetScoringRules() — and every
   option list comes off the engine (draftTypes(), playerPools(),
   teamCounts(), scoringNames(), scoringPreset(), scoringEditor(),
   draftOrder(), lineup()). A second idea of what a league is, living in
   web/src, is the failure CLAUDE.md records under the superflex bug.

   ---- Done is a dismiss, not a commit ----

   The same rule the modal states: each control writes the one real
   `league` the moment it is pressed, because that is what keeps the
   launcher's summary, the board and setupProblem() agreeing with the
   screen while somebody is still reading it. Done guards the one thing
   worth guarding — it will not close onto a Start button that cannot
   press, and says which setting is why.

   ---- A drawer rather than inline ----

   Ten sections and a 49-rule editor is a screen, and the launcher's job is
   the one button. A drawer keeps that button the first thing the page is,
   and it is the overlay RoomHub already taught this build (right-hand
   sheet, full width on a phone, focus in, Esc out). */

const CLOCK = [
  { key: 0, label: 'None' },
  { key: 10, label: '10s' },
  { key: 15, label: '15s' },
  { key: 20, label: '20s' },
  { key: 30, label: '30s' },
  { key: 60, label: '60s' },
  { key: 120, label: '2m' },
  { key: 300, label: '5m' },
]

const SLOT_LABEL = {
  QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end',
  K: 'Kicker', DST: 'Defense', FLEX: 'Flex · W/R/T', SFLEX: 'Superflex · Q/W/R/T', BN: 'Bench',
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt'

function Section({ title, hint, action, children, id }) {
  return (
    <section className="border-b border-white/[0.06] px-5 py-5 last:border-b-0" aria-labelledby={id}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={id} className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-v2-ink2">{title}</h3>
          {hint && <p className="mt-1.5 max-w-[46ch] text-[12px] leading-[1.5] text-v2-ink3">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/* The option row. Scrolls sideways rather than wrapping, because team
   counts and clock lengths are scales and a wrapped scale reads as two
   groups — SettingsControls' own argument for its circle row. */
function Choices({ label, options, value, onChange, disabled, onUnavailable, wide = false }) {
  return (
    <div role="group" aria-label={label} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            className={`flex min-h-[44px] shrink-0 flex-col items-center justify-center rounded-[10px] px-3 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] tabular-nums transition-colors ${focusRing} ${
              wide ? 'min-w-[96px] flex-1' : 'min-w-[48px]'
            } ${
              on
                ? 'bg-v2-volt text-v2-voltInk'
                : off
                  ? 'border border-dashed border-white/[0.14] bg-transparent text-v2-ink3'
                  : 'bg-v2-inset text-v2-ink2 ring-1 ring-inset ring-white/[0.08] hover:text-v2-ink'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <span>{o.label}</span>
            {o.sub && <span className={`mt-0.5 text-[10px] font-medium normal-case tracking-normal ${on ? '' : 'text-v2-ink3'}`}>{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}

function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative grid h-11 w-[58px] shrink-0 place-items-center rounded-full ${focusRing} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span className={`relative block h-[26px] w-[46px] rounded-full transition-colors ${checked ? 'bg-v2-volt' : 'bg-white/[0.1]'}`}>
        <span
          className={`absolute top-[3px] h-5 w-5 rounded-full shadow transition-[left] duration-200 ${checked ? 'bg-v2-voltInk' : 'bg-v2-ink2'}`}
          style={{ left: checked ? 23 : 3 }}
        />
      </span>
    </button>
  )
}

function Stepper({ label, value, onAdd, onRemove, disabled, max = 9 }) {
  const btn = `grid h-10 w-10 place-items-center rounded-[9px] text-v2-ink ring-1 ring-inset ring-white/[0.1] transition-colors hover:bg-white/[0.05] ${focusRing} disabled:cursor-not-allowed disabled:opacity-35`
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <button type="button" onClick={onRemove} disabled={disabled || value <= 0} aria-label={`One fewer ${label}`} className={btn}>
        <Icon name="minus" className="h-3.5 w-3.5" />
      </button>
      <span className="w-7 text-center font-telemetry text-[22px] font-bold leading-none tabular-nums text-v2-ink" aria-live="polite">{value}</span>
      <button type="button" onClick={onAdd} disabled={disabled || value >= max} aria-label={`One more ${label}`} className={btn}>
        <Icon name="plus" className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

/* "1 point every N yards" commits on blur, never per keystroke.
   ScoringRules.jsx's own finding: pointsFromDivisor(0) scores the stat at
   zero rather than refusing, so typing "0" on the way to "10" would rescore
   the board with a free stat on every keystroke. Local text while typing,
   one validated commit, and a revert when the edit did not take. */
function DivisorInput({ rule, disabled, onCommit }) {
  const [text, setText] = useState(String(rule.divisor))
  useEffect(() => { setText(String(rule.divisor)) }, [rule.divisor])
  const commit = () => {
    const n = Number(text)
    if (text.trim() === '' || !isFinite(n) || n < 1 || n > 999) { setText(String(rule.divisor)); return }
    onCommit(n)
  }
  return (
    <input
      type="number" min="1" max="999" step="1" value={text} disabled={disabled}
      aria-label={`${rule.label}, yards per point`}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className={`h-10 w-16 rounded-[8px] bg-v2-inset px-2 text-right font-mono text-[16px] tabular-nums text-v2-ink ring-1 ring-inset ring-white/[0.1] ${focusRing} disabled:text-v2-ink3 sm:text-[13px]`}
    />
  )
}

function ScoringEditor({ engine, locked, onChange }) {
  const groups = safe(() => engine.scoringEditor(), [])
  return (
    <div className="mt-4 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] leading-[1.5] text-v2-ink3">
          Every number rescores the whole board as you change it — projections, value over replacement and the Juke score with it.
        </p>
        <button
          type="button"
          disabled={locked}
          onClick={() => { engine.resetScoringRules(); onChange() }}
          className={`shrink-0 rounded-[8px] px-3 py-2 text-[12px] font-medium text-v2-ink2 ring-1 ring-inset ring-white/[0.12] hover:text-v2-ink ${focusRing} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Reset
        </button>
      </div>
      {groups.map((g) => (
        <div key={g.title}>
          <Kicker>{g.title}</Kicker>
          <div className="mt-1.5 divide-y divide-white/[0.05] rounded-[12px] bg-v2-inset ring-1 ring-inset ring-white/[0.06]">
            {g.rules.map((rule) => (
              <label key={rule.key} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-[13px] text-v2-ink">{rule.label}</span>
                  {rule.historyOnly && <span className="block text-[11px] leading-snug text-v2-ink3">Scores past seasons; does not move this projection</span>}
                </span>
                {rule.perYard ? (
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-v2-ink3">
                    1 pt /
                    <DivisorInput rule={rule} disabled={locked} onCommit={(n) => { engine.setScoringRule(rule.key, n, true); onChange() }} />
                    yds
                  </span>
                ) : (
                  <input
                    type="number" step="0.5" min="-99" max="99" value={rule.value} disabled={locked}
                    onChange={(e) => { engine.setScoringRule(rule.key, e.target.value); onChange() }}
                    className={`h-10 w-20 shrink-0 rounded-[8px] bg-v2-panel px-2 text-right font-mono text-[16px] tabular-nums text-v2-ink ring-1 ring-inset ring-white/[0.1] ${focusRing} disabled:text-v2-ink3 sm:text-[13px]`}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* Draft order. Solo it is one question — which chair is yours — because
   the other chairs are CPU teams drafting to one rule and permuting them
   changes nothing anybody can see; so Randomize moves one seat and a row
   takes that seat, both through the engine. In a room it is the host
   arranging real people, through swapSeats(), the only door the room
   exposes. DraftOrder.jsx's own two-features-one-heading argument. */
function DraftOrderList({ engine, league, onChange }) {
  const [held, setHeld] = useState(null)
  const heldRef = useRef(null)
  const hold = (i) => { heldRef.current = i; setHeld(i) }
  const room = safe(() => engine.room())
  const seats = room && room.seats ? room.seats : null
  const isHost = !!safe(() => engine.isHost(), false)
  const canOrder = seats ? isHost : true

  const rows = seats
    ? seats.map((c, i) => ({ slot: i, you: !!c.you, name: c.you ? 'You' : c.name || (c.taken ? 'A manager' : 'Open'), open: !c.taken }))
    : safe(() => engine.draftOrder(), []).map((r) => ({ slot: r.slot, you: r.you, name: r.name, firstPick: r.firstPick, open: false }))

  const randomize = () => {
    if (seats) {
      for (let i = league.teams - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        if (i !== j) engine.swapSeats(i, j)
      }
      hold(null)
    } else {
      engine.randomizeOrder()
    }
    onChange()
  }

  const hint = seats
    ? isHost
      ? held === null ? 'Pick a seat up, then press another to swap them.' : 'Now press the seat to swap with — or the same one to put it back.'
      : 'Only the host can set the draft order.'
    : 'Press a draft position to take it. The other chairs are computer teams, so the order between them changes nothing.'

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[40ch] flex-1 text-[12px] leading-[1.5] text-v2-ink3">{hint}</p>
        {canOrder && (
          <button
            type="button"
            onClick={randomize}
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-[10px] px-3 text-[13px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.12] hover:bg-white/[0.04] ${focusRing}`}
          >
            <Icon name="shuffle" className="h-4 w-4" /> Randomize
          </button>
        )}
      </div>
      <ol className="divide-y divide-white/[0.05] overflow-hidden rounded-[12px] bg-v2-inset ring-1 ring-inset ring-white/[0.06]">
        {rows.map((r) => {
          const isHeld = held === r.slot
          const press = () => {
            if (!canOrder) return
            if (seats) {
              const cur = heldRef.current
              if (cur === null) { hold(r.slot); return }
              if (cur !== r.slot) engine.swapSeats(cur, r.slot)
              hold(null)
            } else {
              engine.setMySlot(r.slot)
            }
            onChange()
          }
          return (
            <li key={r.slot}>
              <button
                type="button"
                disabled={!canOrder}
                onClick={press}
                aria-pressed={r.you || isHeld}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${focusRing} ${
                  isHeld ? 'bg-v2-cyan/[0.1]' : r.you ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'
                } disabled:cursor-default`}
              >
                <span className="w-6 shrink-0 text-right font-mono text-[12px] tabular-nums text-v2-ink3">{r.slot + 1}</span>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${r.you ? 'bg-v2-volt text-v2-voltInk' : 'bg-white/[0.06] text-v2-ink2'}`} aria-hidden="true">
                  <Icon name={r.you ? 'person' : 'cpu'} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[14px] font-medium ${r.you ? 'text-v2-ink' : 'text-v2-ink2'}`}>{r.name}</span>
                  <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">
                    Position {r.slot + 1}{r.firstPick ? ` · first pick #${r.firstPick}` : ''}
                  </span>
                </span>
                {r.you && <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-v2-volt">Your seat</span>}
                {r.open && <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3">Open</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default function DraftSettingsDrawer({ open, engine, onClose, onChange }) {
  const reduce = useReducedMotionPref()
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const [blocked, setBlocked] = useState('')
  const [unavailable, setUnavailable] = useState(null)
  const [showRules, setShowRules] = useState(false)

  useDialogFocus(open, onClose, panelRef, closeRef)
  useEffect(() => { if (open) { setBlocked(''); setUnavailable(null) } }, [open])

  const league = engine ? safe(() => engine.league()) : null
  const lineup = engine ? safe(() => engine.lineup()) : null
  const problem = engine ? safe(() => engine.setupProblem(), '') : ''
  /* Locked while a room exists, for the host too: every client has to agree
     on the board the CPU wobble reads, so a room's shape is fixed the
     moment it is made. The pick clock is per-drafter and stays open —
     DraftSettingsModal's own split, reproduced rather than re-decided. */
  const locked = !!(engine && safe(() => engine.hasRoom(), false))
  const patch = (p) => { engine.setLeague(p); setBlocked(''); onChange() }
  const done = () => {
    const why = safe(() => engine.setupProblem(), '')
    if (why) { setBlocked(why); return }
    onClose()
  }

  const names = engine ? safe(() => engine.scoringNames(), {}) : {}
  const ruleCount = engine ? safe(() => engine.scoringEditor().reduce((n, g) => n + g.rules.length, 0), 0) : 0

  const rosterRows = lineup ? [
    ...['QB', 'RB', 'WR', 'TE'].map((pos) => ({ key: pos, value: lineup.starters[pos] || 0, set: (n) => patch({ starters: { ...lineup.starters, [pos]: n } }) })),
    { key: 'FLEX', value: lineup.flex, max: 3, set: (n) => patch({ flex: n }) },
    { key: 'SFLEX', value: lineup.superflex, max: 1, set: (n) => patch({ superflex: n }) },
    ...['K', 'DST'].map((pos) => ({ key: pos, value: lineup.starters[pos] || 0, set: (n) => patch({ starters: { ...lineup.starters, [pos]: n } }) })),
    { key: 'BN', value: lineup.bench, max: 15, set: (n) => patch({ bench: n }) },
  ] : []

  const message = locked
    ? { tone: 'warn', text: 'This room is set — every seat has to agree on the same board, so its shape is fixed from the moment the room exists. Make a new room to change it.' }
    : (problem || blocked) ? { tone: 'loss', text: problem || blocked } : null

  return (
    <AnimatePresence>
      {open && engine && league && lineup && (
        <>
          <motion.div
            key="bg"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="v2-settings-title"
            tabIndex={-1}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-v2-panel shadow-[-24px_0_60px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.08] focus:outline-none"
            initial={{ x: reduce ? 0 : '100%' }} animate={{ x: 0 }} exit={{ x: reduce ? 0 : '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="min-w-0">
                <Kicker tone="text-v2-ink2">The Draft Room</Kicker>
                <h2 id="v2-settings-title" className="mt-1 font-telemetry text-[34px] font-extrabold uppercase italic leading-none text-v2-ink">Draft settings</h2>
                <p className="mt-1.5 truncate font-mono text-[11px] uppercase tracking-[0.08em] text-v2-ink3">{safe(() => engine.settingsText(league), '')}</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close draft settings"
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-v2-ink2 ring-1 ring-inset ring-white/[0.1] hover:text-v2-ink ${focusRing}`}
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>

            {message && (
              <p
                role="status"
                className={`flex gap-2 border-b px-5 py-2.5 text-[13px] leading-[1.5] ${
                  message.tone === 'warn' ? 'border-v2-warn/25 bg-v2-warn/[0.08] text-v2-warn' : 'border-v2-loss/25 bg-v2-loss/[0.08] text-v2-loss'
                }`}
              >
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{message.text}</span>
              </p>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              <Section id="s-name" title="Draft name">
                {/* Written per keystroke, and that is fine for this one setting:
                    a name is the one thing nothing derives from, so it does not
                    rebuild the board. */}
                <input
                  type="text"
                  value={league.name || ''}
                  maxLength={40}
                  placeholder="Untitled mock"
                  disabled={locked}
                  aria-labelledby="s-name"
                  onChange={(e) => patch({ name: e.target.value })}
                  className={`h-11 w-full rounded-[10px] bg-v2-inset px-3 text-[16px] text-v2-ink ring-1 ring-inset ring-white/[0.1] placeholder:text-v2-ink3 ${focusRing} disabled:opacity-60`}
                />
              </Section>

              <Section id="s-type" title="Draft type">
                <Choices
                  label="Draft type"
                  wide
                  options={safe(() => engine.draftTypes(), [])}
                  value={league.draftType}
                  disabled={locked}
                  onChange={(k) => { setUnavailable(null); patch({ draftType: k }) }}
                  onUnavailable={setUnavailable}
                />
                {unavailable && (
                  <p className="mt-3 rounded-[10px] bg-v2-warn/[0.08] px-3 py-2 text-[12px] leading-[1.5] text-v2-warn ring-1 ring-inset ring-v2-warn/25">
                    {unavailable.note}
                  </p>
                )}
              </Section>

              {/* Absent rather than disabled on a linear draft: a reversal of a
                  snake is not a setting with an off state in a draft that has
                  no snake. */}
              {league.draftType === 'snake' && (
                <Section
                  id="s-3rr"
                  title="Third round reversal"
                  hint="Round three repeats round two's direction instead of flipping back, then it snakes normally."
                  action={
                    <Switch
                      checked={!!league.thirdRoundReversal}
                      disabled={locked}
                      label="Third round reversal"
                      onChange={() => patch({ thirdRoundReversal: !league.thirdRoundReversal })}
                    />
                  }
                />
              )}

              <Section id="s-scoring" title="Scoring · for rankings">
                <div role="radiogroup" aria-labelledby="s-scoring" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {Object.keys(names).map((key) => {
                    const on = league.scoring === key
                    const preset = safe(() => engine.scoringPreset(key))
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={locked}
                        onClick={() => patch({ scoring: key })}
                        className={`flex min-h-[48px] items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${focusRing} ${
                          on ? 'bg-v2-volt/[0.1] ring-1 ring-inset ring-v2-volt/50' : 'bg-v2-inset ring-1 ring-inset ring-white/[0.07] hover:ring-white/[0.16]'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ring-2 ring-inset ${on ? 'bg-v2-volt ring-v2-volt' : 'ring-v2-ink3'}`} aria-hidden="true">
                          {on && <span className="h-1.5 w-1.5 rounded-full bg-v2-voltInk" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[14px] font-medium text-v2-ink">{names[key]}</span>
                          {on && preset && preset.note && <span className="mt-1 block text-[12px] leading-[1.45] text-v2-ink2">{preset.note}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Section>

              <Section id="s-teams" title="Teams">
                <Choices
                  label="Teams"
                  options={safe(() => engine.teamCounts(), []).map((n) => ({ key: n, label: String(n) }))}
                  value={league.teams}
                  disabled={locked}
                  onChange={(n) => patch({ teams: n })}
                />
              </Section>

              <Section
                id="s-pool"
                title="Available players"
                /* The count is the honest half of offering this: rookies-only is
                   a three-round draft, and setupProblem() will refuse fourteen
                   with no clue why unless the number sits beside the choice. */
                hint={`${safe(() => engine.poolSize(), '—')} players on the board under this setting.`}
              >
                <Choices
                  label="Available players"
                  wide
                  options={safe(() => engine.playerPools(), [])}
                  value={league.playerPool}
                  disabled={locked}
                  onChange={(k) => patch({ playerPool: k })}
                />
              </Section>

              <Section id="s-clock" title="Time per pick">
                {/* setClockLength(), not setLeague(): the clock is per-drafter
                    state rather than the board's shape. */}
                <Choices
                  label="Time per pick"
                  options={CLOCK}
                  value={safe(() => engine.clockLength(), 60)}
                  onChange={(n) => { engine.setClockLength(n); onChange() }}
                />
              </Section>

              <Section
                id="s-cpu"
                title="CPU autopick"
                hint="When your clock runs out, the CPU drafts for your seat. Off, the clock reaches 0:00 and the seat stays yours."
                action={
                  <Switch
                    checked={league.cpuAutopick !== false}
                    disabled={locked}
                    label="CPU autopick when the clock runs out"
                    onChange={() => patch({ cpuAutopick: league.cpuAutopick === false })}
                  />
                }
              />

              <Section id="s-roster" title="Roster" hint="Rounds follow the roster, so every press moves the draft's length with it.">
                <ul className="divide-y divide-white/[0.05] rounded-[12px] bg-v2-inset ring-1 ring-inset ring-white/[0.06]">
                  {rosterRows.map((r) => (
                    <li key={r.key} className="flex items-center gap-3 px-3 py-1.5">
                      {['FLEX', 'SFLEX', 'BN'].includes(r.key) ? (
                        <span className="inline-grid h-[20px] min-w-[30px] place-items-center rounded-[5px] bg-white/[0.05] px-1.5 font-mono text-[10px] font-semibold text-v2-ink2 ring-1 ring-inset ring-white/[0.1]">
                          {r.key === 'SFLEX' ? 'SF' : r.key}
                        </span>
                      ) : (
                        <PosChip pos={r.key} />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[14px] text-v2-ink">{SLOT_LABEL[r.key]}</span>
                      <Stepper
                        label={SLOT_LABEL[r.key]}
                        value={r.value}
                        max={r.max === undefined ? 9 : r.max}
                        disabled={locked}
                        onAdd={() => r.set(r.value + 1)}
                        onRemove={() => r.set(r.value - 1)}
                      />
                    </li>
                  ))}
                </ul>
                <p className="mt-3 flex items-baseline gap-2 text-[13px] text-v2-ink2">
                  <span className="font-telemetry text-[26px] font-bold italic leading-none tabular-nums text-v2-ink">{league.rounds}</span>
                  roster spots, so the draft runs {league.rounds} rounds.
                </p>
              </Section>

              <Section id="s-order" title="Draft order">
                <DraftOrderList engine={engine} league={league} onChange={onChange} />
              </Section>

              <Section id="s-rules" title="Scoring rules">
                <button
                  type="button"
                  aria-expanded={showRules}
                  aria-controls="v2-rule-editor"
                  onClick={() => setShowRules((v) => !v)}
                  className={`flex min-h-[48px] w-full items-center gap-3 rounded-[12px] bg-v2-inset px-3 py-2.5 text-left ring-1 ring-inset ring-white/[0.07] hover:ring-white/[0.16] ${focusRing}`}
                >
                  <Icon name="chevDown" className={`h-4 w-4 shrink-0 text-v2-ink2 transition-transform ${showRules ? '' : '-rotate-90'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-v2-ink">Edit all {ruleCount} scoring rules</span>
                    <span className="block text-[12px] text-v2-ink3">Every number rescores the board as you type it.</span>
                  </span>
                </button>
                <div id="v2-rule-editor">
                  {showRules && <ScoringEditor engine={engine} locked={locked} onChange={onChange} />}
                </div>
              </Section>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <p className="min-w-0 text-[12px] leading-[1.45] text-v2-ink3">
                Changes apply as you make them.
              </p>
              <button
                type="button"
                onClick={done}
                className={`inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-[11px] bg-v2-ink px-6 text-[14px] font-semibold text-v2-ground transition-transform hover:-translate-y-px ${focusRing} focus-visible:ring-offset-2 focus-visible:ring-offset-v2-panel`}
              >
                Done
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
