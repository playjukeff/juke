import { useState } from 'react'
import { meetsTier, tierLabel } from '../../lib/tiers.js'
import { useTier } from '../../hooks/useTier.js'

/* A room section this tier cannot open yet.
 *
 * Juke Journey v3's rule, and it is the opposite of the obvious
 * implementation: "Gated content is rendered blurred under a preview card
 * naming the unlocking tier — never an empty gate." A tier is sold by
 * showing what it holds, so the content is drawn and then obscured rather
 * than withheld.
 *
 * ---- Why this is not LockedPreview ----
 *
 * LockedPreview is the same shape for a different question. It gates on
 * being SIGNED OUT, its card offers Clerk's sign-up, and its copy is about
 * connecting a league. This gates on TIER, for somebody already signed in
 * and already connected, and what it offers is an upgrade. Folding the two
 * would mean one component branching on auth and tier and copy and CTA,
 * which is three components in a trench coat.
 *
 * ---- There is no checkout, and the card says so rather than pretending ----
 *
 * Billing is not built. ConnectLeagueModal's own tier-limit branch made
 * this call first and this follows it: an email capture, the same shape
 * EarlyAccessModal uses for every other "not yet" in this product. A
 * button that looked like a purchase and did not take one would be worse
 * than the gate.
 *
 * ---- The blur is aria-hidden and inert ----
 *
 * LockedPreview's reasoning, unchanged: blurred content is unreadable by
 * construction, so exposing it to a screen reader reads out a panel nobody
 * can see, and leaving it focusable puts every row of it in the tab order
 * in front of the one control the screen is for.
 */
export default function UpgradeGate({ need, title, children }) {
  const { tier } = useTier()
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle')

  if (meetsTier(tier, need)) return children

  const submit = (e) => {
    e.preventDefault()
    const value = email.trim()
    if (!value || value.indexOf('@') < 1) {
      setState('invalid')
      return
    }
    setState('submitting')
    const live = typeof window !== 'undefined' ? window.Live : null
    if (!live || !live.signup) {
      setState('error')
      return
    }
    live
      .signup(value, 'upgrade:' + need)
      .then((res) => setState(res && res.ok ? 'success' : 'error'))
      .catch(() => setState('error'))
  }

  return (
    <div className="relative min-h-[380px] overflow-hidden">
      <div aria-hidden="true" inert="" className="blur-[2px] opacity-60">
        {children}
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center p-6"
        style={{ background: 'linear-gradient(180deg,rgba(13,15,21,.2),rgba(13,15,21,.92) 55%)' }}
      >
        <div className="w-full max-w-[440px] rounded-[18px] border border-line-hairline bg-charcoal px-5 py-6 text-center sm:px-6">
          <span
            className="inline-block rounded-[5px] bg-flow-amber/[0.14] px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-flow-amber"
          >
            {tierLabel(need)}
          </span>
          <div className="mt-2.5 font-display text-[20px] font-bold text-white sm:text-[24px]">
            {title}
          </div>
          <p className="mx-auto mt-1.5 max-w-[40ch] text-meta leading-[1.45] text-voidInk-body">
            It is real and it is behind {tierLabel(need)} — which is not on sale yet. Leave an
            email and we will tell you when it is.
          </p>

          {state === 'success' ? (
            <p className="mt-4 text-meta font-semibold text-mint">
              You are on the list. Nothing else to do.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-4 flex flex-wrap justify-center gap-2">
              <label className="sr-only" htmlFor={`upgrade-${need}`}>
                Email address
              </label>
              <input
                id={`upgrade-${need}`}
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (state !== 'idle') setState('idle') }}
                placeholder="you@example.com"
                /* 16px, because iOS zooms any field under it and does not
                   zoom back out — this project's own floor, and a gate is
                   exactly the kind of form somebody meets on a phone. */
                className="min-w-0 flex-1 rounded-full border border-line-hairline bg-surface-card px-4 py-2 text-[16px] text-white placeholder:text-ink-muted"
              />
              <button
                type="submit"
                disabled={state === 'submitting'}
                className="rounded-full bg-teal px-4 py-2 text-meta font-bold text-obsidian disabled:opacity-60"
              >
                {state === 'submitting' ? 'Sending…' : 'Tell me'}
              </button>
            </form>
          )}

          {state === 'invalid' ? (
            <p className="mt-2 text-[12px] text-flow-rose">That does not look like an email.</p>
          ) : null}
          {state === 'error' ? (
            <p className="mt-2 text-[12px] text-flow-rose">
              That did not send. Nothing was lost — try again in a moment.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
