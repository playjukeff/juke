import { useEffect, useRef } from 'react'
import { Crosshair, Settings, X } from 'lucide-react'

// The phone-only cockpit header — replaces DraftCockpitHeader's 46px tablet
// bar below the new usePhoneWidth() line rather than growing a third mode
// into that file. DraftCockpitHeader's own bars stay exactly as they were
// for desktop (62px, unconditional) and tablet (46px, `lg:hidden`) —
// this is additive, mounted only from DraftRoomPhone.jsx.
//
// Every value here is a prop DraftRoom.jsx already computed for the
// existing header (code/myTurn/urgent/timeLeft/clockLength) — nothing is
// re-derived from the engine a second time, same rule PickClockBand's own
// header comment states.
function formatClock(seconds) {
  if (seconds == null) return '—:—'
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* The auto-pick ribbon's own height. 38px: the 28px pill inside it plus
   5px above and below. */
export const AUTOPICK_RIBBON_H = 38

/* ---- Why this header reports its own height ----

   Three things are pinned to it and all three have to agree: the board
   below is `fixed` at `top: headerH`, the sheet's ceiling is `innerHeight
   - headerH`, and this element is what actually decides it. Disagreement
   is silent in both directions — too small and the ribbon draws over the
   board's first round, too large and there is a band of dead page between
   the two.

   It was a hardcoded 106, and 106 is only right on a device with a notch.
   `pt-[env(safe-area-inset-top)]` is 0 on a phone without one and on every
   desktop browser, where the real header measures about 65 — so the board
   started 41px lower than the header ended, which is exactly the gap that
   showed up the first time this screen was looked at rather than reasoned
   about. Adding the ribbon would have made a second, independent version
   of the same guess.

   So it is measured. A ResizeObserver rather than a one-off read at mount,
   because the height genuinely changes while the screen is up: the ribbon
   appears and disappears with auto-pick, and the safe-area inset itself
   moves on rotation. `border-box` is the right box here — the header
   carries a bottom border and the board has to start below it, not on it. */
function useReportHeight(onHeight) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const report = () => onHeight(Math.round(el.getBoundingClientRect().height))
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
    // onHeight is a setState updater from the parent and is stable; listing
    // it would re-observe on every parent render for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ref
}

