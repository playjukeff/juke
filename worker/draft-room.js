/* ==========================================================
   Juke — the Durable Object behind an invite link

   One of these exists per draft room. The link a manager copies
   ends in the room's name, Cloudflare routes everyone with that
   link to this same object, and it is the only thing that
   decides what happened.

   It is deliberately thin. The rules are in draft-engine.js and
   the room is in room.js, both of which are pure and both of
   which the browser also loads — that is the whole point. Two
   managers clicking the same player a tenth of a second apart
   get one answer because there is one referee running one copy
   of the rules.

   What lives here and nowhere else:
     - sockets, and who is on the other end of each
     - storage, so a room survives the object being evicted
     - the alarm, so a clock still expires with nobody watching

   Deploying needs Node and wrangler. See worker/README.md.
   ========================================================== */

// Only the room; the engine reaches the worker through it. Both are pure,
// and the browser loads the same two files.
import Room from "../room.js";

/* The D1 cache. Every function in there answers "no" to a missing binding
   rather than throwing, so this file works unchanged with no database — which
   is what keeps `wrangler dev --local` and the keyless news test running. */
import {
  syncPlayerPool, cachedNews, storeNews, usableNews, storeSignup, touchUser, deleteUserData,
  getSavedDraft, putSavedDraft, deleteSavedDraft,
  listDraftHistory, putHistoryEntry, deleteHistoryEntry,
  listLeagues, putLeague, deleteLeague, selectLeague, resolveSleeperIds,
  refreshLeagueCache, getTier, LEAGUE_CAP
} from "./store.js";

/* Sleeper, read-only. Kept out of store.js for the same reason auth.js is:
   that file owns D1 and nothing else, this owns "what does Sleeper say"
   and nothing else, and the two meet in a route handler rather than
   reaching into each other. */
import { lookupUser, leagueSnapshot, nflState, SNAPSHOT_TTL, SLEEPER_API } from "./sleeper.js";
import {
  lookupLeague as espnLookupLeague,
  leagueSnapshot as espnLeagueSnapshot,
  ESPN_API
} from "./espn.js";

/* Clerk session verification — see that file's own header for the shape.
   Kept separate from store.js on purpose: that file owns D1 and nothing
   else, this owns "who sent this request" and nothing else, and the two
   meet only in the route handler below, the same way the room's own rules
   (draft-engine.js) and its storage (this file) meet in DraftRoom rather
   than either one reaching into the other. */
import { verifiedUser } from "./auth.js";
/* Clerk signs its webhooks to the Standard Webhooks spec, and this is the
   library it uses itself — it arrives as a transitive dependency of
   @clerk/backend, and worker/package.json names it directly anyway so it
   cannot vanish under us when that package reorganises its own deps.

   Pure JavaScript (@stablelib/base64 and fast-sha256, with its own
   constant-time compare), which is why it runs here at all: the Workers
   runtime has no node:crypto, and a verifier that reached for one would
   fail at the edge rather than in a test. Checked before it was chosen. */
import { Webhook } from "standardwebhooks";

/* How long after the last socket closes before the room is forgotten. Long
   enough that a phone locking, a tunnel, or closing a laptop for lunch does
   not destroy a draft; short enough that abandoned rooms do not accumulate
   forever. */
const IDLE_MS = 6 * 60 * 60 * 1000;   // six hours

/* What one socket may send, and how often.

   Nothing was limited: a script could open a socket and write chat until the
   room hit its storage ceiling, and every message is a Durable Object write
   plus a broadcast to everyone else in the draft.

   Forty actions per ten seconds is four a second sustained, which no person
   reaches. Typing is already throttled to one message every two seconds by
   the client, a pick happens once a turn, and the fastest real thing anyone
   does is press a reaction a few times. The limit is deliberately far above
   a real ten-person draft, because a limit that fires during somebody's
   draft is worse than the abuse it prevents.

   Counted per connection and held in memory rather than in storage: writing
   a counter to disk on every message would cost more than the messages do,
   and a limit that resets when the object is evicted is still a limit.
   Someone determined can reconnect — that is a job for a Cloudflare rate
   limiting rule on the edge, not for the room. */
const RATE_WINDOW_MS = 10000;
const RATE_MAX = 40;

