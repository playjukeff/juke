/* The half of error reporting that touches the SDK, and nothing else.

   Its own module so errorMonitoring.js can load it with import() — and so
   that import() lands on NAMED imports. A dynamic import of '@sentry/react'
   itself hands back the module namespace, which rollup cannot tree-shake:
   measured, that was a 493 KB chunk carrying session replay and the feedback
   widget, neither of which this page uses. Named imports from a module that
   is itself loaded late are what let the bundler drop them. */

import { init, captureException, captureMessage } from '@sentry/react'

export { captureException, captureMessage }

export function startSentry(options) {
  init(options)
}
