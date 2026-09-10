import { useReducer } from 'react'

const CLOCK_OPTIONS = [30, 60, 90, 120, 180]

// This card's own row select — label left, value right, matching the
// existing static rows exactly except the value is now live. Not
// DraftSettingsModal.jsx's Select: that one is a modal-row look, this is
// a card-row look, and the two files have never shared a component for
// the same reason a board card and a table row don't share one either.
function RowSelect({ value, onChange, disabled, options }) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      /* flex-none w-auto, font-body: style.css's legacy `select { flex: 1;
         width: 100%; font-family: var(--font-body); ... }` is a bare-tag
         rule with no scoping, and style.css is loaded globally on this same
         page (index.html, alongside app.js) — so it reaches every <select>
         React renders too, this one included. flex-none overrides the
         flex-basis:0%/flex-grow:1 that rule resolves to (a class beats a
         tag on specificity); w-auto overrides its width:100%; font-body
         restores this project's real body face rather than leaving
         --font-body, a token this file never declares, to decide it.
         text-base (16px) below lg is CLAUDE.md's iOS-zoom floor for any
         field a touch screen can focus — this row is visible at every
         width (unlike the chips below, which are lg:hidden), so the floor
         applies even though lg desktops don't need it. */
      className="w-auto flex-none rounded-md border border-transparent bg-transparent py-0.5 text-right font-body text-base font-semibold tabular-nums text-white outline-none transition-colors hover:border-white/10 focus:border-teal-400/50 disabled:cursor-not-allowed disabled:text-white/30 lg:text-sm"
    >
      {/* bg-slate-panel on every option, not just the select: the open
         popup is native chrome the select's own background doesn't reach,
         and defaults to a light surface regardless of what's set here —
         with no background of its own, this row's white text landed on
         that light default and read as blank. TeamTab.jsx's own compact
         seat picker already carries the identical fix for the identical
         reason. */}
      {options.map((o) => <option key={o.value} value={o.value} className="bg-slate-panel">{o.label}</option>)}
    </select>
  )
}

// The mobile chip, made interactive. Deliberately text-base (16px), not
// the [12.5px] the static chips beside it still use — CLAUDE.md is
// explicit that anything a touch screen can focus has to clear that
// floor or iOS zooms the page in on tap and never zooms back out. A
// visual mismatch against the read-only Rounds chip is the honest
// trade-off, not a bug to "fix" back down.
function ChipSelect({ value, onChange, disabled, options }) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      /* flex-none w-auto — see RowSelect's own comment on style.css's
         global `select { flex: 1; width: 100%; ... }` leaking into every
         React select on this page. Measured before this fix: all four
         chips collapsed to an identical 42.875px (just the dropdown
         arrow's worth), because flex-basis:0% throws away a select's
         content width entirely and flex-grow:1 then splits whatever space
         "14 rounds" (an ordinary span, untouched by a tag rule that only
         names `select`) left over. Every chip read as a single truncated
         letter — "1", "H", "S", "6" — instead of "10 teams", "Half PPR",
         "Seat 1", "60s clock". shrink-0 alone (the first fix tried) wasn't
         enough: it silenced the shrink half of the leak but left
         flex-grow/flex-basis still pulling from the tag rule. */
      className="w-auto flex-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-[7px] font-numeral tabular-nums text-base text-white/80 outline-none transition-colors focus:border-teal-400/50 disabled:cursor-not-allowed disabled:text-white/30"
    >
      {/* bg-slate-panel — see RowSelect's own comment. The open popup is
         native chrome this select's own background never reaches. */}
      {options.map((o) => <option key={o.value} value={o.value} className="bg-slate-panel">{o.label}</option>)}
    </select>
  )
}