export class DraftRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sockets = new Map();          // WebSocket -> member id
    this.room = null;
  }

  async load() {
    if (!this.room) this.room = await this.ctx.storage.get("room");
    return this.room;
  }

  async save() {
    await this.ctx.storage.put("room", this.room);
    await this.ctx.storage.put("touched", Date.now());
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/state")) {
      await this.load();
      if (!this.room) return json({ error: "no-such-room" }, 404);
      return json(Room.viewFor(this.room, null, Date.now()));
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    await this.accept(pair[1], url);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async accept(socket, url) {
    socket.accept();

    const member = url.searchParams.get("member");
    const name = url.searchParams.get("name");
    const dataVersion = url.searchParams.get("data");

    await this.load();

    if (!this.room) {
      /* First person through the door creates the room from the settings on
         their setup screen, and becomes its host. Everyone after gets the
         room as it already is — their own settings are ignored rather than
         merged, because a draft cannot be half twelve-team. */
      const league = safeJson(url.searchParams.get("league"));
      if (!league || !league.teams) {
        return this.reject(socket, "bad-league");
      }
      this.room = Room.create({
        league: league,
        seed: Math.floor(Math.random() * 1000000),
        dataVersion: dataVersion,
        clockLength: Number(url.searchParams.get("clock") || 60),
        host: member
      });
    } else if (dataVersion && this.room.dataVersion &&
               dataVersion !== this.room.dataVersion) {
      /* The generated player list is rebuilt nightly, and the CPU wobble
         reads a player's position on the board. Someone who loaded the page
         after a rebuild would compute different CPU picks from everyone
         else and drift apart inside a round, so they are turned away with
         something they can act on rather than silently desynced. */
      return this.reject(socket, "stale-data", {
        roomVersion: this.room.dataVersion,
        yourVersion: dataVersion
      });
    }

    this.sockets.set(socket, member);

    /* Asked of the member list rather than of the seats. A drop frees the
       chair in the lobby, so "had no seat a moment ago" is true of somebody
       coming straight back as well as of somebody arriving — and since the
       page now reconnects by itself, that is every time a phone is put down.
       The record outlives the connection precisely so this can tell them
       apart. */
    const knew = !!(this.room.members && this.room.members[member]);
    const joined = Room.join(this.room, { member, name }, Date.now());
    this.room = joined.state;

    // Only for somebody actually new. A refresh reconnects and would
    // otherwise announce the same person every time their train moved.
    const seat = Room.seatOf(this.room, member);
    if (!knew && seat >= 0) {
      // The cleaned name, not the one off the query string: this goes into a
      // stored line that everybody's browser will draw.
      this.room = Room.announce(this.room,
        (Room.cleanName(name) || "A manager") + " took seat " + (seat + 1), Date.now());
    }
    await this.save();

    socket.addEventListener("message", (event) => this.onMessage(socket, event));
    socket.addEventListener("close", () => this.onClose(socket));
    socket.addEventListener("error", () => this.onClose(socket));

    this.broadcast();
    await this.scheduleAlarm();
  }

  /* One socket, and it may already be gone.

     send() and relay() have always wrapped their sends, because a socket can
     die between the moment it is listed and the moment it is written to. The
     single-socket sends did not, and a WebSocket is *most* likely to be dead
     on exactly these paths: a refusal happens milliseconds after the upgrade,
     to a client that had a reason to give up. A page reconnecting in a loop -
     which live.js does on purpose - produced one uncaught "Network connection
     lost" per attempt, and an uncaught error in a Durable Object is not free
     noise: it fills the log the next real fault has to be found in.

     Silence is the right answer. The client we are trying to tell has already
     stopped listening, and there is no one else to inform. */
  tell(socket, payload) {
    try { socket.send(JSON.stringify(payload)); } catch (err) { this.sockets.delete(socket); }
  }

  reject(socket, code, detail) {
    this.tell(socket, { type: "rejected", code, detail });
    try { socket.close(1008, code); } catch (err) {}
  }

  /* True when this socket has had its allowance for the moment.

     A sliding count rather than a token bucket, because the window is short
     and the arithmetic should be obvious to whoever reads it next. */
  overRate(socket) {
    const now = Date.now();
    const seen = socket.__rate || { from: now, count: 0 };
    if (now - seen.from > RATE_WINDOW_MS) { seen.from = now; seen.count = 0; }
    seen.count++;
    socket.__rate = seen;
    return seen.count > RATE_MAX;
  }

  async onMessage(socket, event) {
    const member = this.sockets.get(socket);
    const msg = safeJson(event.data);
    if (!msg || !member) return;

    /* Refused, not disconnected. A client with a runaway loop should lose the
       message rather than the draft, and the rejection is the thing that
       tells it to stop. Checked before the message is even parsed for meaning,
       so a flood costs one comparison rather than a storage write. */
    if (this.overRate(socket)) {
      this.tell(socket, { type: "rejected", code: "too-fast" });
      return;
    }

    const now = Date.now();
    let result;

    /* Typing is the one thing that does not go through the room.

       It is true for about two seconds and then it is a lie, so storing it
       would mean a Durable Object write per keystroke to record something
       nobody will ever want to replay. It is relayed to the other sockets and
       forgotten — which also means it simply does not exist for anyone whose
       connection has dropped, and that is the right answer.

       The seat is looked up here rather than taken from the message, because
       a client saying "seat 4 is typing" about somebody else is not a claim
       worth honouring. */
    if (msg.type === "typing") {
      const seat = Room.seatOf(this.room, member);
      if (seat < 0) return;
      const name = (this.room.seats[seat] || {}).name || null;
      this.relay(socket, { type: "typing", seat, name, on: msg.on !== false });
      return;
    }

    switch (msg.type) {
      case "claim-seat":
        result = Room.claimSeat(this.room, { member, seat: Number(msg.seat) });
        break;
      // The host putting the room in draft order. Two seat indices and
      // nothing else — see the note on Room.swapSeats.
      case "swap-seats":
        result = Room.swapSeats(this.room, { member, a: msg.a, b: msg.b });
        break;
      case "start":
        result = Room.start(this.room, { member }, now);
        if (!result.error) result.state = Room.announce(result.state, "The draft has begun.", now);
        break;
      case "pick":
        result = Room.submitPick(this.room, { member, key: msg.key, now });
        break;
      case "auto":
        // The host standing in for an empty chair or an expired clock. The
        // room checks it is really the host and really an auto seat.
        result = Room.hostPick(this.room, { member, key: msg.key, now });
        break;
      case "pause":
        result = Room.pause(this.room, { member }, !!msg.on);
        break;
      case "chat":
        result = Room.say(this.room, {
          member, text: msg.text, gif: msg.gif, replyTo: msg.replyTo, now
        });
        break;
      case "rename":
        result = Room.rename(this.room, { member, name: msg.name });
        break;
      case "react":
        result = Room.react(this.room, { member, id: Number(msg.id), emoji: msg.emoji });
        break;
      // A voice clip or a photo, already uploaded through POST /media (see
      // below) — this message only ever carries the URL that came back from
      // that upload, never the bytes themselves. Room.js still checks the
      // URL against MEDIA_HOSTS before storing it, the same way cleanGif()
      // checks a GIF against giphy.com: nothing stops a crafted message
      // naming a URL that never went through the upload route at all.
      case "voice":
        result = Room.sayVoice(this.room, {
          member, url: msg.url, seconds: msg.seconds, replyTo: msg.replyTo,
          mediaHosts: MEDIA_HOSTS, now
        });
        break;
      case "photo":
        result = Room.sayPhoto(this.room, {
          member, url: msg.url, w: msg.w, h: msg.h, replyTo: msg.replyTo,
          mediaHosts: MEDIA_HOSTS, now
        });
        break;
      // Any member, the same as chat — nothing in this file restricts
      // posting a message to the host, and a poll is a message.
      case "poll-create":
        result = Room.createPoll(this.room, {
          member, question: msg.question, choices: msg.choices,
          multi: !!msg.multi, anon: !!msg.anon, durationMs: msg.durationMs,
          replyTo: msg.replyTo, now
        });
        break;
      case "poll-vote":
        result = Room.votePoll(this.room, {
          member, id: Number(msg.id), choice: msg.choice, now
        });
        break;
      default:
        return;
    }

    if (result.error) {
      /* Sent only to the manager who tried it. A rejection is about one
         person's click, and broadcasting it would tell nine other people
         about a mistake that does not concern them. */
      this.tell(socket, { type: "rejected", code: result.error });
      return;
    }

    this.room = result.state;
    await this.save();
    this.broadcast();
    await this.scheduleAlarm();
  }

  async onClose(socket) {
    const member = this.sockets.get(socket);
    this.sockets.delete(socket);
    if (!member) return;

    /* Only if they have no other tab open. Two windows on one draft is a
       normal thing to do and closing one should not hand your seat to the
       CPU. */
    let stillHere = false;
    this.sockets.forEach((m) => { if (m === member) stillHere = true; });
    if (stillHere) return;

    this.room = Room.leave(this.room, { member }).state;
    await this.save();
    this.broadcast();
  }

  /* No CPU picking happens here. The host's browser does it, because the
     board is a megabyte of generated data and shipping it to a Durable
     Object to reproduce an opinion the host already has would be paying
     twice. The worker's job is to say no when the host gets it wrong.

     What the alarm still earns its place for: waking the room when a clock
     expires so every client is told, and forgetting rooms nobody came back
     to. */

  /* One alarm, set for whichever comes first: the current pick expiring, or
     the room going idle. Durable Objects get exactly one, so it is
     recomputed after anything that could change either. */
  async scheduleAlarm() {
    const now = Date.now();
    const left = Room.msLeft(this.room, now);
    const idleAt = now + IDLE_MS;
    const at = left === null ? idleAt : Math.min(now + left, idleAt);
    await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    await this.load();
    if (!this.room) return;

    const touched = (await this.ctx.storage.get("touched")) || 0;
    if (this.sockets.size === 0 && Date.now() - touched > IDLE_MS) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }

    this.broadcast();
  }

  /* Each client gets its own view, because it contains their seat and
     nobody else's member id. */
  broadcast() {
    const now = Date.now();
    this.sockets.forEach((member, socket) => {
      try {
        socket.send(JSON.stringify({
          type: "state",
          room: Room.viewFor(this.room, member, now)
        }));
      } catch (err) {
        this.sockets.delete(socket);
      }
    });
  }

  send(payload) {
    const text = JSON.stringify(payload);
    this.sockets.forEach((member, socket) => {
      try { socket.send(text); } catch (err) { this.sockets.delete(socket); }
    });
  }

  // Everyone but the sender. Being told that you are typing is noise, and
  // with two tabs open it is noise that argues with itself.
  relay(from, payload) {
    const text = JSON.stringify(payload);
    this.sockets.forEach((member, socket) => {
      if (socket === from) return;
      try { socket.send(text); } catch (err) { this.sockets.delete(socket); }
    });
  }
}

/* The routing worker. Everything under /room/<name> goes to the one object
   with that name, which is what makes an invite link work: the name is the
   only thing the link carries. */
/* Origins allowed to call the search below. The room itself does not need
   this — a WebSocket is not subject to CORS — but a plain fetch is, and an
   open proxy is somebody else's GIF quota being spent on your key. */
const ALLOWED = [
  "https://jukeff.com",
  "https://www.jukeff.com"
];

/* Whether this request is from somewhere we serve.

   Split out from corsFor() because the two do different jobs and only one of
   them is security. CORS headers tell a *browser* whether to let the page
   read a response; they do nothing about the request being made, or about a
   client that is not a browser. Withholding the header therefore stopped
   nobody: `curl -H "Origin: https://evil.example"` came back with a full set
   of results and a little more of the GIPHY quota spent. The check below is
   the one that refuses. */
/* Every branch push gets its own preview build at a fresh <hash>.juke-1mw
   .pages.dev address — there is no fixed list of those the way ALLOWED
   above is a fixed list of the real domains, so this is a pattern rather
   than an entry. Scoped to this project's own pages.dev subdomain
   specifically, not *.pages.dev generally, which would accept a request
   from anyone else's Pages project too. */
const PREVIEW_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.juke-1mw\.pages\.dev$/;

function originAllowed(request) {
  const origin = request.headers.get("Origin") || "";
  return ALLOWED.indexOf(origin) >= 0 ||
         /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) ||
         PREVIEW_ORIGIN_RE.test(origin);
}

/* Where a voice or photo message's URL is allowed to point.

   Not the site's own origin (ALLOWED, above) — a media URL is served by
   *this* worker, at whatever host reached it, so a voice clip uploaded
   against `wrangler dev --local` has to validate against 127.0.0.1/localhost
   and one uploaded against the deployed worker has to validate against its
   real host. cleanMediaUrl() in room.js takes this list as a parameter for
   exactly that reason — it cannot hardcode a host the way cleanGif()
   hardcodes giphy.com, because ours varies by deployment and theirs does
   not. */
const MEDIA_HOSTS = ["juke-draft-room.jukeff.workers.dev", "127.0.0.1", "localhost"];

function corsFor(request) {
  const origin = request.headers.get("Origin") || "";
  const ok = originAllowed(request);
  return ok ? { "access-control-allow-origin": origin, "vary": "Origin" } : {};
}

