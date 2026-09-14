/* How a v3 page starts or resumes a draft, written down once.

   v2/cockpit/flow.js is the model and the reasoning is unchanged; this is
   its v3 twin only because the three addresses differ. Starting is the
   engine's own startDraft() — the same sequence the production Start button
   runs — so v3 never carries a second idea of what "a new draft" means.
   Returns false when the engine refuses (setupProblem answered), so the
   caller can say why rather than navigate to nothing.

   ---- Who drives the draft on the v3 route ----

   Nothing in here. A solo draft's CPU picks and its pick clock live in
   app.js, and applyRoute() carries them on when the hash ARRIVES at
   #/v3/draft/live — onV2LiveRoute() matches both builds' live routes. Every
   other route stops them, which is what makes leaving a pause rather than a
   discard.

   That is also why arriving matters and not just being there: when the tab
   is ALREADY on LIVE_HASH (resuming from the live page's own empty state)
   the hash does not change, no hashchange fires, and nothing would carry the
   draft on — so `arrive()` re-runs the router by hand in that one case. */

export const LIVE_HASH = '#/v3/draft/live'
export const REPORT_HASH = '#/v3/draft/report'
export const LAUNCH_HASH = '#/v3/draft'
export const INSIGHTS_HASH = '#/v3/draft/insights'
export const RECORD_HASH = '#/v3/record'
/* A shared room is v3's own now — live/room.js owns its address, because
   that is the file that knows how to get into one. FRIENDS_HASH, which
   handed rooms to the classic Draft Room, is retired rather than left
   pointing at a screen v3 no longer sends anybody to. */

function engineOf() {
  return typeof window !== 'undefined' ? window.JukeEngine : null
}

export function arrive() {
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
   run to the end without offering a pick. */
export function begin(opts = {}) {
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

export function resume() {
  const engine = engineOf()
  if (!engine || !engine.resumeSavedDraft) return false
  if (engine.hasRoom && engine.hasRoom()) return false
  // resumeSavedDraft() forces the league to the save's own shape first,
  // where resumeDraft() would refuse a league that does not match it.
  const ok = engine.resumeSavedDraft()
  if (ok === false) return false
  arrive()
  return true
}

export function setupProblem() {
  const engine = engineOf()
  try { return engine && engine.setupProblem ? engine.setupProblem() : null } catch { return null }
}

/* A scenario card is a mock draft that arrived with its settings chosen —
   engine.startScenario() applies them to the one league and starts. */
export function startScenario(s) {
  const engine = engineOf()
  if (!engine || !engine.startScenario) return { ok: false, problem: 'That scenario could not be started.' }
  if (engine.hasRoom && engine.hasRoom()) return { ok: false, problem: 'Scenarios are for solo mocks. Leave the room to run one.' }
  let r = null
  try { r = engine.startScenario(s) } catch { r = null }
  if (!r || r.ok !== true) return { ok: false, problem: (r && r.problem) || 'That scenario could not be started.' }
  arrive()
  return { ok: true }
}
