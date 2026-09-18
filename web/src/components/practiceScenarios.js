import { POS_CHALK } from './draftRoomPositions.js'

/* The four cards the Mock Drafts lobby's "Practice a scenario" grid draws,
   and every rule about which four you get.

   Its own module rather than lines inside PracticeScenarios.jsx for the
   reason oneThatGotAway() lives in app.js rather than in the dashboard that
   draws it: choosing a scenario is a decision, drawing a card is not, and a
   component that does both is where a second opinion about a league's shape
   starts. Everything in here is derived from engine reads — historyList(),
   historyStats(), league() — or is a fixed guest preset. Nothing invents a
   number.

   ---- Two sets, and the fallback between them ----

   Guest gets four curated scenarios. Signed in gets four built out of what
   you have actually drafted. The handoff's own fallback is that a signed-in
   manager with fewer than three graded mocks gets the GUEST cards with the
   signed-in footer line, which is the right call for the obvious reason: a
   card reading "your weak spot" off two drafts is a claim two drafts cannot
   support.

   ---- The accent colours are the repo's, not the handoff's ----

   The handoff names teal #5EE0C6, blue #7AA8FF, pink #F6B8C6 and amber
   #FFD39A, and says in the same breath to "match lobby's RB/WR/QB/TE chip
   palette". Every one of those is within a step of a token this repo already
   has — `mint`, `flow.blue`, POS_CHALK.QB, `flow.gold` — so they are those,
   for the reason tailwind.config.js already gives about this handoff family:
   a second value one step off an existing one is how a colour ends up
   meaning two things on two screens.

   ---- Scoring keys are Juke's ----

   The handoff's type says 'standard' | 'half_ppr' | 'full_ppr' and Juke's
   own keys are 'standard' | 'half' | 'ppr' | 'superflex' (SCORING_NAMES).
   These configs use Juke's, because startScenario() hands them straight to
   setLeague() and a translation layer is one more place for the two to
   disagree. Superflex is a scoring preset here rather than a boolean — the
   preset is what adds the roster slot — so `superflex: true` in the
   handoff's type is `scoring: 'superflex'` in ours. */

/* The accents, as literal class-name-free hex, because they land on
   `style={{ color }}` rather than as a Tailwind class: the eyebrow's colour
   is per card and `text-[${hex}]` is exactly the JIT trap
   draftRoomPositions.js documents at length. */
const ACCENT = {
  mint: '#74E5CE',
  blue: '#82A1F6',
  pink: POS_CHALK.QB,
  gold: '#F7D9A8',
}

const SCORING_LABEL = {
  standard: 'Standard',
  half: 'Half PPR',
  ppr: 'Full PPR',
  superflex: 'Superflex',
}

/* The subline is written from the config, never beside it.

   The handoff gives final copy for every guest card ("Full PPR · 15 rounds ·
   random seat"), and typing that string next to a config that says the same
   thing in numbers is the written-down-twice failure at card scale — the two
   drift the first time somebody edits one. So each card declares which facts
   its subline should say and this builds the sentence out of the config that
   is actually going to be launched. Every guest string below comes out
   byte-identical to the handoff's own. */
function sublineFrom(config, parts) {
  const said = {
    seat: config.seat === 'random' ? 'random seat' : `Seat ${config.seat}`,
    teams: config.teams ? `${config.teams} teams` : '',
    scoring: SCORING_LABEL[config.scoring] || '',
    // A config may legitimately carry no round count — see the New format
    // card, which leaves it to setLeague() to derive because a superflex
    // roster is one slot deeper than the one it started from. An absent
    // fact is dropped from the sentence rather than printed: the first
    // version interpolated it unguarded and put "undefined rounds" on a
    // live card, which is the "absent, not zeroed" rule this file already
    // follows everywhere else, missed in the one place it renders.
    rounds: config.rounds ? `${config.rounds} rounds` : '',
    clock: config.clockSeconds ? `${config.clockSeconds}-second clock` : '',
  }
  return parts.map((k) => said[k]).filter(Boolean).join(' · ')
}

/* ---- Guest ----

   Fixed, curated, and the one set that is not derived from anything —
   which is the point: a visitor with no history has nothing to derive from,
   and four cards of sample-looking content would be worse than four honest
   presets.

   The one claim here that is not a setting is "tips on every pick", and it
   is true without a flag: JukeValueAssistant renders a real recommendation
   above the player list on every turn of every draft, unconditionally. The
   handoff's own `guidedTips: true` therefore has nothing to switch on, and
   adding a flag that turns on something already on would be a control that
   does nothing. What the card actually offers a first-timer is the smallest,
   most standard league Juke runs. */