/* GIPHY search, proxied.

   The key lives here and only here. In the page it would be readable by
   anyone who opened dev tools, which is the whole reason this route exists
   rather than the client calling GIPHY directly.

   With no key set it answers honestly rather than erroring: the client shows
   "GIFs are not set up" instead of a search that silently returns nothing. */
async function giphySearch(request, env) {
  const cors = corsFor(request);
  const headers = Object.assign({ "content-type": "application/json" }, cors);

  /* Refused outright, before the key is touched. This is the difference
     between a proxy that a browser will not read from and a proxy that will
     not answer — only the second one protects the quota, because anything
     that is not a browser ignores the first. */
  if (!originAllowed(request)) {
    return new Response(JSON.stringify({ error: "forbidden" }),
                        { status: 403, headers: { "content-type": "application/json" } });
  }

  if (!env.GIPHY_KEY) {
    return new Response(JSON.stringify({ configured: false, results: [] }), { headers });
  }

  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 60);
  if (!q) return new Response(JSON.stringify({ configured: true, results: [] }), { headers });

  const api = "https://api.giphy.com/v1/gifs/search?api_key=" +
              encodeURIComponent(env.GIPHY_KEY) +
              "&q=" + encodeURIComponent(q) +
              "&limit=12&rating=pg-13&bundle=messaging_non_clips";

  try {
    const res = await fetch(api);
    if (!res.ok) throw new Error("giphy " + res.status);
    const body = await res.json();

    // Only what the client draws. Passing GIPHY's whole payload through
    // would hand the page a lot of fields nobody reads and one more thing
    // to keep escaping.
    const results = (body.data || []).map(function (g) {
      const img = (g.images || {}).fixed_height_small ||
                  (g.images || {}).fixed_height || {};
      return { id: g.id, url: img.url || "", w: img.width, h: img.height,
               alt: g.title || "GIF" };
    }).filter((g) => g.url);

    return new Response(JSON.stringify({ configured: true, results }), { headers });
  } catch (err) {
    // A GIF failing is not worth breaking a draft over.
    return new Response(JSON.stringify({ configured: true, results: [], error: true }),
                        { headers });
  }
}

/* Player news, proxied.

   Same shape as the GIPHY route above and for the same reason: the key lives
   here, the origin is refused before the key is touched, and no key answers
   `configured: false` rather than an empty list, so the page can say "not set
   up" instead of showing a panel that is silently always empty.

   Two things are different, and both are about what this content *is*.

   **We normalise rather than pass through.** The client sees `{ title, source,
   at, url, summary }` and nothing else. That is partly the GIPHY argument —
   fewer fields to keep escaping — and partly that the upstream shape is not
   ours to depend on: swapping provider should be a change to one function
   here, not to the sheet.

   **We link, we do not republish.** A headline, a short summary, the source's
   name and a link back to it is what an aggregator may do; reproducing the
   body is what a licence is for. `summary` is cut hard for that reason as
   well as for layout, and `source` is never dropped — an unattributed
   headline is the version of this that is not allowed.

   TANK01_BASE exists so the tests can point this at a local stub. The real
   host is the default and nothing has to be set in production. */
const NEWS_BASE = "https://tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";
const NEWS_MAX = 6;

/* Fifteen minutes. Long enough that a draft — an hour of the same dozen
   players being opened repeatedly — costs one call each rather than dozens,
   and short enough that a Sunday-morning inactive tag still reaches somebody
   drafting that afternoon. The provider updates several times an hour, so
   past this point we would be trading real freshness for savings that are
   already most of the way banked. */
const NEWS_TTL = 900;
const SUMMARY_MAX = 220;

// One upstream call, deliberately isolated. Everything above and below this
// function is ours; this is the only part that knows whose API it is.
async function fetchUpstreamNews(env, playerId, base) {
  const api = base + "/getNFLNews?fantasyNews=true&maxItems=" + NEWS_MAX +
              (playerId ? "&playerID=" + encodeURIComponent(playerId) : "&topNews=true");

  const res = await fetch(api, {
    headers: {
      "x-rapidapi-key": env.TANK01_KEY,
      "x-rapidapi-host": new URL(base).host
    }
  });
  if (!res.ok) throw new Error("news " + res.status);
  const body = await res.json();

  const rows = Array.isArray(body) ? body : (body.body || body.data || []);
  const mapped = (Array.isArray(rows) ? rows : []).map(function (n) {
    const url = String(n.link || n.url || "").slice(0, 400);
    return {
      title: String(n.title || n.headline || "").slice(0, 200),
      summary: String(n.summary || n.description || "").slice(0, SUMMARY_MAX),
      source: sourceName(n, url),
      at: publishedAt(n),
      url: url
    };
  });

  /* One shared normalisation rather than a filter written out here, and the
     reason is in usableNews(): the cache reads its list back through the same
     filter, the same dedup and the same ordering, and any of the three
     differing means a cache hit draws different cards from a cache miss.

     It also drops a `javascript:` link before it is ever sent, which the old
     `n.title && n.url` did not: that let a card the page refuses to build
     travel all the way to the page to be refused. */
  return usableNews(mapped).slice(0, NEWS_MAX);
}

/* Who actually wrote it.

   Measured against the real feed rather than guessed: Tank01 returns a title,
   a link and an image, and no source field of any kind — so the first version
   of this fell back to naming *them* on every card, which is wrong twice over.
   They are the aggregator, not the author, and "TANK01" tells a reader
   nothing about whether to trust the line.

   The link is the honest answer, because the link is where the article
   actually lives. Parsed with URL rather than a regex, for the same reason
   cleanGif() does: a hostname is a structured thing and picking it apart by
   hand is how "espn.com.evil.example" becomes "espn.com". */
function sourceName(row, url) {
  const given = String(row.source || row.provider || "").trim();
  if (given) return given.slice(0, 60);
  try {
    return new URL(url).hostname.replace(/^www\./, "").slice(0, 60);
  } catch (err) {
    return "";
  }
}

/* When it was published, and nothing else.

   This used to fall back to `playerID`, which is not a date and never was —
   so every card on a real sheet read "TANK01 · 4429795". A field that has no
   value is empty; it does not borrow one from whatever else is lying around.
   Anything that does not look like a date is dropped rather than printed. */
function publishedAt(row) {
  const raw = String(row.published || row.date || row.publishedDate || "").trim();
  if (!raw) return "";
  return /\d{4}|\d{1,2}[/-]\d{1,2}/.test(raw) ? raw.slice(0, 40) : "";
}

async function playerNews(request, env, ctx) {
  const cors = corsFor(request);
  const headers = Object.assign({ "content-type": "application/json" }, cors);

  if (!originAllowed(request)) {
    return new Response(JSON.stringify({ error: "forbidden" }),
                        { status: 403, headers: { "content-type": "application/json" } });
  }

  if (!env.TANK01_KEY) {
    return new Response(JSON.stringify({ configured: false, items: [] }), { headers });
  }

  // Whatever id the page holds, bounded. It is echoed into a URL, so it is
  // constrained here rather than trusted to be the id we think it is.
  const playerId = (new URL(request.url).searchParams.get("player") || "")
    .replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);

  /* Served from the edge cache when we have asked recently.

     Without this the provider is called once per sheet opened, and a draft is
     people opening the same dozen players over and over. The free tier is a
     thousand calls a month, so sweeping the board once — 201 players with an
     id — is a fifth of the allowance in one sitting, and two people doing it
     is most of a month. Headlines change hourly at most, so this is close to
     free in freshness and is the difference between the feature being usable
     and being rationed. */
  const cache = caches.default;
  const key = newsCacheKey(playerId);

  const hit = await cache.match(key);
  if (hit) {
    /* Rebuilt rather than returned. The cached entry deliberately carries no
       CORS headers: those depend on who is asking, and handing one origin's
       header to another is how a cache turns a per-request decision into a
       shared one. The body is the only thing worth keeping. */
    return new Response(await hit.text(),
      { headers: Object.assign({}, headers, { "x-juke-cache": "hit" }) });
  }

  /* The second tier, and the one that actually protects the allowance.

     The cache above is the *freshness* tier: fifteen minutes, and per
     colocation, so ten managers in ten cities miss it ten times over, and an
     eviction costs an upstream call whenever it happens. This one is the
     *quota* tier — one database, global, durable, twelve hours — so the worst
     case stops being "once per player per quarter hour per data centre" and
     becomes twice a player a day for everybody at once. On a thousand calls a
     month that is the difference between the feature working and the feature
     being rationed by the middle of the month.

     A D1 hit fills the edge cache on the way past, or every reader in this
     colocation would keep paying for a database round trip to learn something
     the machine they are talking to could have told them. */
  const stored = await cachedNews(env, playerId);
  if (stored) {
    const body = JSON.stringify({ configured: true, items: stored });
    after(ctx, cache.put(key, new Response(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=" + NEWS_TTL
      }
    })));
    return new Response(body,
      { headers: Object.assign({}, headers, { "x-juke-cache": "db" }) });
  }

  try {
    const items = await fetchUpstreamNews(env, playerId, env.TANK01_BASE || NEWS_BASE);
    const body = JSON.stringify({ configured: true, items });

    /* Only a real answer is kept, and an empty one counts: "he has no news
       today" is a fact worth caching, and re-asking for it every time would
       spend the allowance on exactly the players who have nothing. The catch
       below is what must never be cached — pinning an upstream blip for the
       whole TTL would turn a momentary failure into a quarter of an hour of
       silence. That is the same line `configured` already draws between "not
       wired up" and "nothing today". */
    await cache.put(key, new Response(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=" + NEWS_TTL
      }
    }));

    /* Behind the response, not in front of it. A reader is waiting on
       headlines they already have; they are not waiting on a cache whose whole
       job is to make the *next* reader faster, and a database hiccup must not
       turn an answer we successfully fetched into an error. storeNews() catches
       its own failures for the same reason. */
    after(ctx, storeNews(env, playerId, items));

    return new Response(body,
      { headers: Object.assign({}, headers, { "x-juke-cache": "miss" }) });
  } catch (err) {
    /* News failing is not worth breaking a sheet over — the same rule the
       score strip follows. `error: true` is for us; the page draws nothing
       either way. Not cached, deliberately: see above. */
    return new Response(JSON.stringify({ configured: true, items: [], error: true }),
                        { headers });
  }
}

