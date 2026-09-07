/* My League's free/guest content — real players off the live board, sample
   everything else, the identical rule WaiverPreview.jsx/TradePreview.jsx/
   StrategyPreview.jsx already follow: a hardcoded roster goes stale the
   morning the pipeline moves, and a preview naming a retired player is the
   kind of small wrongness a fantasy reader notices instantly. Only the
   league-shaped numbers (confidence, deltas, record) are invented, and the
   hero says so out loud.

   Deterministic per board rather than random, so the screen does not
   reshuffle under a reader on every render — same reasoning, same fixed
   offsets into the skill-position slice WaiverPreview already uses. */

const SKILL = ['RB', 'WR', 'TE', 'QB']

export function buildDemoData(board) {
  const skill = board.filter((p) => SKILL.indexOf(p.pos) >= 0)
  const primary = skill[96]
  const bench = skill[130]
  const secondaryA = skill[110]
  const secondaryB = skill[150]

  const weeks = [
    { key: 'draft', label: 'DRAFT', mark: 'good' },
    { key: '1', label: 'W1', mark: 'good' },
    { key: '2', label: 'W2', mark: 'good' },
    { key: '3', label: 'W3' },
    { key: '4', label: 'W4', mark: 'bad' },
    { key: '5', label: 'W5', mark: 'good' },
    { key: '6', label: 'WEEK 6 · NOW' },
    { key: '7', label: 'W7', disabled: true },
    { key: '8', label: 'W8', disabled: true },
  ]

  const decisionsByWeek = {
    draft: primary
      ? [{ said: `Draft ${primary.name}`, did: 'Drafted', verdict: 'good' }]
      : [],
    4: bench
      ? [{ said: `Start ${bench.name} over your flex`, did: 'Started', verdict: 'bad' }]
      : [],
    5: [{ said: 'Hold at WR', did: 'Held', verdict: 'good' }],
  }

  return {
    leagueName: 'Cutback League (sample)',
    teamName: 'Your Team',
    meta: '10-team · Half PPR',
    record: '3-2',
    standing: '4th of 10',
    weeks,
    decisionsByWeek,
    move: primary
      ? {
          room: 'Waiver Room',
          pos: primary.pos,
          title: `Add ${primary.name}${bench ? `, drop ${bench.name}` : ''}`,
          confidence: 81,
          why: 'three signals agree',
          evidence: [
            ['Immediate impact', '+4.2 pts/wk'],
            ['Rest of season', '+31.6 pts'],
            ['Roster need', 'RB3 slot: 3.1 pts/wk'],
          ],
          ctaLabel: 'Open Waiver Room',
        }
      : null,
    secondary: [secondaryA, secondaryB]
      .filter(Boolean)
      .map((p, i) => ({
        room: i === 0 ? 'Strategy' : 'Trade',
        title: i === 0 ? `Start ${p.name} over your current flex` : `Counter this week's offer for ${p.name}`,
        conf: i === 0 ? 71 : 66,
      })),
  }
}
