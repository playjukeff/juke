/* The return from Yahoo's consent screen.

   Yahoo arrives here with `?code=…&state=…` (or `?error=access_denied` when
   the reader said no). This page cannot finish the connect itself -- it has
   no account session, and the code is worthless without the reader's Juke
   sign-in beside it -- so it hands the answer to the app through
   sessionStorage and goes back. The app trades the code with the worker,
   which checks the state belongs to the account presenting it.

   ---- Back to the origin the reader started on ----

   Yahoo can only return a reader to the ONE address the app registered, and
   www.jukeff.com serves the site as its own origin, with its own
   sessionStorage. So the worker writes the starting origin into the state,
   and this sends the reader home before writing anything. That value is
   read here BEFORE anything has verified the state's signature, so it is
   only followed to an address on the fixed list below -- this page may not
   become a redirect to wherever a crafted link says. */
(function () {
  var HOMES = ["https://jukeff.com", "https://www.jukeff.com"];
  var q;
  try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
  if (!q) { location.replace("/#/account"); return; }

  var state = q.get("state") || "";
  var home = null;
  try {
    var head = state.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    head += "===".slice((head.length + 3) % 4);
    var body = JSON.parse(atob(head));
    home = body && typeof body.o === "string" ? body.o : null;
  } catch (e) { home = null; }

  if (home && home !== location.origin && HOMES.indexOf(home) >= 0) {
    location.replace(home + location.pathname + location.search);
    return;
  }

  var back = "#/account";
  try {
    var pending = JSON.parse(sessionStorage.getItem("juke.yahoo.pending") || "null");
    /* Where the dialog was opened from, so the reader lands where they
       left. A hash route only -- never a URL -- so nothing stored here can
       send anybody off the site. */
    if (pending && typeof pending.back === "string" && /^#\/[A-Za-z0-9/_-]*$/.test(pending.back)) {
      back = pending.back;
    }
    sessionStorage.setItem("juke.yahoo.return", JSON.stringify({
      code: q.get("code") || null,
      state: state || null,
      error: q.get("error") || null,
      at: Date.now()
    }));
  } catch (e) { /* storage blocked: the app will simply not reopen the dialog */ }

  location.replace("/" + back);
})();