/* The cache key, built rather than taken from the request.

   `caches.default` keys on the whole URL, and the real one carries an Origin
   header and could carry anything else a client appends. A canonical key means
   one entry per player rather than one per (player, however-you-asked), which
   is the difference between a cache that works and a cache that mostly misses.

   The host is not a real one and is never fetched; it exists because the Cache
   API wants a Request. */
function newsCacheKey(playerId) {
  return new Request("https://juke-news-cache.invalid/player/" +
                     encodeURIComponent(playerId || "none"));
}

/* Voice clips and photo attachments, in R2 rather than anywhere else in
   this worker.

   They do not belong in the room. A Durable Object value has a hard
   ceiling and the whole room — league, picks, chat — is written to it on
   every action; a recording is real binary payload, not the couple of
   hundred lines of text trimChat() bounds the log to. They do not belong in
   D1 either: that database is a cache of somebody else's data (the player
   pool, Tank01 headlines) and never a source of truth of our own, and an
   uploaded photo is the opposite of that — it exists nowhere but here.

   Served back out from `/media/<key>` on this same worker, rather than
   through R2's own public-bucket URL. That is a deliberate choice over the
   more obvious one: a public R2 bucket needs its own manual "make this
   public" step (a dashboard toggle or a connected custom domain) with its
   own security surface, on top of `wrangler r2 bucket create`. Serving it
   ourselves needs nothing extra — the binding is already private by
   default — and keeps every media URL on a host `MEDIA_HOSTS` and
   `cleanMediaUrl()` already know about, the same way a GIF has to be
   giphy.com's own domain and nothing that merely contains the string. The
   object key is 16 random bytes, which is what actually stands in for
   access control here: nobody can list a bucket over this route, and
   nobody can guess a key, so an unlisted URL is exactly as private as an
   unlisted one on any other chat host. */
const MEDIA_KINDS = {
  voice: {
    types: {
      "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a",
      "audio/mpeg": "mp3", "audio/wav": "wav"
    },
    /* Two minutes is a reasonable ceiling on a chat voice note — long
       enough to actually say something about a pick, short enough that
       nobody is recording a podcast into the draft room. Sized in bytes
       from that: Chrome's MediaRecorder defaults `audio/webm;codecs=opus`
       to about 128kbps, so two minutes comes to roughly
       128kbps / 8 * 120s = 1.92MB. 2MB comfortably covers a full-length
       clip at that default and rejects one recorded much longer or at a
       much higher bitrate — VOICE_SECONDS_MAX in room.js is the same two
       minutes, as a label rather than an enforcement, because a client can
       lie about `seconds` but it cannot lie the file past this cap. */
    maxBytes: 2 * 1024 * 1024
  },
  photo: {
    types: {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "image/heic": "heic", "image/heif": "heif"
    },
    /* A 12-megapixel phone camera photo is typically 3-6MB straight off the
       sensor as an unmodified JPEG, and this feature has no resize step of
       its own yet — the file that reaches here is whatever the phone
       produced. 8MB covers that with room, without inviting a full-
       resolution RAW-adjacent file or a screen recording mislabelled as a
       photo. */
    maxBytes: 8 * 1024 * 1024
  }
};

function randomMediaId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* POST /media?kind=voice|photo&room=<code>, body is the raw file.

   Rate limiting is deliberately not added here, for the same reason room
   creation is not rate-limited: that belongs on the edge, not in a worker
   route, and a Cloudflare rate limiting rule can see traffic patterns this
   single request cannot. What this route does own is the origin check —
   before the bucket binding is even looked at, the same order every other
   key- or quota-spending route in this file already follows — and the size
   cap, which is the one thing standing between an open upload endpoint and
   an unbounded R2 bill. */
async function uploadMedia(request, env) {
  const cors = corsFor(request);
  const headers = Object.assign({ "content-type": "application/json" }, cors);

  if (!originAllowed(request)) {
    return new Response(JSON.stringify({ error: "forbidden" }),
                        { status: 403, headers: { "content-type": "application/json" } });
  }

  if (!env.MEDIA) {
    // Not provisioned yet — see worker/README.md. Answered the same shape
    // as a missing GIPHY/Tank01 key: false rather than a thrown error, so a
    // client can say "attachments are not set up" instead of guessing.
    return new Response(JSON.stringify({ configured: false }), { headers });
  }

  const url = new URL(request.url);
  const kind = MEDIA_KINDS[url.searchParams.get("kind")];
  const room = (url.searchParams.get("room") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  if (!kind || !room) {
    return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
  }

  const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = kind.types[contentType];
  if (!ext) {
    return new Response(JSON.stringify({ error: "bad-content-type" }), { status: 415, headers });
  }

  /* Buffered rather than streamed to R2 directly. Both caps top out at a
     few megabytes, comfortably inside a Worker's memory, and buffering is
     what lets the size be checked *before* anything is written — streaming
     the put and aborting partway through would still leave a truncated
     object in the bucket for a client that lied about its length. */
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > kind.maxBytes) {
    return new Response(JSON.stringify({ error: "too-large", maxBytes: kind.maxBytes }),
                        { status: 413, headers });
  }

  const kindName = url.searchParams.get("kind");
  const key = "room/" + room + "/" + kindName + "/" + randomMediaId() + "." + ext;
  await env.MEDIA.put(key, body, { httpMetadata: { contentType: contentType } });

  // Built off this request's own origin rather than a hardcoded production
  // host, so the same code returns a working address under `wrangler dev`
  // and under the real deploy without being told which it is running as —
  // the same trick live.js's own WORKER constant relies on from the other
  // side.
  return new Response(JSON.stringify({ url: new URL(request.url).origin + "/media/" + key }),
                      { headers });
}

/* GET /media/<key>, streamed straight from the binding.

   Deliberately not origin-checked. Reading via <img src> or <audio src> is
   never a CORS-governed request in the first place — CORS decides whether a
   page's *script* may read a response, not whether the browser may paint or
   play it — so refusing an unrecognised Origin here would not stop a page
   embedding one of these anyway, and some browsers omit Origin on a plain
   media fetch regardless, which would 403 a legitimate load. The random key
   is what stands in for access control, the same way the room's own invite
   code does, at a length nobody is going to guess. */
