import { useEffect } from 'react'
import { STAKE, STAKE_INK } from './tokens.js'

/* P2 — the one light card on a page, and the one thing on it that says what
   is at stake.

   Exactly one per route. That is the whole constraint: a screen with two
   light cards has two answers to "what is this page for", which is the same
   as having none. The dev-only warning below is the enforcement the handoff
   asks for — a lint cannot see React's render tree, and a second card is not
   a crash, it is a page that quietly stops arguing.

   ---- No cyan border, no shadow ----

   Both were tried in earlier passes of this palette and both are the same
   mistake: the card is already the brightest thing on the page by a mile, so
   an outline is drawing attention to attention. The colour is the emphasis.

   ---- Ink on it is slate.sunk, not black ----

   `#161D26` at 11.8:1 on `#FBD5A8`. The two figures the card carries take
   their own darker sign colours — a cost on a light ground is not the cost
   colour used on a dark one, which is the mistake the Your Insights gold
   card already made once and had to have measured (see InsightsSidebar's own
   note): a colour is right on the surface it actually lands on. */

// Cost and gain ON THE LIGHT CARD. The dark-ground pair (#E39284 / #ABDFC7)
// measures 1.6:1 and 1.3:1 on #FBD5A8 — invisible. These are the same two
// hues taken far enough down to carry: 6.0:1 and 5.4:1 respectively.
export const STAKE_COST_INK = '#8F3A2E'
export const STAKE_GAIN_INK = '#1F6B4E'

let mounted = 0

export default function StakeCard({ eyebrow = 'Costing you most', title, cost, gain, action, children }) {
  useEffect(() => {
    /* Counted on mount rather than checked in render: React renders a
       component more than once for reasons that have nothing to do with how
       many are on screen (StrictMode, a re-render, a suspended tree), and a
       render-time counter reports every one of those as a duplicate. An
       effect runs once per mounted instance, which is the thing being
       constrained.

       Dev only. In production this is a `const` nobody reads and the whole
       block is dropped. */
    mounted += 1
    if (import.meta.env.DEV && mounted > 1) {
      // eslint-disable-next-line no-console
      console.warn(
        '[decision] Two <StakeCard>s are mounted at once. One per route: a page with two ' +
          'light cards has two answers to "what is this page for".',
      )
    }
    return () => {
      mounted -= 1
    }
  }, [])

  return (
    <section
      data-stake-card
      className="jd-rise rounded-card border-0 px-5 py-[18px]"
      style={{ background: STAKE, color: STAKE_INK, '--i': 0 }}
    >
      <p className="font-plex text-label-sm uppercase opacity-70">{eyebrow}</p>
      <h2 className="mt-2 font-decision text-[20px] font-bold leading-tight">{title}</h2>

      {cost || gain ? (
        <p className="mt-3 font-decision text-[26px] font-extrabold leading-none">
          {cost ? <span style={{ color: STAKE_COST_INK }}>{cost}</span> : null}
          {/* opacity-60, not 40. This is a 26px glyph so it answers to
              1.4.11's 3:1 rather than to 4.5, and at 40% the ink composites
              to 2.35 on the card -- under even that. Measured rather than
              picked: 4.13 at 60%. */}
          {cost && gain ? <span className="opacity-60"> · </span> : null}
          {gain ? <span style={{ color: STAKE_GAIN_INK }}>{gain}</span> : null}
        </p>
      ) : null}

      {children ? <p className="mt-2.5 text-[13px] leading-[1.45] opacity-80">{children}</p> : null}

      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.title}
          className={
            'mt-4 h-10 w-full rounded-chip font-body text-[13px] font-semibold text-ink transition-transform duration-hover ' +
            (action.disabled ? 'cursor-not-allowed opacity-50' : 'hover:-translate-y-0.5')
          }
          style={{ background: STAKE_INK }}
        >
          {action.label}
        </button>
      ) : null}
    </section>
  )
}
