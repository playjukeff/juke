/* End-to-end tests for Juke.

   The suite starts both halves of the app itself: the static site, which is
   just a directory served over http, and the worker, which is the room. Both
   are the same commands `.claude/launch.json` uses for development, so there
   is one way to run this thing rather than two.

   The ports are pinned rather than assigned. `live.js` decides where the room
   is by looking at the address bar — localhost means `ws://127.0.0.1:8787` —
   so the worker has to be on that port for the page to find it, and picking a
   free port would quietly test a page that cannot reach any room at all.

   Serial, one worker. Every test drives a shared room on a shared port, and
   two specs racing each other through the same Durable Object would be
   testing the harness. */

import { defineConfig } from "@playwright/test";

/* Re-exported from the helpers rather than declared again. These two used to
   be written out in both files — the same fact in two places, which is the
   drift this project has a rule about — and nothing would have complained if
   they had ever disagreed except a suite quietly testing a server nobody was
   running. The helpers own them because that is where the env override lives. */
export { SITE, WORKER_HTTP } from "./tests/helpers.mjs";
import { SITE, WORKER_HTTP, LOCAL_SITE } from "./tests/helpers.mjs";

export default defineConfig({
  testDir: "./tests",
  // A full room draft is 140 picks paced at 500ms, so about two minutes, and
  // the point of the test is that it reaches the end rather than that it is
  // quick about it.
  timeout: 6 * 60 * 1000,
  expect: { timeout: 15 * 1000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],

  use: {
    baseURL: SITE,

    /* A ceiling on a single action, because the default is no ceiling at all.

       Without it a locator action against an element that never appears waits
       for ever and the *test* timeout is what eventually fires - six minutes
       later, blaming the whole test rather than the line, with nothing in the
       output naming what was being waited for. That is how a "Start draft"
       button that had been removed from the app took down grade, journey and
       solo at once, and it read as three broken tests rather than one stale
       locator. isEnabled() on a locator matching nothing is the sharpest form
       of it: the question has an answer (false) and the default behaviour is
       to wait for a different one instead.

       30s, and the number is not free choice: this option is not scoped to
       actions the way its name suggests. Playwright applies it through
       setDefaultTimeout(), which is the default for *every* method taking a
       timeout - page.waitForFunction() included. So a value below Playwright's
       own 30s default does not merely bound what was unbounded, it quietly
       shortens every wait in the suite that never asked for a timeout.

       This was set to 15s first, and room.spec.mjs said so within one run:
       "leaving the draft leaves the room" waits for the first pick of a real
       two-manager draft against the deployed worker, has no explicit timeout,
       and had been passing in 1.3 minutes. It failed at 15s - a wait that was
       always going to take longer than that, cut in half by a change that
       claimed in this very comment not to touch waits. Eleven of that file's
       sixteen waitForFunction calls have no timeout of their own.

       At 30s nothing that already worked is shortened, because 30s is what
       those calls were getting anyway, and the unbounded case still collapses
       from six minutes to thirty seconds while naming the action that failed.
       That is the whole win; buying another fifteen seconds off it is not
       worth being wrong about the rest of the suite.

       Anything that genuinely needs longer passes its own timeout at the call
       site - lobby.spec.mjs and journey.spec.mjs both do, for controls that
       render a beat after the socket answers - and an explicit timeout there
       overrides this. */
    actionTimeout: 30 * 1000,
    // Nothing here is a visual test, and a trace on a two-minute draft is
    // large. Kept for failures only, where it is the whole point.
    trace: "retain-on-failure",
    video: "off",

    /* No HTTP cache, and this is not belt and braces.

       app.js sits at a fixed address between deploys - that is the whole
       point of the ?v= stamp - so a browser is entitled to serve the body it
       already has. Pointed at production, that means a run can test the
       previous deploy and report the new one's fix as missing: it happened,
       on the news attribution fix, which was live in production's app.js
       while the suite insisted it was not. It is worse for a bug-back run,
       where five mutations in a row once came back failing tests they could
       not possibly reach, because each was measuring some mixture of the
       patched file and the cached one.

       CLAUDE.md has said to launch this way for a while; the config never
       did. */
    launchOptions: {
      args: ["--disable-application-cache", "--disk-cache-size=1"]
    }

    /* There used to be `extraHTTPHeaders: { "Cache-Control": "no-cache" }`
       here, and it silently made every account surface invisible to this
       suite.

       extraHTTPHeaders applies to EVERY request the page makes, including
       cross-origin ones. A `Cache-Control` request header is not on the
       CORS safelist, so adding it turns an ordinary script or fetch into a
       preflighted request — and clerk.jukeff.com does not allow that header
       in Access-Control-Allow-Headers, so the preflight fails and the
       request is blocked.

       Measured against production, inside the runner, one context each way:

         with the header     clerk requests responseStatus 0, 0, 0, 0
                             the account card NEVER renders (45s)
         without it          200, 200, 200
                             the account card renders in 38ms

       Nothing errored. `window.Clerk` simply stayed undefined, and every
       surface behind `<SignedOut>` — the homepage's account card, its trust
       strip, the header's Log in and Sign up — rendered as nothing, because
       that is exactly what <SignedOut> does before Clerk resolves. So the
       suite was not testing a signed-out homepage; it was testing a
       homepage with no account layer at all, and parity.spec.mjs failing
       intermittently on "Keep your drafts on every device" was the only
       visible symptom of it.

       It only ever bit against production, which is the one place a real
       publishable key exists: locally there is no key, useAccountUiReady()
       is false, and every one of those surfaces renders its inert fallback
       unconditionally. The environment where accounts are real is the only
       one that could show this, and it is the environment the nightly runs
       in.

       Removing it does not reopen the staleness this block is otherwise
       about, and that was measured rather than assumed. Loading the page
       and reloading it, with only the launch args:

         first    index-*.js  transfer 227177  body 816032
                  app.js?v=   transfer 192616  body 563103
         reload   both        transfer 300     body 0

       A 300-byte transfer with a zero-byte body is a 304 — the browser
       asked and the origin said unchanged. Cloudflare Pages sends
       `public, max-age=0, must-revalidate` on everything, so every asset
       is revalidated on every load whatever this config does, and a
       changed body comes back 200 with the new content. The header was
       belt over an origin that already braces.

       So the guarantee moves from "never read the cache" to "always ask
       the origin", which is what the incident in this comment actually
       needed: you cannot be served a body the origin has replaced. The
       launch args stay because they are a browser setting rather than a
       header on the wire, and nothing cross-origin can object to them. */
  },

  /* Both are waited on by `port` rather than by `url`, which matters for the
     worker: it has no health route, and every address it does answer is a 404
     until somebody creates a room. Waiting for a URL therefore waits for a
     2xx that is never coming, and the suite times out with both servers up
     and perfectly healthy. A listening port is the honest question here. */
  /* Only start servers when the suite is actually pointed at localhost. Aimed
     at the deployed site there is nothing to start, and a webServer block
     waiting on a port nobody will ever listen on just times the run out
     before it begins. LOCAL_SITE comes from the helpers beside SITE itself,
     so what counts as local is decided in one place. */
  webServer: !LOCAL_SITE ? undefined : [
    {
      /* index.html moved to web/index.html and picked up a real build step —
         see CLAUDE.md's Stack section. So "start the static server" is now
         "build the React bundle, copy the legacy files beside it, then serve
         that output" rather than serving the repo root as-is; every spec
         navigates through the built artifact, the same thing a Cloudflare
         Pages deploy produces, not raw source.

         `py` is the Windows launcher and does not exist anywhere else, so
         this failed with "py: not found" on Linux/macOS before a single test
         ran. Picked per platform rather than changed, so the Windows path is
         untouched.

         It is the SAFE name on Windows rather than the only working one: a
         bare `python` works here too, and it is `python3` that resolves to
         the Store alias answering "Python was not found" — which is why the
         two branches are not the same string. `py` needs no PATH box ticked;
         `python3` on Windows would be the stub. CLAUDE.md's Testing section
         carries the measurement. */
      command: "npm --prefix web run build && " +
        (process.platform === "win32" ? "py" : "python3") + " -m http.server 8765 --directory web/dist",
      port: 8765,
      reuseExistingServer: true,
      timeout: 120 * 1000
    },
    {
      command: "npx --yes wrangler@4 dev -c worker/wrangler.toml --port 8787 --local",
      /* `url`, not `port`, and the difference is the whole point.

         With `port`, reuseExistingServer accepts whatever happens to be
         listening on 8787 - which during one debugging session was a plain
         `python -m http.server`, cheerfully adopted as the draft room. The
         suite then tests a static file server and fails in ways that name
         nothing.

         /news answers 403 without an Origin header, which is the worker
         refusing before it reads a key, and Playwright counts 400-403 as
         "ready" while a 404 is not ready at all. So our worker satisfies this
         and anything else on the port does not: a stray listener now fails
         fast with a port conflict instead of quietly poisoning the run. */
      url: "http://127.0.0.1:8787/news?id=1",
      reuseExistingServer: true,
      timeout: 120 * 1000
    }
  ]
});