async function serveMedia(env, key) {
  if (!env.MEDIA) return new Response("Not found", { status: 404 });

  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  // The key is 16 random bytes; the same address never names different
  // content, so it can be cached for as long as a browser likes — the same
  // argument CLAUDE.md makes for `immutable` on a `?v=`-stamped asset, true
  // here without that stamp's own trap, because nothing ever overwrites a
  // key once it is written.
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

/* Email capture, proxied to D1.

   Phase 0 of accounts: there is still no login anywhere in Juke and this
   route does not add one. It is a mailing list of one column, so the whole
   job is: refuse an origin we do not serve, refuse an address that is not
   one, and hand the write to storeSignup() — same shape as the two routes
   above, and for the same reason: the origin check happens *before* any
   work, not after.

   Unlike /news and /giphy there is no key to protect here, but a public
   form is a wider target than an invite-only room's proxy routes — anyone
   can POST to it, not just someone already holding a room link. The origin
   check is the only defence today; a rate limit would be the next thing to
   add if this is ever abused (see the note in CLAUDE.md's Security section
   on why the room's own limiter lives on the socket and not here — this
   route has no socket to hang one off yet). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function captureSignup(request, env) {
  const cors = corsFor(request);
  const headers = Object.assign({ "content-type": "application/json" }, cors);

  if (!originAllowed(request)) {
    return new Response(JSON.stringify({ error: "forbidden" }),
                        { status: 403, headers: { "content-type": "application/json" } });
  }

  // Malformed JSON is a 400, not a throw — the same defensive parse
  // safeJson() gives a socket message, just returned rather than dropped,
  // because there is a caller here actually waiting on an answer.
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: "bad-json" }),
                        { status: 400, headers });
  }

  const email = String((body && body.email) || "").trim().slice(0, 254);
  const source = String((body && body.source) || "").trim().slice(0, 64);

  if (!EMAIL_RE.test(email)) {
    return new Response(JSON.stringify({ ok: false, error: "bad-email" }),
                        { status: 400, headers });
  }

  // storeSignup() never throws — a missing or broken DB binding answers
  // false, same as every other function in store.js — so this is a plain
  // read of what happened rather than a try/catch of its own. A failed
  // write is still a 200: the client asked a real question and deserves a
  // real, honest answer rather than an HTTP error code standing in for one.
  const kept = await storeSignup(env, email, source);
  return new Response(JSON.stringify(kept ? { ok: true } : { ok: false, error: "store-failed" }),
                      { headers });
}

/* GET /me — who does the worker think is asking, if anyone.

   The first authenticated route, and deliberately the simplest possible
   one: verify, record that this person was seen, answer. /me/draft and
   /me/history below are what actually save or read anything; both call
   verifiedUser() the same way this does rather than re-deriving "who is
   this" a second time.

   `signedIn: false` is the answer for a missing token, an expired one, a
   forged one and no CLERK_SECRET_KEY configured at all — four different
   situations, one response shape, because a caller only ever needs to
   know whether to treat this visitor as logged in, never why not. */
async function meRoute(request, env, ctx) {
  const cors = corsFor(request);
  const headers = Object.assign({ "content-type": "application/json" }, cors);

  if (!originAllowed(request)) {
    return new Response(JSON.stringify({ error: "forbidden" }),
                        { status: 403, headers: { "content-type": "application/json" } });
  }

  const user = await verifiedUser(request, env);
  if (!user) return new Response(JSON.stringify({ signedIn: false }), { headers });

  // Off the response path, same as storeNews() above: a caller asking "am
  // I signed in" is not waiting on a write succeeding, and a D1 hiccup
  // must not turn a real yes into an error.
  after(ctx, touchUser(env, user.id));

  // Awaited, unlike the touch above: the tier gate a caller renders off
  // this needs a real answer, not an eventually-consistent one. null (D1
  // unreachable, or the tier column not migrated yet) is passed through as
  // null rather than guessed at "free" — see getTier()'s own comment.
  const tier = await getTier(env, user.id);

  return new Response(JSON.stringify({ signedIn: true, userId: user.id, tier }), { headers });
}

/* Both routes below share one shape: refuse the origin, verify the token,
   401 if either fails — and only past that point do they touch D1. A 401
   here (not the `signedIn: false` /me answers with) is deliberate: /me
   exists precisely so a caller can ask "am I logged in" without it being
   an error either way, but a save or a read *needs* somebody signed in to
   mean anything, so the two routes that can actually lose or leak a
   draft draw the harder line. */
async function requireUser(request, env) {
  if (!originAllowed(request)) {
    return { error: new Response(JSON.stringify({ error: "forbidden" }),
                        { status: 403, headers: { "content-type": "application/json" } }) };
  }
  const user = await verifiedUser(request, env);
  if (!user) {
    return { error: new Response(JSON.stringify({ error: "unauthorized" }),
                        { status: 401, headers: Object.assign({ "content-type": "application/json" }, corsFor(request)) }) };
  }
  return { user };
}

// A real save is a couple of hundred names, a league config and two short
// lists (queue, watchlist) — nowhere near this. Sized to reject abuse, the
// same reasoning MEDIA_KINDS' byte caps use, not to constrain a real one.
const DRAFT_BODY_MAX = 200 * 1024;
// History entries additionally carry a frozen Insights report
// (recordHistory()'s own comment), which is bigger but still text — a
// season of them is nowhere near this either.
const HISTORY_BODY_MAX = 400 * 1024;

/* GET/POST/DELETE /me/draft — the one in-progress draft a signed-in
   person has, mirroring SAVE_KEY exactly. The body of a POST is stored
   whole and unopened: see store.js's own note on why this route has no
   opinion about what is inside it, only whose it is. */
async function meDraftRoute(request, env) {
  const { user, error } = await requireUser(request, env);
  if (error) return error;

  const headers = Object.assign({ "content-type": "application/json" }, corsFor(request));

  if (request.method === "GET") {
    return new Response(JSON.stringify({ data: await getSavedDraft(env, user.id) }), { headers });
  }

  if (request.method === "DELETE") {
    const ok = await deleteSavedDraft(env, user.id);
    return new Response(JSON.stringify({ ok }), { headers });
  }

  const text = await request.text();
  if (!text || text.length > DRAFT_BODY_MAX) {
    return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
  } catch (err) {
    return new Response(JSON.stringify({ error: "bad-json" }), { status: 400, headers });
  }

  const ok = await putSavedDraft(env, user.id, text);
  return new Response(JSON.stringify(ok ? { ok: true } : { ok: false, error: "store-failed" }), { headers });
}

/* GET/POST/DELETE /me/history — finished drafts, mirroring HISTORY_KEY.
   GET returns every entry; POST adds or replaces exactly one (the id
   already lives inside the body, minted client-side by recordHistory());
   DELETE removes one by `?id=`. There is no bulk write here on purpose —
   HISTORY_KEY's own writeHistory() rewrites the whole array on every
   change, but the server only ever needs the one entry that changed, and
   sending the other 199 back down every time would be all cost and no
   benefit. */
/* ---------- Sleeper ----------

   Two public reads and one account-scoped write, kept apart for the reason
   the /news route's own comment gives about CORS: a header telling a
   browser whether it may READ a response does nothing about the request
   being made, so originAllowed() runs before anything is fetched rather
   than being left to the browser to enforce.

   Neither read caches an error. "This username does not exist" is a fact
   worth keeping for a moment; "Sleeper was down when we asked" is not, and
   caching it would pin a blip for the whole TTL — the same line
   cachedNews() already draws between the two. */

async function sleeperLookupRoute(request, env) {
  if (!originAllowed(request)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { "content-type": "application/json" }
    });
  }

  const headers = Object.assign({ "content-type": "application/json" }, corsFor(request));
  const url = new URL(request.url);

  /* Sleeper usernames are short. Bounded here rather than trusted, because
     this value is interpolated into an upstream path — encodeURIComponent
     in sleeper.js is what makes that safe, and this is what stops a caller
     using us to send megabytes at somebody else's server. */
  const username = (url.searchParams.get("username") || "").trim().slice(0, 32);
  if (!username) {
    return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
  }

  /* The season Sleeper itself is in, not one derived from the clock.

     A league list is per-season, and in January "this year" and "the
     fantasy season" are different answers — asking for 2027 in the middle
     of the 2026 playoffs returns an empty list and reads to the user as
     "you have no leagues". Sleeper publishes which season it means, so that
     is the one asked for, with the caller able to override for a manager
     looking up an old league. */
  // env.SLEEPER_BASE points the tests at a stub; unset in production.
  const upstream = env.SLEEPER_BASE || SLEEPER_API;
  const state = await nflState(upstream);
  const season = (url.searchParams.get("season") || (state && state.season) || "").slice(0, 8);
  if (!season) {
    // Sleeper unreachable: say so rather than guessing a season and
    // reporting its empty list as "no leagues found".
    return new Response(JSON.stringify({ error: "upstream" }), { status: 503, headers });
  }

  const found = await lookupUser(username, season, upstream);
  return new Response(JSON.stringify(Object.assign({ season }, found)), { headers });
}

