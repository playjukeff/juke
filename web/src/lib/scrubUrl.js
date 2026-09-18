/* What an error report may say about where the reader was.

   An address on this site can carry a capability rather than a location:
   `#/draft/live?room=ABC1` IS the invite, and anybody holding the code can
   take a seat. Query strings elsewhere carry a Sleeper username or a
   cache-buster. None of that is needed to debug a stack trace, and all of
   it would otherwise travel to a third party on every report, so the query
   comes off before anything leaves the page — the path's own and the hash
   route's, which are separate because the hash is where this app keeps its
   routes.

   The path itself stays: `#/players/9221` is what makes a report
   reproducible, and it names a public board row rather than a person.

   Pure and dependency-free so scripts/test_scrub_url.mjs can drive it in
   bare Node — CI installs no npm dependencies. */

function dropQuery(s) {
  const q = s.indexOf('?')
  return q === -1 ? s : s.slice(0, q)
}

export function scrubUrl(url) {
  if (typeof url !== 'string' || !url) return url
  const hashAt = url.indexOf('#')
  if (hashAt === -1) return dropQuery(url)
  return dropQuery(url.slice(0, hashAt)) + dropQuery(url.slice(hashAt))
}

/* The same rule for a URL buried inside free text — a fetch failure's
   message, a console line — where there is no field to scrub. Everything
   from the first `?` to the next whitespace or quote goes. */
const URL_WITH_QUERY = /(\bhttps?:\/\/[^\s?"'`<>)]*)\?[^\s"'`<>)]*/g
export function scrubText(text) {
  if (typeof text !== 'string' || !text) return text
  return text.replace(URL_WITH_QUERY, '$1')
}
