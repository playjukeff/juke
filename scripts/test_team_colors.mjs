// web/src/lib/teamColors.js — club colours made legible and told apart.
//   node scripts/test_team_colors.mjs
import { contrast, gameColors, hexRgb, legible } from '../web/src/lib/teamColors.js'

let fails = 0
const ok = (name, cond, got) => {
  if (cond) console.log('ok   ' + name)
  else { fails++; console.log('FAIL ' + name + (got !== undefined ? ' — got ' + JSON.stringify(got) : '')) }
}
const rgb = (s) => s.split(' ').map(Number)
const DARK = [21, 28, 39], LIGHT = [255, 255, 255]

ok('hex parses', hexRgb('00338D').join() === '0,51,141' && hexRgb('#fff') === null && hexRgb(null) === null)
ok('navy clears 3:1 on the dark sheet', contrast(legible(hexRgb('00338D'), 'dark'), DARK) >= 3)
ok('gold clears 3:1 on white', contrast(legible(hexRgb('FFB612'), 'light'), LIGHT) >= 3)

const DET = { color: '0076B6', alternateColor: 'B0B7BC' }
const BUF = { color: '00338D', alternateColor: 'D50A0A' }
for (const theme of ['dark', 'light']) {
  const c = gameColors(DET, BUF, theme)
  const [r, , b] = rgb(c.home)
  ok(`${theme}: two blue clubs — home takes its red alternate`, r > b, c.home)
  const ground = theme === 'dark' ? DARK : LIGHT
  ok(`${theme}: both sides clear 3:1`, contrast(rgb(c.away), ground) >= 3 && contrast(rgb(c.home), ground) >= 3)
}

const TB = { color: 'BD1C36', alternateColor: '3E3A35' }
const ARI = { color: 'A40227', alternateColor: '000000' }
const t = gameColors(TB, ARI, 'dark')
ok('two reds with no usable alternate still differ', t.away !== t.home, t)

const n = gameColors({}, {}, 'dark')
ok('no colours at all still answers two distinct marks', n.away !== n.home, n)

if (fails) { console.log(`\n${fails} failing`); process.exitCode = 1 } else console.log('\nall passed')
