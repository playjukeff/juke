/* wait-for-pages.mjs, confirmed red before it is trusted green.
 *
 * The settle probe exists because `verify-pages.yml` reported FAIL 2 on the
 * merge of 900d2d7 against a site that was entirely healthy. A gate that cries
 * wolf on its first real merge is one nobody reads by the end of the week —
 * and the repair for that is itself a gate, so the same standard applies to
 * it: this project's rule is that a check nobody has watched fail is not a
 * check.
 *
 * Three origins, served locally, no network and no dependencies:
 *
 *   healthy   the HTML names assets the origin serves      -> settles, exit 0
 *   broken    the HTML names a bundle the origin lacks     -> exit 1, names the 404
 *   flipping  every request names a different live build   -> exit 1, names the flip
 *
 * **The last two must fail for DIFFERENT stated reasons, and that is asserted
 * rather than left to eyeballing.** They send whoever reads the red to
 * different places — one is a promoted build referencing something the origin
 * lacks, the other is a rollout still in flight — and a log line that cannot
 * separate two causes is not evidence for either of them. That sentence is
 * already in CLAUDE.md about `verifyToken refused: []`, which printed the same
 * thing whether the field was undefined or empty and cost the project a
 * production incident.
 *
 * The fixture serves a comment that QUOTES a script tag, on purpose:
 * `smoke-pages.mjs` reported a healthy `.woff2` as a 404 on its first run
 * because index.html's own comment about font preloads quotes a `<link>`, and
 * a regex cannot tell prose from markup. The settle probe strips comments for
 * that reason and this fixture is what holds it to it — a DECOY bundle name
 * inside the comment that the probe must never fetch.
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, "wait-for-pages.mjs");

const fails = [];
const note = [];
const check = (name, ok, detail) => {
  if (ok) note.push("ok  " + name);
  else fails.push(name + (detail ? "\n    " + detail : ""));
};

const LIVE_JS = "assets/index-AAAA1111.js";
const LIVE_CSS = "assets/index-BBBB2222.css";
const DECOY = "assets/index-DECOY000.js";

function origin(mode) {
  let n = 0;
  const asked = [];
  const server = createServer((req, res) => {
    const url = req.url.split("?")[0];
    asked.push(url);

    if (url === "/") {
      let js = LIVE_JS;
      if (mode === "broken") js = "assets/index-GONE0000.js";
      if (mode === "flipping") js = `assets/index-FLIP${String(n++).padStart(4, "0")}.js`;
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<!doctype html><html><head>\n` +
          `<!-- a comment quoting markup, as web/index.html really does: <script src="/${DECOY}"></script> -->\n` +
          `<link rel="stylesheet" href="/${LIVE_CSS}">\n` +
          `<script type="module" src="/${js}"></script>\n` +
          `</head><body></body></html>`
      );
      return;
    }

    // Everything under /assets/ exists except the one named to be missing.
    if (url.startsWith("/assets/") && !url.includes("GONE")) {
      res.writeHead(200, { "content-type": "application/javascript" });
      res.end("// bytes");
      return;
    }

    res.writeHead(404);
    res.end("no");
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, asked, port: server.address().port })
    );
  });
}

function runProbe(port) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PROBE, `http://127.0.0.1:${port}`], {
      env: {
        ...process.env,
        // Short enough to run in a test, long enough that the healthy case
        // still has to observe the SAME build twice with a real gap between.
        SETTLE_DEADLINE_MS: "6000",
        SETTLE_GAP_MS: "300",
        SETTLE_POLL_MS: "300",
        SETTLE_TIMEOUT_MS: "4000",
      },
    });
    let out = "";
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (out += b));
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function main() {
  for (const mode of ["healthy", "broken", "flipping"]) {
    const { server, asked, port } = await origin(mode);
    const { code, out } = await runProbe(port);
    server.close();

    if (mode === "healthy") {
      check("a settled origin passes", code === 0, `exit ${code}\n    ${out.trim()}`);
      check("and it names the build it settled on", out.includes(LIVE_JS), out.trim());
    }

    if (mode === "broken") {
      check("HTML naming an asset the origin lacks fails", code === 1, `exit ${code}`);
      check("and the message names the 404", /GONE0000\.js answered 404/.test(out), out.trim());
      check(
        "and it says the build references something the origin lacks",
        /names an asset it does not serve/.test(out),
        out.trim()
      );
    }

    if (mode === "flipping") {
      check("an origin still promoting fails", code === 1, `exit ${code}`);
      check("and the message names the flip", /promoted mid-probe/.test(out), out.trim());
      /* The whole point of splitting the two: this failure must NOT be
         reported as a broken build, or it sends somebody to look for a
         missing file that was never missing. */
      check(
        "and it does NOT blame a missing asset",
        !/names an asset it does not serve/.test(out),
        out.trim()
      );
    }

    // The decoy lives only inside an HTML comment. Fetching it means the probe
    // is reading prose as markup, which is the mistake smoke-pages.mjs made on
    // its first run against production.
    check(
      `${mode}: a bundle named only inside a comment is never fetched`,
      !asked.some((u) => u.includes("DECOY")),
      asked.join(" ")
    );
  }

  console.log(note.join("\n"));
  if (fails.length) {
    console.error(`\nFAIL ${fails.length}\n  x ` + fails.join("\n  x "));
    return 1;
  }
  console.log(`\nOK — ${note.length} checks on the Pages settle probe`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
);