const GUEST_SCENARIOS = [
  {
    id: 'guest.standard12',
    eyebrow: 'Most popular',
    accent: ACCENT.mint,
    title: 'Standard 12-team',
    parts: ['scoring', 'rounds', 'seat'],
    config: { teams: 12, scoring: 'ppr', rounds: 15, seat: 'random' },
  },
  {
    id: 'guest.guided',
    eyebrow: 'First time?',
    accent: ACCENT.blue,
    title: 'Guided draft',
    subline: '10 teams · tips on every pick',
    config: { teams: 10, scoring: 'half', rounds: 14, seat: 'random' },
  },
  {
    id: 'guest.turn',
    eyebrow: 'Hard mode',
    accent: ACCENT.pink,
    title: 'Draft from the turn',
    parts: ['seat', 'teams', 'scoring'],
    config: { teams: 12, scoring: 'half', rounds: 15, seat: 12 },
  },
  {
    id: 'guest.speed',
    eyebrow: 'Speed run',
    accent: ACCENT.gold,
    title: '30-second clock',
    parts: ['teams', 'rounds', 'scoring'],
    config: { teams: 10, scoring: 'half', rounds: 14, seat: 'random', clockSeconds: 30 },
  },
]

// Three graded mocks, the handoff's own floor for deriving anything.
const DERIVED_MIN_MOCKS = 3

/* A seat you have not drafted from, in the league you actually run.

   `historyList()` hands back a 1-based `seat` and the `teams` that draft ran
   at, so a seat is only "never tried" relative to a league size — seat 12 is
   not untried in a ten-team league, it does not exist. Everything here is
   asked of the CURRENT league's team count for that reason.

   Prefers the ends over the middle when several seats are untried: the turn
   and the top are the two chairs that draft differently enough to be worth
   practising, which is the same reasoning the guest set's "Hard mode" card
   already carries. */
function untriedSeat(history, teams) {
  const drafted = new Set(
    history.filter((h) => h.teams === teams && h.seat).map((h) => h.seat)
  )
  const order = [teams, 1]
  for (let s = 2; s < teams; s++) order.push(s)
  const never = order.find((s) => !drafted.has(s))
  if (never) return { seat: never, never: true }
  // Every chair tried. Fall back to the least-drafted one, which is a
  // different and weaker claim, so the eyebrow says so.
  const counts = new Map()
  history.filter((h) => h.teams === teams && h.seat).forEach((h) => {
    counts.set(h.seat, (counts.get(h.seat) || 0) + 1)
  })
  let seat = 1
  let best = Infinity
  order.forEach((s) => {
    const n = counts.get(s) || 0
    if (n < best) { best = n; seat = s }
  })
  return { seat, never: false }
}

function seatTitle(seat, teams) {
  if (seat === teams) return 'Draft from the turn'
  if (seat === 1) return 'Draft from the top'
  return `Draft from seat ${seat}`
}

/* A scoring format your history has never run.

   The stand-in for "League prep" when no league is connected — a real thing
   about your own drafting rather than an invented league. Superflex first,
   because it is the format that most changes how a draft goes and the one a
   half-PPR-only manager is least ready for. */
function untriedFormat(history, current) {
  const run = new Set(history.map((h) => h.scoring))
  return ['superflex', 'ppr', 'standard', 'half'].find((k) => k !== current && !run.has(k)) || null
}

/* ---- The set somebody actually gets ----

   `league` is the live league object (engine.league()), `history` is
   engine.historyList(), `stats` is engine.historyStats(), `connectedLeague`
   is useLeague()'s answer or null. Any of them may be missing — the board is
   deferred and the worker may be unreachable — and every card below is
   dropped rather than guessed at when its own input is absent, which is the
   "absent, not zeroed" rule historyStats() itself already follows.

   Always returns four cards: whatever is derivable, topped up from the guest
   set in order, so the grid is never three cards and a hole. */
