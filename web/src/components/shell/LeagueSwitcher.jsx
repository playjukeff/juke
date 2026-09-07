import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { useLeague, noteLeagueConnected } from '../../hooks/useLeague.js'
import { useTier } from '../../hooks/useTier.js'
import { leagueCap } from '../../lib/tiers.js'
import { platformFor } from './leaguePlatforms.js'
import ConnectLeagueModal from './ConnectLeagueModal.jsx'
import DraftCountdown from './DraftCountdown.jsx'

/* The header's connected-league control: which one you are looking at, and
   how to look at another.

   ---- Why this replaced a link ----

   The chip was an `<a href="#/you">` drawing a hardcoded "S" on the first
   league in the list, and `connected_leagues` has been keyed
   (clerk_id, provider, league_id) since it was created — 0005's own
   comment says "a manager with two Sleeper leagues is the ordinary case
   rather than an edge". So the table held several, listLeagues() returned
   several, and the app drew exactly one with no way to reach the others.
   Reported by somebody wanting to run a real ESPN league alongside a
   Sleeper test league.

   ---- It is a menu at one league too, and that is deliberate ----

   A control that only appears once you have two of something cannot be how
   you get the second one. At one league the menu is that league plus
   "Connect another", which is the only discoverable path to a second one
   short of the You screen — and the You screen is not where somebody with
   the header in front of them will look.

   This is the opposite call from DraftLocker's back button, which is
   hidden when there is nothing behind it. The difference is what the
   control does: that one navigates somewhere that may not exist, this one
   offers an action that always does.

   ---- Desktop only, as the chip always was ----

   `sm:block`, unchanged. A phone's equivalent is the You screen's own
   list, which is a real screen rather than a narrower copy of this — the
   same split the rest of the shell makes. */

const BADGE =
  'grid h-[18px] w-[18px] shrink-0 place-items-center rounded font-display text-[11px] font-extrabold text-surface-page'

export default function LeagueSwitcher() {
  const { status, leagues, league, select } = useLeague()
  const { tier, status: tierStatus } = useTier()
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(null)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef(null)
  const modalRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // mousedown, not click: closing on the same click that opened it (the
    // trigger's own onClick toggles `open`) would race this listener over
    // which one runs first. Same reasoning as RoomsNavMenu.
    const onOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onOutside)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onOutside)
    }
  }, [open])

  // Nothing at all until the answer is in. A chip that appears a beat after
  // the header reads as the connection having only just happened, which is
  // the three-state rule useLeague() exists for.
  if (status !== 'connected' || !league) return null

  const active = platformFor(league.provider)

  const pick = async (next) => {
    setFailed(null)
    setBusy(true)
    const res = await select(next)
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      return
    }
    /* The menu stays open and says so. useLeague() has already put the
       previous order back, so the row that looks selected is the one that
       IS selected — a menu that closed on a failed switch would leave the
       header naming a league the next page load disagrees with. */
    setFailed(res.reason || 'error')
  }

  return (
    <div ref={wrapRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setFailed(null) }}
        aria-expanded={open}
        aria-haspopup="true"
        data-league-switcher
        className="inline-flex items-center gap-2 rounded-full border border-flow-pillEdge px-3 py-[7px] text-[13px] font-semibold text-voidInk-primary transition-colors duration-150 hover:border-teal/50"
      >
        <span className={BADGE} style={{ background: '#00E5FF' }}>
          {active.mark}
        </span>
        <span className="max-w-[22ch] truncate">{league.name}</span>
        <ChevronDown
          className={
            'h-3.5 w-3.5 shrink-0 transition-transform duration-150 ' + (open ? 'rotate-180' : '')
          }
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-[300px] rounded-2xl border border-line-hairline bg-slate-panel p-1 shadow-2xl"
        >
          <p className="px-3 pb-1 pt-2 font-mono text-[10px] font-semibold tracking-[0.13em] text-ink-muted">
            YOUR LEAGUES
          </p>

          {leagues.map((lg) => {
            const on = lg.provider === league.provider && lg.leagueId === league.leagueId
            const plat = platformFor(lg.provider)
            return (
              <button
                key={lg.provider + ':' + lg.leagueId}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                disabled={busy}
                onClick={() => pick(lg)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-60"
              >
                <span className={BADGE} style={{ background: '#00E5FF' }}>
                  {plat.mark}
                </span>
                <span className="min-w-0 flex-1">
                  {/* truncate: a league name is whatever somebody typed,
                      and it is drawn in a 300px panel. */}
                  <span className="block truncate text-[14px] font-semibold text-voidInk-primary">
                    {lg.name}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[10px] tracking-[0.1em] text-ink-muted">
                    {plat.name.toUpperCase()}
                    {lg.season ? ' · ' + lg.season : ''}
                    {lg.totalTeams ? ' · ' + lg.totalTeams + ' TEAMS' : ''}
                  </span>
                  {/* The menu is where both leagues are visible at once,
                      which makes it the one place two draft times can be
                      compared. Its own line, because the one above already
                      truncates in a 300px panel. */}
                  <DraftCountdown league={lg} variant="chip" className="mt-1" />
                </span>
                {on ? <Check className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" /> : null}
              </button>
            )
          })}

          {failed ? (
            <p className="px-3 py-2 text-[12px] leading-[1.4] text-flow-rose">
              {failed === 'not-connected'
                ? 'That league is no longer connected to this account.'
                : 'Could not switch just now — still on the league above.'}
            </p>
          ) : null}

          <div className="mt-1 border-t border-white/[0.06] pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                // Known in advance whenever the tier answer has landed —
                // same reasoning as ConnectLeagueCta.jsx's identical check.
                if (tierStatus === 'ready' && leagues.length >= leagueCap(tier)) {
                  modalRef.current?.openAtLimit(tier, leagueCap(tier))
                } else {
                  modalRef.current?.open()
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] font-semibold text-voidInk-primary transition-colors hover:bg-white/[0.06]"
            >
              <Plus className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
              Connect another league
            </button>
            {/* The route the chip used to be. Replacing a link with a menu
                takes a destination away unless the menu offers it back. */}
            <a
              href="#/you"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-voidInk-body transition-colors hover:bg-white/[0.06]"
            >
              Manage leagues
            </a>
          </div>
        </div>
      )}

      {/* Owned here rather than threaded in, exactly as ConnectLeagueCta
          does: each instance keeps its own <dialog> so a caller can drop
          the control in with no plumbing. */}
      <ConnectLeagueModal ref={modalRef} onConnected={noteLeagueConnected} />
    </div>
  )
}
