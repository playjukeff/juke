/* ==========================================================
   Juke — the client side of a shared draft

   One socket to one room. This file knows how to connect,
   what to send, and how to hand the answer back to app.js. It
   does not know what a good pick is, what the board looks like
   or how anything is drawn.

   The important thing it does is give up authority. In a solo
   draft the browser decides what happened; in a room it asks
   and waits. So every action here is a message, and the board
   only changes when the room says it did — which is what makes
   two people clicking the same player resolve to one pick
   instead of two different boards.
   ========================================================== */

(function (root) {
  "use strict";

  /* Where the room lives.

     Localhost is detected rather than configured, so `wrangler dev` and a
     local server work together with nothing to change.

     Anywhere else needs the deployed worker's host, which is
     <worker-name>.<your-subdomain>.workers.dev and is printed by
     `wrangler deploy`. It is blank until that has happened, and blank is
     treated as "not set up" rather than guessed at — a wrong host fails as a
     socket that never opens, which looks exactly like a bug.

     A plain constant rather than a build flag, because this project has no
     build. */
  const WORKER_HOST = "juke-draft-room.jukeff.workers.dev";

  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const WORKER = LOCAL ? "ws://127.0.0.1:8787" : "wss://" + WORKER_HOST;

  // False when there is nowhere to connect to, so the invite box can say so
  // instead of offering a button that opens a socket into nothing.
  function configured() { return LOCAL || !!WORKER_HOST; }

  /* Who you are, to a room. Not an account: a random id kept in this
     browser so a refresh returns you to your own seat rather than taking a
     new one. Nothing about it identifies a person, and it never leaves for
     anywhere but the room you are in. */
  const MEMBER_KEY = "juke.member";

  function memberId() {
    let id = null;
    try { id = localStorage.getItem(MEMBER_KEY); } catch (err) {}
    if (!id) {
      id = "m" + Math.random().toString(36).slice(2, 10) +
           Math.random().toString(36).slice(2, 6);
      try { localStorage.setItem(MEMBER_KEY, id); } catch (err) {}
    }
    return id;
  }

  /* What you are called, to a room. Kept here rather than asked for every
     time, because typing your own name into every draft is the kind of small
     tax that ends with everybody called "Seat 4".

     Still not an account. It travels with the member id, it is only ever sent
     to the room you are in, and the room cleans it before anybody sees it —
     the length limit below is a courtesy to the field, not the check. */
  const NAME_KEY = "juke.name";
  const NAME_MAX = 20;

  function myName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch (err) { return ""; }
  }

  function setMyName(value) {
    const name = String(value == null ? "" : value).trim().slice(0, NAME_MAX);
    try {
      if (name) localStorage.setItem(NAME_KEY, name);
      else localStorage.removeItem(NAME_KEY);
    } catch (err) {}
    // Only if there is a room to tell. Setting it on the setup screen before
    // creating one is normal, and connect() sends it.
    send({ type: "rename", name: name });
    return name;
  }

  /* Room codes are short enough to read out over the phone and long enough
     that guessing one is not worth anyone's afternoon. No vowels, so it
     cannot accidentally spell something, and no characters that argue with
     each other in a sans-serif — no 0/O, no 1/l/I. */
  const CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXYZ23456789";

  function newCode() {
    let out = "";
    const bytes = new Uint8Array(8);
    (root.crypto || {}).getRandomValues
      ? root.crypto.getRandomValues(bytes)
      : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
    for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return out;
  }

  const live = {
    code: null,
    socket: null,
    room: null,        // the last view the room sent
    status: "off",     // off | connecting | reconnecting | open | closed | rejected
    reason: null,
    wanted: false,     // are we meant to be in a room right now
    opts: null,        // what connect() was called with, so a retry can repeat it
    onchange: null,    // app.js sets this
    onchat: null,
    ontyping: null
  };

  /* A socket is not a connection you open once.

     A phone closes one the moment the browser stops being the front app, and
     the first thing anybody does after creating a room is leave the browser
     to send the link. So the drop is not an edge case — it is the normal path
     through the feature, and it used to be permanent: nothing here reopened a
     socket, and `live.room` was kept, so the page went on showing an invite
     box, a seat list and a chat window for a room it could no longer reach.

     Backoff because a worker that is actually down should not be asked ten
     times a second, and capped because a draft is a thing people are sitting
     and waiting on. */
  const RETRY_MS = [1000, 2000, 4000, 8000, 15000];
  let retryStep = 0;
  let retryTimer = null;

  function stopRetry() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  }

  function scheduleRetry() {
    if (!live.wanted || retryTimer) return;
    const wait = RETRY_MS[Math.min(retryStep, RETRY_MS.length - 1)];
    retryStep++;
    retryTimer = setTimeout(function () { retryTimer = null; open(); }, wait);
  }

  /* Coming back to the tab is the strongest signal there is that a dropped
     socket should be retried now rather than in eight seconds, and it is
     exactly the moment it happens — the manager has just come back from
     their messages app having sent the link.

     readyState is checked as well as our own status, because a socket that
     was suspended with the page can report open while being dead: the close
     event arrives late, or never. */
  function awake() {
    if (!live.wanted) return;
    if (live.socket && live.socket.readyState === 1 && live.status === "open") return;
    stopRetry();
    retryStep = 0;
    open();
  }

  function announce() {
    if (typeof live.onchange === "function") live.onchange(live);
  }

  function active() { return !!live.socket && live.status === "open"; }

  /* The link a manager copies. Built from the page it is on, so it is right
     on jukeff.com, on localhost and in the installed app without being told
     which. Reads live.code directly rather than re-parsing location.hash
     (see codeInUrl() below) — the two answer different questions. codeInUrl()
     is "did the address bar just hand me a room to join", which is only ever
     true on #/draft-room?room=... itself. This is "what room am I in", which
     stays true wherever the app's own navigation takes the tab afterwards —
     the Lobby included, which is where the Draft Room's own invite popover
     shows it. Built off #/draft-room directly now, not the retired #/draft
     — applyRoute() still redirects the old route, so an old copied link
     keeps working, but a link generated today has no reason to take that
     hop. */
  function link() {
    if (!live.code) return null;
    return location.origin + location.pathname + "#/draft-room?room=" + live.code;
  }

  function codeInUrl() {
    const q = location.hash.split("?")[1] || "";
    const m = /(?:^|&)room=([A-Za-z0-9_-]{4,40})/.exec(q);
    return m ? m[1] : null;
  }

  /* league and clock are only read when the room does not exist yet: the
     first person through the door sets the shape and everyone after is
     joining a draft that already has one. */
  function connect(code, opts) {
    disconnect();

    live.code = code;
    live.opts = opts || {};
    live.wanted = true;
    live.reason = null;
    open();
  }

  /* Opening the socket, which connect() does once and a retry does again.
     Split from connect() because a reconnection must not clear `live.room`:
     that is the last thing the room said, everything on the page is drawn
     from it, and throwing it away to reopen a socket would blank the seat
     list and the whole chat log for the second the socket takes to come
     back. */
  function open() {
    const opts = live.opts || {};

    const existing = live.socket;
    live.socket = null;
    if (existing) { try { existing.close(); } catch (err) {} }

    // "reconnecting" only when there is something to reconnect to, so the
    // first attempt still reads as connecting rather than as a fault.
    live.status = live.room ? "reconnecting" : "connecting";
    announce();

    const params = new URLSearchParams({
      member: memberId(),
      // The stored name unless the caller has a better one, so following an
      // invite link lands you in the room already called something.
      name: opts.name || myName(),
      league: JSON.stringify(opts.league || {}),
      clock: String(opts.clock || 0),
      data: opts.dataVersion || ""
    });

    const socket = new WebSocket(WORKER + "/room/" + live.code + "?" + params);
    live.socket = socket;

    socket.addEventListener("open", function () {
      live.status = "open";
      // The ladder starts again from the bottom, so a draft that drops once
      // an hour never works its way up to a fifteen-second wait.
      retryStep = 0;
      announce();
    });

    socket.addEventListener("message", function (event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch (err) { return; }

      if (msg.type === "state") {
        live.room = msg.room;
        announce();
      } else if (msg.type === "chat") {
        if (typeof live.onchat === "function") live.onchat(msg);
      } else if (msg.type === "typing") {
        /* Never part of the room view, and deliberately. Somebody typing is
           true for about two seconds; putting it in the state everybody
           stores would mean writing a keystroke to disk. */
        if (typeof live.ontyping === "function") live.ontyping(msg);
      } else if (msg.type === "rejected") {
        /* A rejection on connect is fatal and worth showing; one during a
           draft is usually a click that lost a race, and the state that
           follows already says so. */
        live.reason = msg.code;
        if (live.status !== "open") {
          live.status = "rejected";
          // Being turned away is an answer, not a failure to reach anyone.
          // Retrying it would ask the same question every second forever.
          live.wanted = false;
          stopRetry();
        }
        announce();
      }
    });

    // One handler for both, because a socket that errors closes immediately
    // after and the second event would otherwise schedule a second retry.
    const gone = function () {
      if (live.socket !== socket) return;      // an old socket finishing
      live.socket = null;
      if (live.status === "rejected") return;
      live.status = live.room ? "reconnecting" : "closed";
      announce();
      scheduleRetry();
    };

    socket.addEventListener("close", gone);
    socket.addEventListener("error", gone);
  }

  /* Leaving on purpose. `wanted` goes false first, so the close event this
     causes is not mistaken for a drop and retried. */
  function disconnect() {
    const socket = live.socket;
    live.wanted = false;
    live.opts = null;
    stopRetry();
    retryStep = 0;
    live.socket = null;
    live.room = null;
    // The code goes too. It is "the room we are in", not "the last room we
    // saw", and anything asking whether we are already in a given room gets
    // the wrong answer from a code that outlived its socket.
    live.code = null;
    live.status = "off";
    live.reason = null;
    if (socket) { try { socket.close(); } catch (err) {} }
  }

  function send(payload) {
    if (!active()) return false;
    try { live.socket.send(JSON.stringify(payload)); return true; }
    catch (err) { return false; }
  }

  /* The two moments a dropped socket is worth retrying immediately rather
     than on the ladder: the tab coming back to the front, and the network
     coming back at all. Registered once, for the life of the page, and both
     do nothing unless we are supposed to be in a room. */
  if (root.document) {
    root.document.addEventListener("visibilitychange", function () {
      if (!root.document.hidden) awake();
    });
  }
  root.addEventListener("online", awake);
  root.addEventListener("pageshow", awake);

  /* One shape for every sync method, so a caller never has to remember
     which of them says what. Extra fields are merged in rather than
     replacing the envelope — see loadDraft/loadHistory.

     Module scope rather than a method on the returned object, and that is
     not style: `live` in this file is the internal state object a few
     hundred lines up, not the API being returned, so `live.syncResult()`
     would be undefined at the moment any of these actually failed — which
     is to say only ever in production, on the path that exists to explain
     failures. Written the wrong way first and caught by reading it back. */
  function syncResult(ok, reason, extra) {
    const out = { ok: !!ok, reason: ok ? null : (reason || "offline") };
    if (extra) for (const k in extra) out[k] = extra[k];
    return out;
  }

  /* HTTP status to reason, in one place. Every one of these routes answers
     with the same refusals, so a fifth would otherwise have to be added in
     six methods. */
  function reasonForStatus(status) {
    if (status === 401) return "unauthorized";
    if (status === 403) return "forbidden";
    return "offline";
  }

  return root.Live = {
    WORKER: WORKER,
    configured: configured,
    memberId: memberId,
    newCode: newCode,
    codeInUrl: codeInUrl,
    link: link,
    active: active,
    state: function () { return live; },
    room: function () { return live.room; },
    status: function () { return live.status; },
    reason: function () { return live.reason; },
    connect: connect,
    disconnect: disconnect,

    onChange: function (fn) { live.onchange = fn; },
    onChat: function (fn) { live.onchat = fn; },
    onTyping: function (fn) { live.ontyping = fn; },

    /* The worker's own HTTP origin — what uploadMedia() above already
       builds by hand for its fetch() call, exposed so app.js's
       safeMediaUrl() can check a voice/photo URL is actually on it before
       ever handing one to an <audio>/<img src>. The same "check twice"
       shape safeGif()/cleanGif() already have: the room refuses a foreign
       URL server-side, and this is the second check, not a substitute. */
    workerHttpOrigin: function () { return WORKER.replace(/^ws/, "http"); },

    name: myName,
    setName: setMyName,
    NAME_MAX: NAME_MAX,

    // Intent, not action. The board changes when the room says so.
    pick:     function (key) { return send({ type: "pick", key: key }); },
    autoPick: function (key) { return send({ type: "auto", key: key }); },
    claimSeat:function (seat){ return send({ type: "claim-seat", seat: seat }); },
    // Draft order, set by the host in the lobby. Indices only: this end has
    // never been told anybody else's member id and does not need one.
    swapSeats:function (a, b){ return send({ type: "swap-seats", a: a, b: b }); },
    start:    function ()    { return send({ type: "start" }); },
    /* The room owns the countdown, so pausing it is a message like any other.
       It used to be a purely local flag, which stopped nothing: the room went
       on counting and handed the seat to the CPU while the header said
       "Paused". The room refuses it from anyone but the host. */
    pause:    function (on)  { return send({ type: "pause", on: !!on }); },
    /* replyTo is optional and additive: an existing caller passing just
       (text, gif) still works exactly as before, and the room stores
       `replyTo: null` for it, the same as it always implicitly has. */
    chat: function (text, gif, replyTo) {
      return send({ type: "chat", text: text, gif: gif || null, replyTo: replyTo || null });
    },
    react: function (id, emoji) { return send({ type: "react", id: id, emoji: emoji }); },

    /* A voice note or a photo, already uploaded through uploadMedia() below
       — this only ever sends the URL that upload returned, never the bytes.
       The room checks that URL against its own worker before storing it,
       so a bogus one is refused the same way a non-GIPHY gif is. */
    voice: function (url, seconds, replyTo) {
      return send({ type: "voice", url: url, seconds: seconds, replyTo: replyTo || null });
    },
    photo: function (url, w, h, replyTo) {
      return send({ type: "photo", url: url, w: w || null, h: h || null, replyTo: replyTo || null });
    },

    /* Any member may open one, the same as sending a chat message — nothing
       about a poll makes it a host-only action. durationMs is "how long
       from now", not an absolute end time: the room is handed `now` by its
       own caller and never reads a clock, so an absolute time supplied by a
       client's own clock is exactly the kind of thing this project never
       trusts. Pass 0 (or omit) for a poll that never closes. */
    pollCreate: function (question, choices, opts) {
      opts = opts || {};
      return send({
        type: "poll-create", question: question, choices: choices,
        multi: !!opts.multi, anon: !!opts.anon,
        durationMs: opts.durationMs || 0, replyTo: opts.replyTo || null
      });
    },
    /* A single index for a single-choice poll, or an array of indices for a
       multi-choice one — see Room.votePoll()'s own comment for exactly what
       each shape does. */
    pollVote: function (id, choice) {
      return send({ type: "poll-vote", id: id, choice: choice });
    },

    /* The upload half of a voice note or a photo, through the worker's own
       /media route — same reasoning as gifSearch()/news() below: the R2
       binding lives server-side, and this is the file that already knows
       where the worker is. Resolves to the URL the route handed back, or
       null on any failure (not configured, refused, too large, offline) —
       never a message of its own, because deciding what to do about a
       failed upload is the caller's job, not this file's. Uploading and
       posting are two separate steps on purpose, the same way searching
       GIPHY and sending a gif are: call this first, then voice()/photo()
       with the URL it returns. */
    uploadMedia: function (kind, blob) {
      if (!live.code) return Promise.resolve(null);
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/media?kind=" + encodeURIComponent(kind) +
                   "&room=" + encodeURIComponent(live.code), {
        method: "POST",
        headers: { "content-type": (blob && blob.type) || "application/octet-stream" },
        body: blob
      })
        .then((r) => r.json())
        .then((body) => (body && body.url) ? body.url : null)
        .catch(() => null);
    },

    /* Sent on a leading edge and then not again until it lapses — see
       app.js. A message per keystroke would be a message per keystroke for
       everybody else in the room too. */
    typing: function (on) { return send({ type: "typing", on: !!on }); },

    /* GIPHY search, through the worker. The key is server-side, so this
       is a plain fetch to our own origin rather than a call to GIPHY. */
    gifSearch: function (q) {
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/giphy?q=" + encodeURIComponent(q))
        .then((r) => r.json())
        .catch(() => ({ configured: false, results: [] }));
    },

    /* Player news, through the worker, for the same reason as the GIFs: the
       key is server-side.

       It lives in live.js because this is the file that knows where the
       worker is, and nowhere else does — but note it has nothing to do with
       being in a room. A solo draft opening a player sheet calls this, and
       should: news is not a shared-draft feature, it is a player-profile one.

       A rejected promise here would surface as an unhandled rejection on a
       page that is otherwise fine, so the catch is the contract rather than
       politeness. Offline, blocked, or no worker at all all arrive at the
       same answer: nothing to show. */
    news: function (playerId) {
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/news?player=" + encodeURIComponent(playerId || ""))
        .then((r) => r.json())
        .catch(() => ({ configured: false, items: [] }));
    },

    /* Email capture, through the worker. Same shape as gifSearch()/news()
       above and for the same reason: this is the file that knows where the
       worker is, so a "get early access" form posts here rather than
       working out a base URL of its own — a second copy of WORKER.replace()
       is exactly the kind of thing that drifts the day the host changes.

       There is no account behind this and nothing here requires one; it is
       a mailing list of one field, tagged with which dead end asked for it.
       Never rejects: a signup form failing silently into "that didn't send"
       is the whole of the contract, so the catch is load-bearing rather
       than politeness. */
    signup: function (email, source) {
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email, source: source })
      })
        .then((r) => r.json())
        .catch(() => ({ ok: false }));
    },

    /* A signed-in account's own saved draft and locker history, through
       the worker's /me/draft and /me/history routes. Same reasoning as
       news()/signup() above — this is the file that knows where the
       worker is — and the same "nothing to do with being in a room": a
       solo draft is exactly what these exist for, and the worker's own
       origin check (originAllowed()) treats a plain page load identically
       whether or not anyone happens to be in a room right now.

       `token` is a Clerk session token, gotten by the caller from
       window.JukeAuth.getToken() — this file has no Clerk of its own and
       no opinion about who is signed in, only how to ask the worker once
       somebody hands it a token.

       ---- Every method resolves; none of them rejects ----

       That part is unchanged and is the point: a caller that is not signed
       in and a caller that could not reach the worker need to be handled
       identically, which they cannot be if only one of them throws, and a
       draft must never be held up by a sync.

       ---- What changed: they say WHY ----

       They used to resolve to a bare falsy answer — false, null, [] — and
       that collapsed every distinct failure into one. It cost a real bug:
       a foreign key was failing every account write while the read beside
       it answered 200, and from the page the symptom was identical to a
       missing CLERK_SECRET_KEY and to an unapplied migration. Three
       different causes, three different fixes, one indistinguishable
       "could not reach your account", and it took a hand-written console
       probe to tell them apart.

       So each one resolves to `{ ok, reason, ... }`. `reason` is null when
       ok, and otherwise one of:

         "signed-out"    no token was handed in; nothing was attempted
         "offline"       the request never completed — no network, worker
                         down, DNS, a blocked origin at the browser
         "unauthorized"  401: the worker would not accept the token. A
                         missing CLERK_SECRET_KEY on the worker looks
                         exactly like this, and so does an expired session
         "forbidden"     403: originAllowed() refused the caller's Origin
         "store-failed"  200, and the worker could not write it — a missing
                         table, a constraint, D1 itself being unwell
         "bad-response"  a 2xx that was not the JSON this expects

       The data still comes back beside it (`data` for a draft, `entries`
       for history) rather than in place of it, so a caller reads one field
       for the answer and another for whether to believe it. */



    /* ---- League connect (Sleeper) ----

       Same contract as the account methods above: every one resolves,
       none rejects, and the reason says which failure it was. Two of the
       three need no token — looking a username up and reading a league are
       public reads — and connecting one does, because a connection belongs
       to an account and there is nowhere else to put it.

       `reason` gains one value here that the draft/history methods have no
       use for:

         "not-found"   the worker reached Sleeper and Sleeper said no. For
                       a lookup that is a username nobody has; for a
                       connect it is a league id that does not resolve.
                       Distinct from "offline" on purpose — one is worth
                       retyping, the other is worth retrying, and a screen
                       that cannot tell them apart says the wrong thing
                       half the time. */

    sleeperLookup: function (username, season) {
      const name = String(username || "").trim();
      if (!name) return Promise.resolve(syncResult(false, "bad-request", { user: null, leagues: [] }));
      const http = WORKER.replace(/^ws/, "http");
      const q = "?username=" + encodeURIComponent(name) + (season ? "&season=" + encodeURIComponent(season) : "");
      return fetch(http + "/sleeper/lookup" + q)
        .then(function (r) {
          if (!r.ok) return syncResult(false, reasonForStatus(r.status), { user: null, leagues: [] });
          return r.json()
            .then(function (body) {
              // A username nobody has comes back 200 with a null user —
              // Sleeper answering "no" rather than failing. Reported as
              // not-found so the screen can say "we could not find that
              // username" instead of "something went wrong".
              if (!body || !body.user) return syncResult(false, "not-found", { user: null, leagues: [] });
              return syncResult(true, null, {
                user: body.user,
                leagues: Array.isArray(body.leagues) ? body.leagues : [],
                season: body.season || null
              });
            })
            .catch(() => syncResult(false, "bad-response", { user: null, leagues: [] }));
        })
        .catch(() => syncResult(false, "offline", { user: null, leagues: [] }));
    },

    /* Look an ESPN league up by the id in its own URL.

       There is no username step here and there cannot be: ESPN publishes
       nothing that maps a person to their leagues, so the reader supplies
       the number from fantasy.espn.com/football/team?leagueId=NNN and picks
       their team out of the answer. See worker/espn.js.

       Four reasons rather than two, because the reader's fix differs:
       `private` is a setting they can change, `not-found` is a number to
       re-read, `offline` is a retry, and `upstream` is ours. */
    espnLookup: function (leagueId, season) {
      const id = String(leagueId || "").trim();
      if (!id) return Promise.resolve(syncResult(false, "bad-request", { league: null }));
      const http = WORKER.replace(/^ws/, "http");
      const q = "?league=" + encodeURIComponent(id) +
                (season ? "&season=" + encodeURIComponent(season) : "");
      return fetch(http + "/espn/league" + q)
        .then(function (r) {
          if (!r.ok) return syncResult(false, reasonForStatus(r.status), { league: null });
          return r.json()
            .then((body) => (body && body.league)
              ? syncResult(true, null, { league: body.league, season: body.season })
              // The worker reports which of the four it was; a shape it did
              // not name is still a refusal rather than an empty league.
              : syncResult(false, (body && body.reason) || "not-found", { league: null }))
            .catch(() => syncResult(false, "bad-response", { league: null }));
        })
        .catch(() => syncResult(false, "offline", { league: null }));
    },

    // A league's current state — rosters, records, points. Cached at the
    // edge for a couple of minutes, so calling this on every navigation is
    // cheap and calling it in a loop is not a problem for Sleeper.
    leagueSnapshot: function (leagueId, provider) {
      const id = String(leagueId || "");
      if (!id) return Promise.resolve(syncResult(false, "bad-request", { snapshot: null }));
      const http = WORKER.replace(/^ws/, "http");
      /* Which platform's route. Defaulted rather than required, because
         every caller predates ESPN and a connection stored before the
         provider column meant anything is a Sleeper one. */
      const path = provider === "espn" ? "/espn/snapshot?league=" : "/sleeper/snapshot?league=";
      return fetch(http + path + encodeURIComponent(id))
        .then(function (r) {
          if (r.status === 404) return syncResult(false, "not-found", { snapshot: null });
          // 403 here is an ESPN league that has stopped being public — a
          // thing the reader can fix, and so worth telling apart.
          if (r.status === 403) return syncResult(false, "private", { snapshot: null });
          if (!r.ok) return syncResult(false, reasonForStatus(r.status), { snapshot: null });
          return r.json()
            .then((body) => syncResult(true, null, { snapshot: body || null }))
            .catch(() => syncResult(false, "bad-response", { snapshot: null }));
        })
        .catch(() => syncResult(false, "offline", { snapshot: null }));
    },

    // Am I signed in, and on which tier — GET /me. Nothing on the client
    // called this before tiers existed; web/src/lib/tierStore.js is the
    // first caller. Answers signedIn:false rather than an error for a
    // missing or expired token, mirroring the route itself: there is no
    // wrong answer to asking whether you are logged in, only a true one.
    me: function (token) {
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/me", { headers: token ? { "authorization": "Bearer " + token } : {} })
        .then(function (r) {
          if (!r.ok) return syncResult(false, reasonForStatus(r.status), { signedIn: false, tier: null });
          return r.json()
            .then((body) => syncResult(true, null, {
              signedIn: !!(body && body.signedIn),
              // Passed through as-is, including a genuine null — the tier
              // store's whole job is telling that apart from "free".
              tier: body && body.tier !== undefined ? body.tier : null,
            }))
            .catch(() => syncResult(false, "bad-response", { signedIn: false, tier: null }));
        })
        .catch(() => syncResult(false, "offline", { signedIn: false, tier: null }));
    },

    listLeagues: function (token) {
      if (!token) return Promise.resolve(syncResult(false, "signed-out", { leagues: [] }));
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/me/leagues", { headers: { "authorization": "Bearer " + token } })
        .then(function (r) {
          if (!r.ok) return syncResult(false, reasonForStatus(r.status), { leagues: [] });
          return r.json()
            .then((body) => syncResult(true, null, {
              leagues: (body && Array.isArray(body.leagues)) ? body.leagues : []
            }))
            .catch(() => syncResult(false, "bad-response", { leagues: [] }));
        })
        .catch(() => syncResult(false, "offline", { leagues: [] }));
    },

    connectLeague: function (token, leagueId, ownerId, provider) {
      if (!token) return Promise.resolve(syncResult(false, "signed-out", { league: null }));
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/me/leagues", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + token },
        body: JSON.stringify({
          leagueId: String(leagueId || ""),
          ownerId: ownerId || null,
          // Absent means Sleeper, which is what every connect meant before
          // there was a second platform.
          provider: provider || "sleeper"
        })
      })
        .then(function (r) {
          if (r.status === 404) return syncResult(false, "not-found", { league: null });
          /* 403 is two different refusals now, told apart by the body
             rather than assumed from the status: an ESPN league that has
             stopped being public, and a tier cap this account has reached.
             Reading the body is what stops a Free account's cap from being
             reported as a broken ESPN league — which is what always
             assuming "private" here would do the moment a Free account hit
             the cap on Sleeper, where "private" means nothing at all. */
          if (r.status === 403) {
            return r.json()
              .then((body) => syncResult(false, (body && body.error) || "private", {
                league: null,
                tier: body && body.tier,
                cap: body && body.cap,
              }))
              .catch(() => syncResult(false, "private", { league: null }));
          }
          if (!r.ok) return syncResult(false, reasonForStatus(r.status), { league: null });
          return r.json()
            .then((body) => (body && body.ok)
              ? syncResult(true, null, { league: body.league || null })
              : syncResult(false, "store-failed", { league: null }))
            .catch(() => syncResult(false, "bad-response", { league: null }));
        })
        .catch(() => syncResult(false, "offline", { league: null }));
    },

    /* Switch which connected league is the active one.

       Answers the whole list back rather than an ok, because the caller's
       next act is to redraw from it: the server decides the order, and a
       client that reordered its own copy to match would be a second
       opinion about which league is active — the "written down twice"
       failure with a menu on top of it.

       "not-connected" is its own reason for the same purpose the connect
       flow tells not-found from offline: a switch refused because this
       account never connected that league wants a re-read, and one refused
       because the worker is unreachable wants a retry. */
    selectLeague: function (token, leagueId, provider) {
      if (!token) return Promise.resolve(syncResult(false, "signed-out", { leagues: [] }));
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/me/leagues", {
        method: "PATCH",
        headers: { "content-type": "application/json", "authorization": "Bearer " + token },
        body: JSON.stringify({
          leagueId: String(leagueId || ""),
          provider: provider || "sleeper"
        })
      })
        .then(function (r) {
          if (r.status === 409) return syncResult(false, "not-connected", { leagues: [] });
          if (!r.ok) return syncResult(false, reasonForStatus(r.status), { leagues: [] });
          return r.json()
            .then((body) => (body && body.ok)
              ? syncResult(true, null, {
                  leagues: Array.isArray(body.leagues) ? body.leagues : []
                })
              : syncResult(false, "store-failed", { leagues: [] }))
            .catch(() => syncResult(false, "bad-response", { leagues: [] }));
        })
        .catch(() => syncResult(false, "offline", { leagues: [] }));
    },

    disconnectLeague: function (token, leagueId, provider) {
      if (!token) return Promise.resolve(syncResult(false, "signed-out"));
      const http = WORKER.replace(/^ws/, "http");
      const q = "?league=" + encodeURIComponent(String(leagueId || "")) +
                "&provider=" + encodeURIComponent(provider || "sleeper");
      return fetch(http + "/me/leagues" + q, {
        method: "DELETE",
        headers: { "authorization": "Bearer " + token }
      })
        .then(function (r) {
          if (!r.ok) return syncResult(false, reasonForStatus(r.status));
          return r.json()
            .then((body) => (body && body.ok) ? syncResult(true) : syncResult(false, "store-failed"))
            .catch(() => syncResult(false, "bad-response"));
        })
        .catch(() => syncResult(false, "offline"));
    },

    saveDraft: function (token, data) {
      if (!token) return Promise.resolve(syncResult(false, "signed-out"));
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/me/draft", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + token },
        body: JSON.stringify(data)
      })
        .then(function (r) {
          if (!r.ok) return syncResult(false, reasonForStatus(r.status));
          return r.json()
            .then((body) => (body && body.ok) ? syncResult(true) : syncResult(false, "store-failed"))
            .catch(() => syncResult(false, "bad-response"));
        })
        .catch(() => syncResult(false, "offline"));
    },

    loadDraft: function (token) {
      if (!token) return Promise.resolve(syncResult(false, "signed-out", { data: null }));
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/me/draft", { headers: { "authorization": "Bearer " + token } })
        .then(function (r) {
          if (!r.ok) return syncResult(false, reasonForStatus(r.status), { data: null });
          return r.json()
            .then((body) => syncResult(true, null, { data: (body && body.data) || null }))
            .catch(() => syncResult(false, "bad-response", { data: null }));
        })
        .catch(() => syncResult(false, "offline", { data: null }));
    },

    clearDraft: function (token) {
      if (!token) return Promise.resolve(syncResult(false, "signed-out"));
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/me/draft", {
        method: "DELETE",
        headers: { "authorization": "Bearer " + token }
      })
        .then(function (r) {
          if (!r.ok) return syncResult(false, reasonForStatus(r.status));
          return r.json()
            .then((body) => (body && body.ok) ? syncResult(true) : syncResult(false, "store-failed"))
            .catch(() => syncResult(false, "bad-response"));
        })
        .catch(() => syncResult(false, "offline"));
    },

    loadHistory: function (token) {
      if (!token) return Promise.resolve(syncResult(false, "signed-out", { entries: [] }));
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/me/history", { headers: { "authorization": "Bearer " + token } })
        .then(function (r) {
          if (!r.ok) return syncResult(false, reasonForStatus(r.status), { entries: [] });
          return r.json()
            .then((body) => syncResult(true, null, {
              entries: (body && Array.isArray(body.entries)) ? body.entries : []
            }))
            .catch(() => syncResult(false, "bad-response", { entries: [] }));
        })
        .catch(() => syncResult(false, "offline", { entries: [] }));
    },

    // One entry, added or replaced — see worker/README.md on why there is
    // no bulk write: the server only ever needs the one that changed.
    saveHistoryEntry: function (token, entry) {
      if (!token) return Promise.resolve(syncResult(false, "signed-out"));
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/me/history", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + token },
        body: JSON.stringify(entry)
      })
        .then(function (r) {
          if (!r.ok) return syncResult(false, reasonForStatus(r.status));
          return r.json()
            .then((body) => (body && body.ok) ? syncResult(true) : syncResult(false, "store-failed"))
            .catch(() => syncResult(false, "bad-response"));
        })
        .catch(() => syncResult(false, "offline"));
    },

    deleteHistoryEntry: function (token, id) {
      if (!token) return Promise.resolve(syncResult(false, "signed-out"));
      const http = WORKER.replace(/^ws/, "http");
      return fetch(http + "/me/history?id=" + encodeURIComponent(id), {
        method: "DELETE",
        headers: { "authorization": "Bearer " + token }
      })
        .then(function (r) {
          if (!r.ok) return syncResult(false, reasonForStatus(r.status));
          return r.json()
            .then((body) => (body && body.ok) ? syncResult(true) : syncResult(false, "store-failed"))
            .catch(() => syncResult(false, "bad-response"));
        })
        .catch(() => syncResult(false, "offline"));
    }
  };
})(window);
