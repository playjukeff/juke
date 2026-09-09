/* The settle probe between Cloudflare promoting a build and smoking it.
 *
 * `verify-pages.yml` waits for the "Cloudflare Pages" check run on the commit
 * to conclude `success` and then runs `smoke-pages.mjs` against the apex. That
 * check means THE BUILD FINISHED. It does not mean the apex is serving it —
 * the workflow's own comment notes Cloudflare posts it retroactively, with
 * `started_at` equal to `completed_at`, so it appears already-complete and
 * says nothing about propagation.
 *
 * ---- The run that made this necessary ----
 *
 * 900d2d7, the gate's first real merge. It reported FAIL 2 on a deploy that
 * was entirely healthy:
 *
 *     x script resolves: /assets/index-BYHfsb0c.js   answered 404
 *     x link resolves:   /assets/index-ByTzdcTq.css  answered 404
 *
 * Both of those are the PREVIOUS build's content-hashed names. The homepage
 * fetch returned the old HTML and the asset fetches seconds later hit an
 * origin that had already flipped — and `smoke-pages.mjs` puts a unique `?cb=`
 * on every request, so neither half was an edge entry. Two requests, seconds
 * apart, landing on two deployment states.
 *
 * **That falsifies the claim in verify-pages.yml's own header** — that the
 * inverse caching trap is invisible to it "by construction, because both
 * halves moved together". They are two requests, and they can straddle a
 * promotion. The header is corrected in place rather than left standing.
 *
 * ---- Why this is a settle and deliberately NOT a retry ----
 *
 * The obvious repair is to re-run the smoke check on failure, and CLAUDE.md
 * refuses that for `wait-for-worker.mjs` in terms that apply here word for
 * word: a retry makes a site that is broken half the time look green, which is
 * the opposite of what a gate exists for. Waiting for readiness removes the
 * race and hides no failure.
 *
 * So this asks a different question from the one the smoke check asks. Its
 * condition is only that the origin has stopped moving: the HTML it serves
 * names a bundle and a stylesheet the origin also serves. It asserts nothing
 * about og:image, the favicons, the legacy scripts or the manifest — every one
 * of those stays the smoke check's to fail on, once, against an origin that is
 * no longer mid-flight.
 *
 * And the two stay legible apart, which is the point CLAUDE.md makes about the
 * worker's pair: this step says "it never came up", the smoke check says "it
 * came up and is wrong".
 *
 * ---- Twice, spaced, and naming the same build ----
 *
 * One consistent observation is not enough, for the reason `wait-for-worker`
 * takes two round trips rather than one: a single probe can succeed a moment
 * before the thing it spoke to is replaced. Here it is sharper than that — a
 * promotion landing BETWEEN the two probes gives two perfectly self-consistent
 * snapshots of two different deployments, so the bundle name has to match as
 * well. Same build, twice, with a gap: that is the origin holding still.
 *
 * ---- What it cannot promise, said out loud ----
 *
 * It does not prove the settled build is THIS commit's. Nothing in the served
 * HTML identifies the commit — `?v=` is the nightly data stamp and moves on a
 * different schedule entirely — so a deploy that Cloudflare reported success
 * for and then never promoted would settle here on the previous build and pass.
 * That gap is the same one verify-pages.yml already acknowledges in its
 * concurrency note, where it says a run is "a statement about the origin right
 * now rather than about the commit that triggered it". Closing it needs a
 * commit marker in the build, which is a different change.
 *
 * No dependencies, for `smoke-pages.mjs`'s own reason: a gate that needs an
 * npm install to run is a gate with one more way to fail than the thing it is
 * checking.
 */

const SITE = (process.argv[2] || process.env.SITE || "https://jukeff.com").replace(/\/+$/, "");

