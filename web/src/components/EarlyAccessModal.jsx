import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { X } from 'lucide-react'

// Phase 0 of accounts: nothing in this app requires a login, and this modal
// does not add one. It is the one thing every "not built yet" dead end can
// offer instead of a plain "coming soon" — leave an email, get told when the
// real thing exists. Built the same way ComingSoonModal.jsx already is (a
// native <dialog>, opened imperatively through a ref) rather than a second
// modal shell: showModal() traps focus and returns it to the trigger on
// close for free, which is what let that component skip writing either by
// hand, and there is no reason this one should re-derive what the browser
// already does correctly.
//
// open(copy, source) rather than open(title, body): every caller shares one
// fixed heading ("Get early access"), so the only thing that varies is the
// one line of context CLAUDE.md's phase-0 spec calls for, plus the source
// tag every submission is recorded against — header, locker, room:<name>,
// nav:you. That tag is what makes nine different dead ends distinguishable
// later without nine different tables.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EarlyAccessModal = forwardRef(function EarlyAccessModal(_props, ref) {
  const dialogRef = useRef(null)
  const [content, setContent] = useState({ copy: '', source: '' })
  const [email, setEmail] = useState('')
  // idle | invalid | submitting | success | error — one field is enough to
  // drive every visible state a form this small has, the same way
  // LatestNewsTab.jsx uses a single `items` value for loading/empty/loaded.
  const [status, setStatus] = useState('idle')

  useImperativeHandle(ref, () => ({
    open(copy, source) {
      setContent({ copy, source })
      setEmail('')
      setStatus('idle')
      dialogRef.current?.showModal()
    },
  }))

  const close = () => dialogRef.current?.close()

  const submit = async (e) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setStatus('invalid')
      return
    }
    setStatus('submitting')
    // window.Live is a plain classic script global (live.js), loaded and
    // run before this module ever executes — same guard LatestNewsTab.jsx
    // already uses for window.Live.news, and for the same reason: a page
    // where that script failed to load must not throw out of a click
    // handler, it should read as "that didn't send" like any other failure.
    const signup = typeof window !== 'undefined' && window.Live && window.Live.signup
    const result = signup ? await signup(trimmed, content.source) : { ok: false }
    setStatus(result && result.ok ? 'success' : 'error')
  }

  return (
    <dialog
      ref={dialogRef}
      className="early-access-dialog m-auto rounded-2xl border border-white/10 bg-charcoal p-0 text-white"
      onClick={(e) => {
        // The existing convention (ComingSoonModal.jsx): a click that lands
        // on the dialog element itself, rather than on something inside it,
        // is a click on the backdrop.
        if (e.target === dialogRef.current) close()
      }}
    >
      <div className="w-[min(90vw,26rem)] p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-display text-lg font-bold text-white">Get early access</h3>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1.5 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {status === 'success' ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              You're on the list. We'll email you the moment this is ready.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-6 w-full rounded-full bg-cta py-2.5 text-sm font-semibold text-white
                         shadow-glass transition-all duration-200 hover:scale-105
                         motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              Done
            </button>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{content.copy}</p>

            <label htmlFor="early-access-email" className="mt-5 block text-xs font-semibold uppercase tracking-wide text-white/40">
              Email
            </label>
            <input
              id="early-access-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                // Clear a stale validation/error state the moment they
                // start fixing it, rather than leaving last attempt's
                // message sitting under a field they've already changed.
                if (status === 'invalid' || status === 'error') setStatus('idle')
              }}
              placeholder="you@example.com"
              aria-invalid={status === 'invalid'}
              aria-describedby={status === 'invalid' || status === 'error' ? 'early-access-msg' : undefined}
              className={
                'mt-1.5 w-full rounded-lg border bg-obsidian/60 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none ' +
                (status === 'invalid'
                  ? 'border-rose-400/60 focus:border-rose-400/60'
                  : 'border-white/10 focus:border-teal-400/60')
              }
            />

            {status === 'invalid' && (
              <p id="early-access-msg" className="mt-2 text-xs text-rose-300">
                That doesn't look like an email address.
              </p>
            )}
            {status === 'error' && (
              <p id="early-access-msg" className="mt-2 text-xs text-rose-300">
                That didn't send. Try again in a moment.
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="mt-4 w-full rounded-full bg-cta py-2.5 text-sm font-semibold text-white
                         shadow-glass transition-all duration-200 hover:scale-105
                         disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100
                         motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              {status === 'submitting' ? 'Sending…' : 'Notify me'}
            </button>
          </form>
        )}
      </div>
    </dialog>
  )
})

export default EarlyAccessModal
