-- 0011_league_credentials.sql — the credential a private league needs.
--
-- ESPN has no OAuth for third parties, so reading a PRIVATE league means
-- holding the `espn_s2` + `SWID` pair the reader pastes in. That pair is a
-- whole-account ESPN session rather than a scoped read token.
--
-- ---- Why this is its own table and not two columns on connected_leagues ----
--
-- `listLeagues()` is what draws the header chip, the switcher menu and the
-- You screen's list, and its answer goes to the BROWSER. A credential
-- column on that row would be one forgotten `SELECT *` away from being
-- serialised into a page — and it would look completely fine, because the
-- page renders identically whether or not the JSON carries a field nothing
-- draws.
--
-- Separated, the only statement in this project that reads a secret is one
-- function nobody reaches by accident, and `listLeagues()`'s three-rung
-- schema ladder does not have to change at all. That ladder exists because
-- the worker ships separately from its migrations, so leaving it alone is
-- worth more than the join it costs.
--
-- ---- The blob is sealed, and this table cannot open it ----
--
-- `cred` is AES-GCM ciphertext from worker/credentials.js, bound to
-- (clerk_id, provider, league_id) as additional data. So a row copied onto
-- another account does not decrypt, and somebody who can write this table
-- without holding LEAGUE_CRED_KEY cannot make the worker spend a
-- stranger's credential for them.
--
-- `cred_at` is when it was last written, in epoch seconds like every other
-- timestamp here. It is what a screen uses to say "reconnected 3 weeks
-- ago" when an expired cookie starts failing, which it eventually will:
-- ESPN's session is not permanent and nothing here can refresh it.
--
-- ---- It has to be deleted in two more places ----
--
-- deleteUserData()'s batch, on the instruction 0005's own comment already
-- gives: anything keyed by clerk_id belongs in that list the day its
-- migration lands, or an account deletion FAILS on the foreign key rather
-- than leaking. And deleteLeague(), which was one statement and is now a
-- batch of two -- disconnecting a league while leaving an account-acting
-- credential behind is the worst leftover this schema could produce, and
-- it is the one a reader would believe they had just removed.
CREATE TABLE IF NOT EXISTS league_credentials (
  clerk_id   TEXT NOT NULL REFERENCES users(clerk_id),
  provider   TEXT NOT NULL,
  league_id  TEXT NOT NULL,

  cred       TEXT NOT NULL,
  cred_at    INTEGER NOT NULL,

  PRIMARY KEY (clerk_id, provider, league_id)
);
