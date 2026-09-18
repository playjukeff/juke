/* Which platforms Juke can read a league from, and which it cannot yet.

   One list, because the answer was previously written down as prose in
   seven places — `Sleeper · ESPN · Yahoo · CBS`, under every connect
   control on the site — and prose cannot be wrong in a way anything
   notices. It was wrong: only Sleeper was built, and the connect dialog
   asked for a Sleeper username the moment it opened, with no step in
   between. Reported exactly that way: "there's a disconnect between what
   we're saying we can connect to and what our pop-up is asking for."

   ---- CBS is built now, and the list is still why that is one edit ----

   Three of the four are live. Because this list is the only place the answer
   is written down, turning ESPN on was `live: true` here — the connect
   dialog, the caption under every connect control on the site, and the
   badge on a connected league all followed with nothing else to find. That
   is the whole argument for the file: the previous version of this change
   would have been seven edits and a missed one.

   **`live` is not "we can list it", it is "connecting works today".** That
   is why `note` carries what each platform COSTS a reader rather than the
   flag carrying it: a platform that half works is still one somebody can
   finish connecting.

   ESPN's note said "Public leagues only" and stopped being true the day
   private leagues shipped — a private one is readable, it just takes the
   reader's own ESPN sign-in, which is a bigger ask than a league id and
   belongs in the one line under the button. Corrected in place rather
   than left standing, which is the whole reason this list is one list.

   **CBS's note may not inherit ESPN's.** ESPN's `espn_s2` rotates, so a
   dialog can honestly say the credential expires on its own. CBS's `pid`
   is set with `expires` in 2037, and disconnecting is the only revocation
   Juke can offer — so "always" is doing real work in that line and is not
   a stylistic difference from the row above it. The other half of it is
   that there is no public CBS league at all: every endpoint that says who
   is in a league answers "User not signed in" anonymously, so unlike
   ESPN's, the sign-in is not the private case, it is the only case.

   The order is the order they are offered in, so the three that work sit
   together and the one that does not is last. It was CBS then Yahoo when
   neither worked, which was alphabetical about nothing.

   ---- Listed, not hidden ----

   The two that are not built stay on the list and are visibly locked,
   which is the shape this project already uses twice: DRAFT_TYPES lists
   auction and marks it unavailable, and the Draft Room's sport chips list
   Basketball and Baseball behind a lock. A row showing one platform where
   the category has four tells a visitor the product has not thought past
   one. What it must not do is imply the other three work today, which is
   what an undifferentiated list of four does.

   `LINE` is the one-line version for the 12px caption under a connect
   button. "now" and "soon" are doing the whole job: they are what turns a
   claim into a roadmap — and it moves when the flags move, rather than
   being a second, hand-maintained copy of them. */

/* ---- Yahoo is built and is `beta`, which is not `live` ----

   worker/yahoo.js reads a Yahoo league through Yahoo's own OAuth grant, and
   every part of it that can be proved offline has been. What has NOT
   happened is a real league being read through it: that needs the Yahoo
   app registered and a league to read, and every shape in a Yahoo league
   payload is written against Yahoo's published format rather than
   measured. A platform that connects and then draws the wrong roster is
   worse than one that is not offered, so `live` stays false -- the caption
   under every connect control still says "Yahoo soon", which is true.

   `beta` is how it gets measured without being offered to everybody: a
   browser that has set `juke.beta.yahoo` to "1" in localStorage is shown
   Yahoo in the connect dialog as though it were live. Flip `live` once a
   real league has been read and checked, and delete `beta` with it. */
export const PLATFORMS = [
  { key: 'sleeper', name: 'Sleeper', live: true, note: 'Username only — no password' },
  { key: 'espn', name: 'ESPN', live: true, note: 'League ID — private leagues need your ESPN sign-in' },
  { key: 'cbs', name: 'CBS', live: true, note: 'League address — plus your CBS sign-in, always' },
  { key: 'yahoo', name: 'Yahoo', live: false, beta: true, note: 'Sign in with Yahoo — read-only, no password shared' },
]

export const LIVE_PLATFORMS = PLATFORMS.filter((p) => p.live)

/* Whether this browser has opted in to the platforms still in beta. Read
   on demand and never during a render the prerender could see: it is a
   fact about one browser's storage, and the server has none. */
export function betaEnabled() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('juke.beta.yahoo') === '1'
  } catch {
    return false
  }
}

/* Can this platform be chosen in the connect dialog right now. */
export function offered(p, beta) {
  return !!(p && (p.live || (p.beta && beta)))
}

/* Derived, not written down again.

   The hand-written version of this said "Sleeper now · ESPN, Yahoo, CBS
   soon" and had to be remembered on the day ESPN shipped — which is the
   same seven-places-in-prose failure this file exists to end, surviving in
   the one constant that summarises the list. It is built from the flags,
   so it cannot disagree with them.

   The "soon" half is dropped once nothing is left in it: a caption reading
   "· soon" with no platforms after it is worse than a caption that stops. */
const names = (live) => PLATFORMS.filter((p) => p.live === live).map((p) => p.name)

function joinNames(list) {
  if (list.length <= 1) return list.join('')
  return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]
}

/* Just the platforms that work, for prose that supplies its own "and more
   to come". Two sentences on the homepage and the You screen said "Sleeper
   today, more to come" and were still saying it the day ESPN shipped — the
   stale-copy failure this project has a whole rule about, in the two places
   a signed-out visitor is most likely to read. */
export const LIVE_NAMES = joinNames(names(true))

export const LINE = [
  joinNames(names(true)) + ' now',
  names(false).length ? names(false).join(', ') + ' soon' : '',
].filter(Boolean).join(' · ')

/* The badge a connected league wears, by provider.

   The header chip used to draw a hardcoded "S" on a teal square, which was
   right while Sleeper was the only thing that could be connected and stops
   being right the moment an account holds two leagues from two places —
   which is the whole point of the switcher this exists for.

   ---- One colour, and the letter is what differs ----

   The obvious version gives each platform its own tint. It is not worth
   what it costs: every value in the palette is already spoken for, and the
   three that are not (`flow.gold`, `flow.lavender`, `flow.blue`) are room
   identities — gold is My League (its standings panel's own accent),
   lavender is Trade. Reusing one here would make a colour mean two things
   in one app, which this project has a standing rule against and has
   already paid for once.

   The letter identifies the platform, and every surface that draws more
   than the badge draws the platform's name in text beside it. So a second
   colour would be a third way of saying something already said twice.

   ---- An unknown provider still draws ----

   A row can arrive from a provider this build does not know about: the
   database is shared with whatever is deployed, and the worker is deployed
   separately from the site. `?` and the raw key is a worse label than
   "ESPN" and a much better one than a crash. */
export function platformFor(key) {
  const found = PLATFORMS.find((p) => p.key === key)
  if (found) return { key: found.key, name: found.name, mark: found.name.slice(0, 1) }
  const raw = String(key || '')
  return { key: raw, name: raw ? raw.toUpperCase() : 'League', mark: raw.slice(0, 1).toUpperCase() || '?' }
}