async function sleeperSnapshotRoute(request, env) {
  if (!originAllowed(request)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { "content-type": "application/json" }
    });
  }

  const headers = Object.assign({ "content-type": "application/json" }, corsFor(request));
  const url = new URL(request.url);
  const leagueId = (url.searchParams.get("league") || "").trim().slice(0, 40);
  if (!/^[0-9]{6,32}$/.test(leagueId)) {
    return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
  }

  /* Cached at the edge, on a key this route builds rather than the request
     URL. caches.default keys on the whole URL and the real request carries
     an Origin and could carry anything a client appends, which would give
     one entry per way of asking instead of one per league — the same trap
     newsCacheKey() exists for.

     And a cached entry carries no CORS headers: which origin may read a
     response is a per-request decision, so the body is what is kept and the
     headers are put back per request. */
  const cache = caches.default;
  const key = new Request("https://juke.internal/sleeper/snapshot?league=" + leagueId, { method: "GET" });

  const hit = await cache.match(key);
  if (hit) {
    return new Response(await hit.text(), { headers });
  }

  const snapshot = await leagueSnapshot(leagueId, env.SLEEPER_BASE || SLEEPER_API);
  if (!snapshot) {
    // Not cached: a league that did not answer once is not a league that
    // does not exist, and pinning that for two minutes turns a blip into an
    // outage.
    return new Response(JSON.stringify({ error: "not-found" }), { status: 404, headers });
  }

  const body = JSON.stringify(snapshot);
  await cache.put(key, new Response(body, {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=" + SNAPSHOT_TTL }
  }));
  return new Response(body, { headers });
}

/* ---- ESPN ----

   Two routes mirroring the Sleeper pair above, and one thing that is not a
   mirror: a snapshot here has to translate ESPN's player ids into Sleeper's
   before anybody downstream sees it. See espn.js's crosswalk note for why
   that cannot be an id join, and store.js's resolveSleeperIds() for the
   half that reads the pool.

   Neither route needs a token. A public ESPN league is public — asking us
   for it teaches a caller nothing lm-api-reads.fantasy.espn.com would not
   have told them directly — and the origin check is what stops this being a
   general-purpose proxy. Same reasoning the Sleeper pair is written under. */

function espnSeason(url, state) {
  /* The season Sleeper says it is in, not one derived from the clock.

     Two providers, one notion of "now": deriving ESPN's season separately
     would let the app ask ESPN about 2027 while every other screen is on
     2026, which is the "written down twice" failure with a year in it. The
     caller can override for somebody connecting an old league. */
  return (url.searchParams.get("season") || (state && state.season) || "").slice(0, 8);
}

async function espnLookupRoute(request, env) {
  if (!originAllowed(request)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { "content-type": "application/json" }
    });
  }

  const headers = Object.assign({ "content-type": "application/json" }, corsFor(request));
  const url = new URL(request.url);

  /* ESPN league ids are integers and its own API answers 400 for anything
     it cannot parse as one — so this refuses the same shape ESPN does,
     before spending a request finding out. */
  const leagueId = (url.searchParams.get("league") || "").trim().slice(0, 24);
  if (!/^[0-9]{1,12}$/.test(leagueId)) {
    return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
  }

  const state = await nflState(env.SLEEPER_BASE || SLEEPER_API);
  const season = espnSeason(url, state);
  if (!season) {
    return new Response(JSON.stringify({ error: "upstream" }), { status: 503, headers });
  }

  const found = await espnLookupLeague(leagueId, season, env.ESPN_BASE || ESPN_API);
  return new Response(JSON.stringify(Object.assign({ season }, found)), { headers });
}

async function espnSnapshotRoute(request, env, ctx) {
  if (!originAllowed(request)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { "content-type": "application/json" }
    });
  }

  const headers = Object.assign({ "content-type": "application/json" }, corsFor(request));
  const url = new URL(request.url);
  const leagueId = (url.searchParams.get("league") || "").trim().slice(0, 24);
  if (!/^[0-9]{1,12}$/.test(leagueId)) {
    return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
  }

  const state = await nflState(env.SLEEPER_BASE || SLEEPER_API);
  const season = espnSeason(url, state);
  if (!season) {
    return new Response(JSON.stringify({ error: "upstream" }), { status: 503, headers });
  }

  // Same construction as the Sleeper snapshot's key, and the season is part
  // of it: the same league id is a different league year to year.
  const cache = caches.default;
  const key = new Request(
    "https://juke.internal/espn/snapshot?league=" + leagueId + "&season=" + season,
    { method: "GET" }
  );
  const hit = await cache.match(key);
  if (hit) return new Response(await hit.text(), { headers });

  const resolve = (wanted) => resolveSleeperIds(env, wanted);
  const out = await espnLeagueSnapshot(leagueId, season, env.ESPN_BASE || ESPN_API, resolve);

  if (!out.snapshot) {
    /* Not cached, and the reason is passed through rather than flattened
       to a 404: "this league is private" is the one failure here the reader
       can actually act on, and telling them to check the number instead
       would send them to re-read a number that was right. */
    const status = out.reason === "private" ? 403 : out.reason === "not-found" ? 404 : 503;
    return new Response(JSON.stringify({ error: out.reason }), { status, headers });
  }

  /* The pool is what the crosswalk reads, and nothing else has ever read
     it — so on a fresh deployment it is empty until the nightly cron first
     runs, and every roster would come back empty with no explanation.

     Filled off the response path, the same way touchUser() records a visit:
     the reader gets this snapshot as it is, and the next one two minutes
     later has a crosswalk behind it. `crosswalkReady` is what lets the
     screen say "still reading your league" rather than drawing ten empty
     rosters as though that were the answer. */
  if (!out.snapshot.crosswalkReady) {
    after(ctx, syncPlayerPool(env).then((n) => {
      if (n) console.log("player pool filled on demand:", n);
    }));
  }

  const body = JSON.stringify(out.snapshot);
  /* A snapshot taken before the pool existed is not worth keeping for two
     minutes: it is the one the sync above is in the middle of fixing. */
  if (out.snapshot.crosswalkReady) {
    await cache.put(key, new Response(body, {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=" + SNAPSHOT_TTL }
    }));
  }
  return new Response(body, { headers });
}

/* An hour. Long enough that an open tab is not a poller, short enough that
   a draft moved this morning is right by this afternoon. A draft time moves
   rarely and a league name almost never; what this is really bounding is how
   wrong a countdown may be, and an hour of that on a multi-day countdown is
   invisible. */
const LEAGUE_CACHE_TTL = 3600;

function staleLeague(league) {
  /* A league that has drafted has nothing left to refresh: the roster is
     what changes now and that is the snapshot's job, not this cache's. */
  if (league.draftStatus === "complete") return false;
  const seen = Number(league.refreshedAt || league.connectedAt || 0);
  return !seen || (nowSeconds() - seen) > LEAGUE_CACHE_TTL;
}

/* Re-read one league from its own platform and update the cached label.

   Dispatches on provider the same way the connect route does. Answers
   quietly on every failure — this runs after the response has gone, so
   there is nobody left to tell, and an unreachable platform is a stale
   label rather than a fault. */
async function refreshActiveLeague(env, clerkId, league) {
  try {
    if (league.provider === "espn") {
      const state = await nflState(env.SLEEPER_BASE || SLEEPER_API);
      const season = String(league.season || (state && state.season) || "");
      if (!season) return;
      const found = await espnLookupLeague(league.leagueId, season, env.ESPN_BASE || ESPN_API);
      if (!found.league) return;
      await refreshLeagueCache(env, clerkId, Object.assign({}, found.league, {
        provider: "espn",
        leagueId: league.leagueId
      }));
      return;
    }

    const snapshot = await leagueSnapshot(league.leagueId, env.SLEEPER_BASE || SLEEPER_API);
    if (!snapshot) return;
    await refreshLeagueCache(env, clerkId, Object.assign({}, snapshot, {
      provider: "sleeper",
      leagueId: league.leagueId
    }));
  } catch (err) {
    console.error("active league refresh failed:", err && err.message);
  }
}

/* The connection itself, which is the one part that needs an account.

   That is the handoff's own rule — "Connect-league always routes through
   account creation first" — and it is also the only way this can work:
   there is nowhere else to put a connection that follows somebody to
   another device. */
