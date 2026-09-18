// web/src/lib/gameSummary.js — ESPN's game summary, trimmed, and a box-score
// line priced under a league's rules. Offline: the fixture below is a small
// summary in ESPN's own shape, so no network and no npm install.
//
//   node scripts/test_game_summary.mjs
import { boardTeam, linePoints, normName, parseSummary, playShortName, playerLine, playerPoints } from '../web/src/lib/gameSummary.js'

let fails = 0
const ok = (name, cond, got) => {
  if (cond) console.log('ok   ' + name)
  else { fails++; console.log('FAIL ' + name + (got !== undefined ? ' — got ' + JSON.stringify(got) : '')) }
}

const athlete = (displayName, pos) => ({ athlete: { displayName, position: { abbreviation: pos } } })
const FIX = {
  header: {
    id: '401', week: 2,
    competitions: [{
      date: '2026-09-18T00:15Z',
      status: { type: { state: 'post', shortDetail: 'Final' } },
      broadcasts: [{ media: { shortName: 'Prime Video' } }],
      competitors: [
        { homeAway: 'home', score: '41', winner: true, record: [{ summary: '2-0' }], linescores: [{ displayValue: '14' }, { displayValue: '27' }], team: { id: '2', abbreviation: 'BUF', name: 'Bills', location: 'Buffalo' } },
        { homeAway: 'away', score: '31', record: [{ summary: '1-1' }], linescores: [{ displayValue: '0' }, { displayValue: '31' }], team: { id: '8', abbreviation: 'WSH', name: 'Commanders', location: 'Washington' } },
      ],
    }],
  },
  boxscore: {
    teams: [
      { team: { abbreviation: 'WSH' }, statistics: [{ label: 'Total Yards', displayValue: '355' }] },
      { team: { abbreviation: 'BUF' }, statistics: [{ label: 'Total Yards', displayValue: '446' }] },
    ],
    players: [
      { team: { abbreviation: 'BUF' }, statistics: [
        { name: 'passing', text: 'Buffalo Passing', labels: ['C/ATT', 'YDS', 'AVG', 'TD', 'INT'], athletes: [{ ...athlete('Josh Allen', 'QB'), stats: ['20/31', '250', '8.1', '3', '1'] }] },
        { name: 'rushing', text: 'Buffalo Rushing', labels: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'], athletes: [{ ...athlete('James Cook III', 'RB'), stats: ['21', '135', '6.4', '1', '35'] }, { ...athlete('Josh Allen', 'QB'), stats: ['14', '69', '4.9', '2', '14'] }] },
        { name: 'receiving', text: 'Buffalo Receiving', labels: ['REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'], athletes: [{ ...athlete('James Cook III', 'RB'), stats: ['1', '4', '4.0', '0', '4', '3'] }] },
        { name: 'fumbles', text: 'Buffalo Fumbles', labels: ['FUM', 'LOST', 'REC'], athletes: [{ ...athlete('James Cook III', 'RB'), stats: ['1', '1', '0'] }] },
        { name: 'defensive', text: 'Buffalo Defense', labels: ['TOT'], athletes: [] },
      ] },
    ],
  },
  winprobability: [{ homeWinPercentage: 0.6, playId: 'p1' }, { homeWinPercentage: 1.2, playId: 'p2' }, { homeWinPercentage: 'x' }],
  drives: { previous: [
    { id: 'd1', team: { abbreviation: 'BUF' }, displayResult: 'Touchdown', description: '3 plays', plays: [
      { id: 'p1', text: ' J.Cook right tackle for 1 yard, TOUCHDOWN. ', period: { number: 1 }, clock: { displayValue: '9:00' }, awayScore: 0, homeScore: 7, scoringPlay: true },
      { id: 'p2', text: 'Kickoff', period: { number: 1 }, clock: { displayValue: '8:55' }, awayScore: 0, homeScore: 7 },
    ] },
    { id: 'd2', team: { abbreviation: 'WSH' }, displayResult: 'Punt', plays: [] },
  ] },
  leaders: [{ team: { abbreviation: 'BUF' }, leaders: [{ displayName: 'Passing Yards', leaders: [{ displayValue: '20/31, 250 YDS', athlete: { displayName: 'Josh Allen', position: { abbreviation: 'QB' } } }] }] }],
  gameInfo: { venue: { fullName: 'Highmark Stadium', address: { city: 'Orchard Park' } } },
}

const g = parseSummary(FIX)
ok('a summary with two teams parses', !!g)
ok('nothing usable is null, not a half-empty game', parseSummary({}) === null && parseSummary(null) === null)
ok('home and away are the right sides', g.home.abbr === 'BUF' && g.away.abbr === 'WSH', [g.home.abbr, g.away.abbr])
ok('scores are numbers, not strings', g.home.score === 41 && g.away.score === 31)
ok('line score by quarter', g.home.lines.join() === '14,27')
ok('state, detail, network, week', g.state === 'post' && g.detail === 'Final' && g.network === 'Prime Video' && g.week === 2)
ok('team stats pair the two sides by label', g.teamStats.length === 1 && g.teamStats[0].away === '355' && g.teamStats[0].home === '446')
ok('an empty box table is dropped', g.box.BUF.every((c) => c.rows.length) && !g.box.BUF.some((c) => c.name === 'defensive'))
ok('win probability joins each point to its play', g.wp[0].play && g.wp[0].play.text.startsWith('J.Cook') && g.wp[0].play.scoring)
ok('a probability outside 0..1 is clamped', g.wp[1].home === 1)
ok('a probability that is not a number is dropped', g.wp.length === 2, g.wp.length)
ok('drives come newest first', g.drives[0].id === 'd2' && g.drives[1].id === 'd1')
ok('plays inside a drive come newest first', g.drives[1].plays[0].id === 'p2')

// ---- names ----
ok('WSH is the board\'s WAS', boardTeam('WSH') === 'WAS' && boardTeam('buf') === 'BUF')
ok('a suffix does not stop a name matching', normName('James Cook III') === normName('James Cook'))
ok('punctuation does not either', normName("Amon-Ra St. Brown") === normName('AmonRa St Brown'))
ok('ESPN\'s play-text short form', playShortName('James Cook III') === 'J.Cook' && playShortName('Amon-Ra St. Brown') === 'A.St. Brown')

// ---- scoring ----
const rules = { pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6, fum_lost: -2 }
const near = (a, b) => Math.abs(a - b) < 1e-9
const cats = g.box.BUF
const pass = cats.find((c) => c.name === 'passing')
ok('a passing line', near(linePoints('passing', pass.labels, pass.rows[0].stats, rules), 250 * 0.04 + 3 * 4 - 2), linePoints('passing', pass.labels, pass.rows[0].stats, rules))
// Cook: 13.5 + 6 rushing, 1 + 0.4 receiving, -2 fumble lost = 18.9
ok('a player sums every scored table, fumbles included', near(playerPoints(g, 'BUF', 'James Cook', rules), 18.9), playerPoints(g, 'BUF', 'James Cook', rules))
// Allen: passing 20 + rushing 6.9 + 12 = 38.9
ok('a quarterback who also ran', near(playerPoints(g, 'BUF', 'Josh Allen', rules), 38.9), playerPoints(g, 'BUF', 'Josh Allen', rules))
ok('a player on no scored table is null, not zero', playerPoints(g, 'BUF', 'Nobody', rules) === null)
ok('no rules is null, not zero', playerPoints(g, 'BUF', 'James Cook', null) === null && linePoints('passing', [], [], null) === null)
ok('a rule the league leaves out scores nothing rather than throwing', near(linePoints('receiving', ['REC', 'YDS', 'TD'], ['2', '20', '0'], { rec_yd: 0.1 }), 2))
ok('the one-line summary', playerLine(g, 'BUF', 'James Cook').includes('21 car · 135 yds · 1 TD') && playerLine(g, 'BUF', 'James Cook').includes('1/3 rec'))

if (fails) { console.log(`\n${fails} failing`); process.exitCode = 1 } else console.log('\nall passed')
