/* The "Copy my key" snippets, run as shipped.
 *
 *   node scripts/test_bookmarklets.mjs
 *
 * No browser: the snippet only touches `document.cookie`, `alert`, `window`
 * and `navigator`, so all four are handed in and every effect is
 * observable. It is the REAL string the bookmark carries, not a copy of its
 * logic -- a second copy here would agree with itself while the shipped one
 * was wrong.
 *
 * What this is about is a snippet somebody runs against their own signed-in
 * account. The assertions that matter are the ones about what it does NOT
 * read.
 */
import { CBS_BOOKMARKLET, ESPN_BOOKMARKLET, splitEspnPaste } from '../web/src/components/shell/keyBookmarklets.js'

let failures = 0
function check(what, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a === b) console.log('ok  ' + what)
  else { failures++; console.log('x   ' + what + '\n      expected ' + b + '\n      received ' + a) }
}

/* Run a bookmarklet against a cookie string and report everything it tried
   to show the reader. `navigator` is deliberately bare, so the clipboard
   fallback is what runs and the value is observable. */
function run(bookmarklet, cookie) {
  const said = []
  const body = bookmarklet.replace(/^javascript:/, '')
  new Function('document', 'alert', 'window', 'navigator', body)(
    { cookie },
    (m) => said.push(String(m)),
    { prompt: (_m, v) => { said.push('PROMPT:' + v); return v } },
    {},
  )
  return said.join(' | ')
}

console.log('--- it is a bookmark href, so it has to be one line ---')
for (const [name, bm] of [['CBS', CBS_BOOKMARKLET], ['ESPN', ESPN_BOOKMARKLET]]) {
  check(name + ' starts with javascript:', bm.startsWith('javascript:'), true)
  check(name + ' carries no newline', bm.includes('\n'), false)
}

console.log('\n--- CBS: one cookie, by name ---')
check('it copies pid',
  run(CBS_BOOKMARKLET, 'fly_geo=US; pid=L%3A109%3Aw; anon=FALSE').includes('pid=L%3A109%3Aw'), true)
check('no sign-in is a sentence rather than silence',
  /No CBS sign-in found/.test(run(CBS_BOOKMARKLET, 'fly_geo=US; anon=TRUE')), true)
/* The word boundary earning its keep: a cookie whose NAME contains the one
   we want must not satisfy it. */
check('anon_pid does not satisfy it',
  /No CBS sign-in found/.test(run(CBS_BOOKMARKLET, 'anon_pid=WRONG; pid_backup=ALSO')), true)

console.log('\n--- and it reads nothing else off the session ---')
const nosy = 'pid=REAL; userId=12345; minUnifiedSessionToken10=SECRET; ppid=OTHER'
const cbsOut = run(CBS_BOOKMARKLET, nosy)
check('the value it copies is pid and only pid', cbsOut.includes('pid=REAL'), true)
for (const other of ['12345', 'SECRET', 'OTHER']) {
  check('it never carries ' + other, cbsOut.includes(other), false)
}

console.log('\n--- ESPN: both halves or neither ---')
check('it copies the pair as one string',
  run(ESPN_BOOKMARKLET, 'a=1; SWID={ABC}; espn_s2=AEB%2Fx; b=2').includes('SWID={ABC}; espn_s2=AEB%2Fx'), true)
/* ESPN accepts one alone no more than it accepts none -- the rule the
   connect route already states -- so half a pair must not look like a
   success the reader then pastes. */
check('SWID alone is not a sign-in',
  /No ESPN sign-in found/.test(run(ESPN_BOOKMARKLET, 'SWID={ABC}; b=2')), true)
check('espn_s2 alone is not either',
  /No ESPN sign-in found/.test(run(ESPN_BOOKMARKLET, 'espn_s2=AEB; b=2')), true)
check('and a lookalike name does not stand in',
  /No ESPN sign-in found/.test(run(ESPN_BOOKMARKLET, 'SWID={A}; espn_s2_backup=NOPE')), true)

console.log('\n--- the splitter fires on the combined shape and nothing else ---')
/* Mixed case, and percent-encoded, because a real `espn_s2` is both and is
   compared byte for byte at ESPN. The first version of these used `{A-B}`
   and `XYZ`, which survive being upper-cased unchanged -- so a splitter that
   mangled the value passed every one of them. A fixture too tidy to be
   damaged cannot notice damage. */
const SWID = '{6B2f9c-AbCd-1234}'
const S2 = 'AEBxYz%2Fq9Kj%3D'
check('both, in either order', splitEspnPaste('SWID=' + SWID + '; espn_s2=' + S2), { swid: SWID, espnS2: S2 })
check('order does not matter', splitEspnPaste('espn_s2=' + S2 + '; SWID=' + SWID), { swid: SWID, espnS2: S2 })
check('and the value is handed back byte for byte',
  splitEspnPaste('SWID=' + SWID + '; espn_s2=' + S2).espnS2 === S2, true)
/* An ordinary single-value paste has to fall through untouched, or pasting
   a SWID by hand would silently clear the other box. */
check('a bare SWID is left alone', splitEspnPaste('{A-B}'), null)
check('a bare espn_s2 is left alone', splitEspnPaste('AEBxyz123'), null)
check('half the pair is not the pair', splitEspnPaste('SWID={A-B}'), null)
check('nothing at all', splitEspnPaste(''), null)
check('null', splitEspnPaste(null), null)

console.log(failures ? `\nFAIL — ${failures} failing` : '\nOK — the key bookmarklets')
process.exit(failures ? 1 : 0)
