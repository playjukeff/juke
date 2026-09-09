/* Does the promoted site actually serve everything it asks for?
 *
 *     node scripts/smoke-pages.mjs                       # https://jukeff.com
 *     node scripts/smoke-pages.mjs http://localhost:8765 # a local build
 *
 * ---- Why this exists at all ----
 *
 * The worker has a real post-deploy check: deploy-worker.yml settles, then
 * drives 109 assertions over real sockets against the thing that was just
 * promoted. The site had nothing. Its entire deploy verification was
 * `vite build && prerender && copy-legacy-assets` exiting 0 — which is a
 * genuine guard (copy-legacy-assets names what is missing and exits 1) and
 * says nothing whatsoever about the promoted origin. The next thing that
 * looked at the live site was browser-tests.yml at 12:30 UTC, up to a day
 * later.
 *
 * The failure that gap allows is documented in CLAUDE.md and has happened:
 * when the Pages root directory moved to `web`, `og-image.png` and the root
 * favicons stopped being published, and `og:image` — the absolute URL baked
 * into every link preview — was a 404 at the origin. Nothing failed. Nothing
 * logged. It was found by somebody going and looking, weeks later.
 *
 * ---- Every URL is derived from the served HTML, never listed here ----
 *
 * The check is "everything this page asks for exists", and the list of what
 * it asks for is read off the page itself: the module bundle and its CSS,
 * every `?v=`-stamped legacy script and stylesheet, `og:image`, and every
 * icon `<link>`. A hardcoded list is the same fact written down twice — it
 * goes stale silently, misses the asset added last week, and cries wolf
 * about the one deleted yesterday. This one cannot: an asset that stops
 * being referenced stops being checked, and one that starts being
 * referenced is covered the moment it ships.
 *
 * ---- Three things measurement taught, which a naive version gets wrong ----
 *
 * **Redirects have to be followed.** Cloudflare Pages serves `.html` paths as
 * a 308 to the extensionless form — `/404.html` -> `/404`, 200 at the end.
 * Asserting 200 on the first response reports a perfectly healthy site as
 * broken, which is the crying-wolf failure the worker gate spent a whole
 * evening removing.
 *
 * **Every request carries a cache-buster.** CLAUDE.md's own rule: an edge
 * entry can outlive its origin. `og-image.png` returned 200 from a
 * Cloudflare edge entry left over from the GitHub Pages era for six days
 * after the origin behind it stopped existing — a check without `?cb=` would
 * have signed that off every single day.
 *
 * **The body is read, not just the status.** See `get()`.
 *
 * ---- Same origin only ----
 *
 * The page also references Google Fonts and sleepercdn. Those are somebody
 * else's uptime, and a deploy gate that goes red because a third party
 * blinked is a gate nobody reads by the end of the week. Anything not on the
 * origin under test is skipped and counted, so the number is visible rather
 * than the omission being silent.
 */

const SITE = (process.argv[2] || process.env.JUKE_SITE || "https://jukeff.com").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 20000);

const fails = [];
const note = [];
let skipped = 0;

/* One request, honestly asked, and the body read to the end.
 *
 * `redirect: "follow"` is the default and is stated anyway, because it is
 * load-bearing here rather than incidental — see the note above.
 *
 * **Draining the body is not tidiness.** A status line arrives before the
 * bytes do, so a response whose transfer dies halfway still reports 200 to
 * anything that reads only `res.status` — the same shape as this project's
 * own "read the body, not the status" rule about `/me/history`. Reading it
 * through is what makes this check say the file was really served.
 *
 * It also has to happen for the client to stay well. Twenty undrained bodies
 * against a single-threaded static server crashed Node outright —
 * `assert(!this.paused)` inside undici, no report of any kind — which is the
 * harness rather than the site, and still fatal to this script's purpose: a
 * gate nobody can point at a local build is a gate nobody can confirm red
 * before trusting it green. */
