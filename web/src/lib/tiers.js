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

export const LEAGUE_CAP = { free: 0, pro: 1, allaccess: 6 }

export function tierLabel(tier) {
  return TIER_LABEL[tier] || TIER_LABEL.free
}

export function leagueCap(tier) {
  return LEAGUE_CAP[tier] ?? LEAGUE_CAP.free
}
