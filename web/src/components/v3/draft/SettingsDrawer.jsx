import { useEffect, useRef, useState } from 'react'
import { safe, useDialogFocus } from '../../v2/draft/draftKit.jsx'
import { Headline, Label, PosTag, cx } from '../ui.jsx'
import { Choices, FOCUS, Glyph, Problem, Stepper, Switch } from './kit.jsx'

/* Draft settings, as a drawer off the launcher — every control production's
   settings screen has, through the same bridge calls: setLeague(),
   setMySlot(), randomizeOrder(), swapSeats(), setClockLength(),
   setScoringRule(), resetScoringRules(). Every option list comes off the
   engine (draftTypes(), playerPools(), teamCounts(), scoringNames(),
   scoringPreset(), scoringEditor(), draftOrder(), lineup()). A second idea
   of what a league is, living in web/src, is the superflex bug again.

   ---- Done is a dismiss, not a commit ----

   Each control writes the one real `league` the moment it is pressed, which
   is what keeps the launcher's summary, the board and setupProblem()
   agreeing with the screen while somebody is still reading it. Done guards
   the one thing worth guarding: it will not close onto a Start button that
   cannot press, and says which setting is why.

   ---- In a room ----

   Locked, for the host too: every client has to agree on the board the CPU
   wobble reads, so a room's shape is fixed the moment it exists. The pick
   clock is per-drafter and stays open. */

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

