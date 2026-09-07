/* ==========================================================
   Juke — The Draft Room, behaviour

   Read the section headers first. Each one does one job.
   ========================================================== */


/* ---- 1. League settings ---------------------------------
   One object describes the league, and everything else in
   this file is worked out from it. The setup screen writes
   to it before a draft starts.

   The rule to keep: never write a league number down twice.
   The old code had ten teams spelled out in a dozen places
   and a hand-picked replacement level that only made sense
   for one of them.                                        */

const league = {
  teams: 10,
  rounds: 14,
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 },
  flex: 1,           // one FLEX, drawn from RB / WR / TE
  superflex: 0,      // a FLEX a quarterback may also fill; 1 makes it 2QB
  bench: 5,
  scoring: "half",   // see SCORING_NAMES — also picks the ADP set
  rules: null,       // the scoring table; filled in below, editable on setup

  /* ---- The three fields the draft-settings screen added ----

     All three are read by draft-engine.js rather than by anything here,
     which is why they sit on `league` and not on `state`: the engine's
     whole contract is that a config decides what is LEGAL, and every
     client and the server have to reach the same answer from the same
     config. A per-drafter setting (the pick clock) lives on `state`; a
     property of the board everyone shares lives here.

     `name` is the exception and is here for a duller reason: a room
     broadcasts its league whole (see adoptRoom's own note on why joining
     a room means taking ALL of it), so a draft's name arrives with it and
     everybody sees the same one. */
  draftType: "snake",         // "snake" | "linear" — see DraftEngine.reversedRound
  thirdRoundReversal: false,  // snake only; round 3 repeats round 2's direction
  playerPool: "all",          // "all" | "rookies" | "vets" — see inPool()
  name: "",                   // what this draft is called; blank means unnamed

  /* Whether a human seat whose clock runs out gets drafted for.

     This has always happened and was never a setting: startTicking() hits
     zero and calls autoPickForMe(). Turning it off is a real, describable
     behaviour rather than a stall dressed up as one — the clock reaches
     0:00 and the seat stays yours until you pick, which is what a league
     with a commissioner actually does when somebody misses their window.

     CPU seats are untouched by it in both states. They are not users
     running out of time; they are the room, and a room that stops moving
     because a setting about humans was switched off is a deadlock. */
  cpuAutopick: true
};

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DST"];

/* What a position is called on screen, as opposed to the key it is stored
   under. Only one of them differs, and that one difference was written out
   three times — so the roster, the board legend and the starting-lineup
   controls all said "D/ST" while the two position filters said "DST". */
function posLabel(pos) { return pos === "DST" ? "D/ST" : pos; }

// The order starting slots are listed and filled, with FLEX after the
// positions it draws from so the better player lands in the named slot.
const SLOT_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "SFLEX", "DST", "K"];

// Which positions can fill a slot. FLEX is the classic RB/WR/TE; SFLEX adds
// the quarterback, and that one extra entry is the whole of what a superflex
// league is. Written down once because the starting lineup, the draft grade
// and the CPU all ask the question, and three answers that could drift apart
// is exactly the kind of quiet bug this file is organised to avoid.
const SLOT_ELIGIBLE = {
  FLEX:  ["RB", "WR", "TE"],
  SFLEX: ["QB", "RB", "WR", "TE"]
};

function fillsSlot(player, slot) {
  const eligible = SLOT_ELIGIBLE[slot];
  return eligible ? eligible.indexOf(player.pos) >= 0 : player.pos === slot;
}

// How many of a slot the league starts. Flex kinds live beside the named
// positions rather than inside league.starters, because they are not
// positions and counting them as one breaks every per-position sum.
function slotCount(slot) {
  if (slot === "FLEX")  return league.flex;
  if (slot === "SFLEX") return league.superflex;
  return league.starters[slot] || 0;
}

// Guarded because players.js/stats.js/draft-engine.js now load off the
// critical path (see the deferred-data boot below) — the setup screen has
// to be able to compute a picture of "no draft yet" before DraftEngine has
// arrived, rather than throwing and taking the rest of the boot sequence
// down with it.
function totalPicks()   { return typeof DraftEngine === "undefined" ? 0 : DraftEngine.totalPicks(league); }

// The one place "are the three deferred files here yet" gets answered —
// window.JukeEngine.dataReady() (near the foot of this file) hands this
// straight out rather than keeping its own second copy, and onRoomChange()
// below reads it directly, which is the reason this needs a name instead of
// staying an inline arrow function on the bridge object: the bridge is
// declared hundreds of lines after onRoomChange() runs for the first time,
// but a function declaration is hoisted and callable from anywhere in this
// file regardless of where onRoomChange() itself sits in the source.
function dataReady() {
  return typeof DraftEngine !== "undefined" && typeof PLAYERS !== "undefined" &&
         typeof STAT_KEYS !== "undefined";
}
function starterCount() { return POSITIONS.reduce((n, pos) => n + league.starters[pos], 0); }
function flexCount()    { return league.flex + league.superflex; }
function rosterSize()   { return starterCount() + flexCount() + league.bench; }

// The starting lineup, expanded into one entry per slot:
// QB, RB, RB, WR, WR, TE, FLEX, DST, K for the default settings.
function lineupSlots() {
  const slots = [];
  SLOT_ORDER.forEach(function (slot) {
    const n = slotCount(slot);
    for (let i = 0; i < n; i++) slots.push(slot);
  });
  return slots;
}

// A player carrying one of these has been ruled out. CPU teams never
// take them and they never appear in your suggestions.
const RULED_OUT = ["O", "IR", "SUS", "NFI", "DNR"];

// Available, but carrying real risk. Everyone drafts them later.
const RISKY = ["D", "PUP"];

// How many of a position a CPU team will ever hold: its starters, its share
// of the FLEX, and enough depth to look like a real roster. The tight numbers
// on TE, K and DST are what stop a team hoarding them.
const DEPTH_ALLOWANCE = { QB: 3, RB: 5, WR: 5, TE: 2, K: 2, DST: 2 };

/* How a seat feels about kickers and defenses.

   This replaced a pair of hard round gates - no kicker before `rounds - 1`,
   no defense before `rounds - 2` - and the gates were not a small error.
   Measured 1 September 2026 against the real 480-player board, driving this
   file's own cpuChoice() in a browser. With the gate, over 60 drafts: the first
   defense came off between picks **111 and 112** and the first kicker between
   **121 and 123**, defenses spread over 2 to 3 distinct rounds and kickers over
   exactly 2. Without it, over 120 drafts: the first defense lands between **72
   and 89** and the first kicker between **103 and 128**, defenses across **4 to
   7** rounds and kickers across **2 to 4**.

   A one-pick spread across sixty drafts is the indictment. A calendar rule has
   no variance to give, so every room the app had ever run took its first
   defense on the same pick of the same round. Real 2026 rooms put it anywhere
   from 86 to 131.

   The board's own data already disagreed with the gate: Seattle Defense carried
   an FFC ADP of 81.6 that morning, which is round nine of a ten-team draft,
   while the CPU refused to look at a defense until round twelve. The exact
   figure moves nightly; a defense going three rounds before the CPU will
   consider one is the part that does not.

   So the two positions are gated player by player, the way every other position
   already is - by what they cost against what else is on the board - plus this:
   ten managers do not all decide they need a defense on the same pick, and a
   single shared opinion is what produced the wall. Values multiply ADP, so
   below 1 reaches and above 1 waits.

   Kickers wait longer than defenses because the market does: FFC's first
   defense goes around 81 and its first kicker around 126, and almost nobody
   takes a kicker early on purpose. */
const KD_ARCHETYPES = {
  DST: { vals: [0.85, 1.05, 2.40], weights: [0.22, 0.48, 0.30] },
  K:   { vals: [1.05, 1.45, 2.40], weights: [0.18, 0.47, 0.35] }
};

/* Last call. Small enough that adp x this beats anything else on the board, so
   a seat that has run out of room fills its mandatory slots rather than
   finishing the draft with an empty one - which is the one thing the round
   gates did buy and the one thing that may not be given up with them. */
const KD_LAST_CALL = 0.05;

/* Which archetype this chair drew, for this position, in this draft.

   `seed` is threaded rather than read off `state` so par can ask the question
   under its own wobble. seatParTable() runs twelve drafts under PAR_SEEDS
   precisely so par is a property of the board rather than of tonight's draft,
   and PAR_CACHE's key does not carry `state.seed` - so an appetite that read
   the global would make par silently seed-dependent and then serve a stale
   table to the next draft on the same board.

   Guarded like every other DraftEngine caller in this file: a bridge entry is
   only as safe as its own guard, and needFromCount() is reachable from React on
   mount while draft-engine.js is still deferred. The middle archetype is what
   an unguarded call would mostly have drawn anyway. */
function kdAppetite(slot, pos, seed) {
  const a = KD_ARCHETYPES[pos];
  if (!a) return 1;
  if (typeof DraftEngine === "undefined") return a.vals[1];
  const s = typeof seed === "number" ? seed : state.seed;
  const r = DraftEngine.seatRoll(typeof slot === "number" ? slot : 0, s, pos === "K" ? 7 : 11);
  if (r < a.weights[0]) return a.vals[0];                   // takes one early
  if (r < a.weights[0] + a.weights[1]) return a.vals[1];    // normal
  return a.vals[2];                                         // waits it out
}

/* `lg` is an explicit league for the one caller that has to ask about a shape
   that is not the one on screen: the Locker reconstructs a mock played at 12
   teams while you are sitting in a 10-team league, and par for that mock has
   to be par for *its* shape. Defaults to the live league, so every other
   caller is unchanged.

   Threaded rather than swapped. Assigning to the global `league` around a
   computation and restoring it afterwards is the shape gradeAndRosterAt()
   already documents as dangerous — one shared object, many readers, and a
   restore that is only correct if nothing ran in between. */
function maxAt(pos, lg) {
  const L = lg || league;
  const flexShare = (pos === "RB" || pos === "WR") ? L.flex : 0;
  // A superflex is a second startable quarterback, so it lifts the ceiling on
  // how many a team will hold. Without this a CPU stops at one and a
  // superflex league drafts like a normal one.
  const superShare = pos === "QB" ? L.superflex : 0;
  return L.starters[pos] + flexShare + superShare + DEPTH_ALLOWANCE[pos];
}

/* How many at a position this lineup can actually START — Infinity where the
   question does not arise, which is every position a bench body is a
   perfectly ordinary pick at.

   Three positions have an answer and it is the same rule the grade charges
   nine points a head for: a second kicker or a second defense can never be
   played, and nor can a second quarterback unless the format opened a seat
   for one. `league.starters.QB` is 1 in a superflex league too — the extra
   seat is a SFLEX, not a second QB slot — which is exactly the drift that
   caused the superflex grading bug, and this expression was written out by
   hand in three places at once when that bug was found: needFromCount(),
   analyseTeam()'s construction charge and buildText()'s caption. One rule,
   one place; the rest ask.

   Infinity rather than a big number, so the callers that subtract from it
   (`count - startableCap(pos)`) come out at or below zero for RB, WR and TE
   and need no list of which three positions this applies to. */
function startableCap(pos, lg) {
  const L = lg || league;
  if (pos === "QB") return L.starters.QB + L.superflex;
  if (pos === "K" || pos === "DST") return L.starters[pos];
  return Infinity;
}

/* How many at a position one roster may legally hold, which is the tighter of
   the two ceilings above: the depth allowance that stops a team hoarding
   backs, and — for the three positions that have one — the number it could
   ever start. For QB, K and DST the second always wins, so holdCap() and
   startableCap() are the same number there by construction.

   needFromCount() is the caller that matters: this is precisely the line
   above which it refuses a position outright. Everything that wants to know
   what a roster is allowed to contain asks here rather than restating either
   half. */
function holdCap(pos, lg) {
  const L = lg || league;
  return Math.min(maxAt(pos, L), startableCap(pos, L));
}

// Replacement level: the last player at a position who would realistically
// start somewhere in the league. It has to be derived, because it moves with
// team count and FLEX slots, and it feeds the draft grade, the Juke score
// and value over replacement. The FLEX shares are how often each position
// actually wins that slot, which is why RB and WR run so much deeper.
const FLEX_SHARE = { RB: 0.40, WR: 0.55, TE: 0.05 };

// A superflex is won by a quarterback almost every time — that is the point
// of the format, and it is why quarterbacks go two rounds earlier in one.
// The remainder is the handful of managers who take the better skill player.
const SFLEX_SHARE = { QB: 0.85, RB: 0.05, WR: 0.09, TE: 0.01 };

function replacementRank(pos) {
  const base = league.teams * (league.starters[pos] || 0);
  const flex = league.teams * league.flex * (FLEX_SHARE[pos] || 0);
  const sflex = league.teams * league.superflex * (SFLEX_SHARE[pos] || 0);
  return Math.round(base + flex + sflex) + 1;
}

// The same ranks written out in prose, for the method notes on the page.
// They used to be typed into the copy by hand, which is exactly how the copy
// and the maths drifted apart.
function replacementText() {
  return POSITIONS
    .map((pos) => posLabel(pos) + replacementRank(pos))
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");
}

/* The starting lineup in prose, derived the same way and for the same note.
   The ranks above are worked out from this shape and nothing else, so a note
   naming the room but not the lineup explains the least interesting half: on
   a custom lineup it printed "QB21 ... for this 10-team league with a FLEX",
   and there is no way to get from that to two starting quarterbacks. TE2 is
   stranger still until you know the league starts no tight end.

   Built from SLOT_ORDER so the FLEX and the superflex appear in the order
   they are filled, and so a slot added there is never missing here. */
function lineupText() {
  return SLOT_ORDER
    .filter((slot) => slotCount(slot) > 0)
    .map((slot) => slotCount(slot) + " " + posLabel(slot))
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");
}

const REPLACEMENT_PTS = {};

// The best value over replacement anywhere on the board. Every Juke score
// is a percentage of it, so it is worked out once per build in
// buildProjections() rather than per player.
let BEST_VOR = 0;

// One per seat, up to the largest league the setup screen offers. The list
// used to stop at fourteen, which was exactly the old maximum — so raising
// the cap without extending it here would have handed CPU_NAMES[s] an
// undefined and thrown on .split() while drawing the board.
const CPU_NAMES = [
  "Wild Goose Chase", "Bijan Mustard", "Nacua Matata", "The Gibbs Ultimatum",
  "Kupp of Joe", "Purdy Vacant", "Hurts So Good", "Saquon For The Team",
  "Lambo No. 5", "Bone-Thugs-N-Montgomery", "Alvin and the Chipmunks",
  "Better Call Saquon", "A League of Their Mahomes", "Tua Fast Tua Furious",
  "Kelce Grammer", "Show Me Your TDs", "Breece Lightning", "Chubb Rock",
  "Waddle I Do", "Jeanty's Inferno", "Bowers to the People", "Hall of a Guy",
  "Jefferson Airplane", "London Calling", "McConkey Business",
  "Achane Reaction", "Odunze the Road Again", "Higgins Boson",
  "Pitts and Pieces", "Burrow Deep", "The Fresh Prince of Bel-Aiyuk",
  "Nix on the Beach"
];

// Never indexes past the end. The list is long enough for every league the
// screen offers, but a seat without a name should read plainly rather than
// take the board render down with it.
function cpuName(slot) {
  return CPU_NAMES[slot] || "Team " + (slot + 1);
}


/* ---- 2. Page elements ---------------------------------- */

const $ = (id) => document.getElementById(id);

const appbar     = $("appbar");
const statusLine = $("statusLine");
const pickLabel  = $("pickLabel");
const pickText   = $("pickText");
const leagueLabel = $("leagueLabel");
const countBlock = $("countBlock");
const rightLabel = $("rightLabel");
const rightValue = $("rightValue");
const shellbar   = $("shellbar");
const actionbar  = $("actionbar");
/* The band both of those sit in. It carries the hidden flag for the pair,
   rather than each of them carrying its own: they have only ever been shown
   and hidden together, in four places, and two flags that must agree is one
   flag with a second copy. It also has to be the wrapper that hides — an
   empty band still draws its background and its bottom border. */
const tabrow     = $("tabrow");

// Toggles live in both headers and, on a phone, inside the rooms panel, which
// is rendered rather than static. So nothing caches the set: it is queried when
// it is needed and clicks are delegated.
const themeBtns = () => document.querySelectorAll(".theme-toggle");


/* ---- 2b. Light and dark ---------------------------------
   Dark is the default, and it is the default in the
   stylesheet rather than here: :root carries the dark
   values and only data-theme="light" overrides them. So a
   reader who has never touched the toggle gets a dark page
   even before this file has loaded, and nothing has to be
   applied on boot.

   The head of index.html re-applies a saved choice before
   the first paint. All this section does is flip it and
   write it down.                                          */

const THEME_KEY = "draftroom.theme";

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function setTheme(theme) {
  // The dark theme is the absence of an attribute, not a value of it, so
  // that a saved choice and the default can never disagree.
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else                   document.documentElement.removeAttribute("data-theme");

  try { localStorage.setItem(THEME_KEY, theme); } catch (err) {}   // private browsing
  syncThemeButton();
}

// The button says what it will do, not what is on screen, because that is
// what a screen reader user needs to hear before pressing it.
function syncThemeButton() {
  const dark = currentTheme() === "dark";
  const label = dark ? "Switch to the light theme" : "Switch to the dark theme";
  themeBtns().forEach(function (btn) {
    btn.setAttribute("aria-pressed", String(dark));
    btn.setAttribute("aria-label", label);
    btn.title = label;
  });
}

syncThemeButton();


/* ---- 2b. Sound ------------------------------------------
   Three cues, synthesised in the page. No audio files, and
   that is a decision rather than a shortcut: three tones do
   not justify the first binary assets in a repository that
   has none, a generated tone cannot 404 or be served stale
   behind a cache, and it costs no request on a page that
   currently loads no third-party media at all. Same
   argument as the door being drawn and the product shot
   being generated.

   A draft is the one screen in this app where somebody
   legitimately looks away — the whole point of a clock is
   that it runs while you are doing something else — so this
   is the one screen where sound earns its place. It is off
   until asked for, and the preference is remembered.     */

const SOUND_KEY = "draftroom.sound";

let soundWanted = false;
try { soundWanted = localStorage.getItem(SOUND_KEY) === "on"; } catch (err) {}

/* One context, made on the first gesture that needs it and never before.

   Browsers refuse to start an AudioContext outside a user gesture, and one
   created at load sits in "suspended" for ever — so the first cue would be
   silent with nothing to say why. Pressing the toggle is a gesture, and so is
   starting a draft. */
let audio = null;

function audioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;                 // no Web Audio: the app is unaffected
  if (!audio) audio = new Ctx();
  if (audio.state === "suspended") audio.resume();
  return audio;
}

/* A note. Sine rather than square, and an envelope rather than a straight
   gain: an abrupt start or stop on a raw oscillator is a click, which is
   audible as a fault rather than as a sound somebody chose. */
function tone(freq, startAt, ms, peak) {
  const ctx = audioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const t0 = ctx.currentTime + startAt;
  const t1 = t0 + ms / 1000;

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t0);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

/* Never throws, and that is the contract rather than politeness. Web Audio
   is a runtime dependency on the browser's own hardware — a device with no
   output, a context the browser declines to resume, a policy we did not
   anticipate — and none of that may reach a draft. It fails by going quiet,
   the same way the score strip fails by disappearing. */
function play(cue) {
  if (!soundWanted) return;
  try {
    if (cue === "turn") { tone(587.33, 0, 110, 0.16); tone(880.00, 0.10, 190, 0.16); }
    else if (cue === "tick") { tone(1046.50, 0, 55, 0.09); }
    else if (cue === "done") {
      tone(523.25, 0, 220, 0.13); tone(659.25, 0.09, 220, 0.13); tone(783.99, 0.18, 320, 0.13);
    }
  } catch (err) {}
}

/* What has already been said, so a cue fires on the change rather than on
   every render. renderHeader() runs on every pick, every tick and every
   rebuild, so "is it my turn" is true hundreds of times for one turn. */
const saidAt = { mine: false, tick: null, over: false };

function soundCue() {
  if (!state.started) { saidAt.mine = false; saidAt.tick = null; saidAt.over = false; return; }

  if (draftOver()) {
    if (!saidAt.over) { saidAt.over = true; play("done"); }
    return;
  }

  const mine = isMyTurn();
  if (mine && !saidAt.mine) play("turn");
  saidAt.mine = mine;

  /* The last five seconds, once each. Only on your own clock: a countdown
     running against somebody else is not a thing to be hurried by, and in a
     twelve-team room it would tick sixty times a round. */
  const left = state.timeLeft;
  if (mine && clockShowing() && !state.paused && left > 0 && left <= 5) {
    if (saidAt.tick !== left) { saidAt.tick = left; play("tick"); }
  } else {
    saidAt.tick = null;
  }
}

function syncSoundButton() {
  const btn = $("soundBtn");
  if (!btn) return;
  const label = soundWanted ? "Turn draft sounds off" : "Turn draft sounds on";
  btn.setAttribute("aria-pressed", String(soundWanted));
  btn.setAttribute("aria-label", label);
  btn.title = label;
}

function toggleSound() {
  soundWanted = !soundWanted;
  try { localStorage.setItem(SOUND_KEY, soundWanted ? "on" : "off"); } catch (err) {}
  syncSoundButton();
  // The press is the gesture that lets the context start, and hearing the
  // thing you just switched on is the only confirmation worth giving.
  if (soundWanted) play("turn");
}

syncSoundButton();


/* ---- 2c. The site shell ---------------------------------
   Two views behind one hash route: the landing page at "#/"
   and the Draft Room at "#/draft-room".

   "#/draft" was the Draft Room and is retired -- applyRoute()
   redirects it. Its markup (#view-app) is still here and still
   written to on every render; it is unreachable, not deleted.

   Hash routing rather than real paths. It was forced at first
   -- GitHub Pages has no rewrite to send /draft back to
   index.html -- and that constraint went away with the move to
   Cloudflare Pages, where a _redirects file does exactly that.

   What holds it now is the reason that was always better: the
   hash keeps the back button working, which matters most to the
   person pressing it mid-draft. Every saved link, every invite
   and the installed app's start_url are also written this way,
   so real paths are a feature with a migration behind them
   rather than a tidy-up.                                    */

/* The three phases of a fantasy season, in the order they happen.

   These are a sequence, not a set of buckets, and the landing page draws
   them that way — left to right, rooms stacked under each. A season arc says
   "this covers the whole year" without a line of marketing copy, which a row
   of badges on a flat grid cannot. */
const SEASONS = ["Pre-season", "In-season", "Post-season"];

/* Every room, its phase, and what it is for.

   The blurbs are the short version of the real thing, so they have to
   describe all of it. An earlier set was written from the room names alone
   and each one covered about half its room: the Waiver Room without the
   roster, the Strategy Room as draft-only, the Trade Room evaluating but not
   simulating, and the Prospect Room described as dynasty value, which is not
   what college-to-NFL scouting is at all.

   The League Room is gone from this array now — see the comment where it
   used to sit, after Strategy — which is what makes the paragraph above
   correct about five rooms rather than the six it was written against. */
const ROOMS = [
  // #/draft-room, not #/draft: that's the legacy vanilla route
  // applyRoute() still toggles (#view-app, hidden-not-deleted DOM — see
  // CLAUDE.md), but every real Draft Room feature built since the React
  // rewrite only exists on #/draft-room (DraftRoom.jsx, outside
  // applyRoute() entirely — see main.jsx). This is the single place that
  // string is written down — read through the rooms() bridge below by the
  // homepage's room grid (web/src/components/RoomsGrid.jsx) — so it's the
  // one place to fix if a "start a draft" entry point ever points at the
  // old page again.
  //
  // Ordered chronologically across a fantasy season now (scouting, then the
  // draft itself, then everything in-season, then the wrap-up) rather than
  // live-room-first — confirmed nothing indexes this array positionally
  // (grep for "ROOMS[0]" turns up one comment, no code), so the order is
  // free to carry meaning instead of just reflecting launch sequence.
  //
  // `lead` is the short imperative line a card leads with ("Scout the
  // future.") — added for the homepage grid's card layout. `blurb` is the
  // longer description underneath it.
  //
  // `slug`, `glyph`, `accent` and `hook` arrived with design_handoff_v3_alive,
  // which turns the rooms from a marketing grid into six real destinations
  // (#/rooms/waiver). They are presentation, and they are here rather than in
  // a map beside the React components for the reason this array's own comment
  // already gives about the Draft Room's href: a room written down in two
  // places drifts, and the thing that drifts silently is the one nobody
  // renders twice on the same screen. A room with no `slug` has no page yet
  // and its card does not link.
  //
  //   slug   — the #/rooms/<slug> segment
  //   glyph  — the card and hero mark. Deliberately a character rather than
  //            an icon import: it is read by the legacy homepage (no bundler)
  //            and by React alike. Emoji where the design uses one, a plain
  //            dingbat where it uses that (◎, ⇄) — those two are tinted by
  //            `color` and an emoji cannot be.
  //   accent — the room's own hue, from the handoff. Waiver is #00E5FF and
  //            not the README's #74E5CE: both breakpoints' markup says cyan
  //            (2dg/3dg), and the HTML is the spec where the two disagree.
  //   hook   — the one line a locked card shows a guest.
  /* Retired once, un-retired here. design_handoff_v3_alive drew four
     locked rooms and no Prospect — not in its README, not in a screenshot
     — against every earlier document's six, and that was a real product
     decision rather than an oversight, so the entry was flagged `retired`
     rather than deleted: everything that draws a room (the lobby, the
     homepage grid, the footer column) reads the same rooms() bridge, and
     the flag was the one place to make it disappear from all three at
     once.

     Juke Journey v3's rail restores it — its own room order names Draft,
     Waiver, Strategy, Trade, Prospect — so `retired` comes off. What it is
     for is partly here already: the Draft Room runs a rookies-only draft
     today (league.playerPool, Draft Settings), which is the drafting half
     of "scout the incoming class". The half that is not here is the
     college-production-to-NFL translation this blurb promises, which is
     still owed — un-retiring the entry did not build the room behind it. */
  { name: "The Prospect Room", slug: "prospect", glyph: "🔭", accent: "#82A1F6",
    hook: "Preview: rookie board before the draft", live: false, season: "Pre-season",
    lead: "Scout the future.",
    blurb: "Analyze the college production and NFL translation of incoming rookies before they even hit your draft board." },
  // #/drafts (the Lobby/Locker), not #/draft-room (the live Cockpit
  // itself). DraftRoom.jsx's own `enteredRoom` state persists for the rest
  // of the tab's life once a draft is entered — including a finished one,
  // until "Discard draft" clears it — so a link straight into #/draft-room
  // landed on whatever draft was last open rather than on a fresh choice.
  // Reported exactly that way: view a completed draft, go home, press
  // "Enter the Draft Room" again, land right back on the same finished
  // board instead of the Lobby. #/drafts is `draftsActive` in that file,
  // which forces the Lobby regardless of `enteredRoom` — the one route
  // built for exactly this "start from a clean choice" entry.
  { name: "The Draft Room", slug: "draft", glyph: "◎", accent: "#00E5FF",
    hook: "Mock smarter.", href: "#/rooms/draft", live: true, season: "Pre-season",
    lead: "Mock smarter.",
    blurb: "Run unlimited draft simulations against a board that automatically adjusts for ADP, tiers, and your custom scoring rules." },

  { name: "The Waiver Room", slug: "waiver", glyph: "⚡", accent: "#00E5FF",
    hook: "Preview: 4 claims worth making this week", live: false, season: "In-season",
    lead: "Win the wire.",
    blurb: "Connect your live league to simulate waiver claims and evaluate which free agents will actually impact your bottom line." },
  { name: "The Trade Room", slug: "trade", glyph: "⇄", accent: "#CDBDEF",
    hook: "Preview: fair-value check on any offer", live: false, season: "In-season",
    // Homepage v4 pass 2's fix: a trade changes your roster, not your
    // remaining schedule — the old body's own claim, corrected.
    lead: "Price the deal.",
    blurb: "Both rosters valued against replacement, with the rest-of-season swing for each side shown before you send it." },
  { name: "The Strategy Room", slug: "strategy", glyph: "🧭", accent: "#74E5CE",
    hook: "Preview: start/sit by matchup", live: false, season: "In-season",
    lead: "Optimize every week.",
    blurb: "Set your lineup using predictive analytics, probabilistic matchup outcomes, and deep opponent analysis." }

  /* The League Room left this array on Juke Journey v3's shell pass. It
     graduated into My League (#/my-league), a rail item that sits above
     these five rather than beside them, absorbing everything this room
     used to show (standings, the draft countdown) plus the week strip and
     the primary recommendation. It is not coming back here the way
     Prospect could — deleting a line does not restore it — so there is
     nothing to un-flag if a future room takes the name "League" again. */
];

/* ---------- the product shot ----------

   A first-time visitor never saw what this app looks like. The landing page
   had no image of any kind — not one <img> and not one illustrative <svg> —
   so the most persuasive thing the project has built was invisible until
   somebody committed to a draft to see it.

   This draws the opening rounds of a real board: the same `board` array the
   draft reads, valued the way the draft values it, in real snake order, in the
   position colours the app uses everywhere else. It is a screenshot that
   cannot go stale, because there is nothing in it to keep in sync.

   Ten teams because that is the league this was built for and the shape the
   setup screen still defaults to.

   Five rounds because four stops one row short of the tight ends. The elite
   quarterback lands in the third and the two tight ends worth having in the
   fourth, so at four rounds the fourth is the row the mask is busy dissolving
   and the only two cells that are not a back or a receiver arrive as ghosts.
   A fifth round costs 37px, moves nothing above it — the button and the
   headline both sit above the shot — and gives the fade a row of its own to
   eat, which is what it is for. */
const SHOT_TEAMS = 10;
const SHOT_ROUNDS = 5;
const SHOT_MINE = 3;      // one column reads as yours, the way a real board does

/* The shot used to be `board[i]` — the opening names in ADP order, laid out in
   snake order. That is a real board and it is the wrong one, because **ADP is
   an average and no single draft looks like an average.** A position that goes
   early in half the rooms and late in the other half averages to the middle,
   where it loses to the run of backs and receivers that go at the same spot in
   every room. Measured on today's data, the top forty by ADP is eighteen RB,
   twenty-one WR and one QB — no tight end at all — so the graphic was two
   colours and a single red cell, and it read as synthetic to anybody who has
   drafted. The tight ends are there at 41 and 43, one row past the crop.

   So the shot drafts rather than slices: fifty picks, snake order, each seat
   valuing the board the way `suggestions()` does — ADP, need, injury risk and
   the app's own model.

   Two of those four are what move the scarce positions up, and they move them
   for different reasons. **The model prices them.** `overallScore()` is points
   above replacement measured *across* positions, so it can say an elite tight
   end beats the twenty-fifth receiver — which is exactly what an ADP average
   smooths away and exactly what the product claims to know. **Need is what
   makes a seat stop taking backs.** A fourth running back is past the starting
   requirement and loses the 0.80, so once a seat has its starters the QB and
   TE still on 0.80 finally win a pick — which is why a real room's fifth round
   has quarterbacks in it and an ADP slice never does.

   Neither is a thumb on the scale. `MODEL_CAP` holds the model to a quarter of
   a player's price, so this is a nudge off the market rather than a different
   board: measured on today's data the quarterback moves from 30 to 23 and the
   tight ends from 41 and 43 into the fourth round, while the first two rounds
   barely move at all.

   Which makes this a better advert as well as a better picture. The headline
   above it says the numbers are already done, and the board underneath is now
   drawn by those numbers rather than by the market they improve on.

   Nothing here is a name. Whoever the nightly data says is QB1 and TE1 is who
   turns up, so there is still nothing in this graphic to keep in sync. */
function shotPicks() {
  const taken = {};                                    // name -> true
  const have  = [];                                    // seat -> pos -> count
  for (let s = 0; s < SHOT_TEAMS; s++) have.push({});

  const picks = [];
  for (let n = 1; n <= SHOT_TEAMS * SHOT_ROUNDS; n++) {
    // One implementation of what a snake draft is, the same one the room runs.
    const c = DraftEngine.pickInfo(n, SHOT_TEAMS);
    const pool = board.filter((p) => !taken[p.name] && !isRuledOut(p));
    if (!pool.length) break;

    const modelMultiplier = modelMultipliers(pool);
    let best = null, bestScore = Infinity;
    pool.forEach(function (p) {
      const score = (p.adp + p.jitter)
        * needFromCount(have[c.slot][p.pos] || 0, p.pos, c.round, null,
                        { slot: c.slot, counts: have[c.slot] })
        * (isRisky(p) ? 1.35 : 1)
        * modelMultiplier(p);
      if (score < bestScore) { bestScore = score; best = p; }
    });

    taken[best.name] = true;
    have[c.slot][best.pos] = (have[c.slot][best.pos] || 0) + 1;
    picks[n - 1] = best;
  }
  return picks;
}

function closeRooms() {
  $("roomsPanel").hidden = true;
  $("roomsBtn").setAttribute("aria-expanded", "false");
}

function toggleRooms() {
  const opening = $("roomsPanel").hidden;
  $("roomsPanel").hidden = !opening;
  $("roomsBtn").setAttribute("aria-expanded", String(opening));
}


/* ---- the route ---- */

/* The hash can now carry an invite code — #/draft?room=ABC — so the path
   is read up to the query rather than compared whole. #/draft on its own
   still means what it always did. */
/* #/draft is retired and redirects (see applyRoute). Nothing else routes to
   the old view any more.

   There was a second address here for a while - "draft-legacy" - opened only
   by the test suite, because retiring #/draft would otherwise have silently
   deleted about twenty specs written against the vanilla board. Those specs
   have all been rewritten against the React room, so the door has no users
   and is gone. The markup itself (#view-app) stays exactly where it is:
   app.js is a classic script and renderHeader(), renderInvite() and a dozen
   listeners still write into those ids on every render, so deleting it throws
   and takes drafting down with it. Unreachable, not absent. */
function route() {
  const path = location.hash.replace(/^#\/?/, "").split("?")[0];
  return path === "draft" ? "draft" : "home";
}

// No callers today. Kept pointing at the live route so it cannot
// quietly resurrect the retired one if something calls it later.
function go(where) { location.hash = where === "draft" ? "#/draft-room" : "#/"; }

/* #/draft-room is the new React draft room (web/src/components/DraftRoom.jsx,
   mounted into #draftroom-root — see the comment beside that id in
   web/index.html). It owns its own visibility and hash-watching entirely,
   deliberately outside #view-app/#view-home's toggle, so route() itself
   must keep meaning what it always has ("draft" vs "home") for its other
   four callers (app.js:1643, 1671, 4010, 4955) — this only needs to stop
   applyRoute() from treating #/draft-room as "home" and tearing down a
   live room/clock/sim underneath it. */
function onDraftRoomRoute() {
  const path = location.hash.replace(/^#\/?/, "").split("?")[0];
  return path === "draft-room";
}

/* Split out of applyRoute() so the hashchange listener's bare-anchor guard
   (below) can restore view-home/shellbar without running the rest of
   applyRoute() — its scrollTo(0, 0) and its closeRooms()/stopSim()/
   renderHome() teardown branch. Recomputes hideHome fresh off the hash
   rather than the guard hardcoding "false": a bare fragment's legacyPath
   can never be "drafts" or "draft-room", so it always resolves to false
   here, but the point is not writing that fact down a second time next to
   this one. */
function syncHomeVisibility() {
  const legacyPath = location.hash.replace(/^#\/?/, "").split("?")[0];
  /* "rooms/draft", not "drafts", as of design_handoff_v3_alive.

     The reason this clause exists is unchanged: whichever route renders
     the Lobby out of #draftroom-root has the same view-home problem
     #/draft-room has -- the whole marketing page goes on rendering behind
     it, in normal flow, adding its own height and a second scrollbar
     nobody can attribute to anything. What moved is which route that is.
     DraftRoom.jsx's own entry branch is #/rooms/draft now (the Draft Room
     is a room, and it sits under #/rooms with the other five).

     #/drafts is the opposite case and must NOT be listed here: it is the
     drafts archive, and App renders it INSIDE #view-home. Hiding view-home
     for it would hide the screen itself. */
  const hideHome = onDraftRoomRoute() || legacyPath === "rooms/draft";
  shellbar.hidden = hideHome;
  $("view-home").hidden = hideHome;
}

function applyRoute() {
  /* #/draft is retired. Every Draft Room feature built since the React
     rewrite lives only on #/draft-room, so the old route was a second,
     older product still reachable from a bookmark, a shared link, or the
     resume banner - and it looked enough like the real thing that somebody
     landing there would not know they were on it.

     The redirect sits at the router rather than at each caller because the
     callers are not the whole problem: a link someone saved last week is,
     and no amount of editing this file reaches that. replace() rather than
     assignment, so the dead route does not become a back-button trap
     between the two rooms.

     The #view-app markup stays exactly where it is. It is unreachable now,
     not deleted - app.js is a classic script and renderHeader(),
     renderInvite() and a dozen listeners still write into those ids on
     every render, so deleting them throws and takes the whole boot
     sequence with it. Unreachable is the goal; absent is a different and
     much larger change. */
  if (location.hash.replace(/^#\/?/, "").split("?")[0] === "draft") {
    /* Carry the hash's own query across. An invite link is
       "#/draft?room=ABC1" and route() strips the query to decide the path,
       so redirecting to a bare "#/draft-room" would silently drop the room
       code and drop a guest onto an empty setup screen instead of into the
       draft they were invited to. Every invite sent before today is exactly
       that shape, which is the whole reason this redirect exists. */
    const q = location.hash.indexOf("?");
    const tail = q >= 0 ? location.hash.slice(q) : "";
    location.replace(location.pathname + location.search + "#/draft-room" + tail);
    return;
  }

  /* Three views, not two, and this used to toggle a single boolean built
     for the two-view world before #/draft-room existed. route() only
     ever answers "draft" for the literal, retired #/draft hash — which
     cannot reach this line any more, since the redirect above already
     returned for it — so onDraft was permanently false here and the
     five lines below reduced to "show view-home/shellbar, hide
     view-app/appbar/tabrow" no matter which of the *three* real routes
     (home, the legacy draft-app, or #/draft-room) was active.

     view-app/appbar/tabrow's only real "show" condition died with that
     redirect, so they are unconditionally hidden now: onLegacyDraft is
     always false, kept as a named constant rather than deleted so the
     five lines below still read as five independent decisions instead
     of three hidden and two inverted by hand.

     view-home/shellbar have a second real "hide" condition #/draft-room
     itself, which is what onDraftRoomRoute() (already defined below,
     already used for the teardown branch two lines down) answers. Confusing
     the two — reusing one flag for both — was the actual bug: it doesn't
     just fail to hide view-home on #/draft-room, flipping that one flag to
     "fix" it would un-hide view-app right along with it, showing the
     legacy draft-room markup behind the real one. Missing this is exactly
     why `#view-home` kept `hidden = false` on the live Draft Room: the
     whole marketing page went on rendering, in full, in normal document
     flow, doing nothing visible (the fixed-position Cockpit UI covers it)
     except adding its own real height to the page — a design review found
     the result three different ways without anyone connecting them: dead
     space the board didn't fill, a page-level scrollbar that shouldn't
     have existed alongside the board's own, and a scrollbar that read as
     attached to the wrong thing.

     hideHome checks one more path than onDraftRoomRoute() answers, on
     purpose rather than by broadening that function: #/drafts (the
     Locker, #draftroom-root's other real route — see DraftRoom.jsx's own
     draftsActive) has the identical view-home problem, confirmed the same
     way. But onDraftRoomRoute() is also what the teardown branch below
     reads to decide whether a live room/clock/sim survives the
     navigation, and landing on the Locker is meant to stop those (same
     comment in DraftRoom.jsx, "widening it would let them fire while
     looking at the locker instead") — so widening the shared function
     would silently undo that on every trip to the Locker. Two questions,
     two answers, even though today they overlap partway. */
  const onLegacyDraft = false;
  syncHomeVisibility();
  appbar.hidden  = !onLegacyDraft;
  $("view-app").hidden = !onLegacyDraft;
  tabrow.hidden = !(onLegacyDraft && state.started);

  /* !onDraftRoomRoute() here, not the old `onDraft` (route() === "draft",
     which — see the comment above — can never be true at this line, the
     redirect at the top of this function already caught it). That was
     already what `!onDraft` meant by the time it got here: always true
     whenever the first branch doesn't fire, since it's the redirect's own
     leftover complement rather than a real second condition. Replicated
     faithfully rather than "fixed": this three-way if/else-if has read as
     three cases for a while, but the second branch's condition already
     covered everything the third one checks for, which means the third —
     "coming back: hand you the clock, or let the room carry on" — has been
     unreachable since before this pass touched the file. That's a real,
     separate, pre-existing bug, not one this fix introduced or was asked
     to chase: DraftRoom.jsx appears to already drive the equivalent resume
     behaviour itself (driveRoomCPUs()/driveMyAutopilot(), its own clock
     effects), so touching this blind risks double-driving the CPU/clock
     rather than fixing a real gap. Left inert on purpose; worth its own
     look another time. */
  if (onDraftRoomRoute()) {
    // #draftroom-root owns its own visibility and lifecycle entirely — see
    // the comment at web/index.html beside that id. Nothing to do here.
  } else if (!onDraftRoomRoute()) {
    // Leaving is not discarding. The draft stays in memory and in the save;
    // only the clock and the CPU timer stop, so nothing advances off-screen
    // while you are reading the landing page.
    closeRooms();
    stopSim();
    stopClock();
    state.lastPick = null;
    renderHome();
  } else if (state.started && !draftOver()) {
    // Coming back: either hand you the clock, or let the room carry on.
    if (isMyTurn()) resetClock(); else runCPUs();
  }

  render();
  window.scrollTo(0, 0);
}


/* ---- the landing page ---- */

function renderHome() {
  // Provenance, not a sales line. "Free" and "no account" are already in the
  // hero sentence, and the rooms section already says the data refreshes.
  $("homeMeta").textContent = typeof PLAYERS_META === "undefined" ? "" :
    PLAYERS_META.count + " players · ADP and projections refreshed " +
    PLAYERS_META.generated;

  // loadScores() used to run here on every landing. #scoreWrap/#scoreStrip
  // are legacy markup, display:none !important since the React homepage
  // replaced this screen — the fetch was updating an element nobody has
  // been able to see since that redesign. Homepage v4 pass 0 removes it;
  // fetchScores() itself stays on the JukeEngine bridge, unused today but
  // real infrastructure, not deleted along with the call site.

  // A saved draft is the most useful thing this page can offer someone, so it
  // sits above the rooms rather than being buried on the setup screen.
  const bar = $("homeResume");
  const data = readSave();
  if (!data || !data.picks.length) { bar.hidden = true; return; }

  const saved = data.league;
  const total = saved.teams * saved.rounds;
  const made  = data.picks.length;
  const done  = made >= total;

  bar.hidden = false;
  bar.innerHTML =
    "<div><p><b>" + (done ? "Your finished draft" : "You have a draft in progress") + "</b></p>" +
    '<p class="sub">' + settingsText(saved) + " \u00b7 " + made + " of " + total + " picks</p></div>" +
    '<div class="btnrow"><a class="cta" href="#/draft-room">' +
    (done ? "Reopen it" : "Resume") + "</a></div>";
}


/* ---- installing, and the things that do not exist yet ---- */

// The browser decides whether an install is on offer; we only stash the event
// and reveal the button once it is. Chrome and Edge fire this, iOS Safari
// never does, so there the button simply never appears rather than lying.
let installPrompt = null;

function showInstall(on) {
  document.querySelectorAll(".js-install").forEach(function (b) { b.hidden = !on; });
}

window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  installPrompt = e;
  showInstall(true);
});

window.addEventListener("appinstalled", function () {
  installPrompt = null;
  showInstall(false);
});

function notYet(title, body) {
  $("soonTitle").textContent = title;
  $("soonBody").textContent = body;
  $("soonDlg").showModal();
}



/* ---- 2d. The score strip --------------------------------
   The only part of Juke that depends on a third party at
   run time. Two rules follow from that:

   It fails silently. If the feed is down, slow, blocked or
   has changed shape, the strip hides and the page is exactly
   what it was before. A scoreboard is not worth an error.

   It renders nothing in the offseason. No games means no
   strip, rather than an empty frame for the five months
   between February and August.

   ESPN rather than Sleeper because Sleeper's schedule feed
   carries no scores at all — only home, away, date and
   status. Checked, not assumed. ESPN's endpoint is public
   and permissive about CORS, but it is undocumented, so
   treat a shape change as expected rather than surprising. */

const SCORES_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

// The response is ~220KB, which is more than the whole app. Once a minute is
// plenty for a strip you glance at, and it keeps route changes free.
const SCORES_TTL = 60000;

// Everything below comes from someone else's server, so it is escaped before
// it goes anywhere near innerHTML. Nothing else in this file needs this,
// because every other string is generated by our own pipeline.
function escHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gameFrom(event) {
  const c = event && event.competitions && event.competitions[0];
  if (!c || !c.competitors) return null;
  const status = (c.status && c.status.type) || {};
  const away = c.competitors.filter((x) => x.homeAway === "away")[0];
  const home = c.competitors.filter((x) => x.homeAway === "home")[0];
  if (!away || !home) return null;
  return {
    away: away.team && away.team.abbreviation,
    home: home.team && home.team.abbreviation,
    awayScore: away.score,
    homeScore: home.score,
    state: status.state,                       // "pre" | "in" | "post"
    detail: status.shortDetail || "",
    // The scoreboard's own ISO kickoff time, kept for nextKickoff() below.
    // The strip itself never draws it — `detail` already says "Sun 1:00 PM"
    // in the reader's own zone — but the header's kickoff pill needs a real
    // instant to count down to, and this response is the only place in the
    // project that has one. Reused rather than fetched a second time: it is
    // ~220KB, it is already cached for a minute, and a second parse of the
    // same payload is the "written down twice" rule with a network cost
    // attached.
    kickoff: (event && event.date) || null
  };
}

/* The next game that has not started, as an epoch millisecond, or null.

   Null is the whole contract and there are four honest ways to reach it:
   ESPN is unreachable, the response has changed shape, every game on the
   board has already kicked off, or nothing is scheduled at all — which is
   most of February to August. The score strip's own rule applies unchanged
   (it "fails by disappearing"), so a caller draws nothing rather than a
   placeholder: a countdown to a fabricated instant is worse than no
   countdown, because a countdown is read as a fact.

   A stale sessionStorage entry written before this field existed has no
   `kickoff` at all, which is why the filter is on the parsed value rather
   than on `state` alone. */
function nextKickoff() {
  const games = cachedScores();
  if (!games) return null;
  const now = Date.now();
  const times = games
    .filter(function (g) { return g.state === "pre" && g.kickoff; })
    .map(function (g) { return Date.parse(g.kickoff); })
    .filter(function (t) { return t > now; });
  return times.length ? Math.min.apply(null, times) : null;
}

function cachedScores() {
  try {
    const raw = JSON.parse(sessionStorage.getItem("juke.scores"));
    return raw && (Date.now() - raw.at) < SCORES_TTL ? raw.games : null;
  } catch (err) { return null; }
}

function renderScores(games) {
  const strip = $("scoreStrip");
  if (!games || !games.length) { $("scoreWrap").hidden = true; return; }

  strip.innerHTML = games.map(function (g) {
    // Before kickoff there is nothing to lead by, so no side is emphasised.
    const live = g.state !== "pre";
    const a = Number(g.awayScore), h = Number(g.homeScore);
    const row = (team, score, lead) =>
      '<div class="game-row' + (lead ? " lead" : "") + '">' +
        '<span class="tm">' + escHtml(team) + "</span>" +
        '<span class="sc">' + (live ? escHtml(score) : "") + "</span>" +
      "</div>";
    return '<div class="game">' +
      row(g.away, g.awayScore, live && a > h) +
      row(g.home, g.homeScore, live && h > a) +
      '<div class="game-st' + (g.state === "in" ? " live" : "") + '">' +
        escHtml(g.detail) + "</div>" +
    "</div>";
  }).join("");

  $("scoreWrap").hidden = false;
  updateScoreEnds();
}

// Which end has more behind it. Drives the fades and the arrows, so the
// row never claims there is more to see when there is not.
function updateScoreEnds() {
  const strip = $("scoreStrip");
  const max = strip.scrollWidth - strip.clientWidth;
  $("scoreWrap").classList.toggle("more-left", strip.scrollLeft > 4);
  $("scoreWrap").classList.toggle("more-right", strip.scrollLeft < max - 4);
}

function nudgeScores(direction) {
  const strip = $("scoreStrip");
  // scrollBy's own behavior beats the stylesheet, so the reduced-motion
  // guard on .scores would not apply here unless it is asked for again.
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  strip.scrollBy({
    left: direction * strip.clientWidth * 0.8,
    behavior: still ? "auto" : "smooth"
  });
}

// DOM-free half of the fetch, so anything holding a real board (the
// draft room, and now the JukeEngine bridge below) can ask for scores
// without a #scoreStrip to write into. loadScores() is the DOM half.
function fetchScores() {
  const cached = cachedScores();
  if (cached) return Promise.resolve(cached);

  return fetch(SCORES_URL, { mode: "cors" })
    .then(function (res) {
      if (!res.ok) throw new Error("scores " + res.status);
      return res.json();
    })
    .then(function (data) {
      const games = (data.events || []).map(gameFrom).filter(Boolean);
      try {
        sessionStorage.setItem("juke.scores", JSON.stringify({ at: Date.now(), games }));
      } catch (err) {}                          // private mode, or a full quota
      return games;
    });
}

function loadScores() {
  fetchScores().then(renderScores).catch(function () {
    $("scoreWrap").hidden = true;
  });
}

/* ---- 3. The player board -------------------------------
   One sorted copy of the ADP set that matches the league's
   scoring. Every player gets a position rank (RB1, RB2...)
   and a small random jitter that stays fixed for the whole
   draft, so undoing a pick doesn't reshuffle how the CPUs
   think.

   Full PPR moves receivers up and backs down, so the board
   is rebuilt from the right set when a draft starts rather
   than being fixed at load.                               */

let board = [];

const DEFAULT_SET = "half";

// players.js may predate ADP_SETS, or a set may be missing if Fantasy
// Football Calculator was down when the pipeline ran. Fall back rather
// than leaving the app with no players at all.
function adpSet() {
  // Same reason as totalPicks() above: players.js can still be in flight
  // when this runs. An empty board is a real, renderable state everywhere
  // this gets called; a ReferenceError is not.
  const fallback = typeof PLAYERS === "undefined" ? [] : PLAYERS;
  if (typeof ADP_SETS === "undefined") return fallback.filter(inPool);
  const set = ADP_SETS[adpFormat(league.scoring)] || ADP_SETS[DEFAULT_SET] || fallback;
  return set.filter(inPool);
}

/* Which ADP set a scoring preset draws from.

   Fantasy Football Calculator publishes exactly three — standard, half and
   full PPR — and the preset list is longer than three now. A superflex
   league is not a fourth ADP set here; it is full PPR's board with a second
   startable quarterback, which is a roster shape rather than a scoring one.
   The market's own quarterback ADP is therefore wrong for it, and the note
   under SCORING_NAMES says so on screen rather than the app pretending
   otherwise.

   Mapping through a named function rather than indexing ADP_SETS directly
   is what stops a new preset silently falling through to DEFAULT_SET: a
   preset with no entry here is a preset nobody decided the board for. */
const ADP_FORMAT = { standard: "standard", half: "half", ppr: "ppr", superflex: "ppr" };
function adpFormat(scoring) { return ADP_FORMAT[scoring] || DEFAULT_SET; }

/* ---- The available-players filter -------------------------------------

   Rookies-only and vets-only, asked of the data rather than of a list of
   names. `exp` is Sleeper's own years_exp and is already in stats.js on
   every player the crosswalk matched — 0 for a rookie, counting up from
   there — so this needs no pipeline change and no second source: the
   filter is reading the same record the Seasons tab and the bust score
   already read.

   A player with no `exp` at all is kept in BOTH filtered pools, and that
   is deliberate rather than lazy. 27 of the board's rows have no stats
   record — team defenses have no years of experience, and a handful of
   skill players never matched — and a defense is neither a rookie nor a
   veteran in any sense a drafter means. Dropping them would take every
   D/ST off a rookies board and off a vets board alike, which would leave a
   league that starts one with no legal pick for the slot. "Treat 0 from an
   API as missing" is the rule this is the other half of: `undefined` is
   missing, and missing is not evidence of anything. */
function inPool(player) {
  const pool = league.playerPool;
  if (!pool || pool === "all") return true;
  const stat = typeof PLAYER_STATS === "undefined" || !player.id ? null : PLAYER_STATS[player.id];
  const exp = stat ? stat.exp : undefined;
  if (typeof exp !== "number") return true;
  return pool === "rookies" ? exp === 0 : exp > 0;
}

// How many players the selected set carries at all. A 14-team, 15-round draft
// wants 210 players and the standard set only carries 205.
function poolSize() { return adpSet().length; }

/* How many of them this room could legally hold, which is a smaller number and
   is the one a draft is actually limited by.

   poolSize() counts every row on the board, and a board is not inventory. A
   22-team room may hold twenty-two quarterbacks and the half-PPR board carries
   fifty-six; it may hold sixty-six tight ends and the board carries ninety-two.
   Those spare thirty-four and twenty-six are on the board and can never be
   drafted by anybody, so counting them as picks the league has room for is the
   same class of error as posRank standing in for value — a right number
   answering the wrong question.

   Measured 1 September 2026 on the 480-player half-PPR board. The clearest
   case is the deepest league the setup screen offers: **24 teams over 20 rounds
   is 480 picks against a 480-player board**, which poolSize() waves through on
   a dead heat, and 411 the room can actually hold. The other 69 picks are spent
   by construction on somebody nobody can start — and roster construction then
   docks nine points a head for a pick the format left no alternative to.

   **This example used to be 16 teams over 14 rounds, and that is worth keeping
   as a warning.** It was true of the 232-player board this was written against
   — 224 picks, 214 absorbable — and the deep bench landed the next day, taking
   the pool to 480 and 16-team capacity to 334. The bug did not move; the board
   grew out from under the number chosen to illustrate it. A measurement is true
   of the board it was taken on, and this project regenerates the board nightly.

   **It is a necessary condition and not a sufficient one, which is a real
   limit rather than a rounding error.** This is an aggregate ceiling: it says
   how many players the room could hold if every pick went to a seat that could
   still use it. A snake draft is greedy and strands scarce positions late, so
   a league can clear this bar and still waste picks — measured across all 44
   shapes the screen offers, at the largest bench each still allows, sixteen of
   them land 7 to 19 picks on somebody unstartable even though capacity said
   yes. What holds everywhere is the part that breaks a roster rather than
   merely wasting a bench spot: every draft completes, and **no seat is ever
   short of the kicker or defense its format starts** (0 across all 44). See
   tests/pool-capacity.spec.mjs, which asserts exactly that split.

   Per position, because that is where the ceiling is: holdCap() is exactly the
   count above which needFromCount() refuses, so this is the board filtered
   through the same rule the draft itself runs on rather than a second opinion
   about what a roster may contain. */
function absorbableSize() {
  const counts = {};
  adpSet().forEach(function (p) { counts[p.pos] = (counts[p.pos] || 0) + 1; });
  return POSITIONS.reduce(function (n, pos) {
    return n + Math.min(counts[pos] || 0, holdCap(pos) * league.teams);
  }, 0);
}

function buildBoard() {
  // Copied, not referenced: posRank, tier and drafted belong to this draft,
  // not to the generated data, which gets read again on a restart.
  board = adpSet().map((p) => Object.assign({}, p));
  board.sort((a, b) => a.adp - b.adp);

  const counts = {};
  board.forEach(function (player, i) {
    counts[player.pos] = (counts[player.pos] || 0) + 1;
    player.posRank = counts[player.pos];
    player.overall = i + 1;
    player.drafted = false;
    player.jitter  = 0;
  });

  buildTiers();
  buildProjections();
}


/* ---- 4. State ------------------------------------------ */

const state = {
  mySlot: 0,        // 0-indexed draft position
  clockLength: 60,  // seconds, 0 means no clock
  started: false,
  picks: [],        // { overall, round, slot, player }
  timeLeft: 0,
  timerId: null,
  paused: false,
  seed: 0,            // fixes the CPU wobble so a resumed draft behaves the same
  simTimer: null,     // handle for the CPU pick animation
  simulating: false,
  lastPick: null,     // the pick currently shown in the ticker
  /* Auto-drafting your own seat in a shared room. Solo has no use for it —
     there the button drafts the remaining board in one go and finishes — but
     in a room "the rest" cannot mean everybody's picks, so it becomes a
     standing instruction about one chair and has to be remembered between
     turns. Deliberately not saved: it is a decision about the next few
     minutes, and coming back to a draft still on autopilot is a nasty
     surprise. */
  autoMe: false,
  /* Which Practice-a-scenario card started this draft, or null for one
     started from the plain Start button. An id and nothing else — the
     settings a scenario chose are already in `league`, which is the one
     real copy of them, and a second copy here would be the written-down-
     twice failure with a draft's shape in it.

     It is saved with the draft and recorded on the history entry, which
     is the whole reason it exists: the signed-in scenario set is built
     from what you have already run, and "you have never tried this" is
     unanswerable if nothing wrote down what you tried. Cleared by
     startDraft() on the way in, alongside state.picks, for the reason
     that clear already exists — one door in, several ways out, and a
     scenario tag surviving into the next draft would label a draft the
     card never started. */
  scenario: null,
  // Players you want, in the order you want them. Names rather than objects
  // for the same reason picks are: the board is rebuilt from the generated
  // data on every restart, so a held reference would go stale while a name
  // can be re-resolved or honestly reported as gone.
  queue: [],
  // Players you're tracking rather than planning to draft — a different
  // thing from the queue, which is the actual plan the clock falls back
  // to. Unlike the queue this is never pruned when someone else takes a
  // player: the watchlist's whole point is noticing that happened, not
  // reflecting only who is still available.
  watchlist: [],
  filterSuggest: "ALL",
  filterPlayers: "ALL",
  search: "",
  // Which column the player table is ordered by, and which way. ADP ascending
  // is the board's own order, so this starts where the list has always been.
  sort: { key: "adp", dir: 1 }
};


/* ---- 5. Snake maths ------------------------------------
   Overall pick 1 is round 1 slot 1. In even rounds the
   order reverses, which is the only thing that makes a
   snake draft a snake.                                     */

/* These are wrappers over draft-engine.js, which holds the rules with no
   reference to `league` or `state`. The wrappers exist so every call site in
   this file reads the way it always did, while there is exactly one
   implementation of what a snake draft is — the same one a server will run
   when a room has more than one person in it. */

// Guarded the same way totalPicks() is (see the deferred-data boot near the
// foot of this file): with state.started always false before a draft has
// begun, every one of these can be — and, on a marketing-homepage load
// before draft-engine.js has landed, is — reached while board is still [].
// "No draft is happening" is the correct answer here, not a thrown error.
function pickInfo(overall)  { return typeof DraftEngine === "undefined" ? null : DraftEngine.pickInfo(overall, league); }
function currentOverall()   { return state.picks.length + 1; }
function draftOver()        { return typeof DraftEngine === "undefined" ? false : DraftEngine.draftOver(league, state.picks.length); }
function onTheClock()       { return typeof DraftEngine === "undefined" ? null : DraftEngine.onTheClock(league, state.picks.length); }
function isMyTurn()         { const c = onTheClock(); return c !== null && c.slot === state.mySlot; }

function teamLabel(slot) {
  return slot === state.mySlot ? "Your Team" : cpuName(slot);
}

function pickCode(overall) { return typeof DraftEngine === "undefined" ? "" : DraftEngine.pickCode(overall, league); }

function picksUntilMyTurn() {
  return typeof DraftEngine === "undefined" ? 0 : DraftEngine.picksUntil(league, state.picks.length, state.mySlot);
}


/* ---- 6. Roster helpers --------------------------------- */

function rosterOf(slot) {
  return state.picks.filter((p) => p.slot === slot).map((p) => p.player);
}

function countAt(slot, pos) {
  return rosterOf(slot).filter((p) => p.pos === pos).length;
}


/* ---- 7. How a CPU team values a player -----------------
   Lower score wins. We start from ADP and multiply it by
   how badly the team needs that position. A team missing a
   starting RB will reach for one; a team with four already
   will not.                                                */

/* Split from needMultiplier() so a roster that is not in `state.picks` can ask
   the same question. The hero shot drafts a whole room nobody is sitting in,
   which has no slots to look up and must not touch the real draft. Every
   league-shape decision stays here rather than being restated by the caller,
   which is the point — the superflex bug was this rule written down twice. */
// `lg` as in maxAt() above — an explicit shape for the Locker's par, the live
// league for everybody else.
//
// `ctx` is `{ slot, counts, seed }` and only the two positions the app used to
// schedule for you need it: which chair is asking, everything that chair
// already holds, and which wobble to ask under. Threaded rather than looked up,
// for the same reason `lg` is — the hero shot and par both simulate rooms that
// are not in `state.picks` and must not touch the real draft. A caller that
// omits it gets the middle archetype and a conservative reading of what the
// seat still owes, which is safe rather than right; every caller that has a
// seat to name passes one.
function needFromCount(have, pos, round, lg, ctx) {
  const L = lg || league;
  // The roster limit, both halves of it: the depth allowance, and — for a
  // quarterback, a kicker or a defense — the number this lineup could ever
  // start. holdCap() is the one place either is written down.
  if (have >= holdCap(pos, L)) return 999;

  /* No round gate — see KD_ARCHETYPES for what used to be here and what it
     measured. A kicker at ADP 131 cannot out-value a receiver at ADP 40 on his
     own, so the board prices these two player by player like everything else
     and what is left is each seat's own appetite, plus a closing safety net so
     nobody finishes with an empty mandatory slot.

     The one-each ceiling that used to be spelled out here for QB, K and DST is
     gone from this function rather than deleted: holdCap() above is that rule
     now, for every caller, which is the whole point of it existing. */
  if (pos === "K" || pos === "DST") {
    let m = kdAppetite(ctx && ctx.slot, pos, ctx && ctx.seed);

    /* `have` is authoritative for the position being asked and `ctx.counts`
       supplies the other one. Without a ctx both read as still owed, which
       brings last call forward by a round rather than dropping it — the
       failure direction that leaves a roster complete. */
    const held = (ctx && ctx.counts) || {};
    const owedK   = Math.max(0, L.starters.K   - (pos === "K"   ? have : (held.K   || 0)));
    const owedDST = Math.max(0, L.starters.DST - (pos === "DST" ? have : (held.DST || 0)));
    const left = L.rounds - round + 1;              // picks this team has left
    if (left <= owedK + owedDST) m = KD_LAST_CALL;  // last call: must fill

    return m;
  }

  const need = L.starters[pos] || 0;
  if (have < need)       return 0.80;   // still filling a starting slot
  if (have < need + 2)   return 1.00;   // sensible depth
  return 1.45;                          // hoarding
}

/* Everything one seat already holds, in one pass.

   countAt() answers for a single position and needFromCount() now wants two of
   them at once, so asking it twice would walk `state.picks` twice to learn one
   thing. Hoisted out of the per-player loops below for the same reason. */
function countsAt(slot) {
  const counts = {};
  rosterOf(slot).forEach(function (p) { counts[p.pos] = (counts[p.pos] || 0) + 1; });
  return counts;
}

function needMultiplier(slot, pos, round) {
  const counts = countsAt(slot);
  return needFromCount(counts[pos] || 0, pos, round, null, { slot: slot, counts: counts });
}

/* What one CPU seat thinks a player costs. Factored out of cpuChoice() so
   kdInPlay() can ask the identical question rather than restating the
   expression — the two disagreeing is how a suggestion offers a kicker the
   room's own CPUs would not take for another four rounds.

   `counts` is optional and hoisted by both callers: the loop is over the whole
   board and the roster does not change inside it. */
function cpuScore(player, slot, round, counts) {
  const held = counts || countsAt(slot);
  const need = needFromCount(held[player.pos] || 0, player.pos, round, null,
                             { slot: slot, counts: held });
  return (player.adp + player.jitter) * need * (isRisky(player) ? 1.35 : 1);
}

function cpuChoice(slot, round) {
  let best = null;
  let bestScore = Infinity;
  const counts = countsAt(slot);

  board.forEach(function (player) {
    if (player.drafted) return;
    if (isRuledOut(player)) return;                    // never draft someone who is out
    const score = cpuScore(player, slot, round, counts);
    if (score < bestScore) { bestScore = score; best = player; }
  });

  return best;
}

/* Would a CPU in this chair be choosing between a kicker or a defense and the
   best skill player left on the board?

   The two positions used to be excluded from anything that recommends a player
   by a flat rule, because the round gate was what stopped a simulation
   noticing that an empty mandatory slot costs 14 points of roster construction
   and "fixing" it in round two. With the gate gone the containment has to come
   from the same place every other timing decision now comes from: the price.
   Early in a draft the best skill player left scores single figures and a
   defense at 80 cannot get near it; by round nine it can, which is exactly when
   a real room starts taking one. No new threshold to pick, and it moves with
   the seat's own appetite. */
function kdInPlay(slot, round) {
  const counts = countsAt(slot);
  let bestSkill = Infinity, bestKd = Infinity;
  board.forEach(function (player) {
    if (player.drafted || isRuledOut(player)) return;
    const score = cpuScore(player, slot, round, counts);
    if (FORCED_LATE[player.pos]) { if (score < bestKd) bestKd = score; }
    else if (score < bestSkill) bestSkill = score;
  });
  return bestKd <= bestSkill;
}


/* ---- 8. Actions ---------------------------------------- */

/* Every pick goes through the engine's legality check, including the ones
   this app makes for itself. With one drafter the answer is never a
   surprise, but a rule the client only enforces when it feels like it is a
   rule the server cannot trust, and the whole point of the engine is that
   both sides reach the same verdict. */
function makePick(player) {
  const c = onTheClock();
  const taken = state.picks.map((p) => p.player.name);
  const reject = DraftEngine.rejectPick(
    league, state.picks.length, c ? c.slot : -1,
    player && player.name, taken);
  if (reject) return reject;

  player.drafted = true;
  state.picks.push({ overall: currentOverall(), round: c.round, slot: c.slot, player: player });
  return null;
}

/* CPU picks are made one at a time on a timer instead of all at
   once in a loop, so you can watch the board fill in. setTimeout
   schedules a single future call; each step schedules the next
   one, which is how you write a paced loop in a browser without
   freezing the page.                                            */

/* Milliseconds between CPU picks. This was 750, which put nearly seven
   seconds between your turns in a ten-team league and made the wait the
   most noticeable thing about the draft. 350 halves that without turning
   the board into a blur: the ticker's own entrance animation runs for
   280ms, so a pick still finishes announcing itself before the next one
   lands. Below about 300 they start treading on each other. */
const CPU_DELAY = 350;

// Deterministic pseudo-random offset, scaled by each player's own published ADP
// standard deviation rather than a flat -3 to +3 for everybody.
//
// `sd` has been on every row of players.js all along — Fantasy Football
// Calculator's real dispersion across real recorded drafts — and applyJitter()
// discarded it. It is most of what a realistic board wobble needs, for nothing:
// Jahmyr Gibbs' sd is 0.7, so the first pick stops being a coin toss the way a
// flat +/-3 made it, while Jason Myers' is 23.3 and Seattle Defense's is 8.6 —
// which is precisely why real rooms cluster on the elite defenses and scatter
// on kickers, and why one number for the whole board could not produce either.
// (Those three figures are off the 1 September 2026 half-PPR board and move
// every night with the pipeline. Nothing reads them; they are here to say what
// the spread of `sd` looks like, which is the part that does not drift.)
//
// A deep-bench row carries `sd: 0` — extend_deep_bench() has no real ADP sample
// to take a deviation from — and 0 is falsy, so `|| 6` catches it. That is the
// "treat 0 from a feed as missing" rule doing its job on 247 of the 480 rows.
//
// K and DST take a smaller share of their own sd because kdAppetite() is
// already modelling most of their spread; applying both at full strength counts
// the same dispersion twice.
//
// Deliberately not gated on MIN_ADP_SAMPLE, which surviveProbability() does use.
// That refusal is about not dressing a thin sample as a probability a reader
// will act on. This is a wobble: a noisy sd on the deep bench produces a noisy
// wobble on the deep bench, which is where real drafts are noisiest anyway.
//
// Four of this function's five callers fire in response to a click (Start,
// Resume, a history entry), by which point draft-engine.js's deferred boot
// has always already landed — the same reasoning that lets nextPicksFor()/
// inProgressSummary() go unguarded on window.JukeEngine's own bridge,
// documented at length elsewhere in this file. adoptRoom()'s call is not
// one of the four: it runs from onRoomChange(), off the room's own "state"
// broadcast, which reaches a client the instant its socket is open — live.js
// connects at boot, ahead of the requestIdleCallback that loads
// draft-engine.js at all. Confirmed live: a reload of an already-known room
// reached this function before DraftEngine existed and threw a
// ReferenceError out of onRoomChange(), which aborted that call before it
// reached render()/driveRoomCPUs()/resetClock() a few lines later — the
// board stuck at zero players and the clock at 0:00 until some later
// broadcast happened to arrive and get a clean run. Guarded here rather
// than at that one call site, same rule as everywhere else in this file:
// the guard belongs on the function, not on each caller. Jitter simply
// stays at buildBoard()'s own zero-fill until the next call succeeds,
// which is a quieter CPU wobble for a moment, not a crash.
const JITTER_SPREAD    = 0.80;   // skill positions
const JITTER_SPREAD_KD = 0.60;   // K and DST, whose appetite carries the rest

/* One expression, two callers: the live board here and par's twelve reference
   drafts in seatParTable(), which run under PAR_SEEDS rather than state.seed.
   Written down twice is how par ends up wobbling differently from the draft it
   is the baseline for. */
function jitterFor(p, seed) {
  const share = (p.pos === "K" || p.pos === "DST") ? JITTER_SPREAD_KD : JITTER_SPREAD;
  return DraftEngine.spread(p.overall, seed) * (p.sd || 6) * share;
}

function applyJitter() {
  if (typeof DraftEngine === "undefined") return;
  board.forEach(function (p) {
    p.jitter = jitterFor(p, state.seed);
  });
}

/* One chain, always.

   state.simTimer holds a single handle, so scheduling a step while another is
   already pending does not replace it - it *orphans* it. The old chain keeps
   firing, untracked, and stopSim() can then only ever cancel the newest one.
   Every orphan doubles the rate the board moves at.

   It shows up as the draft accelerating and going erratic the moment autopick
   is switched on: measured on a real 140-pick draft, CPU picks held a steady
   ~370ms for a full round, then fell to a median of 108ms with a spread of 18
   to 389 once autopick started making my picks. The proof it was chains and
   not a slow render: calling stopSim() at pick 75 left the draft running, and
   it made 18 more picks in the next two seconds.

   Clearing before scheduling makes the invariant true by construction rather
   than by every caller remembering it. */
function scheduleCpuStep() {
  if (state.simTimer) clearTimeout(state.simTimer);
  state.simTimer = setTimeout(cpuStep, CPU_DELAY);
}

function stopSim() {
  if (state.simTimer) { clearTimeout(state.simTimer); state.simTimer = null; }
  state.simulating = false;
}

function cpuStep() {
  if (draftOver() || isMyTurn()) {   // handing the clock back to you
    stopSim();
    state.lastPick = null;
    resetClock();
    showResumeBar();
render();
    return;
  }

  const c = onTheClock();
  const choice = cpuChoice(c.slot, c.round);
  if (!choice) { stopSim(); render(); return; }

  makePick(choice);
  state.lastPick = state.picks[state.picks.length - 1];

  // If that pick handed the turn back, put the clock on the board before
  // drawing rather than waiting for the next step to do it. Otherwise this
  // render paints "You're on the clock" with a stale timeLeft of 0, which
  // the header reads as ten seconds left and turns red — a warning flash on
  // a clock that has not started. It lasted a full CPU_DELAY.
  if (isMyTurn()) resetClock();

  render();

  scheduleCpuStep();
}

function runCPUs() {
  if (inRoom()) return;
  stopClock();
  if (draftOver() || isMyTurn()) { resetClock(); render(); return; }
  state.simulating = true;
  render();
  scheduleCpuStep();
}

// Jump straight to your turn without watching the rest.
function skipSim() {
  stopSim();
  let guard = 0;
  while (!draftOver() && !isMyTurn() && guard++ < totalPicks()) {
    const c = onTheClock();
    const choice = cpuChoice(c.slot, c.round);
    if (!choice) break;
    makePick(choice);
  }
  state.lastPick = null;
  resetClock();
  render();
}

/* ---- 8b. A shared room ----------------------------------

   Everything above works with no network at all, and that does
   not change: a solo draft never opens a socket. This section
   is what happens when a manager asks for a room.

   The one idea worth holding on to is that the browser stops
   deciding. Solo, draftAndAdvance() takes the player and moves
   on. In a room it sends the intent and waits, and the board
   only moves when the room says it did. That is the whole
   reason two people cannot take the same player.            */

/* "The socket is up right now" and "we are in a room" are different questions,
   and answering the second with the first is what once started a private solo
   draft on the host's phone while everybody else waited. inRoom() is the one
   to ask before *sending* anything; hasRoom() is the one to ask before
   deciding what this browser is allowed to decide for itself. */
function inRoom() { return typeof Live !== "undefined" && Live.active(); }
function hasRoom() { return typeof Live !== "undefined" && !!Live.room(); }

/* The host's browser is the CPU for every empty chair. The worker has no
   board, so the opinion is worked out here, where it already lives, and sent
   like any other pick — the room checks it really is the host and really an
   empty seat before accepting it.

   Only one pick is in flight at a time, and the wait afterwards is a real
   one. It used to be released by the next broadcast, which sounds right and
   deadlocked a live draft:

     - a pick arrives back, the flag clears, the next goes out immediately.
       Measured on localhost that is a pick every 25ms, and a whole round of
       CPU picks lands inside a second;
     - the worker allows forty actions per socket per ten seconds — a limit
       written for a person, and the host's browser is not one — so the room
       started answering `too-fast`;
     - a rejection goes to one socket and causes no broadcast. The driver
       only ever ran *on* a broadcast, so with none coming it had nothing to
       run on;
     - the clock was off, so no alarm woke the room either.

   The draft stopped dead at pick 86 with an empty chair on the clock and
   every client sitting there waiting for a browser that was waiting for them.

   So the driver is still woken by the broadcast — a *timer* cannot be the
   engine here, because a background tab has its timers clamped to a second
   and eventually to one a minute, and the host's phone is in someone's pocket
   for most of a draft — but it now refuses to send twice inside
   AUTO_PICK_MS. Broadcast-driven for liveness, time-gated for pace, with one
   retry timer as a backstop so a rejected pick, a lost broadcast or a
   momentary nothing-to-do can no longer be the end of the chain.

   The backstop is the part that makes this self-healing. Permission to try
   again is not a try, and that distinction is the whole bug above. */
const AUTO_PICK_MS = 500;   // 2/sec against the room's 4/sec ceiling

let autoInFlight = false;
let lastAutoAt = 0;
let autoRetry = null;

function scheduleAutoRetry(ms) {
  if (autoRetry) clearTimeout(autoRetry);
  autoRetry = setTimeout(function () { autoRetry = null; driveRoomCPUs(); }, ms);
}

function driveRoomCPUs() {
  const room = Live.room();
  if (!room || !room.isHost || room.status !== "drafting" || autoInFlight) return;

  const c = DraftEngine.onTheClock(room.league, room.picks.length);
  if (!c) return;

  const chair = room.seats[c.slot];
  const mine = chair && chair.you;
  const expired = room.msLeft !== null && room.msLeft <= 0;

  // An empty chair, or anyone whose clock has run out — including me.
  if (chair && chair.taken && !chair.auto && !expired) return;

  // Too soon after the last one: come back rather than dropping it, or this
  // turn waits for a broadcast that has no reason to arrive.
  const since = Date.now() - lastAutoAt;
  if (since < AUTO_PICK_MS) { scheduleAutoRetry(AUTO_PICK_MS - since); return; }

  const choice = mine ? autoPickForMe() : cpuChoice(c.slot, c.round);
  if (!choice) return;

  autoInFlight = true;
  lastAutoAt = Date.now();
  Live.autoPick(choice.name);
  scheduleAutoRetry(AUTO_PICK_MS + 2000);
}

/* Your own seat, drafting itself, when you have asked it to.

   Deliberately separate from driveRoomCPUs() above even though the shape is
   the same. That one is the *host* standing in for chairs nobody is sitting
   in, and it runs on one machine for the whole room; this is any manager
   asking for their own chair to be played, and it runs on theirs. Merging
   them would put "am I the host" and "is this my seat" in one condition, and
   they answer to different people. */
let myAutoInFlight = false;

function driveMyAutopilot() {
  const room = Live.room();
  if (!state.autoMe || !room || room.status !== "drafting" || myAutoInFlight) return;

  const c = DraftEngine.onTheClock(room.league, room.picks.length);
  if (!c || c.slot !== room.yourSeat) return;      // not your turn: nothing to do

  const choice = autoPickForMe();
  if (!choice) return;

  myAutoInFlight = true;
  Live.pick(choice.name);
  // Released on a timer rather than on the next state, because a rejected
  // pick — somebody took him a tenth of a second earlier — still has to be
  // followed by another attempt or the seat stalls until the clock expires.
  setTimeout(function () { myAutoInFlight = false; driveMyAutopilot(); }, 1200);
}

/* Take the room's word for it. The room sends a pick list of names; this
   turns them back into board players. Rebuilt only when the count differs,
   because a state arrives on every seat change and every chat message too. */
/* Does the room's league match ours, key for key?

   Only the keys the *room* sent are compared. A room made by an older build
   may not carry all of them, and Object.assign leaves ours in place for those
   — so comparing our keys instead would report a difference that adopting can
   never close, and rebuild the board on every broadcast forever. */
function sameLeague(theirs, ours) {
  return Object.keys(theirs).every(function (key) {
    return JSON.stringify(theirs[key]) === JSON.stringify(ours[key]);
  });
}

function adoptRoom(room) {
  if (!room) return;

  /* Joining someone else's room means drafting their league, not yours — all
     of it. This compared team counts alone, so a room that differed in
     anything else left the joiner on their own settings, and one of those
     settings decides which players exist.

     `scoring` picks the ADP set, and the sets are not the same people: 221 in
     half PPR against 260 in full. So a half-PPR joiner in a full-PPR room had
     a board missing 39 of the players that room could draft — including
     defenses and kickers, which is the last round. Every one of them arrived
     below as a key nothing matched and was dropped without a word, which
     reads on the board as a CPU seat that skipped its turn, and leaves the
     draft permanently one pick short of finishing: draftOver() never goes
     true, so the Analysis tab is stuck on "Grade so far" for a draft the room
     finished minutes ago.

     The board has to be rebuilt for any of it, not only for scoring —
     replacement level, tiers and every projection are worked out from the
     lineup and the scoring table — and rebuilding clears the drafted flags,
     so the picks below have to be re-applied whether or not the count moved. */
  let rebuilt = false;

  if (room.league && !sameLeague(room.league, league)) {
    Object.assign(league, JSON.parse(JSON.stringify(room.league)));
    buildBoard();
    rebuilt = true;

    /* The setup screen is drawn from `league` and does not read it again on
       its own, so without this it goes on showing the shape of whatever room
       you were in last — which is what a joiner saw instead of the room they
       had just walked into.

       lastFormat moves with it. readSetup() treats a changed format as "the
       user just picked a new one" and resets the reception rule to that
       format's default, which would throw away the host's edited scoring the
       next time anything on the screen was touched. */
    fillSetupControls();
    renderScoringFields();
    lastFormat = league.scoring;
  }

  if (room.yourSeat >= 0) state.mySlot = room.yourSeat;
  state.clockLength = room.clockLength;
  state.seed = room.seed;
  state.started = room.status !== "lobby";
  // The room's, not ours. Pausing is the host's and arrives back like every
  // other fact about a shared draft.
  state.paused = !!room.paused;

  if (rebuilt || state.picks.length !== room.picks.length) {
    applyJitter();
    board.forEach(function (p) { p.drafted = false; });
    state.picks = [];

    /* A key nothing matches used to return quietly, which is how the bug
       above stayed invisible for a whole draft. It should not be reachable
       now that the league is adopted whole, and if it ever is again the board
       is wrong in a way nobody can see — so it says so once per pick rather
       than leaving a hole for somebody to find in the last round. */
    room.picks.forEach(function (rp) {
      const player = board.find((p) => p.name === rp.key);
      if (!player) {
        console.warn("Room pick " + rp.overall + " (" + rp.key +
                     ") is not on this board — the leagues have drifted apart.");
        return;
      }
      player.drafted = true;
      state.picks.push({
        overall: rp.overall, round: rp.round, slot: rp.slot, player: player
      });
    });

    pruneQueue();
    state.lastPick = state.picks.length ? state.picks[state.picks.length - 1] : null;
    /* A pick landed, so nothing of ours is in flight any more. This releases
       the *one at a time* guard and nothing else: the pace is a clock now,
       kept in driveRoomCPUs(), because this line on its own is what let the
       host fire a pick every 25ms and trip the room's rate limit. */
    autoInFlight = false;
  }

  // The room owns the countdown, so the local clock only mirrors it. Nothing
  // here starts a timer: renderHeader() reads state.timeLeft.
  state.timeLeft = room.msLeft === null ? 0 : Math.ceil(room.msLeft / 1000);
}

/* Chat is the only thing on this page written by somebody else.

   Everything else — every player name, every team, every label — comes out of
   our own pipeline and goes into innerHTML as it is. A message does not, and
   the same rule the score strip follows applies here with far more force:
   escape it. This is the one place where not doing so would hand another
   manager a script tag in your draft.

   Names too. A name is typed by a person and is no safer than the message. */
/* Only GIPHY's own media may be put in an img src. Same check the room
   makes, kept here as well because the room is the authority and this is
   what actually asks a browser to fetch the address. Parsed rather than
   pattern-matched: "https://evil.com/?x=giphy.com" contains the string and
   is not GIPHY. */
function safeGif(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host !== "giphy.com" && !host.endsWith(".giphy.com")) return null;
    return url.href;
  } catch (err) {
    return null;
  }
}

/* A voice/photo URL from chat is a claim, not a fact — same rule as a GIF
   address, and for the same reason: it arrives from another manager and
   ends up in an <audio>/<img src>. The room already refused anything not
   served from its own worker (room.js's cleanMediaUrl()); this is the
   second check, on the browser's own side, before a URL is ever handed to
   an element that fetches it. `typeof window.Live` guards the same way
   every other DraftEngine/Live reference in this file does — see CLAUDE.md
   on why a bridge entry is only as safe as its own guard. */
function safeMediaUrl(value) {
  if (!value || typeof window === "undefined" || !window.Live) return null;
  try {
    const url = new URL(String(value));
    const origin = Live.workerHttpOrigin();
    if (!origin || url.origin !== new URL(origin).origin) return null;
    return url.href;
  } catch (err) {
    return null;
  }
}

/* ---- room chat ------------------------------------------

   What the room stores is a flat list of things people said. What a draft
   chat has to read like is a conversation with a draft happening in it, so
   this is where the two are put back together:

   - picks are merged in from room.picks rather than stored as messages,
     because the room already has every one of them and writing them down
     twice would push the actual conversation out of a fixed-length log by
     about the third round;
   - consecutive lines from one person collapse under one name, the way every
     chat written since about 2013 does it;
   - reactions hang off a message instead of becoming six more messages.

   Everything a person typed still goes through escHtml() on the way in. That
   is not a style choice here — see the note above safeGif(). */

const chatUI = {
  seenId: 0,          // the newest line drawn while the log was at the bottom
  unread: 0,
  pinned: true,       // is the log sitting on the newest line
  open: false,        // the mobile sheet
  typing: {},         // seat -> when we stop believing it
  sweep: null,
  sentTypingAt: 0
};

/* Two minutes of silence, or a change of speaker, starts a new block. Short
   enough that "ok" ten minutes later is not filed under the same breath as
   the sentence before it. */
const GROUP_MS = 2 * 60 * 1000;

/* Believed for four seconds and then not. The sender re-sends while they are
   still typing, so this lapses on its own if they close the tab mid-word
   rather than leaving a ghost typing forever. */
const TYPING_MS = 4000;

/* The most recent slice of the stream, not all of it. A full room carries up
   to two hundred messages and a hundred and eighty picks, and render()
   rebuilds every panel on every state change — including one per pick. */
const CHAT_DRAW = 140;

function chatTime(at) {
  if (!at) return "";
  const d = new Date(at);
  let h = d.getHours();
  const suffix = h < 12 ? "am" : "pm";
  h = h % 12 || 12;
  return h + ":" + String(d.getMinutes()).padStart(2, "0") + suffix;
}

/* A seat's name, preferred live over the one recorded on the message, so
   somebody who renames themselves is renamed everywhere the moment they do
   it rather than only on what they say next.

   Null when nobody has typed one, rather than "Seat 4". The caller decides
   what to show — and the avatar wants the seat number rather than the
   initials of the words "Seat 4", which is how it briefly read as "S4". */
function seatName(room, seat, fallback) {
  if (seat < 0) return fallback || null;
  const chair = room.seats && room.seats[seat];
  return (chair && chair.name) || fallback || null;
}

function seatLabel(room, seat, fallback) {
  return seatName(room, seat, fallback) ||
         (seat >= 0 ? "Seat " + (seat + 1) : "Someone");
}

/* Initials for the avatar. Two words give two letters, one gives one, and a
   seat with nobody's name on it gives its number — which is still an
   identity, and is what a chair in an invite link has until someone types
   into the name box.

   Not initials(). There is already one of those for player photos, it is
   declared later in this file, and a second function declaration with the
   same name silently wins — so this was quietly calling the player one,
   which throws on a null name. Check a new name against the file. */
function seatInitials(name, seat) {
  if (!name) return String(seat + 1);
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map(function (w) { return w[0].toUpperCase(); }).join("");
}

/* One list, in the order things actually happened. Picks carry `at` already,
   which is what makes this possible without the room storing anything new. */
function chatStream(room) {
  const out = [];

  (room.chat || []).forEach(function (m) {
    out.push({
      kind: m.system ? "system" : "said",
      id: m.id, seat: m.seat, name: m.name, text: m.text,
      gif: m.gif, at: m.at, reacts: m.reacts,
      // Poll/voice/photo/reply — the mobile redesign's own chat types.
      // chatSaidHtml() (the legacy renderer) never reads these, so an old
      // message keeps rendering exactly as it always has; a new one used to
      // come through as an empty text-and-gif-less bubble because this
      // function stripped every field it didn't already know the name of.
      // Voice/photo are flat fields on the entry (url/seconds, url/w/h) —
      // only a poll carries a nested object — see room.js's own view shape.
      type: m.type, poll: m.poll, url: m.url, seconds: m.seconds,
      w: m.w, h: m.h, replyTo: m.replyTo
    });
  });

  (room.picks || []).forEach(function (p) {
    out.push({
      kind: "pick", seat: p.slot, at: p.at,
      round: p.round, overall: p.overall, player: p.key
    });
  });

  out.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
  return out.length > CHAT_DRAW ? out.slice(-CHAT_DRAW) : out;
}

function chatReactRow(entry, room) {
  if (!entry.reacts || !entry.reacts.length) return "";
  const buttons = entry.reacts.map(function (r) {
    return `<button type="button" class="reactchip${r.you ? " on" : ""}"
        data-react="${entry.id}" data-emoji="${escHtml(r.emoji)}"
        aria-label="${r.count} reacted ${escHtml(r.emoji)}"
      >${escHtml(r.emoji)}<b>${r.count}</b></button>`;
  }).join("");
  return `<div class="reactrow">${buttons}</div>`;
}

function chatSaidHtml(entry, room, grouped) {
  const mine = entry.seat >= 0 && entry.seat === room.yourSeat;
  const named = seatName(room, entry.seat, entry.name);
  const who = seatLabel(room, entry.seat, entry.name);

  /* The room already refused anything that is not GIPHY's own media, so this
     is the second of two checks rather than the only one. It is here because
     the room is the authority and this is the thing that actually asks a
     browser to fetch the address — and an old room, or a future one, should
     not be able to talk this page into loading from somewhere else. */
  const gif = safeGif(entry.gif);

  const body =
    (entry.text ? `<span class="msgtext">${escHtml(entry.text)}</span>` : "") +
    (gif ? `<img class="chatgif" src="${escHtml(gif)}" alt="" loading="lazy">` : "") +
    chatReactRow(entry, room);

  // The picker is opened from the message, so it needs somewhere to hang.
  const tools = `<button type="button" class="reactadd" data-addreact="${entry.id}"
      aria-label="React to this message">+</button>`;

  if (grouped) {
    return `<div class="msg grouped${mine ? " mine" : ""}" data-line="${entry.id}">
        <span class="msgwhen">${escHtml(chatTime(entry.at))}</span>
        <div class="msgbody">${body}</div>${tools}
      </div>`;
  }

  return `<div class="msg${mine ? " mine" : ""}" data-line="${entry.id}">
      <span class="chatav av${entry.seat >= 0 ? entry.seat % 8 : 0}"
            aria-hidden="true">${escHtml(seatInitials(named, entry.seat))}</span>
      <div class="msgbody">
        <p class="msgwho">${escHtml(who)}<span class="msgwhen">${escHtml(chatTime(entry.at))}</span></p>
        ${body}
      </div>${tools}
    </div>`;
}

function chatPickHtml(entry, room) {
  const who = seatLabel(room, entry.seat, null);
  const mine = entry.seat >= 0 && entry.seat === room.yourSeat;

  /* A player name is ours, out of the generated board, so it is the one
     string here that does not strictly need escaping. It gets it anyway —
     the alternative is a reader having to know which of two adjacent
     interpolations is the safe one. */
  /* The engine's own code, not round-plus-overall. Written by hand this read
     "4.40" for the fortieth pick of a ten-team draft, which is round four,
     pick ten — and the header two inches above it was saying "4.10 (40
     Overall)" at the same time. One draft, two numbering schemes. */
  const teams = (room.league && room.league.teams) || league.teams;

  return `<div class="pickline${mine ? " mine" : ""}">
      <span class="pickno">${DraftEngine.pickCode(entry.overall, (room.league || league))}</span>
      <span class="picktext"><b>${escHtml(who)}</b> drafted ${escHtml(entry.player)}</span>
      <span class="msgwhen">${escHtml(chatTime(entry.at))}</span>
    </div>`;
}

/* ---- the end of a draft ---------------------------------

   The analysis is what the whole thing was for — the hero promises a grade
   afterwards that shows its working — and until now it sat behind a tab you
   had to know to press. The last pick lands, three buttons quietly change in
   the action bar, and nothing else says it is over.

   So it opens itself. A tab rather than a dialog, deliberately: the analysis
   is a grade, four bars, two callouts, a bye strip, a standings table and a
   method note, which is a page rather than something to read inside a box.
   And a dialog would need dismissing, which puts the most valuable screen in
   the app one stray click from gone. Switching tabs leaves everything where
   it was — the board is one press away and nothing has to be closed. */
function revealAnalysis() {
  showPanel("tab-grades");
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.classList.toggle("on", b.dataset.tab === "tab-grades");
  });
  window.scrollTo(0, 0);
}

/* Whether the draft was already over last time we looked.

   This has to be an edge, not a state. render() runs on every change, so
   acting on "the draft is over" would drag you back to the analysis every
   time you clicked away from it — including the click you just made to look
   at the board. Acting on "the draft just became over" fires once. */
let draftWasOver = false;

// Seeded by whatever establishes a draft, so that adopting a finished board
// is not mistaken for one finishing under you.
function noteDraftPhase() { draftWasOver = state.started && draftOver(); }

function checkDraftFinished() {
  const over = state.started && draftOver();
  if (over && !draftWasOver) { revealAnalysis(); recordHistory(); }
  draftWasOver = over;
}

/* Off the setup screen and into the draft. Its own function because two
   things reach it: pressing Start in a solo draft, and — in a room — the
   broadcast saying the host has begun, which is the only signal a guest
   ever gets.

   The second caller is not unreachable the way the first one is. #/draft
   redirects to the React lobby, so nothing in the UI can press a solo
   Start button that still calls this — but a room's "host has begun"
   broadcast is real traffic every guest's client still receives today,
   React draft room included, and it was still calling straight through to
   this function's legacy DOM work on every one of them. Confirmed live:
   starting a real room draft left #tabrow with hidden=false, display:flex,
   sized 375x105 at the very top of the page — invisible only because
   DraftRoom.jsx's own `fixed inset-0 z-[60]` overlay happens to paint over
   exactly that region. A coincidence of stacking order is not the same
   claim as "unreachable", which is the whole rule the rest of this file
   applies to #view-app/#tabrow/#appbar — so this stops being one instead
   of relying on it looking like one. Same two routes syncHomeVisibility()
   already treats as "the React draft room owns this screen": #/draft-room
   itself and #/drafts, the pre-draft Locker/seat-picker this same
   broadcast can also land on. */
function enterDraftUI() {
  const legacyPath = location.hash.replace(/^#\/?/, "").split("?")[0];
  if (onDraftRoomRoute() || legacyPath === "drafts") return;

  tabrow.hidden = false;
  showPanel("tab-suggest");
  document.querySelectorAll(".tabs button").forEach(function (b) { b.classList.remove("on"); });
  document.querySelector('.tabs button[data-tab="tab-suggest"]').classList.add("on");
  window.scrollTo(0, 0);
}

function renderChat() {
  const dock = $("chatDock");
  const room = typeof Live === "undefined" ? null : Live.room();

  if (!room) {
    dock.hidden = true;
    $("chatFab").hidden = true;
    // Moved out, not just hidden. See placeChat() — a hidden dock left in the
    // draft slot keeps its column and takes 330px off the board.
    placeChat();
    return;
  }
  dock.hidden = false;
  placeChat();

  const log = $("chatLog");
  const stream = chatStream(room);

  /* Is the chat actually on screen? On a phone it is a sheet, and a closed
     sheet is the one moment unread messages matter most — but a hidden log
     has no height, so "am I scrolled to the bottom" answers yes and clears
     the count that the launcher's badge exists to show.

     Asked of the computed style rather than of a matchMedia copy of the
     breakpoint, so the answer comes from the stylesheet that actually
     decides it and there is only one of it. */
  const onScreen = getComputedStyle(dock).display !== "none";

  // Measured before the rebuild, because the rebuild is what destroys it.
  const wasPinned = onScreen &&
    log.scrollHeight - log.scrollTop - log.clientHeight < 48;

  if (!stream.length) {
    log.innerHTML = `<p class="chatempty">Nobody has said anything yet.</p>`;
  } else {
    let lastSeat = null;
    let lastAt = 0;
    let lastKind = null;

    log.innerHTML = stream.map(function (entry) {
      if (entry.kind === "system") {
        lastSeat = null; lastKind = "system";
        return `<p class="chatline system">${escHtml(entry.text)}</p>`;
      }
      if (entry.kind === "pick") {
        lastSeat = null; lastKind = "pick";
        return chatPickHtml(entry, room);
      }

      const grouped = lastKind === "said" && entry.seat === lastSeat &&
                      entry.at - lastAt < GROUP_MS;
      lastSeat = entry.seat; lastAt = entry.at; lastKind = "said";
      return chatSaidHtml(entry, room, grouped);
    }).join("");
  }

  const newest = stream.reduce(function (top, e) {
    return e.id && e.id > top ? e.id : top;
  }, 0);

  /* Pinned to the newest line, but only if it was pinned already. Yanking
     somebody to the bottom while they are reading back is how a chat becomes
     a thing people stop opening. What arrives while they are up there is
     counted instead, and offered. */
  if (onScreen && (wasPinned || chatUI.pinned)) {
    log.scrollTop = log.scrollHeight;
    chatUI.pinned = true;
    chatUI.seenId = newest;
    chatUI.unread = 0;
  } else {
    chatUI.unread = stream.filter(function (e) {
      return e.kind === "said" && e.id > chatUI.seenId &&
             e.seat !== room.yourSeat;
    }).length;
  }

  renderChatMeta(room);
}

/* The bits around the log: who is here, who is typing, what you have missed.
   Separate from the log itself because a typing indicator changes several
   times a second and rebuilding a hundred messages for it would be silly. */
function renderChatMeta(room) {
  if (!room) return;

  const taken = room.seats.filter(function (s) { return s.taken; }).length;
  $("chatPresence").textContent =
    taken + (taken === 1 ? " manager" : " managers") + " here";

  // Only people we still believe. The sweep below expires them.
  const now = Date.now();
  const names = Object.keys(chatUI.typing)
    .filter(function (seat) { return chatUI.typing[seat] > now; })
    .map(function (seat) { return seatLabel(room, Number(seat), null); });

  $("chatTyping").textContent =
    names.length === 0 ? "" :
    names.length === 1 ? names[0] + " is typing…" :
    names.length === 2 ? names[0] + " and " + names[1] + " are typing…" :
    "Several managers are typing…";

  /* Whether the chat can actually reach anyone.

     Everything in the dock is a socket message, so all of it stops working
     when one drops — and it used to stop working silently: the box still
     invited a message, Send did nothing at all, and the line was neither sent
     nor kept. A control that cannot act should say so rather than swallow the
     click, so the whole footer goes dead together and one line explains it. */
  const connected = inRoom();
  $("chatOffline").hidden = connected;
  $("chatInput").disabled = !connected;
  $("chatSend").disabled = !connected;
  $("gifBtn").disabled = !connected;
  Array.prototype.forEach.call(
    $("chatReactions").querySelectorAll("button"),
    function (b) { b.disabled = !connected; });

  const jump = $("chatJump");
  jump.hidden = chatUI.unread === 0;
  jump.textContent = chatUI.unread + " new " +
    (chatUI.unread === 1 ? "message" : "messages") + " ↓";

  const badge = $("chatBadge");
  badge.hidden = chatUI.unread === 0;
  badge.textContent = chatUI.unread > 9 ? "9+" : String(chatUI.unread);

  /* The launcher is only ever for the draft, and only ever on a narrow
     screen — CSS decides the second part. Not in the lobby, where the dock is
     a plain block in the setup form and a button to open something already
     open is just a button that appears to do nothing. */
  $("chatFab").hidden = !(state.started && route() === "draft");
}

/* One dock, two homes. Moved rather than duplicated, because it holds a
   scroll position, a half-typed message and possibly an open GIF search, and
   two copies would mean deciding which of those is the real one every time
   the draft starts.

   Only ever moved when the destination actually changes: appendChild on the
   parent a focused input is inside blurs it, and re-blurring the chat box on
   every broadcast would make it unusable. */
function placeChat() {
  const dock = $("chatDock");

  /* Parked outside the draft grid when there is no room to talk in, and this
     is the whole of a bug that made a solo draft look wrong.

     `.draftshell > .chatslot:not(:empty)` claims a 330px column, and `:empty`
     is about child *nodes* — a slot holding a dock with `hidden` on it is not
     empty. So leaving a room and starting a solo draft in the same tab left
     the dock behind, hiding it and keeping its column: 330px of nothing beside
     the board, and the board itself down from 1391px to 1061px to pay for it.

     Hiding a thing is not the same as putting it away. Same family as the
     rule about `[hidden]` losing to an author `display`, and the same fix —
     make the DOM say what is actually true. */
  const slot = !hasRoom()
    ? $("view-app")
    : $(state.started && route() === "draft" ? "draftChatSlot" : "lobbyChatSlot");

  if (slot && dock.parentNode !== slot) slot.appendChild(dock);
}

function onRoomChange() {
  /* live.js connects the instant its socket is open, ahead of the
     requestIdleCallback that loads draft-engine.js/players.js/stats.js at
     all — so the room's very first "state" broadcast can land, and this
     function fire, before any of the three exist. Everything below reaches
     DraftEngine sooner or later (adoptRoom()'s applyJitter() first, then
     render() many times over), most of it unguarded, because none of it
     was ever meant to run before a draft — of any kind — is on screen, and
     every other way of getting here (pressing Start, resuming a save,
     opening a history entry) already waits for a click, by which point the
     deferred boot has always finished. A room's own broadcast is the one
     path that doesn't wait for anything.

     Confirmed live: reloading a tab already in a room threw
     "ReferenceError: DraftEngine is not defined" out of this function on
     the very first broadcast, which aborted the call before it reached
     render()/driveRoomCPUs()/resetClock() below — the board stuck empty
     and the clock at 0:00 until something else happened to call this
     again. live.js already stores the raw broadcast in live.room the
     moment it arrives (see announce()'s own caller), regardless of whether
     anything downstream can use it yet, so skipping the processing here
     costs nothing: the juke:data-loaded listener near the foot of this
     file re-runs this exact function once dataReady() is finally true,
     against whatever live.room already holds. */
  if (!dataReady()) return;

  const room = Live.room();

  /* Whether the draft has begun, asked before and after, because the answer
     changing is the thing that has to move everybody off the setup screen.

     The button cannot do it. In a room it sends the intent and returns, and
     the nine other managers never press it at all — so the transition has to
     hang off the broadcast, which is the only thing all ten of us see. It
     did not, and the draft ran behind a setup form for everyone. */
  const wasStarted = state.started;

  adoptRoom(room);
  if (!wasStarted && state.started) enterDraftUI();

  renderInvite();
  renderChat();
  render();
  driveRoomCPUs();
  driveMyAutopilot();

  /* The room's countdown, restarted against the figure that just arrived —
     adoptRoom() has the number, this is only what makes it move between
     broadcasts.

     Last, and deliberately below the two drivers. Those are the liveness of
     the entire room: the host's browser is what plays every empty chair, and
     it runs on the broadcast. Anything new placed above them is a new way for
     one thrown exception to stop a draft ten people are sitting in — which is
     the shape of the deadlock at pick 86, and painting a clock is not worth
     re-opening it. */
  resetClock();
}

/* Somebody is typing. Recorded with an expiry rather than a flag, so a
   manager who starts a sentence and then locks their phone stops being
   described as typing four seconds later instead of forever. */
function onRoomTyping(msg) {
  if (msg.seat < 0) return;

  if (msg.on) chatUI.typing[msg.seat] = Date.now() + TYPING_MS;
  else delete chatUI.typing[msg.seat];

  renderChatMeta(Live.room());
  startTypingSweep();
}

/* One timer, running only while somebody is actually typing. The expiry
   above is what makes a stale indicator impossible; this is only what makes
   it disappear on time rather than at the next broadcast. */
function startTypingSweep() {
  if (chatUI.sweep) return;
  chatUI.sweep = setInterval(function () {
    const now = Date.now();
    let live = 0;
    Object.keys(chatUI.typing).forEach(function (seat) {
      if (chatUI.typing[seat] > now) live++;
      else delete chatUI.typing[seat];
    });
    renderChatMeta(Live.room());
    if (!live) { clearInterval(chatUI.sweep); chatUI.sweep = null; }
  }, 1000);
}

/* ---- the queue ------------------------------------------

   Suggestions are what the model thinks. The queue is what you
   think, which is a different thing and worth somewhere to
   put it: between your turns is when a drafter actually makes
   a plan, and until now there was nowhere to record one.     */

function queueIndex(name) { return state.queue.indexOf(name); }

function queued(player) { return queueIndex(player.name) >= 0; }

function queueToggle(name) {
  const at = queueIndex(name);
  if (at >= 0) state.queue.splice(at, 1);
  else state.queue.push(name);
}

// Up is toward the front, which is the way the list reads.
function queueMove(name, delta) {
  const at = queueIndex(name);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= state.queue.length) return;
  state.queue.splice(to, 0, state.queue.splice(at, 1)[0]);
}

function watchlistIndex(name) { return state.watchlist.indexOf(name); }

function watchlisted(player) { return watchlistIndex(player.name) >= 0; }

function watchlistToggle(name) {
  const at = watchlistIndex(name);
  if (at >= 0) state.watchlist.splice(at, 1);
  else state.watchlist.push(name);
}

// Someone else taking your man is the normal case, not an error, so he
// leaves quietly rather than sitting there as a row you cannot draft.
function pruneQueue() {
  state.queue = state.queue.filter(function (name) {
    const player = board.find((p) => p.name === name);
    return player && !player.drafted;
  });
}

// The first player in your queue that is still on the board, not ruled
// out, and not currently illegal to draft. This is what the clock takes
// when it runs out, in preference to cpuChoice() — being away from the
// screen should not throw away the plan you made before you left it.
//
// A star can go stale: queued in round 3 for a position that fills up by
// round 8. needMultiplier() is the same refusal cpuChoice() and
// atPositionCap()'s own fraction already ask — a roster limit, the one-each
// ceiling on K and DST, a superflex-aware quarterback cap — so an entry that
// would now be illegal is skipped rather than drafted into a roster the engine
// would reject. Timing is no longer among those refusals: a queued kicker is
// taken when his turn in the queue comes, which is what starring him said.
function queueTop(round) {
  for (let i = 0; i < state.queue.length; i++) {
    const player = board.find((p) => p.name === state.queue[i]);
    if (!player || player.drafted || isRuledOut(player)) continue;
    if (needMultiplier(state.mySlot, player.pos, round) === 999) continue;
    return player;
  }
  return null;
}

/* What to take on my behalf when I am not the one choosing.

   Two answers now, in falling order of how much they know about what you
   want. It used to fall through to `suggestions("ALL")[0]`, and that is
   wrong for an autopick specifically: suggestions() applies
   modelMultipliers() — up to a quarter off a player's ADP — whenever
   scoringIsStock() is false, and that discount is the Decide tab's own
   opinion for a human reading it, not a rule every seat at the table has
   agreed to. cpuChoice() never applies it, because an empty chair's opinion
   has to be the same for every client in a room — and an autopicked seat is
   exactly that kind of seat, discount or not. Falling through to the
   model's opinion let an autopick reach for a player no CPU at the table
   would ever take, on a discount nobody else gets.

   It was `queueTop() || suggestions()[0] || null` even further back, and
   that bare `null` stopped a draft dead — see CLAUDE.md's "A filter is a
   lens, never a decision". `suggestions("ALL")` closed that hole by
   ignoring the position chip; cpuChoice() closes it more completely still,
   because it has no filter of its own to empty in the first place — it
   weighs the whole board every time. bestLeft() stays as the very last
   resort, for the rare case the board holds nothing cpuChoice() itself
   would take. */
function autoPickForMe() {
  const c = onTheClock();
  const round = c ? c.round : league.rounds;
  return queueTop(round)                 // the plan you actually made, if it still holds
      || cpuChoice(state.mySlot, round)  // exactly what a CPU in this chair would take
      || bestLeft();                     // and failing that, simply the best man left
}

/* The best player still on the board, ignoring every preference there is.

   A last resort, and it only has to beat one thing: a draft that stops
   halfway. K and DST come last even here — nothing refuses them by round any
   more, but this function has no roster and no round to reason with, so it
   cannot tell a seat that genuinely needs its kicker from one whose sixth-round
   kicker would read as a bug. Deprioritising them is the safe answer when the
   caller has already run out of better ones, and they are still better than
   nothing if the board somehow holds nothing else.

   `board` is in ADP order and must never be sorted in place, so this filters,
   which already returns a copy. */
function bestLeft() {
  const left = board.filter(function (p) { return !p.drafted && !isRuledOut(p); });
  if (!left.length) return null;
  const skill = left.filter(function (p) { return p.pos !== "K" && p.pos !== "DST"; });
  return skill.length ? skill[0] : left[0];
}

function draftAndAdvance(player) {
  // In a room this is a request, not a decision. Nothing changes locally:
  // the board moves when the room broadcasts, which is what stops two
  // managers ending up with different boards.
  if (inRoom()) { Live.pick(player.name); return; }

  makePick(player);
  state.lastPick = state.picks[state.picks.length - 1];
  pruneQueue();
  render();
  runCPUs();
}

function undo() {
  stopSim();
  state.lastPick = null;
  if (state.picks.length === 0) return;
  // Roll back past the CPU picks and my previous pick, so it's my turn again.
  do {
    const last = state.picks.pop();
    last.player.drafted = false;
  } while (state.picks.length > 0 && !isMyTurn());
  pruneQueue();
  resetClock();
  render();
}

function autoDraftRest() {
  stopSim();
  stopClock();
  state.lastPick = null;

  /* In a room this is a request about one chair, not a decision about ten.

     The loop below drafts every remaining pick on the board, which is exactly
     right on your own machine and completely wrong in a room: it filled in
     nine other managers' teams — two of them people sitting there with the
     app open — and did it locally, so the host was looking at a finished
     draft the room had never heard of. The next broadcast then rolled all of
     it back, which is the same bug wearing a different coat.

     So in a room it becomes an autopilot on your seat: submitted as ordinary
     picks, one per turn, through the same door as any other pick, and the
     board still only moves when the room says so. Everyone else drafts for
     themselves. It toggles, because "I am going to be away for ten minutes"
     stops being true and there has to be a way back. */
  if (inRoom()) {
    state.autoMe = !state.autoMe;
    render();
    driveMyAutopilot();
    return;
  }

  let guard = 0;
  while (!draftOver() && guard++ < totalPicks()) {
    const c = onTheClock();
    /* My seats follow my queue before the model's opinion, exactly as the
       clock does. Auto-drafting the rest should not quietly throw away the
       plan I made. Every other seat is still the CPU's own choice.

       Both fall back to the best player left rather than to nothing.
       `cpuChoice()` is left alone to answer however it answers — every client
       in a room has to agree with it, so it is not a thing to loosen — and
       the fallback lives here, where it only affects a draft nobody else is
       in. The rule this enforces is that the button either finishes the
       draft or the board is empty. There is no third outcome, and there used
       to be: it stopped in round nine and said nothing. */
    const choice = (c.slot === state.mySlot
      ? autoPickForMe()
      : cpuChoice(c.slot, c.round)) || bestLeft();
    if (!choice) break;
    // A rejected pick would otherwise be retried identically until the guard
    // ran out, which looks exactly like stopping halfway.
    if (makePick(choice)) break;
    pruneQueue();
  }
  render();
}

/* Leaving the draft room and throwing the draft away are two different
   things, and the old single "Restart" did both. goHome() leaves the save
   alone, so the setup screen offers the draft straight back — which is what
   you want after a completed mock, when the finished board is worth keeping. */

function goHome() {
  stopSim();
  stopClock();
  state.autoMe = false;

  /* Leaving the draft screen has to mean leaving the room, and it did not.

     Everything below clears the local draft — and in a room the local draft
     is a copy, so the very next broadcast put it all back and `enterDraftUI()`
     dropped you into the draft again at the room's real position. Pressing a
     button that says "New mock draft" and landing back in the old one is not
     a stale screen; it is the app refusing to leave.

     So the room is left first. That is a real departure — the chair goes to
     the CPU exactly as it does when a tab is closed — and it is recoverable
     the same way: reopening the invite link reclaims the seat and takes it
     off auto. The room code comes out of the address too, so a reload lands
     on the setup screen rather than walking straight back in. */
  if (typeof Live !== "undefined" && Live.room()) {
    Live.disconnect();
    if (location.hash.indexOf("room=") >= 0) location.hash = "#/draft-room";
    renderInvite();
    renderChat();
  }

  openRailSheet(false);   // a sheet left open over the landing page
  state.lastPick = null;
  board.forEach((p) => { p.drafted = false; p.jitter = 0; });
  state.picks = [];
  state.started = false;
  state.paused = false;
  tabrow.hidden = true;
  showPanel("tab-setup");
  // Back to the setup screen, where the league can be changed again, so the
  // board is rebuilt rather than just redrawn.
  refreshSetup();
  window.scrollTo(0, 0);
  // DraftRoom.jsx's own "have I clicked past the Locker" flag has no other
  // way to hear about this — it is local, UI-only React state, set true by
  // three separate places and, until this, never set back. goHome() is
  // vanilla JS with no reference to that component, so it says so the same
  // way headerInfo() already tells React something changed: an event on
  // window. Without this, "Discard draft" and "Leave the room" — the two
  // real callers of restart(), reachable from the header kebab on every
  // draft — left that flag stuck true, and the very next Lobby visit fell
  // through past its own "nothing entered yet" guard into a stale,
  // nothing-going-on seat-picker instead of back to the Locker.
  window.dispatchEvent(new Event("juke:home"));
}

// The destructive one. Clear first, so the resume bar has nothing to offer.
function restart() {
  clearSave();
  goHome();
}

// The mark in the header. Mid-draft this is a surprising place to land, so
// it asks first; once the draft is over there is nothing to interrupt.


/* ---- 9. The pick clock ---------------------------------
   setInterval runs a function once a second. When the clock
   hits zero we draft the top suggestion, which is exactly
   what FantasyPros does.                                   */

function stopClock() {
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
}

/* Two different questions that used to be one.

   `clockRunnable()` is "should this browser be counting" — and only your own
   turn in a solo draft ever is, because that is the only countdown a solo
   draft has and running out of it drafts for you.

   `clockShowing()` is "is there a countdown worth drawing", which in a room is
   true on everybody's turn. The room already sends msLeft to every client and
   adoptRoom() already mirrors it into state.timeLeft; the page simply refused
   to draw it unless the seat was yours, so nine people out of ten watched a
   clock they could not see. */
function clockRunnable() {
  return state.clockLength > 0 && !draftOver() && !hasRoom() && isMyTurn();
}

function clockShowing() {
  if (!state.clockLength || draftOver() || !state.started) return false;
  return hasRoom() || isMyTurn();
}

// Start counting down from whatever is on the clock right now.
function startTicking() {
  stopClock();
  state.timerId = setInterval(function () {
    state.timeLeft--;
    if (state.timeLeft <= 0) {
      stopClock();
      /* league.cpuAutopick off means the clock is a stopwatch rather than a
         deadline: it runs out, it stops, and the seat is still yours. The
         header keeps drawing 0:00 and the Draft buttons keep working,
         because whose turn it is never changed — only whether anything
         happened when the number hit zero.

         Rendering rather than returning silently is the difference between
         "the clock expired" and "the app froze": without it the last tick
         paints 0:01 and nothing ever repaints 0:00. */
      if (league.cpuAutopick === false) { renderHeader(); tickBoardClock(); return; }
      const auto = autoPickForMe();
      if (auto) draftAndAdvance(auto);
    } else {
      renderHeader();
      tickBoardClock();
    }
  }, 1000);
}

/* One cell, once a second. This is the same exception renderHeader() already
   is: render() rebuilds everything on a change, and a clock tick is not a
   change to the draft — it is the same board with a different number on it.
   Rebuilding a 24-by-20 grid every second to move one digit would be a lot
   of work to say the same thing. Silently does nothing when the board is not
   the panel on screen, because getElementById simply will not find it. */
function tickBoardClock() {
  const cell = $("boardClock");
  if (cell && clockShowing()) cell.textContent = clockText();
}

/* A room's clock, painted rather than counted.

   The room is the authority and sends msLeft with every broadcast — but a
   broadcast happens on a pick or a message, not once a second, so a clock
   drawn only from those sits still for a minute and then jumps. This walks
   the last known figure down in between and is corrected by the next
   broadcast. It never drafts: running out is the room's business, and the
   host's browser is what answers for it. */
function startRoomTicking() {
  stopClock();
  state.timerId = setInterval(function () {
    if (state.timeLeft > 0) state.timeLeft--;
    renderHeader();
    tickBoardClock();
  }, 1000);
}

// Put a fresh clock on the board. Called after every pick.
function resetClock() {
  stopClock();

  /* The room counts for everyone in a shared draft, and a second timer
     deciding things locally would disagree with it within a few seconds. So
     nothing here starts a countdown that can act — only one that draws.

     hasRoom() rather than inRoom(): a dropped socket is still a room, and a
     browser that answered "no" to that would start counting on its own and
     draft for a seat it no longer speaks for. */
  if (hasRoom()) {
    if (clockShowing() && !state.paused) startRoomTicking();
    return;
  }

  if (!clockRunnable()) return;
  state.timeLeft = state.clockLength;
  if (!state.paused) startTicking();
}

/* Pausing only stops the countdown. You can still draft while paused, and the
   pause survives until you turn it back off.

   In a room it is a message, not a flag. It used to be neither: the local
   value flipped, the header read "Paused", and the room went on counting
   down and handed the seat to the CPU underneath it. The room refuses it from
   anyone but the host, and the answer comes back as room.paused like every
   other fact about a shared draft — so nothing is set here at all. */
function togglePause() {
  if (hasRoom()) { Live.pause(!state.paused); return; }

  state.paused = !state.paused;
  if (state.paused) {
    stopClock();
  } else if (clockRunnable()) {
    startTicking();
  }
  renderPauseButton();
  renderHeader();
}

// Pause, undo and auto-draft are all meaningless once the last pick is in.
// Rather than leave four dead controls sitting there, the bar becomes the
// one thing you actually want next.
/* Three of these were the browser deciding things it does not get to decide
   in a room, and all three were offered to everybody in it.

   - Undo rolls picks off the local copy. In a room the local copy is a
     drawing of somebody else's record, so it un-drafted players for you and
     the next broadcast put them straight back. There is no shared undo and
     there should not be one: a draft ten people are in is not a thing one of
     them reverses. It goes away.
   - Pause is the host's, and it is now a message rather than a local flag —
     see togglePause(). Everyone else sees the state it produces.
   - "Discard draft" did not discard anybody's draft but yours, and what it
     actually did in a room was walk you out of it. The label is the bug: it
     reads as destroying a shared draft and it reads as an act, so it says
     what it does. */
function renderActionBar() {
  const done = draftOver();
  const room = hasRoom();
  const host = room && !!Live.room().isHost;

  $("newDraftBtn").hidden = !done;
  $("pauseBtn").hidden    = done || (room && !host);
  $("undoBtn").hidden     = done || room;
  $("autoBtn").hidden     = done;

  const quit = $("restartBtn");
  quit.textContent = room ? "Leave the room" : "Discard draft";
  quit.classList.toggle("danger", !room);

  if (!done) { renderPauseButton(); renderAutoButton(); }
}

/* "Auto-draft the rest" is the truth on your own machine and a promise the
   app cannot keep in a room, where the rest is nine other people's business.
   The label was part of the bug, not decoration on top of it: it is what said
   the button would fill in the whole board, and in a room it did. */
function renderAutoButton() {
  const btn = $("autoBtn");
  if (!inRoom()) { btn.textContent = "Auto-draft the rest"; return; }
  btn.textContent = state.autoMe ? "Stop auto-drafting" : "Auto-draft my picks";
}

function renderPauseButton() {
  const button = $("pauseBtn");
  button.textContent = state.paused ? "Resume clock" : "Pause clock";
  button.classList.toggle("active", state.paused);
  button.disabled = state.clockLength === 0;
}

function clockText() {
  const m = Math.floor(state.timeLeft / 60);
  const s = state.timeLeft % 60;
  return m + ":" + String(s).padStart(2, "0");
}


/* ---- 10. Suggestions -----------------------------------
   The same scoring the CPUs use, but applied to your roster
   — so it recommends what your team actually needs.        */

/* The model's opinion, as a multiplier beside need and risk.

   Everything else on the page answers to the scoring rules — the Juke score,
   replacement level, the whole grade — and this did not. Suggestions were ADP
   times need times risk, so setting receptions to five points changed every
   number printed on a card and none of the order: with the editor open the
   app was computing a better answer than the one it was giving.

   It has to be the Juke score, not marketGap(). marketGap compares a player with
   his own position's market, so it says "this receiver is underrated among
   receivers" and cannot say "receivers are worth more than backs now" — which
   is the only thing five points a catch changes. Tried it that way first and
   the list did not move, because the elite are WR1 and RB1 on both measures
   whatever the rules. overallScore() is points above replacement at his own
   position against the best such figure anywhere on the board, so it compares
   across positions and answers to every rule in the table.

   A multiplier, so it sits with need and risk rather than beside them in
   different units, and it only ever pulls up: a player the model rates gets a
   discount on his price, one it does not rate stays exactly where the market
   put him. No centre point to argue about, and no player is pushed down for
   want of a projection — those score null and are left alone.

   Capped, because ADP is the one thing here that knows when a player will
   actually be gone, and advice that forgets that is not advice. */
const MODEL_CAP = 0.25;   // the market still decides the shape of the list

/* A percentage cap alone is not a cap on the reach it produces, because
   the thing it is a percentage *of* grows with ADP: a quarter off pick 10
   is 2.5 picks, invisible; a quarter off pick 150 is 37.5, which is a
   real reach — and draft value (the grade's own value component) then
   penalises exactly that pick for exactly the discount the suggestion
   engine just gave it. Confirmed on a real mock: the app's own suggestion
   discounted a pick to -23, autopicked another to -37, and Draft Insights
   named the second one the biggest reach of the draft — the recommendation
   engine and the grade engine disagreeing about the same pick in public,
   which is the one thing a product whose whole pitch is "show your
   working" cannot do.

   MODEL_CAP stays exactly as it was — it is still what makes the early
   rounds work, and 2.5 picks of headroom there was never the problem.
   This bounds what it is allowed to produce in absolute picks once ADP
   itself gets large enough to make the percentage misbehave. 20 is chosen
   so the cap only ever engages past roughly pick 80 (20 / 0.25 = 80),
   which is exactly where the percentage was already doing real work
   without yet being a reach — the early rounds are untouched. */
const MODEL_CAP_PICKS = 20;

/* Measured against the best player still available, not the best the board
   ever held. overallScore() is a share of BEST_VOR, which is fixed for the
   whole draft, so by the fifth round everyone left scores single figures and
   a multiplier taken straight off it collapses to nothing — a 6% spread
   across the entire candidate list, which reorders exactly nothing. Measured
   that before believing it.

   Against the best still on the board it keeps its range at every stage: the
   best-rated player available always earns the full discount and the ones
   with nothing to say for them pay full price. */
function modelMultipliers(pool) {
  const best = pool.reduce(function (top, p) {
    const ovr = overallScore(p);
    return ovr !== null && ovr > top ? ovr : top;
  }, 0);

  return function (player) {
    if (!best) return 1;                       // nobody has a projection
    const ovr = overallScore(player);
    if (ovr === null) return 1;                // no opinion, leave him at market
    if (!player.adp || player.adp <= 0) return 1 - Math.min(1, ovr / best) * MODEL_CAP;
    // The percentage, converted to picks and clamped, then converted back
    // to the ratio suggestions() already multiplies the score by — the
    // contract this function returns doesn't change, only what it's
    // allowed to produce once ADP is large.
    const rawCut = player.adp * Math.min(1, ovr / best) * MODEL_CAP;
    return 1 - Math.min(rawCut, MODEL_CAP_PICKS) / player.adp;
  };
}

/* `filter` overrides the chip that happens to be showing. The panel passes
   nothing and gets what the reader asked for; anything picking on your behalf
   passes "ALL", because which position you were last *looking at* is not a
   rule about what you may draft. */
function suggestions(filter) {
  const c = onTheClock();
  const round = c ? c.round : league.rounds;
  const only = filter === undefined ? state.filterSuggest : filter;

  const pool = board.filter(function (p) {
    if (p.drafted) return false;
    if (isRuledOut(p)) return false;
    if (only !== "ALL" && p.pos !== only) return false;
    if (countAt(state.mySlot, p.pos) >= maxAt(p.pos)) return false;
    return true;
  });

  /* The fourth term, and it only applies when the scoring table has left the
     one ADP was drawn from — see scoringIsStock(). It was unconditional, and
     measured over ten pinned seeds with my seat drafting each way against an
     identical room, that cost real rosters:

       stock table, with it:     mean rank 9.30, starter strength 83.0
       stock table, without it:  mean rank 6.20, starter strength 87.3

     Stronger starting lineup without it in 10 of 10, and it never once
     outranked cpuChoice at the same seat. On a stock table ADP has already
     priced the rules in, so discounting a player again for a projection built
     from those same rules is counting the same fact twice.

     The reverse holds where it was aimed. At five points a reception it is
     worth about four points of starter strength over ignoring the rules, and
     ignoring them is what the ungated-off version does — its numbers do not
     move at all between half-PPR and 5-point PPR, which is precisely the
     complaint this term was written to answer.

     It looked like a tight end problem and it is not, which is worth keeping.
     The advice held 2.3 tight ends against the CPU's 1.8, and overallScore()
     is points above replacement at a player's own position — TE replacement is
     low, so a second and third keep scoring well while bestLineup() can start
     one. So the discount was gated on still having a startable slot, twice:
     strictly on league.starters, and again granting the FLEX to RB and WR
     only. Both brought tight ends back to 1.8 and neither improved the roster
     at all. Fixing the symptom moved nothing, which is what said the term was
     mispriced rather than misaimed.

     shotPicks() applies it unconditionally and should keep doing so. It is
     what puts an elite quarterback and two tight ends in the hero shot instead
     of the forty-name ADP slice that came out two colours — a picture is not a
     roster, and being wrong about who to draft costs it nothing. */
  const modelMultiplier = scoringIsStock() ? null : modelMultipliers(pool);

  return pool
    .map(function (p) {
      const risk = isRisky(p) ? 1.35 : 1;
      return { player: p, score: (p.adp + p.jitter)
                 * needMultiplier(state.mySlot, p.pos, round)
                 * risk
                 * (modelMultiplier ? modelMultiplier(p) : 1) };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 6)
    .map((x) => x.player);
}


/* ---- 9b. Tiers -----------------------------------------

   A tier is a run of players at one position with no
   meaningful gap between them. The break is proportional to
   ADP because gaps are tight at the top of the board and
   wide at the bottom: two picks apart means something at
   pick 5 and nothing at pick 120.                          */

const MAX_TIER_SIZE = 6;

function buildTiers() {
  POSITIONS.forEach(function (pos) {
    const list = board.filter((p) => p.pos === pos);   // already ADP sorted
    let tier = 1, sizeSoFar = 0;

    list.forEach(function (p, i) {
      if (i > 0) {
        const gap = p.adp - list[i - 1].adp;
        const threshold = Math.max(2, list[i - 1].adp * 0.13);
        // Gaps between players stop growing as fast as ADP does, so deep in
        // the board nothing ever clears the threshold and one tier swallows
        // half the position. The size cap is what keeps a tier actionable.
        if (gap >= threshold || sizeSoFar >= MAX_TIER_SIZE) { tier++; sizeSoFar = 0; }
      }
      p.tier = tier;
      sizeSoFar++;
    });
  });
}

// How many players are left in this player's tier at his position.
function tierRemaining(player) {
  return board.filter((p) => p.pos === player.pos && p.tier === player.tier && !p.drafted).length;
}

// How many players already on my roster share this bye week.
function byeShare(player) {
  return rosterOf(state.mySlot).filter((p) => p.bye === player.bye).length;
}

/* Everything on the player sheet describes a player. Nothing on it describes
   a *decision*: every number in the drawer reads identically at pick 1 and at
   pick 140, with an empty roster or four running backs already on it. The one
   question somebody actually opens a sheet to answer mid-draft — should I take
   him, now, with this roster — had no answer anywhere.

   It lives here rather than in the drawer because every part of it is a
   question about the league's shape, and that may not be written down twice:
   the cap is needMultiplier()'s (see atPositionCap — the cap is maxAt() for a
   skill position, the starting requirement for a K or DST, and starters.QB
   plus the superflex for a quarterback, which is precisely the split that
   caused the superflex grading bug), the lineup is bestLineup()'s, and the
   snake is DraftEngine's. React gets the answer, never the rules.

   Returns null before a draft is running: there is no roster to fit against
   and no next pick to wait for, so every field would be a fact about nothing. */
function draftFit(player) {
  if (!state.started || !player) return null;

  const pos = player.pos;
  const mine = rosterOf(state.mySlot);
  const nextOverall = nextPickFor(state.mySlot);

  /* Would he start for me today. This is `aboveReplacement` used as the
     yardstick it actually is — CLAUDE.md's warning is about pricing *depth
     picks* with it in needMultiplier(), where a bench spot is a lottery
     ticket rather than a starting decision. Asking whether a player cracks
     the lineup is the one question replacement level exists to answer, and
     bestLineup() is asked directly rather than re-deriving it. */
  const withHim = bestLineup(mine.concat([player]));
  const startsNow = withHim.some((s) => s.player === player);

  return {
    /* How many comparable players are left, and how long the wait is. The
       two only mean something together: eight left in his tier is patience
       when you pick again in three, and a gamble when you pick again in
       nineteen. */
    tierLeft: tierRemaining(player),
    posLeft: board.filter((p) => p.pos === pos && !p.drafted).length,
    nextOverall: nextOverall,
    picksAway: nextOverall === null ? null : nextOverall - (state.picks.length + 1),

    /* Whether the market expects him to survive that wait. His own ADP
       against the pick I next hold — not a probability, which the data does
       not support, just the two numbers side by side. */
    adp: typeof player.adp === "number" ? player.adp : null,

    have: countAt(state.mySlot, pos),
    atCap: atPositionCap(pos),
    startsNow: startsNow,

    /* A bye clash counts starters I already hold in his week. byeShare()
       answers it and the grade's own bye component is built on the same
       idea, so this is a read of an existing measure rather than a second
       one. */
    byeClash: byeShare(player),
    bye: player.bye || null,

    /* Underrated or overrated *within his own position* — board rank against
       the projection's rank. It cannot compare across positions and is not
       asked to: overallScore() already does that job on the Our Read tab.

       Null for the positions we refuse to rank. Withholding has to be
       complete or it is worse than not withholding: a sheet that prints a
       dash in the Juke score strip and then hands out a market verdict three
       lines below has told the reader to distrust a number and then argued
       from it. K ranks at r 0.37 / -0.09 / 0.57 and DST at 0.32 / 0.06 /
       0.25 — marketGap() rests on projPosRank, which is the very ordering
       those numbers say is noise. */
    unranked: UNRANKED_POSITIONS.indexOf(pos) >= 0,
    market: UNRANKED_POSITIONS.indexOf(pos) >= 0 ? null : marketGap(player)
  };
}

// Below this sample size FFC's own stdev is too noisy to answer a real
// question with — the deep bench runs from single digits to a few dozen
// recorded drafts, against a few hundred to a few thousand for anyone
// drafted in the first several rounds.
const MIN_ADP_SAMPLE = 20;

/* P(player still on the board at a given overall pick) — the Cockpit's
   "gone before pick 43 in 87% of boards" copy, and the reason it can say
   that honestly. draftFit()'s own adp field above is deliberately not a
   probability, with the comment "not a probability, which the data does
   not support" — true reading ADP alone. It stopped being true the
   moment FFC's own stdev and sample size (sd/td on every player,
   scripts/build_players.py) were captured instead of discarded: that is
   real dispersion across real recorded drafts, so a normal approximation
   around it is a measurement, not a ranking wearing a percentage.

   Deliberately not a simulation. jitter()/cpuChoice() are fully
   deterministic from state.seed, so in a solo draft the true answer is
   knowable exactly and a seed-varying Monte Carlo would print a number
   that is *wrong by construction* for the one room that exists. jitter()
   itself is a ±3 decorative wobble, not a measurement of real draft
   variance, so sampling over it would just reprint that constant dressed
   as a statistic. And in a shared room, any trial that calls the real
   applyJitter()/makePick() mutates shared state in place and risks
   desyncing every client — draft-engine.js's whole reason to exist is
   that the server and every client must reach the same pick from the
   same seed. None of that risk buys anything a closed form doesn't
   already answer for less.

   Withheld exactly like draftFit()'s own market field: incomplete data
   returns null rather than a number the sample can't support. */
function survivalProbability(player, atOverall) {
  if (!player || typeof player.adp !== "number") return null;
  if (typeof player.sd !== "number" || player.sd <= 0) return null;
  if (typeof player.td !== "number" || player.td < MIN_ADP_SAMPLE) return null;
  const overall = atOverall === undefined ? nextPickFor(state.mySlot) : atOverall;
  if (overall === null || overall === undefined) return null;
  return 1 - normalCdf((overall - player.adp) / player.sd);
}

/* Starters-worth of talent left at a position — undrafted players whose
   projection still clears replacement level. Not draftFit()'s own
   posLeft (a raw headcount, no replacement line drawn through it) and
   not a re-ranking of who's left, which would have to be re-derived on
   every single pick rather than read straight off the board.

   Null for K and DST, same as draftFit()'s own market field a few lines
   up — a depth count for the two positions this file already refuses to
   rank is a ranking wearing a different costume. Null too before
   buildProjections() has run: REPLACEMENT_PTS starts as {}, and reading
   a threshold of undefined would count every undrafted player at the
   position as "above replacement." */
function positionDepthRemaining(pos) {
  if (UNRANKED_POSITIONS.indexOf(pos) >= 0) return null;
  const threshold = REPLACEMENT_PTS[pos];
  if (!threshold) return null;
  return board.filter((p) =>
    p.pos === pos && !p.drafted && p.projPts != null && p.projPts > threshold
  ).length;
}

/* Which round the draft is actually in, or null once the board is full —
   onTheClock() has no pick to describe then and reading `.round` off it threw,
   on the player sheet opened on a finished draft, which is precisely when
   somebody browses what is left.

   It used to have a companion, earliestRoundFor(), feeding a `legalFromRound`
   field on draftFit() and a banner on the player sheet reading "the app doesn't
   take a K before round 13". Both are gone with the round gates that made the
   sentence true. Left in place earliestRoundFor() would have returned 1 for
   every position and the banner would simply never have fired — a field
   nothing can draw and an invitation to put the sentence back without the
   reasoning that took it out. */
function onClockRound() {
  const now = DraftEngine.onTheClock(league, state.picks.length);
  return now ? now.round : null;
}

/* The next pick this seat holds, as an overall number, or null if the draft
   has none left for them. Walks forward from the current pick rather than
   doing arithmetic on the snake — DraftEngine.onTheClock() already owns turn
   order, and a second derivation of it is the seat-versus-pick-number bug
   waiting to happen. */
function nextPickFor(slot) {
  const total = league.teams * league.rounds;
  for (let overall = state.picks.length + 1; overall <= total; overall++) {
    if (DraftEngine.onTheClock(league, overall - 1).slot === slot) return overall;
  }
  return null;
}

// The same walk, continued past the first hit — up to `count` upcoming
// overall picks for a seat, for "your next picks" strips (Entry, the
// Cockpit's Decide rail). Added so a caller with more than one of those
// strips on screen isn't re-deriving the snake walk itself a second time;
// nextPickFor() above stays as the single-answer case everything else
// already depends on.
function nextPicksFor(slot, count) {
  // Bridged straight to window.JukeEngine and read by the React Draft Room
  // on mount (see the bridge comment on nextPicksFor below) — unlike every
  // caller inside this file, that read has no guarantee draft-engine.js has
  // landed yet. Same guard as onTheClock()/pickCode() above.
  if (typeof DraftEngine === "undefined") return [];
  const total = league.teams * league.rounds;
  const out = [];
  for (let overall = state.picks.length + 1; overall <= total && out.length < count; overall++) {
    if (DraftEngine.onTheClock(league, overall - 1).slot === slot) out.push(overall);
  }
  return out;
}


/* ---- 10a. Player stats and draft signals ---------------

   Everything here is computed, not asserted. There is no
   panel of experts behind it: it is projections, depth chart
   position, age and injury status, weighted and shown.     */

/* ---- Scoring ------------------------------------------

   stats.js holds raw components and no points total at all.
   The rules live here, which is what makes them editable:
   change a value and every projection, season and week
   rescores on the next render, with no rebuild.

   STAT_KEYS comes from stats.js and says which short key
   holds which stat. It is generated from the pipeline's own
   field list so the two can never drift apart.            */

// Generic on purpose: six points for a touchdown however it was scored.
// This is the starting point, not the law — the setup screen edits a copy.
const DEFAULT_RULES = {
  pass_yd: 0.04, pass_td: 6, pass_int: -2, pass_2pt: 2,
  // Every rule added since the original 38 defaults to zero, so the board a
  // returning drafter sees is identical until they choose otherwise. What
  // they buy is the ability to describe their league, not a changed one.
  pass_att: 0, pass_cmp: 0, pass_fd: 0,
  rush_yd: 0.1, rush_td: 6, rush_2pt: 2, rush_fd: 0,
  rec: 0.5, rec_yd: 0.1, rec_td: 6, rec_2pt: 2, rec_fd: 0, rec_40p: 0,
  fum_lost: -2, kr_td: 6, pr_td: 6,
  xpm: 1, xpmiss: -1, fgmiss: -1,
  // The five bands are an EXTRA on top of fgmiss, not a replacement for it,
  // and the counts overlap completely: a missed 45-yarder increments fgmiss
  // AND fgmiss_40_49. So they start at zero — nothing double-charges until
  // somebody asks it to — and a league that scales a miss by distance sets
  // the base on fgmiss and the increment here.
  //
  // This is the opposite of fgm, which is stored but deliberately not
  // scoreable so that a made kick can only ever be charged through its band.
  // fgmiss cannot be demoted the same way: it defaults to -1, so removing it
  // would silently rescore every league rather than the few that opted in,
  // and it would take the miss penalty out of the projection entirely —
  // Sleeper forecasts misses only as fgmiss_50p, so no band ever reaches
  // PROJECTED_KEYS.
  //
  // And a band is not a complete substitute for the total on the history
  // either, which is the reason that matters most. Measured over every
  // season we store: the bands account for every miss from 2024 on and for
  // only 52-63% of them before that, because Sleeper populated them
  // sparsely in its older seasons. fgmiss is whole in every season —
  // fga == fgm + fgmiss reconciles without exception — so it is the number
  // that can be trusted on an old line, blocked kicks included. See
  // check_miss_bands() in build_players.py, which prints the split every
  // run.
  //
  // There is no fgmiss_0_19 because Sleeper sends none. Nobody missed from
  // inside twenty yards last season.
  fgmiss_20_29: 0, fgmiss_30_39: 0, fgmiss_40_49: 0,
  fgmiss_50_59: 0, fgmiss_60p: 0,
  fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3,
  fgm_40_49: 4, fgm_50_59: 5, fgm_60p: 6,
  sack: 1, int: 2, fum_rec: 2, safe: 2,
  def_td: 6, def_st_td: 6, blk_kick: 2, def_2pt: 2,
  pts_allow_0: 5, pts_allow_1_6: 4, pts_allow_7_13: 3,
  pts_allow_14_20: 1, pts_allow_21_27: 0,
  pts_allow_28_34: -1, pts_allow_35p: -4
};

// The format dropdown is a preset over one rule. Everything else it leaves
// alone, so a custom table survives switching between standard and PPR.
/* Receptions per catch, per preset. This is the one rule a preset owns
   outright — everything else in the scoring table is the same 49 rules,
   editable, and a preset only ever sets a starting point for them.

   Superflex is full PPR's rec value on purpose: it is not a scoring format
   at all, it is a roster shape (a second startable quarterback), and
   pretending it scored differently would be inventing a rule to justify a
   name. What it actually changes is league.superflex, which SCORING_PRESET
   below applies alongside this. */
const REC_BY_FORMAT = { standard: 0, half: 0.5, ppr: 1, superflex: 1 };

function rulesForFormat(fmt) {
  const rec = REC_BY_FORMAT[fmt];
  return Object.assign({}, DEFAULT_RULES, { rec: rec === undefined ? 0.5 : rec });
}

// Seeded here rather than in the league object itself, because the defaults
// are defined in this section and a const cannot be read before it exists.
league.rules = rulesForFormat(league.scoring);

/* Whether the scoring table is still one ADP already knows about.

   FFC publishes one set of ADP per format, and the pipeline picks the set by
   league.scoring — so on a stock table, average draft position was drawn from
   drafts scored the way this league is scored, and it has already priced the
   rules in. Deviate from it and ADP is describing a different game: set
   receptions to five points and every projection moves while ADP does not
   budge, which is the hole the model multiplier in suggestions() exists to
   fill.

   Measured both ways over pinned seeds, my seat drafting each against an
   identical room. On a stock table the model costs about five points of
   starter strength and three places, and gives the stronger lineup in 0 of 6.
   At five points a reception it gains about four points of starter strength
   over ignoring the rules. So it is not a good or a bad idea in general — it
   is right exactly when ADP is wrong, and this is the test for that. */
function scoringIsStock() {
  const stock = rulesForFormat(league.scoring);
  return Object.keys(stock).every((k) => stock[k] === league.rules[k]);
}

// Defaults to the league on screen, but takes a format so a saved draft can
// be described in its own terms.
/* The scoring formats, named once.

   These were written down three times — Title Case in the setup dropdown,
   lower case here, and a third copy inside scoringSummary() — so the same
   league read as "Half PPR" in one place and "half PPR" two inches below it.
   The dropdown is filled from this now and every label goes through it, so
   the three cannot disagree again.

   Title Case throughout, because "Half PPR" is the industry's name for the
   thing rather than a description of it, and because a format name appears
   far more often as a label or a chip than inside a sentence. */
const SCORING_NAMES = {
  standard: "Standard",
  half: "Half PPR",
  ppr: "Full PPR",
  superflex: "Superflex (2QB)"
};

/* What a preset does beyond its `rec` value, and the caveat each one
   carries.

   `note` is shown beside the preset on the settings screen rather than
   kept as a comment, because it is the honest half of offering a preset
   whose ADP the market never published. Superflex draws full PPR's board
   (see adpFormat) and a real superflex room takes quarterbacks far
   earlier than that board says — the preset gets the roster right and
   cannot get the market right, and a drafter is better off being told
   than finding out in round three.

   `lineup` is applied by setScoring() and is a patch, not a whole roster:
   a preset may say "one superflex slot" without also having an opinion
   about how many receivers somebody starts. */
/* The three draft types, and the honest state of each.

   Snake and linear are both real: DraftEngine.reversedRound() is the whole
   of the difference between them and the engine runs either one today.

   Auction is listed and NOT available, which is a deliberate choice rather
   than an oversight. It is not a setting — it is a second draft mode end to
   end (a budget per team, a nomination order, live bidding, a bid clock,
   and a CPU that has to value a player in dollars rather than in board
   position), and none of that exists here. Shipping a control that silently
   ran a snake draft under an "Auction" label would be worse than not
   offering it: this project's own rule is that a right number in the wrong
   place is a bug, and this would be a whole wrong product behind a right
   label. Listed rather than hidden because a settings screen that shows two
   options where the category has three tells a visitor Juke does not know
   about the third. */
const DRAFT_TYPES = [
  { key: "snake", label: "Snake", sub: "Serpentine", available: true },
  { key: "linear", label: "Linear", sub: "Non-snaking", available: true },
  { key: "auction", label: "Auction", sub: "Salary cap", available: false,
    note: "Auction drafting is a different draft entirely — a budget, nominations and live bidding — not a setting on this one. It is in build." }
];

/* Who is on the board. Read off Sleeper's own years_exp (`exp` in
   stats.js), which is already there on every matched player — see
   inPool() for what happens to a row that has none, and why that is the
   only defensible answer rather than the lazy one. */
const PLAYER_POOLS = [
  { key: "all", label: "All", sub: "Players", available: true },
  { key: "rookies", label: "Rookies", sub: "Only", available: true },
  { key: "vets", label: "Vets", sub: "Only", available: true }
];

const SCORING_PRESET = {
  standard: { lineup: { superflex: 0 } },
  half: { lineup: { superflex: 0 } },
  ppr: { lineup: { superflex: 0 } },
  superflex: {
    lineup: { superflex: 1 },
    note: "Adds a SUPERFLEX slot a quarterback can fill. ADP still comes from full-PPR drafts, so the market underrates quarterbacks here — the projection does not."
  }
};

function scoringLabel(scoring) {
  const s = scoring || league.scoring;
  return SCORING_NAMES[s] || String(s || "");
}

// True when a stat line represents a game or season that actually happened.
// Asked of the raw data rather than of a points total, because a real week
// can legitimately score zero and a week that never happened cannot be told
// apart from it any other way.
function didPlay(block) {
  if (!block) return false;
  return Object.keys(block).some((k) => k !== "w" && k !== "gp" && block[k]);
}

/* Scoring, under a rule table handed in rather than read off the league.

   Split out of fantasyPoints() so the landing page can price the same player
   under standard, half and full PPR at once without swapping league.rules and
   swapping it back — which is a global the whole draft reads, and restoring it
   correctly is the kind of thing that works until an exception is thrown
   halfway through. Nothing about the arithmetic moved. */
function pointsUnder(block, rules) {
  if (!block) return 0;
  // stats.js can still be in flight — see the deferred-data boot at the
  // foot of this file. Nothing to score yet is not an error.
  if (typeof STAT_KEYS === "undefined") return 0;
  let total = 0;
  Object.keys(rules).forEach(function (rule) {
    const key = STAT_KEYS[rule];
    const value = key ? block[key] : 0;
    if (value) total += value * rules[rule];
  });
  // A tenth of a point, the precision the raw data arrives in.
  return Math.round(total * 10) / 10;
}

function fantasyPoints(block) {
  return pointsUnder(block, league.rules);
}

// Points per game, formatted, from a games count the caller has to supply.
// It is deliberately impossible to call this without naming the denominator:
// the DST bug was a divisor picked up implicitly from whatever the feed had
// put in gp. No games means no per-game figure, so it prints a dash rather
// than dividing by a fallback of one and echoing the season total back.
function perGame(points, games) {
  return games > 0 ? (points / games).toFixed(1) : "&mdash;";
}

// Season keys, oldest first. Nothing here assumes which years exist.
function seasonKeys(stat) {
  return stat && stat.s ? Object.keys(stat.s).sort() : [];
}

/* ---- what we said, against what happened ------------------

   `pp` holds the preseason forecast for seasons that have since been played,
   beside the actuals in `s`. Every other number on this sheet is a claim about
   the future; this is the only one that can be checked, and it is the thing no
   projection feed shows you about itself.

   Both sides go through fantasyPoints() under the current rules, so this
   rescores with the scoring editor exactly as the rest of the sheet does. A
   historical figure that ignored the editor would be the one number here
   quietly describing a different league.

   **Games played is not decoration.** Measured across all three archived
   seasons, availability is most of the error: players who managed 15+ games
   came in at r 0.873, under 15 at r 0.617. A forecast missed by 210 points
   because somebody tore a hamstring in week four is a different claim from one
   that was wrong about the player, and a table that shows only the miss lets a
   reader draw the wrong conclusion from a true number.

   **And the projection runs light on anyone who stays fit** — 20 points on
   average for the 15+ group. That is not a flaw to correct: a projection is an
   expected value that prices in injury risk, so it must undershoot everyone
   who avoids it. The note under the table says so, because otherwise a column
   of green "+" figures reads as a model that is simply too low. */
function projectionRecord(player) {
  const s = statOf(player);
  if (!s || !s.pp || !s.s) return [];

  return Object.keys(s.pp).sort().reverse().map(function (year) {
    const said = s.pp[year], did = s.s[year];
    // A season he was not in has nothing to grade. Same rule as everywhere
    // else: absent, never zero.
    if (!did || !did.gp) return null;
    const proj = fantasyPoints(said);
    const act = fantasyPoints(did);
    return {
      year: year,
      proj: proj,
      act: act,
      diff: act - proj,
      // A team defense is one aggregate row stamped gp:1, so its game count is
      // not a game count. projGames() exists for exactly this and the answer
      // here is to show nothing rather than "1".
      games: player.pos === "DST" ? null : did.gp
    };
  }).filter(Boolean);
}

function projectionRecordHtml(player) {
  const rows = projectionRecord(player);
  if (!rows.length) return "";

  const body = rows.map(function (r) {
    const up = r.diff >= 0;
    /* Fifteen games is the line the measurement was taken at, and it is why
       the count is here: below it, the miss is mostly about availability. */
    const short = r.games !== null && r.games < 15;
    return `<tr>
      <td>${r.year}</td>
      <td>${Math.round(r.proj)}</td>
      <td>${Math.round(r.act)}</td>
      <td class="${up ? "beat" : "missed"}">${up ? "+" : "&minus;"}${Math.abs(Math.round(r.diff))}</td>
      <td class="${short ? "short" : ""}">${r.games === null ? "&mdash;" : r.games}</td>
    </tr>`;
  }).join("");

  return `<p class="section-label">Our record on ${player.pos === "DST" ? "this defense" : "him"}
      &middot; ${scoringLabel()}</p>
    <div class="tblscroll"><table class="logtbl record">
      <thead><tr><th>Year</th><th>We said</th><th>He got</th><th>Diff</th><th>GP</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <p class="method">What we projected before each season, against what actually happened,
      both scored under your current rules. A projection is an average over everything that
      might happen, so it prices in the chance of injury &mdash; which means a player who
      stays fit routinely beats it. Across these seasons the forecast ran about 20 points
      light on anyone who managed fifteen games or more, and most of the large misses below
      that line are availability rather than a wrong read.</p>`;
}

// The most recent season in which the player actually appeared.
function lastSeason(stat) {
  const keys = seasonKeys(stat).filter((y) => stat.s[y].gp > 0);
  return keys.length ? stat.s[keys[keys.length - 1]] : null;
}

// The two most recent seasons with a real sample, used for the trend signal.
// A player who missed all of last year still gets compared on the two years
// he did play, rather than silently losing the signal.
function trendPair(stat) {
  const played = seasonKeys(stat)
    .filter((y) => stat.s[y].gp >= 6)
    .map((y) => stat.s[y]);
  return played.length >= 2 ? played.slice(-2) : null;
}

function statOf(player) {
  if (typeof PLAYER_STATS === "undefined" || !player.id) return null;
  return PLAYER_STATS[player.id] || null;
}

// How many games a projection covers. Sleeper forecasts a team defense as
// one aggregate row and stamps it gp:1, where every other position carries
// the real projected week count — so dividing by gp made a DST's per-game
// figure identical to its season total. Pittsburgh read 93 and 93.0.
//
// Which number applies is a question about the position, never about the
// value the feed happened to send: a skill player really can be projected
// for one game, and a defense with gp:1 is not playing one game.
let PROJ_WEEKS = 0;

// The horizon is read back off the rows that do carry it rather than written
// down here, because Sleeper has used both 17 and 18 across seasons and a
// number hardcoded now would silently drift from every other row later.
function findProjectionWeeks() {
  const counts = {};
  board.forEach(function (p) {
    const s = statOf(p);
    const gp = p.pos !== "DST" && s && s.p ? s.p.gp : 0;
    if (gp > 1) counts[gp] = (counts[gp] || 0) + 1;
  });
  const common = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  // Nothing usable leaves this at 0, which perGame() renders as a dash.
  PROJ_WEEKS = common ? Number(common) : 0;
}

function projGames(pos, block) {
  if (!block || !block.gp) return 0;
  return pos === "DST" ? PROJ_WEEKS : block.gp;
}

// Projected points under this app's scoring, and each player's rank at
// their position by projection rather than by ADP.
function buildProjections() {
  findProjectionWeeks();

  board.forEach(function (p) {
    const s = statOf(p);
    // Sleeper returns zero-filled rows for players it has no forecast for,
    // and counting those as real projections once dragged replacement level
    // toward zero and made everybody else look elite. Games projected is the
    // marker, asked of the raw data — a scoring change must never be able to
    // turn a missing projection into a real one, or the other way round.
    p.projPts = s && s.p && s.p.gp > 0 ? fantasyPoints(s.p) : null;
  });

  POSITIONS.forEach(function (pos) {
    const ranked = board
      .filter((p) => p.pos === pos && p.projPts !== null)
      .sort((a, b) => b.projPts - a.projPts);

    ranked.forEach(function (p, i) { p.projPosRank = i + 1; });

    const rank = replacementRank(pos);
    const cut = Math.min(rank, ranked.length) - 1;
    REPLACEMENT_PTS[pos] = cut >= 0 && ranked[cut] ? ranked[cut].projPts : 0;
    if (ranked.length < rank && ranked.length) {
      REPLACEMENT_PTS[pos] = ranked[ranked.length - 1].projPts;
    }
  });

  // The best value-over-replacement on the board, which is the denominator
  // every Juke score is measured against. It is computed once here rather
  // than inside draftSignals(), because the player list now asks for a score
  // on every row: recomputing it per call made that O(n^2) over the pool.
  // It has to come after the loop above, since it reads REPLACEMENT_PTS.
  BEST_VOR = Math.max.apply(null, board.map((p) =>
    p.projPts === null ? 0 : p.projPts - (REPLACEMENT_PTS[p.pos] || 0)));

  buildPriorSeason();
}

/* ---- last season, scored the same way ---------------------

   The score is a share of the best value over replacement on the board, and
   nothing on screen said so — so a bare 100 read as a rating of the player
   rather than a ranking against the room. Gibbs is the whole argument for
   this: he is projected for 300 points having actually scored 328, and his
   score goes *up* from 82 to 100, because the projection compresses everyone
   below him. Two numbers side by side teach that in four words. One cannot.

   Measured before it was built. Over the fixed cohort of players with a line
   in 2023, 2024, 2025 and a 2026 projection, the share scoring zero is the
   same in every real season as it is in the projection — 38.5% against 39.9%
   on 16 August 2026 — so the pile of zeros is what this formula does to a
   board a couple of hundred deep in a league that starts about ninety
   players, not something the projection invented. Nothing to correct in the
   maths; the number just needed saying out loud. (The totals move nightly
   with the data; the conclusion has not.)

   This runs at the end of buildProjections() rather than lazily, for the
   reason the note above BEST_VOR gives: the sheet and the table both ask per
   player, and a pass per call is O(n^2) over the pool. It also means a
   scoring change rescores history too, which is the property the rest of the
   app already has and this would look broken without. */
let PRIOR_SEASON = null;
let PRIOR_BEST_VOR = 0;
const PRIOR_REPLACEMENT_PTS = {};

// The most recent completed season anywhere in the data, derived rather than
// written down: the pipeline's STAT_SEASONS moves every year and a literal
// here would silently go stale the first January nobody remembered it.
function latestStatSeason() {
  let latest = null;
  board.forEach(function (p) {
    const s = statOf(p);
    if (!s || !s.s) return;
    Object.keys(s.s).forEach(function (yr) {
      if (latest === null || yr > latest) latest = yr;
    });
  });
  return latest;
}

function buildPriorSeason() {
  PRIOR_SEASON = latestStatSeason();
  POSITIONS.forEach(function (pos) { PRIOR_REPLACEMENT_PTS[pos] = 0; });
  PRIOR_BEST_VOR = 0;

  board.forEach(function (p) {
    const s = statOf(p);
    const line = PRIOR_SEASON && s && s.s ? s.s[PRIOR_SEASON] : null;
    // Same test the projection gets, and for the same reason: a season the
    // player was not in the league is absent, never a zero.
    const played = line && line.gp > 0;
    p.priorPts = played ? fantasyPoints(line) : null;
    p.priorGames = played ? line.gp : null;
  });

  // Replacement level is re-derived from what actually happened, at the same
  // ranks. Reusing the projection's replacement points would measure last
  // season against this season's baseline and call the difference a change in
  // the player — which is exactly the error the whole feature exists to expose.
  POSITIONS.forEach(function (pos) {
    const ranked = board
      .filter((p) => p.pos === pos && p.priorPts !== null)
      .sort((a, b) => b.priorPts - a.priorPts);

    const rank = replacementRank(pos);
    const cut = Math.min(rank, ranked.length) - 1;
    PRIOR_REPLACEMENT_PTS[pos] = cut >= 0 && ranked[cut] ? ranked[cut].priorPts : 0;
    if (ranked.length < rank && ranked.length) {
      PRIOR_REPLACEMENT_PTS[pos] = ranked[ranked.length - 1].priorPts;
    }
  });

  PRIOR_BEST_VOR = Math.max.apply(null, board.map((p) =>
    p.priorPts === null ? 0 : p.priorPts - (PRIOR_REPLACEMENT_PTS[p.pos] || 0)));
}

// Last season's Juke score, on the same scale. Null for anyone who did not
// play it — the eighteen rookies on the board have no line at all, and a zero
// there would be a judgement about a season they were not in.
function priorScore(player) {
  if (!player || player.priorPts === null || player.priorPts === undefined) return null;
  const vor = player.priorPts - (PRIOR_REPLACEMENT_PTS[player.pos] || 0);
  return Math.max(0, Math.min(100, (vor / (PRIOR_BEST_VOR || 1)) * 100));
}

function label(score) {
  return score >= 75 ? "Very High" : score >= 55 ? "High"
       : score >= 35 ? "Medium"    : score >= 18 ? "Low" : "Very Low";
}

// Value over replacement, as a score out of 100. Split out of draftSignals()
// because the player list wants this on every row, where the reasons, the
// upside model and the bust model would all be work thrown away.
/* Positions the projection cannot rank, so we decline to score them.

   Backtested against three seasons of archived forecasts — what Sleeper said
   before the season, against what happened — the projected order for these two
   has no relationship to the finishing order:

       K    r = 0.37, -0.09, 0.57      (2023, 2024, 2025)
       DST  r = 0.32,  0.06, 0.25

   2024's kickers were *negatively* correlated. Every other position lands
   between 0.58 and 0.73.

   There is a mechanical reason underneath and it cannot be repaired from the
   feed. Sleeper forecasts only `fgm_40_49` and `fgm_50_59` — no field goal
   under forty yards at all, which was 253 of the 406 made in 2025. Every
   kicker is therefore projected far too low, and there is no total to subtract
   from to recover the rest, so inventing them would be this pipeline recording
   an opinion instead of a fact. About half the shortfall cancels in value over
   replacement, because a kicker and his replacement move together; none of the
   ranking noise does, and no amount of arithmetic fixes r = -0.09.

   Returning null rather than a number is the same answer this already gives a
   player with no projection, and it flows the same way: the sheet and the
   table print a dash, and modelMultipliers() leaves him exactly where the
   market put him rather than pushing him down for the want of a score.

   The grade is deliberately untouched. It runs on aboveReplacement(), and a
   kicker really did score those points — how a finished roster performed and
   how well a forecast ranks are different questions. */
const UNRANKED_POSITIONS = ["K", "DST"];

function overallScore(player) {
  if (!player || player.projPts === null || player.projPts === undefined) return null;
  if (UNRANKED_POSITIONS.indexOf(player.pos) >= 0) return null;
  const vor = player.projPts - (REPLACEMENT_PTS[player.pos] || 0);
  return Math.max(0, Math.min(100, (vor / (BEST_VOR || 1)) * 100));
}

/* The same figure before the clamp, which is the only one that can tell two
   zeros apart. Roughly three fifths of the board scores exactly 0, so the
   floor is the majority state rather than an edge case, and a receiver one
   point below replacement prints what a receiver sixty points below prints.

   Michael Wilson is the case that made this worth having. He scored 14 on
   last season's actuals — 181.6 points across all seventeen games, +29.4 over
   replacement — and reads 0 for 2026 because his projection falls 45 points
   while projected WR replacement *rises* 22. Most of that swing is the
   projection compressing the field, not a verdict on him, and "0" cannot say
   so. It stays out of overallScore(): modelMultipliers() divides by the best
   score available and a negative there would invert the discount. */
function replacementGap(player) {
  if (!player || player.projPts === null || player.projPts === undefined) return null;
  // Same refusal as overallScore(). This is that figure before the clamp, so
  // a position we will not rank has no gap to report either.
  if (UNRANKED_POSITIONS.indexOf(player.pos) >= 0) return null;
  return player.projPts - (REPLACEMENT_PTS[player.pos] || 0);
}

/* Points above replacement for the whole board, under an arbitrary scoring
   format rather than the live league's own rules — what homepage v4 pass
   2 needs in two places (the hero board widget's VORP column, the Show
   Your Working VORP chart) whenever a reader clicks the PPR toggle.
   "The curve falls when the reception bonus drops, but replacement falls
   with it" only holds if replacement is recomputed under that SAME
   format — reading REPLACEMENT_PTS here would answer under whatever this
   solo session's own league.rules happens to be instead, which drifts
   the instant a visitor's toggle disagrees with the league default.

   Side-effect-free by design: does not touch REPLACEMENT_PTS, board, or
   any player's real projPts, all of which the scoring editor still owns
   alone. Same per-position replacement-rank algorithm buildProjections()
   already uses — replacementRank() is pure and league-shape-only, so it's
   reused rather than re-derived a second way.

   Returns a plain object keyed by player.id: { projPts, vorp }, both null
   for a player with no games projected — the same "absent, not zero" rule
   replacementGap() already follows. */
function vorpTableUnder(format) {
  const rules = rulesForFormat(format);
  const byPos = {};
  const out = {};
  board.forEach(function (p) {
    if (UNRANKED_POSITIONS.indexOf(p.pos) >= 0) { out[p.id] = { projPts: null, vorp: null }; return; }
    const s = statOf(p);
    const pts = s && s.p && s.p.gp > 0 ? pointsUnder(s.p, rules) : null;
    out[p.id] = { projPts: pts, vorp: null };
    if (pts !== null) {
      (byPos[p.pos] = byPos[p.pos] || []).push({ id: p.id, pts: pts });
    }
  });
  POSITIONS.forEach(function (pos) {
    const list = byPos[pos];
    if (!list || !list.length) return;
    list.sort(function (a, b) { return b.pts - a.pts; });
    const rank = replacementRank(pos);
    const cut = Math.min(rank, list.length) - 1;
    const replacement = cut >= 0 ? list[cut].pts : list[list.length - 1].pts;
    list.forEach(function (row) { out[row.id].vorp = row.pts - replacement; });
  });
  return out;
}

/* The reasoning behind a score, said in one line. Built from figures already
   sitting on the player after buildProjections() rather than by calling
   draftSignals(), which would run the upside and bust models and allocate
   three arrays of prose for every row on the board.

   This is the thing the app has that a projection feed does not, and until
   now it was only readable by opening a player — which meant opening a
   player to find out whether he was worth opening. */
function overallReason(player) {
  if (player.projPts === null) {
    return "No 2026 projection for this player yet, so there is nothing to score him on.";
  }

  const vor = Math.round(player.projPts - (REPLACEMENT_PTS[player.pos] || 0));
  const parts = [Math.round(player.projPts) + " projected points, " +
                 (vor >= 0 ? "+" : "") + vor + " against a replacement " + player.pos];

  if (player.projPosRank) {
    parts.push("projects " + posLabel(player.pos) + player.projPosRank +
               ", drafted as " + posLabel(player.pos) + player.posRank);
  }
  return parts.join(". ") + ".";
}

// How far the projection disagrees with the market. Four places at a position
// is the same threshold draftSignals() treats as meaningful, kept in one place
// so the row and the sheet cannot tell different stories about a player.
const MARKET_GAP = 4;

function marketGap(player) {
  return player.projPosRank ? player.posRank - player.projPosRank : 0;
}

function draftSignals(player) {
  const s = statOf(player);
  if (!s || player.projPts === null) return null;

  const reasons = { overall: [], upside: [], bust: [] };

  // ---- Juke score: value over a replacement starter, in your scoring ----
  const vor = player.projPts - (REPLACEMENT_PTS[player.pos] || 0);
  const overall = overallScore(player);
  if (overall === null) {
    reasons.overall.push("the projection cannot rank this position, so we do not score it");
  } else {
    reasons.overall.push(Math.round(player.projPts) + " projected points, " +
      (vor >= 0 ? "+" : "") + Math.round(vor) + " vs a replacement " + player.pos);
  }

  // How far the projections disagree with the market, at his position.
  const gap = player.projPosRank ? (player.posRank - player.projPosRank) : 0;

  // ---- Upside ----
  let upside = 20;
  if (gap >= 4)  { upside += Math.min(35, gap * 2.5);
                   reasons.upside.push("projects " + posLabel(player.pos) + player.projPosRank +
                     " but drafted as " + posLabel(player.pos) + player.posRank); }
  if (s.exp !== undefined && s.exp <= 3) { upside += 18; reasons.upside.push(
      s.exp === 0 ? "rookie" : s.exp + " years in the league"); }
  if (s.order === 1) { upside += 14; reasons.upside.push("first on the depth chart"); }
  if (s.age && s.age <= 24) { upside += 10; reasons.upside.push("age " + s.age); }

  const pair = trendPair(s);
  if (pair) {
    const a = fantasyPoints(pair[0]) / pair[0].gp, b = fantasyPoints(pair[1]) / pair[1].gp;
    if (a > 0 && b > a * 1.2) { upside += 15;
      reasons.upside.push("points per game up " + Math.round((b / a - 1) * 100) + "% across his last two full seasons"); }
  }
  upside = Math.max(0, Math.min(100, upside));

  // ---- Bust ----
  let bust = 12;
  if (gap <= -4) { bust += Math.min(35, Math.abs(gap) * 2.5);
                   reasons.bust.push("drafted as " + posLabel(player.pos) + player.posRank +
                     " but projects only " + posLabel(player.pos) + player.projPosRank); }
  if (isRuledOut(player)) { bust += 40; reasons.bust.push("ruled out"); }
  // Through injuryWords() so the meters agree with the prose above them.
  // "Q designation" and "listed questionable" on the same screen read as two
  // different facts about the same player.
  else if (isRisky(player)) { bust += 22; reasons.bust.push("listed " + injuryWords(player.inj)); }
  else if (player.inj) { bust += 12; reasons.bust.push("listed " + injuryWords(player.inj)); }

  if (s.age) {
    if (player.pos === "RB" && s.age >= 28) { bust += 20; reasons.bust.push("age " + s.age + " at running back"); }
    else if ((player.pos === "WR" || player.pos === "TE") && s.age >= 31) { bust += 15; reasons.bust.push("age " + s.age); }
    else if (player.pos === "QB" && s.age >= 36) { bust += 12; reasons.bust.push("age " + s.age); }
  }
  if (s.order && s.order >= 2) { bust += 15; reasons.bust.push("number " + s.order + " on the depth chart"); }
  const recent = lastSeason(s);
  if (recent && recent.gp <= 12) { bust += 14; reasons.bust.push("only " + recent.gp + " games in his last active season"); }

  // A long record of missed time is worth more than one bad year.
  const durable = seasonKeys(s).filter((y) => s.s[y].gp > 0);
  if (durable.length >= 3) {
    const missed = durable.filter((y) => s.s[y].gp <= 13).length;
    if (missed >= durable.length / 2) { bust += 12;
      reasons.bust.push("missed real time in " + missed + " of " + durable.length + " seasons"); }
  }
  bust = Math.max(0, Math.min(100, bust));

  return { overall: overall, upside: upside, bust: bust, reasons: reasons, stats: s };
}


/* ---- 10b. Draft analysis -------------------------------

   Four components, each computed the same way for every
   team, then min-max scaled across the room so a grade is
   always relative to the people you actually drafted with.

   No black box: every number below is printed on the page.  */

const WEIGHTS = { starters: 0.50, value: 0.25, build: 0.15, byes: 0.10 };

// Long enough for a 14-team room. The first ten are unchanged, so a
// ten-team draft grades exactly as it did before.
//
// A real minus sign (−), not an ASCII hyphen: the grade glyph is
// drawn at 72px under bg-clip-text (DraftInsightsDashboard.jsx), where a
// hyphen — meant for joining words, not standing alone as an operator —
// sits noticeably high and short next to a letter that size. This was
// most visible while font-display was silently falling back to
// system-ui (see tailwind.config.js), but a proper minus reads correctly
// under any face, which a hyphen standing in for one does not.
const GRADE_SCALE = ["A+", "A", "A−", "B+", "B", "B−", "C+", "C", "C−",
                     "D+", "D", "D−", "F+", "F"];

/* How much better than a replacement-level starter this player is, in
   projected points.

   It used to return *places up the positional board* — `replacementRank(pos)
   - player.posRank` — and that is a different quantity in two ways, both of
   which flattered and punished the wrong rosters.

   First, `posRank` is ADP rank. `buildBoard()` sorts the board by `adp` and
   numbers each position off that order, so the old expression asked "how
   early does the market take him within his position", never "how good is he".
   The projection's own within-position rank has existed all along, on every
   player, as `projPosRank`, and the grade never read it. Measured on the
   26 August board: Sam LaPorta is TE12 by ADP and TE5 by projection, so the
   grade credited him 0 for a player it privately rates seven places inside
   the starting cut.

   Second, and worse, places are not points. Replacement rank is
   `teams x slots + 1`, so the *ceiling* on this quantity is set by how deep a
   position is drafted, not by how much a player is worth: measured on the
   same board, QB tops out at 10 places and TE at 11, against 24 for RB and 26
   for WR. Josh Allen at +60.2 projected points over replacement therefore
   scored 10, while Drake London at +18.0 scored 22. Half the grade rated
   London at better than twice Allen, on a board that privately rates Allen at
   over three times London.

   That is the same "a within-position measure cannot answer a between-position
   question" mistake bestLineup() below already records — one level deeper,
   because it is not merely the wrong ordering but the wrong unit. Points are
   the unit the rest of the app already reports to the user: replacementGap()
   on the player sheet, the Juke score, the VORP column. Grading in one
   currency while showing another is why a roster could hold the room's best
   projected starters and read as the room's worst draft.

   Deliberately not replacementGap() itself, which refuses K and DST. That
   refusal is about *ranking* them — see UNRANKED_POSITIONS, where the
   measured correlation between projected and finishing order collapses — and
   the note there already says the grade is untouched by it on purpose,
   because a kicker really did score those points. This is the same
   arithmetic without the ranking refusal, so a kicker still counts here and
   still gets a dash everywhere a rank is claimed.

   A player with no projection scores 0 rather than falling back to his ADP
   rank: "we don't know" may not quietly become "he is worth his draft slot",
   which is the same rule the pipeline already applies to a missing season. */
function aboveReplacement(player) {
  if (!player || player.projPts === null || player.projPts === undefined) return 0;
  return Math.max(0, player.projPts - (REPLACEMENT_PTS[player.pos] || 0));
}

// The best legal starting lineup a roster can field.
/* Who actually starts.

   Sorted by `aboveReplacement`, not by `posRank`, and the difference only
   shows in a slot more than one position can fill — which is to say in the
   slot where it matters. `posRank` is a rank *inside* a position, so using it
   to choose between positions compares numbers drawn on different scales:
   asked to fill a FLEX from TE19, RB25 and WR28 it takes the tight end,
   because 19 is a smaller number than 25.

   Measured on a real roster, that put Juwan Johnson (below a startable tight
   end, and so worth nothing) in the FLEX ahead of David Montgomery, who was
   comfortably inside the running-back cut. Starter strength read off a lineup
   nobody would field, in the component that is half the grade, on a team that
   came last in its room.

   `aboveReplacement` is the currency the rest of the grade already counts in,
   and since it became projected points over replacement it is also the
   currency the player sheet and the Juke score report — so the FLEX is now
   filled by who is actually worth more, not by whose position happens to run
   deeper. Inside a single-position slot the two orderings are near enough
   identical that nothing else moves.

   This is the same mistake the suggestions had, in a different function: a
   within-position measure cannot answer a between-position question. */
function bestLineup(roster) {
  const used = [];
  const slots = lineupSlots();

  return slots.map(function (slot) {
    const eligible = roster.filter(function (p) {
      if (used.indexOf(p) >= 0) return false;
      return fillsSlot(p, slot);
    }).sort(function (a, b) {
      const gap = aboveReplacement(b) - aboveReplacement(a);
      // Ties on the same worth fall back to the board's own order, so the
      // lineup is stable rather than depending on roster order.
      return gap !== 0 ? gap : a.overall - b.overall;
    });

    const pick = eligible[0] || null;
    if (pick) used.push(pick);
    return { slot: slot, player: pick };
  });
}

/* Kickers and defenses sit out of draft value and out of both callouts, and
   the reason is now only the second one below.

   It used to lead with "their draft slot is the rule's, not yours" — true while
   needFromCount() refused a kicker before the last two rounds and a defense
   before the last three, and false since those gates came out. A seat picks its
   own moment for both now, so grading that moment would be grading drafting.
   The exclusion survives the argument that justified it because the other
   argument was always the stronger one:

   Judging them on ADP punishes a league for being shorter than the drafts FFC
   samples from. Their ADP comes from drafts that run more rounds than most
   leagues set up here, so a kicker's board rank routinely lands past the last
   pick that exists: in a measured ten-team, fourteen-round draft every one of
   the ten kickers scored as a reach, averaging 35 picks early, and not a single
   one came out neutral.
   The "biggest reach" callout was therefore a lottery among kickers rather
   than anything about drafting. That measurement is about the board's depth
   against the league's length and has nothing to do with the timing rule, so
   removing the rule does not touch it.

   It is not a thumb on the scale: recomputed across a full room, dropping them
   moved no team more than two places, because every team drafts the same
   forced pair. It removes a constant that was drowning the signal. */
const FORCED_LATE = { K: true, DST: true };
function freelyChosen(p) { return !FORCED_LATE[p.player.pos]; }

/* The same argument as the one above, applied to the thing it is actually
   about.

   The kicker exclusion was justified by board rank landing "past the last pick
   that exists" — but that is a property of the pick, not of the position, and
   it is true of plenty of late-round skill players too. The board is around
   230 deep and a ten-team fourteen-round draft is 140 picks, so anyone taken
   at the end whose rank is past 140 scores as an enormous reach for no reason
   anybody controls: there was never a world in which he went earlier.

   Measured with every seat drafting identically, so any difference between
   seats is the metric rather than the drafting: one seat's round-14 pick was
   board rank 187 at pick 138, a gap of -49, against another seat's rank 125 at
   pick 139 for +14. A 63-point swing on one pick out of twelve counted, decided
   by who happened to be left. Across six rooms that noise spread mean draft
   value from +2.1 to -5.6 between seats; excluding these picks narrows it to
   +2.1 to -2.1, and it drops 33 of 720 picks to do it.

   It does not fix the whole seat bias — see the note on that in the grade
   section — but it removes a component of it that is measuring the board's
   depth rather than anybody's draft. */
function reachableRank(p, lastPick) { return p.player.overall <= lastPick; }

/* The label under the bye bar. It used to name the worst week and stop,
   which was the same blind spot the score had: a lineup with two bad weeks
   read as though it had one. Two are named, and beyond that it says how many
   more there are rather than running a list along the bar. */
function byeSummary(badWeeks) {
  if (!badWeeks || !badWeeks.length) return "no bad weeks";

  const first = `${badWeeks[0].off} starters off in week ${badWeeks[0].week}`;
  if (badWeeks.length === 1) return first;
  if (badWeeks.length === 2) return `${first}, ${badWeeks[1].off} in week ${badWeeks[1].week}`;
  return `${first}, and ${badWeeks.length - 1} more bad weeks`;
}

/* ---- par: what each chair was worth before anybody drafted from it ----

   Starter strength in points exposed something the old rank-places unit was
   too coarse to see: a snake seat is worth a great deal on its own. Measured
   with every seat running the identical CPU rule, so no seat out-drafted any
   other, raw starter strength spanned 191 points — seat 1 fielded 362 and
   seat 5 fielded 171 — and correlated with seat at r -0.6. A grade meant to
   judge drafting was handing out most of a letter for where somebody sat.

   Both halves of that are real, which is why the answer is not to shrink the
   number. An early seat's lineup genuinely is worth ~190 more projected
   points; the grade simply should not credit the manager for it. So starter
   strength is scored against par — what a straight consensus drafter would
   have got from that same chair — exactly the way golf scores a hole or WAR
   scores a player, and the component becomes "how much did you beat your own
   seat by".

   Par is simulated the way generateThirdRoundScenario() and shotPicks()
   already simulate a room: a local `taken`/`have` pair, never board[].drafted
   or state.picks, so this can run during a live draft without touching it.
   `bestAvailable()` is asked for each pick rather than a second opinion of
   what a seat would take.

   Three things about it that matter:

   - **No jitter.** Par has to be a property of the board, not of a draft.
     With the wobble in, the same roster would score differently because a
     reference draft it was never in happened to wobble differently.
   - **It is a table, not a number.** A team three rounds in has three picks,
     and par for three picks is not par for fourteen — comparing a partial
     roster against a finished par is the "a component written for a finished
     roster behaves least like itself mid-draft" trap this file already
     records. `table[slot][k]` is par after that seat's (k+1)th pick.
   - **It is cached on the board, and it has to be.** bestUpgrade() calls
     analyseTeam() once per available player, so an uncached simulation here
     would run a full draft a hundred times for one panel. The key carries
     everything that can move par, BEST_VOR included — that one is the tell
     for a rescoring, since editing the scoring table rewrites every projPts
     and therefore every par. */
/* Keyed by shape, not a single slot. The Locker asks for par for every league
   shape in its window — a 10-team half-PPR mock and a 12-team one are two
   different pars off the same board — so a one-entry cache would thrash
   between them and pay 30ms per entry per render. Bounded because the number
   of distinct shapes a person actually drafts is small; cleared wholesale when
   the board moves, which is what BEST_VOR in the key detects. */
const PAR_CACHE = new Map();

function parKey(lg) {
  const L = lg || league;
  return [board.length, L.teams, L.rounds, L.scoring, L.flex,
          L.superflex, POSITIONS.map((p) => L.starters[p]).join(","),
          Math.round((BEST_VOR || 0) * 100)].join("|");
}

/* Par is an average over wobbles, not one draft.

   The first version ran a single unwobbled draft and used it as the
   expectation, and a single draft is not an expectation — it is one sample
   with its own luck in it. Measured: run par under twelve different wobbles
   and a chair's own par moves with a standard deviation of **18.9 points**,
   the same magnitude as the wobble noise the grade is trying to see through.
   Freezing one of those samples bakes that chair's luck in permanently, so it
   shows up as a fixed per-chair bias in every draft ever graded against it.

   It was visible and was misread first as "chair-specific board interaction".
   The single unwobbled realization sat −4, −37, +30, +19, +23, −28, −12, +24,
   −18, −5 away from the twelve-wobble mean, and the residual `startersVsPar`
   by chair came out +4, +40, −39, −9, −23, +32, +7, −31, +26, +7 — the same
   numbers with the sign flipped, chair for chair. The residue was not a fact
   about the chairs at all. It was the error in par.

   `PAR_SEEDS` is fixed and hard-coded rather than drawn from `state.seed`, for
   the reason par exists: it has to be a property of the board, identical for
   every client in a room and for the same board tomorrow.

   **Twelve was derived against a wobble that has since changed, so it is
   re-derived here rather than left standing.** Under the old flat +/-3 a
   chair's par moved with a standard deviation of 18.9 points, giving a standard
   error of 18.9/sqrt(12) = 5.5. Scaling the wobble by each player's real ADP
   standard deviation roughly doubled the average board offset, and measured 30
   August 2026 the per-chair par sd is now **28.4** — so the standard error at
   twelve is **8.2 points**, still comfortably inside `MIN_SPAN.startersVsPar`
   (20) but on a narrower margin than before. Twenty-four would buy 5.8 for
   twice the work, and the whole table costs 42ms cold and nothing warm, so the
   trade is the same one it always was and lands the same way. Re-measure this
   if the wobble is scaled again — the conclusion held, the arithmetic behind it
   did not. */
const PAR_SEEDS = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31];

/* One full simulated draft under one wobble. Returns, per seat, two running
   tables: the lineup strength after each of that seat's picks, and the draft
   value it had accrued by then. Both are tables rather than totals because par
   after three picks is not par after fourteen.

   **The value side applies `freelyChosen()` and `reachableRank()` by calling
   them**, on a pick-shaped object, rather than repeating what they test.
   analyseTeam() filters the real picks through exactly those two before
   summing value, so a par that counted a different set of picks would not be
   comparable to it — and the two drifting apart is the sort of thing that
   reads as a working grade for months. */
/* `lg` is an explicit shape; `strength` is only computed for the live league.

   The value table needs nothing but the board, the snake and the roster rules,
   so it is computable for any shape. The strength table is not: it runs
   through bestLineup() and aboveReplacement(), which read lineupSlots() and
   REPLACEMENT_PTS — and REPLACEMENT_PTS is a module-level table
   buildProjections() derives from the *live* league's replacement ranks.
   Computing it for a foreign shape would mean rebuilding that table, which is
   the board-wide recompute this whole function exists to avoid triggering
   while a draft is on screen.

   So a foreign shape gets `strength: null` rather than a table of numbers
   quietly derived from the wrong league. seatPar() returns null for it too,
   which is a guard rather than a behaviour: the only caller that passes a
   foreign shape (the Locker's net ADP chart) asks for value and never
   strength. */
function parRun(seed, lg) {
  const jitterOf = function (p) { return jitterFor(p, seed); };
  const L = lg || league;
  const liveShape = !lg || lg === league;
  const teams = L.teams;
  const taken = {}, have = [], rosters = [], strength = [], value = [];
  for (let s = 0; s < teams; s++) {
    have.push({}); rosters.push([]); strength.push([]); value.push([]);
  }

  const total = teams * L.rounds;
  const lastPick = total;
  const running = new Array(teams).fill(0);

  for (let n = 1; n <= total; n++) {
    const c = DraftEngine.pickInfo(n, L);
    const pool = board.filter((p) => !taken[p.name] && !isRuledOut(p));
    if (!pool.length) break;
    const best = bestAvailable(pool, have, c.slot, c.round,
      { jitterOf: jitterOf, seed: seed, model: false, league: L });
    if (!best) break;

    taken[best.name] = true;
    have[c.slot][best.pos] = (have[c.slot][best.pos] || 0) + 1;
    rosters[c.slot].push(best);
    if (liveShape) strength[c.slot].push(lineupStrength(rosters[c.slot]));

    const pick = { player: best, overall: n, slot: c.slot, round: c.round };
    if (freelyChosen(pick) && reachableRank(pick, lastPick)) {
      running[c.slot] += n - best.overall;
    }
    value[c.slot].push(running[c.slot]);
  }
  return { strength: liveShape ? strength : null, value: value };
}

function seatParTable(lg) {
  // Same guard every other DraftEngine caller carries. A bridge entry is only
  // as safe as its own guard: analyseTeam() is reached from React on mount,
  // and draft-engine.js is deferred.
  if (typeof DraftEngine === "undefined" || !board.length) return null;

  const L = lg || league;
  if (!L || !L.teams || !L.rounds || !L.starters) return null;

  const key = parKey(L);
  if (PAR_CACHE.has(key)) return PAR_CACHE.get(key);

  const runs = PAR_SEEDS.map(function (seed) { return parRun(seed, L); });

  /* Averaged pick by pick. The runs can differ in length — a pool that runs
     dry stops that run early — so each cell is divided by how many runs
     actually reached it rather than by PAR_SEEDS.length, which would quietly
     drag the tail of the table toward zero and make the closing rounds look
     like a bargain against par. */
  function averaged(which) {
    if (!runs[0] || !runs[0][which]) return null;
    const table = [];
    for (let s = 0; s < L.teams; s++) {
      const rows = runs.map((r) => (r[which][s] || []));
      const row = [], longest = Math.max.apply(null, rows.map((r) => r.length));
      for (let k = 0; k < longest; k++) {
        let sum = 0, seen = 0;
        rows.forEach(function (r) {
          if (typeof r[k] === "number") { sum += r[k]; seen++; }
        });
        row.push(seen ? sum / seen : 0);
      }
      table.push(row);
    }
    return table;
  }

  const table = { strength: averaged("strength"), value: averaged("value") };
  PAR_CACHE.set(key, table);
  return table;
}

/* The caption under the starter-strength bar, in one place because both the
   legacy panel and AnalysisTab.jsx draw it and a bar whose caption describes a
   different quantity from the bar is this file's own "right value, wrong
   column" bug. It reports the number the grade scores — points against par —
   with the raw total kept alongside, since that is the figure the VORP matrix
   adds up to. */
function parText(t) {
  const raw = Math.round(t.starters) + " pts above replacement";
  if (!t.par) return raw;
  const d = Math.round(t.startersVsPar);
  return `${d >= 0 ? "+" : "−"}${Math.abs(d)} vs par for this seat · ${raw}`;
}

/* The same, for draft value, and it exists for the same reason: the bar is
   scored against par for the chair and the raw figure is what the timeline
   panel's own bars add up to, so one caption has to carry both or the two
   screens disagree about what "draft value" is. */
/* The caption under the roster-construction bar. The headline is now the raw
   score itself, so "76 / 100" underneath it was the same number twice; this
   says what actually cost the points instead. Named in the engine, beside the
   arithmetic that assigns them, for the same reason parText() is: a component
   that composes its own explanation drifts from the number it explains. */
function buildText(t) {
  if (!t.lineup) return t.build + " / 100";
  const gaps = [];
  const holes = t.lineup.filter((s) => !s.player).length;
  if (holes) gaps.push(holes + (holes === 1 ? " empty starting slot" : " empty starting slots"));
  // Every position, not a list of the three that can overflow: startableCap()
  // is Infinity everywhere else, so `over` is zero there and the three name
  // themselves. Same rule the charge below it reads.
  POSITIONS.forEach(function (pos) {
    const over = Math.max(0, countAt(t.slot, pos) - startableCap(pos));
    if (over) gaps.push(over + " spare " + posLabel(pos));
  });
  /* Cover is graded rather than a cliff — the penalty scales with how far past
     replacement the best benched player is — so this has to name a partial
     charge too. Naming only total absence produced "nothing missing" on a
     roster scoring 86, which is the caption disagreeing with its own headline
     by fourteen points. */
  const benched = t.roster.filter((p) => !t.lineup.some((s) => s.player === p));
  ["RB", "WR"].forEach(function (pos) {
    if (!league.starters[pos]) return;
    const rankOf = (p) => p.projPosRank || Infinity;
    const best = benched.filter((p) => p.pos === pos)
      .sort((a, b) => rankOf(a) - rankOf(b))[0];
    const past = best ? rankOf(best) - replacementRank(pos) : 15;
    if (past >= 15) gaps.push("no " + pos + " cover");
    else if (past > 0) gaps.push("thin " + pos + " cover");
  });
  return gaps.length ? gaps.join(" · ") : "nothing missing";
}

function parValueText(t) {
  // One minus glyph in one string. Number#toString gives an ASCII hyphen and
  // the vs-par half is built with a real minus (U+2212, the same one
  // GRADE_SCALE uses and for the same reason), so composing them naively read
  // "−10 vs par for this seat · -35 picks" — two different characters for one
  // idea, side by side.
  const signed = (n) => (n >= 0 ? "+" : "−") + Math.abs(Math.round(n));
  const raw = signed(t.value) + " picks, K and D/ST aside";
  if (!t.parValue) return raw;
  return `${signed(t.valueVsPar)} vs par for this seat · ${raw}`;
}

// Par for this seat at this many picks, or 0 when the engine has not landed
// yet — an unscored seat is the same for everybody, so it cannot bias a room.
function seatPar(slot, picksMade, which, lg) {
  if (picksMade <= 0) return 0;
  const table = seatParTable(lg);
  const wanted = which || "strength";
  if (!table) return 0;
  /* null, not 0, when the table genuinely has nothing to say — a foreign
     shape has no strength side (see parRun). Zero would read as "par is
     zero here" and quietly turn a vsPar figure back into a raw one. */
  if (!table[wanted]) return null;
  const row = table[wanted][slot];
  if (!row || !row.length) return 0;
  return row[Math.min(picksMade, row.length) - 1];
}

function analyseTeam(slot, extra) {
  // extra: an optional hypothetical additional player, for simulating "what
  // would this component become if I drafted him" (see bestUpgrade() below)
  // without a second copy of this function's own logic. Every real caller
  // passes nothing, so roster is exactly rosterOf(slot), unchanged.
  const roster = extra ? rosterOf(slot).concat([extra]) : rosterOf(slot);
  const picks  = state.picks.filter((p) => p.slot === slot);
  /* Both filters, and they feed the value sum and both callouts alike — a
     pick that cannot meaningfully be reached for cannot be the biggest reach
     either, which is the same lottery the kicker exclusion was written to
     stop. */
  const lastPick = league.teams * league.rounds;
  const judged = picks.filter((p) => freelyChosen(p) && reachableRank(p, lastPick));
  const lineup = bestLineup(roster);

  /* 1. starter strength, and the same figure against par for this chair.

     `starters` stays the raw sum, because that is what the Insights VORP
     matrix prints per player and a reader has to be able to add that panel up.
     `startersVsPar` is what the grade actually scores — see seatParTable()
     for why the raw number is most of a letter's worth of draft position. */
  let starters = 0;
  lineup.forEach(function (s) { if (s.player) starters += aboveReplacement(s.player); });
  /* extra is a hypothetical additional pick, so it costs a pick of par too —
     for starter strength, which counts him, and deliberately *not* for value,
     which does not. `judged` is built from state.picks and never sees him, so
     advancing value's par by a pick he did not contribute to would charge a
     simulated bargain against a roster that never took one. Nothing reads
     valueVsPar for a hypothetical today (bestUpgrade only simulates starters
     and build), which is exactly why it would go unnoticed. */
  const par = seatPar(slot, picks.length + (extra ? 1 : 0));
  const parValue = seatPar(slot, picks.length, "value");

  /* 2. draft value: taken later than the board said = a bargain.

     The subtraction is pick number minus board rank, and it has to be that
     way round. `p.overall` is where the pick happened, `p.player.overall` is
     where the board had him, so a player still there at 121 whom the board
     ranked 106 gives +15: he fell fifteen picks and that is the bargain the
     comment describes. Reversed, as this was, every bargain scored negative
     and every reach scored positive — a quarter of the grade rewarding
     exactly what it was written to punish. */
  let value = 0;
  judged.forEach(function (p) { value += (p.overall - p.player.overall); });

  /* 3. roster construction.

     Three ways a roster can be badly built: a starting slot you cannot fill,
     a spot spent on somebody you can never start, and no cover behind the
     positions you start most of.

     The third one used to be a threshold — "fewer than starters + FLEX + 1"
     — and it never once fired, because it sits exactly where the CPU's own
     depth allowance lands every team. Measured across a full room: all ten
     teams held four running backs, one quarterback, one kicker, one defense,
     and every one of them scored a flat 100. Fifteen per cent of the grade
     was a constant, which is the same as not being in the grade at all.

     So cover is graded rather than a cliff, and it asks the question a
     manager actually has: if a starter goes down, how far from startable is
     the next man up? That is the best benched player at the position,
     measured in places past replacement — nought if he could start today,
     the full penalty if there is nobody there at all. Across the same room
     it separated ten teams into nine distinct scores. */
  const COVER_NONE = 15;   // places past replacement at which cover is no cover
  const COVER_COST = 12;   // most that one uncovered position can cost

  let build = 100;
  lineup.forEach(function (s) { if (!s.player) build -= 14; });          // hole in the lineup
  POSITIONS.forEach(function (pos) {
    /* A second kicker is wasted; a second quarterback is only wasted in a
       league that starts one. That was always the intent and the sum did not
       carry it: `league.starters.QB` is 1 in a superflex league too, since
       the extra seat is a SFLEX rather than a second QB slot. So every team
       in a superflex room was docked nine for the quarterback the format
       obliges them to hold — and worse than a flat charge, dropping him
       *improved* the score. Tested on a built roster: taking the second
       quarterback out and putting a spare receiver there cost five points of
       starter strength and gained seven of construction.

       That expression lived here, in buildText() and in needFromCount() at
       once — the same league rule written down three times, which is how it
       drifted in the first place. startableCap() is the one copy now, and it
       answers Infinity for RB, WR and TE, so this walks every position rather
       than carrying its own list of which three can overflow. */
    const extraCount = extra && extra.pos === pos ? 1 : 0;
    build -= Math.max(0, countAt(slot, pos) + extraCount - startableCap(pos)) * 9;
  });

  const benched = roster.filter(function (p) {
    return !lineup.some(function (s) { return s.player === p; });
  });
  ["RB", "WR"].forEach(function (pos) {
    if (!league.starters[pos]) return;      // a league that starts none needs none
    /* Ranked by projection, not by ADP, for the same reason aboveReplacement()
       is: `posRank` is where the market takes him and `projPosRank` is what we
       think he is worth, and this asks the second question. A bench receiver
       the room drafts late and the projection likes is exactly the cover a
       manager wants and the ADP ordering could not see. Players with no
       projection sort last rather than being read at their draft slot. */
    const rankOf = (p) => p.projPosRank || Infinity;
    const best = benched
      .filter(function (p) { return p.pos === pos; })
      .sort(function (a, b) { return rankOf(a) - rankOf(b); })[0];
    // Nobody behind them is the same as cover that could never play.
    const past = best ? rankOf(best) - replacementRank(pos) : COVER_NONE;
    build -= COVER_COST * Math.min(1, Math.max(0, past) / COVER_NONE);
  });
  /* Floored, because it is printed as "x / 100" and a negative score out of
     a hundred reads as a broken number rather than a bad roster. Three rounds
     in, with six lineup slots still empty, it was showing "-8 / 100".

     Nothing is lost by it. Measured across a draft at every twenty picks, the
     only negatives are in the opening rounds, and there the score separates
     teams by whether their third pick has come round yet — snake position,
     not construction. From round four on it never goes near zero, and
     clamping changes the number of distinct scores in the room at no stage of
     the draft. A team that ends with seven starting slots unfilled floors at
     zero, which is the right end of the scale for it anyway. */
  build = Math.max(0, Math.round(build));

  /* 4. bye week exposure, judged on the starting lineup only, because a
     bench player on a bye costs nothing.

     Every bad week counts, not just the worst one. It used to read the worst
     week and stop, so a lineup with three starters out in week 6 *and* three
     more out in week 8 scored exactly the same as one with a single bad week
     — the second was invisible. Measured across a room that left the whole
     component with three distinct values among ten teams.

     Squared, because the weeks are not interchangeable. Four starters out at
     once is a week you probably lose; three out twice is two weeks you can
     patch from the bench. So a week costs the square of how many are missing
     beyond the second, and a fourth man out costs four times what a third
     does rather than twice. */
  const byes = {};
  lineup.forEach(function (s) { if (s.player) byes[s.player.bye] = (byes[s.player.bye] || 0) + 1; });

  const badWeeks = Object.keys(byes)
    .map(function (week) { return { week: Number(week), off: byes[week] }; })
    .filter(function (w) { return w.off > 2; })
    .sort(function (a, b) { return b.off - a.off || a.week - b.week; });

  let byeCost = 0;
  badWeeks.forEach(function (w) { byeCost += Math.pow(w.off - 2, 2); });

  // Kept for the label, which names the week somebody actually has to survive.
  const worstBye  = badWeeks.length ? badWeeks[0].off  : 0;
  const worstWeek = badWeeks.length ? badWeeks[0].week : null;

  /* Biggest bargain and biggest reach, on the same signed gap as above:
     positive means he was still there long after the board said he would be
     gone, negative means you went and got him early. The two callouts that
     print these already say "picks late" for a positive gap and "picks
     early" for a negative one, so they have been describing this convention
     correctly the whole time the arithmetic was inverted underneath them. */
  let bargain = null, reach = null;
  judged.forEach(function (p) {
    const gap = p.overall - p.player.overall;
    if (!bargain || gap > bargain.gap) bargain = { pick: p, gap: gap };
    if (!reach   || gap < reach.gap)   reach   = { pick: p, gap: gap };
  });
  /* A reach is a pick you went and got early. If the worst gap on the board
     is zero or better then nothing was reached for, and naming the least
     positive pick "biggest reach" reads as an accusation about a pick that
     landed exactly where the board wanted it. Mid-draft, with three or four
     picks all near their rank, that was the usual outcome. */
  if (reach && reach.gap >= 0) reach = null;

  return { slot: slot, roster: roster, lineup: lineup, byes: byes,
           starters: starters, par: par, startersVsPar: starters - par,
           value: value, parValue: parValue, valueVsPar: value - parValue,
           build: build,
           byePenalty: -byeCost * 20,
           worstBye: worstBye, worstWeek: worstWeek, badWeeks: badWeeks,
           bargain: bargain, reach: reach };
}

// Scale a raw component onto 0-100 relative to the rest of the room.
/* The smallest room-wide spread a component may be stretched across.

   This file already records that a span of zero hands everyone 50, so a
   constant contributes a constant. The near-zero case is the same failure one
   step along and is worse, because it does not go flat — it goes maximally
   confident on noise. With ten rosters inside an 11-point band the lowest is
   scaled to 0 and the highest to 100, and an A+ against an F is manufactured
   out of a difference nothing can measure.

   That is not hypothetical. Measured with all ten seats running identical
   logic, so every roster is as good as every other: raw starter strength came
   out 82 to 90, all nine starting slots filled on every team, and the grade
   turned that into finishing ranks from 1.6 to 9.8 — stable by seat across
   every room, because deterministic drafting puts the same seats on the same
   side of a hair's-breadth gap every time.

   The floors are the two components whose real spread sits inside the
   measurement error. Across twelve rooms at 10 and 12 teams:

       starters   span  9 - 16   (median 11)   weight 50%
       value      span 50 - 89   (median 76)   weight 25%
       build      span 11 - 21   (median 12)   weight 15%
       byes       span 80 - 100  (median 80)   weight 10%

   starters is a sum of aboveReplacement() over nine players and the projection
   runs at MAE 6.8 a player, so a lineup total carries roughly 6.8 x sqrt(9) =
   20 points of error. Every observed span is inside that. 20 is therefore the
   projection's own resolution, not a taste: the same reasoning MISS_FLOOR = 10
   already uses to refuse to call a single-digit ADP delta a reach.

   build gets the same 20, and its justification is weaker and should be said
   so: it is derived from replacement-relative rank distances, so it inherits
   the same projection error, and its observed spans sit in the same band as
   starters'. It is calibrated from that distribution rather than from an
   independent error model. If build ever gets one, this is the number to
   revisit.

   value and byes are unfloored because they do not need it — their spans are
   four to eight times these, which is real signal about real differences.

   What this does not change: the ordering. The transform is monotonic, so
   somebody still finishes first and the standings still rank the room. What
   stops is manufacturing an elite grade out of a one-point edge — a close room
   now reads as a close room. */
/* Every component gets a floor, in its own units, or the printed weights are
   not the weights that run.

   Only starters and build had one, and the two that did not are the two with
   the widest natural spread — so `value` and `byes` were stretched across the
   full 0-100 on every draft while `starters` was compressed into whatever
   fraction of it a floored denominator allowed. Measured across two rooms
   before this change, the share of the finishing order each component
   actually explained came out:

       starters   ~35%   against a stated 50%
       value      ~36%   against a stated 25%
       build      ~13%   against a stated 15%
       byes       ~15%   against a stated 10%

   Draft value decided the grade more than starter strength did, in a grade
   that says on its own face that starters are worth double. A floor on one
   component is not a local adjustment: it silently reweights every other one,
   because scaling is what converts a raw spread into the 0-100 the weights
   are then applied to.

   Each number below is that component's own resolution, not a taste:

   - starters: the projection runs at MAE 6.8 a player, so a nine-man lineup
     total carries 6.8 x sqrt(9) = 20 points of error. This is the same
     arithmetic the old comment gave — it was simply being applied to a count
     of ADP rank places, which is not measured in points and never was. Now
     that aboveReplacement() returns points, 20 is a floor in the unit it was
     derived for. It rarely binds: a real room spans 150-odd points.
   - value: MISS_FLOOR already refuses to call a single-digit ADP delta a
     reach, and a team's value is the sum over the dozen-odd picks it was free
     to time, so 10 x sqrt(12) = 35.
   - byes: byePenalty is -20 per squared starter beyond the second, so 20 is
     one starter, in one week — the smallest difference the component can
     express. Below that two rosters are the same roster.
   - build: unchanged, and its justification is still the weaker one. It is
     derived from replacement-relative rank distances rather than from an
     independent error model, and it is calibrated from observed spans. If
     build ever gets a real error model, this is the number to revisit. */
/* No `build` key any more: it is not scaled at all (see analyseDraft), so a
   floor for it would be a number nothing reads. Its old entry was already the
   weakest-justified of the four by this file's own admission — calibrated from
   observed spans rather than an error model — and it was the mechanism behind
   the roster-construction 0. */
const MIN_SPAN = { startersVsPar: 20, valueVsPar: 35, byePenalty: 20 };

function scaleAcross(all, key) {
  const values = all.map((t) => t[key]);
  const low = Math.min.apply(null, values);
  const high = Math.max.apply(null, values);
  const span = high - low;
  /* Centred on the room's midpoint rather than anchored at its low, which is
     what lets a floor apply at all: with the old (v - low) / span the lowest
     team is 0 by construction however close the room is. Where the real span
     already clears the floor this is arithmetically identical to what it
     replaced — low maps to 0, high to 100 — so an ordinary room is untouched. */
  const denom = Math.max(span, MIN_SPAN[key] || 0);
  const mid = (low + high) / 2;
  all.forEach(function (t) {
    t[key + "Scaled"] = denom === 0
      ? 50
      : Math.max(0, Math.min(100, 50 + ((t[key] - mid) / denom) * 100));
  });
}

function analyseDraft() {
  const all = [];
  for (let i = 0; i < league.teams; i++) all.push(analyseTeam(i));

  /* startersVsPar, not starters — the seat is priced out before the room is
     ranked. `startersScaled` is then aliased to it rather than computed
     separately, because every consumer (the share card, both dashboards, the
     specs' own reconciliation) reads that name and there must not be two
     scaled starter figures on one object for somebody to pick the wrong one
     out of. The raw `starters` and `par` are both still on there for anything
     that wants to show the working. */
  /* build is deliberately not scaled, and it is the one component that never
     should have been.

     The other three are in their own units — points over par, picks over par,
     squared starters off in a week — so they have to be projected onto the
     0-100 the weights are applied to. `build` is already that: it starts at
     100 and subtracts named penalties, so it is an absolute score, comparable
     across rooms, before scaleAcross() ever sees it. Putting it through a
     second transform is what produced the number the owner reported.

     What that second transform did, measured over ten rooms with one
     realistically imperfect human in each: the human read **0 on eight of
     ten**, with raw builds of 44, 47, 54, 60, 67, 73, 76 and 79. A roster
     worth 79 and one worth 44 printed the same 0. That is not a harsh number,
     it is an empty one — scaleAcross() is min-max, the nine CPU seats build to
     one rule and cluster at the top, so the human is the minimum almost every
     time and the minimum is 0 by construction. Reported as "roster
     construction 0 on a mock I got a B and finished 5th in", which reproduces
     exactly: raw 79, scaled 0, grade B, 5th of 10.

     The cost is real and is not hidden: build's share of the finishing order
     falls from 13.8% to 5.1%, against a stated 15%. That is the honest
     consequence of a component that genuinely varies less than the scaling
     was making it appear to, and it is the trade this file's own rule asks
     for — a number nobody can act on is worth less than a number that moves
     the grade. Whether 15% is still the right weight for it is a separate
     question and has not been answered here. */
  ["startersVsPar", "valueVsPar", "byePenalty"].forEach((k) => scaleAcross(all, k));
  all.forEach(function (t) {
    t.startersScaled = t.startersVsParScaled;
    t.valueScaled    = t.valueVsParScaled;
    /* Aliased rather than left absent, because every consumer reads this name
       — the bars, the weighted-sum line that has to reconcile against them,
       the share card, the specs. One name, one number, and the panel adds up. */
    t.buildScaled    = t.build;
  });

  all.forEach(function (t) {
    t.total = t.startersScaled  * WEIGHTS.starters
            + t.valueScaled     * WEIGHTS.value
            + t.buildScaled     * WEIGHTS.build
            + t.byePenaltyScaled * WEIGHTS.byes;
  });

  const sorted = all.slice().sort((a, b) => b.total - a.total);
  sorted.forEach(function (t, i) {
    /* A tie shares a rank and a letter, rather than breaking on whichever
       way .sort() happened to leave them ordered. Compared as the rounded
       number the standings table and the share card actually show
       (Math.round(t.total)) — the same figure a reader would use to
       notice the tie in the first place, so grading has to agree with
       what a rounded tie looks like on screen. Two teams could share a
       rank and disagree past it only by an unrounded fraction nothing on
       screen ever reveals, which is not a real distinction to grade on.

       rank does not just increment past a tie (1, 2, 2, 4 — never
       1, 2, 2, 3): the team one place behind two tied ones really is
       fourth, the same convention any league table already uses, and
       it is what keeps GRADE_SCALE's own index meaningful — the letter
       at index 3 has to mean "fourth", tie or not. */
    t.rank = (i > 0 && Math.round(t.total) === Math.round(sorted[i - 1].total))
      ? sorted[i - 1].rank
      : i + 1;
    /* Clamped, because the scale is fourteen long and TEAM_COUNTS goes to
       twenty-four. A sixteen-team room put the word "undefined" in the
       standings against fifteenth and sixteenth, on screen, for anyone who
       set one up. Everything at fourteen teams or fewer is unchanged; past
       that the bottom of the room shares an F, which is honest — they are
       all last in a room bigger than the scale was drawn for. */
    t.grade = GRADE_SCALE[Math.min(t.rank - 1, GRADE_SCALE.length - 1)];
  });

  return all;
}

/* The single available player who would move one grade component the most,
   and what the component becomes if he is drafted — simulated by literally
   adding him to the roster and re-running the exact analyseTeam()/
   scaleAcross() pipeline the real grade uses, never a second formula for
   "how much would this help."

   Only starters and build get a simulation. Draft value is a function of
   the price paid for a pick that has not happened yet, and bye-week safety
   only ever worsens or holds from a single addition — it cannot repair a
   clash between starters already on the roster — so neither has an honest
   "draft this player, get this score" story to tell. Asked for either, this
   returns null and the caller shows the diagnosis without inventing a fix.

   The caller already holds the real "before" (analyseDraft()'s own scaled
   value for this component), so this returns only the winner and the score
   he produces — not a second copy of the same "before" figure. */
function bestUpgrade(slot, componentKey) {
  if (componentKey !== "starters" && componentKey !== "build") return null;
  /* The caller names the component the way the panel labels it, and starter
     strength is scored against par rather than raw — so the simulation has to
     scale the same quantity analyseDraft() scales, or "draft this player, get
     this score" would quote a number the grade never uses. Adding a player
     costs a pick of par, which analyseTeam() already charges via `extra`. */
  const rawKey = componentKey === "starters" ? "startersVsPar" : componentKey;
  const scaledKey = rawKey + "Scaled";

  const baseline = [];
  for (let i = 0; i < league.teams; i++) baseline.push(analyseTeam(i));

  /* K and DST used to be excluded outright, because an empty mandatory slot
     costs 14 points of roster construction and any rostered kicker fills it —
     so without a guard this simulation recommends one in round 2. The round
     gate was doing the containing, and the blanket exclusion was the cheap way
     to say so.

     With the gate gone the containment comes from the same place every other
     timing decision now does: kdInPlay() asks whether a CPU in this chair would
     currently be choosing one, which is the price of a defense against the best
     skill player left rather than a round written down. So the panel offers a
     defense at the point the room starts taking them, and not before. */
  const round = onClockRound() || league.rounds;
  const kdOffered = kdInPlay(slot, round);
  const pool = board.filter((p) =>
    !p.drafted && !isRuledOut(p) && (kdOffered || !FORCED_LATE[p.pos]));
  let best = null;
  pool.forEach(function (candidate) {
    const withHim = analyseTeam(slot, candidate);
    const trial = baseline.map((t, i) => (i === slot ? withHim : t));
    scaleAcross(trial, rawKey);
    const after = trial[slot][scaledKey];
    if (!best || after > best.after) best = { player: candidate, after: after };
  });

  if (!best) return null;
  return { player: best.player, after: Math.round(best.after) };
}

/* The one that got away: at each of this team's turns, the player somebody
   else took before their next turn who would have improved this roster most.

   The measure is what he would have done to *this lineup*, not what he is
   worth in the abstract. It lived in DraftInsightsDashboard.jsx and compared
   two bare replacementGap() figures — his against the pick actually made —
   which is a fact about the player pool with no reference to the roster it is
   being recommended to.

   That reads as nonsense the moment a manager has a position covered. Reported
   from a real draft: a team holding two elite tight ends was told it had missed
   Sam LaPorta. The arithmetic was right and the advice was absurd — a third
   tight end cannot start, so his points over replacement were never available
   to that roster at any price. Naming him is the same failure as naming a
   kicker the biggest reach: a correct number that no reader can arrive at the
   right conclusion from.

   So the delta is a substitution run through bestLineup(): the roster as
   drafted, against the roster with his pick swapped for theirs. A player who
   would not crack the lineup scores 0 and cannot be named, however gaudy his
   projection, and one who displaces a starter scores exactly what he adds.
   That also makes the panel's own number honest — "points forgone" is now
   points this team would actually have started.

   It reuses aboveReplacement() and bestLineup() rather than restating either,
   which is the same reason bestUpgrade() simulates through analyseTeam()
   instead of carrying its own formula for "how much would this help".

   MISS_FLOOR lives in the component and still gates the result there: both
   sides of this subtraction are projected points, the unit that floor was
   always written in. */
function lineupStrength(roster) {
  let total = 0;
  bestLineup(roster).forEach(function (s) { if (s.player) total += aboveReplacement(s.player); });
  return total;
}

function oneThatGotAway(slot) {
  if (!state.started) return null;

  const mine = state.picks.filter((p) => p.slot === slot)
    .slice().sort((a, b) => a.overall - b.overall);
  if (mine.length < 2) return null;

  const roster = rosterOf(slot);
  const base = lineupStrength(roster);
  let best = null;

  mine.forEach(function (teamPick, i) {
    const next = mine[i + 1];
    if (!next) return;                    // the last pick has no window after it
    state.picks.forEach(function (p) {
      if (p.slot === slot) return;
      if (p.overall <= teamPick.overall || p.overall >= next.overall) return;
      /* Swap, not add. He would have cost this pick, so a roster carrying
         both of them is a team that never existed — and adding rather than
         substituting is what would let a third tight end look like a gain
         by quietly occupying a bench spot nobody was choosing between. */
      const swapped = roster.filter((r) => r !== teamPick.player).concat([p.player]);
      const delta = lineupStrength(swapped) - base;
      if (delta > (best ? best.delta : 0)) best = { theirs: p, mine: teamPick, delta: delta };
    });
  });

  return best;
}

/* ---- Take a pick: homepage v4 pass 2's three real, seeded scenarios ---

   "Three third-round decisions, playing out. Nothing here is a marketing
   screenshot" is the whole promise of this section, so every player, every
   opponent pick and every grade below has to come from an actual simulated
   draft — not three hand-picked names. shotPicks() already proves the
   pattern this needs: simulate picks locally (a `taken` map and a `have`
   count, never board[].drafted or state.picks) so the hero product shot
   can run on every homepage load without touching the real, shared draft
   state a visitor might resume seconds later. This reuses that same
   scoring, not a second opinion of what a CPU seat would take.

   Grading is different. analyseTeam()/analyseDraft() are not pure — they
   read state.picks and league directly — and reimplementing the 50/25/15/10
   grade a second time for this section is exactly the "nothing about the
   league shape may be written down twice" mistake this file's own history
   warns about (the superflex bug was precisely that, in the CPU). So
   gradeAndRosterAt() below does the opposite of shotPicks(): it swaps the
   real state.picks and the real players' .drafted flags to the simulated
   picture, calls the real analyseDraft(), reads the result into plain
   numbers, and restores both in a `finally` — synchronously, no `await` and
   no timer in between.

   "No timer in between" turned out not to be enough on its own. This still
   ran interleaved with a real, concurrent draft: DraftRoom.jsx mounts into
   its own #draftroom-root, entirely separate from Homepage's #root, and
   neither one ever unmounts the other on a route change — Homepage stays
   mounted (just hidden) under #/draft-room, timers and event listeners
   included. TakeAPick.jsx's own read() listens for "juke:header", which
   headerInfo() dispatches on every tick and every pick of a real draft, so
   a live draft was calling into this function once a second on the CPU
   clock alone — and the restore step forced every touched player back to
   `false` unconditionally, which is only correct if none of them could
   possibly be drafted for a *different*, real reason. Once a real draft was
   running underneath, that assumption broke: `board[].drafted` is one
   shared flag, not one per caller, and this function was resetting the
   real board's own answer moments after a genuine pick had set it — read
   next by cpuChoice(), which offered the same "available" player forever,
   rejected every time by name, silently, because cpuStep() never checked
   makePick()'s return. Each gradeAndRosterAt() call now saves what every
   touched player's own `.drafted` actually was before it touched him, and
   restores exactly that — not a blanket `false` — which is what "safe here
   and nowhere else" was always supposed to mean. */

// The exact scoring shotPicks() uses for its own simulated draft, factored
// out so both can call it rather than one drifting from the other.
/* `opts` is opt-out for one caller: seatParTable(), which turns both of these
   off to get the plain consensus drafter.

   `wobble:false` because par has to be a property of the board rather than of
   a particular draft — the jitter is deterministic and shared across a room,
   so leaving it in would still agree between clients, it would just mean the
   same roster grading differently because of a wobble in a reference draft it
   was never part of.

   `model:false` because the model multiplier is *Juke's own opinion*, and par
   is supposed to be the market's. Leaving it in made par a better drafter than
   anybody in the room actually is — `cpuChoice()` has never applied it — so
   par was benchmarking every seat against an advised draft rather than a
   consensus one, and it did that unevenly by seat. Measured over ten seeds
   before the change, mean `startersVsPar` ran +80 at seat 1 and −83 at seat 5:
   a 163-point systematic residue in the very component that exists to remove
   seat bias.

   Everyone else keeps both. shotPicks() in particular wants the model on
   deliberately — see CLAUDE.md on why the hero shot is not an ADP slice. */
function bestAvailable(pool, have, slot, round, opts) {
  /* `jitterOf` lets seatParTable() run this under a wobble that is not the
     live draft's, without writing to `board[].jitter` — which is shared state
     that a real draft is reading from at the same time. Saving and restoring
     it around the loop would work and is the trap gradeAndRosterAt() already
     documents: one shared flag, several callers, and a restore that is only
     correct if nothing else touched it in between. Passing the function is
     simply not that shape. */
  const jitterOf = opts && typeof opts.jitterOf === "function" ? opts.jitterOf
    : (opts && opts.wobble === false) ? function () { return 0; }
    : function (p) { return p.jitter; };
  const modelMultiplier = (!opts || opts.model !== false)
    ? modelMultipliers(pool)
    : null;
  /* `opts.seed` goes with `opts.jitterOf` and for the identical reason: par's
     runs are under PAR_SEEDS, not state.seed, and a seat's K/DST appetite is
     drawn from a seed the same way its wobble is. Left off, an appetite read
     off the global would make par vary with tonight's draft while PAR_CACHE's
     key says it does not. */
  const ctxSeed = opts && typeof opts.seed === "number" ? opts.seed : undefined;
  let best = null, bestScore = Infinity;
  pool.forEach(function (p) {
    const score = (p.adp + jitterOf(p))
      * needFromCount(have[slot][p.pos] || 0, p.pos, round, opts && opts.league,
                      { slot: slot, counts: have[slot], seed: ctxSeed })
      * (isRisky(p) ? 1.35 : 1)
      * (modelMultiplier ? modelMultiplier(p) : 1);
    if (score < bestScore) { bestScore = score; best = p; }
  });
  return best;
}

function generateThirdRoundScenario(targetSlot) {
  const teams = league.teams;
  const taken = {};
  const have = [];
  for (let s = 0; s < teams; s++) have.push({});
  const picks = [];   // { overall, round, slot, player }, in draft order

  let targetOverall = null;
  const total = teams * league.rounds;
  for (let n = 1; n <= total; n++) {
    // `league`, not `league.teams` — the whole point of this simulation is
    // which picks the target seat holds, and under linear or third-round
    // reversal that is a different set of picks entirely.
    const c = DraftEngine.pickInfo(n, league);
    const pool = board.filter(function (p) { return !taken[p.name] && !isRuledOut(p); });
    if (!pool.length) break;
    const best = bestAvailable(pool, have, c.slot, c.round);
    if (!best) break;

    taken[best.name] = true;
    have[c.slot][best.pos] = (have[c.slot][best.pos] || 0) + 1;
    picks.push({ overall: n, round: c.round, slot: c.slot, player: best });

    if (c.slot === targetSlot && c.round === 3) targetOverall = n;
    // Two more picks past mine — phase 2's "the room reacts" — then stop;
    // nothing later in the draft is ever shown.
    if (targetOverall !== null && n >= targetOverall + 2) break;
  }
  if (targetOverall === null) return null;

  const myIndex = picks.findIndex(function (p) { return p.overall === targetOverall; });
  const myPick = picks[myIndex];
  const opponentPicks = picks.slice(myIndex + 1, myIndex + 3);
  if (opponentPicks.length < 2) return null;

  // "On the board" panel: my pick, the two players taken right after, and
  // a handful more who stay available throughout — a fixed row set, so the
  // phases only ever change a row's own appearance (§4.3), never add or
  // remove one.
  const takenBeforeMine = {};
  picks.slice(0, myIndex).forEach(function (p) { takenBeforeMine[p.player.name] = true; });
  const boardRows = [myPick.player].concat(opponentPicks.map(function (p) { return p.player; }));
  board
    .filter(function (p) { return !takenBeforeMine[p.name] && boardRows.indexOf(p) < 0 && !isRuledOut(p); })
    .sort(function (a, b) { return (a.adp + a.jitter) - (b.adp + b.jitter); })
    .slice(0, 5)
    .forEach(function (p) { boardRows.push(p); });

  // Survival to my own next turn from this exact pick, off the identical
  // model the Hero widget and the Show Your Working chart use — not a
  // fourth copy of "how many picks until my turn" math either.
  const nextTurnGap = DraftEngine.picksUntil(league, myPick.overall, targetSlot);
  const survival = survivalProbability(myPick.player, myPick.overall + nextTurnGap);

  // The one part of this file allowed to touch state.picks and
  // board[].drafted outside a real draft — see the comment above this
  // section for why it is safe here and nowhere else. cutIndex picks are
  // "already made" for this call only.
  function gradeAndRosterAt(cutIndex) {
    const slice = picks.slice(0, cutIndex);
    const savedPicks = state.picks;
    const touched = slice.map(function (p) { return p.player; });
    // Each player's own prior value, not an assumed `false` — a real,
    // concurrent draft (see the comment above this function) can have
    // already drafted one of these players for a genuine reason before
    // this call ever touched him, and forcing him back to undrafted would
    // erase that real pick out from under it.
    const priorDrafted = touched.map(function (p) { return p.drafted; });
    touched.forEach(function (p) { p.drafted = true; });
    state.picks = slice;
    try {
      const mine = analyseDraft()[targetSlot];
      const lineup = bestLineup(rosterOf(targetSlot)).map(function (s) {
        return { slot: s.slot, player: s.player ? { name: s.player.name, pos: s.player.pos } : null };
      });
      return {
        composite: Math.round(mine.total),
        letter: mine.grade,
        components: {
          starters: Math.round(mine.startersScaled),
          value: Math.round(mine.valueScaled),
          build: Math.round(mine.buildScaled),
          byes: Math.round(mine.byePenaltyScaled),
        },
        lineup: lineup,
        picksMade: cutIndex,
      };
    } finally {
      state.picks = savedPicks;
      touched.forEach(function (p, i) { p.drafted = priorDrafted[i]; });
    }
  }

  const before = gradeAndRosterAt(myIndex);
  const after = gradeAndRosterAt(myIndex + 3);

  return {
    pickCode: DraftEngine.pickCode(myPick.overall, league),
    overall: myPick.overall,
    round: myPick.round,
    slot: targetSlot,
    player: { name: myPick.player.name, pos: myPick.player.pos, team: myPick.player.team },
    survivalPct: survival == null ? null : Math.round(survival * 100),
    boardRows: boardRows.map(function (p) {
      return { name: p.name, pos: p.pos, team: p.team, isMine: p === myPick.player, isOpponent: opponentPicks.indexOf(picks.find(function (pk) { return pk.player === p; })) >= 0 };
    }),
    opponentPicks: opponentPicks.map(function (p) { return { name: p.player.name, slot: p.slot }; }),
    before: before,
    after: after,
  };
}

/* Three scenarios, three seats — the third round plays out differently for
   seat 2, seat 5 and seat 8 of the same simulated draft (different boards
   remaining when each reaches its own third pick), which is what makes
   these three genuinely different decisions rather than the same one
   described three times. All three walk the identical shotPicks()-style
   simulation from pick 1, so seat 5's scenario already reflects seats 0-4
   having picked "in front of" it, same as a real snake draft. */
function thirdRoundScenarios() {
  return [2, 5, 8]
    .map(function (slot) { return generateThirdRoundScenario(slot); })
    .filter(Boolean);
}


/* ---- 11. Rendering ------------------------------------- */

function lastName(name) {
  const parts = name.split(" ").filter(function (w) {
    return ["Jr.", "Sr.", "II", "III", "IV", "Defense"].indexOf(w) < 0;
  });
  return parts[parts.length - 1];
}

/* "J. Cook" — the form a draft board uses, because a surname alone stops
   being an answer the moment two of them share it.

   A defense keeps its club. `lastName()` already drops the word "Defense", so
   initialising what is left produces "L. Chargers", which is nobody: the first
   word of a team name is not a first name. This is the same rule as deciding a
   player's type from `player.pos` rather than from the shape of their data. */
function shortName(player) {
  if (player.pos === "DST") return lastName(player.name);
  const parts = player.name.trim().split(/\s+/);
  if (parts.length < 2) return player.name;
  return parts[0][0] + ". " + lastName(player.name);
}

function initials(name) {
  // filter(Boolean) drops the empty strings a stripped-then-split name can
  // leave behind — "Lambo No. 5" (a real CPU team name, TEAM_NAMES above)
  // strips its trailing digit to "Lambo No. ", and splitting that on " "
  // ends in "", so parts[parts.length - 1][0] read `undefined` and string
  // concatenation coerced it to the literal text "LUNDEFINED". Every real
  // player name already survives this unchanged; only a name that strips to
  // a trailing (or leading, or doubled) space could ever have hit it, and
  // team names are exactly the shape that does. Found via
  // TeamTabPhone.jsx's 26px chip, the first caller with no truncation to
  // hide it — but the defect was always here, for every caller of
  // initials(), not something the phone redesign introduced.
  const parts = name.replace(/[^A-Za-z .'-]/g, "").split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function photoUrl(player) {
  if (!player.id) return "";
  return player.pos === "DST"
    ? "https://sleepercdn.com/images/team_logos/nfl/" + player.team.toLowerCase() + ".png"
    : "https://sleepercdn.com/content/nfl/players/thumb/" + player.id + ".jpg";
}

/* ---- team colour ------------------------------------------

   One mark per club, used only where nothing is written on top of it: the
   ring around the headshot and the band under the sheet header. That
   restriction is the whole design, and it came out of measuring the
   alternative rather than from taste.

   **A team-coloured header does not survive thirty-two real teams.** Darkened
   far enough to carry white text — lightness only, hue and saturation held,
   the same repair the position solids had — ten pairs land below the
   just-noticeable difference and twenty-seven of the 496 pairs sit within 6
   CIE76. Carolina, Detroit, the Chargers and Houston all become the same dark
   teal; Dallas and Indianapolis become one navy. You pay the entire contrast
   bill and lose the identity you were buying, which is the opposite of what
   this is for. Pittsburgh's gold is 1.76:1 against white and New Orleans' is
   1.85:1, so there is no version of that header that simply works.

   Kept at full brand value against the navy header instead, seven vanish into
   it — CHI, DAL, HOU, JAX, NE, SEA and TEN, every one of them a club whose
   primary is a navy or a near-black. Those seven take the mark the club is
   actually known by, which is a substitution their own kit makes: Chicago's
   orange, Seattle's green, Jacksonville's gold. Raiders silver for the same
   reason — black is legal on navy and reads as nothing.

   Measured at those values, every accent clears 12 CIE76 against all three
   navy stops and against the card in both themes, worst case 13.6. Three
   pairs are still effectively one colour and always will be: CIN and DEN
   share a hex, ATL and HOU both use #A71930, CAR and LAC are 2.3 apart at
   brand. The club is named in text beside the mark, so a shared colour costs
   nothing a reader can be misled by.

   Not a token in `:root`, because these are somebody else's colours rather
   than ours and there are thirty-two of them. It reaches the stylesheet as
   `--team` on the header, the same way `--mark-ink` reaches a `<use>`. */
const TEAM_ACCENT = {
  ARI: "#97233F", ATL: "#A71930", BAL: "#241773", BUF: "#00338D",
  CAR: "#0085CA", CHI: "#C83803", CIN: "#FB4F14", CLE: "#311D00",
  DAL: "#869397", DEN: "#FB4F14", DET: "#0076B6", GB:  "#203731",
  HOU: "#A71930", IND: "#002C5F", JAX: "#D7A22A", KC:  "#E31837",
  LAC: "#0080C6", LAR: "#003594", LV:  "#A5ACAF", MIA: "#008E97",
  MIN: "#4F2683", NE:  "#C60C30", NO:  "#D3BC8D", NYG: "#0B2265",
  NYJ: "#125740", PHI: "#004C54", PIT: "#FFB612", SEA: "#69BE28",
  SF:  "#AA0000", TB:  "#D50A0A", TEN: "#4B92DB", WAS: "#5A1414"
};

// A free agent has no club and no colour. The stylesheet falls back to
// --navy-lift rather than to nothing, so the ring and the band are always
// drawn and only their colour changes.
function teamAccent(player) {
  return (player && TEAM_ACCENT[player.team]) || "";
}

function avatar(player, small) {
  const url = photoUrl(player);
  const photo = url
    ? `<img src="${url}" alt="" loading="lazy" data-drop-on-error
         class="${player.pos === "DST" ? "logo" : ""}">`
    : "";
  return `<div class="avatar ${player.pos}${small ? " sm" : ""}">${initials(player.name)}${photo}</div>`;
}

// Renders the little O / Q / PUP chip, or nothing at all.
function injBadge(player) {
  return player.inj ? `<span class="inj ${player.inj}">${player.inj}</span>` : "";
}

function isRuledOut(player) { return RULED_OUT.indexOf(player.inj) >= 0; }
function isRisky(player)    { return RISKY.indexOf(player.inj) >= 0; }

// ADP feeds lag injury news by days. A player still going inside the
// top 150 who has already been ruled out is worth shouting about.
function adpConflict(player) { return isRuledOut(player) && player.adp <= 150; }

/* Everything renderHeader() needs to decide, as data rather than as DOM
   writes — so the React header (web/src/components/AppHeader.jsx) reads the
   exact same branching this one paints from, rather than a second copy of
   it. Every helper called here already existed for renderHeader() alone;
   none of this is new business logic. */
function headerInfo() {
  if (!state.started) return { started: false };

  /* A started draft the engine cannot yet describe reads as no draft, for the
     one render that is true for.

     `pickInfo()` returns null while `DraftEngine` is undefined — every wrapper
     at the top of this file does something like it — and the "somebody else is
     up" branch below dereferences `.slot` off it. Nothing above catches that
     first: `draftOver()` answers false when the engine is missing and
     `isMyTurn()` answers false, so both guarded branches decline and execution
     falls through to the one line that is not guarded.

     `state.started` is true before `draft-engine.js` has landed on exactly the
     path this file already documents for applyJitter(): `adoptRoom()` runs from
     onRoomChange(), off the room's own "state" broadcast, which reaches a
     client the instant its socket is open — and live.js connects at boot, ahead
     of the requestIdleCallback that loads the engine at all. So a manager
     joining a room mid-draft could take a TypeError out of headerInfo(), and
     because renderHeader() is called from render(), it took the whole render
     with it: no board, no clock, nothing, until some later broadcast happened
     to arrive after the engine had loaded.

     Reproduced by blocking draft-engine.js outright, which is the same window
     held open — see tests/header-boot.spec.mjs.

     Returning the resting shape rather than a fourth kind of header because
     that is what renderHeader() already draws when there is nothing to say, and
     this is self-correcting: headerInfo() runs again on every render and tick,
     and the first one after the engine lands paints the real thing. The guard
     is on the function rather than on that one expression so the next line
     added below inherits it — the same rule this file states for every other
     DraftEngine caller. */
  if (typeof DraftEngine === "undefined") return { started: false };

  /* What this draft is, beside what it is doing. The shape was only ever on
     the setup screen, which folds away the moment a draft starts, so four
     rounds in there was no way to check whether this was a 14-round league
     without leaving it. Through leagueSummary(), never a second copy of the
     same lookup — it is the string the setup box already shows shut. */
  const leagueSum = leagueSummary();

  if (draftOver()) {
    return {
      started: true, over: true, myTurn: false, urgent: false,
      leagueSummary: leagueSum,
      statusLine: "Draft complete",
      pickText: totalPicks() + " picks made",
      rightLabel: "Rounds", rightValue: String(league.rounds)
    };
  }

  const overall = currentOverall();

  if (isMyTurn()) {
    const urgent = !!state.clockLength && !state.paused && state.timeLeft <= 10;
    return {
      started: true, over: false, myTurn: true, urgent,
      leagueSummary: leagueSum,
      statusLine: "You're on the clock!",
      pickText: "Pick " + pickCode(overall) + " (" + overall + " Overall)",
      rightLabel: state.clockLength ? (state.paused ? "Paused" : "Time left") : "Available",
      rightValue: state.clockLength ? clockText() : String(board.filter((p) => !p.drafted).length)
    };
  }

  /* Somebody else is up. Solo that is a CPU with no countdown of its own, so
     the useful number is how long until you are back; in a room there is a
     real clock running on a real person and it belongs on screen for
     everybody, not only for whoever it is running against.

     "Your turn in" moves onto the status line rather than being dropped —
     it is the other thing worth knowing while you wait, and the right-hand
     block only has room for one. */
  const gap = picksUntilMyTurn();
  const showClock = hasRoom() && clockShowing();

  return {
    started: true, over: false, myTurn: false, urgent: false,
    leagueSummary: leagueSum,
    statusLine: teamLabel(pickInfo(overall).slot) + (showClock && gap ? " · you are in " + gap : ""),
    pickText: "Pick " + pickCode(overall) + " (" + overall + " Overall)",
    rightLabel: showClock ? (state.paused ? "Paused" : "Time left") : "Your turn in",
    rightValue: showClock ? clockText() : String(gap)
  };
}

function renderHeader() {
  const info = headerInfo();
  appbar.className = "appbar";

  // The pick line and the counter both describe a draft in progress, so
  // before one starts the header is just the name and the theme toggle.
  // The player count lives under the setup card, on the freshness line,
  // which is where the rest of the data's provenance already is.
  pickLabel.hidden  = !info.started;
  countBlock.hidden = !info.started;

  if (!info.started) {
    statusLine.textContent = "The Draft Room";
    soundCue();                      // resets what has been said
    window.dispatchEvent(new Event("juke:header"));
    return;
  }

  leagueLabel.textContent = info.leagueSummary;
  statusLine.textContent  = info.statusLine;
  pickText.textContent    = info.pickText;
  rightLabel.textContent  = info.rightLabel;
  rightValue.textContent  = info.rightValue;
  appbar.classList.add(info.myTurn ? (info.urgent ? "urgent" : "my-turn") : "live");

  /* Last, and out of every branch above rather than at the top: the cues are
     about the state this render has just settled on, and a draft that has
     ended is not a turn that has started. */
  soundCue();
  window.dispatchEvent(new Event("juke:header"));
}

// "Last one in the tier" is the most actionable thing a draft board can
// tell you: it turns "take the best player" into "take him now or lose
// the whole tier".
function tierChip(player) {
  const left = tierRemaining(player);
  if (left === 1) return `<span class="chip last">Last in ${player.pos} tier ${player.tier}</span>`;
  if (left === 2) return `<span class="chip thin">2 left in ${player.pos} tier ${player.tier}</span>`;
  return `<span class="chip tier">${left} left in tier ${player.tier}</span>`;
}

function byeChip(player) {
  const shared = byeShare(player);
  if (shared < 2) return "";
  return `<span class="chip bye">Would be your ${shared + 1}${shared + 1 === 3 ? "rd" : "th"} on bye ${player.bye}</span>`;
}

function renderSuggestions() {
  const list = suggestions();
  const holder = $("suggestList");

  if (draftOver()) {
    holder.innerHTML = `<div class="empty"><p class="empty-title">Draft complete</p>
      <p class="empty-sub">Check My Team to see how the roster came out, or Analysis
        for your grade. This board stays saved, so you can reopen it later.</p>
      <button class="primary" data-action="new-draft">New mock draft</button></div>`;
    return;
  }

  const nextPick = currentOverall();

  holder.innerHTML = list.map(function (p, i) {
    const value = p.overall - nextPick;
    const valueText = value > 3
      ? `<span class="value-up">falling &mdash; ${value} picks past value</span>`
      : `<span class="value-down">on the board at ${p.overall}</span>`;

    return `
      <div class="sug ${i === 0 ? "top" : ""}">
        ${avatar(p)}
        <div class="sug-body">
          <div class="sug-name name-link" data-player="${p.name}">${p.name}</div>
          <div class="sug-meta">
            <span class="badge ${p.pos}">${posLabel(p.pos)}</span> ${p.team} &middot; Bye ${p.bye} ${injBadge(p)}
          </div>
          <div class="sug-stats">Overall ${p.overall} (${posLabel(p.pos)}${p.posRank}) &middot; ADP ${p.adp.toFixed(1)} &middot; ${valueText}</div>
          <div class="sug-meta" style="margin-top:5px">
            ${tierChip(p)}
            ${byeChip(p)}
          </div>
        </div>
        <button class="draft-btn" data-draft="${p.name}" ${isMyTurn() ? "" : "disabled"}>Draft</button>
      </div>`;
  }).join("");
}

/* Is this app finished offering me this position?

   Asked of the CPU's own valuation rather than answered a second time here.
   needMultiplier() returns 999 at the roster cap, and the cap is not one rule:
   it is maxAt() for the skill positions, but the starting requirement for a
   kicker or a defense, and starters + superflex for a quarterback. Writing
   that down again is exactly how the superflex bug happened — one rule in two
   places, left to drift.

   The round argument no longer changes this answer — the K and DST timing
   gates it used to have to step around are gone, and every remaining 999 comes
   from a cap that has nothing to do with the calendar. The last round is still
   what gets passed, because this is a question about the roster and the last
   round is the one at which every cap that will ever apply already does. */
function atPositionCap(pos) {
  return needMultiplier(state.mySlot, pos, league.rounds) === 999;
}

/* The position filter doubles as the roster-need display: the control you
   already reach for to narrow the list is also the one that tells you what
   you are still missing. It saves a trip to My Team on every pick.

   Both numbers are derived, never written down — the need comes from
   league.starters and the total from rosterSize(), so an unusual lineup
   reports itself correctly with no extra code.

   It only carries counts once a draft is running. Before that there is no
   roster to be short of, and showing pool sizes here would give one control
   two different meanings.

   ---- and a fraction is a promise about the denominator ----

   This printed `have/starters` in every state, in green once the starting slot
   was filled. At tight end that is a green "1/1" the moment you take one — a
   success colour on a fraction that reads as a ceiling, when the app will
   happily let you hold three and a backup tight end is a perfectly ordinary
   pick. It was reported from a real draft as the app refusing a second one,
   and the app had refused nothing: the Draft button was never disabled once,
   and there were nineteen tight ends on the board at the time.

   So the denominator is only shown while it is still owed. A requirement you
   have met is discharged, and continuing to print it as a fraction invents a
   limit that does not exist. What replaces it is the honest limit — the count
   alone until atPositionCap() says the app really has stopped offering them.

   The stylesheet already said this, one line above the rule that did the
   opposite: "a filled slot is the normal case and does not need to shout
   about itself." */
function renderPlayerFilter() {
  const filled = rosterOf(state.mySlot).length;

  $("playerFilter").querySelectorAll("button").forEach(function (button) {
    const pos = button.dataset.pos;
    const label = pos === "ALL" ? "All" : posLabel(pos);

    if (!state.started) {
      button.innerHTML = label;
      button.classList.remove("short", "met", "full");
      button.removeAttribute("title");
      return;
    }

    const all = pos === "ALL";
    const have = all ? filled : countAt(state.mySlot, pos);
    const need = all ? rosterSize() : (league.starters[pos] || 0);
    const short = have < need;

    /* "All" keeps its fraction throughout, because there the denominator is a
       real ceiling: rosterSize() is how many players you may end up with, and
       running out of spots is a thing that actually happens to you. */
    const full = all ? have >= need : atPositionCap(pos);
    const count = short || all ? `${have}/${need}` : String(have);

    button.innerHTML = `${label}<span class="need">${count}</span>`;

    /* "All" counts roster spots, not starting slots, so it needs its own
       wording — the shared sentence read "13 more ALL to fill your starting
       lineup", which is wrong about the number and about the noun. */
    const left = need - have;
    if (all) {
      button.title = short
        ? `${left} roster ${left === 1 ? "spot" : "spots"} still to fill`
        : "Your roster is full";
    } else if (short) {
      button.title = `${left} more ${posLabel(pos)} to fill your starting lineup`;
    } else if (full) {
      button.title = `You are holding as many ${posLabel(pos)} as this draft will suggest`;
    } else {
      button.removeAttribute("title");
    }

    /* Short of a starting slot is the actionable state. "Full" is the only
       other one worth marking, and it is the one that used to be a lie. */
    button.classList.toggle("short", short);
    button.classList.toggle("met", !short && !full);
    button.classList.toggle("full", full && !short);
  });
}

function renderQueue() {
  const holder = $("queueList");

  // The rail heading carries the count, now that the queue lives there and
  // no longer has a tab of its own to put it on.
  $("railQueueHead").textContent =
    state.queue.length ? `Your queue · ${state.queue.length}` : "Your queue";

  if (!state.queue.length) {
    holder.innerHTML = `<div class="empty">
      <p class="empty-title">Nothing queued</p>
      <p class="empty-sub">Star a player to line him up. This is your order, not the
        model's &mdash; and if the clock runs out while you are away, the top of it is
        what gets drafted for you.</p></div>`;
    return;
  }

  holder.innerHTML = state.queue.map(function (name, i) {
    const p = board.find((x) => x.name === name);
    if (!p) return "";
    const score = overallScore(p);
    return `
      <div class="qrow${i === 0 ? " next" : ""}">
        <span class="qn">${i + 1}</span>
        ${avatar(p, true)}
        <div class="qbody">
          <div class="qname name-link" data-player="${p.name}">${p.name}</div>
          <div class="qmeta">
            <span class="badge ${p.pos}">${posLabel(p.pos)}</span> ${p.team} &middot; ADP ${p.adp.toFixed(1)}
            &middot; Juke ${score === null ? "&mdash;" : Math.round(score)} ${injBadge(p)}
          </div>
        </div>
        <div class="qmoves">
          <button class="qmove" data-qup="${p.name}" ${i === 0 ? "disabled" : ""}
                  aria-label="Move ${p.name} up">&uarr;</button>
          <button class="qmove" data-qdown="${p.name}" ${i === state.queue.length - 1 ? "disabled" : ""}
                  aria-label="Move ${p.name} down">&darr;</button>
        </div>
        <button class="draft-btn" data-draft="${p.name}" ${isMyTurn() ? "" : "disabled"}>Draft</button>
      </div>`;
  }).join("");
}

/* ---- the player table ------------------------------------

   The columns, written down once. The header, the group bands above it, the
   cells and the sort all read this list, so adding a column is one entry
   rather than four edits that can disagree.

   `get` returns a number or null, and null always means "we do not have
   this", never zero. That distinction is the whole reason the sort below
   pushes blanks to the bottom in both directions: a quarterback with no
   rushing projection is not the worst rusher on the board, he is absent from
   the question.

   Targets are deliberately not here. Sleeper shows a TAR column and their
   own projections do not fill it — it reads 0 for every player, Bijan and
   Ja'Marr included. Receptions are projected, are the thing PPR actually
   scores, and are a number rather than a zero. */
function projOf(p) {
  const s = statOf(p);
  return (s && s.p && s.p.gp > 0) ? s.p : null;
}

function projStat(p, key) {
  const pr = projOf(p);
  const v = pr ? pr[key] : undefined;
  return (v === undefined || v === null) ? null : v;
}

const PLAYER_COLS = [
  /* The two that stay put while the stats scroll under them. Pinning the
     name without the rank would leave the rank sliding out from behind it,
     so both are sticky and the rank has a fixed width to sit the name
     against. */
  { key: "rk",   label: "RK",  title: "Rank by ADP", stick: "rk",
    get: (p) => p.overall },
  { key: "name", label: "Player", text: true, stick: "name",
    get: (p) => p.name },
  { key: "adp",  label: "ADP", title: "Average draft position",
    get: (p) => p.adp,   fmt: (v) => v.toFixed(1) },
  { key: "bye",  label: "BYE", get: (p) => p.bye },
  { key: "ovr",  label: "JUKE", title: "The Juke score: projected points above the last startable player at this position, as a share of the best such figure on the board",
    get: (p) => overallScore(p), fmt: (v) => Math.round(v), ours: true },

  { group: "Proj", key: "pts", label: "PTS", title: "Projected points under your scoring",
    get: (p) => p.projPts, fmt: (v) => Math.round(v) },
  { group: "Proj", key: "avg", label: "AVG", title: "Projected points per game",
    /* Through the same denominator the sheet uses. A team defense is
       forecast as one aggregate row stamped gp:1, so dividing by the raw
       figure would print a per-game number equal to the season total. */
    get: function (p) {
      const g = projGames(p.pos, projOf(p));
      return (p.projPts === null || !g) ? null : p.projPts / g;
    },
    fmt: (v) => v.toFixed(1) },

  { group: "Rushing",   key: "ra", label: "ATT", get: (p) => projStat(p, "ra") },
  { group: "Rushing",   key: "ry", label: "YDS", get: (p) => projStat(p, "ry") },
  { group: "Rushing",   key: "rt", label: "TD",  get: (p) => projStat(p, "rt") },

  { group: "Receiving", key: "rc", label: "REC", get: (p) => projStat(p, "rc") },
  { group: "Receiving", key: "cy", label: "YDS", get: (p) => projStat(p, "cy") },
  { group: "Receiving", key: "ct", label: "TD",  get: (p) => projStat(p, "ct") },

  { group: "Passing",   key: "pa", label: "ATT", get: (p) => projStat(p, "pa") },
  { group: "Passing",   key: "py", label: "YDS", get: (p) => projStat(p, "py") },
  { group: "Passing",   key: "pt", label: "TD",  get: (p) => projStat(p, "pt") }
];

function colByKey(key) {
  return PLAYER_COLS.filter(function (c) { return c.key === key; })[0];
}

/* Two rows: the bands, then the columns. Both generated from PLAYER_COLS, so
   a colspan can never fall out of step with the columns underneath it. */
function renderPlayerHead() {
  const head = $("playerHead");
  if (!head) return;

  // One cell per column and one for the actions, and not a single one more:
  // a band row a column too wide shifts every heading off its numbers.
  let bands = "";
  let i = 0;
  while (i < PLAYER_COLS.length) {
    const c = PLAYER_COLS[i];
    if (!c.group) {
      bands += `<th class="${c.stick ? "stick " + c.stick : ""}"></th>`;
      i++;
      continue;
    }
    let span = 0;
    while (i + span < PLAYER_COLS.length && PLAYER_COLS[i + span].group === c.group) span++;
    bands += `<th class="band" colspan="${span}">${c.group}</th>`;
    i += span;
  }
  bands += `<th></th>`;

  const cols = PLAYER_COLS.map(function (c) {
    const on = state.sort.key === c.key;
    const arrow = on ? (state.sort.dir === 1 ? " ▲" : " ▼") : "";
    const cls = (c.stick ? "stick " + c.stick : "num") +
                " sortable" + (on ? " sorted" : "") + (c.ours ? " ours" : "");
    return `<th class="${cls}"
        data-sort="${c.key}" tabindex="0" role="button"
        aria-sort="${on ? (state.sort.dir === 1 ? "ascending" : "descending") : "none"}"
        ${c.title ? `title="${escHtml(c.title)}"` : ""}>${c.label}${arrow}</th>`;
  }).join("");

  head.innerHTML = `<tr class="bandrow">${bands}</tr><tr>${cols}<th></th></tr>`;
}

/* Sorted on a copy, always.

   board is not just a list to draw — DraftEngine.jitter() reads a player's
   position in it to work out the CPU wobble, and every client in a room has
   to reach the same answer. Sorting it in place to draw a table would change
   what the CPUs do, and change it differently for whoever happened to click
   a column header. */
function sortedPlayers(list) {
  const col = colByKey(state.sort.key) || colByKey("adp");
  const dir = state.sort.dir;

  return list.slice().sort(function (a, b) {
    const av = col.get(a), bv = col.get(b);

    // Missing is missing in both directions. A player with no projection
    // does not belong at the top of "fewest rushing yards".
    const an = av === null || av === undefined;
    const bn = bv === null || bv === undefined;
    if (an && bn) return a.adp - b.adp;
    if (an) return 1;
    if (bn) return -1;

    if (col.text) return String(av).localeCompare(String(bv)) * dir;
    if (av !== bv) return (av - bv) * dir;

    // A stable tiebreak, so equal numbers do not reshuffle between renders.
    return a.adp - b.adp;
  });
}

function renderPlayers() {
  const tbody = document.querySelector("#playerTable tbody");
  const hide  = $("hideDrafted").checked;

  renderPlayerFilter();
  renderPlayerHead();

  const term = state.search.trim().toLowerCase();

  const visible = sortedPlayers(board.filter(function (p) {
    if (state.filterPlayers !== "ALL" && p.pos !== state.filterPlayers) return false;
    if (hide && p.drafted) return false;
    if (term && p.name.toLowerCase().indexOf(term) < 0
             && p.team.toLowerCase().indexOf(term) < 0) return false;
    return true;
  }));

  if (!visible.length) {
    tbody.innerHTML = `<tr><td colspan="${PLAYER_COLS.length + 1}"
      style="text-align:center;color:var(--ink-light);padding:26px">
      No players match that search.</td></tr>`;
    return;
  }

  tbody.innerHTML = visible.map(function (p) {
    // The Juke score was only ever visible inside the player sheet, which meant
    // opening a player to find out whether he was worth opening. It is the
    // one number this app has that the ADP feed does not, so it belongs on
    // the row. A dash where there is no projection, never a zero.
    const score = overallScore(p);
    const scoreCell = score === null ? "&mdash;" : Math.round(score);

    // Where the model and the market disagree enough to be worth saying out
    // loud. Off the board entirely in a room — see marketChip().
    const gapChip = hasRoom() ? "" : marketChip(p);

    const cells = PLAYER_COLS.map(function (c) {
      if (c.text) {
        // Team and positional rank are one idea and wrap as one. As a bare
        // text node they were an anonymous box no selector could reach, so
        // the stylesheet's "never break inside a piece" rule silently missed
        // them and "ATL · WR5" folded into three stacked lines on a phone.
        return `<td class="stick name">
            <span class="nm name-link" data-player="${p.name}">${p.name}</span>
            <span class="meta"><span class="badge ${p.pos}">${posLabel(p.pos)}</span> <span class="ident">${p.team} &middot; ${posLabel(p.pos)}${p.posRank}</span>
              ${injBadge(p)} <span class="chip tier">T${p.tier}</span>${gapChip}</span>
          </td>`;
      }

      const v = c.get(p);
      // A dash, never a zero. The two mean opposite things and this table is
      // now sortable, which makes conflating them a wrong answer rather than
      // an ugly one.
      if (v === null || v === undefined) return `<td class="num">&mdash;</td>`;

      const shown = c.fmt ? c.fmt(v) : v;
      if (c.stick) return `<td class="stick ${c.stick} num">${shown}</td>`;
      if (c.key === "ovr") {
        return `<td class="num ovr ${v >= 55 ? "good" : ""}"
            title="${overallReason(p)}">${shown}</td>`;
      }
      return `<td class="num${c.group ? " stat" : ""}">${shown}</td>`;
    }).join("");

    return `
      <tr class="${p.drafted ? "drafted" : ""} ${adpConflict(p) ? "conflict" : ""}">
        ${cells}
        <td class="rowacts">
          ${p.drafted ? "" : `<button class="star${queued(p) ? " on" : ""}" data-queue="${p.name}"
            aria-pressed="${queued(p)}"
            aria-label="${queued(p) ? "Remove " + p.name + " from your queue" : "Add " + p.name + " to your queue"}"
            title="${queued(p) ? "In your queue" : "Add to your queue"}">&#9733;</button>`}
          <button class="draft-btn" data-draft="${p.name}"
             ${p.drafted || !isMyTurn() ? "disabled" : ""}>${p.drafted ? "Taken" : "Draft"}</button>
        </td>
      </tr>`;
  }).join("");
}

/* Which way the pick order leaves this cell.

   A snake board is read for its turns, and the turn is the one thing the
   numbers alone make you work out: the last pick of a round hands straight
   over to the first pick of the next, which is why the two ends of the room
   pick twice in a row and the middle never does. So the last pick of any
   round points down and everything else points the way its round runs.

   `pickInRound` rather than a second copy of the mirror — the whole point of
   putting it in the engine was that this is the third place that wants it.

   `teams` is a parameter rather than read from `league`, because the hero shot
   draws a fixed ten-team room whatever league the visitor has set up. One
   function for both boards: the landing page claiming a different snake from
   the product is the drift this signature exists to prevent. */
/* What a team has, at a glance, under its name on the board.

   The one thing a board cannot otherwise tell you is what everybody else
   still needs, and it is in `state.picks` already — so this is a read of data
   the app has rather than anything new. It is what makes the column above a
   pick legible: three running backs and no quarterback is a team about to
   take a quarterback.

   **Which positions get counted was derived from FORCED_LATE and is not any
   more, because the measurement moved under it.** The old reason was that the
   app scheduled K and DST itself, so counting either was eight columns of
   "0 0" until the closing rounds and then eight of "1 1". The round gates are
   gone and that is now true of exactly one of them. Measured 1 September 2026,
   over 120 simulated ten-team drafts on the real board: defenses land in **4 to
   7 distinct rounds** starting around round 8, and kickers in **2 to 4**,
   effectively all of them in the last two. So a DST column says something a reader of this
   strip wants — the team above you already has one — and a K column is twelve
   rounds of "0" followed by "1".

   Listing QB, RB, WR and TE would still be the league shape written down a
   second time, which is why this names the single position it excludes rather
   than enumerating the four it keeps.

   **Each count carries its own ground, and that is what makes it safe.** A
   chip is white on a position solid, which is the contract those colours were
   darkened to meet, so it does not matter whether it lands on the board head
   or on the navy of your own column — the header behind it is never part of
   the sum. Colouring the *text* instead was measured first and does not
   survive: the light-theme --*-fg tones are 4.85 to 5.69 on --board-hd and
   2.15 to 2.52 on your own column's navy, so the one team a manager looks at
   most would be the one that failed. */
const COUNTED_POSITIONS = POSITIONS.filter(function (p) { return p !== "K"; });

function rosterStrip(slot) {
  return '<span class="hd-roster">' + COUNTED_POSITIONS.map(function (pos) {
    const n = countAt(slot, pos);
    // Empty is drawn as empty rather than dropped: a gap where a chip should
    // be is the fact somebody is reading this strip for.
    return `<span class="hd-pos ${n ? pos : "none"}">${n}</span>`;
  }).join("") + "</span>";
}

function boardArrow(round, slot, teams) {
  // Same guard as the wrappers above: the board grid draws league.teams x
  // league.rounds empty cells from league shape alone, with no dependence
  // on board/state, so it runs during the deferred-data window too.
  //
  // `round % 2 === 0` was the direction test here, written when a snake was
  // the only draft this app had. It is wrong for both of the formats added
  // since — a linear draft runs forward in every round, and third-round
  // reversal inverts the parity from round three on — so the answer comes
  // from DraftEngine.reversedRound(), the one place the rule lives. The
  // pre-load fallback still has to guess, and guesses snake, because that
  // is what an unconfigured league is.
  if (typeof DraftEngine === "undefined") return round % 2 === 0 ? "&larr;" : "&rarr;";
  if (DraftEngine.pickInRound(round, slot, league) === teams) return "&darr;";
  return DraftEngine.reversedRound(round, league) ? "&larr;" : "&rarr;";
}

/* The headshot, or nothing at all.

   `avatar()` is deliberately not reused. It draws initials underneath as a
   fallback and carries the `.avatar` class, which is hidden outright inside
   the rail and is the player photo on the sheet — a 20px board face wants
   neither. Nothing is drawn when there is no id, rather than a placeholder:
   140 grey circles is a worse board than 140 cards, six of which have no
   picture.

   `data-drop-on-error` is how a 404 disappears. It has to be that rather than
   an inline `onerror`, because an inline handler is a script the CSP would
   have to allow, and allowing those means allowing the ones somebody else
   writes into a chat message. */
function boardFace(player) {
  const url = photoUrl(player);
  return url
    ? `<img class="cell-face" src="${url}" alt="" loading="lazy" data-drop-on-error>`
    : "";
}

function renderBoard() {
  const grid = $("boardGrid");

  // One column per team plus the round gutter. The stylesheet carries a
  // ten-team default for the moment before this runs; the real count is
  // only known once the league is set, so it is written here.
  grid.style.gridTemplateColumns = `30px repeat(${league.teams}, minmax(74px, 1fr))`;
  grid.style.minWidth = (30 + league.teams * 77) + "px";

  let html = `<div class="hd"></div>`;

  for (let s = 0; s < league.teams; s++) {
    html += `<div class="hd ${s === state.mySlot ? "me" : ""}">` +
              `<span class="hd-name">${s === state.mySlot ? "YOU" : cpuName(s).split(" ")[0]}</span>` +
              rosterStrip(s) +
            `</div>`;
  }

  for (let r = 1; r <= league.rounds; r++) {
    html += `<div class="rd">${r}</div>`;
    for (let s = 0; s < league.teams; s++) {
      const pick = state.picks.find((p) => p.round === r && p.slot === s);
      if (pick) {
        const p = pick.player;
        html += `<div class="cell ${p.pos} ${s === state.mySlot ? "mine" : ""}">
                   <b>${shortName(p)}</b><s>${p.pos} &middot; ${p.team}</s>
                   <span class="cell-foot">
                     <span class="cell-dir" aria-hidden="true">${boardArrow(r, s, league.teams)}</span>
                     <span class="cell-pick">${pickCode(pick.overall)}</span>
                     ${boardFace(p)}
                   </span></div>`;
      } else {
        const c = onTheClock();
        const isNow = c && c.round === r && c.slot === s;
        /* Which pick of the round this is, not which seat. The engine owns
           that mirror — this line used to be `s + 1`, which is the same fact
           written down twice and drifting in the half of the board where the
           two disagree. */
        // "?" rather than s + 1 while draft-engine.js is still in flight:
        // that fallback is the exact seat-for-pick-number bug documented
        // above, and this cell gets rebuilt from scratch the moment real
        // data lands (see the deferred-data boot), so there's nothing to
        // gain from an approximation here, correct or not.
        const inRound = typeof DraftEngine === "undefined" ? "?" : DraftEngine.pickInRound(r, s, league);

        /* `mine` goes on an empty cell too, and that is the half of this
           that was missing. The class only ever went on a filled one, so the
           board marked where you had been and not where you were going —
           which is the one question a snake board exists to answer, and four
           rounds out in a twelve-team room it was a counting exercise done
           by hand. The gold column is drawn from the same `state.mySlot` the
           header already uses. */
        const isMine = s === state.mySlot;

        /* The arrow goes on an empty cell too, and it is the same argument
           as the gold column beside it. A drafted cell has always carried the
           direction the order is travelling; an undrafted one carried a bare
           code, so the snake was legible over the half of the board that has
           already happened and not over the half you are about to play. That
           is backwards — the turn matters *before* the picks land, which is
           when you are working out whether the wait is one pick or nineteen.

           It yields to the clock, and only to the clock. The cell on the
           clock shows the countdown instead — two facts in a 74px box is one
           too many, and the countdown is the one somebody is watching. When
           there is no clock to show, that cell takes the arrow like any
           other. */
        const face = isNow && clockShowing()
          ? clockText()
          : `<span class="cell-dir" aria-hidden="true">${boardArrow(r, s, league.teams)}</span>` +
            `<span class="cell-pick">${r}.${String(inRound).padStart(2, "0")}</span>`;

        /* How far away this pick is, which "5.01" cannot say on its own.

           Only on a cell nobody has drafted yet. On a filled one it is the
           sixth fact in a 74px box and answers a question nobody has — the
           pick already happened. On an empty one it turns "when do I pick
           again" from arithmetic into reading, which is the same thing the
           gold column and the arrow are for.

           DraftEngine.overallOf() rather than the sum written out here: the
           mirror is inside it, and a caller holding a round and a seat must
           never work that out again. */
        const ovr = `<span class="cell-ovr">${typeof DraftEngine === "undefined" ? "" : DraftEngine.overallOf(r, s, league)}</span>`;

        // The cell on the clock is the clock. Looking away from where the
        // pick lands to find out how long is left is the thing this removes.
        html += `<div class="cell empty ${isNow ? "now" : ""} ${isMine ? "mine" : ""}"${isNow ? ' id="boardClock"' : ""}>${ovr}${face}</div>`;
      }
    }
  }

  grid.innerHTML = html;
  scrollBoardToLive();
}

/* A persistent board is only useful if it is showing the round being drafted.
   Fourteen rounds do not fit above the working area, so the pane scrolls and
   this keeps the live pick in the middle of it.

   The media query is asked here rather than left to the stylesheet, because
   a prefers-reduced-motion rule does not apply to a programmatic scroll that
   asks for "smooth" — the same reason the score arrows check it themselves. */
/* Following the live pick is the default, and it stays the default until the
   reader disagrees with it.

   Until now that disagreement lasted about 350ms. render() rebuilds the board
   on every change — one per CPU pick — and this re-centred every time with
   nothing asked about where the reader had put it, so scrolling up to check
   round one during a run of CPU picks was simply not possible: measured at
   round 12, somebody sitting at the top of the board was pulled back to 316px
   two or three times a second, for as long as they kept trying.

   Only real input frees it. A scroll event cannot be used for this — a smooth
   programmatic scroll fires a stream of them and would free the board on its
   own animation — so it listens for the things only a person does. */
const boardFollow = { on: true, atPick: -1 };

function freeBoardScroll() { boardFollow.on = false; }

function scrollBoardToLive() {
  const scroller = $("boardScroll");
  if (!scroller) return;

  /* Your own turn takes the lead back, once. Once rather than continuously,
     or scrolling up to check a bye week *during your own pick* would be undone
     as briskly as during anybody else's — the same bug wearing your name. */
  if (isMyTurn() && boardFollow.atPick !== state.picks.length) boardFollow.on = true;
  boardFollow.atPick = state.picks.length;

  /* The cell on the clock, or failing that the last one of mine.

     querySelectorAll rather than `.cell.mine:last-of-type`, which does not
     mean what it looks like: every child of the grid is a div, so
     :last-of-type matches only the very last cell on the board, and the
     fallback fired only in the one case where the bottom-right chair
     happened to be yours. */
  const mine = scroller.querySelectorAll(".cell.mine");
  const cell = scroller.querySelector(".cell.now") || mine[mine.length - 1];
  if (!cell) return;

  /* Measured with rects, not offsetTop.

     offsetTop is the distance to the nearest *positioned* ancestor, and
     nothing between a cell and this scroller is positioned — so it was being
     reported against <body> and came back 207px too large. One mistake, two
     symptoms. The board sat four rounds past the live pick, because 207px is
     about four rows. And it twitched on every CPU pick, because anything
     above the board changing height — the pick ticker arriving, the header
     switching to your turn — moves the board down the page, which moved a
     number that was never supposed to be about the page. */
  const cellBox = cell.getBoundingClientRect();
  const viewBox = scroller.getBoundingClientRect();
  const centred = scroller.scrollTop + (cellBox.top - viewBox.top) -
                  (scroller.clientHeight - cellBox.height) / 2;

  // Clamped here rather than left to the browser, so the comparison below is
  // against the position we would actually end up at.
  const target = Math.max(0, Math.min(centred,
                                      scroller.scrollHeight - scroller.clientHeight));

  /* Already there. Worth checking, because render() rebuilds the board on
     every change and asking for a scroll we are already at still starts an
     animation — and an animation every time a CPU picks is the jitter.

     It is also how following resumes on its own: scrolling back to the live
     pick is the reader saying they are done looking, and it needs no separate
     gesture to mean that. */
  if (Math.abs(target - scroller.scrollTop) < 4) { boardFollow.on = true; return; }

  if (!boardFollow.on) return;

  const smooth = !(window.matchMedia &&
                   window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  scroller.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
}

/* The starting lineup, with the best eligible player seated in each slot,
   and whoever is left over. Written once because the rail and the full
   My Team view both need it and two answers to "who is starting" that could
   drift apart is exactly the bug this file is organised to avoid.

   Roster order is draft order, so the first eligible player wins the slot —
   which is why the FLEX ends up holding whoever was taken later rather than
   whoever is worse.

   Takes an optional slot so the React Team tab can seat any manager's
   roster, not just yours — added for the mobile redesign's "check anyone's
   team" tab, without a second copy of the fill-order logic the grade and
   the legacy My Team view both already depend on being correct. */
function seatedLineup(slot) {
  const seat = slot === undefined ? state.mySlot : slot;
  const mine = rosterOf(seat).slice();
  const used = [];

  const seats = lineupSlots().map(function (slot) {
    const pick = mine.find(function (p) {
      return used.indexOf(p) < 0 && fillsSlot(p, slot);
    }) || null;
    if (pick) used.push(pick);
    return { slot: slot, player: pick };
  });

  return { seats: seats, bench: mine.filter((p) => used.indexOf(p) < 0) };
}

function renderTeam() {
  const lineup = seatedLineup();

  $("startersList").innerHTML =
    lineup.seats.map((s) => rosterRow(posLabel(s.slot), s.player, false)).join("");

  // The bench is however many seats are left once the starters are seated.
  const benchRows = [];
  for (let i = 0; i < league.bench; i++) {
    benchRows.push(rosterRow("BN", lineup.bench[i] || null, true));
  }
  $("benchList").innerHTML = benchRows.join("");
}

/* The rail: the two things you check between picks, never more than a glance
   away. It is the starting lineup only — the bench is a full-view question,
   and a rail that lists twenty rows stops being scannable.

   Which is a good rule that was telling a lie. The heading counts the whole
   roster, so it read "Your roster · 14 of 14" above a list of nine, and the
   five it did not mention looked like five it had lost. The last row now
   says how many are on the bench, so the list adds up to the number above
   it without the rail growing the twenty rows this comment is about. */
function renderRail() {
  const lineup = seatedLineup();
  const held = rosterOf(state.mySlot).length;

  $("railRosterHead").textContent = `Your roster · ${held} of ${rosterSize()}`;

  /* The launcher answers the commonest question without being opened. It is
     shown on the same terms as the chat's: only in a started draft, because
     there is no roster to glance at before one. */
  $("railFab").hidden = !(state.started && route() === "draft");
  $("railFabText").textContent = `Roster ${held}/${rosterSize()}`;

  /* A real button, because it always looked like one. This row exists to say
     the rail is not showing you everything, so the way to the rest of it
     belongs on the row — it just has to actually go there. */
  const benched = lineup.bench.length;
  const benchRow = benched
    ? `<li class="benchsum"><span class="rslot BN">BN</span>
         <span class="rfill">${benched} on the bench</span>
         <button type="button" class="rtm" data-goto-tab="tab-team"
           aria-label="See all ${held} players on My Team">My Team</button></li>`
    : "";

  $("railRoster").innerHTML = lineup.seats.map(function (s) {
    const label = posLabel(s.slot);
    if (!s.player) {
      return `<li class="empty"><span class="rslot ${s.slot}">${label}</span>
                <span class="rfill none">Empty</span></li>`;
    }
    return `<li><span class="rslot ${s.slot}">${label}</span>
        <span class="rfill name-link" data-player="${s.player.name}">${lastName(s.player.name)}</span>
        <span class="rtm">${s.player.pos} &middot; ${s.player.team}</span></li>`;
  }).join("") + benchRow;
}

function rosterRow(slotName, player, isBench) {
  if (!player) {
    return `<li><span class="slot ${isBench ? "bn" : ""}">${slotName}</span><span class="skeleton"></span></li>`;
  }
  const pick = state.picks.find((p) => p.player === player);
  return `<li>
      <span class="slot ${isBench ? "bn" : ""}">${slotName}</span>
      ${avatar(player, true)}
      <div>
        <div class="rname name-link" data-player="${player.name}">${player.name}</div>
        <div class="rmeta"><span class="badge ${player.pos}">${posLabel(player.pos)}</span> ${player.team} &middot; Bye ${player.bye} ${injBadge(player)}</div>
      </div>
      <span class="rpick">${pickCode(pick.overall)}</span>
    </li>`;
}

function renderPicks() {
  const holder = $("picksList");

  if (state.picks.length === 0) {
    holder.innerHTML = `<div class="empty"><p class="empty-title">No picks yet</p>
      <p class="empty-sub">Each selection will appear here, most recent first.</p></div>`;
    return;
  }

  const recent = state.picks.slice().reverse();
  let html = "";
  let lastRound = null;

  recent.forEach(function (pick) {
    if (pick.round !== lastRound) {
      html += `<div class="round-divider">Round ${pick.round}</div>`;
      lastRound = pick.round;
    }
    html += `
      <div class="pick-card ${pick.slot === state.mySlot ? "mine" : ""}">
        <span class="pick-no">${pickCode(pick.overall)}</span>
        ${avatar(pick.player, true)}
        <div>
          <div class="pick-team">${teamLabel(pick.slot)}</div>
          <div class="pick-name name-link" data-player="${pick.player.name}">${pick.player.name}</div>
          <div class="pick-meta"><span class="badge ${pick.player.pos}">${posLabel(pick.player.pos)}</span> ${pick.player.team} &middot; Bye ${pick.player.bye}</div>
        </div>
      </div>`;
  });

  holder.innerHTML = html;
}

/* A run is the thing that changes a draft plan, and it is entirely readable
   from picks already stored: if the last seven picks were five backs, the
   backs are going, and waiting a round costs you one.

   Seven is a window wide enough to be a trend and short enough to still be
   happening. Five of it is a clear majority without needing a near-sweep,
   which at these sizes almost never occurs. Under a third of the window
   there is nothing to say, so it says nothing. */
const RUN_WINDOW = 7;
const RUN_THRESHOLD = 5;

const RUN_NOUNS = {
  QB: "quarterbacks", RB: "backs", WR: "receivers",
  TE: "tight ends", K: "kickers", DST: "defenses"
};

function currentRun() {
  if (state.picks.length < RUN_WINDOW) return null;

  const recent = state.picks.slice(-RUN_WINDOW);
  const counts = {};
  recent.forEach(function (p) {
    counts[p.player.pos] = (counts[p.player.pos] || 0) + 1;
  });

  const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  if (!top || counts[top] < RUN_THRESHOLD) return null;
  return { pos: top, count: counts[top] };
}

/* Where the model and the market disagree enough to be worth saying out loud.
   Only at the threshold, because a chip on every row is a chip on no row.

   Solo it sits on the player row, which is where you want it: it is the app
   reading the board for you before you commit. In a room the same chip on the
   same shared list is the app reading the board for *everybody*, including the
   nine people who have not thought about that player yet — so it comes off the
   board there and is said in the ticker instead, after the pick, to the one
   manager who has already made the decision. */
function marketChip(player) {
  const gap = marketGap(player);
  if (gap >= MARKET_GAP) {
    return `<span class="chip val">Value &middot; projects ${posLabel(player.pos)}${player.projPosRank}</span>`;
  }
  if (gap <= -MARKET_GAP) {
    return `<span class="chip reach">Reach &middot; projects ${posLabel(player.pos)}${player.projPosRank}</span>`;
  }
  return "";
}

function renderTicker() {
  const ticker = $("ticker");
  const pick = state.lastPick;

  if (!pick) { ticker.hidden = true; return; }

  const run = currentRun();
  const runNote = run
    ? `<span class="run"><b>${run.count} of the last ${RUN_WINDOW}</b> were ` +
      `${RUN_NOUNS[run.pos] || run.pos}</span>`
    : "";

  ticker.hidden = false;
  ticker.innerHTML = `
    <span class="tick-pick">${pickCode(pick.overall)}</span>
    ${avatar(pick.player, true)}
    <div class="tick-body">
      <div class="tick-team">${teamLabel(pick.slot)} selected</div>
      <div class="tick-name">
        ${pick.player.name}
        <span class="badge ${pick.player.pos}">${posLabel(pick.player.pos)}</span>
        <span class="tick-tm">${pick.player.team} &middot; Bye ${pick.player.bye}</span>
        ${injBadge(pick.player)}
        ${pick.slot === state.mySlot ? marketChip(pick.player) : ""}
      </div>
    </div>
    ${runNote}
    ${state.simulating ? '<button class="mini" id="skipBtn">Skip &raquo;</button>' : ""}`;
}

function bar(label, detail, percent, tone) {
  const width = Math.max(2, Math.min(100, percent));
  return `<div class="bar-row">
      <div class="bar-head"><b>${label}</b><span>${detail}</span></div>
      <div class="bar-track"><div class="bar-fill ${tone}" style="width:${width}%"></div></div>
    </div>`;
}

function renderGrades() {
  const body = $("gradesBody");

  if (state.picks.length < league.teams) {
    body.innerHTML = `<div class="empty"><p class="empty-title">Nothing to grade yet</p>
      <p class="empty-sub">Analysis appears once the first round is done, and updates after every pick.</p></div>`;
    return;
  }

  const all = analyseDraft();
  const me  = all[state.mySlot];
  const done = draftOver();

  const tone = (v) => v >= 66 ? "good" : v >= 33 ? "" : "bad";

  let html = `
    <div class="grade-hero">
      <div class="grade-letter">${me.grade}</div>
      <div>
        <h3>${done ? "Final grade" : "Grade so far"} &mdash; ${me.rank} of ${league.teams}</h3>
        <p>${done ? "Draft complete." : "Updates after every pick."}
           Graded against the ${league.teams - 1} teams in this room, not against the league at large.</p>
      </div>
    </div>

    <div class="bars">
      ${bar("Starter strength", parText(me),
            me.startersScaled, tone(me.startersScaled))}
      ${bar("Draft value", parValueText(me),
            me.valueScaled, tone(me.valueScaled))}
      ${bar("Roster construction", buildText(me),
            me.buildScaled, tone(me.buildScaled))}
      ${bar("Bye week safety", byeSummary(me.badWeeks),
            me.byePenaltyScaled, tone(me.byePenaltyScaled))}
    </div>`;

  /* Each callout stands on its own. They used to render as a pair or not at
     all, so a draft with nothing reached for lost its best value too. */
  if (me.bargain || me.reach) {
    html += `<div class="callouts">`;
    if (me.bargain) {
      html += `<div class="callout good">
        <div class="lbl">Best value</div>
        <div class="val">${me.bargain.pick.player.name}</div>
        <div class="sub">Taken at ${pickCode(me.bargain.pick.overall)}, board had him ${me.bargain.pick.player.overall}${me.bargain.gap > 0 ? " &mdash; " + me.bargain.gap + " picks late" : ""}</div>
      </div>`;
    }
    if (me.reach) {
      html += `<div class="callout ${me.reach.gap < -8 ? "bad" : ""}">
        <div class="lbl">Biggest reach</div>
        <div class="val">${me.reach.pick.player.name}</div>
        <div class="sub">Taken at ${pickCode(me.reach.pick.overall)}, board had him ${me.reach.pick.player.overall} &mdash; ${Math.abs(me.reach.gap)} picks early</div>
      </div>`;
    }
    html += `</div>`;
  }

  // bye week strip, weeks 5 to 14
  let strip = "";
  for (let w = 5; w <= 14; w++) {
    const n = me.byes[w] || 0;
    strip += `<i class="${n >= 4 ? "w4" : n === 3 ? "w3" : n === 2 ? "w2" : ""}">${w}</i>`;
  }
  html += `<p class="section-label">Starters on bye, by week</p><div class="byebar">${strip}</div>`;

  // standings
  html += `<p class="section-label" style="margin-top:20px">Room standings</p>
    <table class="standings"><tbody>`;
  /* No score column between the rank and the letter any more.

     The rule it used to satisfy was that whatever sits there has to be the
     weighted total: it once printed starter strength — one component of four
     — so the column climbed and fell down a strictly ranked table, and four
     teams sharing a starter strength of 90 sat at ranks 1, 4, 5 and 7 with
     four different grades. It read as a sorting bug.

     Removing the column satisfies that rule from the other end. A letter
     grade beside an x/100 is read against the scale everybody was taught, and
     the letter here is finishing position while the number was a
     room-relative composite — so they disagreed by construction, on every row.
     The row is ordered by rank and labelled by a letter that means rank, and
     there is nothing left for a third number to contradict. The components
     still add up in the bars above. */
  all.slice().sort((a, b) => a.rank - b.rank).forEach(function (t) {
    html += `<tr class="${t.slot === state.mySlot ? "me" : ""}">
        <td class="rk">${t.rank}</td>
        <td>${teamLabel(t.slot)}</td>
        <td class="gr">${t.grade}</td>
      </tr>`;
  });
  html += `</tbody></table>

    <p class="method">Starter strength is 50% of the grade: every starter scored by how many
    places above replacement level they rank at their position, where replacement is
    ${replacementText()} for this ${league.teams}-team league, which starts ${lineupText()}.
    Draft value is 25%: how far each
    player fell past their ADP when you took them, counting only the picks where a fall past
    ADP means anything &mdash; kickers and defenses are left out, because their ADP is set by
    longer drafts than this one, so every one of them reads as a reach.
    Roster construction is 15%, docking unfilled
    starting slots, spots spent on a quarterback, kicker or defense you can never start, and how
    far from startable your best benched running back and receiver are &mdash; nothing if either
    could start today. Bye week safety is the last 10%, charging every week that leaves more than
    two starters out &mdash; by the square of how many are missing beyond the second, so one week
    with four off costs more than two weeks with three.
    Each component is scaled against the other ${league.teams - 1} teams before weighting.</p>`;

  body.innerHTML = html;
}

/* ---- 11b. Player detail sheet -------------------------- */

let sheetPlayer = null;

function meter(name, score, tone, why) {
  const filled = Math.round(score / 20);
  let segs = "";
  for (let i = 0; i < 5; i++) segs += `<i class="${i < filled ? "on" : ""}"></i>`;
  return `<div class="sig ${tone}">
      <div class="sig-head"><b>${name}</b><span>${label(score)}</span></div>
      <div class="sig-seg">${segs}</div>
      ${why.length ? `<p class="sig-why">${why.join(" &middot; ")}</p>` : ""}
    </div>`;
}

// Decide which columns a stat table shows. Driven by position, with two
// extras that only appear when there is something in them: passing for a
// non-quarterback trick play, and returns for anyone who runs kicks back.
// Most keys map straight onto the stored data. Return touchdowns are the
// exception: they are stored separately for kicks and punts and combined here.
function cellValue(row, key) {
  if (key === "rtd") {
    const total = (row.krt || 0) + (row.prt || 0);
    return total || undefined;
  }
  return row[key];
}

function logColumns(player, sample, isSeason) {
  const firstHead = isSeason ? "Year" : "Wk";
  const has = (k) => sample.some((row) => row && row[k]);

  let head = [firstHead, "Pts"];
  let keys = ["w", "pts"];

  if (player.pos === "QB") {
    head = head.concat(["Att", "Cmp", "PaYd", "PaTD", "INT", "RuAtt", "RuYd", "RuTD"]);
    keys = keys.concat(["pa", "pc", "py", "pt", "pi", "ra", "ry", "rt"]);
  } else if (player.pos === "K") {
    head = head.concat(["FG", "XP"]);
    keys = keys.concat(["fg", "xp"]);
  } else if (player.pos === "DST") {
    head = head.concat(["Sack", "INT", "FumRec"]);
    keys = keys.concat(["sk", "in", "fr"]);
  } else {
    // RB, WR and TE all get the full receiving AND rushing line. A back who
    // catches 80 passes and a receiver who takes jet sweeps both matter.
    head = head.concat(["Tgt", "Rec", "RecYd", "RecTD", "RuAtt", "RuYd", "RuTD"]);
    keys = keys.concat(["tg", "rc", "cy", "ct", "ra", "ry", "rt"]);

    if (has("pa")) {   // the occasional trick-play pass
      head = head.concat(["PaYd", "PaTD"]);
      keys = keys.concat(["py", "pt"]);
    }
  }

  if (player.pos !== "DST" && (has("kry") || has("pry") || has("krt") || has("prt"))) {
    head = head.concat(["KRYd", "PRYd", "RetTD"]);
    keys = keys.concat(["kry", "pry", "rtd"]);
  }

  if (player.pos !== "DST" && player.pos !== "K" && has("fl")) {
    head = head.concat(["FumL"]);
    keys = keys.concat(["fl"]);
  }

  return { head: head, keys: keys };
}

/* Sleeper stores height as a plain count of inches — 67 through 78 across
   our whole pool, no quote forms at all — so it is ours to render. A team
   defense has neither, which is why every part of this line is optional
   rather than dashed out. */
function heightText(inches) {
  const n = Number(inches);
  if (!n || n < 40 || n > 90) return null;
  return Math.floor(n / 12) + "'" + (n % 12) + '"';
}

/* Injury codes as words. The badge on the row has room for two letters and
   the profile has room for the meaning, and "Carrying an Q designation" is
   not a sentence. */
/* The table lives inside the function rather than beside it, and that is
   deliberate. draftSignals() calls this from line 1784 and the top-level
   render() runs at line 730 — both before this point in the file. A function
   declaration hoists and is callable from anywhere; a `const` beside it
   would still be in the temporal dead zone at that moment and would throw.
   Rebuilding six keys per call costs nothing at this rate. */
function injuryWords(code) {
  const words = { Q: "questionable", D: "doubtful", O: "out",
                  IR: "injured reserve", PUP: "physically unable to perform",
                  SUS: "suspended", NA: "not active" };
  return words[code] || String(code);
}

function bioLine(player, s) {
  /* A team defense has no age, height or college, and there is no honest
     dash to print for them — it is eleven people. It gets the one line that
     is true of it instead, rather than an empty strip under the name. */
  if (player.pos === "DST") {
    return `${player.team} team defense &middot; bye ${player.bye}`;
  }
  if (!s) return `ADP ${player.adp.toFixed(1)}`;

  const bits = [];
  if (s.age) bits.push("Age " + s.age);
  const ht = heightText(s.ht);
  if (ht) bits.push(ht);
  if (s.wt) bits.push(s.wt + " lb");
  if (s.exp !== undefined) bits.push(s.exp === 0 ? "Rookie" : s.exp + " yrs exp");
  if (s.col) bits.push(escHtml(s.col));
  if (s.depth) bits.push(s.depth + (s.order ? " #" + s.order : ""));

  return bits.join(" &middot; ");
}

/* The line Sleeper puts under a player's name: where he ranks, and where the
   market has him. Ours differs in one way worth keeping — their "% rostered"
   is telemetry from their own userbase, which we have no equivalent of and
   would be guessing at. What we can say instead is what our model thinks,
   which is the thing they cannot. */
function rankRow(player) {
  const score = overallScore(player);
  /* "Overall" is the board rank here and has always meant that. The score
     beside it used to carry the same word in the queue, the meter and the
     table header, so the strip and the meter below it were the same number
     under two names with nothing saying so. One name now — the score is the
     Juke score everywhere, and this cell keeps Overall for the rank. */
  const cells = [
    ["#" + player.overall, "Overall"],
    [posLabel(player.pos) + player.posRank, "Position"],
    [player.adp.toFixed(1), "ADP"],
    ["T" + player.tier, "Tier"],
    [score === null ? "&mdash;" : Math.round(score), "Juke score"]
  ];
  return `<div class="rankrow">` + cells.map(function (c) {
    return `<div class="rankcell"><b>${c[0]}</b><span>${c[1]}</span></div>`;
  }).join("") + `</div>` + jukeNote(player);
}

/* What the number in that strip actually means, next to the number itself.
   The sheet did explain it — in the method paragraph under three meters, past
   the fold, using the other name — which is a long way from the figure that
   raised the question.

   Both halves are derived from work already done: overallReason() has existed
   all along and was reachable only as a `title` tooltip on a table cell, which
   is to say not at all on a phone. */
function jukeNote(player) {
  const bits = [];

  /* A position we decline to rank says so first, and then stops. The lines
     below are all about a score that does not exist here, and "projects K3,
     drafted as K1" invites exactly the comparison the backtest says is
     worthless. */
  if (player.projPts !== null && overallScore(player) === null) {
    return `<p class="jukenote"><b>Not rated</b> &mdash; the projection ranks this
      position no better than chance, measured against three seasons of our own
      forecasts, so the Juke score is left blank rather than guessed at.</p>`;
  }

  const gap = replacementGap(player);
  if (gap !== null && gap < 0) {
    /* What a clamped zero is actually saying. Below replacement is not the
       same as worthless: of the players who scored zero on 2024 actuals, 35%
       were above it a year later and nine of them reached 25.

       The size of the gap is deliberately not repeated here — the sentence
       after this one already carries it, and printing "below replacement by
       37 points · 137 projected points, -37 against a replacement WR" says
       the same number twice in a row. This clause exists to give the floor a
       name and a landmark; the arithmetic belongs to the line that follows. */
    bits.push(`<b>Below replacement</b> &mdash; startable ${posLabel(player.pos)}
      territory begins at ${posLabel(player.pos)}${replacementRank(player.pos)}
      on this board`);
  }

  // Trailing full stop off, because these are joined by a middot: a sentence
  // ending "drafted as WR37. · Scored 14" reads as a typo rather than a list.
  bits.push(escHtml(overallReason(player)).replace(/\.\s*$/, ""));

  const was = priorScore(player);
  if (was !== null && PRIOR_SEASON) {
    const move = projectionMove(player);
    bits.push(`Scored <b>${Math.round(was)}</b> on ${PRIOR_SEASON} actuals
      (${player.priorGames} game${player.priorGames === 1 ? "" : "s"})${move}`);
  } else if (PRIOR_SEASON) {
    bits.push(`No ${PRIOR_SEASON} season to compare against, so this is the
      projection alone`);
  }

  return `<p class="jukenote">${bits.join(" &middot; ")}</p>`;
}

// Which way the model is betting, and only when the move is big enough to be
// worth a reader's attention. Year-to-year movement in this score is large by
// nature — across real consecutive seasons the mean absolute change is 12 to
// 20 points — so a threshold under that would call noise a bet.
function projectionMove(player) {
  const now = overallScore(player), was = priorScore(player);
  if (now === null || was === null) return "";
  const d = Math.round(now - was);
  if (Math.abs(d) < 15) return "";
  return d > 0 ? `, so the projection is <b>up ${d}</b> on him`
               : `, so the projection is <b>down ${Math.abs(d)}</b> on him`;
}

/* ---- week by week ----------------------------------------

   Logs are stored keyed by season now, so a player gets a selector of the
   years he actually has: three for a rookie's worth of history, both for a
   veteran, none at all for someone outside the weekly cut. Sleeper shows a
   fixed row of five and greys out the ones a player never played; showing
   only what exists says the same thing without the dead tabs. */
let sheetLogPick = null;

function logYears(s) {
  return (s && s.w) ? Object.keys(s.w).sort().reverse() : [];
}

// The year on screen: whatever was last chosen if this player has it, else
// his most recent. Reset per player so opening a rookie after a veteran does
// not land on a year the rookie has never seen.
function sheetLogYear(s) {
  const years = logYears(s);
  if (!years.length) return null;
  return years.indexOf(sheetLogPick) >= 0 ? sheetLogPick : years[0];
}

function logsHtml(player, s, year) {
  const years = logYears(s);
  if (!years.length || !year) {
    return `<div class="nodata">No week-by-week logs stored for this player.</div>`;
  }

  const weeks = s.w[year] || [];
  const picker = years.length < 2 ? "" :
    `<div class="yearpick">` + years.map(function (y) {
      return `<button type="button" class="${y === year ? "on" : ""}" data-logyear="${y}">${y}</button>`;
    }).join("") + `</div>`;

  // Whether a week happened is a question about the raw data, never about
  // what it scored, so both checks go through didPlay(). Listing a handful of
  // stats by hand would call a week blank for anyone whose only contribution
  // was outside that list.
  const played = weeks.filter(didPlay);
  const scored = played.reduce((a, g) => a + fantasyPoints(g), 0);
  // The heading goes through perGame() so an all-bye log reads as a dash
  // rather than a confident 0.0; avg stays a number for the cell tones.
  const avg = played.length ? scored / played.length : 0;
  const cols = logColumns(player, weeks);

  const rows = weeks.map(function (g) {
    const blank = !didPlay(g);
    const points = fantasyPoints(g);
    const cells = cols.keys.map(function (k) {
      const v = k === "w" ? g.w : k === "pts" ? points : cellValue(g, k);
      const tone = k === "pts" && !blank
        ? (points >= avg * 1.4 ? "hi" : points <= avg * 0.5 ? "lo" : "") : "";
      return `<td class="${tone}">${v === undefined ? "&mdash;" : v}</td>`;
    }).join("");
    return `<tr class="${blank ? "bye" : ""}">${cells}</tr>`;
  }).join("");

  return `${picker}
    <p class="section-label">${year} week by week &middot; ${perGame(scored, played.length)} per game played</p>
    <div class="tblscroll"><table class="logtbl">
      <thead><tr>${cols.head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

/* ---- latest news -----------------------------------------

   Headlines about this player, fetched through the worker so the provider's
   key is never in the page. It sits directly under "Our read" on purpose:
   ours first, because it is the thing no feed has, then the wire.

   **It is a link, not a reprint.** Headline, one clipped line, the source's
   name and an outbound link. Reproducing the body is what a licence buys; an
   aggregator's headline and a link back is not that, and the attribution is
   not decoration — an unsourced headline is the version we may not show.

   **Every field is escaped.** This is the third thing on the page written by
   somebody outside this project, after chat and the ESPN strip, and it lands
   in innerHTML. The same rule applies for the same reason.

   **It never blocks, never throws and fails by disappearing** — the score
   strip's contract. A sheet opens with the panel hidden and it only appears
   if headlines arrive. No spinner: a permanently-empty box on a page that is
   otherwise complete is worse than no box, and this is a section a reader
   never asked to wait for. */
const newsCache = new Map();
const NEWS_SUMMARY_MAX = 200;

/* What stands in for the meter at a position we will not score.

   An empty bar reading "Very Low" is what a null produces if you let it
   through, and that is a verdict rather than an abstention — the one reading
   further from the truth than the number it replaced. Saying nothing at all
   is not right either: the meter is missing and the reader deserves to know
   it was removed on purpose. */
function unratedNote(player) {
  const what = player.pos === "DST" ? "defenses" : "kickers";
  return `<div class="sig unrated">
      <div class="sig-head"><b>Juke score</b><span>Not rated</span></div>
      <p class="sig-why">Graded against three seasons of our own past forecasts,
        the projection ranks ${what} no better than chance &mdash; one of those
        seasons came out backwards. Rather than print a number we know carries
        no signal, we leave it blank. The projected points below are still real,
        and ${player.pos === "DST" ? "a defense" : "a kicker"} is worth taking
        late whoever it is.</p>
    </div>`;
}

function newsSlot() {
  // Hidden until there is something to say. The stylesheet gives .newsbox a
  // display, so it carries its own [hidden] rule — an author display beats
  // the property, which is how a solo draft once grew a chat panel.
  return `<div class="newsbox" id="newsPanel" hidden></div>`;
}

function newsHtml(items) {
  // No heading: the tab is the heading. It carried one while this lived under
  // Our read on the Overview tab, where it needed to announce itself.
  return items.map(function (n) {
    const when = escHtml(String(n.at || "").slice(0, 24));
    return `<a class="newsitem" href="${escHtml(safeNewsUrl(n.url))}"
               target="_blank" rel="noopener noreferrer">
        <span class="newshead">${escHtml(n.title)}</span>
        ${n.summary ? `<span class="newssum">${escHtml(String(n.summary).slice(0, NEWS_SUMMARY_MAX))}</span>` : ""}
        <span class="newsfoot">${escHtml(n.source)}${when ? " &middot; " + when : ""}</span>
      </a>`;
  }).join("") +
  `<p class="readnote">Headlines from our news provider, linked rather than
     reproduced. Juke does not write these and does not endorse them.</p>`;
}

// One worker-supplied item, turned into exactly what the React news tab
// renders — the URL check (safeNewsUrl) and the clipping (NEWS_SUMMARY_MAX)
// live here rather than in React, for the same reason sourceId() does: a
// field from a feed we do not control is not something to re-check in two
// places. Returns null for anything missing a title or a safe link, the
// same filter newsHtml() already applies before it draws a card.
function newsItemView(n) {
  if (!n || !n.title) return null;
  const url = safeNewsUrl(n.url);
  if (!url) return null;
  return {
    title: n.title,
    summary: n.summary ? String(n.summary).slice(0, NEWS_SUMMARY_MAX) : "",
    /* Never empty. An unattributed headline is the version of this we may
       not show at all - we link rather than republish, and the attribution
       is most of what makes that true - so the source falls back rather than
       blanking.

       It falls back to the link's *hostname*, not to the provider. Measured
       against the real feed rather than guessed: Tank01 returns a title, a
       link and an image and no source field at all, so naming them would be
       wrong twice - they are the aggregator rather than the author, and
       "TANK01" tells a reader nothing about whether to trust the line. The
       link is the honest answer. Parsed with URL rather than a regex, and
       the www. is dropped because it is noise rather than identity. */
    source: n.source || sourceFromUrl(url),
    when: String(n.at || "").slice(0, 24),
    url: url
  };
}

function sourceFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (err) {
    return "";
  }
}

/* A link from a feed is a claim, not a fact — the same rule the GIF host gets,
   and checked the same way with URL rather than a substring. Anything that is
   not plain http(s) is dropped: a javascript: or data: href here would be an
   outside party running script in the page, which is the one thing this
   codebase is most arranged to prevent. */
function safeNewsUrl(url) {
  try {
    const u = new URL(String(url), location.href);
    return (u.protocol === "https:" || u.protocol === "http:") ? u.href : "";
  } catch (err) {
    return "";
  }
}

/* This player's id at another source, from the crosswalk the pipeline builds.

   The whole point of holding it is that nothing has to match on a name while
   somebody is reading a profile. A name search at request time is how one Josh
   Allen ends up wearing the other one's news — and every number on the sheet
   around it would still be correct, so nobody would catch it. */
function sourceId(player, source) {
  const s = statOf(player);
  return (s && s.x && s.x[source]) || "";
}

function renderNews(player) {
  const panel = $("newsPanel");
  const tab = $("newsTab");
  if (!panel || !player) return;

  /* Hidden first, every time. The sheet is one element reused for everybody,
     so a tab left showing from the last player is a tab that opens onto his
     headlines under this player's name. */
  panel.hidden = true;
  panel.innerHTML = "";
  if (tab) tab.hidden = true;

  if (typeof Live === "undefined" || !Live.news) return;

  /* No id, no news. Deliberately not a fallback to a name or to league-wide
     headlines: an empty panel is a player we could not link, and the pipeline
     has already written him into unmatched.txt. Showing somebody else's news
     under his name is the one outcome worse than showing none. */
  const theirId = sourceId(player, "tank");
  if (!theirId) return;

  const key = player.id || player.name;

  /* Which player this answer belongs to, checked when it lands rather than
     when it was asked for. A slow response for the player you just closed
     would otherwise render into the sheet you have open now — the sheet is
     one element reused for everybody, so nothing else would have caught it. */
  const draw = function (data) {
    if (!sheetPlayer || (sheetPlayer.id || sheetPlayer.name) !== key) return;
    const items = (data && data.items || []).filter((n) => n && n.title && safeNewsUrl(n.url));
    if (!items.length) return;
    const live = $("newsPanel");
    if (!live) return;
    live.innerHTML = newsHtml(items);
    live.hidden = false;
    const liveTab = $("newsTab");
    if (liveTab) liveTab.hidden = false;
  };

  if (newsCache.has(key)) { draw(newsCache.get(key)); return; }

  Live.news(theirId).then(function (data) {
    // Cached per player for the session, because a draft opens the same sheet
    // repeatedly and a headline does not change inside one.
    newsCache.set(key, data);
    draw(data);
  }).catch(function () { /* the panel simply stays hidden */ });
}

/* ---- our read --------------------------------------------

   Sleeper fills a whole column of a player profile with wire copy from
   Rotowire. We cannot republish that and would not want to — see the note in
   CLAUDE.md — but the space is the most valuable on the page, and leaving it
   empty concedes the comparison.

   So this is the thing we have that a feed does not: the model, saying in
   sentences what the meters below say in bars. Every clause is derived from
   figures already computed for this player. Nothing here is fetched, nothing
   is an opinion typed by a person, and nothing claims to be news. */
function ourRead(player, s, sig) {
  const lines = [];

  /* A team defense is not a "him". Every other position in this pool is a
     person and the NFL's are all men, so "him" is accurate there and reads
     better than the alternatives; a defense gets its own phrasing rather
     than a pronoun. */
  const them = player.pos === "DST" ? "this defense" : "him";
  const They = player.pos === "DST" ? "This defense is" : "He is";

  // Where the market and the model disagree, which is the whole game.
  const gap = marketGap(player);
  /* At a position we decline to score, the projected rank is the very thing
     the backtest found worthless — so "K1 on the projection" is an argument
     from a number we have just told the reader not to trust. The timing is
     what actually matters here, and the app already enforces it. */
  if (overallScore(player) === null && player.projPts !== null) {
    lines.push(`The projection cannot separate ${player.pos === "DST" ? "defenses" : "kickers"}
      well enough to be worth acting on, so take one late and take whoever is
      there. This one is drafted around <b>${posLabel(player.pos)}${player.posRank}</b>.`);
  } else if (player.projPosRank) {
    if (gap >= MARKET_GAP) {
      lines.push(`The board has ${them} at <b>${posLabel(player.pos)}${player.posRank}</b> and the projection
        says <b>${posLabel(player.pos)}${player.projPosRank}</b> — ${gap} places of daylight in your favour.
        That is the kind of gap that pays for a pick.`);
    } else if (gap <= -MARKET_GAP) {
      lines.push(`The room is drafting ${them} at <b>${posLabel(player.pos)}${player.posRank}</b> and the
        projection only supports <b>${posLabel(player.pos)}${player.projPosRank}</b>. Taking ${them} here
        means paying ${Math.abs(gap)} places above what the numbers carry.`);
    } else {
      lines.push(`Priced about right: <b>${posLabel(player.pos)}${player.posRank}</b> on the board,
        <b>${posLabel(player.pos)}${player.projPosRank}</b> on the projection.`);
    }
  }

  // Tier scarcity — the reason to reach a round early, or wait one out.
  const left = board.filter(function (o) {
    return !o.drafted && o.pos === player.pos && o.tier === player.tier;
  }).length;
  if (left > 0) {
    lines.push(left === 1
      ? `${They} the <b>last ${player.pos} in tier ${player.tier}</b>. After ${them} the drop is a
         tier, not a pick.`
      : `<b>${left} ${player.pos}s left in tier ${player.tier}</b>, so the position does not force
         your hand yet.`);
  }

  // Where he sits on his own depth chart, which is the cheapest available
  // read on whether the projection has a route to happening.
  if (s && s.depth && s.order) {
    lines.push(s.order === 1
      ? `Listed <b>first on the ${player.team} depth chart</b> at ${s.depth}.`
      : `Listed <b>${s.order}${s.order === 2 ? "nd" : s.order === 3 ? "rd" : "th"}</b>
         at ${s.depth} for ${player.team}, which is the risk the projection is carrying.`);
  }

  if (player.inj) {
    lines.push(`Listed <b>${escHtml(injuryWords(player.inj))}</b>. The model docks for it; how much
      it should worry you is a question about your bench, not about ${them}.`);
  }

  // Availability, from games actually played rather than from a narrative.
  const last = lastSeason(s);
  if (last && last.gp !== undefined && last.gp < 14) {
    lines.push(`Played <b>${last.gp} games</b> last season. A projection is a per-season number
      and it assumes ${player.pos === "DST" ? "a full one" : "he is on the field for it"}.`);
  }

  if (!lines.length) return "";

  return `<div class="ourread">
      <p class="section-label">Our read</p>
      ${lines.map((l) => `<p>${l}</p>`).join("")}
      <p class="readnote">Worked out from this board and these projections, under your scoring.
        It is one model's opinion, not a wire report and not a consensus.</p>
    </div>`;
}

/* ---- data for the React player card ---------------------

   web/src/components/PlayerProfileDrawer.jsx has always had these four
   tabs; they carried placeholder copy because the real data lives here and
   nothing had bridged it yet. Each function below reuses the exact same
   helpers openSheet() already builds the legacy sheet from — logColumns(),
   cellValue(), didPlay(), logYears(), sourceId() — rather than a second
   reading of the same stats, which is the "nothing about the league shape
   may be written down twice" rule applied to a player's data instead. */

// The current season's projected stat line — points, per-game, position
// rank, the gap against where the board has him, and the underlying
// counting stats for his position (logColumns() picks those the same way
// it picks a week's columns, given a one-row sample).
function projectionSummary(player) {
  const s = statOf(player);
  const p = s && s.p;
  if (!p || !p.gp) return null;

  const cols = logColumns(player, [p]);
  const stats = cols.keys
    .map((k, i) => ({ key: k, label: cols.head[i], value: cellValue(p, k) }))
    .filter((row) => row.key !== "w" && row.key !== "pts" && row.value !== undefined);

  return {
    points: Math.round(fantasyPoints(p)),
    perGame: perGame(fantasyPoints(p), projGames(player.pos, p)),
    posRank: player.projPosRank ? posLabel(player.pos) + player.projPosRank : null,
    // Positive means the projection likes him better than the board does —
    // same sign convention as the draft-value gap elsewhere on the sheet.
    vsAdp: player.projPosRank ? player.posRank - player.projPosRank : null,
    stats: stats
  };
}

// Week-by-week actuals for one year, defaulting to the most recent year
// this player has, plus the list of years so the tab can draw its own
// picker. Mirrors logsHtml() exactly, but returns rows rather than markup
// — React owns how a row is drawn, this only owns which weeks and which
// columns are correct for this player.
function gameLogFor(player, year) {
  const s = statOf(player);
  const years = logYears(s);
  const y = years.indexOf(year) >= 0 ? year : years[0];
  if (!y) return { years: years, year: null, head: [], rows: [], perGameAvg: null };

  const weeks = s.w[y] || [];
  const cols = logColumns(player, weeks);
  const played = weeks.filter(didPlay);
  const scored = played.reduce((a, g) => a + fantasyPoints(g), 0);
  const avg = played.length ? scored / played.length : 0;

  const rows = weeks.map(function (g) {
    const blank = !didPlay(g);
    const points = fantasyPoints(g);
    return {
      blank: blank,
      tone: blank ? "" : points >= avg * 1.4 ? "hi" : points <= avg * 0.5 ? "lo" : "",
      cells: cols.keys.map(function (k) {
        const v = k === "w" ? g.w : k === "pts" ? Math.round(points) : cellValue(g, k);
        return v === undefined ? null : v;
      })
    };
  });

  return { years: years, year: y, head: cols.head, rows: rows, perGameAvg: perGame(scored, played.length) };
}

// Every drafted-pool teammate who carries a depth-chart entry, grouped by
// position group and ordered within it — the exact grouping openSheet()
// already built, just handed back as data instead of painted into one.
function depthChartFor(player) {
  const mates = board.filter(function (other) {
    const os = statOf(other);
    return other.team === player.team && os && os.depth;
  });
  if (!mates.length) return null;

  const groups = {};
  mates.forEach(function (m) {
    const g = statOf(m).depth;
    (groups[g] = groups[g] || []).push(m);
  });

  return Object.keys(groups).sort().map(function (g) {
    const list = groups[g].sort((a, b) => (statOf(a).order || 9) - (statOf(b).order || 9));
    return {
      group: g,
      players: list.map(function (m) {
        return {
          name: m.name,
          pos: m.pos,
          order: statOf(m).order || null,
          adp: m.adp,
          isSelf: m === player
        };
      })
    };
  });
}

/* Usage, from the `u` block nflverse writes. This is the only data on the
   sheet that does not come from Sleeper, and the only thing on it that
   answers "why did he score that" rather than "how much is he worth".

   It is never scored. `u` is not in STAT_FIELDS or SCOREABLE, pointsUnder()
   never sees it, and nothing here feeds overallScore(), suggestions() or
   cpuChoice() — measured at the time it was added, no usage metric beat
   points per game as a predictor of next season's points, and the best any
   of them managed on top of points per game was +0.008 r. So it explains a
   number the app already shows and does not become one.

   Which columns are meaningful is a football question, so it is answered
   here beside logColumns() rather than in a component. A quarterback has no
   target share; a kicker has nothing but his game-winners. */
/* xFP leads and its delta sits beside it, because together they are the
   sentence the whole tab exists to say: what his role was worth, and how far
   he beat or trailed it. The shares and EPA that follow are the explanation.
   Backtested (2018-2025, ffopportunity data): an xFP composite is the best
   backward-looking predictor at every position and still loses to the
   projection the Juke score runs on, so these stay display-only like
   everything else here. */
const USAGE_COLUMNS = {
  QB:  ["xf", "xd", "pep", "cpo", "rep", "r20"],
  RB:  ["xf", "xd", "ts", "rep", "ep", "r20"],
  WR:  ["xf", "xd", "ts", "ays", "wo", "ep"],
  TE:  ["xf", "xd", "ts", "ays", "wo", "ep"],
  K:   ["gwa", "gwm"]
};

const USAGE_LABELS = {
  ts: "TGT%", ays: "AY%", wo: "WOPR", ep: "REC EPA", rep: "RUSH EPA",
  pep: "PASS EPA", cpo: "CPOE", r20: "20+ RUN", gwa: "GW ATT", gwm: "GW MADE",
  xf: "xFP", xd: "±xFP"
};

// A share is a proportion and reads as a percentage; EPA is a points figure
// and carries its sign, because a negative one is the whole point of it.
// WOPR is a conventional index and is left as the number everyone quotes.
const USAGE_SHARES = { ts: true, ays: true };

// The two expected-points figures, which carry a caveat the others do not:
// they are the ffopportunity model's own scoring, so the scoring editor
// cannot move them. usageFor() flags it so the tab can say so.
const USAGE_MODEL = { xf: true, xd: true };

function usageCell(key, value) {
  if (value === undefined || value === null) return null;
  if (USAGE_SHARES[key]) return (value * 100).toFixed(1) + "%";
  if (key === "cpo") return (value > 0 ? "+" : "") + value.toFixed(1);
  // xd is actual minus expected, signed for the same reason EPA is: which
  // side of his role's worth he landed on is the whole fact.
  if (key === "ep" || key === "rep" || key === "pep" || key === "xd") {
    return (value > 0 ? "+" : "") + value.toFixed(1);
  }
  if (key === "xf") return value.toFixed(1);
  return String(value);
}

function usageFor(player) {
  // Guarded here rather than at the call site, the same way draftFit() is:
  // statOf() already answers null before PLAYER_STATS has landed, so the
  // only thing left to refuse is having no player at all.
  if (!player) return null;
  const s = statOf(player);
  const u = s && s.u;
  const allKeys = USAGE_COLUMNS[player.pos];
  if (!u || !allKeys) return null;

  /* The model columns are absent, not dashes, until the data exists. This
     app.js can deploy ahead of the stats.js the nightly regenerates, and an
     unjoined player never gets `xf` at all -- either way a column of em
     dashes under a header is a promise the data is not keeping, the same
     rule that hides the whole tab rather than showing it empty. The other
     columns keep their dashes: a missing single year inside a column that
     exists is a fact about that year, not about the column. */
  const years = Object.keys(u);
  const keys = allKeys.filter(function (k) {
    return !USAGE_MODEL[k] || years.some((y) => u[y][k] !== undefined);
  });

  const rows = Object.keys(u).sort().reverse().map(function (year) {
    const block = u[year];
    const cells = keys.map((k) => usageCell(k, block[k]));
    if (!cells.some((c) => c !== null)) return null;
    const season = (s.s || {})[year];
    return {
      year: year,
      // The denominator honesty. A share is over the team's whole season,
      // never over the games he played, so a player who missed six weeks
      // shows a depressed share that is arithmetically right and answers a
      // different question from the one being asked. Same rule as
      // projectionRecord()'s own games column, and a DST never gets here.
      games: season && season.gp ? season.gp : null,
      cells: cells
    };
  }).filter(Boolean);

  if (!rows.length) return null;
  return {
    head: keys.map((k) => USAGE_LABELS[k]),
    rows: rows,
    // So the component knows whether the denominator caveat is worth saying:
    // a quarterback's row carries no share and the note would be noise.
    hasShare: keys.some((k) => USAGE_SHARES[k]),
    // And whether the scoring-editor caveat is: xFP is the ffopportunity
    // model's own scoring, the one pair of figures on the sheet the editor
    // cannot rescore, and that must be said where the number is.
    hasModel: keys.some((k) => USAGE_MODEL[k])
  };
}

function openSheet(player) {
  sheetPlayer = player;
  const s = statOf(player);
  const sig = draftSignals(player);

  /* The club's colour, handed to the stylesheet as a property rather than as
     a fill. Set on the header so both the ring and the band below it inherit
     one value, and removed rather than blanked for a player with no club, so
     the rule falls back to its own default instead of to an empty string. */
  const accent = teamAccent(player);
  if (accent) $("sheetHead").style.setProperty("--team", accent);
  else $("sheetHead").style.removeProperty("--team");

  $("sheetHead").innerHTML = `
    ${avatar(player)}
    <div>
      <h3>${player.name}</h3>
      <div class="sub">
        <span class="badge ${player.pos}">${posLabel(player.pos)}</span>
        ${player.team} &middot; Bye ${player.bye} ${injBadge(player)}
      </div>
      <div class="facts">
        ${bioLine(player, s)}
      </div>
      ${rankRow(player)}
    </div>
    <button class="sheet-close" id="sheetClose">&times;</button>`;

  // ---------- overview ----------
  let overview;
  if (!sig) {
    overview = `<div class="nodata">No projection or stat history for this player yet.
      The data refresh fills this in for anyone Sleeper carries.</div>`;
  } else {
    const p = sig.stats.p || {};
    overview = `
      ${ourRead(player, s, sig)}
      ${sig.overall === null
          ? unratedNote(player)
          : meter("Juke score", sig.overall, sig.overall >= 55 ? "good" : "", sig.reasons.overall)}
      ${meter("Upside",  sig.upside,  sig.upside  >= 55 ? "good" : "", sig.reasons.upside)}
      ${meter("Bust risk", sig.bust,  sig.bust >= 55 ? "bad" : sig.bust >= 35 ? "warn" : "", sig.reasons.bust)}

      <p class="section-label">2026 projection &middot; ${scoringLabel()}</p>
      <div class="statgrid">
        <div class="statbox"><div class="k">Points</div><div class="v">${Math.round(fantasyPoints(p))}</div></div>
        <div class="statbox"><div class="k">Per game</div><div class="v">${perGame(fantasyPoints(p), projGames(player.pos, p))}</div></div>
        <div class="statbox"><div class="k">Pos rank</div><div class="v">${player.projPosRank ? posLabel(player.pos) + player.projPosRank : "&mdash;"}</div></div>
        <div class="statbox"><div class="k">vs ADP</div><div class="v">${player.projPosRank ? (player.posRank - player.projPosRank >= 0 ? "+" : "") + (player.posRank - player.projPosRank) : "&mdash;"}</div></div>
      </div>
      <p class="method">${overallScore(player) === null ? `Kickers and defenses carry no Juke
      score: measured against three seasons of archived forecasts the projection ranks them no
      better than chance, so the number is withheld rather than guessed at. Everything else on
      this sheet &mdash; the projection, the history, the depth chart &mdash; is unaffected.` : ``}
      ${overallScore(player) !== null ? `The Juke score is projected points above the last startable player at
      this position in a ${league.teams}-team league &mdash; ${player.pos}${replacementRank(player.pos)} on
      this board &mdash; as a share of the best such figure anywhere on it. It is a ranking against
      the rest of the pool, so somebody always scores 100, and most of the ${board.length} players
      here score nothing at all &mdash; this league only ever starts
      ${league.teams * (starterCount() + flexCount())} of them at once.` : ``}
      Upside and bust risk weigh how far the projection disagrees with ADP,
      plus experience, age, depth chart position, injury designation and last season's availability.
      This is one model, not a consensus of analysts.</p>`;
  }

  // ---------- game logs ----------
  // Column set is chosen from player.pos, never from whether a stat happens
  // to be present. A running back who threw one trick-play pass is still a
  // running back, and needs his receiving line.
  const logs = logsHtml(player, s, sheetLogYear(s));

  // ---------- seasons ----------
  let seasons;
  if (!s || (!s.s && !s.p)) {
    seasons = `<div class="nodata">No season history stored for this player.</div>`;
  } else {
    const years = seasonKeys(s).map((y) => [y, s.s[y]]);
    if (s.p) years.push(["2026 proj", s.p]);

    /* Which columns to show is decided from a sample of every line we have,
       so a column is not dropped because the one season on screen happened
       to be empty. s.w is keyed by season now, so this walks the years
       rather than concatenating an array. */
    const sample = years.map((y) => y[1]);
    logYears(s).forEach(function (y) { sample.push.apply(sample, s.w[y]); });
    const cols = logColumns(player, sample, true);

    const rows = years.map(function (entry) {
      const y = entry[1];
      const cells = cols.keys.map(function (k) {
        if (k === "w") return `<td>${entry[0]}</td>`;
        const v = k === "pts" ? Math.round(fantasyPoints(y)) : cellValue(y, k);
        return `<td>${v === undefined ? "&mdash;" : v}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");

    const span = seasonKeys(s);
    seasons = projectionRecordHtml(player) +
      `<p class="section-label">${span.length ? span[0] + " to " + span[span.length - 1] : "Career"}
      &middot; ${scoringLabel()}, 6 points per touchdown</p>
      <div class="tblscroll"><table class="logtbl">
        <thead><tr>${cols.head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  // ---------- depth chart ----------
  const mates = board.filter(function (other) {
    const os = statOf(other);
    return other.team === player.team && os && os.depth;
  });

  let depth;
  if (!mates.length) {
    depth = `<div class="nodata">No depth chart data for ${player.team}.</div>`;
  } else {
    const groups = {};
    mates.forEach(function (m) {
      const g = statOf(m).depth;
      (groups[g] = groups[g] || []).push(m);
    });
    depth = Object.keys(groups).sort().map(function (g) {
      const list = groups[g].sort((a, b) => (statOf(a).order || 9) - (statOf(b).order || 9));
      return `<div class="depthcol"><h5>${g}</h5>` + list.map(function (m) {
        return `<div class="depthrow ${m === player ? "self" : ""}">
            <span class="ord">${statOf(m).order || "&ndash;"}</span>
            <span class="badge ${m.pos}">${posLabel(m.pos)}</span>
            <span>${m.name}</span>
            <span class="rpick">ADP ${m.adp.toFixed(1)}</span>
          </div>`;
      }).join("") + `</div>`;
    }).join("");
    depth += `<p class="method">Only players inside the draftable pool appear here,
      so this is the fantasy-relevant depth chart rather than the full roster.</p>`;
  }

  $("sheetBody").innerHTML = `
    <div class="sheet-view on" id="v-overview">${overview}</div>
    <div class="sheet-view" id="v-news">${newsSlot()}</div>
    <div class="sheet-view" id="v-logs">${logs}</div>
    <div class="sheet-view" id="v-seasons">${seasons}</div>
    <div class="sheet-view" id="v-depth">${depth}</div>`;

  /* Back to Overview on every open. By view name rather than by index: a
     hidden Latest News tab sits second in the strip, so "the first button" and
     "the tab we want" stopped being the same thing. */
  document.querySelectorAll("#sheetTabs button").forEach(function (b) {
    b.classList.toggle("on", b.dataset.view === "v-overview");
  });
  document.querySelectorAll(".sheet-view").forEach(function (v) {
    v.classList.toggle("on", v.id === "v-overview");
  });

  $("sheet").hidden = false;
  $("sheetBackdrop").hidden = false;
  $("sheetBody").scrollTop = 0;

  // After the panel exists in the DOM and after the sheet is on screen: this
  // fills in later, over the network, and must never be something the sheet
  // waits for.
  renderNews(player);
}

function closeSheet() {
  sheetPlayer = null;
  $("sheet").hidden = true;
  $("sheetBackdrop").hidden = true;
}

function render() {
  renderHeader();
  renderTicker();
  renderGrades();
  if (state.started) renderActionBar();
  // The shell is the board and the rail, which only mean anything once a
  // draft is running. Before that the setup screen has the page to itself.
  $("draftShell").hidden = !(route() === "draft" && state.started);

  renderSuggestions();
  renderQueue();
  renderRail();
  // In here rather than only on a broadcast, because the dock has to follow
  // the route: it lives beside the setup screen in the lobby and beside the
  // board once the draft is running. Cheap when there is no room at all.
  renderChat();
  renderPlayers();
  renderBoard();
  renderTeam();
  renderPicks();
  saveDraft();

  /* Last, and after saveDraft(), because it can change which panel is on
     screen and everything above it should have drawn first. One call here
     covers every route to the final pick — your own, the CPU loop,
     auto-drafting the rest, and a room broadcasting that it is done. */
  checkDraftFinished();
}


/* ---- 11c. Saving and resuming --------------------------

   The whole draft is a slot, a clock length, a random seed
   and an ordered list of player names. That is small enough
   to keep in the browser, so a refresh no longer destroys a
   draft in progress.                                       */

const SAVE_KEY = "alpine-draft-room-v1";

// Every setting that changes the shape of the board, in one string. Two
// drafts with the same fingerprint can be swapped; two without cannot,
// because the snake maths, the round count and the ADP set all differ.
function settingsFingerprint(cfg) {
  // `|| 0` rather than the bare value: a draft saved before superflex existed
  // has no such key, and it was a league with no superflex, so reading it as
  // zero is both the correct shape and what keeps that save resumable.
  return [cfg.teams, cfg.rounds, cfg.scoring, cfg.flex, cfg.superflex || 0, cfg.bench]
    .concat(POSITIONS.map((pos) => cfg.starters[pos]))
    .join("-");
}

// Turned back into something a human can read, for the refusal message.
/* One sentence describing a league's shape, for a shut settings box, a
   header, a Locker row and a room's own summary.

   Both functions below print the same four core facts and then whatever
   is NOT the default, and only that. A summary that lists every setting is
   a settings screen with worse formatting; a summary that lists none of the
   unusual ones lets somebody sit in a linear rookies-only draft with the
   header cheerfully reading "10 teams · 14 rounds · Half PPR" — which is
   the "right value, wrong column" failure with a whole missing column. So
   snake and an all-players pool say nothing, because they are what a reader
   already assumes, and anything else says itself. */
function shapeExtras(cfg) {
  const bits = [];
  if (cfg.draftType === "linear") bits.push("Linear");
  if (cfg.thirdRoundReversal) bits.push("3RR");
  if (cfg.playerPool === "rookies") bits.push("Rookies only");
  if (cfg.playerPool === "vets") bits.push("Vets only");
  return bits;
}

function settingsText(cfg) {
  return [
    `${cfg.teams} teams`, `${cfg.rounds} rounds`, scoringLabel(cfg.scoring)
  ].concat(shapeExtras(cfg)).join(" · ");
}

function saveDraft() {
  // hasRoom(), not inRoom() — see the distinction CLAUDE.md draws between
  // them: inRoom() is Live.active(), which blips false during an ordinary
  // reconnect, and a save written during that blip would still be a room
  // draft's picks sitting under the exact same key a solo draft resumes
  // from. A room member's real way back in is the invite link/room code,
  // which already reconnects correctly (see live.js's own reconnect-on-
  // visibilitychange/pageshow logic) — this key was never a working
  // second path for that, only an accidental one. Confirmed reachable:
  // close the tab on a room draft without using "Leave the room" (an
  // ordinary way to lose a tab, not a deliberate departure), come back
  // with no ?room= code, and the Locker showed an "in progress" band
  // indistinguishable from a solo draft. "Resume draft" rebuilt state
  // purely from the saved name list — it never touched Live or the
  // socket — so it silently forked the draft into an offline solo
  // continuation against CPUs while the real room carried on without
  // this seat, with nothing on screen saying that had happened.
  if (!state.started || hasRoom()) return;
  // Built once and reused for the network push below, rather than reading
  // it back out of localStorage a second time — that would also silently
  // skip the sync on exactly the browsers where the write above just
  // failed (private browsing, a full quota), which is the one case a
  // server copy is worth the most.
  const data = {
    v: 2,
    mySlot: state.mySlot,
    clockLength: state.clockLength,
    paused: state.paused,
    seed: state.seed,
    // Stored whole, not just as a fingerprint, so the resume banner can
    // describe the saved league and the refusal can name what it wants.
    league: JSON.parse(JSON.stringify(league)),
    fingerprint: settingsFingerprint(league),
    picks: state.picks.map((p) => p.player.name),
    queue: state.queue.slice(),
    watchlist: state.watchlist.slice(),
    savedAt: Date.now(),
    // When the draft actually began, not when it was last saved (savedAt,
    // above) — the Locker's in-progress band wants "Started 14 min ago",
    // which has to survive every autosave between now and a resume.
    startedAt: state.startedAt,
    // Which Practice-a-scenario card started this, if one did. Saved so a
    // resumed scenario draft is still recorded as one when it finishes —
    // without it, walking away from a scenario mock and coming back to it
    // silently untags the only draft the signed-in scenario set can learn
    // from. Absent on every save written before scenarios existed, which
    // reads as null on the way back in.
    scenario: state.scenario || null
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (err) {
    // Private browsing and full quotas both land here. Losing the save is
    // not worth breaking the draft over.
  }
  pushSavedDraft(data);
}

// Version 1 saves carry no league at all and were all ten-team, fourteen
// round, half PPR. Rather than guess, they are simply not resumable.
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!(data && data.v === 2 && data.picks && data.league)) return null;
    // A save written before superflex existed has no such key, and every
    // sum that reads it would come out NaN. It was a league without one,
    // so fill in what it actually was rather than refusing the save.
    if (data.league.superflex === undefined) data.league.superflex = 0;
    return data;
  } catch (err) {
    return null;
  }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (err) {}
  pushDraftCleared();
}

function resumeDraft(data) {
  // Resuming into different settings would corrupt the board: the snake turns
  // in different places, the rounds run out at a different pick, and a full
  // PPR board is not in the same order. Refuse, but keep the save, because
  // unlike a stale player list this one is fixed by setting the dropdowns back.
  if (data.fingerprint !== settingsFingerprint(league)) {
    alert("That draft was a " + settingsText(data.league) + " league, and the " +
          "setup screen is currently set to " + settingsText(league) + ".\n\n" +
          "Set it back to match and the draft will resume. Nothing has been lost.");
    return;
  }

  // The player list is regenerated every morning. If a saved pick no longer
  // resolves, the board would be corrupt, so refuse rather than half-restore.
  const resolved = data.picks.map((name) => board.find((p) => p.name === name));
  if (resolved.some((p) => !p)) {
    clearSave();
    alert("That draft could not be restored because the player list has been " +
          "updated since it was saved. Starting fresh.");
    showResumeBar();
    return;
  }

  state.mySlot = data.mySlot;
  state.clockLength = data.clockLength;
  state.paused = !!data.paused;
  state.seed = data.seed;
  // null rather than undefined for a save written before scenarios existed —
  // the same "absent is not a value" rule readSave() already applies to
  // superflex, and startDraft() clears this field rather than leaving it, so
  // a resume is the one path that has to put it back.
  state.scenario = data.scenario || null;
  state.started = true;
  // A save written before startedAt existed has no such key — falls back to
  // now rather than a wrong "started 47 years ago", and self-heals the
  // moment this draft finishes or is next saved.
  state.startedAt = data.startedAt || Date.now();

  applyJitter();
  board.forEach((p) => { p.drafted = false; });
  state.picks = [];
  resolved.forEach(function (player) { makePick(player); });

  // Saves written before the queue existed have no such key, and a plan is
  // worth restoring rather than refusing a draft over. pruneQueue() drops
  // anyone taken while the tab was closed, or dropped from the feed since.
  state.queue = Array.isArray(data.queue) ? data.queue.slice() : [];
  pruneQueue();
  // Not pruned the way the queue is — a watchlist entry that's since been
  // drafted is exactly the kind of thing worth still seeing on reopen.
  state.watchlist = Array.isArray(data.watchlist) ? data.watchlist.slice() : [];

  tabrow.hidden = false;
  $("resumeBar").hidden = true;

  /* A finished draft reopens on its analysis, not on suggestions — the
     landing page called it "your finished draft", so the reason to reopen
     one is to look at the result, and the suggestion list is exhausted by
     then anyway. An unfinished one picks up where it left off. */
  if (draftOver()) {
    revealAnalysis();
  } else {
    showPanel("tab-suggest");
    document.querySelectorAll(".tabs button").forEach((b, i) => b.classList.toggle("on", i === 0));
  }

  // Seeded before the render below, so reopening a finished board is not
  // read as one that has only just finished.
  noteDraftPhase();

  resetClock();
  render();
  window.scrollTo(0, 0);
}


/* ---- 11d. Draft history ---------------------------------

   The Locker's data: one entry per draft that has actually finished, kept
   next to the single save above it but never overwritten by it — a save is
   the one draft you could still be sitting in, history is everything you've
   already walked away from. Same browser-local storage, same reason: there
   is no account and no server copy of either. */

const HISTORY_KEY = "juke.draft-history.v1";
// Was 25. The Locker redesign is built for a manager who's run "hundreds of
// mocks" — its own reference mock shows 142 — which a 25-entry cap makes
// impossible; anything past it was being silently dropped. 200 gives real
// headroom past that reference number. Entries are small (player names plus
// a compact league-config object), so even a generous per-entry estimate
// keeps this well inside what a browser actually allows per origin.
const HISTORY_LIMIT = 200;

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

function writeHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (err) {}
}

// Fired from the same edge revealAnalysis() is — "just became over", not
// "is over" — so reopening an already-finished draft (Resume, or the Locker
// itself) never records it a second time. The grade is computed and stored
// now, while board/league/state are still the ones this draft was actually
// played on: recomputing it later would mean rebuilding a whole historical
// board — a different ADP set, a different snake shape — just to draw one
// card in a list.
// The single worst-off starting slot, by points below replacement.
// Deliberately replacementGap() here, not aboveReplacement() —
// aboveReplacement() (analyseTeam()'s own starter-strength component) is
// Math.max(0, places-above-replacement): clamped at zero, by design, for
// summing into a score that shouldn't reward one great starter for another
// slot's failure. That clamp makes it useless for *this* question, since
// nothing it returns is ever negative — a first version of this function
// used it and always returned null, on every roster, including ones
// clearly poor enough that couldn't be right. replacementGap() is the
// unclamped points version rosterVorp already sums, so a real deficit
// reads as a real negative number here too. Only a genuinely below-
// replacement slot counts (gap < 0); a lineup with nothing below
// replacement returns null rather than naming its merely-least-great
// starter as a "weak spot". Position comes from the player filling the
// slot, not the slot's own label — a weak FLEX should read as whichever
// position actually sat there, the same way a manager would describe it.
function weakestStartingSpot(lineup) {
  let worstGap = null, pos = null;
  lineup.forEach(function (s) {
    if (!s.player) return;
    const gap = replacementGap(s.player);
    if (gap === null) return;
    if (worstGap === null || gap < worstGap) { worstGap = gap; pos = s.player.pos; }
  });
  return worstGap !== null && worstGap < 0 ? pos : null;
}

function rosterVorpOf(team) {
  return team.lineup.reduce((sum, s) => sum + (s.player ? replacementGap(s.player) || 0 : 0), 0);
}

// Skill positions only — the same exclusion draft value, avgValueByPosition
// and the "one that got away" panel already apply, derived from
// UNRANKED_POSITIONS rather than written out a second time.
const STRENGTH_POSITIONS = POSITIONS.filter((p) => UNRANKED_POSITIONS.indexOf(p) < 0);

// Average replacementGap() across every starting slot a position actually
// filled (FLEX included, credited to whichever position sat in it) — the
// same unclamped points-above-replacement figure the VORP matrix and
// weakestStartingSpot() already read, just averaged per position instead of
// taken at its single worst point. Absent, not zeroed, when the lineup
// never started that position at all, same "absent, not zeroed" rule as
// everywhere else history keeps.
function posStrengthOf(lineup) {
  const out = {};
  STRENGTH_POSITIONS.forEach(function (pos) {
    const gaps = lineup
      .filter(function (s) { return s.player && s.player.pos === pos; })
      .map(function (s) { return replacementGap(s.player); })
      .filter(function (g) { return g !== null; });
    out[pos] = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  });
  return out;
}

/* ---- projected win % --------------------------------------

   Nothing in this app simulates a season, so "win probability" cannot mean
   what a real standings page means by it. What it can honestly mean: given
   each team's projected scoring output, how often would this roster
   out-score a randomly drawn opponent from the same room on a given week —
   the same normal-difference approximation sportsbooks and power-rating
   sites use to turn a projected scoring gap into a win probability, applied
   to this room instead of a real schedule (which a mock draft doesn't have,
   so every other team in the room stands in for "a week's opponent").

   A team's weekly mean is its starting lineup's season points (player.projPts,
   the identical number the Juke score and every VORP figure already read)
   divided by the games that projection covers (projGames() — never a second
   denominator). A team's weekly SPREAD has no equivalent already computed
   anywhere in this app, so it's estimated from real week-to-week variability:
   positionWeeklyCV() below measures, once, how much a real player's weekly
   score actually swings around its own mean (stdev / mean, from real weekly
   logs, never invented), averaged per position. Applied to this season's
   projected mean, that gives each starter an estimated weekly stdev, and —
   assuming each starter's week is independent of his teammates', the same
   simplifying assumption projection tools of this kind make everywhere —
   the roster's own weekly variance is just the sum of its starters'.

   From there a team's week against any one opponent is a normal difference:
   P(i beats j) = Φ((mean_i − mean_j) / sqrt(var_i + var_j)). Averaged across
   every other team in the room, that's this team's expected win rate against
   a schedule drawn evenly from the room it actually drafted with — which is
   what "projected win %" means here, and the number should never be shown
   without that framing: it is a scoring-strength estimate, not a simulated
   season, and it does not know which week any team's bye falls in relative
   to anyone else's. */

// Below this many played games, one player-season's own swing is too noisy
// to trust for the position average it feeds — the same "measured, not
// assumed" bar this file applies everywhere else a sample might be too thin
// to mean anything (formatSplit's old >= 2, MIN_MOCKS_FOR_TENDENCIES's 5).
const MIN_WEEKS_FOR_CV = 4;
// A position with fewer than this many qualifying player-seasons falls back
// to a league-wide default rather than a number built from a handful of
// rows. The default itself is chosen from real fantasy scoring's own
// well-known shape (skill positions swing roughly half their own mean week
// to week), not measured here — worth keeping that distinction straight,
// since everything positionWeeklyCV() itself produces below is measured.
const MIN_SEASONS_FOR_CV = 5;
const DEFAULT_WEEKLY_CV = 0.5;

function positionWeeklyCV() {
  const sums = {}; // pos -> { sum, n }
  board.forEach(function (player) {
    const s = statOf(player);
    if (!s || !s.w) return;
    logYears(s).forEach(function (year) {
      const weeks = (s.w[year] || []).filter(didPlay);
      if (weeks.length < MIN_WEEKS_FOR_CV) return;
      const pts = weeks.map(fantasyPoints);
      const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
      if (mean <= 0) return; // a coefficient of variation is meaningless around zero
      const variance = pts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / pts.length;
      const row = sums[player.pos] || { sum: 0, n: 0 };
      row.sum += Math.sqrt(variance) / mean;
      row.n += 1;
      sums[player.pos] = row;
    });
  });
  const cv = {};
  POSITIONS.forEach(function (pos) {
    const row = sums[pos];
    cv[pos] = row && row.n >= MIN_SEASONS_FOR_CV ? row.sum / row.n : DEFAULT_WEEKLY_CV;
  });
  return cv;
}

// Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7) — no
// erf in the JS standard library, and this is the entire method rather than
// an approximation of one, so the precision here is not the weak link.
function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// One team's weekly scoring estimate — mean and stdev — from its own
// bestLineup(), under the CV model above. Player-level, not position-level:
// two teams that both start a TE still each get their own TE's own
// projected mean scaled by the shared position CV, not a shared figure.
function teamWeeklyStats(team, cv) {
  let mean = 0, variance = 0;
  team.lineup.forEach(function (seat) {
    const player = seat.player;
    if (!player || player.projPts === null || player.projPts === undefined) return;
    const proj = statOf(player) && statOf(player).p;
    const games = projGames(player.pos, proj);
    if (!games) return;
    const weeklyMean = player.projPts / games;
    const weeklyStdev = (cv[player.pos] || DEFAULT_WEEKLY_CV) * weeklyMean;
    mean += weeklyMean;
    variance += weeklyStdev * weeklyStdev;
  });
  return { mean: mean, stdev: Math.sqrt(variance) };
}

// Every team's expected win rate against a schedule drawn evenly from the
// rest of the room it drafted with — see the method note above. Indexed by
// slot, like analyseDraft() always is. A room of one returns null for that
// one team: there is nobody to play.
//
// cv is optional and only exists so historyStats() can compute
// positionWeeklyCV() once and reuse it across every history entry it
// reconstructs a room for, rather than re-walking the whole board's weekly
// logs once per entry for the identical answer. A live caller (the bridge,
// for the currently-loaded draft) has exactly one room to ask about and
// can afford to let this compute its own.
function projectedWinPctForRoom(all, cv) {
  const cvTable = cv || positionWeeklyCV();
  const weekly = all.map((t) => teamWeeklyStats(t, cvTable));
  return weekly.map(function (mine, i) {
    const others = weekly.filter((_, j) => j !== i);
    if (!others.length) return null;
    const wins = others.map(function (theirs) {
      const diffMean = mine.mean - theirs.mean;
      const diffStdev = Math.sqrt(mine.stdev * mine.stdev + theirs.stdev * theirs.stdev);
      if (diffStdev === 0) return diffMean > 0 ? 1 : diffMean < 0 ? 0 : 0.5;
      return normalCdf(diffMean / diffStdev);
    });
    return wins.reduce((a, b) => a + b, 0) / wins.length;
  });
}

/* The Draft Insights report, frozen whole at the moment a draft completes —
   see DraftInsightsDashboard.jsx's own file comment for the bug this fixes.
   openHistoryDraft() rebuilds the whole board from *today's* live
   projections and ADP before replaying a saved draft's picks onto it, so
   every grade, VORP figure and callout on a reopened report used to be
   recomputed against data that had moved since the draft actually
   happened — a D+ in the Locker table (itself already frozen, see
   recordHistory() below) reading back as an A- in the report built from
   the same picks. And freezing only the raw inputs and re-running today's
   *formula* would not have fixed it either: WEIGHTS, MIN_SPAN and
   GRADE_SCALE have each been retuned more than once in this file's own
   history (see CLAUDE.md's grade section), so only the fully computed
   output — post-scaling, post-weights, post-grade-lookup — is immune to
   the grade's own shape changing out from under an old report.

   Full per-team detail (the VORP matrix, the value timeline, the one that
   got away) is frozen only for the drafter's own team — a roster-sized
   chunk of data per team, and nobody has asked to inspect a CPU seat's
   report after the fact. Every other team gets the lightweight row the
   standings and the share card's room comparison actually need: rank,
   grade, total and the four scaled components. Team names are resolved to
   strings here rather than left as slot numbers, because teamLabel()
   depends on state.mySlot, which will not be this draft's mySlot once a
   different draft is later in progress. */
function freezeReport(all, slot) {
  const mine = all[slot];
  if (!mine) return null;

  const winPcts = projectedWinPctForRoom(all);

  const standings = all.map(function (t) {
    return {
      slot: t.slot,
      teamName: teamLabel(t.slot),
      rank: t.rank,
      grade: t.grade,
      total: t.total,
      startersScaled: t.startersScaled,
      valueScaled: t.valueScaled,
      buildScaled: t.buildScaled,
      byePenaltyScaled: t.byePenaltyScaled,
      winPct: winPcts ? winPcts[t.slot] : null
    };
  });

  const lineup = (mine.lineup || []).map(function (seat) {
    return {
      slotLabel: seat.slot,
      name: seat.player ? seat.player.name : null,
      pos: seat.player ? seat.player.pos : null,
      vorpGap: seat.player ? replacementGap(seat.player) : null
    };
  });

  const teamPicks = state.picks.filter((p) => p.slot === slot)
    .slice().sort((a, b) => a.overall - b.overall);
  const timeline = teamPicks
    .filter((p) => !FORCED_LATE[p.player.pos])
    .map(function (p) {
      return { round: p.round, overall: p.overall, pos: p.player.pos,
               name: shortName(p.player), gap: p.overall - p.player.overall };
    });

  const away = oneThatGotAway(slot);
  const missed = away ? {
    theirsName: away.theirs.player.name,
    theirsTeamName: teamLabel(away.theirs.slot),
    theirsOverall: away.theirs.overall,
    mineName: away.mine.player.name,
    mineRound: away.mine.round,
    mineOverall: away.mine.overall,
    delta: away.delta
  } : null;

  return {
    mySlot: slot,
    weights: { starters: WEIGHTS.starters, value: WEIGHTS.value, build: WEIGHTS.build, byes: WEIGHTS.byes },
    standings: standings,
    mine: {
      value: mine.value,
      bargain: mine.bargain ? {
        name: mine.bargain.pick.player.name, pos: mine.bargain.pick.player.pos, gap: mine.bargain.gap
      } : null,
      reach: mine.reach ? {
        name: mine.reach.pick.player.name, pos: mine.reach.pick.player.pos, gap: mine.reach.gap
      } : null,
      lineup: lineup,
      timeline: timeline,
      oneThatGotAway: missed
    }
  };
}

function recordHistory() {
  // The whole room, not just mine — the tendencies strip's "room average"
  // roster-VORP baseline needs every team's number, and this is the one
  // moment they're all sitting in memory together against the board this
  // draft was actually played on. Computing it later would mean rebuilding
  // a whole historical room just to average one number.
  const all = analyseDraft();
  const mine = all[state.mySlot];
  const roomAvgRosterVorp = all.length
    ? all.reduce((sum, t) => sum + rosterVorpOf(t), 0) / all.length
    : null;
  const round1 = state.picks.find((p) => p.slot === state.mySlot && p.round === 1);
  const list = readHistory();
  const entry = {
    id: "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    completedAt: Date.now(),
    mySlot: state.mySlot,
    clockLength: state.clockLength,
    seed: state.seed,
    league: JSON.parse(JSON.stringify(league)),
    // Names, not player objects — same reason saveDraft() stores them this
    // way: the board is rebuilt from tonight's data on every load, so a held
    // reference would go stale while a name can be re-resolved.
    picks: state.picks.map((p) => p.player.name),
    projectedRank: mine ? mine.rank : null,
    round1Pick: round1 ? round1.player.name : null,
    // The fields the Locker redesign needs that analyseDraft() already
    // computes above — this is the one moment board/league/state are still
    // the ones the draft was actually played on, so it's cheaper to keep
    // what's already been worked out than to recompute it later against a
    // rebuilt historical board.
    grade: mine ? mine.grade : null,
    // The weighted 0-100ish score grade was derived from — the Locker row
    // only needs the letter, but the tendencies strip's "grade, last 12"
    // bars need a number to bucket by, and re-deriving one from the other
    // isn't possible once only the letter is stored.
    gradeScore: mine ? Math.round(mine.total) : null,
    teams: league.teams,
    // Summed over the *starting* lineup (bestLineup(), value-sorted), not
    // the full roster — roster and lineup are not interchangeable, per the
    // FLEX bug this file's own history already found the hard way, and
    // "roster VORP" should measure what the grade itself measures (starter
    // strength) rather than sit beside it disagreeing.
    rosterVorp: mine ? rosterVorpOf(mine) : null,
    roomAvgRosterVorp: roomAvgRosterVorp,
    weakestSpot: mine ? weakestStartingSpot(mine.lineup) : null,
    /* Which Practice-a-scenario card started this draft, or null. The
       signed-in scenario set is derived from what you have already run —
       "never tried", "your weak spot" — and the whole of that is
       unanswerable unless finishing a scenario writes down which one it
       was. Undefined on every entry from before this existed, which reads
       the same as null everywhere it is asked. */
    scenario: state.scenario || null,
    // The whole Draft Insights report, frozen right here — see
    // freezeReport()'s own comment for why a reopened report used to
    // disagree with this very entry's own `grade` a few lines up. Absent
    // (undefined, same convention as every other field below) on any
    // entry recorded before this existed; DraftLocker.jsx falls back to
    // the old live-recompute path for those, exactly as every entry used
    // to work.
    report: freezeReport(all, state.mySlot)
    // Net ADP value, positional strength and projected win % all used to
    // be frozen here too, reasoning that this was the one moment the board
    // matched the draft that was actually played. That reasoning was
    // correct and the consequence wasn't worth it: every one of those
    // three fields is reconstructible from the picks already stored two
    // lines up, the same overallOf() walk avgRoundByPosition and
    // mostDraftedList already do in historyStats() — and unlike those,
    // these three were only ever computed going forward, so a real
    // account with real history recorded before they existed showed three
    // permanently blank cards no number of future mocks would ever fill
    // in, because the entries that needed the field already existed
    // without it. historyStats() reconstructs them against today's board
    // now, same as everything else per-mock in that function — see its
    // own comment on exactly this trade.
  };
  list.unshift(entry);
  writeHistory(list.slice(0, HISTORY_LIMIT));
  pushHistoryEntry(entry);
}

// What a Locker card actually shows, derived rather than stored, so a label
// can never drift from the function that already knows how to say it —
// scoringLabel() and ordinal() are the same lookups the setup screen and
// the board already use.
// "10-Team Half PPR" — one place for this, so the finished-draft cards
// below and the one still-in-progress card (which has no history entry to
// read it from) can never print it two different ways.
function leagueTypeLabel(cfg) {
  return cfg.teams + "-Team " + scoringLabel(cfg.scoring);
}

function historySummary(entry) {
  const round1Player = entry.round1Pick && board.find((p) => p.name === entry.round1Pick);
  return {
    id: entry.id,
    leagueType: leagueTypeLabel(entry.league),
    // The raw key, alongside the formatted leagueType above — "what to run
    // next" groups entries by format and needs the key setLeague() itself
    // accepts, not a string it would have to parse back out of "10-Team
    // Half PPR" the way LockerTable.jsx's own filter already has to.
    scoring: entry.league.scoring,
    pickPosition: ordinal(entry.mySlot + 1),
    // The raw seat number, alongside the ordinal string above — the Locker
    // table's own Seat column prints a plain "3", not "3rd" (that's the
    // in-progress band's own convention instead), and a component that
    // wants one has no clean way to undo the other's formatting.
    seat: entry.mySlot + 1,
    dateCompleted: new Date(entry.completedAt)
      .toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
    // The raw epoch too, same reasoning as seat/pickPosition above: the
    // mobile Locker card wants "2 days ago", which is arithmetic on a
    // timestamp, and there is no clean way to undo dateCompleted's own
    // toLocaleDateString() formatting to get one back.
    completedAt: entry.completedAt,
    projectedRank: entry.projectedRank ? ordinal(entry.projectedRank) : "—",
    // The raw number too — the finish bar's fill (1 - (finish-1)/teams)
    // needs to do arithmetic on it, and parsing "3rd" back into 3 is not a
    // real option.
    rank: entry.projectedRank || null,
    round1Pick: entry.round1Pick || null,
    // Resolved against today's board, same as everywhere else a stored
    // name needs a position — absent if the player's since dropped out of
    // the pool entirely, same as a resolution failure is handled elsewhere.
    round1PickPos: round1Player ? round1Player.pos : null,
    // Same resolution, same guard — photoUrl() itself is the one function
    // every headshot in the app already goes through (the board, the queue,
    // the profile drawer), so this is never a second way to build the URL.
    round1PickPhoto: round1Player ? photoUrl(round1Player) : null,
    round1PickInitials: entry.round1Pick ? initials(entry.round1Pick) : null,
    // Absent on any entry recorded before recordHistory() started saving
    // them — undefined rather than a guessed value, same rule as
    // projectedRank's own "—" a few lines up, left to the caller to decide
    // how to render rather than papered over here.
    grade: entry.grade || null,
    teams: entry.teams || entry.league.teams,
    rosterVorp: typeof entry.rosterVorp === "number" ? entry.rosterVorp : null,
    // The scenario card this draft was started from, if any — PracticeScenarios
    // reads it to know what you have already practised. Null for every draft
    // started from the plain Start button, and for every entry recorded before
    // scenarios existed.
    scenario: entry.scenario || null
  };
}

/* The tendencies strip's data — six aggregates over the whole history array,
   nothing this file summarised before. Every one of them is real numbers off
   real entries; per the design brief's own instruction, a stat that can't be
   computed cleanly (an empty history, or every entry pre-dating the field it
   needs) is simply absent from the returned object rather than filled with a
   zero or a dash standing in for missing data — the caller drops the card. */
function historyStats() {
  const list = readHistory();
  if (!list.length) return {};

  // One name -> player lookup, built once rather than per pick per entry —
  // history can run to HISTORY_LIMIT entries, each with a full roster of
  // picks, and board.find() inside that nesting would be quadratic for no
  // reason.
  const byName = new Map();
  board.forEach((p) => byName.set(p.name, p));

  const stats = { total: list.length };

  // The window the three per-mock time-series cards (Net ADP Value,
  // Projected Win % Trend, the Positional Weakness heatmap) draw from —
  // the most recent ten rather than the whole history. A trend a reader
  // takes in at a glance is easier to read at a fixed width that slides
  // forward one mock at a time than one that silently rescales every time
  // an eleventh, fiftieth, or two-hundredth mock lands.
  const TREND_WINDOW = 10;
  // The Weakest Spot card windows to the same ten mocks — "below
  // replacement in 8 of your last 10 rosters" is a claim about recent
  // drafting, not lifetime drafting, and the two read very differently
  // once a real tendency from three months ago is buried under fifty mocks
  // since. list is already newest-first (readHistory()'s own contract), so
  // this is simply its first TREND_WINDOW entries.
  const windowList = list.slice(0, TREND_WINDOW);

  // Most drafted — tallied across only *your own* picks in each entry, via
  // the same overall-index reconstruction holeRounds() already uses below
  // (DraftEngine.overallOf(round, mySlot, teams), indexed into entry.picks).
  // This used to sum every pick in the whole room — all ~140 of them, every
  // team, every entry — which named whichever player the board's consensus
  // rated highest, since he gets drafted by *someone* in nearly every mock.
  // That is not a tendency; it is what the board says about itself. Names
  // that no longer resolve (the board moved on entirely) are dropped rather
  // than naming a runner-up the function never actually checked. DraftEngine
  // has to be loaded for this, same guard holeRounds() already applies for
  // the same reason.
  const pickCounts = new Map();
  if (typeof DraftEngine !== "undefined") {
    list.forEach((entry) => {
      const teams = entry.teams || (entry.league && entry.league.teams);
      if (!teams || !entry.picks || !entry.picks.length) return;
      const totalRounds = Math.floor(entry.picks.length / teams);
      for (let round = 1; round <= totalRounds; round++) {
        const overall = DraftEngine.overallOf(round, entry.mySlot, teams);
        const name = entry.picks[overall - 1];
        if (name) pickCounts.set(name, (pickCounts.get(name) || 0) + 1);
      }
    });
  }
  // Top five rather than a single name — the Draft Lobby's Most Drafted card
  // asks "what do I always take", and a whole draft's worth of running backs
  // answers that better than whichever one happens to sit at the very top.
  const MOST_DRAFTED_COUNT = 5;
  const mostDraftedList = [...pickCounts.entries()]
    .filter(([name]) => byName.has(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MOST_DRAFTED_COUNT)
    .map(([name, count]) => ({ name, pos: byName.get(name).pos, count, total: list.length }));
  if (mostDraftedList.length) stats.mostDraftedList = mostDraftedList;

  // Average round for your first pick at each position — replaced a
  // round-1-only breakdown that was RB or WR on nearly every draft (ADP puts
  // backs and receivers at the top of every board, so round 1 alone rarely
  // varies) and so never said anything a reader didn't already know. This
  // walks every round of your own picks instead — the same overall-index
  // reconstruction mostDraftedList and holeRounds already use — and records
  // the first round each position showed up, per entry, then averages that
  // across every entry where it showed up at all. A position you have never
  // actually drafted contributes nothing rather than a zero, the same
  // "absent, not zeroed" rule the rest of this function already follows.
  const firstRoundSums = {}; // pos -> { sum, n }
  if (typeof DraftEngine !== "undefined") {
    list.forEach((entry) => {
      const teams = entry.teams || (entry.league && entry.league.teams);
      if (!teams || !entry.picks || !entry.picks.length) return;
      const totalRounds = Math.floor(entry.picks.length / teams);
      const seenPos = new Set();
      for (let round = 1; round <= totalRounds; round++) {
        const overall = DraftEngine.overallOf(round, entry.mySlot, teams);
        const name = entry.picks[overall - 1];
        const player = name && byName.get(name);
        if (!player || seenPos.has(player.pos)) continue;
        seenPos.add(player.pos);
        const row = firstRoundSums[player.pos] || { sum: 0, n: 0 };
        row.sum += round;
        row.n += 1;
        firstRoundSums[player.pos] = row;
      }
    });
  }
  const avgRoundByPosition = POSITIONS
    .filter((pos) => firstRoundSums[pos])
    .map((pos) => ({ pos, avgRound: firstRoundSums[pos].sum / firstRoundSums[pos].n }))
    .sort((a, b) => a.avgRound - b.avgRound);
  if (avgRoundByPosition.length > 0) {
    stats.avgRoundByPosition = avgRoundByPosition;
  }

  // Weakest spot — the position that shows up most often as a genuinely
  // below-replacement starter, and what share of your last TREND_WINDOW
  // rosters it accounts for. The denominator is every entry in that window
  // this field was actually recorded on — weakestSpot is stored as null
  // when nothing was below replacement, and that still counts here; only
  // entries from before this field existed, where the key is missing
  // outright, are excluded. This used to divide by the count of weak
  // entries alone (entries where *something* was below replacement), which
  // silently dropped every genuinely clean roster from the denominator:
  // measured on a 10-entry sample with 2 clean rosters and 8 sharing the
  // same weak position, the card read "100%" when the true share of all
  // rosters was 80%. The card's own copy says "of your rosters," and the
  // denominator has to actually mean that.
  const weakCounts = new Map();
  let recordedTotal = 0;
  windowList.forEach((entry) => {
    if (entry.weakestSpot === undefined) return;
    recordedTotal++;
    if (entry.weakestSpot) weakCounts.set(entry.weakestSpot, (weakCounts.get(entry.weakestSpot) || 0) + 1);
  });
  if (recordedTotal > 0) {
    let pos = null, count = 0;
    weakCounts.forEach((c, p) => { if (c > count) { count = c; pos = p; } });
    if (pos) {
      stats.weakestSpot = { pos, pct: Math.round((count / recordedTotal) * 100) };
      // The full breakdown behind that headline figure — every position
      // that has ever finished below replacement, not just the worst one,
      // so the card can draw the small per-position leaderboard beside the
      // headline rather than the headline standing alone.
      stats.weakestSpotBreakdown = [...weakCounts.entries()]
        .map(([p, c]) => ({ pos: p, count: c, total: recordedTotal }))
        .sort((a, b) => b.count - a.count);
    }
  }

  /* Which rounds the weakest position actually goes missing in — the
     insight that connects "most drafted, round 1" and "weakest spot"
     instead of leaving them sitting three inches apart with nothing
     joining them. Walks each entry's own snake (its own teams/mySlot,
     since entries can differ) to reconstruct which player it drafted in
     every round, the same way the round-by-round strip on a live board
     would read it — never a second copy of the pick list, just the one
     already stored, indexed by the real snake math. DraftEngine has to be
     loaded for this; on the rare load where it is not yet, the block is
     skipped rather than guessed at, the same rule survivalProbability()
     and friends already apply to anything touching the deferred data. */
  if (stats.weakestSpot && typeof DraftEngine !== "undefined") {
    const targetPos = stats.weakestSpot.pos;
    const perRound = new Map(); // round -> { target, otherCounts: Map(pos->n), total }
    windowList.forEach((entry) => {
      const teams = entry.teams || (entry.league && entry.league.teams);
      if (!teams || !entry.picks || !entry.picks.length) return;
      const totalRounds = Math.floor(entry.picks.length / teams);
      for (let round = 1; round <= totalRounds; round++) {
        const overall = DraftEngine.overallOf(round, entry.mySlot, teams);
        const name = entry.picks[overall - 1];
        const player = name && byName.get(name);
        if (!player) continue;
        const row = perRound.get(round) || { target: 0, otherCounts: new Map(), total: 0 };
        row.total++;
        if (player.pos === targetPos) row.target++;
        else row.otherCounts.set(player.pos, (row.otherCounts.get(player.pos) || 0) + 1);
        perRound.set(round, row);
      }
    });

    // The longest contiguous run of rounds that both have a real sample
    // and never once produced the weak position.
    const rounds = [...perRound.keys()].sort((a, b) => a - b);
    let bestRun = null, curStart = null, curTotal = 0, curOthers = null;
    rounds.forEach((r, i) => {
      const row = perRound.get(r);
      const clean = row.target === 0 && row.total >= 2;
      if (clean) {
        if (curStart === null) { curStart = r; curTotal = 0; curOthers = new Map(); }
        curTotal += row.total;
        row.otherCounts.forEach((n, pos) => curOthers.set(pos, (curOthers.get(pos) || 0) + n));
      }
      const isLast = i === rounds.length - 1;
      const runBroke = !clean || isLast;
      if (runBroke && curStart !== null) {
        const end = clean ? r : rounds[i - 1];
        if (end > curStart && curTotal >= 6) {
          if (!bestRun || (end - curStart) > (bestRun.end - bestRun.start)) {
            bestRun = { start: curStart, end: end, total: curTotal, others: curOthers };
          }
        }
        curStart = null;
      }
    });

    if (bestRun) {
      let topPos = null, topCount = 0;
      bestRun.others.forEach((n, pos) => { if (n > topCount) { topCount = n; topPos = pos; } });
      if (topPos) {
        stats.holeRounds = {
          pos: targetPos,
          startRound: bestRun.start,
          endRound: bestRun.end,
          total: bestRun.total,
          topOtherPos: topPos,
          topOtherCount: topCount
        };
      }
    }
  }

  // Avg roster VORP, and the room average to put it beside — both means
  // over only the entries that actually carry the field, not treated as
  // zero for anything recorded before it existed.
  const withVorp = list.filter((e) => typeof e.rosterVorp === "number");
  const withRoomVorp = list.filter((e) => typeof e.roomAvgRosterVorp === "number");
  if (withVorp.length) {
    stats.avgRosterVorp = {
      mine: withVorp.reduce((sum, e) => sum + e.rosterVorp, 0) / withVorp.length,
      room: withRoomVorp.length
        ? withRoomVorp.reduce((sum, e) => sum + e.roomAvgRosterVorp, 0) / withRoomVorp.length
        : null
    };
  }

  // Average weighted score — the same gradeScore every other bucket in this
  // function reads, just averaged. Read again below as "your overall mean"
  // for the Recommendation Engine's own gap test, so it is computed once,
  // here, rather than a second time inside that block.
  const scored = list.filter((e) => typeof e.gradeScore === "number");
  if (scored.length) {
    stats.avgScore = {
      value: scored.reduce((sum, e) => sum + e.gradeScore, 0) / scored.length,
      best: Math.max(...scored.map((e) => e.gradeScore)),
      worst: Math.min(...scored.map((e) => e.gradeScore))
    };
  }

  /* Net ADP value, positional strength, and projected win % — all three
     reconstructed from windowList's own stored picks against today's
     board, the same overallOf() walk avgRoundByPosition and
     mostDraftedList already use, rather than read off a field frozen at
     the moment each draft finished. That was the first version of this:
     reasoned as "the board was still the one the draft was actually
     played on," which is true, and cost more than it was worth — every
     one of these three fields was only ever computed going forward, so a
     real account with real history recorded before this existed showed
     three permanently blank cards, on entries no future mock could ever
     retrofit the field onto. Every other per-mock aggregate in this
     function already accepts drifting against today's board in exchange
     for working on history that already exists; these three were the
     only holdouts, and the holdout cost more than the drift does.

     Windowed to windowList (the same last-TREND_WINDOW slice weakestSpot
     uses) rather than the whole history — both because a trend a reader
     takes in at a glance shouldn't silently rescale every time an
     eleventh mock lands, and because reconstructing win % needs every
     seat's roster, not just yours, which is the one reconstruction here
     expensive enough that it's worth not running it over 200 entries. */
  if (typeof DraftEngine !== "undefined") {
    const cv = positionWeeklyCV(); // once, reused across every entry below
    const netAdpEntries = [], strengthEntries = [], winPctEntries = [];

    windowList.forEach((entry) => {
      const teams = entry.teams || (entry.league && entry.league.teams);
      if (!teams || !entry.picks || !entry.picks.length) return;
      const totalRounds = Math.floor(entry.picks.length / teams);
      const lastPick = teams * totalRounds;

      // Every seat's roster, resolved against today's board — the win-%
      // model needs the whole room (every other team is the "opponent"
      // that mock's own room provides); net ADP value and positional
      // strength only ever needed your own, but it falls out of the same
      // walk for free.
      const rosters = Array.from({ length: teams }, () => []);
      let netAdpSum = 0, netAdpAny = false;
      for (let round = 1; round <= totalRounds; round++) {
        for (let slot = 0; slot < teams; slot++) {
          const overall = DraftEngine.overallOf(round, slot, teams);
          const name = entry.picks[overall - 1];
          const player = name && byName.get(name);
          if (!player) continue;
          rosters[slot].push(player);
          if (slot === entry.mySlot && !FORCED_LATE[player.pos] && player.overall <= lastPick) {
            netAdpSum += overall - player.overall;
            netAdpAny = true;
          }
        }
      }

      /* Against par for that seat, not raw.

         Raw net ADP value cannot come out positive for most people, and the
         card was reporting that as a record: "you beat ADP in 0 of 10 mocks".
         Three things stack up, all measured. Your first pick is capped at zero,
         because the gap is pick number minus board rank and nothing ranks below
         1. Need-based drafting reaches by construction — needFromCount()
         returns 0.80 for a position still filling a starting slot, so the app
         itself schedules the reaches it then marks you down for; on a real
         seat-1 mock the quarterback and the last two starting slots were −14,
         −26 and −28 against positives that never exceeded +5. And the room does
         not sum to zero: measured across ten rooms it came out −41 to −44 every
         time, so the average team loses at this too.

         Seat is most of the rest. Mean raw value by chair over ten mocks ran
         −28, −19, −14, −3, +15, +6, −3, −11, +13, +2 — a 43-point spread on
         where you sat. Against par it is +2, +3, −1, −3, −3, +5, +3, −3, −1,
         −2, which is noise, and that is the same correction the grade's own
         value component already applies.

         Par is asked for with `entry.league` rather than the live one: a
         12-team mock read while you sit in a 10-team league needs par for the
         shape it was played at. If par is unavailable — no engine yet, or an
         entry too old to carry its league — the raw figure is kept rather than
         a silently unadjusted zero-subtraction, and `vsPar` says which it is so
         the card can label itself honestly. */
      if (netAdpAny) {
        const shape = entry.league && entry.league.starters ? entry.league : null;
        /* Indexed by picks *made*, not picks judged. parRun() pushes a value
           row on every pick and only adds to the running total on the ones
           freelyChosen()/reachableRank() let through, so the row index is the
           seat's pick count — and using the judged count here would read par
           two or three picks early, which is exactly where the late reaches
           this metric is dominated by actually land. Resolved picks, because a
           name no longer on today's board is skipped above and contributes to
           neither side. */
        const par = shape
          ? seatPar(entry.mySlot, rosters[entry.mySlot].length, "value", shape)
          : null;
        netAdpEntries.push({
          id: entry.id,
          value: typeof par === "number" ? netAdpSum - par : netAdpSum,
          vsPar: typeof par === "number",
          completedAt: entry.completedAt
        });
      }

      const myRoster = rosters[entry.mySlot];
      if (myRoster.length) {
        strengthEntries.push({ id: entry.id, completedAt: entry.completedAt, byPos: posStrengthOf(bestLineup(myRoster)) });
      }

      const allTeams = rosters.map((roster) => ({ lineup: bestLineup(roster) }));
      const winPcts = projectedWinPctForRoom(allTeams, cv);
      const mine = winPcts[entry.mySlot];
      if (typeof mine === "number") {
        winPctEntries.push({ id: entry.id, value: Math.round(mine * 1000) / 10, completedAt: entry.completedAt });
      }
    });

    // Every list above is windowList's own newest-first order; reversed
    // to oldest-first so each chart reads left-to-right as a timeline,
    // same as every other per-mock trend here.
    if (netAdpEntries.length) {
      stats.avgNetAdpValue = netAdpEntries.reduce((sum, e) => sum + e.value, 0) / netAdpEntries.length;
    }
    if (netAdpEntries.length >= 2) stats.netAdpValueHistory = netAdpEntries.slice().reverse();

    if (strengthEntries.length >= 2) stats.weaknessHeatmap = strengthEntries.slice().reverse();

    if (winPctEntries.length) {
      stats.avgWinPct = winPctEntries.reduce((sum, e) => sum + e.value, 0) / winPctEntries.length;
    }
    if (winPctEntries.length >= 2) stats.winPctHistory = winPctEntries.slice().reverse();
  }

  // Draft capital allocation — what share of your early picks, across every
  // mock, went to each position. CAPITAL_EARLY_ROUNDS names "early" once
  // rather than leaving it a magic number in the loop below — five rounds,
  // not this file's usual three, to match the design review's own "top
  // 5-round picks" framing for this specific card. Kickers and defenses
  // sit out, same reason draft value does everywhere else: their ADP comes
  // from longer drafts than these, so neither is a real candidate for an
  // early pick and counting them would only dilute the shares that are.
  const CAPITAL_EARLY_ROUNDS = 5;
  const earlyCounts = {};
  let earlyTotal = 0;
  if (typeof DraftEngine !== "undefined") {
    list.forEach((entry) => {
      const teams = entry.teams || (entry.league && entry.league.teams);
      if (!teams || !entry.picks || !entry.picks.length) return;
      const rounds = Math.min(CAPITAL_EARLY_ROUNDS, Math.floor(entry.picks.length / teams));
      for (let round = 1; round <= rounds; round++) {
        const overall = DraftEngine.overallOf(round, entry.mySlot, teams);
        const name = entry.picks[overall - 1];
        const player = name && byName.get(name);
        if (!player || FORCED_LATE[player.pos]) continue;
        earlyCounts[player.pos] = (earlyCounts[player.pos] || 0) + 1;
        earlyTotal++;
      }
    });
  }
  if (earlyTotal > 0) {
    stats.capitalAllocation = Object.keys(earlyCounts)
      .map((pos) => ({ pos, pct: (earlyCounts[pos] / earlyTotal) * 100 }))
      .sort((a, b) => b.pct - a.pct);
  }

  /* Recommendation Engine — mean gradeScore per individual seat, crossed
     with scoring format. This used to bucket seats into early/middle/late
     thirds; a design review comparing this screen against a real mockup
     asked for a bar per seat instead, which is a fair ask — a bucket can
     never say "seat 7", only "somewhere in the middle third" — so this
     answers the sharper question directly and leaves the honesty problem
     that caused the bucketing (most individual seats have a thin sample)
     to the renderer instead: every seat's own `count` rides along so
     RecommendationEngine.jsx can visibly mute a bar backed by one mock or
     none, rather than this function silently smoothing seats together to
     avoid ever showing a thin one.

     Seats only compare within one team count — seat 3 in a 10-team league
     and seat 3 in a 12-team league are different questions — so this reads
     off the room's own *current* team count and only counts entries that
     share it, rather than trying to reconcile mixed league sizes onto one
     axis. */
  const seatCount = league.teams;
  const byFormatSeat = new Map(); // scoring -> Map(seat 1-based -> scores[])
  list.forEach((entry) => {
    if (typeof entry.gradeScore !== "number" || !entry.league) return;
    const teams = entry.teams || entry.league.teams;
    if (teams !== seatCount) return;
    const seat = entry.mySlot + 1;
    const fmt = entry.league.scoring;
    if (!byFormatSeat.has(fmt)) byFormatSeat.set(fmt, new Map());
    const m = byFormatSeat.get(fmt);
    if (!m.has(seat)) m.set(seat, []);
    m.get(seat).push(entry.gradeScore);
  });
  const recEngineFormats = [...byFormatSeat.entries()]
    .map(([scoring, m]) => ({
      scoring: scoring,
      seats: Array.from({ length: seatCount }, (_, i) => {
        const seat = i + 1;
        const scores = m.get(seat) || [];
        return {
          seat: seat,
          count: scores.length,
          avg: scores.length ? scores.reduce((a, v) => a + v, 0) / scores.length : null
        };
      })
    }))
    .filter((f) => f.seats.some((s) => s.count > 0));
  if (recEngineFormats.length >= 2) stats.recEngineFormats = recEngineFormats;

  /* The single (format, seat) pair "What to run next" and the Recommendation
     Engine chart both point at — computed once so the two can never name a
     different combination. Gated at two samples, not one: the chart itself
     is allowed to show a single-mock seat (dimmed, so it reads as thin), but
     recommending a whole mock off one data point would be a coin flip
     dressed as a tendency. GAP is the same 10-point floor the old bucketed
     version already used: below it, a difference is inside the projection's
     own noise (CLAUDE.md's Juke score section: MAE 6.8), not a real
     tendency worth acting on. */
  const GAP = 10;
  if (recEngineFormats.length >= 2 && stats.avgScore) {
    let worst = null;
    recEngineFormats.forEach((f) => {
      f.seats.forEach((s) => {
        if (s.count < 2 || s.avg === null) return;
        if (!worst || s.avg < worst.avg) worst = { scoring: f.scoring, seat: s.seat, avg: s.avg, count: s.count };
      });
    });
    if (worst && stats.avgScore.value - worst.avg >= GAP) {
      stats.recommendation = {
        scoring: worst.scoring,
        seat: worst.seat,
        avg: worst.avg,
        overallAvg: stats.avgScore.value
      };
    }
  }

  // The launcher's quick-start presets — each one names a real past entry
  // rather than a synthesised config, so starting it is just replaying that
  // entry's own league and seat (startFromHistoryLeague(), by id) instead of
  // reconstructing a league object here that a start path would have to
  // trust blindly.
  stats.presets = {
    repeatLast: { id: list[0].id, teams: list[0].teams || list[0].league.teams,
                  scoring: list[0].league.scoring },
    mostRun: (function () {
      const counts = new Map();
      list.forEach((e) => {
        const key = (e.teams || e.league.teams) + "-" + e.league.scoring;
        const row = counts.get(key) || { count: 0, entry: e };
        row.count++;
        counts.set(key, row);
      });
      let best = null;
      counts.forEach((row) => { if (!best || row.count > best.count) best = row; });
      return best
        ? { id: best.entry.id, teams: best.entry.teams || best.entry.league.teams,
            scoring: best.entry.league.scoring }
        : null;
    })(),
    deepestBoard: (function () {
      const best = list.reduce((a, b) => {
        const ta = (a.teams || a.league.teams) * a.league.rounds;
        const tb = (b.teams || b.league.teams) * b.league.rounds;
        return tb > ta ? b : a;
      });
      return { id: best.id, teams: best.teams || best.league.teams, scoring: best.league.scoring };
    })()
  };

  return stats;
}

// Replays one history entry's exact league and seat in a single action —
// the launcher's presets ("Repeat last setup" and the two derived ones)
// name an entry by id via historyStats() rather than carrying a whole league
// object out to React, so applying one is "look this up and start it", the
// same lookup openHistoryDraft() already does, just starting a fresh draft
// instead of reopening a finished one's analysis. Delegates the actual start
// to the bridge's own startDraft() rather than repeating its sequence
// (setupProblem() check, buildBoard(), seed, startedAt, runCPUs()) a second
// time — this only owns getting `league` into the right shape first.
function startFromHistoryLeague(id) {
  const entry = readHistory().find((e) => e.id === id);
  if (!entry) return false;
  Object.assign(league, JSON.parse(JSON.stringify(entry.league)));
  if (league.superflex === undefined) league.superflex = 0;
  return window.JukeEngine.startDraft({ mySlot: entry.mySlot, clockLength: entry.clockLength });
}

/* ---- Practice a scenario ----

   The Mock Drafts lobby's 2x2 grid of preset drafts (PracticeScenarios.jsx).
   Pressing a card starts a real mock under that card's settings, and this is
   the one function that turns a card into a draft.

   It is startFromHistoryLeague()'s sibling and deliberately built the same
   way: apply the settings to the ONE real `league` through setLeague(), then
   call the ordinary startDraft(). Nothing here holds a second idea of what a
   league is, and nothing here re-derives a round count, a replacement level
   or a legality rule that the engine already answers.

   ---- The handoff asked for a one-off override and this is not one ----

   Its requirement 3 is that a scenario "must NOT overwrite the user's saved
   default Draft settings". That is written for an app where draft settings
   are a saved per-user record; in Juke they are `league`, which IS the shape
   of the draft while it runs, and which no code path persists between
   sessions — every reload starts at the ten-team default.

   Restoring the previous league after launching a scenario is not merely
   unnecessary here, it breaks the draft it just started: resumeDraft()
   refuses any save whose settingsFingerprint() disagrees with the live
   league, by design, because resuming into different settings would corrupt
   the board. So a scenario draft left half-finished would come back
   unresumable, with an alert naming settings the manager never chose.

   So the scenario's settings become the league, exactly as a history preset's
   already do, and the launcher's own settings line under the Start button
   says what they now are. The one place a snapshot IS taken is the refusal
   path below, where there is no draft for a restore to disagree with.

   ---- rounds, expressed as the roster it actually is ----

   `league.rounds` is not a free number: setLeague() derives it from
   rosterSize() whenever the roster moves, because a round count that
   disagrees with the roster is what setupProblem() refuses. So a scenario
   asking for 15 rounds is asking for a bench one deeper, and the bench is
   solved for through rosterSize() itself rather than by restating
   "starters + flex + superflex" a second time here.

   Returns { ok, problem } rather than a bare boolean: a refusal has a
   sentence attached and the card is the thing that has to show it. */
function startScenario(scenario) {
  if (!scenario || !scenario.config) return { ok: false, problem: "That scenario has no settings." };
  // A room's league belongs to the room — every other control that can
  // rewrite league shape refuses here for the same reason (see startAtSeat's
  // own note in DraftRoom.jsx), and a scenario is a whole league at once.
  if (hasRoom()) return { ok: false, problem: "Scenarios are for solo mocks. Leave the room to run one." };

  const cfg = scenario.config;
  const before = { league: JSON.parse(JSON.stringify(league)), mySlot: state.mySlot, clockLength: state.clockLength };
  const restore = function () {
    Object.assign(league, JSON.parse(JSON.stringify(before.league)));
    state.mySlot = before.mySlot;
    state.clockLength = before.clockLength;
    mirrorToLegacy();
    render();
  };

  // Through the bridge's own setter, not Object.assign: that one mirrors to
  // the legacy <select>s (which readSetup() re-reads on the next trip home),
  // applies a scoring preset's lineup, derives `rounds`, and clamps the seat.
  // Four side effects, none of which a caller should be reproducing.
  const patch = {};
  if (cfg.teams) patch.teams = cfg.teams;
  if (cfg.scoring) patch.scoring = cfg.scoring;
  if (Object.keys(patch).length) window.JukeEngine.setLeague(patch);

  if (cfg.rounds) {
    // Everything in a roster that is not bench — asked of rosterSize() so
    // this stays the inverse of the real formula rather than a copy of it.
    const fixed = rosterSize() - league.bench;
    const bench = cfg.rounds - fixed;
    if (bench >= 0) window.JukeEngine.setLeague({ bench: bench });
  }

  // Seats are 1-based in a scenario config, because that is how the card
  // reads them out loud ("Seat 12"); state.mySlot is 0-based everywhere else.
  const seat = (cfg.seat === "random" || cfg.seat === undefined || cfg.seat === null)
    ? Math.floor(Math.random() * league.teams)
    : Math.min(Math.max(0, Number(cfg.seat) - 1), league.teams - 1);
  const clock = typeof cfg.clockSeconds === "number" ? cfg.clockSeconds : state.clockLength;

  /* Ask before starting, and put the league back if the answer is no.

     startDraft() checks setupProblem() itself and returns false — but by
     then the league has already been rewritten, so a refused scenario would
     leave a manager on the lobby with settings they did not choose and a
     Start button that will not press. Checking here is what makes the
     refusal free. */
  const problem = setupProblem();
  if (problem) { restore(); return { ok: false, problem: problem }; }

  state.mySlot = seat;
  const ok = window.JukeEngine.startDraft({ mySlot: seat, clockLength: clock, scenario: scenario.id || null });
  if (!ok) { restore(); return { ok: false, problem: setupProblem() || "That scenario could not be started." }; }
  return { ok: true };
}

// The Locker's "In progress" card. Null once there's nothing to resume, or
// once the one save slot has actually finished — that draft already has its
// own entry in history by the time this is asked, and showing it here too
// would put the same draft behind two different buttons in two different
// tabs of the same panel.
function inProgressSummary() {
  // DraftLocker.jsx calls this on mount, gated only on window.JukeEngine
  // existing rather than on dataReady() — draft-engine.js is still one of
  // the deferred files at that point (see the boot sequence below), so a
  // cold direct load of #/draft-room with a save already on disk can reach
  // the DraftEngine calls below before draft-engine.js has landed. Same
  // guard as onTheClock()/pickCode() above; null reads as "nothing to
  // resume" for one render and DraftLocker's own "juke:header" tick
  // repaints it correctly the moment the deferred data arrives.
  if (typeof DraftEngine === "undefined") return null;
  const data = readSave();
  if (!data || !data.picks || !data.picks.length) return null;
  const total = data.league.teams * data.league.rounds;
  if (data.picks.length >= total) return null;

  // onTheClock() reads the live league/state.picks; this asks the identical
  // question of a saved draft that may not be the one currently loaded, so
  // it calls DraftEngine directly against the save's own data instead.
  const clock = DraftEngine.onTheClock(data.league, data.picks.length);

  // Whose pick each index in the flat name list was, without storing it —
  // the same snake arithmetic onTheClock() itself just used, run backwards
  // over what's already been picked rather than a second, stored copy of
  // whose turn it was. A name that no longer resolves (the board is rebuilt
  // nightly) is dropped rather than shown broken, same posture
  // resumeDraft() already takes when a whole save fails to resolve.
  const myPicks = [];
  data.picks.forEach(function (name, i) {
    if (DraftEngine.pickInfo(i + 1, data.league).slot !== data.mySlot) return;
    const player = board.find((p) => p.name === name);
    if (player) myPicks.push({ name: player.name, pos: player.pos });
  });

  return {
    leagueType: leagueTypeLabel(data.league),
    pickPosition: ordinal(data.mySlot + 1),
    made: data.picks.length,
    total: total,
    teams: data.league.teams,
    rounds: data.league.rounds,
    scoring: scoringLabel(data.league.scoring),
    startedAt: data.startedAt || null,
    round: clock ? clock.round : null,
    onClockSlot: clock ? clock.slot : null,
    myTurn: !!clock && clock.slot === data.mySlot,
    // Most recent last, so the band can show the last 4-6 without an extra
    // reverse at render time.
    recentPicks: myPicks.slice(-6)
  };
}

// Resumes the one saved draft from the Locker. resumeDraft() below refuses
// unless the live league already matches the save's fingerprint — a rule
// that made sense when the same screen held both the dropdowns and the
// Resume button, so a person could be told to set them back. The Locker has
// no dropdowns of its own to blame, so this forces `league` to the save's
// own shape first (the one real league object, same as setLeague() and
// openHistoryDraft()) and rebuilds the board against it — after which
// resumeDraft()'s own fingerprint check is comparing a league against
// itself and always passes, so its refusal branch is simply never reached
// from here.
function resumeSavedDraft() {
  const data = readSave();
  if (!data) return false;
  Object.assign(league, JSON.parse(JSON.stringify(data.league)));
  if (league.superflex === undefined) league.superflex = 0;
  buildBoard();
  resumeDraft(data);
  return true;
}

// Reopens a finished draft from the Locker onto the Analysis tab. Unlike
// resumeDraft() above, this never refuses on a settings mismatch — there is
// no "change the dropdowns to match" step for a history card, it just opens
// — so it forces `league` to the shape the draft was actually played under
// first (the one real league object, same as setLeague()), then rebuilds
// the board against it before touching anything else live.
function openHistoryDraft(id) {
  const entry = readHistory().find((h) => h.id === id);
  if (!entry) return false;

  const entryLeague = JSON.parse(JSON.stringify(entry.league));
  if (entryLeague.superflex === undefined) entryLeague.superflex = 0;

  // Checked against the entry's own ADP set before anything live changes —
  // the player list is regenerated every morning, and a name that has since
  // fallen off the board must not leave the real setup screen half-mutated
  // on the way to failing.
  const set = (typeof ADP_SETS !== "undefined" &&
    (ADP_SETS[entryLeague.scoring] || ADP_SETS[DEFAULT_SET])) || PLAYERS;
  const names = new Set(set.map((p) => p.name));
  if (entry.picks.some((name) => !names.has(name))) {
    alert("That draft could not be reopened because the player list has " +
          "changed since it finished.");
    return false;
  }

  // render() below calls saveDraft(), which unconditionally overwrites
  // SAVE_KEY whenever state.started is true — exactly right for a real live
  // draft persisting itself, and exactly wrong here, where "started" only
  // means "this replay has state.picks to look at." Reopening a finished
  // draft from the Locker would silently overwrite a genuinely unfinished
  // one sitting in SAVE_KEY, and the Locker shows both the Locker table and
  // the in-progress "Resume" band on the same screen — a reader can open a
  // past draft's analysis while a real one is still waiting to be resumed.
  // Snapshotting and restoring the key around this call means viewing
  // history can never cost you the draft you have not finished yet.
  const savedGame = localStorage.getItem(SAVE_KEY);

  Object.assign(league, entryLeague);
  buildBoard();
  const resolved = entry.picks.map((name) => board.find((p) => p.name === name));

  state.mySlot      = entry.mySlot;
  state.clockLength = entry.clockLength;
  state.paused      = false;
  state.seed        = entry.seed;
  state.started     = true;

  applyJitter();
  state.picks = [];
  resolved.forEach(function (player) { makePick(player); });
  state.queue = [];
  state.watchlist = [];

  tabrow.hidden = false;
  revealAnalysis();
  // Seeded before the render below, so reopening a finished board is not
  // read as one that has only just finished — same reason resumeDraft() does
  // this in the same order.
  noteDraftPhase();
  resetClock();
  render();
  window.scrollTo(0, 0);

  try {
    if (savedGame === null) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, savedGame);
  } catch (err) {
    // Same posture as saveDraft() itself: private browsing and full quotas
    // both land here, and losing the restore is not worth breaking the
    // history view over.
  }

  return true;
}

// The counterpart to openHistoryDraft(), for a reader who closes the report
// without ever leaving the Lobby. openHistoryDraft() sets state.started to
// treat the replay as a real draft (draftOver(), onTheClock() and the rest
// all read it), and nothing put it back — so pressing "Start mock draft"
// right after closing the report skipped the whole entry screen and landed
// on what looked like an already-finished draft, because state.started was
// still true and state.picks still held the historical entry's 140 picks.
//
// goHome() looks like the obvious fix and is the wrong one: it also
// disconnects an active room (Live.disconnect()), which is exactly right
// for a real "leave the draft" action and exactly wrong for "I looked at an
// old draft's report from the Lobby" — #/drafts is reachable while a room
// is still in its lobby (a direct link, per DraftRoom.jsx's own comment),
// so a room in the middle of being formed could be sitting behind this
// screen the whole time the report was open. This clears only what
// openHistoryDraft() itself set, and touches nothing room- or save-related.
function closeHistoryDraft() {
  state.picks = [];
  state.started = false;
  state.paused = false;
  board.forEach((p) => { p.drafted = false; p.jitter = 0; });
  render();
}

function showResumeBar() {
  const bar = $("resumeBar");
  const data = readSave();
  if (!data || !data.picks.length) { bar.hidden = true; return; }

  // Described in the saved league's own terms, not the one on screen, so a
  // mismatch is visible before the Resume button is ever pressed.
  const saved = data.league;
  const total = saved.teams * saved.rounds;
  const made = data.picks.length;
  const round = Math.min(saved.rounds, Math.floor(made / saved.teams) + 1);
  const when = new Date(data.savedAt);
  const done = made >= total;
  const matches = data.fingerprint === settingsFingerprint(league);

  bar.hidden = false;
  bar.innerHTML = `
    <h4>${done ? "Finished draft saved" : "Draft in progress"}</h4>
    <p>Slot ${data.mySlot + 1} &middot; ${made} of ${total} picks
       ${done ? "" : "&middot; round " + round} &middot; saved
       ${when.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
    <p>${settingsText(saved)}${matches ? "" : " &middot; does not match the settings below"}</p>
    <div class="btnrow">
      <button class="primary" id="resumeBtn">${done ? "Reopen it" : "Resume"}</button>
      <button class="ghost" id="discardBtn">Discard</button>
    </div>`;
}


/* ---- 11e. Cross-device sync ------------------------------

   Everything above still writes SAVE_KEY and HISTORY_KEY first, and only
   ever that — a solo mock draft must not depend on anything being up, and
   nothing below changes what happens with no account, no network, or no
   worker deployed. This section is what happens *in addition*, once
   someone is signed in: the same two localStorage payloads, mirrored to
   the worker's /me/draft and /me/history through window.Live (live.js —
   see that file's own note on why draft sync lives there rather than a
   third copy of "where is the worker").

   window.JukeAuth is written by AuthBridge.jsx (web/src/components/) —
   this is a classic script and Clerk only runs inside React, so reading
   it defensively here is the same hazard, and the same fix, CLAUDE.md
   already records for window.JukeEngine read the other direction: a
   bridge global is only as safe as its own guard, never its caller's. */

function authToken() {
  return (window.JukeAuth && window.JukeAuth.isSignedIn && window.JukeAuth.getToken)
    ? window.JukeAuth.getToken()
    : Promise.resolve(null);
}

// Fire-and-forget, always. A save already happened in localStorage by the
// time any of these run — see saveDraft()/clearSave()/recordHistory()
// below — so a slow or failed network call must never hold up the thing
// that actually keeps a draft from being lost, and Live's own methods
// already resolve rather than reject on every failure mode. This wrapper
// exists only to keep "no token" from even attempting a call.
function syncUp(promiseFn) {
  authToken()
    .then(function (token) {
      if (!token) return;
      return Promise.resolve(promiseFn(token)).then(function (res) {
        noteSyncResult(res && res.ok, res && res.reason);
      });
    })
    // getToken() is Clerk's, and it rejects on an expired session and on a
    // network failure reaching Clerk itself. Without this the failure is an
    // unhandled rejection in a page that is otherwise fine — the same
    // reason the news fetch carries a catch rather than politeness.
    //
    // "unauthorized" rather than a reason of its own: from the reader's
    // side, Clerk refusing to mint a token and the worker refusing to
    // accept one are the same sentence — the session is not good — and
    // they have the same answer, which is to sign in again.
    .catch(function () { noteSyncResult(false, "unauthorized"); });
}

function pushSavedDraft(data) { syncUp((token) => Live.saveDraft(token, data)); }
function pushDraftCleared()   { syncUp((token) => Live.clearDraft(token)); }
function pushHistoryEntry(entry) { syncUp((token) => Live.saveHistoryEntry(token, entry)); }
function pushHistoryDeleted(id)  { syncUp((token) => Live.deleteHistoryEntry(token, id)); }

/* ---- Saying whether any of the above actually worked ----

   Every function in this section is fire-and-forget by design, and every
   layer below it answers a failure with a falsy value rather than an
   error: Live's own methods resolve to false/null/[] on a missing token
   and on a network failure alike, and store.js answers false for a
   missing D1 binding, a missing table and a failed write. That is the
   right contract — a draft must never be held up by a sync — but end to
   end it produced the exact failure CLAUDE.md's own deploy rule warns
   about, reported as "my phone's mock never reached my laptop": nothing
   on either device could tell "synced" from "signed in and silently
   writing to nowhere," because the two look identical from the page.

   So the result is kept. One value, three states — "off" (nobody signed
   in, which is the normal, complete product and not a fault), "ok", and
   "error" — read by the Locker through the bridge, and updated by the
   same juke:header event everything else in this file re-reads on. It is
   deliberately not a message, a code, or a retry count: the only thing a
   reader can act on is whether their drafts are actually somewhere other
   than this browser. */
let syncState = "off";

/* It used to be three states — "off", "ok", "error" — and "error" was the
   one that mattered and the one that could not be acted on. Three genuinely
   different faults reach it, with three different fixes, and the page said
   the same thing for all of them: a worker that will not accept the session,
   a worker that accepts it and cannot store anything, and no worker reachable
   at all. Telling them apart took a hand-written console probe against a live
   session, which is not a thing to ask of anybody.

   So the reason comes up from live.js (see its own note on the envelope) and
   is kept whole. `syncStatus()` answers one of:

     "off"           nobody is signed in — the normal, complete product
     "ok"            the last thing attempted reached the account
     "unauthorized"  the session was refused. Sign in again; if it persists
                     the worker has no CLERK_SECRET_KEY
     "store-failed"  the account was reached and could not store it — the
                     database end, not the sign-in end
     "offline"       nothing reached the worker at all

   Deliberately the worker's own vocabulary rather than a message: the
   sentence a reader sees belongs to the component drawing it, and a second
   copy of that prose here would be the "written down twice" rule with the
   copy furthest from the reader winning. */
function noteSyncResult(ok, reason) {
  const next = ok ? "ok" : (reason || "offline");
  if (syncState === next) return;
  syncState = next;
  // The Locker reads this through the bridge and re-reads on juke:header,
  // the same signal headerInfo() already fires — no second channel.
  window.dispatchEvent(new Event("juke:header"));
}

function syncStatus() { return syncState; }

/* AuthBridge fires "juke:auth" on any change to isSignedIn/userId/
   getToken, and getToken is a new function reference on renders that are
   not a real sign-in/out transition — so the listener at the end of this
   section debounces through reconcileIfStale() rather than reconciling on
   every one of them. The old once-per-session latch is gone with it; see
   reconcileIfStale()'s own note on why "once" was the bug rather than the
   protection. */

/* The one moment a merge decision gets made. Both halves compare what
   this browser already has against what the account already has and pick
   a winner — never assume the server should simply replace local, or a
   phone that has been offline all week would nuke a laptop's draft from
   an hour ago the next time it happened to sync first.

   The saved draft is last-write-wins by `savedAt`, because there is only
   ever one — the same "one save, one localStorage key" contract
   saveDraft() already enforces on one device, extended across devices
   rather than changed. History is not: every entry is a frozen record of
   a draft that already finished, so two entries with the same id are
   always identical and there is nothing to pick a winner between —
   merging is a union by id, and whichever side is missing an entry the
   other side has gets it pushed there. */
function reconcileWithServer() {
  if (reconcileInFlight) return;
  reconcileInFlight = true;

  authToken().then(function (token) {
    if (!token) { reconcileInFlight = false; return; }

    /* Each half returns the same {ok, reason} envelope the Live methods
       do, so a read that failed is not mistaken for an account with
       nothing in it. That distinction is not academic: signed in with an
       empty locker and no draft in progress, there is nothing to write, so
       under the old code a completely broken token reported "ok" — the one
       state a reader would act on, arrived at by never having tried. */
    const draftDone = Live.loadDraft(token).then(function (res) {
      if (!res.ok) return res;
      const remote = res.data;
      const local = readSave();
      if (remote && (!local || (remote.savedAt || 0) > (local.savedAt || 0))) {
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(remote)); } catch (err) {}
        showResumeBar();
        return { ok: true, reason: null };
      }
      if (local && (!remote || (local.savedAt || 0) > (remote.savedAt || 0))) {
        return Live.saveDraft(token, local);
      }
      return { ok: true, reason: null };
    });

    const historyDone = Live.loadHistory(token).then(function (res) {
      if (!res.ok) return res;
      const remoteList = res.entries;
      const localList = readHistory();
      const localIds = new Set(localList.map((e) => e.id));
      const remoteIds = new Set(remoteList.map((e) => e.id));

      const merged = localList.concat(remoteList.filter((e) => !localIds.has(e.id)));
      merged.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
      if (remoteList.some((e) => !localIds.has(e.id))) {
        writeHistory(merged.slice(0, HISTORY_LIMIT));
      }

      // The other direction: anything this browser has that the account
      // does not yet, one at a time — same as a fresh recordHistory()
      // push, because as far as the server is concerned that is exactly
      // what this is.
      localList.forEach(function (entry) {
        if (!remoteIds.has(entry.id)) pushHistoryEntry(entry);
      });
      return { ok: true, reason: null };
    });

    /* The merge writes localStorage and nothing else, which is a complete
       fix for the next page load and no fix at all for the one on screen
       — and the screen is where it was reported from. Every React surface
       that reads the locker (DraftLocker, MockDraftsPhone through
       DraftRoom's own tick) re-reads on "juke:header" and on nothing
       else, so a merge that lands after mount left a phone's finished
       draft invisible on the laptop until a manual reload.

       The event, deliberately, and NOT render(). render() ends in
       saveDraft(), which writes SAVE_KEY and pushes it up — so reconciling
       through it would answer every pull with a write of whatever this tab
       happens to hold, which is the one thing a merge must not do. It is
       guarded (`!state.started` returns early) and would very likely never
       have fired, and "very likely never" is not a property to give the
       function whose job is deciding which device's draft survives. The
       legacy half of the screen is already handled: showResumeBar() above
       is the only legacy DOM a merge can change.

       Unconditional, rather than leaning on noteSyncResult()'s own
       dispatch — that one only fires when the status CHANGES, and the
       second successful sync of a session is exactly when a second
       device's draft arrives. */
    /* The first real failure wins the reason rather than the last, so a
       token the worker will not accept is not reported as a storage
       problem because the history half happened to resolve second. Both
       halves ask the same worker with the same token, so in practice they
       agree; when they do not, the earlier one is the one to fix first. */
    return Promise.all([draftDone, historyDone]).then(function (results) {
      const bad = results.find(function (r) { return !(r && r.ok); });
      noteSyncResult(!bad, bad && bad.reason);
      window.dispatchEvent(new Event("juke:header"));
    });
  })
    .catch(function () { noteSyncResult(false); })
    .then(function () { reconcileInFlight = false; });
}

/* Sync is not a boot-time event, it is a "this tab is being looked at
   again" event, and that distinction is the whole of cross-device.

   The original ran exactly once per sign-in, which is correct for the
   device that finished the draft and useless for the other one: a laptop
   left open all afternoon reconciled at nine in the morning and never
   again, so a mock finished on a phone at two could not appear on it
   until the tab was reloaded by hand. That is precisely how it was
   reported.

   `visibilitychange` is the same signal live.js already uses to decide a
   dropped socket is worth reopening, and for the same reason: coming back
   to a tab is the strongest evidence there is that now is the moment.
   RECONCILE_MIN_MS keeps a fast alt-tab from turning into a request per
   switch, and reconcileInFlight keeps two overlapping triggers from
   racing each other into a double merge. */
const RECONCILE_MIN_MS = 30 * 1000;
let reconcileInFlight = false;
let lastReconcileAt = 0;

function reconcileIfStale() {
  if (!(window.JukeAuth && window.JukeAuth.isSignedIn)) return;
  const now = Date.now();
  if (now - lastReconcileAt < RECONCILE_MIN_MS) return;
  lastReconcileAt = now;
  reconcileWithServer();
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") reconcileIfStale();
});
window.addEventListener("online", reconcileIfStale);

/* And arriving at the locker, which is the one screen whose whole question
   is "what have I drafted" — the moment somebody would notice an answer
   that is missing a device. A tab that has been open and focused all
   afternoon fires no visibilitychange at all, so without this the only
   person the two events above cannot help is the one sitting on the very
   screen this is for. Same debounce, so walking between routes costs
   nothing. */
window.addEventListener("hashchange", function () {
  // The hash itself, not route(): that function answers "draft" or "home"
  // for app.js's own two legacy views and has never had a name for the
  // React locker, which owns its own hash-watching (see the note beside
  // #draftroom-root). Matching the prefix keeps #/drafts and any future
  // query on it, the same shape #/draft-room's own invite links take.
  if (location.hash.replace(/^#\/?/, "").split("?")[0] === "drafts") reconcileIfStale();
});

// Never runs synchronously at boot — Clerk has not loaded by the time this
// classic script does, so the first real answer arrives as an event,
// exactly like headerInfo()'s juke:header. Resets the once-per-session
// flag on a sign-out, so a later sign-in (a different account, or the
// same one again) reconciles again rather than staying silently stale for
// the rest of the tab's life.
window.addEventListener("juke:auth", function () {
  if (window.JukeAuth && window.JukeAuth.isSignedIn) {
    reconcileIfStale();
  } else {
    // A sign-out resets both halves: the next sign-in — the same account
    // again, or a different one — has to reconcile immediately rather
    // than waiting out a window it did not spend, and the Locker has to
    // stop claiming anything about an account nobody is in.
    lastReconcileAt = 0;
    syncState = "off";
    window.dispatchEvent(new Event("juke:header"));
  }
});


/* ---- 12. Tabs ------------------------------------------ */

function showPanel(id) {
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("on"));
  $(id).classList.add("on");
}


/* ---- 13. The setup screen ------------------------------

   The controls write into `league`, and everything else in
   the file reads from it. The board is rebuilt on every
   change so the player count in the header, and the ADP the
   Players tab shows, always match what is selected.        */

const suffix = ["th", "st", "nd", "rd"];
const slotSelect = $("draftSlot");

// Fill a select from a list of values. The label carries the position, so
// each control says what it is without needing a label of its own.
function fillList(select, values, chosen, labeller) {
  select.innerHTML = values.map((v) =>
    `<option value="${v}"${v === chosen ? " selected" : ""}>${labeller(v)}</option>`
  ).join("");
}

// Every contiguous range in the setup screen goes through the list version,
// so there is one place that knows how to build an option.
function fillRange(select, from, to, chosen, labeller) {
  const values = [];
  for (let i = from; i <= to; i++) values.push(i);
  fillList(select, values, chosen, labeller);
}

// Team counts are even, because a snake draft with an odd number of seats is
// a shape no real league uses and every one of these adds a column to the
// board. Sleeper offers the same set up to 24 and then jumps to 32; ours
// stops at 24 for a reason the setup screen explains when you get there —
// the ADP feed carries roughly 210 to 260 players, and 32 seats cannot fill
// even eight rounds out of that.
const TEAM_COUNTS = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

function ordinal(i) {
  const s = (i % 100 > 10 && i % 100 < 14) ? "th" : (suffix[i % 10] || "th");
  return i + s;
}

// The draft position dropdown has to be rebuilt whenever the team count
// changes, and the slot kept if it still exists in the smaller league.
// Slots are 0-indexed everywhere else, so the option values are too, and
// only the label is counted from one.
function fillSlotOptions() {
  const keep = Math.min(Number(slotSelect.value || 0), league.teams - 1);
  fillRange(slotSelect, 0, league.teams - 1, keep, (i) => ordinal(i + 1));
  slotSelect.value = keep;
}

/* How high the hidden legacy starter <select>s count.

   It was per position — QB 2, RB 4, WR 5, TE 3, K 2, DST 2 — which was that
   screen's own taste about a sane lineup and is enforced nowhere else in the
   app. DraftSettingsModal.jsx's steppers go to 9, and since setLeague()
   mirrors the roster back onto these controls (see mirrorToLegacy), a range
   narrower than the control writing to it is a mirror that fails without
   saying so: a <select> silently keeps its old value, and readSetup() reads
   that back on the next refreshSetup(). One number, matching the screen that
   is actually reachable. */
const SLOT_LIMIT = 9;

/* ---- the scoring editor ----

   Fields are generated from the rule table rather than written out in the
   markup, so a rule added to DEFAULT_RULES appears here automatically and
   the two can never disagree about what exists.                          */

const RULE_GROUPS = [
  ["Passing",  ["pass_yd", "pass_td", "pass_int", "pass_2pt",
                "pass_att", "pass_cmp", "pass_fd"]],
  ["Rushing",  ["rush_yd", "rush_td", "rush_2pt", "rush_fd"]],
  ["Receiving", ["rec", "rec_yd", "rec_td", "rec_2pt", "rec_fd", "rec_40p"]],
  ["Turnovers and returns", ["fum_lost", "kr_td", "pr_td"]],
  ["Kicking",  ["xpm", "xpmiss", "fgmiss", "fgm_0_19", "fgm_20_29",
                "fgm_30_39", "fgm_40_49", "fgm_50_59", "fgm_60p"]],
  // Its own group, and the group title is what says these are additional.
  // Sitting under "Kicking" beside "Field goal missed" they would read as a
  // replacement for it, and a manager typing -1 into one would be charging
  // -2 a miss — which would look harsh rather than wrong.
  ["Extra for a missed field goal, by distance",
               ["fgmiss_20_29", "fgmiss_30_39", "fgmiss_40_49",
                "fgmiss_50_59", "fgmiss_60p"]],
  ["Defense and special teams",
               ["sack", "int", "fum_rec", "safe", "def_td", "def_st_td",
                "blk_kick", "def_2pt"]],
  ["Points allowed by a defense",
               ["pts_allow_0", "pts_allow_1_6", "pts_allow_7_13",
                "pts_allow_14_20", "pts_allow_21_27", "pts_allow_28_34",
                "pts_allow_35p"]]
];

const RULE_LABELS = {
  pass_yd: "Per passing yard", pass_td: "Passing TD",
  pass_int: "Interception thrown", pass_2pt: "Passing 2-pt",
  pass_att: "Per pass attempt", pass_cmp: "Per completion",
  pass_fd: "Passing first down",
  rush_yd: "Per rushing yard", rush_td: "Rushing TD", rush_2pt: "Rushing 2-pt",
  rush_fd: "Rushing first down",
  rec: "Per reception", rec_yd: "Per receiving yard",
  rec_td: "Receiving TD", rec_2pt: "Receiving 2-pt",
  rec_fd: "Receiving first down", rec_40p: "Catch of 40+ yards",
  fum_lost: "Fumble lost", kr_td: "Kick return TD", pr_td: "Punt return TD",
  xpm: "Extra point", xpmiss: "Extra point missed", fgmiss: "Field goal missed",
  fgmiss_20_29: "Missed 20–29", fgmiss_30_39: "Missed 30–39",
  fgmiss_40_49: "Missed 40–49", fgmiss_50_59: "Missed 50–59",
  fgmiss_60p: "Missed 60+",
  fgm_0_19: "FG 0–19", fgm_20_29: "FG 20–29", fgm_30_39: "FG 30–39",
  fgm_40_49: "FG 40–49", fgm_50_59: "FG 50–59", fgm_60p: "FG 60+",
  sack: "Sack", int: "Interception", fum_rec: "Fumble recovered",
  safe: "Safety", def_td: "Defensive TD", def_st_td: "Special teams TD",
  blk_kick: "Blocked kick", def_2pt: "2-pt return",
  pts_allow_0: "Shutout", pts_allow_1_6: "1–6 allowed",
  pts_allow_7_13: "7–13 allowed", pts_allow_14_20: "14–20 allowed",
  pts_allow_21_27: "21–27 allowed", pts_allow_28_34: "28–34 allowed",
  pts_allow_35p: "35+ allowed"
};

// Rebuilt only when the values change underneath the user — on load, on a
// reset, and when the format preset moves the reception rule. Never on every
// keystroke, because that would steal focus mid-edit.
// True when the 2026 forecast actually carries this stat. The set is measured
// by the pipeline rather than written down here, so it stays honest the
// season Sleeper starts or stops projecting something. Missing file, or an
// older stats.js without the list, means we cannot tell — and claiming a rule
// is history-only when it is not would be worse than saying nothing.
function movesProjection(rule) {
  if (typeof PROJECTED_KEYS === "undefined") return true;
  return PROJECTED_KEYS.indexOf(rule) >= 0;
}

/* Yardage rules are the ones nobody thinks about as a multiplier. A league
   says "a point every 25 yards", not "0.04 a yard", and asking for 0.04 is
   how you get 0.4 typed by mistake and a quarterback projected for three
   thousand points. So these three take the divisor and show the multiplier
   underneath, which is the number the scoring engine actually uses. */
const PER_YARD_RULES = ["pass_yd", "rush_yd", "rec_yd"];

// 25 yards a point reads back as 0.04 exactly; a third of a yard does not.
// Four decimals is past the precision the raw data arrives in, so rounding
// there cannot lose a rule anyone would write.
function pointsFromDivisor(yards) {
  const n = Number(yards);
  if (!n || n <= 0 || !isFinite(n)) return 0;
  return Math.round((1 / n) * 10000) / 10000;
}

// The divisor that produced a multiplier, for redrawing the control. Blank
// rather than Infinity when the rule scores nothing, because "every 0 yards"
// is not a thing a person can read.
function divisorFromPoints(points) {
  const n = Number(points);
  if (!n || n <= 0 || !isFinite(n)) return "";
  return Math.round((1 / n) * 100) / 100;
}

function renderScoringFields() {
  $("scoringFields").innerHTML = RULE_GROUPS.map(function (group) {
    const rows = group[1].map(function (rule) {
      // A rule Sleeper does not forecast still scores every past season and
      // every week-by-week line correctly. It just adds nothing to the 2026
      // projection, which is what the board is ranked on — so the editor
      // says so on the rule itself rather than in a paragraph underneath
      // that nobody reads while they are editing a number.
      const history = !movesProjection(rule);
      const tip = history
        ? ' title="Sleeper does not forecast this stat. The rule scores past seasons and weekly logs, but adds nothing to the 2026 projection the board is ranked on."'
        : "";
      const mark = history ? '<i class="past">past only</i>' : "";

      if (PER_YARD_RULES.indexOf(rule) >= 0) {
        return `<label class="rule per-yard${history ? " history-only" : ""}"${tip}>
            <span>${RULE_LABELS[rule] || rule}${mark}</span>
            <span class="divisor">
              <i>1 pt every</i>
              <input type="number" step="1" min="1" data-divisor="${rule}"
                     value="${divisorFromPoints(league.rules[rule])}">
              <i>yds</i>
              <b>${league.rules[rule] || 0} per yard</b>
            </span>
          </label>`;
      }

      return `<label class="rule${history ? " history-only" : ""}"${tip}>
          <span>${RULE_LABELS[rule] || rule}${mark}</span>
          <input type="number" step="0.01" data-rule="${rule}" value="${league.rules[rule]}">
        </label>`;
    }).join("");
    return `<p class="section-label">${group[0]}</p><div class="rulegrid">${rows}</div>`;
  }).join("") +
  `<p class="hint">Historical seasons and weeks carry every stat above.
   Sleeper's projections are coarser, so anything marked <i class="past">past only</i>
   scores a player's record correctly and adds nothing to his 2026 projection
   &mdash; which is what this board is ranked on.</p>`;

  /* These inputs are new elements every time, so a lock set on the last set of
     them has just been thrown away. Re-applied here rather than at the call
     sites: this function is called from five places and one of them forgetting
     is a scoring editor that quietly works again in somebody else's room. */
  if (typeof Live !== "undefined" && Live.room()) lockScoring(true);
}

/* Read off the rules rather than off league.scoring, and deliberately: the
   scoring editor can set points per catch to anything, and a league that has
   been edited to 0.75 is not any of the three named formats. So the name is
   used when the number matches one exactly, and the number speaks for itself
   when it does not. */
function scoringSummary() {
  const r = league.rules;
  const format = Object.keys(REC_BY_FORMAT)
    .filter(function (k) { return REC_BY_FORMAT[k] === r.rec; })[0];
  const rec = format ? SCORING_NAMES[format] : r.rec + " per catch";
  return `${rec} · ${r.pass_td} pt passing TD · ${r.rush_td} pt rushing TD`;
}

/* What the League box says while it is shut. Built from `league` like
   everything else, so it cannot describe a different league from the one the
   controls inside it hold — the same reason scoringSummary() exists. */
function leagueSummary() {
  // settingsText(league), not a second copy of the same join — that
  // function is already the one place a league's shape becomes a sentence,
  // and this used to be a near-identical template literal beside it. The
  // moment settingsText() learned about draft type and player pool, this
  // one would have gone on describing a league that no longer existed.
  return settingsText(league);
}

function fillSetupControls() {
  fillList($("teamCount"), TEAM_COUNTS, league.teams, (i) => i + " teams");
  // Filled from SCORING_NAMES rather than written into the markup, so the
  // dropdown cannot drift from the labels the rest of the app prints.
  fillList($("scoring"), Object.keys(SCORING_NAMES), league.scoring,
           (k) => SCORING_NAMES[k]);
  fillRange($("roundCount"), 8, 24, league.rounds, (i) => i + " rounds");
  POSITIONS.forEach(function (pos) {
    const label = posLabel(pos);
    fillRange($("start" + pos), 0, SLOT_LIMIT, league.starters[pos],
              (i) => label + " " + i);
  });
  fillRange($("startFLEX"), 0, 3, league.flex, (i) => "FLEX " + i);
  fillRange($("startSFLEX"), 0, 2, league.superflex, (i) => "SFLEX " + i);
  /* 15 and 24 rather than 12 and 20, to cover everything the React settings
     screen can produce: its bench stepper goes to 15, and rounds is the roster
     size, so 8 starters + 1 FLEX + 15 bench is a 24-round draft. A <select>
     silently refuses a value that is not one of its options — `.value` stays
     put and readSetup() then reads the old number back — so a range narrower
     than the control that writes to it is a mirror that fails without saying
     so. TEAM_COUNTS already tops out at 24 for its own reasons. */
  fillRange($("benchCount"), 0, 15, league.bench, (i) => "BN " + i);
  fillSlotOptions();
}

/* Which keys of `league` the roster is made of, and therefore which ones
   `rounds` is derived from. Named once because setLeague() asks twice — once
   to re-derive rounds and once to mirror the values back to the legacy
   controls readSetup() reads. */
const ROSTER_KEYS = ["starters", "flex", "superflex", "bench"];

/* Write the league back onto the hidden legacy <select>s.

   Not decoration: readSetup() reads every one of these on the next
   refreshSetup(), so a value React set and this did not mirror is a value the
   next trip home quietly discards. See setLeague()'s own note.

   From `league` rather than from the patch that caused the call, which is the
   version that cannot miss: a scoring preset moves `superflex` without
   `superflex` ever appearing in the patch, and setLeague() re-derives `rounds`
   from the roster rather than being handed it. Reading the object everything
   else already agrees is the source of truth removes both special cases. */
function mirrorToLegacy() {
  $("teamCount").value  = String(league.teams);
  $("scoring").value    = league.scoring;
  $("roundCount").value = String(league.rounds);
  $("startFLEX").value  = String(league.flex);
  $("startSFLEX").value = String(league.superflex);
  $("benchCount").value = String(league.bench);
  POSITIONS.forEach(function (pos) { $("start" + pos).value = String(league.starters[pos]); });
}

// Tracks the format across reads, so the reception preset applies once when
// the dropdown moves rather than on every refresh.
let lastFormat = league.scoring;

/* A seat only exists inside a league, so shrinking the league has to move
   anybody sitting past the new edge.

   Nothing did. setMySlot() refuses an out-of-range seat on the way IN, which
   made this look covered — but it is the team count that moves underneath a
   seat already chosen, and no writer of `teams` had anything to say about it.
   Take seat 10 of 12 and then drop to 8 teams and state.mySlot stays 9:
   onTheClock() only ever returns 0..7, so isMyTurn() is never true and the
   draft runs to the end without ever offering a pick. It does not throw and
   nothing on screen says so — it looks like a draft that simply skips you.

   Both doors call this, because there are two: setLeague() is React's and
   readSetup() is the legacy screen's, and a clamp on one of them is a clamp
   nobody can rely on. Clamping to the last chair rather than to 0 keeps a
   deliberate choice of "late" as late as the new league allows, which is
   nearer what was asked for than jumping back to first. */
function clampSeat() {
  if (state.mySlot >= league.teams) state.mySlot = Math.max(0, league.teams - 1);
}

// Read every control into `league`. Called on any change, so the object is
// the single description of the league from that moment on.
function readSetup() {
  league.teams   = Number($("teamCount").value);
  league.rounds  = Number($("roundCount").value);
  league.scoring = $("scoring").value;
  // The format preset owns exactly one rule, and only at the moment it
  // changes. Applying it on every read would overwrite a hand-edited
  // reception value the instant anything else on the screen moved.
  if (league.scoring !== lastFormat) {
    league.rules.rec = REC_BY_FORMAT[league.scoring];
    lastFormat = league.scoring;
    renderScoringFields();
  }
  league.flex      = Number($("startFLEX").value);
  league.superflex = Number($("startSFLEX").value);
  league.bench   = Number($("benchCount").value);
  POSITIONS.forEach(function (pos) {
    league.starters[pos] = Number($("start" + pos).value);
  });
  clampSeat();
}

/* Two ways a league can be impossible rather than merely unusual:
   the roster does not add up to the rounds being drafted, or the draft
   wants more players than the ADP set actually carries. Either one is
   reported here and blocks the start rather than failing mid-draft. */
function setupProblem() {
  /* A board that has not arrived is not a board that is too small, and until
     this line the two were the same sentence.

     poolSize() reads adpSet(), which is empty until players.js lands — so
     every check below it measured a league against nothing and reported
     "10 teams over 14 rounds is 140 picks, and the half PPR board only
     carries 0 players." Every word of that is false and the reader has no
     way to know it: it names their league, their format and a number, and it
     is really just "wait a moment".

     It was always reachable — the deferred data has never been synchronous,
     and on a slow connection it lands well after the Lobby is on screen —
     and it became easy to hit when the deferred load moved behind the cold-
     load reveal (see loadAfterTheReveal()). Three specs found it within one
     run by pressing Start on the frame the overlay lifted, which is a thing
     a person can do.

     Still a refusal, because a draft genuinely cannot start without a board.
     What changes is that the reason is true and clears itself: the
     "juke:data-loaded" listener at the foot of this file re-runs
     refreshSetup(), which re-renders and redispatches "juke:header" for the
     React screens to re-read. */
  if (!dataReady()) return "Loading the player board…";

  const filled = rosterSize();
  if (filled !== league.rounds) {
    return `${starterCount()} starters + ${flexCount()} FLEX + ${league.bench} bench ` +
           `= ${filled} roster spots, but the draft runs ${league.rounds} rounds.`;
  }
  if (totalPicks() > poolSize()) {
    /* The pool is what adpSet() actually returns, which since the
       available-players filter arrived is not always the whole ADP set —
       so a rookies-only draft is refused here the same way an over-long one
       always was, with the reason naming the filter rather than the format.
       Getting this from poolSize() rather than from a second count is what
       makes the two agree by construction: the board this validates is
       literally the array buildBoard() will map over. */
    if (league.playerPool && league.playerPool !== "all") {
      return `${league.teams} teams over ${league.rounds} rounds is ${totalPicks()} picks, ` +
             `and there are only ${poolSize()} ${league.playerPool === "rookies" ? "rookies" : "veterans"} ` +
             `on the board. Widen the player pool, or run fewer teams or rounds.`;
    }
    return `${league.teams} teams over ${league.rounds} rounds is ${totalPicks()} picks, ` +
           `and the ${scoringLabel(league.scoring)} board only ` +
           `carries ${poolSize()} players.`;
  }
  /* And the same refusal for the case the count above cannot see: enough
     players on the board, not enough that this room is allowed to hold.

     absorbableSize() is always the smaller of the two, so this branch is only
     ever reached when the raw pool was sufficient — which is why the message
     names the lineup rather than the board. The shortfall is not a rounding
     error and it is not the drafter's to avoid: every pick past the ceiling
     has to go on a second kicker, a second defense or a spare quarterback,
     roster construction docks nine for each of them, and no ordering rule
     inside cpuChoice() can make the total any smaller — the waste is
     conserved. Measured across the whole (scoring x teams x bench 0-15) space,
     60 of 528 configurations are in it, worst 40 unstartable roster spots in a
     single draft; the reported one is 16 teams over 14 rounds, at 10.

     "A control that cannot act must not merely fail; it must not be offered."
     The draft it would run does finish, which is exactly what made this hard
     to see — it finishes with ten roster spots nobody chose to waste. */
  if (totalPicks() > absorbableSize()) {
    // "1 picks" is what the shortfall reads as when a league is over by
    // exactly one, which is the commonest way to be over at all — the
    // stepper moves in single rounds, so the first refusal a person meets
    // is usually the narrowest one.
    const over = totalPicks() - absorbableSize();
    return `${league.teams} teams over ${league.rounds} rounds is ${totalPicks()} picks, ` +
           `but a ${league.teams}-team room can only hold ${absorbableSize()} of the ` +
           `${poolSize()} players on this board — so ${over} ` +
           `${over === 1 ? "pick" : "picks"} would have to go on somebody nobody can start. ` +
           `Run fewer teams, or a shorter roster.`;
  }
  return "";
}

function refreshSetup() {
  if (state.started) return;
  readSetup();
  fillSlotOptions();

  const problem = setupProblem();
  const note = $("rosterSum");
  note.textContent = problem ||
    `${starterCount()} starters + ${flexCount()} FLEX + ${league.bench} bench ` +
    `= ${league.rounds} rounds, ${totalPicks()} picks.`;
  note.classList.toggle("bad", !!problem);
  $("startBtn").disabled = !!problem;
  $("scoringSummary").textContent = scoringSummary();
  $("leagueSummary").textContent = leagueSummary();

  /* The League box is shut by default, and everything that can refuse the
     Start button lives inside it. So the reason is repeated next to the
     button, and the box is opened so the control that needs changing is
     actually on screen — a disabled button whose explanation is folded away
     is worse than the wall of controls the box replaced.

     Opened, never closed: once somebody has it open they are working in it,
     and having it shut itself the moment the arithmetic came right would
     take the screen away mid-edit. */
  const msg = $("setupProblemMsg");
  msg.textContent = problem;
  msg.hidden = !problem;
  if (problem) $("leagueBox").open = true;

  // Scoring decides which ADP set the board comes from, so it has to be
  // rebuilt here rather than only when the draft starts.
  buildBoard();
  showResumeBar();
  render();
}

fillSetupControls();
renderScoringFields();

// Delegated, and on change rather than input, so the board is rebuilt when a
// value is committed instead of on every keystroke.
$("scoringFields").addEventListener("change", function (e) {
  const data = e.target.dataset;
  if (!data) return;

  // A yardage field carries the divisor a league actually says out loud;
  // the engine wants the multiplier, so it is converted on the way in and
  // the fields are redrawn so the "per yard" line under it stays true.
  if (data.divisor) {
    league.rules[data.divisor] = pointsFromDivisor(e.target.value);
    renderScoringFields();
    refreshSetup();
    return;
  }

  if (!data.rule) return;
  const value = Number(e.target.value);
  league.rules[data.rule] = isNaN(value) ? 0 : value;
  refreshSetup();
});

$("resetScoring").addEventListener("click", function () {
  league.rules = rulesForFormat(league.scoring);
  renderScoringFields();
  refreshSetup();
});

["teamCount", "roundCount", "scoring", "startFLEX", "startSFLEX", "benchCount"]
  .concat(POSITIONS.map((pos) => "start" + pos))
  .forEach(function (id) {
    $(id).addEventListener("change", refreshSetup);
  });

// PLAYERS_META only exists once players.js has been generated, so
// check for it rather than assuming.
(function showFreshness() {
  const note = $("freshness");
  if (typeof PLAYERS_META === "undefined") { note.textContent = ""; return; }
  const flagged = PLAYERS_META.flagged
    ? " \u00b7 " + PLAYERS_META.flagged + " injury designations"
    : "";
  note.textContent = PLAYERS_META.count + " players \u00b7 data " +
                     PLAYERS_META.generated + flagged;
})();

/* ---- the invite panel ----------------------------------- */

/* The controls a room owns once you are in one. Named here so locking and
   unlocking cannot drift apart — the bug that shipped first was exactly
   that: one path set them, the other returned before clearing them.

   This was five controls, and the shape of a league is far more than five.
   The starting lineup, the bench and all thirty-eight scoring rules were left
   open, and every one of them runs refreshSetup() → readSetup() → buildBoard()
   — so a manager who had joined somebody else's room could rebuild their own
   board out from under it. Nothing about it looked wrong on screen: their
   replacement levels, suggestions and grade simply stopped describing the
   draft everybody else was in, and adoptRoom() could not put it back, because
   a room only broadcasts the league it was created with.

   Locked for the host too, not only for joiners. The CPU wobble reads a
   player's position on the board and every client has to reach the same
   answer, so the shape is fixed the moment the room exists — for whoever made
   it as much as for whoever joined. Changing it means a new room. */
const LOCKABLE = ["teamCount", "roundCount", "scoring", "pickClock", "draftSlot",
                  "startFLEX", "startSFLEX", "benchCount"]
  .concat(POSITIONS.map((pos) => "start" + pos));

/* The scoring editor is thirty-eight fields drawn by renderScoringFields(),
   so it is locked by sweeping it rather than by name. Re-queried each time,
   because those inputs are rebuilt whenever a rule changes. */
function lockScoring(locked) {
  $("scoringFields").querySelectorAll("input, select").forEach(function (field) {
    field.disabled = locked;
  });
  $("resetScoring").disabled = locked;
}

/* What a room is called: its host, or its invite code until they have typed a
   name. Nothing is stored for it — the room derives it from the host's member
   record, which is a name they have already given and the room has already
   cleaned, so it follows them if they rename themselves.

   The box's own label carries it, rather than a heading of its own. That label
   is the first line of the panel and it is where a joiner was reading the
   settings of whatever room they had last made, which is what made a room feel
   like the wrong one. */
function roomTitle(room) {
  if (!room) return "Draft with friends";
  if (room.hostName) return room.hostName + "'s Draft Room";
  return Live.state().code ? "Draft Room " + Live.state().code : "The Draft Room";
}

/* Setting the draft order. Which seat the host has picked up, and nothing
   else — the swap itself is the room's to perform, and the seat list only
   moves when it says so, exactly as the board does for a pick.

   Declared above renderInvite() rather than beside its handlers, because a
   `const` is in its temporal dead zone until the line runs and renderInvite()
   reads this one. */
const seatOrder = { held: null };

const STATUS_TEXT = {
  connecting:   "Connecting…",
  reconnecting: "Reconnecting to the room — your seat is held.",
  closed:       "Lost the connection. Reopen the link to rejoin — your seat is held.",
  rejected:     "Could not join."
};

const REJECT_TEXT = {
  "stale-data": "This room started on an older player list than the one you have. " +
                "Whoever created it should reload the page and make a new room.",
  "bad-league": "That room could not be created. Check the league settings and try again."
};

function renderInvite() {
  const box = $("inviteLive");
  const startRow = $("inviteStart");

  /* No worker to talk to yet. Better to say so than to offer a button
     that opens a socket into nothing, which fails as a connection that
     never arrives and reads exactly like a bug. */
  if (typeof Live === "undefined" || !Live.configured()) {
    box.hidden = true;
    startRow.hidden = true;
    $("inviteHint").textContent =
      "Not set up yet. Drafting with friends needs the room deployed once — " +
      "see worker/README.md. Solo mock drafts are unaffected.";
    return;
  }

  const room = typeof Live === "undefined" ? null : Live.room();
  const status = typeof Live === "undefined" ? "off" : Live.status();

  // Locking is undone here as well as set below, because leaving a room
  // comes through this branch and an early return left every control
  // disabled with nothing on screen explaining why.
  // The summary of the Draft with friends box, which is where the old
  // <label> went when that section was collapsed.
  const label = $("friendsTitle");

  // A host who has just made a room came here to send a link, so the box
  // opens itself rather than making them go and find it. Only ever opened:
  // somebody who closes it mid-room has said something, and reopening it on
  // the next broadcast would be an argument rather than a feature.
  if (status !== "off") $("friendsBox").open = true;

  if (status === "off") {
    box.hidden = true;
    startRow.hidden = false;
    label.textContent = roomTitle(null);
    LOCKABLE.forEach(function (id) { $(id).disabled = false; });
    lockScoring(false);
    $("startBtn").disabled = false;
    $("startBtn").textContent = "Start your draft";
    return;
  }

  startRow.hidden = true;
  box.hidden = false;
  label.textContent = roomTitle(room);
  $("inviteLink").value = Live.link() || "";

  const reason = Live.reason();
  let text = STATUS_TEXT[status] || "";
  if (reason && REJECT_TEXT[reason]) text = REJECT_TEXT[reason];

  /* Draft order is the host's, and only while the room is still filling up.
     Once a pick exists the snake order is what those picks *mean*, so moving a
     chair would rewrite whose they were. */
  const canOrder = !!room && room.isHost && room.status === "lobby";

  if (status === "open" && room) {
    const taken = room.seats.filter((s) => s.taken).length;
    text = taken === 1
      ? "You are the only one here. The other " + (room.seats.length - 1) +
        " seats will be drafted by the CPU unless somebody takes them."
      : taken + " of " + room.seats.length + " seats taken. The rest are CPU.";
    if (room.status !== "lobby") text = "Drafting. " + text;
    if (canOrder) {
      text += seatOrder.held === null
        ? " Drag a seat, or tap two, to set the draft order."
        : " Now tap the seat to swap it with.";
    }
  }
  $("inviteStatus").textContent = text;

  /* A seat's name is typed by a person, so it is escaped exactly as a chat
     message is. This list used to be safe by accident — every chair said
     "Manager" or "CPU", both of which we wrote — and stopped being the moment
     names became real. Names are not a display detail; they are the second
     piece of text on this page that somebody else wrote.

     For the host it is a row of buttons rather than a row of spans. Draggable
     for a mouse, and tap-one-then-tap-another for a phone — the host is very
     often on one, and HTML5 drag and drop does not exist on touch at all, so
     the drag alone would be a feature that works on the machine it was built
     on and nowhere else. Both paths end at the same swap. */
  $("seatList").innerHTML = !room ? "" : room.seats.map(function (s) {
    const who = s.you ? "You" : s.taken ? escHtml(s.name || "Manager") : "CPU";
    const kind = s.you ? "you" : s.taken ? "human" : "";

    if (!canOrder) {
      return `<span class="seat ${kind}"><b>${s.index + 1}</b>${who}</span>`;
    }

    const held = seatOrder.held === s.index;
    return `<button type="button" class="seat ${kind} movable${held ? " held" : ""}"
        draggable="true" data-seat="${s.index}" aria-pressed="${held}"
        aria-label="Seat ${s.index + 1}, ${who}. Tap to move.">
        <b>${s.index + 1}</b>${who}</button>`;
  }).join("");

  /* The room owns the shape once you are in one, so the controls that would
     change it out from under everybody are locked rather than lying.

     Being in a room is `room`, not `status === "open"`. A socket that has
     dropped is being reconnected and the room is still there — and the
     difference matters far more than it looks, because this is also what the
     start button reads. Keyed on the socket, a phone that had been backgrounded
     for ten seconds came back with every control unlocked and a button
     offering to start a draft, and the button meant the solo one. */
  const locked = !!room;
  LOCKABLE.forEach(function (id) { $(id).disabled = locked; });
  lockScoring(locked);

  const startBtn = $("startBtn");
  if (!locked) {
    startBtn.textContent = "Start your draft";
    startBtn.disabled = false;
  } else if (status !== "open") {
    // Nothing can be started while the room cannot hear us, and a button that
    // says otherwise is the one that started a private draft nine people were
    // waiting on.
    startBtn.textContent = "Reconnecting…";
    startBtn.disabled = true;
  } else {
    startBtn.textContent = room.isHost
      ? "Start the draft for everyone"
      : "Waiting for the host…";
    startBtn.disabled = !room.isHost;
  }
}

function joinRoom(code, asHost) {
  Live.onChange(onRoomChange);
  Live.onTyping(onRoomTyping);
  Live.connect(code, {
    // Null means "use the stored one", which live.js does. Typing a name into
    // the setup screen before creating a room is the normal way round.
    name: null,
    league: asHost ? JSON.parse(JSON.stringify(league)) : {},
    clock: asHost ? league.clockLength || Number($("pickClock").value) : 0,
    dataVersion: (typeof PLAYERS_META !== "undefined" && PLAYERS_META.generated) || ""
  });
  renderInvite();
}

$("createRoomBtn").addEventListener("click", function () {
  readSetup();
  if (setupProblem()) { refreshSetup(); return; }
  const code = Live.newCode();
  // The code goes in the address bar as well as the box, so the browser's
  // own share and bookmark both do the right thing.
  location.hash = "#/draft?room=" + code;
  joinRoom(code, true);
});

function seatAt(target) {
  const button = target && target.closest && target.closest(".seat[data-seat]");
  return button ? Number(button.dataset.seat) : null;
}

function swapSeatsTo(index) {
  if (index === null || seatOrder.held === null) return;
  if (index !== seatOrder.held) Live.swapSeats(seatOrder.held, index);
  seatOrder.held = null;
  // Drawn now rather than waiting for the broadcast, so the seat lets go under
  // the finger. A rejected swap is corrected by the state that follows.
  renderInvite();
}

/* Delegated from document, because renderInvite() rebuilds every one of these
   buttons on every broadcast — a chat message included — and a listener
   attached to one of them would be thrown away seconds after it was set. */
document.addEventListener("click", function (e) {
  const index = seatAt(e.target);
  if (index === null) return;

  if (seatOrder.held === null || seatOrder.held === index) {
    // Tapping the held seat again puts it back down rather than swapping it
    // with itself, which is the only way out of a tap you did not mean.
    seatOrder.held = seatOrder.held === index ? null : index;
    renderInvite();
    return;
  }
  swapSeatsTo(index);
});

document.addEventListener("dragstart", function (e) {
  const index = seatAt(e.target);
  if (index === null) return;
  seatOrder.held = index;
  /* Firefox will not start a drag at all unless something is set, and the
     seat index goes in as well as being held above so a drag that somehow
     outlives this page's state still knows what it is carrying. */
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(index)); } catch (err) {}
  }
  renderInvite();
});

// A drop target has to say it is one, and the way to say so is to cancel the
// dragover. Without this the drop event never fires and nothing happens.
document.addEventListener("dragover", function (e) {
  if (seatOrder.held === null || seatAt(e.target) === null) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
});

document.addEventListener("drop", function (e) {
  const index = seatAt(e.target);
  if (index === null || seatOrder.held === null) return;
  e.preventDefault();
  swapSeatsTo(index);
});

// A drag abandoned over the page, or off it. The seat stays picked up for the
// tap path, so this only tidies the drag's own visual state.
document.addEventListener("dragend", function (e) {
  if (seatAt(e.target) !== null) renderInvite();
});

$("copyLinkBtn").addEventListener("click", function () {
  const field = $("inviteLink");
  const button = this;
  const done = function () {
    button.textContent = "Copied";
    setTimeout(function () { button.textContent = "Copy"; }, 1600);
  };
  // The clipboard API needs a secure context, which file:// is not, so the
  // old selection trick stays as the fallback rather than the button doing
  // nothing for anyone who opened the page from disk.
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(field.value).then(done, function () {
      field.select(); document.execCommand("copy"); done();
    });
  } else {
    field.select(); document.execCommand("copy"); done();
  }
});

$("leaveRoomBtn").addEventListener("click", function () {
  Live.disconnect();
  location.hash = "#/draft-room";
  renderInvite();
  renderChat();
  refreshSetup();
});

/* ---- the GIF picker ----
   Searched through the worker, because the GIPHY key is server-side. With no
   key set the worker answers configured:false and this says so rather than
   showing an empty grid that looks like a search with no results. */
let gifTimer = null;

function renderGifs(payload) {
  const holder = $("gifResults");

  if (!payload.configured) {
    holder.innerHTML = `<p class="chatempty">GIFs are not set up for this room yet.</p>`;
    return;
  }
  if (payload.error) {
    holder.innerHTML = `<p class="chatempty">GIPHY did not answer. Try again in a moment.</p>`;
    return;
  }
  if (!payload.results.length) {
    holder.innerHTML = `<p class="chatempty">Nothing found.</p>`;
    return;
  }

  // Every address is checked before it becomes an img src, exactly as the
  // ones arriving over chat are: a reply from the worker is still data.
  holder.innerHTML = payload.results.map(function (g) {
    const url = safeGif(g.url);
    if (!url) return "";
    return `<button type="button" class="gifpick" data-gif="${escHtml(url)}">
        <img src="${escHtml(url)}" alt="${escHtml(g.alt || "GIF")}" loading="lazy">
      </button>`;
  }).join("");
}

$("gifBtn").addEventListener("click", function () {
  const box = $("gifBox");
  box.hidden = !box.hidden;
  if (!box.hidden) {
    $("gifQuery").focus();
    $("gifResults").innerHTML = `<p class="chatempty">Type to search.</p>`;
  }
});

$("gifClose").addEventListener("click", function () { $("gifBox").hidden = true; });

$("gifQuery").addEventListener("input", function () {
  const q = this.value.trim();
  // Debounced, so typing "touchdown" is one search rather than nine.
  if (gifTimer) clearTimeout(gifTimer);
  if (!q) { $("gifResults").innerHTML = `<p class="chatempty">Type to search.</p>`; return; }
  gifTimer = setTimeout(function () {
    Live.gifSearch(q).then(renderGifs);
  }, 350);
});

$("gifResults").addEventListener("click", function (e) {
  const button = e.target.closest ? e.target.closest("[data-gif]") : null;
  if (!button || !inRoom()) return;
  Live.chat($("chatInput").value.trim(), button.dataset.gif);
  $("chatInput").value = "";
  $("gifBox").hidden = true;
});

$("chatForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const field = $("chatInput");
  const text = field.value.trim();
  if (!text || !inRoom()) return;
  Live.chat(text);
  field.value = "";
  // Sending is the clearest possible signal that you have stopped typing.
  chatUI.sentTypingAt = 0;
  Live.typing(false);
  // Kept focused, because a draft chat is a conversation and reaching back
  // for the box between every line is how people stop bothering.
  field.focus();
});

/* Typing, told to the room on a leading edge and then not again for two
   seconds. A message per keystroke would be a message per keystroke for
   everybody else in the room as well, and the thing it conveys — somebody is
   mid-sentence — does not get truer for being repeated. */
$("chatInput").addEventListener("input", function () {
  if (!inRoom()) return;

  if (!this.value) {
    if (chatUI.sentTypingAt) { chatUI.sentTypingAt = 0; Live.typing(false); }
    return;
  }

  const now = Date.now();
  if (now - chatUI.sentTypingAt < 2000) return;
  chatUI.sentTypingAt = now;
  Live.typing(true);
});

// One-tap lines. A draft moves fast enough that typing "nice pick" is often
// more effort than the thought deserves.
$("chatReactions").addEventListener("click", function (e) {
  const button = e.target.closest ? e.target.closest("[data-say]") : null;
  if (!button || !inRoom()) return;
  Live.chat(button.dataset.say);
});

/* ---- reacting to a message ------------------------------

   Delegated from the log, because renderChat() rebuilds all of it on every
   broadcast and a listener attached to a message would not survive the next
   thing anybody said. */
$("chatLog").addEventListener("click", function (e) {
  if (!e.target.closest || !inRoom()) return;

  /* An existing chip, or one in the picker: pressing it adds yours, pressing
     it again takes it back. Closing here rather than leaving it to the
     rebuild, because the click that chose the emoji is inside the picker and
     so does not reach the dismiss handler below. */
  const chip = e.target.closest("[data-react]");
  if (chip) {
    Live.react(Number(chip.dataset.react), chip.dataset.emoji);
    closeReactPicker();
    return;
  }

  const add = e.target.closest("[data-addreact]");
  if (add) { openReactPicker(add); return; }
});

/* The little row of faces that opens off a message. Built on demand and
   thrown away on the next click anywhere, rather than rendered into every
   message — a hundred and forty messages would mean eight hundred buttons
   nobody has asked for yet. */
function openReactPicker(anchor) {
  closeReactPicker();

  const room = Live.room();
  const list = (room && room.reactions) || [];
  const id = anchor.dataset.addreact;

  const pop = document.createElement("div");
  pop.className = "reactpicker";
  pop.id = "reactPicker";
  pop.innerHTML = list.map(function (emoji) {
    return `<button type="button" data-react="${escHtml(id)}"
        data-emoji="${escHtml(emoji)}">${escHtml(emoji)}</button>`;
  }).join("");

  anchor.parentNode.appendChild(pop);
}

function closeReactPicker() {
  const open = $("reactPicker");
  if (open && open.parentNode) open.parentNode.removeChild(open);
}

// Anywhere else closes it. Registered on document because the picker is
// inside a log that is rebuilt from scratch several times a minute.
document.addEventListener("click", function (e) {
  if (e.target.closest && e.target.closest("#reactPicker, [data-addreact]")) return;
  closeReactPicker();
});

/* ---- reading back, and what you missed ------------------ */

$("chatLog").addEventListener("scroll", function () {
  const atBottom = this.scrollHeight - this.scrollTop - this.clientHeight < 48;
  if (atBottom === chatUI.pinned) return;

  chatUI.pinned = atBottom;
  if (!atBottom) return;

  // Catching up is the same as having read it.
  const room = Live.room();
  if (room) {
    chatUI.seenId = (room.chat || []).reduce(function (top, m) {
      return m.id > top ? m.id : top;
    }, 0);
  }
  chatUI.unread = 0;
  renderChatMeta(room);
});

$("chatJump").addEventListener("click", function () {
  const log = $("chatLog");
  log.scrollTop = log.scrollHeight;   // the scroll handler does the rest
});

/* ---- the mobile sheet -----------------------------------

   On a phone the dock covers the board rather than sitting beside it, so it
   needs a way in and a way out. Both are inert on a desktop, where CSS keeps
   the dock docked and the launcher hidden. */
function openChatSheet(on) {
  chatUI.open = on;
  document.body.classList.toggle("chat-open", on);
  if (!on) return;

  const log = $("chatLog");
  log.scrollTop = log.scrollHeight;
  chatUI.pinned = true;
  chatUI.unread = 0;

  // Opening the sheet is reading it. Marked here as well as on the next
  // render, so nothing counts as missed in the gap between the two.
  const room = Live.room();
  if (room) {
    chatUI.seenId = (room.chat || []).reduce(function (top, m) {
      return m.id > top ? m.id : top;
    }, 0);
  }
  renderChatMeta(room);
}

$("chatFab").addEventListener("click", function () { openChatSheet(!chatUI.open); });

/* The rail sheet. Only a body class, because unlike the chat there is no
   scroll position or unread count to look after — the rail is rebuilt by
   render() every time anything changes, and it reads correctly whether the
   sheet was open or shut. Closing on a draft is deliberate: drafting from
   the queue is the reason the sheet exists, and leaving it over the board
   afterwards hides the thing you just changed. */
function openRailSheet(on) {
  document.body.classList.toggle("rail-open", on);
}
$("railFab").addEventListener("click", function () { openRailSheet(true); });
$("railDismiss").addEventListener("click", function () { openRailSheet(false); });
$("chatDismiss").addEventListener("click", function () { openChatSheet(false); });

/* ---- your name ------------------------------------------

   Stored on the way past, so the next room already knows it. Sent to the
   room as well when there is one, which is what moves it onto the chair and
   onto everything already said. */
$("displayName").addEventListener("change", function () {
  this.value = Live.setName(this.value);
});

/* Enter in the name box means "that's my name", not "submit the setup
   screen" — which, on a form-less div, would otherwise do nothing at all and
   read as the field being broken. */
$("displayName").addEventListener("keydown", function (e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  this.value = Live.setName(this.value);
  this.blur();
});

$("randomizeBtn").addEventListener("click", function () {
  slotSelect.value = Math.floor(Math.random() * league.teams);
});

$("startBtn").addEventListener("click", function () {
  readSetup();
  if (setupProblem()) { refreshSetup(); return; }   // belt and braces; the button is disabled too

  /* In a room the host asks and everyone starts together; the state that
     comes back is what actually begins the draft.

     Asked of the room rather than of the socket. `inRoom()` is "the socket is
     open right now", and a dropped socket is a normal second of a draft on a
     phone — so falling through on it meant falling through to the branch
     below, which starts a *solo* draft. That is not a degraded shared draft;
     it is a different draft, on the host's phone, while everybody else sits
     on "Waiting for the host…" until they give up. The button is disabled
     while reconnecting, so this is the belt to that pair of braces. */
  if (typeof Live !== "undefined" && Live.room()) {
    if (inRoom()) Live.start();
    else renderInvite();
    return;
  }

  state.mySlot      = Number(slotSelect.value);
  state.clockLength = Number($("pickClock").value);
  state.started     = true;
  state.startedAt   = Date.now();

  // Built here as well as on every setup change, because this is the point
  // the league stops moving and the ranks and tiers become the ones the
  // whole draft is judged against.
  buildBoard();

  // A seeded wobble, so no two mocks are identical but a resumed draft
  // reproduces the one you were in.
  state.seed = Math.floor(Math.random() * 1000000);
  applyJitter();

  enterDraftUI();
  render();
  runCPUs();
});

// resume / discard live inside a re-rendered banner, so they are delegated
document.addEventListener("click", function (e) {
  if (e.target.id === "resumeBtn") { const d = readSave(); if (d) resumeDraft(d); }
  if (e.target.id === "discardBtn") { clearSave(); showResumeBar(); }
});

/* The year buttons on the game logs. Delegated from the sheet body, which
   openSheet() rewrites wholesale, and it repaints only the logs view rather
   than reopening the sheet — reopening would throw away which tab you were
   on to change something inside that tab. */
$("sheetBody").addEventListener("click", function (e) {
  const btn = e.target.closest ? e.target.closest("[data-logyear]") : null;
  if (!btn || !sheetPlayer) return;
  sheetLogPick = btn.dataset.logyear;
  const s = statOf(sheetPlayer);
  $("v-logs").innerHTML = logsHtml(sheetPlayer, s, sheetLogYear(s));
});

/* A player photo that 404s removes itself, leaving the initials underneath.

   This was an inline onerror="this.remove()" on every avatar, which is a
   script a Content-Security-Policy has to be told to allow — and allowing
   inline handlers means allowing the ones an attacker writes too.

   Registered with capture: true because `error` does not bubble. It fires on
   the <img> and stops, so a listener on document only ever sees it on the
   way down. Delegated rather than bound per image because render() creates
   these by the hundred and throws them away again. */
document.addEventListener("error", function (e) {
  const el = e.target;
  if (el && el.tagName === "IMG" && el.hasAttribute("data-drop-on-error")) {
    el.remove();
  }
}, true);

$("sheetBackdrop").addEventListener("click", closeSheet);

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeSheet();
});

$("sheetTabs").addEventListener("click", function (e) {
  if (e.target.tagName !== "BUTTON") return;
  this.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
  e.target.classList.add("on");
  document.querySelectorAll(".sheet-view").forEach((v) => v.classList.remove("on"));
  $(e.target.dataset.view).classList.add("on");
});

// Neither header is rebuilt by render(), so these can hold direct listeners
// rather than going through the delegated handler below.
// The mark now leaves for the landing page rather than discarding: the draft
// stays in memory and in the save, and the route change is what goes back.
$("homeBtn").addEventListener("click", function () { go("home"); });

document.addEventListener("click", function (e) {
  const btn = e.target.closest ? e.target.closest("#soundBtn") : null;
  if (btn) toggleSound();
});

// Delegated, because the panel's toggle does not exist until the rooms are
// rendered, and the same goes for its Log in and Install.
document.addEventListener("click", function (e) {
  if (e.target.closest(".theme-toggle")) {
    setTheme(currentTheme() === "dark" ? "light" : "dark");
  }
});
$("scoreStrip").addEventListener("scroll", updateScoreEnds, { passive: true });
window.addEventListener("resize", updateScoreEnds);
$("scoreLeft").addEventListener("click", function () { nudgeScores(-1); });
$("scoreRight").addEventListener("click", function () { nudgeScores(1); });

$("roomsBtn").addEventListener("click", toggleRooms);

// A panel that opens on click should close the same way, from anywhere.
document.addEventListener("click", function (e) {
  if (!$("roomsPanel").hidden && !e.target.closest("#roomsPanel, #roomsBtn")) closeRooms();
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeRooms();
});

document.addEventListener("click", function (e) {
  if (!e.target.closest(".js-install") || !installPrompt) return;
  installPrompt.prompt();
  installPrompt.userChoice.finally(function () {
    installPrompt = null;
    showInstall(false);
  });
});

// Honest rather than absent: the buttons are part of where this is going, and
// saying so beats a dead click or a form that posts into the void.
document.addEventListener("click", function (e) {
  if (!e.target.closest(".js-login")) return;
  notYet("Accounts are not live yet",
         "There is nothing to log into so far. Your drafts save to this device, " +
         "so you can close the tab and pick up where you left off.");
});

$("signupBtn").addEventListener("click", function () {
  notYet("Sign-up is coming",
         "Juke does not have accounts yet. Everything here is free and needs no " +
         "sign-up, and your drafts already save to this device.");
});

/* An invite code arriving in the address bar without a page load.

   Joining a room used to happen once, at startup, which is right for a link
   opened from a message into a fresh tab and wrong for every other way the
   same link arrives. A tab already on the site only changes its hash — no
   load, no startup, no join — so tapping the invite a second time did
   nothing at all. That became reachable the moment leaving a room started
   clearing the code out of the address: the way back in is the link, and the
   link is exactly the case that did not work.

   Guarded on the code differing from the one we are already in, because
   applyRoute() runs on every hash change and rejoining the room you are
   sitting in would drop the socket mid-draft. */
window.addEventListener("hashchange", function () {
  const code = typeof Live === "undefined" ? null : Live.codeInUrl();
  const now = typeof Live === "undefined" ? null : Live.state().code;
  if (code && code !== now) joinRoom(code, false);

  /* applyRoute() itself is not called for a bare in-page anchor (#rooms,
     #proof, #scores — anything not starting with "#/"; an empty hash still
     runs it). Every real route in this app is "#/something"; applyRoute()
     ends in an unconditional window.scrollTo(0, 0), which is correct for a
     real route change (leaving the Draft Room, arriving at "#/") and wrong
     for everything else — it fights the browser's own native scroll-to-
     anchor, so the hash updates and the page snaps straight back to the top
     instead of landing on the section a click just asked for. This was
     already true of Hero.jsx's "Explore The Rooms" link before the
     homepage redesign added a full anchor nav that depends on it working —
     same bug, just newly load-bearing. The one caller that must still see
     a bare fragment (a fresh page load landing directly on #rooms from a
     bookmark or shared link) is the boot-time applyRoute() call below,
     which isn't behind this hashchange guard at all.

     syncHomeVisibility() still has to run, though. SiteNav.jsx's own
     comment claims these same-page anchors "still work when clicked from
     the Locker... following one of these un-mounts the fixed Locker
     overlay and lets the browser's native anchor scroll land on the
     homepage section underneath" — true of the React side (useHashActive
     only matches "#/drafts", so the Locker overlay does unmount), false of
     this file's own side: #/drafts leaves view-home/shellbar hidden
     (applyRoute()'s hideHome, above), and skipping applyRoute() entirely
     for the #proof hashchange that follows means nothing ever sets that
     back. The Locker overlay unmounts on cue and reveals a #root that is
     still sitting inside a hidden ancestor — the homepage renders
     correctly and nobody can see any of it. Confirmed live: following "How
     It Works" from the Lobby left document.body.innerText at four
     characters ("JUKE") with #root's full markup intact underneath.

     Un-hiding still isn't enough on its own to land on the named section,
     only to stop the page being blank: the browser's own native
     scroll-to-fragment runs as part of updating location.hash, which is
     earlier than this listener — so on the very hashchange that reveals
     #proof, the browser already tried and gave up scrolling to an element
     that was still display:none at that instant, and it does not retry
     once the element becomes visible a moment later. scrollIntoView() here
     redoes that native attempt by hand, now that the target can actually
     be scrolled to; scroll-behavior/scroll-padding-top (index.css) apply
     to it exactly as they do to the native version, so it still eases in
     under the fixed header rather than jumping straight to its top edge. */
  if (location.hash && location.hash.charAt(1) !== "/") {
    syncHomeVisibility();
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView();
    return;
  }
  applyRoute();
});

$("pauseBtn").addEventListener("click", togglePause);

/* Directly on the scroller rather than delegated from document, and that is
   safe here for once: render() replaces #boardGrid's innerHTML, never
   #boardScroll itself, so this element outlives every rebuild.

   Three events because there are three ways to move a scroller by hand, and
   `scroll` is not one that can be used — see the note on boardFollow. Passive,
   because none of them is being cancelled and a non-passive wheel listener on
   a scroll container costs a frame. */
["wheel", "touchstart", "pointerdown"].forEach(function (event) {
  $("boardScroll").addEventListener(event, freeBoardScroll, { passive: true });
});
// Arrow keys, Page Up and Home all scroll a focused container too.
$("boardScroll").addEventListener("keydown", freeBoardScroll);
$("undoBtn").addEventListener("click", undo);
$("autoBtn").addEventListener("click", autoDraftRest);
$("restartBtn").addEventListener("click", restart);
$("hideDrafted").addEventListener("change", renderPlayers);

// Density is a class on the table rather than a re-render: the rows do not
// change, only how much air they sit in.
$("roomyRows").addEventListener("change", function () {
  $("playerTable").classList.toggle("compact", !this.checked);
});

$("playerSearch").addEventListener("input", function () {
  state.search = this.value;
  renderPlayers();
});

/* Clicking a column sorts by it; clicking the same one again turns it round.

   Delegated from the head rather than bound per header, because
   renderPlayerHead() rewrites both rows on every render — including the one
   that happens as a result of this very click.

   A new column starts in the direction that puts the interesting end first:
   most yards, most touchdowns, best score. ADP, rank and bye are the
   exceptions, where low is the interesting end and always has been. */
const SORT_ASCENDING_FIRST = ["rk", "adp", "bye", "name"];

function sortPlayersBy(key) {
  if (!colByKey(key)) return;
  if (state.sort.key === key) {
    state.sort.dir = -state.sort.dir;
  } else {
    state.sort.key = key;
    state.sort.dir = SORT_ASCENDING_FIRST.indexOf(key) >= 0 ? 1 : -1;
  }
  renderPlayers();
}

$("playerHead").addEventListener("click", function (e) {
  const th = e.target.closest ? e.target.closest("[data-sort]") : null;
  if (th) sortPlayersBy(th.dataset.sort);
});

// The headers are reachable by keyboard, so they have to answer to it.
$("playerHead").addEventListener("keydown", function (e) {
  if (e.key !== "Enter" && e.key !== " ") return;
  const th = e.target.closest ? e.target.closest("[data-sort]") : null;
  if (!th) return;
  e.preventDefault();
  sortPlayersBy(th.dataset.sort);
});

// One listener on the whole page catches every Draft button,
// including buttons that don't exist yet. This is called
// event delegation and it saves re-attaching listeners on
// every redraw.
document.addEventListener("click", function (event) {
  if (event.target.id === "skipBtn") { skipSim(); return; }
  if (event.target.id === "sheetClose") { closeSheet(); return; }

  // Two buttons say "New mock draft": one in the action bar, one in the
  // finished-draft panel. Delegated, because the second is rebuilt on
  // every render and a directly attached listener would not survive it.
  if (event.target.dataset && event.target.dataset.action === "new-draft") {
    goHome();
    return;
  }

  // Queue controls, delegated because the rows they sit in are rebuilt on
  // every render and a directly attached listener would not survive it.
  const q = event.target.closest ? event.target.closest("[data-queue]") : null;
  if (q) { queueToggle(q.dataset.queue); render(); return; }

  const up = event.target.closest ? event.target.closest("[data-qup]") : null;
  if (up) { queueMove(up.dataset.qup, -1); render(); return; }

  const down = event.target.closest ? event.target.closest("[data-qdown]") : null;
  if (down) { queueMove(down.dataset.qdown, 1); render(); return; }

  const link = event.target.closest ? event.target.closest("[data-player]") : null;
  if (link) {
    const chosen = board.find((p) => p.name === link.dataset.player);
    if (chosen) openSheet(chosen);
    return;
  }
  const name = event.target.dataset ? event.target.dataset.draft : null;
  if (!name || !isMyTurn()) return;
  const player = board.find((p) => p.name === name && !p.drafted);
  if (player) {
    // Drafting from the queue is why the sheet opens, so it gets out of the
    // way once you have. Harmless on a wide screen, where the class does
    // nothing at all.
    openRailSheet(false);
    draftAndAdvance(player);
  }
});

/* Going to a tab, which used to be three lines living inside one static
   button's click handler — so the only thing in the app that could change tabs
   was the tab strip itself. Anything else wanting to send you somewhere had to
   either write "which tab is on" down a second time or, as the rail did, look
   like a link and do nothing at all. */
function goToTab(id) {
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.classList.toggle("on", b.dataset.tab === id);
  });
  showPanel(id);
}

document.querySelectorAll(".tabs button").forEach(function (button) {
  button.addEventListener("click", function () { goToTab(button.dataset.tab); });
});

/* The rail's way through to the full roster.

   It was a `<span class="rtm">My Team</span>`: blue, sitting at the end of the
   one row that says there are players it is not showing you, and wired to
   nothing. It read as a link on every screen the app has — it was only
   reported from the installed desktop app because that is where somebody sat
   and tried to click it.

   Delegated, because renderRail() rebuilds that row on every render — one per
   pick — so a listener attached to the element would be thrown away seconds
   after it was set. */
document.addEventListener("click", function (e) {
  const go = e.target.closest && e.target.closest("[data-goto-tab]");
  if (!go) return;
  goToTab(go.dataset.gotoTab);
  // On a phone the rail is a sheet lying over the board, so it has to get out
  // of the way of the panel it just opened.
  openRailSheet(false);
});

$("suggestFilter").addEventListener("click", function (e) {
  if (e.target.tagName !== "BUTTON") return;
  this.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
  e.target.classList.add("on");
  state.filterSuggest = e.target.dataset.pos;
  renderSuggestions();
});

$("playerFilter").addEventListener("click", function (e) {
  // closest(), not tagName: these buttons now hold a <span> with the
  // have/need count, and a click landing on that text is still a click on
  // the button as far as the person doing it is concerned.
  const button = e.target.closest ? e.target.closest("button") : null;
  if (!button || !this.contains(button)) return;
  this.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
  button.classList.add("on");
  state.filterPlayers = button.dataset.pos;
  renderPlayers();
});

/* The working panels move inside the split, so the rail can sit beside them
   rather than under them. Done here rather than in the markup because the
   setup screen is a panel too and has to stay outside it: setup is the page
   before a draft, not a column within one. */
["tab-suggest", "tab-players", "tab-team", "tab-picks", "tab-grades"]
  .forEach(function (id) { $("workMain").appendChild($(id)); });

/* ---- deferred data: players.js, stats.js, draft-engine.js -----------
   These three are 636KB combined — most of what this page weighs — and
   nothing in this file's own boot needs them synchronously any more:
   totalPicks(), adpSet() and pointsUnder() above all complete a full,
   empty-board boot without them. So they no longer ship as blocking
   <script> tags in index.html; this loads them off requestIdleCallback
   instead, which keeps them off the marketing homepage's first paint
   while still landing within a second or two of it — real board data
   for Ticker.jsx's facts and ScoringDemoCard.jsx's scoring demo, just
   not render-blocking. The Draft Room needs them synchronously long
   before a real user could reach it from a cold load, since reaching
   #/draft-room means clicking through the homepage first.

   Dynamically-injected classic <script> tags, not import() — these
   three files are not ES modules (players.js/stats.js are bare top-level
   const, draft-engine.js assigns window.DraftEngine itself for exactly
   this reason), and app.js's whole dependency on them being plain
   shared-scope globals would break under import()'s module namespace. */
const DEFERRED_FILES = ["draft-engine.js", "players.js", "stats.js"];

/* The stamp these three are addressed with, and it is READ rather than
   written down.

   It has to be one value for both callers below — the preload that warms
   these and the script that runs them — because a preload whose URL differs
   from the script's by a single character is not a warm cache, it is the same
   636KB fetched twice.

   And it has to be INDEX.HTML'S value, which is the part that was wrong. This
   file used to carry its own literal, and the nightly's `?v=` sed covers
   web/index.html, 404.html and the how-it-works page — not this one. So the
   pipeline rewrote players.js and stats.js every morning and left them at an
   address that never changed: new data behind a cached URL, which is exactly
   the "a rebuild nobody sees" failure CLAUDE.md describes, landing on the two
   generated files it is most about. The two stamps had already drifted a
   fortnight apart by the time anybody looked.

   ADDING app.js TO THAT SED IS NOT THE FIX, and it is worth saying why
   because it is the obvious move and it fails twice. It would match nothing —
   there is no literal `?v=<stamp>` left in this file for the pattern to find,
   so the run would be a silent no-op wearing a fix's clothes. And if it were
   made to match, it would rewrite the project's largest and most-edited source
   file every single night: `git log app.js` becomes a wall of stamp bumps, and
   every open branch touching app.js conflicts with the nightly daily. This
   file already records that pain for index.html and the docs page, where it is
   two small files and still costs a merge; app.js is the file most changes
   touch.

   So the second copy is removed instead of being kept in step. There is one
   stamp on the page, in index.html, and this reads it off this file's own
   <script> tag. It cannot drift, because there is nothing left to drift from.

   document.currentScript is only the <script> element during a classic
   script's own synchronous execution, which is what this is and where this
   line runs — read it later, from a handler, and it is null. Hence an IIFE at
   the point of declaration rather than a lookup inside deferredSrc().

   The fallback is the last stamp this file carried by hand. It is reached only
   if index.html stops addressing app.js with a `?v=` at all, which would mean
   the caching doctrine this whole file rests on had been abandoned — at which
   point a fixed stamp is no worse than the situation it is in. */
const DEFERRED_V = (function () {
  try {
    const self = document.currentScript && document.currentScript.src;
    if (self) {
      const v = new URL(self, location.href).searchParams.get("v");
      if (v) return v;
    }
  } catch (e) { /* fall through */ }
  return "202608231526";
})();
const deferredSrc = (name) => "/" + name + "?v=" + DEFERRED_V;

/* Downloading is not executing, and separating the two is the whole trick.

   The bytes are fetched immediately, as they always were — this costs the
   network and never the main thread, so it cannot disturb the cold-load
   reveal. What waits is the *parse*, which is what actually froze it: see
   scheduleDeferredData() below. By the time that runs, these are in the HTTP
   cache and the script tag executes without a round trip.

   Which is why this is a net improvement on a slow connection rather than a
   trade. Before, the download did not even start until requestIdleCallback's
   2000ms timeout fired; now it starts at boot, so the data is ready EARLIER
   than it used to be on exactly the connections where that matters, while
   the reveal gets a main thread to draw on. */
function preloadDeferredData() {
  if (dataReady()) return;
  DEFERRED_FILES.forEach(function (name) {
    const l = document.createElement("link");
    l.rel = "preload";
    l.as = "script";
    l.href = deferredSrc(name);
    document.head.appendChild(l);
  });
}

function loadDeferredData() {
  if (dataReady()) return;
  let remaining = DEFERRED_FILES.length;
  const done = function () {
    remaining--;
    if (remaining === 0) window.dispatchEvent(new Event("juke:data-loaded"));
  };
  DEFERRED_FILES.forEach(function (name) {
    const s = document.createElement("script");
    s.src = deferredSrc(name);
    s.onload = done;
    s.onerror = done;   // a missing file must not hang the retry forever
    document.head.appendChild(s);
  });
}

/* ...but not while the cold-load reveal is drawing, which is the whole of a
   second defect and the reason preloadDeferredData() exists above.

   requestIdleCallback with a 2000ms timeout fires at 2000ms on a page that
   never goes idle, and the reveal in #boot-sonar runs from its own first
   painted frame to that frame + 2500ms. So these three landed squarely inside
   it — and parsing 769KB of stats.js is not something a compositor can
   absorb. Worse, the parts of the reveal that read AS the reveal are the
   teeth and the eyes, and those are `fill` animations (see juke-mark.js's
   `form` variant): `fill` is not a compositable property, so every frame of
   them needs the main thread stats.js is holding.

   Measured on the built site under CPU throttling, counting long tasks
   overlapping the reveal window:

     6x slowdown, as shipped     1989ms of the 2500ms reveal blocked,
                                 worst single block 975ms
     6x slowdown, stats.js gone  882ms blocked, worst single block 306ms

   That 975ms block lands in the middle of the teeth sweep and across the
   whole eye flicker. It is the "not remotely as smooth as the design file"
   report, and the design file is of course smooth: nothing else is running
   underneath it there.

   WHY THE REVEAL AND NOT THE OVERLAY. Waiting for #boot-sonar to leave was
   the first version and it is wrong by about 900ms: the overlay outlives the
   reveal by a 600ms held frame plus a 260ms fade, and neither of those can be
   disturbed by a busy main thread — the mark is dead still through the first
   and the second is an opacity transition the compositor owns. Holding
   through them buys no smoothness and costs real time, and that time is not
   free: setupProblem() reports an empty board as "the half PPR board only
   carries 0 players", so every millisecond the data is late is a millisecond
   the Lobby can be showing a refusal that is not true. Three specs caught it
   immediately (appbar, and two in pickcode) by starting a draft the moment
   the overlay lifted and finding no board — which is exactly what a person
   pressing Start on that frame would find.

   So the gate is the composition's own end, read off the composition:
   startTime + endTime for each finite animation, maximised. That is asking
   the animation rather than restating 2500 here, which would be juke-mark.js's
   number written down in a third place — index.html's own --total comment
   already records what happens when those drift.

   Three ways out, because a gate with one is a gate that can hang:
   - no splash at all (a warm same-session load, where splash-boot.js removes
     the overlay before first paint) loads immediately, unchanged;
   - the overlay disappearing while we are still waiting also releases it;
   - and a ceiling, because rAF does not fire in a background tab and a wedged
     reveal must not be able to strand the board behind it. */
const DEFERRED_REVEAL_MAX_MS = 5000;

function scheduleDeferredData() {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(loadDeferredData, { timeout: 2000 });
  } else {
    setTimeout(loadDeferredData, 200);   // Safari has no requestIdleCallback
  }
}

/* When the cold-load composition finishes, in performance.now() terms, or
   null while that cannot yet be known.

   It is read off the element rather than derived from the animations now.
   splash-boot.js applies every finite layer in one pass and stamps
   data-splash-started-at at that moment, so the end is simply that plus the
   reveal's own length — no scan, no filtering, and no way to accidentally
   count #boot-sonar's own dismissal failsafe as part of the picture, which is
   a mistake this file has already made once and paid six seconds for.

   REVEAL_MS is the design package's 2700. It is written down here as well as
   in main.jsx and that is a real duplication, mitigated rather than removed:
   the two answer different questions (when may the parse resume, and when may
   the layer leave) and neither is the other's source. If the package ever
   re-times the reveal, both move. */
const REVEAL_MS = 2700;

function revealEndsAt(el) {
  const stamped = el.getAttribute("data-splash-started-at");
  if (stamped === null) return null;
  const n = Number(stamped);
  return isFinite(n) ? n + REVEAL_MS : null;
}

(function loadAfterTheReveal() {
  const splash = document.getElementById("boot-sonar");
  if (!splash) { scheduleDeferredData(); return; }

  let fired = false;
  const go = function () {
    if (fired) return;
    fired = true;
    clearTimeout(ceiling);
    /* Straight to it, NOT back through scheduleDeferredData().
       requestIdleCallback's 2000ms timeout is a ceiling rather than a delay,
       but on a page that never goes idle it is reached — and stacked on top
       of this gate it was adding the full two seconds to a wait that had
       already picked its moment. Measured: dataReady at 5449ms, against an
       overlay that lifts at 3580. The idle callback's job was to keep this
       off the first paint, and the gate now does that job better; asking for
       it twice only makes the board late. The warm-load path below still
       uses it, because there it is still the only deferral there is. */
    loadDeferredData();
  };
  const ceiling = setTimeout(go, DEFERRED_REVEAL_MAX_MS);

  const poll = function () {
    if (fired) return;
    if (!document.getElementById("boot-sonar")) { go(); return; }
    const ends = revealEndsAt(splash);
    if (ends != null) {
      // Capped against the same ceiling, so a reveal that somehow reports an
      // end time far in the future cannot outlast it either.
      const wait = Math.max(0, Math.min(ends - performance.now(), DEFERRED_REVEAL_MAX_MS));
      clearTimeout(ceiling);
      setTimeout(go, wait);
      return;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
})();

// refreshSetup() below runs the moment this file finishes parsing, almost
// certainly before the deferred data above has landed — it renders the
// correct "nothing to draft yet" empty state rather than throwing. This
// listener re-runs it once the real data arrives, which rebuilds the board
// and (via render() -> renderHeader()) redispatches "juke:header" — the
// same signal Ticker.jsx already listens for to refresh what it shows.
// Registered before refreshSetup() runs, not after, so a callback that
// somehow resolves synchronously can't fire before anything is listening.
window.addEventListener("juke:data-loaded", function onDeferredData() {
  window.removeEventListener("juke:data-loaded", onDeferredData);
  // Not applyRoute() — that ends in window.scrollTo(0, 0), which would
  // silently yank a reader on the marketing homepage back to the top the
  // moment the deferred data lands. refreshSetup() rebuilds the board and
  // re-renders without touching scroll position.
  refreshSetup();

  /* refreshSetup() bails outright once state.started is true (its own
     first line), which a room's own broadcast can set before this event
     ever fires — so on a cold load of an already-started room, the branch
     above is a no-op and the board this file just spent a whole boot
     sequence keeping empty-but-honest stays empty. onRoomChange() is the
     one function that both rebuilds it correctly (adoptRoom()'s league
     compare/rebuild) and re-applies the room's own picks on top of it, and
     live.js kept the room's last broadcast in live.room this whole time —
     onRoomChange() re-reads it itself rather than this listener trying to
     hand it back in. Guarded on Live existing at all: this listener fires
     on every page load, not only the ones that also loaded live.js, and a
     solo boot has no room to re-sync. */
  if (typeof Live !== "undefined" && Live.room()) onRoomChange();
});

// Everything above this line is a definition. This reads the setup screen,
// builds the board from the matching ADP set, and draws the page.
refreshSetup();

// The route has the last word on what is visible, so it runs after the
// setup screen has been built rather than before.
applyRoute();

/* The one deliberate seam between this file and anything built with a
   bundler (the React homepage lives at web/, and loads as a module script,
   so it does not share this file's top-level scope the way players.js and
   stats.js do). Nothing here is a second implementation of a rule — every
   entry is the same function or the same live reference the rest of this
   file already uses, handed out rather than duplicated. board() and
   rooms() return live references on purpose: call them fresh on each use
   rather than caching across a route change, the same way this file does. */
window.JukeEngine = {
  /* The next NFL kickoff, for the shell header's countdown pill. Answers
     null whenever there is no honest answer — see nextKickoff() — and the
     pill renders nothing on null rather than a dash or a zero. Reading it
     twice does not fetch twice: it is served from the same one-minute
     sessionStorage entry the score strip fills. */
  nextKickoff,
  // fetchScores() is the half that may go to the network. React calls it
  // once on mount so nextKickoff() has something to read; the strip's own
  // loadScores() is the DOM half and is not usable from here.
  primeScores: function () { return fetchScores().catch(function () { return null; }); },
  // Whether draft-engine.js/players.js/stats.js have landed — see the
  // deferred-data boot above. React reads this rather than reaching for
  // DraftEngine/PLAYERS/STAT_KEYS directly, the same way it reads board()
  // and league() instead of the bare module-scope bindings: one bridge,
  // not a second copy of what "ready" means creeping into web/src.
  dataReady,
  board:        () => board,
  league:       () => league,
  /* Retired rooms are filtered here rather than at each caller: the
     lobby, the homepage grid and the footer column all read this one
     function, so a room leaves the site in one place. ROOMS itself keeps
     the entry -- see the note on it. */
  rooms:        () => ROOMS.filter((r) => !r.retired),
  overallScore: overallScore,
  shotPicks:    shotPicks,
  fetchScores:  fetchScores,
  readSave:     readSave,
  settingsText: settingsText,
  notYet:       notYet,
  shortName:    shortName,
  statOf:       statOf,
  pointsUnder:  pointsUnder,
  rulesForFormat: rulesForFormat,
  statKeys:     () => (typeof STAT_KEYS === "undefined" ? null : STAT_KEYS),
  forcedLate:   () => FORCED_LATE,
  playersMeta:  () => (typeof PLAYERS_META === "undefined" ? null : PLAYERS_META),
  // Added for the React settings screen (the lobby and DraftSettingsModal).
  // setLeague patches the one real league object rather than a second copy of
  // it — the same object readSetup() has always written to.
  teamCounts:   () => TEAM_COUNTS,
  scoringNames: () => SCORING_NAMES,
  setLeague: function (patch) {
    Object.assign(league, patch);
    /* A scoring preset owns exactly one rule and, since superflex joined the
       list, one roster slot — applied at the moment it is chosen, which is
       the same side effect readSetup() has always had for `rec`, kept in one
       place.

       The lineup patch has to move `rounds` with it: setupProblem() refuses a
       draft whose roster size and round count disagree, so a preset that adds
       a starting slot without adding a round would leave the Start button
       refusing and nothing on screen saying which control caused it. Derived
       here rather than left to the caller, because the caller is a settings
       screen that did not choose to change the roster. */
    let rosterMoved = ROSTER_KEYS.some(function (k) { return patch[k] !== undefined; });
    if (patch.scoring) {
      league.rules.rec = REC_BY_FORMAT[patch.scoring] === undefined ? 0.5 : REC_BY_FORMAT[patch.scoring];
      const preset = SCORING_PRESET[patch.scoring];
      // A preset that moves the lineup moves the roster, even though nothing
      // in `patch` says so — superflex is set here, not by the caller.
      if (preset && preset.lineup) { Object.assign(league, preset.lineup); rosterMoved = true; }
    }

    /* And from every other direction too, which is what the paragraph above
       had only ever done for a scoring preset.

       DraftSettingsModal.jsx's Roster steppers write `bench`, `flex`,
       `superflex` and `starters` straight through here, and nothing moved
       `rounds` with them — so stepping the bench from 5 to 4 produced
       "13 roster spots, but the draft runs 14 rounds" on the spot, with no
       rounds control anywhere on the screen to answer it with. The whole
       Roster section was a dead control: every press refused the draft and
       the only way back was to undo it. Confirmed on the deployed site
       before it was fixed here, and both this file and that component
       carried comments crediting the derivation to a `setLineup()` that has
       never existed.

       It is the same rule the preset already followed, applied to the keys
       the roster is actually made of. `rounds` is never a second number kept
       equal to the roster by hand — it IS the roster's size. */
    if (rosterMoved) league.rounds = rosterSize();

    // A smaller league can leave the chosen seat outside it — see clampSeat().
    clampSeat();

    // readSetup() re-reads all of these off the legacy <select> elements every
    // time refreshSetup() runs — goHome() among other places — and until this
    // line it always won: the legacy controls are hidden and nothing else in
    // this file writes to them any more, so they sat frozen at whatever
    // fillSetupControls() drew at boot, and the next refreshSetup() silently
    // reverted whatever this function had just set. Mirroring the values here
    // is what makes `league` the one real object in both directions.
    //
    // It was teams and scoring only, which was the whole of what React could
    // reach at the time. The roster steppers reach the other seven, and a
    // bench trimmed in the settings screen was reverted by the next trip home
    // — silently, since nothing on that screen reads the legacy controls.
    mirrorToLegacy();

    /* Re-seed the finished/unfinished edge before drawing, for the same
       reason resumeDraft() and openHistoryDraft() already do it — and this
       one was a live bug rather than a precaution.

       draftOver() is `state.picks.length >= teams * rounds`, so editing the
       league moves the finish line under a draft that is already over.
       Finish a mock, press "Back to the locker" (which leaves state.started
       true, per startDraft()'s own note), open Draft settings and step the
       team count from 10 to 12: draftOver() goes false on that render, and
       stepping it back to 10 makes it true again — a rising edge, which
       checkDraftFinished() reads as "the draft just ended" and records a
       SECOND history entry for the draft that finished minutes ago.

       Reproduced in the browser: two identical entries from two calls to
       this function and no drafting in between. The duplicate is worse than
       a duplicate, because recordHistory() stamps `teams: league.teams` —
       so the copy claims a team count that draft never ran at, and the
       Locker then shows a 12-team mock nobody drafted.

       Found while building the scenario launcher, whose refusal path calls
       this twice by design (apply, then put it back). It was never a
       scenario bug: the Draft Settings screen has been able to do it since
       that screen could change a team count. */
    noteDraftPhase();

    /* And draw the result. setClockLength() has always done this and this one
       never did, so the settings modal's own redraw() re-rendered the modal
       while everything behind it kept the old league: changing the team count
       left the lobby board drawing ten columns against an engine that said
       twelve. A setter that changes what is on screen has to say so - the
       modal's local bump cannot reach the rest of the page, and nothing else
       fires "juke:header" on a screen where nobody is picking. */
    render();
  },
  setupProblem: setupProblem,
  /* ---- Everything the Draft Settings screen needs that was not on the
     bridge yet. Every one is a read of, or a write to, the one real
     `league`/`state` — never a second idea of what a league is, which is
     the failure "nothing about the league shape may be written down twice"
     exists to prevent and which the superflex grading bug is what looks
     like when it happens. ---- */

  // The three draft-order formats and the two that are real. `available`
  // is what the settings screen disables on, so the screen never has to
  // carry its own opinion about which of these the engine can actually
  // run — see DRAFT_TYPES for why auction is listed rather than hidden.
  draftTypes: () => DRAFT_TYPES,
  playerPools: () => PLAYER_POOLS,
  // What a preset does beyond its rec value, plus the caveat it carries.
  scoringPreset: (key) => SCORING_PRESET[key] || null,
  // How many players the current league/pool combination actually has to
  // draft from, and how many of them this many teams are allowed to hold —
  // the two numbers setupProblem() validates against, so a screen can show
  // the constraint rather than only the refusal. They are different numbers
  // and the second is the binding one; see absorbableSize().
  poolSize: poolSize,
  absorbableSize: absorbableSize,
  // Draft order, as the settings screen's own list: seat, who sits there,
  // and which overall pick they hold first. cpuName() rather than
  // teamLabel() for the reason the bridge already records beside it —
  // teamLabel() answers "Your Team" against the *committed* state.mySlot,
  // which is the wrong source while somebody is still choosing a seat.
  draftOrder: function () {
    const out = [];
    for (let s = 0; s < league.teams; s++) {
      out.push({
        slot: s,
        name: s === state.mySlot ? (teamLabel(s) || cpuName(s)) : cpuName(s),
        you: s === state.mySlot,
        firstPick: typeof DraftEngine === "undefined" ? null : DraftEngine.overallOf(1, s, league)
      });
    }
    return out;
  },
  /* Randomising the order means moving ONE seat — mine — because every
     other chair is a CPU with no identity to preserve. A shuffle of the
     whole array would be a lie dressed as a feature: the nine other seats
     are interchangeable by construction, so permuting them changes
     nothing anybody can observe.

     In a room it is a real reorder and belongs to the host, which is why
     this refuses there and the Seats tab (swapSeats) is the way instead. */
  randomizeOrder: function () {
    if (hasRoom()) return false;
    state.mySlot = Math.floor(Math.random() * league.teams);
    render();
    return true;
  },
  setMySlot: function (slot) {
    const n = Number(slot);
    if (!isFinite(n) || n < 0 || n >= league.teams) return false;
    state.mySlot = n;
    render();
    return true;
  },
  resumeDraft:  resumeDraft,
  clearSave:    clearSave,
  // Added for the Draft Locker (web/src/components/DraftLocker.jsx). Summary
  // objects, not raw history entries — a card needs a label and a date, not
  // a league object and a picks array to derive one from itself.
  historyList:  () => readHistory().map(historySummary),
  // The tendencies strip's data — see historyStats()'s own comment for what
  // each field means and why a stat that can't be computed cleanly is just
  // absent rather than zeroed.
  historyStats: historyStats,
  /* "off" | "ok" | "error" — whether the locker above is only in this
     browser, safely in an account, or signed in and failing to reach one.
     See noteSyncResult()'s own comment: every layer under this answers a
     failure with a falsy value rather than an error, which is right for a
     draft and left the one thing a reader can act on invisible. The Locker
     re-reads this on juke:header like everything else. */
  syncStatus: syncStatus,
  // The launcher's presets — see startFromHistoryLeague()'s own comment.
  startFromHistoryLeague: startFromHistoryLeague,
  /* The Mock Drafts lobby's Practice-a-scenario cards. One call turns a
     card into a real draft under that card's settings — see
     startScenario()'s own comment, including why the handoff's "one-off
     override" requirement is answered the way it is. Returns
     { ok, problem }; the card shows the sentence. */
  startScenario: startScenario,
  // The Locker's completed drafts had a way to open one and no way to
  // remove one — this is the plain filter-and-rewrite clearSave() already
  // does for the single in-progress save, extended to one entry among many.
  deleteHistoryDraft: (id) => {
    writeHistory(readHistory().filter((e) => e.id !== id));
    pushHistoryDeleted(id);
  },
  // The frozen report recordHistory() saved when this draft finished, or
  // null for an entry recorded before freezeReport() existed and for an id
  // that no longer exists — either way, a plain localStorage read with no
  // side effect on the live board, league or state.picks, unlike
  // openHistoryDraft() below. DraftLocker.jsx tries this first and only
  // falls back to openHistoryDraft()'s live recompute when it comes back
  // null. Also hands back completedAt, so a reopened report's share card
  // can date itself the day the draft actually finished rather than today.
  historyReport: (id) => {
    const entry = readHistory().find((h) => h.id === id);
    if (!entry || !entry.report) return null;
    return { report: entry.report, completedAt: entry.completedAt };
  },
  openHistoryDraft: openHistoryDraft,
  // The counterpart — see closeHistoryDraft()'s own comment for why this is
  // not just goHome() again.
  closeHistoryDraft: closeHistoryDraft,
  inProgressSummary: inProgressSummary,
  resumeSavedDraft:  resumeSavedDraft,
  // Added for the Draft Insights Dashboard (DraftInsightsDashboard.jsx).
  // The exact grade the legacy Analysis tab paints — same weights, same
  // scaleAcross(), same clamped letter scale — handed out whole so the
  // React view can never disagree with the standings about what anyone
  // scored. Indexed by slot, like analyseDraft() has always returned it.
  draftAnalysis: () => analyseDraft(),
  // Added for the Mock Detail view (DraftInsightsDashboard.jsx). Both take
  // the same shapes draftAnalysis() already hands out — a lineup, or the
  // whole per-slot array — rather than a second, React-side reimplementation
  // of either.
  posStrengthOf: posStrengthOf,
  winPctForRoom: (all) => projectedWinPctForRoom(all),
  // Everything the Start button does, minus the DOM read readSetup() used to
  // do — React already wrote the league directly via setLeague(). mySlot is
  // 0-indexed, matching slotSelect's own values (label is 1st, value is 0).
  startDraft: function (opts) {
    if (typeof Live !== "undefined" && Live.room()) {
      if (inRoom()) { Live.start(); return true; }
      renderInvite();
      return false;
    }
    if (setupProblem()) return false;
    /* Clear the last draft before building the next one. buildBoard() looks
       like it already does this — it maps a fresh copy of every player with
       `drafted = false` — but the board is not where a draft is recorded.
       state.picks is, and nothing had ever emptied it: this function sets a
       seat, a clock and a seed and starts drafting on top of whatever was
       already there.

       Reported as "Start mock draft takes me into an old insights report".
       Finish a draft, press "Back to the locker" (a plain <a href="#/drafts">
       — it changes the route and touches no state), change a setting, press
       Start: state.picks still holds the finished draft's 140 entries, so
       draftOver() is true on the first render and DraftRoom.jsx's insights
       effect fires on the edge exactly as designed. Nothing looked broken
       anywhere in between, because nothing was — the new draft was over
       before it was drawn.

       "Run another mock" on that same report has always worked, which is what
       made it look intermittent: that one goes through restart() -> goHome(),
       which clears all of this. The clear belongs here rather than on the way
       out, because there is one way in and several ways out — the same reason
       the retired-#/draft redirect lives at the router and not at its callers.

       CLAUDE.md has recorded the missing reset since the seat-par work ("a
       loop over seeds is a lie"), where it was diagnosed as a console-harness
       hazard. It was the same defect reaching a user by a different route. */
    state.picks    = [];
    state.lastPick = null;
    // Not inherited either: a draft abandoned while paused would otherwise
    // start its replacement paused, with a clock that never counts.
    state.paused   = false;
    // Nor is the scenario tag. Every other caller passes no `scenario` at
    // all, so pressing Start plainly after a Practice-a-scenario draft
    // clears it — which is the point: an id left behind would record the
    // next draft in history as one a card started, and the signed-in
    // scenario set is built off exactly that field.
    state.scenario = opts.scenario || null;
    state.mySlot      = opts.mySlot;
    state.clockLength = opts.clockLength;
    state.started     = true;
    state.startedAt   = Date.now();
    buildBoard();
    state.seed = Math.floor(Math.random() * 1000000);
    applyJitter();
    enterDraftUI();
    render();
    runCPUs();
    return true;
  },
  // Added for the React header (web/src/components/AppHeader.jsx), which
  // replaces .appbar the same way the React lobby replaced .setup — hidden
  // rather than deleted, for the same unguarded-listener reason. headerInfo()
  // is the exact branching renderHeader() itself now runs (see the comment
  // above that function); nothing here recomputes it a second way. The
  // "juke:header" event fires from renderHeader() itself, on every render,
  // tick and pause toggle — the same cadence the legacy DOM writes already
  // ran on — so the header can re-read rather than poll.
  headerInfo: headerInfo,
  // Added for the React draft room page (web/src/components/DraftRoom.jsx).
  // All four are reads of state that already exists, not a second copy of
  // it: picks() and mySlot() are the same state.picks/state.mySlot the
  // legacy board and rail already read directly, and teamLabel()/
  // seatedLineup() are the exact functions that already decide a seat's
  // name and a roster's starter/bench split — seatedLineup() is where the
  // FLEX gets filled correctly (see the bestLineup() note in CLAUDE.md
  // about sorting by posRank instead of aboveReplacement), so the roster
  // dock reads it rather than re-deciding which bench player counts as
  // which slot. onTheClock() and pickCode() are not re-bridged here because
  // they are already pure/global on window.DraftEngine — call
  // DraftEngine.onTheClock(league(), picks().length) and
  // DraftEngine.pickCode(overall, league().teams) directly.
  picks:        () => state.picks,
  mySlot:       () => state.mySlot,
  teamLabel:    teamLabel,
  // teamLabel() above answers "Your Team" by comparing against the
  // *committed* state.mySlot, which is exactly wrong for the lobby's
  // claimable seat board: mySlot there is a live, not-yet-started
  // selection (DraftRoom.jsx's lobbySlot), so asking teamLabel() for any
  // *other* seat still returns "Your Team" for whichever slot used to be
  // mine. cpuName() has no such comparison built in — it just names a
  // slot — which is what a caller that already knows "mine" from its own
  // live state (DraftBoardGrid's seat-claim header) actually needs.
  cpuName:      cpuName,
  seatedLineup: seatedLineup,
  // Added for the React queue sidebar (PlayerQueueSidebar.jsx). photoUrl()
  // and initials() are the exact functions avatar() already calls, so a
  // real headshot (or its initials fallback) is never drawn a second way.
  // FLEX is a roster slot, not a player.pos, and SLOT_ELIGIBLE.FLEX is the
  // one place that says which positions fill it — bridged rather than
  // hand-copied so a future SFLEX/roster change can't drift the two apart.
  photoUrl:      photoUrl,
  initials:      initials,
  flexPositions: () => SLOT_ELIGIBLE.FLEX,
  // Added for the React player card's four tabs (PlayerProfileDrawer.jsx),
  // wiring it to the same data the legacy sheet's Overview/Game Logs/Depth
  // Chart views already read — see the comment above these four functions.
  // Latest News goes through window.Live.news() directly (already global,
  // same as window.DraftEngine) rather than a bridge entry of its own, but
  // sourceId()/safeNewsUrl() are: the first is how it finds the right id to
  // ask for, the second is the one thing standing between a hostile feed
  // and a javascript: link in the page, and neither may be re-typed in React.
  projectionSummary: projectionSummary,
  gameLogFor:        gameLogFor,
  depthChartFor:     depthChartFor,
  // TEAM_RANKS/TEAM_RANKS_META are stats.js top-level consts, same cross-
  // script-tag visibility PLAYER_STATS already relies on (see statOf()) —
  // guarded the same way, since a page that hasn't finished loading the
  // deferred data has neither yet. Real per-team offensive ranks (build_
  // players.py, from nflverse's stats_team file), never a second lookup.
  teamRanksFor: function (team) {
    return typeof TEAM_RANKS !== "undefined" && team ? (TEAM_RANKS[team] || null) : null;
  },
  teamRanksMeta: function () {
    return typeof TEAM_RANKS_META !== "undefined" ? TEAM_RANKS_META : null;
  },
  // Returns null when nflverse never wrote a `u` block — a defence, an
  // unjoined player, or a run where nflverse was down. The tab is hidden on
  // null rather than drawn empty, the same way the news tab is.
  usageFor:          usageFor,
  sourceId:          sourceId,
  newsItemView:      newsItemView,
  /* Added for the player card's "Our Read" tab — the model explaining
     itself, which is the thing this app has that a projection feed does
     not. Every one of these is the same function the legacy sheet paints
     from, never a second reading of the same stats.

     jukeReadout() is the one addition: the legacy sheet builds this
     explanation as HTML in three places (jukeNote(), the meters, the
     unrated note), and React cannot use any of it. Rather than let a
     second explanation of the Juke score grow up in JSX — the exact
     "one number, three names" failure CLAUDE.md already records — the
     decisions are made here, once, and handed over as data.

     The zero handling is the load-bearing part. A clamped 0 is the
     majority state of the board by arithmetic, not a fault (measured
     against three real completed seasons: the same share scored zero
     there as in the projection), so it must never appear as a bare
     number. gap carries replacementGap() — the un-clamped figure that
     is the only thing able to tell a receiver one point below
     replacement from one sixty below — and floorNote names the floor. */
  jukeReadout: function (player) {
    const score = overallScore(player);
    const sig = draftSignals(player);
    const gap = replacementGap(player);
    const unranked = player.projPts !== null && score === null;
    return {
      /* Rounded here, not at the render.

         overallScore() is a share of the best figure on the board, so it
         comes out with a full float's worth of decimals - and this readout is
         the display boundary. Every other number in this object already goes
         through Math.round; this one did not, and the sheet printed a Juke
         score of 65.39900249376561 where the same value renders as 65 in the
         player table (which formats with Math.round of its own) and 65 in the
         legacy strip. One number with two presentations, and the raw one was
         only on the screen somebody opens *because* they want the number
         explained.

         The rounding stops here and does not reach overallScore() itself:
         modelMultipliers() divides by it, so rounding the source would move
         the suggestions rather than tidy a label. */
      score: score === null ? null : Math.round(score),
      label: score === null ? null : label(score),
      // Un-clamped points above/below a replacement starter. Two zeros
      // are not equal and this is what says so.
      gap: gap === null ? null : Math.round(gap),
      replacementRank: posLabel(player.pos) + replacementRank(player.pos),
      reason: overallReason(player),
      unranked: unranked,
      // Why a position is refused, rather than a silent dash.
      unrankedNote: unranked
        ? 'Measured against three seasons of our own archived forecasts, the projection ranks ' +
          (player.pos === 'DST' ? 'defenses' : 'kickers') +
          ' no better than chance — one of those seasons came out backwards. The number is ' +
          'withheld rather than guessed at; the projected points are still real.'
        : null,
      // Below real ADP -- see extend_deep_bench() in scripts/build_players.py.
      // Unlike unranked, this doesn't withhold the score: there's no
      // three-season finding that the ranking is wrong, only the fact that
      // no real draft has ever priced this player. A note, not a dash.
      deep: !!player.deep,
      deepNote: player.deep
        ? 'No real draft has ever taken this player — ranked by Sleeper\'s own depth order ' +
          'instead of a live market, and the projection above may be thin or missing entirely.'
        : null,
      upside: sig ? Math.round(sig.upside) : null,
      upsideLabel: sig ? label(sig.upside) : null,
      upsideWhy: sig ? sig.reasons.upside : [],
      bust: sig ? Math.round(sig.bust) : null,
      bustLabel: sig ? label(sig.bust) : null,
      bustWhy: sig ? sig.reasons.bust : [],
      priorScore: priorScore(player) === null ? null : Math.round(priorScore(player)),
      priorSeason: PRIOR_SEASON,
      priorGames: player.priorGames === undefined ? null : player.priorGames,
      boardSize: board.length,
      // What the app itself starts, for the "most of the board scores
      // nothing and that is arithmetic" explanation.
      startersInPlay: league.teams * (starterCount() + flexCount()),
      teams: league.teams
    };
  },
  projectionRecord: projectionRecord,
  marketGap:        marketGap,
  // Added for the queue sidebar's "Juke Value Assistant" card
  // (PlayerQueueSidebar.jsx). All three are the exact real functions
  // already driving the legacy Suggestions tab and the tier chips on the
  // board — suggestions('ALL') ignores state.filterSuggest on purpose
  // (see the autoPickForMe() note in CLAUDE.md about a filter being a lens
  // and never a decision: the card is recommending across every position,
  // not whatever the queue's own pill happens to be set to right now).
  // replacementGap() is the un-clamped points-above-replacement figure
  // overallScore() divides down to a 0-100 share internally — already
  // named "vor" in its own source. tierRemaining() is what tierChip()
  // already prints on the legacy board ("2 left in tier 1"), not a new
  // scarcity metric invented for this card.
  suggestions:     suggestions,
  replacementGap:  replacementGap,
  vorpUnder:       vorpTableUnder,
  thirdRoundScenarios: thirdRoundScenarios,
  tierRemaining:   tierRemaining,
  // Added for the Draft Room Cockpit's Decide screen — see each
  // function's own comment for why these are closed-form measurements
  // rather than a simulation or a raw headcount.
  survivalProbability:   survivalProbability,
  positionDepthRemaining: positionDepthRemaining,

  /* The scoring editor, as data rather than as markup.

     renderScoringFields() draws thirty-eight fields straight into
     #scoringFields, which is inside the legacy setup screen and therefore
     display:none - so the one thing here a competitor does not have has been
     unreachable by mouse since the React lobby replaced that screen. This
     hands React what it needs to draw the same editor: the groups, the
     labels, which rules are per-yard, and which ones Sleeper does not
     forecast so the board's ranking cannot move when you change them.

     It is the metadata that crosses, never the arithmetic. fantasyPoints()
     and DEFAULT_RULES stay the only place a rule means anything - a second
     scoring table in web/src is the exact failure CLAUDE.md's "nothing about
     the league shape may be written down twice" exists to prevent. */
  scoringEditor: function () {
    return RULE_GROUPS.map(function (group) {
      return {
        title: group[0],
        rules: group[1].map(function (rule) {
          return {
            key: rule,
            label: RULE_LABELS[rule] || rule,
            value: league.rules[rule] || 0,
            perYard: PER_YARD_RULES.indexOf(rule) >= 0,
            divisor: PER_YARD_RULES.indexOf(rule) >= 0
              ? divisorFromPoints(league.rules[rule]) : null,
            // A rule Sleeper does not forecast still scores every past
            // season correctly; it just cannot move the projection the board
            // is ranked on. The editor says so on the rule itself.
            historyOnly: !movesProjection(rule)
          };
        })
      };
    });
  },

  /* One rule, then rebuild. Per-yard rules are entered as "1 point every N
     yards" because that is how a league writes them down, and converted here
     rather than in the component - pointsFromDivisor() is the existing
     conversion and there is no reason for a second one. */
  setScoringRule: function (key, value, asDivisor) {
    const next = asDivisor ? pointsFromDivisor(value) : Number(value);
    if (!isFinite(next)) return false;
    league.rules[key] = next;
    buildBoard();
    render();
    return true;
  },

  resetScoringRules: function () {
    league.rules = Object.assign({}, DEFAULT_RULES);
    buildBoard();
    render();
    return true;
  },

  /* The starting lineup, as the league actually holds it. Every consumer
     reads this rather than keeping its own idea of what a roster is. */
  /* What each team holds, for the board header.

     Which positions get counted is COUNTED_POSITIONS' decision and is argued
     where that constant is declared: everything but the kicker, who is the one
     position still taken late enough that his column would be twelve rounds of
     "0" and then a "1".

     An empty count is returned as 0 rather than omitted: a gap where a chip
     should be is the fact somebody is reading this strip for. */
  /* The position filter doubles as the roster-need display: the control you
     already reach for to narrow the list is also the one that tells you what
     you are still missing, which saves a trip to My Team on every pick.

     The whole decision is made here rather than in the component, because it
     is three rules and one of them has already been got wrong. A fraction is
     a promise about its denominator: `have/need` while a starting slot is
     still owed, a bare count once it is met, and a fraction again for "All",
     where rosterSize() is a real ceiling you can actually run out of. It
     printed have/starters in every state once, so one tight end painted a
     green "1/1" - a success colour on a number that reads as a cap - and it
     was reported as the app refusing a second tight end. It had refused
     nothing.

     `full` is atPositionCap(), which asks needMultiplier() rather than
     answering again: the cap is maxAt() for a skill position, the starting
     requirement for a K or DST, and starters.QB plus the superflex for a
     quarterback. Writing that down a second time is how the superflex bug
     happened. */
  filterCounts: function () {
    if (!state.started) return null;
    const filled = rosterOf(state.mySlot).length;
    const out = { ALL: null };

    const build = function (have, need, full) {
      const short = have < need;
      return {
        have: have, need: need, short: short, full: full,
        text: short ? have + "/" + need : String(have)
      };
    };

    out.ALL = build(filled, rosterSize(), filled >= rosterSize());
    out.ALL.text = out.ALL.have + "/" + out.ALL.need;   // a real ceiling, always shown
    POSITIONS.forEach(function (pos) {
      out[pos] = build(countAt(state.mySlot, pos), league.starters[pos] || 0, atPositionCap(pos));
    });
    return out;
  },

  rosterStrip: function (slot) {
    return COUNTED_POSITIONS.map(function (pos) {
      return { pos: pos, count: countAt(slot, pos) };
    });
  },

  lineup: function () {
    return {
      starters: Object.assign({}, league.starters),
      flex: league.flex,
      superflex: league.superflex,
      bench: league.bench,
      rounds: league.rounds
    };
  },
  // Whether to take him *now*, with this roster, at this pick — the one
  // question the sheet could not answer, because every other number on it
  // reads the same at pick 1 and pick 140. Computed engine-side so the cap,
  // the lineup and the snake stay written down once. Null before a draft
  // starts, which the tab renders as its own state rather than as zeros.
  draftFit:        draftFit,
  nextPicksFor:    nextPicksFor,
  // The Draft button's real submission path. Wraps draftAndAdvance() rather
  // than reimplementing it — that one function already knows the solo vs.
  // room difference (mutate locally and kick off runCPUs(), or send
  // Live.pick() and wait for the room to broadcast), so this stays the only
  // place a pick is ever submitted, same as the legacy Draft buttons.
  //
  // draftAndAdvance()/makePick() do not check state.mySlot on their own:
  // makePick() passes onTheClock().slot as the "seat" to DraftEngine's
  // rejectPick(), which trivially matches itself, so NOT_YOUR_TURN can
  // never fire from that call site. The legacy UI never notices because its
  // Draft buttons are only ever rendered while isMyTurn() is true. A React
  // button has no equivalent structural guarantee, so the turn check is
  // repeated here rather than trusted to the caller — the same reasoning as
  // "the engine is where legality lives, not each caller" elsewhere in this
  // file. Returns null on success, or a DraftEngine.REJECT.* reason string.
  draftPlayer: function (player) {
    if (!isMyTurn()) return "not-your-turn";
    draftAndAdvance(player);
    return null;
  },
  // The Autopick toggle's real path — and room vs. solo are asymmetric on
  // purpose, the same way autoDraftRest() already treats them differently.
  // A room has a real, persistent "keep drafting for me" flag already
  // (state.autoMe), driven by driveMyAutopilot() — which the room's own
  // broadcast handler already re-invokes after every update (see the call
  // beside adoptRoom() a few hundred lines up), so toggling the flag once
  // here is enough; nothing further has to be re-triggered from React.
  // Solo has no equivalent flag to toggle — "Auto-draft the rest" there is
  // a one-shot loop that finishes the whole draft immediately, not a
  // resumable per-turn toggle, so it is not what a persistent "Autopick:
  // ON" switch should mean. The page drives its own turn-by-turn loop for
  // that case instead, off autoPickForMe() — bridged here as a pure read,
  // the exact function (queueTop() -> cpuChoice() -> bestLeft()) that
  // autoDraftRest()'s own solo loop already uses for my seat, so a second
  // "what would I draft" rule never gets invented in React.
  inRoom: inRoom,
  autoMe:  () => state.autoMe,
  toggleRoomAutopilot: function () {
    if (!inRoom()) return state.autoMe;
    state.autoMe = !state.autoMe;
    render();
    driveMyAutopilot();
    return state.autoMe;
  },
  autoPickForMe: autoPickForMe,
  /* "Auto-draft the rest", which the React room had no door for.

     Solo it runs the board out: my seats follow my queue before the model's
     opinion, every other seat is the CPU's own choice, and both fall back to
     the best player left rather than to nothing - so the button either
     finishes the draft or the board is empty, with no third outcome where it
     stops halfway without saying why.

     In a room the same function is an autopilot on your own chair instead,
     because drafting nine other managers' teams locally is the bug this
     already has a comment about. The React room reaches that through the
     Autopick toggle, so the control this exposes is offered off-room only -
     but it is the same function either way rather than a second loop that
     would have to be kept in step. */
  autoDraftRest: autoDraftRest,
  // Undo, Pause and Discard for the React draft room page — reusing the
  // exact functions the legacy action bar calls, including the visibility
  // rules renderActionBar() already encodes (see CLAUDE.md's "Everything
  // the room decides has to be locked" section): Undo is solo-only — in a
  // room it un-drafts a copy the next broadcast overwrites anyway, so it
  // has to be hidden rather than merely made to fail. Pause is the host's
  // in a room (togglePause() already refuses anyone else via Live.pause()
  // being ignored server-side, but the button should not be offered in the
  // first place, same reasoning as Undo). Neither state.paused nor "am I
  // the host" existed on the bridge before this, so both are added as
  // plain reads.
  undo: undo,
  paused: () => state.paused,
  // renderPauseButton() disables the button at clockLength 0 — pausing a
  // clock that was never running is meaningless — so this is bridged too,
  // rather than the Pause control here always being clickable when the
  // legacy one sometimes isn't.
  clockLength: () => state.clockLength,
  // Raw seconds remaining, for the Cockpit header's draining bar
  // (timeLeft / clockLength). headerInfo().rightValue is already the
  // formatted "0:15" string the big countdown digit reads — this is the
  // one thing that wasn't on the bridge yet because nothing needed the
  // unformatted number before there was a bar to fill.
  timeLeft: () => state.timeLeft,
  // The year buildPriorSeason() actually found (latestStatSeason()), for the
  // Players tab's season toggle — p.priorPts/p.priorGames are already real
  // fields on every board player (set inside buildPriorSeason(), scored
  // under the current rules exactly like the projection), so the only thing
  // missing a bridge was the label itself. Null if the stats feed had
  // nothing to find a prior season in, which the tab reads as "hide the
  // selector" rather than showing it against empty columns.
  priorSeason: () => PRIOR_SEASON,
  /* The pick clock is state, not league - it is per-drafter rather than part
     of the board's shape, which is why a room broadcasts it separately. The
     settings modal wrote league.clock for two commits and read it back as
     undefined every time: a control that looked live, moved, and changed
     nothing. Setting it before a draft is what startDraft() then carries. */
  setClockLength: function (seconds) {
    const n = Number(seconds);
    if (!isFinite(n) || n < 0) return false;
    state.clockLength = n;
    render();
    return true;
  },
  hasRoom: hasRoom,
  // "In a room" (hasRoom) and "the socket is up right now" (inRoom) are
  // different questions — see CLAUDE.md's note on the two — and the chat
  // composer needs the second one: hasRoom() stays true through a drop, so
  // gating Send on it alone would swallow a message with no sign why.
  inRoom: inRoom,
  isHost: () => hasRoom() && !!Live.room().isHost,
  draftOver: draftOver,
  // restart() is clearSave() + goHome() — the exact real "Discard draft" /
  // "Leave the room" action (the label itself is real too: renderActionBar()
  // already picks between them by hasRoom(), reused here rather than
  // re-deciding it). goHome() disconnects a room first if one is active, so
  // this is a real departure, not a local reset that the next broadcast
  // undoes.
  restart: restart,
  // Rooms and chat, for the React draft room page. None of this is a
  // second implementation of Live/room.js — every entry below is either a
  // plain read off Live or a direct call into the exact function the
  // legacy lobby already uses.
  //
  // The one real design decision: Live.onChange()/Live.onTyping() are
  // single-slot callbacks (see live.js), not an event bus, so this file
  // never calls them a second time from here — doing that would silently
  // replace onRoomChange() and stop adoptRoom()/driveRoomCPUs()/
  // driveMyAutopilot()/resetClock() from ever running again. createRoom()
  // and joinRoomByCode() below both go through the real joinRoom(), the
  // one function that already registers Live.onChange(onRoomChange) and
  // Live.onTyping(onRoomTyping) correctly — and onRoomChange() already
  // ends by calling render(), which already fires "juke:header" via
  // renderHeader(). So this page's existing useJukeTick() hook picks up
  // every room change (a pick, a chat line, a seat swap) for free; no
  // second event is needed. onTyping() below is the one exception: its
  // only existing consumer (onRoomTyping) just feeds a typing indicator in
  // the legacy, permanently-hidden chat dock, so replacing that single
  // slot from React has no visible legacy consequence — unlike onChange.
  room: () => Live.room(),
  liveStatus: () => Live.status(),
  liveReason: () => Live.reason(),
  codeInUrl: () => Live.codeInUrl(),
  // The shareable link, wherever the tab is — Live.link() reads live.code
  // directly rather than the current hash, which is what makes this safe to
  // call from the Lobby (#/drafts) and not only from #/draft-room?room=...
  // itself. RoomPanel.jsx and DraftMenuOverlay.jsx both used to build this
  // string by hand off codeInUrl(), which is the wrong source for it and
  // reads empty everywhere but the one route that happens to carry the
  // code in its own query string.
  link: () => Live.link(),
  memberId: () => Live.memberId(),
  myName: () => Live.name(),
  setMyName: (name) => Live.setName(name),
  // The real createRoomBtn sequence, minus readSetup(): that call exists
  // there to pull league settings out of legacy DOM inputs this page
  // never renders, and this page's DraftSettingsModal already keeps the
  // one real `league` object current via setLeague() on every change — a
  // second read off empty/default DOM elements would overwrite an
  // already-correct league with defaults, not update it.
  createRoom: function () {
    if (setupProblem()) return null;
    const code = Live.newCode();
    location.hash = "#/draft-room?room=" + code;
    joinRoom(code, true);
    return code;
  },
  joinRoomByCode: function (code) {
    if (!code) return;
    location.hash = "#/draft-room?room=" + code;
    joinRoom(code, false);
  },
  // Mirrors leaveRoomBtn's handler, minus its redirect to #/draft — this
  // page stays on its own route and only drops ?room= from the hash, so a
  // reload lands back on setup rather than rejoining what was just left
  // on purpose (same reasoning goHome() already documents for Discard).
  leaveRoom: function () {
    Live.disconnect();
    location.hash = "#/draft-room";
    renderInvite();
    renderChat();
  },
  // replyTo is the third, optional argument all the way down — Live.chat()
  // already defaults it to null for a caller that only ever passed two.
  sendChat: (text, gif, replyTo) => Live.chat(text, gif || null, replyTo || null),
  sendReaction: (id, emoji) => Live.react(id, emoji),
  onTyping: (fn) => Live.onTyping(fn),
  sendTyping: (on) => Live.typing(!!on),
  // The mobile redesign's chat types — thin bridges over the identical
  // Live.* functions sendChat/sendReaction already wrap, not reimplemented.
  // uploadMedia resolves to a URL (or null on any failure) and is a
  // separate step from posting, same as GIPHY search vs. sending a gif.
  sendPoll: (question, choices, opts) => Live.pollCreate(question, choices, opts),
  votePoll: (id, choice) => Live.pollVote(id, choice),
  sendVoice: (url, seconds, replyTo) => Live.voice(url, seconds, replyTo || null),
  sendPhoto: (url, w, h, replyTo) => Live.photo(url, w, h, replyTo || null),
  uploadMedia: (kind, blob) => Live.uploadMedia(kind, blob),
  claimSeat: (seat) => Live.claimSeat(seat),
  swapSeats: (a, b) => Live.swapSeats(a, b),
  gifSearch: (q) => Live.gifSearch(q),
  safeGif: safeGif,
  safeMediaUrl: safeMediaUrl,
  // chatStream() is the real merge of room.chat and room.picks into one
  // timeline by `at` — picks are not chat messages, and this is the same
  // function that keeps the legacy dock from storing them twice (see
  // CLAUDE.md). Bridged directly rather than re-merged in React.
  chatStream: chatStream,
  // The real queue — state.queue is an array of player names, and these
  // four are the exact functions the legacy rail's star/move buttons
  // already call (queueToggle()/queueMove() themselves don't render;
  // the caller does, same as the legacy delegated click handler does
  // here). queueTop() is what autoPickForMe() and the clock-expiry pick
  // already prefer over cpuChoice()'s own choice — starring a player here
  // is the same real plan, not a second, cosmetic-only "favorites" list.
  queue: () => state.queue,
  queued: queued,
  queueToggle: function (name) { queueToggle(name); render(); },
  queueMove: function (name, delta) { queueMove(name, delta); render(); },
  // A separate list from the queue on purpose — see the comment on
  // state.watchlist. No move/reorder pair: order carries no meaning here,
  // unlike the queue, so there is nothing for queueMove()'s equivalent to do.
  watchlist: () => state.watchlist,
  watchlisted: watchlisted,
  watchlistToggle: function (name) { watchlistToggle(name); render(); },
  currentTheme: currentTheme,
  setTheme:     setTheme,
  soundWanted:  () => soundWanted,
  toggleSound:  toggleSound,
  togglePause:  togglePause,
  // Added for the React Analysis tab (web/src/components/AnalysisTab.jsx).
  // analyseDraft() is the real grade computation — every component, scaled
  // and weighted, exactly as renderGrades() reads it — called fresh on
  // each render, same as the legacy panel. Its own `.lineup` field is
  // built by bestLineup() (sorts by aboveReplacement, so it resolves the
  // FLEX correctly between positions), which is NOT seatedLineup() —
  // RosterDock's prop above is the other one, on purpose (it fills slots
  // in draft order). A caller here must read analyseDraft()'s own
  // .lineup, never mix in seatedLineup(), or it silently reproduces the
  // exact starter-strength bug CLAUDE.md documents as already fixed once.
  // byeSummary()/replacementText()/lineupText() are the prose helpers
  // renderGrades()'s bye label and method note already use verbatim —
  // bridged so that prose is never re-derived in React.
  analyseDraft: analyseDraft,
  // The starter-strength caption. Bridged rather than reimplemented in
  // AnalysisTab.jsx for the reason parText() itself gives: two captions for
  // one bar drift, and the bar is scored against par while the raw sum is
  // what the VORP matrix prints.
  parText: parText,
  parValueText: parValueText,
  buildText: buildText,
  // Added for the Analysis tab's "Fix this first" card — see bestUpgrade()'s
  // own comment for why only starters/build are simulated and why "before"
  // isn't part of what this returns (the caller already has it, off the
  // same analyseDraft() call the four bars already read).
  bestUpgrade: bestUpgrade,
  // The Insights dashboard's "One that got away" panel. It used to do this
  // scan itself off two bare replacementGap() readings, which is a comparison
  // between two players with no reference to the roster being advised — see
  // oneThatGotAway()'s own comment for the two-tight-ends case that exposed
  // it. The verdict is computed here, beside bestLineup(), for the same
  // reason usageFor() and projectionSummary() are: a component renders what
  // the engine decided, and never decides it a second way.
  oneThatGotAway: oneThatGotAway,
  byeSummary: byeSummary,
  replacementText: replacementText,
  lineupText: lineupText,
  // The real component weights (50/25/15/10), for the mobile Analysis
  // screen's "NN% weight" / "contributes N.N" rows — bridged rather than
  // hand-copied so a React screen showing "the composite must be
  // auditable" can never quote a stale percentage after WEIGHTS moves.
  weights: () => WEIGHTS
};

/* An invite code in the address bar means someone followed a link, so the
   room is joined before anything else happens. Not the host: the room
   already exists and already has a shape, and this browser's setup screen
   has no say in it. */
(function () {
  // Filled before anything connects, so a link followed from a text message
  // arrives in the room already wearing the name from last time.
  $("displayName").value = Live.name();

  const code = Live.codeInUrl();
  if (code) joinRoom(code, false);
  renderInvite();
})();

// Back to top, twice: once for the page, which is what the landing view and
// every draft panel scroll, and once for the player sheet, which is the only
// thing in here that scrolls inside itself. The sheet's copy is mounted on
// .sheet rather than on the scrolling body, so it stays put instead of
// riding the content up. Both survive a render() because neither lives
// inside a panel that render() rebuilds.
backToTop({
  // The flat 400px default (still right for the sheet, below) is measured
  // for a page with thousands of pixels of travel. The React homepage this
  // now shares a body with is a handful of sections — a design review
  // caught the button appearing after a single small scroll and then just
  // sitting there, overlapping content, for most of a page that was never
  // much taller than the screen it's read on. Two viewport-heights instead
  // of a fixed pixel count, so it scales with whatever's actually on
  // screen rather than assuming a specific page height; read at call time
  // rather than tracked on resize, the same one-off-read treatment this
  // file gives every other viewport dimension.
  showAfter: window.innerHeight * 2
});
backToTop({
  target: $("sheetBody"), mount: $("sheet"), className: "in-sheet",
  // The sheet has a few hundred pixels of travel at most, never the page's
  // several thousand, so it earns the button sooner. The default threshold
  // is measured for a full page and would sit past the end of most sheets.
  showAfter: 200
});
