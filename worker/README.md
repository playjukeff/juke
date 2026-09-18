# The room

What sits behind an invite link. One Cloudflare Durable Object per draft:
everyone who follows `jukeff.com/#/draft?room=E8jeVeL` is routed to the same
object, and that object is the only thing that decides what happened.

**This is deployed**, to `juke-draft-room.jukeff.workers.dev`, and `live.js`
points at it by name. So a change to `draft-room.js` or to `../room.js` is not
live until a deploy has run (`npm --prefix worker run deploy`, which
migrates first — see **Deploying**), and a client that expects it will fail
against the old one — check both sides ship together.

**The site still does not need it.** A solo mock draft opens from `file://`
with no backend at all and never opens a socket, and that is deliberate — see
the multi-user section of `CLAUDE.md`.

## The account-deletion webhook

`POST /webhooks/clerk`, verified against `CLERK_WEBHOOK_SECRET`, deletes
everything Juke holds for an account when Clerk says it is gone.

Set it up once, in the Clerk dashboard under **Webhooks**:

1. Endpoint `https://juke-draft-room.jukeff.workers.dev/webhooks/clerk`
2. Subscribe to **`user.deleted`** (anything else is acknowledged and ignored)
3. Copy the signing secret and give it to the worker:

```bash
wrangler secret put CLERK_WEBHOOK_SECRET -c worker/wrangler.toml
```

**Until that secret exists the route refuses with a 500 rather than
answering 200.** Everywhere else here an unconfigured binding answers "no"
quietly and the product carries on; that contract is exactly wrong for
this one. Honouring an unverified delete would let anybody delete anybody's
drafts, and a cheerful 200 that did nothing would tell Clerk the delivery
succeeded, so it would never retry and the deletion would be lost in
silence. A 500 says nothing happened, and Clerk redelivers once the secret
is there.

**The signature replaces the Origin check rather than joining it.** Clerk
posts from its own servers with no Origin header, so `originAllowed()` —
which every other route here applies — would reject every real delivery.
The signature is the stronger claim anyway: an allowed Origin says the
request came from our page, a valid signature says it came from Clerk.

### Verifying it by hand

`worker/test-auth.mjs` covers every way of *not* being Clerk, which is the
half that matters most — a false accept is somebody else's drafts gone. The
accept path needs a request signed with the worker's own secret, which
nothing in the repository can know, so it is checked locally:

```bash
# worker/.dev.vars (gitignored)
CLERK_WEBHOOK_SECRET=whsec_<any base64 you like>
```

Start `wrangler dev --local`, sign a `user.deleted` body with the same
secret using `standardwebhooks`, and post it. Measured this way: unsigned,
forged and tampered bodies all 400; a `user.created` is a 200 that ignores
it; a valid `user.deleted` is a 200 that leaves `users`, `saved_drafts` and
`draft_history` all at zero rows; and a repeat delivery of the same event
is another clean 200, which is what Clerk's retries need.

**One trap, and it cost twenty minutes.** `wrangler dev` reads `.dev.vars`
at boot and hot-reloads code without re-reading it, so a dev server started
before the file existed serves the new route with no secret and answers
`not-configured` for ever. Two of them were listening on 8787 at once, the
older one from hours earlier. Same lesson this repository already records
about stale dev servers: check what is holding the port before believing
what it tells you.

## What is where

| File | Role |
|---|---|
| `draft-room.js` | The Durable Object. Sockets, storage, the alarm — and nothing else. |
| `store.js` | The D1 cache: the player pool and the headlines. Every function answers "no" to a missing binding rather than throwing. Also the account-owned rows — `touchUser()`, the saved draft, the locker — which are not a cache and are the one thing in here that cannot be rebuilt from a feed. |
| `auth.js` | `verifiedUser()`: is this `Authorization: Bearer` header a session Clerk actually issued. The one place the worker decides who is asking. |
| `espn.js` | ESPN, read-only. The second provider, and the only one whose rosters need translating — see the ESPN section. |
| `names.js` | One normaliser, shared by the pool sync and the ESPN crosswalk. Its twin is `build_players.py`'s, and `scripts/test_engine.py` asserts they agree. |
| `test-countdown.mjs` | The draft countdown's arithmetic, offline. Guards the one mistake that matters: both platforms keep the scheduled time after the draft has run. |
| `migrations/` | The SQL. `0001_init.sql` creates `players`, `player_news` and `news_lookups`; `0002_signup.sql` the waitlist; `0003_accounts.sql` and `0004_drafts.sql` the account, its saved draft and its locker; `0005_leagues.sql` a connected league, `0006_active_league.sql` which of several is showing, `0007_player_name_key.sql` the key the ESPN crosswalk joins on, and `0008_draft_time.sql` when each league drafts. |
| `wrangler.toml` | Bindings, the DO migration and the cron. One class, `DraftRoom`; one database, `juke_db`. |
| `../room.js` | Who is sitting where, what has been picked, how long is left. Pure. |
| `../draft-engine.js` | The rules of a snake draft. Pure. |