async function get(url, wantText = false) {
  const bust = url.includes("?") ? "&" : "?";
  const res = await fetch(url + bust + "cb=" + Math.random().toString(36).slice(2), {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const buf = await res.arrayBuffer();
  return {
    status: res.status,
    ok: res.ok,
    bytes: buf.byteLength,
    text: wantText ? new TextDecoder().decode(buf) : "",
  };
}

function check(name, ok, detail) {
  if (ok) note.push("ok  " + name);
  else fails.push(name + (detail ? "\n    " + detail : ""));
}

/* Absolute, same-origin, de-duplicated.
 *
 * Returns null for anything off-origin so the caller can count it as skipped
 * rather than silently dropping it — an omission nobody can see is how a
 * check quietly stops covering half of what it claims. */
function sameOrigin(ref, base) {
  let u;
  try { u = new URL(ref, base); } catch { return null; }
  if (u.origin !== new URL(base).origin) return null;
  return u.href;
}

async function main() {
  let home;
  try {
    home = await get(SITE + "/", true);
  } catch (err) {
    console.error(`smoke: could not reach ${SITE} — ${(err && err.message) || err}`);
    return 1;
  }
  if (!home.ok) {
    console.error(`smoke: ${SITE}/ answered ${home.status}`);
    return 1;
  }
  check("the homepage answers", true);

  /* What the page asks for.
   *
   * Deliberately regex over the served HTML rather than a DOM parser: this
   * script has no dependencies for the same reason scripts/test_league_state.mjs
   * has none — tests.yml installs nothing, and a gate that needs an npm install
   * to run is a gate that will not run. */
  const refs = new Map();   // href -> what it is, for the failure line
  const add = (ref, what) => {
    const abs = sameOrigin(ref, SITE + "/");
    if (!abs) { skipped += 1; return; }
    if (!refs.has(abs)) refs.set(abs, what);
  };

  /* Comments stripped first, and this is not defensive tidying — it is the
     first thing this script got wrong.
   *
   * Run against production before it had this, it reported a `.woff2` as a
   * 404 on a completely healthy site. The reference is inside index.html's
   * own comment about font preloads, which quotes a `<link rel="preload">`
   * tag in prose. A regex cannot tell prose from markup, and this repository
   * writes very long comments that quote markup — so a gate that reads tags
   * without removing comments first cries wolf on its very first run, which
   * is the exact failure the worker gate spent an evening having removed. */
  const markup = home.text.replace(/<!--[\s\S]*?-->/g, "");

  for (const m of markup.matchAll(/<script[^>]+src="([^"]+)"/g)) add(m[1], "script");
  for (const m of markup.matchAll(/<link[^>]+href="([^"]+)"/g)) add(m[1], "link");

  /* The two that matter most get named individually, because "some link 404s"
     and "the module bundle is gone" are not the same sentence to wake up to.
     A promoted build that does not serve its own content-hashed bundle renders
     as a blank page with one console error. */
  const bundle = (markup.match(/assets\/index-[A-Za-z0-9_-]+\.js/) || [])[0];
  const css = (markup.match(/assets\/index-[A-Za-z0-9_-]+\.css/) || [])[0];
  check("the page names a module bundle", !!bundle, "no assets/index-*.js in the served HTML");
  check("the page names a stylesheet", !!css, "no assets/index-*.css in the served HTML");
  if (bundle) add("/" + bundle, "module bundle");
  if (css) add("/" + css, "stylesheet");

  /* An `og:image` that 404s is invisible on the site and broken in every link
     preview, which is the one asset nobody on the team ever loads directly.
   *
   * **Declared and reachable are two questions, and the first version asked
   * them as one.** `og:image` is absolute and baked to `https://jukeff.com`
   * on purpose — link previews are fetched by Slack and iMessage from their
   * own servers, so a relative path resolves to nothing. Against any origin
   * but production it is therefore off-origin, skipped, and absent from the
   * map — so a check reading the map reported "no og:image meta tag" against
   * a local build whose HTML carries one three lines from the top. Read the
   * declaration off the markup; fetch it only where it is ours. */
  const og = (markup.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) ||
              markup.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/) || [])[1];
  check("the page declares an og:image", !!og,
        "no og:image meta tag — link previews have nothing to show");
  if (og) {
    const mine = sameOrigin(og, SITE + "/");
    if (mine) refs.set(mine, "og:image");
    else note.push(`ok  og:image declared, off this origin, not fetched: ${og}`);
  }

  console.log(`smoke: ${SITE} — ${refs.size} same-origin references, ${skipped} off-origin skipped\n`);

  /* Asked in parallel: this is a gate on a deploy, and thirty serial round
     trips to a CDN is a minute nobody needs to spend. */
  const results = await Promise.all(
    [...refs.entries()].map(async ([url, what]) => {
      try {
        const res = await get(url);
        return { url, what, status: res.status, ok: res.ok, bytes: res.bytes };
      } catch (err) {
        return { url, what, status: 0, ok: false, bytes: 0, err: (err && err.message) || String(err) };
      }
    })
  );

  /* A 200 carrying nothing counts as a failure, and it is half the reason the
     body is read at all: nothing this page references is legitimately empty,
     so a zero-length answer is a half-published file rather than a file. */
  for (const r of results.sort((a, b) => a.url.localeCompare(b.url))) {
    const path = r.url.replace(SITE, "");
    const detail = !r.status
      ? `no response — ${r.err}`
      : !r.ok
        ? `answered ${r.status}`
        : `answered ${r.status} with an empty body`;
    check(`${r.what} resolves: ${path}`, r.ok && r.bytes > 0, detail);
  }

  console.log(note.join("\n"));
  console.log("");
  if (fails.length) {
    console.log(`FAIL ${fails.length}`);
    fails.forEach((f) => console.log("  x " + f));
    console.log(
      "\nEvery URL above was read off the page's own HTML, so a failure means the\n" +
      "promoted build references something the origin does not serve. Ask with a\n" +
      "?cb= query before believing a browser that disagrees — an edge entry can\n" +
      "outlive its origin."
    );
    return 1;
  }
  console.log(`OK — ${note.length} checks against ${SITE}`);
  return 0;
}

/* `process.exitCode`, never `process.exit()`.
 *
 * `process.exit()` tears the process down while sockets are still closing,
 * and on Windows that is a libuv assertion (`UV_HANDLE_CLOSING`) which exits
 * **127** — so a red run and a crashed run become indistinguishable. This
 * file's whole reason for existing is that a deploy check has to be
 * believable, and an exit code that lies is the one defect it cannot afford.
 * Setting the code and letting the loop drain also guarantees the report is
 * flushed before the process ends. */
process.exitCode = await main();
