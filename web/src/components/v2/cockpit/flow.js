/* How a v2 page starts or resumes a draft, written down once.

   The launcher (draft/) calls these; the cockpit (cockpit/) is where they
   land. Starting is the engine's own startDraft() — the same sequence the
   production Start button runs — so v2 never carries a second idea of what
   "a new draft" means. Returns false when the engine refuses (setupProblem
   answered), so the caller can say why rather than navigate to nothing.

   ---- Who drives the draft on the v2 route ----

   Nothing in here. A solo draft's CPU picks and its pick clock both live in
   app.js (runCPUs() and resetClock()), and app.js's applyRoute() carries
   them on when the hash ARRIVES at #/v2/draft/live — see onV2LiveRoute()
   there. Every other route stops them, which is what makes leaving the
   cockpit a pause rather than a discard: the draft stays in memory and in
   the save, and coming back picks up where it was.

   That is also why arriving matters and not just being there. resume and
   start both end by moving the hash to LIVE_HASH, and when the tab is
   ALREADY on it (resuming from the cockpit's own empty state) the hash does
   not change, no hashchange fires, and nothing would carry the draft on —
   so `arrive()` re-runs the router by hand in that one case. It also puts
   back the legacy #tabrow that resumeDraft()/enterDraftUI() un-hide on every
   route but #/draft-room: applyRoute() is the thing that hides it again. */

export const LIVE_HASH = '#/v2/draft/live'
export const REPORT_HASH = '#/v2/draft/report'
export const LAUNCH_HASH = '#/v2/draft'

function engineOf() {
  return typeof window !== 'undefined' ? window.JukeEngine : null
}

function arrive() {
  if (location.hash === LIVE_HASH) {
    // Same hash: no native event, so ask the router directly. app.js's own
    // hashchange listener is what calls applyRoute().
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    location.hash = LIVE_HASH
  }
}

/* opts may carry mySlot/clockLength; anything absent is read off the one
   real state rather than defaulted here. startDraft() writes
   `state.mySlot = opts.mySlot` unconditionally, so passing nothing would
   seat the drafter at `undefined` — never on the clock, and the draft would
   run to the end without offering a pick. The seat the settings screen
   chose lives in engine.mySlot(); the clock in engine.clockLength(). */
export function beginV2Draft(opts = {}) {
  const engine = engineOf()
  if (!engine || !engine.startDraft) return false
  if (engine.hasRoom && engine.hasRoom()) return false
  const mySlot = Number.isInteger(opts.mySlot) ? opts.mySlot : (engine.mySlot() ?? 0)
  const clockLength = Number.isFinite(opts.clockLength) ? opts.clockLength : engine.clockLength()
  const ok = engine.startDraft({ ...opts, mySlot, clockLength })
  if (ok === false) return false
  arrive()
  return true
}

export function resumeV2Draft() {
  const engine = engineOf()
  if (!engine) return false
  // resumeSavedDraft() and not resumeDraft(): the latter takes the save as
  // an argument and refuses a league that does not match it, where this
  // one forces the league to the save's own shape first — the launcher has
  // no dropdowns of its own to blame for a mismatch.
  if (!engine.resumeSavedDraft) return false
  if (engine.hasRoom && engine.hasRoom()) return false
  const ok = engine.resumeSavedDraft()
  if (ok === false) return false
  arrive()
  return true
}

export function setupProblem() {
  const engine = engineOf()
  try { return engine && engine.setupProblem ? engine.setupProblem() : null } catch { return null }
}
