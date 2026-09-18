/* Browser error reporting, to Sentry.

   Closes the gap CLAUDE.md ranks among the system's ceilings: the worker has
   Cloudflare's observability and the page had nothing, which is how React's
   #418/#423 ran on every load of the site for months and were found by
   somebody opening a console.

   ---- Off unless configured, like Clerk ----

   VITE_SENTRY_DSN is baked in at build time. With none — a clone, CI, a
   Pages preview — this module does nothing at all and the SDK chunk is never
   requested. A DSN is public by design (it can only SEND events), which is
   the same reason the Clerk publishable key is an env var rather than a
   secret.

   ---- Loaded late, and nothing is lost for it ----

   The SDK is a dynamic import, fetched after `load` and after the cold-load
   splash has gone. CLAUDE.md measured what main-thread work during that
   reveal costs; an error reporter is not worth a stutter in the first thing
   anybody sees.

   What that would normally cost is every error before init — including an
   app.js boot throw, the worst failure this site has, since it kills the
   draft engine for the whole page. theme.js closes that: it is
   parser-blocking in <head>, so its listeners exist before app.js runs, and
   it queues what it sees on window.__jukeEarlyErrors. Init takes the queue
   over and stops those listeners in the same tick Sentry installs its own.

   React's hydration mismatches need no extra wiring: React 18's default
   onRecoverableError is window.reportError(), which dispatches an ordinary
   `error` event, so the same listeners see it.

   ---- What a report carries ----

   No account id, no IP (sendDefaultPii: false, and the project setting
   "Prevent Storing of IP Addresses" should be on as well), no session
   replay, no performance tracing. Every URL is scrubbed of its query —
   see scrubUrl.js for why an address here can be a capability. Frames from
   browser extensions and other people's scripts are dropped with allowUrls,
   because a report nobody can act on is noise that teaches people to stop
   reading the inbox.

   Every failure in here is swallowed. Monitoring that could break the page
   it monitors is worse than none. */

import { scrubUrl, scrubText } from './scrubUrl.js'

const DSN = import.meta.env.VITE_SENTRY_DSN || ''
// eslint-disable-next-line no-undef
const RELEASE = typeof __JUKE_RELEASE__ === 'string' ? __JUKE_RELEASE__ : 'local'
// eslint-disable-next-line no-undef
const ENVIRONMENT = typeof __JUKE_ENV__ === 'string' ? __JUKE_ENV__ : 'development'

export const monitoringConfigured = !!DSN

function scrubEvent(event) {
  if (event.request) {
    event.request.url = scrubUrl(event.request.url)
    const h = event.request.headers
    if (h) {
      if (h.Referer) h.Referer = scrubUrl(h.Referer)
      if (h.referer) h.referer = scrubUrl(h.referer)
    }
  }
  if (event.message) event.message = scrubText(event.message)
  for (const ex of event.exception?.values || []) {
    ex.value = scrubText(ex.value)
    for (const f of ex.stacktrace?.frames || []) f.abs_path = scrubUrl(f.abs_path)
  }
  return event
}

function scrubBreadcrumb(crumb) {
  const d = crumb.data
  if (d) {
    if (d.url) d.url = scrubUrl(d.url)
    if (d.from) d.from = scrubUrl(d.from)
    if (d.to) d.to = scrubUrl(d.to)
  }
  if (crumb.message) crumb.message = scrubText(crumb.message)
  return crumb
}

function takeOverEarlyQueue(Sentry) {
  const early = window.__jukeEarlyErrors
  if (!early) return
  try { early.stop() } catch (_) {}
  for (const item of early.items || []) {
    const tags = { captured: 'before-init' }
    if (item.error instanceof Error) Sentry.captureException(item.error, { tags })
    else if (item.error != null) Sentry.captureMessage(scrubText(String(item.error)), { level: 'error', tags })
  }
  early.items.length = 0
}

let started = false

async function init() {
  const Sentry = await import('./sentryInit.js')
  Sentry.startSentry({
    dsn: DSN,
    release: RELEASE,
    environment: ENVIRONMENT,
    sendDefaultPii: false,
    allowUrls: [window.location.origin],
    // The default integrations — global error handlers, breadcrumbs, dedupe,
    // inbound filters — minus BrowserSession. That one sends a "session"
    // envelope on every page load whether or not anything broke, which is
    // release-health bookkeeping, and it would make the privacy policy's
    // "only when something on the page actually breaks" false on every
    // visit. Measured before removing it: five envelopes for two errors.
    // No tracing and no replay either — both are opt-in and both cost bytes
    // and privacy this does not need yet.
    integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserSession'),
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
  takeOverEarlyQueue(Sentry)
}

export function startErrorMonitoring() {
  if (!DSN || started || typeof window === 'undefined') return
  started = true

  const go = () => {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1))
    idle(() => { init().catch(() => {}) }, { timeout: 4000 })
  }
  // Wait out the splash: #boot-sonar leaves on its own (main.jsx), and a
  // failsafe fades it by 8.6s regardless. The 12s cap means a page that
  // somehow keeps it forever still gets monitored.
  const afterSplash = () => {
    const began = performance.now()
    const poll = () => {
      if (!document.getElementById('boot-sonar') || performance.now() - began > 12000) go()
      else setTimeout(poll, 400)
    }
    poll()
  }
  if (document.readyState === 'complete') afterSplash()
  else window.addEventListener('load', afterSplash, { once: true })
}