// The screen's one primary action, moved here from LobbyBar.jsx verbatim —
// same gradient, same disabled/problem handling — per the design's own fix
// for the two-primaries bug (LobbyBar's old "Enter Draft Room" and
// DraftLocker's own EmptyState button wearing the identical gradient for
// the identical job). One launcher, one gradient button, on this one panel.
// "Draft with friends" beneath it is deliberately a text link rather than a
// second gradient button — the same rule, applied to itself: this card
// still has exactly one thing shouting for attention.
//
// w-full, no fixed width: this panel used to carry a hardcoded 396px, from
// when it sat in a flex row beside TendenciesStrip. The analytics grid
// rebuild gives it its own grid cell (spanning two rows, since it's taller
// than any chart card beside it) instead, so its width is whatever that
// cell is — full-bleed below lg for the same reason it always was: 396px
// on its own is wider than a 375-390px phone outright. justify-center
// spreads its rows/button out across the taller spanned cell rather than
// leaving a slab of empty card beneath the button.
export default function NewMockPanel({
  engine,
  league,
  problem,
  lobbySlot,
  roomActive,
  onSetLobbySlot,
  onStartNew,
  onOpenSettings,
  onDraftWithFriends,
}) {
  // engine.setLeague()/setClockLength() mutate a plain object rather than
  // React state, so a click here has to force its own repaint rather than
  // wait on a "juke:header" tick that may land a frame later — the exact
  // reason DraftSettingsModal.jsx's own redraw() exists, copied rather than
  // reinvented.
  const [, redraw] = useReducer((x) => x + 1, 0)

  const scoringNames = engine.scoringNames()
  const clockLength = engine.clockLength()

  // League shape is locked the moment a room exists — the same rule
  // DraftSettingsModal.jsx enforces on these identical fields, for the
  // identical reason: every seat in a room has to agree on the board the
  // CPU wobble reads, and a guest quietly rebuilding it out from under the
  // draft is exactly the bug CLAUDE.md's "everything the room decides has
  // to be locked" section exists to prevent. Seat is locked with them here
  // too: in a room, mySlot comes from claiming a chair on the board, not
  // from this card, so an editable seat select would be a live-looking
  // control that does nothing.
  const locked = !!roomActive

  const teamOptions = engine.teamCounts().map((n) => ({ value: n, label: String(n) }))
  const scoringOptions = Object.entries(scoringNames).map(([k, v]) => ({ value: k, label: v }))
  const seatOptions = Array.from({ length: league.teams }, (_, i) => ({ value: i + 1, label: String(i + 1) }))
  const clockOptions = CLOCK_OPTIONS.map((n) => ({ value: n, label: `${n}s` }))

  const chipTeamOptions = engine.teamCounts().map((n) => ({ value: n, label: `${n} teams` }))
  const chipScoringOptions = Object.entries(scoringNames).map(([k, v]) => ({ value: k, label: v }))
  const chipSeatOptions = Array.from({ length: league.teams }, (_, i) => ({ value: i + 1, label: `Seat ${i + 1}` }))
  const chipClockOptions = CLOCK_OPTIONS.map((n) => ({ value: n, label: `${n}s clock` }))

  const setTeams = (e) => { engine.setLeague({ teams: Number(e.target.value) }); redraw() }
  const setScoring = (e) => { engine.setLeague({ scoring: e.target.value }); redraw() }
  const setSeat = (e) => onSetLobbySlot(Number(e.target.value) - 1)
  const setClock = (e) => { engine.setClockLength(e.target.value); redraw() }

  return (
    <div
      className="flex h-full w-full flex-col justify-center rounded-xl border border-white/[0.09] p-[22px]"
      style={{ background: 'linear-gradient(168deg, #171d28, #10141c)' }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-[23px] font-bold text-white">New mock draft</h2>
        <button
          type="button"
          onClick={onOpenSettings}
          className="text-sm font-semibold text-teal-300 transition-colors hover:text-teal-200"
        >
          Edit setup
        </button>
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-white/[0.06] lg:block">
        <div className="flex flex-col gap-px">
          <div className="flex items-center justify-between bg-white/[0.02] px-[14px] py-[11px]">
            <span className="text-xs text-white/50">Teams</span>
            <RowSelect value={league.teams} onChange={setTeams} disabled={locked} options={teamOptions} />
          </div>
          <div className="flex items-center justify-between bg-white/[0.02] px-[14px] py-[11px]">
            <span className="text-xs text-white/50">Scoring</span>
            <RowSelect value={league.scoring} onChange={setScoring} disabled={locked} options={scoringOptions} />
          </div>
          <div className="flex items-center justify-between bg-white/[0.02] px-[14px] py-[11px]">
            <span className="text-xs text-white/50">Seconds per pick</span>
            <RowSelect value={clockLength} onChange={setClock} disabled={locked} options={clockOptions} />
          </div>
          <div
            className="flex items-center justify-between bg-white/[0.02] px-[14px] py-[11px]"
            title="Follows your roster size — add or remove a slot on the Roster tab of Edit setup"
          >
            <span className="text-xs text-white/50">Rounds</span>
            <span className="font-semibold tabular-nums text-white">{league.rounds}</span>
          </div>
          <div className="flex items-center justify-between bg-white/[0.02] px-[14px] py-[11px]">
            <span className="text-xs text-white/50">Your seat</span>
            <RowSelect value={lobbySlot + 1} onChange={setSeat} disabled={locked} options={seatOptions} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 lg:hidden">
        <ChipSelect value={league.teams} onChange={setTeams} disabled={locked} options={chipTeamOptions} />
        <ChipSelect value={league.scoring} onChange={setScoring} disabled={locked} options={chipScoringOptions} />
        <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-[7px] font-numeral tabular-nums text-[12.5px] text-white/80">
          {league.rounds} rounds
        </span>
        <ChipSelect value={lobbySlot + 1} onChange={setSeat} disabled={locked} options={chipSeatOptions} />
        <ChipSelect value={clockLength} onChange={setClock} disabled={locked} options={chipClockOptions} />
      </div>

      {/* Disabled with the reason beside it, never disabled and silent —
          setupProblem()'s message is the whole explanation and hiding it
          leaves a button that refuses without saying why. Same rule
          LobbyBar.jsx enforced before this control lived here.
          py-[15px]: 15+15+24 (text-base's own line-height) = 54px, the
          primary-CTA floor, on every width — not a mobile-only bump, since
          the same button is the same element at both sizes. */}
      <button
        type="button"
        onClick={onStartNew}
        disabled={!!problem}
        title={problem || undefined}
        className={
          'mt-4 w-full rounded-full py-[15px] text-base font-bold transition-all duration-200 ' +
          (problem
            ? 'cursor-not-allowed bg-white/5 text-white/25'
            : 'bg-cta text-white shadow-glass hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(0,229,255,0.4)]')
        }
        /* data-start-draft is a hook for the phone suite. This label has
           moved three times — "Enter Draft Room", then "Start draft", then
           "Start mock draft" — and each move failed a test about something
           else; phone.spec.mjs still carries a regex of every name it has
           ever had. An attribute says what the button IS. */
        data-start-draft
      >
        {/* roomActive: this button doesn't start anything in a room — it
            calls enterDraftRoom() (DraftRoom.jsx's handleStartNew) and
            just navigates to the seat picker. RoomPanel.jsx already uses
            the honest label, "Enter draft room", for the identical action;
            this was the one place still calling it "Start mock draft"
            after a host closed the "Draft with friends" modal without
            using that panel's own button. */}
        {roomActive ? 'Enter draft room' : 'Start mock draft'}
      </button>
      {problem && <p className="mt-2 text-[11px] leading-relaxed text-rose-300/90">{problem}</p>}

      {/* px-3 py-2.5, not a bare text link — the old version had no
          padding of its own at all, so its clickable area was exactly the
          text's own glyph box and its only hover feedback was a small
          color shift. rounded-lg + hover:bg gives it the same "clearly a
          control" affordance the Copy/Sit here/Leave buttons elsewhere on
          this screen already have, at a visibly lighter weight than the
          gradient CTA above it — the point isn't to compete with that
          button, just to stop being invisible until the exact moment a
          cursor already knows to click it. */}
      <button
        type="button"
        onClick={onDraftWithFriends}
        disabled={!!problem}
        title={problem || undefined}
        className={
          'mt-3 rounded-lg px-3 py-2.5 text-center text-sm font-semibold transition-colors duration-200 ' +
          (problem
            ? 'cursor-not-allowed text-white/20'
            : 'text-teal-300 hover:bg-teal-400/10 hover:text-teal-200')
        }
      >
        Draft with friends instead →
      </button>
    </div>
  )
}