export function scenariosFor({ signedIn, league, history, stats, connectedLeague }) {
  const derived = signedIn && history && history.length >= DERIVED_MIN_MOCKS
  const footer = signedIn
    ? 'Scenarios refresh after each graded mock'
    : 'Sign in to save results and get scenarios built from your drafts'

  if (!derived) {
    return {
      scenarios: GUEST_SCENARIOS,
      footer,
      // Only the guest half of the handoff promises "one tap"; a signed-in
      // manager below the floor is being told what the cards will become.
      rightLabel: signedIn ? 'Run three mocks to personalize these' : 'One tap, settings preloaded',
      derived: false,
    }
  }

  const teams = league.teams
  const scoring = league.scoring
  const rounds = league.rounds
  const cards = []

  // 1. A chair you have not sat in.
  const chair = untriedSeat(history, teams)
  cards.push({
    id: 'user.seat',
    eyebrow: chair.never ? 'Never tried' : 'Least drafted',
    accent: ACCENT.mint,
    title: seatTitle(chair.seat, teams),
    parts: ['seat', 'teams', 'scoring'],
    config: { teams, scoring, rounds, seat: chair.seat },
  })

  /* 2. Your weakest starting spot, as historyStats() measured it.

     The handoff's card here is "Late-round QB · No QB before Rd 8" — a
     self-imposed RULE, and Juke has no way to enforce one: there is no
     scenario constraint in draft-engine.js, engine.draftPlayer() has no
     refusal for it, and autoPickForMe() would happily take the very
     player the card forbade. A card stating a rule the draft does not
     apply is the dead-control failure this project has shipped more than
     once, in its worst form — the reader would believe it.

     So the card names the weakness and states the measurement behind it,
     and the draft it launches is a real one under your own settings. The
     percentage is stats.weakestSpot.pct, which is the share of your last
     ten rosters that finished with that position below replacement — the
     same number the Locker's own Weakest Spot card prints. */
  const weak = stats && stats.weakestSpot
  if (weak) {
    cards.push({
      id: 'user.weak_spot',
      eyebrow: 'Your weak spot',
      accent: ACCENT.pink,
      title: `Shore up ${weak.pos === 'DST' ? 'defense' : weak.pos}`,
      subline: `Below replacement in ${weak.pct}% of your last 10 · ${teams} teams`,
      config: { teams, scoring, rounds, seat: 'random' },
    })
  }

  /* 3. The league you are actually drafting for, if one is connected.

     `totalTeams` is all a connected league gives that a mock can use —
     Sleeper's scoring settings are on the full league object, which
     listLeagues() deliberately does not carry ("only the fields the picker
     draws"). So the team count is real and the scoring stays yours, and
     the subline says so rather than implying the whole league came across. */
  const connectedTeams = connectedLeague && Number(connectedLeague.totalTeams)
  if (connectedTeams >= 4 && connectedTeams <= 24) {
    cards.push({
      id: 'user.league_prep',
      eyebrow: 'League prep',
      accent: ACCENT.blue,
      title: connectedLeague.name || `${connectedTeams}-team league`,
      subline: `${connectedTeams} teams · your scoring · random seat`,
      config: { teams: connectedTeams, scoring, rounds, seat: 'random' },
    })
  } else {
    const fmt = untriedFormat(history, scoring)
    if (fmt) {
      cards.push({
        id: 'user.new_format',
        eyebrow: 'New format',
        accent: ACCENT.blue,
        title: SCORING_LABEL[fmt],
        // No 'rounds': see the config below — there is no honest number to
        // print, because the one this card will run at is derived from a
        // roster the preset itself changes.
        parts: ['teams', 'seat'],
        // Rounds is deliberately not carried over for superflex: the preset
        // adds a starting slot, so the roster — and therefore the round
        // count — is one deeper. Left undefined, startScenario() lets
        // setLeague() derive it, which is the one place that arithmetic
        // lives.
        config: { teams, scoring: fmt, seat: 'random' },
      })
    }
  }

  // 4. The same draft you always run, against a clock that will not wait.
  cards.push({
    id: 'user.speed',
    eyebrow: 'Speed run',
    accent: ACCENT.gold,
    title: '30-second clock',
    subline: 'Your usual settings, faster',
    config: { teams, scoring, rounds, seat: 'random', clockSeconds: 30 },
  })

  // Top up from the guest set rather than drawing a short grid. Filtered by
  // id so a top-up can never duplicate a card already derived.
  const have = new Set(cards.map((c) => c.id))
  GUEST_SCENARIOS.forEach((g) => {
    if (cards.length < 4 && !have.has(g.id)) cards.push(g)
  })

  return {
    scenarios: cards.slice(0, 4),
    footer,
    rightLabel: 'Based on your last 10 mocks',
    derived: true,
  }
}

/* The line under a card's title, whichever way it was specified. Exported
   because the component draws it and the tests read it. */
export function sublineOf(scenario) {
  if (scenario.subline) return scenario.subline
  return sublineFrom(scenario.config, scenario.parts || [])
}
