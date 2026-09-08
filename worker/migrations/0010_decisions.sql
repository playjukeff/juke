-- 0010_decisions.sql — the cross-room decision ledger.
--
-- "Juke said -> you did -> reality -> verdict", which is the design
-- handoff's own headline for this screen and the four things a row holds.
-- Every room that recommends something (Waiver, Trade, Strategy, Prospect)
-- writes one of these; My League's week strip and the History screen read
-- them back. Before this there was no data source for either, which is why
-- MyLeagueScreen.jsx renders neither for a real league.
--
-- ---- Why this is not draft_history ----
--
-- A mock draft's picks already have a home (0004_drafts.sql), and putting
-- them here too would be one fact in two tables — the failure this project
-- is most arranged against. So the ledger is in-season room decisions
-- only, and My League's DRAFT week cell reads draft_history instead. The
-- two answer different questions: draft_history is "a draft I completed",
-- this is "a call Juke made about my real roster, and whether it was
-- right".
--
-- ---- Why a league, and why no foreign key to one ----
--
-- A decision is about a real roster, so `provider`/`league_id` are NOT
-- NULL — there is nothing to record for an account that cannot connect a
-- league (Free), which keeps the fully-interactive demo it already has.
--
-- They deliberately do NOT reference connected_leagues. Disconnecting a
-- league must not delete the record of what was decided while it was
-- connected: that is somebody's history, and a cascade would remove it
-- silently. A row here outlives the connection it was made under, and the
-- read filters by league rather than the schema enforcing one exists.
--
-- ---- Three moments, and only the first has the user in front of it ----
--
-- A decision is WRITTEN when Juke recommends (decided_at, `data.said`),
-- UPDATED when the manager acts (`data.did` — the same row, by its own
-- id), and GRADED when the week is over (verdict, graded_at). That last
-- one is a scheduled job reading data/season/<season>/week-<NN>/, which is
-- why `season` and `week` are real columns rather than fields inside the
-- blob: the grader selects on them and nothing else.
--
-- verdict and graded_at are NULL until then, and a NULL verdict is "not
-- yet", never "no verdict" — the same distinction /me draws between "not
-- signed in" and "could not tell", and the reason the read hands both
-- states back rather than collapsing them.
--
-- The season's first archived week does not exist yet (data/season/ holds
-- only its README today), so every row written before then stays ungraded
-- until the grader's first run. That is the point rather than a gap: a
-- decision cannot be recorded retroactively, so a week that passes with no
-- ledger in place is grading data that can never exist.
CREATE TABLE IF NOT EXISTS decisions (
  -- Minted client-side before this row exists, the same way recordHistory()
  -- already mints a draft-history id, so an entry has one id its whole life
  -- rather than a local one and a server one that can disagree. It is also
  -- what lets "the manager acted on it" be an update to this row instead of
  -- a second row nothing joins back.
  id          TEXT PRIMARY KEY,
  clerk_id    TEXT NOT NULL REFERENCES users(clerk_id),

  -- Which league this was about. No FK — see above.
  provider    TEXT NOT NULL,
  league_id   TEXT NOT NULL,

  -- What the grader selects on. `season` is the four-digit year the
  -- archive directory is named for; `week` is the NFL week the decision
  -- concerns, which is not always the week it was made in (a Tuesday
  -- waiver claim is about the week ahead).
  season      TEXT NOT NULL,
  week        INTEGER NOT NULL,

  -- 'waiver' | 'trade' | 'strategy' | 'prospect' — the room slug, so a
  -- row can be drawn with the room's own identity without the reader
  -- parsing `data`. Not constrained here: a CHECK would have to be
  -- migrated every time a room ships, and the rooms are the one part of
  -- this product still arriving.
  room        TEXT NOT NULL,

  -- The record whole, exactly as the client built it. Same reasoning as
  -- 0004_drafts.sql's own `data` column: the client already knows how to
  -- read its own shape, and a second server-side schema would either
  -- duplicate every compatibility rule or drift from them.
  data        TEXT NOT NULL,

  decided_at  INTEGER NOT NULL,

  -- NULL until the grader runs. Never written by a client.
  verdict     TEXT,
  graded_at   INTEGER,

  updated_at  INTEGER NOT NULL
);

-- The read: one league's decisions, newest first, which is the only order
-- any surface asks for.
CREATE INDEX IF NOT EXISTS idx_decisions_league
  ON decisions (clerk_id, league_id, decided_at DESC);

-- The grader: every ungraded decision for one completed week, across all
-- accounts. Partial, because a graded row is never selected this way again
-- and the ungraded set is the small one.
CREATE INDEX IF NOT EXISTS idx_decisions_ungraded
  ON decisions (season, week) WHERE verdict IS NULL;
