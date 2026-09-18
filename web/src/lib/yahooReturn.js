/* The two sessionStorage keys the Yahoo round trip passes through.

   PENDING is written by the connect dialog just before it sends the reader
   to Yahoo: the state the worker signed, and the hash route to come back
   to. RETURN is written by /connect/yahoo.js when Yahoo sends them back:
   the one-time code, the state, or Yahoo's error. Both key names are
   written down a second time in that static script, which cannot import
   from here -- move them together.

   Imports nothing, like leagueStore.js, so a node check needs no bundler. */

export const YAHOO_PENDING = 'juke.yahoo.pending'
export const YAHOO_RETURN = 'juke.yahoo.return'

/* Yahoo's authorization code lives about ten minutes, so a return older
   than that is a code nobody can spend. It is dropped rather than tried:
   trying it would put a failure in front of somebody for a sign-in they
   abandoned long ago. */
const FRESH_MS = 10 * 60 * 1000

/* Read the return and REMOVE it, in one step, so a reload cannot replay
   it. Answers `{ code, state, error }` or null. */
export function takeYahooReturn(storage, now = Date.now()) {
  const s = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  if (!s) return null
  let raw = null
  try {
    raw = s.getItem(YAHOO_RETURN)
    s.removeItem(YAHOO_RETURN)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const r = JSON.parse(raw)
    if (!r || !(now - Number(r.at) >= 0 && now - Number(r.at) < FRESH_MS)) return null
    return { code: r.code || null, state: r.state || null, error: r.error || null }
  } catch {
    return null
  }
}
