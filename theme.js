/* The stored theme, applied before anything paints.

   This has to run before the body is drawn, or a reader who chose light
   watches the page flash dark first — which is why it is loaded from <head>
   with no defer and no async. It is its own file rather than an inline
   <script> so that a Content-Security-Policy can say script-src 'self' and
   mean it: the alternatives were 'unsafe-inline', which gives most of the
   policy away, or a sha256 hash in a Cloudflare rule that silently breaks
   the site the first time somebody edits these six lines and forgets it.

   Loading it costs one request against an origin the page is already
   opening a connection to, and the file is a few hundred bytes.

   Kept out of app.js deliberately: app.js is at the foot of the body, and by
   the time it runs the flash has already happened. */
(function () {
  try {
    var saved = localStorage.getItem("draftroom.theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch (err) {}   // private browsing can make localStorage throw
})();

/* The same job for the theme the site actually wears now.

   data-v3-theme is what every --v3-* colour in web/src/index.css answers to,
   and until the cutover it was stamped from a React layout effect — correct
   while v3 was one route among several, and wrong the moment it became the
   site. A layout effect runs after the module bundle has fetched, parsed and
   hydrated, which is after app.js, which is the exact reason the block above
   is not in app.js: by then the flash has already happened. A reader who
   chose dark would watch the page paint light first, on every single load.

   The store (web/src/components/v3/theme.js) still owns the choice, the
   listener and the System case; this only puts the answer on the document
   before the first frame, and the store re-stamps the identical value when
   it mounts. Three choices, not two: "system" is the default and is resolved
   here against the device, so a phone that turns dark at sunset arrives
   dark rather than arriving light and correcting itself.

   Same file rather than a second one beside it: this file is already "the
   stored theme, applied before anything paints", and a second parser-
   blocking request in <head> costs a round trip to say the same sentence. */
(function () {
  var choice = "system";
  try {
    var v = localStorage.getItem("juke.v3.theme");
    if (v === "light" || v === "dark" || v === "system") choice = v;
  } catch (err) {}
  var dark = choice === "dark";
  if (choice === "system") {
    try {
      dark = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (err) {}
  }
  document.documentElement.setAttribute("data-v3-theme", dark ? "dark" : "light");
})();

/* This file used to carry a second IIFE here, stamping data-standalone from
   matchMedia('(display-mode: standalone)') so #boot-sonar (index.html)
   could tell an installed-app cold launch apart from an ordinary browser
   visit before its CSS applied. That overlay — Sonar, then Breach — was
   scoped to the installed case only, which meant it never played on a
   regular desktop or mobile browser visit at all: reported directly, from
   someone who opened the site expecting to see it and did not. The owner
   reversed the scoping rather than the gate, so the overlay now plays on
   every cold load and nothing here needs to tell the two apart any more. */

/* Is somebody probably signed in? (workstream B1)

   The landing page is prerendered for a visitor, and before this a
   signed-in reader saw it paint for a frame or more before the dashboard
   replaced it. Clerk keeps a `__client_uat` cookie on the site's own
   domain whose value is the last sign-in time, and "0" once signed out;
   a non-zero value means a session probably exists. That is a HINT and
   nothing reads it as proof: it only hides the landing page (index.css,
   [data-auth-hint="in"] [data-landing]) until React has asked Clerk, and
   Now removes it the moment the answer is "guest". A stale cookie costs a
   visitor one blank frame; the alternative cost a reader a flash of the
   wrong page on every load. Clerk may suffix the name, hence the pattern. */
(function () {
  try {
    if (/(?:^|;\s*)__client_uat(?:_[\w-]+)?=([1-9]\d*)/.test(document.cookie)) {
      document.documentElement.setAttribute("data-auth-hint", "in");
    }
  } catch (err) {}
})();

/* Hold errors until the error reporter arrives.

   web/src/lib/errorMonitoring.js loads Sentry late, after the splash, so a
   report does not cost the reveal a stutter. That leaves a window in which
   nothing is listening — and it contains the worst failure this site has:
   a throw during app.js's boot, which kills the draft engine for the whole
   page. This file is parser-blocking in <head>, so these listeners exist
   before app.js runs; nothing else on the page is early enough.

   It only holds, never sends. Twenty at most, because a page throwing in a
   loop must not grow memory without bound, and it costs nothing on a page
   without the reporter (the docs pages, a build with no DSN): the array
   simply fills and nobody reads it. The reporter calls stop() in the same
   tick it installs its own handlers. */
(function () {
  var items = [];
  function hold(err) { if (items.length < 20) items.push({ error: err, at: Date.now() }); }
  function onError(ev) { hold(ev.error || ev.message); }
  function onRejection(ev) { hold(ev.reason); }
  try {
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.__jukeEarlyErrors = {
      items: items,
      stop: function () {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
      }
    };
  } catch (err) {}
})();