function Section({ title, hint, action, children, id }) {
  return (
    <section className="border-b border-v3-rule px-5 py-5 last:border-b-0" aria-labelledby={id}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label as="h3" className="block" >
            <span id={id}>{title}</span>
          </Label>
          {hint && <p className="mt-1.5 max-w-[46ch] text-[13px] leading-[1.5] text-v3-ink2">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/* "1 point every N yards" commits on blur, never per keystroke:
   pointsFromDivisor(0) scores the stat at zero rather than refusing, so
   typing "0" on the way to "10" would rescore the board with a free stat on
   every keystroke. ScoringRules.jsx's own finding, kept. */
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
      className={cx('h-10 w-16 rounded-[4px] border border-v3-rule bg-v3-sheet px-2 text-right font-figure text-[16px] tabular-nums text-v3-ink disabled:bg-v3-well disabled:text-v3-ink3', FOCUS)}
    />
  )
}

function ScoringEditor({ engine, locked, onChange }) {
  const groups = safe(() => engine.scoringEditor(), [])
  return (
    <div className="mt-4 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] leading-[1.5] text-v3-ink2">
          Every number rescores the whole board as you change it — projections, value over replacement and the Juke score with it.
        </p>
        <button
          type="button"
          disabled={locked}
          onClick={() => { engine.resetScoringRules(); onChange() }}
          className={cx('min-h-[40px] shrink-0 rounded-[4px] border border-v3-rule bg-v3-sheet px-3 text-[13px] font-semibold text-v3-ink hover:border-v3-ink3 disabled:cursor-not-allowed disabled:text-v3-ink3', FOCUS)}
        >
          Reset
        </button>
      </div>
      {groups.map((g) => (
        <div key={g.title}>
          <Label>{g.title}</Label>
          <div className="mt-1.5 divide-y divide-v3-rule overflow-hidden rounded-[4px] border border-v3-rule">
            {g.rules.map((rule) => (
              <label key={rule.key} className="flex items-center justify-between gap-3 bg-v3-sheet px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-[14px] text-v3-ink">{rule.label}</span>
                  {rule.historyOnly && <span className="block text-[12px] leading-snug text-v3-ink3">Scores past seasons; does not move this projection</span>}
                </span>
                {rule.perYard ? (
                  <span className="flex shrink-0 items-center gap-1.5 font-figure text-[12px] text-v3-ink2">
                    1 pt /
                    <DivisorInput rule={rule} disabled={locked} onCommit={(n) => { engine.setScoringRule(rule.key, n, true); onChange() }} />
                    yds
                  </span>
                ) : (
                  <input
                    type="number" step="0.5" min="-99" max="99" value={rule.value} disabled={locked}
                    onChange={(e) => { engine.setScoringRule(rule.key, e.target.value); onChange() }}
                    className={cx('h-10 w-20 shrink-0 rounded-[4px] border border-v3-rule bg-v3-sheet px-2 text-right font-figure text-[16px] tabular-nums text-v3-ink disabled:bg-v3-well disabled:text-v3-ink3', FOCUS)}
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

/* Draft order. Solo it is one question — which chair is yours — because the
   other chairs are CPU teams drafting to one rule and permuting them changes
   nothing anybody can see; Randomize moves one seat and a row takes that
   seat. In a room it is the host arranging real people through swapSeats(),
   the only door the room exposes. */
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
        <p className="max-w-[40ch] flex-1 text-[13px] leading-[1.5] text-v3-ink2">{hint}</p>
        {canOrder && (
          <button type="button" onClick={randomize} className={cx('inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-[4px] border border-v3-rule bg-v3-sheet px-3 text-[14px] font-semibold text-v3-ink hover:border-v3-ink3', FOCUS)}>
            <Glyph name="shuffle" className="h-4 w-4" /> Randomize
          </button>
        )}
      </div>
      <ol className="divide-y divide-v3-rule overflow-hidden rounded-[4px] border border-v3-rule">
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
          const chosen = r.you || isHeld
          return (
            <li key={r.slot}>
              <button
                type="button"
                disabled={!canOrder}
                onClick={press}
                aria-pressed={chosen}
                className={cx('flex min-h-[48px] w-full items-center gap-3 px-3 py-2 text-left transition-colors disabled:cursor-default', FOCUS, chosen ? 'bg-v3-band text-white' : 'bg-v3-sheet hover:bg-v3-paper')}
              >
                <span className={cx('w-6 shrink-0 text-right font-figure text-[13px] font-bold tabular-nums', chosen ? 'text-white' : 'text-v3-ink3')}>{r.slot + 1}</span>
                <Glyph name={r.you ? 'person' : 'cpu'} className={cx('h-5 w-5 shrink-0', chosen ? 'text-white' : 'text-v3-ink3')} />
                <span className="min-w-0 flex-1">
                  <span className={cx('block truncate text-[14px] font-semibold', chosen ? 'text-white' : 'text-v3-ink')}>{r.name}</span>
                  <span className={cx('block font-figure text-[12px]', chosen ? 'text-v3-bandInk' : 'text-v3-ink3')}>
                    Position {r.slot + 1}{r.firstPick ? ` · first pick #${r.firstPick}` : ''}
                  </span>
                </span>
                {r.you && <span className="shrink-0 font-figure text-[11px] font-bold uppercase tracking-[0.12em] text-white">Your seat</span>}
                {r.open && <span className="shrink-0 font-figure text-[11px] uppercase tracking-[0.1em] text-v3-ink3">Open</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default function SettingsDrawer({ open, engine, onClose, onChange }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const [blocked, setBlocked] = useState('')
  const [unavailable, setUnavailable] = useState(null)
  const [showRules, setShowRules] = useState(false)

  useDialogFocus(open, onClose, panelRef, closeRef)
  useEffect(() => { if (open) { setBlocked(''); setUnavailable(null) } }, [open])

  const league = engine ? safe(() => engine.league()) : null
  const lineup = engine ? safe(() => engine.lineup()) : null
  if (!open || !engine || !league || !lineup) return null

  const problem = safe(() => engine.setupProblem(), '')
  const locked = !!safe(() => engine.hasRoom(), false)
  const patch = (p) => { engine.setLeague(p); setBlocked(''); onChange() }
  const done = () => {
    const why = safe(() => engine.setupProblem(), '')
    if (why) { setBlocked(why); return }
    onClose()
  }

  const names = safe(() => engine.scoringNames(), {})
  const ruleCount = safe(() => engine.scoringEditor().reduce((n, g) => n + g.rules.length, 0), 0)

  const rosterRows = [
    ...['QB', 'RB', 'WR', 'TE'].map((pos) => ({ key: pos, value: lineup.starters[pos] || 0, set: (n) => patch({ starters: { ...lineup.starters, [pos]: n } }) })),
    { key: 'FLEX', value: lineup.flex, max: 3, set: (n) => patch({ flex: n }) },
    { key: 'SFLEX', value: lineup.superflex, max: 1, set: (n) => patch({ superflex: n }) },
    ...['K', 'DST'].map((pos) => ({ key: pos, value: lineup.starters[pos] || 0, set: (n) => patch({ starters: { ...lineup.starters, [pos]: n } }) })),
    { key: 'BN', value: lineup.bench, max: 15, set: (n) => patch({ bench: n }) },
  ]

  const message = locked
    ? 'This room is set — every seat has to agree on the same board, so its shape is fixed from the moment the room exists. Make a new room to change it.'
    : (problem || blocked || '')

  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <style>{'@keyframes v3drawer{from{transform:translateX(32px);opacity:.4}to{transform:none;opacity:1}}'}</style>
      <div className="absolute inset-0 bg-v3-shade/40" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="v3-settings-title"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col bg-v3-sheet shadow-[-24px_0_48px_-24px_rgb(var(--v3-shade)/0.35)] focus:outline-none motion-safe:animate-[v3drawer_200ms_ease-out]"
      >
        <div className="flex min-h-[38px] items-center justify-between gap-3 bg-v3-band px-5 pt-[env(safe-area-inset-top)] text-white">
          <span className="font-figure text-[12px] font-bold uppercase tracking-[0.14em]">Draft settings</span>
          <span className="truncate font-figure text-[12px] uppercase tracking-[0.1em] text-v3-bandInk">Applies as you change it</span>
        </div>
        <div className="flex items-start justify-between gap-4 border-b border-v3-rule px-5 py-4">
          <div className="min-w-0">
            <Headline as="h2" size="block" id="v3-settings-title">The next mock&apos;s shape</Headline>
            <p className="mt-1 truncate font-figure text-[13px] text-v3-ink2">{safe(() => engine.settingsText(league), '')}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close draft settings" className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[4px] border border-v3-rule text-v3-ink hover:border-v3-ink3', FOCUS)}>
            <Glyph name="close" className="h-5 w-5" />
          </button>
        </div>

        {message && <div className="border-b border-v3-rule px-5 py-3"><Problem text={message} /></div>}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section id="s-name" title="Draft name">
            {/* Per keystroke, and fine for this one setting: a name is the one
                thing nothing derives from, so it does not rebuild the board. */}
            <input
              type="text"
              value={league.name || ''}
              maxLength={40}
              placeholder="Untitled mock"
              disabled={locked}
              aria-labelledby="s-name"
              onChange={(e) => patch({ name: e.target.value })}
              className={cx('h-11 w-full rounded-[4px] border border-v3-rule bg-v3-sheet px-3 text-[16px] text-v3-ink placeholder:text-v3-ink3 disabled:bg-v3-well', FOCUS)}
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
            {unavailable && <Problem className="mt-3" text={unavailable.note} />}
          </Section>

          {/* Absent rather than disabled on a linear draft: a reversal of a
              snake is not a setting with an off state in a draft with no snake. */}
          {league.draftType === 'snake' && (
            <Section
              id="s-3rr"
              title="Third round reversal"
              hint="Round three repeats round two's direction instead of flipping back, then it snakes normally."
              action={<Switch hideLabel label="Third round reversal" checked={!!league.thirdRoundReversal} disabled={locked} onChange={() => patch({ thirdRoundReversal: !league.thirdRoundReversal })} />}
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
                    className={cx('flex min-h-[48px] items-start gap-3 rounded-[4px] border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed', FOCUS, on ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet hover:border-v3-ink3')}
                  >
                    <span className={cx('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2', on ? 'border-white' : 'border-v3-ink3')} aria-hidden="true">
                      {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className={cx('block text-[14px] font-semibold', on ? 'text-white' : 'text-v3-ink')}>{names[key]}</span>
                      {on && preset && preset.note && <span className="mt-1 block text-[13px] leading-[1.45] text-v3-bandInk">{preset.note}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </Section>

          <Section id="s-teams" title="Teams">
            <Choices label="Teams" options={safe(() => engine.teamCounts(), []).map((n) => ({ key: n, label: String(n) }))} value={league.teams} disabled={locked} onChange={(n) => patch({ teams: n })} />
          </Section>

          <Section
            id="s-pool"
            title="Available players"
            // The count is the honest half of offering this: rookies-only is a
            // three-round draft, and setupProblem() refuses fourteen with no
            // clue why unless the number sits beside the choice.
            hint={`${safe(() => engine.poolSize(), '—')} players on the board under this setting.`}
          >
            <Choices label="Available players" wide options={safe(() => engine.playerPools(), [])} value={league.playerPool} disabled={locked} onChange={(k) => patch({ playerPool: k })} />
          </Section>

          <Section id="s-clock" title="Time per pick">
            {/* setClockLength(), not setLeague(): the clock is per-drafter, not the board's shape. */}
            <Choices label="Time per pick" options={CLOCK} value={safe(() => engine.clockLength(), 60)} onChange={(n) => { engine.setClockLength(n); onChange() }} />
          </Section>

          <Section
            id="s-cpu"
            title="CPU autopick"
            hint="When your clock runs out, the CPU drafts for your seat. Off, the clock reaches 0:00 and the seat stays yours."
            action={<Switch hideLabel label="CPU autopick when the clock runs out" checked={league.cpuAutopick !== false} disabled={locked} onChange={() => patch({ cpuAutopick: league.cpuAutopick === false })} />}
          />

          <Section id="s-roster" title="Roster construction" hint="Rounds follow the roster, so every press moves the draft's length with it.">
            <ul className="divide-y divide-v3-rule overflow-hidden rounded-[4px] border border-v3-rule">
              {rosterRows.map((r) => (
                <li key={r.key} className="flex items-center gap-3 bg-v3-sheet px-3 py-1.5">
                  {['FLEX', 'SFLEX', 'BN'].includes(r.key) ? (
                    <span className="inline-grid h-[22px] min-w-[34px] place-items-center rounded-[4px] border border-v3-rule bg-v3-well px-1.5 font-figure text-[12px] font-bold text-v3-ink">{r.key === 'SFLEX' ? 'SF' : r.key}</span>
                  ) : <PosTag pos={r.key} />}
                  <span className="min-w-0 flex-1 truncate text-[14px] text-v3-ink">{SLOT_LABEL[r.key]}</span>
                  <Stepper label={SLOT_LABEL[r.key]} value={r.value} max={r.max === undefined ? 9 : r.max} disabled={locked} onAdd={() => r.set(r.value + 1)} onRemove={() => r.set(r.value - 1)} />
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-baseline gap-2 text-[14px] text-v3-ink2">
              <span className="font-figure text-[24px] font-bold tabular-nums text-v3-ink">{league.rounds}</span>
              roster spots, so the draft runs {league.rounds} rounds.
            </p>
          </Section>

          <Section id="s-order" title="Draft order · your seat">
            <DraftOrderList engine={engine} league={league} onChange={onChange} />
          </Section>

          <Section id="s-rules" title="Scoring rules">
            <button
              type="button"
              aria-expanded={showRules}
              aria-controls="v3-rule-editor"
              onClick={() => setShowRules((v) => !v)}
              className={cx('flex min-h-[48px] w-full items-center gap-3 rounded-[4px] border border-v3-rule bg-v3-sheet px-3 py-2.5 text-left hover:border-v3-ink3', FOCUS)}
            >
              <Glyph name="chevDown" className={cx('h-4 w-4 shrink-0 text-v3-ink transition-transform motion-reduce:transition-none', showRules ? '' : '-rotate-90')} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-v3-ink">Edit all {ruleCount} scoring rules</span>
                <span className="block text-[13px] text-v3-ink2">Every number rescores the board as you type it.</span>
              </span>
            </button>
            <div id="v3-rule-editor">
              {showRules && <ScoringEditor engine={engine} locked={locked} onChange={onChange} />}
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-v3-rule px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          <p className="min-w-0 text-[13px] leading-[1.45] text-v3-ink2">Changes apply as you make them.</p>
          <button type="button" onClick={done} className={cx('inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-[6px] bg-v3-band px-6 text-[15px] font-semibold text-white hover:bg-v3-bandSoft', FOCUS)}>
            Done
          </button>
        </div>
      </aside>
    </div>
  )
}