async function meLeaguesRoute(request, env, ctx) {
  const { user, error } = await requireUser(request, env);
  if (error) return error;

  const headers = Object.assign({ "content-type": "application/json" }, corsFor(request));

  if (request.method === "GET") {
    const leagues = await listLeagues(env, user.id);

    /* Keep the active league's cached label honest, off the response path.

       0005 said this happened and it did not — see refreshLeagueCache().
       It matters more now than it did for a name: a rescheduled draft
       counts down to the wrong instant with complete confidence, which is
       worse than a stale league name because it looks like information.

       Only the ACTIVE league, and only when the cache is older than
       LEAGUE_CACHE_TTL, so this is at most one upstream fetch an hour for
       somebody with the app open — not one per connected league per page
       load, which is what put the draft time in this table rather than
       behind a snapshot in the first place.

       The League Room does not depend on this: it draws from a live
       snapshot. What this keeps current is the You screen and the header
       switcher, which read the cache. */
    const active = leagues[0];
    if (active && staleLeague(active)) {
      after(ctx, refreshActiveLeague(env, user.id, active));
    }

    return new Response(JSON.stringify({ leagues }), { headers });
  }

  /* PATCH — switch which connected league is the active one.

     A separate verb from POST because it is a different request. POST
     means "connect this league", and it re-reads the label from Sleeper
     and validates the id upstream to do it. Switching is about a league
     this account has already connected: there is nothing to fetch, nothing
     to validate against Sleeper, and asking it again would put an upstream
     round trip behind a menu press.

     The id is not checked against Sleeper's shape here for the same
     reason. selectLeague()'s WHERE is scoped by clerk_id, so the only ids
     that can do anything are ones this account already connected — which
     were validated on the way in — and a provider that is not Sleeper is a
     row this table is designed to hold. */
  if (request.method === "PATCH") {
    const text = await request.text();
    if (!text || text.length > 4096) {
      return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
    }
    let patch;
    try {
      patch = JSON.parse(text);
    } catch (err) {
      return new Response(JSON.stringify({ error: "bad-json" }), { status: 400, headers });
    }

    const wantId = String((patch && patch.leagueId) || "").slice(0, 40);
    const wantProvider = String((patch && patch.provider) || "sleeper").slice(0, 16);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(wantId) || !/^[a-z]{1,16}$/.test(wantProvider)) {
      return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
    }

    const switched = await selectLeague(env, user.id, wantProvider, wantId);
    if (!switched) {
      /* Nothing matched, or 0006 has not been applied. Both mean the
         switch did not take, and answering ok would leave the page showing
         a league that is not the one it would come back to. 409 rather
         than 404: the league may well exist, it is this account's
         connection to it that does not. */
      return new Response(JSON.stringify({ ok: false, error: "not-connected" }), { status: 409, headers });
    }
    return new Response(JSON.stringify({ ok: true, leagues: await listLeagues(env, user.id) }), { headers });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const provider = (url.searchParams.get("provider") || "sleeper").slice(0, 16);
    const leagueId = (url.searchParams.get("league") || "").slice(0, 40);
    if (!leagueId) {
      return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
    }
    const ok = await deleteLeague(env, user.id, provider, leagueId);
    return new Response(JSON.stringify({ ok }), { headers });
  }

  const text = await request.text();
  if (!text || text.length > 4096) {
    return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch (err) {
    return new Response(JSON.stringify({ error: "bad-json" }), { status: 400, headers });
  }

  const leagueId = String((body && body.leagueId) || "").slice(0, 40);
  if (!/^[0-9]{6,32}$/.test(leagueId)) {
    return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
  }

  /* Which platform, defaulting to the one that was the only one.

     Every connect posted before ESPN existed carried no provider at all, so
     the default is not a convenience — it is what keeps those requests
     meaning what they meant. Checked against the list rather than stored as
     sent, because this value is a primary key column and a caller could
     otherwise invent a provider nothing can ever read back. */
  const provider = String((body && body.provider) || "sleeper").slice(0, 16);
  if (provider !== "sleeper" && provider !== "espn") {
    return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
  }

  /* The label is re-read from the platform rather than taken from the client.

     What the browser posted is what its own picker was showing, which came
     from us a moment ago — but trusting it would let a caller store any
     string as a league name, and that string is then drawn in the header of
     every page they load. Asking again costs one cached call and means the
     name in the chip is the league's own.

     It also validates the id: a league that does not resolve cannot be
     connected, which is a better failure than a chip pointing at nothing. */
  let league = null;
  let failure = "not-found";

  if (provider === "espn") {
    const state = await nflState(env.SLEEPER_BASE || SLEEPER_API);
    const season = String((body && body.season) || (state && state.season) || "").slice(0, 8);
    if (!season) {
      return new Response(JSON.stringify({ ok: false, error: "upstream" }), { status: 503, headers });
    }
    const found = await espnLookupLeague(leagueId, season, env.ESPN_BASE || ESPN_API);
    if (found.league) {
      /* ESPN has no account to infer the reader's team from, so the dialog
         asks and posts it. Checked against the league's own teams rather
         than stored as sent: an ownerId naming a team that is not in this
         league is a roster no screen can ever find, which renders as a
         connected league with nothing in it. */
      const teamId = String((body && body.ownerId) || "").slice(0, 16);
      const known = found.league.teams.some((t) => t.teamId === teamId);
      league = {
        provider: "espn",
        leagueId: found.league.leagueId,
        ownerId: known ? teamId : null,
        name: found.league.name,
        season: found.league.season,
        totalTeams: found.league.totalTeams
      };
    } else {
      failure = found.reason || "not-found";
    }
  } else {
    const snapshot = await leagueSnapshot(leagueId, env.SLEEPER_BASE || SLEEPER_API);
    if (snapshot) {
      league = {
        provider: "sleeper",
        leagueId: snapshot.leagueId,
        ownerId: String((body && body.ownerId) || "").slice(0, 40) || null,
        name: snapshot.name,
        season: snapshot.season,
        totalTeams: snapshot.totalTeams
      };
    }
  }

  if (!league) {
    // 403 for a private ESPN league: it exists, and the reader can fix it.
    const status = failure === "private" ? 403 : 404;
    return new Response(JSON.stringify({ ok: false, error: failure }), { status, headers });
  }

  /* The tier gate. Checked here rather than before resolving the league so
     a bad id still fails on "not found" first — the same ordering the
     validation above already follows.

     A refresh of a league this account already holds is not a new
     connection and must not trip the cap, which is why the count excludes
     it rather than just comparing against the raw cap. getTier() returning
     null means the question could not be answered (D1 unreachable, or this
     migration not applied yet) rather than that the account is free, and
     the gate fails OPEN on that — refusing a real connect because of an
     infra hiccup is a worse failure than letting one through uncapped for
     a moment. */
  const tier = await getTier(env, user.id);
  if (tier !== null) {
    const cap = LEAGUE_CAP[tier] ?? 0;
    const already = await listLeagues(env, user.id);
    const isRefresh = already.some((l) => l.provider === provider && l.leagueId === leagueId);
    if (!isRefresh && already.length >= cap) {
      return new Response(JSON.stringify({ ok: false, error: "tier-limit", tier, cap }), { status: 403, headers });
    }
  }

  const ok = await putLeague(env, user.id, league);

  /* A league somebody just connected is the one they want to look at.

     Not merely convenient: without it, connecting a second league would
     store it and leave the app showing the first, so the connect flow
     would end in a confirmation followed by no visible change — the exact
     complaint useLeague.js was rewritten to fix, arriving from a new
     direction.

     It is deliberately not part of putLeague(): that function writes no
     0006 column, so a connect against an unmigrated database still stores
     the league and only this fails. Which is why the answer below ignores
     it — under the pre-0006 ordering a freshly connected league is already
     the head, so the switch failing changes nothing a reader can see. */
  if (ok) await selectLeague(env, user.id, league.provider, league.leagueId);

  return new Response(
    JSON.stringify(ok ? { ok: true, league } : { ok: false, error: "store-failed" }),
    { headers }
  );
}

async function meHistoryRoute(request, env) {
  const { user, error } = await requireUser(request, env);
  if (error) return error;

  const headers = Object.assign({ "content-type": "application/json" }, corsFor(request));

  if (request.method === "GET") {
    return new Response(JSON.stringify({ entries: await listDraftHistory(env, user.id) }), { headers });
  }

  if (request.method === "DELETE") {
    const id = (new URL(request.url).searchParams.get("id") || "").slice(0, 64);
    if (!id) return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
    const ok = await deleteHistoryEntry(env, user.id, id);
    return new Response(JSON.stringify({ ok }), { headers });
  }

  const text = await request.text();
  if (!text || text.length > HISTORY_BODY_MAX) {
    return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return new Response(JSON.stringify({ error: "bad-json" }), { status: 400, headers });
  }
  const id = String((parsed && parsed.id) || "").slice(0, 64);
  // completedAt is milliseconds (Date.now(), recordHistory()'s own
  // field) and every D1 timestamp in this project is epoch seconds
  // (nowSeconds()) — converted once, here, rather than asking store.js
  // to know which unit a caller meant.
  const completedAtMs = Number((parsed && parsed.completedAt) || 0);
  if (!id || !completedAtMs) {
    return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers });
  }

  const ok = await putHistoryEntry(env, user.id, id, text, Math.floor(completedAtMs / 1000));
  return new Response(JSON.stringify(ok ? { ok: true } : { ok: false, error: "store-failed" }), { headers });
}

