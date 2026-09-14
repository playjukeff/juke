import { useEffect, useRef, useState } from 'react'
import ConnectLeagueModal from '../../shell/ConnectLeagueModal.jsx'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { leagueCap } from '../../../lib/tiers.js'
import { noteLeagueConnected } from '../../../hooks/useLeague.js'
import { useLeagueFresh as useLeague, useTierFresh as useTier } from '../stores.js'
import { Kicker } from '../v2ui.jsx'
import { Chevron, DraftClock, PlatformBadge } from './parts.jsx'

/* Which connected league this page is reading, and how to read another.

   The production LeagueSwitcher's behaviour in v2 clothes, over the same
   store calls: select() is optimistic and settles back on failure (so the
   checked row is always the league that IS active), the menu stays open
   and says so when a switch fails, "Connect another" opens the real
   connect dialog or its tier-limit screen, and "Manage leagues" is the
   You page. Unlike production it is offered at every width — a phone is
   where a second league is most often checked, and the menu fits one. */
export default function LeagueMenu() {
  const { status, leagues, league, select } = useLeague()
  const { tier, status: tierStatus } = useTier()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(null)
  const wrapRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const modalRef = useRef(null)

  const items = () => (menuRef.current ? [...menuRef.current.querySelectorAll('[role^="menuitem"]')] : [])

  useEffect(() => {
    if (!open) return undefined
    const first = items()[0]
    if (first) first.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current && triggerRef.current.focus()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const list = items()
        if (!list.length) return
        e.preventDefault()
        const at = list.indexOf(document.activeElement)
        const next = e.key === 'ArrowDown' ? (at + 1) % list.length : (at - 1 + list.length) % list.length
        list[next].focus()
      }
    }
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

  if (status !== 'connected' || !league) return null

  const pick = async (next) => {
    setFailed(null)
    setBusy(true)
    const res = await select(next)
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      triggerRef.current && triggerRef.current.focus()
      return
    }
    setFailed(res.reason || 'error')
  }

  const connectAnother = () => {
    setOpen(false)
    if (tierStatus === 'ready' && leagues.length >= leagueCap(tier)) modalRef.current?.openAtLimit(tier, leagueCap(tier))
    else modalRef.current?.open()
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen((v) => !v); setFailed(null) }}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex min-h-[44px] max-w-full items-center gap-2.5 rounded-[12px] bg-v2-inset px-3 text-[14px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.1] transition-colors hover:ring-white/[0.22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
      >
        <PlatformBadge provider={league.provider} />
        <span className="min-w-0 truncate">{league.name}</span>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3 sm:inline">
          {leagues.length} {leagues.length === 1 ? 'league' : 'leagues'}
        </span>
        <Chevron open={open} className="h-4 w-4 shrink-0 text-v2-ink2" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Your leagues"
          className="absolute left-0 z-40 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-[16px] bg-v2-raised p-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-white/[0.1] lg:left-auto lg:right-0"
        >
          <div className="px-3 pb-1.5 pt-2"><Kicker>Your leagues</Kicker></div>
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
                className="flex w-full items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none disabled:cursor-wait"
              >
                <PlatformBadge provider={lg.provider} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-v2-ink">{lg.name}</span>
                  <span className="mt-0.5 block truncate font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">
                    {plat.name}{lg.season ? ` · ${lg.season}` : ''}{lg.totalTeams ? ` · ${lg.totalTeams} teams` : ''}
                  </span>
                  <DraftClock league={lg} className="mt-1.5" />
                </span>
                <span className={`mt-1 h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ${on ? 'bg-v2-volt ring-v2-volt' : 'ring-white/[0.2]'}`} aria-hidden="true">
                  {on ? (
                    <svg viewBox="0 0 16 16" className="h-4 w-4 text-v2-voltInk" fill="none"><path d="M4.5 8.2 7 10.5l4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : null}
                </span>
              </button>
            )
          })}

          {failed ? (
            <p className="px-3 py-2 text-[12px] leading-[1.45] text-v2-loss" role="alert">
              {failed === 'not-connected'
                ? 'That league is no longer connected to this account.'
                : 'Could not switch just now — still on the league above.'}
            </p>
          ) : null}

          <div className="mt-1 border-t border-white/[0.07] pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={connectAnother}
              className="flex min-h-[44px] w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-[14px] font-medium text-v2-ink transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4 text-v2-ink2" fill="none" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              Connect another league
            </button>
            <a
              href="#/v2/you"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] items-center gap-2.5 rounded-[10px] px-3 text-[14px] text-v2-ink2 transition-colors hover:bg-white/[0.05] hover:text-v2-ink focus-visible:bg-white/[0.05] focus-visible:outline-none"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true"><circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" /><path d="M3 13.5c.8-2.4 2.7-3.5 5-3.5s4.2 1.1 5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              Manage leagues
            </a>
          </div>
        </div>
      )}

      <ConnectLeagueModal ref={modalRef} onConnected={noteLeagueConnected} />
    </div>
  )
}
