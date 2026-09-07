import { useRef } from 'react'
import { SignUpButton } from '@clerk/clerk-react'
import ConnectLeagueModal from './ConnectLeagueModal.jsx'
import { useAccountUiReady } from '../../hooks/useAccountUiReady.js'
import { useSignedIn } from '../../hooks/useAuthState.js'
import { useLeague, noteLeagueConnected } from '../../hooks/useLeague.js'
import { useTier } from '../../hooks/useTier.js'
import { leagueCap } from '../../lib/tiers.js'

/* "Connect a league", everywhere it is offered — and it now connects one.

   This was a waitlist. Sleeper connect is real, so the button opens the
   real flow: username, pick a league, done.

   ---- Signed out, it asks for an account first ----

   Not a nicety: a connection is stored against an account, so there is
   nowhere to put one without it. That is also the handoff's own global
   rule — "Connect-league always routes through account creation first" —
   and why the locked rooms say "Sign up & connect" rather than naming a
   platform. Signed out this renders Clerk's sign-up trigger wearing the
   same label; signed in it opens the connect dialog.

   One component rather than a ref threaded through four screens: the
   header's chip, the signed-in homepage card, the Rooms lobby's unlock bar
   and the You screen's row all offer the same thing, and they were
   otherwise each going to point somewhere slightly different — two of them
   at #/rooms and #/you, which is a redirect standing in for an answer.

   Each instance owns its own <dialog>, which is cheap and is what lets a
   caller drop this in without plumbing. `variant` covers the four shapes
   the design draws.

   ---- Connecting is announced, not just reported to the caller ----

   `onConnected` was the only channel, and three of the four call sites do
   not pass one — so connecting a league updated the dialog that did it and
   nothing else on the page. Reported as "even after getting a confirmation
   that it connected successfully, the Connect messaging is still there
   throughout the website", which is precisely what it did.

   noteLeagueConnected() settles the shared league state that useLeague()
   reads, so every surface repaints on the same tick the worker confirms —
   the header's chip, the homepage card, the Rooms unlock bar and the You
   screen's section, none of which knows this component exists. `onConnected`
   still fires for a caller that wants to do something extra. */

const VARIANTS = {
  gradient:
    'inline-flex items-center justify-center whitespace-nowrap rounded-full px-5 py-3 text-[14px] font-bold text-surface-page transition-transform duration-150 hover:scale-[1.02]',
  outline:
    'inline-flex items-center justify-center whitespace-nowrap rounded-full border border-flow-pillEdge px-5 py-3 text-[14px] font-semibold text-voidInk-primary transition-colors duration-150 hover:border-white/30',
  chip:
    'hidden items-center gap-2 rounded-full border border-flow-pillEdge px-3 py-[7px] text-[13px] font-semibold text-voidInk-primary transition-colors duration-150 hover:border-teal/50 sm:inline-flex',
  row:
    'flex w-full items-center justify-between gap-3 rounded-[14px] border border-dashed border-flow-pillEdge px-4 py-3 text-left text-[14px] text-voidInk-primary transition-colors duration-150 hover:border-teal/50',
}

export default function ConnectLeagueCta({
  variant = 'gradient',
  label = 'Connect a league',
  onConnected,
  children,
}) {
  const ref = useRef(null)
  const ready = useAccountUiReady()
  const signedIn = useSignedIn()
  const { tier, status: tierStatus } = useTier()
  const { leagues } = useLeague()

  const cls = VARIANTS[variant] || VARIANTS.gradient
  const style = variant === 'gradient'
    ? { background: 'linear-gradient(100deg,#44D4E2,#82A1F6)' }
    : undefined

  const trigger = (onClick) => (
    <button type="button" onClick={onClick} className={cls} style={style}>
      {children || label}
    </button>
  )

  /* Signed out: the same control, opening sign-up. Without a Clerk key
     there is no SignUpButton to wrap it in, so it renders inert — the
     fallback every account surface here makes rather than throwing. */
  if (!signedIn) {
    if (!ready) return trigger(undefined)
    return <SignUpButton mode="modal">{trigger(undefined)}</SignUpButton>
  }

  const connected = (league) => {
    noteLeagueConnected(league)
    if (onConnected) onConnected(league)
  }

  /* Known in advance whenever the tier answer has actually landed — skip
     straight to the tier-limit screen rather than making a Free reader
     pick a platform and a league only to be told no at the end. `tierStatus
     !== 'ready'` (still loading, or the worker could not say) opens the
     ordinary flow instead of guessing a cap that might be wrong; the worker
     enforces the real cap regardless of which screen this opens on. */
  const openConnect = () => {
    if (tierStatus === 'ready' && leagues.length >= leagueCap(tier)) {
      ref.current?.openAtLimit(tier, leagueCap(tier))
      return
    }
    ref.current?.open()
  }

  return (
    <>
      {trigger(openConnect)}
      <ConnectLeagueModal ref={ref} onConnected={connected} />
    </>
  )
}