/* POST /webhooks/clerk — Clerk telling us an account is gone.

   Clerk owns the account; this is the half Juke owns. Without it, deleting
   a Clerk account left the drafts stored against it behind for ever, which
   the privacy policy said out loud rather than pretending otherwise.

   ---- Three things about this route are not like the others ----

   **originAllowed() must not be applied to it.** Every other route here
   refuses a caller whose Origin is not ours, which is right for a browser
   and wrong for a server: Clerk posts from its own infrastructure and
   sends no Origin header at all, so the check that protects the rest of
   the worker would reject every real delivery and accept nothing else.
   What replaces it is the signature, which is a stronger claim anyway —
   an allowed Origin is a request that came from our page, a valid
   signature is a request that came from Clerk.

   **A missing secret is a refusal, not a shrug.** Everywhere else in this
   worker an unconfigured binding answers "no" quietly and the product
   carries on — the D1 cache, GIPHY, Tank01. That contract is exactly wrong
   here, twice over: honouring an unverified delete would let anybody
   delete anybody's drafts, and answering 200 without acting would tell
   Clerk the delivery succeeded so it would never retry, losing the
   deletion silently. A 500 is the honest answer: nothing was done, say so,
   and Clerk redelivers once the secret exists.

   **It is idempotent on purpose.** Clerk retries anything it does not hear
   back from, so the same deletion can arrive twice; deleteUserData() is
   DELETE-only and a delete of nothing is a success.

   Events other than user.deleted are acknowledged and ignored. Clerk sends
   whatever the endpoint is subscribed to, and a 200 for "understood, not
   for me" keeps a misconfigured subscription from turning into an endless
   retry loop against a route that will never care. */
async function clerkWebhook(request, env) {
  const json = { "content-type": "application/json" };

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method" }), { status: 405, headers: json });
  }

  if (!env.CLERK_WEBHOOK_SECRET) {
    console.error("clerk webhook: no CLERK_WEBHOOK_SECRET configured, refusing");
    return new Response(JSON.stringify({ error: "not-configured" }), { status: 500, headers: json });
  }

  // The raw text, not a re-serialised object: the signature is over the
  // exact bytes Clerk sent, and JSON.parse(...)+JSON.stringify(...) is not
  // guaranteed to reproduce them.
  const body = await request.text();
  let event;
  try {
    event = new Webhook(env.CLERK_WEBHOOK_SECRET).verify(body, {
      "webhook-id": request.headers.get("svix-id") || request.headers.get("webhook-id") || "",
      "webhook-timestamp": request.headers.get("svix-timestamp") || request.headers.get("webhook-timestamp") || "",
      "webhook-signature": request.headers.get("svix-signature") || request.headers.get("webhook-signature") || ""
    });
  } catch (err) {
    // Deliberately terse to the caller and specific in the log. An
    // unverified request is told nothing about why, and we are told
    // everything — the same split the room's own refusals already keep.
    console.error("clerk webhook: signature rejected:", err && err.message);
    return new Response(JSON.stringify({ error: "bad-signature" }), { status: 400, headers: json });
  }

  if (!event || event.type !== "user.deleted") {
    return new Response(JSON.stringify({ ok: true, ignored: (event && event.type) || null }), { headers: json });
  }

  const clerkId = event.data && event.data.id;
  if (!clerkId) {
    console.error("clerk webhook: user.deleted with no id");
    return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers: json });
  }

  const ok = await deleteUserData(env, clerkId);
  if (!ok) {
    // 500 so Clerk retries. A deletion that failed and reported success is
    // the one outcome this route must never produce.
    return new Response(JSON.stringify({ ok: false, error: "store-failed" }), { status: 500, headers: json });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: json });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* Before the /me routes and outside their CORS handling entirely — a
       webhook has no preflight and no Origin. See the route's own note. */
    if (url.pathname === "/webhooks/clerk") return clerkWebhook(request, env);

    /* Sleeper lookup and snapshot. Both are reads of public data and
       neither is account-scoped, so they take originAllowed() and not
       requireUser() — the same line /news draws. A signed-out visitor
       cannot reach them from the app (nothing offers the control), and if
       they could, they would learn what api.sleeper.app would have told
       them directly. What requires an account is CONNECTING one, below. */
    if (url.pathname === "/sleeper/lookup") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: Object.assign({
          "access-control-allow-methods": "GET",
          "access-control-max-age": "86400"
        }, corsFor(request)) });
      }
      return sleeperLookupRoute(request, env);
    }

    if (url.pathname === "/sleeper/snapshot") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: Object.assign({
          "access-control-allow-methods": "GET",
          "access-control-max-age": "86400"
        }, corsFor(request)) });
      }
      return sleeperSnapshotRoute(request, env);
    }

    /* ESPN's two, mirroring Sleeper's. `ctx` reaches the snapshot because
       it may fill the player pool off the response path — see that route. */
    if (url.pathname === "/espn/league") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: Object.assign({
          "access-control-allow-methods": "GET",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400"
        }, corsFor(request)) });
      }
      return espnLookupRoute(request, env);
    }

    if (url.pathname === "/espn/snapshot") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: Object.assign({
          "access-control-allow-methods": "GET",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400"
        }, corsFor(request)) });
      }
      return espnSnapshotRoute(request, env, ctx);
    }

    if (url.pathname === "/me/leagues") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: Object.assign({
          "access-control-allow-methods": "GET, POST, PATCH, DELETE",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-max-age": "86400"
        }, corsFor(request)) });
      }
      return meLeaguesRoute(request, env, ctx);
    }

    if (url.pathname === "/me") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: Object.assign({
          "access-control-allow-methods": "GET",
          "access-control-allow-headers": "authorization",
          "access-control-max-age": "86400"
        }, corsFor(request)) });
      }
      return meRoute(request, env, ctx);
    }

    if (url.pathname === "/me/draft") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: Object.assign({
          "access-control-allow-methods": "GET, POST, DELETE",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-max-age": "86400"
        }, corsFor(request)) });
      }
      return meDraftRoute(request, env);
    }

    if (url.pathname === "/me/history") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: Object.assign({
          "access-control-allow-methods": "GET, POST, DELETE",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-max-age": "86400"
        }, corsFor(request)) });
      }
      return meHistoryRoute(request, env);
    }

    if (url.pathname === "/news") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: Object.assign({
          "access-control-allow-methods": "GET",
          "access-control-max-age": "86400"
        }, corsFor(request)) });
      }
      return playerNews(request, env, ctx);
    }

    if (url.pathname === "/giphy") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: Object.assign({
          "access-control-allow-methods": "GET",
          "access-control-max-age": "86400"
        }, corsFor(request)) });
      }
      return giphySearch(request, env);
    }

    if (url.pathname === "/media") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: Object.assign({
          "access-control-allow-methods": "POST",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400"
        }, corsFor(request)) });
      }
      if (request.method !== "POST") return new Response("Not found", { status: 404 });
      return uploadMedia(request, env);
    }

    if (url.pathname.startsWith("/media/")) {
      // No OPTIONS handling here on purpose — see serveMedia()'s own note on
      // why this route carries no origin check at all.
      return serveMedia(env, url.pathname.slice("/media/".length));
    }

    if (url.pathname === "/signup") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: Object.assign({
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400"
        }, corsFor(request)) });
      }
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      return captureSignup(request, env);
    }

    const match = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{4,40})/);
    if (!match) return new Response("Not found", { status: 404 });

    const id = env.DRAFT_ROOM.idFromName(match[1]);
    return env.DRAFT_ROOM.get(id).fetch(request);
  },

  /* The nightly pool refresh. Declared in wrangler.toml under [triggers].

     It is a *cache* refresh and nothing depends on it having run: the board
     comes from players.js, which scripts/build_players.py regenerates from the
     same Sleeper endpoint every morning. So this failing costs the worker a
     staler copy of a list it uses for its own lookups, and costs the app
     nothing at all — which is why syncPlayerPool() logs rather than throws.

     `waitUntil` because a scheduled handler that returns before its work is
     done has its work cancelled. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncPlayerPool(env).then(function (n) {
      // Count what was written, not what was fetched. A count that disagrees
      // with the rows underneath it is how you stop reading the log at all.
      console.log(n === null ? "player pool sync: skipped or failed"
                             : "player pool sync: " + n + " rows");
    }));
  }
};

/* Run something after the response has gone.

   Two things this has to survive, and both of them are on the news path, whose
   entire contract is that it fails by disappearing.

   **`ctx` may not be there.** A bare `ctx.waitUntil` throws when this route is
   driven from anywhere but the fetch handler, and it would throw *after* a
   perfectly good answer had been assembled.

   **The promise is never awaited, so its rejection is nobody's.** An unhandled
   rejection on a page that is otherwise fine is exactly what the catch inside
   fetchUpstreamNews() exists to prevent, and a cache write is no different: it
   is swallowed here so a caller cannot forget to. */
function after(ctx, promise) {
  const quiet = Promise.resolve(promise).catch(function (err) {
    console.error("deferred work failed:", err && err.message);
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(quiet);
  return quiet;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

function safeJson(text) {
  try { return JSON.parse(text); } catch (err) { return null; }
}
