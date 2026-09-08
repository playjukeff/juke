/* The three subscription tiers, and what each may connect.

   Customer-facing names match the business plan's ladder (Free / Season
   Pass / Multi-League); the enum values ('free'/'pro'/'allaccess') are the
   worker's own — see worker/store.js's LEAGUE_CAP, which this mirrors.
   Two copies across the client/worker boundary rather than one shared
   module, because those are two separate deployables with no module
   system between them — the same reason leaguePlatforms.js exists
   client-side and sleeper.js/espn.js exist worker-side rather than
   sharing a file. Keep the values in sync if either changes. */

export const TIER_LABEL = { free: 'Free', pro: 'Season Pass', allaccess: 'Multi-League' }

export const LEAGUE_CAP = { free: 0, pro: 1, allaccess: 20 }

export function tierLabel(tier) {
  return TIER_LABEL[tier] || TIER_LABEL.free
}

export function leagueCap(tier) {
  return LEAGUE_CAP[tier] ?? LEAGUE_CAP.free
}

/* The ladder, in order, so a gate can ask "is this tier at least that
   one" without every caller writing the ordering down again.
 *
 * The worker's LEAGUE_CAP happens to be monotonic (0, 1, 20) and it would
 * be tempting to compare caps instead. That is the same fact by
 * coincidence rather than by definition: a tier gates FEATURES as well as
 * league count, and the first feature that a paid tier gets without also
 * raising the cap would silently break every gate built on it. */
export const TIER_ORDER = ['free', 'pro', 'allaccess']

/* Does `have` reach `need`?
 *
 * An unknown `have` — which is what tierStore holds until /me answers —
 * reaches nothing. That is the same "absent, not wrong" call the room
 * header's badge makes: a gate that fell open while the tier was still
 * loading would flash paid content at a Free account on every page load,
 * and a gate that flashes is not a gate. */
export function meetsTier(have, need) {
  if (!need) return true
  const h = TIER_ORDER.indexOf(have)
  const n = TIER_ORDER.indexOf(need)
  if (h < 0 || n < 0) return false
  return h >= n
}
