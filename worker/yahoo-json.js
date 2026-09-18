/* Reading Yahoo's JSON, which is its XML translated mechanically.
 *
 * Its own module because two files need it -- yahoo.js for the league and
 * scoring.js for the league's stat table -- and scoring.js importing
 * yahoo.js would be a cycle through the file that imports scoring.js.
 *
 * Two habits decide how it is read:
 *
 *   A RESOURCE (league, team, player, game, user) is an array. Its first
 *   element is its metadata -- one object, or an array of single-key
 *   objects with empty arrays scattered between them -- and every later
 *   element is an object holding one sub-resource: `{ settings: ... }`,
 *   `{ roster: ... }`.
 *
 *   A COLLECTION (leagues, teams, players, stats) is an object keyed
 *   "0".."n-1" plus a "count", each entry wrapping one member:
 *   `{ team: [...] }`.
 *
 * Neither habit is applied consistently -- the same list is a real array in
 * one response and a numbered object in another -- so every helper here
 * accepts both, and nothing downstream assumes which a node will be. A
 * guess about the shape that is wrong in the tolerant direction costs
 * nothing; one that is wrong in the strict direction drops a roster in
 * silence. */

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isIndex = (k) => /^\d+$/.test(k);

/* A resource, merged into one plain object. Empty arrays are skipped and
   nested arrays of single-key objects are merged in place, so metadata and
   sub-resources land side by side: a team comes out as
   `{ team_key, name, managers, team_standings, roster, ... }`.

   An object is returned as it is, so calling this on something already
   flat is harmless -- which is what lets a caller not know which it has. */
export function flat(x) {
  if (Array.isArray(x)) {
    const out = {};
    for (const el of x) {
      if (Array.isArray(el)) Object.assign(out, flat(el));
      else if (isObj(el)) Object.assign(out, el);
    }
    return out;
  }
  return isObj(x) ? x : {};
}

/* A collection's members, in order, each unwrapped from its `{ name: ... }`
   holder. Numbered keys are sorted as numbers: "10" after "9". */
export function members(coll, name) {
  if (Array.isArray(coll)) {
    return coll.map((e) => (isObj(e) ? e[name] : undefined)).filter((e) => e !== null && e !== undefined);
  }
  if (!isObj(coll)) return [];
  return Object.keys(coll)
    .filter(isIndex)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => (isObj(coll[k]) ? coll[k][name] : undefined))
    .filter((e) => e !== null && e !== undefined);
}

/* A named child that may sit on the node itself or one numbered level
   down -- `roster: { "0": { players: {...} } }` is the case that needs it. */
export function child(node, name) {
  const o = Array.isArray(node) ? flat(node) : node;
  if (!isObj(o)) return null;
  if (o[name] !== undefined) return o[name];
  for (const k of Object.keys(o)) {
    if (isIndex(k) && isObj(o[k]) && o[k][name] !== undefined) return o[k][name];
  }
  return null;
}
