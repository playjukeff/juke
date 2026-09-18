/* Which platforms Juke can read a league from, and which it cannot yet.

   One list, because the answer was previously written down as prose in
   seven places — `Sleeper · ESPN · Yahoo · CBS`, under every connect
   control on the site — and prose cannot be wrong in a way anything
   notices. It was wrong: only Sleeper was built, and the connect dialog
   asked for a Sleeper username the moment it opened, with no step in
   between. Reported exactly that way: "there's a disconnect between what
   we're saying we can connect to and what our pop-up is asking for."

   ---- Every platform is built now, and the list is still why that was one edit ----

   All four are live. Because this list is the only place the answer
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

   The order is the order they are offered in, and it is the order they
   shipped. It was CBS then Yahoo when neither worked, which was
   alphabetical about nothing.

   ---- Listed, not hidden ----

   A platform that is not built stays on the list and is visibly locked,
   which is the shape this project already uses twice: DRAFT_TYPES lists
   auction and marks it unavailable, and the Draft Room's sport chips list
   Basketball and Baseball behind a lock. A row showing one platform where
   the category has four tells a visitor the product has not thought past
   one. What it must not do is imply that a locked one works today, which is
   what an undifferentiated list did when only Sleeper was built. None is
   locked now; the rule is for the next one.

   `LINE` is the one-line version for the 12px caption under a connect
   button. "now" and "soon" are doing the whole job: they are what turns a
   claim into a roadmap — and it moves when the flags move, rather than
   being a second, hand-maintained copy of them. */

/* ---- All four are live, and `beta` is how the next one gets there ----

   Yahoo shipped `beta` first: worker/yahoo.js was written against Yahoo's
   published format and proved offline, and a platform that connects and
   then draws the wrong roster is worse than one that is not offered. So it
   was shown only to a browser that had set `juke.beta.yahoo` to "1" in
   localStorage.

   It went `live` on 18 September 2026 with its sign-in measured and its
   league reading NOT: the owner's Yahoo account is in no league. That was
   safe only because 'free' connects nothing and Season Pass is not on sale,
   so a real Yahoo league has to be read and checked before either changes.
   See the note on LEAGUE_CAP in web/src/lib/tiers.js.

   The mechanism stays for the next platform, and it is inert while nothing
   carries `beta`: `offered()` only ever reads the flag for a platform that
   has one. The storage key keeps Yahoo's name because it is what a tester's
   browser already holds, not because it is about Yahoo. */
export const PLATFORMS = [
  { key: 'sleeper', name: 'Sleeper', live: true, note: 'Username only — no password' },
  { key: 'espn', name: 'ESPN', live: true, note: 'League ID — private leagues need your ESPN sign-in' },
  { key: 'cbs', name: 'CBS', live: true, note: 'League address — plus your CBS sign-in, always' },
  { key: 'yahoo', name: 'Yahoo', live: true, note: 'Sign in with Yahoo — read-only, no password shared' },
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

/* Just the platforms that work. Two sentences on the homepage and the You
   screen said "Sleeper today, more to come" and were still saying it the day
   ESPN shipped — the stale-copy failure this project has a whole rule about,
   in the two places a signed-out visitor is most likely to read.

   Prose that wants to add "more to come" asks MORE_COMING rather than
   writing it unconditionally: once every platform on this list is live, "more
   to come" is a promise about platforms nobody has put on it. */
export const LIVE_NAMES = joinNames(names(true))
export const MORE_COMING = names(false).length > 0

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