The two pure files are the point. The browser loads them as well, so a client
and the server reach the same verdict about a pick because they are running
the same code, not because two implementations were kept in step by hand.

`draft-room.js` is deliberately thin. If Cloudflare ever stops being the
right host, that file is what gets rewritten; the rules and the room move
unchanged.

## Running and testing it

Needs Node, which this project otherwise does not — the *site* has no build
step and never will, but a server is a thing you deploy. Node is installed
via winget as a user-scope package, so a **new** terminal picks it up; one
that was already open will not.

```bash
npm install -g wrangler
cd worker
wrangler dev --port 8787 --local
```

That runs the real Durable Object runtime locally, with no Cloudflare
account. In another terminal:

```bash
node worker/test-sockets.mjs
```

Thirty assertions over real sockets: two managers joining, seats, host-only
start, wrong-seat refusal, chat, a reconnect mid-draft, a stale build being
turned away — and the one that matters, two submits of the same player on
one turn producing exactly one pick.

```bash
node worker/test-auth.mjs
```

Eight assertions over `/me` — every way of being signed out, none of them a
500. See **Accounts** below for what it cannot cover and why.

`wrangler deploy --dry-run --outdir=<dir>` compiles without an account and is
the quickest check that the bundle is still valid.

Deployed at **https://juke-draft-room.jukeff.workers.dev**, on the free plan.
SQLite-backed Durable Objects turned out not to need the paid one — that is
what `new_sqlite_classes` in the migration buys, and it is why the binding is
declared that way rather than as `new_classes`.

```bash
npm --prefix worker run deploy
JUKE_WORKER="wss://juke-draft-room.jukeff.workers.dev" node worker/test-sockets.mjs
```

**`npm run deploy`, not `wrangler deploy`.** The npm script carries a
`predeploy` hook that applies pending D1 migrations first and aborts the
deploy if they fail — and it exists because skipping that step took the
connect flow down in production: a worker carrying `0008`'s columns went live
against a database without them, `putLeague()`'s INSERT threw, and every
connect failed. Writes ladder across schema versions now, so that exact
outage cannot repeat, but the ordering is still the thing that keeps a
deploy honest.

**Running `wrangler deploy` by hand skips the hook entirely**, and npm cannot
prevent that. This is a shorter safe path rather than a locked door — which
is worth stating plainly, because a guard people believe in and that does not
fire is worse than no guard.

**Migrations run BEFORE the deploy because every migration here is
additive** — new code needs columns the old schema lacks, so the database
must lead. A destructive migration (dropping a column code still reads) needs
the opposite order: deploy first, then migrate, by hand. Do not reach for
`npm run deploy` for one of those without thinking it through.

| script | does |
|---|---|
| `npm --prefix worker run deploy` | migrate, then deploy. The one to use. |
| `npm --prefix worker run migrate` | apply pending migrations to **production**. |
| `npm --prefix worker run migrate:local` | the same against the local sqlite. |

The same thirty assertions run against production by setting `JUKE_WORKER`.

A freshly registered workers.dev subdomain has no certificate for a few
minutes. Until it is issued the symptom is a TLS handshake failure, which
reads like a broken deploy and is not: DNS resolves, the worker is up, and
the certificate simply has not arrived. Wait and retry before debugging
anything.

## Decisions worth knowing before changing anything

**The first person through the door creates the room** from their own setup
screen and becomes the host. Everyone after gets the room as it already is;
their settings are ignored rather than merged, because a draft cannot be half
twelve-team.

**A stale player list is turned away, not silently accepted.** The generated
data is rebuilt nightly and the CPU wobble reads a player's position on the
board, so someone who loaded the page after a rebuild would compute different
CPU picks and drift apart inside a round. The room pins the version it
started on and rejects a mismatch with both versions named.

**A dropped connection keeps its seat.** In the lobby, leaving frees the
chair. Mid-draft it stays yours and switches to auto, because a lost
connection is usually a tunnel or a locked phone, and handing someone's
roster to a stranger because their train went underground would be worse than
picking for them.

**Rejections go to one person.** A pick that fails is about that manager's
click; broadcasting it would tell nine other people about a mistake that does
not concern them.

**The room never counts down.** It records when the current pick started and
answers how long is left when asked. That is what lets a phone that was
asleep, or someone who just joined, arrive at the same number as everyone
else rather than counting from whenever they woke up.

## The two proxied routes

Neither is about the draft. Both exist because a key in client-side
JavaScript is public, so the page calls us and we call them.

- **`/giphy?q=`** — the chat GIF picker. `wrangler secret put GIPHY_KEY`.
- **`/news?player=`** — headlines on a player sheet.
  `wrangler secret put TANK01_KEY`.