export default function CockpitHeaderPhone({
  code, myTurn, urgent, timeLeft, clockLength, onOpenMenu, onFindLive,
  autopick, onToggleAutopick, onHeight, over,
}) {
  const pct = clockLength ? Math.max(0, Math.min(100, (timeLeft / clockLength) * 100)) : 0
  const ref = useReportHeight(onHeight)

  return (
    <header ref={ref} className="fixed inset-x-0 top-0 z-40 shrink-0 border-b border-white/[0.06] bg-slate-bar pt-[env(safe-area-inset-top)]">
      <div className="flex items-center px-2 pt-1.5">
        {/* #/rooms/draft, not a modal — the same "back to your draft locker"
            destination DraftCockpitHeader's own chevron already uses.
            44px hit box around a visually smaller glyph, same trick that
            file's own header comment documents for every circular control
            below lg ("a 44px hit box around a visibly smaller pill"). */}
        <a
          href="#/rooms/draft"
          aria-label="Back to your draft locker"
          title="Back to your draft locker"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-ink-muted"
        >
          <X className="h-[19px] w-[19px]" />
        </a>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-[3px]">
          {/* A finished draft has no clock, and this used to run one anyway.

              The three states below were "your pick" and "somebody else's",
              with no case for "nobody's, it is over" — so closing the
              Insights report on a phone landed on the board under a header
              reading ON THE CLOCK / 0:55 for a draft with all 140 picks in
              it. headerInfo() has answered `over` and "Draft complete" for
              this all along; the desktop header reads it and this one drew
              its own clock instead. Reported as part of a content audit, and
              it is the same class as the rest of that audit rather than a
              layout bug: a true number in a sentence that is false. */}
          <span
            className={
              'font-plex text-[10px] font-semibold uppercase tracking-[0.12em] ' +
              (over ? 'text-teal-300' : myTurn ? 'text-teal-300' : 'text-ink-muted')
            }
          >
            {over ? 'DRAFT COMPLETE' : myTurn ? 'YOUR PICK' : 'ON THE CLOCK'}
          </span>
          {/* Over, the clock is dropped rather than frozen or dashed out:
              a 30px number is the loudest thing on this bar, and there is
              no number a finished draft wants there. The room code stays if
              there is one — that is still true, and still worth having. */}
          {!over && (
            <div className="flex items-baseline gap-2">
              <span
                className={
                  'font-display text-[30px] font-bold leading-none tabular-nums ' +
                  (urgent ? 'text-rose-300' : 'text-ink')
                }
              >
                {clockLength > 0 ? formatClock(timeLeft) : '—:—'}
              </span>
              {code && <span className="font-plex text-[11px] text-ink-muted">{code}</span>}
            </div>
          )}
          {over && code && <span className="font-plex text-[11px] text-ink-muted">{code}</span>}
        </div>

        {/* Jump to the live pick. The board is a real scroller in both axes
            — a 14-round, 10-team board is several screens tall and wider
            than a phone — so scrolling up to check round one used to be a
            one-way trip you undid by hand.

            This comment used to say the button was deliberately NOT an
            automatic follow, on the grounds that auto-scroll on every
            render is a bug this project shipped and removed once on the
            legacy board. Half of that is still true and it is the wrong
            half: what the legacy board removed was *unconditional*
            following, and what it replaced it with was `boardFollow` —
            follow until a person scrolls, then stop. A board that never
            follows at all was reported straight back, from a real phone
            draft with auto-pick on, as a draft happening off-screen.

            So the board follows (DraftBoardGrid's `followLive`) and this
            button is what re-arms it after a person has scrolled away. It
            is still the only control here, and it still cannot yank
            anybody anywhere: it only ever fires on a press. */}
        <button
          type="button"
          onClick={onFindLive}
          title="Jump to the current pick"
          aria-label="Jump to the current pick"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-ink-muted transition-colors active:text-teal-300"
        >
          <Crosshair className="h-[18px] w-[18px]" />
        </button>

        <button
          type="button"
          onClick={onOpenMenu}
          title="Draft menu"
          aria-label="Draft menu"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-ink-muted"
        >
          <Settings className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* mb-[10px] here, where this used to be pb-[10px] on the <header>
          itself. Same 10px and the same total height with the ribbon
          absent — but padding on the header would sit BELOW the ribbon
          when one is present, putting the gap on the wrong side of it. */}
      <div className="mx-2 mb-[10px] mt-2 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full bg-cta"
          style={{ width: pct + '%' }}
        />
      </div>

      {/* ---- The auto-pick ribbon ----
          Only when autopick is actually on, which is the whole feature: a
          permanently-present bar saying "auto-pick: off" is a row of
          furniture on the screen with the least vertical room in the app,
          and the state it would be reporting is the resting one.

          It lives inside this header rather than as a sibling below it
          because everything on this screen is `fixed` and stacked by hand —
          the board is pinned to the header's own height and the sheet's
          ceiling is measured from it, so a ribbon that were a separate
          fixed element would need both of those to know about it
          independently. One header, one height, and AUTOPICK_RIBBON_H
          above is how the other two find out.

          Teal on near-black for the button rather than a gradient: this is
          the tab/status idiom (a live state you can switch off), not the
          call-to-action idiom, and CLAUDE.md's own note on the two records
          exactly this mistake being made in the other direction. */}
      {autopick && (
        <div
          className="flex items-center gap-2.5 border-t border-white/[0.06] bg-teal-500/[0.07] px-3"
          style={{ height: AUTOPICK_RIBBON_H }}
        >
          <span
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-teal-400/40 font-plex text-[8px] font-semibold tracking-tight text-teal-300"
            aria-hidden="true"
          >
            AUTO
          </span>
          <span className="min-w-0 flex-1 truncate font-body text-meta font-semibold text-ink">
            You are on auto-pick.
          </span>
          <button
            type="button"
            onClick={onToggleAutopick}
            className="shrink-0 rounded-full bg-teal-500 px-3.5 py-[5px] font-body text-[11px] font-bold uppercase tracking-[0.06em] text-obsidian transition-transform active:scale-95"
          >
            Turn off
          </button>
        </div>
      )}
    </header>
  )
}
