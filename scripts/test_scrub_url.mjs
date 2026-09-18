// What an error report may say about where the reader was.
//
// web/src/lib/scrubUrl.js removes every query string before a report leaves
// the page, because an address on this site can be a capability: the room
// invite is `#/draft/live?room=ABC1`, and a report carrying it would hand a
// seat in somebody's draft to whoever reads the error inbox. The path stays,
// because it is what makes a report reproducible.
//
// Dependency-free like every other node step in tests.yml.

import { scrubUrl, scrubText } from '../web/src/lib/scrubUrl.js'

let failed = 0
const check = (name, got, want) => {
  if (got === want) console.log('ok  ', name)
  else { failed++; console.log('FAIL', name, '\n     got ', JSON.stringify(got), '\n     want', JSON.stringify(want)) }
}

// The one this exists for.
check('a room invite loses its code',
  scrubUrl('https://jukeff.com/#/draft/live?room=ABC1'), 'https://jukeff.com/#/draft/live')
check('both historical invite shapes too',
  scrubUrl('https://jukeff.com/#/draft-room?room=ZZ99'), 'https://jukeff.com/#/draft-room')

// The path's query and the hash route's query are separate strings.
check('a path query goes and the hash route survives',
  scrubUrl('https://jukeff.com/?cb=123#/players/9221'), 'https://jukeff.com/#/players/9221')
check('both queries at once',
  scrubUrl('https://jukeff.com/?cb=1#/draft?room=X'), 'https://jukeff.com/#/draft')
check('a worker call loses its username',
  scrubUrl('https://juke-draft-room.jukeff.workers.dev/sleeper/lookup?username=chase'),
  'https://juke-draft-room.jukeff.workers.dev/sleeper/lookup')

// What must NOT change — a scrubber that emptied every URL would pass
// everything above and make every report useless.
check('a plain route is untouched', scrubUrl('https://jukeff.com/#/players/9221'), 'https://jukeff.com/#/players/9221')
check('an asset URL is untouched', scrubUrl('https://jukeff.com/assets/index-abc.js'), 'https://jukeff.com/assets/index-abc.js')
check('a non-string passes through', scrubUrl(undefined), undefined)
check('empty passes through', scrubUrl(''), '')

// Free text: a fetch failure's message has no url field to scrub.
check('a URL inside a message loses its query',
  scrubText('GET https://jukeff.com/#/draft/live?room=ABC1 failed (500)'),
  'GET https://jukeff.com/#/draft/live failed (500)')
check('two URLs in one message',
  scrubText('from https://a.io/x?k=1 to https://b.io/y?z=2.'),
  'from https://a.io/x to https://b.io/y')
check('a question mark in prose is left alone',
  scrubText('Why did this fail? Nobody knows.'), 'Why did this fail? Nobody knows.')
check('a quoted URL keeps its closing quote',
  scrubText('fetch("https://a.io/p?secret=1")'), 'fetch("https://a.io/p")')

if (failed) { console.log(`\n${failed} failed`); process.exitCode = 1 }
else console.log('\nall passed')