Both refuse an origin they do not serve **before the key is read**, with a
403. That is the check that matters: CORS headers tell a browser whether to
let a page read a response and do nothing about the request being made, so
`curl` with a made-up Origin drank the GIPHY quota happily until
`originAllowed()` went in front of it.

With no key set, each answers `configured: false` rather than an empty list.
The two are different facts — "not wired up" and "nothing today" — and only
one is worth investigating. The news panel draws nothing either way, which is
deliberate: it is a section nobody asked to wait for, and a permanently empty
box is worse than no box.

`TANK01_BASE` overrides the upstream host and exists for the tests, which
point it at a local stub so the whole path can be driven without a key or a
network. Leave it unset in production.

`SLEEPER_BASE` is the same knob for `sleeper.js`, and exists for the same
reason. Verifying league connect against a real league proves the happy
path and nothing else: a real league cannot be asked for a 500, a truncated
body, a renamed field or forty-one rosters, and the league it was verified
against is pre-draft today and will not be next month. `node
worker/test-sleeper.mjs` drives the parse and the four-way join against a
stub with no network and no wrangler at all — it imports the module
directly and passes the base as an argument, so nothing has to be running.
It is in CI. Leave `SLEEPER_BASE` unset in production.

`/news` answers are cached at the edge for fifteen minutes (`NEWS_TTL`), keyed
by player rather than by request URL, because the free tier is a thousand calls
a month and a draft is the same dozen players opened repeatedly. Measured at 50
requests across 5 players costing 5 upstream calls. Failures are never cached —
pinning an outage for the TTL would turn a blip into fifteen minutes of silence
— and the CORS headers are rebuilt per request rather than served from the
cached entry.

That edge cache is now the first of three tiers rather than the only one: D1
sits behind it and the provider behind that. See **The cache database** below,
which is where the arithmetic that actually protects the allowance lives.

Only the shape `{ title, summary, source, at, url }` reaches the page.
Normalising here rather than passing the provider's payload through means
swapping provider is a change to `fetchUpstreamNews()` and nothing else, and
it keeps the number of fields the page has to escape down to what it draws.
**`source` is never dropped** — we link and attribute rather than republish,
and an unattributed headline is the version of this that is not allowed.

## Accounts

Clerk (`web/src/clerkConfig.js`) owns login, signup and sessions entirely on
the client. This worker's whole job is `auth.js`'s `verifiedUser()`: given a
request, decide whether `Authorization: Bearer <token>` is a session Clerk
actually issued, and answer null rather than throwing if it is missing,
malformed, expired or simply absent — no key configured included, same
"answer no to a missing binding" contract `store.js` already uses for D1.

**`GET /me`** is the simplest route built on it: verify, record that this
person was seen (`touchUser()` in `store.js`), answer `{ signedIn }`.

**`/me/draft` and `/me/history`** are what actually save and read anything,
and they shipped — both go through `requireUser()`, which calls the same
`verifiedUser()` rather than re-deriving "who is this" a second time.

They answer **401** where `/me` answers `signedIn: false`, and the split is
deliberate: `/me` exists so a caller can ask "am I logged in" without it
being an error either way, while a route that can lose or leak somebody's
draft draws the harder line.

Both store the client's JSON **whole**, in a `data` column, rather than
decomposed into columns here — `app.js` already carries its own
backward-compatibility rules for both shapes, and a second server-side schema
would either duplicate every one of them or drift from them. `completed_at`
is the one field pulled out as a real column, for `ORDER BY` and nothing
else, converted from `recordHistory()`'s milliseconds to this project's
epoch-seconds convention at the route rather than leaving `store.js` to guess
the unit. History is written one entry at a time, never in bulk: only one
entry has ever actually changed, and sending the other 199 back every time is
all cost.

`wrangler secret put CLERK_SECRET_KEY` in production, same shape as
`GIPHY_KEY`/`TANK01_KEY`; locally it goes in `.dev.vars` (see above). **It
belongs on this worker and nowhere else** — a `CLERK_SECRET_KEY` set on the
Pages project does nothing at all, and looks exactly as configured as one
that works. Production uses an `sk_live_` key from Clerk's production
instance, which is a different instance from the development one with its own
keys and its own user list.

**Read `auth.js`'s comment before changing how the token is checked.** The
`verifyToken` exported from `@clerk/backend`'s package root is
`withLegacyReturn(verifyToken)` — it returns the JWT payload directly on
success and **throws** on failure, which is not the `{ data } | { errors }`
union the package's own internal `src/tokens/verify.ts` documents. Written
against that union, this file rejected every valid session from the day
accounts shipped until 1 September 2026, and logged `verifyToken refused: []`
while doing it — an empty errors array being this code finding nothing to
report rather than Clerk reporting no problem.