const DEADLINE_MS = Number(process.env.SETTLE_DEADLINE_MS || 300000);
const GAP_MS = Number(process.env.SETTLE_GAP_MS || 5000);
const POLL_MS = Number(process.env.SETTLE_POLL_MS || 5000);
const TIMEOUT_MS = Number(process.env.SETTLE_TIMEOUT_MS || 20000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Cache-busted on every request, and the body read to the end — both for the
   reasons `smoke-pages.mjs` states at its own `get()`. A status line arrives
   before the bytes, so a transfer that dies halfway still reports 200 to
   anything reading only `res.status`. */
async function get(url, wantText = false) {
  const bust = url.includes("?") ? "&" : "?";
  const res = await fetch(url + bust + "cb=" + Math.random().toString(36).slice(2), {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const buf = await res.arrayBuffer();
  return { status: res.status, ok: res.ok, text: wantText ? new TextDecoder().decode(buf) : "" };
}

/* One observation of the origin: what the homepage names, and whether the
   origin serves it.
 *
 * Comments are stripped before matching for the reason `smoke-pages.mjs`
 * records — this repository writes long comments that quote markup, and a
 * regex cannot tell prose from a tag. That mistake cried wolf on that
 * script's first run and it is not worth making twice. */
async function probe() {
  const home = await get(SITE + "/", true);
  if (!home.ok) return { ok: false, why: `the homepage answered ${home.status}` };

  const markup = home.text.replace(/<!--[\s\S]*?-->/g, "");
  const bundle = (markup.match(/assets\/index-[A-Za-z0-9_-]+\.js/) || [])[0];
  const css = (markup.match(/assets\/index-[A-Za-z0-9_-]+\.css/) || [])[0];
  if (!bundle) return { ok: false, why: "the served HTML names no assets/index-*.js" };
  if (!css) return { ok: false, why: "the served HTML names no assets/index-*.css" };

  const [js, sheet] = await Promise.all([
    get(`${SITE}/${bundle}`),
    get(`${SITE}/${css}`),
  ]);
  if (!js.ok) return { ok: false, build: bundle, why: `${bundle} answered ${js.status}` };
  if (!sheet.ok) return { ok: false, build: bundle, why: `${css} answered ${sheet.status}` };

  return { ok: true, build: bundle, css };
}

async function main() {
  const started = Date.now();
  const left = () => DEADLINE_MS - (Date.now() - started);
  console.log(`settle: ${SITE} — waiting for the origin to hold still\n`);

  let last = null;
  // Which of the two failures it is, kept apart because they want different
  // things from whoever reads the red. A log line that cannot separate two
  // causes is not evidence for either of them.
  let lastKind = null;

  while (left() > 0) {
    let first;
    try {
      first = await probe();
    } catch (err) {
      first = { ok: false, why: (err && err.message) || String(err) };
    }

    if (!first.ok) {
      last = first.why;
      lastKind = "unserved";
      console.log(`    still moving: ${first.why}`);
      await sleep(POLL_MS);
      continue;
    }

    // The second half of the pair. A promotion landing in this gap produces a
    // different, equally self-consistent snapshot — which is why the build has
    // to match rather than merely resolve.
    await sleep(Math.min(GAP_MS, Math.max(0, left())));

    let second;
    try {
      second = await probe();
    } catch (err) {
      second = { ok: false, why: (err && err.message) || String(err) };
    }

    if (second.ok && second.build === first.build) {
      console.log(`\nsettled on ${first.build} — the origin serves what it names, twice, ${GAP_MS}ms apart.`);
      return 0;
    }

    if (second.ok) {
      last = `promoted mid-probe: ${first.build} then ${second.build}`;
      lastKind = "moving";
    } else {
      last = second.why;
      lastKind = "unserved";
    }
    console.log(`    still moving: ${last}`);
    await sleep(POLL_MS);
  }

  /* Two failures reach this line and they want different things from whoever
     reads the red: one is a promoted build that references something the origin
     lacks, the other is an origin that never stopped moving. Naming the wrong
     one sends somebody to the wrong dashboard. */
  const why =
    lastKind === "moving"
      ? "The origin kept promoting a new build between one probe and the next, so it\n" +
        "never held still long enough to be worth smoking. That is a rollout still in\n" +
        "flight rather than a broken page — check the Pages dashboard for what is" +
        " still building."
      : "The origin is serving HTML that names an asset it does not serve. Smoking it\n" +
        "now would report the same thing without saying whether it was ever going to\n" +
        "resolve, which is the difference between a deploy mid-flight and a broken one.";

  console.error(
    `\n::error::${SITE} did not settle within ${Math.round(DEADLINE_MS / 1000)}s. Last seen: ${last || "nothing"}.\n` + why
  );
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`settle: ${(err && err.stack) || err}`);
    process.exit(1);
  }
);
