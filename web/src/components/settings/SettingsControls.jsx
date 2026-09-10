/* The Draft Settings screen's own control vocabulary.

   Five shapes, and the screen is built from nothing else: a labelled
   section, a row of pills, a row of circles, a switch, and a stepper. They
   live here rather than inside DraftSettingsModal.jsx because that file
   already carries the roster, the 49-rule scoring editor and a room's seat
   order — adding five more component definitions to it would put the
   vocabulary and the vocabulary's dozen uses in one 900-line file, and the
   sections are much easier to read against a short list of primitives than
   against a long one.

   Every one of them takes `disabled` and means the same thing by it: this
   draft has started, or it is a room whose shape everybody has to agree
   on. A disabled control here is deliberately still VISIBLE and still
   readable — the value it is showing is a fact about the draft you are in,
   which is worth being able to look up, and hiding it would make the
   screen change shape depending on when you opened it.
*/

import { Check } from 'lucide-react'

/* A section's own heading. `hint` is the small line under it that some of
   Sleeper's carry ("Reverses the direction of the snake draft starting
   from the third round") — it takes the sentence rather than the section
   restating it, because a heading in caps at 11px cannot hold one. */
export function Section({ icon: Icon, title, hint, action, children }) {
  return (
    <section className="border-b border-slate-rule/50 px-4 py-5 last:border-b-0">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-plex text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />}
            {title}
          </h3>
          {hint && <p className="mt-1.5 max-w-[46ch] text-meta leading-snug text-ink-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/* A row of wide pills — SNAKE / LINEAR / AUCTION, ALL / ROOKIES / VETS.
   Each carries a caption under its label, which is the whole reason this is
   not a segmented control: "Serpentine" and "Non-snaking" are what make the
   two words above them mean anything to somebody who has not drafted before.

   An unavailable option is rendered, dimmed, and says why on press rather
   than being hidden. See DRAFT_TYPES in app.js for the argument: a screen
   showing two options where the category has three tells a visitor the
   product does not know about the third. */
export function PillGroup({ options, value, onChange, disabled, onUnavailable }) {
  return (
    <div className="flex gap-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((o) => {
        const active = o.key === value
        const off = disabled || o.available === false
        return (
          <button
            key={o.key}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => (o.available === false ? onUnavailable && onUnavailable(o) : onChange(o.key))}
            className={
              'flex min-h-[54px] flex-1 shrink-0 basis-0 flex-col items-center justify-center rounded-full border px-3 transition-colors duration-150 ' +
              (active
                ? 'border-teal-400 bg-teal-500/15'
                : off
                  ? 'border-slate-rule/70 bg-transparent opacity-45'
                  : 'border-slate-rule bg-transparent')
            }
          >
            <span className={'font-display text-[17px] font-bold uppercase tracking-[0.02em] ' + (active ? 'text-teal-300' : 'text-ink')}>
              {o.label}
            </span>
            {o.sub && <span className="text-[11px] leading-tight text-ink-muted">{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* A row of circles — team counts, seconds per pick. Scrolls sideways rather
   than wrapping, because the values are ordered and a wrapped grid loses
   that: 4 6 8 10 12 / 14 16 18 reads as two groups rather than one scale.

   `sub` sits under the number inside the circle ("Secs", "Limit"), which is
   what lets "NO / Limit" and "10 / Secs" share one row without the row
   needing a unit label of its own. */
export function CircleGroup({ options, value, onChange, disabled }) {
  return (
    <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((o) => {
        const active = o.key === value
        return (
          <button
            key={String(o.key)}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(o.key)}
            className={
              'flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center rounded-full border transition-colors duration-150 ' +
              (active ? 'border-teal-400 bg-teal-500/15' : 'border-slate-rule') +
              (disabled ? ' opacity-45' : '')
            }
          >
            <span className={'font-display text-[19px] font-bold leading-none tabular-nums ' + (active ? 'text-teal-300' : 'text-ink')}>
              {o.label}
            </span>
            {o.sub && <span className="mt-[3px] text-[10px] leading-none text-ink-muted">{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* The switch. A real <button role="switch"> rather than a styled checkbox,
   for the reason every other toggle in this app is one: a checkbox needs
   its own label association to be pressable at the size a thumb wants, and
   a button is pressable by being the size a thumb wants.

   44px of hit box around a 30px pill — the same "a 44px hit box around a
   visibly smaller control" the Cockpit header already documents. */
export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={'relative flex h-11 w-[58px] shrink-0 items-center justify-center' + (disabled ? ' opacity-45' : '')}
    >
      <span
        className={
          'relative block h-[30px] w-[52px] rounded-full transition-colors duration-200 ' +
          (checked ? 'bg-teal-500' : 'bg-slate-rule')
        }
      >
        <span
          className="absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-[left] duration-200"
          style={{ left: checked ? 25 : 3 }}
        />
      </span>
    </button>
  )
}

/* A radio row — the scoring presets. A tick in a filled circle when
   selected, a ring when not, which is the one place on this screen a
   control is round and small: these are mutually exclusive named things
   rather than a scale, so neither a pill row (too wide for five) nor a
   circle row (a name does not fit in one) is the right shape.

   `note` is the caveat a preset carries, and it renders under the selected
   one only. Under all five it would be a wall; under none it would be the
   superflex board quietly drawing full-PPR quarterback ADP with nothing on
   screen to say so. */
export function RadioRow({ label, note, selected, onSelect, disabled }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={'flex w-full items-start gap-3 py-2.5 text-left' + (disabled ? ' opacity-45' : '')}
    >
      <span
        className={
          'mt-[1px] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150 ' +
          (selected ? 'border-teal-400 bg-teal-500' : 'border-teal-400/45')
        }
      >
        {selected && <Check className="h-[15px] w-[15px] text-obsidian" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-ink">{label}</span>
        {selected && note && (
          <span className="mt-1 block max-w-[46ch] text-[12px] leading-snug text-ink-muted">{note}</span>
        )}
      </span>
    </button>
  )
}

/* The roster stepper. A minus, a number, a plus — the reference app's own
   shape, and the reason it is not a <select> is that a roster is edited by
   nudging rather than by choosing: somebody adding a flex is going from 1
   to 2, not picking 2 out of ten possibilities.

   The bounds are real refusals rather than clamps applied after the fact,
   which is what makes a greyed minus at zero honest — there is nothing
   below it to reach. */
export function Stepper({ value, onAdd, onRemove, disabled, min = 0, max = 9 }) {
  const btn =
    'flex h-9 w-9 items-center justify-center rounded-full text-[19px] leading-none transition-colors duration-150 ' +
    'disabled:cursor-not-allowed disabled:opacity-30'
  return (
    <span className="flex items-center gap-1 rounded-full bg-slate-sunk px-1 py-1">
      <button
        type="button" onClick={onRemove} disabled={disabled || value <= min}
        aria-label="One fewer" title="One fewer"
        className={btn + ' bg-white/90 text-obsidian'}
      >
        &minus;
      </button>
      <span className="w-7 text-center font-display text-[16px] font-bold tabular-nums text-ink">{value}</span>
      <button
        type="button" onClick={onAdd} disabled={disabled || value >= max}
        aria-label="One more" title="One more"
        className={btn + ' bg-white/90 text-teal-600'}
      >
        +
      </button>
    </span>
  )
}