**The `users` table has no email or name column, on purpose.** The client
already has both, verified, straight from its own Clerk session the moment
someone is signed in — fetching and caching a second copy worker-side would
be exactly the "two sources of truth for one fact" this project keeps
finding bugs from elsewhere. If a feature ever needs Juke's own copy, that
is the moment to add the columns and the fetch that fills them.

**`PREVIEW_ORIGIN_RE`** allows any `https://<hash>.juke-1mw.pages.dev`
origin through `originAllowed()`, alongside the fixed `ALLOWED` list and the
localhost regex. Every branch push gets its own preview build at a fresh
address, which is where this feature is actually tested from before a merge
— without this, every authenticated route 403s on a preview deploy with
nothing in the browser to say why beyond the network tab.

`node worker/test-auth.mjs` (against a `wrangler dev --local` already
running) covers every way of being signed out — no Origin, a wrong Origin,
no token, a malformed token, a well-formed-but-unsigned one — and asserts
none of them ever produce anything but a clean `signedIn: false`. It cannot
cover the signed-in path: that needs a token actually signed by Clerk, which
nothing offline can produce. That half is verified by hand, against a real
deploy, with a real sign-in.

## Chat media (voice and photos)

R2, bound as `MEDIA`, bucket `juke-chat-media`. Two chat message types —
`voice` (a clip and its length in seconds) and `photo` — carry a URL rather
than bytes, and this is where the bytes live: neither the Durable Object
(a hard storage ceiling, and the whole room is written to it on every
action) nor D1 (a cache of somebody else's data, never a source of truth of
our own) is the right place for a recording or a photo that exists nowhere
but here.

**MANUAL STEP — this binding does nothing until the bucket exists.** Unlike
`GIPHY_KEY` and `TANK01_KEY`, which are secrets set with `wrangler secret
put`, R2 needs the bucket itself created first, from an account with R2
enabled:

```bash
wrangler r2 bucket create juke-chat-media
wrangler deploy
```

Until that has run, `env.MEDIA` is unbound: `POST /media` answers
`{ configured: false }` — the same shape a missing GIPHY or Tank01 key
already answers — rather than throwing, and nothing else in the worker is
affected.

**Two routes, not R2's own public-bucket URL.**

- **`POST /media?kind=voice|photo&room=<code>`** — the upload. Origin-checked
  before the binding is even looked at, same as `/giphy` and `/news`.
  Content-type is checked against an allowlist per kind and the body against
  a byte cap (2MB for voice, sized off two minutes of Chrome's default
  128kbps Opus encoding; 8MB for photos, sized off an unmodified 12-megapixel
  phone camera JPEG — see `MEDIA_KINDS`' own comment in `draft-room.js` for
  the arithmetic). Stores to R2 under a random 16-byte key and returns
  `{ url }`.
- **`GET /media/<key>`** — the read, streamed straight from the binding. No
  origin check: an `<img>`/`<audio>` load is never CORS-governed in the
  first place, so refusing an unrecognised Origin here would not stop a page
  embedding one anyway, and some browsers omit Origin on a plain media fetch
  regardless — a check that would 403 a legitimate load for no security
  benefit. The random key is what stands in for access control, at a length
  nobody is going to guess, the same trust model the invite code itself
  already relies on.

Serving it ourselves rather than through R2's own public-bucket URL is
deliberate: a public bucket needs its own "make this public" step (a
dashboard toggle or a connected custom domain) with its own security
surface, on top of the `bucket create` above. This way needs nothing extra
— the binding is private by default — and every media URL stays on a host
`MEDIA_HOSTS` and `room.js`'s `cleanMediaUrl()` already know about, the same
way a GIF has to be giphy.com's own domain and not merely contain the
string.

`voice`/`photo` chat actions carry only the URL that route returns; the
worker refuses one that is not on `MEDIA_HOSTS` (127.0.0.1/localhost under
`wrangler dev`, the deployed host in production) before it is ever stored,
the same way `cleanGif()` refuses a GIF that is not giphy.com's own — a
crafted message could otherwise name any URL on the internet and have every
other client's browser fetch it.

## ESPN

The second platform a league can be connected from, and the first one whose
rosters have to be translated before anything else can read them.

`espn.js` answers the same two questions `sleeper.js` does, in the same two
shapes, so nothing downstream knows which platform a league came from:

| Route | Answers |
|---|---|
| `GET /espn/league?league=<id>[&season=]` | the league, and its teams |
| `GET /espn/snapshot?league=<id>[&season=]` | rosters, records, points |

Neither needs a token — a public ESPN league is public, and asking us for it
teaches a caller nothing `lm-api-reads.fantasy.espn.com` would not — and both
sit behind `originAllowed()` for the reason the Sleeper pair does.

### What ESPN answers, measured

5 September 2026, against the live API rather than assumed:

```
200  a public league
401  a league that exists and is not public
404  no such league        (12345678, 999999, 2000000000)
400  not a valid id at all ("Invalid parameter for 'leagueId'")
```

`401` and `404` are reported separately all the way to the dialog, because
they are different things to tell somebody: *make it public* against *check
the number*. Collapsing them sends a reader to re-type a number that was
right. `private` is the only failure in this flow with a fix the reader can
carry out, which is why it names League Settings rather than saying the id
did not work.

### There is no username step, and there cannot be

ESPN publishes nothing that maps a person to their leagues. So the flow is
*which league → which of these teams is yours*, where Sleeper's is *who are
you → which of your leagues*. The second question is not optional: without
it there is no `ownerId`, and every screen that says "your roster" has
nothing to key on.

The team the reader picks is checked against the league's own teams before
it is stored — an `ownerId` naming a team that is not in the league renders
as a connected league with nothing in it.

### The crosswalk, and why it is a name join

A snapshot's `players` and `starters` are **Sleeper ids in every provider**,
because that is what `players.js` and `stats.js` are keyed by. Sleeper gets
that for free; ESPN has to earn it.

**Not `espn_id`.** Sleeper publishes the field and it covers **112 of the 452
non-DST players on Juke's board — 24.8%** (measured 5 September 2026). The
misses are systematic: Ja'Marr Chase, Trevor Lawrence, DeVonta Smith, Jaylen
Waddle, Travis Etienne and Kyle Pitts are all absent, the backfill having
apparently stopped around the 2021 draft class. Defenses carry none. So the
id join is worst exactly where a league's value is concentrated, and it fails
silently — a roster that quietly drops its best six players still renders.

**So it is a name join**, the shape `link_nflverse()` already measures at 240
of 241. Measured against ten real rosters (141 players):

```
defense, by club          13
name + position + club   109
name + position           17
unmatched                  2      Kenneth Gainwell, Bam Knight
```

**139 of 141.** Both misses are nicknames the two feeds spell differently,
and both are reported rather than guessed — `unmatched` and `unmatchedCount`
ride on the snapshot, because a roster one player short looks exactly like a
roster.

**A defense joins on the club and never on the name.** ESPN says "Patriots
D/ST" and the pipeline says "New England Defense"; neither normalises to the
other and no fuzzy match should be asked to bridge them, because there is an
exact answer sitting there — **Sleeper's `player_id` for a defense IS the club
abbreviation** (`SEA`, `HOU`). It needs no database at all, which is why a
defense still resolves when the pool is empty.

**The suffix rule is what makes the rest work.** An exact name match finds
114 of 128 skill players, and twelve of the fourteen misses are suffixes
alone: ESPN writes "Marvin Harrison Jr.", "Brian Thomas Jr.", "Kenneth Walker
III", "Kyle Pitts Sr."; Sleeper stores none of them that way. `names.js`
strips them, and `0007_player_name_key.sql` stores the result so the join is
one indexed lookup rather than a fold over 4,388 rows per snapshot.

**`names.js` is one normaliser in two languages**, and `scripts/test_engine.py`
asserts it against `build_players.py`'s own on sixteen real spellings. A
drift there does not throw — it stops matching, which reads as a short
roster.

### The draft time

Both providers report `draftAt` (epoch **milliseconds**, as both platforms
send it and as a browser counts down from — the one timestamp in this worker
that is not epoch seconds) and `draftStatus`, on their snapshot and on the
connect-time lookup. `0008` caches both on `connected_leagues` so the You
screen and the header switcher can list every league's countdown without one
upstream call each.

**Read the status before the instant.** Sleeper keeps `start_time` on a
completed draft and ESPN keeps `draftSettings.date` behind `drafted: true`,
so an instant alone counts down to a draft that has already happened.

**`refreshLeagueCache()` is the refresh `0005` always claimed and never
had.** Called from `GET /me/leagues` via `after(ctx, …)`, for the active
league only, at most hourly (`LEAGUE_CACHE_TTL`). It only ever UPDATEs —
`putLeague()` upserts, and an INSERT here would resurrect a league the
reader disconnected in another tab.

```bash
node worker/test-countdown.mjs
```

### The pool sync is armed now, and this is what pays for it

`wrangler.toml`'s cron was commented out with a note saying to turn it on "in
the change that adds the first consumer, so the cost and the thing paying for
it land together". `resolveSleeperIds()` is that consumer: without a filled
`players` table an ESPN league renders ten empty rosters.

**A fresh deployment does not wait until 11:30.** `espnSnapshotRoute()` fills
the pool off the response path the first time it finds it empty — the same
`after(ctx, …)` pattern `touchUser()` uses — and the snapshot carries
`crosswalkReady: false` so the screen can say "still reading your league"
rather than reporting an empty one. Verified locally: first call
`crosswalkReady false` with 128 unmatched and only the defenses resolved,
pool filled to 4,388 rows within seconds, second call `crosswalkReady true`
with 139 of 141 resolved. A snapshot taken before the pool existed is
deliberately **not** cached.

