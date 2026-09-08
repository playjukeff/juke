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
    /* P4. The four the guide names for this screen: record, points for,
       points against the projection, waiver rank. Sample, like everything
       else here that is not a player's name. */
    kpis: [
      { label: 'Record', value: '3-2', note: '4th of 10 through week 5.', accent: 'evidence' },
      { label: 'Points for', value: '612.4', delta: '18.2', deltaSign: 'gain',
        note: 'Ahead of the league median.', accent: 'gain' },
      { label: 'Vs projection', value: '\u221231.9', deltaSign: 'cost',
        note: 'Your lineups have under-run their own forecast.', accent: 'cost' },
      { label: 'Waiver rank', value: '7th', note: 'Priority order for this week\u2019s claims.',
        accent: 'evidence' },
    ],
    /* P2. One habit, the thing it costs a week, and what fixing it is worth.
       The screen's single light card. */
    habit: {
      title: 'You set your flex before Sunday inactives',
      cost: '\u22124.1 pts/wk',
      gain: '+3.2% win',
      body: 'In 4 of 5 weeks your flex was locked before the 11:30 report. Two of those were '
        + 'players who did not play.',
      action: { label: 'Open the Strategy Room', href: '#/rooms/strategy' },
    },
    /* P7. The one run that would test the habit above, pre-configured. */
    runNext: {
      title: 'Half PPR mock from seat 7',
      body: 'Your thinnest seat-and-format cell, and the one where a late flex call costs most.',
      action: { label: 'Start that mock', href: '#/rooms/draft' },
    },
    /* P1 / P3 / P6. Three shapes changed here and each one is the decision
       system saying the same thing about a different kind of number.

       `gap` replaces the key-value evidence table. Its three rows were
       "+4.2 pts/wk", "+31.6 pts" and "RB3 slot: 3.1 pts/wk" - three
       quantities in TWO units under one heading, which is exactly why a
       reader could not compare them and exactly the table P3 says has to
       go. They are one unit now, pts/wk, on one scale, with the league's
       median add drawn as the field marker: the market gap this add is
       worth over what anybody else could have done instead.

       `confidence` replaces the bare 81%. A percentage looks like a
       confidence and is not one - it says nothing about how big the sample
       behind it was, and eighty-one per cent off four weeks and off four
       seasons are not the same claim. Signals, error and sample size are
       three facts a reader can weigh.

       Every figure below is invented, as every league-shaped figure in this
       file already is, and the banner above the screen says so. What is NOT
       invented is the shape: these are the fields a real recommendation
       will carry when a room starts writing one. */
    move: primary
      ? {
          room: 'Waiver Room',
          slug: 'waiver',
          pos: primary.pos,
          title: `Add ${primary.name}${bench ? `, drop ${bench.name}` : ''}`,
          confidence: { agree: 3, signals: 3, error: '\u00b14.1 pts/wk', sample: 'n = 212 wks' },
          gap: {
            unit: 'pts/wk',
            marker: { at: 2.3, label: 'league median add' },
            /* Labelled by role, not by name. The card's own H1 is "Add X,
               drop Y" three inches up, so repeating both names in a 110px
               bar label buys nothing and truncates to "Matthew Golde..." -
               a bar row whose label is an ellipsis is a bar nobody can
               read. */
            rows: [
              { label: 'Added', value: 4.2, sign: 'gain' },
              { label: bench ? 'Dropped' : 'Your current flex', value: 1.1, sign: 'gain' },
            ],
          },
          ctaLabel: 'Open Waiver Room',
        }
      : null,
    secondary: [secondaryA, secondaryB]
      .filter(Boolean)
      .map((p, i) => ({
        room: i === 0 ? 'Strategy' : 'Trade',
        slug: i === 0 ? 'strategy' : 'trade',
        title: i === 0 ? `Start ${p.name} over your current flex` : `Counter this week's offer for ${p.name}`,
        // Signals, not a percentage. Same reason the Move card's own 81%
        // went: a number that looks like a confidence and carries no sample
        // is the thing P6 exists to stop, and a secondary card has even less
        // room to qualify it than the primary one does.
        confidence: i === 0 ? { agree: 2, signals: 3 } : { agree: 2, signals: 4 },
      })),
  }
}
