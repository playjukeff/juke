import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { existsSync, statSync, createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { LEGACY_FILES, LEGACY_DIRS } from './scripts/copy-legacy-assets.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const MIME = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
}

// Vite's dev server only serves web/ and web/public/ — app.js and its
// siblings live one level up, at the true repo root, and that does not
// change (see copy-legacy-assets.mjs). This serves the same file list
// from there during `vite dev`, off the same LEGACY_FILES/LEGACY_DIRS the
// production build copies, so window.JukeEngine carries real data locally
// without a full build on every change.
function legacyAssets() {
  return {
    name: 'legacy-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url.split('?')[0]
        const name = pathname.replace(/^\//, '')
        const isFile = LEGACY_FILES.includes(name)
        const isDir = LEGACY_DIRS.some((dir) => pathname.startsWith(`/${dir}/`))
        if (!isFile && !isDir) return next()

        const filePath = path.join(REPO_ROOT, name)
        if (!existsSync(filePath) || !statSync(filePath).isFile()) return next()

        const ext = path.extname(filePath)
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
        createReadStream(filePath).pipe(res)
      })
    },
  }
}

// ---- Error reporting: which build this is, and its source maps ----
//
// RELEASE and ENVIRONMENT label every Sentry report (web/src/lib/
// errorMonitoring.js). Cloudflare Pages sets CF_PAGES, CF_PAGES_BRANCH and
// CF_PAGES_COMMIT_SHA on every build, so a report names the commit it came
// from with nothing to keep in step by hand.
//
// Source maps are uploaded only when all three SENTRY_* variables are set —
// the auth token is a real secret and lives in the Pages dashboard, never
// here. Without them the build is exactly what it was: no maps, no plugin.
// With them the maps are 'hidden' (no sourceMappingURL comment) and deleted
// from dist/ after upload, because anything left in the output directory is
// public at jukeff.com whether or not a page links to it.
//
// Never for the prerender's SSR pass (scripts/prerender.mjs reuses this
// file): that bundle runs in Node at build time and nobody's browser ever
// throws from it.
const RELEASE = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || 'local'
const ENVIRONMENT = process.env.CF_PAGES
  ? (process.env.CF_PAGES_BRANCH === 'main' ? 'production' : 'preview')
  : 'development'
const SENTRY_UPLOAD = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
)

export default defineConfig(({ isSsrBuild }) => {
  const upload = SENTRY_UPLOAD && !isSsrBuild
  return {
    plugins: [
      react(),
      legacyAssets(),
      ...(upload
        ? [sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: RELEASE },
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
            telemetry: false,
          })]
        : []),
    ],
    build: { sourcemap: upload ? 'hidden' : false },
    define: {
      __JUKE_RELEASE__: JSON.stringify(RELEASE),
      __JUKE_ENV__: JSON.stringify(ENVIRONMENT),
    },
  }
})