### Private leagues

ESPN publishes no OAuth for third parties, so the only way to read a private
league is the `espn_s2` + `SWID` pair out of the reader's own browser. They
paste it into the connect dialog; it is validated against ESPN before
anything is stored, and stored sealed.

**Set the key or the feature refuses itself.** No `LEAGUE_CRED_KEY` means
`canSealCredentials()` is false, the connect route answers
`private-unavailable` with a 503 **before it asks ESPN anything**, and the
dialog says private leagues are not switched on for this deployment. It
never falls back to storing the pair in the clear — that is the failure
that would have looked exactly like success.

Mint one (32 random bytes, base64) and set it on the worker:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
wrangler secret put LEAGUE_CRED_KEY -c worker/wrangler.toml
```

It lives where `CLERK_SECRET_KEY` does and for the same reasons: not in the
page, not in git, not in the Pages project. For local work put it in
`worker/.dev.vars` — and note `wrangler dev` reads that file at boot and
hot-reloads code **without** re-reading it, so a server started before you
added the line serves the route with no key for ever.

**Rotating it invalidates every stored credential.** That is a reconnect
rather than a loss: a credential that cannot be opened is reported as
"reconnect this league", nothing else in the database depends on it, and
`openCredential()` deliberately does not tell a rotated key apart from a
tampered blob because a reader can do nothing different about either.

**`0011_league_credentials.sql` has to be applied**, or the credential write
fails and the connect is refused with the league rolled back rather than
left connected and permanently unreadable. `npm --prefix worker run deploy`
migrates first; see the top of this file.

#### The cache, which is where this could have leaked

`caches.default` keys on league and season alone. An entry written while
reading a private league would therefore be served to **anybody** who asked
for the same league id, with no credential, as a healthy-looking 200. So a
credentialed read touches that cache in neither direction, on all three ESPN
routes — and the **write** is the half that matters, which a first cut of
this guarded on the snapshot's read and not its write.

The cost is one upstream call per private reader per render instead of per
two minutes; `snapshotStore` still dedupes on its own window. Keying the
cache on a hash of the credential would buy that back, and it has not been
measured, so it is not done.

#### And the POST on `/espn/league`

The dialog has to resolve a private league **before** anything is stored,
because ESPN's connect asks which team is yours and the teams only exist
once the league has been read. So that route takes a POST carrying the pair
— a body rather than query parameters, because a credential in a URL is a
credential in every log between here and ESPN.

It is the one ESPN read behind `requireUser()` rather than `originAllowed()`.
A route that answers "does this ESPN session work on this league" is, left
open, an oracle for testing stolen cookies from our origin and our IP. The
GET is untouched and still reads a public league signed out.

### Testing it

```bash
node worker/test-credentials.mjs # offline: the sealing, real WebCrypto
node worker/test-espn.mjs        # offline: the whole mapping, no network
```

Drives `espn.js` against a canned payload with the awkward rows in it — a
suffixed name, a defense, a bench slot, an IR slot, a club that has changed,
a player nobody can resolve, and a pool that has never synced. `ESPN_BASE`
points the routes at a stub the same way `SLEEPER_BASE` and `TANK01_BASE`
already do.

**What it cannot cover is whether ESPN's response still looks like that
fixture.** Nothing offline can. The shape was read off a real public league
first and is re-checked by hand against one:

```bash
curl -H "Origin: http://localhost:8765" \
  "http://127.0.0.1:8787/espn/league?league=<a public league id>"
```

## Yahoo

`yahoo.js`, and the one platform here with a real OAuth grant. Measured 17
September 2026: every anonymous Fantasy API request answers 401, so there is
no public Yahoo league — and there does not need to be, because Yahoo lets a
third party ask properly. The reader signs in on Yahoo's consent screen,
Yahoo sends them back to `https://jukeff.com/connect/yahoo` with a one-time
code, and the page trades the code here for a token scoped to Fantasy Sports
read. No password or cookie ever reaches Juke.

| Route | Guard | Does |
|---|---|---|
| `POST /yahoo/authorize` | `requireUser()` | the consent URL, with a signed `state` |
| `POST /yahoo/token` | `requireUser()` | code → token, sealed; answers the reader's leagues |
| `GET /yahoo/leagues` | `requireUser()` | the leagues again, from the stored token |
| `DELETE /yahoo/leagues` | `requireUser()` | forget the token, if no connected league still reads through it |
| `GET /yahoo/snapshot` | `originAllowed()` + the caller's token | one league, the same vocabulary as the rest |

### Switching it on — owner only

