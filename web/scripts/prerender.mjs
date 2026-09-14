// Server-renders whatever `#/` is, so the first screen is the LCP element
// rather than blank markup that only fills in once React's module bundle
// has fetched, parsed and executed.
//
// ---- and `#/` moved without this file changing a line ----
//
// It said "the homepage" for as long as there was one. Since the cutover
// `#/` is v3's Now, and the reason nothing here needed editing is the
// reason this script is written the way it is: it renders `App`, and App
// is the one tree that decides what an address draws. A prerender that
// named a component would have gone stale the day the site moved; one
// that renders the app's own root cannot.
//
// What it writes is Now in its GUEST state, and that is by construction
// rather than by a flag. useHashRoute() starts null on both sides — there
// is no window here to read a hash from — and App treats null as v3 with
// no sub-path, so the server and the client's hydration pass render the
// identical tree. Anything that reads `location` during render puts React
// #418 back, and a hydration failure is not scoped to the subtree that
// caused it: React discards the whole root and rebuilds it, which throws
// this step's entire output away on every load. Measured after the
// cutover: zero #418/#423, and #root hydrates the 21,110 bytes written
// here rather than replacing them.
//
// Now is also SEASON-dependent, and that is the one difference worth
// knowing. Node has no engine, so seasonClock() is null here and the
// offseason headline is what gets written; once stats.js lands the client
// swaps to the in-season one. That swap happens in an effect AFTER
// hydration, so it is not a mismatch — the same shape as useHashRoute()
// resolving one tick late.
//
// Runs after `vite build`
// (before copy-legacy-assets.mjs — order doesn't matter between the two,
// they touch disjoint files, but this reads dist/index.html and that one
// doesn't write it) and chained into web/package.json's own "build" script.
//
// Two builds, not one. The real client build already ran (vite build, the
// step before this one in package.json) — this runs a second, separate
// build targeting Node instead of a browser, to get a version of App that
// require()/import() can execute outside a <script> tag. @vitejs/
// plugin-react is what makes that safe: it's the same JSX transform the
// client build already trusts, reused rather than a second toolchain
// (esbuild-register, ts-node, whatever) that could disagree with it.
//
// The rendered HTML is deliberately not the *live* screen — App renders
// with no window.JukeEngine (Node has no window at all), so every
// component that reads the board renders its own already-real empty
// state, the same one a browser sees for the brief window before app.js's
// deferred data lands (see app.js's own "deferred data" boot comment).
// That's the correct target: this step exists to get real markup — the
// actual DOM hydrateRoot() will attach to — in front of the browser as
// fast as possible, not to fake live data from a build step that has none.
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { build } from 'vite'
import React from 'react'
import { renderToString } from 'react-dom/server'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_DIR = path.resolve(__dirname, '..')
const DIST_DIR = path.join(WEB_DIR, 'dist')
const SSR_OUT_DIR = path.join(WEB_DIR, 'dist-ssr')
const INDEX_HTML = path.join(DIST_DIR, 'index.html')
// #root is the app's one mount point (see index.html's own comment on it
// and the Stack section of CLAUDE.md) — #appbar-root and #draftroom-root
// are not prerendered, and since the cutover they render nothing a reader
// can reach at all: both belonged to screens every address now redirects
// away from. DeferredPortals is what keeps them from being hydrated
// against markup that was never written here, which is the bug that threw
// this step's whole output away for the life of accounts.
const MOUNT = '<div id="root"></div>';

async function main() {
  if (!existsSync(INDEX_HTML)) {
    throw new Error(`${INDEX_HTML} does not exist — run "vite build" before this script.`);
  }

  await build({
    configFile: path.join(WEB_DIR, 'vite.config.js'),
    build: {
      ssr: path.join(WEB_DIR, 'src/entry-server.jsx'),
      outDir: SSR_OUT_DIR,
      emptyOutDir: true,
      // No point leaving a stale manifest/asset story around for a bundle
      // that exists only to be import()ed once, right here, and deleted.
      write: true,
    },
  });

  const entryPath = path.join(SSR_OUT_DIR, 'entry-server.js');
  if (!existsSync(entryPath)) {
    throw new Error(`prerender: expected ${entryPath} after the SSR build — check vite's ssr output naming hasn't changed.`);
  }

  const mod = await import(pathToFileURL(entryPath).href);
  const App = mod.default;
  if (typeof App !== 'function') {
    throw new Error('prerender: entry-server.jsx\'s default export is not a component.');
  }

  const html = renderToString(React.createElement(App));
  if (!html) {
    throw new Error('prerender: renderToString() produced empty output — App is rendering nothing.');
  }

  let indexHtml = readFileSync(INDEX_HTML, 'utf8');
  if (!indexHtml.includes(MOUNT)) {
    throw new Error(`prerender: could not find ${JSON.stringify(MOUNT)} in ${INDEX_HTML} — index.html's #root markup may have changed.`);
  }
  indexHtml = indexHtml.replace(MOUNT, `<div id="root">${html}</div>`);
  writeFileSync(INDEX_HTML, indexHtml);

  // The SSR bundle has done its one job; nothing references it again and
  // an unused dist-ssr/ sitting next to the real dist/ output is exactly
  // the kind of stray build artifact CLAUDE.md's hosting notes warn is
  // easy to accidentally ship (Pages has no ignore list — anything in the
  // output directory is live). This one is outside dist/ so it was never
  // reachable, but there's no reason to leave it on disk either.
  rmSync(SSR_OUT_DIR, { recursive: true, force: true });

  console.log(`prerender: wrote ${html.length} bytes of server-rendered markup into #root`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