1. Create an app at <https://developer.yahoo.com/apps/create/>: **Web
   Application**, redirect URI **`https://jukeff.com/connect/yahoo`**, API
   permission **Fantasy Sports → Read**. The redirect URI must match exactly;
   the return page lives at that path and may not move.
2. Put the two values on the worker:

   ```bash
   wrangler secret put YAHOO_CLIENT_ID -c worker/wrangler.toml
   wrangler secret put YAHOO_CLIENT_SECRET -c worker/wrangler.toml
   ```

3. `LEAGUE_CRED_KEY` must already be set (see Private leagues above) and
   `0011` applied: the token is sealed exactly like an ESPN or CBS credential,
   and without a key every Yahoo route answers `private-unavailable` before
   Yahoo is involved. With no client id and secret they answer
   `not-configured`, and the dialog says Yahoo is not switched on.

`YAHOO_API_BASE`, `YAHOO_AUTH_BASE` and `YAHOO_REDIRECT_URI` exist to point
the worker at a stub; nothing sets them in production.

### Three decisions

**One token per ACCOUNT, stored under `league_id = "*"`.** ESPN's and CBS's
credentials are per league because they are pasted per league. A Yahoo grant
is per person and reads every league they are in, and Yahoo may hand back a
new refresh token when an old one is spent — copies per league would each go
stale on their own. So a Yahoo connect writes the league row and nothing else,
and disconnecting the **last** Yahoo league is what deletes the token.

**The `state` binds a consent to the account that asked.** Without it,
somebody could start a connect on their account, send the consent link to a
victim, and read the victim's Yahoo leagues from their own account once the
victim approved. `state` carries a hash of the account, an expiry and a nonce,
HMAC-signed with the client secret, and `/yahoo/token` refuses a code whose
state names a different account — **before** the code is sent to Yahoo. It
also carries the origin the reader started on, because `www.jukeff.com`
serves the site as its own origin and Yahoo can only return a reader to the
one registered address.

**Scoring is matched by the category's NAME, not its id.** The league's own
settings print a name beside every stat id, and nothing here has been checked
against a real Yahoo league yet — so an id table would be a table of guesses,
and a wrong id scores the wrong category in silence. A name this does not
recognise is reported in `scoringUnmapped` instead.

### What is not measured yet

**Everything about a league payload.** It is written against Yahoo's
published format, and the readers in `yahoo-json.js` accept both the array
and numbered-object forms Yahoo uses interchangeably so a wrong guess about a
node cannot silently drop it. That is why `leaguePlatforms.js` marks Yahoo
`beta` rather than `live`: the dialog offers it only to a browser that has set
`localStorage["juke.beta.yahoo"] = "1"`. Read a real league through it,
compare every roster, score and lineup against Yahoo's own screen, then flip
`live`.

Yahoo's public API publishes no per-player projection, so a Yahoo league's
rooms use Juke's own projection under the league's scoring, and say so.
Transactions, the draft board and played-week box scores are not read yet.

### Testing it

```bash
node worker/test-yahoo.mjs   # offline; Node 22.13+ for node:sqlite
```

The adapter half runs against fixtures in Yahoo's published shape. The route
half runs the real router, `requireUser()`, `credentials.js` and `store.js`'s
own SQL against a real SQLite database built from `migrations/` with foreign
keys on, and fakes only Yahoo — an OAuth endpoint that checks the client's
Basic auth and a Fantasy API that checks the bearer. Every mutation of the
state binding, the refresh, the grant deletion, the scoring names and the
schedule dedupe was confirmed red.

## The cache database

D1, bound as `DB`, created as `juke_db`. Two tables that matter and one that
looks like bookkeeping and is not.

**It is a cache and never a source of truth.** `players.js` and `stats.js` are
still the board, still generated nightly by `scripts/build_players.py`, and a
room still pins the version it started on because the CPU wobble reads a
player's position in that array. A board built out of D1 instead would be the
league shape written down twice, in the one place where two clients disagreeing
forks a live draft. The worker reads these tables; the page never does.

**Nothing depends on it existing.** Every function in `store.js` returns early
on a missing `env.DB`, so `wrangler dev` with no `database_id`, and the whole
existing test suite, behave exactly as they did. That is what lets
`test-sockets.mjs` still pass 87 assertions without a database anywhere.

### The three tiers in front of Tank01

`/news` now asks three things in order, and each exists for a different reason:

1. **`caches.default`, fifteen minutes** — the *freshness* tier. Per
   colocation and evictable, so on its own the worst case is an upstream call
   per player per quarter hour per data centre.
2. **D1, twelve hours (`NEWS_DB_TTL`)** — the *quota* tier. One database,
   global, durable. This is the one that makes a thousand calls a month work:
   it caps the spend at two calls per player per day for everybody at once,
   which is about sixteen distinct players a day across a month. A D1 hit fills
   the edge cache on the way past.
3. **The provider**, and only then.

`x-juke-cache` says which answered: `hit`, `db` or `miss`.

**A cache hit has to be indistinguishable from a miss, and that took three
goes.** `usableNews()` in `store.js` is the single normalisation both paths run
— the same filter, the same dedup, the same ordering — because the divergences
each hid somewhere different: an unlinkable card dropped on the way into the
database but not on the way out of the provider; the feed's duplicate story
deduped by the primary key but not by the response; and the response in the
provider's order against a read-back sorted newest-first. Nobody would call any
of those wrong on its own, and a developer with a warm cache and a developer
with a cold one would see different pages and both look right. `published_text`
exists for the same reason: `timestamp` is for `ORDER BY` and the text is what
the card draws, and reformatting the integer for display would have been a
fourth one.

**An error is never stored; an empty answer is.** "He has no news today" is a
fact worth keeping and re-asking for it would spend the allowance on exactly
the players who have nothing — which is what `news_lookups` is for, because an
empty answer writes zero rows to `player_news` and that is indistinguishable
from never having asked. Verified by taking the stub down and confirming a
known-empty player still answers `db` with `items: []` and no `error`.

**The licence rule is in the schema.** `content` is a clipped summary with a
`CHECK (length(content) <= 400)`, `source` cannot be empty, and the url must be
http(s). We link and attribute; we do not republish, and a column that will not
physically hold an article body cannot quietly start holding one.

### The pool sync

`[triggers] crons = ["30 11 * * *"]`, half an hour after the Python pipeline, on
`scheduled()` — **armed as of the ESPN change above**, which is the first thing
that ever read this table. Measured on a real run: **4385 rows**, all 32 team
defenses named correctly (4,388 on the 5 September 2026 pool). It upserts and never deletes — a player who has left the league is a
row whose `last_updated` stopped moving, not a row to remove — so a
half-succeeded fetch cannot empty the table.

**`position` is Sleeper's own value and is not the set the sync admits on.** A
row gets in if either `position` or `fantasy_positions` names a position we
draft, so 111 fullbacks are stored as `FB`, plus a few punters and corners
Sleeper tags loosely. `WHERE position IN ('QB','RB',…)` therefore returns fewer
rows than the table holds. The alternative — storing the qualifying fantasy
position — would make the column filterable and make this table disagree with
every other Sleeper-keyed thing in the project.

**CPU is the open question.** The Sleeper pool is about five megabytes and
`res.json()` parses all of it, which is real CPU rather than the I/O the plan
limits are generous about. If it trips, the fix is not to tune the parse —
there is no streaming parser without a dependency, which this project does not
add. It is to move the sync into `build_players.py`, which already fetches this
exact endpoint every morning where CPU is free, and write through D1's HTTP
API. Read the CPU time on a real run before deciding.

### Running it

```bash
cd worker
wrangler d1 migrations apply juke_db --local     # local sqlite, no account
wrangler d1 migrations apply juke_db --remote    # the real database
```

`--local` needs no account and no `database_id`; `--remote` needs the real id in
`wrangler.toml`, which `wrangler d1 info juke_db` prints. Trigger the cron
locally with `curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled"`, and note
the response returns immediately because the work is in `waitUntil` — read the
log line, not the status code.

A local key goes in `worker/.dev.vars`, which is gitignored:

```
TANK01_KEY = "…"
GIPHY_KEY = "…"
CLERK_SECRET_KEY = "…"
```

**`--var` on the command line works and a stale `workerd` will make you think
it does not.** `wrangler dev` leaves `workerd.exe` processes behind when its
parent is killed, two can hold port 8787 at once, and the old one answers — so
a route came back `configured: false` with the key visibly bound in the new
process's own startup log. Check `netstat -ano | grep :8787` before believing a
binding is missing.

## Not done yet

Every item this list used to carry has since shipped, and the list stood
unchanged long enough to describe a worker that no longer existed — a
`chooseFor()` that is not in this file any more, an `app.js` that "does not
know rooms exist yet", unstored chat, an unwired GIPHY. Checked before
rewriting rather than assumed: `hostPick()` in `room.js` is the answer to the
first (the host's browser is the CPU, because the board is a megabyte the
worker does not have), and the other three are plainly in the code.

What is actually open:

- **The signed-in path has no automated coverage anywhere.**
  `test-auth.mjs` proves every way of being *signed out* is refused cleanly,
  and nothing offline can produce a token Clerk would sign. That gap is
  exactly where the `verifyToken` bug above lived for as long as it did.
- **Room creation is unlimited.** Actions within a room are rate limited
  (forty per socket per ten seconds); creating rooms is not, and that belongs
  on the edge rather than in the room.

A roadmap for the product rather than this worker — the five rooms that are
not built, auction drafts — lives in the repository's own `CLAUDE.md`.
